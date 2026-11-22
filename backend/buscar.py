# -*- coding: utf-8 -*-
"""
buscar.py  ·  Encuentra un producto por ISIN, ticker o nombre
=============================================================
Consulta Morningstar, Yahoo Finance y CoinGecko, enriquece la ficha de cada
producto (ISIN, gestora, política Acumulación/Distribución, cobertura, TER,
riesgo SRRI, rentabilidad 1A, patrimonio y rating), agrupa bolsas alternativas
de un mismo ETF y verifica la cotización antes de proponer resultados.
"""

import datetime as dt
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

from . import carteras_catalogo
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
TIPO_YAHOO = {
    "EQUITY": "accion",
    "ETF": "etf",
    "MUTUALFUND": "fondo",
    "CRYPTOCURRENCY": "cripto",
    "FUTURE": "commodity",
}
TIPOS_BUSQUEDA_VALIDOS = {"todos", "fondo", "etf", "pension", "cartera", "accion", "cripto"}

ALIAS_PENSIONES = {
    "caixabank": "CABK",
    "la caixa": "CABK",
    "vidacaixa": "CABK",
    "ing": "Naranja",
    "ing direct": "Naranja",
    "pension": "",
    "pensiones": "",
    "plan de pensiones": "",
    "planes de pensiones": "",
}

ENTIDADES_BANCOS = [
    ("myinvestor", "MyInvestor"),
    ("indexa", "Indexa Capital"),
    ("finizens", "Finizens"),
    ("bbva", "BBVA"),
    ("cabk", "CaixaBank"),
    ("caixabank", "CaixaBank"),
    ("vidacaixa", "CaixaBank"),
    ("santander", "Santander"),
    ("naranja", "ING"),
    ("bankinter", "Bankinter"),
    ("ibercaja", "Ibercaja"),
    ("kutxabank", "Kutxabank"),
    ("cobas", "Cobas"),
    ("openbank", "Openbank"),
    ("renta 4", "Renta 4"),
]

# Bolsas (código MIC de Morningstar) -> nombre corto y sufijo del ticker en Yahoo.
BOLSAS = {
    "XETR": ("Xetra", ".DE"),
    "XFRA": ("Fráncfort", ".F"),
    "XSTU": ("Stuttgart", ".SG"),
    "XPAR": ("París", ".PA"),
    "XAMS": ("Ámsterdam", ".AS"),
    "XMIL": ("Milán", ".MI"),
    "XMAD": ("Madrid", ".MC"),
    "XBRU": ("Bruselas", ".BR"),
    "XSWX": ("Suiza", ".SW"),
    "XLON": ("Londres", ".L"),
    "XWBO": ("Viena", ".VI"),
    "XLIS": ("Lisboa", ".LS"),
}

# Nombre descriptivo con país/mercado para distinguir dónde cotiza cada ETF o acción.
BOLSAS_DETALLE = {
    "XETR": "Xetra (Alemania)",
    "XETRA": "Xetra (Alemania)",
    "GER": "Xetra (Alemania)",
    "XFRA": "Fráncfort (Alemania)",
    "FRANKFURT": "Fráncfort (Alemania)",
    "FRÁNCFORT": "Fráncfort (Alemania)",
    "FRA": "Fráncfort (Alemania)",
    "XSTU": "Stuttgart (Alemania)",
    "STUTTGART": "Stuttgart (Alemania)",
    "STU": "Stuttgart (Alemania)",
    "XAMS": "Euronext Ámsterdam",
    "AMSTERDAM": "Euronext Ámsterdam",
    "ÁMSTERDAM": "Euronext Ámsterdam",
    "AMS": "Euronext Ámsterdam",
    "XMIL": "Borsa Italiana (Milán)",
    "MILAN": "Borsa Italiana (Milán)",
    "MILÁN": "Borsa Italiana (Milán)",
    "MIL": "Borsa Italiana (Milán)",
    "XPAR": "Euronext París",
    "PARIS": "Euronext París",
    "PARÍS": "Euronext París",
    "PAR": "Euronext París",
    "XMAD": "Bolsa de Madrid",
    "MADRID": "Bolsa de Madrid",
    "MCE": "Bolsa de Madrid",
    "MC": "Bolsa de Madrid",
    "XLON": "Bolsa de Londres",
    "LONDON": "Bolsa de Londres",
    "LONDRES": "Bolsa de Londres",
    "LSE": "Bolsa de Londres",
    "XSWX": "SIX Swiss (Zúrich)",
    "SUIZA": "SIX Swiss (Zúrich)",
    "SWISS EXCHANGE": "SIX Swiss (Zúrich)",
    "EBS": "SIX Swiss (Zúrich)",
    "XBRU": "Euronext Bruselas",
    "BRUSELAS": "Euronext Bruselas",
    "XWBO": "Bolsa de Viena",
    "VIENA": "Bolsa de Viena",
    "XLIS": "Euronext Lisboa",
    "LISBOA": "Euronext Lisboa",
    "NASDAQ": "NASDAQ (EE. UU.)",
    "NASDAQGS": "NASDAQ (EE. UU.)",
    "NASDAQGM": "NASDAQ (EE. UU.)",
    "NASDAQCM": "NASDAQ (EE. UU.)",
    "NMS": "NASDAQ (EE. UU.)",
    "NGM": "NASDAQ (EE. UU.)",
    "NCM": "NASDAQ (EE. UU.)",
    "NYSE": "NYSE (Nueva York)",
    "NYQ": "NYSE (Nueva York)",
    "NYSEARCA": "NYSE Arca (EE. UU.)",
    "PCX": "NYSE Arca (EE. UU.)",
    "BATS": "Cboe BZX (EE. UU.)",
    "BTS": "Cboe BZX (EE. UU.)",
    "OTC MARKETS": "Mercado OTC",
    "PNK": "Mercado OTC",
    "MORNINGSTAR": "Morningstar ES",
    "COINGECKO": "CoinGecko",
}

