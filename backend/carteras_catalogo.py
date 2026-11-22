# -*- coding: utf-8 -*-
"""
carteras_catalogo.py · Carteras indexadas y roboadvisors en vivo
=================================================================
Obtiene y mantiene cacheadas las composiciones oficiales actualizadas de las
carteras de MyInvestor, Indexa Capital y Finizens (incluyendo los subyacentes
de planes de pensiones de Indexa), y resuelve cada fondo/ETF incluido contra
Morningstar y Yahoo Finance para darlos de alta individualmente o en bloque.
"""

from concurrent.futures import ThreadPoolExecutor
import datetime as dt
import html
import json
import re
import time
import urllib.request

from .motor import UA

MYINVESTOR_URL = "https://myinvestor.es/inversion/carteras-automatizadas/"
INDEXA_URL = "https://indexacapital.com/es/esp/model"
FINIZENS_URL = "https://finizens.com/inversion-indexada/fondos-indexados/instrumentos/"

RE_CARTERA_ID = re.compile(r"^[a-z0-9_-]{2,80}$")
RE_ISIN = re.compile(r"\b[A-Z]{2}[A-Z0-9]{9}\d\b")

_CACHE_CATALOGO = {"ts": 0.0, "carteras": []}
_CACHE_CATALOGO_TTL = 6 * 3600.0
_CACHE_DETALLE = {}
_CACHE_DETALLE_TTL = 600.0
_CACHE_DETALLE_MAX = 64

_GENERICAS_CARTERA = {
    "cartera",
    "carteras",
    "indexada",
    "indexadas",
    "roboadvisor",
    "robo advisor",
    "automatizada",
    "automatizadas",
    "gestionada",
    "gestionadas",
    "pension",
    "pensiones",
    "plan de pensiones",
}

