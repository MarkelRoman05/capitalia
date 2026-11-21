# -*- coding: utf-8 -*-
"""
db.py  ·  Persistencia completa en PostgreSQL para Capitalia
============================================================
Gestiona en PostgreSQL:
  - Cuentas de usuario (tabla `usuarios`)
  - Cartera activa, panel precalculado y estado por usuario (tabla `carteras`)
  - Desglose relacional sincronizado (`productos_rel`, `movimientos_rel`, `valoraciones_rel`)
  - Copias de seguridad automáticas y manuales en base de datos (tabla `copias_cartera`)
  - Histórico diario de patrimonio por usuario (tabla `historico_cartera`)
"""

import datetime as dt
import json
import logging
import os
import re
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import quote

try:
    import psycopg
    from psycopg import sql
    from psycopg.rows import dict_row
    from psycopg.types.json import Jsonb
    _PSYCOPG = True
except Exception:
    _PSYCOPG = False

from werkzeug.security import check_password_hash, generate_password_hash

from . import almacen

RE_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
MIN_CLAVE = 8
MAX_CLAVE = 128
MAX_NOMBRE = 80
COPIAS_MAX = 20

# TODO(security): Consider adding OAuth2/OIDC providers, MFA (TOTP/WebAuthn), and leaked password detection (HIBP).


class ErrorUsuario(Exception):
    """Error de validación con una lista de mensajes en castellano."""

    def __init__(self, errores):
        if isinstance(errores, str):
            errores = [errores]
        super().__init__("; ".join(errores))
        self.errores = errores


def _lee_env_archivo(ruta):
    """Lee pares CLAVE=VALOR de un archivo .env sin sobreescribir el entorno."""
    valores = {}
    if not os.path.exists(ruta):
        return valores
    try:
        with open(ruta, "r", encoding="utf-8") as f:
            for linea in f:
                linea = linea.strip()
                if not linea or linea.startswith("#") or "=" not in linea:
                    continue
                k, v = linea.split("=", 1)
                valores[k.strip()] = v.strip().strip("'").strip('"')
    except OSError:
        pass
    return valores


def _cfg():
    """Configuración de PostgreSQL desde variables de entorno o archivo .env de infraestructura."""
    raiz = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    env_local = _lee_env_archivo(os.path.join(raiz, ".env"))
    env_infra = _lee_env_archivo(os.path.abspath(os.path.join(raiz, "..", "..", ".env")))

    def obt(clave, *alternativas, defecto=None):
        for c in (clave,) + alternativas:
            if os.environ.get(c):
                return os.environ.get(c)
            if c in env_local:
                return env_local[c]
            if c in env_infra:
                return env_infra[c]
        return defecto

    host = obt("CAPITALIA_DB_HOST", "POSTGRES_HOST")
    user = obt("CAPITALIA_DB_USER", "POSTGRES_USER")
    password = obt("CAPITALIA_DB_PASSWORD", "POSTGRES_PASSWORD")
    if not host and user and password:
        host = "127.0.0.1"
    if not host:
        return None
    return {
        "host": host,
        "port": obt("CAPITALIA_DB_PORT", defecto="5432"),
        "dbname": obt("CAPITALIA_DB_NAME", defecto="capitalia"),
        "user": user or "postgres",
        "password": password or "",
    }


def activo():
    """True si la conexión a PostgreSQL está configurada y psycopg disponible."""
    return _PSYCOPG and _cfg() is not None


def _conectar(dbname=None, autocommit=False):
    c = _cfg()
    con = psycopg.connect(
        host=c["host"],
        port=c["port"],
        dbname=dbname or c["dbname"],
        user=c["user"],
        password=c["password"],
        row_factory=dict_row,
        connect_timeout=5,
    )
    if autocommit:
        con.autocommit = True
    return con


