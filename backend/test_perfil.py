# -*- coding: utf-8 -*-
"""Comprobaciones de la actualización de perfil de usuario (requiere PostgreSQL)."""

import unittest
import uuid

from . import db


class PerfilTest(unittest.TestCase):
    def setUp(self):
        if not db.activo():
            self.skipTest("PostgreSQL no disponible")
        self.email = f"perfil-{uuid.uuid4().hex[:12]}@example.com"
        self.clave = "claveinicial1"
        self.uid = db.crear_usuario(self.email, "Perfil Test", self.clave)["id"]

    def tearDown(self):
        if getattr(self, "uid", None) and db.activo():
            with db._conectar() as con, con.cursor() as cur:
                cur.execute("DELETE FROM usuarios WHERE id = %s", (self.uid,))
                con.commit()

    def test_solo_nombre_no_pide_clave(self):
        u = db.actualizar_usuario(self.uid, nombre="Otro nombre")
        self.assertEqual(u["nombre"], "Otro nombre")
        self.assertEqual(u["email"], self.email)
        self.assertIsNotNone(db.autenticar(self.email, self.clave))

    def test_cambiar_clave_exige_la_actual(self):
        with self.assertRaises(db.ErrorUsuario) as ctx:
            db.actualizar_usuario(self.uid, password_nueva="nuevaclave123")
        self.assertIn("contraseña actual", ctx.exception.errores[0])

    def test_cambiar_clave_con_la_actual(self):
        u = db.actualizar_usuario(
            self.uid, password_actual=self.clave, password_nueva="nuevaclave123"
        )
        self.assertEqual(u["email"], self.email)
        self.assertIsNone(db.autenticar(self.email, self.clave))
        self.assertIsNotNone(db.autenticar(self.email, "nuevaclave123"))

    def test_correo_invalido(self):
        with self.assertRaises(db.ErrorUsuario):
            db.actualizar_usuario(self.uid, email="no-es-un-correo")

    def test_clave_demasiado_corta(self):
        with self.assertRaises(db.ErrorUsuario) as ctx:
            db.actualizar_usuario(self.uid, password_actual=self.clave, password_nueva="corta")
        self.assertIn("8 y 128", ctx.exception.errores[0])


if __name__ == "__main__":
    unittest.main()
