import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PortfolioStoreService } from '../../services/portfolio-store.service';
import { FormatService } from '../../services/format.service';
import { ChartRenderFn, ChartService } from '../../services/chart.service';
import { SvgChartComponent } from '../svg-chart/svg-chart.component';
import { ProductoCalculado } from '../../models/portfolio.model';

@Component({
  selector: 'cap-productos-tab',
  imports: [SvgChartComponent, RouterLink],
  template: `
    @if (store.datos(); as d) {
      @if (!d.productos || !d.productos.length) {
        <section class="panel-card vacio-bloque">
          <h2>No hay fondos, ETFs ni acciones con seguimiento de compras</h2>
          <p>Ve a la pestaña «Mis datos» para añadir tus primeros productos de inversión.</p>
          <a routerLink="/datos" class="btn-primario" (click)="store.tabActiva.set('datos')">
            Ir a Mis datos
          </a>
        </section>
      } @else {
        <!-- SELECTOR DE PRODUCTO -->
        <section class="barra-filtro" aria-label="Seleccionar producto de inversión">
          @for (p of productosConColor(); track p.id) {
            <button
              type="button"
              class="pill"
              [class.on]="productoActivo()?.id === p.id"
              (click)="store.productoSeleccionadoId.set(p.id)"
            >
              <span class="dot" [style.background]="colorPrimario(p)"></span>
              <span>{{ p.corto || p.nombre }}</span>
              <span class="pill-val valor-privado">{{ fmt.eurCompacto(store.valorProductoConVivo(p)) }}</span>
            </button>
          }
        </section>

        @if (productoActivo(); as p) {
          <!-- FICHA TÉCNICA Y MÉTRICAS DEL PRODUCTO -->
          <section class="panel-card bloque-seccion ficha-producto" [style.--prod-color]="colorPrimario(p)">
            <div class="ficha-cab">
              <div>
                <div class="prod-tags">
                  <span class="tag">{{ p.tipo }}</span>
                  @if (p.identificador || p.isin) {
                    <span class="tag mono">{{ p.identificador || p.isin }}</span>
                  }
                  @if (p.entidad) {
                    <span class="tag">{{ p.entidad }}</span>
                  }
                  @if (p.gestora) {
                    <span class="tag">{{ p.gestora }}</span>
                  }
                  @if (p.clase) {
                    <span class="tag">{{ p.clase }}</span>
                  }
                  @if (p.ter) {
                    <span class="tag">TER {{ fmt.pct(p.ter, 2) }}</span>
                  }
                  @if (p.riesgo) {
                    <span class="tag">Riesgo {{ p.riesgo }}/7</span>
                  }
                </div>
                <h2 class="ficha-titulo">{{ p.nombre }}</h2>
                @if (p.papel || p.indiceDetalle) {
                  <p class="ficha-desc">{{ p.papel || p.indiceDetalle }}</p>
                }
              </div>

              <div class="ficha-valor-der">
                <span class="kpi-label">Valor actual de la posición</span>
                <div class="ficha-cifra valor-privado">{{ fmt.eur(store.valorProductoConVivo(p), 2) }}</div>
                <div class="hero-badges">
                  @if (p.plusvalia !== null && p.plusvalia !== undefined) {
                    <span class="chip-rent" [class]="fmt.claseSigno(p.plusvalia)">
                      {{ fmt.eurSigno(p.plusvalia, 2) }}
                      @if (p.rentabilidad !== null && p.rentabilidad !== undefined) {
                        ({{ fmt.pctSigno(p.rentabilidad, 2) }})
                      }
                    </span>
                  }
                  @if (p.tir !== null && p.tir !== undefined) {
                    <span class="chip-neutro">TIR {{ fmt.pctSigno(p.tir, 2) }}</span>
                  }
                </div>
              </div>
            </div>

            <div class="ficha-kpis-grid">
              <div class="ficha-kpi">
                <span>Capital invertido</span>
                <strong class="mono valor-privado">{{ fmt.eur(p.aportado ?? 0, 2) }}</strong>
              </div>
              <div class="ficha-kpi">
                <span>{{ p.etqUnidades || 'Participaciones' }}</span>
                <strong class="mono">{{ fmt.num(p.titulos ?? p.participaciones ?? 0, 4) }}</strong>
              </div>
              <div class="ficha-kpi">
                <span>Precio medio de compra</span>
                <strong class="mono valor-privado">
                  {{ p.precioMedio ? fmt.eur(p.precioMedio, 2) : '—' }}
                </strong>
              </div>
              <div class="ficha-kpi">
                <span>{{ p.etqPrecio || 'Cotización actual' }}</span>
                <strong class="mono valor-privado">
                  {{ store.precioProductoConVivo(p) ? fmt.eur(store.precioProductoConVivo(p), 2) : '—' }}
                </strong>
                @if (store.preciosVivo()[p.id]) {
                  <small class="muted">en tiempo real</small>
                } @else if (p.navFecha) {
                  <small class="muted">al {{ fmt.fechaCorta(p.navFecha) }}</small>
                }
              </div>
              <div class="ficha-kpi">
                <span>Peso en cartera</span>
                <strong class="mono">{{ fmt.pct(p.peso ?? 0, 2) }}</strong>
              </div>
              <div class="ficha-kpi">
                <span>Fuente de precios</span>
                <strong>{{ p.fuenteTexto || p.fuentePrecio || 'Manual' }}</strong>
              </div>
            </div>

            <!-- VENTANAS DE RENTABILIDAD -->
            @if (p.ventanas) {
              <div class="ventanas-box">
                <span class="ventanas-titulo">
                  {{ p.etqVentanas || 'Variación de cotización por periodo' }}
                </span>
                <div class="ventanas-grid">
                  @for (v of clavesVentanas; track v.clave) {
                    <div class="ventana-celda">
                      <span class="ventana-etq">{{ v.etiqueta }}</span>
                      <strong
                        class="mono"
                        [class]="fmt.claseSigno(p.ventanas[v.clave] ?? null)"
                      >
                        {{ p.ventanas[v.clave] !== null && p.ventanas[v.clave] !== undefined ? fmt.pctSigno(p.ventanas[v.clave]!, 2) : '—' }}
                      </strong>
                    </div>
                  }
                </div>
              </div>
            }
          </section>

          <!-- GRÁFICO DEL PRODUCTO: POSICIÓN VS PRECIO CON COMPRAS -->
          <section class="panel-card bloque-seccion">
            <div class="card-header">
              <div>
                <h3 class="card-title">
                  {{ modoGraficoProd() === 'valor' ? 'Evolución de tu posición (€) frente a capital aportado' : 'Evolución del ' + (p.etqPrecio || 'precio') + ' y momentos de compra' }}
                </h3>
                <p class="card-sub">
                  @if (modoGraficoProd() === 'valor') {
                    Comparativa diaria entre el valor de mercado de tus participaciones y el coste acumulado.
                  } @else {
                    Cada círculo marca una compra sobre la cotización oficial; la línea discontinua indica tu precio medio de adquisición.
                  }
                </p>
              </div>

              <div class="seg-group">
                <button
                  type="button"
                  class="seg-btn"
                  [class.on]="modoGraficoProd() === 'valor'"
                  (click)="modoGraficoProd.set('valor')"
                >
                  Valor posición (€)
                </button>
                <button
                  type="button"
                  class="seg-btn"
                  [class.on]="modoGraficoProd() === 'vl'"
                  (click)="modoGraficoProd.set('vl')"
                >
                  {{ p.etqPrecio || 'Precio' }} y compras
                </button>
              </div>
            </div>

            @if (modoGraficoProd() === 'vl' && p.tramos && p.tramos.n >= 3 && p.tramos.p33 !== null) {
              <div class="leyenda-tramos">
                <span>Tamaño de tus compras:</span>
                <span>
                  <i class="dot" style="background: #38bdf8"></i>
                  Pequeña (&le; {{ fmt.eur(p.tramos.p33, 0) }})
                </span>
                <span>
                  <i class="dot" style="background: #10b981"></i>
                  Habitual ({{ fmt.eur(p.tramos.p33, 0) }} – {{ fmt.eur(p.tramos.p67!, 0) }})
                </span>
                <span>
                  <i class="dot" style="background: #f59e0b"></i>
                  Extraordinaria (&gt; {{ fmt.eur(p.tramos.p67!, 0) }})
                </span>
              </div>
            }

            <cap-svg-chart [renderFn]="renderGraficoProductoFn()" [minHeight]="330" />
          </section>

          <!-- EXPOSICIÓN DEL ÍNDICE (SI APLICA) -->
          @if (p.exposicion; as exp) {
            <section class="panel-card bloque-seccion">
              <div class="card-header">
                <div>
                  <h3 class="card-title">Radiografía del índice subyacente ({{ p.indiceDetalle || p.nombre }})</h3>
                  <p class="card-sub">
                    Fuente: {{ exp.fuente }} · Actualizado en {{ exp.actualizado }}
                    @if (exp.constituyentes) {
                      · {{ fmt.entero(exp.constituyentes) }} empresas en cartera
                    }
                  </p>
                </div>
              </div>

              <div class="exposicion-grid">
                <div>
                  <h4 class="sub-bloque-titulo">Distribución geográfica</h4>
                  <cap-svg-chart [renderFn]="crearBarrasExpoFn(exp.paises, p)" />
                </div>
                <div>
                  <h4 class="sub-bloque-titulo">Distribución sectorial</h4>
                  <cap-svg-chart [renderFn]="crearBarrasExpoFn(exp.sectores, p)" />
                </div>
                @if (exp.top10 && exp.top10.length) {
                  <div>
                    <h4 class="sub-bloque-titulo">Principales posiciones (Top 10)</h4>
                    <cap-svg-chart [renderFn]="crearBarrasExpoFn(exp.top10, p)" />
                  </div>
                }
              </div>
            </section>
          }

          <!-- HISTORIAL DE COMPRAS DEL PRODUCTO -->
          <section class="panel-card bloque-seccion">
            <div class="card-header">
              <div>
                <h3 class="card-title">Compras registradas en {{ p.corto || p.nombre }}</h3>
                <p class="card-sub">
                  {{ (p.aportaciones || []).length }} aportaciones · Importe medio:
                  {{ p.tramos?.mediana ? fmt.eur(p.tramos!.mediana, 0) : '—' }}
                </p>
              </div>
            </div>

            <div class="tabla-scroll">
              <table class="tabla-datos">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Clasificación</th>
                    <th class="num">{{ p.etqUnidades || 'Participaciones' }}</th>
                    <th class="num">{{ p.etqPrecio || 'Precio compra' }}</th>
                    <th class="num">Importe</th>
                  </tr>
                </thead>
                <tbody>
                  @for (a of aportacionesOrdenadas(p); track $index) {
                    <tr>
                      <td class="mono">{{ fmt.fechaCorta(a.fecha) }}</td>
                      <td>
                        <span class="tag" [class]="claseNivelAportacion(a.nivel)">
                          {{ etiquetaNivelAportacion(a.nivel) }}
                        </span>
                      </td>
                      <td class="num mono">
                        {{ a.participaciones ? fmt.num(a.participaciones, 4) : '—' }}
                      </td>
                      <td class="num mono valor-privado">
                        {{ a.precio ? fmt.eur(a.precio, 2) : '—' }}
                      </td>
                      <td class="num mono valor-privado">{{ fmt.eur(a.importe, 2) }}</td>
                    </tr>
                  } @empty {
                    <tr>
                      <td colspan="5" class="vacio-celda">No hay compras registradas en este producto.</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </section>
        }
      }
    }
  `,
})
export class ProductosTabComponent {
  readonly store = inject(PortfolioStoreService);
  readonly fmt = inject(FormatService);
  private readonly chart = inject(ChartService);

