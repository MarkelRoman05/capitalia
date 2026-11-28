# -*- coding: utf-8 -*-
"""
almacen.py  ·  Guarda y valida la cartera
=========================================
Todo lo que se escribe en mis_datos/cartera.json pasa por aquí: se comprueba
que tiene sentido y, antes de cada cambio, se guarda una copia automática.
"""

import datetime as dt
import json
import os
import re
import unicodedata

from .motor import TIPOS, FUENTES, num_es

COPIAS_MAX = 20
TIPOS_MOV = {"compra": "Compra", "venta": "Venta", "dividendo": "Dividendo o cupón",
             "comision": "Comisión", "traspaso": "Traspaso entre fondos"}
SOLO_SALDO = ("efectivo", "deuda")   # tipos que se siguen solo con saldos anotados

CARTERA_VACIA = {
    "version": 1, "titular": "Mi patrimonio",
    "productos": [], "movimientos": [], "valoraciones": [],
    "comparador": [{"id": "real", "nombre": "Mi cartera real", "real": True}],
    "hitos": [10000, 25000, 50000, 100000, 250000, 500000, 1000000],
    "objetivo": {"activo": True, "importe": 100000, "etiqueta": "Próximo objetivo"},
}


class ErrorValidacion(Exception):
    def __init__(self, errores):
        super().__init__("; ".join(errores))
        self.errores = errores


# ---------------------------------------------------------------- disco

def carga(ruta):
    with open(ruta, "r", encoding="utf-8") as f:
        return json.load(f)


def guarda(ruta, cfg):
    """Copia de seguridad automática de lo que había y escritura atómica de lo nuevo."""
    carpeta = os.path.dirname(ruta)
    copias = os.path.join(carpeta, "copias")
    if os.path.exists(ruta):
        os.makedirs(copias, exist_ok=True)
        sello = dt.datetime.now().strftime("%Y%m%d_%H%M%S_%f")
        with open(ruta, "rb") as f, open(os.path.join(copias, f"auto_{sello}.json"), "wb") as g:
            g.write(f.read())
        viejas = sorted(n for n in os.listdir(copias) if n.startswith("auto_"))
        for n in viejas[:-COPIAS_MAX]:
            os.remove(os.path.join(copias, n))
    tmp = ruta + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=1)
    os.replace(tmp, ruta)


# ---------------------------------------------------------------- ayudas

def fmt_fecha(iso):
    return f"{iso[8:10]}/{iso[5:7]}/{iso[:4]}"


def fmt_num(x):
    """12345.6 -> '12.345,6' (hasta 4 decimales, sin ceros de sobra)."""
    t = f"{x:,.4f}".rstrip("0").rstrip(".")
    return t.replace(",", "X").replace(".", ",").replace("X", ".")


def numero(valor, etiqueta, errores, obligatorio=True, minimo=None, mayor_que=None):
    """Acepta 1234.5, "1.234,56" o "1234,5". Devuelve float o None."""
    if valor is None or (isinstance(valor, str) and not valor.strip()):
        if obligatorio:
            errores.append(f"Falta {etiqueta}.")
        return None
    if isinstance(valor, bool):
        errores.append(f"{etiqueta.capitalize()} no es un número: «{valor}».")
        return None
    if isinstance(valor, (int, float)):
        x = float(valor)
    else:
        t = valor.strip().replace("€", "").replace("%", "").replace(" ", "")
        if not re.fullmatch(r"-?[\d.,]+", t):
            errores.append(f"{etiqueta.capitalize()} no es un número: «{valor}».")
            return None
        x = num_es(t)
    if minimo is not None and x < minimo:
        errores.append(f"{etiqueta.capitalize()} no puede ser menor que {minimo:g}.")
    if mayor_que is not None and x <= mayor_que:
        errores.append(f"{etiqueta.capitalize()} tiene que ser mayor que {mayor_que:g}.")
    return x


