# -*- coding: utf-8 -*-
"""Pruebas unitarias de traspasos FIFO, fiscalidad IRPF (España) y dividendos."""

import datetime as dt
import json
import os
import tempfile
import unittest
import uuid
from unittest.mock import patch

from . import almacen, db, motor, servidor


class IrpfAhorroTests(unittest.TestCase):
    def test_tramos_irpf_ahorro(self):
        self.assertEqual(motor.calcular_irpf_ahorro(0), 0.0)
        self.assertEqual(motor.calcular_irpf_ahorro(-500), 0.0)
        self.assertEqual(motor.calcular_irpf_ahorro(6000), 1140.0)
        self.assertEqual(motor.calcular_irpf_ahorro(50000), 10380.0)
        self.assertEqual(motor.calcular_irpf_ahorro(200000), 44880.0)
        self.assertEqual(motor.calcular_irpf_ahorro(300000), 71880.0)
        self.assertEqual(motor.calcular_irpf_ahorro(350000), 86880.0)


class AlmacenTraspasoYRetencionTests(unittest.TestCase):
    def _cfg_base(self):
        return {
            "version": 1,
            "titular": "Fiscal Test",
            "productos": [
                {"id": "f_orig", "nombre": "Fondo Origen", "corto": "Origen", "tipo": "fondo", "fuente": "morningstar", "codigo": "F001", "moneda": "EUR", "slot": 1},
                {"id": "f_dest", "nombre": "Fondo Destino", "corto": "Destino", "tipo": "fondo", "fuente": "morningstar", "codigo": "F002", "moneda": "EUR", "slot": 2},
                {"id": "f_man", "nombre": "Manual", "corto": "Manual", "tipo": "otro", "fuente": "manual", "moneda": "EUR", "slot": 3},
                {"id": "ef1", "nombre": "Efectivo", "corto": "Efectivo", "tipo": "efectivo", "fuente": "manual", "moneda": "EUR", "slot": 4},
            ],
            "movimientos": [
                {"id": "m1", "producto": "f_orig", "fecha": "2024-01-10", "tipo": "compra", "unidades": 100.0, "importe": 1000.0},
            ],
            "valoraciones": [],
        }

    def test_validacion_traspaso_y_unidades(self):
        cfg = self._cfg_base()
        # Traspaso al mismo fondo -> error
        with self.assertRaises(almacen.ErrorValidacion):
            almacen.guarda_movimiento(cfg, {
                "producto": "f_orig", "productoDestino": "f_orig", "tipo": "traspaso",
                "fecha": "2024-06-10", "unidades": 50, "unidadesDestino": 25, "importe": 600,
            })
        # Traspaso a manual o saldo -> error
        for dest in ("f_man", "ef1"):
            with self.assertRaises(almacen.ErrorValidacion):
                almacen.guarda_movimiento(cfg, {
                    "producto": "f_orig", "productoDestino": dest, "tipo": "traspaso",
                    "fecha": "2024-06-10", "unidades": 50, "unidadesDestino": 25, "importe": 600,
                })
        # Traspaso con unidades excesivas -> error
        with self.assertRaises(almacen.ErrorValidacion):
            almacen.guarda_movimiento(cfg, {
                "producto": "f_orig", "productoDestino": "f_dest", "tipo": "traspaso",
                "fecha": "2024-06-10", "unidades": 120, "unidadesDestino": 60, "importe": 1400,
            })

        # Traspaso parcial valido
        mov = almacen.guarda_movimiento(cfg, {
            "producto": "f_orig", "productoDestino": "f_dest", "tipo": "traspaso",
            "fecha": "2024-06-10", "unidades": 40, "unidadesDestino": 20, "importe": 500,
        })
        self.assertEqual(mov["productoDestino"], "f_dest")
        self.assertEqual(mov["unidadesDestino"], 20.0)
        self.assertAlmostEqual(almacen.unidades_a(cfg, "f_orig", "2024-06-10"), 60.0)
        self.assertAlmostEqual(almacen.unidades_a(cfg, "f_dest", "2024-06-10"), 20.0)

        # Borrar producto destino elimina tambien sus traspasos entrantes
        almacen.borra_producto(cfg, "f_dest")
        self.assertEqual(len(cfg["movimientos"]), 1)

    def test_validacion_retencion_dividendo(self):
        cfg = self._cfg_base()
        with self.assertRaises(almacen.ErrorValidacion):
            almacen.guarda_movimiento(cfg, {
                "producto": "f_orig", "tipo": "dividendo", "fecha": "2024-06-10",
                "importe": 100.0, "retencion": 100.0,
            })
        with self.assertRaises(almacen.ErrorValidacion):
            almacen.guarda_movimiento(cfg, {
                "producto": "f_orig", "tipo": "dividendo", "fecha": "2024-06-10",
                "importe": 100.0, "retencion": -5.0,
            })
        div = almacen.guarda_movimiento(cfg, {
            "producto": "f_orig", "tipo": "dividendo", "fecha": "2024-06-10",
            "importe": 100.0, "retencion": 19.0,
        })
        self.assertEqual(div["retencion"], 19.0)


