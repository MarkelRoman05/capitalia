# -*- coding: utf-8 -*-
"""Rutas de gestión de cartera, productos, movimientos, valoraciones y copias."""

import datetime as dt
import json
import os
import re

from flask import Blueprint, Response, jsonify, request

cartera_bp = Blueprint("cartera", __name__)


@cartera_bp.get("/api/cartera")
def api_cartera():
    from .. import servidor as srv

    modo_actual, cfg, _, _ = srv.obtener_estado_usuario()
    return jsonify(
        modo=modo_actual,
        cartera=cfg,
        tipos=srv.motor.TIPOS,
        fuentes=srv.motor.FUENTES,
        tiposMovimiento=srv.almacen.TIPOS_MOV,
        ejemplo=True,
    )


@cartera_bp.get("/api/buscar")
def api_buscar():
    from .. import servidor as srv

    n = len(srv.buscar.FALLOS)
    q = (request.args.get("q") or "").strip()[:120]
    tipo = (request.args.get("tipo") or "todos").strip().lower()
    if tipo not in srv.buscar.TIPOS_BUSQUEDA_VALIDOS:
        tipo = "todos"
    res = srv.buscar.buscar(q, tipo=tipo)
    return jsonify(resultados=res, sinConexion=(not res and bool(srv.buscar.hubo_fallos_desde(n))))


@cartera_bp.get("/api/cartera-modelo/<cartera_id>")
def api_cartera_modelo(cartera_id):
    from .. import servidor as srv

    cid = (cartera_id or "").strip().lower()
    if not re.fullmatch(r"[a-z0-9_-]{2,80}", cid):
        return jsonify(ok=False, error="Identificador de cartera inválido."), 400
    detalle = srv.carteras_catalogo.obtener_cartera_enriquecida(cid)
    if not detalle:
        return jsonify(ok=False, error="Cartera no encontrada."), 404
    return jsonify(ok=True, cartera=detalle)


@cartera_bp.get("/api/bancos")
def api_bancos():
    from .. import servidor as srv

    q = (request.args.get("q") or "").strip()
    uid = srv.uid_actual()
    if srv.db.activo():
        datos_db = srv.db.listar_entidades(uid=uid, q=q)
        recientes = datos_db["recientes"]
        entidades = datos_db["entidades"]
    else:
        recientes = []
        entidades = srv.db.listar_entidades_seed(q=q)

    online = []
    if len(q) >= 2:
        vistos_dom = {e["dominio"].lower() for e in entidades if e.get("dominio")}
        vistos_nom = {e["nombre"].lower() for e in entidades if e.get("nombre")}
        for b in srv.buscar.buscar_bancos(q):
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


@cartera_bp.get("/api/bancos/logo")
def api_bancos_logo():
    """Sirve el logo cacheado en disco de un banco/entidad por dominio (sin caducidad 410)."""
    from .. import servidor as srv

    dom = srv.buscar.normalizar_dominio_banco(request.args.get("dominio") or "")
    if not dom:
        return Response(status=400)

    logos_dir = os.path.realpath(os.path.join(srv.DATOS_BASE, "cache", "logos"))
    os.makedirs(logos_dir, exist_ok=True)
    clave = re.sub(r"[^a-z0-9.-]", "_", dom)
    ruta_bin = os.path.realpath(os.path.join(logos_dir, f"{clave}.bin"))
    ruta_ct = os.path.realpath(os.path.join(logos_dir, f"{clave}.ct"))
    if not (ruta_bin.startswith(logos_dir + os.sep) and ruta_ct.startswith(logos_dir + os.sep)):
        return Response(status=400)

    datos = None
    ct = None
    ttl_seg = 30 * 86400
    try:
        if os.path.exists(ruta_bin) and os.path.exists(ruta_ct):
            edad = dt.datetime.now().timestamp() - os.path.getmtime(ruta_bin)
            if edad < ttl_seg:
                with open(ruta_bin, "rb") as fb, open(ruta_ct, "r", encoding="utf-8") as fc:
                    datos = fb.read()
                    ct = fc.read().strip()
    except OSError:
        datos, ct = None, None

    if not datos or not ct:
        datos, ct = srv.buscar.descargar_logo_banco(dom)
        if not datos or not ct:
            return Response(status=404)
        try:
            with open(ruta_bin + ".tmp", "wb") as fb:
                fb.write(datos)
            with open(ruta_ct + ".tmp", "w", encoding="utf-8") as fc:
                fc.write(ct)
            os.replace(ruta_bin + ".tmp", ruta_bin)
            os.replace(ruta_ct + ".tmp", ruta_ct)
        except OSError:
            pass

    resp = Response(datos, mimetype=ct)
    resp.headers["Cache-Control"] = "public, max-age=604800"
    resp.headers["X-Content-Type-Options"] = "nosniff"
    return resp