_FALLBACK_CARTERAS = [
    {
        "id": "myinvestor-metal",
        "entidad": "MyInvestor",
        "nombre": "MyInvestor · Cartera Metal",
        "perfilRiesgo": "100% RV · Perfil muy arriesgado",
        "riesgo": 6,
        "comisionTotal": "0,41% – 0,43%",
        "rentabilidad1a": None,
        "actualizado": None,
        "fuenteUrl": MYINVESTOR_URL,
        "planSecId": None,
        "componentes": [
            {"isin": "IE000N4ZYX28", "nombre": "iShares US Equity Index Fund clase S", "categoria": "Renta variable EEUU", "moneda": "EUR", "peso": 39},
            {"isin": "IE000N51F726", "nombre": "iShares Developed World ESG Screened Index Fund (IE) D Acc EUR", "categoria": "Renta variable Global ESG", "moneda": "EUR", "peso": 20},
            {"isin": "IE000QAZP7L2", "nombre": "iShares Emerging Markets Index Fund (IE) Acc EUR clase S", "categoria": "Renta variable emergentes", "moneda": "EUR", "peso": 14},
            {"isin": "IE00BYX5N771", "nombre": "Fidelity MSCI Japan Index Fund P-ACC-EUR", "categoria": "Renta variable Japón", "moneda": "EUR", "peso": 12},
            {"isin": "IE00BYX5MD61", "nombre": "Fidelity MSCI Europe Index Fund P-ACC-EUR", "categoria": "Renta variable Europa", "moneda": "EUR", "peso": 8},
            {"isin": "IE00B1G3DH73", "nombre": "Vanguard US Equity Index Fund EUR Hedged", "categoria": "Renta variable EEUU cubierto EUR", "moneda": "EUR", "peso": 4},
            {"isin": "IE00BDZVHT63", "nombre": "Fidelity MSCI Pacific ex-Japan Index Fund P-ACC-USD", "categoria": "Renta variable Asia-Pacífico", "moneda": "USD", "peso": 3},
        ],
    },
    {
        "id": "myinvestor-rock",
        "entidad": "MyInvestor",
        "nombre": "MyInvestor · Cartera Rock",
        "perfilRiesgo": "78% RV / 22% RF · Perfil arriesgado",
        "riesgo": 5,
        "comisionTotal": "0,41% – 0,43%",
        "rentabilidad1a": None,
        "actualizado": None,
        "fuenteUrl": MYINVESTOR_URL,
        "planSecId": None,
        "componentes": [
            {"isin": "IE00BYX5MX67", "nombre": "Fidelity S&P 500 Index Fund P-ACC-EUR", "categoria": "Renta variable EEUU", "moneda": "EUR", "peso": 33},
            {"isin": "LU2349459045", "nombre": "Goldman Sachs Global Enhanced Index Sustainable Equity - I Cap EUR", "categoria": "Renta variable Global ESG", "moneda": "EUR", "peso": 14},
            {"isin": "IE0007471471", "nombre": "Vanguard US Government Bond Index Fund EUR Hedged", "categoria": "Renta fija EEUU", "moneda": "EUR", "peso": 12},
            {"isin": "IE00BYWYCC39", "nombre": "iShares Emerging Markets Index Fund (IE) D Acc EUR", "categoria": "Renta variable emergentes", "moneda": "EUR", "peso": 11},
            {"isin": "IE00B246KL88", "nombre": "Vanguard 20+ Year Euro Treasury Index Fund", "categoria": "Renta fija Europa", "moneda": "EUR", "peso": 10},
            {"isin": "IE00BYX5N771", "nombre": "Fidelity MSCI Japan Index Fund P-ACC-EUR", "categoria": "Renta variable Japón", "moneda": "EUR", "peso": 9},
            {"isin": "IE00BYX5MD61", "nombre": "Fidelity MSCI Europe Index Fund P-ACC-EUR", "categoria": "Renta variable Europa", "moneda": "EUR", "peso": 7},
            {"isin": "IE00BDZVHT63", "nombre": "Fidelity MSCI Pacific ex-Japan Index Fund P-ACC-USD", "categoria": "Renta variable Asia-Pacífico", "moneda": "USD", "peso": 2},
            {"isin": "IE00B1G3DH73", "nombre": "Vanguard US Equity Index Fund EUR Hedged", "categoria": "Renta variable EEUU cubierto EUR", "moneda": "EUR", "peso": 2},
        ],
    },
    {
        "id": "myinvestor-indie",
        "entidad": "MyInvestor",
        "nombre": "MyInvestor · Cartera Indie",
        "perfilRiesgo": "60% RV / 40% RF · Perfil equilibrado",
        "riesgo": 4,
        "comisionTotal": "0,41% – 0,43%",
        "rentabilidad1a": None,
        "actualizado": None,
        "fuenteUrl": MYINVESTOR_URL,
        "planSecId": None,
        "componentes": [
            {"isin": "IE000N4ZYX28", "nombre": "iShares US Equity Index Fund clase S", "categoria": "Renta variable EEUU", "moneda": "EUR", "peso": 34},
            {"isin": "IE00BJN4RG66", "nombre": "iShares ESG Screened Global Corporate Bond Index Fund EUR Hedged", "categoria": "Renta fija corporativa Global", "moneda": "EUR", "peso": 15},
            {"isin": "IE00B246KL88", "nombre": "Vanguard 20+ Year Euro Treasury Index Fund", "categoria": "Renta fija Europa", "moneda": "EUR", "peso": 10},
            {"isin": "IE0007471471", "nombre": "Vanguard US Government Bond Index Fund EUR Hedged", "categoria": "Renta fija EEUU", "moneda": "EUR", "peso": 10},
            {"isin": "IE00BYX5MD61", "nombre": "Fidelity MSCI Europe Index Fund P-ACC-EUR", "categoria": "Renta variable Europa", "moneda": "EUR", "peso": 8},
            {"isin": "IE000QAZP7L2", "nombre": "iShares Emerging Markets Index Fund (IE) Acc EUR clase S", "categoria": "Renta variable emergentes", "moneda": "EUR", "peso": 8},
            {"isin": "IE00BYX5N771", "nombre": "Fidelity MSCI Japan Index Fund P-ACC-EUR", "categoria": "Renta variable Japón", "moneda": "EUR", "peso": 8},
            {"isin": "LU1811365292", "nombre": "iShares EM Government Bond Index Fund", "categoria": "Renta fija emergentes", "moneda": "EUR", "peso": 5},
            {"isin": "IE00BDZVHT63", "nombre": "Fidelity MSCI Pacific ex-Japan Index Fund P-ACC-USD", "categoria": "Renta variable Asia-Pacífico", "moneda": "USD", "peso": 2},
        ],
    },
    {
        "id": "myinvestor-pop",
        "entidad": "MyInvestor",
        "nombre": "MyInvestor · Cartera Pop",
        "perfilRiesgo": "39% RV / 61% RF · Perfil moderado",
        "riesgo": 3,
        "comisionTotal": "0,41% – 0,43%",
        "rentabilidad1a": None,
        "actualizado": None,
        "fuenteUrl": MYINVESTOR_URL,
        "planSecId": None,
        "componentes": [
            {"isin": "IE00BJN4RG66", "nombre": "iShares ESG Screened Global Corporate Bond Index Fund EUR Hedged", "categoria": "Renta fija corporativa Global", "moneda": "EUR", "peso": 23},
            {"isin": "IE00BYX5MX67", "nombre": "Fidelity S&P 500 Index Fund P-ACC-EUR", "categoria": "Renta variable EEUU", "moneda": "EUR", "peso": 22},
            {"isin": "IE00BDFB7290", "nombre": "Vanguard Global Short-Term Corporate Bond Index Fund EUR Hedged", "categoria": "Renta fija corporativa corto plazo", "moneda": "EUR", "peso": 15},
            {"isin": "IE00B246KL88", "nombre": "Vanguard 20+ Year Euro Treasury Index Fund", "categoria": "Renta fija Europa", "moneda": "EUR", "peso": 14},
            {"isin": "IE0007471471", "nombre": "Vanguard US Government Bond Index Fund EUR Hedged", "categoria": "Renta fija EEUU", "moneda": "EUR", "peso": 9},
            {"isin": "IE00BYWYCC39", "nombre": "iShares Emerging Markets Index Fund (IE) D Acc EUR", "categoria": "Renta variable emergentes", "moneda": "EUR", "peso": 7},
            {"isin": "IE00BYX5MD61", "nombre": "Fidelity MSCI Europe Index Fund P-ACC-EUR", "categoria": "Renta variable Europa", "moneda": "EUR", "peso": 6},
            {"isin": "IE00BYX5N771", "nombre": "Fidelity MSCI Japan Index Fund P-ACC-EUR", "categoria": "Renta variable Japón", "moneda": "EUR", "peso": 4},
        ],
    },
    {
        "id": "myinvestor-clasica",
        "entidad": "MyInvestor",
        "nombre": "MyInvestor · Cartera Clásica",
        "perfilRiesgo": "13% RV / 87% RF · Perfil conservador",
        "riesgo": 2,
        "comisionTotal": "0,41% – 0,43%",
        "rentabilidad1a": None,
        "actualizado": None,
        "fuenteUrl": MYINVESTOR_URL,
        "planSecId": None,
        "componentes": [
            {"isin": "IE00BJN4RG66", "nombre": "iShares ESG Screened Global Corporate Bond Index Fund EUR Hedged", "categoria": "Renta fija corporativa Global", "moneda": "EUR", "peso": 38},
            {"isin": "IE00BDFB7290", "nombre": "Vanguard Global Short-Term Corporate Bond Index Fund EUR Hedged", "categoria": "Renta fija corporativa corto plazo", "moneda": "EUR", "peso": 15},
            {"isin": "IE00B246KL88", "nombre": "Vanguard 20+ Year Euro Treasury Index Fund", "categoria": "Renta fija Europa", "moneda": "EUR", "peso": 14},
            {"isin": "IE00B04GQR24", "nombre": "Vanguard Eurozone Inflation-Linked Bond Index Fund EUR Acc", "categoria": "Renta fija ligada inflación", "moneda": "EUR", "peso": 10},
            {"isin": "IE0007471471", "nombre": "Vanguard US Government Bond Index Fund EUR Hedged", "categoria": "Renta fija EEUU", "moneda": "EUR", "peso": 10},
            {"isin": "IE00BYX5MX67", "nombre": "Fidelity S&P 500 Index Fund P-ACC-EUR", "categoria": "Renta variable EEUU", "moneda": "EUR", "peso": 8},
            {"isin": "IE00BYWYCC39", "nombre": "iShares Emerging Markets Index Fund (IE) D Acc EUR", "categoria": "Renta variable emergentes", "moneda": "EUR", "peso": 3},
            {"isin": "IE00BYX5MD61", "nombre": "Fidelity MSCI Europe Index Fund P-ACC-EUR", "categoria": "Renta variable Europa", "moneda": "EUR", "peso": 2},
        ],
    },
    {
        "id": "indexa-fondos-menos-10k",
        "entidad": "Indexa Capital",
        "nombre": "Indexa Capital · Carteras de Fondos (< 10.000 €)",
        "perfilRiesgo": "Fondos institucionales · Perfiles 1 a 10",
        "riesgo": 5,
        "comisionTotal": "0,51% – 0,56%",
        "rentabilidad1a": None,
        "actualizado": None,
        "fuenteUrl": INDEXA_URL,
        "planSecId": None,
        "componentes": [
            {"isin": "IE00BFPM9N11", "nombre": "Vanguard Global Stock Index Euro - Institutional Plus", "categoria": "MSCI World (RV Global)", "moneda": "EUR", "peso": None},
            {"isin": "IE00BGCZ0B53", "nombre": "Vanguard Global Bond Index Fund Institutional Plus EUR Hedged Acc", "categoria": "Bonos Globales Cubierto EUR", "moneda": "EUR", "peso": None},
            {"isin": "IE00BFPM9J74", "nombre": "Vanguard Emerging Markets Stock Index Euro - Institutional Plus", "categoria": "MSCI Emerging Markets", "moneda": "EUR", "peso": None},
        ],
    },
    {
        "id": "indexa-pensiones-acciones",
        "entidad": "Indexa Capital",
        "nombre": "Indexa Más Rentabilidad Acciones PP (DGS N5138)",
        "perfilRiesgo": "Plan de Pensiones · 100% RV Global (ETFs)",
        "riesgo": 6,
        "comisionTotal": "0,53%",
        "rentabilidad1a": None,
        "actualizado": None,
        "fuenteUrl": INDEXA_URL,
        "planSecId": "F00000Y5QI",
        "componentes": [
            {"isin": "US78462F1030", "nombre": "SPDR S&P 500 ETF Trust", "categoria": "Acciones EEUU", "moneda": "USD", "peso": 20},
            {"isin": "US4642871507", "nombre": "iShares Core S&P Total US Stock Market", "categoria": "Acciones EEUU", "moneda": "USD", "peso": 20},
            {"isin": "IE00B3YCGJ38", "nombre": "Invesco S&P 500 UCITS ETF", "categoria": "Acciones EEUU", "moneda": "USD", "peso": 15},
            {"isin": "LU1437015735", "nombre": "Amundi MSCI Europe UCITS ETF", "categoria": "Acciones Europa", "moneda": "EUR", "peso": 13},
            {"isin": "IE00B4K48X80", "nombre": "iShares Core MSCI Europe UCITS ETF", "categoria": "Acciones Europa", "moneda": "EUR", "peso": 10},
            {"isin": "US9219438580", "nombre": "Vanguard FTSE Developed ETF", "categoria": "Acciones Global", "moneda": "USD", "peso": 5},
        ],
    },
    {
        "id": "indexa-pensiones-bonos",
        "entidad": "Indexa Capital",
        "nombre": "Indexa Más Rentabilidad Bonos PP (DGS N5137)",
        "perfilRiesgo": "Plan de Pensiones · 100% Renta Fija Global (ETFs)",
        "riesgo": 3,
        "comisionTotal": "0,55%",
        "rentabilidad1a": None,
        "actualizado": None,
        "fuenteUrl": INDEXA_URL,
        "planSecId": "F00000Y5QH",
        "componentes": [
            {"isin": "IE00BDBRDM35", "nombre": "iShares Core Global Aggregate Bond ETF", "categoria": "Bonos Globales IG", "moneda": "EUR", "peso": 20},
            {"isin": "IE00BF1QPL78", "nombre": "SPDR Bloomberg Global Aggregate Bond ETF", "categoria": "Bonos Globales IG", "moneda": "EUR", "peso": 15},
            {"isin": "LU0378818131", "nombre": "Xtrackers II Global Gov 1C EUR Hgd", "categoria": "Bonos Gobiernos Global", "moneda": "EUR", "peso": 5},
        ],
    },
    {
        "id": "finizens-agresivo",
        "entidad": "Finizens",
        "nombre": "Finizens · Cartera Agresiva (#5)",
        "perfilRiesgo": "Cartera Indexada Global · Perfil Agresivo",
        "riesgo": 6,
        "comisionTotal": "0,51% – 0,68%",
        "rentabilidad1a": None,
        "actualizado": None,
        "fuenteUrl": FINIZENS_URL,
        "planSecId": None,
        "componentes": [
            {"isin": "IE00BFPM9V94", "nombre": "Vanguard US 500 Index Inst Plus", "gestora": "Vanguard", "moneda": "EUR", "peso": None},
            {"isin": "IE00BFPM9L96", "nombre": "Vanguard European Index Inst Plus", "gestora": "Vanguard", "moneda": "EUR", "peso": None},
            {"isin": "IE00BFPM9P35", "nombre": "Vanguard Japan Index Inst Plus", "gestora": "Vanguard", "moneda": "EUR", "peso": None},
            {"isin": "IE00BGCC5G60", "nombre": "Vanguard Pacific ex-Japan Index Inst Plus", "gestora": "Vanguard", "moneda": "EUR", "peso": None},
            {"isin": "IE00BFPM9J74", "nombre": "Vanguard Emerging Market Index Inst Plus", "gestora": "Vanguard", "moneda": "EUR", "peso": None},
            {"isin": "IE00BFRTDD83", "nombre": "Vanguard Global Small-Cap Index Inst Plus", "gestora": "Vanguard", "moneda": "EUR", "peso": None},
            {"isin": "IE00BDRK7P73", "nombre": "iShares Developed Real Estate Index Inst", "gestora": "BlackRock", "moneda": "EUR", "peso": None},
        ],
    },
]


