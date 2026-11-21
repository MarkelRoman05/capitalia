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
        @if (store.mensajeExito()) {
          <div class="toast toast-exito" role="status">
            <span>✓ {{ store.mensajeExito() }}</span>
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
            <span>⚠ {{ store.errorGlobal() }}</span>
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
