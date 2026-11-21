# -*- coding: utf-8 -*-
"""
buscar.py  ·  Encuentra un producto por ISIN, ticker o nombre
=============================================================
Pregunta a Morningstar, Yahoo Finance y CoinGecko, y comprueba que cada
candidato tiene precio antes de proponerlo.
"""

import datetime as dt
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

from .motor import UA

ES_ISIN = re.compile(r"^[A-Z]{2}[A-Z0-9]{9}\d$")

# Lo que Yahoo no encuentra por su nombre en castellano.
ATAJOS = {
    "oro": ("GC=F", "Oro (onza troy, futuro COMEX)"),
    "gold": ("GC=F", "Oro (onza troy, futuro COMEX)"),
    "plata": ("SI=F", "Plata (onza troy, futuro COMEX)"),
    "silver": ("SI=F", "Plata (onza troy, futuro COMEX)"),
    "platino": ("PL=F", "Platino (onza troy, futuro NYMEX)"),
    "cobre": ("HG=F", "Cobre (libra, futuro COMEX)"),
    "petroleo": ("BZ=F", "Petróleo Brent (barril)"),
    "petróleo": ("BZ=F", "Petróleo Brent (barril)"),
}
TIPO_YAHOO = {"EQUITY": "accion", "ETF": "etf", "MUTUALFUND": "fondo",
              "CRYPTOCURRENCY": "cripto", "FUTURE": "commodity"}
# Bolsas (código MIC de Morningstar) -> nombre y sufijo del ticker en Yahoo.
BOLSAS = {"XETR": ("Xetra", ".DE"), "XFRA": ("Fráncfort", ".F"), "XSTU": ("Stuttgart", ".SG"),
          "XPAR": ("París", ".PA"), "XAMS": ("Ámsterdam", ".AS"), "XMIL": ("Milán", ".MI"),
          "XMAD": ("Madrid", ".MC"), "XBRU": ("Bruselas", ".BR"), "XSWX": ("Suiza", ".SW"),
          "XLON": ("Londres", ".L"), "XWBO": ("Viena", ".VI"), "XLIS": ("Lisboa", ".LS")}
MS_SERIE = "https://lt.morningstar.com/api/rest.svc/timeseries_price/t92wz0sj7c?"
MS_BUSCA = "https://lt.morningstar.com/api/rest.svc/klr5zyak8x/security/screener?"


# Fallos de conexión (no "no existe"): el importador y el buscador los usan para no
# decir "no encuentro" cuando en realidad no ha llegado a internet.
FALLOS = []


def _de_red(e):
    if isinstance(e, urllib.error.HTTPError):
        return e.code == 429 or e.code >= 500
    return isinstance(e, (urllib.error.URLError, TimeoutError, OSError))


def _get(url, timeout=15):
    for intento in (1, 2, 3):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.loads(r.read().decode("utf-8", "replace"))
        except Exception as e:
            if not _de_red(e):
                raise
            if intento == 3:
                motivo = getattr(e, "reason", None) or getattr(e, "code", None) or e
                FALLOS.append(f"{url.split('/')[2]}: {motivo}")
                print(f"  (sin respuesta de {url.split('/')[2]}: {motivo})")
                raise
            time.sleep(1.5 * intento)


def hubo_fallos_desde(n):
    """Motivo del último fallo de conexión desde que había n registrados, o None."""
    return FALLOS[-1] if len(FALLOS) > n else None


def _intenta(fn, *args):
    try:
        return fn(*args)
    except Exception:
        return []


# ---------------------------------------------------------------- fuentes

def yahoo_buscar(q, n=8):
    url = ("https://query2.finance.yahoo.com/v1/finance/search?"
           + urllib.parse.urlencode({"q": q, "quotesCount": n, "newsCount": 0}))
    return [x for x in _get(url).get("quotes", []) if x.get("symbol")]


