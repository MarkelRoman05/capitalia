# -*- coding: utf-8 -*-
"""
servidor.py  ·  Servidor API y aplicación web de Capitalia
==========================================================
Sirve la SPA en Angular 22 y expone la API REST conectada a PostgreSQL
y al motor financiero (motor.py, buscar.py, importar.py, almacen.py).
"""

import collections
import datetime as dt
import html as html_lib
import json
import logging
import os
import re
import secrets
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

from flask import Flask, Response, jsonify, request, send_from_directory, session
from werkzeug.middleware.proxy_fix import ProxyFix
from werkzeug.serving import make_server

from . import almacen, buscar, carteras_catalogo, db, exportar, importar, motor, plantilla

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
MAX_INTENTOS_RESET = 5
VENTANA_RESET_SEGUNDOS = 15 * 60


def _comprobar_rate_limit(clave, max_intentos=MAX_INTENTOS_VENTANA, ventana=VENTANA_SEGUNDOS):
    ahora = time.time()
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


def _ahora_iso_utc():
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def recalcula(descargar="faltan"):
    """Recalcula el panel con motor.py y persiste el resultado en PostgreSQL."""
    uid = uid_actual()
    carpeta_motor = dir_trabajo_motor()
    with cerrojo:
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


def _leer_config_n8n():
    """Resuelve la configuración del webhook de n8n desde entorno o archivos .env."""
    env_local = db._lee_env_archivo(os.path.join(RAIZ, ".env"))
    env_infra = db._lee_env_archivo(os.path.abspath(os.path.join(RAIZ, "..", "..", ".env")))

    def obt(clave):
        return (os.environ.get(clave) or env_local.get(clave) or env_infra.get(clave) or "").strip()

    webhook_url = obt("CAPITALIA_N8N_WEBHOOK_RESET")
    webhook_secret = obt("CAPITALIA_N8N_WEBHOOK_SECRET")
    public_url = obt("CAPITALIA_PUBLIC_URL").rstrip("/")
    return webhook_url, webhook_secret, public_url


def _url_http_valida(url):
    if not url:
        return False
    parsed = urllib.parse.urlparse(url)
    return parsed.scheme in ("http", "https") and bool(parsed.netloc)


def _enviar_webhook_n8n_reset(webhook_url, webhook_secret, email, nombre, enlace, expira_minutos):
    """Envía la petición JSON al webhook de n8n para despachar el correo de recuperación."""
    nombre_limpio = (nombre or "inversor").strip() or "inversor"
    nombre_html = html_lib.escape(nombre_limpio, quote=True)
    enlace_html = html_lib.escape(enlace, quote=True)
    asunto = "Restablecer contraseña · Capitalia"

    texto = (
        f"Hola {nombre_limpio},\n\n"
        "Has solicitado restablecer tu contraseña en Capitalia.\n"
        f"Abre este enlace (válido durante {expira_minutos} minutos):\n\n"
        f"{enlace}\n\n"
        "Si no solicitaste este cambio, puedes ignorar este correo de forma segura."
    )

    cuerpo_html = (
        '<div style="font-family:Inter,Segoe UI,Arial,sans-serif;max-width:540px;margin:0 auto;'
        'padding:24px;color:#14161f;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;">'
        '<h2 style="margin:0 0 12px;font-size:20px;color:#14161f;">Restablecer contraseña</h2>'
        f'<p style="margin:0 0 14px;line-height:1.55;">Hola <strong>{nombre_html}</strong>,</p>'
        '<p style="margin:0 0 18px;line-height:1.55;">Has solicitado restablecer tu contraseña de acceso en '
        "<strong>Capitalia</strong>. Pulsa el siguiente botón para elegir una nueva clave:</p>"
        f'<p style="margin:0 0 20px;"><a href="{enlace_html}" '
        'style="display:inline-block;padding:12px 20px;background:#2f43c9;color:#ffffff;'
        'text-decoration:none;border-radius:8px;font-weight:600;">Cambiar contraseña</a></p>'
        f'<p style="margin:0 0 12px;font-size:13px;color:#525866;">Este enlace caduca en {expira_minutos} minutos '
        "y solo se puede usar una vez.</p>"
        '<p style="margin:0;font-size:12px;color:#6c7286;word-break:break-all;">'
        f"Si el botón no funciona, copia este enlace en tu navegador:<br>{enlace_html}</p>"
        "</div>"
    )

    payload = json.dumps({
        "evento": "recuperar_contrasena",
        "app": "Capitalia",
        "email": email,
        "nombre": nombre_limpio,
        "enlace": enlace,
        "expiraMinutos": expira_minutos,
        "asunto": asunto,
        "html": cuerpo_html,
        "texto": texto,
    }).encode("utf-8")

    headers = {
        "Content-Type": "application/json",
        "User-Agent": "Capitalia/1.0",
    }
    if webhook_secret:
        headers["X-Capitalia-Webhook-Secret"] = webhook_secret

    req = urllib.request.Request(webhook_url, data=payload, headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=10) as resp:
        if resp.status >= 400:
            raise urllib.error.HTTPError(webhook_url, resp.status, "Error del webhook", resp.headers, None)


