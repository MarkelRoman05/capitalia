import { ChangeDetectionStrategy, Component, computed, inject, model, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PortfolioStoreService } from '../../services/portfolio-store.service';
import { FormatService } from '../../services/format.service';
import { CapTooltipDirective } from '../../directives/tooltip.directive';
import { ValoracionCfg } from '../../models/portfolio.model';

@Component({
  selector: 'cap-saldos-subtab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, CapTooltipDirective],
  template: `
    @if (store.cartera(); as c) {
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
            <button type="button" class="btn-secundario" (click)="abrirLoteSaldos.emit()">
              Anotar todos de una vez
            </button>
            <button type="button" class="btn-primario" (click)="abrirValoracion.emit(undefined)">
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
                    <button type="button" class="btn-tabla" (click)="abrirValoracion.emit(v)">
                      Editar
                    </button>
                    <button
                      type="button"
                      class="btn-tabla btn-tabla-peligro"
                      (click)="confirmarBorrarValoracion(v)"
                      capTooltip="Eliminar saldo"
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
  `,
})
export class SaldosSubtabComponent {
  readonly store = inject(PortfolioStoreService);
  readonly fmt = inject(FormatService);

  readonly filtroValProd = model<string>('todos');

  readonly abrirValoracion = output<ValoracionCfg | undefined>();
  readonly abrirLoteSaldos = output<void>();

  readonly valoracionesFiltradas = computed<ValoracionCfg[]>(() => {
    const vals = this.store.cartera()?.valoraciones || [];
    const filtro = this.filtroValProd();
    return vals
      .filter((v) => filtro === 'todos' || v.producto === filtro)
      .slice()
      .sort((a, b) => b.fecha.localeCompare(a.fecha));
  });

  nombreProducto(id: string): string {
    const prod = this.store.cartera()?.productos.find((p) => p.id === id);
    return prod ? prod.nombre : id;
  }

  colorProducto(id: string): string {
    const color = this.store.todosComponentes().find((c) => c.id === id)?.color;
    return Array.isArray(color) ? color[0] : this.fmt.colorDeSlot(1)[0];
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
}
