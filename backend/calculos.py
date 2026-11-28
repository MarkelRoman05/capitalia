# -*- coding: utf-8 -*-
"""
calculos.py  ·  Motor matemático y financiero puro (sin red ni disco)
=====================================================================
Contiene las constantes del modelo y las funciones puras de cálculo:
XIRR, FIFO con traspasos neutros, IRPF del ahorro, TWR, métricas de riesgo,
X-Ray consolidado, salud financiera, estrés, dividendos y productos especializados.
"""

import datetime as dt
import math
import re
import unicodedata
from collections import defaultdict

PALETA = {
    1: ("#2a78d6", "#3987e5"),
    2: ("#eb6834", "#d95926"),
    3: ("#1baf7a", "#199e70"),
    4: ("#eda100", "#c98500"),
    5: ("#e87ba4", "#d55181"),
    6: ("#008300", "#008300"),
    7: ("#4a3aa7", "#9085e9"),
    8: ("#e34948", "#e66767"),
    9: ("#0e8fb0", "#2bb0d1"),
    10: ("#9a6a3a", "#c08a55"),
    11: ("#5d6b8a", "#93a1c2"),
    12: ("#7c9a00", "#9cc21a"),
}

TIPOS = {
    "fondo": "Fondo de inversión",
    "etf": "ETF",
    "accion": "Acción",
    "cripto": "Criptomoneda",
    "commodity": "Materia prima",
    "bono": "Bono",
    "pension": "Plan de pensiones",
    "efectivo": "Cuenta / efectivo",
    "inmueble": "Inmueble",
    "deuda": "Deuda / préstamo",
    "otro": "Otro",
}

CLASE_DEFECTO = {
    "fondo": "Fondos",
    "etf": "Renta variable",
    "accion": "Renta variable",
    "cripto": "Criptoactivos",
    "commodity": "Materias primas",
    "bono": "Renta fija",
    "pension": "Jubilación",
    "efectivo": "Efectivo",
    "inmueble": "Inmuebles",
    "deuda": "Deudas",
    "otro": "Otros",
}

ORDEN_TIPO = {"compra": 0, "comision": 1, "traspaso": 2, "dividendo": 3, "venta": 4}

TRAMOS_IRPF_AHORRO = (
    (6000.0, 0.19),
    (50000.0, 0.21),
    (200000.0, 0.23),
    (300000.0, 0.27),
    (float("inf"), 0.30),
)

REFERENCIAS = {
    "mundo": {
        "nombre": "MSCI World",
        "detalle": "ETF de acumulación iShares Core MSCI World (IWDA, Total Return neto con dividendos reinvertidos), en euros: unas 1.400 empresas de 23 países desarrollados.",
        "piezas": [("IWDA.AS", 1.0)],
    },
    "sp500": {
        "nombre": "S&P 500",
        "detalle": "ETF de acumulación iShares Core S&P 500 (SXR8, Total Return neto con dividendos reinvertidos), en euros: las 500 mayores empresas de EE. UU.",
        "piezas": [("SXR8.DE", 1.0)],
    },
    "6040": {
        "nombre": "Cartera 60/40",
        "detalle": "60 % ETF de acumulación MSCI World (IWDA) y 40 % ETF de acumulación de bonos globales cubiertos a euros (EUNA), Total Return neto con dividendos y cupones reinvertidos, sin rebalancear.",
        "piezas": [("IWDA.AS", 0.6), ("EUNA.DE", 0.4)],
    },
    "sinriesgo": {
        "nombre": "Sin riesgo",
        "detalle": "ETF monetario de acumulación del euro (XEON, Total Return neto con rendimientos reinvertidos): lo que da el dinero aparcado, sin sustos.",
        "piezas": [("XEON.DE", 1.0)],
    },
}

ETIQUETAS = {
    "fondo": ("Valor liquidativo", "Participaciones", "El valor liquidativo del fondo"),
    "pension": ("Valor liquidativo", "Participaciones", "El valor liquidativo del plan"),
    "etf": ("Precio del ETF", "Participaciones", "El precio del ETF"),
    "accion": ("Precio de la acción", "Acciones", "El precio de la acción"),
    "cripto": ("Precio", "Unidades", "El precio de la criptomoneda"),
    "commodity": ("Precio por unidad", "Unidades", "El precio"),
    "bono": ("Precio del bono", "Títulos", "El precio del bono"),
}

_PAISES_EUR = {
    "francia", "alemania", "espana", "italia", "paises bajos", "holanda",
    "irlanda", "belgica", "austria", "finlandia", "portugal", "eurozona",
    "zona euro", "europa (euro)", "luxemburgo", "grecia", "eslovaquia",
    "eslovenia", "estonia", "letonia", "lituania", "malta", "chipre", "croacia",
}
_PAIS_A_DIVISA = {
    "estados unidos": "USD",
    "ee. uu.": "USD",
    "eeuu": "USD",
    "usa": "USD",
    "japon": "JPY",
    "reino unido": "GBP",
    "suiza": "CHF",
    "canada": "CAD",
    "taiwan": "TWD",
    "corea del sur": "KRW",
    "china": "CNY/HKD",
    "hong kong": "CNY/HKD",
    "india": "INR",
    "brasil": "BRL",
    **{p: "EUR" for p in _PAISES_EUR},
}

ESCENARIOS_ESTRES = (
    (
        "crisis_2008",
        "Crisis 2008",
        "Desplome bursátil global (-48 % RV, -65 % cripto, -15 % inmobiliario, +4 % renta fija).",
        {"rv": -0.48, "cripto": -0.65, "rf": 0.04, "liquidez": 0.0, "inmueble": -0.15},
    ),
    (
        "covid_2020",
        "Covid Mar-2020",
        "Shock rápido de liquidez (-33 % RV, -45 % cripto, -2 % renta fija, -3 % inmobiliario).",
        {"rv": -0.33, "cripto": -0.45, "rf": -0.02, "liquidez": 0.0, "inmueble": -0.03},
    ),
    (
        "inflacion_2022",
        "Inflación y Tipos 2022",
        "Subida agresiva de tipos (-18 % RV, -14 % renta fija, -60 % cripto, -4 % inmobiliario, +1 % liquidez).",
        {"rv": -0.18, "cripto": -0.60, "rf": -0.14, "liquidez": 0.01, "inmueble": -0.04},
    ),
)


# ---------------------------------------------------------------- utilidades puras

def hoy():
    return dt.date.today()


def d(s):
    return dt.date.fromisoformat(s)


def rango_fechas(desde, hasta):
    out, x = [], desde
    while x <= hasta:
        out.append(x)
        x += dt.timedelta(days=1)
    return out


