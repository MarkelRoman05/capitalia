import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PortfolioStoreService } from '../../services/portfolio-store.service';
import { FormatService } from '../../services/format.service';
import { ProductoModalComponent } from '../modals/producto-modal/producto-modal.component';
import { MovimientoModalComponent } from '../modals/movimiento-modal/movimiento-modal.component';
import { ValoracionModalComponent } from '../modals/valoracion-modal/valoracion-modal.component';
import { LoteSaldosModalComponent } from '../modals/lote-saldos-modal/lote-saldos-modal.component';
import {
  InformeImportacion,
  MovimientoCfg,
  ProductoCalculado,
  ProductoCfg,
  ValoracionCfg,
} from '../../models/portfolio.model';

interface ArchivoLeido {
  nombre: string;
  base64: string;
}

@Component({
  selector: 'cap-datos-tab',
  imports: [
    FormsModule,
    ProductoModalComponent,
    MovimientoModalComponent,
    ValoracionModalComponent,
    LoteSaldosModalComponent,
  ],
  template: `
    @if (store.cartera(); as c) {
      <!-- SUB-NAVEGACIÓN DE MIS DATOS -->
      <div class="datos-subnav-bar">
        <nav class="datos-tabs" role="tablist" aria-label="Secciones de Mis datos">
          <button
            type="button"
            role="tab"
            class="datos-tab"
            [class.on]="store.subTabDatos() === 'productos'"
            [attr.aria-selected]="store.subTabDatos() === 'productos'"
            (click)="cambiarSubTab('productos')"
          >
            <svg
              class="datos-tab-ico"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.85"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <rect x="3" y="3" width="7" height="7" rx="1.5" />
              <rect x="14" y="3" width="7" height="7" rx="1.5" />
              <rect x="3" y="14" width="7" height="7" rx="1.5" />
              <rect x="14" y="14" width="7" height="7" rx="1.5" />
            </svg>
            <span>Productos</span>
            <span class="datos-tab-badge">{{ c.productos.length }}</span>
          </button>

          <button
            type="button"
            role="tab"
            class="datos-tab"
            [class.on]="store.subTabDatos() === 'movimientos'"
            [attr.aria-selected]="store.subTabDatos() === 'movimientos'"
            (click)="cambiarSubTab('movimientos')"
          >
            <svg
              class="datos-tab-ico"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.85"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" />
            </svg>
            <span>Compras y ventas</span>
            <span class="datos-tab-badge">{{ c.movimientos.length }}</span>
          </button>

          <button
            type="button"
            role="tab"
            class="datos-tab"
            [class.on]="store.subTabDatos() === 'saldos'"
            [attr.aria-selected]="store.subTabDatos() === 'saldos'"
            (click)="cambiarSubTab('saldos')"
          >
            <svg
              class="datos-tab-ico"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.85"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path
                d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"
              />
              <path d="M16 12h5v4h-5a2 2 0 0 1 0-4Z" />
            </svg>
            <span>Saldos y valores</span>
            <span class="datos-tab-badge">{{ c.valoraciones.length }}</span>
          </button>

          <button
            type="button"
            role="tab"
            class="datos-tab"
            [class.on]="store.subTabDatos() === 'importar'"
            [attr.aria-selected]="store.subTabDatos() === 'importar'"
            (click)="cambiarSubTab('importar')"
          >
            <svg
              class="datos-tab-ico"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.85"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <path d="M17 8l-5-5-5 5M12 3v12" />
            </svg>
            <span>Importar datos</span>
          </button>

          <button
            type="button"
            role="tab"
            class="datos-tab"
            [class.on]="store.subTabDatos() === 'copias'"
            [attr.aria-selected]="store.subTabDatos() === 'copias'"
            (click)="cambiarSubTab('copias')"
          >
            <svg
              class="datos-tab-ico"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.85"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6l7-3Z" />
              <path d="M9.5 12l1.8 1.8L15 10" />
            </svg>
            <span>Copias y web</span>
          </button>
        </nav>

        <div class="datos-acciones-globales">
          <button
            type="button"
            class="btn-peligro-outline btn-sm"
            (click)="confirmarVaciarCartera()"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.9"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
            </svg>
            <span>Vaciar cartera</span>
          </button>
        </div>
      </div>

      <!-- ========================================================= -->
      <!-- 1. SUB-TAB: PRODUCTOS                                     -->
      <!-- ========================================================= -->
      @if (store.subTabDatos() === 'productos') {
        <section class="panel-card bloque-seccion">
          <div class="card-header">
            <div>
              <h2 class="card-title">Productos, cuentas, inmuebles y deudas</h2>
              <p class="card-sub">
                Configura cada activo de tu patrimonio. Los fondos, ETFs, acciones y cripto
                actualizan su cotización automáticamente.
              </p>
            </div>
            <div class="header-btns">
              @if (c.productos.length > 1) {
                <button
                  type="button"
                  class="btn-fantasma btn-sm"
                  (click)="store.repartirColores()"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.9"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 3v9l6.5 4.5" />
                  </svg>
                  <span>Repartir colores</span>
                </button>
              }
              <button type="button" class="btn-primario" (click)="abrirModalProducto()">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.2"
                  stroke-linecap="round"
                  aria-hidden="true"
                >
                  <path d="M12 5v14M5 12h14" />
                </svg>
                <span>Añadir producto</span>
              </button>
            </div>
          </div>

          @if (c.productos.length) {
            <div class="datos-kpi-strip">
              <div class="datos-kpi">
                <span>Total activos</span>
                <strong class="mono">{{ productosStats().total }}</strong>
              </div>
              <div class="datos-kpi">
                <span>Cotización automática</span>
                <strong class="mono">{{ productosStats().cotizados }}</strong>
              </div>
              <div class="datos-kpi">
                <span>Saldos manuales</span>
                <strong class="mono">{{ productosStats().manuales }}</strong>
              </div>
              <div class="datos-kpi">
                <span>Valor neto actual</span>
                <strong class="mono valor-privado">{{
                  fmt.eur(productosStats().valorTotal, 2)
                }}</strong>
              </div>
            </div>

            <div class="datos-toolbar">
              <div class="datos-search-wrap">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  aria-hidden="true"
                >
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-3.5-3.5" />
                </svg>
                <input
                  type="text"
                  [ngModel]="filtroProdTexto()"
                  (ngModelChange)="filtroProdTexto.set($event)"
                  placeholder="Buscar por nombre, ISIN, banco o clase…"
                  aria-label="Filtrar productos"
                />
                @if (filtroProdTexto()) {
                  <button
                    type="button"
                    class="pm-search-clear"
                    (click)="filtroProdTexto.set('')"
                    aria-label="Limpiar filtro"
                  >
                    ✕
                  </button>
                }
              </div>

              <div class="seg-group" role="group" aria-label="Filtrar por tipo de seguimiento">
                <button
                  type="button"
                  class="seg-btn"
                  [class.on]="filtroProdModo() === 'todos'"
                  (click)="filtroProdModo.set('todos')"
                >
                  Todos ({{ productosStats().total }})
                </button>
                <button
                  type="button"
                  class="seg-btn"
                  [class.on]="filtroProdModo() === 'cotizado'"
                  (click)="filtroProdModo.set('cotizado')"
                >
                  Cotizados ({{ productosStats().cotizados }})
                </button>
                <button
                  type="button"
                  class="seg-btn"
                  [class.on]="filtroProdModo() === 'manual'"
                  (click)="filtroProdModo.set('manual')"
                >
                  Manuales ({{ productosStats().manuales }})
                </button>
              </div>
            </div>
          }

          <div class="datos-prod-list">
            @for (p of productosFiltrados(); track p.id) {
              @let calc = infoCalculadaProducto(p.id);
              @let logo = logoEntidad(p.entidad);
              <article class="datos-prod-row" [style.--prod-color]="colorProducto(p.id)">
                <div class="datos-prod-main">
                  <div class="datos-prod-title-line">
                    <strong class="datos-prod-name">{{ p.nombre }}</strong>
                    <span [class]="'pm-type-badge pm-type-' + (p.tipo || 'otro')">
                      {{ etiquetaTipo(p.tipo) }}
                    </span>
                    @if (p.largoPlazo) {
                      <span class="tag tag-lp">LP</span>
                    }
                  </div>

                  <div class="datos-prod-meta">
                    @if (p.entidad) {
                      <span class="datos-prod-bank">
                        @if (logo) {
                          <img
                            [src]="logo"
                            [alt]="p.entidad"
                            loading="lazy"
                            (error)="marcarLogoFallido(logo)"
                          />
                        }
                        <span>{{ p.entidad }}</span>
                      </span>
                    }
                    @if (p.identificador || p.codigo) {
                      <span class="tag mono">{{ p.identificador || p.codigo }}</span>
                    }
                    <span class="tag">{{ p.fuente }}</span>
                    @if (p.clase) {
                      <span class="tag">{{ p.clase }}</span>
                    }
                    @if (p.ter !== null && p.ter !== undefined && p.ter > 0) {
                      <span class="tag">TER {{ fmt.pct(p.ter, 2) }}</span>
                    }
                  </div>
                </div>

                <div class="datos-prod-metrics">
                  <div class="datos-prod-val-block">
                    <strong class="datos-prod-val mono valor-privado">
                      {{ fmt.eur(valorActualProducto(p.id), 2) }}
                    </strong>
                    @if (
                      esProductoCotizado(p) &&
                      calc?.plusvalia !== null &&
                      calc?.plusvalia !== undefined
                    ) {
                      <span
                        class="datos-prod-pnl mono valor-privado"
                        [class.pos]="(calc!.plusvalia ?? 0) >= 0"
                        [class.neg]="(calc!.plusvalia ?? 0) < 0"
                      >
                        {{ fmt.eurSigno(calc!.plusvalia, 0) }}
                        @if (calc!.rentabilidad !== null && calc!.rentabilidad !== undefined) {
                          ({{ fmt.pctSigno(calc!.rentabilidad, 1) }})
                        }
                      </span>
                    } @else {
                      <span class="datos-prod-subcount">
                        {{
                          esProductoCotizado(p)
                            ? numMovimientos(p.id) + ' operac.'
                            : numValoraciones(p.id) + ' saldos'
                        }}
                      </span>
                    }
                  </div>

                  <div class="datos-prod-actions">
                    @if (esProductoCotizado(p)) {
                      <button
                        type="button"
                        class="btn-tabla btn-tabla-primario"
                        (click)="abrirModalMovimiento(undefined, p.id)"
                        title="Anotar compra, venta o dividendo"
                      >
                        + Compra
                      </button>
                      <button
                        type="button"
                        class="btn-tabla"
                        (click)="verMovimientosDeProducto(p.id)"
                        title="Ver operaciones de este producto"
                      >
                        Movs ({{ numMovimientos(p.id) }})
                      </button>
                    } @else {
                      <button
                        type="button"
                        class="btn-tabla btn-tabla-primario"
                        (click)="abrirModalValoracion(undefined, p.id)"
                        title="Anotar saldo o valoración"
                      >
                        + Saldo
                      </button>
                      <button
                        type="button"
                        class="btn-tabla"
                        (click)="verSaldosDeProducto(p.id)"
                        title="Ver saldos de este producto"
                      >
                        Saldos ({{ numValoraciones(p.id) }})
                      </button>
                    }
                    <button
                      type="button"
                      class="btn-tabla"
                      (click)="abrirModalProducto(p)"
                      title="Editar configuración del producto"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        aria-hidden="true"
                      >
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                      </svg>
                      <span>Editar</span>
                    </button>
                    <button
                      type="button"
                      class="btn-tabla btn-tabla-peligro"
                      (click)="confirmarBorrarProducto(p)"
                      title="Eliminar producto"
                      aria-label="Eliminar producto"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        aria-hidden="true"
                      >
                        <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
                      </svg>
                    </button>
                  </div>
                </div>
              </article>
            } @empty {
              <div class="datos-empty-box">
                @if (!c.productos.length) {
                  <p>
                    Aún no has añadido ningún producto. Pulsa «Añadir producto» para configurar tu
                    primer activo, cuenta o inmueble.
                  </p>
                  <button type="button" class="btn-primario" (click)="abrirModalProducto()">
                    + Añadir mi primer producto
                  </button>
                } @else {
                  <p>No hay productos que coincidan con el filtro aplicado.</p>
                  <button
                    type="button"
                    class="btn-secundario btn-sm"
                    (click)="filtroProdTexto.set(''); filtroProdModo.set('todos')"
                  >
                    Restablecer filtros
                  </button>
                }
              </div>
            }
          </div>
        </section>
      }

      <!-- ========================================================= -->
      <!-- 2. SUB-TAB: COMPRAS Y VENTAS                              -->
      <!-- ========================================================= -->
      @if (store.subTabDatos() === 'movimientos') {
        <section class="panel-card bloque-seccion">
          <div class="card-header">
            <div>
              <h2 class="card-title">Compras, ventas, dividendos y comisiones</h2>
              <p class="card-sub">
                El motor calcula automáticamente las plusvalías realizadas aplicando el criterio
                fiscal FIFO español.
              </p>
            </div>
            <div class="header-btns">
              <button type="button" class="btn-primario" (click)="abrirModalMovimiento()">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.2"
                  stroke-linecap="round"
                  aria-hidden="true"
                >
                  <path d="M12 5v14M5 12h14" />
                </svg>
                <span>Anotar operación</span>
              </button>
            </div>
          </div>

          <div class="datos-kpi-strip">
            <div class="datos-kpi">
              <span>Operaciones mostradas</span>
              <strong class="mono">{{ movimientosResumen().total }}</strong>
            </div>
            <div class="datos-kpi">
              <span>Total comprado</span>
              <strong class="mono valor-privado">{{
                fmt.eur(movimientosResumen().comprado, 2)
              }}</strong>
            </div>
            <div class="datos-kpi">
              <span>Total vendido</span>
              <strong class="mono valor-privado">{{
                fmt.eur(movimientosResumen().vendido, 2)
              }}</strong>
            </div>
            <div class="datos-kpi">
              <span>Dividendos</span>
              <strong class="mono pos valor-privado">{{
                fmt.eur(movimientosResumen().dividendos, 2)
              }}</strong>
            </div>
          </div>

          <div class="datos-toolbar">
            <div class="datos-search-wrap">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <input
                type="text"
                [ngModel]="filtroMovTexto()"
                (ngModelChange)="filtroMovTexto.set($event)"
                placeholder="Buscar por producto o nota…"
                aria-label="Buscar operaciones"
              />
              @if (filtroMovTexto()) {
                <button
                  type="button"
                  class="pm-search-clear"
                  (click)="filtroMovTexto.set('')"
                  aria-label="Limpiar búsqueda"
                >
                  ✕
                </button>
              }
            </div>

            <select
              class="input-select"
              [ngModel]="filtroMovProd()"
              (ngModelChange)="filtroMovProd.set($event)"
              aria-label="Filtrar movimientos por producto"
            >
              <option value="todos">Todos los productos</option>
              @for (p of c.productos; track p.id) {
                <option [value]="p.id">{{ p.nombre }}</option>
              }
            </select>

            <div class="seg-group" role="group" aria-label="Filtrar por tipo de operación">
              <button
                type="button"
                class="seg-btn"
                [class.on]="filtroMovTipo() === 'todos'"
                (click)="filtroMovTipo.set('todos')"
              >
                Todas
              </button>
              <button
                type="button"
                class="seg-btn"
                [class.on]="filtroMovTipo() === 'compra'"
                (click)="filtroMovTipo.set('compra')"
              >
                Compras
              </button>
              <button
                type="button"
                class="seg-btn"
                [class.on]="filtroMovTipo() === 'venta'"
                (click)="filtroMovTipo.set('venta')"
              >
                Ventas
              </button>
              <button
                type="button"
                class="seg-btn"
                [class.on]="filtroMovTipo() === 'dividendo'"
                (click)="filtroMovTipo.set('dividendo')"
              >
                Dividendos
              </button>
              <button
                type="button"
                class="seg-btn"
                [class.on]="filtroMovTipo() === 'comision'"
                (click)="filtroMovTipo.set('comision')"
              >
                Comisiones
              </button>
            </div>
          </div>

          <div class="tabla-scroll">
            <table class="tabla-datos">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Producto</th>
                  <th>Operación</th>
                  <th class="num">Unidades</th>
                  <th class="num">Precio unit.</th>
                  <th class="num">Importe</th>
                  <th>Nota</th>
                  <th class="num">Acciones</th>
                </tr>
              </thead>
              <tbody>
                @for (m of movimientosFiltrados(); track m.id) {
                  <tr>
                    <td class="mono">{{ fmt.fechaCorta(m.fecha) }}</td>
                    <td>
                      <div class="celda-prod-nombre">
                        <span class="dot" [style.background]="colorProducto(m.producto)"></span>
                        <span>{{ nombreProducto(m.producto) }}</span>
                      </div>
                    </td>
                    <td>
                      <span [class]="'tag tag-mov-' + m.tipo">{{
                        m.tipo.toUpperCase()
                      }}</span>
                    </td>
                    <td class="num mono">
                      {{ m.unidades ? fmt.num(m.unidades, 4) : '—' }}
                    </td>
                    <td class="num mono muted valor-privado">
                      {{ m.unidades && m.unidades > 0 ? fmt.eur(m.importe / m.unidades, 2) : '—' }}
                    </td>
                    <td class="num mono valor-privado">
                      <strong>{{ fmt.eur(m.importe, 2) }}</strong>
                      @if (m.comision) {
                        <small class="muted" style="display: block; font-size: 0.7rem">
                          com. {{ fmt.eur(m.comision, 2) }}
                        </small>
                      }
                    </td>
                    <td class="muted">{{ m.nota || '—' }}</td>
                    <td class="num celda-acciones">
                      <button
                        type="button"
                        class="btn-tabla"
                        (click)="duplicarMovimiento(m)"
                        title="Repetir operación con fecha de hoy"
                      >
                        Repetir
                      </button>
                      <button
                        type="button"
                        class="btn-tabla"
                        (click)="abrirModalMovimiento(m)"
                        title="Editar operación"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        class="btn-tabla btn-tabla-peligro"
                        (click)="confirmarBorrarMovimiento(m)"
                        title="Eliminar operación"
                        aria-label="Eliminar operación"
                      >
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2"
                          aria-hidden="true"
                        >
                          <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="8" class="vacio-celda">
                      No hay operaciones que coincidan con el filtro actual.
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>
      }

      <!-- ========================================================= -->
      <!-- 3. SUB-TAB: SALDOS Y VALORES                              -->
      <!-- ========================================================= -->
      @if (store.subTabDatos() === 'saldos') {
        <section class="panel-card bloque-seccion">
          <div class="card-header">
            <div>
              <h2 class="card-title">
                Saldos de cuentas, inmuebles, deudas y valoraciones manuales
              </h2>
              <p class="card-sub">
                Anota el saldo de tus cuentas bancarias, el valor tasado de tus inmuebles o el
                capital pendiente de tus préstamos.
              </p>
            </div>
            <div class="header-btns">
              <button type="button" class="btn-secundario" (click)="abrirModalLoteSaldos()">
                Anotar todos de una vez
              </button>
              <button type="button" class="btn-primario" (click)="abrirModalValoracion()">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.2"
                  stroke-linecap="round"
                  aria-hidden="true"
                >
                  <path d="M12 5v14M5 12h14" />
                </svg>
                <span>Anotar saldo puntual</span>
              </button>
            </div>
          </div>

          <div class="datos-toolbar">
            <select
              class="input-select"
              [ngModel]="filtroValProd()"
              (ngModelChange)="filtroValProd.set($event)"
              aria-label="Filtrar saldos por producto"
            >
              <option value="todos">Todos los activos y cuentas</option>
              @for (p of c.productos; track p.id) {
                <option [value]="p.id">{{ p.nombre }}</option>
              }
            </select>
            <span class="tag mono">{{ valoracionesFiltradas().length }} registros</span>
          </div>

          <div class="tabla-scroll">
            <table class="tabla-datos">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Activo / Cuenta / Deuda</th>
                  <th class="num">Valor o saldo (€)</th>
                  <th class="num">Coste / Aportado (opcional)</th>
                  <th class="num">Acciones</th>
                </tr>
              </thead>
              <tbody>
                @for (v of valoracionesFiltradas(); track v.id) {
                  <tr>
                    <td class="mono">{{ fmt.fechaCorta(v.fecha) }}</td>
                    <td>
                      <div class="celda-prod-nombre">
                        <span class="dot" [style.background]="colorProducto(v.producto)"></span>
                        <span>{{ nombreProducto(v.producto) }}</span>
                      </div>
                    </td>
                    <td class="num mono valor-privado">{{ fmt.eur(v.valor, 2) }}</td>
                    <td class="num mono valor-privado">
                      {{
                        v.aportado !== null && v.aportado !== undefined
                          ? fmt.eur(v.aportado, 2)
                          : '—'
                      }}
                    </td>
                    <td class="num celda-acciones">
                      <button type="button" class="btn-tabla" (click)="abrirModalValoracion(v)">
                        Editar
                      </button>
                      <button
                        type="button"
                        class="btn-tabla btn-tabla-peligro"
                        (click)="confirmarBorrarValoracion(v)"
                        title="Eliminar saldo"
                        aria-label="Eliminar saldo"
                      >
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2"
                          aria-hidden="true"
                        >
                          <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="5" class="vacio-celda">No hay saldos manuales registrados.</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>
      }

      <!-- ========================================================= -->
      <!-- 4. SUB-TAB: IMPORTAR                                      -->
      <!-- ========================================================= -->
      @if (store.subTabDatos() === 'importar') {
        <section class="panel-card bloque-seccion">
          <div class="card-header">
            <div>
              <h2 class="card-title">Importar operaciones y saldos</h2>
              <p class="card-sub">
                Sube extractos de MyInvestor, utiliza nuestra plantilla oficial Excel/CSV o
                convierte capturas de cualquier banco con IA.
              </p>
            </div>
            <div class="seg-group">
              <button
                type="button"
                class="seg-btn"
                [class.on]="modoImportar() === 'myinvestor'"
                (click)="cambiarModoImportar('myinvestor')"
              >
                MyInvestor (CSV)
              </button>
              <button
                type="button"
                class="seg-btn"
                [class.on]="modoImportar() === 'plantilla'"
                (click)="cambiarModoImportar('plantilla')"
              >
                Plantilla Excel / CSV
              </button>
              <button
                type="button"
                class="seg-btn"
                [class.on]="modoImportar() === 'ia'"
                (click)="cambiarModoImportar('ia')"
              >
                Cualquier banco con IA
              </button>
            </div>
          </div>

          @if (modoImportar() === 'myinvestor') {
            <div class="import-box">
              <p>
                Descarga el extracto «Plusvalías y minusvalías» de cada fondo en CSV o Excel y
                selecciónalos aquí. Si el nombre del archivo incluye el código ISIN, Capitalia
                creará y vinculará cada fondo automáticamente.
              </p>
              <div class="form-grid-2" style="margin-top: 1rem">
                <div class="campo">
                  <label for="imp-files-my">Archivos de MyInvestor (CSV o Excel)</label>
                  <input
                    id="imp-files-my"
                    type="file"
                    accept=".csv,.txt,.xlsx"
                    multiple
                    (change)="onSeleccionarArchivosImportar($event)"
                  />
                </div>
                <div class="campo">
                  <label for="imp-prod-def"
                    >Producto por defecto (solo si el CSV no trae ISIN)</label
                  >
                  <select id="imp-prod-def" class="input-select" [(ngModel)]="impProductoDefecto">
                    <option value="">Detectar automáticamente por ISIN</option>
                    @for (p of c.productos; track p.id) {
                      <option [value]="p.id">{{ p.nombre }}</option>
                    }
                  </select>
                </div>
              </div>
            </div>
          }

          @if (modoImportar() === 'plantilla') {
            <div class="import-box">
              <p>
                Descarga la plantilla con ejemplos e instrucciones, rellena tus compras, ventas o
                saldos mensuales y súbela para previsualizar.
              </p>
              <div class="header-btns" style="margin: 1rem 0">
                <a href="/api/plantilla.xlsx" download class="btn-secundario btn-sm">
                  Descargar Plantilla Excel (.xlsx)
                </a>
                <a href="/api/plantilla.csv" download class="btn-fantasma btn-sm">
                  Descargar Plantilla CSV (.csv)
                </a>
              </div>
              <div class="campo">
                <label for="imp-files-pl">Subir plantilla rellena (.xlsx o .csv)</label>
                <input
                  id="imp-files-pl"
                  type="file"
                  accept=".xlsx,.csv,.txt"
                  multiple
                  (change)="onSeleccionarArchivosImportar($event)"
                />
              </div>
            </div>
          }

          @if (modoImportar() === 'ia') {
            <div class="import-box">
              <p>
                1. Copia estas instrucciones y pégalas en ChatGPT, Claude o Gemini junto con
                capturas, PDFs o extractos de tu banco o bróker.<br />
                2. Pega debajo el CSV que te devuelva la IA (o súbelo como archivo) para
                previsualizarlo antes de guardar.
              </p>
              <div class="ia-prompt-bar">
                <button type="button" class="btn-secundario btn-sm" (click)="copiarPromptIA()">
                  Copiar instrucciones para la IA
                </button>
                @if (promptCopiado()) {
                  <span class="pos mono">¡Instrucciones copiadas al portapapeles!</span>
                }
              </div>
              <div class="campo" style="margin-top: 1rem">
                <label for="imp-texto-ia">Pegar respuesta CSV de la IA</label>
                <textarea
                  id="imp-texto-ia"
                  rows="5"
                  [(ngModel)]="impTextoPegado"
                  placeholder="fecha;producto;isin;tipo;participaciones;importe&#10;2025-01-15;MSCI World;IE00B03HCZ61;compra;12,345;500,00"
                ></textarea>
              </div>
            </div>
          }

          <div class="import-footer-bar">
            <label class="check-row">
              <input type="checkbox" [(ngModel)]="impReemplazar" />
              <span
                >Sustituir el historial previo de los productos incluidos en esta importación</span
              >
            </label>
            <button
              type="button"
              class="btn-primario"
              [disabled]="analizandoImportacion()"
              (click)="ejecutarPrevisualizacion()"
            >
              {{ analizandoImportacion() ? 'Analizando datos...' : 'Previsualizar importación' }}
            </button>
          </div>

          <!-- INFORME DE PREVISUALIZACIÓN -->
          @if (informePrevia(); as inf) {
            <div class="previa-box">
              <div class="previa-header">
                <div>
                  <h3>Resultado del análisis previo</h3>
                  <div class="prod-tags" style="margin-top: 0.4rem">
                    <span class="tag pos">{{ inf['añadidos'] }} operaciones nuevas</span>
                    <span class="tag">{{ inf.saldos }} saldos</span>
                    <span class="tag">{{ inf.repetidos }} ya existentes (se omitirán)</span>
                    @if (inf.errores.length) {
                      <span class="tag neg">{{ inf.errores.length }} con avisos/errores</span>
                    }
                  </div>
                </div>
                <button
                  type="button"
                  class="btn-primario"
                  [disabled]="
                    confirmandoImportacion() ||
                    (inf['añadidos'] === 0 && inf.saldos === 0 && inf.productosNuevos.length === 0)
                  "
                  (click)="ejecutarConfirmacionImportar()"
                >
                  {{
                    confirmandoImportacion()
                      ? 'Guardando en PostgreSQL...'
                      : '✓ Confirmar e importar ahora'
                  }}
                </button>
              </div>

              @if (inf.productosNuevos.length) {
                <div class="previa-nuevos">
                  <strong
                    >Se darán de alta automáticamente
                    {{ inf.productosNuevos.length }} productos:</strong
                  >
                  <ul>
                    @for (pn of inf.productosNuevos; track $index) {
                      <li>
                        <strong>{{ pn.nombre }}</strong> ({{ pn.tipo }} ·
                        {{ pn.identificador || pn.codigo }} · {{ pn.fuente }})
                      </li>
                    }
                  </ul>
                </div>
              }

              <div class="tabla-scroll" style="margin-top: 1rem; max-height: 320px">
                <table class="tabla-datos">
                  <thead>
                    <tr>
                      <th>Fila</th>
                      <th>Estado</th>
                      <th>Fecha</th>
                      <th>Producto</th>
                      <th>Tipo</th>
                      <th class="num">Unidades</th>
                      <th class="num">Importe</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (f of inf.filas; track $index) {
                      <tr>
                        <td class="mono">{{ f.fila }}</td>
                        <td>
                          <span
                            [class]="
                              'tag ' +
                              (f.estado === 'nuevo' ? 'pos' : f.estado === 'error' ? 'neg' : '')
                            "
                          >
                            {{ f.estado }}
                          </span>
                        </td>
                        <td class="mono">{{ f.fecha }}</td>
                        <td>{{ f.productoNombre || f.producto }}</td>
                        <td>{{ f.tipo }}</td>
                        <td class="num mono">
                          {{ f.unidades !== null ? fmt.num(f.unidades, 4) : '—' }}
                        </td>
                        <td class="num mono">{{ fmt.eur(f.importe, 2) }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </div>
          }
        </section>
      }

      <!-- ========================================================= -->
      <!-- 5. SUB-TAB: COPIAS Y WEB                                  -->
      <!-- ========================================================= -->
      @if (store.subTabDatos() === 'copias') {
        <div class="dos-columnas bloque-seccion">
          <section class="panel-card">
            <h2 class="card-title">Copia de seguridad en archivo JSON</h2>
            <p class="card-sub">
              Tus datos están respaldados en PostgreSQL, pero puedes descargar o restaurar un
              archivo JSON completo en cualquier momento.
            </p>
            <div class="header-btns" style="margin-top: 1.25rem">
              <a href="/api/copia/descargar" download class="btn-primario">
                Descargar cartera (.json)
              </a>
              <label class="btn-secundario" style="cursor: pointer">
                Restaurar desde archivo (.json)
                <input
                  type="file"
                  accept=".json"
                  style="display: none"
                  (change)="onSubirCopiaJson($event)"
                />
              </label>
            </div>
          </section>

          <section class="panel-card">
            <h2 class="card-title">Exportar informe web interactivo (.html)</h2>
            <p class="card-sub">
              Genera un único archivo HTML autónomo que funciona sin conexión para guardar o
              compartir.
            </p>
            <label class="check-row" style="margin-top: 1rem">
              <input type="checkbox" [(ngModel)]="ocultarImportesWeb" />
              <span
                >Modo discreto: ocultar todos los importes en euros (mostrar solo porcentajes y
                evolución base 100)</span
              >
            </label>
            <div style="margin-top: 1rem">
              <a
                [href]="'/api/exportar-web?ocultar=' + (ocultarImportesWeb ? '1' : '0')"
                download
                class="btn-secundario"
              >
                Descargar página web interactiva (.html)
              </a>
            </div>
          </section>
        </div>

        <section class="panel-card bloque-seccion">
          <div class="card-header">
            <div>
              <h2 class="card-title">Puntos de restauración automáticos en PostgreSQL</h2>
              <p class="card-sub">
                Capitalia guarda una copia instantánea antes de cualquier importación, vaciado o
                restauración.
              </p>
            </div>
          </div>

          <div class="tabla-scroll">
            <table class="tabla-datos">
              <thead>
                <tr>
                  <th>Fecha y hora</th>
                  <th>Motivo</th>
                  <th class="num">Productos</th>
                  <th class="num">Movimientos</th>
                  <th class="num">Acción</th>
                </tr>
              </thead>
              <tbody>
                @for (cp of store.copias(); track cp.archivo) {
                  <tr>
                    <td class="mono">{{ cp.fecha }}</td>
                    <td>{{ cp.motivo }}</td>
                    <td class="num mono">{{ cp.productos }}</td>
                    <td class="num mono">{{ cp.movimientos }}</td>
                    <td class="num">
                      <button
                        type="button"
                        class="btn-tabla"
                        (click)="confirmarRecuperarCopia(cp.archivo, cp.fecha)"
                      >
                        Restaurar esta versión
                      </button>
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="5" class="vacio-celda">
                      Aún no se han generado copias automáticas de cambios previos.
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>
      }

      <!-- MODALES (COMPONENTES SEPARADOS) -->
      <cap-producto-modal
        [abierto]="modalProductoAbierto()"
        [productoEditar]="prodEditando()"
        (cerrar)="modalProductoAbierto.set(false)"
        (creadoYAbrir)="onProductoCreadoYAbrir($event)"
      />
      <cap-movimiento-modal
        [abierto]="modalMovimientoAbierto()"
        [movimientoEditar]="movEditando()"
        [movimientoDuplicar]="movDuplicando()"
        [productoPreseleccionado]="movProductoPreseleccionado()"
        (cerrar)="modalMovimientoAbierto.set(false)"
      />
      <cap-valoracion-modal
        [abierto]="modalValoracionAbierto()"
        [valoracionEditar]="valEditando()"
        [productoPreseleccionado]="valProductoPreseleccionado()"
        (cerrar)="modalValoracionAbierto.set(false)"
      />
      <cap-lote-saldos-modal
        [abierto]="modalLoteSaldosAbierto()"
        (cerrar)="modalLoteSaldosAbierto.set(false)"
      />
    }
  `,
})
export class DatosTabComponent {
  readonly store = inject(PortfolioStoreService);
  readonly fmt = inject(FormatService);

