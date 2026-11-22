import datetime as dt
import json
import os
import tempfile
import unittest
from unittest.mock import patch

from backend import almacen, buscar, carteras_catalogo, servidor


class BuscarProductosTests(unittest.TestCase):
    def setUp(self):
        buscar._CACHE_BUSQUEDA.clear()

    def test_inferencia_politica_cobertura_y_gestora(self):
        self.assertEqual(buscar._inferir_politica("Vanguard Global Stock Index Inv EUR Acc"), "Acumulación")
        self.assertEqual(buscar._inferir_politica("Amundi IS MSCI World AE-D"), "Distribución")
        self.assertEqual(buscar._inferir_politica("Fondo genérico", "C"), "Acumulación")
        self.assertEqual(buscar._inferir_cobertura("iShares MSCI World EUR Hedged UCITS ETF"), "Cubierto EUR")
        self.assertIsNone(buscar._inferir_cobertura("iShares Core MSCI World UCITS ETF USD (Acc)"))
        self.assertEqual(buscar._inferir_gestora("Vanguard Global Stock Index Inv EUR Acc"), "Vanguard")
        self.assertEqual(buscar._inferir_gestora("Xtrackers MSCI World UCITS ETF 1C"), "Xtrackers (DWS)")

    def test_agrupar_etf_multibolsa_y_enriquecer_con_morningstar(self):
        ms_etfs = [
            {
                "SecId": "0P0000M8W1",
                "Name": "iShares Core MSCI World UCITS ETF USD (Acc)",
                "isin": "IE00B4L5Y983",
                "Universe": "ETEUR$$ALL",
                "PriceCurrency": "EUR",
                "ExchangeId": "EX$$$$XETR",
                "Ticker": "EUNL",
                "OngoingCharge": 0.2,
                "CollectedSRRI": 6,
                "CategoryName": "RV Global Cap. Grande Blend",
                "BrandingCompanyName": "iShares",
                "ReturnM12": 15.4,
                "DistributionStatus": "C",
                "FundTNAV": 80000000000,
                "StarRatingM255": 4,
            }
        ]
        yh_quotes = [
            {"symbol": "IWDA.AS", "quoteType": "ETF", "longname": "iShares Core MSCI World UCITS ETF USD (Acc)", "exchDisp": "Amsterdam"},
            {"symbol": "EUNL.DE", "quoteType": "ETF", "longname": "iShares Core MSCI World UCITS ETF USD (Acc)", "exchDisp": "XETRA"},
            {"symbol": "SWDA.MI", "quoteType": "ETF", "longname": "iShares Core MSCI World UCITS ETF USD (Acc)", "exchDisp": "Milan"},
        ]

        def fake_probar(fuente, codigo):
            mapa = {
                "IWDA.AS": {"precio": 122.71, "fecha": "2026-11-20", "moneda": "EUR", "mercado": "Amsterdam", "rentabilidad1a": 15.1},
                "EUNL.DE": {"precio": 122.72, "fecha": "2026-11-20", "moneda": "EUR", "mercado": "XETRA", "rentabilidad1a": 15.2},
                "SWDA.MI": {"precio": 122.74, "fecha": "2026-11-20", "moneda": "EUR", "mercado": "Milan", "rentabilidad1a": 15.0},
            }
            return mapa.get(codigo)

        def fake_ms(texto, universo="FOESP$$ALL|ETEUR$$ALL", ordenar_por_tamano=True, limite=10):
            return ms_etfs if "ETEUR" in universo else []

        with (
            patch.object(buscar, "ms_buscar", side_effect=fake_ms),
            patch.object(buscar, "yahoo_buscar", return_value=yh_quotes),
            patch.object(buscar, "cg_buscar", return_value=[]),
            patch.object(buscar, "probar", side_effect=fake_probar),
        ):
            res = buscar.buscar("MSCI World")

        self.assertEqual(len(res), 1)
        principal = res[0]
        self.assertEqual(principal["codigo"], "EUNL.DE")
        self.assertEqual(principal["isin"], "IE00B4L5Y983")
        self.assertEqual(principal["politica"], "Acumulación")
        self.assertEqual(principal["ficha"]["ter"], 0.2)
        self.assertEqual(principal["mercado"], "Xetra (Alemania)")
        self.assertEqual(len(principal["alternativas"]), 2)
        codigos_alt = {a["codigo"] for a in principal["alternativas"]}
        self.assertEqual(codigos_alt, {"IWDA.AS", "SWDA.MI"})

    def test_distintas_clases_fondo_no_se_mezclan_y_filtro_tipo(self):
        ms_fondos = [
            {
                "SecId": "F00000T66U",
                "Name": "Amundi IS MSCI World AE-C",
                "isin": "LU0996182563",
                "Universe": "FOESP$$ALL",
                "PriceCurrency": "EUR",
                "OngoingCharge": 0.3,
                "CollectedSRRI": 5,
                "CategoryName": "RV Global Cap. Grande Blend",
                "BrandingCompanyName": "Amundi",
                "DistributionStatus": "C",
                "FundTNAV": 5000000000,
            },
            {
                "SecId": "F00000T66V",
                "Name": "Amundi IS MSCI World AE-D",
                "isin": "LU0996182647",
                "Universe": "FOESP$$ALL",
                "PriceCurrency": "EUR",
                "OngoingCharge": 0.3,
                "CollectedSRRI": 5,
                "CategoryName": "RV Global Cap. Grande Blend",
                "BrandingCompanyName": "Amundi",
                "DistributionStatus": "D",
                "FundTNAV": 5000000000,
            },
        ]

        def fake_probar(fuente, codigo):
            return {"precio": 300.0, "fecha": "2026-11-20", "moneda": "EUR", "mercado": "Morningstar ES"}

        with (
            patch.object(buscar, "ms_buscar", side_effect=lambda q, u="FOESP$$ALL", o=True, l=10: ms_fondos if "FOESP" in u else []),
            patch.object(buscar, "yahoo_buscar", return_value=[{"symbol": "IWDA.AS", "quoteType": "ETF", "longname": "iShares Core MSCI World UCITS ETF"}]),
            patch.object(buscar, "cg_buscar", return_value=[]),
            patch.object(buscar, "probar", side_effect=fake_probar),
        ):
            res_fondos = buscar.buscar("Amundi MSCI", tipo="fondo")

        self.assertEqual(len(res_fondos), 2)
        self.assertEqual({r["politica"] for r in res_fondos}, {"Acumulación", "Distribución"})
        self.assertTrue(all(r["tipo"] == "fondo" for r in res_fondos))

    def test_probar_yahoo_calcula_rentabilidad_1a(self):
        ts_base = int(dt.datetime(2025, 11, 20, 12, 0).timestamp())
        timestamps = [ts_base + i * 86400 for i in range(25)]
        closes = [100.0] + [105.0] * 23 + [120.0]
        payload = {
            "chart": {
                "result": [
                    {
                        "meta": {
                            "currency": "EUR",
                            "longName": "Test ETF",
                            "fullExchangeName": "XETRA",
                            "regularMarketChangePercent": 1.25,
                        },
                        "timestamp": timestamps,
                        "indicators": {"quote": [{"close": closes}]},
                    }
                ]
            }
        }
        with patch.object(buscar, "_get", return_value=payload):
            info = buscar.probar("yahoo", "TEST.DE")
        self.assertIsNotNone(info)
        self.assertEqual(info["precio"], 120.0)
        self.assertEqual(info["rentabilidad1a"], 20.0)
        self.assertEqual(info["cambioDia"], 1.25)

    def test_filtra_futuros_diversifica_fondos_y_une_etf_sin_isin(self):
        ms_fondos = [
            {
                "SecId": f"F{i}",
                "Name": f"Amundi IS MSCI World Clase {i}",
                "isin": f"LU09961825{i:02d}",
                "Universe": "FOESP$$ALL",
                "PriceCurrency": "EUR",
                "OngoingCharge": 0.25,
                "CollectedSRRI": 5,
                "BrandingCompanyName": "Amundi",
                "FundTNAV": 5000000000,
            }
            for i in range(4)
        ] + [
            {
                "SecId": "FV1",
                "Name": "Fidelity MSCI World Index P-ACC-EUR",
                "isin": "IE00BYX5NX33",
                "Universe": "FOESP$$ALL",
                "PriceCurrency": "EUR",
                "OngoingCharge": 0.12,
                "CollectedSRRI": 5,
                "BrandingCompanyName": "Fidelity",
                "FundTNAV": 4000000000,
            }
        ]
        ms_etfs = [
            {
                "SecId": "E1",
                "Name": "iShares Core MSCI World UCITS ETF USD (Acc)",
                "isin": "IE00B4L5Y983",
                "Universe": "ETEUR$$ALL",
                "PriceCurrency": "EUR",
                "ExchangeId": "EX$$$$XETR",
                "Ticker": "EUNL",
                "BrandingCompanyName": "iShares",
                "DistributionStatus": "C",
                "FundTNAV": 80000000000,
            }
        ]
        yh_quotes = [
            {"symbol": "MSCIFUT=F", "quoteType": "FUTURE", "longname": "MSCI USA STRD CHF"},
            {"symbol": "EUNL.DE", "quoteType": "ETF", "longname": "iShares Core MSCI World UCITS ETF USD (Acc)", "exchDisp": "XETRA"},
            {"symbol": "IWDA.L", "quoteType": "ETF", "longname": "iShares Core MSCI World UCITS ETF USD (Acc)", "exchDisp": "London"},
        ]

        def fake_probar(fuente, codigo):
            mapa = {
                "EUNL.DE": {"precio": 122.72, "fecha": "2026-11-20", "moneda": "EUR", "mercado": "XETRA"},
                "IWDA.L": {"precio": 134.79, "fecha": "2026-11-20", "moneda": "USD", "mercado": "London"},
            }
            if codigo.startswith("F"):
                return {"precio": 100.0, "fecha": "2026-11-20", "moneda": "EUR", "mercado": "Morningstar ES"}
            return mapa.get(codigo)

        with (
            patch.object(buscar, "ms_buscar", side_effect=lambda q, u="FOESP$$ALL", o=True, l=10: ms_fondos if "FOESP" in u else ms_etfs),
            patch.object(buscar, "yahoo_buscar", return_value=yh_quotes),
            patch.object(buscar, "cg_buscar", return_value=[]),
            patch.object(buscar, "probar", side_effect=fake_probar),
        ):
            res = buscar.buscar("msci")

        self.assertFalse(any(r.get("tipo") == "commodity" for r in res))
        nombres = [r["nombre"] for r in res]
        self.assertIn("Fidelity MSCI World Index P-ACC-EUR", nombres)
        etfs = [r for r in res if r["tipo"] == "etf"]
        self.assertEqual(len(etfs), 1)
        self.assertEqual(etfs[0]["codigo"], "EUNL.DE")
        self.assertEqual([a["codigo"] for a in etfs[0]["alternativas"]], ["IWDA.L"])


