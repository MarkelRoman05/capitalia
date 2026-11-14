# -*- coding: utf-8 -*-
"""
servidor.py  ·  Servidor API y aplicación web de Capitalia
==========================================================
Sirve la SPA en Angular 22 y expone la API REST conectada a PostgreSQL
y al motor financiero (motor.py, buscar.py, importar.py, almacen.py).
"""

import collections
import datetime as dt
import json
import logging
import os
import secrets
import sys
import threading
import time

from flask import Flask, Response, jsonify, request, send_from_directory, session
from werkzeug.middleware.proxy_fix import ProxyFix
from werkzeug.serving import make_server

from . import almacen, buscar, db, exportar, importar, motor, plantilla

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
cerrojo = threading.RLock()

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
MAX_INTENTOS_VENTANA = 15
VENTANA_SEGUNDOS = 60


def _comprobar_rate_limit(clave):
    ahora = time.time()
    lista = [t for t in _INTENTOS_AUTH[clave] if ahora - t < VENTANA_SEGUNDOS]
    _INTENTOS_AUTH[clave] = lista
    if len(lista) >= MAX_INTENTOS_VENTANA:
        return False
    _INTENTOS_AUTH[clave].append(ahora)
    return True


RUTAS_API_PUBLICAS = {
    "/api/auth/login",
    "/api/auth/registro",
    "/api/auth/yo",
    "/api/ping",
    "/api/version",
}


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


def recalcula(descargar="faltan"):
    """Recalcula el panel con motor.py y persiste el resultado en PostgreSQL."""
    uid = uid_actual()
    carpeta_motor = dir_trabajo_motor()
    with cerrojo:
        modo_actual, cfg, _, est = obtener_estado_usuario()
        datos = motor.construir(cfg, carpeta_motor, descargar=descargar)
        if descargar is True or not est.get("preciosActualizados"):
            est["preciosActualizados"] = dt.datetime.now().replace(microsecond=0).isoformat()
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


# ---------------------------------------------------------------- Autenticación

@app.post("/api/auth/registro")
def auth_registro():
    if not db.activo():
        return jsonify(ok=False, errores=["El registro no está disponible sin PostgreSQL."]), 400
    ip = request.remote_addr or "local"
    if not _comprobar_rate_limit(f"reg:{ip}"):
        return jsonify(ok=False, errores=["Demasiados intentos seguidos. Espera un minuto."]), 429
    datos = request.get_json(silent=True) or {}
    clave = datos.get("password") or datos.get("clave")
    try:
        u = db.crear_usuario(datos.get("email"), datos.get("nombre"), clave)
    except db.ErrorUsuario as e:
        msg = e.errores[0] if e.errores else "Datos no válidos."
        return jsonify(ok=False, error=msg, errores=e.errores), 400
    except Exception:
        logging.exception("Fallo al registrar usuario")
        return jsonify(ok=False, error="Error interno al crear la cuenta.", errores=["Error interno al crear la cuenta."]), 500
    session.clear()
    session["usuario_id"] = u["id"]
    session.permanent = True
    return jsonify(ok=True, usuario=u)


@app.post("/api/auth/login")
def auth_login():
    if not db.activo():
        return jsonify(ok=False, error="El login no está disponible sin PostgreSQL.", errores=["El login no está disponible sin PostgreSQL."]), 400
    ip = request.remote_addr or "local"
    if not _comprobar_rate_limit(f"login:{ip}"):
        return jsonify(ok=False, error="Demasiados intentos de acceso. Espera un minuto.", errores=["Demasiados intentos de acceso. Espera un minuto."]), 429
    datos = request.get_json(silent=True) or {}
    clave = datos.get("password") or datos.get("clave")
    try:
        u = db.autenticar(datos.get("email"), clave)
    except Exception:
        logging.exception("Fallo al autenticar usuario")
        return jsonify(ok=False, error="No se ha podido iniciar sesión en este momento.", errores=["No se ha podido iniciar sesión en este momento."]), 500
    if not u:
        return jsonify(ok=False, error="Correo electrónico o contraseña incorrectos.", errores=["Correo electrónico o contraseña incorrectos."]), 401
    session.clear()
    session["usuario_id"] = u["id"]
    session.permanent = True
    return jsonify(ok=True, usuario=u)


@app.post("/api/auth/logout")
def auth_logout():
    session.clear()
    return jsonify(ok=True)


@app.get("/api/auth/yo")
def auth_yo():
    if not db.activo():
        return jsonify(autenticado=True, modo="local", usuario=None)
    try:
        u = db.por_id(session.get("usuario_id"))
    except Exception:
        u = None
    return jsonify(autenticado=bool(u), modo="nube", usuario=u)


