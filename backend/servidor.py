# -*- coding: utf-8 -*-
"""
servidor.py  ·  Servidor API y aplicación web de Capitalia
==========================================================
Sirve la SPA en Angular 22 y expone la API REST modularizada en Blueprints
(`backend/rutas/`) conectada a PostgreSQL y al motor financiero.
"""

import collections
import datetime as dt
import gzip
import json
import logging
import os
import re
import secrets
import sys
import threading
import time

from flask import Flask, jsonify, request, send_from_directory, session
from werkzeug.middleware.proxy_fix import ProxyFix
from werkzeug.security import safe_join
from werkzeug.serving import make_server

from . import almacen, buscar, carteras_catalogo, db, exportar, importar, motor, plantilla
from .rutas import registrar_blueprints

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST_ANGULAR = os.path.join(RAIZ, "dist", "capitalia", "browser")
PLANTILLA_WEB = os.path.join(RAIZ, "backend", "plantilla_web")
DATOS_BASE = os.environ.get("CAPITALIA_DATOS") or os.path.join(RAIZ, "datos")
DEMO = os.path.join(RAIZ, "demo", "cartera.json")
PUERTO = int(os.environ.get("CAPITALIA_PUERTO") or os.environ.get("PATRIMONIO_PUERTO") or 8766)
HOST = os.environ.get("CAPITALIA_HOST") or "127.0.0.1"
HORAS_PRECIOS = 6


def _resolver_secreto():
    """Resolución segura de clave secreta sin valores literales hardcodeados."""
    for env_key in ("CAPITALIA_SECRET_KEY", "RUMBO_SECRET_KEY"):
        if os.environ.get(env_key):
            return os.environ.get(env_key)
    archivo_sec = os.path.join(DATOS_BASE, ".secret_key")
    if os.path.exists(archivo_sec):
        try:
            with open(archivo_sec, "r", encoding="utf-8") as f:
                val = f.read().strip()
                if len(val) >= 32:
                    return val
        except OSError:
            pass
    logging.warning("Generando clave secreta efímera para la instancia actual.")
    return secrets.token_hex(32)


COOKIE_SECURE = os.environ.get("CAPITALIA_COOKIE_SECURE") == "1"

app = Flask(__name__, static_folder=None)
app.json.sort_keys = False
_cerrojos_meta_lock = threading.Lock()
_cerrojos_por_usuario = {}


def _obtener_cerrojo(uid=None):
    """Devuelve un RLock aislado por usuario (o 'local' sin sesión BD)."""
    clave = uid if uid is not None else "local"
    with _cerrojos_meta_lock:
        lock = _cerrojos_por_usuario.get(clave)
        if lock is None:
            lock = threading.RLock()
            _cerrojos_por_usuario[clave] = lock
        return lock


cerrojo = _obtener_cerrojo("local")

app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)
app.secret_key = _resolver_secreto()
app.config.update(
    SESSION_COOKIE_NAME="__Host-capitalia_sid" if COOKIE_SECURE else "capitalia_sid",
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=COOKIE_SECURE,
    PERMANENT_SESSION_LIFETIME=dt.timedelta(days=30),
    MAX_CONTENT_LENGTH=10 * 1024 * 1024,  # Límite de subida de 10 MB (DoS protection)
)

# ---------------------------------------------------------------- Rate Limiting y Seguridad

_INTENTOS_AUTH = collections.defaultdict(list)
_AUTH_RATE_LOCK = threading.Lock()
MAX_INTENTOS_VENTANA = 15
VENTANA_SEGUNDOS = 60
MAX_INTENTOS_RESET = 5
VENTANA_RESET_SEGUNDOS = 15 * 60


def _comprobar_rate_limit(clave, max_intentos=MAX_INTENTOS_VENTANA, ventana=VENTANA_SEGUNDOS):
    ahora = time.time()
    with _AUTH_RATE_LOCK:
        if len(_INTENTOS_AUTH) > 500:
            for k in list(_INTENTOS_AUTH.keys()):
                if k == clave:
                    continue
                v_k = VENTANA_RESET_SEGUNDOS if k.startswith("reset-") else ventana
                activos = [t for t in _INTENTOS_AUTH[k] if ahora - t < v_k]
                if activos:
                    _INTENTOS_AUTH[k] = activos
                else:
                    _INTENTOS_AUTH.pop(k, None)
        lista = [t for t in _INTENTOS_AUTH[clave] if ahora - t < ventana]
        _INTENTOS_AUTH[clave] = lista
        if len(lista) >= max_intentos:
            return False
        _INTENTOS_AUTH[clave].append(ahora)
        return True


RUTAS_API_PUBLICAS = {
    "/api/auth/login",
    "/api/auth/registro",
    "/api/auth/recuperar",
    "/api/auth/restablecer",
    "/api/auth/yo",
    "/api/ping",
    "/api/version",
}

