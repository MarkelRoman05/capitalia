import { Injectable, inject } from '@angular/core';
import { FormatService } from './format.service';
import { renderAreaApiladaChart } from './charts/area-apilada.chart';
import {
  renderBarrasAgrupadasChart,
  renderBarrasApiladasChart,
  renderBarrasHorizontalesChart,
  renderBarrasSimplesChart,
} from './charts/barras.chart';
import { renderDonutChart } from './charts/donut.chart';
import { DrawdownChartOptions, renderDrawdownChart } from './charts/drawdown.chart';
import { renderLineaConEventosChart } from './charts/linea-eventos.chart';
import { renderMultiLineaChart } from './charts/multi-linea.chart';
import {
  ProyeccionEscenariosOptions,
  renderProyeccionEscenariosChart,
} from './charts/proyeccion-bandas.chart';
import {
  PuntoScatterRiesgo,
  ScatterRiesgoOptions,
  renderScatterRiesgoChart,
} from './charts/scatter.chart';
import { renderSparklineChart } from './charts/sparkline.chart';

export type { DrawdownChartOptions } from './charts/drawdown.chart';
export type { ProyeccionEscenariosOptions } from './charts/proyeccion-bandas.chart';
export type { PuntoScatterRiesgo, ScatterRiesgoOptions } from './charts/scatter.chart';

export interface SerieGrafico {
  id?: string;
  nombre: string;
  color: string;
  valores: (number | null)[];
  destacado?: boolean;
}

export interface EventoGrafico {
  fecha: string;
  color?: string;
  aro?: boolean;
  r?: number;
  texto: string;
}

export interface DatoDonut {
  id?: string;
  nombre: string;
  valor: number;
  color: string;
}

export type ChartRenderFn = (el: HTMLElement) => void;

export type ChartConfig =
  | {
      tipo: 'areaApilada';
      fechas: string[];
      series: SerieGrafico[];
      overlay?: { nombre: string; valores: (number | null)[] } | null;
      alto?: number;
      maxForzado?: number;
      formatoY?: (v: number) => string;
      formatoValor?: (v: number) => string;
    }
  | {
      tipo: 'lineaConEventos';
      fechas: string[];
      valores: (number | null)[];
      color: string;
      alto?: number;
      desdeCero?: boolean;
      overlay?: { nombre: string; valores: (number | null)[] } | null;
      referencia?: { valor: number; etiqueta: string } | null;
      eventos?: EventoGrafico[];
      formatoY?: ((v: number) => string) | null;
    }
  | {
      tipo: 'barrasApiladas';
      categorias: string[];
      series: SerieGrafico[];
      alto?: number;
    }
  | {
      tipo: 'barrasAgrupadas';
      categorias: string[];
      series: SerieGrafico[];
      alto?: number;
      formatoCat?: (c: string) => string;
    }
  | {
      tipo: 'barrasSimples';
      categorias: string[];
      valores: (number | null)[];
      color: string;
      colores?: string[];
      alto?: number;
      esPorcentaje?: boolean;
      formatoY?: (v: number) => string;
      formatoValor?: (v: number) => string;
    }
  | {
      tipo: 'barrasHorizontales';
      datos: [string, number][];
      color: string;
      filaAlto?: number;
    }
  | {
      tipo: 'multiLinea';
      fechas: string[];
      series: SerieGrafico[];
      alto?: number;
      desdeCero?: boolean;
      formatoY?: (v: number) => string;
      formatoValor?: (v: number) => string;
    }
  | {
      tipo: 'donut';
      datos: DatoDonut[];
      alto?: number;
      tituloCentro?: string;
      valorCentro?: string;
      onSelect?: (d: DatoDonut) => void;
    }
  | {
      tipo: 'sparkline';
      valores: (number | null)[];
      color: string;
      alto?: number;
    };

@Injectable({ providedIn: 'root' })
export class ChartService {
  private readonly fmt = inject(FormatService);

  render(cont: HTMLElement, cfg: ChartConfig): void {
    switch (cfg.tipo) {
      case 'areaApilada':
        renderAreaApiladaChart(cont, cfg, this.fmt);
        break;
      case 'lineaConEventos':
        renderLineaConEventosChart(cont, cfg, this.fmt);
        break;
      case 'barrasApiladas':
        renderBarrasApiladasChart(cont, cfg, this.fmt);
        break;
      case 'barrasAgrupadas':
        renderBarrasAgrupadasChart(cont, cfg, this.fmt);
        break;
      case 'barrasSimples':
        renderBarrasSimplesChart(cont, cfg, this.fmt);
        break;
      case 'barrasHorizontales':
        renderBarrasHorizontalesChart(cont, cfg);
        break;
      case 'multiLinea':
        renderMultiLineaChart(cont, cfg, this.fmt);
        break;
      case 'donut':
        renderDonutChart(cont, cfg, this.fmt);
        break;
      case 'sparkline':
        renderSparklineChart(cont, cfg.valores, cfg.color, cfg.alto);
        break;
    }
  }