def num_es(txt):
    """Convierte '1.399,89' o '3352,6' o '13.25' en float."""
    t = (txt or "").strip().replace("\u00a0", "").replace(" ", "").replace("€", "")
    if not t:
        return 0.0
    if "," in t and "." in t:
        t = t.replace(".", "").replace(",", ".")
    elif "," in t:
        t = t.replace(",", ".")
    elif re.fullmatch(r"-?\d{1,3}(\.\d{3})+", t):
        t = t.replace(".", "")
    try:
        return float(t)
    except ValueError:
        return 0.0


def r2(x):
    return None if x is None else round(float(x), 2)


def r4(x):
    return None if x is None else round(float(x), 4)


def _norm_clave(txt):
    s = unicodedata.normalize("NFKD", str(txt or "")).encode("ascii", "ignore").decode("ascii")
    return " ".join(s.lower().strip().split())


def _pais_a_divisa(nombre):
    return _PAIS_A_DIVISA.get(_norm_clave(nombre), "Otras")


def _es_monetario(p):
    txt = " ".join(str(p.get(k) or "") for k in ("tipo", "tipoDetalle", "clase", "nombre")).lower()
    return "monetari" in txt


def _clasificar_estres(p):
    clave = p.get("tipoClave")
    txt = " ".join(str(p.get(k) or "") for k in ("tipo", "tipoDetalle", "clase", "nombre", "corto")).lower()
    if clave == "efectivo" or "monetari" in txt or "liquidez" in txt or "cuenta corriente" in txt:
        return "liquidez"
    if clave == "cripto" or "cripto" in txt or "bitcoin" in txt or "ethereum" in txt or p.get("vivo"):
        return "cripto"
    if clave == "inmueble" or "inmueble" in txt or "vivienda" in txt or "inmobiliari" in txt:
        return "inmueble"
    if (
        clave == "bono"
        or "renta fija" in txt
        or "bono" in txt
        or "obligacion" in txt
        or "tesoro" in txt
        or "seguro de ahorro" in txt
        or "depósito" in txt
        or "deposito" in txt
    ):
        return "rf"
    return "rv"


# ---------------------------------------------------------------- XIRR, IRPF, TER, TWR

def xirr(flujos):
    """flujos = [(fecha, importe)]. Negativo = aportacion, positivo = valor."""
    flujos = [(f, float(v)) for f, v in flujos if v]
    if len(flujos) < 2:
        return None
    if not (any(v < 0 for _, v in flujos) and any(v > 0 for _, v in flujos)):
        return None
    f0 = min(f for f, _ in flujos)

    def van(tasa):
        s = 0.0
        for f, v in flujos:
            t = (f - f0).days / 365.0
            base = 1.0 + tasa
            if base <= 1e-9:
                return float("inf")
            s += v / (base ** t)
        return s

    lo, hi = -0.9999, 10.0
    try:
        vlo, vhi = van(lo), van(hi)
    except Exception:
        return None
    if not (math.isfinite(vlo) and math.isfinite(vhi)) or vlo * vhi > 0:
        return None
    for _ in range(200):
        mid = (lo + hi) / 2
        vm = van(mid)
        if abs(vm) < 1e-7:
            return mid
        if vlo * vm <= 0:
            hi, vhi = mid, vm
        else:
            lo, vlo = mid, vm
    return (lo + hi) / 2


def calcular_irpf_ahorro(base):
    """Calcula la cuota íntegra del IRPF del ahorro en España por tramos progresivos."""
    if base is None or base <= 0:
        return 0.0
    restante = float(base)
    anterior = 0.0
    cuota = 0.0
    for limite, tipo in TRAMOS_IRPF_AHORRO:
        if restante <= 0:
            break
        ancho = restante if math.isinf(limite) else min(restante, limite - anterior)
        cuota += ancho * tipo
        restante -= ancho
        anterior = limite
    return r2(cuota)


def impacto_ter_compuesto(valor, ter, anos, tasa=0.07):
    return valor * ((1.0 + tasa) ** anos - max(0.01, 1.0 + tasa - ter) ** anos)


def indice_twr(valores, flujos):
    """Rentabilidad encadenada, limpia del efecto de cuándo entra el dinero."""
    out, ant, nivel = [], None, 100.0
    for i in range(len(valores)):
        v = valores[i]
        f = flujos[i] if i < len(flujos) else 0.0
        if v is None:
            out.append(nivel)
            continue
        if ant is None or ant <= 1:
            if f > 0:
                nivel *= max(v / f, 0.05)
        else:
            nivel *= 1.0 + max((v - f) / ant - 1.0, -0.95)
        out.append(nivel)
        ant = v
    return out


def indice_ponderado(nav_listas, pesos, n):
    tot = sum(pesos)
    if not tot or not nav_listas:
        return None
    i0 = next((i for i in range(n) if all(lst[i] for lst in nav_listas)), None)
    if i0 is None:
        return None
    out = [None] * n
    ult = [lst[i0] for lst in nav_listas]
    for i in range(i0, n):
        s = 0.0
        for k, peso in enumerate(pesos):
            v = nav_listas[k][i] or ult[k]
            ult[k] = v
            s += (peso / tot) * v / nav_listas[k][i0]
        out[i] = round(s * 100, 4)
    return out