  readonly modoGraficoProd = signal<'valor' | 'vl'>('valor');

  readonly clavesVentanas = [
    { clave: '1m', etiqueta: '1 mes' },
    { clave: '3m', etiqueta: '3 meses' },
    { clave: '6m', etiqueta: '6 meses' },
    { clave: 'ytd', etiqueta: 'Este año (YTD)' },
    { clave: '1a', etiqueta: '1 año' },
    { clave: 'total', etiqueta: 'Desde inicio' },
  ];

  readonly productosConColor = computed<ProductoCalculado[]>(() => {
    const prods = this.store.datos()?.productos || [];
    return prods.map((p, idx) => ({
      ...p,
      color: p.slotColor || p.color || this.fmt.colorDeSlot(p.slot ?? idx),
    }));
  });

  readonly productoActivo = computed<ProductoCalculado | null>(() => {
    const lista = this.productosConColor();
    if (!lista.length) return null;
    const sel = this.store.productoSeleccionadoId();
    return lista.find((p) => p.id === sel) || lista[0];
  });

  colorPrimario(p: ProductoCalculado): string {
    return Array.isArray(p.color) ? p.color[0] : '#10b981';
  }

  readonly renderGraficoProductoFn = computed<ChartRenderFn>(() => {
    const d = this.store.datos();
    const p = this.productoActivo();
    const modo = this.modoGraficoProd();
    const tema = this.store.tema();
    void tema;

    return (el: HTMLElement) => {
      if (!d || !p || !d.fechas.length) return;
      const colorPar = (p.color || ['#10b981', '#059669']) as [string, string];

      // Cut leading zeros so the chart starts when the product or series starts
      const serieBase = modo === 'vl' && p.navSerie ? p.navSerie : p.serie;
      let ini = serieBase.findIndex((v) => v !== null && v > 0);
      if (ini < 0) ini = 0;

      const fechas = d.fechas.slice(ini);
      if (modo === 'valor') {
        const valores = (p.serie || []).slice(ini);
        const aportado = (p.serieAportado || []).slice(ini);
        const eventos = (p.aportaciones || [])
          .filter((a) => a.fecha >= fechas[0])
          .map((a) => ({
            fecha: a.fecha,
            importe: a.importe,
            nivel: a.nivel,
            texto: `Compra: ${this.fmt.eur(a.importe, 2)}`,
          }));

        this.chart.lineaConEventos(el, {
          fechas,
          valores,
          secundaria: aportado,
          etiquetaPri: 'Valor posición',
          etiquetaSec: 'Capital invertido',
          color: colorPar,
          eventos,
          altura: 330,
        });
      } else {
        const navs = (p.navSerie || p.serie || []).slice(ini);
        const eventos = (p.aportaciones || [])
          .filter((a) => a.fecha >= fechas[0])
          .map((a) => ({
            fecha: a.fecha,
            importe: a.importe,
            precio: a.precio,
            nivel: a.nivel,
            texto: a.precio
              ? `${this.fmt.eur(a.importe, 0)} a ${this.fmt.eur(a.precio, 2)}`
              : this.fmt.eur(a.importe, 0),
          }));

        const lineaRef =
          p.precioMedio && p.precioMedio > 0
            ? {
                valor: p.precioMedio,
                etiqueta: `Precio medio: ${this.fmt.eur(p.precioMedio, 2)}`,
                color: '#f59e0b',
              }
            : null;

        this.chart.lineaConEventos(el, {
          fechas,
          valores: navs,
          etiquetaPri: p.etqPrecio || 'Cotización',
          color: colorPar,
          eventos,
          eventosEnPrecio: true,
          lineaRef,
          formatoY: (v) => this.fmt.eur(v, 2),
          altura: 330,
        });
      }
    };
  });

  crearBarrasExpoFn(
    items: [string, number][],
    p: ProductoCalculado
  ): ChartRenderFn {
    const color = this.colorPrimario(p);
    return (el: HTMLElement) => {
      this.chart.barrasHorizontales(el, items, color);
    };
  }

  aportacionesOrdenadas(p: ProductoCalculado) {
    return [...(p.aportaciones || [])].sort((a, b) =>
      b.fecha.localeCompare(a.fecha)
    );
  }

  etiquetaNivelAportacion(nivel?: number): string {
    if (nivel === 3) return 'Extraordinaria';
    if (nivel === 1) return 'Pequeña';
    return 'Habitual';
  }

  claseNivelAportacion(nivel?: number): string {
    if (nivel === 3) return 'tag-lp';
    return '';
  }
}
