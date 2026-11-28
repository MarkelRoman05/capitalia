import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { PortfolioStoreService } from '../../services/portfolio-store.service';
import { FormatService } from '../../services/format.service';
import { ChartRenderFn, ChartService } from '../../services/chart.service';
import { SvgChartComponent } from '../svg-chart/svg-chart.component';
import { IconComponent } from '../icon/icon.component';
import { ResumenFiscalAnual } from '../../models/portfolio.model';

@Component({
  selector: 'cap-fiscalidad-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SvgChartComponent, IconComponent],
  template: `
    @if (store.datos(); as d) {
      <section class="panel-card bloque-seccion">
        <div class="fis-subnav">
          <div>
            <span class="hero-kicker">Planificación y Rentas</span>
            <h2 class="card-title">Fiscalidad IRPF y Dividendos</h2>
          </div>

          <div class="seg-group" role="tablist" aria-label="Vista fiscal">
            <button
              type="button"
              role="tab"
              class="seg-btn"
              [class.on]="subVista() === 'irpf'"
              [attr.aria-selected]="subVista() === 'irpf'"
              (click)="subVista.set('irpf')"
            >
              Fiscalidad IRPF
            </button>
            <button
              type="button"
              role="tab"
              class="seg-btn"
              [class.on]="subVista() === 'dividendos'"
              [attr.aria-selected]="subVista() === 'dividendos'"
              (click)="subVista.set('dividendos')"
            >
              Dividendos y Rentas
            </button>
          </div>
        </div>
      </section>

      @if (subVista() === 'irpf') {
        @if (d.fiscalidad; as fis) {
          <section class="panel-card bloque-seccion">
            <div class="card-header">
              <div>
                <h3 class="card-title">Resumen fiscal por ejercicio (IRPF Base del Ahorro)</h3>
                <p class="card-sub">
                  Cálculo FIFO sobre ventas realizadas, compensación de pérdidas con dividendos (hasta 25 %) e impacto fiscal latente.
                </p>
              </div>

              @if (fis.porAnio?.length) {
                <div class="seg-group" role="group" aria-label="Seleccionar ejercicio fiscal">
                  @for (r of fis.porAnio; track r.anio) {
                    <button
                      type="button"
                      class="seg-btn"
                      [class.on]="resumenAnioActivo()?.anio === r.anio"
                      (click)="anioSeleccionado.set(r.anio)"
                    >
                      {{ r.anio }}
                    </button>
                  }
                </div>
              }
            </div>

            @if (resumenAnioActivo(); as res) {
              <div class="kpis-grid kpis-4">
                <article class="kpi-card">
                  <span class="kpi-label">Saldo ganancias / pérdidas</span>
                  <div
                    class="kpi-val valor-privado"
                    [class.pos]="fmt.claseSigno(res.saldoGananciasPerdidas) === 'pos'"
                    [class.neg]="fmt.claseSigno(res.saldoGananciasPerdidas) === 'neg'"
                  >
                    {{ fmt.eurSigno(res.saldoGananciasPerdidas, 2) }}
                  </div>
                  <span class="kpi-sub valor-privado">
                    +{{ fmt.eur(res.ganancias, 0) }} ganancias · -{{ fmt.eur(res.perdidas, 0) }} pérdidas
                  </span>
                </article>

                <article class="kpi-card">
                  <span class="kpi-label">Dividendos brutos</span>
                  <div class="kpi-val valor-privado">{{ fmt.eur(res.dividendosBrutos, 2) }}</div>
                  <span class="kpi-sub valor-privado">
                    Retenciones: {{ fmt.eur(res.retenciones, 2) }}
                    @if (res.compensacionAplicada > 0) {
                      · Compensado {{ fmt.eur(res.compensacionAplicada, 0) }}
                    }
                  </span>
                </article>

                <article class="kpi-card">
                  <span class="kpi-label">Impuesto estimado IRPF</span>
                  <div class="kpi-val valor-privado">{{ fmt.eur(res.impuestoEstimado, 2) }}</div>
                  <span class="kpi-sub valor-privado">
                    Base ahorro: {{ fmt.eur(res.baseAhorroNeta, 0) }} · Dif.:
                    <strong
                      [class.pos]="res.cuotaDiferencial < 0"
                      [class.neg]="res.cuotaDiferencial > 0"
                    >
                      {{ fmt.eurSigno(res.cuotaDiferencial, 2) }}
                    </strong>
                  </span>
                </article>

                <article class="kpi-card">
                  <span class="kpi-label">Patrimonio neto tras impuestos latentes</span>
                  <div class="kpi-val valor-privado">
                    {{ fmt.eur(fis.plusvaliaLatente.patrimonioNetoFiscal, 0) }}
                  </div>
                  <span class="kpi-sub valor-privado">
                    Latente: {{ fmt.eurSigno(fis.plusvaliaLatente.bruta, 0) }} · IRPF si liquidas:
                    {{ fmt.eur(fis.plusvaliaLatente.impuestoSiLiquidaHoy, 0) }}
                  </span>
                </article>
              </div>

              <div class="tabla-scroll" style="margin-top: 1.25rem">
                <table class="tabla-datos">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Producto</th>
                      <th class="num">Días tenencia</th>
                      <th class="num">Importe venta</th>
                      <th class="num">Coste FIFO</th>
                      <th class="num">Plusvalía</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (op of res.operaciones; track $index) {
                      <tr>
                        <td class="mono">{{ fmt.fechaCorta(op.fecha) }}</td>
                        <td>
                          <strong>{{ op.productoNombre }}</strong>
                          <small class="muted" style="display: block; font-size: 0.72rem">
                            {{ fmt.num(op.unidades, 4) }} títulos
                            @if (op.fechaAdquisicionMin) {
                              · desde {{ fmt.fechaCorta(op.fechaAdquisicionMin) }}
                            }
                          </small>
                        </td>
                        <td class="num mono">
                          {{ op.diasTenencia !== null ? fmt.entero(op.diasTenencia) + ' d' : '—' }}
                        </td>
                        <td class="num mono valor-privado">{{ fmt.eur(op.importeVenta, 2) }}</td>
                        <td class="num mono valor-privado">{{ fmt.eur(op.costeFifo, 2) }}</td>
                        <td
                          class="num mono valor-privado"
                          [class.pos]="fmt.claseSigno(op.plusvalia) === 'pos'"
                          [class.neg]="fmt.claseSigno(op.plusvalia) === 'neg'"
                        >
                          <strong>{{ fmt.eurSigno(op.plusvalia, 2) }}</strong>
                        </td>
                      </tr>
                    } @empty {
                      <tr>
                        <td colspan="6" class="vacio-celda">
                          No hay ventas con impacto fiscal registradas en {{ res.anio }}.
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            } @else {
              <p class="vacio-celda">
                Aún no hay operaciones fiscales (ventas o dividendos) registradas.
              </p>
              <div class="kpis-grid" style="margin-top: 1rem">
                <article class="kpi-card">
                  <span class="kpi-label">Patrimonio neto tras impuestos latentes</span>
                  <div class="kpi-val valor-privado">
                    {{ fmt.eur(fis.plusvaliaLatente.patrimonioNetoFiscal, 0) }}
                  </div>
                  <span class="kpi-sub valor-privado">
                    Plusvalía latente: {{ fmt.eurSigno(fis.plusvaliaLatente.bruta, 0) }} · IRPF estimado si liquidas hoy:
                    {{ fmt.eur(fis.plusvaliaLatente.impuestoSiLiquidaHoy, 0) }}
                  </span>
                </article>
              </div>
            }

            <p class="fis-nota-legal">
              Estimación orientativa según los tramos de la Base del Ahorro del IRPF en España (19 %, 21 %, 23 %, 27 % y 30 %). Los traspasos entre fondos inscritos se procesan como operaciones fiscalmente neutras heredando el coste y la fecha FIFO de origen. No sustituye el borrador oficial ni asesoramiento fiscal profesional.
            </p>
          </section>

          <section class="panel-card bloque-seccion">
            <div class="card-header">
              <div>
                <h3 class="card-title">Oportunidades de Tax-Loss Harvesting</h3>
                <p class="card-sub">
                  Posiciones con minusvalías latentes superiores a 50 € susceptibles de compensar ganancias o hasta el 25 % de rendimientos del capital mobiliario.
                </p>
              </div>
            </div>

            <div class="xray-alerta" style="margin-bottom: 1rem" role="note">
              <cap-icon name="alert" [size]="15" />
              <span>
                <strong>Regla antiaplicación de los 2 meses (LIRPF):</strong> si vendes un activo con pérdidas para aflorar la minusvalía fiscal, no podrás volver a adquirir el mismo activo ni valores homogéneos durante los 2 meses anteriores o posteriores a la venta.
              </span>
            </div>

            @if (fis.taxLossHarvesting?.length) {
              <div class="fis-tlh-grid">
                @for (item of fis.taxLossHarvesting; track item.id) {
                  <article class="fis-tlh-card">
                    <div class="fis-tlh-cab">
                      <strong>{{ item.nombre }}</strong>
                      <span class="mono neg valor-privado">
                        -{{ fmt.eur(item.minusvaliaLatente, 0) }}
                      </span>
                    </div>
                    <div class="fis-tlh-datos">
                      <span class="valor-privado">Valor: {{ fmt.eur(item.valor, 0) }}</span>
                      <span class="valor-privado">Aportado: {{ fmt.eur(item.aportado, 0) }}</span>
                    </div>
                    <div class="fis-tlh-datos">
                      <span>Ahorro fiscal est. (19 %):</span>
                      <strong class="mono pos valor-privado">
                        ~{{ fmt.eur(item.ahorroFiscalEstimado, 0) }}
                      </strong>
                    </div>
                  </article>
                }
              </div>
            } @else {
              <p class="vacio-celda">
                No tienes posiciones con minusvalías latentes relevantes en este momento.
              </p>
            }
          </section>
        } @else {
          <section class="panel-card vacio-bloque">
            <h3>Datos fiscales no disponibles</h3>
            <p>Actualiza la valoración o guarda un movimiento para recalcular el informe fiscal FIFO.</p>
          </section>
        }
      }

      @if (subVista() === 'dividendos') {
        @if (d.dividendos; as div) {
          @if (div.ingresosPasivos; as pas) {
            @if (pas.anualTotal > 0 && (pas.interesesRentaFija > 0 || pas.alquileresAnuales > 0)) {
              <section class="panel-card bloque-seccion">
                <div class="card-header">
                  <div>
                    <h3 class="card-title">Ingresos pasivos consolidados (estimación anual)</h3>
                    <p class="card-sub">
                      Suma de dividendos (últimos 12m), intereses de renta fija/cuentas remuneradas y alquileres brutos.
                    </p>
                  </div>
                </div>

                <div class="kpis-grid kpis-4">
                  <article class="kpi-card">
                    <span class="kpi-label">Total ingresos pasivos / año</span>
                    <div class="kpi-val pos valor-privado">{{ fmt.eur(pas.anualTotal, 0) }}/año</div>
                    <span class="kpi-sub valor-privado">
                      Media: {{ fmt.eur(pas.mediaMensual, 0) }}/mes
                    </span>
                  </article>
                  <article class="kpi-card">
                    <span class="kpi-label">Dividendos (12m)</span>
                    <div class="kpi-val valor-privado">{{ fmt.eur(pas.dividendos12m, 0) }}</div>
                    <span class="kpi-sub">Acciones y ETFs de distribución</span>
                  </article>
                  <article class="kpi-card">
                    <span class="kpi-label">Intereses renta fija / cuentas</span>
                    <div class="kpi-val valor-privado">{{ fmt.eur(pas.interesesRentaFija, 0) }}</div>
                    <span class="kpi-sub">Bonos, depósitos y cuentas con TAE</span>
                  </article>
                  <article class="kpi-card">
                    <span class="kpi-label">Alquileres brutos</span>
                    <div class="kpi-val valor-privado">{{ fmt.eur(pas.alquileresAnuales, 0) }}</div>
                    <span class="kpi-sub">Inmuebles en arrendamiento</span>
                  </article>
                </div>
              </section>
            }
          }

          <section class="panel-card bloque-seccion">
            <div class="kpis-grid kpis-4">
              <article class="kpi-card">
                <span class="kpi-label">Últimos 12 meses (bruto)</span>
                <div class="kpi-val valor-privado">{{ fmt.eur(div.ultimos12Meses, 2) }}</div>
                <span class="kpi-sub valor-privado">
                  Año en curso: {{ fmt.eur(div.anioActual, 2) }}
                </span>
              </article>

              <article class="kpi-card">
                <span class="kpi-label">Media mensual (12m)</span>
                <div class="kpi-val valor-privado">{{ fmt.eur(div.mediaMensual12m, 2) }}/mes</div>
                <span class="kpi-sub valor-privado">
                  Histórico neto: {{ fmt.eur(div.totalNetoHistorico, 2) }}
                </span>
              </article>

              <article class="kpi-card">
                <span class="kpi-label">Dividend Yield</span>
                <div class="kpi-val">{{ fmt.pct(div.yieldCartera, 2) }}</div>
                <span class="kpi-sub">Sobre valor actual de la cartera</span>
              </article>

              <article class="kpi-card">
                <span class="kpi-label">Yield on Cost</span>
                <div class="kpi-val pos">{{ fmt.pct(div.yieldOnCost, 2) }}</div>
                <span class="kpi-sub">Sobre el capital neto aportado</span>
              </article>
            </div>
          </section>

          <div class="fis-graficos-grid bloque-seccion">
            <section class="panel-card">
              <div class="card-header">
                <div>
                  <h3 class="card-title">Dividendos mensuales (últimos 24 meses)</h3>
                  <p class="card-sub">Ingresos brutos mes a mes</p>
                </div>
              </div>
              @if (div.porMes?.length) {
                <cap-svg-chart
                  [renderFn]="renderDividendosMensualesFn()"
                  [minHeight]="240"
                  ariaLabel="Gráfico de barras de dividendos brutos mensuales en los últimos 24 meses"
                />
              } @else {
                <p class="vacio-celda">Aún no hay dividendos registrados para graficar.</p>
              }
            </section>

            <section class="panel-card">
              <div class="card-header">
                <div>
                  <h3 class="card-title">Dividendos por año</h3>
                  <p class="card-sub">Evolución anual acumulada (bruto)</p>
                </div>
              </div>
              @if (div.porAnio?.length) {
                <cap-svg-chart
                  [renderFn]="renderDividendosAnualesFn()"
                  [minHeight]="240"
                  ariaLabel="Gráfico de barras de dividendos brutos anuales"
                />
              } @else {
                <p class="vacio-celda">Aún no hay historial anual de dividendos.</p>
              }
            </section>
          </div>

          @if (div.proximosCobros?.length) {
            <section class="panel-card bloque-seccion">
              <div class="card-header">
                <div>
                  <h3 class="card-title">Calendario estimado de próximos cobros (12 meses)</h3>
                  <p class="card-sub">
                    Previsión combinada de dividendos recurrentes, cupones/vencimientos de renta fija y alquileres.
                  </p>
                </div>
              </div>

              @if (div.proximosCobrosPorMes?.length) {
                <div style="margin-bottom: 1.25rem">
                  <cap-svg-chart
                    [renderFn]="renderProximosCobrosMesFn()"
                    [minHeight]="220"
                    ariaLabel="Gráfico de barras de cobros pasivos estimados para los próximos 12 meses"
                  />
                </div>
              }

              <div class="tabla-scroll">
                <table class="tabla-datos">
                  <thead>
                    <tr>
                      <th>Fecha est.</th>
                      <th>Producto / Activo</th>
                      <th>Tipo</th>
                      <th>Detalle</th>
                      <th class="num">Importe est.</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (c of div.proximosCobros.slice(0, 24); track $index) {
                      <tr>
                        <td class="mono">{{ fmt.fechaCorta(c.fecha) }}</td>
                        <td><strong>{{ c.productoNombre }}</strong></td>
                        <td>
                          <span
                            class="tag"
                            [class.cobro-badge-div]="c.tipo === 'dividendo'"
                            [class.cobro-badge-rf]="c.tipo === 'cupon' || c.tipo === 'vencimiento'"
                            [class.cobro-badge-alq]="c.tipo === 'alquiler'"
                          >
                            {{ etiquetaTipoCobro(c.tipo) }}
                          </span>
                        </td>
                        <td class="muted">{{ c.nota || (c.confianza === 'contractual' ? 'Contractual' : 'Estimado') }}</td>
                        <td class="num mono pos valor-privado">
                          <strong>+{{ fmt.eur(c.importeEstimado, 2) }}</strong>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </section>
          }

          <section class="panel-card bloque-seccion">
            <div class="card-header">
              <div>
                <h3 class="card-title">Desglose de dividendos por producto</h3>
                <p class="card-sub">
                  Total histórico bruto:
                  <strong class="valor-privado">{{ fmt.eur(div.totalHistorico, 2) }}</strong>
                  · Neto tras retenciones:
                  <strong class="valor-privado">{{ fmt.eur(div.totalNetoHistorico, 2) }}</strong>
                </p>
              </div>
            </div>

            <div class="tabla-scroll">
              <table class="tabla-datos">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th class="num">Bruto</th>
                    <th class="num">Retención</th>
                    <th class="num">Neto</th>
                    <th class="num">Yield</th>
                    <th class="num">Yield on Cost</th>
                  </tr>
                </thead>
                <tbody>
                  @for (p of div.porProducto; track p.id) {
                    <tr>
                      <td>
                        <div class="celda-prod-nombre">
                          <span class="dot" [style.background]="p.color || '#10b981'"></span>
                          <span>{{ p.nombre }}</span>
                        </div>
                      </td>
                      <td class="num mono valor-privado">{{ fmt.eur(p.bruto, 2) }}</td>
                      <td class="num mono muted valor-privado">
                        {{ fmt.eur(Math.max(0, p.bruto - p.neto), 2) }}
                      </td>
                      <td class="num mono pos valor-privado">
                        <strong>{{ fmt.eur(p.neto, 2) }}</strong>
                      </td>
                      <td class="num mono">
                        {{ p.yieldActual !== null ? fmt.pct(p.yieldActual, 2) : '—' }}
                      </td>
                      <td class="num mono">
                        {{ p.yieldOnCost !== null ? fmt.pct(p.yieldOnCost, 2) : '—' }}
                      </td>
                    </tr>
                  } @empty {
                    <tr>
                      <td colspan="6" class="vacio-celda">
                        No has registrado ningún dividendo todavía.
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </section>
        } @else {
          <section class="panel-card vacio-bloque">
            <h3>Resumen de dividendos no disponible</h3>
            <p>Actualiza la valoración de la cartera para generar el informe de dividendos.</p>
          </section>
        }
      }
    }
  `,
})
export class FiscalidadTabComponent {
  readonly store = inject(PortfolioStoreService);
  readonly fmt = inject(FormatService);
  private readonly chart = inject(ChartService);
  protected readonly Math = Math;