def _descargar_texto(url, timeout=10):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8", "replace")


def _limpiar_html(txt):
    sin_tags = re.sub(r"<[^>]+>", " ", txt or "")
    return re.sub(r"\s+", " ", html.unescape(sin_tags)).strip()


def _parsear_pct(txt):
    m = re.search(r"(\d+(?:[.,]\d+)?)\s*%", txt or "")
    if not m:
        return None
    try:
        return round(float(m.group(1).replace(",", ".")), 2)
    except ValueError:
        return None


def _slug(texto):
    rep = (
        ("á", "a"), ("é", "e"), ("í", "i"), ("ó", "o"), ("ú", "u"), ("ñ", "n"),
        ("Á", "a"), ("É", "e"), ("Í", "i"), ("Ó", "o"), ("Ú", "u"), ("Ñ", "n"),
    )
    out = (texto or "").lower()
    for a, b in rep:
        out = out.replace(a, b)
    return re.sub(r"[^a-z0-9]+", "-", out).strip("-")


def _parsear_myinvestor_html(html_txt):
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html_txt or "", re.S)
    if not m:
        return []
    try:
        data = json.loads(m.group(1))
    except json.JSONDecodeError:
        return []

    portfolios = []

    def _buscar(obj):
        if isinstance(obj, dict):
            funds = obj.get("funds")
            if isinstance(funds, list) and funds and isinstance(funds[0], dict) and "isin" in funds[0]:
                portfolios.append(obj)
            for v in obj.values():
                _buscar(v)
        elif isinstance(obj, list):
            for v in obj:
                _buscar(v)

    _buscar(data)
    salida = []
    vistos = set()
    for p in portfolios:
        raw_name = (p.get("name") or p.get("title") or "").strip()
        if not raw_name:
            continue
        cid = f"myinvestor-{_slug(raw_name)}"
        if cid in vistos:
            continue
        vistos.add(cid)

        comps = []
        for f in p.get("funds") or []:
            isin = (f.get("isin") or "").strip().upper()
            if not RE_ISIN.fullmatch(isin):
                continue
            peso = f.get("percentage")
            try:
                peso_num = round(float(peso), 2) if peso is not None else None
            except (TypeError, ValueError):
                peso_num = None
            comps.append({
                "isin": isin,
                "nombre": (f.get("name") or isin).strip(),
                "categoria": (f.get("category") or f.get("myinvestorCategory") or "").strip() or None,
                "moneda": (f.get("currency") or "EUR").strip().upper(),
                "peso": peso_num,
            })
        if not comps:
            continue

        peso_rv = sum(
            (c["peso"] or 0)
            for c in comps
            if "renta variable" in (c.get("categoria") or "").lower()
        )
        peso_rv_i = round(peso_rv)
        peso_rf_i = max(0, 100 - peso_rv_i) if peso_rv_i <= 100 else 0
        rent_1a = p.get("profitability")
        try:
            rent_1a = round(float(rent_1a), 2) if rent_1a is not None else None
        except (TypeError, ValueError):
            rent_1a = None

        comm = p.get("commissions") or {}
        com_tot = comm.get("total") if isinstance(comm, dict) else None
        actualizado = (p.get("updatedAt") or p.get("publishedAt") or "")[:10] or None
        perfil_txt = f"{peso_rv_i}% RV / {peso_rf_i}% RF · Roboadvisor MyInvestor"
        if peso_rv_i == 100:
            perfil_txt = "100% RV · Roboadvisor MyInvestor"

        salida.append({
            "id": cid,
            "entidad": "MyInvestor",
            "nombre": f"MyInvestor · Cartera {raw_name}",
            "perfilRiesgo": perfil_txt,
            "riesgo": p.get("risk"),
            "comisionTotal": f"{str(com_tot).replace('.', ',')}%" if com_tot else "0,41% – 0,43%",
            "rentabilidad1a": rent_1a,
            "actualizado": actualizado,
            "fuenteUrl": MYINVESTOR_URL,
            "planSecId": None,
            "componentes": comps,
        })
    return salida


