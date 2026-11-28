import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  AgrupacionDistId,
  PortfolioStoreService,
  RangoId,
  VistaEvolucionId,
} from '../../services/portfolio-store.service';
import { FormatService } from '../../services/format.service';
import { ChartRenderFn, ChartService } from '../../services/chart.service';
import { SvgChartComponent } from '../svg-chart/svg-chart.component';
import { ObjetivoModalComponent } from '../modals/objetivo-modal/objetivo-modal.component';
import { IconComponent } from '../icon/icon.component';
import { CapTooltipDirective } from '../../directives/tooltip.directive';
import { GrupoAgrupado, ProductoCalculado } from '../../models/portfolio.model';
import { SaludFinancieraCardComponent } from './salud-financiera-card.component';
import { ProyeccionCardComponent } from './proyeccion-card.component';
import { HeroPatrimonioComponent } from './hero-patrimonio.component';
import { HitosPatrimonioComponent } from './hitos-patrimonio.component';
import { TablaAportacionesComponent } from './tabla-aportaciones.component';

interface ItemPatrimonioGrupo {
  esGrupo: true;
  grupoId: string;
  nombre: string;
  entidad?: string;
  color: string;
  colorPar: [string, string];
  miembros: ProductoCalculado[];
  ids: string[];
  valor: number;
  aportado: number | null;
  plusvalia: number | null;
  rentabilidad: number | null;
  serie: (number | null)[];
  oculto: boolean;
}

interface ItemPatrimonioSuelto {
  esGrupo: false;
  comp: ProductoCalculado;
}

type ItemPatrimonio = ItemPatrimonioGrupo | ItemPatrimonioSuelto;

