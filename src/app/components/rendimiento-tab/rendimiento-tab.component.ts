import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { PortfolioStoreService } from '../../services/portfolio-store.service';
import { FormatService } from '../../services/format.service';
import { ChartRenderFn, ChartService } from '../../services/chart.service';
import { SvgChartComponent } from '../svg-chart/svg-chart.component';
import { IconComponent } from '../icon/icon.component';
import { CapTooltipDirective } from '../../directives/tooltip.directive';
import {
  ComparadorCartera,
  LineaComision,
  ReferenciaIndexado,
} from '../../models/portfolio.model';
import { colorFondoHeatmap } from '../../services/portfolio-metrics.util';

const MESES_HEATMAP = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

@Component({
  selector: 'cap-rendimiento-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet, SvgChartComponent, IconComponent, CapTooltipDirective],
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
                    <td
                      class="num mono"
                      [class.pos]="fmt.claseSigno(val) === 'pos'"
                      [class.neg]="fmt.claseSigno(val) === 'neg'"
                    >
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
                        <td
                          class="num mono"
                          [class.pos]="fmt.claseSigno(val) === 'pos'"
                          [class.neg]="fmt.claseSigno(val) === 'neg'"
                        >
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

      <!-- 1B. MAPA DE CALOR MENSUAL (HEATMAP TWR) -->
      @if (d.heatmapMensual?.length) {
        <section class="panel-card bloque-seccion">
          <div class="card-header">
            <div>
              <h2 class="card-title">Mapa de calor mensual (TWR)</h2>
              <p class="card-sub">
                Rentabilidad mensual ponderada por el tiempo año a año, aislando entradas y salidas de dinero.
              </p>
            </div>
          </div>

          <div class="tabla-scroll">
            <table class="tabla-datos heatmap-tabla">
              <thead>
                <tr>
                  <th>Año</th>
                  @for (mesNom of mesesHeatmap; track mesNom) {
                    <th>{{ mesNom }}</th>
                  }
                  <th class="heatmap-total">Total</th>
                </tr>
              </thead>
              <tbody>
                @for (fila of d.heatmapMensual; track fila.ano) {
                  <tr>
                    <td class="mono">{{ fila.ano }}</td>
                    @for (val of fila.meses; track $index) {
                      <td
                        class="mono heatmap-celda"
                        [style.background]="colorCeldaHeatmap(val)"
                        [class.pos]="fmt.claseSigno(val) === 'pos'"
                        [class.neg]="fmt.claseSigno(val) === 'neg'"
                      >
                        {{ val !== null && val !== undefined ? fmt.pctSigno(val, 1) : '—' }}
                      </td>
                    }
                    <td
                      class="mono heatmap-celda heatmap-total"
                      [style.background]="colorCeldaHeatmap(fila.total)"
                      [class.pos]="fmt.claseSigno(fila.total) === 'pos'"
                      [class.neg]="fmt.claseSigno(fila.total) === 'neg'"
                    >
                      {{ fila.total !== null && fila.total !== undefined ? fmt.pctSigno(fila.total, 1) : '—' }}
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>
      }

      <!-- 2. COMPARATIVA CONTRA UN INDEXADO -->
      @if (d.comparacion && d.comparacion.referencias.length) {
        <section class="panel-card bloque-seccion">
          <div class="card-header">
            <div>
              <h2 class="card-title">¿Y si hubieras metido exactamente las mismas aportaciones en un indexado?</h2>
              <p class="card-sub">
                Simulamos qué valor tendrías hoy si cada euro invertido (en las mismas fechas) hubiese ido íntegro a una referencia pasiva desde {{ fmt.fechaCorta(d.comparacion.desde) }}.
              </p>
              <span class="tag tag-tr">Referencia Total Return (dividendos reinvertidos)</span>
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
                  <strong
                    [class.pos]="fmt.claseSigno(d.comparacion.tuTir) === 'pos'"
                    [class.neg]="fmt.claseSigno(d.comparacion.tuTir) === 'neg'"
                  >
                    {{ d.comparacion.tuTir !== null ? fmt.pctSigno(d.comparacion.tuTir, 2) : '—' }}
                  </strong>
                </span>
              </div>

              <div class="comp-card">
                <span class="kpi-label">Todo en {{ ref.nombre }}</span>
                <div class="kpi-val valor-privado">{{ fmt.eur(ref.valor, 0) }}</div>
                <span class="kpi-sub">
                  {{ ref.detalle }} · TIR:
                  <strong
                    [class.pos]="fmt.claseSigno(ref.tir) === 'pos'"
                    [class.neg]="fmt.claseSigno(ref.tir) === 'neg'"
                  >
                    {{ ref.tir !== null ? fmt.pctSigno(ref.tir, 2) : '—' }}
                  </strong>
                </span>
              </div>

              <div class="comp-card">
                <span class="kpi-label">Diferencia a tu favor</span>
                <div
                  class="kpi-val valor-privado"
                  [class.pos]="fmt.claseSigno(d.comparacion.tuValor - ref.valor) === 'pos'"
                  [class.neg]="fmt.claseSigno(d.comparacion.tuValor - ref.valor) === 'neg'"
                >
                  {{ fmt.eurSigno(d.comparacion.tuValor - ref.valor, 0) }}
                </div>
                <span class="kpi-sub">
                  @if (d.comparacion.tuTir !== null && ref.tir !== null) {
                    Diferencial anual:
                    <strong
                      [class.pos]="fmt.claseSigno(d.comparacion.tuTir - ref.tir) === 'pos'"
                      [class.neg]="fmt.claseSigno(d.comparacion.tuTir - ref.tir) === 'neg'"
                    >
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
                [attr.aria-expanded]="mostrarRiesgo()"
                (click)="mostrarRiesgo.set(!mostrarRiesgo())"
              >
                <cap-icon [name]="mostrarRiesgo() ? 'chevron-down' : 'chevron-right'" [size]="14" />
                <span>{{
                  mostrarRiesgo()
                    ? 'Ocultar métricas avanzadas de riesgo (Volatilidad, Sharpe, Base 100)'
                    : 'Ver métricas avanzadas de riesgo (Volatilidad, Sharpe, Base 100)'
                }}</span>
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
                          <th class="num">Sharpe</th>
                          <th class="num">Sortino</th>
                          <th class="num">Beta</th>
                          <th class="num">Alfa</th>
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
                            <td
                              class="num mono"
                              [class.pos]="fmt.claseSigno(c.metricas.rentTotal) === 'pos'"
                              [class.neg]="fmt.claseSigno(c.metricas.rentTotal) === 'neg'"
                            >
                              {{ fmt.pctSigno(c.metricas.rentTotal, 2) }}
                            </td>
                            <td
                              class="num mono"
                              [class.pos]="fmt.claseSigno(c.metricas.cagr) === 'pos'"
                              [class.neg]="fmt.claseSigno(c.metricas.cagr) === 'neg'"
                            >
                              {{ c.metricas.cagr !== null ? fmt.pctSigno(c.metricas.cagr, 2) : '—' }}
                            </td>
                            <td class="num mono">
                              {{ c.metricas.vol !== null ? fmt.pct(c.metricas.vol, 2) : '—' }}
                            </td>
                            <td class="num mono">
                              {{ c.metricas.sharpe !== null ? fmt.num(c.metricas.sharpe, 2) : '—' }}
                            </td>
                            <td class="num mono">
                              {{ c.metricas.sortino !== null && c.metricas.sortino !== undefined ? fmt.num(c.metricas.sortino, 2) : '—' }}
                            </td>
                            <td class="num mono">
                              {{ c.metricas.beta !== null && c.metricas.beta !== undefined ? fmt.num(c.metricas.beta, 2) : '—' }}
                            </td>
                            <td
                              class="num mono"
                              [class.pos]="fmt.claseSigno(c.metricas.alfa) === 'pos'"
                              [class.neg]="fmt.claseSigno(c.metricas.alfa) === 'neg'"
                            >
                              {{ c.metricas.alfa !== null && c.metricas.alfa !== undefined ? fmt.pctSigno(c.metricas.alfa, 2) : '—' }}
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

      <!-- 2B. CURVA DE DRAWDOWN (UNDERWATER) -->
      @if (d.serieDrawdown?.length) {
        <section class="panel-card bloque-seccion">
          <div class="card-header">
            <div>
              <h2 class="card-title">Curva de caídas (Drawdown Underwater)</h2>
              <p class="card-sub">
                Distancia diaria respecto al máximo histórico sobre la rentabilidad real (TWR), sin distorsión de aportaciones.
              </p>
            </div>
          </div>

          <div class="riesgo-resumen-grid">
            <div class="riesgo-kpi-box">
              <span>Mayor caída (Max DD)</span>
              <strong class="mono neg">{{ fmt.pct(d.total.caidaMaxima, 2) }}</strong>
              <small class="salud-sub">
                {{ d.total.caidaMaximaFecha ? 'Mínimo el ' + fmt.fechaCorta(d.total.caidaMaximaFecha) : 'Sin caídas registradas' }}
              </small>
            </div>
            @if (carteraRealComparador()?.metricas?.maxDiasRecuperacion !== null && carteraRealComparador()?.metricas?.maxDiasRecuperacion !== undefined) {
              <div class="riesgo-kpi-box">
                <span>Máx. días de recuperación</span>
                <strong class="mono">
                  {{ fmt.entero(carteraRealComparador()!.metricas.maxDiasRecuperacion) }} días
                </strong>
                <small class="salud-sub">Periodo bajo máximo histórico</small>
              </div>
            }
          </div>

          <cap-svg-chart
            [renderFn]="renderDrawdownFn()"
            [minHeight]="230"
            ariaLabel="Curva de caídas drawdown underwater de la cartera"
          />
        </section>
      }

      <!-- 2C. MÉTRICAS DE RIESGO VISIBLES, DISPERSIÓN Y ESTRÉS -->
      @if (carteraRealComparador() || d.dispersionActivos?.length || d.estres?.length) {
        <section class="panel-card bloque-seccion">
          <div class="card-header">
            <div>
              <h2 class="card-title">Riesgo, eficiencia y test de estrés</h2>
              <p class="card-sub">
                Indicadores cuantitativos frente a mercado (MSCI World) y simulación histórica por clase de activo.
              </p>
            </div>
          </div>

          @if (carteraRealComparador(); as realComp) {
            @let met = realComp.metricas;
            <div class="riesgo-resumen-grid">
              <div class="riesgo-kpi-box">
                <span>Volatilidad anual</span>
                <strong class="mono">{{ met.vol !== null ? fmt.pct(met.vol, 2) : '—' }}</strong>
              </div>
              <div class="riesgo-kpi-box" [capTooltip]="tooltipRf(met.rfUsado)">
                <span>Ratio Sharpe</span>
                <strong class="mono">{{ met.sharpe !== null ? fmt.num(met.sharpe, 2) : '—' }}</strong>
              </div>
              <div class="riesgo-kpi-box" [capTooltip]="tooltipRf(met.rfUsado)">
                <span>Ratio Sortino</span>
                <strong class="mono">
                  {{ met.sortino !== null && met.sortino !== undefined ? fmt.num(met.sortino, 2) : '—' }}
                </strong>
              </div>
              <div class="riesgo-kpi-box">
                <span>Beta (vs MSCI World)</span>
                <strong class="mono">
                  {{ met.beta !== null && met.beta !== undefined ? fmt.num(met.beta, 2) : '—' }}
                </strong>
              </div>
              <div class="riesgo-kpi-box" [capTooltip]="tooltipRf(met.rfUsado)">
                <span>Alfa de Jensen</span>
                <strong
                  class="mono"
                  [class.pos]="fmt.claseSigno(met.alfa) === 'pos'"
                  [class.neg]="fmt.claseSigno(met.alfa) === 'neg'"
                >
                  {{ met.alfa !== null && met.alfa !== undefined ? fmt.pctSigno(met.alfa, 2) : '—' }}
                </strong>
              </div>
            </div>
          }

          @if (d.dispersionActivos?.length) {
            <div style="margin-top: 1.15rem">
              <h3 class="sub-bloque-titulo">Dispersión Riesgo (Volatilidad) vs. Rentabilidad (CAGR) por activo</h3>
              <cap-svg-chart
                [renderFn]="renderScatterRiesgoFn()"
                [minHeight]="300"
                ariaLabel="Gráfico de dispersión entre volatilidad y rentabilidad anualizada por activo"
              />
            </div>
          }

          @if (d.estres?.length) {
            <div style="margin-top: 1.35rem">
              <h3 class="sub-bloque-titulo">Test de estrés histórico (estimación orientativa sobre tu cartera actual)</h3>
              <div class="estres-grid">
                @for (e of d.estres; track e.id) {
                  <article class="estres-card">
                    <div class="estres-cab">
                      <strong>{{ e.nombre }}</strong>
                      <span class="mono neg">{{ fmt.pctSigno(e.caidaPct, 1) }}</span>
                    </div>
                    <p class="estres-desc">{{ e.descripcion }}</p>
                    <div class="estres-pie">
                      <span>
                        Impacto:
                        <strong class="mono neg valor-privado">{{ fmt.eurSigno(e.impactoEur, 0) }}</strong>
                      </span>
                      <span>
                        Resultante:
                        <strong class="mono valor-privado">{{ fmt.eur(e.patrimonioResultante, 0) }}</strong>
                      </span>
                    </div>
                  </article>
                }
              </div>
            </div>
          }
        </section>
      }

      <!-- 2D. X-RAY CONSOLIDADO DE CARTERA -->
      @if (d.xray; as xr) {
        <section class="panel-card bloque-seccion">
          <div class="card-header">
            <div>
              <h2 class="card-title">X-Ray consolidado de cartera</h2>
              <p class="card-sub">
                Exposición real ponderada por países, sectores, divisas y principales empresas subyacentes.
              </p>
            </div>
            <span class="tag">
              Cobertura exposición: {{ fmt.num(xr.coberturaExpoPct, 1) }} % del patrimonio invertido
            </span>
          </div>

          @if (xr.alertas?.length) {
            <div class="xray-alertas" role="region" aria-label="Alertas de concentración">
              @for (alerta of xr.alertas; track alerta) {
                <div class="xray-alerta">
                  <cap-icon name="alert" [size]="15" />
                  <span>{{ alerta }}</span>
                </div>
              }
            </div>
          }

          @if (xr.desgloseFxTotal; as fxTot) {
            <div class="fx-atrib-resumen" style="margin-bottom: 1rem">
              <div class="fx-atrib-head">
                <span class="ventanas-titulo">
                  Impacto acumulado de divisas en activos no-EUR ({{ fxTot.numProductos }}
                  {{ fxTot.numProductos === 1 ? 'posición' : 'posiciones' }})
                </span>
              </div>
              <div class="fx-atrib-grid">
                <div class="fx-atrib-item">
                  <span>Efecto activo</span>
                  <strong
                    class="mono valor-privado"
                    [class.pos]="fmt.claseSigno(fxTot.efectoActivoEur) === 'pos'"
                    [class.neg]="fmt.claseSigno(fxTot.efectoActivoEur) === 'neg'"
                  >
                    {{ fmt.eurSigno(fxTot.efectoActivoEur, 2) }}
                  </strong>
                </div>
                <div class="fx-atrib-item">
                  <span>Efecto divisa (FX)</span>
                  <strong
                    class="mono valor-privado"
                    [class.pos]="fmt.claseSigno(fxTot.efectoDivisaEur) === 'pos'"
                    [class.neg]="fmt.claseSigno(fxTot.efectoDivisaEur) === 'neg'"
                  >
                    {{ fmt.eurSigno(fxTot.efectoDivisaEur, 2) }}
                  </strong>
                </div>
                <div class="fx-atrib-item">
                  <span>Plusvalía total no-EUR</span>
                  <strong
                    class="mono valor-privado"
                    [class.pos]="fmt.claseSigno(fxTot.plusvaliaTotalEur) === 'pos'"
                    [class.neg]="fmt.claseSigno(fxTot.plusvaliaTotalEur) === 'neg'"
                  >
                    {{ fmt.eurSigno(fxTot.plusvaliaTotalEur, 2) }}
                  </strong>
                </div>
              </div>
            </div>
          }

          <div class="xray-grid">
            <ng-container
              [ngTemplateOutlet]="xrayListaTpl"
              [ngTemplateOutletContext]="{
                $implicit: xr.paises,
                titulo: 'Países',
                vacio: 'Sin datos geográficos disponibles.'
              }"
            />
            <ng-container
              [ngTemplateOutlet]="xrayListaTpl"
              [ngTemplateOutletContext]="{
                $implicit: xr.sectores,
                titulo: 'Sectores',
                vacio: 'Sin datos sectoriales disponibles.'
              }"
            />
            <ng-container
              [ngTemplateOutlet]="xrayListaTpl"
              [ngTemplateOutletContext]="{
                $implicit: xr.divisas,
                titulo: 'Exposición a divisas (FX)',
                vacio: 'Sin exposición a divisas calculada.'
              }"
            />

            <div class="xray-bloque">
              <h3 class="sub-bloque-titulo">Top 15 empresas</h3>
              @if (xr.topEmpresas?.length) {
                <div class="xray-barras">
                  @for (emp of xr.topEmpresas; track emp.nombre) {
                    <div>
                      <div class="xray-fila-cab">
                        <span class="xray-emp-nom">
                          <span>{{ emp.nombre }}</span>
                          @if (emp.solapado) {
                            <span
                              class="tag tag-solapado"
                              [capTooltip]="'Solapamiento en: ' + emp.productos.join(', ')"
                            >
                              Solapado ({{ emp.productos.length }})
                            </span>
                          }
                        </span>
                        <strong class="mono">{{ fmt.num(emp.peso, 2) }} %</strong>
                      </div>
                      <div class="xray-track">
                        <div class="xray-fill" [style.width.%]="anchoBarraEmpresa(emp.peso)"></div>
                      </div>
                    </div>
                  }
                </div>
              } @else {
                <p class="vacio-celda">Sin desglose de empresas subyacentes.</p>
              }
            </div>
          </div>

          <ng-template #xrayListaTpl let-items let-titulo="titulo" let-vacio="vacio">
            <div class="xray-bloque">
              <h3 class="sub-bloque-titulo">{{ titulo }}</h3>
              @if (items?.length) {
                <div class="xray-barras">
                  @for (item of items; track item[0]) {
                    <div>
                      <div class="xray-fila-cab">
                        <span>{{ item[0] }}</span>
                        <strong class="mono">{{ fmt.num(item[1], 1) }} %</strong>
                      </div>
                      <div class="xray-track">
                        <div class="xray-fill" [style.width.%]="Math.min(100, Math.max(0, item[1]))"></div>
                      </div>
                    </div>
                  }
                </div>
              } @else {
                <p class="vacio-celda">{{ vacio }}</p>
              }
            </div>
          </ng-template>
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
              <span class="kpi-label">Impacto compuesto en 10 años</span>
              <div class="kpi-val valor-privado">{{ fmt.eur(impactoTotalComisiones(10), 0) }}</div>
              <span class="kpi-sub valor-privado">
                En 20 años: {{ fmt.eur(impactoTotalComisiones(20), 0) }} (al {{ fmt.num(tasaReferenciaComisiones() * 100, 1) }}% anual)
              </span>
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
                  <th class="num">Compuesto 10a</th>
                  <th class="num">20a</th>
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
                    <td class="num mono valor-privado">{{ fmt.eur(impactoLineaComision(l, 10), 0) }}</td>
                    <td class="num mono valor-privado">{{ fmt.eur(impactoLineaComision(l, 20), 0) }}</td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="6" class="vacio-celda">Ningún producto tiene TER configurado aún.</td>
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
  protected readonly Math = Math;
  readonly mesesHeatmap = MESES_HEATMAP;

  readonly mostrarRiesgo = signal<boolean>(false);

  readonly carteraRealComparador = computed<ComparadorCartera | null>(() => {
    const lista = this.store.datos()?.comparador || [];
    if (!lista.length) return null;
    return lista.find((c) => c.real) || lista[0];
  });

  colorCeldaHeatmap(val: number | null | undefined): string {
    return colorFondoHeatmap(val, this.store.tema() === 'oscuro');
  }

  tooltipRf(rfUsado?: number | null): string {
    const rf = typeof rfUsado === 'number' && Number.isFinite(rfUsado) ? rfUsado : 0.02;
    return `Calculado con tasa libre de riesgo de ${this.fmt.pct(rf, 2)} anual.`;
  }

  anchoBarraEmpresa(peso: number): number {
    const lista = this.store.datos()?.xray?.topEmpresas || [];
    const maxPeso = lista.reduce((m, e) => Math.max(m, e.peso || 0), 0);
    const escala = maxPeso > 0 ? maxPeso : 10;
    return Math.min(100, Math.max(0, (peso / escala) * 100));
  }

  tasaReferenciaComisiones(): number {
    const tasa = this.store.datos()?.comisiones?.tasaReferencia;
    return typeof tasa === 'number' && Number.isFinite(tasa) && tasa > 0 ? tasa : 0.07;
  }

  impactoTerCompuesto(valor: number, ter: number, anos: number, tasa = 0.07): number {
    if (!valor || !ter || valor <= 0 || ter <= 0) return 0;
    return valor * (Math.pow(1 + tasa, anos) - Math.pow(Math.max(0.01, 1 + tasa - ter), anos));
  }

  impactoLineaComision(l: LineaComision, anos: 10 | 20): number {
    const cached = anos === 10 ? l.impacto10a : l.impacto20a;
    if (typeof cached === 'number' && Number.isFinite(cached)) {
      return cached;
    }
    return this.impactoTerCompuesto(l.valor, l.ter, anos, this.tasaReferenciaComisiones());
  }

  impactoTotalComisiones(anos: 10 | 20): number {
    const com = this.store.datos()?.comisiones;
    if (!com) return 0;
    const cached = anos === 10 ? com.impacto10a : com.impacto20a;
    if (typeof cached === 'number' && Number.isFinite(cached)) {
      return cached;
    }
    return (com.lineas || []).reduce(
      (acc, l) => acc + this.impactoLineaComision(l, anos),
      0
    );
  }

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

  readonly renderDrawdownFn = computed<ChartRenderFn>(() => {
    const d = this.store.datos();
    const tema = this.store.tema();
    void tema;
    return (el: HTMLElement) => {
      if (!d?.serieDrawdown?.length || !d.fechas?.length) return;
      this.chart.drawdown(el, {
        fechas: d.fechas,
        valores: d.serieDrawdown,
        maxDDFecha: d.total.caidaMaximaFecha,
        altura: 230,
      });
    };
  });

  readonly renderScatterRiesgoFn = computed<ChartRenderFn>(() => {
    const d = this.store.datos();
    const tema = this.store.tema();
    void tema;
    return (el: HTMLElement) => {
      const activos = d?.dispersionActivos || [];
      if (!activos.length) return;
      this.chart.scatterRiesgo(el, {
        puntos: activos.map((p) => ({
          id: p.id,
          nombre: p.nombre,
          corto: p.nombre,
          volatilidad: p.vol,
          cagr: p.cagr,
          peso: p.peso,
          sharpe: p.sharpe,
          sortino: p.sortino ?? null,
          color: p.color,
        })),
        altura: 300,
      });
    };
  });
}