def _parsear_indexa_html(html_txt):
    """Extrae las carteras modelo y planes de pensiones de indexacapital.com/es/esp/model."""
    if not html_txt:
        return []

    tablas = []
    for m in re.finditer(r"<table[^>]*>.*?</table>", html_txt, re.S):
        tb = m.group(0)
        if not RE_ISIN.search(tb):
            continue
        before = html_txt[max(0, m.start() - 700) : m.start()]
        hs = re.findall(r"<h[1-5][^>]*>(.*?)</h[1-5]>", before, re.S)
        titulo = _limpiar_html(hs[-1]) if hs else ""

        rows = re.findall(r"<tr[^>]*>(.*?)</tr>", tb, re.S)
        headers = [
            _limpiar_html(c).lower()
            for c in re.findall(r"<th[^>]*>(.*?)</th>", rows[0], re.S)
        ] if rows else []

        comps = []
        for rw in rows[1:]:
            cells = [_limpiar_html(c) for c in re.findall(r"<t[hd][^>]*>(.*?)</t[hd]>", rw, re.S)]
            if not cells:
                continue
            isin = next((RE_ISIN.search(c).group(0) for c in cells if RE_ISIN.search(c)), None)
            if not isin:
                continue

            idx_isin = next((i for i, c in enumerate(cells) if isin in c), 0)
            nombre = None
            categoria = None
            moneda = "EUR"
            peso = None

            if any("clase de activo" in h for h in headers) and len(cells) >= 3:
                categoria = cells[0] or None
                nombre = cells[1] or isin
                for h, c in zip(headers, cells):
                    if "divisa" in h and c in ("EUR", "USD", "GBP", "CHF"):
                        moneda = c
                    elif "peso" in h:
                        peso = _parsear_pct(c)
            else:
                nombre = cells[0] if idx_isin > 0 else (cells[1] if len(cells) > 1 else isin)
                if len(cells) > idx_isin + 1 and cells[idx_isin + 1]:
                    categoria = cells[idx_isin + 1]

            if any(c["isin"] == isin for c in comps):
                continue
            comps.append({
                "isin": isin,
                "nombre": nombre or isin,
                "categoria": categoria,
                "moneda": moneda,
                "peso": peso,
            })

        if comps:
            tablas.append((titulo, comps))

    if not tablas:
        return []

    salida = []
    vistos = set()

    def _add(cid, nombre, perfil, riesgo, comision, comps, plan_sec_id=None):
        if cid in vistos or not comps:
            return
        vistos.add(cid)
        salida.append({
            "id": cid,
            "entidad": "Indexa Capital",
            "nombre": nombre,
            "perfilRiesgo": perfil,
            "riesgo": riesgo,
            "comisionTotal": comision,
            "rentabilidad1a": None,
            "actualizado": dt.date.today().isoformat(),
            "fuenteUrl": INDEXA_URL,
            "planSecId": plan_sec_id,
            "componentes": comps,
        })

    # Clasificar tablas detectadas según sus ISINs/títulos característicos
    for titulo, comps in tablas:
        isins_set = {c["isin"] for c in comps}
        tit_l = titulo.lower()
        if "acciones" in tit_l or "US78462F1030" in isins_set:
            _add(
                "indexa-pensiones-acciones",
                "Indexa Más Rentabilidad Acciones PP (DGS N5138)",
                "Plan de Pensiones · 100% RV Global (ETFs)",
                6,
                "0,53%",
                comps,
                plan_sec_id="F00000Y5QI",
            )
        elif "bonos" in tit_l or "IE00BDBRDM35" in isins_set:
            _add(
                "indexa-pensiones-bonos",
                "Indexa Más Rentabilidad Bonos PP (DGS N5137)",
                "Plan de Pensiones · 100% RF Global (ETFs)",
                3,
                "0,55%",
                comps,
                plan_sec_id="F00000Y5QH",
            )
        elif len(comps) <= 4 and "IE00BFPM9N11" in isins_set:
            _add(
                "indexa-fondos-menos-10k",
                "Indexa Capital · Carteras de Fondos (< 10.000 €)",
                "Fondos Vanguard Institutional Plus",
                5,
                "0,51% – 0,56%",
                comps,
            )
        elif 8 <= len(comps) <= 10 and "IE00BFPM9L96" in isins_set:
            _add(
                "indexa-fondos-10k-100k",
                "Indexa Capital · Carteras de Fondos (10k – 100k €)",
                "Fondos institucionales · Diversificación regional",
                5,
                "0,48% – 0,53%",
                comps,
            )
        elif len(comps) >= 11 and "IE00BFPM9L96" in isins_set:
            _add(
                "indexa-fondos-mas-100k",
                "Indexa Capital · Carteras de Fondos (> 100.000 €)",
                "Máxima granularidad institucional (12 fondos)",
                5,
                "0,42% – 0,48%",
                comps,
            )
        elif "IE00BFPM9S65" in isins_set:
            _add(
                "indexa-fondos-isr",
                "Indexa Capital · Carteras de Fondos ISR (Sostenibles)",
                "Fondos indexados con sesgo sostenible ESG",
                5,
                "0,52% – 0,58%",
                comps,
            )

    return salida