_bd_lock = threading.Lock()
_bd_iniciada = False


def _asegurar_bd():
    global _bd_iniciada
    if _bd_iniciada or not db.activo():
        return
    with _bd_lock:
        if not _bd_iniciada:
            db.inicia()
            _bd_iniciada = True


@app.before_request
def filtro_seguridad():
    # Permitir únicamente métodos HTTP necesarios (PUT edita registros en /api/<coleccion>/<id>)
    if request.method not in ("GET", "HEAD", "OPTIONS", "POST", "PUT", "DELETE"):
        return jsonify(ok=False, errores=["Método HTTP no permitido."]), 405

    # Protección CSRF en todas las peticiones mutadoras a /api/
    if request.path.startswith("/api/") and request.method in ("POST", "PUT", "DELETE"):
        csrf_hdr = request.headers.get("X-Capitalia-CSRF") or request.headers.get("X-Requested-With")
        origin = request.headers.get("Origin") or ""
        host_url = request.host_url.rstrip("/")
        if not csrf_hdr and (not origin or not origin.startswith(host_url)):
            return jsonify(ok=False, errores=["Solicitud rechazada por protección CSRF."]), 403

    # Autenticación obligatoria para rutas privadas de /api/
    if not db.activo():
        return None
    _asegurar_bd()
    if request.path.startswith("/api/") and request.path not in RUTAS_API_PUBLICAS:
        if not session.get("usuario_id"):
            return jsonify(ok=False, errores=["Tu sesión ha caducado. Inicia sesión de nuevo."]), 401
    return None


@app.after_request
def cabeceras_seguridad(resp):
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("X-Frame-Options", "DENY")
    resp.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    resp.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
    resp.headers.setdefault(
        "Content-Security-Policy",
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline'; "
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
        "font-src 'self' https://fonts.gstatic.com data:; "
        "img-src 'self' data: https:; "
        "connect-src 'self' https://api.coingecko.com https://api.binance.com; "
        "frame-ancestors 'none'; object-src 'none';",
    )
    if request.path.startswith("/api/"):
        resp.headers["Cache-Control"] = "no-store"
    mimetype = (resp.mimetype or "").lower()
    if (
        resp.status_code == 200
        and not resp.direct_passthrough
        and "Content-Encoding" not in resp.headers
        and "gzip" in (request.headers.get("Accept-Encoding") or "").lower()
        and mimetype.startswith(("application/json", "text/", "application/javascript", "image/svg+xml"))
    ):
        body = resp.get_data()
        if len(body) >= 1024:
            comprimido = gzip.compress(body, compresslevel=6)
            resp.set_data(comprimido)
            resp.headers["Content-Encoding"] = "gzip"
            resp.headers["Content-Length"] = str(len(comprimido))
            resp.vary.add("Accept-Encoding")
    return resp


# ---------------------------------------------------------------- Acceso a Cartera y Cálculo

def uid_actual():
    if not db.activo():
        return None
    try:
        return session.get("usuario_id")
    except RuntimeError:
        return None


def dir_trabajo_motor():
    """Carpeta donde motor.py lee/escribe la caché de cotizaciones."""
    os.makedirs(os.path.join(DATOS_BASE, "cache"), exist_ok=True)
    return DATOS_BASE


