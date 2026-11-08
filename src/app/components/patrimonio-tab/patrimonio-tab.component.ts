import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  AgrupacionDistId,
  PortfolioStoreService,
  RangoId,
  VistaEvolucionId,
} from '../../services/portfolio-store.service';
import { FormatService } from '../../services/format.service';
import { ChartRenderFn, ChartService } from '../../services/chart.service';
import { SvgChartComponent } from '../svg-chart/svg-chart.component';
import { GrupoAgrupado, ProductoCalculado } from '../../models/portfolio.model';

interface FilaAportacionTabla {
  fecha: string;
  importe: number;
  participaciones?: number;
  precio?: number | null;
  prodId: string;
  prodNombre: string;
  color: string;
  etqPrecio: string;
  esPasivo: boolean;
}

@Component({
  selector: 'cap-patrimonio-tab',
  imports: [FormsModule, SvgChartComponent],
  template: `
    @if (store.datos(); as d) {
      @if (d.modo === 'demo') {
        <div class="aviso-demo">
          <div class="aviso-demo-txt">
            <span class="badge-demo">MODO DEMO</span>
            <span>
              Estás explorando una cartera de ejemplo con datos reales de mercado. Cuando quieras, puedes inicializar tu propia cartera en PostgreSQL.
            </span>
          </div>
          <button type="button" class="btn-primario" (click)="store.empezarConMiCartera()">
            Empezar con mi cartera
          </button>
        </div>
      }

      @if (store.carteraVacia()) {
        <section class="bienvenida-card">
          <div class="bienvenida-icono">✦</div>
          <h2>Tu cartera en Capitalia está lista para empezar</h2>
          <p>
            Añade tus fondos indexados, ETFs, acciones, criptomonedas, cuentas remuneradas, inmuebles o préstamos. Capitalia descargará automáticamente las cotizaciones históricas y calculará tu rentabilidad TIR y FIFO.
          </p>
          <div class="bienvenida-acciones">
            <button type="button" class="btn-primario" (click)="irANuevoProducto()">
              + Añadir mi primer producto
            </button>
            <button type="button" class="btn-secundario" (click)="irAImportar()">
              Importar CSV / Excel / MyInvestor
            </button>
            <button type="button" class="btn-fantasma" (click)="store.cargarEjemplo()">
              Cargar cartera de ejemplo
            </button>
          </div>
        </section>
      } @else {
        <!-- HERO PATRIMONIO -->
        <section class="hero-patrimonio">
          <div class="hero-izq">
            <div class="hero-kicker">
              <span>{{ store.filtrando() ? 'PATRIMONIO FILTRADO (' + store.visibles().length + ' DE ' + store.todosComponentes().length + ')' : 'PATRIMONIO NETO TOTAL' }}</span>
              @if (ajusteVivoEur() !== 0) {
                <span class="vivo-pill" title="Cotización cripto en tiempo real">
                  <span class="vivo-dot"></span> EN VIVO
                </span>
              }
            </div>

            <div class="hero-cifra valor-privado">
              {{ fmt.eur(patrimonioMostrado(), 2) }}
            </div>

            <div class="hero-badges">
              @if (metricasActivas().plusvalia !== null) {
                <span class="chip-rent" [class]="fmt.claseSigno(plusvaliaMostrada())">
                  {{ fmt.eurSigno(plusvaliaMostrada(), 0) }}
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
                    + {{ fmt.eur(metricasActivas().valor - metricasActivas().valorConCoste, 0) }} en otros activos
                  </span>
                }
              }
              @if (d.fechas.length) {
                <span>· Desde {{ fmt.fechaCorta(d.fechas[0]) }} hasta {{ fmt.fechaCorta(d.fechas[d.fechas.length - 1]) }}</span>
              }
            </div>
          </div>

          <div class="hero-der">
            @if (d.objetivo && d.objetivo.activo && d.objetivo.importe > 0) {
              <div class="objetivo-box">
                <div class="objetivo-cab">
                  <span class="objetivo-etq">{{ d.objetivo.etiqueta || 'Objetivo de patrimonio' }}</span>
                  <button type="button" class="btn-link" (click)="abrirModalObjetivo()">Editar</button>
                </div>
                <div class="objetivo-nums">
                  <strong class="mono">{{ fmt.num(progresoObjetivoPct(), 1) }} %</strong>
                  <span class="mono muted valor-privado">de {{ fmt.eur(d.objetivo.importe, 0) }}</span>
                </div>
                <div class="barra-prog">
                  <div class="barra-prog-fill" [style.width.%]="progresoObjetivoPct()"></div>
                </div>
                <div class="objetivo-pie">
                  @if (faltaObjetivo() > 0) {
                    <span class="valor-privado">Faltan {{ fmt.eur(faltaObjetivo(), 0) }}</span>
                    @if (estimacionObjetivoTexto()) {
                      <span>· {{ estimacionObjetivoTexto() }}</span>
                    }
                  } @else {
                    <span class="pos">¡Objetivo alcanzado!</span>
                  }
                </div>
              </div>
            } @else {
              <div class="objetivo-box objetivo-vacio">
                <p>Define una meta patrimonial para seguir tu progreso mes a mes.</p>
                <button type="button" class="btn-secundario btn-sm" (click)="abrirModalObjetivo()">
                  Fijar objetivo
                </button>
              </div>
            }
          </div>
        </section>

        <!-- BARRA DE FILTROS -->
        <section class="barra-filtro" aria-label="Filtrar activos del panel">
          <span class="filtro-label">Filtrar vista:</span>
          <button
            type="button"
            class="pill"
            [class.on]="!store.filtrando()"
            (click)="store.mostrarTodos()"
          >
            Ver todo
          </button>

          @if (hayLargoPlazo()) {
            <button
              type="button"
              class="pill pill-lp"
              [class.on]="store.esFiltroLargoPlazoActivo()"
              (click)="store.filtrarLargoPlazo()"
            >
              Solo largo plazo
            </button>
          }

          @for (comp of store.todosComponentes(); track comp.id) {
            <button
              type="button"
              class="pill"
              [class.on]="!store.ocultos().has(comp.id)"
              [class.off]="store.ocultos().has(comp.id)"
              (click)="onClickPill($event, comp.id)"
              (dblclick)="store.toggleComponente(comp.id, true)"
              title="Clic: mostrar/ocultar · Doble clic o Alt+clic: ver solo este activo"
            >
              <span class="dot" [style.background]="colorPrimario(comp)"></span>
              <span>{{ comp.corto || comp.nombre }}</span>
              <span class="pill-val valor-privado">{{ fmt.eurCompacto(comp.valor) }}</span>
            </button>
          }
        </section>

        <!-- 6 KPIs -->
        <section class="kpis-grid">
          <article class="kpi-card">
            <span class="kpi-label">Dinero invertido</span>
            <div class="kpi-val valor-privado">
              {{ metricasActivas().aportado > 0 ? fmt.eur(metricasActivas().aportado, 0) : '—' }}
            </div>
            <span class="kpi-sub">
              {{ metricasActivas().aportado > 0 ? 'Capital neto aportado' : 'Activo de saldo o efectivo' }}
            </span>
          </article>

          <article class="kpi-card">
            <span class="kpi-label">Ganancia o pérdida</span>
            <div class="kpi-val valor-privado" [class]="fmt.claseSigno(plusvaliaMostrada())">
              {{ plusvaliaMostrada() !== null ? fmt.eurSigno(plusvaliaMostrada(), 0) : '—' }}
            </div>
            <span class="kpi-sub valor-privado">
              @if (!store.filtrando() && d.total.realizado) {
                Incluye {{ fmt.eurSigno(d.total.realizado, 0) }} ya realizados
              } @else {
                Plusvalía latente actual
              }
            </span>
          </article>

          <article class="kpi-card">
            <span class="kpi-label">Rentabilidad total</span>
            <div class="kpi-val" [class]="fmt.claseSigno(rentabilidadMostrada())">
              {{ rentabilidadMostrada() !== null ? fmt.pctSigno(rentabilidadMostrada(), 2) : '—' }}
            </div>
            <span class="kpi-sub">Sobre el capital invertido</span>
          </article>

          <article class="kpi-card">
            <span class="kpi-label">Rentabilidad anual (TIR)</span>
            <div class="kpi-val" [class]="fmt.claseSigno(metricasActivas().tir)">
              {{ metricasActivas().tir !== null ? fmt.pctSigno(metricasActivas().tir, 2) : '—' }}
            </div>
            <span class="kpi-sub">Anualizada ponderada por fechas</span>
          </article>

          <article class="kpi-card">
            <span class="kpi-label">Ritmo de ahorro</span>
            <div class="kpi-val valor-privado">
              {{ metricasActivas().ritmo > 0 ? fmt.eur(metricasActivas().ritmo, 0) + '/mes' : '—' }}
            </div>
            <span class="kpi-sub">
              @if (metricasActivas().racha > 1) {
                {{ metricasActivas().racha }} meses seguidos · {{ metricasActivas().numAportaciones }} compras
              } @else {
                {{ metricasActivas().numAportaciones }} aportaciones registradas
              }
            </span>
          </article>

          <article class="kpi-card">
            <span class="kpi-label">Mayor caída (Max DD)</span>
            <div class="kpi-val" [class]="metricasActivas().caida < 0 ? 'neg' : ''">
              {{ fmt.pct(metricasActivas().caida, 1) }}
            </div>
            <span class="kpi-sub">
              {{ metricasActivas().caidaFecha ? 'Mínimo el ' + fmt.fechaCorta(metricasActivas().caidaFecha!) : 'Sin caídas registradas' }}
            </span>
          </article>
        </section>

        <!-- GRÁFICO PRINCIPAL DE EVOLUCIÓN -->
        <section class="panel-card bloque-seccion">
          <div class="card-header">
            <div>
              <h2 class="card-title">{{ tituloEvolucion() }}</h2>
              <p class="card-sub">{{ subtituloEvolucion() }}</p>
            </div>
            <div class="controles-evolucion">
              <div class="seg-group" role="group" aria-label="Tipo de gráfico">
                @for (v of vistasEvolucion; track v.id) {
                  <button
                    type="button"
                    class="seg-btn"
                    [class.on]="store.vistaEvolucion() === v.id"
                    (click)="store.vistaEvolucion.set(v.id)"
                  >
                    {{ v.etiqueta }}
                  </button>
                }
              </div>
              <div class="seg-group" role="group" aria-label="Rango temporal">
                @for (r of rangosTiempo; track r.id) {
                  <button
                    type="button"
                    class="seg-btn"
                    [class.on]="store.rango() === r.id"
                    (click)="store.rango.set(r.id)"
                  >
                    {{ r.etiqueta }}
                  </button>
                }
              </div>
            </div>
          </div>

          <cap-svg-chart [renderFn]="renderEvolucionFn()" [minHeight]="350" />
        </section>

        <!-- TARJETAS DE PRODUCTOS Y ACTIVOS -->
        <section class="bloque-seccion">
          <div class="seccion-cab">
            <div>
              <h2 class="seccion-titulo">Tus productos y activos</h2>
              <p class="seccion-sub">
                Haz clic en cualquier fondo, ETF o acción para inspeccionar su ficha técnica, compras y exposición.
              </p>
            </div>
          </div>

          <div class="productos-grid">
            @for (c of store.todosComponentes(); track c.id) {
              <article
                class="prod-card"
                [class.prod-oculto]="store.ocultos().has(c.id)"
                [style.--prod-color]="colorPrimario(c)"
                (click)="onClickTarjetaProducto(c)"
              >
                <div class="prod-card-top">
                  <div class="prod-ident">
                    <span class="prod-dot" [style.background]="colorPrimario(c)"></span>
                    <div>
                      <h3 class="prod-nombre">{{ c.nombre }}</h3>
                      <div class="prod-tags">
                        <span class="tag">{{ c.tipo }}</span>
                        @if (c.entidad) {
                          <span class="tag">{{ c.entidad }}</span>
                        }
                        @if (c.ter) {
                          <span class="tag">TER {{ fmt.pct(c.ter, 2) }}</span>
                        }
                        @if (c.riesgo) {
                          <span class="tag">SRRI {{ c.riesgo }}/7</span>
                        }
                        @if (c.largoPlazo) {
                          <span class="tag tag-lp">Largo plazo</span>
                        }
                      </div>
                    </div>
                  </div>

                  <div class="prod-valor-box">
                    <div class="prod-valor valor-privado" [class.neg]="c.valor < 0">
                      {{ fmt.eur(valorComponenteVivo(c), 2) }}
                    </div>
                    <div class="prod-peso mono">
                      {{ fmt.pct(pesoComponente(c), 1) }} del total
                    </div>
                  </div>
                </div>

                <div class="prod-spark">
                  <cap-svg-chart [renderFn]="crearSparklineFn(c)" [minHeight]="48" />
                </div>

                <div class="prod-metricas">
                  <div>
                    <span class="pm-etq">Invertido</span>
                    <strong class="pm-val valor-privado">
                      {{ c.aportado !== null && c.aportado !== undefined ? fmt.eur(c.aportado, 0) : 'Saldo manual' }}
                    </strong>
                  </div>
                  <div>
                    <span class="pm-etq">Ganancia</span>
                    <strong class="pm-val valor-privado" [class]="fmt.claseSigno(c.plusvalia)">
                      {{ c.plusvalia !== null && c.plusvalia !== undefined ? fmt.eurSigno(c.plusvalia, 0) : '—' }}
                    </strong>
                  </div>
                  <div>
                    <span class="pm-etq">Rentab.</span>
                    <strong class="pm-val" [class]="fmt.claseSigno(c.rentabilidad)">
                      {{ c.rentabilidad !== null && c.rentabilidad !== undefined ? fmt.pctSigno(c.rentabilidad, 1) : '—' }}
                    </strong>
                  </div>
                  <div>
                    <span class="pm-etq">TIR</span>
                    <strong class="pm-val" [class]="fmt.claseSigno(c.tir)">
                      {{ c.tir !== null && c.tir !== undefined ? fmt.pctSigno(c.tir, 1) : '—' }}
                    </strong>
                  </div>
                </div>
              </article>
            }
          </div>
        </section>

        <!-- DISTRIBUCIÓN Y APORTACIONES MENSUALES -->
        <div class="dos-columnas bloque-seccion">
          <section class="panel-card">
            <div class="card-header">
              <div>
                <h2 class="card-title">Distribución de activos</h2>
                <p class="card-sub">Reparto de los activos positivos seleccionados</p>
              </div>
              <div class="seg-group" role="group" aria-label="Agrupar distribución">
                @for (ag of agrupacionesDist; track ag.id) {
                  <button
                    type="button"
                    class="seg-btn"
                    [class.on]="store.agrupacionDist() === ag.id"
                    (click)="store.agrupacionDist.set(ag.id)"
                  >
                    {{ ag.etiqueta }}
                  </button>
                }
              </div>
            </div>

            <div class="dist-layout">
              <div class="dist-donut">
                <cap-svg-chart [renderFn]="renderDonutFn()" [minHeight]="230" />
              </div>
              <div class="dist-tabla-wrap">
                <table class="tabla-compacta">
                  <thead>
                    <tr>
                      <th>Grupo</th>
                      <th class="num">Peso</th>
                      <th class="num">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (g of gruposDistribucion(); track g.nombre) {
                      <tr>
                        <td>
                          <span class="dot" [style.background]="colorGrupo(g)"></span>
                          {{ g.nombre }}
                        </td>
                        <td class="num mono">{{ fmt.pct(g.peso, 1) }}</td>
                        <td class="num mono valor-privado">{{ fmt.eur(g.valor, 0) }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section class="panel-card">
            <div class="card-header">
              <div>
                <h2 class="card-title">Aportaciones por mes</h2>
                <p class="card-sub">{{ resumenAportacionesMesTexto() }}</p>
              </div>
            </div>
            <cap-svg-chart [renderFn]="renderAportacionesMesFn()" [minHeight]="250" />
          </section>
        </div>

        <!-- HITOS Y SIMULADOR DE PROYECCIÓN FUTURA -->
        <div class="dos-columnas bloque-seccion">
          <section class="panel-card">
            <div class="card-header">
              <div>
                <h2 class="card-title">Hitos de patrimonio</h2>
                <p class="card-sub">Metas escalonadas alcanzadas y próximas por conquistar</p>
              </div>
            </div>
            <div class="hitos-grid">
              @for (h of d.total.hitos; track h.importe) {
                <div class="hito-item" [class.hito-logrado]="!!h.fecha">
                  <div class="hito-cab">
                    <span class="hito-icono">{{ h.fecha ? '✓' : '◎' }}</span>
                    <strong class="hito-imp mono valor-privado">{{ fmt.eur(h.importe, 0) }}</strong>
                  </div>
                  @if (h.fecha) {
                    <span class="hito-fecha">Logrado el {{ fmt.fechaCorta(h.fecha) }}</span>
                  } @else {
                    <div class="barra-prog barra-prog-sm">
                      <div
                        class="barra-prog-fill"
                        [style.width.%]="porcentajeHito(h.importe)"
                      ></div>
                    </div>
                    <span class="hito-fecha valor-privado">
                      {{ fmt.num(porcentajeHito(h.importe), 0) }}% · faltan {{ fmt.eur(Math.max(0, h.importe - d.total.patrimonio), 0) }}
                    </span>
                  }
                </div>
              }
            </div>
          </section>

          <section class="panel-card">
            <div class="card-header">
              <div>
                <h2 class="card-title">Proyección de interés compuesto</h2>
                <p class="card-sub">Simulación partiendo de tu patrimonio actual</p>
              </div>
            </div>

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

            <div class="proy-resumen">
              <div class="proy-kpi">
                <span>Patrimonio estimado</span>
                <strong class="mono gold valor-privado">{{ fmt.eur(datosProyeccion().finalTotal, 0) }}</strong>
              </div>
              <div class="proy-kpi">
                <span>Aportado por ti</span>
                <strong class="mono valor-privado">{{ fmt.eur(datosProyeccion().finalAportado, 0) }}</strong>
              </div>
              <div class="proy-kpi">
                <span>Interés compuesto generado</span>
                <strong class="mono pos valor-privado">+{{ fmt.eur(datosProyeccion().ganancia, 0) }}</strong>
              </div>
            </div>

            <cap-svg-chart [renderFn]="renderProyeccionFn()" [minHeight]="200" />
          </section>
        </div>

        <!-- TABLA HISTÓRICA DE APORTACIONES -->
        <section class="panel-card bloque-seccion">
          <div class="card-header">
            <div>
              <h2 class="card-title">Registro histórico de compras y aportaciones</h2>
              <p class="card-sub">
                {{ filasAportacionesFiltradas().length }} operaciones · Total {{ fmt.eur(sumaAportacionesFiltradas(), 2) }}
              </p>
            </div>
            <div class="controles-tabla">
              <select
                class="input-select"
                [ngModel]="filtroProdTabla()"
                (ngModelChange)="filtroProdTabla.set($event)"
                aria-label="Filtrar por producto"
              >
                <option value="todos">Todos los productos</option>
                @for (p of d.productos; track p.id) {
                  <option [value]="p.id">{{ p.nombre }}</option>
                }
              </select>

              <div class="seg-group">
                <button
                  type="button"
                  class="seg-btn"
                  [class.on]="ordenTabla() === 'fecha'"
                  (click)="ordenTabla.set('fecha')"
                >
                  Recientes
                </button>
                <button
                  type="button"
                  class="seg-btn"
                  [class.on]="ordenTabla() === 'importe'"
                  (click)="ordenTabla.set('importe')"
                >
                  Mayor importe
                </button>
              </div>
            </div>
          </div>

          <div class="tabla-scroll">
            <table class="tabla-datos">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Producto</th>
                  <th class="num">Unidades / Part.</th>
                  <th class="num">Precio unitario</th>
                  <th class="num">Importe</th>
                </tr>
              </thead>
              <tbody>
                @for (f of filasAportacionesFiltradas().slice(0, limiteFilas()); track $index) {
                  <tr>
                    <td class="mono">{{ fmt.fechaCorta(f.fecha) }}</td>
                    <td>
                      <span class="dot" [style.background]="f.color"></span>
                      {{ f.prodNombre }}
                    </td>
                    <td class="num mono">
                      {{ f.participaciones ? fmt.num(f.participaciones, 4) : '—' }}
                    </td>
                    <td class="num mono valor-privado">
                      {{ f.precio ? fmt.eur(f.precio, 2) : '—' }}
                    </td>
                    <td class="num mono valor-privado" [class]="f.esPasivo ? 'pos' : ''">
                      {{ fmt.eur(f.importe, 2) }}
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="5" class="vacio-celda">No hay aportaciones registradas para este filtro.</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>

          @if (filasAportacionesFiltradas().length > limiteFilas()) {
            <div class="tabla-pie-mas">
              <button type="button" class="btn-secundario btn-sm" (click)="limiteFilas.set(limiteFilas() + 50)">
                Mostrar más operaciones ({{ filasAportacionesFiltradas().length - limiteFilas() }} restantes)
              </button>
            </div>
          }
        </section>
      }

      <!-- MODAL EDITAR OBJETIVO -->
      @if (store.modalObjetivoAbierto()) {
        <div class="modal-backdrop" (click)="store.modalObjetivoAbierto.set(false)">
          <div class="modal-card" (click)="$event.stopPropagation()">
            <div class="modal-header">
              <h3>Objetivo y titular de la cartera</h3>
              <button type="button" class="btn-cerrar" (click)="store.modalObjetivoAbierto.set(false)">✕</button>
            </div>
            <form (ngSubmit)="guardarObjetivoModal()" class="modal-body">
              <div class="campo">
                <label for="obj-titular">Nombre o título de la cartera</label>
                <input id="obj-titular" type="text" [(ngModel)]="objTitular" name="titular" required />
              </div>
              <div class="campo">
                <label for="obj-etiqueta">Etiqueta de la meta</label>
                <input id="obj-etiqueta" type="text" [(ngModel)]="objEtiqueta" name="etiqueta" placeholder="Ej. Libertad financiera / Primeros 100.000 €" />
              </div>
              <div class="campo">
                <label for="obj-importe">Importe objetivo (€)</label>
                <input id="obj-importe" type="number" min="0" step="1000" [(ngModel)]="objImporte" name="importe" required />
              </div>
              <label class="check-row">
                <input type="checkbox" [(ngModel)]="objActivo" name="activo" />
                <span>Mostrar barra de progreso del objetivo en el panel principal</span>
              </label>
              <div class="modal-footer">
                <button type="button" class="btn-fantasma" (click)="store.modalObjetivoAbierto.set(false)">Cancelar</button>
                <button type="submit" class="btn-primario">Guardar objetivo</button>
              </div>
            </form>
          </div>
        </div>
      }
    }
  `,
})
export class PatrimonioTabComponent {
  readonly store = inject(PortfolioStoreService);
  readonly fmt = inject(FormatService);
  private readonly chart = inject(ChartService);
  protected readonly Math = Math;

