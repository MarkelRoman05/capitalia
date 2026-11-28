# -*- coding: utf-8 -*-
"""Rutas de importación de archivos/tablas y descarga de plantillas."""

import os
import secrets

from flask import Blueprint, Response, jsonify, request

importar_bp = Blueprint("importar", __name__)


@importar_bp.post("/api/importar/previsualizar")
def api_importar_previsualizar():
    import base64 as b64
    from .. import servidor as srv

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

    uid_lock = srv.uid_actual()
    carpeta_motor = srv.dir_trabajo_motor()
    with srv._obtener_cerrojo(uid_lock):
        _, cfg, _, _ = srv.obtener_estado_usuario()
        if origen == "myinvestor":
            if not archivos:
                return jsonify(ok=False, error="Elige los archivos CSV descargados de MyInvestor.", errores=["Elige los archivos CSV descargados de MyInvestor."]), 400
            plan = srv.importar.preparar_myinvestor(cfg, archivos, carpeta_motor, producto_por_defecto)
        else:
            if not archivos and not texto:
                return jsonify(ok=False, error="Elige un archivo o pega el texto generado por la IA.", errores=["Elige un archivo o pega el texto generado por la IA."]), 400
            filas = []
            for nombre, contenido in archivos or [("pegado.csv", texto)]:
                leidas, error = srv.importar.leer_tabla(nombre, contenido)
                if error:
                    return jsonify(ok=False, error=f"{nombre}: {error}", errores=[f"{nombre}: {error}" if archivos else error]), 400
                filas += leidas
            plan = srv.importar.preparar_tabla(cfg, filas, carpeta_motor)
        informe = srv.importar.vista_previa(cfg, plan)
    token = secrets.token_hex(12)
    uid = uid_lock or 0
    for k in [k for k in srv.PLANES if k[0] == uid]:
        srv.PLANES.pop(k, None)
    srv.PLANES[(uid, token)] = plan
    srv.PLANES[(uid, "ultimo")] = plan
    return jsonify(ok=True, token=token, informe=informe)


@importar_bp.post("/api/importar/confirmar")
def api_importar_confirmar():
    from .. import servidor as srv

    uid = srv.uid_actual() or 0
    token = (request.get_json(silent=True) or {}).get("token")
    plan = srv.PLANES.pop((uid, token), None) if token else srv.PLANES.pop((uid, "ultimo"), None)
    if plan is None:
        return jsonify(ok=False, error="La vista previa ha caducado: vuelve a revisar el archivo.", errores=["La vista previa ha caducado: vuelve a revisar el archivo."]), 400
    informe = {}

    def fn(cfg):
        informe.update(srv.importar.aplicar(cfg, plan))
        return None

    respuesta = srv.cambia(fn, motivo_copia="Antes de importar", prefijo_copia="auto")
    if isinstance(respuesta, tuple):
        return respuesta
    datos = respuesta.get_json()
    datos["informe"] = {k: informe[k] for k in ("añadidos", "repetidos", "saldos", "sustituidos")}
    return jsonify(datos)


@importar_bp.get("/api/plantilla.xlsx")
def api_plantilla_xlsx():
    from .. import servidor as srv

    return Response(
        srv.plantilla.excel(),
        headers={
            "Content-Disposition": 'attachment; filename="plantilla_capitalia.xlsx"',
            "X-Content-Type-Options": "nosniff",
        },
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


@importar_bp.get("/api/plantilla.csv")
def api_plantilla_csv():
    from .. import servidor as srv

    return Response(
        srv.plantilla.csv_vacio(),
        mimetype="text/csv",
        headers={
            "Content-Disposition": 'attachment; filename="plantilla_capitalia.csv"',
            "X-Content-Type-Options": "nosniff",
        },
    )


@importar_bp.get("/api/prompt")
def api_prompt():
    from .. import servidor as srv

    with open(os.path.join(srv.RAIZ, "backend", "prompt_ia.txt"), encoding="utf-8") as f:
        txt = f.read()
        return jsonify(texto=txt, prompt=txt)