def metricas_indice(idx, eje_iso, rf=None, idx_bench=None):
    if not idx:
        return None
    pts = [i for i, v in enumerate(idx) if v]
    if len(pts) < 30:
        return None
    i0, i1 = pts[0], pts[-1]
    anos = (d(eje_iso[i1]) - d(eje_iso[i0])).days / 365.25
    rent = idx[i1] / idx[i0] - 1
    cagr = (idx[i1] / idx[i0]) ** (1 / anos) - 1 if anos > 0.15 else None
    rf_eff = rf if rf is not None else 0.02
    rs, ant = [], None
    for i in range(i0, i1 + 1):
        if d(eje_iso[i]).weekday() >= 5 or not idx[i]:
            continue
        if ant:
            rs.append(idx[i] / ant - 1)
        ant = idx[i]
    vol = sortino = None
    if len(rs) > 20:
        mu = sum(rs) / len(rs)
        vol = math.sqrt(sum((x - mu) ** 2 for x in rs) / (len(rs) - 1)) * math.sqrt(252)
        downside = [min(0.0, r) for r in rs]
        dd_std = math.sqrt(sum(x * x for x in downside) / len(downside)) * math.sqrt(252)
        if cagr is not None and dd_std > 1e-9:
            sortino = r4((cagr - rf_eff) / dd_std)

    beta = alfa = None
    if idx_bench:
        rp_list, rb_list = [], []
        ant_p = ant_b = ib0 = ib1 = None
        for i in range(i0, min(i1 + 1, len(idx_bench))):
            if not idx[i] or not idx_bench[i]:
                continue
            if ib0 is None:
                ib0 = i
            ib1 = i
            if d(eje_iso[i]).weekday() >= 5:
                continue
            if ant_p and ant_b:
                rp_list.append(idx[i] / ant_p - 1.0)
                rb_list.append(idx_bench[i] / ant_b - 1.0)
            ant_p, ant_b = idx[i], idx_bench[i]
        if len(rp_list) >= 20:
            m_pares = len(rp_list)
            mp = sum(rp_list) / m_pares
            mb = sum(rb_list) / m_pares
            var_b = sum((y - mb) ** 2 for y in rb_list) / (m_pares - 1)
            if var_b > 1e-12:
                cov_pb = sum((x - mp) * (y - mb) for x, y in zip(rp_list, rb_list)) / (m_pares - 1)
                beta = r4(cov_pb / var_b)
                anos_b = (
                    (d(eje_iso[ib1]) - d(eje_iso[ib0])).days / 365.25
                    if (ib0 is not None and ib1 is not None)
                    else 0.0
                )
                if anos_b > 0.15 and beta is not None:
                    cagr_p_b = (idx[ib1] / idx[ib0]) ** (1 / anos_b) - 1
                    cagr_b = (idx_bench[ib1] / idx_bench[ib0]) ** (1 / anos_b) - 1
                    alfa = r4(cagr_p_b - (rf_eff + beta * (cagr_b - rf_eff)))

    pico, dd, ddf = 0.0, 0.0, None
    dias_rec, max_dias_rec = 0, 0
    for i in range(i0, i1 + 1):
        if not idx[i]:
            continue
        if idx[i] >= pico:
            pico = idx[i]
            dias_rec = 0
        else:
            dias_rec += 1
            if dias_rec > max_dias_rec:
                max_dias_rec = dias_rec
        c = idx[i] / pico - 1
        if c < dd:
            dd, ddf = c, eje_iso[i]
    return {
        "rentTotal": r4(rent),
        "cagr": r4(cagr),
        "vol": r4(vol),
        "sharpe": r4((cagr - rf_eff) / vol) if (cagr is not None and vol) else None,
        "sortino": sortino,
        "beta": beta,
        "alfa": alfa,
        "rfUsado": r4(rf_eff),
        "maxDD": r4(dd),
        "maxDDFecha": ddf,
        "maxDiasRecuperacion": max_dias_rec,
        "desde": eje_iso[i0],
        "hasta": eje_iso[i1],
    }


# ---------------------------------------------------------------- FIFO y traspasos

def _estado_fifo_vacio():
    return {
        "eventos": [],
        "flujos": [],
        "flujos_externos": [],
        "realizado": 0.0,
        "comisiones": 0.0,
        "vendidas": set(),
    }


def procesar_fifo_cartera(productos_cfg, movimientos, aviso_fn=None):
    """Procesa cronológicamente todos los movimientos de la cartera aplicando FIFO y traspasos neutros."""
    mapa_prod = {p["id"]: p for p in (productos_cfg or []) if p.get("id")}

    def _nombre_prod(pid):
        p = mapa_prod.get(pid) or {}
        return p.get("corto") or p.get("nombre") or pid

    def _tipo_clave(pid):
        p = mapa_prod.get(pid) or {}
        raw_t = p.get("tipo")
        return raw_t if raw_t in TIPOS else p.get("tipoClave", "otro")

    def _notifica(msg):
        if aviso_fn:
            aviso_fn(msg)

    lotes = defaultdict(list)
    estado = defaultdict(_estado_fifo_vacio)
    operaciones_fiscales = []
    eventos_dividendos = []

    movs_ord = sorted(
        movimientos or [],
        key=lambda x: (x.get("fecha") or "", ORDEN_TIPO.get(x.get("tipo"), 9), str(x.get("id") or "")),
    )

    for m in movs_ord:
        f = m["fecha"]
        t = m.get("tipo")
        pid = m.get("producto")
        if not pid:
            continue
        u = float(m.get("unidades") or 0)
        imp = float(m.get("importe") or 0)
        com = float(m.get("comision") or 0)
        st = estado[pid]

        if t == "compra":
            lotes[pid].append([u, imp, f, id(m)])
            lotes[pid].sort(key=lambda lot: lot[2])
            st["eventos"].append((f, u, imp))
            st["flujos"].append((f, -imp))
            st["flujos_externos"].append((f, -imp))
            st["comisiones"] += com
        elif t == "traspaso":
            pid_dest = m.get("productoDestino")
            u_dest = float(m.get("unidadesDestino") or 0)
            quedan = u
            sublotes = []
            coste_trasp = 0.0
            lotes_orig = lotes[pid]
            while quedan > 1e-9 and lotes_orig:
                lu, lc, lfecha, lref = lotes_orig[0]
                toma = min(lu, quedan)
                parte = lc * toma / lu if lu else 0.0
                coste_trasp += parte
                quedan -= toma
                st["vendidas"].add(lref)
                sublotes.append([toma, parte, lfecha, lref])
                lotes_orig[0] = [lu - toma, lc - parte, lfecha, lref]
                if lotes_orig[0][0] <= 1e-9:
                    lotes_orig.pop(0)
            u_tomadas = u - quedan
            if quedan > 1e-6:
                _notifica(f"{_nombre_prod(pid)}: el {f} traspasas más unidades de las que tienes. Revisa sus movimientos.")
            st["eventos"].append((f, -u_tomadas, -coste_trasp))
            st["flujos"].append((f, imp))
            st["comisiones"] += com
            if pid_dest and u_tomadas > 1e-9 and u_dest > 0:
                factor = u_dest / u_tomadas
                for su, sc, sfecha, sref in sublotes:
                    lotes[pid_dest].append([su * factor, sc, sfecha, sref])
                lotes[pid_dest].sort(key=lambda lot: lot[2])
                st_dest = estado[pid_dest]
                st_dest["eventos"].append((f, u_dest, coste_trasp))
                st_dest["flujos"].append((f, -imp))
        elif t == "venta":
            quedan, coste = u, 0.0
            fecha_min = None
            lotes_prod = lotes[pid]
            while quedan > 1e-9 and lotes_prod:
                lu, lc, lfecha, lref = lotes_prod[0]
                toma = min(lu, quedan)
                parte = lc * toma / lu if lu else 0.0
                coste += parte
                quedan -= toma
                st["vendidas"].add(lref)
                if fecha_min is None or lfecha < fecha_min:
                    fecha_min = lfecha
                lotes_prod[0] = [lu - toma, lc - parte, lfecha, lref]
                if lotes_prod[0][0] <= 1e-9:
                    lotes_prod.pop(0)
            u_vendidas = u - quedan
            if quedan > 1e-6:
                _notifica(f"{_nombre_prod(pid)}: el {f} vendes más unidades de las que tienes. Revisa sus movimientos.")
            plusvalia_op = imp - coste
            st["realizado"] += plusvalia_op
            st["eventos"].append((f, -u_vendidas, -coste))
            st["flujos"].append((f, imp))
            st["flujos_externos"].append((f, imp))
            dias_tenencia = (d(f) - d(fecha_min)).days if fecha_min else None
            operaciones_fiscales.append({
                "fecha": f,
                "anio": f[:4],
                "productoId": pid,
                "productoNombre": _nombre_prod(pid),
                "tipoClave": _tipo_clave(pid),
                "unidades": round(u_vendidas, 6),
                "importeVenta": r2(imp),
                "costeFifo": r2(coste),
                "plusvalia": r2(plusvalia_op),
                "fechaAdquisicionMin": fecha_min,
                "diasTenencia": dias_tenencia,
            })
        elif t == "dividendo":
            ret = float(m.get("retencion") or 0)
            neto = max(0.0, imp - ret)
            st["realizado"] += imp
            st["flujos"].append((f, imp))
            st["flujos_externos"].append((f, imp))
            eventos_dividendos.append({
                "fecha": f,
                "anio": f[:4],
                "mes": f[:7],
                "productoId": pid,
                "productoNombre": _nombre_prod(pid),
                "importeBruto": r2(imp),
                "retencion": r2(ret),
                "importeNeto": r2(neto),
            })
        elif t == "comision":
            st["realizado"] -= imp
            st["comisiones"] += imp
            st["flujos"].append((f, -imp))
            st["flujos_externos"].append((f, -imp))

    return {
        "por_producto": dict(estado),
        "operaciones_fiscales": operaciones_fiscales,
        "dividendos": eventos_dividendos,
        "lotes": dict(lotes),
    }