def fecha_flexible(valor, errores, etiqueta="la fecha", obligatorio=False, permitir_futura=True):
    """Acepta fecha ISO opcional; permite fechas futuras para vencimientos de bonos/hipotecas."""
    if valor is None or (isinstance(valor, str) and not valor.strip()):
        if obligatorio:
            errores.append(f"Falta {etiqueta}.")
        return None
    try:
        f = dt.date.fromisoformat(str(valor).strip()[:10])
    except ValueError:
        errores.append(f"{etiqueta.capitalize()} no es válida.")
        return None
    if not permitir_futura and f > dt.date.today():
        errores.append(f"La fecha {fmt_fecha(f.isoformat())} es futura.")
    elif f.year < 1950 or f.year > 2150:
        errores.append(f"La fecha {fmt_fecha(f.isoformat())} parece un error.")
    return f.isoformat()


def fecha(valor, errores):
    res = fecha_flexible(valor, errores, etiqueta="la fecha", obligatorio=True, permitir_futura=False)
    return res


def slug(texto, existentes):
    base = unicodedata.normalize("NFKD", texto or "producto").encode("ascii", "ignore").decode()
    base = re.sub(r"[^a-z0-9]+", "_", base.lower()).strip("_")[:30] or "producto"
    cand, i = base, 2
    while cand in existentes:
        cand, i = f"{base}_{i}", i + 1
    return cand


def siguiente_id(lista, prefijo):
    nums = [int(x["id"][1:]) for x in lista if re.fullmatch(prefijo + r"\d+", str(x.get("id", "")))]
    return f"{prefijo}{max(nums, default=0) + 1}"


def producto(cfg, pid):
    return next((p for p in cfg.get("productos", []) if p["id"] == pid), None)


def texto(v, maximo=200):
    return str(v).strip()[:maximo] if v is not None else ""


# ---------------------------------------------------------------- productos

CAMPOS_TEXTO = ("nombre", "corto", "identificador", "codigo", "entidad", "clase", "gestora",
                "tipoDetalle", "respaldo", "respaldoMoneda", "vivo", "papel", "grupoId", "grupoNombre")
FRECUENCIAS_CUPON = {"vencimiento", "anual", "semestral", "trimestral", "mensual"}
TIPOS_TASA = {"fijo", "variable"}
CAMPOS_ESPECIALIZADOS = (
    "tae", "fechaEmision", "fechaVencimiento", "cuponAnual", "frecuenciaCupon",
    "limiteAnual", "tipoMarginalIrpf",
    "tipoInteres", "tipoTasa", "cuotaMensual", "inmuebleId",
    "alquilerMensual", "gastosAnuales",
)


