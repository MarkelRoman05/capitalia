import { Component, inject, signal } from '@angular/core';
import { PortfolioStoreService } from '../../../services/portfolio-store.service';
import { IconComponent } from '../../icon/icon.component';

@Component({
  selector: 'cap-confirm-modal',
  imports: [IconComponent],
  host: {
    '(document:keydown.escape)': 'cerrarSiAbierto()',
  },
  template: `
    @if (store.confirmacionActiva(); as conf) {
      <div class="modal-backdrop" (click)="store.cerrarConfirmacion()">
        <div
          class="modal-card modal-sm"
          (click)="$event.stopPropagation()"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="confirm-modal-title"
        >
          <div class="modal-header">
            <div class="modal-title-group">
              <span class="modal-badge" [class.modal-badge-danger]="conf.peligro">
                {{ conf.peligro ? 'Acción irreversible' : 'Confirmación' }}
              </span>
              <h3 id="confirm-modal-title">{{ conf.titulo }}</h3>
            </div>
            <button
              type="button"
              class="btn-cerrar"
              (click)="store.cerrarConfirmacion()"
              aria-label="Cerrar ventana"
            >
              <cap-icon name="close" [size]="16" />
            </button>
          </div>
          <div class="modal-body">
            <p class="modal-desc">{{ conf.mensaje }}</p>
            <div class="modal-footer">
              <button
                type="button"
                class="btn-fantasma"
                [disabled]="ejecutando()"
                (click)="store.cerrarConfirmacion()"
              >
                Cancelar
              </button>
              <button
                type="button"
                [class]="conf.peligro ? 'btn-peligro' : 'btn-primario'"
                [disabled]="ejecutando()"
                (click)="confirmar()"
              >
                @if (ejecutando()) {
                  <cap-icon name="spinner" [size]="15" [spin]="true" />
                  <span>Procesando…</span>
                } @else {
                  <span>{{ conf.textoConfirmar }}</span>
                }
              </button>
            </div>
          </div>
        </div>
      </div>
    }
  `,
})
export class ConfirmModalComponent {
  readonly store = inject(PortfolioStoreService);
  readonly ejecutando = signal(false);

  cerrarSiAbierto(): void {
    if (this.store.confirmacionActiva() && !this.ejecutando()) {
      this.store.cerrarConfirmacion();
    }
  }

  async confirmar(): Promise<void> {
    if (this.ejecutando()) return;
    this.ejecutando.set(true);
    try {
      await this.store.ejecutarConfirmacion();
    } finally {
      this.ejecutando.set(false);
    }
  }
}