def lee_json(ruta, defecto=None):
    try:
        with open(ruta, "r", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return defecto


def obtener_estado_usuario():
    uid = uid_actual()
    if uid is not None:
        reg = db.obtener_registro_cartera(uid)
        return "propio", reg["cfg"], reg["calculado"], reg["estado"]
    # Modo local sin BD
    ruta_c = os.path.join(DATOS_BASE, "cartera.json")
    if os.path.exists(ruta_c):
        cfg = lee_json(ruta_c) or json.loads(json.dumps(almacen.CARTERA_VACIA))
        modo_actual = "propio"
    else:
        cfg = lee_json(DEMO, {}) or json.loads(json.dumps(almacen.CARTERA_VACIA))
        modo_actual = "demo"
    calc = lee_json(os.path.join(DATOS_BASE, f"calculado_{modo_actual}.json"))
    est = lee_json(os.path.join(DATOS_BASE, "estado.json"), {})
    return modo_actual, cfg, calc, est


def _ahora_iso_utc():
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def recalcula(descargar="faltan"):
    """Recalcula el panel con motor.py y persiste el resultado en PostgreSQL."""
    uid = uid_actual()
    carpeta_motor = dir_trabajo_motor()
    with _obtener_cerrojo(uid):
        modo_actual, cfg, _, est = obtener_estado_usuario()
        datos = motor.construir(cfg, carpeta_motor, descargar=descargar)
        if descargar is True or not est.get("preciosActualizados"):
            est["preciosActualizados"] = _ahora_iso_utc()
        if datos is not None:
            datos["modo"] = modo_actual
            datos["preciosActualizados"] = est.get("preciosActualizados")
        if uid is not None:
            db.guardar_calculado(uid, datos, est)
        else:
            os.makedirs(DATOS_BASE, exist_ok=True)
            with open(os.path.join(DATOS_BASE, "estado.json"), "w", encoding="utf-8") as f:
                json.dump(est, f, ensure_ascii=False, indent=1)
            with open(os.path.join(DATOS_BASE, f"calculado_{modo_actual}.json"), "w", encoding="utf-8") as f:
                json.dump(datos, f, ensure_ascii=False, indent=1)
        return datos


GUARDAR = {
    "productos": almacen.guarda_producto,
    "movimientos": almacen.guarda_movimiento,
    "valoraciones": almacen.guarda_valoracion,
}
BORRAR = {
    "productos": almacen.borra_producto,
    "movimientos": almacen.borra_movimiento,
    "valoraciones": almacen.borra_valoracion,
}


def cambia(fn, motivo_copia="Automática", prefijo_copia="auto"):
    """Aplica una modificación a la cartera del usuario, guarda en PostgreSQL (con backup) y recalcula."""
    uid = uid_actual()
    with _obtener_cerrojo(uid):
        modo_actual, cfg, _, _ = obtener_estado_usuario()
        if modo_actual == "demo" and uid is None:
            return jsonify(ok=False, errores=["Estás en modo demostración."]), 403
        cfg_copia = json.loads(json.dumps(cfg))
        try:
            item = fn(cfg_copia)
        except almacen.ErrorValidacion as e:
            msg = e.errores[0] if e.errores else "Error de validación."
            return jsonify(ok=False, error=msg, errores=e.errores), 400
        if uid is not None:
            db.guardar_cartera(uid, cfg_copia, crear_copia=True, motivo_copia=motivo_copia, prefijo_copia=prefijo_copia)
        else:
            almacen.guarda(os.path.join(DATOS_BASE, "cartera.json"), cfg_copia)
        datos = recalcula(descargar="faltan")
    return jsonify(
        ok=True,
        item=item,
        cartera=cfg_copia,
        datos=datos,
        panel=datos,
        avisos=(datos or {}).get("avisos", []),
    )


PLANES = {}  # {(uid, token): plan}


def valida_copia(cfg):
    if not isinstance(cfg, dict) or not all(
        isinstance(cfg.get(k), list) for k in ("productos", "movimientos", "valoraciones")
    ):
        raise almacen.ErrorValidacion(["Ese archivo no es una copia de seguridad válida de Capitalia."])
    return cfg


# ---------------------------------------------------------------- Registro de Blueprints API

registrar_blueprints(app)


# ---------------------------------------------------------------- Servir SPA Angular

@app.get("/")
@app.get("/<path:archivo>")
def servir_spa(archivo=""):
    if archivo:
        if archivo == "api" or archivo.startswith("api/"):
            return jsonify(ok=False, error="Ruta de API no encontrada."), 404
        if "\\" in archivo or "\x00" in archivo:
            return jsonify(ok=False, error="Ruta no permitida."), 404
        ruta_segura = safe_join(DIST_ANGULAR, archivo)
        if ruta_segura is None:
            return jsonify(ok=False, error="Ruta no permitida."), 404
        base_real = os.path.realpath(DIST_ANGULAR)
        ruta_real = os.path.realpath(ruta_segura)
        if not (ruta_real == base_real or ruta_real.startswith(base_real + os.sep)):
            return jsonify(ok=False, error="Ruta no permitida."), 404
        if os.path.isfile(ruta_real):
            resp = send_from_directory(DIST_ANGULAR, archivo)
            if archivo == "index.html":
                resp.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
            elif re.search(r"-[A-Za-z0-9_-]{8}\.(js|css|woff2?)$", archivo):
                resp.headers["Cache-Control"] = "public, max-age=31536000, immutable"
            return resp
    ruta_index = safe_join(DIST_ANGULAR, "index.html")
    if ruta_index and os.path.isfile(ruta_index):
        resp = send_from_directory(DIST_ANGULAR, "index.html")
        resp.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        return resp
    return jsonify(ok=False, error="Frontend Angular en compilación. Ejecuta npm run build."), 503


# ---------------------------------------------------------------- Arranque

def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
    logging.getLogger("werkzeug").setLevel(logging.ERROR)

    if db.activo():
        try:
            _asegurar_bd()
            print("  [OK] Base de datos PostgreSQL (capitalia) lista.")
        except Exception as e:
            print(f"  [!] Error preparando PostgreSQL: {e}")

    print("\n  CAPITALIA  ·  Gestión de Patrimonio e Inversiones")
    print("  " + "-" * 50)
    srv = make_server(HOST, PUERTO, app, threaded=True)
    print(f"  Servidor escuchando en http://{HOST}:{PUERTO}/\n")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
