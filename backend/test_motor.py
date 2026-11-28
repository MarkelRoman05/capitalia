# -*- coding: utf-8 -*-
"""Pruebas unitarias del motor financiero (motor.py) y endurecimiento del servidor (servidor.py)."""

import datetime as dt
import gzip
import json
import os
import tempfile
import time
import unittest
from unittest.mock import MagicMock, patch

from . import almacen, db, motor, servidor


class UtilidadesMotorTests(unittest.TestCase):
    def test_num_es_formatos(self):
        self.assertAlmostEqual(motor.num_es("1.399,89"), 1399.89)
        self.assertAlmostEqual(motor.num_es("3352,6"), 3352.6)
        self.assertAlmostEqual(motor.num_es("13.25"), 13.25)
        self.assertAlmostEqual(motor.num_es("1.000"), 1000.0)
        self.assertAlmostEqual(motor.num_es("-2.500,50 €"), -2500.5)
        self.assertEqual(motor.num_es(""), 0.0)
        self.assertEqual(motor.num_es(None), 0.0)
        self.assertEqual(motor.num_es("no-num"), 0.0)

    def test_xirr_basico_y_casos_invalidos(self):
        t0 = dt.date(2024, 1, 1)
        t1 = dt.date(2024, 12, 31)  # 365 dias exactos (2024 es bisiesto)
        tir = motor.xirr([(t0, -1000.0), (t1, 1100.0)])
        self.assertIsNotNone(tir)
        self.assertAlmostEqual(tir, 0.10, places=4)

        # Flujos compuestos conocidos
        tir2 = motor.xirr([
            (dt.date(2023, 1, 1), -1000.0),
            (dt.date(2024, 1, 1), -1000.0),
            (dt.date(2025, 1, 1), 2310.0),
        ])
        self.assertIsNotNone(tir2)
        self.assertAlmostEqual(tir2, 0.0998, places=3)

        # Casos invalidos
        self.assertIsNone(motor.xirr([]))
        self.assertIsNone(motor.xirr([(t0, -1000.0)]))
        self.assertIsNone(motor.xirr([(t0, -1000.0), (t1, -500.0)]))
        self.assertIsNone(motor.xirr([(t0, 1000.0), (t1, 500.0)]))

    def test_aplicar_movimientos_fifo_comisiones_dividendos_y_exceso(self):
        prod = {"id": "p1", "corto": "Fondo Test"}
        movs = [
            {"fecha": "2024-01-10", "tipo": "compra", "unidades": 10, "importe": 1000, "comision": 5},
            {"fecha": "2024-02-10", "tipo": "compra", "unidades": 10, "importe": 2000, "comision": 10},
            {"fecha": "2024-03-10", "tipo": "dividendo", "unidades": 0, "importe": 50},
            {"fecha": "2024-04-10", "tipo": "comision", "unidades": 0, "importe": 15},
            {"fecha": "2024-05-10", "tipo": "venta", "unidades": 15, "importe": 3000},
        ]
        motor.AVISOS.clear()
        res = motor.aplicar_movimientos(prod, movs)
        # Coste FIFO vendido: 10*100 + 5*200 = 2000 -> plusvalia venta 1000 + dividendo 50 - comision 15 = 1035
        self.assertAlmostEqual(res["realizado"], 1035.0, places=2)
        self.assertAlmostEqual(res["comisiones"], 30.0, places=2)
        self.assertEqual(len(res["vendidas"]), 2)
        self.assertEqual(len(res["eventos"]), 3)
        self.assertEqual(res["eventos"][2], ("2024-05-10", -15.0, -2000.0))
        self.assertEqual(len(res["flujos"]), 5)
        self.assertEqual(motor.AVISOS, [])

        # Venta excesiva: vende 10 teniendo solo 5 restantes
        movs_exceso = movs + [
            {"fecha": "2024-06-10", "tipo": "venta", "unidades": 10, "importe": 1200},
        ]
        motor.AVISOS.clear()
        res_ex = motor.aplicar_movimientos(prod, movs_exceso)
        self.assertTrue(any("vendes más unidades" in a for a in motor.AVISOS))
        # Solo quedaban 5 unidades con coste 1000; realizado += 1200 - 1000 = +200 -> 1235
        self.assertAlmostEqual(res_ex["realizado"], 1235.0, places=2)
        self.assertEqual(res_ex["eventos"][-1], ("2024-06-10", -5.0, -1000.0))