def guarda_producto(cfg, datos):
    """Crea o actualiza un producto. Devuelve (producto, cambió_la_fuente)."""
    errores = []
    nuevo = {k: texto(datos.get(k), 400 if k == "papel" else (120 if k == "grupoNombre" else 200)) for k in CAMPOS_TEXTO}
    for k in CAMPOS_ESPECIALIZADOS:
        nuevo[k] = None
    if nuevo.get("grupoId"):
        nuevo["grupoId"] = nuevo["grupoId"].strip().lower()
        if not re.fullmatch(r"[a-z0-9_-]{2,80}", nuevo["grupoId"]):
            errores.append("El identificador del grupo no es válido.")
    if not nuevo["nombre"]:
        errores.append("Ponle un nombre al producto.")
    tipo = datos.get("tipo")
    if tipo not in TIPOS:
        errores.append("Elige de qué tipo es el producto.")
    fuente = "manual" if tipo in SOLO_SALDO else datos.get("fuente") or "manual"
    if fuente not in FUENTES:
        errores.append("Elige de dónde sale el precio.")
    if fuente != "manual" and not nuevo["codigo"]:
        errores.append(f"Falta el código del producto en {FUENTES.get(fuente, fuente)}. "
                       "Búscalo con el buscador o elige «a mano».")
    moneda = texto(datos.get("moneda")) or "EUR"
    moneda = moneda if moneda in ("GBp", "GBX") else moneda.upper()
    if not re.fullmatch(r"[A-Z]{3}|GBp|GBX", moneda):
        errores.append(f"La moneda «{moneda}» no es válida: usa un código de tres letras, como EUR o USD.")
    ter = numero(datos.get("ter"), "la comisión anual", errores, obligatorio=False, minimo=0)
    riesgo = numero(datos.get("riesgo"), "el nivel de riesgo", errores, obligatorio=False, minimo=1)
    if riesgo is not None and riesgo > 7:
        errores.append("El nivel de riesgo va de 1 a 7.")
    peso_obj = numero(datos.get("pesoObjetivo"), "el peso objetivo", errores, obligatorio=False, minimo=0)
    if peso_obj is not None and peso_obj > 100:
        errores.append("El peso objetivo debe estar entre 0 y 100.")

    # Campos especializados por categoría (tasas en % p. ej. 3.25 = 3,25%)
    if tipo in ("bono", "efectivo", "otro"):
        tae = numero(datos.get("tae"), "la TAE", errores, obligatorio=False, minimo=0)
        if tae is not None and tae > 50:
            errores.append("La TAE debe estar entre 0 y 50 %.")
        cupon = numero(datos.get("cuponAnual"), "el cupón anual", errores, obligatorio=False, minimo=0)
        if cupon is not None and cupon > 50:
            errores.append("El cupón anual debe estar entre 0 y 50 %.")
        f_emi = fecha_flexible(datos.get("fechaEmision"), errores, "la fecha de emisión", obligatorio=False, permitir_futura=False)
        f_vto = fecha_flexible(datos.get("fechaVencimiento"), errores, "la fecha de vencimiento", obligatorio=False, permitir_futura=True)
        if f_emi and f_vto and f_vto < f_emi:
            errores.append("La fecha de vencimiento no puede ser anterior a la fecha de emisión.")
        frec = texto(datos.get("frecuenciaCupon"), 30).lower() or None
        if frec and frec not in FRECUENCIAS_CUPON:
            errores.append("La frecuencia del cupón debe ser vencimiento, anual, semestral, trimestral o mensual.")
        nuevo.update(
            tae=round(tae, 4) if tae is not None else None,
            cuponAnual=round(cupon, 4) if cupon is not None else None,
            fechaEmision=f_emi,
            fechaVencimiento=f_vto,
            frecuenciaCupon=frec,
        )
    elif tipo == "pension":
        lim = numero(datos.get("limiteAnual"), "el límite anual", errores, obligatorio=False, minimo=0)
        if lim is not None and lim > 10000:
            errores.append("El límite anual de aportación debe estar entre 0 y 10.000 €.")
        marg = numero(datos.get("tipoMarginalIrpf"), "el tipo marginal de IRPF", errores, obligatorio=False, minimo=0)
        if marg is not None and marg > 54:
            errores.append("El tipo marginal de IRPF debe estar entre 0 y 54 %.")
        nuevo.update(
            limiteAnual=round(lim, 2) if lim is not None else None,
            tipoMarginalIrpf=round(marg, 2) if marg is not None else None,
        )
    elif tipo == "deuda":
        ti = numero(datos.get("tipoInteres"), "el tipo de interés", errores, obligatorio=False, minimo=0)
        if ti is not None and ti > 30:
            errores.append("El tipo de interés debe estar entre 0 y 30 %.")
        t_tasa = texto(datos.get("tipoTasa"), 20).lower() or None
        if t_tasa and t_tasa not in TIPOS_TASA:
            errores.append("El tipo de tasa debe ser fijo o variable.")
        cuota = numero(datos.get("cuotaMensual"), "la cuota mensual", errores, obligatorio=False, minimo=0)
        f_vto = fecha_flexible(datos.get("fechaVencimiento"), errores, "la fecha de vencimiento", obligatorio=False, permitir_futura=True)
        inmu_id = texto(datos.get("inmuebleId"), 80) or None
        if inmu_id:
            if not re.fullmatch(r"[A-Za-z0-9_-]{1,80}", inmu_id):
                errores.append("El identificador del inmueble vinculado no es válido.")
            else:
                inmu_obj = producto(cfg, inmu_id)
                if inmu_obj and inmu_obj.get("tipo") != "inmueble":
                    errores.append("El producto vinculado a la deuda debe ser de tipo inmueble.")
        nuevo.update(
            tipoInteres=round(ti, 4) if ti is not None else None,
            tipoTasa=t_tasa,
            cuotaMensual=round(cuota, 2) if cuota is not None else None,
            fechaVencimiento=f_vto,
            inmuebleId=inmu_id,
        )
    elif tipo == "inmueble":
        alq = numero(datos.get("alquilerMensual"), "el alquiler mensual", errores, obligatorio=False, minimo=0)
        gas = numero(datos.get("gastosAnuales"), "los gastos anuales", errores, obligatorio=False, minimo=0)
        nuevo.update(
            alquilerMensual=round(alq, 2) if alq is not None else None,
            gastosAnuales=round(gas, 2) if gas is not None else None,
        )

    if errores:
        raise ErrorValidacion(errores)

    nuevo.update(tipo=tipo, fuente=fuente, moneda=moneda,
                 largoPlazo=bool(datos.get("largoPlazo", True)),
                 slot=int(datos["slot"]) if str(datos.get("slot") or "").isdigit() else None,
                 ter=ter / 100 if ter is not None else None,
                 riesgo=int(riesgo) if riesgo is not None else None,
                 pesoObjetivo=round(peso_obj, 2) if peso_obj is not None else None)
    if fuente == "manual":
        nuevo.update(codigo="", respaldo="", respaldoMoneda="")
    nuevo["corto"] = nuevo["corto"] or nuevo["nombre"][:24]

    existente = producto(cfg, datos.get("id")) if datos.get("id") else None
    if existente:
        cambio = (existente.get("fuente"), existente.get("codigo")) != (fuente, nuevo["codigo"])
        destino = existente
        if nuevo["slot"] is None:
            nuevo.pop("slot")   # si no se dice color, se queda el que tenía
    else:
        cambio = fuente != "manual"
        destino = {"id": slug(nuevo["corto"], {p["id"] for p in cfg["productos"]})}
        if nuevo["slot"] is None:
            # Sin color elegido (por ejemplo, al importar): el que menos se use.
            usos = [sum(1 for p in cfg["productos"] if p.get("slot") == s) for s in range(1, 13)]
            nuevo["slot"] = usos.index(min(usos)) + 1
        cfg["productos"].append(destino)
    # Se conservan los campos que el formulario no toca (la exposición del índice, etc.).
    for k, v in nuevo.items():
        if v in ("", None):
            destino.pop(k, None)
        else:
            destino[k] = v
    return destino, cambio


