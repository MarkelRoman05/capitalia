# -*- coding: utf-8 -*-
"""Rutas de autenticación, perfil de usuario y recuperación de contraseña."""

import html as html_lib
import json
import logging
import os
import urllib.error
import urllib.parse
import urllib.request

from flask import Blueprint, jsonify, request, session

auth_bp = Blueprint("auth", __name__)


def _leer_config_n8n(srv):
    """Resuelve la configuración del webhook de n8n desde entorno o archivos .env."""
    env_local = srv.db._lee_env_archivo(os.path.join(srv.RAIZ, ".env"))
    env_infra = srv.db._lee_env_archivo(os.path.abspath(os.path.join(srv.RAIZ, "..", "..", ".env")))

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


@auth_bp.post("/api/auth/registro")
def auth_registro():
    from .. import servidor as srv

    if not srv.db.activo():
        return jsonify(ok=False, errores=["El registro no está disponible sin PostgreSQL."]), 400
    ip = request.remote_addr or "local"
    if not srv._comprobar_rate_limit(f"reg:{ip}"):
        return jsonify(ok=False, errores=["Demasiados intentos seguidos. Espera un minuto."]), 429
    datos = request.get_json(silent=True) or {}
    clave = datos.get("password") or datos.get("clave")
    try:
        u = srv.db.crear_usuario(datos.get("email"), datos.get("nombre"), clave)
    except srv.db.ErrorUsuario as e:
        msg = e.errores[0] if e.errores else "Datos no válidos."
        return jsonify(ok=False, error=msg, errores=e.errores), 400
    except Exception:
        logging.exception("Fallo al registrar usuario")
        return jsonify(ok=False, error="Error interno al crear la cuenta.", errores=["Error interno al crear la cuenta."]), 500
    session.clear()
    session["usuario_id"] = u["id"]
    session.permanent = True
    return jsonify(ok=True, usuario=u)


@auth_bp.post("/api/auth/login")
def auth_login():
    from .. import servidor as srv

    if not srv.db.activo():
        return jsonify(ok=False, error="El login no está disponible sin PostgreSQL.", errores=["El login no está disponible sin PostgreSQL."]), 400
    ip = request.remote_addr or "local"
    if not srv._comprobar_rate_limit(f"login:{ip}"):
        return jsonify(ok=False, error="Demasiados intentos de acceso. Espera un minuto.", errores=["Demasiados intentos de acceso. Espera un minuto."]), 429
    datos = request.get_json(silent=True) or {}
    clave = datos.get("password") or datos.get("clave")
    try:
        u = srv.db.autenticar(datos.get("email"), clave)
    except Exception:
        logging.exception("Fallo al autenticar usuario")
        return jsonify(ok=False, error="No se ha podido iniciar sesión en este momento.", errores=["No se ha podido iniciar sesión en este momento."]), 500
    if not u:
        return jsonify(ok=False, error="Correo electrónico o contraseña incorrectos.", errores=["Correo electrónico o contraseña incorrectos."]), 401
    session.clear()
    session["usuario_id"] = u["id"]
    session.permanent = True
    return jsonify(ok=True, usuario=u)


@auth_bp.post("/api/auth/logout")
def auth_logout():
    session.clear()
    return jsonify(ok=True)


@auth_bp.get("/api/auth/yo")
def auth_yo():
    from .. import servidor as srv

    if not srv.db.activo():
        return jsonify(autenticado=True, modo="local", usuario=None)
    try:
        u = srv.db.por_id(session.get("usuario_id"))
    except Exception:
        u = None
    return jsonify(autenticado=bool(u), modo="nube", usuario=u)


@auth_bp.post("/api/auth/perfil")
def auth_perfil():
    from .. import servidor as srv

    if not srv.db.activo():
        return jsonify(ok=False, errores=["El perfil no está disponible sin PostgreSQL."]), 400
    ip = request.remote_addr or "local"
    if not srv._comprobar_rate_limit(f"perfil:{ip}"):
        return jsonify(ok=False, errores=["Demasiados intentos seguidos. Espera un minuto."]), 429
    uid = session.get("usuario_id")
    if not uid:
        return jsonify(ok=False, errores=["Tu sesión ha caducado. Inicia sesión de nuevo."]), 401
    datos = request.get_json(silent=True) or {}
    try:
        u = srv.db.actualizar_usuario(
            uid,
            nombre=datos.get("nombre"),
            email=datos.get("email"),
            password_actual=datos.get("passwordActual") or datos.get("password_actual"),
            password_nueva=datos.get("passwordNueva") or datos.get("password_nueva"),
        )
    except srv.db.ErrorUsuario as e:
        return jsonify(ok=False, errores=e.errores), 400
    except Exception:
        logging.exception("Fallo al actualizar el perfil del usuario %s", uid)
        return jsonify(ok=False, errores=["No se ha podido actualizar el perfil en este momento."]), 500
    return jsonify(ok=True, usuario=u)


@auth_bp.post("/api/auth/recuperar")
def auth_recuperar():
    from .. import servidor as srv

    if not srv.db.activo():
        return jsonify(ok=False, errores=["La recuperación de contraseña requiere PostgreSQL activo."]), 400

    ip = request.remote_addr or "local"
    if not srv._comprobar_rate_limit(f"reset-ip:{ip}", srv.MAX_INTENTOS_RESET, srv.VENTANA_RESET_SEGUNDOS):
        return jsonify(ok=False, errores=["Demasiadas solicitudes seguidas. Espera unos minutos."]), 429

    webhook_url, webhook_secret, public_url = _leer_config_n8n(srv)
    if not _url_http_valida(webhook_url):
        return jsonify(
            ok=False,
            errores=[
                "El envío de correo no está configurado todavía. Define CAPITALIA_N8N_WEBHOOK_RESET en el servidor."
            ],
        ), 503

    datos = request.get_json(silent=True) or {}
    email = (datos.get("email") or "").strip().lower()
    if not srv.db.RE_EMAIL.match(email):
        return jsonify(ok=False, errores=["Escribe un correo electrónico válido."]), 400

    if not srv._comprobar_rate_limit(f"reset-mail:{email}", srv.MAX_INTENTOS_RESET, srv.VENTANA_RESET_SEGUNDOS):
        return jsonify(ok=False, errores=["Demasiadas solicitudes para este correo. Espera unos minutos."]), 429

    try:
        info = srv.db.crear_token_recuperacion(email)
    except srv.db.ErrorUsuario as e:
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


@auth_bp.post("/api/auth/restablecer")
def auth_restablecer():
    from .. import servidor as srv

    if not srv.db.activo():
        return jsonify(ok=False, errores=["El restablecimiento requiere PostgreSQL activo."]), 400

    ip = request.remote_addr or "local"
    if not srv._comprobar_rate_limit(f"reset-confirm:{ip}", srv.MAX_INTENTOS_RESET, srv.VENTANA_RESET_SEGUNDOS):
        return jsonify(ok=False, errores=["Demasiados intentos seguidos. Espera unos minutos."]), 429

    datos = request.get_json(silent=True) or {}
    token = datos.get("token")
    clave = datos.get("clave") or datos.get("password")
    try:
        srv.db.restablecer_clave_con_token(token, clave)
    except srv.db.ErrorUsuario as e:
        return jsonify(ok=False, errores=e.errores), 400
    except Exception:
        logging.exception("Error interno al restablecer contraseña")
        return jsonify(ok=False, errores=["No se pudo actualizar la contraseña en este momento."]), 500

    session.clear()
    return jsonify(ok=True, mensaje="Contraseña actualizada correctamente. Ya puedes iniciar sesión.")
