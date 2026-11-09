# -*- coding: utf-8 -*-
"""Comprobaciones de la lectura de extractos de MyInvestor (CSV y Excel)."""

import datetime as dt
import io
import unittest

from openpyxl import Workbook

from .importar import leer_csv_myinvestor, preparar_myinvestor


class MyInvestorTest(unittest.TestCase):
    def test_csv(self):
        crudo = (
            "Fecha fiscal;Inversión;Valor de mercado;Resultado fiscal\r\n"
            "15/01/2024;1.000,00;1.100,00;\r\n"
            "10/03/2024;0,00;0,00;42,50\r\n"
        ).encode()
        lotes, reembolsos = leer_csv_myinvestor("IE00B03HCZ61.csv", crudo)
        self.assertEqual(lotes, [["2024-01-15", 1000.0, 1100.0]])
        self.assertEqual(reembolsos, [["2024-03-10", 42.5]])

    def test_excel(self):
        libro = Workbook()
        hoja = libro.active
        hoja.append(["Fecha fiscal", "Inversión", "Valor de mercado", "Resultado fiscal"])
        hoja.append([dt.datetime(2024, 1, 15), 1000, 1100, None])
        salida = io.BytesIO()
        libro.save(salida)
        lotes, reembolsos = leer_csv_myinvestor("IE00B03HCZ61.xlsx", salida.getvalue())
        self.assertEqual(lotes, [["2024-01-15", 1000.0, 1100.0]])
        self.assertEqual(reembolsos, [])

    def test_archivo_dañado_no_revienta(self):
        self.assertEqual(leer_csv_myinvestor("IE00B03HCZ61.xlsx", b"no es un excel"), ([], []))

    def test_producto_por_defecto_si_el_nombre_no_lleva_isin(self):
        cfg = {
            "productos": [{"id": "mi_fondo", "nombre": "Mi fondo", "fuente": "manual"}],
            "movimientos": [],
            "valoraciones": [],
        }
        crudo = "Fecha fiscal;Inversión;Valor de mercado\n15/01/2024;1.000,00;1.100,00\n".encode()
        plan = preparar_myinvestor(cfg, [("extracto.csv", crudo)], "/tmp", "mi_fondo")
        self.assertIn("se valora a mano", plan.errores[0]["mensaje"])


if __name__ == "__main__":
    unittest.main()