@app.post("/api/auth/perfil")
def auth_perfil():
    if not db.activo():
        return jsonify(ok=False, errores=["El perfil no está disponible sin PostgreSQL."]), 400
    ip = request.remote_addr or "local"
    if not _comprobar_rate_limit(f"perfil:{ip}"):
        return jsonify(ok=False, errores=["Demasiados intentos seguidos. Espera un minuto."]), 429
    uid = session.get("usuario_id")
    if not uid:
        return jsonify(ok=False, errores=["Tu sesión ha caducado. Inicia sesión de nuevo."]), 401
    datos = request.get_json(silent=True) or {}
    try:
        u = db.actualizar_usuario(
            uid,
            nombre=datos.get("nombre"),
            email=datos.get("email"),
            password_actual=datos.get("passwordActual") or datos.get("password_actual"),
            password_nueva=datos.get("passwordNueva") or datos.get("password_nueva"),
        )
    except db.ErrorUsuario as e:
        return jsonify(ok=False, errores=e.errores), 400
    except Exception:
        logging.exception("Fallo al actualizar el perfil del usuario %s", uid)
        return jsonify(ok=False, errores=["No se ha podido actualizar el perfil en este momento."]), 500
    return jsonify(ok=True, usuario=u)


# ---------------------------------------------------------------- API del Panel y Cartera

@app.get("/api/panel")
def api_panel():
    modo_actual, cfg, calc, _ = obtener_estado_usuario()
    if calc is None and (cfg.get("productos") or cfg.get("movimientos") or cfg.get("valoraciones")):
        calc = recalcula(descargar="faltan")
    return jsonify(
        ok=True,
        modo=modo_actual,
        datos=calc,
        cartera=cfg,
        tipos=motor.TIPOS,
        fuentes=motor.FUENTES,
        tiposMovimiento=almacen.TIPOS_MOV,
        ejemplo=True,
    )


@app.get("/datos.js")
def datos_js():
    _, cfg, calc, _ = obtener_estado_usuario()
    if calc is None and (cfg.get("productos") or cfg.get("movimientos") or cfg.get("valoraciones")):
        calc = recalcula(descargar="faltan")
    cuerpo = "window.DATOS = " + json.dumps(calc, ensure_ascii=False, separators=(",", ":")) + ";\n"
    return Response(cuerpo, mimetype="application/javascript", headers={"Cache-Control": "no-store"})


@app.post("/api/actualizar")
def api_actualizar():
    try:
        datos = recalcula(descargar=True)
    except Exception as e:
        logging.exception("Fallo al actualizar precios")
        return jsonify(ok=False, error=f"No he podido actualizar los precios: {e}", errores=[f"No he podido actualizar los precios: {e}"]), 500
    _, cfg, _, _ = obtener_estado_usuario()
    return jsonify(ok=True, datos=datos, panel=datos, cartera=cfg, avisos=(datos or {}).get("avisos", []))


@app.get("/api/precios-vivo")
def api_precios_vivo():
    _, cfg, _, _ = obtener_estado_usuario()
    try:
        precios = motor.obtener_precios_vivo(cfg.get("productos", []))
    except Exception:
        logging.exception("Fallo al obtener precios en tiempo real")
        precios = {}
    return jsonify(
        ok=True,
        actualizado=dt.datetime.now().replace(microsecond=0).isoformat(),
        precios=precios,
    )


@app.get("/api/cartera")
def api_cartera():
    modo_actual, cfg, _, _ = obtener_estado_usuario()
    return jsonify(
        modo=modo_actual,
        cartera=cfg,
        tipos=motor.TIPOS,
        fuentes=motor.FUENTES,
        tiposMovimiento=almacen.TIPOS_MOV,
        ejemplo=True,
    )


@app.get("/api/buscar")
def api_buscar():
    n = len(buscar.FALLOS)
    res = buscar.buscar(request.args.get("q", ""))
    return jsonify(resultados=res, sinConexion=(not res and bool(buscar.hubo_fallos_desde(n))))


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
    with cerrojo:
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