  areaApilada(
    cont: HTMLElement,
    opts: {
      fechas: string[];
      series: { id?: string; nombre: string; color: string | [string, string]; valores: (number | null)[] }[];
      modo?: 'absoluto' | 'porcentaje';
      lineaExtra?: { nombre: string; valores: (number | null)[]; color?: string } | null;
      altura?: number;
      alto?: number;
    }
  ): void {
    const esPct = opts.modo === 'porcentaje';
    const n = opts.fechas.length;
    const seriesNorm: SerieGrafico[] = opts.series.map((s) => ({
      id: s.id,
      nombre: s.nombre,
      color: Array.isArray(s.color) ? s.color[0] : s.color,
      valores: s.valores,
    }));

    if (esPct && n > 0) {
      const totales = new Array<number>(n).fill(0);
      seriesNorm.forEach((s) => {
        s.valores.forEach((v, i) => {
          totales[i] += Math.max(0, v || 0);
        });
      });
      seriesNorm.forEach((s) => {
        s.valores = s.valores.map((v, i) =>
          totales[i] > 0 ? (Math.max(0, v || 0) / totales[i]) * 100 : 0
        );
      });
    }

    renderAreaApiladaChart(
      cont,
      {
        fechas: opts.fechas,
        series: seriesNorm,
        overlay: !esPct && opts.lineaExtra ? { nombre: opts.lineaExtra.nombre, valores: opts.lineaExtra.valores } : null,
        alto: opts.altura || opts.alto || 340,
        maxForzado: esPct ? 100 : undefined,
        formatoY: esPct ? (v) => `${Math.round(v)}%` : undefined,
        formatoValor: esPct ? (v) => `${v.toFixed(1)}%` : undefined,
      },
      this.fmt
    );
  }

  lineaConEventos(
    cont: HTMLElement,
    opts: {
      fechas: string[];
      valores: (number | null)[];
      secundaria?: (number | null)[];
      etiquetaPri?: string;
      etiquetaSec?: string;
      color: string | [string, string];
      eventos?: {
        fecha: string;
        importe?: number;
        precio?: number | null;
        nivel?: number;
        texto: string;
      }[];
      eventosEnPrecio?: boolean;
      lineaRef?: { valor: number; etiqueta: string; color?: string } | null;
      formatoY?: (v: number) => string;
      altura?: number;
      alto?: number;
    }
  ): void {
    const col = Array.isArray(opts.color) ? opts.color[0] : opts.color;
    const evs: EventoGrafico[] = (opts.eventos || []).map((e) => {
      let c = '#10b981';
      let r = 4.5;
      if (e.nivel === 3) {
        c = '#f59e0b';
        r = 6;
      } else if (e.nivel === 1) {
        c = '#38bdf8';
        r = 3.8;
      }
      return { fecha: e.fecha, color: c, aro: e.nivel === 3, r, texto: e.texto };
    });

    renderLineaConEventosChart(
      cont,
      {
        fechas: opts.fechas,
        valores: opts.valores,
        color: col,
        alto: opts.altura || opts.alto || 320,
        desdeCero: !opts.eventosEnPrecio,
        overlay: opts.secundaria
          ? { nombre: opts.etiquetaSec || 'Invertido', valores: opts.secundaria }
          : null,
        referencia: opts.lineaRef
          ? { valor: opts.lineaRef.valor, etiqueta: opts.lineaRef.etiqueta }
          : null,
        eventos: evs,
        formatoY: opts.formatoY || null,
      },
      this.fmt
    );
  }

  barrasApiladas(
    cont: HTMLElement,
    opts: {
      categorias: string[];
      series: { id?: string; nombre: string; color: string | [string, string]; valores: (number | null)[] }[];
      altura?: number;
      alto?: number;
    }
  ): void {
    renderBarrasApiladasChart(
      cont,
      {
        categorias: opts.categorias,
        series: opts.series.map((s) => ({
          id: s.id,
          nombre: s.nombre,
          color: Array.isArray(s.color) ? s.color[0] : s.color,
          valores: s.valores,
        })),
        alto: opts.altura || opts.alto || 250,
      },
      this.fmt
    );
  }