class ConstruirMotorTests(unittest.TestCase):
    def _escribir_cache_refs(self, cache_dir, fechas, precio=100.0):
        serie = {f: precio for f in fechas}
        for sim in {s for r in motor.REFERENCIAS.values() for s, _ in r["piezas"]}:
            with open(os.path.join(cache_dir, f"{sim}.json"), "w", encoding="utf-8") as f:
                json.dump(serie, f)

    def test_drawdown_twr_inmune_a_aportacion_y_ter_compuesto(self):
        with tempfile.TemporaryDirectory() as tmp:
            cache_dir = os.path.join(tmp, "cache")
            os.makedirs(cache_dir, exist_ok=True)

            hoy = dt.date(2025, 1, 10)
            fechas = [(hoy - dt.timedelta(days=4 - i)).isoformat() for i in range(5)]
            # Caida del 50% el dia 2 (10 -> 5), seguida de recuperacion parcial a 7.5
            precios_etf = {
                fechas[0]: 10.0,
                fechas[1]: 10.0,
                fechas[2]: 5.0,
                fechas[3]: 5.0,
                fechas[4]: 7.5,
            }
            with open(os.path.join(cache_dir, "TEST.EUR.json"), "w", encoding="utf-8") as f:
                json.dump(precios_etf, f)
            self._escribir_cache_refs(cache_dir, fechas, precio=100.0)

            cfg = {
                "titular": "Cartera Test",
                "moneda": "EUR",
                "productos": [
                    {
                        "id": "etf1",
                        "nombre": "ETF Test",
                        "corto": "ETF Test",
                        "tipo": "etf",
                        "fuente": "yahoo",
                        "codigo": "TEST.EUR",
                        "moneda": "EUR",
                        "ter": 0.015,
                        "slot": 1,
                    }
                ],
                "movimientos": [
                    # Compra inicial de 1.000 EUR
                    {"producto": "etf1", "fecha": fechas[0], "tipo": "compra", "unidades": 100.0, "importe": 1000.0},
                    # Aportacion enorme justo el dia del desplome (-50%): el patrimonio sube de 1.000 a 100.500 EUR
                    {"producto": "etf1", "fecha": fechas[2], "tipo": "compra", "unidades": 20000.0, "importe": 100000.0},
                ],
                "valoraciones": [],
            }

            with patch.object(motor, "hoy", return_value=hoy):
                datos = motor.construir(cfg, tmp, descargar=False)

            self.assertIsNotNone(datos)
            # La aportacion grande no maquilla la caida maxima real (-50%)
            self.assertEqual(datos["total"]["caidaMaxima"], -0.5)
            self.assertEqual(datos["total"]["caidaMaximaFecha"], fechas[2])
            self.assertIn("serieDrawdown", datos)
            self.assertEqual(len(datos["serieDrawdown"]), len(datos["fechas"]))
            self.assertTrue(all(v <= 0.0 for v in datos["serieDrawdown"]))
            self.assertEqual(min(datos["serieDrawdown"]), datos["total"]["caidaMaxima"])

            # TER compuesto real a 10 y 20 anos
            com = datos["comisiones"]
            self.assertEqual(com["tasaReferencia"], 0.07)
            self.assertGreater(com["impacto10a"], com["anual"] * 10)
            self.assertGreater(com["impacto20a"], com["impacto10a"])
            self.assertEqual(len(com["lineas"]), 1)
            linea = com["lineas"][0]
            self.assertGreater(linea["impacto10a"], linea["anual"] * 10)
            self.assertGreater(linea["impacto20a"], linea["impacto10a"])

            # REFERENCIAS aclara acumulacion / Total Return neto
            self.assertIsNotNone(datos["comparacion"])
            for ref in datos["comparacion"]["referencias"]:
                txt = ref["detalle"].lower()
                self.assertIn("acumulación", txt)
                self.assertIn("total return", txt)

    def test_drawdown_fallback_sin_productos_invertidos(self):
        with tempfile.TemporaryDirectory() as tmp:
            hoy = dt.date(2025, 1, 5)
            f0 = (hoy - dt.timedelta(days=2)).isoformat()
            f1 = (hoy - dt.timedelta(days=1)).isoformat()
            f2 = hoy.isoformat()
            cfg = {
                "titular": "Solo Manual",
                "moneda": "EUR",
                "productos": [
                    {
                        "id": "man1",
                        "nombre": "Inmueble Manual",
                        "corto": "Inmueble",
                        "tipo": "inmueble",
                        "fuente": "manual",
                        "slot": 1,
                    }
                ],
                "movimientos": [],
                "valoraciones": [
                    {"producto": "man1", "fecha": f0, "valor": 1000.0},
                    {"producto": "man1", "fecha": f1, "valor": 800.0},
                    {"producto": "man1", "fecha": f2, "valor": 900.0},
                ],
            }
            with patch.object(motor, "hoy", return_value=hoy):
                datos = motor.construir(cfg, tmp, descargar=False)
            self.assertEqual(datos["total"]["caidaMaxima"], -0.2)
            self.assertEqual(datos["total"]["caidaMaximaFecha"], f1)
            self.assertEqual(datos["serieDrawdown"], [0.0, -0.2, -0.1])


class ServidorSeguridadYCompresionTests(unittest.TestCase):
    def setUp(self):
        self._backup_intentos = dict(servidor._INTENTOS_AUTH)

    def tearDown(self):
        servidor._INTENTOS_AUTH.clear()
        servidor._INTENTOS_AUTH.update(self._backup_intentos)

    def test_gzip_en_respuestas_grandes_y_no_en_pequenas(self):
        with tempfile.TemporaryDirectory() as tmp:
            # Payload grande (> 1024 bytes) en /api/panel
            calc_grande = {
                "generado": "2025-01-10T00:00:00Z",
                "fechas": [f"2025-01-{d:02d}" for d in range(1, 31)],
                "productos": [{"id": f"p{i}", "nombre": "Producto Largo " + ("X" * 40)} for i in range(25)],
                "serieDrawdown": [0.0] * 30,
            }
            with open(os.path.join(tmp, "cartera.json"), "w", encoding="utf-8") as f:
                json.dump({"titular": "Test", "productos": [], "movimientos": [], "valoraciones": []}, f)
            with open(os.path.join(tmp, "calculado_propio.json"), "w", encoding="utf-8") as f:
                json.dump(calc_grande, f)

            client = servidor.app.test_client()
            with (
                patch.object(servidor, "DATOS_BASE", tmp),
                patch.object(servidor.db, "activo", return_value=False),
            ):
                # Con Accept-Encoding: gzip y payload >= 1024 B -> comprimido
                r_gz = client.get("/api/panel", headers={"Accept-Encoding": "gzip, deflate"})
                self.assertEqual(r_gz.status_code, 200)
                self.assertEqual(r_gz.headers.get("Content-Encoding"), "gzip")
                self.assertIn("Accept-Encoding", r_gz.headers.get("Vary", ""))
                self.assertEqual(int(r_gz.headers.get("Content-Length")), len(r_gz.data))
                descomprimido = json.loads(gzip.decompress(r_gz.data).decode("utf-8"))
                self.assertEqual(descomprimido["datos"]["serieDrawdown"], [0.0] * 30)

                # Sin Accept-Encoding: gzip -> sin compresion
                r_plain = client.get("/api/panel", headers={"Accept-Encoding": "identity"})
                self.assertEqual(r_plain.status_code, 200)
                self.assertIsNone(r_plain.headers.get("Content-Encoding"))

                # Payload < 1024 B (/api/ping) aunque pida gzip -> sin compresion
                r_small = client.get("/api/ping", headers={"Accept-Encoding": "gzip"})
                self.assertEqual(r_small.status_code, 200)
                self.assertIsNone(r_small.headers.get("Content-Encoding"))

    def test_safe_join_traversal_y_cache_control_estaticos(self):
        with tempfile.TemporaryDirectory() as tmp:
            dist_dir = os.path.join(tmp, "dist")
            os.makedirs(dist_dir, exist_ok=True)
            with open(os.path.join(dist_dir, "index.html"), "w", encoding="utf-8") as f:
                f.write("<html><body>Capitalia</body></html>")
            with open(os.path.join(dist_dir, "main-AbCd1234.js"), "w", encoding="utf-8") as f:
                f.write("console.log('capitalia');")
            with open(os.path.join(dist_dir, "styles-ZyXw9876.css"), "w", encoding="utf-8") as f:
                f.write("body{margin:0}")
            with open(os.path.join(dist_dir, "font-Q1w2E3r4.woff2"), "wb") as f:
                f.write(b"wOF2")
            with open(os.path.join(tmp, "secreto.txt"), "w", encoding="utf-8") as f:
                f.write("NO_EXPONER")

            client = servidor.app.test_client()
            with (
                patch.object(servidor, "DIST_ANGULAR", dist_dir),
                patch.object(servidor.db, "activo", return_value=False),
            ):
                # Traversal rechazado
                for ruta in ("/../secreto.txt", "/..%2fsecreto.txt", "/%2e%2e/secreto.txt", "/..%5csecreto.txt"):
                    r_trav = client.get(ruta)
                    self.assertEqual(r_trav.status_code, 404)
                    self.assertNotIn(b"NO_EXPONER", r_trav.data)

                # Assets hasheados con cache inmutable de 1 ano
                for asset in ("/main-AbCd1234.js", "/styles-ZyXw9876.css", "/font-Q1w2E3r4.woff2"):
                    r_asset = client.get(asset)
                    self.assertEqual(r_asset.status_code, 200)
                    self.assertEqual(r_asset.headers.get("Cache-Control"), "public, max-age=31536000, immutable")
                    r_asset.close()

                # index.html y rutas SPA sin cache
                for spa_ruta in ("/", "/index.html", "/cartera/resumen"):
                    r_idx = client.get(spa_ruta)
                    self.assertEqual(r_idx.status_code, 200)
                    self.assertEqual(r_idx.headers.get("Cache-Control"), "no-cache, no-store, must-revalidate")
                    r_idx.close()

    def test_cerrojo_por_usuario_y_purga_rate_limit(self):
        self.assertIs(servidor._obtener_cerrojo(101), servidor._obtener_cerrojo(101))
        self.assertIsNot(servidor._obtener_cerrojo(101), servidor._obtener_cerrojo(202))
        self.assertIs(servidor._obtener_cerrojo(None), servidor.cerrojo)

        servidor._INTENTOS_AUTH.clear()
        expirado = time.time() - (servidor.VENTANA_SEGUNDOS + 30)
        for i in range(520):
            servidor._INTENTOS_AUTH[f"login:10.0.{i // 256}.{i % 256}"] = [expirado]
        servidor._INTENTOS_AUTH["reset-ip:192.0.2.1"] = [time.time() - 120]

        ok = servidor._comprobar_rate_limit("login:198.51.100.1")
        self.assertTrue(ok)
        self.assertLess(len(servidor._INTENTOS_AUTH), 10)
        self.assertIn("reset-ip:192.0.2.1", servidor._INTENTOS_AUTH)
        self.assertIn("login:198.51.100.1", servidor._INTENTOS_AUTH)