@app.post("/api/auth/recuperar")
def auth_recuperar():
    if not db.activo():
        return jsonify(ok=False, errores=["La recuperación de contraseña requiere PostgreSQL activo."]), 400

    ip = request.remote_addr or "local"
    if not _comprobar_rate_limit(f"reset-ip:{ip}", MAX_INTENTOS_RESET, VENTANA_RESET_SEGUNDOS):
        return jsonify(ok=False, errores=["Demasiadas solicitudes seguidas. Espera unos minutos."]), 429

    webhook_url, webhook_secret, public_url = _leer_config_n8n()
    if not _url_http_valida(webhook_url):
        return jsonify(
            ok=False,
            errores=[
                "El envío de correo no está configurado todavía. Define CAPITALIA_N8N_WEBHOOK_RESET en el servidor."
            ],
        ), 503

    datos = request.get_json(silent=True) or {}
    email = (datos.get("email") or "").strip().lower()
    if not db.RE_EMAIL.match(email):
        return jsonify(ok=False, errores=["Escribe un correo electrónico válido."]), 400

    if not _comprobar_rate_limit(f"reset-mail:{email}", MAX_INTENTOS_RESET, VENTANA_RESET_SEGUNDOS):
        return jsonify(ok=False, errores=["Demasiadas solicitudes para este correo. Espera unos minutos."]), 429

    try:
        info = db.crear_token_recuperacion(email)
    except db.ErrorUsuario as e:
        return jsonify(ok=False, errores=e.errores), 400
    except Exception:
        logging.exception("Error interno generando token de recuperación")
        return jsonify(ok=False, errores=["No se pudo procesar la solicitud en este momento."]), 500

    if info:
        # TODO(security): Configurar CAPITALIA_PUBLIC_URL en producción para evitar spoofing de cabecera Host.
        base_url = public_url if _url_http_valida(public_url) else request.host_url.rstrip("/")
        enlace = f"{base_url}/restablecer#token={info['token']}"
        try:
            _enviar_webhook_n8n_reset(
                webhook_url,
                webhook_secret,
                info["email"],
                info["nombre"],
                enlace,
                info["expira_minutos"],
            )
        except urllib.error.HTTPError as e:
            logging.error("Fallo al invocar el webhook de n8n (HTTP %s)", e.code)
            return jsonify(
                ok=False,
                errores=["No se pudo contactar con el servicio de correo (n8n). Inténtalo en unos minutos."],
            ), 502
        except Exception as e:
            logging.error("Fallo al invocar el webhook de n8n (%s)", type(e).__name__)
            return jsonify(
                ok=False,
                errores=["No se pudo contactar con el servicio de correo (n8n). Inténtalo en unos minutos."],
            ), 502

    return jsonify(
        ok=True,
        mensaje=(
            "Si existe una cuenta asociada a ese correo, recibirás en unos instantes "
            "un enlace para restablecer tu contraseña."
        ),
    )