  readonly vistasEvolucion: { id: VistaEvolucionId; etiqueta: string }[] = [
    { id: 'apilado', etiqueta: 'Apilado' },
    { id: 'total', etiqueta: 'Total vs invertido' },
    { id: 'dinero', etiqueta: 'Ganancia (€)' },
    { id: 'reparto', etiqueta: 'Peso (%)' },
  ];

  readonly rangosTiempo: { id: RangoId; etiqueta: string }[] = [
    { id: '1m', etiqueta: '1M' },
    { id: '3m', etiqueta: '3M' },
    { id: '6m', etiqueta: '6M' },
    { id: 'ytd', etiqueta: 'YTD' },
    { id: '1a', etiqueta: '1A' },
    { id: 'todo', etiqueta: 'Todo' },
  ];

  readonly agrupacionesDist: { id: AgrupacionDistId; etiqueta: string }[] = [
    { id: 'clase', etiqueta: 'Clase' },
    { id: 'producto', etiqueta: 'Producto' },
    { id: 'entidad', etiqueta: 'Entidad' },
    { id: 'tipo', etiqueta: 'Vehículo' },
  ];

  // Projection simulator signals
  readonly proyAnos = signal<number>(10);
  readonly proyRent = signal<number>(7);
  readonly proyAport = signal<number>(500);
  private proyInicializado = false;