def _parsear_finizens_html(html_txt):
    """Agrupa las tablas de instrumentos de finizens.com por cada cartera oficial."""
    if not html_txt:
        return []

    carteras_cfg = [
        ("Defensivo", "finizens-defensivo", "Finizens · Cartera Defensiva (#0)", "100% Renta Fija y Monetarios", 1),
        ("Conservador", "finizens-conservador", "Finizens · Cartera Conservadora (#1)", "Baja exposición a RV (~18%)", 2),
        ("Cauto", "finizens-cauto", "Finizens · Cartera Cauta (#2)", "Mixto defensivo (~35% RV)", 3),
        ("Equilibrado", "finizens-equilibrado", "Finizens · Cartera Equilibrada (#3)", "Mixto equilibrado (~53% RV)", 4),
        ("Decidido", "finizens-decidido", "Finizens · Cartera Decidida (#4)", "Crecimiento (~68% RV)", 5),
        ("Atrevido", "finizens-atrevido", "Finizens · Cartera Atrevida (#5)", "Dinámico global (~83% RV)", 6),
        ("Agresivo", "finizens-agresivo", "Finizens · Cartera Agresiva (#6)", "100% RV + Bienes Raíces", 6),
        ("Monetario", "finizens-monetario", "Finizens · Cartera Monetario", "Liquidez y fondos monetarios EUR", 1),
        ("USA+", "finizens-usa-plus", "Finizens · Cartera USA+", "Exposición reforzada a EE. UU.", 6),
        ("Inmobiliario Internacional", "finizens-inmobiliario", "Finizens · Inmobiliario Internacional", "REITs globales", 5),
        ("Top Value España", "finizens-top-value", "Finizens · Cartera Top Value España", "Fondos value seleccionados", 6),
    ]

    por_cartera = {etq: [] for etq, *_ in carteras_cfg}
    vistos_por_cartera = {etq: set() for etq, *_ in carteras_cfg}

    for m in re.finditer(r"<table[^>]*>.*?</table>", html_txt, re.S):
        tb = m.group(0)
        if not RE_ISIN.search(tb):
            continue
        rows = re.findall(r"<tr[^>]*>(.*?)</tr>", tb, re.S)
        for rw in rows[1:]:
            cells = [_limpiar_html(c) for c in re.findall(r"<t[hd][^>]*>(.*?)</t[hd]>", rw, re.S)]
            if len(cells) < 2:
                continue
            isin = next((RE_ISIN.search(c).group(0) for c in cells if RE_ISIN.search(c)), None)
            if not isin:
                continue
            nombre = cells[0]
            gestora = cells[2] if len(cells) >= 3 else None
            en_carteras = cells[-1] if len(cells) >= 4 else ""
            for etq, *_ in carteras_cfg:
                # Coincidencia por palabra completa (incluyendo "Atr..." truncado o completo)
                if etq.lower() in en_carteras.lower():
                    if isin in vistos_por_cartera[etq]:
                        continue
                    vistos_por_cartera[etq].add(isin)
                    por_cartera[etq].append({
                        "isin": isin,
                        "nombre": nombre,
                        "gestora": gestora,
                        "moneda": "EUR",
                        "peso": None,
                    })

    salida = []
    for etq, cid, titulo, perfil, riesgo in carteras_cfg:
        comps = por_cartera.get(etq) or []
        if not comps:
            continue
        salida.append({
            "id": cid,
            "entidad": "Finizens",
            "nombre": titulo,
            "perfilRiesgo": perfil,
            "riesgo": riesgo,
            "comisionTotal": "0,51% – 0,68%",
            "rentabilidad1a": None,
            "actualizado": dt.date.today().isoformat(),
            "fuenteUrl": FINIZENS_URL,
            "planSecId": None,
            "componentes": comps,
        })
    return salida