def reparte_colores(cfg, orden=None):
    """Un color distinto para cada producto (los primeros de 'orden', los más grandes,
    se quedan los colores más fáciles de distinguir). Con más de 12, se repiten."""
    ids = [p["id"] for p in cfg["productos"]]
    orden = [i for i in (orden or []) if i in ids] + [i for i in ids if i not in (orden or [])]
    for n, pid in enumerate(orden):
        producto(cfg, pid)["slot"] = n % 12 + 1


def borra_producto(cfg, pid):
    """Borra el producto con sus movimientos y valores anotados."""
    if not producto(cfg, pid):
        raise ErrorValidacion(["Ese producto ya no existe."])
    cfg["productos"] = [p for p in cfg["productos"] if p["id"] != pid]
    cfg["movimientos"] = [
        m for m in cfg.get("movimientos", [])
        if m.get("producto") != pid and m.get("productoDestino") != pid
    ]
    cfg["valoraciones"] = [v for v in cfg.get("valoraciones", []) if v.get("producto") != pid]
    for c in cfg.get("comparador", []):
        if c.get("pesos"):
            c["pesos"].pop(pid, None)
    cfg["comparador"] = [c for c in cfg.get("comparador", []) if c.get("real") or c.get("pesos")]
    for p in cfg.get("productos", []):
        if p.get("inmuebleId") == pid:
            p.pop("inmuebleId", None)


# ---------------------------------------------------------------- movimientos

def unidades_a(cfg, pid, fecha_iso, excluir=None):
    """Unidades que tenías de un producto al final de ese día."""
    total = 0.0
    for m in cfg.get("movimientos", []):
        if m.get("id") == excluir or m["fecha"] > fecha_iso:
            continue
        t = m.get("tipo")
        u = float(m.get("unidades") or 0)
        if m.get("producto") == pid:
            if t == "compra":
                total += u
            elif t in ("venta", "traspaso"):
                total -= u
        if t == "traspaso" and m.get("productoDestino") == pid:
            total += float(m.get("unidadesDestino") or 0)
    return total