  // Contributions table state
  readonly filtroProdTabla = signal<string>('todos');
  readonly ordenTabla = signal<'fecha' | 'importe'>('fecha');
  readonly limiteFilas = signal<number>(30);

  // Goal modal fields
  objTitular = '';
  objEtiqueta = '';
  objImporte = 100000;
  objActivo = true;

  constructor() {
    effect(() => {
      const d = this.store.datos();
      if (d && !this.proyInicializado) {
        this.proyInicializado = true;
        const ritmoRedondeado = Math.round((d.total.ritmoMensual || 300) / 50) * 50;
        this.proyAport.set(Math.min(4000, Math.max(0, ritmoRedondeado)));
      }
    });
  }

  readonly metricasActivas = computed(() => {
    return this.store.filtrando()
      ? this.store.metricasVisibles()
      : this.store.metricasTodo();
  });

  readonly ajusteVivoEur = computed<number>(() => {
    const d = this.store.datos();
    const eurVivo = this.store.btcVivo();
    if (!d?.vivo || !eurVivo) return 0;
    const vis = this.store.visibles();
    const prodVivo = vis.find((c) => c.id === d.vivo!.productoId);
    if (!prodVivo || !d.vivo.btcRef) return 0;
    const factor = eurVivo / d.vivo.btcRef;
    const nuevoValor = d.vivo.titulos * d.vivo.precioRef * factor;
    return nuevoValor - prodVivo.valor;
  });

