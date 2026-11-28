import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FormatService } from '../../services/format.service';
import { ChartRenderFn, ChartService } from '../../services/chart.service';
import { PortfolioStoreService } from '../../services/portfolio-store.service';
import { SvgChartComponent } from '../svg-chart/svg-chart.component';
import {
  EspecializadosDatos,
  HipotecaResumen,
  ItemRentaFija,
} from '../../models/portfolio.model';
import {
  simularAmortizacionHipoteca,
  SimulacionHipotecaResultado,
} from '../../services/portfolio-metrics.util';

@Component({
  selector: 'cap-especializados-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, SvgChartComponent],
  template: `
    @if (especializados(); as esp) {
      <!-- 1. ESCALERA DE RENTA FIJA -->
      @if (rentaFijaOrdenada().length) {
        <section class="panel-card bloque-seccion">
          <div class="card-header">
            <div>
              <h3 class="card-title">Escalera de renta fija, bonos y depósitos</h3>
              <p class="card-sub">
                {{ rentaFijaOrdenada().length }} posiciones ordenadas por vencimiento · Interés
                anual estimado:
                <strong class="mono valor-privado">{{ fmt.eur(totalInteresesRentaFija(), 0) }}</strong>
              </p>
            </div>
          </div>

          @if (hayProximoVencimiento()) {
            <div class="xray-alerta" style="margin-bottom: 0.9rem">
              Tienes vencimientos en los próximos 30 días. Revisa el reinvertido o la renovación de
              esos tramos.
            </div>
          }

          @if (escaleraVencimientos().length > 1) {
            <div style="margin-bottom: 1.15rem">
              <cap-svg-chart
                [renderFn]="renderEscaleraFn()"
                [minHeight]="200"
                ariaLabel="Gráfico de escalera de vencimientos de renta fija por periodo"
              />
            </div>
          }

          <div class="tabla-scroll">
            <table class="tabla-datos">
              <thead>
                <tr>
                  <th>Instrumento</th>
                  <th class="num">Capital</th>
                  <th class="num">TAE / Cupón</th>
                  <th>Frecuencia</th>
                  <th>Vencimiento</th>
                  <th class="num">Interés anual est.</th>
                </tr>
              </thead>
              <tbody>
                @for (rf of rentaFijaOrdenada(); track rf.id) {
                  <tr>
                    <td>
                      <strong>{{ rf.nombre }}</strong>
                      @if (rf.fechaEmision) {
                        <div class="muted" style="font-size: 0.74rem">
                          Emisión: {{ fmt.fechaCorta(rf.fechaEmision) }}
                        </div>
                      }
                    </td>
                    <td class="num mono valor-privado">{{ fmt.eur(rf.valor, 2) }}</td>
                    <td class="num mono">
                      @if (rf.tae !== null && rf.tae !== undefined) {
                        {{ fmt.num(rf.tae, 2) }} % TAE
                      } @else if (rf.cuponAnual !== null && rf.cuponAnual !== undefined) {
                        {{ fmt.num(rf.cuponAnual, 2) }} %
                      } @else {
                        <span class="muted">—</span>
                      }
                    </td>
                    <td>{{ etiquetaFrecuencia(rf.frecuenciaCupon) }}</td>
                    <td>
                      @if (rf.fechaVencimiento) {
                        <span class="mono">{{ fmt.fechaCorta(rf.fechaVencimiento) }}</span>
                        <div style="margin-top: 0.2rem">
                          @if (rf.proximoVencimiento) {
                            <span class="tag tag-alerta">
                              {{
                                rf.diasRestantes !== null && rf.diasRestantes >= 0
                                  ? 'Vence en ' + rf.diasRestantes + ' d'
                                  : 'Próximo vencimiento'
                              }}
                            </span>
                          } @else if (rf.diasRestantes !== null) {
                            <span class="muted" style="font-size: 0.75rem">
                              {{
                                rf.diasRestantes >= 0
                                  ? 'En ' + rf.diasRestantes + ' días'
                                  : 'Vencido'
                              }}
                            </span>
                          }
                        </div>
                      } @else {
                        <span class="muted">Sin vencimiento</span>
                      }
                    </td>
                    <td class="num mono pos valor-privado">
                      {{
                        rf.interesAnualEstimado !== null && rf.interesAnualEstimado !== undefined
                          ? '+' + fmt.eur(rf.interesAnualEstimado, 2)
                          : '—'
                      }}
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>
      }

      <!-- 2. PLANES DE PENSIONES -->
      @if (esp.pensiones?.items?.length) {
        <section class="panel-card bloque-seccion">
          <div class="card-header">
            <div>
              <h3 class="card-title">Planes de pensiones y límite fiscal anual</h3>
              <p class="card-sub">
                Seguimiento del tope deducible en IRPF y ahorro estimado según tu tipo marginal.
              </p>
            </div>
          </div>

          <div class="spec-metrics-row" style="margin-bottom: 0.85rem">
            <div class="spec-metric">
              <span>Aportado este año</span>
              <strong class="mono valor-privado">{{
                fmt.eur(esp.pensiones.totalAportadoAnio, 0)
              }}</strong>
            </div>
            <div class="spec-metric">
              <span>Límite legal anual</span>
              <strong class="mono valor-privado">{{
                fmt.eur(esp.pensiones.totalLimiteAnual, 0)
              }}</strong>
            </div>
            <div class="spec-metric">
              <span>Margen restante</span>
              <strong class="mono gold valor-privado">{{
                fmt.eur(esp.pensiones.totalMargenRestante, 0)
              }}</strong>
            </div>
            <div class="spec-metric">
              <span>Ahorro fiscal est. IRPF</span>
              <strong class="mono pos valor-privado">
                {{
                  esp.pensiones.totalAhorroEstimado !== null &&
                  esp.pensiones.totalAhorroEstimado !== undefined
                    ? '+' + fmt.eur(esp.pensiones.totalAhorroEstimado, 0)
                    : 'Sin marginal IRPF'
                }}
              </strong>
            </div>
          </div>

          <div style="margin-bottom: 1rem">
            <div class="barra-prog">
              <div class="barra-prog-fill" [style.width.%]="porcentajePension()"></div>
            </div>
            <div class="muted" style="font-size: 0.76rem; margin-top: 0.35rem">
              {{ fmt.num(porcentajePension(), 1) }} % del límite anual consumido
            </div>
          </div>

          <div class="spec-section-grid">
            @for (pen of esp.pensiones.items; track pen.id) {
              <article class="spec-card">
                <div class="spec-card-head">
                  <h4 class="spec-card-title">{{ pen.nombre }}</h4>
                  @if (pen.tipoMarginalIrpf !== null && pen.tipoMarginalIrpf !== undefined) {
                    <span class="tag">IRPF {{ fmt.num(pen.tipoMarginalIrpf, 1) }} %</span>
                  }
                </div>
                <div class="spec-metrics-row">
                  <div class="spec-metric">
                    <span>Valor actual</span>
                    <strong class="mono valor-privado">{{ fmt.eur(pen.valor, 0) }}</strong>
                  </div>
                  <div class="spec-metric">
                    <span>Aportado / Límite</span>
                    <strong class="mono valor-privado">
                      {{ fmt.eur(pen.aportadoAnioActual, 0) }} / {{ fmt.eur(pen.limiteAnual, 0) }}
                    </strong>
                  </div>
                  <div class="spec-metric">
                    <span>Ahorro est.</span>
                    <strong class="mono pos valor-privado">
                      {{
                        pen.ahorroFiscalEstimado !== null && pen.ahorroFiscalEstimado !== undefined
                          ? '+' + fmt.eur(pen.ahorroFiscalEstimado, 0)
                          : '—'
                      }}
                    </strong>
                  </div>
                </div>
              </article>
            }
          </div>
        </section>
      }

      <!-- 3. INMUEBLES E HIPOTECAS + SIMULADOR -->
      @if (esp.inmobiliario?.inmuebles?.length || esp.inmobiliario?.hipotecasSueltas?.length) {
        <section class="panel-card bloque-seccion">
          <div class="card-header">
            <div>
              <h3 class="card-title">Inmobiliario, hipotecas y amortización anticipada</h3>
              <p class="card-sub">
                Equity neto, apalancamiento (LTV), yield sobre alquiler y comparador amortizar vs.
                invertir.
              </p>
            </div>
          </div>

          @if (esp.inmobiliario.inmuebles.length) {
            <div class="spec-section-grid">
              @for (inm of esp.inmobiliario.inmuebles; track inm.id) {
                <article class="spec-card">
                  <div class="spec-card-head">
                    <h4 class="spec-card-title">{{ inm.nombre }}</h4>
                    <span class="tag" [class.tag-alerta]="inm.ltv > 0.8">
                      LTV {{ fmt.pct(inm.ltv, 1) }}
                    </span>
                  </div>

                  <div class="spec-metrics-row">
                    <div class="spec-metric">
                      <span>Valor inmueble</span>
                      <strong class="mono valor-privado">{{ fmt.eur(inm.valorInmueble, 0) }}</strong>
                    </div>
                    <div class="spec-metric">
                      <span>Hipoteca pendiente</span>
                      <strong class="mono neg valor-privado">{{
                        fmt.eur(inm.deudaPendiente, 0)
                      }}</strong>
                    </div>
                    <div class="spec-metric">
                      <span>Equity neto</span>
                      <strong class="mono pos valor-privado">{{ fmt.eur(inm.equityNeto, 0) }}</strong>
                    </div>
                  </div>

                  <div>
                    <div class="barra-prog">
                      <div
                        class="barra-prog-fill"
                        [style.width.%]="clampPct(inm.porcentajePagado * 100)"
                      ></div>
                    </div>
                    <div class="muted" style="font-size: 0.76rem; margin-top: 0.3rem">
                      {{ fmt.pct(inm.porcentajePagado, 1) }} pagado libre de deuda
                    </div>
                  </div>

                  @if (inm.alquilerMensual || inm.rentabilidadBruta !== null) {
                    <div class="spec-metrics-row">
                      <div class="spec-metric">
                        <span>Alquiler mensual</span>
                        <strong class="mono valor-privado">
                          {{ inm.alquilerMensual ? fmt.eur(inm.alquilerMensual, 0) + '/mes' : '—' }}
                        </strong>
                      </div>
                      <div class="spec-metric">
                        <span>Rent. bruta</span>
                        <strong class="mono pos">
                          {{
                            inm.rentabilidadBruta !== null
                              ? fmt.pct(inm.rentabilidadBruta, 2)
                              : '—'
                          }}
                        </strong>
                      </div>
                      <div class="spec-metric">
                        <span>Rent. neta (antes hip.)</span>
                        <strong class="mono pos">
                          {{
                            inm.rentabilidadNeta !== null ? fmt.pct(inm.rentabilidadNeta, 2) : '—'
                          }}
                        </strong>
                      </div>
                      @if (inm.interesesHipotecaAnuales && inm.interesesHipotecaAnuales > 0) {
                        <div class="spec-metric">
                          <span>Neto tras intereses</span>
                          <strong
                            class="mono"
                            [class.pos]="fmt.claseSigno(inm.rentabilidadNetaConHipoteca) === 'pos'"
                            [class.neg]="fmt.claseSigno(inm.rentabilidadNetaConHipoteca) === 'neg'"
                          >
                            {{
                              inm.rentabilidadNetaConHipoteca !== null &&
                              inm.rentabilidadNetaConHipoteca !== undefined
                                ? fmt.pct(inm.rentabilidadNetaConHipoteca, 2)
                                : '—'
                            }}
                          </strong>
                          @if (inm.cashflowAnualNeto !== null && inm.cashflowAnualNeto !== undefined) {
                            <span class="valor-privado">
                              {{ fmt.eurSigno(inm.cashflowAnualNeto, 0) }}/año
                            </span>
                          }
                        </div>
                      }
                    </div>
                  }

                  @if (inm.hipotecas.length) {
                    <div class="prod-tags">
                      @for (hip of inm.hipotecas; track hip.id) {
                        <span class="tag">
                          {{ hip.nombre }} ·
                          {{
                            hip.tipoInteres !== null ? fmt.num(hip.tipoInteres, 2) + ' %' : 'Sin TIN'
                          }}
                          @if (hip.tipoTasa) {
                            ({{ hip.tipoTasa }})
                          }
                          @if (hip.cuotaMensual) {
                            · <span class="valor-privado">{{ fmt.eur(hip.cuotaMensual, 0) }}/m</span>
                          }
                        </span>
                      }
                    </div>
                  }
                </article>
              }
            </div>
          }

          @if (esp.inmobiliario.hipotecasSueltas.length) {
            <div class="spec-section-grid" style="margin-top: 1rem">
              @for (hip of esp.inmobiliario.hipotecasSueltas; track hip.id) {
                <article class="spec-card">
                  <div class="spec-card-head">
                    <h4 class="spec-card-title">{{ hip.nombre }}</h4>
                    @if (hip.tipoTasa) {
                      <span class="tag">{{ hip.tipoTasa }}</span>
                    }
                  </div>
                  <div class="spec-metrics-row">
                    <div class="spec-metric">
                      <span>Capital pendiente</span>
                      <strong class="mono neg valor-privado">{{
                        fmt.eur(hip.deudaPendiente, 0)
                      }}</strong>
                    </div>
                    <div class="spec-metric">
                      <span>Tipo interés</span>
                      <strong class="mono">
                        {{ hip.tipoInteres !== null ? fmt.num(hip.tipoInteres, 2) + ' %' : '—' }}
                      </strong>
                    </div>
                    <div class="spec-metric">
                      <span>Cuota mensual</span>
                      <strong class="mono valor-privado">
                        {{ hip.cuotaMensual ? fmt.eur(hip.cuotaMensual, 0) + '/mes' : '—' }}
                      </strong>
                    </div>
                  </div>
                </article>
              }
            </div>
          }

          <!-- SIMULADOR DE AMORTIZACIÓN ANTICIPADA -->
          @if (hipotecaSeleccionada(); as hipActiva) {
            <div class="spec-sim-box">
              <div class="spec-card-head">
                <div>
                  <h4 class="spec-card-title">
                    Simulador de amortización anticipada vs. invertir
                  </h4>
                  <p class="card-sub">
                    Compara el ahorro de intereses (reduciendo cuota o plazo) frente a invertir ese
                    importe.
                  </p>
                </div>
                @if (todasHipotecas().length > 1) {
                  <select
                    class="input-select"
                    style="max-width: 260px"
                    [ngModel]="hipActiva.id"
                    (ngModelChange)="hipotecaManualId.set($event)"
                    aria-label="Seleccionar préstamo o hipoteca"
                  >
                    @for (h of todasHipotecas(); track h.id) {
                      <option [value]="h.id">{{ h.nombre }}</option>
                    }
                  </select>
                }
              </div>

              <div class="spec-sim-inputs">
                <div class="campo">
                  <label for="sim-amort-extra">Amortización anticipada (€)</label>
                  <input
                    id="sim-amort-extra"
                    type="number"
                    min="0"
                    [max]="hipActiva.deudaPendiente"
                    step="500"
                    [ngModel]="simAmortExtra()"
                    (ngModelChange)="simAmortExtra.set(+$event || 0)"
                  />
                </div>
                <div class="campo">
                  <label for="sim-amort-tipo">Interés préstamo (%)</label>
                  <input
                    id="sim-amort-tipo"
                    type="number"
                    min="0"
                    max="30"
                    step="0.05"
                    [ngModel]="simTipoPct()"
                    (ngModelChange)="simTipoPct.set(+$event || 0)"
                  />
                </div>
                <div class="campo">
                  <label for="sim-amort-meses">Plazo restante (meses)</label>
                  <input
                    id="sim-amort-meses"
                    type="number"
                    min="1"
                    max="480"
                    step="1"
                    [ngModel]="simMeses()"
                    (ngModelChange)="simMeses.set(+$event || 1)"
                  />
                </div>
                <div class="campo">
                  <label for="sim-amort-rent">Rentabilidad si inviertes (%)</label>
                  <input
                    id="sim-amort-rent"
                    type="number"
                    min="0"
                    max="25"
                    step="0.25"
                    [ngModel]="simRentInvPct()"
                    (ngModelChange)="simRentInvPct.set(+$event || 0)"
                  />
                </div>
              </div>

              @if (resultadoSimulacion(); as sim) {
                <div class="spec-metrics-row">
                  <div class="spec-metric">
                    <span>Cuota actual est.</span>
                    <strong class="mono valor-privado">{{ fmt.eur(sim.cuotaActual, 2) }}/m</strong>
                  </div>
                  <div class="spec-metric">
                    <span>Reduciendo cuota</span>
                    <strong class="mono valor-privado"
                      >{{ fmt.eur(sim.nuevaCuotaReduciendoCuota, 2) }}/m</strong
                    >
                    <span class="valor-privado"
                      >Ahorras {{ fmt.eur(sim.ahorroInteresesCuota, 0) }} intereses</span
                    >
                  </div>
                  <div class="spec-metric">
                    <span>Reduciendo plazo</span>
                    <strong class="mono pos">−{{ sim.mesesAhorrados }} meses</strong>
                    <span class="valor-privado"
                      >Ahorras {{ fmt.eur(sim.ahorroInteresesPlazo, 0) }} intereses</span
                    >
                  </div>
                  <div class="spec-metric">
                    <span>Ganancia si inviertes</span>
                    <strong class="mono gold valor-privado"
                      >+{{ fmt.eur(sim.gananciaInversionBruta, 0) }}</strong
                    >
                    <span>Al {{ fmt.num(simRentInvPct(), 2) }} % anual bruto</span>
                  </div>
                </div>

                <div class="spec-veredicto">
                  @if (sim.convieneInvertir) {
                    <strong>Conclusión matemática (bruta):</strong> invertir
                    <span class="valor-privado">{{ fmt.eur(simAmortExtra(), 0) }}</span> al
                    {{ fmt.num(simRentInvPct(), 2) }} % generaría
                    <strong class="pos valor-privado"
                      >+{{ fmt.eur(sim.diferenciaInvertirVsAmortizar, 0) }}</strong
                    >
                    más antes de impuestos que amortizar reduciendo plazo (aunque amortizar ofrece
                    rentabilidad segura sin volatilidad ni IRPF).
                  } @else {
                    <strong>Conclusión matemática:</strong> amortizar reduciendo plazo ahorra
                    <strong class="pos valor-privado"
                      >+{{ fmt.eur(Math.abs(sim.diferenciaInvertirVsAmortizar), 0) }}</strong
                    >
                    más en intereses garantizados que la ganancia bruta estimada invirtiendo al
                    {{ fmt.num(simRentInvPct(), 2) }} %.
                  }
                </div>
              }
            </div>
          }
        </section>
      }
    }
  `,
})
export class EspecializadosPanelComponent {
  readonly fmt = inject(FormatService);
  private readonly chart = inject(ChartService);
  private readonly store = inject(PortfolioStoreService);
  protected readonly Math = Math;