@cartera_bp.post("/api/bancos/uso")
def api_bancos_uso():
    from .. import servidor as srv

    datos = request.get_json(silent=True) or {}
    nombre = (datos.get("nombre") or "").strip()
    if not nombre:
        return jsonify(ok=False, error="El nombre de la entidad es obligatorio."), 400
    if not srv.db.activo():
        return jsonify(ok=True, entidad={"nombre": nombre})
    ent = srv.db.registrar_entidad(
        nombre=nombre,
        dominio=datos.get("dominio") or "",
        logo=datos.get("logo") or "",
        categoria=datos.get("categoria") or "",
        uid=srv.uid_actual(),
        origen="brandfetch" if datos.get("dominio") else "usuario",
    )
    return jsonify(ok=True, entidad=ent)


@cartera_bp.post("/api/productos/lote")
def api_guardar_productos_lote():
    from .. import servidor as srv

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
                raise srv.almacen.ErrorValidacion(["El identificador del grupo no es válido."])

            peso_raw = item.get("pesoObjetivo")
            peso_val = None
            if peso_raw is not None and peso_raw != "":
                errs_peso = []
                peso_val = srv.almacen.numero(peso_raw, "el peso objetivo", errs_peso, obligatorio=False, minimo=0)
                if errs_peso or (peso_val is not None and peso_val > 100):
                    raise srv.almacen.ErrorValidacion(["El peso objetivo debe estar entre 0 y 100."])
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

            prod, _ = srv.almacen.guarda_producto(cfg, item)
            for k in ("identificador", "codigo"):
                val = (prod.get(k) or "").strip().upper()
                if val:
                    existentes_por_clave[val] = prod
            añadidos += 1

        if añadidos == 0 and vinculados == 0 and omitidos == 0:
            raise srv.almacen.ErrorValidacion(["No se pudo validar ningún producto de la cartera."])
        return {
            "añadidos": añadidos,
            "omitidos": omitidos,
            "vinculados": vinculados,
            "grupoId": grupo_id or None,
            "grupoNombre": grupo_nombre or None,
        }

    return srv.cambia(fn, motivo_copia="Alta de cartera indexada")


