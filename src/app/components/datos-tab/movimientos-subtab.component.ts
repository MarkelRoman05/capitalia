import { ChangeDetectionStrategy, Component, computed, inject, model, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PortfolioStoreService } from '../../services/portfolio-store.service';
import { FormatService } from '../../services/format.service';
import { IconComponent } from '../icon/icon.component';
import { CapTooltipDirective } from '../../directives/tooltip.directive';
import { MovimientoCfg } from '../../models/portfolio.model';

export type FiltroMovTipo = 'todos' | 'compra' | 'venta' | 'dividendo' | 'comision' | 'traspaso';

@Component({
  selector: 'cap-movimientos-subtab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, IconComponent, CapTooltipDirective],
  template: `
    @if (store.cartera(); as c) {
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
            <button type="button" class="btn-primario" (click)="abrirMovimiento.emit(undefined)">
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
                <cap-icon name="close" [size]="13" />
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
              [class.on]="filtroMovTipo() === 'traspaso'"
              (click)="filtroMovTipo.set('traspaso')"
            >
              Traspasos
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
                      @if (m.tipo === 'traspaso' && m.productoDestino) {
                        <span class="muted">→</span>
                        <span>{{ nombreProducto(m.productoDestino) }}</span>
                      }
                    </div>
                  </td>
                  <td>
                    <span [class]="'tag tag-mov-' + m.tipo">{{ m.tipo.toUpperCase() }}</span>
                  </td>
                  <td class="num mono">
                    @if (m.tipo === 'traspaso') {
                      <span>-{{ fmt.num(m.unidades, 4) }}</span>
                      @if (m.unidadesDestino) {
                        <small class="pos" style="display: block; font-size: 0.7rem">
                          +{{ fmt.num(m.unidadesDestino, 4) }} dest.
                        </small>
                      }
                    } @else {
                      {{ m.unidades ? fmt.num(m.unidades, 4) : '—' }}
                    }
                  </td>
                  <td class="num mono muted valor-privado">
                    {{
                      m.unidades && m.unidades > 0 && m.importe > 0
                        ? fmt.eur(m.importe / m.unidades, 2)
                        : '—'
                    }}
                  </td>
                  <td class="num mono valor-privado">
                    <strong>{{ m.importe > 0 ? fmt.eur(m.importe, 2) : '—' }}</strong>
                    @if (m.comision) {
                      <small class="muted" style="display: block; font-size: 0.7rem">
                        com. {{ fmt.eur(m.comision, 2) }}
                      </small>
                    }
                    @if (m.tipo === 'dividendo' && (m.retencion ?? 0) > 0) {
                      <small class="muted" style="display: block; font-size: 0.7rem">
                        ret. {{ fmt.eur(m.retencion, 2) }}
                      </small>
                    }
                  </td>
                  <td class="muted">{{ m.nota || '—' }}</td>
                  <td class="num celda-acciones">
                    <button
                      type="button"
                      class="btn-tabla"
                      (click)="duplicarMovimiento.emit(m)"
                      capTooltip="Repetir operación con fecha de hoy"
                    >
                      Repetir
                    </button>
                    <button
                      type="button"
                      class="btn-tabla"
                      (click)="abrirMovimiento.emit(m)"
                      capTooltip="Editar operación"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      class="btn-tabla btn-tabla-peligro"
                      (click)="confirmarBorrarMovimiento(m)"
                      capTooltip="Eliminar operación"
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
  `,
})
export class MovimientosSubtabComponent {
  readonly store = inject(PortfolioStoreService);
  readonly fmt = inject(FormatService);

  readonly filtroMovProd = model<string>('todos');
  readonly filtroMovTipo = model<FiltroMovTipo>('todos');
  readonly filtroMovTexto = model<string>('');

  readonly abrirMovimiento = output<MovimientoCfg | undefined>();
  readonly duplicarMovimiento = output<MovimientoCfg>();

  readonly movimientosFiltrados = computed<MovimientoCfg[]>(() => {
    const movs = this.store.cartera()?.movimientos || [];
    const filtroProd = this.filtroMovProd();
    const filtroTipo = this.filtroMovTipo();
    const q = this.filtroMovTexto().trim().toLowerCase();
    return movs
      .filter((m) => {
        if (
          filtroProd !== 'todos' &&
          m.producto !== filtroProd &&
          m.productoDestino !== filtroProd
        ) {
          return false;
        }
        if (filtroTipo !== 'todos' && m.tipo !== filtroTipo) return false;
        if (!q) return true;
        const dest = m.productoDestino ? this.nombreProducto(m.productoDestino) : '';
        const texto = `${this.nombreProducto(m.producto)} ${dest} ${m.nota || ''} ${m.tipo}`.toLowerCase();
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

  nombreProducto(id: string): string {
    const prod = this.store.cartera()?.productos.find((p) => p.id === id);
    return prod ? prod.nombre : id;
  }

  colorProducto(id: string): string {
    const color = this.store.todosComponentes().find((c) => c.id === id)?.color;
    return Array.isArray(color) ? color[0] : this.fmt.colorDeSlot(1)[0];
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
}