def _cargar_myinvestor():
    return _parsear_myinvestor_html(_descargar_texto(MYINVESTOR_URL))


def _cargar_indexa():
    return _parsear_indexa_html(_descargar_texto(INDEXA_URL))


def _cargar_finizens():
    return _parsear_finizens_html(_descargar_texto(FINIZENS_URL))


def cargar_catalogo(forzar=False):
    """Devuelve las carteras oficiales actualizadas en directo (caché TTL 6 h)."""
    ahora = time.monotonic()
    if (
        not forzar
        and _CACHE_CATALOGO["carteras"]
        and (ahora - _CACHE_CATALOGO["ts"]) < _CACHE_CATALOGO_TTL
    ):
        return _CACHE_CATALOGO["carteras"]

    resultado = []
    with ThreadPoolExecutor(max_workers=3) as ex:
        fut_my = ex.submit(lambda: _seguro(_cargar_myinvestor))
        fut_ix = ex.submit(lambda: _seguro(_cargar_indexa))
        fut_fz = ex.submit(lambda: _seguro(_cargar_finizens))
        my_list = fut_my.result()
        ix_list = fut_ix.result()
        fz_list = fut_fz.result()

    cargadas_ids = {c["id"] for c in (my_list + ix_list + fz_list)}
    resultado.extend(my_list)
    resultado.extend(ix_list)
    resultado.extend(fz_list)

    # Completar con el snapshot de respaldo solo las entidades que hayan fallado temporalmente.
    if not my_list:
        resultado.extend([c for c in _FALLBACK_CARTERAS if c["entidad"] == "MyInvestor" and c["id"] not in cargadas_ids])
    if not ix_list:
        resultado.extend([c for c in _FALLBACK_CARTERAS if c["entidad"] == "Indexa Capital" and c["id"] not in cargadas_ids])
    if not fz_list:
        resultado.extend([c for c in _FALLBACK_CARTERAS if c["entidad"] == "Finizens" and c["id"] not in cargadas_ids])

    _CACHE_CATALOGO["ts"] = ahora
    _CACHE_CATALOGO["carteras"] = resultado
    return resultado


