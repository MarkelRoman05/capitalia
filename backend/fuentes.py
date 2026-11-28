# -*- coding: utf-8 -*-
"""
fuentes.py  ·  Descarga de cotizaciones, caché en disco, FX y precios en vivo
==============================================================================
Aísla todas las operaciones de red (Yahoo Finance, Morningstar, CoinGecko,
Binance) y caché en disco del motor de cálculo financiero puro (`calculos.py`).
"""

import datetime as dt
import json
import os
import re
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

CACHE = "cache"
SIN_RED = False
SOLO_FALTAN = False
UA = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    )
}
FUENTES = {
    "morningstar": "Morningstar",
    "yahoo": "Yahoo Finance",
    "coingecko": "CoinGecko",
    "manual": "Valor anotado a mano",
}

AVISOS = []
_COTIZACIONES = {}


def aviso(txt):
    AVISOS.append(txt)
    print("  [!] " + txt)


def configurar_entorno(cache_dir, sin_red=False, solo_faltan=False, limpiar=True):
    global CACHE, SIN_RED, SOLO_FALTAN
    CACHE = cache_dir
    SIN_RED = sin_red
    SOLO_FALTAN = solo_faltan
    if limpiar:
        AVISOS.clear()
        _COTIZACIONES.clear()


def _d(s):
    return dt.date.fromisoformat(s)


def _r4(x):
    return None if x is None else round(float(x), 4)