  readonly especializados = input.required<EspecializadosDatos>();

  readonly hipotecaManualId = signal<string | null>(null);
  readonly simAmortExtra = signal<number>(10000);
  readonly simTipoPct = signal<number>(3);
  readonly simMeses = signal<number>(180);
  readonly simRentInvPct = signal<number>(7);
  private ultimaHipotecaInitId: string | null = null;

  readonly rentaFijaOrdenada = computed<ItemRentaFija[]>(() => {
    const lista = [...(this.especializados()?.rentaFija || [])];
    return lista.sort((a, b) => {
      const da = a.diasRestantes ?? Number.MAX_SAFE_INTEGER;
      const db = b.diasRestantes ?? Number.MAX_SAFE_INTEGER;
      return da - db;
    });
  });

  readonly totalInteresesRentaFija = computed<number>(() => {
    return this.rentaFijaOrdenada().reduce((acc, item) => acc + (item.interesAnualEstimado || 0), 0);
  });

  readonly hayProximoVencimiento = computed<boolean>(() => {
    return this.rentaFijaOrdenada().some((rf) => rf.proximoVencimiento);
  });

  readonly escaleraVencimientos = computed<{ etiqueta: string; valor: number }[]>(() => {
    const mapa = new Map<string, number>();
    for (const rf of this.rentaFijaOrdenada()) {
      if (!rf.fechaVencimiento || !rf.valor || rf.valor <= 0) continue;
      const anio = rf.fechaVencimiento.slice(0, 4);
      const mes = Number(rf.fechaVencimiento.slice(5, 7)) || 1;
      const trim = Math.ceil(mes / 3);
      const clave = `${anio} T${trim}`;
      mapa.set(clave, (mapa.get(clave) || 0) + rf.valor);
    }
    return Array.from(mapa.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([etiqueta, valor]) => ({ etiqueta, valor }));
  });