def ms_buscar(isin):
    q = {"page": 1, "pageSize": 10, "outputType": "json", "version": 1, "languageId": "es-ES",
         "currencyId": "EUR", "universeIds": "FOESP$$ALL|ETEUR$$ALL",
         "securityDataPoints": "SecId|Name|isin|Universe|PriceCurrency|ExchangeId|Ticker|"
                               "OngoingCharge|CollectedSRRI|CategoryName|BrandingCompanyName",
         "term": isin}
    return _get(MS_BUSCA + urllib.parse.urlencode(q)).get("rows", [])


def cg_buscar(q):
    url = "https://api.coingecko.com/api/v3/search?" + urllib.parse.urlencode({"query": q})
    return _get(url).get("coins", [])


def probar(fuente, codigo):
    """Último precio que da la fuente: {precio, fecha, moneda, nombre, mercado} o None."""
    try:
        if fuente == "yahoo":
            url = ("https://query1.finance.yahoo.com/v8/finance/chart/"
                   f"{urllib.parse.quote(codigo)}?range=1mo&interval=1d")
            res = _get(url)["chart"]["result"][0]
            meta = res["meta"]
            cierres = [(ts, c) for ts, c in zip(res.get("timestamp", []),
                                                 res["indicators"]["quote"][0].get("close", []))
                       if c is not None]
            if not cierres:
                return None
            ts, c = cierres[-1]
            return {"precio": round(c, 4), "fecha": dt.date.fromtimestamp(ts).isoformat(),
                    "moneda": meta.get("currency") or "EUR",
                    "nombre": meta.get("longName") or meta.get("shortName"),
                    "mercado": meta.get("fullExchangeName") or meta.get("exchangeName")}
        if fuente == "morningstar":
            hoy = dt.date.today()
            q = {"currencyId": "EUR", "idtype": "Morningstar", "frequency": "daily",
                 "startDate": (hoy - dt.timedelta(days=20)).isoformat(), "endDate": hoy.isoformat(),
                 "outputType": "COMPACTJSON", "id": codigo + "]2]0]FOESP$$ALL"}
            datos = [x for x in _get(MS_SERIE + urllib.parse.urlencode(q, safe="]$")) if x and x[1]]
            if not datos:
                return None
            ts, v = datos[-1][:2]
            return {"precio": round(v, 4), "moneda": "EUR", "mercado": "Morningstar",
                    "fecha": dt.datetime.fromtimestamp(ts / 1000, dt.timezone.utc).date().isoformat()}
        if fuente == "coingecko":
            url = ("https://api.coingecko.com/api/v3/simple/price?"
                   + urllib.parse.urlencode({"ids": codigo, "vs_currencies": "eur"}))
            v = _get(url).get(codigo, {}).get("eur")
            if not v:
                return None
            return {"precio": v, "moneda": "EUR", "fecha": dt.date.today().isoformat(),
                    "mercado": "CoinGecko"}
    except Exception:
        return None
    return None


# ---------------------------------------------------------------- búsqueda