def lee_cache(ruta):
    if os.path.exists(ruta):
        try:
            with open(ruta, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {}


def guarda_cache(ruta, serie):
    with open(ruta, "w", encoding="utf-8") as f:
        json.dump(serie, f)


def clave_serie(p):
    return {"morningstar": "MS:", "coingecko": "CG:"}.get(p.get("fuente"), "") + (p.get("codigo") or "")


def mover_fin_de_semana(serie):
    out = {k: v for k, v in serie.items() if dt.date.fromisoformat(k).weekday() < 5}
    for k in sorted(serie):
        fecha_d = dt.date.fromisoformat(k)
        if fecha_d.weekday() >= 5:
            out.setdefault((fecha_d - dt.timedelta(days=fecha_d.weekday() - 4)).isoformat(), serie[k])
    return out


def combinar_vl(ms, yahoo, nombre=""):
    """Une Morningstar y Yahoo resolviendo huecos y discrepancias a favor de Morningstar."""
    out, discrepan, cubiertos = {}, 0, 0
    for f in set(ms) | set(yahoo):
        m, y = ms.get(f), yahoo.get(f)
        if m and y:
            if abs(m - y) <= 0.0006:
                out[f] = y
            else:
                out[f] = m
                discrepan += 1
        elif m:
            out[f] = m
            cubiertos += 1
        else:
            out[f] = y
    print(
        f"  ..  {nombre}: {len(out)} VL, {cubiertos} huecos de Yahoo cubiertos por Morningstar"
        + (f", {discrepan} discrepancias resueltas a favor de Morningstar" if discrepan else "")
    )
    return out


def rellenar(serie, eje):
    """Proyecta {fecha: valor} sobre el eje diario arrastrando el último valor."""
    claves = sorted(serie)
    if not claves:
        return [None] * len(eje)
    out, i, ultimo = [], 0, None
    for f in eje:
        fi = f.isoformat()
        while i < len(claves) and claves[i] <= fi:
            ultimo = serie[claves[i]]
            i += 1
        out.append(ultimo)
    return out


def valor_en(serie, fecha, margen=10):
    """Último valor conocido en o antes de 'fecha'."""
    f = fecha if isinstance(fecha, dt.date) else _d(fecha)
    for i in range(margen + 1):
        k = (f - dt.timedelta(days=i)).isoformat()
        if k in serie:
            return serie[k]
    return None


def fecha_en(serie, fecha, margen=10):
    """Fecha del último dato disponible en o antes de 'fecha'."""
    f = fecha if isinstance(fecha, dt.date) else _d(fecha)
    for i in range(margen + 1):
        k = (f - dt.timedelta(days=i)).isoformat()
        if k in serie:
            return k
    return None


def a_euros(serie, serie_fx):
    """Convierte cada cierre con el cambio de su mismo día (o el último anterior)."""
    if serie_fx is None:
        return dict(serie)
    out = {}
    for k, v in serie.items():
        x = valor_en(serie_fx, k, margen=5)
        if x:
            out[k] = v * x
    return out


def simbolo_fx(moneda):
    """Par de Yahoo para pasar una moneda a euros y factor previo (peniques -> libras)."""
    m = (moneda or "EUR").strip()
    if m in ("GBp", "GBX"):
        return "GBPEUR=X", 0.01
    m = m.upper()
    if m == "EUR":
        return None, 1.0
    return f"{m}EUR=X", 1.0


def en_euros(serie, moneda, series):
    """Convierte una serie en 'moneda' a euros con el cambio de cada día."""
    sim, factor = simbolo_fx(moneda)
    if sim:
        fx = series.get(sim) or {}
        if not fx:
            if serie:
                aviso(f"No tengo el cambio {sim}: no puedo pasar a euros los precios en {moneda}.")
            return {}
        serie = a_euros(serie, fx)
    return {k: v * factor for k, v in serie.items()} if factor != 1 else dict(serie)


def precio_eur(p, series, tolerancia=0.03):
    """Precio diario en euros de un producto, contrastado con línea de respaldo si existe."""
    if p["id"] in _COTIZACIONES:
        return _COTIZACIONES[p["id"]]

    if p.get("fuente") == "yahoo":
        principal = en_euros(series.get(p.get("codigo"), {}), p.get("moneda"), series)
    elif p.get("fuente") in ("morningstar", "coingecko"):
        principal = dict(series.get(clave_serie(p), {}))
    else:
        principal = {}
    respaldo = (
        en_euros(series.get(p["respaldo"], {}), p.get("respaldoMoneda"), series)
        if p.get("respaldo")
        else {}
    )
    if not respaldo:
        _COTIZACIONES[p["id"]] = principal
        return principal

    out, sustituidos, ultimo = {}, 0, None
    for f in sorted(set(principal) | set(respaldo)):
        pr, rs = principal.get(f), respaldo.get(f)
        if pr and rs:
            if abs(pr / rs - 1) <= tolerancia:
                v = pr
            else:
                v, sustituidos = rs, sustituidos + 1
        elif rs:
            v = rs
        else:
            if ultimo and abs(pr / ultimo - 1) > 0.15:
                sustituidos += 1
                continue
            v = pr
        out[f] = v
        ultimo = v
    if sustituidos:
        print(
            f"  ..  {p.get('corto')}: {sustituidos} cierres de {p.get('codigo')} no cuadraban "
            f"y se han sustituido por {p['respaldo']}"
        )
    _COTIZACIONES[p["id"]] = out
    return out


def descargar_serie(simbolo, anos=None):
    """Devuelve {fecha_iso: cierre} descargando de Yahoo Finance, con caché en disco."""
    os.makedirs(CACHE, exist_ok=True)
    ruta = os.path.join(CACHE, re.sub(r"[^A-Za-z0-9._-]", "_", simbolo) + ".json")
    previo = lee_cache(ruta)
    if SIN_RED or (SOLO_FALTAN and previo):
        return previo

    url = (
        "https://query1.finance.yahoo.com/v8/finance/chart/"
        f"{urllib.parse.quote(simbolo)}?range={f'{anos}y' if anos else 'max'}&interval=1d"
    )
    try:
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=30) as resp:
            bruto = json.loads(resp.read().decode("utf-8", "replace"))
        res = bruto["chart"]["result"][0]
        cierres = res["indicators"]["quote"][0].get("close", [])
        nuevo = {}
        for ts, c in zip(res.get("timestamp", []), cierres):
            if c is not None:
                nuevo[dt.date.fromtimestamp(ts).isoformat()] = float(c)
        if nuevo:
            previo.update(nuevo)
            with open(ruta, "w", encoding="utf-8") as f:
                json.dump(previo, f)
            print(
                f"  OK  {simbolo:16s} {len(nuevo):5d} sesiones  "
                f"ultimo {sorted(nuevo)[-1]} = {nuevo[sorted(nuevo)[-1]]:.4f}"
            )
        else:
            aviso(f"{simbolo}: Yahoo no devolvio cotizaciones, uso la cache.")
    except Exception as e:
        if previo:
            aviso(f"{simbolo}: sin conexion ({type(e).__name__}), uso la cache guardada.")
        else:
            aviso(f"{simbolo}: sin conexion y sin cache ({type(e).__name__}).")
    return previo