@app.post("/api/auth/restablecer")
def auth_restablecer():
    if not db.activo():
        return jsonify(ok=False, errores=["El restablecimiento requiere PostgreSQL activo."]), 400

    ip = request.remote_addr or "local"
    if not _comprobar_rate_limit(f"reset-confirm:{ip}", MAX_INTENTOS_RESET, VENTANA_RESET_SEGUNDOS):
        return jsonify(ok=False, errores=["Demasiados intentos seguidos. Espera unos minutos."]), 429

    datos = request.get_json(silent=True) or {}
    token = datos.get("token")
    clave = datos.get("clave") or datos.get("password")
    try:
        db.restablecer_clave_con_token(token, clave)
    except db.ErrorUsuario as e:
        return jsonify(ok=False, errores=e.errores), 400
    except Exception:
        logging.exception("Error interno al restablecer contraseña")
        return jsonify(ok=False, errores=["No se pudo actualizar la contraseña en este momento."]), 500

    session.clear()
    return jsonify(ok=True, mensaje="Contraseña actualizada correctamente. Ya puedes iniciar sesión.")


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
        actualizado=_ahora_iso_utc(),
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
    q = (request.args.get("q") or "").strip()[:120]
    tipo = (request.args.get("tipo") or "todos").strip().lower()
    if tipo not in buscar.TIPOS_BUSQUEDA_VALIDOS:
        tipo = "todos"
    res = buscar.buscar(q, tipo=tipo)
    return jsonify(resultados=res, sinConexion=(not res and bool(buscar.hubo_fallos_desde(n))))


@app.get("/api/cartera-modelo/<cartera_id>")
def api_cartera_modelo(cartera_id):
    cid = (cartera_id or "").strip().lower()
    if not re.fullmatch(r"[a-z0-9_-]{2,80}", cid):
        return jsonify(ok=False, error="Identificador de cartera inválido."), 400
    detalle = carteras_catalogo.obtener_cartera_enriquecida(cid)
    if not detalle:
        return jsonify(ok=False, error="Cartera no encontrada."), 404
    return jsonify(ok=True, cartera=detalle)


@app.get("/api/bancos")
def api_bancos():
    q = (request.args.get("q") or "").strip()
    uid = uid_actual()
    if db.activo():
        datos_db = db.listar_entidades(uid=uid, q=q)
        recientes = datos_db["recientes"]
        entidades = datos_db["entidades"]
    else:
        recientes = []
        entidades = []

    online = []
    if len(q) >= 2:
        vistos_dom = {e["dominio"].lower() for e in entidades if e.get("dominio")}
        vistos_nom = {e["nombre"].lower() for e in entidades if e.get("nombre")}
        for b in buscar.buscar_bancos(q):
            dom = (b.get("dominio") or "").lower()
            nom = (b.get("nombre") or "").lower()
            if (dom and dom in vistos_dom) or (nom and nom in vistos_nom):
                continue
            online.append({
                "nombre": b.get("nombre", ""),
                "dominio": b.get("dominio", ""),
                "logo": b.get("logo", ""),
                "categoria": b.get("dominio", ""),
                "verificado": bool(b.get("verificado")),
            })
    return jsonify(recientes=recientes, entidades=entidades, online=online)


@app.post("/api/bancos/uso")
def api_bancos_uso():
    datos = request.get_json(silent=True) or {}
    nombre = (datos.get("nombre") or "").strip()
    if not nombre:
        return jsonify(ok=False, error="El nombre de la entidad es obligatorio."), 400
    if not db.activo():
        return jsonify(ok=True, entidad={"nombre": nombre})
    ent = db.registrar_entidad(
        nombre=nombre,
        dominio=datos.get("dominio") or "",
        logo=datos.get("logo") or "",
        categoria=datos.get("categoria") or "",
        uid=uid_actual(),
        origen="brandfetch" if datos.get("dominio") else "usuario",
    )
    return jsonify(ok=True, entidad=ent)


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