def buscar(texto):
    """Lista de candidatos con precio comprobado, los más probables primero."""
    q = (texto or "").strip()
    if not q:
        return []
    cands = []

    def _extraer_ficha(fila):
        raw = {
            "ter": fila.get("OngoingCharge"),
            "riesgo": fila.get("CollectedSRRI"),
            "clase": fila.get("CategoryName"),
            "gestora": fila.get("BrandingCompanyName"),
        }
        return {k: v for k, v in raw.items() if v not in (None, "")}

    def añade(fuente, codigo, nombre, tipo, identificador=None, vivo=None, mercado=None, ficha=None):
        if not any(c["fuente"] == fuente and c["codigo"] == codigo for c in cands):
            item = {"fuente": fuente, "codigo": codigo, "nombre": nombre, "tipo": tipo,
                    "identificador": identificador or codigo, "vivo": vivo, "bolsa": mercado}
            if ficha:
                item["ficha"] = ficha
            cands.append(item)

    if q.lower() in ATAJOS:
        cod, nombre = ATAJOS[q.lower()]
        añade("yahoo", cod, nombre, "commodity")

    if ES_ISIN.match(q.upper()):
        isin = q.upper()
        filas = _intenta(ms_buscar, isin)
        quotes = _intenta(yahoo_buscar, isin)
        # Fondos: Yahoo da su código de Morningstar (0P...) y, con él, el motor
        # completa los huecos de una fuente con la otra.
        cero_p = next((x["symbol"].split(".")[0] for x in quotes
                       if x["symbol"].startswith("0P")), None)
        for f in filas:
            if f.get("Universe", "").startswith("FO"):
                añade("morningstar", cero_p or f["SecId"], f.get("Name"), "fondo", isin,
                      ficha=_extraer_ficha(f))
                cero_p = None
        if cero_p:
            añade("morningstar", cero_p, None, "fondo", isin)
        for x in quotes:
            sym, tipo = x["symbol"], x.get("quoteType")
            if sym.startswith("0P") or (tipo == "MUTUALFUND" and cands):
                continue
            añade("yahoo", sym, x.get("longname") or x.get("shortname"), TIPO_YAHOO.get(tipo, "otro"), isin)
            # Un ETF cotiza en varias bolsas: se buscan las demás para ofrecer la de euros.
            if tipo in ("ETF", "EQUITY"):
                base = sym.split(".")[0]
                for y in _intenta(yahoo_buscar, base):
                    if y["symbol"].split(".")[0] == base and y.get("quoteType") == tipo:
                        añade("yahoo", y["symbol"], y.get("longname") or y.get("shortname"),
                              TIPO_YAHOO.get(tipo, "otro"), isin)
        # Líneas del ETF en euros según Morningstar: su ticker de Yahoo en esa bolsa y,
        # como alternativa, la serie de Morningstar.
        for f in filas:
            if f.get("Universe", "").startswith("FO") or f.get("PriceCurrency") != "EUR":
                continue
            ficha_etf = _extraer_ficha(f)
            bolsa, sufijo = BOLSAS.get((f.get("ExchangeId") or "")[-4:], (None, None))
            if sufijo and f.get("Ticker"):
                añade("yahoo", f["Ticker"] + sufijo, f.get("Name"), "etf", isin,
                      mercado=bolsa, ficha=ficha_etf)
            añade("morningstar", f["SecId"], f.get("Name"), "etf", isin,
                  mercado=bolsa, ficha=ficha_etf)
    else:
        monedas = _intenta(cg_buscar, q)
        for x in _intenta(yahoo_buscar, q):
            sym, tipo = x["symbol"], x.get("quoteType")
            if tipo not in TIPO_YAHOO:
                continue
            if tipo == "CRYPTOCURRENCY":
                # Yahoo trae años de histórico en euros; CoinGecko se usa para el precio en vivo.
                base = sym.split("-")[0]
                cg = next((c["id"] for c in monedas if (c.get("symbol") or "").upper() == base), None)
                añade("yahoo", f"{base}-EUR", (x.get("shortname") or base).replace(" USD", ""),
                      "cripto", base, vivo=cg)
            else:
                añade("yahoo", sym, x.get("longname") or x.get("shortname"), TIPO_YAHOO[tipo])
        # CoinGecko solo si Yahoo no la conoce (monedas pequeñas), y solo monedas con
        # capitalización: así no se cuelan "acciones tokenizadas".
        if not any(c["tipo"] == "cripto" for c in cands):
            for c in [c for c in monedas if c.get("market_cap_rank")][:3]:
                añade("coingecko", c["id"], c.get("name"), "cripto",
                      (c.get("symbol") or "").upper(), vivo=c["id"])
        # Búsqueda por texto también en Morningstar (fondos y ETFs europeos en EUR).
        if len(q) >= 3:
            ms_filas = [
                f for f in _intenta(ms_buscar, q)
                if f.get("SecId") and (
                    f.get("PriceCurrency") in (None, "", "EUR")
                    or f.get("Universe", "").startswith("FO")
                )
            ][:5]
            for f in ms_filas:
                ficha_ms = _extraer_ficha(f)
                ident = f.get("isin") or f.get("Ticker") or f["SecId"]
                if f.get("Universe", "").startswith("FO"):
                    añade("morningstar", f["SecId"], f.get("Name"), "fondo", ident, ficha=ficha_ms)
                else:
                    bolsa, sufijo = BOLSAS.get((f.get("ExchangeId") or "")[-4:], (None, None))
                    if sufijo and f.get("Ticker"):
                        añade("yahoo", f["Ticker"] + sufijo, f.get("Name"), "etf", ident,
                              mercado=bolsa, ficha=ficha_ms)
                    añade("morningstar", f["SecId"], f.get("Name"), "etf", ident,
                          mercado=bolsa, ficha=ficha_ms)

    # Ficha del fondo o ETF según Morningstar: respaldo global si alguna fila no la traía.
    if ES_ISIN.match(q.upper()):
        f = next((f for f in filas if f.get("OngoingCharge") is not None or f.get("CollectedSRRI")), None)
        if f:
            ficha_global = _extraer_ficha(f)
            if ficha_global:
                for c in cands:
                    if not c.get("ficha"):
                        c["ficha"] = ficha_global

    cands = cands[:12]
    with ThreadPoolExecutor(max_workers=8) as ex:
        precios = list(ex.map(lambda c: probar(c["fuente"], c["codigo"]), cands))
    salida = []
    for c, p in zip(cands, precios):
        if not p:
            continue
        c.update({k: v for k, v in p.items() if v is not None and (k != "nombre" or not c["nombre"])})
        c["mercado"] = c.pop("bolsa") or c.get("mercado")
        salida.append(c)
    # Arriba: los fondos de Morningstar, luego el ticker exacto que has escrito y
    # luego lo que cotiza en euros.
    exacto = q.upper()
    salida.sort(key=lambda c: (c["fuente"] != "morningstar" or c["tipo"] != "fondo",
                               c["codigo"].upper() != exacto, c.get("moneda") != "EUR"))
    return salida


