import { Component, effect, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PortfolioStoreService } from '../../../services/portfolio-store.service';
import { ValoracionCfg } from '../../../models/portfolio.model';

@Component({
  selector: 'cap-valoracion-modal',
  imports: [FormsModule],
  host: {
    '(document:keydown.escape)': 'cerrarSiAbierto()',
  },
  template: `
    @if (abierto()) {
      <div class="modal-backdrop" (click)="cerrar.emit()">
        <div
          class="modal-card"
          (click)="$event.stopPropagation()"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-val-titulo"
        >
          <div class="modal-header">
            <div>
              <span class="modal-kicker">Valoración de Saldo</span>
              <h3 id="modal-val-titulo">
                {{ valoracionEditar() ? 'Editar saldo o valoración' : 'Anotar saldo o valoración' }}
              </h3>
            </div>
            <button type="button" class="btn-cerrar" (click)="cerrar.emit()" aria-label="Cerrar">
              ✕
            </button>
          </div>
          <form (ngSubmit)="guardar()" class="modal-body">
            <div class="campo">
              <label for="vl-prod">Activo / Cuenta / Deuda</label>
              <select
                id="vl-prod"
                autofocus
                class="input-select"
                [(ngModel)]="formVal.producto"
                name="producto"
                required
              >
                @for (p of store.cartera()?.productos || []; track p.id) {
                  <option [value]="p.id">{{ p.nombre }} ({{ etiquetaTipo(p.tipo) }})</option>
                }
              </select>
            </div>

            <div class="form-grid-2">
              <div class="campo">
                <label for="vl-fecha">Fecha del saldo</label>
                <input
                  id="vl-fecha"
                  type="date"
                  [(ngModel)]="formVal.fecha"
                  name="fecha"
                  required
                />
              </div>
              <div class="campo">
                <label for="vl-valor">Saldo o valor actual (€)</label>
                <input
                  id="vl-valor"
                  type="number"
                  step="0.01"
                  min="0"
                  [(ngModel)]="formVal.valor"
                  name="valor"
                  required
                />
              </div>
            </div>

            <div class="campo">
              <label for="vl-aportado">Coste de adquisición / Capital aportado (opcional)</label>
              <input
                id="vl-aportado"
                type="number"
                step="0.01"
                min="0"
                [(ngModel)]="formVal.aportado"
                name="aportado"
                placeholder="Déjalo vacío para cuentas corrientes o deudas"
              />
            </div>

            <div class="modal-footer">
              <button type="button" class="btn-fantasma" (click)="cerrar.emit()">Cancelar</button>
              <button type="submit" class="btn-primario">Guardar saldo</button>
            </div>
          </form>
        </div>
      </div>
    }
  `,
})
export class ValoracionModalComponent {
  readonly store = inject(PortfolioStoreService);

  readonly abierto = input.required<boolean>();
  readonly valoracionEditar = input<ValoracionCfg | null>(null);
  readonly productoPreseleccionado = input<string | undefined>(undefined);
  readonly cerrar = output<void>();

  formVal: {
    producto: string;
    fecha: string;
    valor: number;
    aportado: number | null;
  } = {
    producto: '',
    fecha: new Date().toISOString().slice(0, 10),
    valor: 0,
    aportado: null,
  };

  constructor() {
    effect(() => {
      if (this.abierto()) {
        const v = this.valoracionEditar();
        const prods = this.store.cartera()?.productos || [];
        if (v) {
          this.formVal = {
            producto: v.producto,
            fecha: v.fecha,
            valor: v.valor,
            aportado: v.aportado ?? null,
          };
        } else {
          const prodInicial =
            this.productoPreseleccionado() ||
            prods.find(
              (p) =>
                !['fondo', 'etf', 'accion', 'cripto'].includes(p.tipo) || p.fuente === 'manual',
            )?.id ||
            prods[0]?.id ||
            '';
          const comp = this.store.todosComponentes().find((c) => c.id === prodInicial);
          this.formVal = {
            producto: prodInicial,
            fecha: new Date().toISOString().slice(0, 10),
            valor: comp ? Math.abs(comp.valor) : 0,
            aportado: null,
          };
        }
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
    const ok = await this.store.guardarValoracion(
      {
        producto: this.formVal.producto,
        fecha: this.formVal.fecha,
        valor: Number(this.formVal.valor),
        aportado:
          this.formVal.aportado !== null && this.formVal.aportado !== undefined
            ? Number(this.formVal.aportado)
            : null,
      },
      this.valoracionEditar()?.id,
    );
    if (ok) {
      this.cerrar.emit();
    }
  }
}
