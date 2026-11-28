import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { DatosPanel, ProductoCalculado } from '../models/portfolio.model';
import { PortfolioStoreService } from './portfolio-store.service';

function crearProductoBase(overrides: Partial<ProductoCalculado>): ProductoCalculado {
  return {
    id: 'p1',
    nombre: 'Fondo Test',
    corto: 'Fondo Test',
    tipo: 'fondo',
    valor: 0,
    serie: [],
    ...overrides,
  };
}

function crearPanelBase(
  fechas: string[],
  productos: ProductoCalculado[],
  totalOverrides: Partial<DatosPanel['total']> = {},
  otrosActivos: ProductoCalculado[] = []
): DatosPanel {
  return {
    generado: fechas[fechas.length - 1] ?? '2025-01-10',
    modo: 'propio',
    titular: 'Test',
    moneda: 'EUR',
    fechaExtracto: fechas[fechas.length - 1] ?? '2025-01-10',
    fechas,
    productos,
    otrosActivos,
    pasivos: [],
    total: {
      patrimonio: 0,
      aportado: 0,
      valorConCoste: 0,
      plusvalia: 0,
      rentabilidad: null,
      tir: null,
      realizado: 0,
      serie: [],
      serieAportado: [],
      porClase: [],
      porEntidad: [],
      porTipo: [],
      hitos: [],
      racha: 0,
      ritmoMensual: 0,
      numAportaciones: 0,
      diasInvertido: fechas.length,
      caidaMaxima: 0,
      caidaMaximaFecha: null,
      ...totalOverrides,
    },
    aportacionesMensuales: { meses: [], porProducto: {}, total: [] },
    objetivo: null,
    comisiones: {
      lineas: [],
      anual: 0,
      base: 0,
      terPonderado: null,
      compraventaPagada: 0,
    },
    rentabilidadAnual: { anos: [], cartera: [], parcial: [], porProducto: {}, desde: {} },
    resumenMensual: [],
    comparador: [],
    comparacion: null,
    indiceCartera: [],
    vivo: null,
    avisos: [],
  };
}