def aplicar_movimientos(p, movs, aviso_fn=None):
    """Wrapper retrocompatible sobre procesar_fifo_cartera para un único producto."""
    pid = p.get("id") or "_prod"
    p_norm = dict(p, id=pid)
    movs_norm = [dict(m, producto=m.get("producto") or pid) for m in (movs or [])]
    res = procesar_fifo_cartera([p_norm], movs_norm, aviso_fn=aviso_fn)
    return res["por_producto"].get(pid, _estado_fifo_vacio())


# ---------------------------------------------------------------- analítica avanzada pura

def calcular_xray(productos, inv, ser_otros):
    inv_pos = [p for p in inv if (p.get("valor") or 0) > 0]
    total_inv_pos = sum(p["valor"] for p in inv_pos)
    total_inv_expo = sum(p["valor"] for p in inv_pos if isinstance(p.get("exposicion"), dict))
    prods_expo = [p for p in productos if (p.get("valor") or 0) > 0 and isinstance(p.get("exposicion"), dict)]
    total_expo = sum(p["valor"] for p in prods_expo)

    acc_paises = defaultdict(float)
    acc_sectores = defaultdict(float)
    empresas_map = {}
    if total_expo > 0:
        for p in prods_expo:
            peso_p = p["valor"] / total_expo
            expo = p["exposicion"]
            for item in expo.get("paises") or []:
                if len(item) >= 2 and item[1] is not None:
                    acc_paises[str(item[0]).strip()] += peso_p * float(item[1])
            for item in expo.get("sectores") or []:
                if len(item) >= 2 and item[1] is not None:
                    acc_sectores[str(item[0]).strip()] += peso_p * float(item[1])
            top_lista = expo.get("top10") or expo.get("topEmpresas") or expo.get("empresas") or []
            for item in top_lista:
                if len(item) >= 2 and item[1] is not None:
                    nom_orig = str(item[0]).strip()
                    clave_emp = " ".join(nom_orig.lower().split())
                    if not clave_emp:
                        continue
                    reg = empresas_map.setdefault(clave_emp, {"peso": 0.0, "nombres": {}, "productos": []})
                    reg["peso"] += peso_p * float(item[1])
                    reg["nombres"][nom_orig] = reg["nombres"].get(nom_orig, 0) + 1
                    if p["corto"] not in reg["productos"]:
                        reg["productos"].append(p["corto"])

    resto_paises = acc_paises.pop("Resto", 0.0)
    paises_ordenados = sorted(acc_paises.items(), key=lambda x: -x[1])
    if len(paises_ordenados) > 10:
        resto_paises += sum(v for _, v in paises_ordenados[10:])
        paises_ordenados = paises_ordenados[:10]
    xray_paises = [[k, r2(v)] for k, v in paises_ordenados if r2(v) > 0]
    if resto_paises > 0 and r2(resto_paises) > 0:
        xray_paises.append(["Resto", r2(resto_paises)])

    xray_sectores = [
        [k, r2(v)]
        for k, v in sorted(acc_sectores.items(), key=lambda x: -x[1])
        if r2(v) > 0
    ]

    xray_empresas = []
    for reg in sorted(empresas_map.values(), key=lambda x: -x["peso"])[:15]:
        nom_legible = max(reg["nombres"].items(), key=lambda kv: kv[1])[0]
        xray_empresas.append({
            "nombre": nom_legible,
            "peso": r2(reg["peso"]),
            "productos": reg["productos"],
            "solapado": len(reg["productos"]) > 1,
        })

    cobertura_expo_pct = r2(total_inv_expo / total_inv_pos * 100) if total_inv_pos > 0 else 0.0

    activos_pos = [p for p in (productos + ser_otros) if (p.get("valor") or 0) > 0]
    total_divisas = sum(p["valor"] for p in activos_pos)
    acc_divisas = defaultdict(float)
    for p in activos_pos:
        val = p["valor"]
        mon = (p.get("moneda") or "EUR").upper()
        if mon == "GBX":
            mon = "GBP"
        txt_cob = " ".join(str(p.get(k) or "") for k in ("nombre", "corto", "tipoDetalle", "politica", "cobertura")).lower()
        es_efec_o_mon = p.get("tipoClave") == "efectivo" or _es_monetario(p)
        es_cubierto = "hedged" in txt_cob or "cubiert" in txt_cob
        paises_expo = (p.get("exposicion") or {}).get("paises") if isinstance(p.get("exposicion"), dict) else None
        if es_efec_o_mon or es_cubierto:
            acc_divisas[mon] += val
        elif paises_expo:
            suma_w = sum(max(0.0, float(item[1])) for item in paises_expo if len(item) >= 2 and item[1] is not None)
            if suma_w > 0:
                for item in paises_expo:
                    if len(item) >= 2 and item[1] is not None:
                        w = max(0.0, float(item[1]))
                        acc_divisas[_pais_a_divisa(item[0])] += val * (w / suma_w)
            else:
                acc_divisas[mon] += val
        else:
            acc_divisas[mon] += val

    xray_divisas = (
        [
            [div, r2(v / total_divisas * 100)]
            for div, v in sorted(acc_divisas.items(), key=lambda x: -x[1])
            if r2(v / total_divisas * 100) > 0
        ]
        if total_divisas > 0
        else []
    )

    xray_alertas = []
    for nombre, pct in xray_paises:
        if nombre != "Resto" and pct > 60:
            xray_alertas.append(f"Alta concentración en {nombre} ({pct:.1f} %).")
    for nombre, pct in xray_sectores:
        if nombre != "Resto" and pct > 35:
            xray_alertas.append(f"Alta concentración en el sector {nombre} ({pct:.1f} %).")
    for emp in xray_empresas:
        if emp["peso"] > 5:
            xray_alertas.append(f"Peso elevado en {emp['nombre']} ({emp['peso']:.2f} %).")
    no_eur_pct = round(sum(pct for div, pct in xray_divisas if div != "EUR"), 2)
    if no_eur_pct > 60:
        xray_alertas.append(f"Alta exposición a divisas no-EUR ({no_eur_pct:.1f} %).")

    return (
        {
            "paises": xray_paises,
            "sectores": xray_sectores,
            "topEmpresas": xray_empresas,
            "coberturaExpoPct": cobertura_expo_pct,
            "divisas": xray_divisas,
            "alertas": xray_alertas,
        },
        activos_pos,
    )


