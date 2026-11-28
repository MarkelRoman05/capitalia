import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  model,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FormatService } from '../../services/format.service';
import { ChartRenderFn, ChartService } from '../../services/chart.service';
import { PortfolioStoreService } from '../../services/portfolio-store.service';
import { SvgChartComponent } from '../svg-chart/svg-chart.component';
import { ObjetivoPatrimonio } from '../../models/portfolio.model';
import { calcularProyeccionEscenarios } from '../../services/portfolio-metrics.util';

@Component({
  selector: 'cap-proyeccion-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, SvgChartComponent],
  template: `
    <section class="panel-card">
      <div class="card-header">
        <div>
          <h2 class="card-title">Proyección de interés compuesto</h2>
          <p class="card-sub">
            Escenarios pesimista ({{ fmt.num(Math.max(0, proyRent() - 2), 1) }} %), base ({{
              fmt.num(proyRent(), 1)
            }}
            %) y optimista ({{ fmt.num(proyRent() + 2, 1) }} %)
          </p>
        </div>
        <div class="proy-controles-extra">
          <label class="check-row">
            <input
              type="checkbox"
              [ngModel]="proyInflacion()"
              (ngModelChange)="proyInflacion.set(!!$event)"
            />
            <span>Ajustar por inflación (2,5 %)</span>
          </label>
        </div>
      </div>

      @if (proyInflacion()) {
        <p class="proy-nota-real">
          Valores en euros reales de hoy: rentabilidad real base
          {{ fmt.num(datosProyeccion().tasaBaseEfectivaPct, 2) }} % anual.
        </p>
      }

      <div class="proy-sliders">
        <div class="slider-grupo">
          <div class="slider-cab">
            <label for="proy-anos">Horizonte</label>
            <strong class="mono">{{ proyAnos() }} años ({{ anioFuturo() }})</strong>
          </div>
          <input
            id="proy-anos"
            type="range"
            min="1"
            max="35"
            step="1"
            [ngModel]="proyAnos()"
            (ngModelChange)="proyAnos.set(+$event)"
          />
        </div>

        <div class="slider-grupo">
          <div class="slider-cab">
            <label for="proy-rent">Rentabilidad anual esperada</label>
            <strong class="mono">{{ fmt.num(proyRent(), 1) }} %</strong>
          </div>
          <input
            id="proy-rent"
            type="range"
            min="0"
            max="15"
            step="0.5"
            [ngModel]="proyRent()"
            (ngModelChange)="proyRent.set(+$event)"
          />
        </div>

        <div class="slider-grupo">
          <div class="slider-cab">
            <label for="proy-aport">Aportación mensual</label>
            <strong class="mono valor-privado">{{ fmt.eur(proyAport(), 0) }}/mes</strong>
          </div>
          <input
            id="proy-aport"
            type="range"
            min="0"
            max="4000"
            step="50"
            [ngModel]="proyAport()"
            (ngModelChange)="proyAport.set(+$event)"
          />
        </div>
      </div>

      <div class="proy-resumen proy-resumen-4">
        <div class="proy-kpi">
          <span>Patrimonio estimado (base)</span>
          <strong class="mono gold valor-privado">{{
            fmt.eur(datosProyeccion().finalTotal, 0)
          }}</strong>
        </div>
        <div class="proy-kpi">
          <span>Aportado por ti</span>
          <strong class="mono valor-privado">{{
            fmt.eur(datosProyeccion().finalAportado, 0)
          }}</strong>
        </div>
        <div class="proy-kpi">
          <span>Interés compuesto generado</span>
          <strong class="mono pos valor-privado"
            >+{{ fmt.eur(datosProyeccion().ganancia, 0) }}</strong
          >
        </div>
        <div class="proy-kpi">
          <div class="proy-fire-head">
            <span>Renta FIRE estimada</span>
            <div class="seg-group seg-group-xs" role="group" aria-label="Tasa de retiro FIRE">
              <button
                type="button"
                class="seg-btn"
                [class.on]="proyTasaFire() === 0.04"
                (click)="proyTasaFire.set(0.04)"
              >
                4 %
              </button>
              <button
                type="button"
                class="seg-btn"
                [class.on]="proyTasaFire() === 0.035"
                (click)="proyTasaFire.set(0.035)"
              >
                3,5 %
              </button>
            </div>
          </div>
          <strong class="mono valor-privado"
            >{{ fmt.eur(datosProyeccion().rentaFireMensual, 0) }}/mes</strong
          >
          <small class="salud-sub">
            @if (datosProyeccion().anioCrossover; as anioCross) {
              Crossover:
              {{ anioCross <= anioActual() ? 'ya alcanzado (' + anioCross + ')' : anioCross }}
            } @else {
              Crossover: &gt; 60 años
            }
          </small>
        </div>
      </div>

      <cap-svg-chart
        [renderFn]="renderProyeccionFn()"
        [minHeight]="240"
        ariaLabel="Proyección patrimonial con tres escenarios de interés compuesto"
      />
    </section>
  `,
})
export class ProyeccionCardComponent {
  readonly fmt = inject(FormatService);
  private readonly chart = inject(ChartService);
  private readonly store = inject(PortfolioStoreService);
  protected readonly Math = Math;

