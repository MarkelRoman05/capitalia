import { Component, computed, inject, signal } from '@angular/core';
import { PortfolioStoreService } from '../../services/portfolio-store.service';
import { FormatService } from '../../services/format.service';
import { ChartRenderFn, ChartService } from '../../services/chart.service';
import { SvgChartComponent } from '../svg-chart/svg-chart.component';
import { ReferenciaIndexado } from '../../models/portfolio.model';

@Component({
  selector: 'cap-rendimiento-tab',
  imports: [SvgChartComponent],
  template: `
    @if (store.datos(); as d) {
      <!-- 1. RENTABILIDAD AÑO A AÑO (TWR) -->
      <section class="panel-card bloque-seccion">
        <div class="card-header">
          <div>
            <h2 class="card-title">Rentabilidad año a año (TWR)</h2>
            <p class="card-sub">
              Rentabilidad ponderada por el tiempo: mide cómo lo han hecho tus inversiones cada año aislando el efecto de cuándo metiste dinero.
            </p>
          </div>
        </div>

        @if (d.rentabilidadAnual && d.rentabilidadAnual.anos.length) {
          <cap-svg-chart [renderFn]="renderBarrasAnualesFn()" [minHeight]="240" />

          <div class="tabla-scroll" style="margin-top: 1.25rem">
            <table class="tabla-datos">
              <thead>
                <tr>
                  <th>Producto / Cartera</th>
                  @for (a of d.rentabilidadAnual.anos; track a; let i = $index) {
                    <th class="num">
                      {{ a }}{{ d.rentabilidadAnual.parcial[i] ? ' (YTD)' : '' }}
                    </th>
                  }
                </tr>
              </thead>
              <tbody>
                <tr class="fila-destacada">
                  <td><strong>Total cartera de inversión</strong></td>
                  @for (val of d.rentabilidadAnual.cartera; track $index) {
                    <td class="num mono" [class]="fmt.claseSigno(val)">
                      <strong>{{ val !== null ? fmt.pctSigno(val, 2) : '—' }}</strong>
                    </td>
                  }
                </tr>
                @for (p of d.productos; track p.id) {
                  @if (d.rentabilidadAnual.porProducto[p.id]; as fila) {
                    <tr>
                      <td>
                        <span
                          class="dot"
                          [style.background]="(p.slotColor || p.color || ['#10b981'])[0]"
                        ></span>
                        {{ p.nombre }}
                      </td>
                      @for (val of fila; track $index; let j = $index) {
                        <td class="num mono" [class]="fmt.claseSigno(val)">
                          @if (val !== null && val !== undefined) {
                            <span>{{ fmt.pctSigno(val, 2) }}</span>
                            @if (d.rentabilidadAnual.desde?.[p.id]?.[j]; as fDesde) {
                              <small class="nota-desde" title="Rentabilidad parcial desde {{ fmt.fechaCorta(fDesde) }}">
                                *
                              </small>
                            }
                          } @else {
                            <span class="muted">—</span>
                          }
                        </td>
                      }
                    </tr>
                  }
                }
              </tbody>
            </table>
          </div>
        } @else {
          <p class="vacio-celda">Aún no hay suficientes datos anuales para calcular la matriz TWR.</p>
        }
      </section>

      <!-- 2. COMPARATIVA CONTRA UN INDEXADO -->
      @if (d.comparacion && d.comparacion.referencias.length) {
        <section class="panel-card bloque-seccion">
          <div class="card-header">
            <div>
              <h2 class="card-title">¿Y si hubieras metido exactamente las mismas aportaciones en un indexado?</h2>
              <p class="card-sub">
                Simulamos qué valor tendrías hoy si cada euro invertido (en las mismas fechas) hubiese ido íntegro a una referencia pasiva desde {{ fmt.fechaCorta(d.comparacion.desde) }}.
              </p>
            </div>

            <div class="seg-group" role="group" aria-label="Elegir referencia">
              @for (ref of d.comparacion.referencias; track ref.id) {
                <button
                  type="button"
                  class="seg-btn"
                  [class.on]="referenciaActiva()?.id === ref.id"
                  (click)="store.compRef.set(ref.id)"
                >
                  {{ ref.nombre }}
                </button>
              }
            </div>
          </div>

          @if (referenciaActiva(); as ref) {
            <div class="comparacion-kpis">
              <div class="comp-card comp-tuya">
                <span class="kpi-label">Tu cartera de inversión</span>
                <div class="kpi-val valor-privado">{{ fmt.eur(d.comparacion.tuValor, 0) }}</div>
                <span class="kpi-sub">
                  TIR anual:
                  <strong [class]="fmt.claseSigno(d.comparacion.tuTir)">
                    {{ d.comparacion.tuTir !== null ? fmt.pctSigno(d.comparacion.tuTir, 2) : '—' }}
                  </strong>
                </span>
              </div>

              <div class="comp-card">
                <span class="kpi-label">Todo en {{ ref.nombre }}</span>
                <div class="kpi-val valor-privado">{{ fmt.eur(ref.valor, 0) }}</div>
                <span class="kpi-sub">
                  {{ ref.detalle }} · TIR:
                  <strong [class]="fmt.claseSigno(ref.tir)">
                    {{ ref.tir !== null ? fmt.pctSigno(ref.tir, 2) : '—' }}
                  </strong>
                </span>
              </div>

              <div class="comp-card">
                <span class="kpi-label">Diferencia a tu favor</span>
                <div
                  class="kpi-val valor-privado"
                  [class]="fmt.claseSigno(d.comparacion.tuValor - ref.valor)"
                >
                  {{ fmt.eurSigno(d.comparacion.tuValor - ref.valor, 0) }}
                </div>
                <span class="kpi-sub">
                  @if (d.comparacion.tuTir !== null && ref.tir !== null) {
                    Diferencial anual:
                    <strong [class]="fmt.claseSigno(d.comparacion.tuTir - ref.tir)">
                      {{ fmt.pctSigno(d.comparacion.tuTir - ref.tir, 2) }}/año
                    </strong>
                  } @else {
                    Sobre el mismo capital aportado
                  }
                </span>
              </div>
            </div>

            @if (ref.aviso) {
              <p class="nota-aviso">Nota: {{ ref.aviso }}</p>
            }

            <cap-svg-chart [renderFn]="renderComparacionIndexadoFn()" [minHeight]="300" />
          }

          <!-- DESPLEGABLE DE MÉTRICAS DE RIESGO BASE 100 -->
          @if (d.comparador && d.comparador.length) {
            <div class="riesgo-acordeon">
              <button
                type="button"
                class="btn-fantasma btn-sm"
                (click)="mostrarRiesgo.set(!mostrarRiesgo())"
              >
                {{ mostrarRiesgo() ? '▾ Ocultar métricas avanzadas de riesgo (Volatilidad, Sharpe, Base 100)' : '▸ Ver métricas avanzadas de riesgo (Volatilidad, Sharpe, Base 100)' }}
              </button>

              @if (mostrarRiesgo()) {
                <div class="riesgo-contenido">
                  <h4 class="sub-bloque-titulo">Evolución en Base 100 (100 € iniciales sin el efecto del calendario de compras)</h4>
                  <cap-svg-chart [renderFn]="renderComparadorBase100Fn()" [minHeight]="260" />

                  <div class="tabla-scroll" style="margin-top: 1rem">
                    <table class="tabla-datos">
                      <thead>
                        <tr>
                          <th>Estrategia / Cartera</th>
                          <th class="num">Rent. acumulada</th>
                          <th class="num">CAGR (Anual)</th>
                          <th class="num">Volatilidad</th>
                          <th class="num">Ratio Sharpe</th>
                          <th class="num">Mayor caída (Max DD)</th>
                        </tr>
                      </thead>
                      <tbody>
                        @for (c of d.comparador; track c.id; let idx = $index) {
                          <tr [class.fila-destacada]="c.real">
                            <td>
                              <span
                                class="dot"
                                [style.background]="c.real ? '#10b981' : fmt.colorDeSlot(idx + 1)[0]"
                              ></span>
                              <strong>{{ c.nombre }}</strong>
                            </td>
                            <td class="num mono" [class]="fmt.claseSigno(c.metricas.rentTotal)">
                              {{ fmt.pctSigno(c.metricas.rentTotal, 2) }}
                            </td>
                            <td class="num mono" [class]="fmt.claseSigno(c.metricas.cagr)">
                              {{ c.metricas.cagr !== null ? fmt.pctSigno(c.metricas.cagr, 2) : '—' }}
                            </td>
                            <td class="num mono">
                              {{ c.metricas.vol !== null ? fmt.pct(c.metricas.vol, 2) : '—' }}
                            </td>
                            <td class="num mono">
                              {{ c.metricas.sharpe !== null ? fmt.num(c.metricas.sharpe, 2) : '—' }}
                            </td>
                            <td class="num mono neg">
                              {{ fmt.pct(c.metricas.maxDD, 2) }}
                            </td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                </div>
              }
            </div>
          }
        </section>
      }

      <!-- 3. COMISIONES Y GASTOS (TER) -->
      @if (d.comisiones) {
        <section class="panel-card bloque-seccion">
          <div class="card-header">
            <div>
              <h2 class="card-title">Radiografía de comisiones y gastos (TER)</h2>
              <p class="card-sub">
                Las comisiones de gestión (TER) se descuentan a diario del valor liquidativo de tus fondos y ETFs aunque no aparezcan como un cargo bancario.
              </p>
            </div>
          </div>

          <div class="kpis-grid kpis-4">
            <article class="kpi-card">
              <span class="kpi-label">Coste implícito anual</span>
              <div class="kpi-val valor-privado">{{ fmt.eur(d.comisiones.anual, 2) }}/año</div>
              <span class="kpi-sub valor-privado">Equivale a {{ fmt.eur(d.comisiones.anual / 12, 2) }} al mes</span>
            </article>

            <article class="kpi-card">
              <span class="kpi-label">TER medio ponderado</span>
              <div class="kpi-val">
                {{ d.comisiones.terPonderado !== null ? fmt.pct(d.comisiones.terPonderado, 2) : '—' }}
              </div>
              <span class="kpi-sub valor-privado">Sobre {{ fmt.eur(d.comisiones.base, 0) }} con TER conocido</span>
            </article>

            <article class="kpi-card">
              <span class="kpi-label">Impacto estimado en 10 años</span>
              <div class="kpi-val valor-privado">{{ fmt.eur(d.comisiones.anual * 10, 0) }}</div>
              <span class="kpi-sub">Con el patrimonio actual sin contar interés compuesto</span>
            </article>

            <article class="kpi-card">
              <span class="kpi-label">Comisiones directas pagadas</span>
              <div class="kpi-val valor-privado">{{ fmt.eur(d.comisiones.compraventaPagada, 2) }}</div>
              <span class="kpi-sub">Brokers, compraventa y custodia anotadas</span>
            </article>
          </div>

          <div class="tabla-scroll" style="margin-top: 1.25rem">
            <table class="tabla-datos">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th class="num">Valor actual</th>
                  <th class="num">TER anual</th>
                  <th class="num">Coste anual</th>
                  <th class="num">En 10 años</th>
                </tr>
              </thead>
              <tbody>
                @for (l of d.comisiones.lineas; track l.id) {
                  <tr>
                    <td>
                      <span class="dot" [style.background]="l.color[0]"></span>
                      {{ l.nombre }}
                    </td>
                    <td class="num mono valor-privado">{{ fmt.eur(l.valor, 2) }}</td>
                    <td class="num mono">{{ fmt.pct(l.ter, 2) }}</td>
                    <td class="num mono valor-privado">{{ fmt.eur(l.anual, 2) }}/año</td>
                    <td class="num mono valor-privado">{{ fmt.eur(l.anual * 10, 0) }}</td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="5" class="vacio-celda">Ningún producto tiene TER configurado aún.</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>
      }
    }
  `,
})
export class RendimientoTabComponent {
  readonly store = inject(PortfolioStoreService);
  readonly fmt = inject(FormatService);
  private readonly chart = inject(ChartService);