PRIORIDAD_BOLSA_ETF = {
    "Xetra (Alemania)": 0,
    "Euronext Ámsterdam": 1,
    "Bolsa de Madrid": 2,
    "Euronext París": 3,
    "Borsa Italiana (Milán)": 4,
    "Fráncfort (Alemania)": 5,
    "Bolsa de Londres": 6,
    "SIX Swiss (Zúrich)": 7,
    "NYSE Arca (EE. UU.)": 8,
}

GESTORAS_CONOCIDAS = [
    ("ishares", "iShares (BlackRock)"),
    ("blackrock", "BlackRock"),
    ("vanguard", "Vanguard"),
    ("amundi", "Amundi"),
    ("xtrackers", "Xtrackers (DWS)"),
    ("dws", "DWS"),
    ("fidelity", "Fidelity"),
    ("invesco", "Invesco"),
    ("spdr", "SPDR (State Street)"),
    ("state street", "State Street"),
    ("wisdomtree", "WisdomTree"),
    ("bnp paribas", "BNP Paribas"),
    ("pictet", "Pictet"),
    ("dimensional", "Dimensional"),
    ("robeco", "Robeco"),
    ("ubs", "UBS"),
    ("hsbc", "HSBC"),
    ("jpmorgan", "JPMorgan"),
    ("jp morgan", "JPMorgan"),
    ("lyxor", "Amundi / Lyxor"),
    ("vaneck", "VanEck"),
    ("global x", "Global X"),
    ("franklin", "Franklin Templeton"),
    ("schroder", "Schroders"),
    ("morgan stanley", "Morgan Stanley"),
    ("fundsmith", "Fundsmith"),
    ("magallanes", "Magallanes"),
    ("azvalor", "Azvalor"),
    ("cobas", "Cobas"),
    ("indexa", "Indexa"),
    ("myinvestor", "MyInvestor"),
]

MS_SERIE = "https://lt.morningstar.com/api/rest.svc/timeseries_price/t92wz0sj7c?"
MS_BUSCA = "https://lt.morningstar.com/api/rest.svc/9vehuxllxs/security/screener?"
MS_DATAPOINTS = (
    "SecId|Name|isin|Universe|PriceCurrency|ExchangeId|Ticker|"
    "OngoingCharge|CollectedSRRI|CategoryName|BrandingCompanyName|"
    "ReturnM12|DistributionStatus|FundTNAV|StarRatingM255"
)

# Fallos de conexión (no "no existe"): el importador y el buscador los usan para no
# decir "no encuentro" cuando en realidad no ha llegado a internet.
FALLOS = []

_CACHE_BUSQUEDA = {}
_CACHE_BUSQUEDA_TTL = 300.0
_CACHE_BUSQUEDA_MAX = 128


def _de_red(e):
    if isinstance(e, urllib.error.HTTPError):
        return e.code == 429 or e.code >= 500
    return isinstance(e, (urllib.error.URLError, TimeoutError, OSError))


def _get(url, timeout=15, reintentos=3):
    for intento in range(1, reintentos + 1):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.loads(r.read().decode("utf-8", "replace"))
        except Exception as e:
            if not _de_red(e):
                raise
            if intento >= reintentos:
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


# ---------------------------------------------------------------- helpers de enriquecimiento

def _formatear_bolsa(valor):
    if not valor:
        return None
    txt = str(valor).strip()
    if not txt:
        return None
    clave = txt.upper()
    if clave in BOLSAS_DETALLE:
        return BOLSAS_DETALLE[clave]
    return txt


def _inferir_politica(nombre, dist_status=None):
    """Distingue entre fondos/ETFs de acumulación y distribución."""
    ds = (str(dist_status or "")).strip().upper()
    if ds in ("A", "ACC", "ACCUMULATING", "ACUMULACIÓN", "ACUMULACION", "C", "CAP"):
        return "Acumulación"
    if ds in ("D", "DIST", "DISTRIBUTING", "INC", "INCOME", "DISTRIBUCIÓN", "DISTRIBUCION"):
        return "Distribución"

    n = f" {(nombre or '').lower()} "
    if re.search(r"(\(acc\)|\bacc\.?\b|\baccumulating\b|\baccumulation\b|\bacumulaci[oó]n\b|\bcap\.?\b|-c\b|\bae-c\b|\biu-c\b|\b1c\b)", n):
        return "Acumulación"
    if re.search(r"(\(dist?\)|\bdist\.?\b|\bdistributing\b|\bdistribution\b|\bdistribuci[oó]n\b|\binc\.?\b|\bincome\b|-d\b|\bre-d\b|\bae-d\b|\biu-d\b|\b1d\b)", n):
        return "Distribución"
    return None


def _inferir_cobertura(nombre):
    """Detecta si una clase o ETF lleva divisa cubierta (p. ej. EUR Hedged)."""
    n = f" {(nombre or '').lower()} "
    if not re.search(r"(\bhedged\b|\bhdg\b|\beur[- ]h\b|\bcubierto\b|\bhedge\b)", n):
        return None
    if re.search(r"\beur\b|\beur[- ]h", n):
        return "Cubierto EUR"
    if re.search(r"\busd\b|\busd[- ]h", n):
        return "Cubierto USD"
    if re.search(r"\bgbp\b|\bgbp[- ]h", n):
        return "Cubierto GBP"
    return "Cubierto"