@Component({
  selector: 'cap-patrimonio-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    SvgChartComponent,
    ObjetivoModalComponent,
    IconComponent,
    CapTooltipDirective,
    SaludFinancieraCardComponent,
    ProyeccionCardComponent,
    HeroPatrimonioComponent,
    HitosPatrimonioComponent,
    TablaAportacionesComponent,
  ],
  template: `
    @if (store.datos(); as d) {
      @if (d.modo === 'demo') {
        <div class="aviso-demo">
          <div class="aviso-demo-txt">
            <span class="badge-demo">Demo</span>
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
          <div class="bienvenida-icono"><cap-icon name="sparkle" [size]="28" /></div>
          <h2>Tu cartera en Capitalia está lista para empezar</h2>
          <p>
            Añade tus fondos indexados, ETFs, acciones, criptomonedas, cuentas remuneradas, inmuebles o préstamos. Capitalia descargará automáticamente las cotizaciones históricas y calculará tu rentabilidad TIR y FIFO.
          </p>
          <div class="bienvenida-acciones">
            <button type="button" class="btn-primario" (click)="irANuevoProducto()">
              <cap-icon name="plus" [size]="15" />
              <span>Añadir mi primer producto</span>
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
        <cap-hero-patrimonio
          [patrimonioMostrado]="patrimonioMostrado()"
          [plusvaliaMostrada]="plusvaliaMostrada()"
          [rentabilidadMostrada]="rentabilidadMostrada()"
          [ajusteVivoEur]="ajusteVivoEur()"
          [metricasActivas]="metricasActivas()"
          [proyRent]="proyRent()"
          (abrirObjetivo)="abrirModalObjetivo()"
        />

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

          @for (item of itemsPatrimonio(); track item.esGrupo ? 'grp-' + item.grupoId : item.comp.id) {
            @if (item.esGrupo) {
              <button
                type="button"
                class="pill"
                [class.on]="!item.oculto"
                [class.off]="item.oculto"
                (click)="onClickPillGrupo($event, item.ids)"
                (dblclick)="store.toggleGrupoComponentes(item.ids, true)"
                capTooltip="Clic: mostrar/ocultar toda la cartera · Doble clic o Alt+clic: ver solo esta cartera"
              >
                <span class="dot" [style.background]="item.color"></span>
                <span>{{ item.nombre }} ({{ item.miembros.length }})</span>
                <span class="pill-val valor-privado">{{ fmt.eurCompacto(item.valor) }}</span>
              </button>
            } @else {
              @let comp = item.comp;
              <button
                type="button"
                class="pill"
                [class.on]="!store.ocultos().has(comp.id)"
                [class.off]="store.ocultos().has(comp.id)"
                (click)="onClickPill($event, comp.id)"
                (dblclick)="store.toggleComponente(comp.id, true)"
                capTooltip="Clic: mostrar/ocultar · Doble clic o Alt+clic: ver solo este activo"
              >
                <span class="dot" [style.background]="colorPrimario(comp)"></span>
                <span>{{ comp.corto || comp.nombre }}</span>
                <span class="pill-val valor-privado">{{ fmt.eurCompacto(comp.valor) }}</span>
              </button>
            }
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
            <div
              class="kpi-val valor-privado"
              [class.pos]="fmt.claseSigno(plusvaliaMostrada()) === 'pos'"
              [class.neg]="fmt.claseSigno(plusvaliaMostrada()) === 'neg'"
            >
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
            <div
              class="kpi-val"
              [class.pos]="fmt.claseSigno(rentabilidadMostrada()) === 'pos'"
              [class.neg]="fmt.claseSigno(rentabilidadMostrada()) === 'neg'"
            >
              {{ rentabilidadMostrada() !== null ? fmt.pctSigno(rentabilidadMostrada(), 2) : '—' }}
            </div>
            <span class="kpi-sub">Sobre el capital invertido</span>
          </article>

          <article class="kpi-card">
            <span class="kpi-label">Rentabilidad anual (TIR)</span>
            <div
              class="kpi-val"
              [class.pos]="fmt.claseSigno(metricasActivas().tir) === 'pos'"
              [class.neg]="fmt.claseSigno(metricasActivas().tir) === 'neg'"
            >
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
            <div class="kpi-val" [class.neg]="metricasActivas().caida < 0">
              {{ fmt.pct(metricasActivas().caida, 1) }}
            </div>
            <span class="kpi-sub">
              {{
                metricasActivas().caidaFecha
                  ? 'Mínimo el ' + fmt.fechaCorta(metricasActivas().caidaFecha!) + ' · Sobre rentabilidad real (TWR)'
                  : 'Sin caídas registradas'
              }}
            </span>
          </article>
        </section>

        <!-- SALUD FINANCIERA -->
        @if (d.salud; as sal) {
          <cap-salud-financiera-card
            [salud]="sal"
            (configurarGasto)="abrirModalObjetivo()"
          />
        }

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
            <button type="button" class="btn-secundario btn-sm" (click)="irAGestionDatos()">
              <cap-icon name="plus" [size]="14" />
              <span>Anotar operación</span>
            </button>
          </div>

          <div class="productos-grid">
            @for (item of itemsPatrimonio(); track item.esGrupo ? 'grp-' + item.grupoId : item.comp.id) {
              @if (item.esGrupo) {
                <article
                  class="prod-card prod-card-group"
                  [class.prod-oculto]="item.oculto"
                  [style.--prod-color]="item.color"
                  (click)="store.irAGrupo(item.grupoId)"
                >
                  <div class="prod-card-top">
                    <div class="prod-ident">
                      <span class="prod-dot" [style.background]="item.color"></span>
                      <div>
                        <h3 class="prod-nombre">{{ item.nombre }}</h3>
                        <div class="prod-tags">
                          <span class="pm-type-badge pm-type-cartera">
                            Cartera · {{ item.miembros.length }} productos
                          </span>
                          @if (item.entidad) {
                            <span class="tag prod-bank-tag">
                              @if (logoEntidad(item.entidad); as logoUrl) {
                                <img
                                  [src]="logoUrl"
                                  alt=""
                                  (error)="marcarLogoFallido(logoUrl)"
                                />
                              }
                              {{ item.entidad }}
                            </span>
                          }
                        </div>
                      </div>
                    </div>

                    <div class="prod-valor-box">
                      <div class="prod-valor valor-privado">
                        {{ fmt.eur(item.valor, 2) }}
                      </div>
                      <div class="prod-peso mono">
                        {{ fmt.pct(pesoValor(item.valor), 1) }} del total
                      </div>
                    </div>
                  </div>

                  <div class="prod-spark">
                    <cap-svg-chart
                      [renderFn]="crearSparklineSerieFn(item.serie, item.color)"
                      [minHeight]="48"
                    />
                  </div>

                  <div class="prod-metricas">
                    <div>
                      <span class="pm-etq">Invertido</span>
                      <strong class="pm-val valor-privado">
                        {{ item.aportado !== null ? fmt.eur(item.aportado, 0) : '—' }}
                      </strong>
                    </div>
                    <div>
                      <span class="pm-etq">Ganancia</span>
                      <strong
                        class="pm-val valor-privado"
                        [class.pos]="fmt.claseSigno(item.plusvalia) === 'pos'"
                        [class.neg]="fmt.claseSigno(item.plusvalia) === 'neg'"
                      >
                        {{ item.plusvalia !== null ? fmt.eurSigno(item.plusvalia, 0) : '—' }}
                      </strong>
                    </div>
                    <div>
                      <span class="pm-etq">Rentab.</span>
                      <strong
                        class="pm-val"
                        [class.pos]="fmt.claseSigno(item.rentabilidad) === 'pos'"
                        [class.neg]="fmt.claseSigno(item.rentabilidad) === 'neg'"
                      >
                        {{ item.rentabilidad !== null ? fmt.pctSigno(item.rentabilidad, 1) : '—' }}
                      </strong>
                    </div>
                    <div>
                      <span class="pm-etq">Fondos</span>
                      <strong class="pm-val mono">{{ item.miembros.length }}</strong>
                    </div>
                  </div>

                  <div class="prod-group-footer" (click)="$event.stopPropagation()">
                    <button
                      type="button"
                      class="prod-group-toggle"
                      [attr.aria-expanded]="esGrupoExpandido(item.grupoId)"
                      (click)="alternarGrupo(item.grupoId)"
                    >
                      <span>
                        {{
                          esGrupoExpandido(item.grupoId)
                            ? 'Ocultar productos'
                            : 'Ver ' + item.miembros.length + ' productos incluidos'
                        }}
                      </span>
                      <cap-icon
                        [name]="esGrupoExpandido(item.grupoId) ? 'chevron-down' : 'chevron-right'"
                        [size]="14"
                      />
                    </button>
                    <span class="prod-card-hint-inline">
                      <span>Ver cartera</span>
                      <cap-icon name="arrow-right" [size]="13" />
                    </span>
                  </div>

                  @if (esGrupoExpandido(item.grupoId)) {
                    <div class="prod-group-members" (click)="$event.stopPropagation()">
                      @for (m of item.miembros; track m.id) {
                        @let valM = valorComponenteVivo(m);
                        <button
                          type="button"
                          class="prod-group-member-btn"
                          (click)="store.irAProducto(m.id)"
                        >
                          <span class="prod-group-member-name">
                            <span class="dot" [style.background]="colorPrimario(m)"></span>
                            <span>{{ m.corto || m.nombre }}</span>
                          </span>
                          <span class="prod-group-member-nums mono valor-privado">
                            <span>{{ fmt.eur(valM, 0) }}</span>
                            @if (item.valor > 0) {
                              <small class="muted">{{ fmt.pct(valM / item.valor, 0) }}</small>
                            }
                          </span>
                        </button>
                      }
                    </div>
                  }
                </article>
              } @else {
                @let c = item.comp;
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
                            <span class="tag prod-bank-tag">
                              @if (logoEntidad(c.entidad); as logoUrl) {
                                <img
                                  [src]="logoUrl"
                                  alt=""
                                  (error)="marcarLogoFallido(logoUrl)"
                                />
                              }
                              {{ c.entidad }}
                            </span>
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
                      <strong
                        class="pm-val valor-privado"
                        [class.pos]="fmt.claseSigno(c.plusvalia) === 'pos'"
                        [class.neg]="fmt.claseSigno(c.plusvalia) === 'neg'"
                      >
                        {{ c.plusvalia !== null && c.plusvalia !== undefined ? fmt.eurSigno(c.plusvalia, 0) : '—' }}
                      </strong>
                    </div>
                    <div>
                      <span class="pm-etq">Rentab.</span>
                      <strong
                        class="pm-val"
                        [class.pos]="fmt.claseSigno(c.rentabilidad) === 'pos'"
                        [class.neg]="fmt.claseSigno(c.rentabilidad) === 'neg'"
                      >
                        {{ c.rentabilidad !== null && c.rentabilidad !== undefined ? fmt.pctSigno(c.rentabilidad, 1) : '—' }}
                      </strong>
                    </div>
                    <div>
                      <span class="pm-etq">TIR</span>
                      <strong
                        class="pm-val"
                        [class.pos]="fmt.claseSigno(c.tir) === 'pos'"
                        [class.neg]="fmt.claseSigno(c.tir) === 'neg'"
                      >
                        {{ c.tir !== null && c.tir !== undefined ? fmt.pctSigno(c.tir, 1) : '—' }}
                      </strong>
                    </div>
                  </div>

                  @if (esProductoInversion(c.id)) {
                    <div class="prod-card-hint">
                      <span>Ver ficha técnica</span>
                      <cap-icon class="prod-card-arrow" name="arrow-right" [size]="13" />
                    </div>
                  }
                </article>
              }
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
            <cap-svg-chart [renderFn]="renderAportacionesMesFn()" [minHeight]="300" />
          </section>
        </div>

        <!-- HITOS Y SIMULADOR DE PROYECCIÓN FUTURA -->
        <div class="dos-columnas bloque-seccion">
          <cap-hitos-patrimonio
            [hitos]="d.total.hitos || []"
            [patrimonioActual]="patrimonioMostrado()"
            [patrimonioBase]="d.total.patrimonio"
          />

          <cap-proyeccion-card
            [patrimonioActual]="patrimonioMostrado()"
            [objetivo]="d.objetivo || null"
            [ritmoMensualSugerido]="d.total?.ritmoMensual || 300"
            [carteraVacia]="store.carteraVacia()"
            [(proyRent)]="proyRent"
          />
        </div>

        <!-- TABLA HISTÓRICA DE APORTACIONES -->
        <cap-tabla-aportaciones />
      }

      <!-- MODAL EDITAR OBJETIVO (COMPONENTE SEPARADO) -->
      <cap-objetivo-modal />
    }
  `,
})
export class PatrimonioTabComponent {
  readonly store = inject(PortfolioStoreService);
  readonly fmt = inject(FormatService);
  private readonly chart = inject(ChartService);
  private readonly router = inject(Router);

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