def calcular_salud(productos, ser_otros, tot_pasivos, patrimonio, cfg):
    liquidez = r2(
        sum(e["valor"] for e in ser_otros if (e.get("valor") or 0) > 0)
        + sum(p["valor"] for p in productos if (p.get("valor") or 0) > 0 and _es_monetario(p))
    )
    deuda_total = r2(abs(tot_pasivos))
    activos_brutos = r2(patrimonio + deuda_total)
    ratio_deuda = r4(deuda_total / activos_brutos) if activos_brutos > 0 else 0.0
    raw_gasto = cfg.get("gastoMensual")
    try:
        gasto_mensual = round(float(raw_gasto), 2) if raw_gasto is not None and not isinstance(raw_gasto, bool) else None
    except (TypeError, ValueError):
        gasto_mensual = None
    if gasto_mensual is not None and gasto_mensual <= 0:
        gasto_mensual = None
    meses_colchon = r2(liquidez / gasto_mensual) if (gasto_mensual is not None and gasto_mensual > 0) else None
    return {
        "liquidez": liquidez,
        "deudaTotal": deuda_total,
        "activosBrutos": activos_brutos,
        "ratioDeuda": ratio_deuda,
        "gastoMensual": gasto_mensual,
        "mesesColchon": meses_colchon,
    }


def calcular_estres(activos_pos, patrimonio):
    por_bucket = defaultdict(float)
    for p in activos_pos:
        por_bucket[_clasificar_estres(p)] += p["valor"]
    base_estres = patrimonio if patrimonio > 0 else sum(por_bucket.values())
    estres = []
    for eid, enombre, edesc, shocks in ESCENARIOS_ESTRES:
        impacto = sum(val * shocks.get(bucket, 0.0) for bucket, val in por_bucket.items())
        estres.append({
            "id": eid,
            "nombre": enombre,
            "descripcion": edesc,
            "impactoEur": r2(impacto),
            "caidaPct": r4(impacto / base_estres) if base_estres > 0 else 0.0,
            "patrimonioResultante": r2(patrimonio + impacto),
        })
    return estres


def calcular_fiscalidad(ops_fiscales, evs_div, productos, plusvalia_total, patrimonio):
    anios_fiscales = sorted(
        {op["anio"] for op in ops_fiscales} | {ev["anio"] for ev in evs_div},
        reverse=True,
    )
    fiscal_por_anio = []
    for anio in anios_fiscales:
        ops_a = [op for op in ops_fiscales if op["anio"] == anio]
        divs_a = [ev for ev in evs_div if ev["anio"] == anio]
        ganancias = sum(op["plusvalia"] for op in ops_a if op["plusvalia"] > 0)
        perdidas = sum(abs(op["plusvalia"]) for op in ops_a if op["plusvalia"] < 0)
        saldo_gp = ganancias - perdidas
        div_brutos = sum(ev["importeBruto"] for ev in divs_a)
        retenciones = sum(ev["retencion"] for ev in divs_a)
        if saldo_gp < 0 and div_brutos > 0:
            compensacion = min(abs(saldo_gp), 0.25 * div_brutos)
            base_neta = max(0.0, div_brutos - compensacion)
        else:
            compensacion = 0.0
            base_neta = max(0.0, saldo_gp) + div_brutos
        imp_est = calcular_irpf_ahorro(base_neta)
        cuota_dif = r2(imp_est - retenciones)
        fiscal_por_anio.append({
            "anio": anio,
            "ganancias": r2(ganancias),
            "perdidas": r2(perdidas),
            "saldoGananciasPerdidas": r2(saldo_gp),
            "dividendosBrutos": r2(div_brutos),
            "retenciones": r2(retenciones),
            "compensacionAplicada": r2(compensacion),
            "baseAhorroNeta": r2(base_neta),
            "impuestoEstimado": imp_est,
            "cuotaDiferencial": cuota_dif,
            "operaciones": sorted(ops_a, key=lambda o: (o["fecha"], o["productoNombre"]), reverse=True),
        })

    imp_liquida_hoy = calcular_irpf_ahorro(max(0.0, plusvalia_total))
    plusvalia_latente_fiscal = {
        "bruta": r2(plusvalia_total),
        "impuestoSiLiquidaHoy": imp_liquida_hoy,
        "patrimonioNetoFiscal": r2(patrimonio - imp_liquida_hoy),
    }

    tlh = []
    for p in productos:
        pl = p.get("plusvalia")
        val_p = p.get("valor") or 0.0
        if pl is not None and pl < -50 and val_p > 0:
            minus = abs(pl)
            tlh.append({
                "id": p["id"],
                "nombre": p["corto"],
                "valor": r2(val_p),
                "aportado": p.get("aportado"),
                "minusvaliaLatente": r2(minus),
                "ahorroFiscalEstimado": calcular_irpf_ahorro(minus),
                "avisoRegla2Meses": True,
            })
    tlh.sort(key=lambda x: -x["minusvaliaLatente"])

    return {
        "porAnio": fiscal_por_anio,
        "plusvaliaLatente": plusvalia_latente_fiscal,
        "taxLossHarvesting": tlh,
    }


def _valor_fx_en(fx_serie, fecha_iso, margen=15):
    """Devuelve el tipo de cambio en `fecha_iso` o el día hábil anterior más cercano."""
    if not fx_serie or not fecha_iso:
        return None
    f = d(fecha_iso) if isinstance(fecha_iso, str) else fecha_iso
    for i in range(margen + 1):
        k = (f - dt.timedelta(days=i)).isoformat()
        v = fx_serie.get(k)
        if v and v > 0:
            return float(v)
    claves = sorted(fx_serie)
    if not claves:
        return None
    fi = f.isoformat()
    if fi < claves[0]:
        return float(fx_serie[claves[0]]) if fx_serie[claves[0]] else None
    for k in reversed(claves):
        if k <= fi and fx_serie[k]:
            return float(fx_serie[k])
    return float(fx_serie[claves[-1]]) if fx_serie[claves[-1]] else None