class AnaliticaAvanzadaMotorTests(unittest.TestCase):
    def test_metricas_avanzadas_heatmap_dispersion_xray_salud_y_estres(self):
        with tempfile.TemporaryDirectory() as tmp:
            cache_dir = os.path.join(tmp, "cache")
            os.makedirs(cache_dir, exist_ok=True)

            ini = dt.date(2024, 11, 1)
            hoy = dt.date(2025, 3, 15)
            dias = (hoy - ini).days + 1
            fechas = [(ini + dt.timedelta(days=i)).isoformat() for i in range(dias)]

            # Benchmark IWDA.AS con caida intermedia y recuperacion + volatilidad realista
            serie_world = {}
            serie_us = {}
            serie_btc = {}
            serie_bono = {}
            px_w = 100.0
            px_us = 100.0
            px_btc = 100.0
            px_bono = 100.0
            for idx, f_iso in enumerate(fechas):
                # Patron ciclico con caida en tramo 30..45 y recuperacion posterior
                if 30 <= idx < 45:
                    dw = -0.008 if idx % 2 == 0 else 0.001
                elif 45 <= idx < 65:
                    dw = 0.010 if idx % 2 == 0 else 0.003
                else:
                    dw = 0.004 if idx % 3 != 0 else -0.002
                px_w *= 1.0 + dw
                px_us *= 1.0 + (1.25 * dw + 0.0003)
                px_btc *= 1.0 + (2.0 * dw)
                px_bono *= 1.0 + 0.0001
                serie_world[f_iso] = round(px_w, 4)
                serie_us[f_iso] = round(px_us, 4)
                serie_btc[f_iso] = round(px_btc, 4)
                serie_bono[f_iso] = round(px_bono, 4)

            for sim in ("IWDA.AS", "SXR8.DE", "EUNA.DE", "XEON.DE"):
                with open(os.path.join(cache_dir, f"{sim}.json"), "w", encoding="utf-8") as f:
                    json.dump(serie_world, f)
            with open(os.path.join(cache_dir, "US.EUR.json"), "w", encoding="utf-8") as f:
                json.dump(serie_us, f)
            with open(os.path.join(cache_dir, "BONO.EUR.json"), "w", encoding="utf-8") as f:
                json.dump(serie_bono, f)
            with open(os.path.join(cache_dir, "CG_bitcoin.json"), "w", encoding="utf-8") as f:
                json.dump(serie_btc, f)

            # 12 paises para probar top 10 + Resto sin duplicar Resto
            paises_world = [
                ["Estados Unidos", 62.0],
                ["Japón", 6.0],
                ["Reino Unido", 4.0],
                ["Canadá", 3.0],
                ["Francia", 3.0],
                ["Alemania", 3.0],
                ["Suiza", 3.0],
                ["España", 2.0],
                ["Italia", 2.0],
                ["Países Bajos", 2.0],
                ["India", 2.0],
                ["Brasil", 2.0],
                ["Resto", 6.0],
            ]
            expo_world = {
                "paises": paises_world,
                "sectores": [["Tecnología", 42.0], ["Financiero", 30.0], ["Salud", 28.0]],
                "top10": [["NVIDIA", 6.0], ["Apple", 5.0], ["Microsoft", 4.0]],
            }
            expo_us = {
                "paises": [["Estados Unidos", 100.0]],
                "sectores": [["Tecnología", 40.0], ["Consumo discrecional", 60.0]],
                "top10": [["apple", 8.0], ["nvidia", 7.0], ["Amazon", 4.0]],
            }

            cfg = {
                "titular": "Cartera Avanzada",
                "moneda": "EUR",
                "gastoMensual": 2000.0,
                "comparador": [
                    {"id": "real", "nombre": "Mi cartera real", "real": True},
                    {"id": "solo_world", "nombre": "Ref World", "pesos": {"p_world": 1.0}},
                ],
                "productos": [
                    {
                        "id": "p_world",
                        "nombre": "Fondo Global",
                        "corto": "Global",
                        "tipo": "fondo",
                        "fuente": "yahoo",
                        "codigo": "IWDA.AS",
                        "moneda": "EUR",
                        "exposicion": expo_world,
                        "slot": 1,
                    },
                    {
                        "id": "p_us",
                        "nombre": "ETF USA",
                        "corto": "USA ETF",
                        "tipo": "etf",
                        "fuente": "yahoo",
                        "codigo": "US.EUR",
                        "moneda": "EUR",
                        "exposicion": expo_us,
                        "slot": 2,
                    },
                    {
                        "id": "p_hedged",
                        "nombre": "ETF USA EUR Hedged",
                        "corto": "USA Hedged",
                        "tipo": "etf",
                        "fuente": "yahoo",
                        "codigo": "US.EUR",
                        "moneda": "EUR",
                        "cobertura": "Cubierto EUR",
                        "exposicion": {"paises": [["Estados Unidos", 100.0]], "sectores": [["Tecnología", 50.0]], "top10": []},
                        "slot": 3,
                    },
                    {
                        "id": "p_bono",
                        "nombre": "Bono Euro",
                        "corto": "Bono Euro",
                        "tipo": "bono",
                        "fuente": "yahoo",
                        "codigo": "BONO.EUR",
                        "moneda": "EUR",
                        "slot": 4,
                    },
                    {
                        "id": "p_btc",
                        "nombre": "Bitcoin",
                        "corto": "Bitcoin",
                        "tipo": "cripto",
                        "fuente": "coingecko",
                        "codigo": "bitcoin",
                        "moneda": "EUR",
                        "slot": 5,
                    },
                    {
                        "id": "p_mon",
                        "nombre": "Fondo Monetario Euro",
                        "corto": "Monetario",
                        "tipo": "fondo",
                        "tipoDetalle": "Fondo monetario",
                        "clase": "Liquidez",
                        "fuente": "yahoo",
                        "codigo": "BONO.EUR",
                        "moneda": "EUR",
                        "slot": 6,
                    },
                    {
                        "id": "p_efec",
                        "nombre": "Cuenta Corriente",
                        "corto": "Efectivo",
                        "tipo": "efectivo",
                        "fuente": "manual",
                        "moneda": "EUR",
                        "slot": 7,
                    },
                    {
                        "id": "p_inm",
                        "nombre": "Vivienda",
                        "corto": "Vivienda",
                        "tipo": "inmueble",
                        "fuente": "manual",
                        "moneda": "EUR",
                        "slot": 8,
                    },
                    {
                        "id": "p_deuda",
                        "nombre": "Hipoteca",
                        "corto": "Hipoteca",
                        "tipo": "deuda",
                        "fuente": "manual",
                        "moneda": "EUR",
                        "slot": 9,
                    },
                ],
                "movimientos": [
                    {"producto": "p_world", "fecha": fechas[0], "tipo": "compra", "unidades": 6000.0 / serie_world[fechas[0]], "importe": 6000.0},
                    {"producto": "p_us", "fecha": fechas[0], "tipo": "compra", "unidades": 4000.0 / serie_us[fechas[0]], "importe": 4000.0},
                    {"producto": "p_hedged", "fecha": fechas[0], "tipo": "compra", "unidades": 2000.0 / serie_us[fechas[0]], "importe": 2000.0},
                    {"producto": "p_bono", "fecha": fechas[0], "tipo": "compra", "unidades": 2000.0 / serie_bono[fechas[0]], "importe": 2000.0},
                    {"producto": "p_btc", "fecha": fechas[0], "tipo": "compra", "unidades": 1000.0 / serie_btc[fechas[0]], "importe": 1000.0},
                    {"producto": "p_mon", "fecha": fechas[0], "tipo": "compra", "unidades": 3000.0 / serie_bono[fechas[0]], "importe": 3000.0},
                ],
                "valoraciones": [
                    {"producto": "p_efec", "fecha": fechas[0], "valor": 5000.0},
                    {"producto": "p_inm", "fecha": fechas[0], "valor": 10000.0},
                    {"producto": "p_deuda", "fecha": fechas[0], "valor": 4000.0},
                ],
            }

            with patch.object(motor, "hoy", return_value=hoy):
                datos = motor.construir(cfg, tmp, descargar=False)

            self.assertIsNotNone(datos)

            # 1. Metricas avanzadas en comparador
            comp_real = next(c for c in datos["comparador"] if c["id"] == "real")
            met = comp_real["metricas"]
            self.assertIn("rfUsado", met)
            self.assertIsNotNone(met["sortino"])
            self.assertIsNotNone(met["beta"])
            self.assertIsNotNone(met["alfa"])
            self.assertIsInstance(met["maxDiasRecuperacion"], int)
            self.assertGreater(met["maxDiasRecuperacion"], 0)

            comp_w = next(c for c in datos["comparador"] if c["id"] == "solo_world")
            self.assertAlmostEqual(comp_w["metricas"]["beta"], 1.0, places=3)
            self.assertAlmostEqual(comp_w["metricas"]["alfa"], 0.0, places=3)

            # Verifica fallback rf=0.02 cuando no hay monetario
            cfg_sin_mon = json.loads(json.dumps(cfg))
            cfg_sin_mon["productos"] = [p for p in cfg_sin_mon["productos"] if p["id"] != "p_mon"]
            cfg_sin_mon["movimientos"] = [m for m in cfg_sin_mon["movimientos"] if m["producto"] != "p_mon"]
            with patch.object(motor, "hoy", return_value=hoy):
                datos_sin_mon = motor.construir(cfg_sin_mon, tmp, descargar=False)
            comp_sin_mon = next(c for c in datos_sin_mon["comparador"] if c["id"] == "real")
            self.assertEqual(comp_sin_mon["metricas"]["rfUsado"], 0.02)

            # 2. Heatmap mensual
            hm = datos["heatmapMensual"]
            self.assertEqual([fila["ano"] for fila in hm], ["2024", "2025"])
            self.assertEqual(len(hm[0]["meses"]), 12)
            self.assertIsNone(hm[0]["meses"][0])  # Enero 2024 fuera de rango
            self.assertIsNotNone(hm[0]["meses"][10])  # Nov 2024
            self.assertIsNotNone(hm[0]["meses"][11])  # Dic 2024
            self.assertEqual(hm[0]["total"], datos["rentabilidadAnual"]["cartera"][0])
            self.assertIsNotNone(hm[1]["meses"][0])  # Ene 2025
            self.assertIsNone(hm[1]["meses"][5])  # Jun 2025 fuera de rango

            # 3. Dispersion activos
            disp = datos["dispersionActivos"]
            ids_disp = {d["id"] for d in disp}
            self.assertIn("p_world", ids_disp)
            self.assertIn("p_us", ids_disp)
            for item in disp:
                self.assertTrue(str(item["color"]).startswith("#"))
                self.assertIsNotNone(item["cagr"])
                self.assertIsNotNone(item["vol"])
                self.assertIn("sortino", item)
                self.assertIn("maxDD", item)

            # 4. X-Ray consolidado (solapamiento, paises top10+Resto, divisas FX, alertas)
            xray = datos["xray"]
            self.assertLess(xray["coberturaExpoPct"], 100.0)
            self.assertGreater(xray["coberturaExpoPct"], 0.0)
            nombres_paises = [p[0] for p in xray["paises"]]
            self.assertEqual(nombres_paises.count("Resto"), 1)
            self.assertLessEqual(len(xray["paises"]), 11)
            self.assertEqual(xray["paises"][0][0], "Estados Unidos")
            self.assertGreater(xray["paises"][0][1], 60.0)

            top_emp = {e["nombre"].lower(): e for e in xray["topEmpresas"]}
            self.assertIn("nvidia", top_emp)
            self.assertIn("apple", top_emp)
            self.assertTrue(top_emp["nvidia"]["solapado"])
            self.assertEqual(len(top_emp["nvidia"]["productos"]), 2)
            self.assertTrue(top_emp["apple"]["solapado"])
            self.assertFalse(top_emp["microsoft"]["solapado"])

            divisas_dict = dict(xray["divisas"])
            self.assertIn("EUR", divisas_dict)
            self.assertIn("USD", divisas_dict)
            # Hedged + Bono + Monetario + Efectivo + Inmueble + Bitcoin(EUR) + parte EUR de World deben dar EUR sustancial
            self.assertGreater(divisas_dict["EUR"], 50.0)
            self.assertTrue(any("Estados Unidos" in a for a in xray["alertas"]))
            self.assertTrue(any("Tecnología" in a for a in xray["alertas"]))
            self.assertTrue(any("NVIDIA" in a or "Apple" in a for a in xray["alertas"]))

            # 5. Salud financiera
            salud = datos["salud"]
            mon_val = next(p["valor"] for p in datos["productos"] if p["id"] == "p_mon")
            efec_val = next(p["valor"] for p in datos["otrosActivos"] if p["id"] == "p_efec")
            self.assertAlmostEqual(salud["liquidez"], round(mon_val + efec_val, 2), places=2)
            self.assertEqual(salud["deudaTotal"], 4000.0)
            self.assertAlmostEqual(salud["activosBrutos"], round(datos["total"]["patrimonio"] + 4000.0, 2), places=2)
            self.assertAlmostEqual(salud["ratioDeuda"], round(4000.0 / salud["activosBrutos"], 4), places=4)
            self.assertEqual(salud["gastoMensual"], 2000.0)
            self.assertAlmostEqual(salud["mesesColchon"], round(salud["liquidez"] / 2000.0, 2), places=2)

            # 6. Test de estres orientativo
            estres = {e["id"]: e for e in datos["estres"]}
            self.assertEqual(set(estres.keys()), {"crisis_2008", "covid_2020", "inflacion_2022"})
            pat = datos["total"]["patrimonio"]
            for esc in estres.values():
                self.assertAlmostEqual(esc["patrimonioResultante"], round(pat + esc["impactoEur"], 2), places=2)
                self.assertLess(esc["impactoEur"], 0.0)
                self.assertLess(esc["caidaPct"], 0.0)