class TraspasosYFiscalidadMotorTests(unittest.TestCase):
    def _escribir_precios_constantes(self, cache_dir, fechas, mapa):
        for nombre_archivo, serie in mapa.items():
            with open(os.path.join(cache_dir, f"{nombre_archivo}.json"), "w", encoding="utf-8") as f:
                json.dump(serie, f)
        serie_ref = {f: 100.0 for f in fechas}
        for sim in {s for r in motor.REFERENCIAS.values() for s, _ in r["piezas"]}:
            with open(os.path.join(cache_dir, f"{sim}.json"), "w", encoding="utf-8") as f:
                json.dump(serie_ref, f)

    def test_traspaso_parcial_y_total_con_arrastre_fifo_y_venta_posterior(self):
        with tempfile.TemporaryDirectory() as tmp:
            cache_dir = os.path.join(tmp, "cache")
            os.makedirs(cache_dir, exist_ok=True)
            hoy = dt.date(2025, 2, 10)
            ini = dt.date(2023, 1, 10)
            fechas = [(ini + dt.timedelta(days=i)).isoformat() for i in range((hoy - ini).days + 1)]

            # Fondo A sube de 10 -> 15; Fondo B esta en 20 y sube a 30
            serie_a = {f: (10.0 if f < "2024-01-01" else 15.0) for f in fechas}
            serie_b = {f: (20.0 if f < "2024-07-01" else 30.0) for f in fechas}
            self._escribir_precios_constantes(cache_dir, fechas, {"F_A.EUR": serie_a, "F_B.EUR": serie_b})

            cfg = {
                "titular": "Traspasos FIFO",
                "moneda": "EUR",
                "productos": [
                    {"id": "fa", "nombre": "Fondo A", "corto": "Fondo A", "tipo": "fondo", "fuente": "yahoo", "codigo": "F_A.EUR", "moneda": "EUR", "slot": 1},
                    {"id": "fb", "nombre": "Fondo B", "corto": "Fondo B", "tipo": "fondo", "fuente": "yahoo", "codigo": "F_B.EUR", "moneda": "EUR", "slot": 2},
                ],
                "movimientos": [
                    # Compra lote 1: 100u @ 10 = 1000 EUR
                    {"id": "m1", "producto": "fa", "fecha": "2023-01-10", "tipo": "compra", "unidades": 100.0, "importe": 1000.0},
                    # Compra lote 2: 100u @ 15 = 1500 EUR
                    {"id": "m2", "producto": "fa", "fecha": "2024-02-01", "tipo": "compra", "unidades": 100.0, "importe": 1500.0},
                    # Traspaso parcial (50u del lote 1, coste 500 EUR, valor de mercado 750 EUR) -> 37.5u de Fondo B (@ 20)
                    {"id": "m3", "producto": "fa", "productoDestino": "fb", "fecha": "2024-06-01", "tipo": "traspaso", "unidades": 50.0, "unidadesDestino": 37.5, "importe": 750.0},
                    # Traspaso total del resto de Fondo A (150u: 50u de lote 1 coste 500 + 100u de lote 2 coste 1500 = 2000 EUR, valor 2250 EUR) -> 112.5u de Fondo B
                    {"id": "m4", "producto": "fa", "productoDestino": "fb", "fecha": "2024-06-15", "tipo": "traspaso", "unidades": 150.0, "unidadesDestino": 112.5, "importe": 2250.0},
                    # Venta en Fondo B de 75u el 2025-02-01 @ 30 = 2250 EUR.
                    # FIFO: consume las 37.5u (coste 500, fecha_origen 2023-01-10) + 37.5u del segundo traspaso (coste 500, fecha_origen 2023-01-10) = coste 1000 EUR!
                    {"id": "m5", "producto": "fb", "fecha": "2025-02-01", "tipo": "venta", "unidades": 75.0, "importe": 2250.0},
                ],
                "valoraciones": [],
            }

            with patch.object(motor, "hoy", return_value=hoy):
                datos = motor.construir(cfg, tmp, descargar=False)

            # Aportado restante tras vender 1000 de coste de los 2500 aportados inicialmente = 1500 EUR
            self.assertEqual(datos["total"]["aportado"], 1500.0)
            # Solo la venta tributa/realiza plusvalia: 2250 - 1000 = 1250 EUR (traspasos realizados = 0)
            self.assertEqual(datos["total"]["realizado"], 1250.0)
            fa = next(p for p in datos["productos"] if p["id"] == "fa")
            fb = next(p for p in datos["productos"] if p["id"] == "fb")
            self.assertEqual(fa["realizado"], 0.0)
            self.assertEqual(fa["participaciones"], 0.0)
            self.assertEqual(fb["participaciones"], 75.0)
            self.assertEqual(fb["aportado"], 1500.0)

            # Flujos externos sin traspasos en comparacion (2 compras = 2500, 1 venta = -2250 -> aportado acumulado = 250)
            self.assertEqual(datos["comparacion"]["aportado"][-1], 250.0)

            # Operacion fiscal en destino conserva fecha de adquisicion original 2023-01-10 y coste FIFO 1000
            ops_2025 = datos["fiscalidad"]["porAnio"][0]["operaciones"]
            self.assertEqual(len(ops_2025), 1)
            op = ops_2025[0]
            self.assertEqual(op["productoId"], "fb")
            self.assertEqual(op["costeFifo"], 1000.0)
            self.assertEqual(op["plusvalia"], 1250.0)
            self.assertEqual(op["fechaAdquisicionMin"], "2023-01-10")
            self.assertEqual(op["diasTenencia"], (dt.date(2025, 2, 1) - dt.date(2023, 1, 10)).days)

    def test_compensacion_25_tlh_y_dividendos(self):
        with tempfile.TemporaryDirectory() as tmp:
            cache_dir = os.path.join(tmp, "cache")
            os.makedirs(cache_dir, exist_ok=True)
            hoy = dt.date(2025, 3, 10)
            ini = dt.date(2024, 1, 10)
            fechas = [(ini + dt.timedelta(days=i)).isoformat() for i in range((hoy - ini).days + 1)]

            # p_loss cae de 100 a 60 (-400 EUR latente sobre 1000 invertidos)
            # p_small_loss cae de 100 a 97 (-30 EUR, NO debe aparecer en TLH por umbral < -50)
            # p_div estable en 100
            self._escribir_precios_constantes(cache_dir, fechas, {
                "LOSS.EUR": {f: (100.0 if f < "2025-01-01" else 60.0) for f in fechas},
                "SMALL.EUR": {f: (100.0 if f < "2025-01-01" else 97.0) for f in fechas},
                "DIV.EUR": {f: 100.0 for f in fechas},
            })

            cfg = {
                "titular": "Fiscal y Dividendos",
                "moneda": "EUR",
                "productos": [
                    {"id": "p_loss", "nombre": "Fondo Caida", "corto": "Caida", "tipo": "etf", "fuente": "yahoo", "codigo": "LOSS.EUR", "moneda": "EUR", "slot": 1},
                    {"id": "p_small", "nombre": "Fondo Pequena", "corto": "Pequena", "tipo": "etf", "fuente": "yahoo", "codigo": "SMALL.EUR", "moneda": "EUR", "slot": 2},
                    {"id": "p_div", "nombre": "Accion Div", "corto": "DivCo", "tipo": "accion", "fuente": "yahoo", "codigo": "DIV.EUR", "moneda": "EUR", "slot": 3},
                ],
                "movimientos": [
                    # Compra y venta parcial con perdida de 500 EUR en 2024
                    {"id": "m1", "producto": "p_loss", "fecha": "2024-02-01", "tipo": "compra", "unidades": 20.0, "importe": 2000.0},
                    {"id": "m2", "producto": "p_loss", "fecha": "2024-06-01", "tipo": "venta", "unidades": 10.0, "importe": 500.0},
                    # Compra p_small (1000 -> 970, -30 EUR)
                    {"id": "m3", "producto": "p_small", "fecha": "2024-02-01", "tipo": "compra", "unidades": 10.0, "importe": 1000.0},
                    # Compra p_div (10000 EUR)
                    {"id": "m4", "producto": "p_div", "fecha": "2024-02-01", "tipo": "compra", "unidades": 100.0, "importe": 10000.0},
                    # Dividendos 2024: 1000 bruto, retencion 190 (neto 810) -> compensa max 25% de 1000 = 250 EUR de los -500!
                    {"id": "m5", "producto": "p_div", "fecha": "2024-09-15", "tipo": "dividendo", "unidades": 0, "importe": 1000.0, "retencion": 190.0},
                    # Dividendo 2025: 400 bruto, retencion 76 (neto 324)
                    {"id": "m6", "producto": "p_div", "fecha": "2025-02-15", "tipo": "dividendo", "unidades": 0, "importe": 400.0, "retencion": 76.0},
                ],
                "valoraciones": [],
            }

            with patch.object(motor, "hoy", return_value=hoy):
                datos = motor.construir(cfg, tmp, descargar=False)

            fisc = datos["fiscalidad"]
            por_anio = {x["anio"]: x for x in fisc["porAnio"]}
            self.assertIn("2024", por_anio)
            self.assertIn("2025", por_anio)

            f2024 = por_anio["2024"]
            self.assertEqual(f2024["ganancias"], 0.0)
            self.assertEqual(f2024["perdidas"], 500.0)
            self.assertEqual(f2024["saldoGananciasPerdidas"], -500.0)
            self.assertEqual(f2024["dividendosBrutos"], 1000.0)
            self.assertEqual(f2024["retenciones"], 190.0)
            # Compensacion cruzada topada al 25% de 1000 = 250 EUR
            self.assertEqual(f2024["compensacionAplicada"], 250.0)
            self.assertEqual(f2024["baseAhorroNeta"], 750.0)
            self.assertEqual(f2024["impuestoEstimado"], round(750.0 * 0.19, 2))
            self.assertEqual(f2024["cuotaDiferencial"], round(750.0 * 0.19 - 190.0, 2))

            # Tax-Loss Harvesting: solo p_loss (-400 < -50), no p_small (-30)
            tlh = fisc["taxLossHarvesting"]
            self.assertEqual(len(tlh), 1)
            self.assertEqual(tlh[0]["id"], "p_loss")
            self.assertEqual(tlh[0]["minusvaliaLatente"], 400.0)
            self.assertEqual(tlh[0]["ahorroFiscalEstimado"], round(400.0 * 0.19, 2))
            self.assertTrue(tlh[0]["avisoRegla2Meses"])

            # Plusvalia latente global (negativa: -430) -> impuesto si liquida hoy = 0.0
            self.assertEqual(fisc["plusvaliaLatente"]["bruta"], -430.0)
            self.assertEqual(fisc["plusvaliaLatente"]["impuestoSiLiquidaHoy"], 0.0)

            # Dividendos
            div = datos["dividendos"]
            self.assertEqual(div["totalHistorico"], 1400.0)
            self.assertEqual(div["totalNetoHistorico"], 1134.0)
            self.assertEqual(div["anioActual"], 400.0)
            # Ambos dividendos (2024-09-15 y 2025-02-15) estan dentro de los ultimos 365 dias desde 2025-03-10
            self.assertEqual(div["ultimos12Meses"], 1400.0)
            self.assertEqual(div["mediaMensual12m"], round(1400.0 / 12.0, 2))
            self.assertAlmostEqual(div["yieldCartera"], round(1400.0 / datos["total"]["patrimonio"], 4), places=4)
            self.assertAlmostEqual(div["yieldOnCost"], round(1400.0 / datos["total"]["aportado"], 4), places=4)
            self.assertEqual(len(div["porMes"]), 14)  # feb-2024 .. mar-2025
            self.assertEqual(div["porMes"][0]["mes"], "2024-02")
            self.assertEqual(div["porMes"][-1]["mes"], "2025-03")
            self.assertEqual(len(div["porProducto"]), 1)
            self.assertEqual(div["porProducto"][0]["id"], "p_div")
            self.assertEqual(div["porProducto"][0]["yieldActual"], round(1400.0 / 10000.0, 4))
            self.assertEqual(div["porProducto"][0]["yieldOnCost"], round(1400.0 / 10000.0, 4))


