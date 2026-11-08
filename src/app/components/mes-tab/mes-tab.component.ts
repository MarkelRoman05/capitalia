import { Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PortfolioStoreService } from '../../services/portfolio-store.service';
import { FormatService } from '../../services/format.service';
import { ChartRenderFn, ChartService } from '../../services/chart.service';
import { SvgChartComponent } from '../svg-chart/svg-chart.component';
import { ResumenMensual } from '../../models/portfolio.model';

interface FilaDetalleMes {
  id: string;
  nombre: string;
  color: string;
  inicio: number;
  esfuerzo: number;
  mercado: number;
  fin: number;
  cambio: number;
}

@Component({
  selector: 'cap-mes-tab',
  imports: [FormsModule, SvgChartComponent],
  template: `
    @if (store.datos(); as d) {
      @if (!d.resumenMensual || !d.resumenMensual.length) {
        <section class="panel-card vacio-bloque">
          <h2>Aún no hay cierres mensuales disponibles</h2>
          <p>Añade movimientos o saldos para analizar qué parte del crecimiento viene de tu ahorro y cuál del mercado.</p>
        </section>
      } @else if (mesActual(); as m) {
        <section class="panel-card bloque-seccion">
          <div class="mes-header">
            <div>
              <span class="hero-kicker">RADIOGRAFÍA MENSUAL</span>
              <h2 class="mes-titulo">{{ fmt.mesLargo(m.mes) }}</h2>
            </div>

            <div class="mes-nav">
              <button
                type="button"
                class="btn-icono"
                [disabled]="indiceActual() <= 0"
                (click)="cambiarIndice(indiceActual() - 1)"
                aria-label="Mes anterior"
              >
                ‹
              </button>
              <select
                class="input-select"
                [ngModel]="indiceActual()"
                (ngModelChange)="cambiarIndice(+$event)"
                aria-label="Seleccionar mes"
              >
                @for (item of d.resumenMensual; track item.mes; let i = $index) {
                  <option [value]="i">{{ fmt.mesLargo(item.mes) }}</option>
                }
              </select>
              <button
                type="button"
                class="btn-icono"
                [disabled]="indiceActual() >= d.resumenMensual.length - 1"
                (click)="cambiarIndice(indiceActual() + 1)"
                aria-label="Mes siguiente"
              >
                ›
              </button>
            </div>
          </div>

          <div class="mes-hero-grid">
            <div class="mes-resumen-principal">
              <span class="kpi-label">Variación patrimonial del mes</span>
              <div class="mes-cifra valor-privado" [class]="fmt.claseSigno(cambioTotal())">
                {{ fmt.eurSigno(cambioTotal(), 2) }}
              </div>
              <div class="mes-sub valor-privado">
                <span>De {{ fmt.eur(m.inicio, 0) }} a {{ fmt.eur(m.fin, 0) }}</span>
                @if (cambioPct() !== null) {
                  <span class="chip-rent" [class]="fmt.claseSigno(cambioPct())">
                    {{ fmt.pctSigno(cambioPct(), 2) }}
                  </span>
                }
              </div>
            </div>

            <div class="mes-caja">
              <span class="kpi-label">Lo pusiste tú (Ahorro + Saldos)</span>
              <div class="kpi-val valor-privado" [class]="fmt.claseSigno(esfuerzoTotal())">
                {{ fmt.eurSigno(esfuerzoTotal(), 0) }}
              </div>
              <span class="kpi-sub valor-privado">
                {{ fmt.eur(m.aportado, 0) }} en compras · {{ fmt.eurSigno(m.nuevo, 0) }} en saldos
              </span>
            </div>

            <div class="mes-caja">
              <span class="kpi-label">Lo puso el mercado</span>
              <div class="kpi-val valor-privado" [class]="fmt.claseSigno(m.mercado)">
                {{ fmt.eurSigno(m.mercado, 0) }}
              </div>
              <span class="kpi-sub">
                @if (m.rentabilidad !== null) {
                  Rentabilidad de mercado {{ fmt.pctSigno(m.rentabilidad, 2) }}
                } @else {
                  Variación por cotización de activos
                }
              </span>
            </div>
          </div>
        </section>

        <!-- DESGLOSE POR ACTIVO EN EL MES -->
        <section class="panel-card bloque-seccion">
          <div class="card-header">
            <div>
              <h3 class="card-title">Desglose por producto en {{ fmt.mesCorto(m.mes) }}</h3>
              <p class="card-sub">Cómo ha contribuido cada posición al cierre de este mes</p>
            </div>
          </div>

          <div class="tabla-scroll">
            <table class="tabla-datos">
              <thead>
                <tr>
                  <th>Activo / Producto</th>
                  <th class="num">Inicio mes</th>
                  <th class="num">Tu aportación / saldo</th>
                  <th class="num">Efecto mercado</th>
                  <th class="num">Fin de mes</th>
                  <th class="num">Cambio total</th>
                </tr>
              </thead>
              <tbody>
                @for (f of filasDetalleMes(); track f.id) {
                  <tr>
                    <td>
                      <span class="dot" [style.background]="f.color"></span>
                      {{ f.nombre }}
                    </td>
                    <td class="num mono valor-privado">{{ fmt.eur(f.inicio, 0) }}</td>
                    <td class="num mono valor-privado" [class]="fmt.claseSigno(f.esfuerzo)">
                      {{ f.esfuerzo !== 0 ? fmt.eurSigno(f.esfuerzo, 0) : '—' }}
                    </td>
                    <td class="num mono valor-privado" [class]="fmt.claseSigno(f.mercado)">
                      {{ Math.abs(f.mercado) >= 0.5 ? fmt.eurSigno(f.mercado, 0) : '—' }}
                    </td>
                    <td class="num mono valor-privado">{{ fmt.eur(f.fin, 0) }}</td>
                    <td class="num mono valor-privado" [class]="fmt.claseSigno(f.cambio)">
                      {{ fmt.eurSigno(f.cambio, 0) }}
                    </td>
                  </tr>
                }
              </tbody>
              <tfoot>
                <tr>
                  <td><strong>Total cartera</strong></td>
                  <td class="num mono valor-privado"><strong>{{ fmt.eur(m.inicio, 0) }}</strong></td>
                  <td class="num mono valor-privado" [class]="fmt.claseSigno(esfuerzoTotal())">
                    <strong>{{ fmt.eurSigno(esfuerzoTotal(), 0) }}</strong>
                  </td>
                  <td class="num mono valor-privado" [class]="fmt.claseSigno(m.mercado)">
                    <strong>{{ fmt.eurSigno(m.mercado, 0) }}</strong>
                  </td>
                  <td class="num mono valor-privado"><strong>{{ fmt.eur(m.fin, 0) }}</strong></td>
                  <td class="num mono valor-privado" [class]="fmt.claseSigno(cambioTotal())">
                    <strong>{{ fmt.eurSigno(cambioTotal(), 0) }}</strong>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        <!-- HISTÓRICO 18 MESES: ESFUERZO VS MERCADO -->
        <section class="panel-card bloque-seccion">
          <div class="card-header">
            <div>
              <h3 class="card-title">Tu esfuerzo frente al mercado (últimos 18 meses)</h3>
              <p class="card-sub">Comparativa mensual entre el dinero nuevo ahorrado y la revalorización de la cartera</p>
            </div>
            <div class="leyenda-inline">
              <span><i class="dot" style="background: #10b981"></i> Lo pusiste tú</span>
              <span><i class="dot" style="background: #38bdf8"></i> Mercado (+)</span>
              <span><i class="dot" style="background: #f43f5e"></i> Mercado (−)</span>
            </div>
          </div>

          <cap-svg-chart [renderFn]="renderHistoricoMesesFn()" [minHeight]="270" />
        </section>
      }
    }
  `,
})
export class MesTabComponent {
  readonly store = inject(PortfolioStoreService);
  readonly fmt = inject(FormatService);
  private readonly chart = inject(ChartService);
  protected readonly Math = Math;