@cartera_bp.post("/api/movimientos/lote-cartera")
def api_guardar_movimientos_lote_cartera():
    from .. import servidor as srv

    payload = request.get_json(silent=True) or {}
    lineas = payload.get("lineas")
    reemplazar = bool(payload.get("reemplazarPrevios"))
    nota = srv.almacen.texto(payload.get("nota"), 200) or "Cartera agrupada"
    if not isinstance(lineas, list) or not (1 <= len(lineas) <= 30):
        return jsonify(ok=False, error="Envía entre 1 y 30 líneas de posición."), 400

    errs_fecha = []
    f_iso = srv.almacen.fecha(payload.get("fecha"), errs_fecha)
    if errs_fecha:
        return jsonify(ok=False, error=errs_fecha[0], errores=errs_fecha), 400

    def fn(cfg):
        errs = []
        validas = []
        for idx, raw in enumerate(lineas, start=1):
            if not isinstance(raw, dict):
                continue
            pid = (raw.get("producto") or "").strip()
            imp = srv.almacen.numero(raw.get("importe"), f"el importe de la línea {idx}", errs, obligatorio=False, minimo=0)
            uni = srv.almacen.numero(raw.get("unidades"), f"las participaciones de la línea {idx}", errs, obligatorio=False, minimo=0)
            if errs:
                raise srv.almacen.ErrorValidacion(errs)
            if not (imp and imp > 0) and not (uni and uni > 0):
                continue
            p = srv.almacen.producto(cfg, pid)
            if not p:
                raise srv.almacen.ErrorValidacion([f"Producto desconocido: {pid}"])
            if p.get("tipo") in srv.almacen.SOLO_SALDO:
                raise srv.almacen.ErrorValidacion([f"«{p.get('corto') or p['nombre']}» se valora con saldos manuales."])
            validas.append((p, imp, uni))

        if not validas:
            raise srv.almacen.ErrorValidacion(["Introduce al menos un importe o número de participaciones mayor que 0."])

        carpeta = srv.dir_trabajo_motor()
        preparadas = []
        for p, imp, uni in validas:
            imp_val = round(float(imp), 2) if (imp and imp > 0) else None
            uni_val = round(float(uni), 6) if (uni and uni > 0) else None
            cotiza = p.get("fuente") != "manual" and p.get("codigo")
            if cotiza and (imp_val is None or uni_val is None):
                serie = srv.motor.serie_producto(p, carpeta)
                px = srv.motor.valor_en(serie, f_iso, margen=10) if serie else None
                if not px:
                    info = srv.buscar.probar(p["fuente"], p["codigo"])
                    if info and info.get("precio"):
                        px_raw = float(info["precio"])
                        if p["fuente"] == "yahoo":
                            mon = info.get("moneda") or p.get("moneda") or "EUR"
                            sim, factor = srv.motor.simbolo_fx(mon)
                            if sim:
                                fx_serie = srv.motor.serie_cambio(mon, carpeta)
                                fx_val = srv.motor.valor_en(fx_serie, f_iso, margen=10)
                                px = px_raw * factor * fx_val if fx_val else None
                            else:
                                px = px_raw * factor
                        else:
                            px = px_raw
                if not px or px <= 0:
                    raise srv.almacen.ErrorValidacion([
                        f"No se pudo obtener el precio de «{p.get('corto') or p['nombre']}» para el {srv.almacen.fmt_fecha(f_iso)}. "
                        "Indica también las participaciones manualmente."
                    ])
                if uni_val is None:
                    uni_val = round(imp_val / px, 6)
                elif imp_val is None:
                    imp_val = round(uni_val * px, 2)
            elif not cotiza and imp_val is None:
                raise srv.almacen.ErrorValidacion([
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
            srv.almacen.guarda_movimiento(cfg, {
                "producto": pid,
                "fecha": f_iso,
                "tipo": "compra",
                "unidades": uni_val,
                "importe": imp_val,
                "nota": nota,
            })
            guardados += 1

        return {"guardados": guardados, "reemplazados": reemplazados}

    return srv.cambia(fn, motivo_copia="Importes de cartera agrupada")


@cartera_bp.delete("/api/carteras-grupo/<grupo_id>")
def api_borrar_cartera_grupo(grupo_id):
    from .. import servidor as srv

    gid = (grupo_id or "").strip().lower()
    if not re.fullmatch(r"[a-z0-9_-]{2,80}", gid):
        return jsonify(ok=False, error="Identificador de cartera inválido."), 400

    def fn(cfg):
        pids = [p["id"] for p in (cfg.get("productos") or []) if (p.get("grupoId") or "").lower() == gid]
        if not pids:
            raise srv.almacen.ErrorValidacion(["No se encontró ninguna cartera con ese identificador."])
        for pid in pids:
            srv.almacen.borra_producto(cfg, pid)
        return {"eliminados": len(pids), "grupoId": gid}

    return srv.cambia(fn, motivo_copia="Eliminación de cartera agrupada")


@cartera_bp.post("/api/<coleccion>")
@cartera_bp.put("/api/<coleccion>/<ident>")
def api_guardar(coleccion, ident=None):
    from .. import servidor as srv

    if coleccion not in srv.GUARDAR:
        return jsonify(ok=False, error="Colección desconocida.", errores=["Colección desconocida."]), 404
    datos = request.get_json(silent=True) or {}
    if ident and isinstance(datos, dict):
        datos["id"] = ident

    def fn(cfg):
        if coleccion != "productos":
            return srv.GUARDAR[coleccion](cfg, datos)
        prod, cambio = srv.almacen.guarda_producto(cfg, datos)
        if cambio and prod["fuente"] != "manual" and not srv.buscar.probar(prod["fuente"], prod["codigo"]):
            raise srv.almacen.ErrorValidacion([
                f"No encuentro precio para «{prod['codigo']}» en {srv.motor.FUENTES[prod['fuente']]}. "
                "Revisa el código con el buscador o elige «Valor anotado a mano»."
            ])
        return prod

    return srv.cambia(fn)


@cartera_bp.delete("/api/<coleccion>/<ident>")
def api_borrar(coleccion, ident):
    from .. import servidor as srv

    if coleccion not in srv.BORRAR:
        return jsonify(ok=False, errores=["Colección desconocida."]), 404
    return srv.cambia(lambda cfg: srv.BORRAR[coleccion](cfg, ident))


@cartera_bp.post("/api/repartir-colores")
def api_repartir_colores():
    from .. import servidor as srv

    _, _, calc, _ = srv.obtener_estado_usuario()
    calc = calc or {}
    grandes = [
        p["id"]
        for p in sorted(
            calc.get("productos", []) + calc.get("otrosActivos", []),
            key=lambda p: -(p.get("valor") or 0),
        )
    ]
    return srv.cambia(lambda cfg: srv.almacen.reparte_colores(cfg, grandes))


@cartera_bp.post("/api/objetivo")
def api_objetivo():
    """Actualiza el titular de la cartera, el objetivo de patrimonio y el gasto mensual."""
    from .. import servidor as srv

    datos = request.get_json(silent=True) or {}
    return srv.cambia(lambda cfg: srv.almacen.guarda_objetivo(cfg, datos))


@cartera_bp.post("/api/empezar")
@cartera_bp.post("/api/cargar-ejemplo")
def api_cargar_ejemplo():
    """Carga la cartera de ejemplo o empieza de cero, guardando antes copia en PostgreSQL."""
    from .. import servidor as srv

    datos_req = request.get_json(silent=True) or {}
    desde = datos_req.get("desde", "ejemplo")

    def fn(cfg):
        if desde == "ejemplo":
            ejemplo_cfg = srv.lee_json(srv.DEMO, {}) or json.loads(json.dumps(srv.almacen.CARTERA_VACIA))
            cfg.clear()
            cfg.update(ejemplo_cfg)
            cfg["titular"] = "Mi patrimonio (cartera de ejemplo)"
        else:
            vacia = json.loads(json.dumps(srv.almacen.CARTERA_VACIA))
            cfg.clear()
            cfg.update(vacia)
        return None

    return srv.cambia(fn, motivo_copia="Antes de cargar ejemplo", prefijo_copia="antes_de_ejemplo")


@cartera_bp.post("/api/reiniciar")
def api_reiniciar():
    """Reinicia la cartera a vacía o al ejemplo de práctica, guardando copia en PostgreSQL."""
    from .. import servidor as srv

    a = (request.get_json(silent=True) or {}).get("a", "vacia")

    def fn(cfg):
        if a == "demo" or a == "ejemplo":
            ejemplo_cfg = srv.lee_json(srv.DEMO, {}) or json.loads(json.dumps(srv.almacen.CARTERA_VACIA))
            cfg.clear()
            cfg.update(ejemplo_cfg)
            cfg["titular"] = "Mi patrimonio (cartera de ejemplo)"
        else:
            vacia = json.loads(json.dumps(srv.almacen.CARTERA_VACIA))
            cfg.clear()
            cfg.update(vacia)
        return None

    return srv.cambia(fn, motivo_copia="Antes de empezar de nuevo", prefijo_copia="antes_de_reiniciar")


@cartera_bp.get("/api/copias")
def api_copias():
    from .. import servidor as srv

    uid = srv.uid_actual()
    if uid is not None:
        return jsonify(copias=srv.db.listar_copias(uid))
    return jsonify(copias=[])


@cartera_bp.get("/api/copia/descargar")
def api_copia_descargar():
    from .. import servidor as srv

    _, cfg, _, _ = srv.obtener_estado_usuario()
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


@cartera_bp.post("/api/copia/subir")
def api_copia_subir():
    from .. import servidor as srv

    datos_json = request.get_json(silent=True)
    if datos_json and isinstance(datos_json, dict) and "contenido" in datos_json:
        try:
            cfg_nueva = srv.valida_copia(datos_json["contenido"])
        except srv.almacen.ErrorValidacion as e:
            return jsonify(ok=False, error=e.errores[0], errores=e.errores), 400
    else:
        f = request.files.get("archivo")
        if not f:
            return jsonify(ok=False, error="Elige el archivo .json de la copia de seguridad.", errores=["Elige el archivo .json de la copia de seguridad."]), 400
        try:
            cfg_nueva = srv.valida_copia(json.loads(srv.importar.decodifica(f.read())))
        except ValueError:
            return jsonify(ok=False, error="El archivo no es un JSON válido.", errores=["El archivo no es un JSON válido."]), 400
        except srv.almacen.ErrorValidacion as e:
            return jsonify(ok=False, error=e.errores[0], errores=e.errores), 400

    def fn(cfg):
        cfg.clear()
        cfg.update(cfg_nueva)
        return None

    return srv.cambia(fn, motivo_copia="Antes de recuperar una copia", prefijo_copia="antes_de_recuperar")


@cartera_bp.post("/api/copia/recuperar")
def api_copia_recuperar():
    from .. import servidor as srv

    uid = srv.uid_actual()
    nombre = os.path.basename((request.get_json(silent=True) or {}).get("archivo") or "")
    if not nombre.endswith(".json") or uid is None:
        return jsonify(ok=False, errores=["Esa copia no está disponible."]), 400
    cfg_recuperada = srv.db.obtener_copia(uid, nombre)
    if not cfg_recuperada:
        return jsonify(ok=False, errores=["Esa copia ya no existe en la base de datos."]), 404
    try:
        srv.valida_copia(cfg_recuperada)
    except srv.almacen.ErrorValidacion as e:
        return jsonify(ok=False, errores=e.errores), 400

    def fn(cfg):
        cfg.clear()
        cfg.update(cfg_recuperada)
        return None

    return srv.cambia(fn, motivo_copia="Antes de recuperar una copia", prefijo_copia="antes_de_recuperar")