def _inferir_gestora(nombre, gestora=None):
    if gestora and str(gestora).strip():
        return str(gestora).strip()
    n = (nombre or "").lower()
    for patron, etq in GESTORAS_CONOCIDAS:
        if patron in n:
            return etq
    return None


def _inferir_entidad_banco(nombre, gestora=None):
    txt = f"{nombre or ''} {gestora or ''}".lower()
    for patron, banco in ENTIDADES_BANCOS:
        if patron in txt:
            return banco
    return None


def _limpiar_nombre_etf_para_agrupar(nombre):
    s = (nombre or "").lower()
    s = re.sub(r"\((acc|dist?|eur|usd|gbp|chf)\)", " ", s)
    s = re.sub(r"\b(ucits|etf|plc|icav|sicav|iii|i+|class|cl)\b", " ", s)
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return " ".join(s.split())


def _clave_agrupacion_etf(item):
    """Genera una clave estable para agrupar listados de un mismo ETF en varias bolsas."""
    if item.get("tipo") != "etf":
        return None
    isin = (item.get("isin") or "").strip().upper()
    if isin and ES_ISIN.match(isin):
        return ("isin", isin)
    nombre_limpio = _limpiar_nombre_etf_para_agrupar(item.get("nombre") or "")
    if not nombre_limpio:
        return None
    return (
        "nombre",
        nombre_limpio,
        item.get("politica") or "",
        item.get("cobertura") or "",
    )


def _clave_yahoo_de_ms(fila):
    """Obtiene el ticker de Yahoo para una fila ETF de Morningstar si la bolsa es conocida."""
    bolsa, sufijo = BOLSAS.get((fila.get("ExchangeId") or "")[-4:], (None, None))
    ticker = (fila.get("Ticker") or "").strip()
    if sufijo and ticker:
        return f"{ticker}{sufijo}", bolsa
    return None, bolsa


def _fusionar_metadatos(dest, src):
    """Completa en `dest` los metadatos útiles disponibles en `src` sin pisar código/fuente."""
    for campo in ("isin", "politica", "cobertura", "rentabilidad1a", "patrimonio", "estrellas"):
        if not dest.get(campo) and src.get(campo) is not None:
            dest[campo] = src[campo]
    if dest.get("isin") and not ES_ISIN.match(str(dest.get("identificador") or "")):
        dest["identificador"] = dest["isin"]
    f_dest = dict(dest.get("ficha") or {})
    for k, v in (src.get("ficha") or {}).items():
        if v not in (None, "") and k not in f_dest:
            f_dest[k] = v
    if f_dest:
        dest["ficha"] = f_dest


# ---------------------------------------------------------------- fuentes

def yahoo_buscar(q, n=12, timeout=8, reintentos=1):
    url = ("https://query2.finance.yahoo.com/v1/finance/search?"
           + urllib.parse.urlencode({"q": q, "quotesCount": n, "newsCount": 0}))
    return [x for x in _get(url, timeout=timeout, reintentos=reintentos).get("quotes", []) if x.get("symbol")]


def ms_buscar(texto, universo="FOESP$$ALL|ETEUR$$ALL", ordenar_por_tamano=True, limite=10, timeout=8, reintentos=1):
    q = {
        "page": 1,
        "pageSize": limite,
        "outputType": "json",
        "version": 1,
        "languageId": "es-ES",
        "currencyId": "EUR",
        "universeIds": universo,
        "securityDataPoints": MS_DATAPOINTS,
        "term": texto,
    }
    if ordenar_por_tamano:
        q["sortOrder"] = "FundTNAV desc"
    return _get(MS_BUSCA + urllib.parse.urlencode(q), timeout=timeout, reintentos=reintentos).get("rows", [])


def cg_buscar(q, timeout=6, reintentos=1):
    url = "https://api.coingecko.com/api/v3/search?" + urllib.parse.urlencode({"query": q})
    return _get(url, timeout=timeout, reintentos=reintentos).get("coins", [])