def _seguro(fn):
    try:
        return fn() or []
    except Exception:
        return []


def _resumen_cartera(c):
    comps = c.get("componentes") or []
    ter_label = c.get("comisionTotal")
    return {
        "fuente": "catalogo",
        "codigo": c["id"],
        "carteraId": c["id"],
        "nombre": c["nombre"],
        "tipo": "cartera",
        "identificador": c["id"].upper(),
        "isin": None,
        "ticker": None,
        "politica": None,
        "cobertura": None,
        "rentabilidad1a": c.get("rentabilidad1a"),
        "actualizado": c.get("actualizado"),
        "fuenteUrl": c.get("fuenteUrl"),
        "entidadSugerida": c.get("entidad"),
        "perfilRiesgo": c.get("perfilRiesgo"),
        "comisionTotal": ter_label,
        "numComponentes": len(comps),
        "planSecId": c.get("planSecId"),
        "precio": 0,
        "fecha": c.get("actualizado") or dt.date.today().isoformat(),
        "moneda": "EUR",
        "mercado": f"Cartera {c['entidad']}",
        "ficha": {
            "gestora": c.get("entidad"),
            "clase": c.get("perfilRiesgo"),
            "riesgo": c.get("riesgo"),
        },
        "componentes": comps[:4],
    }