class ObjetivoGastoMensualTests(unittest.TestCase):
    def test_api_objetivo_guarda_y_borra_gasto_mensual(self):
        with tempfile.TemporaryDirectory() as tmp:
            cfg_ini = {
                "version": 1,
                "titular": "Test",
                "productos": [
                    {"id": "ef1", "nombre": "Cuenta", "corto": "Cuenta", "tipo": "efectivo", "fuente": "manual", "slot": 1}
                ],
                "movimientos": [],
                "valoraciones": [{"id": "v1", "producto": "ef1", "fecha": "2025-01-10", "valor": 10000.0}],
                "objetivo": {"activo": True, "importe": 100000, "etiqueta": "Meta"},
            }
            with open(os.path.join(tmp, "cartera.json"), "w", encoding="utf-8") as f:
                json.dump(cfg_ini, f)

            client = servidor.app.test_client()
            with (
                patch.object(servidor, "DATOS_BASE", tmp),
                patch.object(servidor.db, "activo", return_value=False),
            ):
                # Guardar gastoMensual junto con objetivo
                r1 = client.post(
                    "/api/objetivo",
                    headers={"X-Capitalia-CSRF": "1"},
                    json={
                        "importeObjetivo": 120000,
                        "etiquetaObjetivo": "Libertad",
                        "activoObjetivo": True,
                        "gastoMensual": 2500,
                    },
                )
                self.assertEqual(r1.status_code, 200)
                d1 = r1.get_json()
                self.assertEqual(d1["cartera"]["gastoMensual"], 2500.0)
                self.assertEqual(d1["datos"]["salud"]["gastoMensual"], 2500.0)
                self.assertEqual(d1["datos"]["salud"]["mesesColchon"], 4.0)

                # Validacion negativa rechazada
                r_bad = client.post(
                    "/api/objetivo",
                    headers={"X-Capitalia-CSRF": "1"},
                    json={"gastoMensual": -100},
                )
                self.assertEqual(r_bad.status_code, 400)

                r_bool = client.post(
                    "/api/objetivo",
                    headers={"X-Capitalia-CSRF": "1"},
                    json={"gastoMensual": True},
                )
                self.assertEqual(r_bool.status_code, 400)

                # Borrar gastoMensual enviando null o vacio
                r2 = client.post(
                    "/api/objetivo",
                    headers={"X-Capitalia-CSRF": "1"},
                    json={"gastoMensual": None},
                )
                self.assertEqual(r2.status_code, 200)
                d2 = r2.get_json()
                self.assertNotIn("gastoMensual", d2["cartera"])
                self.assertIsNone(d2["datos"]["salud"]["gastoMensual"])
                self.assertIsNone(d2["datos"]["salud"]["mesesColchon"])