def calcular_desglose_fx(moneda, nav_eur, lotes_prod, fx_serie, fecha_extracto):
    """
    Desglosa la plusvalía latente de un activo en divisa extranjera (ej. USD, GBP)
    en Efecto Activo (movimiento del precio en moneda local) y Efecto Divisa (FX).
    Reconcilia exactamente: efectoActivoEur + efectoDivisaEur == plusvaliaTotalEur.
    """
    mon_raw = (moneda or "EUR").strip()
    mon = "GBP" if mon_raw in ("GBp", "GBX") else mon_raw.upper()
    if mon == "EUR" or not fx_serie or not nav_eur or nav_eur <= 0 or not lotes_prod:
        return None

    fx_actual = _valor_fx_en(fx_serie, fecha_extracto, margen=30)
    if not fx_actual or fx_actual <= 0:
        return None

    precio_divisa_actual = float(nav_eur) / fx_actual
    coste_eur_tot = 0.0
    coste_div_tot = 0.0
    val_eur_tot = 0.0
    ef_activo = 0.0
    ef_divisa = 0.0

    for lot in lotes_prod:
        lu, lc, lfecha = float(lot[0] or 0.0), float(lot[1] or 0.0), lot[2]
        if lu <= 1e-9 or lc <= 0:
            continue
        fx_c = _valor_fx_en(fx_serie, lfecha, margen=15)
        if not fx_c or fx_c <= 0:
            continue
        coste_div = lc / fx_c
        val_div = lu * precio_divisa_actual
        ef_activo += (val_div - coste_div) * fx_c
        ef_divisa += val_div * (fx_actual - fx_c)
        coste_eur_tot += lc
        coste_div_tot += coste_div
        val_eur_tot += val_div * fx_actual

    if coste_eur_tot <= 0 or coste_div_tot <= 0:
        return None

    fx_compra_medio = coste_eur_tot / coste_div_tot
    plusvalia_tot = val_eur_tot - coste_eur_tot
    return {
        "moneda": mon,
        "fxCompraMedio": r4(fx_compra_medio),
        "fxActual": r4(fx_actual),
        "variacionFxPct": r4(fx_actual / fx_compra_medio - 1.0),
        "plusvaliaTotalEur": r2(plusvalia_tot),
        "efectoActivoEur": r2(ef_activo),
        "efectoDivisaEur": r2(ef_divisa),
        "efectoActivoPct": r4(ef_activo / coste_eur_tot),
        "efectoDivisaPct": r4(ef_divisa / coste_eur_tot),
    }


def _sumar_meses(fecha, meses):
    """Suma `meses` calendario a `fecha` ajustando el día al fin de mes si procede."""
    total_m = (fecha.year * 12 + (fecha.month - 1)) + meses
    y, m0 = divmod(total_m, 12)
    m = m0 + 1
    for dia in (fecha.day, 28):
        try:
            return dt.date(y, m, dia)
        except ValueError:
            continue
    return dt.date(y, m, 28)