@app.post("/api/productos/lote")
def api_guardar_productos_lote():
    payload = request.get_json(silent=True) or {}
    productos = payload.get("productos")
    entidad_def = (payload.get("entidad") or "").strip()[:80]
    grupo_id = (payload.get("grupoId") or "").strip().lower()
    grupo_nombre = (payload.get("grupoNombre") or "").strip()[:120]
    if grupo_id and not re.fullmatch(r"[a-z0-9_-]{2,80}", grupo_id):
        return jsonify(ok=False, error="Identificador de grupo inválido."), 400
    if not isinstance(productos, list) or not (1 <= len(productos) <= 20):
        return jsonify(ok=False, error="Envía entre 1 y 20 productos válidos."), 400

    def fn(cfg):
        existentes_por_clave = {}
        for p in cfg.get("productos") or []:
            for k in ("identificador", "codigo"):
                val = (p.get(k) or "").strip().upper()
                if val:
                    existentes_por_clave[val] = p

        usados = {p.get("slot") for p in cfg.get("productos") or [] if p.get("slot")}
        libres = [s for s in range(1, 13) if s not in usados] or list(range(1, 13))
        idx_slot = 0
        añadidos = 0
        vinculados = 0
        omitidos = 0

        for bruto in productos:
            if not isinstance(bruto, dict):
                continue
            ident = (bruto.get("identificador") or "").strip().upper()
            cod = (bruto.get("codigo") or "").strip()
            fuente = (bruto.get("fuente") or "").strip().lower()
            if not cod or fuente not in ("morningstar", "yahoo", "coingecko"):
                omitidos += 1
                continue

            item = dict(bruto)
            g_id_item = (item.get("grupoId") or grupo_id or "").strip().lower()
            g_nom_item = (item.get("grupoNombre") or grupo_nombre or "").strip()[:120]
            if g_id_item and not re.fullmatch(r"[a-z0-9_-]{2,80}", g_id_item):
                raise almacen.ErrorValidacion(["El identificador del grupo no es válido."])

            peso_raw = item.get("pesoObjetivo")
            peso_val = None
            if peso_raw is not None and peso_raw != "":
                errs_peso = []
                peso_val = almacen.numero(peso_raw, "el peso objetivo", errs_peso, obligatorio=False, minimo=0)
                if errs_peso or (peso_val is not None and peso_val > 100):
                    raise almacen.ErrorValidacion(["El peso objetivo debe estar entre 0 y 100."])
                peso_val = round(peso_val, 2) if peso_val is not None else None

            existente = (
                existentes_por_clave.get(ident) if ident else None
            ) or existentes_por_clave.get(cod.upper())

            if existente:
                if g_id_item and (not existente.get("grupoId") or existente.get("grupoId") == g_id_item):
                    existente["grupoId"] = g_id_item
                    if g_nom_item:
                        existente["grupoNombre"] = g_nom_item
                    if peso_val is not None:
                        existente["pesoObjetivo"] = peso_val
                    vinculados += 1
                else:
                    omitidos += 1
                continue

            if entidad_def and not (item.get("entidad") or "").strip():
                item["entidad"] = entidad_def
            if g_id_item:
                item["grupoId"] = g_id_item
            if g_nom_item:
                item["grupoNombre"] = g_nom_item
            if peso_val is not None:
                item["pesoObjetivo"] = peso_val
            if not item.get("slot"):
                item["slot"] = libres[idx_slot % len(libres)]
                idx_slot += 1

            prod, _ = almacen.guarda_producto(cfg, item)
            for k in ("identificador", "codigo"):
                val = (prod.get(k) or "").strip().upper()
                if val:
                    existentes_por_clave[val] = prod
            añadidos += 1

        if añadidos == 0 and vinculados == 0 and omitidos == 0:
            raise almacen.ErrorValidacion(["No se pudo validar ningún producto de la cartera."])
        return {
            "añadidos": añadidos,
            "omitidos": omitidos,
            "vinculados": vinculados,
            "grupoId": grupo_id or None,
            "grupoNombre": grupo_nombre or None,
        }

    return cambia(fn, motivo_copia="Alta de cartera indexada")