class ProductosEspecializadosTests(unittest.TestCase):
    def test_almacen_validacion_campos_especializados_y_borrado(self):
        cfg = json.loads(json.dumps(almacen.CARTERA_VACIA))

        # Bono con fecha de vencimiento futura valida
        bono, _ = almacen.guarda_producto(cfg, {
            "nombre": "Bono Tesoro 2028",
            "tipo": "bono",
            "fuente": "manual",
            "tae": 3.25,
            "cuponAnual": 3.5,
            "fechaEmision": "2024-01-15",
            "fechaVencimiento": "2028-12-31",
            "frecuenciaCupon": "anual",
        })
        self.assertEqual(bono["fechaVencimiento"], "2028-12-31")
        self.assertEqual(bono["tae"], 3.25)
        self.assertEqual(bono["frecuenciaCupon"], "anual")

        # Validaciones negativas: vencimiento < emision, emision futura, frecuencia invalida
        with self.assertRaises(almacen.ErrorValidacion):
            almacen.guarda_producto(cfg, {
                "nombre": "Bono Malo", "tipo": "bono", "fuente": "manual",
                "fechaEmision": "2024-05-01", "fechaVencimiento": "2024-01-01",
            })
        with self.assertRaises(almacen.ErrorValidacion):
            almacen.guarda_producto(cfg, {
                "nombre": "Bono Futuro Emi", "tipo": "bono", "fuente": "manual",
                "fechaEmision": "2099-01-01",
            })
        with self.assertRaises(almacen.ErrorValidacion):
            almacen.guarda_producto(cfg, {
                "nombre": "Bono Frec", "tipo": "bono", "fuente": "manual",
                "frecuenciaCupon": "semanal",
            })

        # Inmueble + hipoteca vinculada y limpieza al borrar inmueble
        inm, _ = almacen.guarda_producto(cfg, {
            "nombre": "Piso Alquiler",
            "tipo": "inmueble",
            "fuente": "manual",
            "alquilerMensual": 1000,
            "gastosAnuales": 2000,
        })
        hip, _ = almacen.guarda_producto(cfg, {
            "nombre": "Hipoteca Piso",
            "tipo": "deuda",
            "fuente": "manual",
            "tipoInteres": 2.5,
            "tipoTasa": "fijo",
            "cuotaMensual": 550,
            "fechaVencimiento": "2045-06-30",
            "inmuebleId": inm["id"],
        })
        self.assertEqual(hip["inmuebleId"], inm["id"])
        almacen.borra_producto(cfg, inm["id"])
        self.assertNotIn("inmuebleId", hip)

    def test_motor_especializados_rf_pensiones_inmobiliario(self):
        with tempfile.TemporaryDirectory() as tmp:
            hoy = dt.date(2025, 3, 10)
            vto_proximo = (hoy + dt.timedelta(days=15)).isoformat()
            vto_lejano = "2027-06-30"
            cfg = {
                "titular": "Especializados",
                "moneda": "EUR",
                "productos": [
                    {
                        "id": "bono_prox",
                        "nombre": "Letra Tesoro 15d",
                        "corto": "Letra 15d",
                        "tipo": "bono",
                        "fuente": "manual",
                        "tae": 3.4,
                        "cuponAnual": 0.0,
                        "frecuenciaCupon": "vencimiento",
                        "fechaEmision": "2024-03-25",
                        "fechaVencimiento": vto_proximo,
                        "slot": 1,
                    },
                    {
                        "id": "dep_largo",
                        "nombre": "Depósito 2027",
                        "corto": "Depósito 27",
                        "tipo": "efectivo",
                        "fuente": "manual",
                        "tae": 3.0,
                        "fechaVencimiento": vto_lejano,
                        "slot": 2,
                    },
                    {
                        "id": "plan_pen",
                        "nombre": "Plan Pensiones Indexado",
                        "corto": "Plan Indexado",
                        "tipo": "pension",
                        "fuente": "manual",
                        "limiteAnual": 1500.0,
                        "tipoMarginalIrpf": 37.0,
                        "slot": 3,
                    },
                    {
                        "id": "piso1",
                        "nombre": "Piso Centro",
                        "corto": "Piso Centro",
                        "tipo": "inmueble",
                        "fuente": "manual",
                        "alquilerMensual": 1000.0,
                        "gastosAnuales": 2000.0,
                        "slot": 4,
                    },
                    {
                        "id": "hip1",
                        "nombre": "Hipoteca Piso",
                        "corto": "Hipoteca Piso",
                        "tipo": "deuda",
                        "fuente": "manual",
                        "tipoInteres": 2.5,
                        "tipoTasa": "fijo",
                        "cuotaMensual": 550.0,
                        "fechaVencimiento": "2045-06-30",
                        "inmuebleId": "piso1",
                        "slot": 5,
                    },
                    {
                        "id": "prestamo_coche",
                        "nombre": "Préstamo Coche",
                        "corto": "Préstamo Coche",
                        "tipo": "deuda",
                        "fuente": "manual",
                        "tipoInteres": 6.5,
                        "tipoTasa": "fijo",
                        "cuotaMensual": 250.0,
                        "fechaVencimiento": "2028-01-01",
                        "slot": 6,
                    },
                ],
                "movimientos": [
                    {"id": "m1", "producto": "plan_pen", "fecha": "2025-02-01", "tipo": "compra", "unidades": 0, "importe": 1000.0},
                ],
                "valoraciones": [
                    {"id": "v1", "producto": "bono_prox", "fecha": "2025-03-10", "valor": 10000.0, "aportado": 9670.0},
                    {"id": "v2", "producto": "dep_largo", "fecha": "2025-03-10", "valor": 5000.0},
                    {"id": "v3", "producto": "plan_pen", "fecha": "2025-03-10", "valor": 12000.0},
                    {"id": "v4", "producto": "piso1", "fecha": "2025-03-10", "valor": 200000.0},
                    {"id": "v5", "producto": "hip1", "fecha": "2025-03-10", "valor": 80000.0},
                    {"id": "v6", "producto": "prestamo_coche", "fecha": "2025-03-10", "valor": 10000.0},
                ],
            }

            with patch.object(motor, "hoy", return_value=hoy):
                datos = motor.construir(cfg, tmp, descargar=False)

            esp = datos["especializados"]

            # Renta Fija ordenada ascendente por vencimiento (sin incluir deudas)
            rf = esp["rentaFija"]
            self.assertEqual([x["id"] for x in rf], ["bono_prox", "dep_largo"])
            self.assertTrue(rf[0]["proximoVencimiento"])
            self.assertEqual(rf[0]["diasRestantes"], 15)
            self.assertFalse(rf[1]["proximoVencimiento"])
            self.assertEqual(rf[1]["interesAnualEstimado"], 150.0)

            # Pensiones
            pen = esp["pensiones"]
            self.assertEqual(pen["totalAportadoAnio"], 1000.0)
            self.assertEqual(pen["totalLimiteAnual"], 1500.0)
            self.assertEqual(pen["totalMargenRestante"], 500.0)
            self.assertEqual(pen["totalAhorroEstimado"], 370.0)
            self.assertEqual(pen["items"][0]["ahorroFiscalEstimado"], 370.0)

            # Inmobiliario
            inm = esp["inmobiliario"]["inmuebles"][0]
            self.assertEqual(inm["valorInmueble"], 200000.0)
            self.assertEqual(inm["deudaPendiente"], 80000.0)
            self.assertEqual(inm["equityNeto"], 120000.0)
            self.assertAlmostEqual(inm["porcentajePagado"], 0.6, places=4)
            self.assertAlmostEqual(inm["ltv"], 0.4, places=4)
            self.assertAlmostEqual(inm["rentabilidadBruta"], 0.06, places=4)
            self.assertAlmostEqual(inm["rentabilidadNeta"], 0.05, places=4)
            self.assertEqual(len(inm["hipotecas"]), 1)
            self.assertEqual(inm["hipotecas"][0]["id"], "hip1")

            sueltas = esp["inmobiliario"]["hipotecasSueltas"]
            self.assertEqual([h["id"] for h in sueltas], ["prestamo_coche"])
            self.assertEqual(sueltas[0]["deudaPendiente"], 10000.0)