  readonly mostrarRiesgo = signal<boolean>(false);

  readonly referenciaActiva = computed<ReferenciaIndexado | null>(() => {
    const refs = this.store.datos()?.comparacion?.referencias || [];
    if (!refs.length) return null;
    const id = this.store.compRef();
    return refs.find((r) => r.id === id) || refs[0];
  });

  readonly renderBarrasAnualesFn = computed<ChartRenderFn>(() => {
    const d = this.store.datos();
    const tema = this.store.tema();
    void tema;
    return (el: HTMLElement) => {
      const ra = d?.rentabilidadAnual;
      if (!ra || !ra.anos.length) return;
      const etiquetas = ra.anos.map((a, i) =>
        ra.parcial[i] ? `${a} (YTD)` : a
      );
      this.chart.barrasSimples(el, {
        etiquetas,
        valores: ra.cartera.map((v) => v || 0),
        esPorcentaje: true,
        altura: 240,
      });
    };
  });

  readonly renderComparacionIndexadoFn = computed<ChartRenderFn>(() => {
    const d = this.store.datos();
    const ref = this.referenciaActiva();
    const tema = this.store.tema();
    void tema;
    return (el: HTMLElement) => {
      const comp = d?.comparacion;
      if (!d || !comp || !ref) return;
      let ini = d.fechas.findIndex((f) => f >= comp.desde);
      if (ini < 0) ini = 0;
      const fechas = d.fechas.slice(ini);
      this.chart.multiLinea(el, {
        fechas,
        lineas: [
          {
            nombre: 'Tu cartera',
            valores: comp.tuya.slice(ini),
            color: '#10b981',
            principal: true,
          },
          {
            nombre: `Todo en ${ref.nombre}`,
            valores: ref.serie.slice(ini),
            color: '#38bdf8',
          },
          {
            nombre: 'Dinero invertido',
            valores: comp.aportado.slice(ini),
            color: '#94a3b8',
            punteada: true,
          },
        ],
        formatoY: (v) => this.fmt.eurCompacto(v),
        formatoTooltip: (v) => this.fmt.eur(v, 0),
        altura: 300,
      });
    };
  });

  readonly renderComparadorBase100Fn = computed<ChartRenderFn>(() => {
    const d = this.store.datos();
    const tema = this.store.tema();
    void tema;
    return (el: HTMLElement) => {
      if (!d || !d.comparador?.length) return;
      const primero = d.comparador[0];
      let ini = d.fechas.findIndex((f) => f >= primero.metricas.desde);
      if (ini < 0) ini = 0;
      const fechas = d.fechas.slice(ini);
      const lineas = d.comparador.map((c, idx) => ({
        nombre: c.nombre,
        valores: c.indice.slice(ini),
        color: c.real ? '#10b981' : this.fmt.colorDeSlot(idx + 1)[0],
        principal: c.real,
      }));
      this.chart.multiLinea(el, {
        fechas,
        lineas,
        formatoY: (v) => `${v.toFixed(0)}`,
        formatoTooltip: (v) => `${this.fmt.num(v, 1)} pts`,
        altura: 260,
      });
    };
  });
}