def probar(fuente, codigo):
    """Último precio y variación que da la fuente: {precio, fecha, moneda, ...} o None."""
    try:
        if fuente == "yahoo":
            url = ("https://query1.finance.yahoo.com/v8/finance/chart/"
                   f"{urllib.parse.quote(codigo)}?range=1y&interval=1d")
            res = _get(url)["chart"]["result"][0]
            meta = res["meta"]
            cierres = [
                (ts, c)
                for ts, c in zip(
                    res.get("timestamp", []),
                    res["indicators"]["quote"][0].get("close", []),
                )
                if c is not None and c > 0
            ]
            if not cierres:
                return None
            ts, c = cierres[-1]
            rent_1a = None
            if len(cierres) >= 20 and cierres[0][1] > 0:
                rent_1a = round(((c - cierres[0][1]) / cierres[0][1]) * 100, 2)
            cambio_dia = meta.get("regularMarketChangePercent")
            if cambio_dia is not None:
                cambio_dia = round(float(cambio_dia), 2)
            elif len(cierres) >= 2 and cierres[-2][1] > 0:
                cambio_dia = round(((c - cierres[-2][1]) / cierres[-2][1]) * 100, 2)
            return {
                "precio": round(c, 4),
                "fecha": dt.date.fromtimestamp(ts).isoformat(),
                "moneda": meta.get("currency") or "EUR",
                "nombre": meta.get("longName") or meta.get("shortName"),
                "mercado": meta.get("fullExchangeName") or meta.get("exchangeName"),
                "rentabilidad1a": rent_1a,
                "cambioDia": cambio_dia,
            }
        if fuente == "morningstar":
            hoy = dt.date.today()
            for univ_ms in ("]2]0]FOESP$$ALL", "]2]0]FOESP$$PEN"):
                q = {
                    "currencyId": "EUR",
                    "idtype": "Morningstar",
                    "frequency": "daily",
                    "startDate": (hoy - dt.timedelta(days=20)).isoformat(),
                    "endDate": hoy.isoformat(),
                    "outputType": "COMPACTJSON",
                    "id": codigo + univ_ms,
                }
                datos = [
                    x
                    for x in _get(MS_SERIE + urllib.parse.urlencode(q, safe="]$"))
                    if x and x[1]
                ]
                if datos:
                    ts, v = datos[-1][:2]
                    return {
                        "precio": round(v, 4),
                        "moneda": "EUR",
                        "mercado": "Morningstar Pensiones" if "PEN" in univ_ms else "Morningstar ES",
                        "fecha": dt.datetime.fromtimestamp(ts / 1000, dt.timezone.utc).date().isoformat(),
                    }
            return None
        if fuente == "coingecko":
            url = ("https://api.coingecko.com/api/v3/simple/price?"
                   + urllib.parse.urlencode(
                       {"ids": codigo, "vs_currencies": "eur", "include_24hr_change": "true"}
                   ))
            info = _get(url).get(codigo, {})
            v = info.get("eur")
            if not v:
                return None
            chg = info.get("eur_24h_change")
            return {
                "precio": v,
                "moneda": "EUR",
                "fecha": dt.date.today().isoformat(),
                "mercado": "CoinGecko",
                "cambioDia": round(float(chg), 2) if chg is not None else None,
            }
    except Exception:
        return None
    return None


# ---------------------------------------------------------------- búsqueda