class BlueprintsYPoolTests(unittest.TestCase):
    def test_todos_los_blueprints_registrados_y_operativos(self):
        self.assertTrue({"auth", "panel", "importar", "cartera"}.issubset(set(servidor.app.blueprints.keys())))
        with tempfile.TemporaryDirectory() as tmp:
            with open(os.path.join(tmp, "cartera.json"), "w", encoding="utf-8") as f:
                json.dump(almacen.CARTERA_VACIA, f)
            client = servidor.app.test_client()
            with (
                patch.object(servidor, "DATOS_BASE", tmp),
                patch.object(servidor.db, "activo", return_value=False),
            ):
                self.assertEqual(client.get("/api/ping").status_code, 200)
                self.assertEqual(client.get("/api/version").status_code, 200)
                self.assertEqual(client.get("/api/auth/yo").get_json()["modo"], "local")
                # Proxy seguro de logos de bancos: valida dominio y cachea respuesta
                self.assertEqual(client.get("/api/bancos/logo?dominio=../../etc/passwd").status_code, 400)
                self.assertEqual(client.get("/api/bancos/logo?dominio=").status_code, 400)
                fake_img = b"\x89PNG\r\n\x1a\n" + b"\x00" * 200
                with patch.object(servidor.buscar, "descargar_logo_banco", return_value=(fake_img, "image/png")) as m_dl:
                    r1 = client.get("/api/bancos/logo?dominio=bbva.com")
                    self.assertEqual(r1.status_code, 200)
                    self.assertEqual(r1.mimetype, "image/png")
                    self.assertEqual(r1.headers.get("X-Content-Type-Options"), "nosniff")
                    r2 = client.get("/api/bancos/logo?dominio=bbva.com")
                    self.assertEqual(r2.status_code, 200)
                    # Segunda llamada servida desde caché en disco sin re-descargar
                    self.assertEqual(m_dl.call_count, 1)
                self.assertEqual(client.get("/api/panel").status_code, 200)
                self.assertEqual(client.get("/api/cartera").status_code, 200)
                self.assertEqual(client.get("/api/plantilla.csv").status_code, 200)
                self.assertEqual(client.get("/api/prompt").status_code, 200)

                # Alta y borrado de producto especializado via cartera_bp
                r_post = client.post(
                    "/api/productos",
                    headers={"X-Capitalia-CSRF": "1"},
                    json={
                        "nombre": "Bono Especial",
                        "tipo": "bono",
                        "fuente": "manual",
                        "tae": 3.5,
                        "fechaVencimiento": "2029-12-31",
                    },
                )
                self.assertEqual(r_post.status_code, 200)
                pid = r_post.get_json()["item"]["id"]
                self.assertEqual(r_post.get_json()["item"]["fechaVencimiento"], "2029-12-31")
                r_del = client.delete(f"/api/productos/{pid}", headers={"X-Capitalia-CSRF": "1"})
                self.assertEqual(r_del.status_code, 200)

    def test_pool_conexiones_lazy_y_cierre(self):
        fake_pool = MagicMock()
        fake_conn_ctx = MagicMock()
        fake_pool.connection.return_value = fake_conn_ctx
        fake_cfg = {"host": "127.0.0.1", "port": "5432", "dbname": "cap_test", "user": "u", "password": "p"}
        with (
            patch.object(db, "ConnectionPool", return_value=fake_pool) as mock_pool_cls,
            patch.object(db, "_PSYCOPG", True),
            patch.object(db, "_cfg", return_value=fake_cfg),
            patch.dict(db._POOLS, {}, clear=True),
        ):
            c1 = db._conectar()
            c2 = db._conectar()
            self.assertIs(c1, fake_conn_ctx)
            self.assertIs(c2, fake_conn_ctx)
            self.assertEqual(mock_pool_cls.call_count, 1)
            db._cerrar_pools()
            fake_pool.close.assert_called_once()


