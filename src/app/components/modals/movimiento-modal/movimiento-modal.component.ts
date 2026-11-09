import { Component, effect, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PortfolioStoreService } from '../../../services/portfolio-store.service';
import { FormatService } from '../../../services/format.service';
import { MovimientoCfg } from '../../../models/portfolio.model';

@Component({
  selector: 'cap-movimiento-modal',
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
          aria-labelledby="modal-mov-titulo"
        >
          <div class="modal-header">
            <div>
              <span class="modal-kicker">Libro de Operaciones (FIFO)</span>
              <h3 id="modal-mov-titulo">
                {{
                  movimientoEditar()
                    ? 'Editar operación'
                    : 'Anotar compra, venta, dividendo o comisión'
                }}
              </h3>
            </div>
            <button type="button" class="btn-cerrar" (click)="cerrar.emit()" aria-label="Cerrar">
              ✕
            </button>
          </div>
          <form (ngSubmit)="guardar()" class="modal-body">
            <div class="campo">
              <label for="mv-prod">Producto</label>
              <select
                id="mv-prod"
                autofocus
                class="input-select"
                [(ngModel)]="formMov.producto"
                name="producto"
                required
              >
                @for (p of store.cartera()?.productos || []; track p.id) {
                  <option [value]="p.id">{{ p.nombre }}</option>
                }
              </select>
            </div>

            <div class="form-grid-2">
              <div class="campo">
                <label for="mv-tipo">Tipo de operación</label>
                <select id="mv-tipo" class="input-select" [(ngModel)]="formMov.tipo" name="tipo">
                  <option value="compra">Compra / Suscripción</option>
                  <option value="venta">Venta / Reembolso (FIFO)</option>
                  <option value="dividendo">Dividendo cobrado</option>
                  <option value="comision">Comisión custodia / bróker</option>
                </select>
              </div>

              <div class="campo">
                <label for="mv-fecha">Fecha</label>
                <input
                  id="mv-fecha"
                  type="date"
                  [(ngModel)]="formMov.fecha"
                  name="fecha"
                  required
                />
              </div>
            </div>

            @if (formMov.tipo === 'compra' || formMov.tipo === 'venta') {
              <div class="form-grid-2">
                <div class="campo">
                  <label for="mv-unidades">Participaciones / Títulos</label>
                  <input
                    id="mv-unidades"
                    type="number"
                    step="any"
                    min="0.00000001"
                    [(ngModel)]="formMov.unidades"
                    name="unidades"
                    required
                  />
                </div>
                <div class="campo">
                  <label for="mv-importe">Importe total (€)</label>
                  <input
                    id="mv-importe"
                    type="number"
                    step="0.01"
                    min="0.01"
                    [(ngModel)]="formMov.importe"
                    name="importe"
                    required
                  />
                </div>
              </div>
              @if (formMov.unidades > 0 && formMov.importe > 0) {
                <p class="muted mono" style="font-size: 0.82rem; margin: -0.25rem 0 0.75rem">
                  Precio unitario implícito:
                  {{ fmt.eur(formMov.importe / formMov.unidades, 4) }} por título
                </p>
              }
            } @else {
              <div class="campo">
                <label for="mv-importe-simple">Importe (€)</label>
                <input
                  id="mv-importe-simple"
                  type="number"
                  step="0.01"
                  min="0.01"
                  [(ngModel)]="formMov.importe"
                  name="importeSimple"
                  required
                />
              </div>
            }

            <div class="campo">
              <label for="mv-nota">Nota o comentario (opcional)</label>
              <input
                id="mv-nota"
                type="text"
                [(ngModel)]="formMov.nota"
                name="nota"
                placeholder="Ej. Aportación mensual DCA"
              />
            </div>

            <div class="modal-footer">
              <button type="button" class="btn-fantasma" (click)="cerrar.emit()">Cancelar</button>
              <button type="submit" class="btn-primario">Guardar operación</button>
            </div>
          </form>
        </div>
      </div>
    }
  `,
})
export class MovimientoModalComponent {
  readonly store = inject(PortfolioStoreService);
  readonly fmt = inject(FormatService);

  readonly abierto = input.required<boolean>();
  readonly movimientoEditar = input<MovimientoCfg | null>(null);
  readonly productoPreseleccionado = input<string | undefined>(undefined);
  readonly cerrar = output<void>();

  formMov: {
    producto: string;
    tipo: 'compra' | 'venta' | 'dividendo' | 'comision';
    fecha: string;
    unidades: number;
    importe: number;
    comision: number | null;
    nota: string;
  } = {
    producto: '',
    tipo: 'compra',
    fecha: new Date().toISOString().slice(0, 10),
    unidades: 0,
    importe: 0,
    comision: null,
    nota: '',
  };

  constructor() {
    effect(() => {
      if (this.abierto()) {
        const m = this.movimientoEditar();
        const prods = this.store.cartera()?.productos || [];
        if (m) {
          this.formMov = {
            producto: m.producto,
            tipo: m.tipo,
            fecha: m.fecha,
            unidades: m.unidades || 0,
            importe: m.importe,
            comision: m.comision ?? null,
            nota: m.nota || '',
          };
        } else {
          const prodInicial =
            this.productoPreseleccionado() ||
            prods.find((p) => ['fondo', 'etf', 'accion', 'cripto'].includes(p.tipo))?.id ||
            prods[0]?.id ||
            '';
          this.formMov = {
            producto: prodInicial,
            tipo: 'compra',
            fecha: new Date().toISOString().slice(0, 10),
            unidades: 0,
            importe: 0,
            comision: null,
            nota: '',
          };
        }
      }
    });
  }

  cerrarSiAbierto(): void {
    if (this.abierto()) this.cerrar.emit();
  }

  async guardar(): Promise<void> {
    const payload: Partial<MovimientoCfg> = {
      producto: this.formMov.producto,
      tipo: this.formMov.tipo,
      fecha: this.formMov.fecha,
      unidades:
        this.formMov.tipo === 'compra' || this.formMov.tipo === 'venta'
          ? Number(this.formMov.unidades)
          : 0,
      importe: Number(this.formMov.importe),
      comision: this.formMov.comision ? Number(this.formMov.comision) : null,
      nota: this.formMov.nota,
    };
    const ok = await this.store.guardarMovimiento(payload, this.movimientoEditar()?.id);
    if (ok) {
      this.cerrar.emit();
    }
  }
}
