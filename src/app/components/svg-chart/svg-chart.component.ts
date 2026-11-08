import {
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

@Component({
  selector: 'cap-svg-chart',
  template: `<div #contenedor class="envGraf" [style.min-height.px]="minHeight()"></div>`,
})
export class SvgChartComponent implements OnInit, OnDestroy {
  readonly config = input<ChartConfig | null>(null);
  readonly renderFn = input<ChartRenderFn | null>(null);
  readonly minHeight = input<number | null>(null);

  private readonly contenedor = viewChild.required<ElementRef<HTMLElement>>('contenedor');
  private readonly chartService = inject(ChartService);
  private ro: ResizeObserver | null = null;

  constructor() {
    effect(() => {
      const fn = this.renderFn();
      const cfg = this.config();
      const el = this.contenedor()?.nativeElement;
      if (!el) return;
      if (fn) {
        fn(el);
      } else if (cfg) {
        this.chartService.render(el, cfg);
      }
    });
  }

  ngOnInit(): void {
    const el = this.contenedor().nativeElement;
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => {
        if (el.clientWidth <= 0) return;
        const fn = this.renderFn();
        const cfg = this.config();
        if (fn) {
          fn(el);
        } else if (cfg) {
          this.chartService.render(el, cfg);
        }
      });
      this.ro.observe(el);
    }
  }

  ngOnDestroy(): void {
    this.ro?.disconnect();
  }
}