_CACHE_BANCOS = {}


def buscar_bancos(texto):
    """Busca bancos y entidades financieras en la API pública de Brandfetch."""
    q = (texto or "").strip()
    if len(q) < 2:
        return []
    clave = q.lower()
    if clave in _CACHE_BANCOS:
        return _CACHE_BANCOS[clave]

    url = f"https://api.brandfetch.io/v2/search/{urllib.parse.quote(q)}"
    try:
        datos = _get(url, timeout=8)
    except Exception:
        return []
    if not isinstance(datos, list):
        return []

    salida = []
    vistos = set()
    for item in datos:
        if not isinstance(item, dict):
            continue
        nombre = (item.get("name") or "").strip()
        dominio = (item.get("domain") or "").strip().lower()
        if not nombre or not dominio:
            continue
        if dominio in vistos or nombre.lower() in vistos:
            continue
        vistos.add(dominio)
        vistos.add(nombre.lower())

        icono = (item.get("icon") or "").strip()
        if not icono.startswith("https://"):
            icono = f"https://www.google.com/s2/favicons?domain={urllib.parse.quote(dominio)}&sz=128"

        salida.append({
            "nombre": nombre,
            "dominio": dominio,
            "logo": icono,
            "verificado": bool(item.get("verified")),
        })
        if len(salida) >= 10:
            break

    _CACHE_BANCOS[clave] = salida
    return salida


def resolver_logo_brandfetch(dominio, nombre=""):
    """Resuelve la URL oficial del logo en Brandfetch a partir de dominio o nombre."""
    dom = (dominio or "").strip().lower()
    stem = dom.split(".")[0] if "." in dom else dom
    consultas = []
    for q in (dom, (nombre or "").strip(), stem):
        if q and len(q) >= 2 and q.lower() not in {x.lower() for x in consultas}:
            consultas.append(q)

    respaldo = None
    for q in consultas:
        for item in buscar_bancos(q):
            logo = item.get("logo") or ""
            item_dom = (item.get("dominio") or "").lower()
            if "cdn.brandfetch.io" not in logo:
                continue
            if dom and (item_dom == dom or item_dom.endswith("." + dom)):
                return logo
            if respaldo is None and (
                not stem or stem in item_dom or stem in (item.get("nombre") or "").lower()
            ):
                respaldo = logo
    return respaldo