def _crea_tablas():
    with _conectar() as con, con.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS usuarios (
                id            SERIAL PRIMARY KEY,
                email         TEXT UNIQUE NOT NULL,
                nombre        TEXT NOT NULL DEFAULT '',
                password_hash TEXT NOT NULL,
                creado        TIMESTAMPTZ NOT NULL DEFAULT now(),
                ultimo_acceso TIMESTAMPTZ
            );

            CREATE TABLE IF NOT EXISTS carteras (
                usuario_id    INTEGER PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
                cfg           JSONB NOT NULL,
                calculado     JSONB,
                estado        JSONB NOT NULL DEFAULT '{}'::jsonb,
                actualizado   TIMESTAMPTZ NOT NULL DEFAULT now()
            );

            CREATE TABLE IF NOT EXISTS copias_cartera (
                id            SERIAL PRIMARY KEY,
                usuario_id    INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
                archivo       TEXT NOT NULL,
                motivo        TEXT NOT NULL DEFAULT 'Automática',
                cfg           JSONB NOT NULL,
                productos     INTEGER NOT NULL DEFAULT 0,
                movimientos   INTEGER NOT NULL DEFAULT 0,
                fecha         TIMESTAMPTZ NOT NULL DEFAULT now(),
                UNIQUE(usuario_id, archivo)
            );

            CREATE TABLE IF NOT EXISTS historico_cartera (
                id            SERIAL PRIMARY KEY,
                usuario_id    INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
                fecha         TEXT NOT NULL,
                patrimonio    DOUBLE PRECISION NOT NULL DEFAULT 0,
                aportado      DOUBLE PRECISION NOT NULL DEFAULT 0,
                plusvalia     DOUBLE PRECISION NOT NULL DEFAULT 0,
                por_producto  JSONB NOT NULL DEFAULT '{}'::jsonb,
                UNIQUE(usuario_id, fecha)
            );

            CREATE TABLE IF NOT EXISTS productos_rel (
                usuario_id    INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
                id            TEXT NOT NULL,
                nombre        TEXT NOT NULL,
                corto         TEXT NOT NULL DEFAULT '',
                tipo          TEXT NOT NULL,
                identificador TEXT NOT NULL DEFAULT '',
                fuente        TEXT NOT NULL DEFAULT 'manual',
                codigo        TEXT NOT NULL DEFAULT '',
                moneda        TEXT NOT NULL DEFAULT 'EUR',
                entidad       TEXT NOT NULL DEFAULT '',
                clase         TEXT NOT NULL DEFAULT '',
                gestora       TEXT NOT NULL DEFAULT '',
                ter           DOUBLE PRECISION,
                riesgo        INTEGER,
                slot          INTEGER,
                largo_plazo   BOOLEAN NOT NULL DEFAULT TRUE,
                datos         JSONB NOT NULL DEFAULT '{}'::jsonb,
                PRIMARY KEY (usuario_id, id)
            );

            CREATE TABLE IF NOT EXISTS movimientos_rel (
                usuario_id    INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
                id            TEXT NOT NULL,
                producto_id   TEXT NOT NULL,
                fecha         TEXT NOT NULL,
                tipo          TEXT NOT NULL,
                unidades      DOUBLE PRECISION NOT NULL DEFAULT 0,
                importe       DOUBLE PRECISION NOT NULL DEFAULT 0,
                comision      DOUBLE PRECISION,
                nota          TEXT NOT NULL DEFAULT '',
                origen        TEXT NOT NULL DEFAULT 'manual',
                PRIMARY KEY (usuario_id, id)
            );

            CREATE TABLE IF NOT EXISTS valoraciones_rel (
                usuario_id    INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
                id            TEXT NOT NULL,
                producto_id   TEXT NOT NULL,
                fecha         TEXT NOT NULL,
                valor         DOUBLE PRECISION NOT NULL DEFAULT 0,
                aportado      DOUBLE PRECISION,
                PRIMARY KEY (usuario_id, id)
            );

            CREATE TABLE IF NOT EXISTS entidades (
                id            SERIAL PRIMARY KEY,
                nombre        TEXT UNIQUE NOT NULL,
                dominio       TEXT NOT NULL DEFAULT '',
                logo          TEXT NOT NULL DEFAULT '',
                categoria     TEXT NOT NULL DEFAULT 'Entidad',
                aliases       TEXT NOT NULL DEFAULT '',
                origen        TEXT NOT NULL DEFAULT 'seed',
                creado        TIMESTAMPTZ NOT NULL DEFAULT now()
            );

            CREATE TABLE IF NOT EXISTS entidades_recientes (
                usuario_id    INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
                entidad_id    INTEGER NOT NULL REFERENCES entidades(id) ON DELETE CASCADE,
                ultimo_uso    TIMESTAMPTZ NOT NULL DEFAULT now(),
                veces         INTEGER NOT NULL DEFAULT 1,
                PRIMARY KEY (usuario_id, entidad_id)
            );
        """)
        _seed_entidades(cur)
        con.commit()


def inicia():
    """Crea la base de datos `capitalia` (si no existe) y todas las tablas. Idempotente."""
    if not activo():
        return
    try:
        _crea_tablas()
        return
    except psycopg.OperationalError as e:
        if "does not exist" not in str(e).lower():
            raise
    nombre = _cfg()["dbname"]
    if not re.fullmatch(r"[A-Za-z0-9_]+", nombre or ""):
        raise ErrorUsuario([f"Nombre de base de datos no válido: {nombre!r}"])
    with _conectar("postgres", autocommit=True) as con, con.cursor() as cur:
        cur.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(nombre)))
    _crea_tablas()


# ---------------------------------------------------------------- usuarios

def _publico(fila):
    if not fila:
        return None
    creado = fila.get("creado")
    return {
        "id": fila["id"],
        "email": fila["email"],
        "nombre": fila.get("nombre") or "",
        "creado": creado.isoformat() if hasattr(creado, "isoformat") else creado,
    }


def crear_usuario(email, nombre, password):
    """Registra una cuenta nueva en PostgreSQL e inicializa su cartera vacía."""
    email = (email or "").strip().lower()
    nombre = (nombre or "").strip()[:MAX_NOMBRE]
    password = password or ""

    errores = []
    if not RE_EMAIL.match(email):
        errores.append("Escribe un correo electrónico válido.")
    if len(password) < MIN_CLAVE:
        errores.append(f"La contraseña debe tener al menos {MIN_CLAVE} caracteres.")
    if len(password) > MAX_CLAVE:
        errores.append(f"La contraseña no puede superar los {MAX_CLAVE} caracteres.")
    if errores:
        raise ErrorUsuario(errores)

    try:
        with _conectar() as con, con.cursor() as cur:
            cur.execute(
                "INSERT INTO usuarios (email, nombre, password_hash) "
                "VALUES (%s, %s, %s) RETURNING id, email, nombre, creado",
                (email, nombre, generate_password_hash(password)),
            )
            fila = cur.fetchone()
            cfg_vacia = json.loads(json.dumps(almacen.CARTERA_VACIA))
            if nombre:
                cfg_vacia["titular"] = f"Patrimonio de {nombre}"
            cur.execute(
                "INSERT INTO carteras (usuario_id, cfg, estado) VALUES (%s, %s, %s)",
                (fila["id"], Jsonb(cfg_vacia), Jsonb({})),
            )
            con.commit()
            return _publico(fila)
    except ErrorUsuario:
        raise
    except Exception as e:
        if "duplicate key" in str(e).lower() or "usuarios_email_key" in str(e):
            raise ErrorUsuario(["Ya existe una cuenta registrada con ese correo electrónico."])
        logging.exception("Error creando usuario en PostgreSQL")
        raise ErrorUsuario(["No se ha podido crear la cuenta en este momento."])


def autenticar(email, password):
    """Verifica credenciales y actualiza ultimo_acceso."""
    email = (email or "").strip().lower()
    if not email or not password or len(password) > MAX_CLAVE:
        return None
    with _conectar() as con, con.cursor() as cur:
        cur.execute(
            "SELECT id, email, nombre, password_hash, creado FROM usuarios WHERE email = %s",
            (email,),
        )
        fila = cur.fetchone()
        if not fila or not check_password_hash(fila["password_hash"], password):
            return None
        cur.execute("UPDATE usuarios SET ultimo_acceso = now() WHERE id = %s", (fila["id"],))
        con.commit()
    return _publico(fila)


def por_id(uid):
    if not uid:
        return None
    with _conectar() as con, con.cursor() as cur:
        cur.execute("SELECT id, email, nombre, creado FROM usuarios WHERE id = %s", (uid,))
        return _publico(cur.fetchone())


def actualizar_usuario(uid, nombre=None, email=None, password_actual=None, password_nueva=None):
    """Actualiza nombre, correo y/o contraseña. Cambiar correo o clave exige la contraseña actual."""
    if not uid:
        raise ErrorUsuario(["Tu sesión ha caducado. Inicia sesión de nuevo."])

    with _conectar() as con, con.cursor() as cur:
        cur.execute(
            "SELECT id, email, nombre, password_hash, creado FROM usuarios WHERE id = %s",
            (uid,),
        )
        fila = cur.fetchone()
        if not fila:
            raise ErrorUsuario(["No se ha encontrado la cuenta."])

        errores = []
        nuevo_email = fila["email"]
        if email is not None and (email or "").strip().lower() != fila["email"]:
            candidato = (email or "").strip().lower()
            if not RE_EMAIL.match(candidato):
                errores.append("Escribe un correo electrónico válido.")
            else:
                nuevo_email = candidato

        nueva_clave = password_nueva or ""
        if nueva_clave and (len(nueva_clave) < MIN_CLAVE or len(nueva_clave) > MAX_CLAVE):
            errores.append(f"La contraseña debe tener entre {MIN_CLAVE} y {MAX_CLAVE} caracteres.")

        # Tocar el correo o la contraseña siempre requiere la contraseña actual.
        if (nuevo_email != fila["email"] or nueva_clave) and not check_password_hash(
            fila["password_hash"], password_actual or ""
        ):
            errores.append("La contraseña actual no es correcta.")

        nuevo_nombre = fila["nombre"]
        if nombre is not None:
            nuevo_nombre = (nombre or "").strip()[:MAX_NOMBRE]

        if errores:
            raise ErrorUsuario(errores)

        try:
            cur.execute(
                "UPDATE usuarios SET email = %s, nombre = %s, password_hash = %s "
                "WHERE id = %s RETURNING id, email, nombre, creado",
                (
                    nuevo_email,
                    nuevo_nombre,
                    generate_password_hash(nueva_clave) if nueva_clave else fila["password_hash"],
                    uid,
                ),
            )
            actualizado = cur.fetchone()
            con.commit()
            return _publico(actualizado)
        except Exception as e:
            if "duplicate key" in str(e).lower() or "usuarios_email_key" in str(e):
                raise ErrorUsuario(["Ya existe una cuenta registrada con ese correo electrónico."])
            logging.exception("Error actualizando usuario %s", uid)
            raise ErrorUsuario(["No se ha podido actualizar el perfil en este momento."])


# ---------------------------------------------------------------- carteras en PostgreSQL

def _sincronizar_relacional(cur, uid, cfg):
    """Sincroniza las tablas relacionales productos_rel, movimientos_rel y valoraciones_rel."""
    cur.execute("DELETE FROM productos_rel WHERE usuario_id = %s", (uid,))
    cur.execute("DELETE FROM movimientos_rel WHERE usuario_id = %s", (uid,))
    cur.execute("DELETE FROM valoraciones_rel WHERE usuario_id = %s", (uid,))

    for p in cfg.get("productos", []):
        cur.execute(
            """
            INSERT INTO productos_rel (
                usuario_id, id, nombre, corto, tipo, identificador, fuente,
                codigo, moneda, entidad, clase, gestora, ter, riesgo, slot, largo_plazo, datos
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                uid,
                str(p.get("id", "")),
                str(p.get("nombre", "")),
                str(p.get("corto", "")),
                str(p.get("tipo", "otro")),
                str(p.get("identificador", "")),
                str(p.get("fuente", "manual")),
                str(p.get("codigo", "")),
                str(p.get("moneda", "EUR")),
                str(p.get("entidad", "")),
                str(p.get("clase", "")),
                str(p.get("gestora", "")),
                float(p["ter"]) if p.get("ter") is not None else None,
                int(p["riesgo"]) if p.get("riesgo") is not None else None,
                int(p["slot"]) if p.get("slot") is not None else None,
                bool(p.get("largoPlazo", True)),
                Jsonb(p),
            ),
        )

    for m in cfg.get("movimientos", []):
        cur.execute(
            """
            INSERT INTO movimientos_rel (
                usuario_id, id, producto_id, fecha, tipo, unidades, importe, comision, nota, origen
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                uid,
                str(m.get("id", "")),
                str(m.get("producto", "")),
                str(m.get("fecha", "")),
                str(m.get("tipo", "compra")),
                float(m.get("unidades") or 0),
                float(m.get("importe") or 0),
                float(m["comision"]) if m.get("comision") is not None else None,
                str(m.get("nota", "")),
                str(m.get("origen", "manual")),
            ),
        )

    for v in cfg.get("valoraciones", []):
        cur.execute(
            """
            INSERT INTO valoraciones_rel (
                usuario_id, id, producto_id, fecha, valor, aportado
            ) VALUES (%s, %s, %s, %s, %s, %s)
            """,
            (
                uid,
                str(v.get("id", "")),
                str(v.get("producto", "")),
                str(v.get("fecha", "")),
                float(v.get("valor") or 0),
                float(v["aportado"]) if v.get("aportado") is not None else None,
            ),
        )


def obtener_registro_cartera(uid):
    """Devuelve {cfg, calculado, estado} del usuario desde PostgreSQL, creándolo si no existe."""
    with _conectar() as con, con.cursor() as cur:
        cur.execute(
            "SELECT cfg, calculado, estado FROM carteras WHERE usuario_id = %s",
            (uid,),
        )
        fila = cur.fetchone()
        if fila:
            return {
                "cfg": fila["cfg"] or json.loads(json.dumps(almacen.CARTERA_VACIA)),
                "calculado": fila["calculado"],
                "estado": fila["estado"] or {},
            }
        cfg_vacia = json.loads(json.dumps(almacen.CARTERA_VACIA))
        cur.execute(
            "INSERT INTO carteras (usuario_id, cfg, estado) VALUES (%s, %s, %s) "
            "ON CONFLICT (usuario_id) DO NOTHING",
            (uid, Jsonb(cfg_vacia), Jsonb({})),
        )
        con.commit()
        return {"cfg": cfg_vacia, "calculado": None, "estado": {}}


def guardar_cartera(uid, cfg, crear_copia=True, motivo_copia="Automática", prefijo_copia="auto"):
    """Guarda la cartera en PostgreSQL, creando antes una copia de seguridad de lo que había."""
    with _conectar() as con, con.cursor() as cur:
        cur.execute("SELECT cfg FROM carteras WHERE usuario_id = %s", (uid,))
        actual = cur.fetchone()
        if crear_copia and actual and actual.get("cfg"):
            cfg_prev = actual["cfg"]
            if cfg_prev.get("productos") or cfg_prev.get("movimientos") or cfg_prev.get("valoraciones"):
                sello = dt.datetime.now().strftime("%Y%m%d_%H%M%S_%f")
                archivo = f"{prefijo_copia}_{sello}.json"
                cur.execute(
                    """
                    INSERT INTO copias_cartera (usuario_id, archivo, motivo, cfg, productos, movimientos)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    """,
                    (
                        uid,
                        archivo,
                        motivo_copia,
                        Jsonb(cfg_prev),
                        len(cfg_prev.get("productos", [])),
                        len(cfg_prev.get("movimientos", [])),
                    ),
                )
                if prefijo_copia == "auto":
                    cur.execute(
                        """
                        DELETE FROM copias_cartera
                        WHERE id IN (
                            SELECT id FROM copias_cartera
                            WHERE usuario_id = %s AND archivo LIKE 'auto_%%'
                            ORDER BY fecha DESC
                            OFFSET %s
                        )
                        """,
                        (uid, COPIAS_MAX),
                    )
        cur.execute(
            """
            INSERT INTO carteras (usuario_id, cfg, actualizado)
            VALUES (%s, %s, now())
            ON CONFLICT (usuario_id) DO UPDATE
            SET cfg = EXCLUDED.cfg, actualizado = now()
            """,
            (uid, Jsonb(cfg)),
        )
        _sincronizar_relacional(cur, uid, cfg)
        con.commit()


def guardar_calculado(uid, datos, estado=None):
    """Guarda el panel calculado, el estado y actualiza el histórico en PostgreSQL."""
    with _conectar() as con, con.cursor() as cur:
        if estado is not None:
            cur.execute(
                """
                UPDATE carteras
                SET calculado = %s, estado = %s, actualizado = now()
                WHERE usuario_id = %s
                """,
                (Jsonb(datos) if datos is not None else None, Jsonb(estado), uid),
            )
        else:
            cur.execute(
                """
                UPDATE carteras
                SET calculado = %s, actualizado = now()
                WHERE usuario_id = %s
                """,
                (Jsonb(datos) if datos is not None else None, uid),
            )
        if datos and datos.get("total") and datos.get("fechaExtracto"):
            tot = datos["total"]
            por_prod = {p["id"]: p.get("valor", 0) for p in datos.get("productos", [])}
            cur.execute(
                """
                INSERT INTO historico_cartera (usuario_id, fecha, patrimonio, aportado, plusvalia, por_producto)
                VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT (usuario_id, fecha) DO UPDATE
                SET patrimonio = EXCLUDED.patrimonio,
                    aportado = EXCLUDED.aportado,
                    plusvalia = EXCLUDED.plusvalia,
                    por_producto = EXCLUDED.por_producto
                """,
                (
                    uid,
                    datos["fechaExtracto"],
                    float(tot.get("patrimonio") or 0),
                    float(tot.get("aportado") or 0),
                    float(tot.get("plusvalia") or 0),
                    Jsonb(por_prod),
                ),
            )
        con.commit()


def listar_copias(uid):
    """Lista las copias de seguridad del usuario guardadas en PostgreSQL."""
    with _conectar() as con, con.cursor() as cur:
        cur.execute(
            """
            SELECT archivo, motivo, productos, movimientos, fecha
            FROM copias_cartera
            WHERE usuario_id = %s
            ORDER BY fecha DESC
            """,
            (uid,),
        )
        filas = cur.fetchall()
    return [
        {
            "archivo": f["archivo"],
            "fecha": f["fecha"].astimezone().isoformat(timespec="minutes")
            if hasattr(f["fecha"], "astimezone")
            else str(f["fecha"]),
            "motivo": f["motivo"],
            "productos": f["productos"],
            "movimientos": f["movimientos"],
        }
        for f in filas
    ]


def obtener_copia(uid, archivo):
    """Recupera el JSONB cfg de una copia de seguridad concreta del usuario."""
    with _conectar() as con, con.cursor() as cur:
        cur.execute(
            "SELECT cfg FROM copias_cartera WHERE usuario_id = %s AND archivo = %s",
            (uid, archivo),
        )
        fila = cur.fetchone()
        return fila["cfg"] if fila else None


# ---------------------------------------------------------------- entidades (bancos y brókers)

_ENTIDADES_SEED = (
    ("BBVA", "bbva.es", "Banco español", "banco bilbao vizcaya"),
    ("Banco Santander", "santander.com", "Banco español", "santander san"),
    ("CaixaBank", "caixabank.com", "Banco español", "la caixa caixa"),
    ("Banco Sabadell", "bancsabadell.com", "Banco español", "sabadell"),
    ("Bankinter", "bankinter.com", "Banco español", "bkt"),
    ("ING", "ing.es", "Banco español", "ing direct cuenta naranja"),
    ("Openbank", "openbank.es", "Banco español", "open bank"),
    ("Unicaja", "unicajabanco.es", "Banco español", "unicaja banco"),
    ("Ibercaja", "ibercaja.es", "Banco español", ""),
    ("Abanca", "abanca.com", "Banco español", ""),
    ("Kutxabank", "kutxabank.es", "Banco español", ""),
    ("EVO Banco", "evobanco.com", "Banco español", "evo"),
    ("Cajamar", "cajamar.es", "Banco español", ""),
    ("Renta 4 Banco", "r4.com", "Banco español", "renta4 renta 4"),
    ("Imagin", "imagin.com", "Banco español", "imaginbank"),
    ("Banco Mediolanum", "bancomediolanum.es", "Banco español", "mediolanum"),
    ("Banca March", "bancamarch.es", "Banco español", ""),
    ("Deutsche Bank España", "db.com", "Banco español", "deutsche bank"),
    ("MyInvestor", "myinvestor.es", "Bróker e inversión", "my investor andbank"),
    ("Indexa Capital", "indexacapital.com", "Bróker e inversión", "indexa"),
    ("Trade Republic", "traderepublic.com", "Bróker e inversión", "tr traderepublic"),
    ("DEGIRO", "degiro.com", "Bróker e inversión", "degiro"),
    ("Interactive Brokers", "interactivebrokers.com", "Bróker e inversión", "ibkr ib"),
    ("XTB", "xtb.com", "Bróker e inversión", ""),
    ("Scalable Capital", "scalable.capital", "Bróker e inversión", "scalable"),
    ("Finizens", "finizens.com", "Bróker e inversión", ""),
    ("InbestMe", "inbestme.com", "Bróker e inversión", ""),
    ("Freedom24", "freedom24.com", "Bróker e inversión", ""),
    ("eToro", "etoro.com", "Bróker e inversión", ""),
    ("Trading 212", "trading212.com", "Bróker e inversión", "t212"),
    ("HeyTrade", "heytrade.com", "Bróker e inversión", ""),
    ("Vanguard", "vanguard.com", "Bróker e inversión", ""),
    ("Fidelity", "fidelity.com", "Bróker e inversión", ""),
    ("BlackRock / iShares", "blackrock.com", "Bróker e inversión", "ishares blackrock"),
    ("Revolut", "revolut.com", "Neobanco", ""),
    ("N26", "n26.com", "Neobanco", ""),
    ("Wise", "wise.com", "Neobanco", "transferwise"),
    ("B100", "b100.es", "Neobanco", ""),
    ("Bank Norwegian", "banknorwegian.es", "Banco internacional", "norwegian"),
    ("Raisin", "raisin.es", "Banco internacional", ""),
    ("Bunq", "bunq.com", "Neobanco", ""),
    ("Vivid", "vivid.money", "Neobanco", ""),
    ("Charles Schwab", "schwab.com", "Banco internacional", "schwab"),
    ("HSBC", "hsbc.com", "Banco internacional", ""),
    ("J.P. Morgan", "jpmorgan.com", "Banco internacional", "jp morgan chase"),
    ("Binance", "binance.com", "Cripto y custodia", "bnb"),
    ("Coinbase", "coinbase.com", "Cripto y custodia", ""),
    ("Kraken", "kraken.com", "Cripto y custodia", ""),
    ("Bit2Me", "bit2me.com", "Cripto y custodia", ""),
    ("Ledger", "ledger.com", "Cripto y custodia", "cold wallet hardware wallet"),
    ("Trezor", "trezor.io", "Cripto y custodia", "cold wallet"),
)


def _logo_favicon(dominio):
    dom = (dominio or "").strip().lower()
    if not dom:
        return ""
    return f"https://www.google.com/s2/favicons?domain={quote(dom)}&sz=128"


def _seed_entidades(cur):
    for nombre, dominio, categoria, aliases in _ENTIDADES_SEED:
        cur.execute(
            """
            INSERT INTO entidades (nombre, dominio, logo, categoria, aliases, origen)
            VALUES (%s, %s, %s, %s, %s, 'seed')
            ON CONFLICT (nombre) DO NOTHING
            """,
            (nombre, dominio, _logo_favicon(dominio), categoria, aliases),
        )


def _entidad_publica(fila):
    return {
        "id": fila.get("id"),
        "nombre": fila.get("nombre") or "",
        "dominio": fila.get("dominio") or "",
        "logo": fila.get("logo") or "",
        "categoria": fila.get("categoria") or "Entidad",
    }


def listar_entidades(uid=None, q=""):
    """Lista las entidades recientes del usuario y el catálogo en PostgreSQL."""
    q_limpio = (q or "").strip()
    recientes = []
    vistos_rec = set()

    with _conectar() as con, con.cursor() as cur:
        if uid is not None:
            cur.execute(
                """
                SELECT e.id, e.nombre, e.dominio, e.logo, e.categoria
                FROM entidades_recientes r
                JOIN entidades e ON e.id = r.entidad_id
                WHERE r.usuario_id = %s
                ORDER BY r.ultimo_uso DESC
                LIMIT 6
                """,
                (uid,),
            )
            for f in cur.fetchall():
                ent = _entidad_publica(f)
                clave = ent["nombre"].lower()
                if clave and clave not in vistos_rec:
                    vistos_rec.add(clave)
                    recientes.append(ent)

            if len(recientes) < 6:
                cur.execute(
                    """
                    SELECT DISTINCT TRIM(p.entidad) AS prod_entidad,
                                    e.id, e.nombre, e.dominio, e.logo, e.categoria
                    FROM productos_rel p
                    LEFT JOIN entidades e ON LOWER(e.nombre) = LOWER(TRIM(p.entidad))
                    WHERE p.usuario_id = %s AND TRIM(p.entidad) <> ''
                    ORDER BY prod_entidad
                    """,
                    (uid,),
                )
                for f in cur.fetchall():
                    if len(recientes) >= 6:
                        break
                    nombre_ent = f.get("nombre") or f.get("prod_entidad") or ""
                    clave = nombre_ent.lower()
                    if not clave or clave in vistos_rec:
                        continue
                    vistos_rec.add(clave)
                    recientes.append({
                        "id": f.get("id"),
                        "nombre": nombre_ent,
                        "dominio": f.get("dominio") or "",
                        "logo": f.get("logo") or "",
                        "categoria": f.get("categoria") or "En tu cartera",
                    })

        if q_limpio:
            q_esc = q_limpio.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
            patron = f"%{q_esc}%"
            prefijo = f"{q_esc}%"
            cur.execute(
                """
                SELECT id, nombre, dominio, logo, categoria
                FROM entidades
                WHERE nombre ILIKE %s ESCAPE '\\'
                   OR dominio ILIKE %s ESCAPE '\\'
                   OR categoria ILIKE %s ESCAPE '\\'
                   OR aliases ILIKE %s ESCAPE '\\'
                ORDER BY
                    CASE
                        WHEN LOWER(nombre) = LOWER(%s) THEN 0
                        WHEN nombre ILIKE %s ESCAPE '\\' THEN 1
                        ELSE 2
                    END,
                    categoria,
                    nombre
                LIMIT 60
                """,
                (patron, patron, patron, patron, q_limpio, prefijo),
            )
        else:
            cur.execute(
                """
                SELECT id, nombre, dominio, logo, categoria
                FROM entidades
                ORDER BY categoria, nombre
                LIMIT 60
                """
            )
        entidades = [_entidad_publica(f) for f in cur.fetchall()]

    return {"recientes": recientes, "entidades": entidades}


def registrar_entidad(nombre, dominio="", logo="", categoria="", uid=None, origen="api"):
    """Inserta o reutiliza una entidad en PostgreSQL y registra su uso para el usuario."""
    nombre = (nombre or "").strip()[:120]
    if not nombre:
        return None
    dominio = (dominio or "").strip().lower()[:160]
    logo = (logo or "").strip()[:500]
    if logo and not logo.startswith("https://"):
        logo = ""
    if not logo and dominio:
        logo = _logo_favicon(dominio)
    categoria_limpia = (categoria or "").strip()[:60] or (dominio or "Entidad personalizada")

    with _conectar() as con, con.cursor() as cur:
        cur.execute(
            """
            SELECT id, nombre, dominio, logo, categoria
            FROM entidades
            WHERE LOWER(nombre) = LOWER(%s)
            LIMIT 1
            """,
            (nombre,),
        )
        fila = cur.fetchone()
        if fila:
            nuevo_dom = fila["dominio"] or dominio
            nuevo_logo = fila["logo"]
            if logo and (not nuevo_logo or "cdn.brandfetch.io" in logo):
                nuevo_logo = logo
            elif not nuevo_logo and nuevo_dom:
                nuevo_logo = _logo_favicon(nuevo_dom)
            nueva_cat = fila["categoria"]
            if nueva_cat in ("", "Entidad", "Entidad personalizada") and categoria_limpia:
                nueva_cat = categoria_limpia
            if nuevo_dom != fila["dominio"] or nuevo_logo != fila["logo"] or nueva_cat != fila["categoria"]:
                cur.execute(
                    """
                    UPDATE entidades
                    SET dominio = %s, logo = %s, categoria = %s
                    WHERE id = %s
                    """,
                    (nuevo_dom, nuevo_logo, nueva_cat, fila["id"]),
                )
            entidad = {
                "id": fila["id"],
                "nombre": fila["nombre"],
                "dominio": nuevo_dom,
                "logo": nuevo_logo,
                "categoria": nueva_cat,
            }
        else:
            cur.execute(
                """
                INSERT INTO entidades (nombre, dominio, logo, categoria, origen)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (nombre) DO UPDATE
                SET nombre = EXCLUDED.nombre
                RETURNING id, nombre, dominio, logo, categoria
                """,
                (nombre, dominio, logo, categoria_limpia, origen),
            )
            entidad = _entidad_publica(cur.fetchone())

        if uid is not None and entidad.get("id"):
            cur.execute(
                """
                INSERT INTO entidades_recientes (usuario_id, entidad_id, ultimo_uso, veces)
                VALUES (%s, %s, now(), 1)
                ON CONFLICT (usuario_id, entidad_id) DO UPDATE
                SET ultimo_uso = now(), veces = entidades_recientes.veces + 1
                """,
                (uid, entidad["id"]),
            )
        con.commit()
    return entidad


def sincronizar_logos_entidades(solo_faltantes=True):
    """Actualiza en PostgreSQL los logos faltantes o de favicon usando Brandfetch."""
    if not activo():
        return 0
    from . import buscar

    with _conectar() as con, con.cursor() as cur:
        if solo_faltantes:
            cur.execute(
                """
                SELECT id, nombre, dominio, logo
                FROM entidades
                WHERE TRIM(dominio) <> ''
                  AND (logo = '' OR logo LIKE '%%google.com/s2/favicons%%')
                ORDER BY id
                """
            )
        else:
            cur.execute(
                """
                SELECT id, nombre, dominio, logo
                FROM entidades
                WHERE TRIM(dominio) <> ''
                ORDER BY id
                """
            )
        filas = cur.fetchall()

    if not filas:
        return 0

    def _resuelve(fila):
        logo = buscar.resolver_logo_brandfetch(fila["dominio"], fila["nombre"])
        return (fila["id"], logo)

    with ThreadPoolExecutor(max_workers=8) as ex:
        resueltos = [r for r in ex.map(_resuelve, filas) if r[1]]

    if not resueltos:
        return 0

    with _conectar() as con, con.cursor() as cur:
        for ent_id, logo in resueltos:
            cur.execute(
                "UPDATE entidades SET logo = %s WHERE id = %s",
                (logo, ent_id),
            )
        con.commit()
    return len(resueltos)
