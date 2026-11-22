import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { PortfolioStoreService } from '../../services/portfolio-store.service';
import { NavbarComponent } from '../navbar/navbar.component';
import { FooterComponent } from '../footer/footer.component';
import { ConfirmModalComponent } from '../modals/confirm-modal/confirm-modal.component';
import { PerfilModalComponent } from '../modals/perfil-modal/perfil-modal.component';

@Component({
  selector: 'cap-shell',
  imports: [RouterOutlet, NavbarComponent, FooterComponent, ConfirmModalComponent, PerfilModalComponent],
  template: `
    <div class="app-shell">
      <cap-navbar />

      <div class="contenedor-principal">
        @if (store.mensajeExito() || store.errorGlobal()) {
          <div class="toast-stack">
            @if (store.mensajeExito()) {
              <div class="toast toast-exito" role="status">
                <span class="toast-msg">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                  <span>{{ store.mensajeExito() }}</span>
                </span>
                <button
                  type="button"
                  class="toast-close"
                  (click)="store.mensajeExito.set(null)"
                  aria-label="Cerrar aviso"
                >
                  ✕
                </button>
              </div>
            }

            @if (store.errorGlobal()) {
              <div class="toast toast-error" role="alert">
                <span class="toast-msg">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 8v5M12 16h.01" />
                  </svg>
                  <span>{{ store.errorGlobal() }}</span>
                </span>
                <button
                  type="button"
                  class="toast-close"
                  (click)="store.errorGlobal.set(null)"
                  aria-label="Cerrar error"
                >
                  ✕
                </button>
              </div>
            }
          </div>
        }

        @if (store.datos()?.avisos?.length) {
          <div class="avisos-motor">
            @for (av of store.datos()!.avisos; track $index) {
              <div class="aviso-linea">ℹ {{ av }}</div>
            }
          </div>
        }

        <main class="main-content">
          <router-outlet />
        </main>

        <cap-footer />
      </div>
    </div>

    <cap-confirm-modal />
    <cap-perfil-modal />
  `,
})
export class ShellComponent {
  readonly store = inject(PortfolioStoreService);
}
