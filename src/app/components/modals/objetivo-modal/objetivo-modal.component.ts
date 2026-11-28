import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PortfolioStoreService } from '../../../services/portfolio-store.service';
import { IconComponent } from '../../icon/icon.component';

@Component({
  selector: 'cap-objetivo-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, IconComponent],
  host: {
    '(document:keydown.escape)': 'cerrar()',
  },
  template: `
    @if (store.modalObjetivoAbierto()) {
      <div class="modal-backdrop" (click)="cerrar()">
        <div
          class="modal-card modal-sm"
          (click)="$event.stopPropagation()"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-objetivo-titulo"
        >
          <div class="modal-header">
            <div>
              <span class="modal-kicker">Planificación Patrimonial</span>
              <h3 id="modal-objetivo-titulo">Objetivo de patrimonio</h3>
            </div>
            <button type="button" class="btn-cerrar" (click)="cerrar()" aria-label="Cerrar">
              <cap-icon name="close" [size]="16" />
            </button>
          </div>

          <form (ngSubmit)="guardar()" class="modal-body">
            <div class="campo">
              <label for="obj-titular">Nombre o alias del titular</label>
              <input
                id="obj-titular"
                autofocus
                type="text"
                [(ngModel)]="objTitular"
                name="titular"
                placeholder="Ej. Mi cartera patrimonial"
              />
            </div>

            <div class="campo">
              <label for="obj-etq">Etiqueta de la meta</label>
              <input
                id="obj-etq"
                type="text"
                [(ngModel)]="objEtiqueta"
                name="etiqueta"
                placeholder="Ej. Independencia financiera / Entrada vivienda"
              />
            </div>

            <div class="campo">
              <label for="obj-imp">Importe objetivo (€)</label>
              <input
                id="obj-imp"
                type="number"
                step="100"
                min="100"
                [(ngModel)]="objImporte"
                name="importe"
                required
              />
            </div>

            <div class="campo">
              <label for="obj-gasto">Gasto mensual medio (€/mes, opcional)</label>
              <input
                id="obj-gasto"
                type="number"
                step="50"
                min="0"
                [(ngModel)]="objGastoMensual"
                name="gastoMensual"
                placeholder="Ej. 1800 (para calcular meses de colchón)"
              />
            </div>

            <label class="check-row" style="margin-bottom: 0.75rem">
              <input type="checkbox" [(ngModel)]="objActivo" name="activo" />
              <span>Mostrar barra de progreso en la cabecera de Patrimonio</span>
            </label>

            <div class="modal-footer">
              <button type="button" class="btn-fantasma" (click)="cerrar()">Cancelar</button>
              <button type="submit" class="btn-primario" [disabled]="guardando()">
                @if (guardando()) {
                  <cap-icon name="spinner" [size]="15" [spin]="true" />
                  <span>Guardando…</span>
                } @else {
                  <span>Guardar objetivo</span>
                }
              </button>
            </div>
          </form>
        </div>
      </div>
    }
  `,
})
export class ObjetivoModalComponent {
  readonly store = inject(PortfolioStoreService);
  readonly guardando = signal(false);

  objTitular = '';
  objEtiqueta = '';
  objImporte = 100000;
  objGastoMensual: number | null = null;
  objActivo = true;

  constructor() {
    effect(() => {
      if (this.store.modalObjetivoAbierto()) {
        this.guardando.set(false);
        const d = this.store.datos();
        const c = this.store.cartera();
        const obj = d?.objetivo;
        this.objTitular = d?.titular || 'Mi cartera';
        this.objEtiqueta = obj?.etiqueta || 'Objetivo de patrimonio';
        this.objImporte = obj?.importe || 100000;
        const gasto = c?.gastoMensual ?? d?.salud?.gastoMensual ?? null;
        this.objGastoMensual = gasto !== null && gasto > 0 ? gasto : null;
        this.objActivo = obj ? obj.activo : true;
      }
    });
  }

  cerrar(): void {
    this.store.modalObjetivoAbierto.set(false);
  }

  async guardar(): Promise<void> {
    if (this.guardando()) return;
    this.guardando.set(true);
    try {
      const gastoRaw = this.objGastoMensual;
      const gasto =
        gastoRaw !== null && gastoRaw !== undefined && Number(gastoRaw) > 0
          ? Number(gastoRaw)
          : null;
      const ok = await this.store.guardarObjetivo(
        this.objTitular.trim() || 'Mi cartera',
        Number(this.objImporte) || 100000,
        this.objEtiqueta.trim() || 'Objetivo de patrimonio',
        this.objActivo,
        gasto,
      );
      if (ok) {
        this.cerrar();
      }
    } finally {
      this.guardando.set(false);
    }
  }
}
