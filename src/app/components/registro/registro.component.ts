import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PortfolioStoreService } from '../../services/portfolio-store.service';

@Component({
  selector: 'cap-registro',
  imports: [FormsModule, RouterLink],
  template: `
    <div class="auth-screen">
      <section class="auth-pitch">
        <div class="auth-pitch-top">
          <div class="auth-brand-badge">
            <svg class="brand-logo" viewBox="0 0 32 32" aria-hidden="true">
              <rect width="32" height="32" rx="8" fill="currentColor" opacity="0.16" />
              <path
                d="M7 22V12m6 10V15m6 7V8m6 14V11"
                stroke="currentColor"
                stroke-width="2.6"
                stroke-linecap="round"
              />
            </svg>
            <div class="auth-brand-texts">
              <span class="auth-brand-name">Capitalia</span>
              <span class="auth-brand-tag">Private Wealth &amp; Quant Analytics</span>
            </div>
          </div>

          <span class="auth-pill-kicker">NUEVA CARTERA PATRIMONIAL</span>
          <h1 class="auth-pitch-title">Construye y audita tu estrategia de inversión.</h1>
          <p class="auth-pitch-text">
            Configura tu cuenta en segundos. Podrás empezar con una cartera limpia, importar tus
            operaciones históricas desde CSV/Excel o explorar la cartera de demostración con datos
            reales.
          </p>
        </div>

        <div class="auth-showcase-grid">
          <div class="auth-showcase-card">
            <span class="asc-label">Multi-Activo</span>
            <strong class="asc-val">Fondos · ETFs · Cripto · Inmuebles</strong>
            <span class="asc-sub">Seguimiento automático por ISIN/ticker y saldos manuales</span>
          </div>
          <div class="auth-showcase-card">
            <span class="asc-label">Privacidad Total</span>
            <strong class="asc-val">PostgreSQL Autojospedado</strong>
            <span class="asc-sub">Puntos de restauración instantáneos antes de cada cambio</span>
          </div>
        </div>

        <ul class="auth-pitch-list">
          <li>
            Compara tu cartera real contra MSCI World, S&amp;P 500 o Nasdaq 100 con las mismas
            fechas de compra
          </li>
          <li>Radiografía completa de comisiones implícitas (TER) y su impacto a 10 años</li>
          <li>Proyección interactiva de interés compuesto y metas patrimoniales</li>
        </ul>
      </section>

      <section class="auth-panel-wrapper">
        <div class="auth-card">
          <div class="auth-card-header">
            <span class="auth-kicker">ALTA DE INVERSOR</span>
            <h2 class="auth-title">Crear cuenta</h2>
            <p class="auth-sub">
              Registra tu perfil para inicializar tu base de datos patrimonial.
            </p>
          </div>

          <div class="auth-tabs" role="navigation" aria-label="Cambiar entre acceso y registro">
            <a routerLink="/login" class="auth-tab-link"> Iniciar sesión </a>
            <a routerLink="/registro" class="auth-tab-link on" aria-current="page">
              Crear cuenta
            </a>
          </div>

          @if (store.errorGlobal()) {
            <div class="auth-alert" role="alert">
              <span aria-hidden="true">⚠</span>
              <span>{{ store.errorGlobal() }}</span>
            </div>
          }

          <form class="auth-form" (ngSubmit)="enviar()">
            <div class="campo">
              <label for="reg-nombre">Nombre o alias del titular</label>
              <input
                id="reg-nombre"
                type="text"
                name="nombre"
                [(ngModel)]="nombre"
                placeholder="Introduce tu nombre"
                autocomplete="name"
                required
              />
            </div>

            <div class="campo">
              <label for="reg-email">Correo electrónico</label>
              <input
                id="reg-email"
                type="email"
                name="email"
                [(ngModel)]="email"
                placeholder="mail@ejemplo.com"
                autocomplete="email"
                required
              />
            </div>

            <div class="campo">
              <label for="reg-clave">Contraseña (mínimo 8 caracteres)</label>
              <input
                id="reg-clave"
                type="password"
                name="clave"
                [(ngModel)]="clave"
                placeholder="Introduce una contraseña"
                autocomplete="new-password"
                minlength="8"
                required
              />
            </div>

            <button type="submit" class="btn-primario auth-submit" [disabled]="enviando()">
              @if (enviando()) {
                <span class="girando" aria-hidden="true">↻</span>
                <span>Creando cartera…</span>
              } @else {
                <span>Crear mi cuenta en Capitalia →</span>
              }
            </button>
          </form>

          <div class="auth-switch-prompt">
            <span>¿Ya tienes una cuenta creada?</span>
            <a routerLink="/login" class="btn-link">Iniciar sesión</a>
          </div>

          <div class="auth-footer">
            <span>🔒 Contraseñas protegidas con sal única y PBKDF2-HMAC-SHA256</span>
          </div>
        </div>
      </section>
    </div>
  `,
})
export class RegistroComponent {
  readonly store = inject(PortfolioStoreService);
  readonly enviando = signal<boolean>(false);

  nombre = '';
  email = '';
  clave = '';

  constructor() {
    this.store.errorGlobal.set(null);
  }

  async enviar(): Promise<void> {
    if (this.enviando()) return;
    const correo = this.email.trim();
    if (!correo || !this.clave) {
      this.store.notificarError(
        'Completa tu correo electrónico y una contraseña de al menos 8 caracteres.',
      );
      return;
    }
    if (this.clave.length < 8) {
      this.store.notificarError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    this.enviando.set(true);
    try {
      await this.store.registro(this.nombre.trim(), correo, this.clave);
    } finally {
      this.enviando.set(false);
    }
  }
}