  barrasAgrupadas(
    cont: HTMLElement,
    opts: {
      categorias: string[];
      series: { nombre: string; valores: (number | null)[]; color: string; colorNeg?: string }[];
      altura?: number;
      alto?: number;
    }
  ): void {
    renderBarrasAgrupadasChart(
      cont,
      {
        categorias: opts.categorias,
        series: opts.series.map((s) => ({
          nombre: s.nombre,
          color: s.color,
          valores: s.valores,
        })),
        alto: opts.altura || opts.alto || 260,
      },
      this.fmt
    );
  }

  barrasSimples(
    cont: HTMLElement,
    opts: {
      etiquetas?: string[];
      categorias?: string[];
      valores: (number | null)[];
      esPorcentaje?: boolean;
      color?: string;
      colores?: string[];
      formatoY?: (v: number) => string;
      formatoValor?: (v: number) => string;
      altura?: number;
      alto?: number;
    }
  ): void {
    const cats = opts.etiquetas || opts.categorias || [];
    const baseColor = opts.color || '#10b981';
    const colores =
      opts.colores || opts.valores.map((v) => ((v || 0) >= 0 ? baseColor : '#f43f5e'));
    renderBarrasSimplesChart(
      cont,
      {
        categorias: cats,
        valores: opts.valores,
        color: baseColor,
        colores,
        alto: opts.altura || opts.alto || 240,
        esPorcentaje: opts.esPorcentaje,
        formatoY: opts.formatoY,
        formatoValor: opts.formatoValor,
      },
      this.fmt
    );
  }

  barrasHorizontales(cont: HTMLElement, datos: [string, number][], color = '#10b981'): void {
    renderBarrasHorizontalesChart(cont, { datos, color });
  }

  multiLinea(
    cont: HTMLElement,
    opts: {
      fechas: string[];
      lineas?: {
        nombre: string;
        valores: (number | null)[];
        color: string;
        principal?: boolean;
        punteada?: boolean;
      }[];
      series?: SerieGrafico[];
      formatoY?: (v: number) => string;
      formatoTooltip?: (v: number) => string;
      altura?: number;
      alto?: number;
    }
  ): void {
    const series: SerieGrafico[] =
      opts.series ||
      (opts.lineas || []).map((l) => ({
        nombre: l.nombre,
        valores: l.valores,
        color: l.color,
        destacado: l.principal,
      }));
    renderMultiLineaChart(
      cont,
      {
        fechas: opts.fechas,
        series,
        formatoY: opts.formatoY,
        formatoValor: opts.formatoTooltip,
        alto: opts.altura || opts.alto || 300,
      },
      this.fmt
    );
  }

  donut(
    cont: HTMLElement,
    opts: {
      grupos?: { nombre: string; valor: number; color: string | [string, string] }[];
      datos?: DatoDonut[];
      centroValor?: string;
      centroSub?: string;
      alto?: number;
    }
  ): void {
    const datos: DatoDonut[] =
      opts.datos ||
      (opts.grupos || []).map((g) => ({
        nombre: g.nombre,
        valor: g.valor,
        color: Array.isArray(g.color) ? g.color[0] : g.color,
      }));
    renderDonutChart(
      cont,
      {
        datos,
        tituloCentro: opts.centroSub || 'Total',
        valorCentro: opts.centroValor,
        alto: opts.alto || 236,
      },
      this.fmt
    );
  }

  sparkline(cont: HTMLElement, valores: (number | null)[], color: string, alto = 28): void {
    renderSparklineChart(cont, valores, color, alto);
  }

  /** Renderiza la curva de Drawdown (*Underwater*) desde `0 %` hacia abajo. */
  drawdown(cont: HTMLElement, opts: DrawdownChartOptions): void {
    renderDrawdownChart(cont, opts, this.fmt);
  }

  /** Renderiza un gráfico de dispersión Riesgo (Volatilidad) vs. Rentabilidad (CAGR). */
  scatterRiesgo(cont: HTMLElement, opts: ScatterRiesgoOptions): void {
    renderScatterRiesgoChart(cont, opts, this.fmt);
  }

  /** Renderiza la proyección patrimonial con banda de 3 escenarios (`optimista`, `base`, `pesimista`). */
  proyeccionEscenarios(cont: HTMLElement, opts: ProyeccionEscenariosOptions): void {
    renderProyeccionEscenariosChart(cont, opts, this.fmt);
  }
}
