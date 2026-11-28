import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { PortfolioStoreService } from '../../services/portfolio-store.service';
import { NavbarComponent } from '../navbar/navbar.component';
import { FooterComponent } from '../footer/footer.component';
import { ConfirmModalComponent } from '../modals/confirm-modal/confirm-modal.component';
import { PerfilModalComponent } from '../modals/perfil-modal/perfil-modal.component';
import { AyudaModalComponent } from '../modals/ayuda-modal/ayuda-modal.component';
import { IconComponent } from '../icon/icon.component';

@Component({
  selector: 'cap-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterOutlet,
    NavbarComponent,
    FooterComponent,
    ConfirmModalComponent,
    PerfilModalComponent,
    AyudaModalComponent,
    IconComponent,
  ],
  template: `
    <div class="app-shell">
      <cap-navbar />

      <div class="contenedor-principal">
        @if (store.mensajeExito() || store.errorGlobal()) {
          <div class="toast-stack">
            @if (store.mensajeExito()) {
              <div class="toast toast-exito" role="status">
                <span class="toast-msg">
                  <cap-icon name="check" [size]="17" />
                  <span>{{ store.mensajeExito() }}</span>
                </span>
                <button
                  type="button"
                  class="toast-close"
                  (click)="store.mensajeExito.set(null)"
                  aria-label="Cerrar aviso"
                >
                  <cap-icon name="close" [size]="14" />
                </button>
              </div>
            }

            @if (store.errorGlobal()) {
              <div class="toast toast-error" role="alert">
                <span class="toast-msg">
                  <cap-icon name="alert" [size]="17" />
                  <span>{{ store.errorGlobal() }}</span>
                </span>
                <button
                  type="button"
                  class="toast-close"
                  (click)="store.errorGlobal.set(null)"
                  aria-label="Cerrar error"
                >
                  <cap-icon name="close" [size]="14" />
                </button>
              </div>
            }
          </div>
        }

        @if (store.datos()?.avisos?.length) {
          <div class="avisos-motor">
            @for (av of store.datos()!.avisos; track $index) {
              <div class="aviso-linea">
                <cap-icon name="info" [size]="15" />
                <span>{{ av }}</span>
              </div>
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
    <cap-ayuda-modal />
  `,
})
export class ShellComponent {
  readonly store = inject(PortfolioStoreService);
}
