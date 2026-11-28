import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PortfolioStoreService } from '../../services/portfolio-store.service';
import { FormatService } from '../../services/format.service';
import { ProductoCalculado } from '../../models/portfolio.model';

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
  selector: 'cap-tabla-aportaciones',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  template: `
    @if (store.datos(); as d) {
      <section class="panel-card bloque-seccion">
        <div class="card-header">
          <div>
            <h2 class="card-title">Registro histórico de compras y aportaciones</h2>
            <p class="card-sub">
              {{ filasAportacionesFiltradas().length }} operaciones · Total
              <span class="valor-privado">{{ fmt.eur(sumaAportacionesFiltradas(), 2) }}</span>
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
                  <td class="num mono valor-privado" [class.pos]="f.esPasivo">
                    {{ fmt.eur(f.importe, 2) }}
                  </td>
                </tr>
              } @empty {
                <tr>
                  <td colspan="5" class="vacio-celda">
                    No hay aportaciones registradas para este filtro.
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        @if (filasAportacionesFiltradas().length > limiteFilas()) {
          <div class="tabla-pie-mas">
            <button
              type="button"
              class="btn-secundario btn-sm"
              (click)="limiteFilas.set(limiteFilas() + 50)"
            >
              Mostrar más operaciones ({{
                filasAportacionesFiltradas().length - limiteFilas()
              }}
              restantes)
            </button>
          </div>
        }
      </section>
    }
  `,
})
export class TablaAportacionesComponent {
  readonly store = inject(PortfolioStoreService);
  readonly fmt = inject(FormatService);

  readonly filtroProdTabla = signal<string>('todos');
  readonly ordenTabla = signal<'fecha' | 'importe'>('fecha');
  readonly limiteFilas = signal<number>(30);

  private colorPrimario(c: ProductoCalculado): string {
    if (Array.isArray(c.color)) return c.color[0];
    if (Array.isArray(c.slotColor)) return c.slotColor[0];
    return '#10b981';
  }

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
}