@app.post("/api/<coleccion>")
@app.put("/api/<coleccion>/<ident>")
def api_guardar(coleccion, ident=None):
    if coleccion not in GUARDAR:
        return jsonify(ok=False, error="Colección desconocida.", errores=["Colección desconocida."]), 404
    datos = request.get_json(silent=True) or {}
    if ident and isinstance(datos, dict):
        datos["id"] = ident

    def fn(cfg):
        if coleccion != "productos":
            return GUARDAR[coleccion](cfg, datos)
        prod, cambio = almacen.guarda_producto(cfg, datos)
        if cambio and prod["fuente"] != "manual" and not buscar.probar(prod["fuente"], prod["codigo"]):
            raise almacen.ErrorValidacion([
                f"No encuentro precio para «{prod['codigo']}» en {motor.FUENTES[prod['fuente']]}. "
                "Revisa el código con el buscador o elige «Valor anotado a mano»."
            ])
        return prod

    return cambia(fn)


@app.delete("/api/<coleccion>/<ident>")
def api_borrar(coleccion, ident):
    if coleccion not in BORRAR:
        return jsonify(ok=False, errores=["Colección desconocida."]), 404
    return cambia(lambda cfg: BORRAR[coleccion](cfg, ident))


@app.post("/api/repartir-colores")
def api_repartir_colores():
    _, _, calc, _ = obtener_estado_usuario()
    calc = calc or {}
    grandes = [
        p["id"]
        for p in sorted(
            calc.get("productos", []) + calc.get("otrosActivos", []),
            key=lambda p: -(p.get("valor") or 0),
        )
    ]
    return cambia(lambda cfg: almacen.reparte_colores(cfg, grandes))


@app.post("/api/objetivo")
def api_objetivo():
    """Actualiza el titular de la cartera y el objetivo de patrimonio."""
    datos = request.get_json(silent=True) or {}

    def fn(cfg):
        if "titular" in datos:
            tit = str(datos.get("titular") or "").strip()[:80]
            if tit:
                cfg["titular"] = tit
        raw_imp = datos.get("importeObjetivo") if "importeObjetivo" in datos else datos.get("importe")
        if raw_imp is not None or "importeObjetivo" in datos or "importe" in datos:
            errores = []
            imp = almacen.numero(raw_imp, "el objetivo", errores, obligatorio=False, mayor_que=0)
            if errores:
                raise almacen.ErrorValidacion(errores)
            activo_flag = datos.get("activoObjetivo", datos.get("activo", True))
            etq_val = datos.get("etiquetaObjetivo") or datos.get("etiqueta") or "Próximo objetivo"
            cfg["objetivo"] = {
                "activo": bool(activo_flag) and imp is not None,
                "importe": round(imp, 2) if imp else 100000,
                "etiqueta": str(etq_val).strip()[:60],
            }
        return cfg.get("objetivo")

    return cambia(fn)


@app.post("/api/empezar")
@app.post("/api/cargar-ejemplo")
def api_cargar_ejemplo():
    """Carga la cartera de ejemplo o empieza de cero, guardando antes copia en PostgreSQL."""
    datos_req = request.get_json(silent=True) or {}
    desde = datos_req.get("desde", "ejemplo")

    def fn(cfg):
        if desde == "ejemplo":
            ejemplo_cfg = lee_json(DEMO, {}) or json.loads(json.dumps(almacen.CARTERA_VACIA))
            cfg.clear()
            cfg.update(ejemplo_cfg)
            cfg["titular"] = "Mi patrimonio (cartera de ejemplo)"
        else:
            vacia = json.loads(json.dumps(almacen.CARTERA_VACIA))
            cfg.clear()
            cfg.update(vacia)
        return None

    return cambia(fn, motivo_copia="Antes de cargar ejemplo", prefijo_copia="antes_de_ejemplo")


@app.post("/api/reiniciar")
def api_reiniciar():
    """Reinicia la cartera a vacía o al ejemplo de práctica, guardando copia en PostgreSQL."""
    a = (request.get_json(silent=True) or {}).get("a", "vacia")

    def fn(cfg):
        if a == "demo" or a == "ejemplo":
            ejemplo_cfg = lee_json(DEMO, {}) or json.loads(json.dumps(almacen.CARTERA_VACIA))
            cfg.clear()
            cfg.update(ejemplo_cfg)
            cfg["titular"] = "Mi patrimonio (cartera de ejemplo)"
        else:
            vacia = json.loads(json.dumps(almacen.CARTERA_VACIA))
            cfg.clear()
            cfg.update(vacia)
        return None

    return cambia(fn, motivo_copia="Antes de empezar de nuevo", prefijo_copia="antes_de_reiniciar")


# ---------------------------------------------------------------- Importación

PLANES = {}  # {(uid, token): plan}


