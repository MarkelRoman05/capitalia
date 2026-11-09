import { Component, inject } from '@angular/core';
import { PortfolioStoreService } from '../../../services/portfolio-store.service';

@Component({
  selector: 'cap-confirm-modal',
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
              ✕
            </button>
          </div>
          <div class="modal-body">
            <p class="modal-desc">{{ conf.mensaje }}</p>
            <div class="modal-footer">
              <button type="button" class="btn-fantasma" (click)="store.cerrarConfirmacion()">
                Cancelar
              </button>
              <button
                type="button"
                [class]="conf.peligro ? 'btn-peligro' : 'btn-primario'"
                (click)="store.ejecutarConfirmacion()"
              >
                {{ conf.textoConfirmar }}
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
}
