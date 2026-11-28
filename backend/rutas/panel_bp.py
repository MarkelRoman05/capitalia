# -*- coding: utf-8 -*-
"""Rutas de lectura del panel, precios en vivo, exportación web y metadatos."""

import json
import logging
import os

from flask import Blueprint, Response, jsonify, request

panel_bp = Blueprint("panel", __name__)


@panel_bp.get("/api/panel")
def api_panel():
    from .. import servidor as srv

    modo_actual, cfg, calc, _ = srv.obtener_estado_usuario()
    if calc is None and (cfg.get("productos") or cfg.get("movimientos") or cfg.get("valoraciones")):
        calc = srv.recalcula(descargar="faltan")
    return jsonify(
        ok=True,
        modo=modo_actual,
        datos=calc,
        cartera=cfg,
        tipos=srv.motor.TIPOS,
        fuentes=srv.motor.FUENTES,
        tiposMovimiento=srv.almacen.TIPOS_MOV,
        ejemplo=True,
    )


@panel_bp.get("/datos.js")
def datos_js():
    from .. import servidor as srv

    _, cfg, calc, _ = srv.obtener_estado_usuario()
    if calc is None and (cfg.get("productos") or cfg.get("movimientos") or cfg.get("valoraciones")):
        calc = srv.recalcula(descargar="faltan")
    cuerpo = "window.DATOS = " + json.dumps(calc, ensure_ascii=False, separators=(",", ":")) + ";\n"
    return Response(cuerpo, mimetype="application/javascript", headers={"Cache-Control": "no-store"})


@panel_bp.post("/api/actualizar")
def api_actualizar():
    from .. import servidor as srv

    try:
        datos = srv.recalcula(descargar=True)
    except Exception as e:
        logging.exception("Fallo al actualizar precios")
        return jsonify(ok=False, error=f"No he podido actualizar los precios: {e}", errores=[f"No he podido actualizar los precios: {e}"]), 500
    _, cfg, _, _ = srv.obtener_estado_usuario()
    return jsonify(ok=True, datos=datos, panel=datos, cartera=cfg, avisos=(datos or {}).get("avisos", []))


@panel_bp.get("/api/precios-vivo")
def api_precios_vivo():
    from .. import servidor as srv

    _, cfg, _, _ = srv.obtener_estado_usuario()
    try:
        precios = srv.motor.obtener_precios_vivo(cfg.get("productos", []))
    except Exception:
        logging.exception("Fallo al obtener precios en tiempo real")
        precios = {}
    return jsonify(
        ok=True,
        actualizado=srv._ahora_iso_utc(),
        precios=precios,
    )


@panel_bp.get("/api/exportar-web")
def api_exportar_web():
    from .. import servidor as srv

    _, cfg, calc, _ = srv.obtener_estado_usuario()
    if calc is None and (cfg.get("productos") or cfg.get("movimientos") or cfg.get("valoraciones")):
        calc = srv.recalcula(descargar="faltan")
    if not calc:
        return jsonify(ok=False, errores=["Todavía no hay datos calculados en el panel para exportar."]), 400
    ocultar = request.args.get("ocultar") == "1"
    html = srv.exportar.pagina(srv.PLANTILLA_WEB, calc, ocultar=ocultar, titulo=calc.get("titular") or "Mi patrimonio")
    nombre = "capitalia_sin_importes.html" if ocultar else "capitalia_patrimonio.html"
    return Response(
        html.encode("utf-8"),
        mimetype="text/html",
        headers={
            "Content-Disposition": f'attachment; filename="{nombre}"',
            "X-Content-Type-Options": "nosniff",
        },
    )


@panel_bp.get("/api/version")
def api_version():
    from .. import servidor as srv

    with open(os.path.join(srv.RAIZ, "backend", "VERSION"), encoding="utf-8") as f:
        actual = f.read().strip()
    return jsonify(actual=actual, ultima=actual, hayNueva=False, app="Capitalia")


@panel_bp.get("/api/ping")
def api_ping():
    return jsonify(app="capitalia", ok=True)