  readonly patrimonioMostrado = computed<number>(() => {
    return this.metricasActivas().valor + this.ajusteVivoEur();
  });

  readonly plusvaliaMostrada = computed<number | null>(() => {
    const m = this.metricasActivas();
    if (m.plusvalia === null) return null;
    return m.plusvalia + this.ajusteVivoEur();
  });

  readonly rentabilidadMostrada = computed<number | null>(() => {
    const m = this.metricasActivas();
    const plus = this.plusvaliaMostrada();
    if (m.aportado <= 0 || plus === null) return null;
    return plus / m.aportado;
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

  readonly estimacionObjetivoTexto = computed<string>(() => {
    const falta = this.faltaObjetivo();
    const ritmo = this.store.datos()?.total.ritmoMensual || 0;
    if (falta <= 0 || ritmo <= 0) return '';
    const meses = Math.ceil(falta / ritmo);
    if (meses < 12) return `~${meses} meses al ritmo actual`;
    const anos = (meses / 12).toFixed(1).replace('.0', '');
    return `~${anos} años al ritmo actual`;
  });

  readonly hayLargoPlazo = computed<boolean>(() => {
    const todos = this.store.todosComponentes();
    const conLP = todos.filter((c) => c.largoPlazo);
    return conLP.length > 0 && conLP.length < todos.length;
  });

  colorPrimario(c: ProductoCalculado): string {
    if (Array.isArray(c.color)) return c.color[0];
    if (Array.isArray(c.slotColor)) return c.slotColor[0];
    return '#10b981';
  }

  valorComponenteVivo(c: ProductoCalculado): number {
    const d = this.store.datos();
    const eurVivo = this.store.btcVivo();
    if (d?.vivo && eurVivo && c.id === d.vivo.productoId && d.vivo.btcRef > 0) {
      return d.vivo.titulos * d.vivo.precioRef * (eurVivo / d.vivo.btcRef);
    }
    return c.valor;
  }

  pesoComponente(c: ProductoCalculado): number {
    const posTotal = this.store
      .todosComponentes()
      .filter((x) => x.valor > 0)
      .reduce((s, x) => s + x.valor, 0);
    if (posTotal <= 0 || c.valor <= 0) return 0;
    return c.valor / posTotal;
  }

  onClickPill(ev: MouseEvent, id: string): void {
    const solo = ev.altKey || ev.metaKey || ev.ctrlKey;
    this.store.toggleComponente(id, solo);
  }

  onClickTarjetaProducto(c: ProductoCalculado): void {
    const esProductoInversion = this.store
      .datos()
      ?.productos.some((p) => p.id === c.id);
    if (esProductoInversion) {
      this.store.irAProducto(c.id);
    } else {
      this.store.toggleComponente(c.id, false);
    }
  }

  tituloEvolucion(): string {
    const v = this.store.vistaEvolucion();
    if (v === 'apilado') return 'Evolución del patrimonio por activo';
    if (v === 'total') return 'Patrimonio total frente a capital invertido';
    if (v === 'dinero') return 'Ganancia o pérdida acumulada (€)';
    return 'Evolución del peso de cada activo (%)';
  }

  subtituloEvolucion(): string {
    const v = this.store.vistaEvolucion();
    if (v === 'apilado')
      return 'Cada franja muestra el valor diario de un producto; la línea discontinua indica tu dinero invertido.';
    if (v === 'total')
      return 'La distancia entre el área de patrimonio y la línea punteada es el beneficio generado por el mercado.';
    if (v === 'dinero')
      return 'Plusvalía neta en euros por encima o por debajo de todo el capital que has aportado.';
    return 'Cómo ha cambiado el reparto porcentual de tu cartera a lo largo del tiempo.';
  }

  readonly renderEvolucionFn = computed<ChartRenderFn>(() => {
    const d = this.store.datos();
    const vista = this.store.vistaEvolucion();
    const desde = this.store.desdeIdx();
    const fechas = this.store.fechasCortadas();
    const comps = this.store.visibles();
    const m = this.metricasActivas();
    const tema = this.store.tema();
    void tema;

    return (el: HTMLElement) => {
      if (!d || !fechas.length || !comps.length) return;
      const cortar = (arr: (number | null)[] | undefined) =>
        arr ? arr.slice(desde) : [];

      if (vista === 'apilado' || vista === 'reparto') {
        const series = comps.map((c) => ({
          id: c.id,
          nombre: c.corto || c.nombre,
          color: (c.color || this.fmt.colorDeSlot(c.slot || 0)) as [string, string],
          valores: cortar(c.serie).map((v) => v || 0),
        }));
        const lineaExtra =
          vista === 'apilado' && m.aportado > 0
            ? {
                nombre: 'Dinero invertido',
                valores: cortar(m.serieAportado),
                color: '#94a3b8',
              }
            : null;
        this.chart.areaApilada(el, {
          fechas,
          series,
          modo: vista === 'reparto' ? 'porcentaje' : 'absoluto',
          lineaExtra,
          altura: 350,
        });
      } else if (vista === 'total') {
        const eventos: { fecha: string; importe: number; texto: string }[] = [];
        comps.forEach((c) => {
          (c.aportaciones || []).forEach((a) => {
            if (a.fecha >= fechas[0]) {
              eventos.push({
                fecha: a.fecha,
                importe: a.importe,
                texto: c.corto || c.nombre,
              });
            }
          });
        });
        this.chart.lineaConEventos(el, {
          fechas,
          valores: cortar(m.serie),
          secundaria: m.aportado > 0 ? cortar(m.serieAportado) : undefined,
          etiquetaPri: 'Patrimonio',
          etiquetaSec: 'Dinero invertido',
          color: ['#10b981', '#059669'],
          eventos,
          altura: 350,
        });
      } else if (vista === 'dinero') {
        const inv = comps.filter(
          (c) => c.aportado !== null && c.aportado !== undefined
        );
        const ganancia = fechas.map((_, idx) => {
          const i = idx + desde;
          let val = 0;
          let ap = 0;
          inv.forEach((c) => {
            val += c.serie?.[i] || 0;
            ap += c.serieAportado?.[i] || 0;
          });
          return ap > 0 ? val - ap : 0;
        });
        const ultimo = ganancia[ganancia.length - 1] || 0;
        this.chart.lineaConEventos(el, {
          fechas,
          valores: ganancia,
          etiquetaPri: 'Ganancia acumulada',
          color:
            ultimo >= 0 ? ['#10b981', '#059669'] : ['#f43f5e', '#e11d48'],
          altura: 350,
        });
      }
    };
  });

  crearSparklineFn(c: ProductoCalculado): ChartRenderFn {
    const desde = this.store.desdeIdx();
    const color = this.colorPrimario(c);
    const valores = (c.serie || []).slice(desde);
    return (el: HTMLElement) => {
      this.chart.sparkline(el, valores, color);
    };
  }

  readonly gruposDistribucion = computed<GrupoAgrupado[]>(() => {
    const agr = this.store.agrupacionDist();
    const comps = this.store.visibles().filter((c) => c.valor > 0);
    const totalPos = comps.reduce((s, c) => s + c.valor, 0);
    if (!comps.length || totalPos <= 0) return [];

    if (agr === 'producto') {
      return comps
        .map((c) => ({
          nombre: c.corto || c.nombre,
          valor: c.valor,
          peso: c.valor / totalPos,
          color: (c.color || this.fmt.colorDeSlot(c.slot || 0)) as [string, string],
        }))
        .sort((a, b) => b.valor - a.valor);
    }

    const mapa = new Map<string, number>();
    for (const c of comps) {
      let clave = 'Otros';
      if (agr === 'clase') clave = c.clase || c.tipo || 'Otros';
      else if (agr === 'entidad') clave = c.entidad || 'Sin entidad';
      else if (agr === 'tipo') clave = c.tipo || 'Otros';
      mapa.set(clave, (mapa.get(clave) || 0) + c.valor);
    }

    return Array.from(mapa.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([nombre, valor], idx) => ({
        nombre,
        valor,
        peso: valor / totalPos,
        color: this.fmt.colorDeSlot(idx),
      }));
  });

  colorGrupo(g: GrupoAgrupado): string {
    return Array.isArray(g.color) ? g.color[0] : g.color;
  }

  readonly renderDonutFn = computed<ChartRenderFn>(() => {
    const grupos = this.gruposDistribucion();
    const total = grupos.reduce((s, g) => s + g.valor, 0);
    const tema = this.store.tema();
    void tema;
    return (el: HTMLElement) => {
      this.chart.donut(el, {
        grupos,
        centroValor: this.fmt.eurCompacto(total),
        centroSub: 'Activos',
      });
    };
  });

  readonly resumenAportacionesMesTexto = computed<string>(() => {
    const d = this.store.datos();
    if (!d?.aportacionesMensuales?.meses?.length) return 'Sin aportaciones mensuales';
    const visIds = new Set(this.store.visibles().map((c) => c.id));
    const meses = d.aportacionesMensuales.meses;
    let total = 0;
    let mesesConAport = 0;
    meses.forEach((_, idx) => {
      let sumaMes = 0;
      for (const [id, arr] of Object.entries(d.aportacionesMensuales.porProducto)) {
        if (visIds.has(id)) sumaMes += arr[idx] || 0;
      }
      if (sumaMes > 0) {
        total += sumaMes;
        mesesConAport++;
      }
    });
    const media = mesesConAport > 0 ? total / mesesConAport : 0;
    return `Total aportado: ${this.fmt.eur(total, 0)} · Media en meses activos: ${this.fmt.eur(media, 0)}/mes`;
  });

  readonly renderAportacionesMesFn = computed<ChartRenderFn>(() => {
    const d = this.store.datos();
    const vis = this.store.visibles();
    const tema = this.store.tema();
    void tema;
    return (el: HTMLElement) => {
      const am = d?.aportacionesMensuales;
      if (!am || !am.meses.length) return;
      const series = vis
        .filter((c) => am.porProducto[c.id]?.some((v) => v > 0))
        .map((c) => ({
          id: c.id,
          nombre: c.corto || c.nombre,
          color: (c.color || this.fmt.colorDeSlot(c.slot || 0)) as [string, string],
          valores: am.porProducto[c.id] || new Array(am.meses.length).fill(0),
        }));
      this.chart.barrasApiladas(el, {
        categorias: am.meses,
        series,
        altura: 250,
      });
    };
  });

  porcentajeHito(importe: number): number {
    const pat = this.patrimonioMostrado();
    if (importe <= 0) return 0;
    return Math.min(100, Math.max(0, (pat / importe) * 100));
  }

  readonly anioFuturo = computed<number>(() => {
    return new Date().getFullYear() + this.proyAnos();
  });

  readonly datosProyeccion = computed(() => {
    const actual = Math.max(0, this.patrimonioMostrado());
    const anos = this.proyAnos();
    const rAnual = this.proyRent() / 100;
    const rMes = Math.pow(1 + rAnual, 1 / 12) - 1;
    const aportMes = this.proyAport();
    const meses = anos * 12;

    const fechas: string[] = [];
    const serieTotal: number[] = [];
    const serieAport: number[] = [];

    const hoy = new Date();
    let saldo = actual;
    let aportado = actual;

    for (let m = 0; m <= meses; m++) {
      const f = new Date(hoy.getFullYear(), hoy.getMonth() + m, 1);
      fechas.push(f.toISOString().slice(0, 10));
      serieTotal.push(saldo);
      serieAport.push(aportado);
      saldo = saldo * (1 + rMes) + aportMes;
      aportado += aportMes;
    }

    const finalTotal = serieTotal[serieTotal.length - 1] || actual;
    const finalAportado = serieAport[serieAport.length - 1] || actual;
    return {
      fechas,
      serieTotal,
      serieAport,
      finalTotal,
      finalAportado,
      ganancia: finalTotal - finalAportado,
    };
  });

  readonly renderProyeccionFn = computed<ChartRenderFn>(() => {
    const p = this.datosProyeccion();
    const tema = this.store.tema();
    void tema;
    return (el: HTMLElement) => {
      this.chart.lineaConEventos(el, {
        fechas: p.fechas,
        valores: p.serieTotal,
        secundaria: p.serieAport,
        etiquetaPri: 'Patrimonio proyectado',
        etiquetaSec: 'Capital aportado',
        color: ['#f59e0b', '#d97706'],
        altura: 200,
      });
    };
  });

  readonly filasAportacionesFiltradas = computed<FilaAportacionTabla[]>(() => {
    const comps = this.store.visibles();
    const filtro = this.filtroProdTabla();
    const orden = this.ordenTabla();
    const filas: FilaAportacionTabla[] = [];

    for (const c of comps) {
      if (filtro !== 'todos' && c.id !== filtro) continue;
      for (const a of c.aportaciones || []) {
        filas.push({
          fecha: a.fecha,
          importe: a.importe,
          participaciones: a.participaciones,
          precio: a.precio,
          prodId: c.id,
          prodNombre: c.nombre,
          color: this.colorPrimario(c),
          etqPrecio: c.etqPrecio || 'Precio',
          esPasivo: c.tipoClave === 'deuda',
        });
      }
    }

    if (orden === 'importe') {
      filas.sort((a, b) => Math.abs(b.importe) - Math.abs(a.importe));
    } else {
      filas.sort((a, b) => b.fecha.localeCompare(a.fecha));
    }
    return filas;
  });

  readonly sumaAportacionesFiltradas = computed<number>(() => {
    return this.filasAportacionesFiltradas().reduce((s, f) => s + f.importe, 0);
  });

  abrirModalObjetivo(): void {
    const d = this.store.datos();
    this.objTitular = d?.titular || 'Mi Cartera';
    this.objEtiqueta = d?.objetivo?.etiqueta || 'Objetivo de patrimonio';
    this.objImporte = d?.objetivo?.importe || 100000;
    this.objActivo = d?.objetivo?.activo ?? true;
    this.store.modalObjetivoAbierto.set(true);
  }

  async guardarObjetivoModal(): Promise<void> {
    const ok = await this.store.guardarObjetivo(
      this.objTitular.trim() || 'Mi Cartera',
      Number(this.objImporte) || 0,
      this.objEtiqueta.trim() || 'Objetivo de patrimonio',
      this.objActivo
    );
    if (ok) {
      this.store.modalObjetivoAbierto.set(false);
    }
  }

  irANuevoProducto(): void {
    this.store.subTabDatos.set('productos');
    this.store.tabActiva.set('datos');
  }

  irAImportar(): void {
    this.store.subTabDatos.set('importar');
    this.store.tabActiva.set('datos');
  }
}