  readonly indiceActual = computed<number>(() => {
    const lista = this.store.datos()?.resumenMensual || [];
    if (!lista.length) return -1;
    const idx = this.store.mesSeleccionadoIdx();
    if (idx < 0 || idx >= lista.length) return lista.length - 1;
    return idx;
  });

  readonly mesActual = computed<ResumenMensual | null>(() => {
    const lista = this.store.datos()?.resumenMensual || [];
    const idx = this.indiceActual();
    return idx >= 0 && idx < lista.length ? lista[idx] : null;
  });

  readonly cambioTotal = computed<number>(() => {
    const m = this.mesActual();
    return m ? m.fin - m.inicio : 0;
  });

  readonly cambioPct = computed<number | null>(() => {
    const m = this.mesActual();
    if (!m || m.inicio <= 0) return null;
    return (m.fin - m.inicio) / m.inicio;
  });

  readonly esfuerzoTotal = computed<number>(() => {
    const m = this.mesActual();
    return m ? m.aportado + m.nuevo : 0;
  });

  cambiarIndice(nuevo: number): void {
    const lista = this.store.datos()?.resumenMensual || [];
    if (nuevo >= 0 && nuevo < lista.length) {
      this.store.mesSeleccionadoIdx.set(nuevo);
    }
  }

  readonly filasDetalleMes = computed<FilaDetalleMes[]>(() => {
    const m = this.mesActual();
    const comps = this.store.todosComponentes();
    if (!m) return [];

    const filas: FilaDetalleMes[] = [];
    for (const c of comps) {
      const det = m.porProducto?.[c.id];
      if (!det) continue;
      if (
        Math.abs(det.inicio) < 0.5 &&
        Math.abs(det.fin) < 0.5 &&
        Math.abs(det.aportado) < 0.5 &&
        Math.abs(det.nuevo) < 0.5
      ) {
        continue;
      }
      const color = Array.isArray(c.color)
        ? c.color[0]
        : Array.isArray(c.slotColor)
          ? c.slotColor[0]
          : '#10b981';
      filas.push({
        id: c.id,
        nombre: c.nombre,
        color,
        inicio: det.inicio,
        esfuerzo: det.aportado + det.nuevo,
        mercado: det.mercado,
        fin: det.fin,
        cambio: det.fin - det.inicio,
      });
    }
    return filas.sort((a, b) => Math.abs(b.fin) - Math.abs(a.fin));
  });

  readonly renderHistoricoMesesFn = computed<ChartRenderFn>(() => {
    const d = this.store.datos();
    const tema = this.store.tema();
    void tema;
    return (el: HTMLElement) => {
      const rm = (d?.resumenMensual || []).slice(-18);
      if (!rm.length) return;
      const categorias = rm.map((x) => x.mes);
      const esfuerzo = rm.map((x) => x.aportado + x.nuevo);
      const mercado = rm.map((x) => x.mercado);
      this.chart.barrasAgrupadas(el, {
        categorias,
        series: [
          {
            nombre: 'Lo pusiste tú',
            valores: esfuerzo,
            color: '#10b981',
            colorNeg: '#f59e0b',
          },
          {
            nombre: 'Efecto mercado',
            valores: mercado,
            color: '#38bdf8',
            colorNeg: '#f43f5e',
          },
        ],
        altura: 270,
      });
    };
  });
}