def guarda_movimiento(cfg, datos):
    errores = []
    p = producto(cfg, datos.get("producto"))
    if not p:
        errores.append("Elige el producto.")
    elif p.get("tipo") in SOLO_SALDO:
        errores.append(f"«{p.get('corto') or p['nombre']}» se sigue con saldos, no con movimientos: "
                       "anótalo en «Saldos y valores».")
    tipo = datos.get("tipo")
    if tipo not in TIPOS_MOV:
        errores.append("Elige el tipo de movimiento: compra, venta, dividendo, comisión o traspaso.")
    f = fecha(datos.get("fecha"), errores)
    importe = numero(datos.get("importe"), "el importe", errores, mayor_que=0)
    cotiza = bool(p and p.get("fuente") != "manual")
    unidades = 0.0
    p_dest = None
    unidades_dest = 0.0
    retencion = None

    if tipo == "compra":
        unidades = numero(datos.get("unidades"), "cuántas unidades compraste", errores,
                          obligatorio=cotiza, mayor_que=0 if cotiza else None) or 0.0
    elif tipo == "venta":
        unidades = numero(datos.get("unidades"), "cuántas unidades vendiste", errores,
                          obligatorio=cotiza, minimo=0) or 0.0
    elif tipo == "traspaso":
        p_dest = producto(cfg, datos.get("productoDestino"))
        if not p_dest:
            errores.append("Elige el fondo de destino del traspaso.")
        elif p and p_dest["id"] == p["id"]:
            errores.append("El producto de destino debe ser distinto del de origen.")
        elif p_dest.get("tipo") in SOLO_SALDO:
            errores.append(f"«{p_dest.get('corto') or p_dest['nombre']}» se sigue con saldos y no admite traspasos.")
        if (p and p.get("fuente") == "manual") or (p_dest and p_dest.get("fuente") == "manual"):
            errores.append("Los traspasos requieren productos con cotización y participaciones.")
        unidades = numero(datos.get("unidades"), "las unidades traspasadas de origen", errores,
                          obligatorio=True, mayor_que=0) or 0.0
        unidades_dest = numero(datos.get("unidadesDestino"), "las unidades recibidas en destino", errores,
                               obligatorio=True, mayor_que=0) or 0.0
    elif tipo == "dividendo":
        retencion = numero(datos.get("retencion"), "la retención", errores, obligatorio=False, minimo=0)
        if retencion is not None and importe is not None and importe > 0 and retencion >= importe:
            errores.append("La retención no puede ser igual o mayor que el importe bruto del dividendo.")

    comision = numero(datos.get("comision"), "la comisión", errores, obligatorio=False, minimo=0)
    if comision and importe and comision >= importe:
        errores.append("La comisión no puede ser mayor que el importe total.")
    if not errores and tipo in ("venta", "traspaso") and cotiza and unidades:
        tenias = unidades_a(cfg, p["id"], f, excluir=datos.get("id"))
        if unidades > tenias + 1e-6:
            accion = "vendiendo" if tipo == "venta" else "traspasando"
            errores.append(f"El {fmt_fecha(f)} solo tenías {fmt_num(tenias)} unidades de "
                           f"«{p.get('corto') or p['nombre']}» y estás {accion} {fmt_num(unidades)}.")
    if errores:
        raise ErrorValidacion(errores)

    mov = {"fecha": f, "producto": p["id"], "tipo": tipo, "unidades": round(unidades, 8),
           "importe": round(importe, 2)}
    if tipo == "traspaso":
        mov["productoDestino"] = p_dest["id"]
        mov["unidadesDestino"] = round(unidades_dest, 8)
    if tipo == "dividendo" and retencion:
        mov["retencion"] = round(retencion, 2)
    if comision:
        mov["comision"] = round(comision, 2)
    if texto(datos.get("nota")):
        mov["nota"] = texto(datos.get("nota"))
    lista = cfg.setdefault("movimientos", [])
    existente = next((m for m in lista if m.get("id") == datos.get("id")), None) if datos.get("id") else None
    if existente:
        existente.clear()
        existente.update(id=datos["id"], **mov)
        return existente
    mov = {"id": siguiente_id(lista, "m"), **mov}
    lista.append(mov)
    lista.sort(key=lambda m: m["fecha"])
    return mov


