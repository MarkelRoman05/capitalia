import { Component, effect, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PortfolioStoreService } from '../../../services/portfolio-store.service';

@Component({
  selector: 'cap-lote-saldos-modal',
  imports: [FormsModule],
  host: {
    '(document:keydown.escape)': 'cerrarSiAbierto()',
  },
  template: `
    @if (abierto()) {
      <div class="modal-backdrop" (click)="cerrar.emit()">
        <div
          class="modal-card modal-lg"
          (click)="$event.stopPropagation()"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-lote-titulo"
        >
          <div class="modal-header">
            <div>
              <span class="modal-kicker">Actualización Masiva</span>
              <h3 id="modal-lote-titulo">Actualizar todos los saldos en una fecha</h3>
            </div>
            <button type="button" class="btn-cerrar" (click)="cerrar.emit()" aria-label="Cerrar">
              ✕
            </button>
          </div>
          <form (ngSubmit)="guardar()" class="modal-body">
            <div class="campo" style="max-width: 240px">
              <label for="lote-fecha">Fecha de cierre</label>
              <input
                id="lote-fecha"
                autofocus
                type="date"
                [(ngModel)]="loteFecha"
                name="loteFecha"
                required
              />
            </div>

            <div class="tabla-scroll" style="margin-top: 1rem">
              <table class="tabla-datos">
                <thead>
                  <tr>
                    <th>Activo / Cuenta</th>
                    <th>Tipo</th>
                    <th class="num">Saldo o valor (€)</th>
                  </tr>
                </thead>
                <tbody>
                  @for (item of loteItems; track item.producto) {
                    <tr>
                      <td>
                        <strong>{{ item.nombre }}</strong>
                      </td>
                      <td>
                        <span class="tag">{{ etiquetaTipo(item.tipo) }}</span>
                      </td>
                      <td class="num">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          class="input-inline-num"
                          [(ngModel)]="item.valor"
                          [name]="'lote_' + item.producto"
                        />
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>

            <div class="modal-footer">
              <button type="button" class="btn-fantasma" (click)="cerrar.emit()">Cancelar</button>
              <button type="submit" class="btn-primario">Guardar todos los saldos</button>
            </div>
          </form>
        </div>
      </div>
    }
  `,
})
export class LoteSaldosModalComponent {
  readonly store = inject(PortfolioStoreService);

  readonly abierto = input.required<boolean>();
  readonly cerrar = output<void>();

  loteFecha = new Date().toISOString().slice(0, 10);
  loteItems: { producto: string; nombre: string; tipo: string; valor: number | null }[] = [];

  constructor() {
    effect(() => {
      if (this.abierto()) {
        const prods = this.store.cartera()?.productos || [];
        const manuales = prods.filter(
          (p) => !['fondo', 'etf', 'accion', 'cripto'].includes(p.tipo) || p.fuente === 'manual',
        );
        const lista = manuales.length ? manuales : prods;
        this.loteFecha = new Date().toISOString().slice(0, 10);
        this.loteItems = lista.map((p) => {
          const comp = this.store.todosComponentes().find((c) => c.id === p.id);
          return {
            producto: p.id,
            nombre: p.nombre,
            tipo: p.tipo,
            valor: Math.abs(comp ? comp.valor : 0),
          };
        });
      }
    });
  }

  etiquetaTipo(clave: string): string {
    const mapa = this.store.tipos();
    return mapa[clave]?.[0] || clave;
  }

  cerrarSiAbierto(): void {
    if (this.abierto()) this.cerrar.emit();
  }

  async guardar(): Promise<void> {
    const saldos = this.loteItems
      .filter((it) => it.valor !== null && it.valor !== undefined)
      .map((it) => ({
        producto: it.producto,
        valor: Number(it.valor),
      }));
    const ok = await this.store.guardarValoracion({
      fecha: this.loteFecha,
      saldos,
    });
    if (ok) {
      this.cerrar.emit();
    }
  }
}
