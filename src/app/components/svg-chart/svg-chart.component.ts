import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  effect,
  inject,
  input,
  viewChild,
} from '@angular/core';
import { ChartConfig, ChartRenderFn, ChartService } from '../../services/chart.service';

const DESCRIPCION_POR_TIPO: Record<ChartConfig['tipo'], string> = {
  areaApilada: 'Gráfico de evolución patrimonial apilada',
  lineaConEventos: 'Gráfico de evolución temporal con eventos',
  barrasApiladas: 'Gráfico de barras apiladas',
  barrasAgrupadas: 'Gráfico de barras agrupadas',
  barrasSimples: 'Gráfico de barras',
  barrasHorizontales: 'Gráfico de barras horizontales',
  multiLinea: 'Gráfico comparativo multilínea',
  donut: 'Gráfico circular de distribución',
  sparkline: 'Minigráfico de tendencia',
};

/**
 * Contenedor Angular para gráficos SVG generados por `ChartService`,
 * optimizado con `OnPush` y debounce de `ResizeObserver` vía `requestAnimationFrame`.
 */
@Component({
  selector: 'cap-svg-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      #contenedor
      class="envGraf"
      [attr.role]="ariaLabel() ? 'figure' : null"
      [attr.aria-label]="ariaLabel() || null"
      [style.min-height.px]="minHeight()"
    ></div>
  `,
})
export class SvgChartComponent implements OnInit, OnDestroy {
  readonly config = input<ChartConfig | null>(null);
  readonly renderFn = input<ChartRenderFn | null>(null);
  readonly minHeight = input<number | null>(null);
  readonly ariaLabel = input<string | null>(null);

  private readonly contenedor = viewChild.required<ElementRef<HTMLElement>>('contenedor');
  private readonly chartService = inject(ChartService);
  private ro: ResizeObserver | null = null;
  private lastWidth = 0;
  private rafId: number | null = null;
  private destroyed = false;

  constructor() {
    effect(() => {
      const fn = this.renderFn();
      const cfg = this.config();
      const label = this.ariaLabel();
      const el = this.contenedor()?.nativeElement;
      if (!el) return;
      this.dibujar(el, fn, cfg, label);
    });
  }

  ngOnInit(): void {
    const el = this.contenedor().nativeElement;
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => {
        if (this.destroyed || el.clientWidth <= 0 || Math.abs(el.clientWidth - this.lastWidth) < 2) {
          return;
        }
        if (this.rafId !== null && typeof cancelAnimationFrame !== 'undefined') {
          cancelAnimationFrame(this.rafId);
        }
        if (typeof requestAnimationFrame === 'undefined') {
          this.dibujar(el, this.renderFn(), this.config(), this.ariaLabel());
          return;
        }
        this.rafId = requestAnimationFrame(() => {
          this.rafId = null;
          if (this.destroyed || el.clientWidth <= 0 || Math.abs(el.clientWidth - this.lastWidth) < 2) {
            return;
          }
          this.dibujar(el, this.renderFn(), this.config(), this.ariaLabel());
        });
      });
      this.ro.observe(el);
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    if (this.rafId !== null && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.ro?.disconnect();
    this.ro = null;
  }

  private dibujar(
    el: HTMLElement,
    fn: ChartRenderFn | null,
    cfg: ChartConfig | null,
    label: string | null
  ): void {
    if (fn) {
      fn(el);
    } else if (cfg) {
      this.chartService.render(el, cfg);
    } else {
      return;
    }
    this.aplicarAccesibilidad(el, cfg, label);
    this.lastWidth = el.clientWidth;
  }

  private aplicarAccesibilidad(
    el: HTMLElement,
    cfg: ChartConfig | null,
    customLabel: string | null
  ): void {
    const svg = el.querySelector('svg');
    if (!svg) return;
    if (!svg.hasAttribute('role')) {
      svg.setAttribute('role', 'img');
    }
    const labelLimpia = customLabel?.trim() || null;
    if (labelLimpia || !svg.hasAttribute('aria-label')) {
      const descripcion =
        labelLimpia ||
        (cfg ? DESCRIPCION_POR_TIPO[cfg.tipo] : null) ||
        (svg.classList.contains('spark')
          ? 'Minigráfico de tendencia'
          : svg.classList.contains('donut')
            ? 'Gráfico circular de distribución'
            : 'Gráfico financiero');
      svg.setAttribute('aria-label', descripcion);
    }
  }
}