  readonly patrimonioActual = input.required<number>();
  readonly objetivo = input<ObjetivoPatrimonio | null>(null);
  readonly ritmoMensualSugerido = input<number>(300);
  readonly carteraVacia = input<boolean>(false);
  readonly proyRent = model<number>(7);

  readonly proyAnos = signal<number>(10);
  readonly proyAport = signal<number>(500);
  readonly proyInflacion = signal<boolean>(false);
  readonly proyTasaFire = signal<0.04 | 0.035>(0.04);
  private proyInicializado = false;

  readonly anioActual = computed<number>(() => new Date().getFullYear());
  readonly anioFuturo = computed<number>(() => this.anioActual() + this.proyAnos());

  readonly datosProyeccion = computed(() =>
    calcularProyeccionEscenarios({
      patrimonioActual: this.patrimonioActual(),
      anos: this.proyAnos(),
      rentAnualPct: this.proyRent(),
      aportacionMensual: this.proyAport(),
      ajustarInflacion: this.proyInflacion(),
      tasaInflacion: 0.025,
      tasaRetiroFire: this.proyTasaFire(),
    }),
  );

  readonly renderProyeccionFn = computed<ChartRenderFn>(() => {
    const p = this.datosProyeccion();
    const tema = this.store.tema();
    void tema;
    const objCfg = this.objetivo();
    const obj =
      objCfg && objCfg.activo && objCfg.importe > 0
        ? { valor: objCfg.importe, etiqueta: objCfg.etiqueta || 'Objetivo' }
        : null;
    return (el: HTMLElement) => {
      this.chart.proyeccionEscenarios(el, {
        fechas: p.fechas,
        optimista: p.optimista,
        base: p.base,
        pesimista: p.pesimista,
        aportado: p.aportado,
        objetivo: obj,
        etiquetas: {
          optimista: `Optimista (${this.fmt.num(p.tasaOptimistaEfectivaPct, 1)} %)`,
          base: `Base (${this.fmt.num(p.tasaBaseEfectivaPct, 1)} %)`,
          pesimista: `Pesimista (${this.fmt.num(p.tasaPesimistaEfectivaPct, 1)} %)`,
          aportado: 'Capital aportado',
        },
        altura: 240,
      });
    };
  });

  constructor() {
    effect(() => {
      const ritmo = this.ritmoMensualSugerido();
      if (!this.proyInicializado && !this.carteraVacia() && Number.isFinite(ritmo)) {
        this.proyInicializado = true;
        const ritmoRedondeado = Math.round((ritmo || 300) / 50) * 50;
        this.proyAport.set(Math.min(4000, Math.max(0, ritmoRedondeado)));
      }
    });
  }
}
