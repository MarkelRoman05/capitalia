import { Component, inject } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { PortfolioStoreService } from '../../services/portfolio-store.service';
import { NavbarComponent } from '../navbar/navbar.component';
import { FooterComponent } from '../footer/footer.component';
import { ConfirmModalComponent } from '../modals/confirm-modal/confirm-modal.component';
import { PerfilModalComponent } from '../modals/perfil-modal/perfil-modal.component';

@Component({
  selector: 'cap-shell',
  imports: [RouterOutlet, NavbarComponent, FooterComponent, ConfirmModalComponent, PerfilModalComponent],
  host: {
    '(document:keydown)': 'onKeydown($event)',
  },
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
  private readonly router = inject(Router);

  private readonly rutasPorTecla: Record<string, string> = {
    '1': '/patrimonio',
    '2': '/mes',
    '3': '/productos',
    '4': '/rendimiento',
    '5': '/datos',
    '6': '/ayuda',
  };

  onKeydown(ev: KeyboardEvent): void {
    const tag = (ev.target as HTMLElement | null)?.tagName || '';
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;

    if (ev.key === 'Escape') {
      if (this.store.confirmacionActiva()) {
        this.store.cerrarConfirmacion();
        return;
      }
      if (this.store.modalObjetivoAbierto()) {
        this.store.modalObjetivoAbierto.set(false);
        return;
      }
      this.store.mostrarTodos();
      return;
    }

    const k = ev.key.toLowerCase();
    if (k === 'v') {
      this.store.alternarModoVideo();
      return;
    }
    if (k === 'l') {
      this.store.alternarTema();
      return;
    }

    const ruta = this.rutasPorTecla[k];
    if (ruta) {
      void this.router.navigate([ruta]);
    }
  }
}
