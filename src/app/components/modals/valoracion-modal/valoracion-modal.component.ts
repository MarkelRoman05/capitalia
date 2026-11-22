import { Component, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PortfolioStoreService } from '../../../services/portfolio-store.service';
import { ValoracionCfg } from '../../../models/portfolio.model';
import { IconComponent } from '../../icon/icon.component';

@Component({
  selector: 'cap-valoracion-modal',
  imports: [FormsModule, IconComponent],
  host: {
    '(document:keydown.escape)': 'cerrarSiAbierto()',
  },
  template: `
    @if (abierto()) {
      <div class="modal-backdrop" (click)="cerrar.emit()">
        <div
          class="modal-card pm-modal"
          (click)="$event.stopPropagation()"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-val-titulo"
        >
          <div class="modal-header pm-header">
            <div class="modal-title-group">
              <span class="modal-kicker">Valoración de Saldo</span>
              <h3 id="modal-val-titulo">
                {{ valoracionEditar() ? 'Editar saldo o valoración' : 'Anotar saldo o valoración' }}
              </h3>
            </div>
            <button type="button" class="btn-cerrar" (click)="cerrar.emit()" aria-label="Cerrar">
              <cap-icon name="close" [size]="16" />
            </button>
          </div>

          <div class="pm-body">
            <form id="form-valoracion" (ngSubmit)="guardar()" class="pm-sections">
              <section class="pm-section">
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
                    <div class="mv-date-row">
                      <label for="vl-fecha">Fecha del saldo</label>
                      <button type="button" class="mv-inline-chip" (click)="ponerHoy()">Hoy</button>
                    </div>
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
                  <label for="vl-aportado">
                    Coste de adquisición / Capital aportado (opcional)
                  </label>
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
              </section>
            </form>
          </div>

          <div class="modal-footer pm-footer">
            <button type="button" class="btn-fantasma" (click)="cerrar.emit()">Cancelar</button>
            <button
              type="submit"
              form="form-valoracion"
              class="btn-primario"
              [disabled]="guardando() || !formVal.producto || !formVal.fecha"
            >
              @if (guardando()) {
                <cap-icon name="spinner" [size]="15" [spin]="true" />
                <span>Guardando…</span>
              } @else {
                <span>Guardar saldo</span>
              }
            </button>
          </div>
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

  readonly guardando = signal(false);

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
        this.guardando.set(false);
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
                !['fondo', 'etf', 'accion', 'cripto', 'commodity', 'pension'].includes(p.tipo) ||
                p.fuente === 'manual',
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

  ponerHoy(): void {
    this.formVal.fecha = new Date().toISOString().slice(0, 10);
  }

  etiquetaTipo(clave: string): string {
    const mapa = this.store.tipos();
    return mapa[clave]?.[0] || clave;
  }

  cerrarSiAbierto(): void {
    if (this.abierto()) this.cerrar.emit();
  }

  async guardar(): Promise<void> {
    if (this.guardando() || !this.formVal.producto) return;
    this.guardando.set(true);
    try {
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
    } finally {
      this.guardando.set(false);
    }
  }
}