def descargar_morningstar(secid, universo="]2]0]FOESP$$ALL", anos=30):
    """Serie diaria de valores liquidativos de Morningstar, con caché en disco."""
    os.makedirs(CACHE, exist_ok=True)
    ruta = os.path.join(CACHE, "MS_" + re.sub(r"[^A-Za-z0-9]", "_", secid) + ".json")
    previo = lee_cache(ruta)
    if SIN_RED or (SOLO_FALTAN and previo):
        return mover_fin_de_semana(previo)
    hoy_ = dt.date.today()
    q = {
        "currencyId": "EUR",
        "idtype": "Morningstar",
        "frequency": "daily",
        "startDate": (hoy_ - dt.timedelta(days=365 * anos)).isoformat(),
        "endDate": hoy_.isoformat(),
        "outputType": "COMPACTJSON",
        "id": secid + universo,
    }
    url = "https://lt.morningstar.com/api/rest.svc/timeseries_price/t92wz0sj7c?" + urllib.parse.urlencode(
        q, safe="]$"
    )
    try:
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=30) as resp:
            datos = json.loads(resp.read().decode("utf-8", "replace"))
        nuevo = {
            dt.datetime.fromtimestamp(x[0] / 1000, dt.timezone.utc).date().isoformat(): float(x[1])
            for x in datos
            if x and len(x) > 1 and x[1] is not None
        }
        if nuevo:
            previo.update(nuevo)
            with open(ruta, "w", encoding="utf-8") as f:
                json.dump(previo, f)
            print(
                f"  OK  Morningstar {secid:12s} {len(nuevo):5d} VL  "
                f"ultimo {max(nuevo)} = {nuevo[max(nuevo)]:.4f}"
            )
        else:
            aviso(f"Morningstar {secid}: sin datos, uso la cache.")
    except Exception as e:
        if previo:
            aviso(f"Morningstar {secid}: sin conexion ({type(e).__name__}), uso la cache guardada.")
        else:
            aviso(f"Morningstar {secid}: no disponible ({type(e).__name__}); solo Yahoo.")
    return mover_fin_de_semana(previo)


def descargar_coingecko(coin, dias=365):
    """Serie diaria en euros de CoinGecko, con caché en disco."""
    os.makedirs(CACHE, exist_ok=True)
    ruta = os.path.join(CACHE, "CG_" + re.sub(r"[^A-Za-z0-9._-]", "_", coin) + ".json")
    previo = lee_cache(ruta)
    if SIN_RED or (SOLO_FALTAN and previo):
        return previo
    url = (
        f"https://api.coingecko.com/api/v3/coins/{urllib.parse.quote(coin)}/market_chart"
        f"?vs_currency=eur&days={dias}&interval=daily"
    )
    try:
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=30) as resp:
            datos = json.loads(resp.read().decode("utf-8", "replace"))
        nuevo = {
            dt.datetime.fromtimestamp(ts / 1000, dt.timezone.utc).date().isoformat(): float(v)
            for ts, v in datos.get("prices", [])
            if v is not None
        }
        if nuevo:
            previo.update(nuevo)
            guarda_cache(ruta, previo)
            print(
                f"  OK  CoinGecko {coin:14s} {len(nuevo):5d} dias  "
                f"ultimo {max(nuevo)} = {nuevo[max(nuevo)]:.2f}"
            )
        else:
            aviso(f"CoinGecko {coin}: sin datos, uso los precios guardados.")
    except Exception as e:
        aviso(
            f"CoinGecko {coin}: no responde ({type(e).__name__}), uso los precios guardados."
            if previo
            else f"CoinGecko {coin}: no responde y no tengo precios guardados."
        )
    return previo


def precio_yahoo_vivo(simbolo):
    """Obtiene el último precio de mercado intradía de Yahoo Finance para un símbolo."""
    if not simbolo:
        return None
    url = (
        "https://query1.finance.yahoo.com/v8/finance/chart/"
        f"{urllib.parse.quote(simbolo)}?range=1d&interval=1m"
    )
    try:
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=10) as resp:
            bruto = json.loads(resp.read().decode("utf-8", "replace"))
        meta = bruto["chart"]["result"][0]["meta"]
        precio = meta.get("regularMarketPrice")
        if precio is not None and float(precio) > 0:
            return float(precio)
    except Exception:
        return None
    return None


def precios_coingecko_vivo(coins):
    """Obtiene precios en EUR en tiempo real de CoinGecko (con respaldo Binance para BTC)."""
    unicos = sorted({c for c in coins if c})
    if not unicos:
        return {}
    out = {}
    try:
        ids = urllib.parse.quote(",".join(unicos))
        url = f"https://api.coingecko.com/api/v3/simple/price?ids={ids}&vs_currencies=eur"
        req = urllib.request.Request(url, headers=UA)
        with urllib.request.urlopen(req, timeout=10) as resp:
            datos = json.loads(resp.read().decode("utf-8", "replace"))
        for c in unicos:
            val = (datos.get(c) or {}).get("eur")
            if val is not None and float(val) > 0:
                out[c] = float(val)
    except Exception:
        pass
    if "bitcoin" in unicos and "bitcoin" not in out:
        try:
            req = urllib.request.Request(
                "https://api.binance.com/api/v3/ticker/price?symbol=BTCEUR",
                headers=UA,
            )
            with urllib.request.urlopen(req, timeout=8) as resp:
                j = json.loads(resp.read().decode("utf-8", "replace"))
            val = float(j.get("price") or 0)
            if val > 0:
                out["bitcoin"] = val
        except Exception:
            pass
    return out