  // Filters
  readonly filtroProdTexto = signal<string>('');
  readonly filtroProdModo = signal<'todos' | 'cotizado' | 'manual'>('todos');
  readonly filtroMovProd = signal<string>('todos');
  readonly filtroMovTipo = signal<'todos' | 'compra' | 'venta' | 'dividendo' | 'comision'>('todos');
  readonly filtroMovTexto = signal<string>('');
  readonly filtroValProd = signal<string>('todos');
  readonly logosFallidos = signal<Set<string>>(new Set());

  // Product modal state
  readonly modalProductoAbierto = signal<boolean>(false);
  readonly prodEditando = signal<ProductoCfg | null>(null);

  // Movement modal state
  readonly modalMovimientoAbierto = signal<boolean>(false);
  readonly movEditando = signal<MovimientoCfg | null>(null);
  readonly movDuplicando = signal<MovimientoCfg | null>(null);
  readonly movProductoPreseleccionado = signal<string | undefined>(undefined);

  // Balance modal state
  readonly modalValoracionAbierto = signal<boolean>(false);
  readonly valEditando = signal<ValoracionCfg | null>(null);
  readonly valProductoPreseleccionado = signal<string | undefined>(undefined);

  // Batch Balances modal state
  readonly modalLoteSaldosAbierto = signal<boolean>(false);