def listar_carteras(q="", solo_titulo=False):
    """Busca y lista carteras indexadas cuyo título, entidad o componentes coincidan."""
    catalogo = cargar_catalogo()
    texto = (q or "").strip().lower()
    if not texto or texto in _GENERICAS_CARTERA:
        return [_resumen_cartera(c) for c in catalogo]

    palabras = [p for p in re.split(r"\s+", texto) if len(p) >= 2]
    puntuadas = []
    for c in catalogo:
        texto_base = " ".join([
            c.get("entidad") or "",
            c.get("nombre") or "",
            c.get("perfilRiesgo") or "",
        ]).lower()
        texto_comps = (
            ""
            if solo_titulo
            else " ".join(
                f"{comp.get('nombre', '')} {comp.get('isin', '')} {comp.get('categoria', '')}"
                for comp in (c.get("componentes") or [])
            ).lower()
        )
        score = 0
        if texto in texto_base:
            score += 20
        elif not solo_titulo and texto in texto_comps:
            score += 8
        for p in palabras:
            if p in texto_base:
                score += 10
            elif not solo_titulo and p in texto_comps:
                score += 3
        if score > 0:
            puntuadas.append((score, c))

    puntuadas.sort(key=lambda x: (-x[0], x[1]["entidad"], x[1]["nombre"]))
    return [_resumen_cartera(c) for _, c in puntuadas]


def buscar_cartera_por_plan_secid(secid):
    """Vincula un plan de pensiones (p. ej. Indexa N5138/N5137) con sus subyacentes reales."""
    if not secid:
        return None
    objetivo = secid.strip().upper()
    for c in cargar_catalogo():
        if (c.get("planSecId") or "").upper() == objetivo:
            return {"carteraId": c["id"], "numComponentes": len(c.get("componentes") or [])}
    return None


def _resolver_componente(comp):
    """Enriquece un producto miembro de una cartera con su código, precio y ficha en vivo."""
    from . import buscar

    out = dict(comp)
    isin = (comp.get("isin") or "").strip().upper()
    if not isin:
        return out

    # 1. Morningstar (fondos y ETFs europeos, incluidas clases S e institucionales)
    filas = buscar._intenta(
        buscar.ms_buscar, isin, "FOESP$$ALL|FOEUR$$ALL|ETEUR$$ALL", False, 4
    )
    if filas:
        preferida = next((f for f in filas if f.get("PriceCurrency") == "EUR"), filas[0])
        sec_id = preferida.get("SecId")
        if sec_id:
            precio_info = buscar.probar("morningstar", sec_id)
            if precio_info:
                out.update({
                    "fuente": "morningstar",
                    "codigo": sec_id,
                    "tipo": "etf" if str(preferida.get("Universe", "")).startswith("ET") else "fondo",
                    "precio": precio_info.get("precio"),
                    "fecha": precio_info.get("fecha"),
                    "moneda": precio_info.get("moneda") or comp.get("moneda") or "EUR",
                    "ter": preferida.get("OngoingCharge"),
                    "riesgo": preferida.get("CollectedSRRI"),
                    "gestora": preferida.get("BrandingCompanyName") or comp.get("gestora"),
                    "clase": preferida.get("CategoryName") or comp.get("categoria"),
                    "politica": buscar._inferir_politica(
                        preferida.get("Name") or comp.get("nombre"),
                        preferida.get("DistributionStatus"),
                    ),
                    "rentabilidad1a": (
                        round(float(preferida["ReturnM12"]), 2)
                        if preferida.get("ReturnM12") is not None
                        else None
                    ),
                })
                return out

    # 2. Yahoo Finance como respaldo (ETFs de EE. UU. como los planes de Indexa o acciones)
    quotes = buscar._intenta(buscar.yahoo_buscar, isin, 6)
    for x in quotes:
        sym = x.get("symbol")
        if not sym or sym.startswith("0P"):
            continue
        p = buscar.probar("yahoo", sym)
        if p:
            t_yh = buscar.TIPO_YAHOO.get(x.get("quoteType"), "etf")
            out.update({
                "fuente": "yahoo",
                "codigo": sym,
                "tipo": t_yh,
                "precio": p.get("precio"),
                "fecha": p.get("fecha"),
                "moneda": p.get("moneda") or comp.get("moneda") or "USD",
                "rentabilidad1a": p.get("rentabilidad1a"),
                "politica": buscar._inferir_politica(comp.get("nombre")),
                "gestora": buscar._inferir_gestora(comp.get("nombre"), comp.get("gestora")),
                "clase": comp.get("categoria"),
            })
            return out

    return out


def obtener_cartera_enriquecida(cartera_id):
    """Devuelve la composición completa y cotizaciones vivas de una cartera indexada."""
    cid = (cartera_id or "").strip().lower()
    if not RE_CARTERA_ID.fullmatch(cid):
        return None

    ahora = time.monotonic()
    cached = _CACHE_DETALLE.get(cid)
    if cached and (ahora - cached[0]) < _CACHE_DETALLE_TTL:
        return cached[1]

    catalogo = cargar_catalogo()
    base = next((c for c in catalogo if c["id"] == cid), None)
    if not base:
        return None

    comps_raw = base.get("componentes") or []
    with ThreadPoolExecutor(max_workers=6) as ex:
        comps_res = list(ex.map(_resolver_componente, comps_raw))

    resumen = _resumen_cartera(base)
    resumen["componentes"] = comps_res

    if len(_CACHE_DETALLE) >= _CACHE_DETALLE_MAX:
        mas_antigua = min(_CACHE_DETALLE.items(), key=lambda kv: kv[1][0])[0]
        _CACHE_DETALLE.pop(mas_antigua, None)
    _CACHE_DETALLE[cid] = (ahora, resumen)
    return resumen