def buscar(texto, tipo="todos"):
    """Lista de candidatos con precio comprobado y ficha enriquecida."""
    q = (texto or "").strip()[:120]
    tipo_filtro = (tipo or "todos").strip().lower()
    if tipo_filtro not in TIPOS_BUSQUEDA_VALIDOS:
        tipo_filtro = "todos"
    if not q and tipo_filtro not in ("cartera", "pension"):
        return []

    clave_cache = (q.lower(), tipo_filtro)
    ahora = time.monotonic()
    entrada_cache = _CACHE_BUSQUEDA.get(clave_cache)
    if entrada_cache and (ahora - entrada_cache[0]) < _CACHE_BUSQUEDA_TTL:
        return entrada_cache[1]

    if tipo_filtro == "cartera":
        salida_cart = carteras_catalogo.listar_carteras(q)[:18]
        _CACHE_BUSQUEDA[clave_cache] = (ahora, salida_cart)
        return salida_cart

    cands = []
    es_isin = bool(ES_ISIN.match(q.upper()))

    def _extraer_ficha(fila, nombre=None):
        gestora = _inferir_gestora(nombre or fila.get("Name"), fila.get("BrandingCompanyName"))
        raw = {
            "ter": fila.get("OngoingCharge"),
            "riesgo": fila.get("CollectedSRRI"),
            "clase": fila.get("CategoryName"),
            "gestora": gestora,
        }
        return {k: v for k, v in raw.items() if v not in (None, "")}

    def añade(
        fuente,
        codigo,
        nombre,
        tipo_act,
        identificador=None,
        vivo=None,
        mercado=None,
        ficha=None,
        isin=None,
        ticker=None,
        politica=None,
        cobertura=None,
        rentabilidad1a=None,
        patrimonio=None,
        estrellas=None,
        entidad_sugerida=None,
        cartera_id=None,
        num_componentes=None,
    ):
        for existente in cands:
            if existente["fuente"] == fuente and existente["codigo"] == codigo:
                return existente
        gestora_inf = _inferir_gestora(nombre, (ficha or {}).get("gestora"))
        ficha_final = dict(ficha or {})
        if gestora_inf and "gestora" not in ficha_final:
            ficha_final["gestora"] = gestora_inf

        item = {
            "fuente": fuente,
            "codigo": codigo,
            "nombre": nombre,
            "tipo": tipo_act,
            "identificador": identificador or isin or codigo,
            "vivo": vivo,
            "bolsa": mercado,
            "isin": isin or (identificador if identificador and ES_ISIN.match(str(identificador).upper()) else None),
            "ticker": ticker or (codigo if fuente == "yahoo" and not codigo.startswith("0P") else None),
            "politica": politica or (_inferir_politica(nombre) if tipo_act in ("fondo", "etf") else None),
            "cobertura": cobertura or (_inferir_cobertura(nombre) if tipo_act in ("fondo", "etf") else None),
            "rentabilidad1a": rentabilidad1a,
            "patrimonio": patrimonio,
            "estrellas": estrellas,
            "entidadSugerida": entidad_sugerida or _inferir_entidad_banco(nombre, ficha_final.get("gestora")),
        }
        if cartera_id:
            item["carteraId"] = cartera_id
            item["numComponentes"] = num_componentes
        if ficha_final:
            item["ficha"] = ficha_final
        cands.append(item)
        return item

    def _construir_desde_ms(fila):
        nombre = fila.get("Name")
        sec_id = fila.get("SecId")
        isin_val = fila.get("isin") or (q.upper() if es_isin else None)
        ficha_ms = _extraer_ficha(fila, nombre)
        politica = _inferir_politica(nombre, fila.get("DistributionStatus"))
        cobertura = _inferir_cobertura(nombre)
        ret_12 = fila.get("ReturnM12")
        ret_12 = round(float(ret_12), 2) if ret_12 is not None else None
        patrimonio = fila.get("FundTNAV")
        patrimonio = round(float(patrimonio), 0) if patrimonio is not None else None
        estrellas = fila.get("StarRatingM255")
        estrellas = int(estrellas) if estrellas is not None else None
        return {
            "nombre": nombre,
            "sec_id": sec_id,
            "isin": isin_val,
            "ficha": ficha_ms,
            "politica": politica,
            "cobertura": cobertura,
            "rentabilidad1a": ret_12,
            "patrimonio": patrimonio,
            "estrellas": estrellas,
            "moneda_ms": fila.get("PriceCurrency"),
            "ticker": fila.get("Ticker"),
        }

    if q.lower() in ATAJOS and tipo_filtro in ("todos",):
        cod, nombre = ATAJOS[q.lower()]
        añade("yahoo", cod, nombre, "commodity", ticker=cod)

    filas_isin = []
    if es_isin:
        isin = q.upper()
        with ThreadPoolExecutor(max_workers=3) as ex:
            f_ms = ex.submit(_intenta, ms_buscar, isin, "FOESP$$ALL|ETEUR$$ALL", False, 10)
            f_yh = ex.submit(_intenta, yahoo_buscar, isin, 10)
            filas_isin = f_ms.result()
            quotes = f_yh.result()

        cero_p = next(
            (x["symbol"].split(".")[0] for x in quotes if x["symbol"].startswith("0P")),
            None,
        )
        for f in filas_isin:
            if not f.get("Universe", "").startswith("FO"):
                continue
            meta_ms = _construir_desde_ms(f)
            añade(
                "morningstar",
                cero_p or meta_ms["sec_id"],
                meta_ms["nombre"],
                "fondo",
                identificador=isin,
                isin=isin,
                mercado="Morningstar ES",
                ficha=meta_ms["ficha"],
                politica=meta_ms["politica"],
                cobertura=meta_ms["cobertura"],
                rentabilidad1a=meta_ms["rentabilidad1a"],
                patrimonio=meta_ms["patrimonio"],
                estrellas=meta_ms["estrellas"],
            )
            cero_p = None
        if cero_p:
            añade("morningstar", cero_p, None, "fondo", identificador=isin, isin=isin, mercado="Morningstar ES")

        for x in quotes:
            sym, t_yh = x["symbol"], x.get("quoteType")
            if sym.startswith("0P") or (t_yh == "MUTUALFUND" and cands):
                continue
            t_cap = TIPO_YAHOO.get(t_yh, "otro")
            añade(
                "yahoo",
                sym,
                x.get("longname") or x.get("shortname"),
                t_cap,
                identificador=isin,
                isin=isin,
                ticker=sym,
                mercado=x.get("exchDisp") or x.get("exchange"),
            )
            if t_yh in ("ETF", "EQUITY"):
                base = sym.split(".")[0]
                for y in _intenta(yahoo_buscar, base, 10):
                    if y["symbol"].split(".")[0] == base and y.get("quoteType") == t_yh:
                        añade(
                            "yahoo",
                            y["symbol"],
                            y.get("longname") or y.get("shortname"),
                            TIPO_YAHOO.get(t_yh, "otro"),
                            identificador=isin,
                            isin=isin,
                            ticker=y["symbol"],
                            mercado=y.get("exchDisp") or y.get("exchange"),
                        )

        for f in filas_isin:
            if f.get("Universe", "").startswith("FO") or f.get("PriceCurrency") != "EUR":
                continue
            meta_ms = _construir_desde_ms(f)
            sym_yh, bolsa = _clave_yahoo_de_ms(f)
            if sym_yh:
                item_etf = añade(
                    "yahoo",
                    sym_yh,
                    meta_ms["nombre"],
                    "etf",
                    identificador=isin,
                    isin=isin,
                    ticker=sym_yh,
                    mercado=bolsa,
                    ficha=meta_ms["ficha"],
                    politica=meta_ms["politica"],
                    cobertura=meta_ms["cobertura"],
                    rentabilidad1a=meta_ms["rentabilidad1a"],
                    patrimonio=meta_ms["patrimonio"],
                    estrellas=meta_ms["estrellas"],
                )
                _fusionar_metadatos(item_etf, meta_ms)
            else:
                añade(
                    "morningstar",
                    meta_ms["sec_id"],
                    meta_ms["nombre"],
                    "etf",
                    identificador=isin,
                    isin=isin,
                    ticker=meta_ms["ticker"] or meta_ms["sec_id"],
                    mercado=bolsa,
                    ficha=meta_ms["ficha"],
                    politica=meta_ms["politica"],
                    cobertura=meta_ms["cobertura"],
                    rentabilidad1a=meta_ms["rentabilidad1a"],
                    patrimonio=meta_ms["patrimonio"],
                    estrellas=meta_ms["estrellas"],
                )
    else:
        lim_ms_fondos = 12 if tipo_filtro == "fondo" else 18
        lim_ms_etfs = 12 if tipo_filtro == "etf" else 10
        q_pen = ALIAS_PENSIONES.get(q.lower(), q)
        buscar_pen = tipo_filtro in ("todos", "pension")

        def _buscar_pensiones():
            if not q_pen:
                queries = ("MyInvestor", "Indexa", "Finizens", "Naranja", "BBVA", "CABK")
                filas = []
                with ThreadPoolExecutor(max_workers=6) as pool:
                    for lst in pool.map(
                        lambda term: _intenta(ms_buscar, term, "FOESP$$PEN", True, 3),
                        queries,
                    ):
                        filas.extend(lst)
                return filas
            if len(q_pen) < 3:
                return []
            return _intenta(
                ms_buscar,
                q_pen,
                "FOESP$$PEN",
                True,
                12 if tipo_filtro == "pension" else 5,
            )

        with ThreadPoolExecutor(max_workers=6) as ex:
            fut_ms_fo = (
                ex.submit(_intenta, ms_buscar, q, "FOESP$$ALL", True, lim_ms_fondos)
                if len(q) >= 3 and tipo_filtro in ("todos", "fondo")
                else None
            )
            fut_ms_et = (
                ex.submit(_intenta, ms_buscar, q, "ETEUR$$ALL", True, lim_ms_etfs)
                if len(q) >= 3 and tipo_filtro in ("todos", "etf")
                else None
            )
            fut_ms_pen = ex.submit(_buscar_pensiones) if buscar_pen else None
            fut_yh = (
                ex.submit(_intenta, yahoo_buscar, q, 12)
                if q and tipo_filtro in ("todos", "etf", "accion", "cripto", "fondo")
                else None
            )
            fut_cg = (
                ex.submit(_intenta, cg_buscar, q)
                if q and tipo_filtro in ("todos", "cripto")
                else None
            )
            fut_cart = (
                ex.submit(carteras_catalogo.listar_carteras, q, True)
                if q and tipo_filtro == "todos"
                else None
            )

            ms_fondos = fut_ms_fo.result() if fut_ms_fo else []
            ms_etfs = fut_ms_et.result() if fut_ms_et else []
            ms_pensiones = fut_ms_pen.result() if fut_ms_pen else []
            quotes = fut_yh.result() if fut_yh else []
            monedas = fut_cg.result() if fut_cg else []
            carteras_rel = fut_cart.result() if fut_cart else []

        # 0. Planes de pensiones (Morningstar España FOESP$$PEN)
        if buscar_pen and ms_pensiones:
            for f in ms_pensiones[: (12 if tipo_filtro == "pension" else 4)]:
                if not f.get("SecId"):
                    continue
                meta_ms = _construir_desde_ms(f)
                vinc = carteras_catalogo.buscar_cartera_por_plan_secid(meta_ms["sec_id"])
                añade(
                    "morningstar",
                    meta_ms["sec_id"],
                    meta_ms["nombre"],
                    "pension",
                    identificador=meta_ms["isin"] or meta_ms["sec_id"],
                    isin=meta_ms["isin"],
                    mercado="Morningstar Pensiones",
                    ficha=meta_ms["ficha"],
                    politica=meta_ms["politica"],
                    cobertura=meta_ms["cobertura"],
                    rentabilidad1a=meta_ms["rentabilidad1a"],
                    patrimonio=meta_ms["patrimonio"],
                    estrellas=meta_ms["estrellas"],
                    cartera_id=(vinc or {}).get("carteraId"),
                    num_componentes=(vinc or {}).get("numComponentes"),
                )

        # Mapear ETFs europeos de Morningstar por símbolo Yahoo y nombre normalizado para
        # enriquecer los resultados de Yahoo Finance con ISIN, TER, SRRI y gestora.
        meta_etf_por_sym = {}
        meta_etf_por_nombre = {}
        for f in ms_etfs:
            if not f.get("SecId"):
                continue
            meta_ms = _construir_desde_ms(f)
            sym_yh, _ = _clave_yahoo_de_ms(f)
            if sym_yh:
                meta_etf_por_sym[sym_yh.upper()] = meta_ms
            nom_norm = _limpiar_nombre_etf_para_agrupar(meta_ms["nombre"])
            if nom_norm and nom_norm not in meta_etf_por_nombre:
                meta_etf_por_nombre[nom_norm] = meta_ms

        # 1. Fondos indexados y de inversión (Morningstar)
        if tipo_filtro in ("todos", "fondo"):
            fondos_eur = [
                f for f in ms_fondos
                if f.get("SecId") and f.get("PriceCurrency") in (None, "", "EUR")
            ]
            fondos_otros = [
                f for f in ms_fondos
                if f.get("SecId") and f.get("PriceCurrency") not in (None, "", "EUR")
            ]
            ordenados_fo = fondos_eur + fondos_otros
            if tipo_filtro == "todos":
                # Diversificar por fondo maestro (máx. 2 clases por fondo) para mostrar varias gestoras
                conteo_maestro = {}
                seleccion_fo = []
                reserva_fo = []
                for f in ordenados_fo:
                    gest = (f.get("BrandingCompanyName") or "").strip().lower()
                    tnav = f.get("FundTNAV")
                    clave_m = (gest, int(tnav)) if tnav else ("nom", _limpiar_nombre_etf_para_agrupar(f.get("Name") or ""))
                    c_m = conteo_maestro.get(clave_m, 0)
                    if c_m < 2:
                        conteo_maestro[clave_m] = c_m + 1
                        seleccion_fo.append(f)
                    else:
                        reserva_fo.append(f)
                elegidos_fo = (seleccion_fo + reserva_fo)[:6]
            else:
                elegidos_fo = ordenados_fo[:8]

            for f in elegidos_fo:
                meta_ms = _construir_desde_ms(f)
                añade(
                    "morningstar",
                    meta_ms["sec_id"],
                    meta_ms["nombre"],
                    "fondo",
                    identificador=meta_ms["isin"] or meta_ms["sec_id"],
                    isin=meta_ms["isin"],
                    mercado="Morningstar ES",
                    ficha=meta_ms["ficha"],
                    politica=meta_ms["politica"],
                    cobertura=meta_ms["cobertura"],
                    rentabilidad1a=meta_ms["rentabilidad1a"],
                    patrimonio=meta_ms["patrimonio"],
                    estrellas=meta_ms["estrellas"],
                )

        # 2. Criptomonedas + Acciones + ETFs (Yahoo Finance)
        yh_etfs = []
        yh_acciones = []
        yh_cripto = []
        for x in quotes:
            sym, t_yh = x["symbol"], x.get("quoteType")
            if t_yh not in TIPO_YAHOO:
                continue
            if t_yh == "FUTURE" and q.lower() not in ATAJOS and "=F" not in q.upper():
                continue
            t_cap = TIPO_YAHOO[t_yh]
            if tipo_filtro != "todos" and t_cap != tipo_filtro:
                continue
            if t_cap == "cripto":
                yh_cripto.append(x)
            elif t_cap == "etf":
                yh_etfs.append(x)
            elif t_cap == "accion":
                yh_acciones.append(x)
            elif t_cap == "fondo" and tipo_filtro == "fondo" and not ms_fondos:
                añade(
                    "yahoo",
                    sym,
                    x.get("longname") or x.get("shortname"),
                    "fondo",
                    identificador=sym,
                    ticker=sym,
                    mercado=x.get("exchDisp") or x.get("exchange"),
                )

        for x in yh_etfs[: (10 if tipo_filtro == "etf" else 7)]:
            sym = x["symbol"]
            nom = x.get("longname") or x.get("shortname")
            extra_ms = (
                meta_etf_por_sym.get(sym.upper())
                or meta_etf_por_nombre.get(_limpiar_nombre_etf_para_agrupar(nom))
            )
            añade(
                "yahoo",
                sym,
                nom,
                "etf",
                identificador=(extra_ms or {}).get("isin") or sym,
                isin=(extra_ms or {}).get("isin"),
                ticker=sym,
                mercado=x.get("exchDisp") or x.get("exchange"),
                ficha=(extra_ms or {}).get("ficha"),
                politica=(extra_ms or {}).get("politica"),
                cobertura=(extra_ms or {}).get("cobertura"),
                rentabilidad1a=(extra_ms or {}).get("rentabilidad1a"),
                patrimonio=(extra_ms or {}).get("patrimonio"),
                estrellas=(extra_ms or {}).get("estrellas"),
            )

        # Añadir ETFs europeos de Morningstar que no hayan salido en Yahoo
        if tipo_filtro in ("todos", "etf"):
            etfs_ms_eur = [
                f for f in ms_etfs
                if f.get("SecId") and f.get("PriceCurrency") in (None, "", "EUR")
            ]
            for f in etfs_ms_eur[:6]:
                meta_ms = _construir_desde_ms(f)
                sym_yh, bolsa = _clave_yahoo_de_ms(f)
                ident = meta_ms["isin"] or sym_yh or meta_ms["sec_id"]
                if sym_yh:
                    añade(
                        "yahoo",
                        sym_yh,
                        meta_ms["nombre"],
                        "etf",
                        identificador=ident,
                        isin=meta_ms["isin"],
                        ticker=sym_yh,
                        mercado=bolsa,
                        ficha=meta_ms["ficha"],
                        politica=meta_ms["politica"],
                        cobertura=meta_ms["cobertura"],
                        rentabilidad1a=meta_ms["rentabilidad1a"],
                        patrimonio=meta_ms["patrimonio"],
                        estrellas=meta_ms["estrellas"],
                    )
                else:
                    añade(
                        "morningstar",
                        meta_ms["sec_id"],
                        meta_ms["nombre"],
                        "etf",
                        identificador=ident,
                        isin=meta_ms["isin"],
                        ticker=meta_ms["ticker"] or meta_ms["sec_id"],
                        mercado=bolsa,
                        ficha=meta_ms["ficha"],
                        politica=meta_ms["politica"],
                        cobertura=meta_ms["cobertura"],
                        rentabilidad1a=meta_ms["rentabilidad1a"],
                        patrimonio=meta_ms["patrimonio"],
                        estrellas=meta_ms["estrellas"],
                    )

        for x in yh_acciones[: (10 if tipo_filtro == "accion" else 6)]:
            sym = x["symbol"]
            añade(
                "yahoo",
                sym,
                x.get("longname") or x.get("shortname"),
                "accion",
                identificador=sym,
                ticker=sym,
                mercado=x.get("exchDisp") or x.get("exchange"),
            )

        for x in yh_cripto[:5]:
            sym = x["symbol"]
            base = sym.split("-")[0]
            cg = next((c["id"] for c in monedas if (c.get("symbol") or "").upper() == base), None)
            añade(
                "yahoo",
                f"{base}-EUR",
                (x.get("shortname") or base).replace(" USD", ""),
                "cripto",
                identificador=base,
                ticker=f"{base}-EUR",
                vivo=cg,
                mercado="Yahoo Finance / Crypto",
            )

        if tipo_filtro in ("todos", "cripto") and not any(c["tipo"] == "cripto" for c in cands):
            for c in [m for m in monedas if m.get("market_cap_rank")][:4]:
                añade(
                    "coingecko",
                    c["id"],
                    c.get("name"),
                    "cripto",
                    identificador=(c.get("symbol") or "").upper(),
                    ticker=(c.get("symbol") or "").upper(),
                    vivo=c["id"],
                    mercado="CoinGecko",
                )

    # Ficha del fondo o ETF según Morningstar: respaldo global si la búsqueda fue por ISIN.
    if es_isin and filas_isin:
        f_rep = next(
            (f for f in filas_isin if f.get("OngoingCharge") is not None or f.get("CollectedSRRI")),
            filas_isin[0],
        )
        meta_global = _construir_desde_ms(f_rep)
        for c in cands:
            _fusionar_metadatos(c, meta_global)

    if tipo_filtro != "todos":
        cands = [c for c in cands if c.get("tipo") == tipo_filtro]

    # Tope generoso pero equilibrado antes de consultar cotizaciones en paralelo.
    cands = cands[:18]
    with ThreadPoolExecutor(max_workers=10) as ex:
        precios = list(ex.map(lambda c: probar(c["fuente"], c["codigo"]), cands))

    verificados = []
    for c, p in zip(cands, precios):
        if not p:
            continue
        c.update({k: v for k, v in p.items() if v is not None and (k != "nombre" or not c["nombre"])})
        bolsa_bruta = c.pop("bolsa", None) or c.get("mercado")
        c["mercado"] = _formatear_bolsa(bolsa_bruta)
        if not c.get("politica") and c.get("tipo") in ("fondo", "etf"):
            c["politica"] = _inferir_politica(c.get("nombre"))
        if not c.get("cobertura") and c.get("tipo") in ("fondo", "etf"):
            c["cobertura"] = _inferir_cobertura(c.get("nombre"))
        if not c.get("ficha"):
            g = _inferir_gestora(c.get("nombre"))
            if g:
                c["ficha"] = {"gestora": g}
        verificados.append(c)

    # Agrupar múltiples bolsas del mismo ETF en `alternativas` (conservando la mejor cotización como principal).
    exacto = q.upper()
    agrupados = []
    etfs_por_grupo = {}
    grupo_por_nombre = {}
    for c in verificados:
        if c.get("tipo") != "etf":
            agrupados.append(c)
            continue
        nom_norm = (
            _limpiar_nombre_etf_para_agrupar(c.get("nombre") or ""),
            c.get("politica") or "",
            c.get("cobertura") or "",
        )
        clave_etf = _clave_agrupacion_etf(c)
        if not clave_etf:
            agrupados.append(c)
            continue
        # Si ya existe un grupo para este ETF (con ISIN o por nombre equivalente), unirlos.
        if clave_etf[0] == "isin" and nom_norm[0] and nom_norm in grupo_por_nombre:
            clave_ant = grupo_por_nombre[nom_norm]
            if clave_ant != clave_etf and clave_ant in etfs_por_grupo:
                etfs_por_grupo.setdefault(clave_etf, []).extend(etfs_por_grupo.pop(clave_ant))
        elif clave_etf[0] == "nombre" and nom_norm in grupo_por_nombre:
            clave_etf = grupo_por_nombre[nom_norm]
        if nom_norm[0]:
            grupo_por_nombre[nom_norm] = clave_etf
        etfs_por_grupo.setdefault(clave_etf, []).append(c)

    def _prioridad_cotizacion_etf(item):
        bolsa = item.get("mercado") or ""
        return (
            item.get("codigo", "").upper() != exacto,
            item.get("moneda") != "EUR",
            item.get("fuente") != "yahoo",
            PRIORIDAD_BOLSA_ETF.get(bolsa, 50),
        )

    for lista_etf in etfs_por_grupo.values():
        lista_etf.sort(key=_prioridad_cotizacion_etf)
        principal = lista_etf[0]
        alternativas = []
        for alt in lista_etf[1:]:
            _fusionar_metadatos(principal, alt)
            if alt.get("codigo") == principal.get("codigo") and alt.get("fuente") == principal.get("fuente"):
                continue
            alternativas.append({
                "fuente": alt["fuente"],
                "codigo": alt["codigo"],
                "ticker": alt.get("ticker") or alt["codigo"],
                "mercado": alt.get("mercado"),
                "moneda": alt.get("moneda"),
                "precio": alt.get("precio"),
                "fecha": alt.get("fecha"),
                "cambioDia": alt.get("cambioDia"),
                "rentabilidad1a": alt.get("rentabilidad1a"),
            })
        if alternativas:
            principal["alternativas"] = alternativas
        agrupados.append(principal)

    def _orden_final(item):
        coincide_exacto = (
            item.get("codigo", "").upper() == exacto
            or (item.get("isin") or "").upper() == exacto
            or (item.get("ticker") or "").upper() == exacto
        )
        prioridad_tipo = {
            "cartera": 0,
            "pension": 1,
            "fondo": 2,
            "etf": 3,
            "accion": 4,
            "cripto": 5,
            "commodity": 6,
        }.get(item.get("tipo"), 7)
        tiene_meta = (
            0
            if (
                item.get("tipo") == "cartera"
                or item.get("isin")
                or item.get("ficha", {}).get("ter") is not None
                or item.get("entidadSugerida")
            )
            else 1
        )
        patrimonio = float(item.get("patrimonio") or 0)
        return (
            not coincide_exacto,
            item.get("moneda") != "EUR",
            tiene_meta,
            prioridad_tipo if tipo_filtro == "todos" else 0,
            -patrimonio,
        )

    if tipo_filtro == "todos" and not es_isin and carteras_rel:
        agrupados.extend(carteras_rel[:4])

    agrupados.sort(key=_orden_final)
    salida = agrupados[:14]

    if len(_CACHE_BUSQUEDA) >= _CACHE_BUSQUEDA_MAX:
        mas_antigua = min(_CACHE_BUSQUEDA.items(), key=lambda kv: kv[1][0])[0]
        _CACHE_BUSQUEDA.pop(mas_antigua, None)
    _CACHE_BUSQUEDA[clave_cache] = (ahora, salida)
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