  // Expected projection return rate (bound to ProyeccionCardComponent)
  readonly proyRent = signal<number>(7);
  readonly gruposExpandidos = signal<Set<string>>(new Set());

  readonly logosFallidos = signal<Set<string>>(new Set());

  readonly itemsPatrimonio = computed<ItemPatrimonio[]>(() => {
    const todos = this.store.todosComponentes();
    const ocultos = this.store.ocultos();
    const grupos = new Map<string, ProductoCalculado[]>();
    const orden: ({ esGrupo: true; gid: string } | { esGrupo: false; comp: ProductoCalculado })[] = [];

    for (const c of todos) {
      const gid = (c.grupoId || '').trim().toLowerCase();
      if (!gid) {
        orden.push({ esGrupo: false, comp: c });
        continue;
      }
      if (!grupos.has(gid)) {
        grupos.set(gid, []);
        orden.push({ esGrupo: true, gid });
      }
      grupos.get(gid)!.push(c);
    }

    return orden.map((entry) => {
      if (!entry.esGrupo) {
        return { esGrupo: false, comp: entry.comp };
      }
      const miembros = grupos.get(entry.gid)!;
      const primero = miembros[0];
      const valor = miembros.reduce((s, m) => s + this.valorComponenteVivo(m), 0);
      const conAport = miembros.filter((m) => m.aportado !== null && m.aportado !== undefined);
      const aportado = conAport.length
        ? conAport.reduce((s, m) => s + (m.aportado || 0), 0)
        : null;
      const conPlus = miembros.filter((m) => m.plusvalia !== null && m.plusvalia !== undefined);
      const plusvalia = conPlus.length
        ? conPlus.reduce(
            (s, m) => s + (m.plusvalia || 0) + this.store.ajusteVivoProducto(m),
            0,
          )
        : null;
      const rentabilidad =
        aportado && aportado > 0 && plusvalia !== null ? plusvalia / aportado : null;
      const lenSerie = Math.max(0, ...miembros.map((m) => m.serie?.length || 0));
      const serie: (number | null)[] = new Array(lenSerie).fill(null);
      for (let i = 0; i < lenSerie; i++) {
        let sum = 0;
        let hay = false;
        for (const m of miembros) {
          const v = m.serie?.[i];
          if (v !== null && v !== undefined) {
            sum += v;
            hay = true;
          }
        }
        serie[i] = hay ? Math.round(sum * 100) / 100 : null;
      }
      const colorPar = (primero.color ||
        primero.slotColor ||
        this.fmt.colorDeSlot(primero.slot || 0)) as [string, string];
      const ids = miembros.map((m) => m.id);
      return {
        esGrupo: true,
        grupoId: entry.gid,
        nombre: primero.grupoNombre || entry.gid,
        entidad: primero.entidad,
        color: Array.isArray(colorPar) ? colorPar[0] : '#10b981',
        colorPar,
        miembros,
        ids,
        valor,
        aportado,
        plusvalia,
        rentabilidad,
        serie,
        oculto: ids.every((id) => ocultos.has(id)),
      };
    });
  });

