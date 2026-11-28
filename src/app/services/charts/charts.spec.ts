import { TestBed } from '@angular/core/testing';
import { ChartService } from '../chart.service';
import { FormatService } from '../format.service';
import { colorCssSeguro, escalaBonita } from './chart-utils';

function creaContenedor(ancho = 640): HTMLElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'clientWidth', { value: ancho, configurable: true });
  document.body.appendChild(el);
  return el;
}

describe('ChartService y módulos SVG (Fase 2)', () => {
  let service: ChartService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ChartService, FormatService],
    });
    service = TestBed.inject(ChartService);
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  describe('chart-utils', () => {
    it('normaliza escalas negativas sin -0 y valida colores CSS seguros', () => {
      const esc = escalaBonita(0, -0.22);
      expect(esc.max).toBe(0);
      expect(Object.is(esc.max, -0)).toBe(false);
      expect(esc.min).toBeLessThanOrEqual(-0.22);
      expect(esc.paso).toBeGreaterThan(0);

      expect(colorCssSeguro('#f43f5e')).toBe('#f43f5e');
      expect(colorCssSeguro('var(--pos)')).toBe('var(--pos)');
      expect(colorCssSeguro('red; background:url(javascript:alert(1))', '#10b981')).toBe('#10b981');
    });
  });

  describe('drawdown()', () => {
    it('dibuja área sombreada en #f43f5e, línea base 0 % y marcador Max DD', () => {
      const cont = creaContenedor(640);
      service.drawdown(cont, {
        fechas: ['2025-01-01', '2025-02-01', '2025-03-01', '2025-04-01'],
        valores: [0, -0.12, -0.245, -0.08],
        maxDDFecha: '2025-03-01',
      });

      const svg = cont.querySelector('svg.grafico.drawdown');
      expect(svg).not.toBeNull();
      expect(svg?.getAttribute('role')).toBe('img');

      const area = svg?.querySelector('path[fill="#f43f5e"][fill-opacity="0.18"]');
      expect(area).not.toBeNull();

      const marcador = svg?.querySelector('circle.marcador.aro');
      expect(marcador).not.toBeNull();

      const textos = Array.from(svg?.querySelectorAll('text') ?? []).map((t) => t.textContent ?? '');
      expect(textos.some((t) => t.includes('Max DD'))).toBe(true);
    });

    it('muestra estado vacío si no hay datos válidos', () => {
      const cont = creaContenedor(480);
      service.drawdown(cont, { fechas: [], valores: [] });
      expect(cont.querySelector('p.vacio')?.textContent).toContain('Sin datos');
    });
  });

  describe('scatterRiesgo()', () => {
    it('dimensiona burbujas entre 6px y 22px y abre tooltip seguro al hacer focus', () => {
      const cont = creaContenedor(680);
      const xssNombre = '<img src=x onerror=alert(1)>Cartera';
      service.scatterRiesgo(cont, {
        puntos: [
          {
            id: 'a',
            nombre: xssNombre,
            volatilidad: 0.14,
            cagr: 0.095,
            peso: 0.6,
            sharpe: 0.68,
            sortino: 1.05,
            color: '#10b981',
            destacado: true,
          },
          {
            id: 'b',
            nombre: 'Renta Fija',
            volatilidad: 0.04,
            cagr: 0.032,
            peso: 0.15,
            sharpe: 0.45,
            sortino: null,
            color: '#38bdf8',
          },
          {
            id: 'c',
            nombre: 'Emergentes',
            volatilidad: 0.21,
            cagr: -0.015,
            peso: 0.25,
            sharpe: -0.07,
            sortino: -0.1,
            color: '#f43f5e',
          },
        ],
      });

      const svg = cont.querySelector('svg.grafico.scatter');
      expect(svg).not.toBeNull();

      const burbujas = Array.from(svg?.querySelectorAll('circle[tabindex="0"]') ?? []);
      expect(burbujas).toHaveLength(3);
      for (const b of burbujas) {
        const r = Number(b.getAttribute('r'));
        expect(r).toBeGreaterThanOrEqual(6);
        expect(r).toBeLessThanOrEqual(22);
      }

      const burbujaXss = burbujas.find((b) =>
        (b.getAttribute('aria-label') ?? '').includes(xssNombre)
      )!;
      expect(burbujaXss).toBeTruthy();
      burbujaXss.dispatchEvent(new FocusEvent('focus'));

      const tt = cont.querySelector('.gtt') as HTMLElement;
      expect(tt.classList.contains('on')).toBe(true);
      expect(tt.querySelector('img')).toBeNull();
      expect(tt.querySelector('b')?.textContent).toBe(xssNombre);
      expect(tt.textContent).toContain('Volatilidad');
      expect(tt.textContent).toContain('Sharpe');
      expect(tt.textContent).toContain('Sortino');
      expect(tt.textContent).toContain('Peso');
    });
  });

  describe('proyeccionEscenarios()', () => {
    it('dibuja banda sombreada, aportado discontinuo y objetivo solo si entra en rango', () => {
      const cont = creaContenedor(700);
      service.proyeccionEscenarios(cont, {
        fechas: ['2026', '2027', '2028', '2029'],
        optimista: [10000, 14000, 19000, 26000],
        base: [10000, 13000, 16800, 21500],
        pesimista: [10000, 12000, 14500, 17500],
        aportado: [10000, 12000, 14000, 16000],
        objetivo: { valor: 20000, etiqueta: 'Meta 20k' },
      });

      const svg = cont.querySelector('svg.grafico.proyeccion-bandas');
      expect(svg).not.toBeNull();
      expect(svg?.querySelector('path.overlay')).not.toBeNull();
      expect(svg?.querySelector('line.referencia')).not.toBeNull();
      expect(svg?.querySelector('text.refEtiqueta')?.textContent).toBe('Meta 20k');

      // Objetivo fuera de rango no debe renderizarse
      const contFuera = creaContenedor(700);
      service.proyeccionEscenarios(contFuera, {
        fechas: ['2026', '2027', '2028'],
        optimista: [10000, 12000, 15000],
        base: [10000, 11500, 13500],
        pesimista: [10000, 11000, 12000],
        aportado: [10000, 11000, 12000],
        objetivo: { valor: 500000, etiqueta: 'Inalcanzable' },
      });
      expect(contFuera.querySelector('line.referencia')).toBeNull();
    });
  });

  describe('barrasSimples()', () => {
    it('formatea eje Y y valores en euros (€) cuando esPorcentaje es false sin mostrar %', () => {
      const cont = creaContenedor(640);
      service.barrasSimples(cont, {
        etiquetas: ['2023', '2024', '2025'],
        valores: [320, 480, 1250],
        esPorcentaje: false,
      });

      const ejeY = Array.from(cont.querySelectorAll('text.ejeY')).map((t) => t.textContent ?? '');
      const valores = Array.from(cont.querySelectorAll('text.barValArriba')).map(
        (t) => t.textContent ?? ''
      );

      expect(ejeY.length).toBeGreaterThan(0);
      expect(ejeY.every((t) => t.includes('€') && !t.includes('%'))).toBe(true);
      expect(valores.every((t) => t.includes('€') && !t.includes('%') && !t.startsWith('+'))).toBe(
        true
      );
    });

    it('conserva formato porcentaje (%) por defecto para rendimiento-tab', () => {
      const cont = creaContenedor(640);
      service.barrasSimples(cont, {
        etiquetas: ['2024', '2025'],
        valores: [0.125, -0.04],
      });

      const ejeY = Array.from(cont.querySelectorAll('text.ejeY')).map((t) => t.textContent ?? '');
      const valores = Array.from(cont.querySelectorAll('text.barValArriba')).map(
        (t) => t.textContent ?? ''
      );
      expect(ejeY.some((t) => t.includes('%'))).toBe(true);
      expect(valores.every((t) => t.includes('%'))).toBe(true);
    });
  });

  describe('retrocompatibilidad de métodos existentes', () => {
    it('mantiene operativos sparkline() y donut()', () => {
      const contSpark = creaContenedor(160);
      service.sparkline(contSpark, [100, 105, 102, 112], '#10b981', 48);
      expect(contSpark.querySelector('svg.spark')).not.toBeNull();

      const contDonut = creaContenedor(300);
      service.donut(contDonut, {
        datos: [
          { nombre: 'RV', valor: 7000, color: '#10b981' },
          { nombre: 'RF', valor: 3000, color: '#38bdf8' },
        ],
      });
      expect(contDonut.querySelector('svg.grafico.donut')).not.toBeNull();
    });
  });
});