@app.post("/api/importar/previsualizar")
def api_importar_previsualizar():
    import base64 as b64
    datos_json = request.get_json(silent=True)
    if datos_json and isinstance(datos_json, dict):
        origen = datos_json.get("origen")
        archivos = []
        for item in datos_json.get("archivos") or []:
            nom = os.path.basename(item.get("nombre") or "importacion.csv")
            if item.get("base64"):
                archivos.append((nom, b64.b64decode(item["base64"])))
            elif item.get("contenido") is not None:
                archivos.append((nom, str(item["contenido"]).encode("utf-8")))
        texto = (datos_json.get("texto") or "").strip()
        producto_por_defecto = datos_json.get("productoPorDefecto")
    else:
        origen = request.form.get("origen")
        archivos = [(os.path.basename(f.filename), f.read()) for f in request.files.getlist("archivos") if f.filename]
        texto = (request.form.get("texto") or "").strip()
        producto_por_defecto = request.form.get("productoPorDefecto")

    carpeta_motor = dir_trabajo_motor()
    with cerrojo:
        _, cfg, _, _ = obtener_estado_usuario()
        if origen == "myinvestor":
            if not archivos:
                return jsonify(ok=False, error="Elige los archivos CSV descargados de MyInvestor.", errores=["Elige los archivos CSV descargados de MyInvestor."]), 400
            plan = importar.preparar_myinvestor(cfg, archivos, carpeta_motor, producto_por_defecto)
        else:
            if not archivos and not texto:
                return jsonify(ok=False, error="Elige un archivo o pega el texto generado por la IA.", errores=["Elige un archivo o pega el texto generado por la IA."]), 400
            # Intentar primero MyInvestor si es un CSV con cabeceras de MyInvestor, y si no, tabla estándar
            filas = []
            for nombre, contenido in archivos or [("pegado.csv", texto)]:
                leidas, error = importar.leer_tabla(nombre, contenido)
                if error:
                    return jsonify(ok=False, error=f"{nombre}: {error}", errores=[f"{nombre}: {error}" if archivos else error]), 400
                filas += leidas
            plan = importar.preparar_tabla(cfg, filas, carpeta_motor)
        informe = importar.vista_previa(cfg, plan)
    token = secrets.token_hex(12)
    uid = uid_actual() or 0
    for k in [k for k in PLANES if k[0] == uid]:
        PLANES.pop(k, None)
    PLANES[(uid, token)] = plan
    PLANES[(uid, "ultimo")] = plan
    return jsonify(ok=True, token=token, informe=informe)


@app.post("/api/importar/confirmar")
def api_importar_confirmar():
    uid = uid_actual() or 0
    token = (request.get_json(silent=True) or {}).get("token")
    plan = PLANES.pop((uid, token), None) if token else PLANES.pop((uid, "ultimo"), None)
    if plan is None:
        return jsonify(ok=False, error="La vista previa ha caducado: vuelve a revisar el archivo.", errores=["La vista previa ha caducado: vuelve a revisar el archivo."]), 400
    informe = {}

    def fn(cfg):
        informe.update(importar.aplicar(cfg, plan))
        return None

    respuesta = cambia(fn, motivo_copia="Antes de importar", prefijo_copia="auto")
    if isinstance(respuesta, tuple):
        return respuesta
    datos = respuesta.get_json()
    datos["informe"] = {k: informe[k] for k in ("añadidos", "repetidos", "saldos", "sustituidos")}
    return jsonify(datos)


