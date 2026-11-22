# -*- coding: utf-8 -*-
"""Pruebas unitarias de tokens de recuperación de contraseña (requiere PostgreSQL)."""

import datetime as dt
import hashlib
import unittest
import uuid

from . import db


class RecuperacionTest(unittest.TestCase):
    def setUp(self):
        if not db.activo():
            self.skipTest("PostgreSQL no disponible")
        db.inicia()
        self.email = f"rec-{uuid.uuid4().hex[:12]}@example.com"
        self.clave = "claveinicial1"
        self.uid = db.crear_usuario(self.email, "Recuperacion Test", self.clave)["id"]

    def tearDown(self):
        if getattr(self, "uid", None) and db.activo():
            with db._conectar() as con, con.cursor() as cur:
                cur.execute("DELETE FROM usuarios WHERE id = %s", (self.uid,))
                con.commit()

    def test_token_se_almacena_hasheado_y_no_enumera_inexistentes(self):
        self.assertIsNone(db.crear_token_recuperacion("no-existe-capitalia@example.com"))

        info = db.crear_token_recuperacion(self.email)
        self.assertIsNotNone(info)
        token = info["token"]
        esperado_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()

        with db._conectar() as con, con.cursor() as cur:
            cur.execute(
                "SELECT token_hash, usado, expira FROM tokens_recuperacion WHERE usuario_id = %s",
                (self.uid,),
            )
            filas = cur.fetchall()
        self.assertEqual(len(filas), 1)
        self.assertEqual(filas[0]["token_hash"], esperado_hash)
        self.assertNotEqual(filas[0]["token_hash"], token)
        self.assertIsNone(filas[0]["usado"])

    def test_restablecer_clave_cambia_password_y_es_un_solo_uso(self):
        token = db.crear_token_recuperacion(self.email)["token"]
        nueva = "nuevaclave987"

        ok = db.restablecer_clave_con_token(token, nueva)
        self.assertTrue(ok)
        self.assertIsNone(db.autenticar(self.email, self.clave))
        self.assertIsNotNone(db.autenticar(self.email, nueva))

        with self.assertRaises(db.ErrorUsuario):
            db.restablecer_clave_con_token(token, "otraclave999")

    def test_token_caducado_es_rechazado(self):
        token = db.crear_token_recuperacion(self.email)["token"]
        h = hashlib.sha256(token.encode("utf-8")).hexdigest()
        ayer = dt.datetime.now(dt.timezone.utc) - dt.timedelta(minutes=5)
        with db._conectar() as con, con.cursor() as cur:
            cur.execute(
                "UPDATE tokens_recuperacion SET expira = %s WHERE token_hash = %s",
                (ayer, h),
            )
            con.commit()

        with self.assertRaises(db.ErrorUsuario):
            db.restablecer_clave_con_token(token, "nuevaclave123")
        self.assertIsNotNone(db.autenticar(self.email, self.clave))

    def test_clave_corta_rechazada_sin_consumir_token(self):
        token = db.crear_token_recuperacion(self.email)["token"]
        with self.assertRaises(db.ErrorUsuario) as ctx:
            db.restablecer_clave_con_token(token, "corta")
        self.assertIn("8 y 128", ctx.exception.errores[0])

        # El token sigue siendo válido si el primer intento falló por validación de longitud.
        self.assertTrue(db.restablecer_clave_con_token(token, "clavevalida123"))
        self.assertIsNotNone(db.autenticar(self.email, "clavevalida123"))


if __name__ == "__main__":
    unittest.main()
