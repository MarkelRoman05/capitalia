#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
motor.py  ·  Orquestador del dashboard de patrimonio
====================================================
Coordina la obtención de cotizaciones (`fuentes.py`) con la matemática
financiera pura (`calculos.py`) y construye el diccionario `datos` del panel.
Re-exporta todos los símbolos públicos para 100 % retrocompatibilidad.
"""

import datetime as dt
import json
import os
import sys
from collections import defaultdict

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

from . import calculos, fuentes
from .calculos import (
    CLASE_DEFECTO,
    ESCENARIOS_ESTRES,
    ETIQUETAS,
    ORDEN_TIPO,
    PALETA,
    REFERENCIAS,
    TIPOS,
    TRAMOS_IRPF_AHORRO,
    _clasificar_estres,
    _es_monetario,
    _estado_fifo_vacio,
    _norm_clave,
    _pais_a_divisa,
    calcular_desglose_fx,
    calcular_dividendos,
    calcular_especializados,
    calcular_estres,
    calcular_fiscalidad,
    calcular_irpf_ahorro,
    calcular_salud,
    calcular_xray,
    d,
    hoy,
    impacto_ter_compuesto,
    indice_ponderado,
    indice_twr,
    metricas_indice,
    num_es,
    r2,
    r4,
    rango_fechas,
    xirr,
)
from .fuentes import (
    AVISOS,
    CACHE,
    FUENTES,
    SIN_RED,
    SOLO_FALTAN,
    UA,
    _COTIZACIONES,
    a_euros,
    aviso,
    clave_serie,
    combinar_vl,
    descarga_series,
    descargar_coingecko,
    descargar_morningstar,
    descargar_serie,
    en_euros,
    fecha_en,
    guarda_cache,
    lee_cache,
    mover_fin_de_semana,
    obtener_precios_vivo,
    precio_eur,
    precio_yahoo_vivo,
    precios_coingecko_vivo,
    rellenar,
    serie_cambio,
    serie_producto,
    simbolo_fx,
    valor_en,
)


def procesar_fifo_cartera(productos_cfg, movimientos):
    return calculos.procesar_fifo_cartera(productos_cfg, movimientos, aviso_fn=aviso)


def aplicar_movimientos(p, movs):
    return calculos.aplicar_movimientos(p, movs, aviso_fn=aviso)


# ---------------------------------------------------------------- construccion

def construir(cfg, carpeta, descargar=True):
    """
    Calcula todo lo que pinta el panel a partir de la cartera (productos, movimientos
    y valoraciones) y devuelve el diccionario DATOS. Con descargar=False no sale a
    internet: recalcula con los precios guardados en la caché. Con descargar="faltan"
    solo descarga los precios de productos nuevos.
    """
    global CACHE, SIN_RED, SOLO_FALTAN
    cache_dir = os.path.join(carpeta, "cache")
    CACHE = cache_dir
    SIN_RED = not descargar
    SOLO_FALTAN = descargar == "faltan"
    fuentes.configurar_entorno(cache_dir, sin_red=SIN_RED, solo_faltan=SOLO_FALTAN, limpiar=True)

    productos_cfg = [dict(p) for p in cfg.get("productos", [])]
    for p in productos_cfg:
        p.setdefault("fuente", "manual")
        p.setdefault("corto", (p.get("nombre") or p["id"])[:24])

    print("\n=== 1. Precios ===" if descargar is True else "\n=== 1. Precios guardados ===")
    series = descarga_series(productos_cfg)
    if cfg.get("movimientos"):
        for sim in {s for r in REFERENCIAS.values() for s, _ in r["piezas"]}:
            if sim not in series:
                series[sim] = descargar_serie(sim)

    movs_por, fechas_mov_por, vals_por = defaultdict(list), defaultdict(list), defaultdict(list)
    for m in cfg.get("movimientos", []):
        movs_por[m.get("producto")].append(m)
        fechas_mov_por[m.get("producto")].append(m["fecha"])
        if m.get("tipo") == "traspaso" and m.get("productoDestino"):
            fechas_mov_por[m["productoDestino"]].append(m["fecha"])
    for v in cfg.get("valoraciones", []):
        vals_por[v.get("producto")].append(v)

    ultimas = [v["fecha"] for v in cfg.get("valoraciones", [])]
    for p in productos_cfg:
        s = precio_eur(p, series) if p["fuente"] != "manual" else {}
        if s and fechas_mov_por.get(p["id"]):
            ultimas.append(max(s))
    fecha_extracto = min(d(max(ultimas)), hoy()) if ultimas else hoy()
    print(f"  Datos valorados a {fecha_extracto}")

    fifo_cartera = procesar_fifo_cartera(productos_cfg, cfg.get("movimientos", []))

    # ---- primera pasada: movimientos, precio actual y fechas ----
    productos, otros, pasivos, primera = [], [], [], None

    for p in productos_cfg:
        clave = p.get("tipo") if p.get("tipo") in TIPOS else "otro"
        p["tipoClave"] = clave
        p["tipo"] = p.get("tipoDetalle") or TIPOS[clave]
        p.setdefault("clase", CLASE_DEFECTO[clave])
        p["fuentePrecio"] = FUENTES.get(p["fuente"], p["fuente"])
        etq = ETIQUETAS.get(clave, ("Precio", "Unidades", "El precio"))
        if "ETP" in (p.get("tipoDetalle") or "").upper():
            etq = ("Precio del ETP", "Títulos", "El precio del ETP")
        p["etqPrecio"], p["etqUnidades"], p["etqVentanas"] = etq
        p["fuenteTexto"] = " · ".join(
            x
            for x in (
                p["fuentePrecio"],
                p.get("codigo"),
                f"convertido de {p.get('moneda')}"
                if p["fuente"] == "yahoo" and (p.get("moneda") or "EUR").upper() != "EUR"
                else None,
            )
            if x
        )
        p["aportaciones"] = []
        movs = movs_por.get(p["id"], [])
        snaps = [
            [v["fecha"], float(v["valor"]), v.get("aportado")]
            for v in sorted(vals_por.get(p["id"], []), key=lambda v: v["fecha"])
        ]
        fechas_p = fechas_mov_por.get(p["id"], []) + [s[0] for s in snaps]

        if clave in ("efectivo", "deuda"):
            if not snaps:
                aviso(f"{p['corto']}: todavía no tiene ningún saldo anotado.")
                continue
            p["snapshots"] = snaps
            (otros if clave == "efectivo" else pasivos).append(p)
            primera = d(snaps[0][0]) if primera is None else min(primera, d(snaps[0][0]))
            continue

        mv = fifo_cartera["por_producto"].get(p["id"], _estado_fifo_vacio())
        p["realizado"] = round(mv["realizado"], 2)
        p["_mv"] = mv
        cotiza = p["fuente"] != "manual"
        serie = precio_eur(p, series) if cotiza else {}
        if cotiza and not serie:
            if snaps:
                aviso(
                    f"{p['corto']}: no encuentro su precio en {p['fuentePrecio']}; "
                    "uso los valores que has anotado a mano."
                )
                cotiza = False
            else:
                aviso(
                    f"{p['corto']}: no encuentro su precio en {p['fuentePrecio']}. "
                    "Comprueba el identificador o mete su valor a mano."
                )
                continue

        if cotiza:
            if not mv["eventos"]:
                aviso(f"{p['corto']}: no tiene compras anotadas, lo dejo fuera.")
                continue
            p["origen"] = "csv" if clave in ("fondo", "pension") else "ordenes"
            nav_hoy = valor_en(serie, fecha_extracto, margen=3650) or 0.0
            p["nav"] = nav_hoy
            p["navFecha"] = fecha_en(serie, fecha_extracto, 3650)
            if p["navFecha"] and (fecha_extracto - d(p["navFecha"])).days > 7:
                aviso(f"{p['corto']}: el último precio que tengo es del {p['navFecha']}.")
            for m in sorted(movs, key=lambda x: x["fecha"]):
                if m.get("tipo") != "compra":
                    continue
                u, imp = float(m.get("unidades") or 0), float(m.get("importe") or 0)
                com = float(m.get("comision") or 0)
                p["aportaciones"].append({
                    "fecha": m["fecha"],
                    "importe": round(imp, 2),
                    "participaciones": round(u, 6),
                    "precio": r4((imp - com) / u) if u else None,
                    "comision": com,
                    "tipoOrden": m.get("nota") or None,
                    "valor": None if id(m) in mv["vendidas"] else round(u * nav_hoy, 2),
                })
        else:
            p["origen"] = "manual"
            if not snaps:
                aviso(f"{p['corto']}: todavía no tiene ningún valor anotado.")
                continue
            p["snapshots"] = snaps
            for m in movs:
                if m.get("tipo") == "compra":
                    p["aportaciones"].append({"fecha": m["fecha"], "importe": round(float(m.get("importe") or 0), 2)})

        pf = d(min(fechas_p))
        primera = pf if primera is None else min(primera, pf)
        productos.append(p)

    if not (productos or otros or pasivos):
        print("\nLa cartera está vacía: todavía no hay nada que calcular.")
        return None

    if primera is None or primera > fecha_extracto:
        primera = fecha_extracto
    eje = rango_fechas(primera, fecha_extracto)
    eje_iso = [f.isoformat() for f in eje]
    n = len(eje)
    print(f"\n=== 2. Serie diaria: {eje_iso[0]} -> {eje_iso[-1]} ({n} dias) ===")

    # ---- segunda pasada: series de valor diarias ----
    for p in productos:
        origen = p.get("origen", "manual")
        p["slotColor"] = PALETA.get(p.get("slot", 1), PALETA[1])

        if origen in ("csv", "ordenes"):
            nav_diario = rellenar(precio_eur(p, series), eje)
            part_acum, ap_acum = [0.0] * n, [0.0] * n
            idx = {f: i for i, f in enumerate(eje_iso)}
            for f, du, dap in p["_mv"]["eventos"]:
                i = idx.get(f)
                if i is None:
                    i = 0 if f < eje_iso[0] else n - 1
                part_acum[i] += du
                ap_acum[i] += dap
            for i in range(1, n):
                part_acum[i] += part_acum[i - 1]
                ap_acum[i] += ap_acum[i - 1]

            ultimo = None
            serie_valor = []
            for i in range(n):
                nv = nav_diario[i] or ultimo
                ultimo = nv or ultimo
                serie_valor.append(round(part_acum[i] * nv, 2) if nv else None)

            i0 = next((i for i, v in enumerate(part_acum) if v > 1e-9), 0)
            serie_ap = [round(x, 2) for x in ap_acum]
            for i in range(i0):
                serie_valor[i] = None
                serie_ap[i] = None
            p["serie"] = serie_valor
            p["serieAportado"] = serie_ap
            p["navSerie"] = [r4(v) for v in nav_diario]
            p["participaciones"] = round(part_acum[-1], 6)
            p["valor"] = serie_valor[-1] or 0.0
            p["aportado"] = round(ap_acum[-1], 2)
            p["desde"] = min(e[0] for e in p["_mv"]["eventos"])
            if origen == "ordenes":
                p["titulos"] = round(part_acum[-1], 4)
                p["precioMedio"] = r4(p["aportado"] / part_acum[-1]) if part_acum[-1] else None
                p["precioActual"] = r4(p["nav"])
        else:
            snaps = [(d(s[0]), float(s[1]), (s[2] if len(s) > 2 else None)) for s in p["snapshots"]]
            serie, serie_ap = [], []
            for f in eje:
                if f < snaps[0][0]:
                    serie.append(None)
                    serie_ap.append(None)
                    continue
                v = ap = None
                for j in range(len(snaps)):
                    if j == len(snaps) - 1 or f <= snaps[j + 1][0]:
                        if j == len(snaps) - 1 or f == snaps[j][0]:
                            v, ap = snaps[j][1], snaps[j][2]
                        else:
                            f0, v0, a0 = snaps[j]
                            f1, v1, a1 = snaps[j + 1]
                            t = (f - f0).days / max((f1 - f0).days, 1)
                            v = v0 + (v1 - v0) * t
                            ap = (a0 + (a1 - a0) * t) if (a0 is not None and a1 is not None) else a0
                        break
                serie.append(r2(v))
                serie_ap.append(r2(ap))
            p["serie"] = serie
            p["serieAportado"] = serie_ap
            p["navSerie"] = None
            p["valor"] = snaps[-1][1]
            p["aportado"] = snaps[-1][2]
            p["desde"] = snaps[0][0].isoformat()
            eventos = p["_mv"]["eventos"]
            if eventos:
                acum, serie_ap = 0.0, []
                pend = sorted(eventos)
                for f in eje_iso:
                    while pend and pend[0][0] <= f:
                        acum += pend.pop(0)[2]
                    serie_ap.append(r2(acum))
                p["serieAportado"] = serie_ap
                p["aportado"] = round(acum + sum(e[2] for e in pend), 2)
                p["desde"] = min(p["desde"], min(e[0] for e in eventos))
            for f, v, _ in snaps:
                p["aportaciones"].append({"fecha": f.isoformat(), "importe": None, "valor": v, "tipo": "snapshot"})

    # ---- métricas por producto ----
    print("\n=== 4. Metricas ===")
    flujos_globales, valor_conocido, valor_tir = [], 0.0, 0.0

    for p in productos:
        val, ap = p.get("valor") or 0.0, p.get("aportado")
        p["valor"] = round(val, 2)
        flujos = [(d(f), v) for f, v in p["_mv"]["flujos"]]
        flujos_ext = [(d(f), v) for f, v in p["_mv"].get("flujos_externos", p["_mv"]["flujos"])]
        p["flujos"] = [[f, round(v, 2)] for f, v in p["_mv"]["flujos"]]
        if flujos_ext:
            flujos_globales.extend(flujos_ext)
        if flujos:
            valor_tir += val
        if ap is not None and ap > 0:
            p["aportado"] = round(ap, 2)
            p["plusvalia"] = round(val - ap, 2)
            p["rentabilidad"] = r4((val - ap) / ap)
            p["tir"] = r4(xirr(flujos + [(fecha_extracto, val)])) if flujos else None
            valor_conocido += val
            sim_fx, _ = simbolo_fx(p.get("moneda"))
            if sim_fx and p.get("nav"):
                fx_s = series.get(sim_fx) or {}
                lotes_p = fifo_cartera["lotes"].get(p["id"]) or []
                desg = calcular_desglose_fx(p.get("moneda"), p.get("nav"), lotes_p, fx_s, fecha_extracto)
                if desg:
                    p["desgloseFx"] = desg
        else:
            p["aportado"] = None
            p["plusvalia"] = None
            p["rentabilidad"] = None
            p["tir"] = None

        if p.get("navSerie"):
            nav = p["navSerie"]
            ventanas = {"1m": 30, "3m": 91, "6m": 182, "1a": 365}
            p["ventanas"] = {}
            ult = next((v for v in reversed(nav) if v), None)
            for k, dias in ventanas.items():
                i = n - 1 - dias
                base = next((nav[j] for j in range(max(i, 0), n) if nav[j]), None) if i >= 0 else None
                p["ventanas"][k] = r4(ult / base - 1) if (base and ult) else None
            ini_ano = f"{fecha_extracto.year}-01-01"
            iy = next((i for i, f in enumerate(eje_iso) if f >= ini_ano), None)
            base = next((nav[j] for j in range(iy, n) if nav[j]), None) if iy is not None else None
            p["ventanas"]["ytd"] = r4(ult / base - 1) if (base and ult) else None

        etq = p["corto"]
        rr = f"{p['rentabilidad']*100:+6.2f}%" if p.get("rentabilidad") is not None else "    n/d"
        tt = f"{p['tir']*100:+6.2f}%" if p.get("tir") is not None else "    n/d"
        print(f"  {etq:22s} valor {p['valor']:10,.2f}  aportado {(p['aportado'] or 0):10,.2f}  rent {rr}  TIR {tt}")

    # ---- totales ----
    def suma_manual(lista, signo):
        total = 0.0
        series_extra = []
        for it in lista:
            snaps = sorted(it.get("snapshots", []), key=lambda s: s[0])
            if not snaps:
                continue
            total += signo * float(snaps[-1][1])
            serie = []
            for f in eje:
                v = None
                for j in range(len(snaps)):
                    if f >= d(snaps[j][0]):
                        v = float(snaps[j][1])
                serie.append(r2(signo * v) if v is not None else None)
            series_extra.append({
                **it,
                "serie": serie,
                "serieAportado": [None] * len(eje),
                "aportaciones": [],
                "valor": round(signo * float(snaps[-1][1]), 2),
                "aportado": None,
                "plusvalia": None,
                "rentabilidad": None,
                "tir": None,
                "desde": snaps[0][0],
                "slotColor": PALETA.get(it.get("slot", 8), PALETA[8]),
            })
        return total, series_extra

    tot_otros, ser_otros = suma_manual(otros, 1)
    tot_pasivos, ser_pasivos = suma_manual(pasivos, -1)

    serie_total, serie_ap_total = [], []
    for i in range(n):
        s = sum((p["serie"][i] or 0) for p in productos)
        for e in ser_otros + ser_pasivos:
            s += e["serie"][i] or 0
        serie_total.append(round(s, 2))
        serie_ap_total.append(round(sum((p["serieAportado"][i] or 0) for p in productos), 2))

    patrimonio = round(serie_total[-1], 2)
    aportado_total = round(sum(p["aportado"] or 0 for p in productos), 2)
    plusvalia_total = round(valor_conocido - aportado_total, 2)
    flujos_globales.append((fecha_extracto, valor_tir))
    tir_total = r4(xirr(flujos_globales))
    realizado_total = round(sum(p.get("realizado") or 0 for p in productos), 2)

    for p in productos + ser_otros + ser_pasivos:
        p["peso"] = r4(p["valor"] / patrimonio) if patrimonio else 0

    def agrupar(campo):
        acc = defaultdict(float)
        slot = {}
        for p in productos + ser_otros:
            k = p.get(campo) or "Otros"
            acc[k] += p["valor"]
            slot.setdefault(k, p.get("slot", 8))
        return [
            {
                "nombre": k,
                "valor": round(v, 2),
                "peso": r4(v / patrimonio) if patrimonio else 0,
                "color": PALETA.get(slot[k], PALETA[8]),
            }
            for k, v in sorted(acc.items(), key=lambda x: -x[1])
        ]

    meses = sorted({a["fecha"][:7] for p in productos for a in p["aportaciones"] if a.get("importe")})
    por_producto = {}
    for p in productos:
        acc = defaultdict(float)
        for a in p["aportaciones"]:
            if a.get("importe"):
                acc[a["fecha"][:7]] += a["importe"]
        por_producto[p["id"]] = [round(acc.get(m, 0), 2) for m in meses]
    total_mes = [round(sum(por_producto[p["id"]][i] for p in productos), 2) for i in range(len(meses))]

    hitos = [
        {"importe": h, "fecha": eje_iso[idx] if (idx := next((i for i, v in enumerate(serie_total) if v >= h), None)) is not None else None}
        for h in cfg.get("hitos", [])
    ]

    racha = 0
    if meses:
        ref = dt.date(int(meses[-1][:4]), int(meses[-1][5:7]), 1)
        vistos = set(meses)
        while f"{ref.year:04d}-{ref.month:02d}" in vistos:
            racha += 1
            ref = (ref.replace(day=1) - dt.timedelta(days=1)).replace(day=1)
    ult12 = total_mes[-12:] if len(total_mes) >= 12 else total_mes
    ritmo = round(sum(ult12) / max(len(ult12), 1), 2)

    # ---- analítica ampliada ----
    todos_p = productos + ser_otros + ser_pasivos
    inv = [p for p in productos if p.get("origen") in ("csv", "ordenes")]
    idx_fecha = {f: i for i, f in enumerate(eje_iso)}

    for p in productos:
        imp = sorted(x["importe"] for x in p["aportaciones"] if x.get("importe"))
        if not imp:
            continue
        q1 = imp[len(imp) // 3] if len(imp) >= 6 else None
        q2 = imp[2 * len(imp) // 3] if len(imp) >= 6 else None
        p["tramos"] = {
            "p33": r2(q1),
            "p67": r2(q2),
            "min": r2(imp[0]),
            "max": r2(imp[-1]),
            "mediana": r2(imp[len(imp) // 2]),
            "n": len(imp),
        }
        for x in p["aportaciones"]:
            if x.get("importe") is None:
                continue
            x["nivel"] = 1 if q1 is None else (0 if x["importe"] < q1 else (2 if x["importe"] > q2 else 1))
        if p.get("origen") == "csv" and p.get("participaciones"):
            p["precioMedio"] = r4(p["aportado"] / p["participaciones"])

    lineas_com, base_com = [], 0.0
    for p in productos:
        if p.get("ter") and p.get("valor"):
            lineas_com.append({
                "id": p["id"],
                "nombre": p["corto"],
                "ter": p["ter"],
                "valor": p["valor"],
                "anual": r2(p["valor"] * p["ter"]),
                "impacto10a": r2(impacto_ter_compuesto(p["valor"], p["ter"], 10)),
                "impacto20a": r2(impacto_ter_compuesto(p["valor"], p["ter"], 20)),
                "color": p["slotColor"],
            })
            base_com += p["valor"]
    total_com = round(sum(c["anual"] for c in lineas_com), 2)
    comisiones = {
        "lineas": lineas_com,
        "anual": total_com,
        "impacto10a": r2(sum(c["impacto10a"] for c in lineas_com)),
        "impacto20a": r2(sum(c["impacto20a"] for c in lineas_com)),
        "tasaReferencia": 0.07,
        "base": round(base_com, 2),
        "terPonderado": r4(total_com / base_com) if base_com else None,
        "compraventaPagada": round(sum(p["_mv"]["comisiones"] for p in productos), 2),
    }

    flujo_dia = [0.0] * n
    flujo_prod = {p["id"]: [0.0] * n for p in productos}
    flujo_inv = [0.0] * n
    ids_inv = {p["id"] for p in inv}
    for p in productos:
        for f, v in p["_mv"]["flujos"]:
            i = idx_fecha.get(f)
            if i is not None:
                flujo_prod[p["id"]][i] -= v
        for f, v in p["_mv"].get("flujos_externos", p["_mv"]["flujos"]):
            i = idx_fecha.get(f)
            if i is not None:
                flujo_dia[i] -= v
                if p["id"] in ids_inv:
                    flujo_inv[i] -= v

    serie_inv = [0.0] * n
    for p in inv:
        for i in range(n):
            v = p["serie"][i]
            if v is not None:
                serie_inv[i] += v

    idx_cartera = indice_twr(serie_inv, flujo_inv)

    usar_twr_dd = bool(inv) and any((v or 0) > 0 for v in idx_cartera)
    curva_dd = idx_cartera if usar_twr_dd else serie_total
    pico, dd_max, dd_fecha, serie_dd = 0.0, 0.0, None, []
    for i, val in enumerate(curva_dd):
        v = val if val is not None else 0.0
        if v > pico:
            pico = v
        caida = r4(v / pico - 1) if pico > 0 else 0.0
        if caida == 0:
            caida = 0.0
        serie_dd.append(caida)
        if caida < dd_max:
            dd_max, dd_fecha = caida, eje_iso[i]

    def indice_pesos(pesos):
        navs, ws = [], []
        for pid, peso in pesos.items():
            p = next((x for x in productos if x["id"] == pid), None)
            if not p or not p.get("navSerie"):
                return None
            navs.append(p["navSerie"])
            ws.append(peso)
        return indice_ponderado(navs, ws, n)

    sin_riesgo = next((p["id"] for p in productos if p.get("navSerie") and _es_monetario(p)), None)
    idx_mon = indice_pesos({sin_riesgo: 1}) if sin_riesgo else None
    m_mon = metricas_indice(idx_mon, eje_iso) if idx_mon else None
    rf = m_mon["cagr"] if m_mon else None

    piezas_mundo = REFERENCIAS["mundo"]["piezas"]
    idx_world = indice_ponderado(
        [rellenar(series.get(sim, {}), eje) for sim, _ in piezas_mundo],
        [peso for _, peso in piezas_mundo],
        n,
    )

    comparador = []
    comparador_cfg = list(cfg.get("comparador") or [])
    if inv and not any(c.get("real") for c in comparador_cfg):
        comparador_cfg.insert(0, {"id": "real", "nombre": "Mi cartera real", "real": True})
    for c in comparador_cfg:
        idx_c = idx_cartera if c.get("real") else indice_pesos(c.get("pesos", {}))
        if not idx_c:
            aviso("Comparador: no puedo construir '%s'." % c.get("nombre"))
            continue
        met = metricas_indice(idx_c, eje_iso, rf, idx_bench=idx_world)
        if not met:
            continue
        comparador.append({
            "id": c["id"],
            "nombre": c["nombre"],
            "real": bool(c.get("real")),
            "pesos": c.get("pesos"),
            "indice": [r2(v) for v in idx_c],
            "metricas": met,
        })

    idx_prod = {p["id"]: indice_twr(p["serie"], flujo_prod[p["id"]]) for p in inv}
    anos_nat = sorted({f[:4] for f in eje_iso})
    rent_anual = {
        "anos": anos_nat,
        "cartera": [],
        "parcial": [],
        "porProducto": {p["id"]: [] for p in inv},
        "desde": {p["id"]: [] for p in inv},
    }
    primer_dia = {p["id"]: next((i for i, v in enumerate(p["serie"]) if v is not None), None) for p in inv}
    for ano in anos_nat:
        ini = next(i for i, f in enumerate(eje_iso) if f[:4] == ano)
        fin = max(i for i, f in enumerate(eje_iso) if f[:4] == ano)
        base_ano = ini - 1 if ini > 0 else None
        b = idx_cartera[base_ano] if base_ano is not None else 100.0
        rent_anual["cartera"].append(r4(idx_cartera[fin] / b - 1) if b else None)
        rent_anual["parcial"].append(ano in (anos_nat[0], anos_nat[-1]))
        for p in inv:
            i0 = primer_dia[p["id"]]
            if i0 is None or i0 > fin:
                rent_anual["porProducto"][p["id"]].append(None)
                rent_anual["desde"][p["id"]].append(None)
                continue
            ix = idx_prod[p["id"]]
            empieza_aqui = base_ano is None or i0 > base_ano
            bb = 100.0 if empieza_aqui else ix[base_ano]
            rent_anual["porProducto"][p["id"]].append(r4(ix[fin] / bb - 1))
            rent_anual["desde"][p["id"]].append(eje_iso[i0] if empieza_aqui else None)

    meses_nat = sorted({f[:7] for f in eje_iso})
    resumen_mensual = []
    for mes in meses_nat:
        idxs = [i for i, f in enumerate(eje_iso) if f[:7] == mes]
        i_ini, i_fin, ant = idxs[0], idxs[-1], idxs[0] - 1
        v0 = sum((p["serie"][ant] or 0) for p in todos_p) if ant >= 0 else 0.0
        v1 = sum((p["serie"][i_fin] or 0) for p in todos_p)
        ap = sum(flujo_dia[i] for i in idxs)
        nuevos, detalle = 0.0, {}
        for p in todos_p:
            s = p["serie"]
            pv0 = (s[ant] or 0) if ant >= 0 else 0.0
            pv1 = s[i_fin] or 0.0
            pap = sum(flujo_prod.get(p["id"], [0.0] * n)[i] for i in idxs)
            estrena = (ant < 0 or s[ant] is None) and s[i_fin] is not None
            sin_coste = p.get("aportado") is None and not (p.get("_mv") or {}).get("eventos")
            pnuevo = pv1 if (estrena and sin_coste) else 0.0
            nuevos += pnuevo
            if pv1 or pv0 or pap:
                detalle[p["id"]] = {
                    "inicio": r2(pv0),
                    "fin": r2(pv1),
                    "aportado": r2(pap),
                    "nuevo": r2(pnuevo),
                    "mercado": r2(pv1 - pv0 - pap - pnuevo),
                }
        b = idx_cartera[ant] if ant >= 0 else idx_cartera[i_ini]
        resumen_mensual.append({
            "mes": mes,
            "inicio": r2(v0),
            "fin": r2(v1),
            "aportado": r2(ap),
            "nuevo": r2(nuevos),
            "mercado": r2(v1 - v0 - ap - nuevos),
            "rentabilidad": r4(idx_cartera[i_fin] / b - 1) if b else None,
            "porProducto": detalle,
        })

    rent_mes_mapa = {r["mes"]: r.get("rentabilidad") for r in resumen_mensual}
    rent_ano_mapa = dict(zip(rent_anual["anos"], rent_anual["cartera"]))
    heatmap_mensual = [
        {"ano": ano, "meses": [rent_mes_mapa.get(f"{ano}-{m:02d}") for m in range(1, 13)], "total": rent_ano_mapa.get(ano)}
        for ano in anos_nat
    ]

    dispersion_activos = []
    for p in inv:
        if not p.get("navSerie") or (p.get("valor") or 0) <= 0:
            continue
        i0_p = primer_dia.get(p["id"])
        idx_p = [v if (i0_p is not None and i >= i0_p) else None for i, v in enumerate(idx_prod[p["id"]])]
        met = metricas_indice(idx_p, eje_iso, rf, idx_bench=idx_world)
        if not met or met.get("cagr") is None or met.get("vol") is None:
            met = metricas_indice(indice_pesos({p["id"]: 1}), eje_iso, rf, idx_bench=idx_world)
        if not met or met.get("cagr") is None or met.get("vol") is None:
            continue
        col = p["slotColor"][0] if isinstance(p.get("slotColor"), (list, tuple)) else p.get("slotColor")
        dispersion_activos.append({
            "id": p["id"],
            "nombre": p["corto"],
            "color": col,
            "valor": p["valor"],
            "peso": p["peso"],
            "cagr": met["cagr"],
            "vol": met["vol"],
            "sharpe": met["sharpe"],
            "sortino": met["sortino"],
            "maxDD": met["maxDD"],
        })

    xray, activos_pos = calcular_xray(productos, inv, ser_otros)
    prods_con_fx = [p for p in productos if isinstance(p.get("desgloseFx"), dict)]
    if prods_con_fx:
        tot_act_fx = r2(sum(p["desgloseFx"]["efectoActivoEur"] for p in prods_con_fx))
        tot_div_fx = r2(sum(p["desgloseFx"]["efectoDivisaEur"] for p in prods_con_fx))
        tot_pl_fx = r2(sum(p["desgloseFx"]["plusvaliaTotalEur"] for p in prods_con_fx))
        xray["desgloseFxTotal"] = {
            "numProductos": len(prods_con_fx),
            "plusvaliaTotalEur": tot_pl_fx,
            "efectoActivoEur": tot_act_fx,
            "efectoDivisaEur": tot_div_fx,
        }
    salud = calcular_salud(productos, ser_otros, tot_pasivos, patrimonio, cfg)
    estres = calcular_estres(activos_pos, patrimonio)
    fiscalidad = calcular_fiscalidad(
        fifo_cartera["operaciones_fiscales"], fifo_cartera["dividendos"], productos, plusvalia_total, patrimonio
    )
    especializados = calcular_especializados(productos, ser_otros, ser_pasivos, movs_por, fecha_extracto)
    dividendos = calcular_dividendos(
        fifo_cartera["dividendos"],
        productos,
        eje_iso,
        fecha_extracto,
        patrimonio,
        aportado_total,
        especializados=especializados,
    )

    con_flujos = [p for p in productos if p["_mv"]["flujos"]]
    comparacion = None
    if con_flujos and any(flujo_dia):
        tuya = [round(sum((p["serie"][i] or 0) for p in con_flujos), 2) for i in range(n)]
        i0 = next(i for i in range(n) if flujo_dia[i] or tuya[i])
        acum, aportado_c = 0.0, []
        for i in range(n):
            acum += flujo_dia[i]
            aportado_c.append(round(acum, 2) if i >= i0 else None)
        flujos_c = [(d(eje_iso[i]), -flujo_dia[i]) for i in range(n) if flujo_dia[i]]

        refs = []
        for rid, ref in REFERENCIAS.items():
            precios = [rellenar(series.get(sim, {}), eje) for sim, _ in ref["piezas"]]
            primeros = [next((v for v in pr if v), None) for pr in precios]
            if not all(primeros):
                continue
            unidades, serie_r, antes = [0.0] * len(precios), [], False
            for i in range(n):
                pr_hoy = [precios[k][i] or primeros[k] for k in range(len(precios))]
                if flujo_dia[i]:
                    antes = antes or any(precios[k][i] is None for k in range(len(precios)))
                    for k, (_, peso) in enumerate(ref["piezas"]):
                        unidades[k] += flujo_dia[i] * peso / pr_hoy[k]
                valor_r = sum(unidades[k] * pr_hoy[k] for k in range(len(precios)))
                serie_r.append(round(valor_r, 2) if i >= i0 else None)
            refs.append({
                "id": rid,
                "nombre": ref["nombre"],
                "detalle": ref["detalle"],
                "serie": serie_r,
                "valor": serie_r[-1],
                "tir": r4(xirr(flujos_c + [(fecha_extracto, serie_r[-1])])),
                "aviso": (
                    "Tienes aportaciones anteriores a los precios de esta referencia: "
                    "para esas se usa su primer precio conocido."
                )
                if antes
                else None,
            })
        if refs:
            comparacion = {
                "desde": eje_iso[i0],
                "tuya": [v if i >= i0 else None for i, v in enumerate(tuya)],
                "aportado": aportado_c,
                "tuValor": tuya[-1],
                "tuTir": r4(xirr(flujos_c + [(fecha_extracto, tuya[-1])])),
                "referencias": refs,
            }

    prod_v = next((p for p in productos if p.get("participaciones") and (p.get("vivo") or p.get("fuente") == "coingecko")), None)
    vivo = None
    if prod_v:
        coin = prod_v.get("vivo") or prod_v.get("codigo")
        ref_v = valor_en(series.get("CG:" + coin, {}), prod_v.get("navFecha") or fecha_extracto)
        if ref_v:
            vivo = {
                "productoId": prod_v["id"],
                "coin": coin,
                "titulos": prod_v["participaciones"],
                "precioRef": r4(prod_v["nav"]),
                "btcRef": r2(ref_v),
                "fechaRef": prod_v.get("navFecha") or fecha_extracto.isoformat(),
            }

    datos = {
        "generado": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "titular": cfg.get("titular", "Mi patrimonio"),
        "moneda": cfg.get("moneda", "EUR"),
        "fechaExtracto": fecha_extracto.isoformat(),
        "fechas": eje_iso,
        "productos": productos,
        "otrosActivos": ser_otros,
        "pasivos": ser_pasivos,
        "total": {
            "patrimonio": patrimonio,
            "aportado": aportado_total,
            "valorConCoste": round(valor_conocido, 2),
            "plusvalia": plusvalia_total,
            "rentabilidad": r4(plusvalia_total / aportado_total) if aportado_total else None,
            "tir": tir_total,
            "realizado": realizado_total,
            "serie": serie_total,
            "serieAportado": serie_ap_total,
            "porClase": agrupar("clase"),
            "porEntidad": agrupar("entidad"),
            "porTipo": agrupar("tipo"),
            "hitos": hitos,
            "racha": racha,
            "ritmoMensual": ritmo,
            "numAportaciones": sum(1 for p in productos for a in p["aportaciones"] if a.get("importe")),
            "diasInvertido": (fecha_extracto - primera).days,
            "caidaMaxima": r4(dd_max),
            "caidaMaximaFecha": dd_fecha,
        },
        "aportacionesMensuales": {"meses": meses, "porProducto": por_producto, "total": total_mes},
        "objetivo": cfg.get("objetivo"),
        "comisiones": comisiones,
        "rentabilidadAnual": rent_anual,
        "resumenMensual": resumen_mensual,
        "comparador": comparador,
        "comparacion": comparacion,
        "indiceCartera": [r2(v) for v in idx_cartera],
        "serieDrawdown": serie_dd,
        "heatmapMensual": heatmap_mensual,
        "dispersionActivos": dispersion_activos,
        "xray": xray,
        "salud": salud,
        "estres": estres,
        "fiscalidad": fiscalidad,
        "dividendos": dividendos,
        "especializados": especializados,
        "vivo": vivo,
        "avisos": AVISOS,
    }

    for p in productos + otros + pasivos + ser_otros + ser_pasivos:
        for k in [k for k in p if k.startswith("_")]:
            p.pop(k)

    hist_ruta = os.path.join(carpeta, "historico.json")
    hist = lee_cache(hist_ruta) or []
    hist = [h for h in hist if h.get("fecha") != fecha_extracto.isoformat()]
    hist.append({
        "fecha": fecha_extracto.isoformat(),
        "patrimonio": patrimonio,
        "aportado": aportado_total,
        "plusvalia": plusvalia_total,
        "porProducto": {p["id"]: p["valor"] for p in productos},
    })
    hist.sort(key=lambda h: h["fecha"])
    with open(hist_ruta, "w", encoding="utf-8") as f:
        json.dump(hist, f, ensure_ascii=False, indent=1)

    print()
    print("=" * 62)
    print(f"  PATRIMONIO NETO      {patrimonio:14,.2f} EUR")
    print(f"  Aportado             {aportado_total:14,.2f} EUR")
    print(f"  Plusvalia latente    {plusvalia_total:14,.2f} EUR  ({(plusvalia_total/aportado_total*100 if aportado_total else 0):+.2f}%)")
    if tir_total is not None:
        print(f"  TIR anualizada       {tir_total*100:13.2f} %")
    print("=" * 62)
    return datos