def calcular_dividendos(evs_div, productos, eje_iso, fecha_extracto, patrimonio, aportado_total, especializados=None):
    fecha_12m = (fecha_extracto - dt.timedelta(days=365)).isoformat()
    fecha_ext_iso = fecha_extracto.isoformat()
    total_div_bruto = r2(sum(ev["importeBruto"] for ev in evs_div))
    total_div_neto = r2(sum(ev["importeNeto"] for ev in evs_div))
    div_anio_actual = r2(sum(ev["importeBruto"] for ev in evs_div if ev["anio"] == str(fecha_extracto.year)))
    div_ult12m = r2(sum(ev["importeBruto"] for ev in evs_div if fecha_12m < ev["fecha"] <= fecha_ext_iso))
    media_div_12m = r2(div_ult12m / 12.0)
    yield_cartera = r4(div_ult12m / patrimonio) if patrimonio > 0 else 0.0
    yield_on_cost = r4(div_ult12m / aportado_total) if aportado_total > 0 else 0.0

    div_mes_b, div_mes_n = defaultdict(float), defaultdict(float)
    div_ano_b, div_ano_n = defaultdict(float), defaultdict(float)
    div_prod_b, div_prod_n, div_prod_12m, div_prod_nom = defaultdict(float), defaultdict(float), defaultdict(float), {}
    for ev in evs_div:
        div_mes_b[ev["mes"]] += ev["importeBruto"]
        div_mes_n[ev["mes"]] += ev["importeNeto"]
        div_ano_b[ev["anio"]] += ev["importeBruto"]
        div_ano_n[ev["anio"]] += ev["importeNeto"]
        pid_d = ev["productoId"]
        div_prod_b[pid_d] += ev["importeBruto"]
        div_prod_n[pid_d] += ev["importeNeto"]
        div_prod_nom.setdefault(pid_d, ev["productoNombre"])
        if fecha_12m < ev["fecha"] <= fecha_ext_iso:
            div_prod_12m[pid_d] += ev["importeBruto"]

    prod_mapa = {p["id"]: p for p in productos}
    if evs_div:
        meses_24 = sorted({f[:7] for f in eje_iso})[-24:]
        div_por_mes = [{"mes": m, "bruto": r2(div_mes_b[m]), "neto": r2(div_mes_n[m])} for m in meses_24]
        div_por_anio = [{"anio": a, "bruto": r2(div_ano_b[a]), "neto": r2(div_ano_n[a])} for a in sorted(div_ano_b)]
        div_por_prod = []
        for pid_d, bruto_p in sorted(div_prod_b.items(), key=lambda x: -x[1]):
            pr_obj = prod_mapa.get(pid_d)
            col_p = (
                pr_obj["slotColor"][0]
                if pr_obj and isinstance(pr_obj.get("slotColor"), (list, tuple))
                else (pr_obj.get("slotColor") if pr_obj else "#5d6b8a")
            )
            val_p = (pr_obj or {}).get("valor") or 0.0
            ap_p = (pr_obj or {}).get("aportado") or 0.0
            b12 = div_prod_12m[pid_d]
            div_por_prod.append({
                "id": pid_d,
                "nombre": (pr_obj or {}).get("corto") or div_prod_nom[pid_d],
                "color": col_p,
                "bruto": r2(bruto_p),
                "neto": r2(div_prod_n[pid_d]),
                "yieldActual": r4(b12 / val_p) if val_p > 0 else None,
                "yieldOnCost": r4(b12 / ap_p) if ap_p > 0 else None,
            })
    else:
        div_por_mes, div_por_anio, div_por_prod = [], [], []

    # ---- Ingresos pasivos consolidados y calendario estimado de próximos 12 meses ----
    rf_lista = (especializados or {}).get("rentaFija") or []
    inm_lista = ((especializados or {}).get("inmobiliario") or {}).get("inmuebles") or []
    intereses_rf = r2(sum(float(it.get("interesAnualEstimado") or 0.0) for it in rf_lista))
    alquileres_anuales = r2(sum(float(inm.get("alquilerMensual") or 0.0) * 12.0 for inm in inm_lista))
    anual_pasivo_total = r2(div_ult12m + intereses_rf + alquileres_anuales)

    ingresos_pasivos = {
        "anualTotal": anual_pasivo_total,
        "dividendos12m": div_ult12m,
        "interesesRentaFija": intereses_rf,
        "alquileresAnuales": alquileres_anuales,
        "mediaMensual": r2(anual_pasivo_total / 12.0),
    }

    limite_12m = fecha_extracto + dt.timedelta(days=365)
    proximos_cobros = []

    # 1) Proyección de dividendos basada en pagos de los últimos 12 meses de productos activos
    for ev in evs_div:
        if not (fecha_12m < ev["fecha"] <= fecha_ext_iso):
            continue
        pr_obj = prod_mapa.get(ev["productoId"])
        if pr_obj and (pr_obj.get("valor") or 0.0) <= 0:
            continue
        f_proj = _sumar_meses(d(ev["fecha"]), 12)
        if fecha_extracto < f_proj <= limite_12m:
            proximos_cobros.append({
                "fecha": f_proj.isoformat(),
                "mes": f_proj.isoformat()[:7],
                "productoId": ev["productoId"],
                "productoNombre": (pr_obj or {}).get("corto") or ev["productoNombre"],
                "tipo": "dividendo",
                "importeEstimado": r2(ev["importeBruto"]),
                "confianza": "estimado",
                "nota": "Estimado según histórico del año anterior",
            })

    # 2) Cupones y vencimientos de renta fija / depósitos
    paso_meses_map = {"mensual": 1, "trimestral": 3, "semestral": 6, "anual": 12}
    for rf in rf_lista:
        int_anual = float(rf.get("interesAnualEstimado") or 0.0)
        if int_anual <= 0:
            continue
        frec = (rf.get("frecuenciaCupon") or "").lower()
        fv_str = rf.get("fechaVencimiento")
        fv_date = d(fv_str) if fv_str else None
        if frec in paso_meses_map:
            paso = paso_meses_map[frec]
            importe_pago = r2(int_anual / (12.0 / paso))
            ancla = d(rf["fechaEmision"]) if rf.get("fechaEmision") else fecha_extracto
            cur = ancla
            while cur <= fecha_extracto:
                cur = _sumar_meses(cur, paso)
            while cur <= limite_12m and (fv_date is None or cur <= fv_date):
                proximos_cobros.append({
                    "fecha": cur.isoformat(),
                    "mes": cur.isoformat()[:7],
                    "productoId": rf["id"],
                    "productoNombre": rf["nombre"],
                    "tipo": "cupon",
                    "importeEstimado": importe_pago,
                    "confianza": "contractual",
                    "nota": f"Pago {frec}",
                })
                cur = _sumar_meses(cur, paso)
        elif fv_date and fecha_extracto < fv_date <= limite_12m:
            proximos_cobros.append({
                "fecha": fv_date.isoformat(),
                "mes": fv_date.isoformat()[:7],
                "productoId": rf["id"],
                "productoNombre": rf["nombre"],
                "tipo": "vencimiento",
                "importeEstimado": r2(int_anual),
                "confianza": "contractual",
                "nota": "Interés estimado al vencimiento",
            })

    # 3) Alquileres mensuales de inmuebles
    for inm in inm_lista:
        alq_m = float(inm.get("alquilerMensual") or 0.0)
        if alq_m <= 0:
            continue
        base_mes = dt.date(fecha_extracto.year, fecha_extracto.month, 1)
        for offset in range(1, 13):
            f_alq = _sumar_meses(base_mes, offset)
            if f_alq <= limite_12m:
                proximos_cobros.append({
                    "fecha": f_alq.isoformat(),
                    "mes": f_alq.isoformat()[:7],
                    "productoId": inm["id"],
                    "productoNombre": inm["nombre"],
                    "tipo": "alquiler",
                    "importeEstimado": r2(alq_m),
                    "confianza": "contractual",
                    "nota": "Renta mensual de alquiler",
                })

    proximos_cobros.sort(key=lambda x: (x["fecha"], x["productoNombre"]))

    # Agrupación mensual de próximos 12 meses para gráfico de previsión
    meses_futuros = [_sumar_meses(dt.date(fecha_extracto.year, fecha_extracto.month, 1), k).isoformat()[:7] for k in range(1, 13)]
    prox_por_mes_map = {m: {"mes": m, "total": 0.0, "dividendos": 0.0, "intereses": 0.0, "alquileres": 0.0} for m in meses_futuros}
    for c in proximos_cobros:
        bucket = prox_por_mes_map.get(c["mes"])
        if not bucket:
            continue
        imp_c = float(c["importeEstimado"] or 0.0)
        bucket["total"] += imp_c
        if c["tipo"] == "dividendo":
            bucket["dividendos"] += imp_c
        elif c["tipo"] in ("cupon", "vencimiento"):
            bucket["intereses"] += imp_c
        elif c["tipo"] == "alquiler":
            bucket["alquileres"] += imp_c
    proximos_por_mes = [
        {
            "mes": m,
            "total": r2(prox_por_mes_map[m]["total"]),
            "dividendos": r2(prox_por_mes_map[m]["dividendos"]),
            "intereses": r2(prox_por_mes_map[m]["intereses"]),
            "alquileres": r2(prox_por_mes_map[m]["alquileres"]),
        }
        for m in meses_futuros
    ] if proximos_cobros else []

    return {
        "totalHistorico": total_div_bruto,
        "totalNetoHistorico": total_div_neto,
        "anioActual": div_anio_actual,
        "ultimos12Meses": div_ult12m,
        "mediaMensual12m": media_div_12m,
        "yieldCartera": yield_cartera,
        "yieldOnCost": yield_on_cost,
        "porMes": div_por_mes,
        "porAnio": div_por_anio,
        "porProducto": div_por_prod,
        "ingresosPasivos": ingresos_pasivos,
        "proximosCobros": proximos_cobros,
        "proximosCobrosPorMes": proximos_por_mes,
    }


