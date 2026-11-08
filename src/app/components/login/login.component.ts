import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PortfolioStoreService } from '../../services/portfolio-store.service';

@Component({
  selector: 'cap-login',
  imports: [FormsModule],
  template: `
    <div class="auth-screen">
      <div class="auth-backdrop"></div>
      <div class="auth-card">
        <div class="auth-brand">
          <div class="auth-logo">
            <svg viewBox="0 0 36 36" fill="none" aria-hidden="true">
              <rect width="36" height="36" rx="9" fill="url(#capGrad)" />
              <path
                d="M10 24L16 17L20.5 20.5L26.5 12"
                stroke="#0a0e14"
                stroke-width="2.8"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
              <circle cx="26.5" cy="12" r="2.5" fill="#0a0e14" />
              <defs>
                <linearGradient id="capGrad" x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse">
                  <stop stop-color="#f59e0b" />
                  <stop offset="1" stop-color="#10b981" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <div>
            <span class="auth-kicker">GESTIÓN PATRIMONIAL &amp; QUANT</span>
            <h1 class="auth-title">Capitalia</h1>
          </div>
        </div>

        <p class="auth-sub">
          Seguimiento integral de patrimonio neto, fondos indexados, ETFs, acciones, cripto, inmuebles y deudas con motor analítico TIR/FIFO y persistencia en PostgreSQL.
        </p>

        <div class="auth-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            [class.on]="modo() === 'login'"
            (click)="cambiarModo('login')"
          >
            Iniciar sesión
          </button>
          <button
            type="button"
            role="tab"
            [class.on]="modo() === 'registro'"
            (click)="cambiarModo('registro')"
          >
            Crear cuenta
          </button>
        </div>

        @if (store.errorGlobal()) {
          <div class="auth-alert" role="alert">
            {{ store.errorGlobal() }}
          </div>
        }

        <form class="auth-form" (ngSubmit)="enviar()">
          @if (modo() === 'registro') {
            <div class="campo">
              <label for="auth-nombre">Nombre o alias</label>
              <input
                id="auth-nombre"
                type="text"
                name="nombre"
                [(ngModel)]="nombre"
                placeholder="Ej. Markel"
                autocomplete="name"
                required
              />
            </div>
          }

          <div class="campo">
            <label for="auth-email">Correo electrónico</label>
            <input
              id="auth-email"
              type="email"
              name="email"
              [(ngModel)]="email"
              placeholder="tu@correo.com"
              autocomplete="email"
              required
            />
          </div>

          <div class="campo">
            <label for="auth-clave">Contraseña</label>
            <input
              id="auth-clave"
              type="password"
              name="clave"
              [(ngModel)]="clave"
              placeholder="Mínimo 8 caracteres"
              autocomplete="current-password"
              required
            />
          </div>

          <button type="submit" class="btn-primario auth-submit" [disabled]="enviando()">
            @if (enviando()) {
              <span>Verificando...</span>
            } @else {
              <span>{{ modo() === 'login' ? 'Entrar a mi patrimonio' : 'Crear cuenta y empezar' }}</span>
            }
          </button>
        </form>

        <div class="auth-footer">
          <span>Base de datos PostgreSQL activa</span>
          <span>·</span>
          <span>Cifrado PBKDF2-SHA256</span>
        </div>
      </div>
    </div>
  `,
})
export class LoginComponent {
  readonly store = inject(PortfolioStoreService);

  readonly modo = signal<'login' | 'registro'>('login');
  readonly enviando = signal<boolean>(false);

  nombre = '';
  email = '';
  clave = '';

  cambiarModo(nuevo: 'login' | 'registro'): void {
    this.modo.set(nuevo);
    this.store.errorGlobal.set(null);
  }

  async enviar(): Promise<void> {
    if (this.enviando()) return;
    const correo = this.email.trim();
    if (!correo || !this.clave) {
      this.store.notificarError('Introduce tu correo y contraseña.');
      return;
    }
    this.enviando.set(true);
    try {
      if (this.modo() === 'login') {
        await this.store.login(correo, this.clave);
      } else {
        await this.store.registro(this.nombre.trim(), correo, this.clave);
      }
    } finally {
      this.enviando.set(false);
    }
  }
}