class ConversionDivisasTests(unittest.TestCase):
    def setUp(self):
        motor._COTIZACIONES.clear()
        motor.AVISOS.clear()

    def test_simbolo_fx_estandar_y_peniques(self):
        self.assertEqual(motor.simbolo_fx("EUR"), (None, 1.0))
        self.assertEqual(motor.simbolo_fx("usd"), ("USDEUR=X", 1.0))
        self.assertEqual(motor.simbolo_fx("GBp"), ("GBPEUR=X", 0.01))
        self.assertEqual(motor.simbolo_fx("GBX"), ("GBPEUR=X", 0.01))
        self.assertEqual(motor.simbolo_fx("CHF"), ("CHFEUR=X", 1.0))

    def test_en_euros_usd_gbp_y_fx_faltante(self):
        series = {
            "USDEUR=X": {"2025-01-02": 0.90, "2025-01-03": 0.92},
            "GBPEUR=X": {"2025-01-02": 1.20},
        }
        usd_conv = motor.en_euros({"2025-01-02": 100.0, "2025-01-04": 110.0}, "USD", series)
        self.assertAlmostEqual(usd_conv["2025-01-02"], 90.0, places=4)
        # El 2025-01-04 (sábado) toma el último tipo de cambio anterior (2025-01-03 = 0.92)
        self.assertAlmostEqual(usd_conv["2025-01-04"], 101.2, places=4)

        gbp_conv = motor.en_euros({"2025-01-02": 2500.0}, "GBp", series)
        self.assertAlmostEqual(gbp_conv["2025-01-02"], 30.0, places=4)

        sin_fx = motor.en_euros({"2025-01-02": 100.0}, "JPY", series)
        self.assertEqual(sin_fx, {})
        self.assertTrue(any("JPYEUR=X" in a for a in motor.AVISOS))

    def test_precio_eur_con_respaldo_corrige_congelados_y_saltos(self):
        p = {
            "id": "etp_btc",
            "corto": "BTC ETP",
            "fuente": "yahoo",
            "codigo": "WBTC.PA",
            "moneda": "EUR",
            "respaldo": "BTCW.SW",
            "respaldoMoneda": "CHF",
        }
        series = {
            "WBTC.PA": {"2025-01-02": 10.0, "2025-01-03": 7.465, "2025-01-06": 20.0},
            "BTCW.SW": {"2025-01-02": 10.0, "2025-01-03": 10.5},
            "CHFEUR=X": {"2025-01-02": 1.0, "2025-01-03": 1.0},
        }
        limpia = motor.precio_eur(p, series, tolerancia=0.03)
        self.assertAlmostEqual(limpia["2025-01-02"], 10.0)
        # 7.465 discrepa > 3% frente al respaldo 10.5 -> manda el respaldo
        self.assertAlmostEqual(limpia["2025-01-03"], 10.5)
        # 20.0 sin respaldo ese día salta > 15% sobre 10.5 -> se descarta
        self.assertNotIn("2025-01-06", limpia)


