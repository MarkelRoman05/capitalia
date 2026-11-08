import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PortfolioStoreService } from '../../services/portfolio-store.service';

@Component({
  selector: 'cap-login',
  imports: [FormsModule],
  template: `
    <div class="auth-screen">
      <section class="auth-pitch">
        <h1 class="auth-pitch-title">Tu patrimonio, medido con rigor.</h1>
        <p class="auth-pitch-text">
          Fondos, ETFs, acciones, cripto, cuentas, inmuebles y deudas en un solo sitio. Rentabilidad real (TIR), plusvalías por FIFO y comparación con un indexado, calculadas sobre tus propias aportaciones.
        </p>
        <ul class="auth-pitch-list">
          <li>Precios históricos de Morningstar, Yahoo Finance y CoinGecko</li>
          <li>Importa desde MyInvestor, Excel o cualquier banco con IA</li>
          <li>Tus datos se guardan en tu propia base PostgreSQL</li>
        </ul>
      </section>
      <div class="auth-card">
        <div class="auth-brand">
          <span class="auth-title">Capitalia</span>
        </div>
        <p class="auth-sub">Accede a tu cartera o crea una cuenta nueva.</p>

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
              <span>Verificando…</span>
            } @else {
              <span>{{ modo() === 'login' ? 'Entrar' : 'Crear cuenta' }}</span>
            }
          </button>
        </form>

        <p class="auth-footer">Contraseñas cifradas con PBKDF2-SHA256.</p>
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