  // Import state
  readonly modoImportar = signal<'myinvestor' | 'plantilla' | 'ia'>('myinvestor');
  readonly analizandoImportacion = signal<boolean>(false);
  readonly confirmandoImportacion = signal<boolean>(false);
  readonly informePrevia = signal<InformeImportacion | null>(null);
  readonly promptCopiado = signal<boolean>(false);
  impArchivos: ArchivoLeido[] = [];
  impProductoDefecto = '';
  impTextoPegado = '';
  impReemplazar = false;

  // Web export option
  ocultarImportesWeb = false;

  private readonly mapaLogosBancos = computed<Map<string, string>>(() => {
    const m = new Map<string, string>();
    for (const b of [...this.store.bancosCatalogo(), ...this.store.bancosRecientes()]) {
      if (b.nombre && b.logo && !m.has(b.nombre.toLowerCase())) {
        m.set(b.nombre.toLowerCase(), b.logo);
      }
    }
    return m;
  });

  readonly productosStats = computed(() => {
    const prods = this.store.cartera()?.productos || [];
    let cotizados = 0;
    let manuales = 0;
    let valorTotal = 0;
    for (const p of prods) {
      if (this.esProductoCotizado(p)) cotizados++;
      else manuales++;
      valorTotal += this.valorActualProducto(p.id);
    }
    return { total: prods.length, cotizados, manuales, valorTotal };
  });