class AtribucionFxYRentasPasivasTests(unittest.TestCase):
    def test_desglose_fx_reconcilia_exactamente_activo_mas_divisa(self):
        # Compra 10 acciones a 100 USD con cambio 0.80 EUR/USD -> coste 800 EUR
        # Hoy valen 120 USD con cambio 0.90 EUR/USD -> valor 1080 EUR (plusvalía +280 EUR)
        # Efecto activo: (1200 - 1000) * 0.80 = +160 EUR
        # Efecto divisa: 1200 * (0.90 - 0.80) = +120 EUR
        # Total: 160 + 120 = +280 EUR
        fx_serie = {"2024-01-10": 0.80, "2025-01-10": 0.90}
        lotes = [[10.0, 800.0, "2024-01-10", 1]]
        desg = motor.calcular_desglose_fx("USD", 108.0, lotes, fx_serie, dt.date(2025, 1, 10))
        self.assertIsNotNone(desg)
        self.assertEqual(desg["moneda"], "USD")
        self.assertAlmostEqual(desg["fxCompraMedio"], 0.80, places=4)
        self.assertAlmostEqual(desg["fxActual"], 0.90, places=4)
        self.assertAlmostEqual(desg["efectoActivoEur"], 160.0, places=2)
        self.assertAlmostEqual(desg["efectoDivisaEur"], 120.0, places=2)
        self.assertAlmostEqual(desg["plusvaliaTotalEur"], 280.0, places=2)
        self.assertAlmostEqual(
            desg["efectoActivoEur"] + desg["efectoDivisaEur"],
            desg["plusvaliaTotalEur"],
            places=2,
        )

    def test_construir_comparador_fallback_fx_y_calendario_cobros(self):
        with tempfile.TemporaryDirectory() as tmp:
            hoy = dt.date(2025, 6, 15)
            fechas = [dt.date(2025, 1, 1) + dt.timedelta(days=i) for i in range(166)]
            serie_aapl = {f.isoformat(): 100.0 + i * 0.15 for i, f in enumerate(fechas)}
            serie_fx = {f.isoformat(): 0.90 + (0.02 if i > 80 else 0.0) for i, f in enumerate(fechas)}
            serie_iwda = {f.isoformat(): 80.0 + i * 0.08 for i, f in enumerate(fechas)}
            cache_dir = os.path.join(tmp, "cache")
            os.makedirs(cache_dir, exist_ok=True)
            for nom, data in (("AAPL.json", serie_aapl), ("USDEUR_X.json", serie_fx), ("IWDA.AS.json", serie_iwda)):
                with open(os.path.join(cache_dir, nom), "w", encoding="utf-8") as fh:
                    json.dump(data, fh)

            cfg = {
                "titular": "Inversor Global",
                "moneda": "EUR",
                # Sin 'comparador' en cfg: debe autogenerar 'real'
                "productos": [
                    {
                        "id": "aapl",
                        "nombre": "Apple Inc.",
                        "corto": "Apple",
                        "tipo": "accion",
                        "fuente": "yahoo",
                        "codigo": "AAPL",
                        "moneda": "USD",
                        "slot": 1,
                    },
                    {
                        "id": "cuenta_rem",
                        "nombre": "Cuenta Remunerada 3%",
                        "corto": "Cuenta 3%",
                        "tipo": "efectivo",
                        "fuente": "manual",
                        "tae": 3.0,
                        "frecuenciaCupon": "mensual",
                        "slot": 2,
                    },
                    {
                        "id": "piso_alq",
                        "nombre": "Piso Alquiler",
                        "corto": "Piso Alq",
                        "tipo": "inmueble",
                        "fuente": "manual",
                        "alquilerMensual": 1000.0,
                        "gastosAnuales": 2000.0,
                        "slot": 3,
                    },
                    {
                        "id": "hip_alq",
                        "nombre": "Hipoteca Piso",
                        "corto": "Hipoteca",
                        "tipo": "deuda",
                        "fuente": "manual",
                        "tipoInteres": 2.5,
                        "tipoTasa": "fijo",
                        "inmuebleId": "piso_alq",
                        "slot": 4,
                    },
                ],
                "movimientos": [
                    {"id": "m1", "producto": "aapl", "fecha": "2025-01-02", "tipo": "compra", "unidades": 10.0, "importe": 900.0},
                    {"id": "m2", "producto": "aapl", "fecha": "2025-05-15", "tipo": "dividendo", "unidades": 0.0, "importe": 40.0, "retencion": 7.6},
                ],
                "valoraciones": [
                    {"id": "v1", "producto": "cuenta_rem", "fecha": "2025-06-15", "valor": 10000.0},
                    {"id": "v2", "producto": "piso_alq", "fecha": "2025-06-15", "valor": 200000.0},
                    {"id": "v3", "producto": "hip_alq", "fecha": "2025-06-15", "valor": 80000.0},
                ],
            }

            with patch.object(motor, "hoy", return_value=hoy):
                datos = motor.construir(cfg, tmp, descargar=False)

            # 1. Comparador real autogenerado aunque cfg no lo tuviera
            self.assertTrue(any(c.get("real") for c in datos["comparador"]))

            # 2. Desglose FX en producto USD y total en X-Ray
            aapl = next(p for p in datos["productos"] if p["id"] == "aapl")
            self.assertIn("desgloseFx", aapl)
            self.assertIn("desgloseFxTotal", datos["xray"])
            self.assertEqual(datos["xray"]["desgloseFxTotal"]["numProductos"], 1)

            # 3. Rentabilidad neta tras intereses hipoteca en inmueble
            inm = datos["especializados"]["inmobiliario"]["inmuebles"][0]
            self.assertAlmostEqual(inm["interesesHipotecaAnuales"], 2000.0, places=2)
            self.assertAlmostEqual(inm["cashflowAnualNeto"], 8000.0, places=2)
            self.assertAlmostEqual(inm["rentabilidadNetaConHipoteca"], 0.04, places=4)

            # 4. Ingresos pasivos consolidados y calendario de próximos cobros
            pas = datos["dividendos"]["ingresosPasivos"]
            self.assertAlmostEqual(pas["dividendos12m"], 40.0, places=2)
            self.assertAlmostEqual(pas["interesesRentaFija"], 300.0, places=2)
            self.assertAlmostEqual(pas["alquileresAnuales"], 12000.0, places=2)
            self.assertAlmostEqual(pas["anualTotal"], 12340.0, places=2)
            tipos_cobro = {c["tipo"] for c in datos["dividendos"]["proximosCobros"]}
            self.assertTrue({"dividendo", "cupon", "alquiler"}.issubset(tipos_cobro))
            self.assertEqual(len(datos["dividendos"]["proximosCobrosPorMes"]), 12)

    def test_frecuencia_mensual_aceptada_en_almacen(self):
        cfg = json.loads(json.dumps(almacen.CARTERA_VACIA))
        prod, _ = almacen.guarda_producto(cfg, {
            "nombre": "Cuenta Remunerada",
            "tipo": "efectivo",
            "fuente": "manual",
            "tae": 2.75,
            "frecuenciaCupon": "mensual",
        })
        self.assertEqual(prod["frecuenciaCupon"], "mensual")


if __name__ == "__main__":
    unittest.main()