describe('PortfolioStoreService', () => {
  let store: PortfolioStoreService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    store = TestBed.inject(PortfolioStoreService);
  });

  describe('xirr()', () => {
    it('devuelve null si hay menos de 2 flujos o todos tienen el mismo signo', () => {
      expect(store.xirr([])).toBeNull();
      expect(store.xirr([['2024-01-01', -1000]])).toBeNull();
      expect(
        store.xirr([
          ['2024-01-01', -1000],
          ['2025-01-01', -500],
        ])
      ).toBeNull();
      expect(
        store.xirr([
          ['2024-01-01', 1000],
          ['2025-01-01', 500],
        ])
      ).toBeNull();
    });

    it('calcula correctamente la TIR anualizada para un flujo simple a 1 año', () => {
      const tir = store.xirr([
        ['2024-01-01', -1000],
        ['2024-12-31', 1100],
      ]);
      expect(tir).not.toBeNull();
      expect(tir!).toBeCloseTo(0.1, 2);
    });

    it('calcula correctamente la TIR ponderada por fechas con múltiples aportaciones', () => {
      const tir = store.xirr([
        ['2024-01-01', -1000],
        ['2024-07-02', -1000],
        ['2025-01-01', 2150],
      ]);
      expect(tir).not.toBeNull();
      expect(tir!).toBeCloseTo(0.1008, 2);
    });
  });

  describe('calcularMetricas() · Max Drawdown sin sesgo de aportaciones', () => {
    it('usa caidaMaxima del backend cuando no hay filtros activos', () => {
      const fechas = ['2025-01-01', '2025-01-02', '2025-01-03'];
      const p1 = crearProductoBase({
        id: 'p1',
        valor: 11000,
        aportado: 11000,
        serie: [1000, 10800, 11000],
        serieAportado: [1000, 11000, 11000],
      });
      store.datos.set(
        crearPanelBase(fechas, [p1], {
          caidaMaxima: -0.225,
          caidaMaximaFecha: '2025-01-02',
        })
      );

      const m = store.calcularMetricas(store.todosComponentes());
      expect(m.caida).toBe(-0.225);
      expect(m.caidaFecha).toBe('2025-01-02');
    });

    it('calcula el Max DD sobre navSerie cuando está filtrado a 1 producto con NAV válido', () => {
      const fechas = ['2025-01-01', '2025-01-02', '2025-01-03', '2025-01-04'];
      const fondo = crearProductoBase({
        id: 'fondo',
        valor: 11000,
        aportado: 11000,
        // El valor bruto sube por una aportación masiva el 2025-01-03 pese a caer el VL un 25 %
        serie: [1000, 1200, 10900, 11000],
        serieAportado: [1000, 1000, 11000, 11000],
        navSerie: [100, 120, 90, 95],
      });
      const cash = crearProductoBase({
        id: 'cash',
        tipo: 'efectivo',
        valor: 2000,
        serie: [2000, 2000, 2000, 2000],
      });
      store.datos.set(
        crearPanelBase(fechas, [fondo], { caidaMaxima: -0.1, caidaMaximaFecha: '2025-01-03' }, [
          cash,
        ])
      );

      const m = store.calcularMetricas([fondo]);
      expect(m.caida).toBeCloseTo(-0.25, 4);
      expect(m.caidaFecha).toBe('2025-01-03');
    });

    it('usa TWR diario aproximado en subconjuntos para que una gran aportación no oculte la caída', () => {
      const fechas = ['2025-01-01', '2025-01-02', '2025-01-03', '2025-01-04'];
      // Sin navSerie (p. ej. combinación de 2 fondos o producto sin navSerie):
      // Día 0: 1000 € invertidos -> valor 1000 €
      // Día 1: mercado cae -30 % (de 1000 a 700) y el usuario aporta +5000 € -> valor 5700 €, aportado 6000 €
      // Día 2: mercado cae otro -10 % -> valor 5130 €
      // TWR acumulado: 100 -> 70 -> 63 => Max DD = -37 % el 2025-01-03
      const p1 = crearProductoBase({
        id: 'p1',
        valor: 3000,
        aportado: 3500,
        serie: [500, 2850, 2565, 2700],
        serieAportado: [500, 3000, 3000, 3000],
      });
      const p2 = crearProductoBase({
        id: 'p2',
        valor: 3000,
        aportado: 3500,
        serie: [500, 2850, 2565, 2700],
        serieAportado: [500, 3000, 3000, 3000],
      });
      const p3 = crearProductoBase({
        id: 'p3',
        valor: 1000,
        aportado: 1000,
        serie: [1000, 1000, 1000, 1000],
        serieAportado: [1000, 1000, 1000, 1000],
      });
      store.datos.set(crearPanelBase(fechas, [p1, p2, p3]));

      const m = store.calcularMetricas([p1, p2]);
      expect(m.caida).toBeCloseTo(-0.37, 4);
      expect(m.caidaFecha).toBe('2025-01-03');
    });

    it('hace fallback a serie bruta solo cuando no hay flujos de inversión', () => {
      const fechas = ['2025-01-01', '2025-01-02', '2025-01-03'];
      const inmueble = crearProductoBase({
        id: 'casa',
        tipo: 'inmueble',
        valor: 90000,
        serie: [100000, 85000, 90000],
      });
      const otro = crearProductoBase({
        id: 'cash',
        tipo: 'efectivo',
        valor: 5000,
        serie: [5000, 5000, 5000],
      });
      store.datos.set(crearPanelBase(fechas, [], {}, [inmueble, otro]));

      const m = store.calcularMetricas([inmueble]);
      expect(m.caida).toBeCloseTo(-0.15, 4);
      expect(m.caidaFecha).toBe('2025-01-02');
    });
  });
});