class BuscarPensionesYEntidadesTests(unittest.TestCase):
    def setUp(self):
        buscar._CACHE_BUSQUEDA.clear()
        carteras_catalogo._CACHE_CATALOGO["ts"] = 0.0
        carteras_catalogo._CACHE_CATALOGO["carteras"] = []

    def test_inferir_entidad_banco(self):
        self.assertEqual(buscar._inferir_entidad_banco("CABK Equilibrio PP", "VidaCaixa"), "CaixaBank")
        self.assertEqual(buscar._inferir_entidad_banco("Naranja S&P 500 PP", "Renta 4"), "ING")
        self.assertEqual(buscar._inferir_entidad_banco("Myinvestor Indexado Global PP"), "MyInvestor")
        self.assertEqual(buscar._inferir_entidad_banco("Indexa Más Rentabilidad Acciones PP"), "Indexa Capital")
        self.assertEqual(buscar._inferir_entidad_banco("Finizens Decidido (#4) PP"), "Finizens")
        self.assertEqual(buscar._inferir_entidad_banco("BBVA Plan Telecomunicaciones PP"), "BBVA")

    def test_buscar_pension_caixabank_usa_alias_y_vincula_indexa(self):
        llamadas_ms = []

        def fake_ms(q, u="FOESP$$ALL", o=True, l=10):
            llamadas_ms.append((q, u))
            if u == "FOESP$$PEN" and q == "CABK":
                return [{
                    "SecId": "F000001ABC",
                    "Name": "CABK Equilibrio PP",
                    "Universe": "FOESP$$PEN",
                    "PriceCurrency": "EUR",
                    "OngoingCharge": 1.15,
                    "CollectedSRRI": 4,
                    "BrandingCompanyName": "VidaCaixa",
                    "ReturnM12": 6.4,
                }]
            if u == "FOESP$$PEN" and "Indexa" in q:
                return [{
                    "SecId": "F00000Y5QI",
                    "Name": "Indexa Más Rentabilidad Acciones PP",
                    "Universe": "FOESP$$PEN",
                    "PriceCurrency": "EUR",
                    "OngoingCharge": 0.56,
                    "CollectedSRRI": 6,
                    "ReturnM12": 14.2,
                }]
            return []

        with (
            patch.object(buscar, "ms_buscar", side_effect=fake_ms),
            patch.object(
                buscar,
                "probar",
                return_value={"precio": 25.1, "fecha": "2026-11-20", "moneda": "EUR", "mercado": "Morningstar Pensiones"},
            ),
            patch.object(carteras_catalogo, "cargar_catalogo", return_value=carteras_catalogo._FALLBACK_CARTERAS),
        ):
            res_cx = buscar.buscar("CaixaBank", tipo="pension")
            res_ix = buscar.buscar("Indexa", tipo="pension")

        self.assertIn(("CABK", "FOESP$$PEN"), llamadas_ms)
        self.assertEqual(len(res_cx), 1)
        self.assertEqual(res_cx[0]["tipo"], "pension")
        self.assertEqual(res_cx[0]["entidadSugerida"], "CaixaBank")
        self.assertEqual(res_ix[0]["carteraId"], "indexa-pensiones-acciones")
        self.assertEqual(res_ix[0]["numComponentes"], 6)