def calcular_especializados(productos, ser_otros, ser_pasivos, movs_por, fecha_extracto):
    rf_items = []
    for p in productos + ser_otros:
        if (
            p.get("tipoClave") == "bono"
            or p.get("fechaVencimiento")
            or (p.get("tae") is not None and float(p.get("tae") or 0) > 0)
        ):
            val_rf = r2(p.get("valor") or 0.0)
            fv = p.get("fechaVencimiento") or None
            fe = p.get("fechaEmision") or None
            tae_rf = float(p["tae"]) if p.get("tae") is not None else None
            cupon_rf = float(p["cuponAnual"]) if p.get("cuponAnual") is not None else None
            dias_rest = (d(fv) - fecha_extracto).days if fv else None
            prox_vto = bool(dias_rest is not None and 0 <= dias_rest <= 30)
            tasa_est = cupon_rf if cupon_rf is not None else tae_rf
            int_est = r2(val_rf * (tasa_est / 100.0)) if (tasa_est is not None and val_rf > 0) else None
            rf_items.append({
                "id": p["id"],
                "nombre": p["corto"],
                "valor": val_rf,
                "tae": tae_rf,
                "cuponAnual": cupon_rf,
                "frecuenciaCupon": p.get("frecuenciaCupon") or None,
                "fechaEmision": fe,
                "fechaVencimiento": fv,
                "diasRestantes": dias_rest,
                "proximoVencimiento": prox_vto,
                "interesAnualEstimado": int_est,
            })
    rf_items.sort(key=lambda it: (0 if it["fechaVencimiento"] else 1, it["fechaVencimiento"] or "", it["nombre"]))

    anio_act_str = str(fecha_extracto.year)
    pen_items = []
    for p in productos:
        if p.get("tipoClave") != "pension":
            continue
        movs_p = movs_por.get(p["id"], [])
        ap_anio = sum(
            float(m.get("importe") or 0.0)
            for m in movs_p
            if m.get("tipo") == "compra" and (m.get("fecha") or "")[:4] == anio_act_str
        )
        if ap_anio <= 0:
            snaps_p = p.get("snapshots") or []
            snaps_anio = [s for s in snaps_p if s[0][:4] == anio_act_str and s[2] is not None]
            if snaps_anio:
                snaps_prev = [s for s in snaps_p if s[0][:4] < anio_act_str and s[2] is not None]
                base_prev = float(snaps_prev[-1][2]) if snaps_prev else 0.0
                ap_anio = max(0.0, float(snaps_anio[-1][2]) - base_prev)
        lim = float(p["limiteAnual"]) if p.get("limiteAnual") is not None else 1500.0
        margen = max(0.0, lim - ap_anio)
        t_marg = float(p["tipoMarginalIrpf"]) if p.get("tipoMarginalIrpf") is not None else None
        ahorro = r2(min(ap_anio, lim) * (t_marg / 100.0)) if t_marg is not None else None
        pen_items.append({
            "id": p["id"],
            "nombre": p["corto"],
            "valor": r2(p.get("valor") or 0.0),
            "aportadoAnioActual": r2(ap_anio),
            "limiteAnual": r2(lim),
            "margenRestante": r2(margen),
            "tipoMarginalIrpf": t_marg,
            "ahorroFiscalEstimado": ahorro,
        })
    ahorros_pen = [it["ahorroFiscalEstimado"] for it in pen_items if it["ahorroFiscalEstimado"] is not None]
    pensiones_esp = {
        "items": pen_items,
        "totalAportadoAnio": r2(sum(it["aportadoAnioActual"] for it in pen_items)),
        "totalLimiteAnual": r2(sum(it["limiteAnual"] for it in pen_items)),
        "totalMargenRestante": r2(sum(it["margenRestante"] for it in pen_items)),
        "totalAhorroEstimado": r2(sum(ahorros_pen)) if ahorros_pen else None,
    }

    def _hipoteca_resumen(h):
        return {
            "id": h["id"],
            "nombre": h["corto"],
            "deudaPendiente": r2(abs(h.get("valor") or 0.0)),
            "tipoInteres": float(h["tipoInteres"]) if h.get("tipoInteres") is not None else None,
            "tipoTasa": h.get("tipoTasa") or None,
            "cuotaMensual": float(h["cuotaMensual"]) if h.get("cuotaMensual") is not None else None,
            "fechaVencimiento": h.get("fechaVencimiento") or None,
        }

    ids_inm = {p["id"] for p in productos if p.get("tipoClave") == "inmueble"}
    inmuebles_esp = []
    for inm in productos:
        if inm.get("tipoClave") != "inmueble":
            continue
        val_inm = float(inm.get("valor") or 0.0)
        hips = [_hipoteca_resumen(h) for h in ser_pasivos if h.get("inmuebleId") == inm["id"]]
        deuda_p = sum(h["deudaPendiente"] for h in hips)
        eq_neto = val_inm - deuda_p
        alq_m = float(inm["alquilerMensual"]) if inm.get("alquilerMensual") is not None else None
        gas_a = float(inm["gastosAnuales"]) if inm.get("gastosAnuales") is not None else None
        intereses_hip = sum(
            h["deudaPendiente"] * (h["tipoInteres"] / 100.0)
            for h in hips
            if h.get("tipoInteres") is not None and h["deudaPendiente"] > 0
        )
        rent_bruta = r4((alq_m * 12.0) / val_inm) if (alq_m is not None and val_inm > 0) else None
        rent_neta = r4((alq_m * 12.0 - (gas_a or 0.0)) / val_inm) if (alq_m is not None and val_inm > 0) else None
        rent_neta_fin = (
            r4((alq_m * 12.0 - (gas_a or 0.0) - intereses_hip) / val_inm)
            if (alq_m is not None and val_inm > 0)
            else None
        )
        cashflow_anual = (
            r2(alq_m * 12.0 - (gas_a or 0.0) - intereses_hip)
            if alq_m is not None
            else None
        )
        inmuebles_esp.append({
            "id": inm["id"],
            "nombre": inm["corto"],
            "valorInmueble": r2(val_inm),
            "deudaPendiente": r2(deuda_p),
            "equityNeto": r2(eq_neto),
            "porcentajePagado": r4(max(0.0, eq_neto) / val_inm) if val_inm > 0 else 0.0,
            "ltv": r4(deuda_p / val_inm) if val_inm > 0 else 0.0,
            "alquilerMensual": alq_m,
            "gastosAnuales": gas_a,
            "interesesHipotecaAnuales": r2(intereses_hip),
            "rentabilidadBruta": rent_bruta,
            "rentabilidadNeta": rent_neta,
            "rentabilidadNetaConHipoteca": rent_neta_fin,
            "cashflowAnualNeto": cashflow_anual,
            "hipotecas": hips,
        })

    hipotecas_sueltas = [
        _hipoteca_resumen(h)
        for h in ser_pasivos
        if (not h.get("inmuebleId") or h.get("inmuebleId") not in ids_inm)
        and (
            any(h.get(k) is not None for k in ("tipoInteres", "cuotaMensual", "fechaVencimiento"))
            or (h.get("valor") or 0) != 0
        )
    ]

    return {
        "rentaFija": rf_items,
        "pensiones": pensiones_esp,
        "inmobiliario": {
            "inmuebles": inmuebles_esp,
            "hipotecasSueltas": hipotecas_sueltas,
        },
    }
