import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { PortfolioStoreService } from '../../services/portfolio-store.service';
import { FormatService } from '../../services/format.service';
import { CapTooltipDirective } from '../../directives/tooltip.directive';
import { MetricasCalculadas } from '../../models/portfolio.model';

@Component({
  selector: 'cap-hero-patrimonio',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CapTooltipDirective],
  template: `
    @if (store.datos(); as d) {
      <section class="hero-patrimonio">
        <div class="hero-izq">
          @if (saludo()) {
            <p class="hero-saludo">{{ saludo() }}</p>
          }
          <div class="hero-kicker">
            <span>
              {{
                store.filtrando()
                  ? 'Patrimonio filtrado (' +
                    store.visibles().length +
                    ' de ' +
                    store.todosComponentes().length +
                    ')'
                  : 'Patrimonio neto'
              }}
            </span>
            @if (ajusteVivoEur() !== 0 || store.hayActivosEnVivo()) {
              <span class="vivo-pill" capTooltip="Cotizaciones en tiempo real">
                <span class="vivo-dot"></span> En vivo
              </span>
            }
          </div>

          <div class="hero-cifra valor-privado">
            {{ fmt.eur(patrimonioMostrado(), 2) }}
          </div>

          <div class="hero-badges">
            @if (metricasActivas().plusvalia !== null) {
              <span
                class="chip-rent"
                [class.pos]="fmt.claseSigno(plusvaliaMostrada()) === 'pos'"
                [class.neg]="fmt.claseSigno(plusvaliaMostrada()) === 'neg'"
              >
                <span class="valor-privado">{{ fmt.eurSigno(plusvaliaMostrada(), 0) }}</span>
                @if (rentabilidadMostrada() !== null) {
                  ({{ fmt.pctSigno(rentabilidadMostrada(), 2) }})
                }
              </span>
            }
            @if (metricasActivas().tir !== null) {
              <span class="chip-neutro">
                TIR {{ fmt.pctSigno(metricasActivas().tir, 2) }} anual
              </span>
            }
          </div>

          <div class="hero-sub">
            @if (metricasActivas().aportado > 0) {
              <span class="valor-privado">
                {{ fmt.eur(metricasActivas().aportado, 0) }} invertidos de tu bolsillo
              </span>
              @if (metricasActivas().valor - metricasActivas().valorConCoste > 1) {
                <span class="valor-privado">
                  + {{ fmt.eur(metricasActivas().valor - metricasActivas().valorConCoste, 0) }} en
                  otros activos
                </span>
              }
            }
            @if (d.fechas.length) {
              <span>
                · Desde {{ fmt.fechaCorta(d.fechas[0]) }} hasta
                {{ fmt.fechaCorta(d.fechas[d.fechas.length - 1]) }}
              </span>
            }
          </div>
        </div>

        <div class="hero-der">
          <div
            class="actualizacion-meta"
            [capTooltip]="
              store.actualizandoPrecios()
                ? 'Sincronizando cotizaciones de mercado…'
                : 'Fecha y hora de la última actualización'
            "
          >
            <span
              class="actualizacion-dot"
              [class.actualizando]="store.actualizandoPrecios()"
              [class.en-vivo]="!store.actualizandoPrecios() && store.hayActivosEnVivo()"
            ></span>
            @if (store.actualizandoPrecios()) {
              <span>Actualizando datos…</span>
            } @else if (store.ultimaActualizacion()) {
              <span>
                Actualizado:
                <strong class="mono">{{ fmt.fechaHora(store.ultimaActualizacion()) }}</strong>
              </span>
            } @else {
              <span>Sin actualizar</span>
            }
          </div>

          @if (d.objetivo && d.objetivo.activo && d.objetivo.importe > 0) {
            <div class="objetivo-box">
              <div class="objetivo-cab">
                <span class="objetivo-etq">{{
                  d.objetivo.etiqueta || 'Objetivo de patrimonio'
                }}</span>
                <button type="button" class="btn-link" (click)="abrirObjetivo.emit()">
                  Editar
                </button>
              </div>
              <div class="objetivo-nums">
                <strong class="mono">{{ fmt.num(progresoObjetivoPct(), 1) }} %</strong>
                <span class="mono muted valor-privado">
                  de {{ fmt.eur(d.objetivo.importe, 0) }}
                </span>
              </div>
              <div class="barra-prog">
                <div class="barra-prog-fill" [style.width.%]="progresoObjetivoPct()"></div>
              </div>
              <div class="objetivo-pie">
                @if (faltaObjetivo() > 0) {
                  <span class="valor-privado">Faltan {{ fmt.eur(faltaObjetivo(), 0) }}</span>
                  @if (estimacionObjetivoTexto()) {
                    <span [capTooltip]="tooltipRangoObjetivo()">· {{ estimacionObjetivoTexto() }}</span>
                  }
                } @else {
                  <span class="pos">¡Objetivo alcanzado!</span>
                }
              </div>
            </div>
          } @else {
            <div class="objetivo-box objetivo-vacio">
              <p>Define una meta patrimonial para seguir tu progreso mes a mes.</p>
              <button
                type="button"
                class="btn-secundario btn-sm"
                (click)="abrirObjetivo.emit()"
              >
                Fijar objetivo
              </button>
            </div>
          }
        </div>
      </section>
    }
  `,
})
export class HeroPatrimonioComponent {
  readonly store = inject(PortfolioStoreService);
  readonly fmt = inject(FormatService);