  readonly renderEscaleraFn = computed<ChartRenderFn>(() => {
    const tramos = this.escaleraVencimientos();
    const tema = this.store.tema();
    void tema;
    return (el: HTMLElement) => {
      if (!tramos.length) return;
      this.chart.barrasSimples(el, {
        etiquetas: tramos.map((t) => t.etiqueta),
        valores: tramos.map((t) => t.valor),
        esPorcentaje: false,
        color: '#38bdf8',
        formatoValor: (v) => this.fmt.eurCompacto(v),
        altura: 200,
      });
    };
  });

  readonly porcentajePension = computed<number>(() => {
    const pen = this.especializados()?.pensiones;
    if (!pen || pen.totalLimiteAnual <= 0) return 0;
    return this.clampPct((pen.totalAportadoAnio / pen.totalLimiteAnual) * 100);
  });

  readonly todasHipotecas = computed<HipotecaResumen[]>(() => {
    const inm = this.especializados()?.inmobiliario;
    if (!inm) return [];
    const lista: HipotecaResumen[] = [];
    for (const prop of inm.inmuebles || []) {
      for (const h of prop.hipotecas || []) {
        if (h.deudaPendiente > 0) lista.push(h);
      }
    }
    for (const h of inm.hipotecasSueltas || []) {
      if (h.deudaPendiente > 0) lista.push(h);
    }
    return lista;
  });