def borra_movimiento(cfg, mid):
    antes = len(cfg.get("movimientos", []))
    cfg["movimientos"] = [m for m in cfg.get("movimientos", []) if m.get("id") != mid]
    if len(cfg["movimientos"]) == antes:
        raise ErrorValidacion(["Ese movimiento ya no existe."])


# ---------------------------------------------------------------- valores anotados

def guarda_valoracion(cfg, datos):
    errores = []
    p = producto(cfg, datos.get("producto"))
    if not p:
        errores.append("Elige el producto.")
    f = fecha(datos.get("fecha"), errores)
    valor = numero(datos.get("valor"), "el valor", errores, minimo=0)
    aportado = numero(datos.get("aportado"), "lo aportado", errores, obligatorio=False, minimo=0)
    if errores:
        raise ErrorValidacion(errores)
    val = {"fecha": f, "producto": p["id"], "valor": round(valor, 2)}
    if aportado is not None and p.get("tipo") not in SOLO_SALDO:
        val["aportado"] = round(aportado, 2)
    lista = cfg.setdefault("valoraciones", [])
    # Un solo valor por producto y día: si ya había uno, se sustituye.
    existente = next((v for v in lista if v.get("id") == datos.get("id")), None) if datos.get("id") else None
    existente = existente or next((v for v in lista if v["producto"] == p["id"] and v["fecha"] == f), None)
    if existente:
        vid = existente["id"]
        existente.clear()
        existente.update(id=vid, **val)
        return existente
    val = {"id": siguiente_id(lista, "v"), **val}
    lista.append(val)
    lista.sort(key=lambda v: (v["producto"], v["fecha"]))
    return val


def borra_valoracion(cfg, vid):
    antes = len(cfg.get("valoraciones", []))
    cfg["valoraciones"] = [v for v in cfg.get("valoraciones", []) if v.get("id") != vid]
    if len(cfg["valoraciones"]) == antes:
        raise ErrorValidacion(["Ese valor ya no existe."])


def guarda_objetivo(cfg, datos):
    """Actualiza el titular, el objetivo de patrimonio y el gasto mensual opcional."""
    if not isinstance(datos, dict):
        raise ErrorValidacion(["Formato de datos inválido."])
    if "titular" in datos:
        tit = str(datos.get("titular") or "").strip()[:80]
        if tit:
            cfg["titular"] = tit

    errores = []
    tiene_objetivo = any(
        k in datos
        for k in ("importeObjetivo", "importe", "activoObjetivo", "activo", "etiquetaObjetivo", "etiqueta")
    )
    if tiene_objetivo:
        obj_actual = cfg.get("objetivo") or {}
        if "importeObjetivo" in datos:
            raw_imp = datos.get("importeObjetivo")
        elif "importe" in datos:
            raw_imp = datos.get("importe")
        else:
            raw_imp = obj_actual.get("importe")
        imp = numero(raw_imp, "el objetivo", errores, obligatorio=False, mayor_que=0)
        if not errores:
            activo_flag = datos.get("activoObjetivo", datos.get("activo", obj_actual.get("activo", True)))
            etq_val = datos.get("etiquetaObjetivo") or datos.get("etiqueta") or obj_actual.get("etiqueta") or "Próximo objetivo"
            cfg["objetivo"] = {
                "activo": bool(activo_flag) and imp is not None,
                "importe": round(imp, 2) if imp else 100000,
                "etiqueta": str(etq_val).strip()[:60],
            }

    if "gastoMensual" in datos:
        raw_gasto = datos.get("gastoMensual")
        gasto = numero(raw_gasto, "el gasto mensual", errores, obligatorio=False, minimo=0)
        if not errores:
            if gasto is None:
                cfg.pop("gastoMensual", None)
            else:
                cfg["gastoMensual"] = round(gasto, 2)

    if errores:
        raise ErrorValidacion(errores)
    return cfg.get("objetivo")