class CarterasCatalogoTests(unittest.TestCase):
    def setUp(self):
        carteras_catalogo._CACHE_CATALOGO["ts"] = 0.0
        carteras_catalogo._CACHE_CATALOGO["carteras"] = []
        carteras_catalogo._CACHE_DETALLE.clear()

    def test_parseadores_html_oficiales(self):
        next_json = {
            "props": {
                "pageProps": {
                    "portfolios": [{
                        "name": "Metal",
                        "risk": 6,
                        "profitability": 14.8,
                        "updatedAt": "2026-11-18T10:00:00Z",
                        "commissions": {"total": 0.42},
                        "funds": [
                            {
                                "isin": "IE000N4ZYX28",
                                "name": "iShares US Equity Index",
                                "category": "Renta variable EEUU",
                                "currency": "EUR",
                                "percentage": 39,
                            },
                            {
                                "isin": "IE00BYX5N771",
                                "name": "Fidelity MSCI Japan",
                                "category": "Renta variable Japón",
                                "currency": "EUR",
                                "percentage": 12,
                            },
                        ],
                    }]
                }
            }
        }
        html_my = f'<html><script id="__NEXT_DATA__" type="application/json">{json.dumps(next_json)}</script></html>'
        my_list = carteras_catalogo._parsear_myinvestor_html(html_my)
        self.assertEqual(len(my_list), 1)
        self.assertEqual(my_list[0]["id"], "myinvestor-metal")
        self.assertEqual(len(my_list[0]["componentes"]), 2)
        self.assertEqual(my_list[0]["rentabilidad1a"], 14.8)

        html_ix = """
        <h3>Cartera Acciones Plan de Pensiones</h3>
        <table>
          <tr><th>Clase de activo</th><th>ETF</th><th>ISIN</th><th>Divisa</th><th>Peso</th></tr>
          <tr><td>Acciones EE. UU.</td><td>SPDR S&P 500 ETF Trust</td><td>US78462F1030</td><td>USD</td><td>35%</td></tr>
          <tr><td>Acciones Europa</td><td>iShares Core MSCI Europe</td><td>IE00B4K48X80</td><td>EUR</td><td>15%</td></tr>
        </table>
        """
        ix_list = carteras_catalogo._parsear_indexa_html(html_ix)
        self.assertEqual(len(ix_list), 1)
        self.assertEqual(ix_list[0]["id"], "indexa-pensiones-acciones")
        self.assertEqual(ix_list[0]["componentes"][0]["peso"], 35.0)
        self.assertEqual(ix_list[0]["componentes"][0]["moneda"], "USD")

        html_fz = """
        <table>
          <tr><th>Nombre</th><th>ISIN</th><th>Gestora</th><th>En carteras</th></tr>
          <tr><td>Vanguard US 500 Inst</td><td>IE00BFPM9V94</td><td>Vanguard</td><td>Cauto, Equilibrado, Agresivo</td></tr>
        </table>
        """
        fz_list = carteras_catalogo._parsear_finizens_html(html_fz)
        ids_fz = {c["id"] for c in fz_list}
        self.assertEqual(ids_fz, {"finizens-cauto", "finizens-equilibrado", "finizens-agresivo"})

    def test_obtener_cartera_enriquecida_y_validacion_id(self):
        self.assertIsNone(carteras_catalogo.obtener_cartera_enriquecida("../mal"))
        self.assertIsNone(carteras_catalogo.obtener_cartera_enriquecida("NO_EXISTE"))

        catalogo_mock = [{
            "id": "demo-cart",
            "entidad": "MyInvestor",
            "nombre": "MyInvestor · Cartera Demo",
            "perfilRiesgo": "100% RV",
            "riesgo": 6,
            "comisionTotal": "0,42%",
            "rentabilidad1a": 12.0,
            "actualizado": "2026-11-20",
            "fuenteUrl": "https://myinvestor.es/inversion/carteras-automatizadas/",
            "planSecId": None,
            "componentes": [
                {"isin": "IE000N4ZYX28", "nombre": "iShares US Equity", "categoria": "RV EEUU", "moneda": "EUR", "peso": 100},
            ],
        }]
        ms_mock = [{
            "SecId": "F00001SELZ",
            "Name": "iShares US Equity Index S Acc EUR",
            "isin": "IE000N4ZYX28",
            "Universe": "FOESP$$ALL",
            "PriceCurrency": "EUR",
            "OngoingCharge": 0.05,
            "CollectedSRRI": 6,
            "CategoryName": "RV USA Cap. Grande Blend",
            "BrandingCompanyName": "iShares",
            "ReturnM12": 18.4,
            "DistributionStatus": "C",
        }]

        with (
            patch.object(carteras_catalogo, "cargar_catalogo", return_value=catalogo_mock),
            patch.object(buscar, "ms_buscar", return_value=ms_mock),
            patch.object(
                buscar,
                "probar",
                return_value={"precio": 11.99, "fecha": "2026-11-20", "moneda": "EUR", "mercado": "Morningstar ES"},
            ),
        ):
            det = carteras_catalogo.obtener_cartera_enriquecida("demo-cart")

        self.assertIsNotNone(det)
        comp = det["componentes"][0]
        self.assertEqual(comp["fuente"], "morningstar")
        self.assertEqual(comp["codigo"], "F00001SELZ")
        self.assertEqual(comp["precio"], 11.99)
        self.assertEqual(comp["ter"], 0.05)
        self.assertEqual(comp["politica"], "Acumulación")
        self.assertEqual(comp["rentabilidad1a"], 18.4)