@app.post("/api/movimientos/lote-cartera")
def api_guardar_movimientos_lote_cartera():
    payload = request.get_json(silent=True) or {}
    lineas = payload.get("lineas")
    reemplazar = bool(payload.get("reemplazarPrevios"))
    nota = almacen.texto(payload.get("nota"), 200) or "Cartera agrupada"
    if not isinstance(lineas, list) or not (1 <= len(lineas) <= 30):
        return jsonify(ok=False, error="Envía entre 1 y 30 líneas de posición."), 400

    errs_fecha = []
    f_iso = almacen.fecha(payload.get("fecha"), errs_fecha)
    if errs_fecha:
        return jsonify(ok=False, error=errs_fecha[0], errores=errs_fecha), 400

    def fn(cfg):
        errs = []
        validas = []
        for idx, raw in enumerate(lineas, start=1):
            if not isinstance(raw, dict):
                continue
            pid = (raw.get("producto") or "").strip()
            imp = almacen.numero(raw.get("importe"), f"el importe de la línea {idx}", errs, obligatorio=False, minimo=0)
            uni = almacen.numero(raw.get("unidades"), f"las participaciones de la línea {idx}", errs, obligatorio=False, minimo=0)
            if errs:
                raise almacen.ErrorValidacion(errs)
            if not (imp and imp > 0) and not (uni and uni > 0):
                continue
            p = almacen.producto(cfg, pid)
            if not p:
                raise almacen.ErrorValidacion([f"Producto desconocido: {pid}"])
            if p.get("tipo") in almacen.SOLO_SALDO:
                raise almacen.ErrorValidacion([f"«{p.get('corto') or p['nombre']}» se valora con saldos manuales."])
            validas.append((p, imp, uni))

        if not validas:
            raise almacen.ErrorValidacion(["Introduce al menos un importe o número de participaciones mayor que 0."])

        carpeta = dir_trabajo_motor()
        preparadas = []
        for p, imp, uni in validas:
            imp_val = round(float(imp), 2) if (imp and imp > 0) else None
            uni_val = round(float(uni), 6) if (uni and uni > 0) else None
            cotiza = p.get("fuente") != "manual" and p.get("codigo")
            if cotiza and (imp_val is None or uni_val is None):
                serie = motor.serie_producto(p, carpeta)
                px = motor.valor_en(serie, f_iso, margen=10) if serie else None
                if not px:
                    info = buscar.probar(p["fuente"], p["codigo"])
                    if info and info.get("precio"):
                        px_raw = float(info["precio"])
                        if p["fuente"] == "yahoo":
                            mon = info.get("moneda") or p.get("moneda") or "EUR"
                            sim, factor = motor.simbolo_fx(mon)
                            if sim:
                                fx_serie = motor.serie_cambio(mon, carpeta)
                                fx_val = motor.valor_en(fx_serie, f_iso, margen=10)
                                px = px_raw * factor * fx_val if fx_val else None
                            else:
                                px = px_raw * factor
                        else:
                            px = px_raw
                if not px or px <= 0:
                    raise almacen.ErrorValidacion([
                        f"No se pudo obtener el precio de «{p.get('corto') or p['nombre']}» para el {almacen.fmt_fecha(f_iso)}. "
                        "Indica también las participaciones manualmente."
                    ])
                if uni_val is None:
                    uni_val = round(imp_val / px, 6)
                elif imp_val is None:
                    imp_val = round(uni_val * px, 2)
            elif not cotiza and imp_val is None:
                raise almacen.ErrorValidacion([
                    f"Indica el importe en euros para «{p.get('corto') or p['nombre']}»."
                ])
            preparadas.append((p["id"], uni_val or 0.0, imp_val))

        reemplazados = 0
        if reemplazar:
            pids_tocados = {pid for pid, _, _ in preparadas}
            antes = len(cfg.get("movimientos") or [])
            cfg["movimientos"] = [
                m for m in (cfg.get("movimientos") or [])
                if m.get("producto") not in pids_tocados
            ]
            reemplazados = antes - len(cfg["movimientos"])

        guardados = 0
        for pid, uni_val, imp_val in preparadas:
            almacen.guarda_movimiento(cfg, {
                "producto": pid,
                "fecha": f_iso,
                "tipo": "compra",
                "unidades": uni_val,
                "importe": imp_val,
                "nota": nota,
            })
            guardados += 1

        return {"guardados": guardados, "reemplazados": reemplazados}

    return cambia(fn, motivo_copia="Importes de cartera agrupada")


@app.delete("/api/carteras-grupo/<grupo_id>")
def api_borrar_cartera_grupo(grupo_id):
    gid = (grupo_id or "").strip().lower()
    if not re.fullmatch(r"[a-z0-9_-]{2,80}", gid):
        return jsonify(ok=False, error="Identificador de cartera inválido."), 400

    def fn(cfg):
        pids = [p["id"] for p in (cfg.get("productos") or []) if (p.get("grupoId") or "").lower() == gid]
        if not pids:
            raise almacen.ErrorValidacion(["No se encontró ninguna cartera con ese identificador."])
        for pid in pids:
            almacen.borra_producto(cfg, pid)
        return {"eliminados": len(pids), "grupoId": gid}

    return cambia(fn, motivo_copia="Eliminación de cartera agrupada")


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