  readonly patrimonioMostrado = input.required<number>();
  readonly plusvaliaMostrada = input<number | null>(null);
  readonly rentabilidadMostrada = input<number | null>(null);
  readonly ajusteVivoEur = input<number>(0);
  readonly metricasActivas = input.required<MetricasCalculadas>();
  readonly proyRent = input<number>(7);

  readonly abrirObjetivo = output<void>();

  readonly saludo = computed(() => {
    const u = this.store.usuario();
    if (!u) return '';
    const nombre = (u.nombre || '').trim() || u.email.split('@')[0];
    return nombre ? `Hola, ${nombre}` : '';
  });

  readonly progresoObjetivoPct = computed<number>(() => {
    const obj = this.store.datos()?.objetivo;
    if (!obj || obj.importe <= 0) return 0;
    return Math.min(100, Math.max(0, (this.patrimonioMostrado() / obj.importe) * 100));
  });

  readonly faltaObjetivo = computed<number>(() => {
    const obj = this.store.datos()?.objetivo;
    if (!obj) return 0;
    return Math.max(0, obj.importe - this.patrimonioMostrado());
  });

  private estimarPlazoObjetivo(rentPct: number): string {
    const obj = this.store.datos()?.objetivo;
    const falta = this.faltaObjetivo();
    if (!obj || obj.importe <= 0 || falta <= 0) return '';
    let cap = Math.max(0, this.patrimonioMostrado());
    const ritmo = Math.max(0, this.store.datos()?.total?.ritmoMensual || 0);
    const rAnual = Math.max(0, rentPct) / 100;
    if (ritmo <= 0 && (cap <= 0 || rAnual <= 0)) return '';
    const rMes = Math.pow(1 + rAnual, 1 / 12) - 1;
    let meses = 0;
    while (cap < obj.importe && meses < 600) {
      cap = cap * (1 + rMes) + ritmo;
      meses++;
    }
    if (cap < obj.importe) return '> 50 años';
    if (meses < 12) return `~${meses} ${meses === 1 ? 'mes' : 'meses'}`;
    const anos = (meses / 12).toFixed(1).replace('.0', '').replace('.', ',');
    return `~${anos} años`;
  }

  readonly estimacionObjetivoTexto = computed<string>(() => {
    const rentPct = this.proyRent() || 6;
    const plazo = this.estimarPlazoObjetivo(rentPct);
    if (!plazo) return '';
    return `${plazo} (al ${this.fmt.num(rentPct, 1)}% anual)`;
  });

  readonly tooltipRangoObjetivo = computed<string>(() => {
    const basePct = this.proyRent() || 6;
    const consPct = Math.max(1, basePct - 2);
    const optPct = basePct + 2;
    const pCons = this.estimarPlazoObjetivo(consPct);
    const pBase = this.estimarPlazoObjetivo(basePct);
    const pOpt = this.estimarPlazoObjetivo(optPct);
    if (!pBase) return '';
    return `Escenarios con interés compuesto · Conservador (${this.fmt.num(consPct, 1)}%): ${pCons} · Base (${this.fmt.num(basePct, 1)}%): ${pBase} · Optimista (${this.fmt.num(optPct, 1)}%): ${pOpt}`;
  });
}