class ServidorCarterasYLoteTests(unittest.TestCase):
    def test_rutas_cartera_y_productos_lote(self):
        with tempfile.TemporaryDirectory() as tmp:
            cfg_ini = dict(almacen.CARTERA_VACIA)
            cfg_ini["productos"] = [{
                "id": "existente",
                "nombre": "Existente",
                "corto": "Existente",
                "tipo": "fondo",
                "identificador": "IE000N4ZYX28",
                "fuente": "morningstar",
                "codigo": "F00001SELZ",
                "moneda": "EUR",
                "slot": 1,
            }]
            with open(os.path.join(tmp, "cartera.json"), "w", encoding="utf-8") as f:
                json.dump(cfg_ini, f)

            detalle_fake = {
                "fuente": "catalogo",
                "codigo": "myinvestor-metal",
                "carteraId": "myinvestor-metal",
                "nombre": "MyInvestor · Cartera Metal",
                "tipo": "cartera",
                "identificador": "MYINVESTOR-METAL",
                "precio": 0,
                "fecha": "2026-11-20",
                "moneda": "EUR",
                "componentes": [],
            }

            client = servidor.app.test_client()
            with (
                patch.object(servidor, "DATOS_BASE", tmp),
                patch.object(servidor.db, "activo", return_value=False),
                patch.object(servidor, "recalcula", return_value={"avisos": []}),
                patch.object(carteras_catalogo, "cargar_catalogo", return_value=carteras_catalogo._FALLBACK_CARTERAS),
                patch.object(carteras_catalogo, "obtener_cartera_enriquecida", return_value=detalle_fake),
            ):
                r_busq = client.get("/api/buscar?q=&tipo=cartera")
                self.assertEqual(r_busq.status_code, 200)
                data_busq = r_busq.get_json()
                self.assertIn("resultados", data_busq)
                self.assertGreater(len(data_busq["resultados"]), 0)

                r_bad = client.get("/api/cartera-modelo/bad!id")
                self.assertEqual(r_bad.status_code, 400)

                r_det = client.get("/api/cartera-modelo/myinvestor-metal")
                self.assertEqual(r_det.status_code, 200)
                self.assertEqual(r_det.get_json()["cartera"]["carteraId"], "myinvestor-metal")

                r_no_csrf = client.post("/api/productos/lote", json={"productos": []})
                self.assertEqual(r_no_csrf.status_code, 403)

                r_vacio = client.post(
                    "/api/productos/lote",
                    headers={"X-Capitalia-CSRF": "1"},
                    json={"productos": []},
                )
                self.assertEqual(r_vacio.status_code, 400)

                payload = {
                    "entidad": "MyInvestor",
                    "productos": [
                        {
                            "nombre": "Repetido",
                            "tipo": "fondo",
                            "identificador": "IE000N4ZYX28",
                            "fuente": "morningstar",
                            "codigo": "F00001SELZ",
                        },
                        {
                            "nombre": "Fidelity MSCI Japan",
                            "tipo": "fondo",
                            "identificador": "IE00BYX5N771",
                            "fuente": "morningstar",
                            "codigo": "F00001019C",
                            "ter": 0.1,
                        },
                        {
                            "nombre": "Fidelity MSCI Europe",
                            "tipo": "fondo",
                            "identificador": "IE00BYX5MD61",
                            "fuente": "morningstar",
                            "codigo": "F00000ZZMQ",
                            "ter": 0.12,
                        },
                    ],
                }
                r_lote = client.post(
                    "/api/productos/lote",
                    headers={"X-Capitalia-CSRF": "1"},
                    json=payload,
                )
                self.assertEqual(r_lote.status_code, 200)
                data_lote = r_lote.get_json()
                self.assertTrue(data_lote["ok"])
                self.assertEqual(
                    data_lote["item"],
                    {
                        "añadidos": 2,
                        "omitidos": 1,
                        "vinculados": 0,
                        "grupoId": None,
                        "grupoNombre": None,
                    },
                )
                prods_fin = data_lote["cartera"]["productos"]
                self.assertEqual(len(prods_fin), 3)
                self.assertEqual(prods_fin[1]["entidad"], "MyInvestor")
                self.assertAlmostEqual(prods_fin[2]["ter"], 0.0012, places=6)

                # Agrupación en lote (vincula existente sin grupo y crea nuevos con pesoObjetivo)
                payload_grp = {
                    "entidad": "MyInvestor",
                    "grupoId": "myinvestor-metal",
                    "grupoNombre": "MyInvestor · Cartera Metal",
                    "productos": [
                        {
                            "nombre": "Existente",
                            "tipo": "fondo",
                            "identificador": "IE000N4ZYX28",
                            "fuente": "morningstar",
                            "codigo": "F00001SELZ",
                            "pesoObjetivo": 39,
                        },
                        {
                            "nombre": "iShares Developed World ESG",
                            "tipo": "fondo",
                            "identificador": "IE000N51F726",
                            "fuente": "morningstar",
                            "codigo": "F00001SELY",
                            "pesoObjetivo": 20,
                        },
                    ],
                }
                r_grp = client.post(
                    "/api/productos/lote",
                    headers={"X-Capitalia-CSRF": "1"},
                    json=payload_grp,
                )
                self.assertEqual(r_grp.status_code, 200)
                item_grp = r_grp.get_json()["item"]
                self.assertEqual(item_grp["añadidos"], 1)
                self.assertEqual(item_grp["vinculados"], 1)
                self.assertEqual(item_grp["grupoId"], "myinvestor-metal")

                # Lote de importes de cartera con cálculo automático de participaciones desde VL
                prods_act = r_grp.get_json()["cartera"]["productos"]
                pid_1 = next(p["id"] for p in prods_act if p["identificador"] == "IE000N4ZYX28")
                pid_2 = next(p["id"] for p in prods_act if p["identificador"] == "IE000N51F726")

                from backend import motor

                with patch.object(motor, "serie_producto", return_value={"2026-11-20": 10.0}):
                    r_movs = client.post(
                        "/api/movimientos/lote-cartera",
                        headers={"X-Capitalia-CSRF": "1"},
                        json={
                            "fecha": "2026-11-20",
                            "nota": "Aportación Metal",
                            "lineas": [
                                {"producto": pid_1, "importe": 1950.0, "unidades": None},
                                {"producto": pid_2, "importe": 1000.0, "unidades": 80.0},
                            ],
                        },
                    )
                self.assertEqual(r_movs.status_code, 200)
                self.assertEqual(r_movs.get_json()["item"], {"guardados": 2, "reemplazados": 0})
                movs_guard = r_movs.get_json()["cartera"]["movimientos"]
                m1 = next(m for m in movs_guard if m["producto"] == pid_1)
                self.assertAlmostEqual(m1["unidades"], 195.0, places=4)
                m2 = next(m for m in movs_guard if m["producto"] == pid_2)
                self.assertAlmostEqual(m2["unidades"], 80.0, places=4)

                # motor.construir conserva grupoId, grupoNombre y pesoObjetivo
                cfg_real = r_movs.get_json()["cartera"]
                with (
                    patch.object(motor, "descargar_morningstar", return_value={"2026-11-20": 12.0}),
                    patch.object(motor, "descargar_serie", return_value={"2026-11-20": 100.0}),
                ):
                    panel = motor.construir(cfg_real, tmp, descargar=True)
                p1_calc = next(p for p in panel["productos"] if p["id"] == pid_1)
                self.assertEqual(p1_calc["grupoId"], "myinvestor-metal")
                self.assertEqual(p1_calc["grupoNombre"], "MyInvestor · Cartera Metal")
                self.assertEqual(p1_calc["pesoObjetivo"], 39.0)

                # Eliminar grupo completo
                self.assertEqual(client.delete("/api/carteras-grupo/bad!id", headers={"X-Capitalia-CSRF": "1"}).status_code, 400)
                r_del = client.delete(
                    "/api/carteras-grupo/myinvestor-metal",
                    headers={"X-Capitalia-CSRF": "1"},
                )
                self.assertEqual(r_del.status_code, 200)
                self.assertEqual(r_del.get_json()["item"], {"eliminados": 2, "grupoId": "myinvestor-metal"})
                self.assertEqual(len(r_del.get_json()["cartera"]["productos"]), 2)


if __name__ == "__main__":
    unittest.main()