  readonly subVista = signal<'irpf' | 'dividendos'>('irpf');
  readonly anioSeleccionado = signal<string>('');

  readonly resumenAnioActivo = computed<ResumenFiscalAnual | null>(() => {
    const lista = this.store.datos()?.fiscalidad?.porAnio || [];
    if (!lista.length) return null;
    const sel = this.anioSeleccionado();
    return lista.find((r) => r.anio === sel) || lista[0];
  });

  readonly renderDividendosMensualesFn = computed<ChartRenderFn>(() => {
    const div = this.store.datos()?.dividendos;
    const tema = this.store.tema();
    void tema;
    return (el: HTMLElement) => {
      const lista = div?.porMes || [];
      if (!lista.length) return;
      const etiquetas = lista.map((m, i) =>
        lista.length > 12 && i % 3 !== 0 && i !== lista.length - 1
          ? ''
          : this.fmt.mesCorto(m.mes)
      );
      this.chart.barrasSimples(el, {
        etiquetas,
        valores: lista.map((m) => m.bruto),
        esPorcentaje: false,
        color: '#10b981',
        formatoValor: (v) => (v > 0 ? this.fmt.eur(v, 0) : ''),
        altura: 240,
      });
    };
  });

  readonly renderDividendosAnualesFn = computed<ChartRenderFn>(() => {
    const div = this.store.datos()?.dividendos;
    const tema = this.store.tema();
    void tema;
    return (el: HTMLElement) => {
      const lista = div?.porAnio || [];
      if (!lista.length) return;
      this.chart.barrasSimples(el, {
        etiquetas: lista.map((a) => a.anio),
        valores: lista.map((a) => a.bruto),
        esPorcentaje: false,
        color: '#10b981',
        formatoValor: (v) => this.fmt.eur(v, 2),
        altura: 240,
      });
    };
  });

  readonly renderProximosCobrosMesFn = computed<ChartRenderFn>(() => {
    const div = this.store.datos()?.dividendos;
    const tema = this.store.tema();
    void tema;
    return (el: HTMLElement) => {
      const lista = div?.proximosCobrosPorMes || [];
      if (!lista.length) return;
      this.chart.barrasSimples(el, {
        etiquetas: lista.map((m) => this.fmt.mesCorto(m.mes)),
        valores: lista.map((m) => m.total),
        esPorcentaje: false,
        color: '#38bdf8',
        formatoValor: (v) => (v > 0 ? this.fmt.eur(v, 0) : ''),
        altura: 220,
      });
    };
  });

  etiquetaTipoCobro(tipo: string): string {
    const mapa: Record<string, string> = {
      dividendo: 'Dividendo',
      cupon: 'Cupón / Interés',
      vencimiento: 'Vencimiento',
      alquiler: 'Alquiler',
    };
    return mapa[tipo] || tipo;
  }
}