@app.get("/api/plantilla.xlsx")
def api_plantilla_xlsx():
    return Response(
        plantilla.excel(),
        headers={
            "Content-Disposition": 'attachment; filename="plantilla_capitalia.xlsx"',
            "X-Content-Type-Options": "nosniff",
        },
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


@app.get("/api/plantilla.csv")
def api_plantilla_csv():
    return Response(
        plantilla.csv_vacio(),
        mimetype="text/csv",
        headers={
            "Content-Disposition": 'attachment; filename="plantilla_capitalia.csv"',
            "X-Content-Type-Options": "nosniff",
        },
    )


@app.get("/api/prompt")
def api_prompt():
    with open(os.path.join(RAIZ, "backend", "prompt_ia.txt"), encoding="utf-8") as f:
        txt = f.read()
        return jsonify(texto=txt, prompt=txt)


# ---------------------------------------------------------------- Copias de Seguridad y Exportación

def valida_copia(cfg):
    if not isinstance(cfg, dict) or not all(
        isinstance(cfg.get(k), list) for k in ("productos", "movimientos", "valoraciones")
    ):
        raise almacen.ErrorValidacion(["Ese archivo no es una copia de seguridad válida de Capitalia."])
    return cfg


@app.get("/api/copias")
def api_copias():
    uid = uid_actual()
    if uid is not None:
        return jsonify(copias=db.listar_copias(uid))
    return jsonify(copias=[])


@app.get("/api/copia/descargar")
def api_copia_descargar():
    _, cfg, _, _ = obtener_estado_usuario()
    contenido = json.dumps(cfg, ensure_ascii=False, indent=2).encode("utf-8")
    nombre = f"copia_capitalia_{dt.date.today().isoformat()}.json"
    return Response(
        contenido,
        mimetype="application/json",
        headers={
            "Content-Disposition": f'attachment; filename="{nombre}"',
            "X-Content-Type-Options": "nosniff",
        },
    )


@app.post("/api/copia/subir")
def api_copia_subir():
    datos_json = request.get_json(silent=True)
    if datos_json and isinstance(datos_json, dict) and "contenido" in datos_json:
        try:
            cfg_nueva = valida_copia(datos_json["contenido"])
        except almacen.ErrorValidacion as e:
            return jsonify(ok=False, error=e.errores[0], errores=e.errores), 400
    else:
        f = request.files.get("archivo")
        if not f:
            return jsonify(ok=False, error="Elige el archivo .json de la copia de seguridad.", errores=["Elige el archivo .json de la copia de seguridad."]), 400
        try:
            cfg_nueva = valida_copia(json.loads(importar.decodifica(f.read())))
        except ValueError:
            return jsonify(ok=False, error="El archivo no es un JSON válido.", errores=["El archivo no es un JSON válido."]), 400
        except almacen.ErrorValidacion as e:
            return jsonify(ok=False, error=e.errores[0], errores=e.errores), 400

    def fn(cfg):
        cfg.clear()
        cfg.update(cfg_nueva)
        return None

    return cambia(fn, motivo_copia="Antes de recuperar una copia", prefijo_copia="antes_de_recuperar")


@app.post("/api/copia/recuperar")
def api_copia_recuperar():
    uid = uid_actual()
    nombre = os.path.basename((request.get_json(silent=True) or {}).get("archivo") or "")
    if not nombre.endswith(".json") or uid is None:
        return jsonify(ok=False, errores=["Esa copia no está disponible."]), 400
    cfg_recuperada = db.obtener_copia(uid, nombre)
    if not cfg_recuperada:
        return jsonify(ok=False, errores=["Esa copia ya no existe en la base de datos."]), 404
    try:
        valida_copia(cfg_recuperada)
    except almacen.ErrorValidacion as e:
        return jsonify(ok=False, errores=e.errores), 400

    def fn(cfg):
        cfg.clear()
        cfg.update(cfg_recuperada)
        return None

    return cambia(fn, motivo_copia="Antes de recuperar una copia", prefijo_copia="antes_de_recuperar")


@app.get("/api/exportar-web")
def api_exportar_web():
    _, cfg, calc, _ = obtener_estado_usuario()
    if calc is None and (cfg.get("productos") or cfg.get("movimientos") or cfg.get("valoraciones")):
        calc = recalcula(descargar="faltan")
    if not calc:
        return jsonify(ok=False, errores=["Todavía no hay datos calculados en el panel para exportar."]), 400
    ocultar = request.args.get("ocultar") == "1"
    html = exportar.pagina(PLANTILLA_WEB, calc, ocultar=ocultar, titulo=calc.get("titular") or "Mi patrimonio")
    nombre = "capitalia_sin_importes.html" if ocultar else "capitalia_patrimonio.html"
    return Response(
        html.encode("utf-8"),
        mimetype="text/html",
        headers={
            "Content-Disposition": f'attachment; filename="{nombre}"',
            "X-Content-Type-Options": "nosniff",
        },
    )


@app.get("/api/version")
def api_version():
    with open(os.path.join(RAIZ, "backend", "VERSION"), encoding="utf-8") as f:
        actual = f.read().strip()
    return jsonify(actual=actual, ultima=actual, hayNueva=False, app="Capitalia")


@app.get("/api/ping")
def api_ping():
    return jsonify(app="capitalia", ok=True)


# ---------------------------------------------------------------- Servir SPA Angular

@app.get("/")
@app.get("/<path:archivo>")
def servir_spa(archivo=""):
    if archivo and os.path.exists(os.path.join(DIST_ANGULAR, archivo)):
        return send_from_directory(DIST_ANGULAR, archivo)
    if os.path.exists(os.path.join(DIST_ANGULAR, "index.html")):
        return send_from_directory(DIST_ANGULAR, "index.html")
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
            db.inicia()
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