def obtener_precios_vivo(productos_cfg):
    """Devuelve {producto_id: precio_eur_vivo} en paralelo para acciones, ETFs y cripto."""
    simbolos_yh = set()
    coins_cg = set()
    for p in productos_cfg or []:
        f = p.get("fuente")
        cod = p.get("codigo")
        if f == "yahoo" and cod:
            simbolos_yh.add(cod)
            fx_sim, _ = simbolo_fx(p.get("moneda"))
            if fx_sim:
                simbolos_yh.add(fx_sim)
            if p.get("respaldo"):
                simbolos_yh.add(p["respaldo"])
                fx_resp, _ = simbolo_fx(p.get("respaldoMoneda"))
                if fx_resp:
                    simbolos_yh.add(fx_resp)
        elif f == "coingecko" and cod:
            coins_cg.add(cod)
        if p.get("vivo"):
            coins_cg.add(p["vivo"])

    if not simbolos_yh and not coins_cg:
        return {}

    precios_yh = {}
    precios_cg = {}
    max_workers = min(8, max(1, len(simbolos_yh) + (1 if coins_cg else 0)))
    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        fut_yh = {s: pool.submit(precio_yahoo_vivo, s) for s in simbolos_yh}
        fut_cg = pool.submit(precios_coingecko_vivo, coins_cg) if coins_cg else None
        for s, fut in fut_yh.items():
            try:
                val = fut.result()
                if val is not None:
                    precios_yh[s] = val
            except Exception:
                pass
        if fut_cg is not None:
            try:
                precios_cg = fut_cg.result() or {}
            except Exception:
                precios_cg = {}

    resultado = {}
    for p in productos_cfg or []:
        pid = p.get("id")
        if not pid:
            continue
        f = p.get("fuente")
        cod = p.get("codigo")
        if f == "yahoo" and cod:
            px = precios_yh.get(cod)
            mon = p.get("moneda")
            if px is None and p.get("respaldo"):
                px = precios_yh.get(p["respaldo"])
                mon = p.get("respaldoMoneda")
            if px is not None:
                fx_sim, factor = simbolo_fx(mon)
                if fx_sim:
                    fx_val = precios_yh.get(fx_sim)
                    if fx_val:
                        resultado[pid] = _r4(px * factor * fx_val)
                else:
                    resultado[pid] = _r4(px * factor)
        elif f == "coingecko" and cod:
            px = precios_cg.get(cod)
            if px is not None:
                resultado[pid] = _r4(px)
    return resultado


def descarga_series(productos_cfg, series=None):
    """Descarga (o lee de la caché) las series que necesitan esos productos."""
    series = {} if series is None else series

    def pide(clave, fn, *args):
        if clave and clave not in series:
            series[clave] = fn(*args)

    def pide_fx(moneda):
        sim = simbolo_fx(moneda)[0]
        pide(sim, descargar_serie, sim)

    for p in productos_cfg:
        f, cod = p.get("fuente"), p.get("codigo")
        if cod and f == "yahoo":
            pide(cod, descargar_serie, cod)
            pide_fx(p.get("moneda"))
        elif cod and f == "morningstar" and "MS:" + cod not in series:
            ms = descargar_morningstar(cod)
            yh = descargar_serie(cod + ".F") if cod.startswith("0P") else {}
            series["MS:" + cod] = combinar_vl(ms, yh, p.get("corto", cod)) if ms else yh
        elif cod and f == "coingecko":
            pide("CG:" + cod, descargar_coingecko, cod)
        if p.get("respaldo"):
            pide(p["respaldo"], descargar_serie, p["respaldo"])
            pide_fx(p.get("respaldoMoneda"))
        if p.get("vivo"):
            pide("CG:" + p["vivo"], descargar_coingecko, p["vivo"])
    return series


def serie_producto(p, carpeta, fresca=False):
    """Precio diario en euros de un producto suelto."""
    configurar_entorno(os.path.join(carpeta, "cache"), sin_red=False, solo_faltan=not fresca, limpiar=False)
    _COTIZACIONES.pop(p.get("id"), None)
    p = dict(p, id=p.get("id") or "_suelto")
    s = precio_eur(p, descarga_series([p]))
    _COTIZACIONES.pop(p["id"], None)
    return s


def serie_cambio(moneda, carpeta):
    """Cambio diario de 'moneda' a euros ({} si es EUR), con caché."""
    configurar_entorno(os.path.join(carpeta, "cache"), sin_red=False, solo_faltan=True, limpiar=False)
    sim = simbolo_fx(moneda)[0]
    return descargar_serie(sim) if sim else {}