  readonly logosBancos = computed<Map<string, string>>(() => {
    const mapa = new Map<string, string>();
    for (const lista of [this.store.bancosCatalogo(), this.store.bancosRecientes()]) {
      for (const b of lista) {
        if (b.logo) {
          mapa.set(b.nombre.trim().toLowerCase(), b.logo);
        }
      }
    }
    return mapa;
  });

  constructor() {
    void this.store.cargarBancosIniciales();
  }

  logoEntidad(entidad?: string | null): string | null {
    const clave = (entidad || '').trim().toLowerCase();
    if (!clave) return null;
    const url = this.logosBancos().get(clave) || null;
    if (!url || this.logosFallidos().has(url)) return null;
    return url;
  }

  marcarLogoFallido(url: string): void {
    this.logosFallidos.update((prev) => {
      const next = new Set(prev);
      next.add(url);
      return next;
    });
  }

  esProductoInversion(id: string): boolean {
    return Boolean(this.store.datos()?.productos?.some((p) => p.id === id));
  }

  readonly metricasActivas = computed(() => {
    return this.store.filtrando()
      ? this.store.metricasVisibles()
      : this.store.metricasTodo();
  });

  readonly ajusteVivoEur = computed<number>(() => {
    return this.store
      .visibles()
      .reduce((acc, c) => acc + this.store.ajusteVivoProducto(c), 0);
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
    return this.store.valorProductoConVivo(c);
  }

  pesoComponente(c: ProductoCalculado): number {
    return this.pesoValor(this.store.valorProductoConVivo(c));
  }

  pesoValor(val: number): number {
    const posTotal = this.store
      .todosComponentes()
      .map((x) => this.store.valorProductoConVivo(x))
      .filter((v) => v > 0)
      .reduce((s, v) => s + v, 0);
    if (posTotal <= 0 || val <= 0) return 0;
    return val / posTotal;
  }

  esGrupoExpandido(grupoId: string): boolean {
    return this.gruposExpandidos().has(grupoId);
  }

  alternarGrupo(grupoId: string): void {
    this.gruposExpandidos.update((prev) => {
      const next = new Set(prev);
      if (next.has(grupoId)) next.delete(grupoId);
      else next.add(grupoId);
      return next;
    });
  }

  onClickPill(ev: MouseEvent, id: string): void {
    const solo = ev.altKey || ev.metaKey || ev.ctrlKey;
    this.store.toggleComponente(id, solo);
  }

  onClickPillGrupo(ev: MouseEvent, ids: string[]): void {
    const solo = ev.altKey || ev.metaKey || ev.ctrlKey;
    this.store.toggleGrupoComponentes(ids, solo);
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

  private agruparVisiblesPorGrupo(comps: ProductoCalculado[]): {
    id: string;
    nombre: string;
    colorPar: [string, string];
    miembros: ProductoCalculado[];
    valorTotal: number;
  }[] {
    const map = new Map<string, ProductoCalculado[]>();
    const orden: ({ esGrupo: true; gid: string } | { esGrupo: false; comp: ProductoCalculado })[] = [];

    for (const c of comps) {
      const gid = (c.grupoId || '').trim().toLowerCase();
      if (!gid) {
        orden.push({ esGrupo: false, comp: c });
        continue;
      }
      if (!map.has(gid)) {
        map.set(gid, []);
        orden.push({ esGrupo: true, gid });
      }
      map.get(gid)!.push(c);
    }

    return orden.map((entry) => {
      if (!entry.esGrupo) {
        const c = entry.comp;
        return {
          id: c.id,
          nombre: c.corto || c.nombre,
          colorPar: (c.color || c.slotColor || this.fmt.colorDeSlot(c.slot || 0)) as [string, string],
          miembros: [c],
          valorTotal: this.valorComponenteVivo(c),
        };
      }
      const miembros = map.get(entry.gid)!;
      const primero = miembros[0];
      return {
        id: `grp-${entry.gid}`,
        nombre: primero.grupoNombre || entry.gid,
        colorPar: (primero.color || primero.slotColor || this.fmt.colorDeSlot(primero.slot || 0)) as [
          string,
          string,
        ],
        miembros,
        valorTotal: miembros.reduce((s, m) => s + this.valorComponenteVivo(m), 0),
      };
    });
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
        const agrupados = this.agruparVisiblesPorGrupo(comps);
        const series = agrupados.map((grp) => {
          const vals = fechas.map((_, idx) =>
            grp.miembros.reduce((s, mem) => s + (mem.serie?.[desde + idx] || 0), 0),
          );
          return {
            id: grp.id,
            nombre: grp.nombre,
            color: grp.colorPar,
            valores: vals,
          };
        });
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
    return this.crearSparklineSerieFn(c.serie || [], this.colorPrimario(c));
  }

  crearSparklineSerieFn(serie: (number | null)[], color: string): ChartRenderFn {
    const desde = this.store.desdeIdx();
    const valores = (serie || []).slice(desde);
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
      return this.agruparVisiblesPorGrupo(comps)
        .filter((g) => g.valorTotal > 0)
        .map((g) => ({
          nombre: g.nombre,
          valor: g.valorTotal,
          peso: g.valorTotal / totalPos,
          color: g.colorPar,
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
        altura: 300,
      });
    };
  });

  abrirModalObjetivo(): void {
    this.store.modalObjetivoAbierto.set(true);
  }

  irANuevoProducto(): void {
    this.store.subTabDatos.set('productos');
    this.store.tabActiva.set('datos');
    void this.router.navigate(['/datos']);
  }

  irAImportar(): void {
    this.store.subTabDatos.set('importar');
    this.store.tabActiva.set('datos');
    void this.router.navigate(['/datos']);
  }

  irAGestionDatos(): void {
    this.store.subTabDatos.set('movimientos');
    this.store.tabActiva.set('datos');
    void this.router.navigate(['/datos']);
  }
}