  readonly hipotecaSeleccionada = computed<HipotecaResumen | null>(() => {
    const lista = this.todasHipotecas();
    if (!lista.length) return null;
    const elegida = this.hipotecaManualId();
    return lista.find((h) => h.id === elegida) || lista[0];
  });

  readonly resultadoSimulacion = computed<SimulacionHipotecaResultado | null>(() => {
    const h = this.hipotecaSeleccionada();
    if (!h || h.deudaPendiente <= 0) return null;
    return simularAmortizacionHipoteca({
      capitalPendiente: h.deudaPendiente,
      tipoInteresAnualPct: this.simTipoPct(),
      mesesRestantes: this.simMeses(),
      amortizacionAnticipada: this.simAmortExtra(),
      rentabilidadInvertirPct: this.simRentInvPct(),
    });
  });

  constructor() {
    effect(() => {
      const h = this.hipotecaSeleccionada();
      if (h && h.id !== this.ultimaHipotecaInitId) {
        this.ultimaHipotecaInitId = h.id;
        this.simTipoPct.set(h.tipoInteres !== null && h.tipoInteres !== undefined ? h.tipoInteres : 3);
        this.simMeses.set(this.estimarMesesRestantes(h));
        this.simAmortExtra.set(Math.min(10000, Math.round(h.deudaPendiente)));
      }
    });
  }

  private estimarMesesRestantes(h: HipotecaResumen): number {
    if (h.fechaVencimiento) {
      const diffMs = new Date(h.fechaVencimiento).getTime() - Date.now();
      const m = Math.round(diffMs / (30.4375 * 86400000));
      if (Number.isFinite(m) && m >= 1) return Math.min(480, m);
    }
    if (h.cuotaMensual && h.cuotaMensual > 0 && h.deudaPendiente > 0) {
      return Math.min(480, Math.max(12, Math.round(h.deudaPendiente / h.cuotaMensual)));
    }
    return 180;
  }

  clampPct(val: number): number {
    if (!Number.isFinite(val)) return 0;
    return Math.min(100, Math.max(0, val));
  }

  etiquetaFrecuencia(frec: string | null): string {
    const mapa: Record<string, string> = {
      vencimiento: 'Al vencimiento',
      anual: 'Anual',
      semestral: 'Semestral',
      trimestral: 'Trimestral',
      mensual: 'Mensual',
    };
    return frec ? mapa[frec] || frec : '—';
  }
}