  readonly productosFiltrados = computed<ProductoCfg[]>(() => {
    const prods = this.store.cartera()?.productos || [];
    const modo = this.filtroProdModo();
    const q = this.filtroProdTexto().trim().toLowerCase();
    return prods.filter((p) => {
      const esCot = this.esProductoCotizado(p);
      if (modo === 'cotizado' && !esCot) return false;
      if (modo === 'manual' && esCot) return false;
      if (!q) return true;
      const texto = [
        p.nombre,
        p.corto,
        p.identificador,
        p.codigo,
        p.entidad,
        p.clase,
        p.gestora,
        this.etiquetaTipo(p.tipo),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return texto.includes(q);
    });
  });

  readonly movimientosFiltrados = computed<MovimientoCfg[]>(() => {
    const movs = this.store.cartera()?.movimientos || [];
    const filtroProd = this.filtroMovProd();
    const filtroTipo = this.filtroMovTipo();
    const q = this.filtroMovTexto().trim().toLowerCase();
    return movs
      .filter((m) => {
        if (filtroProd !== 'todos' && m.producto !== filtroProd) return false;
        if (filtroTipo !== 'todos' && m.tipo !== filtroTipo) return false;
        if (!q) return true;
        const texto = `${this.nombreProducto(m.producto)} ${m.nota || ''} ${m.tipo}`.toLowerCase();
        return texto.includes(q);
      })
      .slice()
      .sort((a, b) => b.fecha.localeCompare(a.fecha));
  });

  readonly movimientosResumen = computed(() => {
    let comprado = 0;
    let vendido = 0;
    let dividendos = 0;
    const lista = this.movimientosFiltrados();
    for (const m of lista) {
      if (m.tipo === 'compra') comprado += m.importe || 0;
      else if (m.tipo === 'venta') vendido += m.importe || 0;
      else if (m.tipo === 'dividendo') dividendos += m.importe || 0;
    }
    return { total: lista.length, comprado, vendido, dividendos };
  });

  readonly valoracionesFiltradas = computed<ValoracionCfg[]>(() => {
    const vals = this.store.cartera()?.valoraciones || [];
    const filtro = this.filtroValProd();
    return vals
      .filter((v) => filtro === 'todos' || v.producto === filtro)
      .slice()
      .sort((a, b) => b.fecha.localeCompare(a.fecha));
  });

  constructor() {
    void this.store.cargarBancosIniciales();
    effect(() => {
      if (this.store.subTabDatos() === 'copias') {
        this.store.cargarCopias();
      }
    });
  }

  cambiarSubTab(sub: 'productos' | 'movimientos' | 'saldos' | 'importar' | 'copias'): void {
    this.store.subTabDatos.set(sub);
  }

  etiquetaTipo(clave: string): string {
    const mapa = this.store.tipos();
    return mapa[clave]?.[0] || clave;
  }

  esTipoInversion(tipo: string): boolean {
    return ['fondo', 'etf', 'accion', 'cripto', 'commodity'].includes(tipo);
  }

  esProductoCotizado(p: ProductoCfg): boolean {
    return this.esTipoInversion(p.tipo) && p.fuente !== 'manual';
  }

  logoEntidad(entidad?: string): string | null {
    const clave = (entidad || '').trim().toLowerCase();
    if (!clave) return null;
    const url = this.mapaLogosBancos().get(clave);
    if (!url || this.logosFallidos().has(url)) return null;
    return url;
  }

  marcarLogoFallido(url: string): void {
    this.logosFallidos.update((prev) => {
      if (prev.has(url)) return prev;
      const next = new Set(prev);
      next.add(url);
      return next;
    });
  }

  nombreProducto(id: string): string {
    const prod = this.store.cartera()?.productos.find((p) => p.id === id);
    return prod ? prod.nombre : id;
  }

  infoCalculadaProducto(id: string): ProductoCalculado | undefined {
    return this.store.todosComponentes().find((c) => c.id === id);
  }

  valorActualProducto(id: string): number {
    const comp = this.infoCalculadaProducto(id);
    return comp ? comp.valor : 0;
  }

  numMovimientos(id: string): number {
    return (this.store.cartera()?.movimientos || []).filter((m) => m.producto === id).length;
  }

  numValoraciones(id: string): number {
    return (this.store.cartera()?.valoraciones || []).filter((v) => v.producto === id).length;
  }

  // Mismo color que en Patrimonio y Productos (sale del panel calculado, no del slot a secas).
  colorProducto(id: string): string {
    const color = this.infoCalculadaProducto(id)?.color;
    return Array.isArray(color) ? color[0] : this.fmt.colorDeSlot(1)[0];
  }

  verMovimientosDeProducto(id: string): void {
    this.filtroMovProd.set(id);
    this.filtroMovTipo.set('todos');
    this.filtroMovTexto.set('');
    this.store.subTabDatos.set('movimientos');
  }

  verSaldosDeProducto(id: string): void {
    this.filtroValProd.set(id);
    this.store.subTabDatos.set('saldos');
  }

  onProductoCreadoYAbrir(ev: { id: string; accion: 'movimiento' | 'saldo' }): void {
    if (ev.accion === 'movimiento') {
      this.abrirModalMovimiento(undefined, ev.id);
    } else {
      this.abrirModalValoracion(undefined, ev.id);
    }
  }

  // Product modal logic
  abrirModalProducto(p?: ProductoCfg): void {
    this.prodEditando.set(p ?? null);
    this.modalProductoAbierto.set(true);
  }

  confirmarBorrarProducto(p: ProductoCfg): void {
    this.store.pedirConfirmacion({
      titulo: 'Eliminar producto',
      mensaje: `¿Seguro que quieres eliminar «${p.nombre}» y todas sus compras y saldos asociados? Se guardará una copia automática antes de borrar.`,
      textoConfirmar: 'Sí, eliminar producto',
      peligro: true,
      accion: async () => {
        await this.store.borrarProducto(p.id);
      },
    });
  }

  // Movement modal logic
  abrirModalMovimiento(
    m?: MovimientoCfg,
    productoPreseleccionado?: string,
    duplicar?: MovimientoCfg,
  ): void {
    this.movEditando.set(m ?? null);
    this.movDuplicando.set(duplicar ?? null);
    this.movProductoPreseleccionado.set(productoPreseleccionado);
    this.modalMovimientoAbierto.set(true);
  }

  duplicarMovimiento(m: MovimientoCfg): void {
    this.abrirModalMovimiento(undefined, undefined, m);
  }

  confirmarBorrarMovimiento(m: MovimientoCfg): void {
    this.store.pedirConfirmacion({
      titulo: 'Eliminar operación',
      mensaje: `¿Eliminar la operación de ${m.tipo} del ${this.fmt.fechaCorta(m.fecha)} por ${this.fmt.eur(m.importe, 2)}?`,
      textoConfirmar: 'Eliminar operación',
      peligro: true,
      accion: async () => {
        await this.store.borrarMovimiento(m.id);
      },
    });
  }

  // Balance modal logic
  abrirModalValoracion(v?: ValoracionCfg, productoPreseleccionado?: string): void {
    this.valEditando.set(v ?? null);
    this.valProductoPreseleccionado.set(productoPreseleccionado);
    this.modalValoracionAbierto.set(true);
  }

  confirmarBorrarValoracion(v: ValoracionCfg): void {
    this.store.pedirConfirmacion({
      titulo: 'Eliminar saldo',
      mensaje: `¿Eliminar el saldo del ${this.fmt.fechaCorta(v.fecha)} (${this.fmt.eur(v.valor, 2)})?`,
      textoConfirmar: 'Eliminar saldo',
      peligro: true,
      accion: async () => {
        await this.store.borrarValoracion(v.id);
      },
    });
  }

  abrirModalLoteSaldos(): void {
    this.modalLoteSaldosAbierto.set(true);
  }

  // Import logic
  cambiarModoImportar(m: 'myinvestor' | 'plantilla' | 'ia'): void {
    this.modoImportar.set(m);
    this.informePrevia.set(null);
    this.impArchivos = [];
  }

  async onSeleccionarArchivosImportar(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    if (!input.files?.length) return;
    const leidos: ArchivoLeido[] = [];
    for (const file of Array.from(input.files)) {
      const base64 = await this.archivoABase64(file);
      leidos.push({ nombre: file.name, base64 });
    }
    this.impArchivos = leidos;
    await this.ejecutarPrevisualizacion();
  }

  private archivoABase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const res = String(reader.result || '');
        const idx = res.indexOf(',');
        resolve(idx >= 0 ? res.slice(idx + 1) : res);
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  private construirPayloadImportar(): Record<string, unknown> {
    const origen = this.modoImportar() === 'myinvestor' ? 'myinvestor' : 'tabla';
    if (this.modoImportar() === 'ia' && this.impTextoPegado.trim()) {
      return {
        origen,
        archivos: [
          {
            nombre: 'importacion_ia.csv',
            contenido: this.impTextoPegado.trim(),
          },
        ],
        productoPorDefecto: this.impProductoDefecto || undefined,
        reemplazar: this.impReemplazar,
      };
    }
    return {
      origen,
      archivos: this.impArchivos,
      productoPorDefecto: this.impProductoDefecto || undefined,
      reemplazar: this.impReemplazar,
    };
  }

  async ejecutarPrevisualizacion(): Promise<void> {
    const payload = this.construirPayloadImportar();
    const archivos = payload['archivos'] as unknown[];
    if (!archivos || !archivos.length) {
      this.store.notificarError('Selecciona al menos un archivo o pega los datos CSV.');
      return;
    }
    this.analizandoImportacion.set(true);
    try {
      const inf = await this.store.previsualizarImportacion(payload);
      this.informePrevia.set(inf);
    } finally {
      this.analizandoImportacion.set(false);
    }
  }

  async ejecutarConfirmacionImportar(): Promise<void> {
    const payload = this.construirPayloadImportar();
    this.confirmandoImportacion.set(true);
    try {
      const inf = await this.store.confirmarImportacion(payload);
      if (inf) {
        this.informePrevia.set(null);
        this.impArchivos = [];
        this.impTextoPegado = '';
      }
    } finally {
      this.confirmandoImportacion.set(false);
    }
  }

  async copiarPromptIA(): Promise<void> {
    try {
      const txt = await this.store.obtenerPromptIA();
      if (txt && navigator.clipboard) {
        await navigator.clipboard.writeText(txt);
        this.promptCopiado.set(true);
        setTimeout(() => this.promptCopiado.set(false), 3500);
      }
    } catch {
      this.store.notificarError('No se pudo copiar el prompt.');
    }
  }

  // Backups & Reset
  async onSubirCopiaJson(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const texto = await file.text();
      const json = JSON.parse(texto);
      await this.store.subirCopia(json);
    } catch {
      this.store.notificarError('El archivo seleccionado no es un JSON válido.');
    } finally {
      input.value = '';
    }
  }

  confirmarRecuperarCopia(archivo: string, fecha: string): void {
    this.store.pedirConfirmacion({
      titulo: 'Restaurar copia de seguridad',
      mensaje: `¿Seguro que quieres restaurar la cartera al estado del ${fecha}? Se guardará una copia de seguridad de tu cartera actual antes de restaurar.`,
      textoConfirmar: 'Restaurar versión',
      peligro: false,
      accion: async () => {
        await this.store.recuperarCopia(archivo);
      },
    });
  }

  confirmarVaciarCartera(): void {
    this.store.pedirConfirmacion({
      titulo: 'Vaciar toda la cartera',
      mensaje:
        '¿Estás seguro de que quieres vaciar todos los productos, movimientos y saldos? Se creará automáticamente una copia de seguridad en PostgreSQL por si deseas deshacerlo.',
      textoConfirmar: 'Sí, vaciar cartera',
      peligro: true,
      accion: async () => {
        await this.store.reiniciarCartera();
      },
    });
  }
}