class DbMigracionTraspasoTests(unittest.TestCase):
    def setUp(self):
        if not db.activo():
            self.skipTest("PostgreSQL no disponible")
        db.inicia()
        self.email = f"trasp-{uuid.uuid4().hex[:12]}@example.com"
        self.uid = db.crear_usuario(self.email, "Traspaso Test", "clavevalida123")["id"]

    def tearDown(self):
        if getattr(self, "uid", None) and db.activo():
            with db._conectar() as con, con.cursor() as cur:
                cur.execute("DELETE FROM usuarios WHERE id = %s", (self.uid,))
                con.commit()

    def test_sincronizar_relacional_persiste_traspaso_y_retencion(self):
        cfg = {
            "version": 1,
            "titular": "DB Test",
            "productos": [
                {"id": "f1", "nombre": "Fondo 1", "corto": "F1", "tipo": "fondo", "fuente": "morningstar", "codigo": "C1"},
                {"id": "f2", "nombre": "Fondo 2", "corto": "F2", "tipo": "fondo", "fuente": "morningstar", "codigo": "C2"},
            ],
            "movimientos": [
                {"id": "m1", "producto": "f1", "fecha": "2024-01-10", "tipo": "compra", "unidades": 100.0, "importe": 1000.0},
                {"id": "m2", "producto": "f1", "productoDestino": "f2", "fecha": "2024-06-10", "tipo": "traspaso", "unidades": 50.0, "unidadesDestino": 25.0, "importe": 600.0},
                {"id": "m3", "producto": "f2", "fecha": "2024-09-10", "tipo": "dividendo", "unidades": 0.0, "importe": 100.0, "retencion": 19.0},
            ],
            "valoraciones": [],
        }
        db.guardar_cartera(self.uid, cfg, crear_copia=False)
        with db._conectar() as con, con.cursor() as cur:
            cur.execute(
                "SELECT id, tipo, producto_destino, unidades_destino, retencion "
                "FROM movimientos_rel WHERE usuario_id = %s ORDER BY id",
                (self.uid,),
            )
            filas = cur.fetchall()
        self.assertEqual(len(filas), 3)
        self.assertEqual(filas[1]["producto_destino"], "f2")
        self.assertEqual(filas[1]["unidades_destino"], 25.0)
        self.assertEqual(filas[2]["retencion"], 19.0)


if __name__ == "__main__":
    unittest.main()
