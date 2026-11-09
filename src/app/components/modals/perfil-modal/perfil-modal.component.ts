import { Component, effect, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PortfolioStoreService } from '../../../services/portfolio-store.service';

@Component({
  selector: 'cap-perfil-modal',
  imports: [FormsModule],
  host: {
    '(document:keydown.escape)': 'cerrar()',
  },
  template: `
    @if (store.modalPerfilAbierto()) {
      <div class="modal-backdrop" (click)="cerrar()">
        <div
          class="modal-card modal-sm"
          (click)="$event.stopPropagation()"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-perfil-titulo"
        >
          <div class="modal-header">
            <div>
              <span class="modal-kicker">Cuenta de usuario</span>
              <h3 id="modal-perfil-titulo">Modificar perfil</h3>
            </div>
            <button type="button" class="btn-cerrar" (click)="cerrar()" aria-label="Cerrar">
              ✕
            </button>
          </div>

          <form (ngSubmit)="guardar()" class="modal-body">
            @if (error) {
              <p class="modal-error" role="alert">{{ error }}</p>
            }

            <div class="campo">
              <label for="pf-nombre">Nombre</label>
              <input
                id="pf-nombre"
                autofocus
                type="text"
                [(ngModel)]="nombre"
                name="nombre"
                maxlength="80"
                placeholder="Tu nombre o alias"
              />
            </div>

            <div class="campo">
              <label for="pf-email">Correo electrónico</label>
              <input
                id="pf-email"
                type="email"
                [(ngModel)]="email"
                name="email"
                placeholder="nombre@dominio.com"
              />
            </div>

            <div class="campo">
              <label for="pf-clave-actual">Contraseña actual</label>
              <input
                id="pf-clave-actual"
                type="password"
                [(ngModel)]="claveActual"
                name="claveActual"
                autocomplete="current-password"
                placeholder="Obligatoria para cambiar correo o contraseña"
              />
            </div>

            <div class="campo">
              <label for="pf-clave-nueva">Nueva contraseña</label>
              <input
                id="pf-clave-nueva"
                type="password"
                [(ngModel)]="claveNueva"
                name="claveNueva"
                autocomplete="new-password"
                placeholder="Déjalo en blanco para no cambiarla"
              />
            </div>

            <p class="modal-desc-text">
              Se pide la contraseña actual solo si cambias el correo o la contraseña.
            </p>

            <div class="modal-footer">
              <button type="button" class="btn-fantasma" (click)="cerrar()">Cancelar</button>
              <button type="submit" class="btn-primario" [disabled]="guardando">
                {{ guardando ? 'Guardando…' : 'Guardar cambios' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    }
  `,
})
export class PerfilModalComponent {
  readonly store = inject(PortfolioStoreService);

  nombre = '';
  email = '';
  claveActual = '';
  claveNueva = '';
  error: string | null = null;
  guardando = false;

  constructor() {
    effect(() => {
      if (this.store.modalPerfilAbierto()) {
        const u = this.store.usuario();
        this.nombre = u?.nombre || '';
        this.email = u?.email || '';
        this.claveActual = '';
        this.claveNueva = '';
        this.error = null;
      }
    });
  }

  cerrar(): void {
    this.store.modalPerfilAbierto.set(false);
  }

  async guardar(): Promise<void> {
    this.error = null;
    const email = this.email.trim();
    const actual = this.store.usuario()?.email || '';

    if (!email) {
      this.error = 'Escribe tu correo electrónico.';
      return;
    }
    if (this.claveNueva && this.claveNueva.length < 8) {
      this.error = 'La contraseña nueva debe tener al menos 8 caracteres.';
      return;
    }
    const cambiaCorreo = email.toLowerCase() !== actual.toLowerCase();
    if ((cambiaCorreo || this.claveNueva) && !this.claveActual) {
      this.error = 'Escribe tu contraseña actual para cambiar el correo o la contraseña.';
      return;
    }

    this.guardando = true;
    const fallo = await this.store.actualizarPerfil({
      nombre: this.nombre.trim(),
      email,
      passwordActual: this.claveActual || undefined,
      passwordNueva: this.claveNueva || undefined,
    });
    this.guardando = false;
    if (fallo === null) {
      this.cerrar();
    } else {
      this.error = fallo;
    }
  }
}
