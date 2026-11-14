import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PortfolioStoreService } from '../../services/portfolio-store.service';
import { LogoComponent } from '../logo/logo.component';

@Component({
  selector: 'cap-login',
  imports: [FormsModule, RouterLink, LogoComponent],
  template: `
    <div class="auth-screen">
      <section class="auth-pitch">
        <div class="auth-pitch-top">
          <div class="auth-brand-badge">
            <cap-logo class="brand-logo" [size]="40" variant="dark" />
            <div class="auth-brand-texts">
              <span class="auth-brand-name">Capitalia</span>
              <span class="auth-brand-tag">Private Wealth &amp; Quant Analytics</span>
            </div>
          </div>

          <span class="auth-pill-kicker">Plataforma Cuantitativa de Patrimonio</span>
          <h1 class="auth-pitch-title">Tu patrimonio, medido con precisión institucional.</h1>
          <p class="auth-pitch-text">
            Unifica fondos indexados, ETFs, acciones, criptoactivos, cuentas remuneradas, inmuebles
            y pasivos en un libro mayor privado. Rentabilidad ponderada por dinero (TIR) y por
            tiempo (TWR), plusvalías FIFO y comparativa directa contra índices globales.
          </p>
        </div>

        <div class="auth-showcase-grid">
          <div class="auth-showcase-card">
            <span class="asc-label">Motor Financiero</span>
            <strong class="asc-val">XIRR + TWR + FIFO</strong>
            <span class="asc-sub"
              >Cálculo fiscal español y métricas de riesgo Sharpe y Max Drawdown</span
            >
          </div>
          <div class="auth-showcase-card">
            <span class="asc-label">Fuentes de Mercado</span>
            <strong class="asc-val">Morningstar · Yahoo · CoinGecko</strong>
            <span class="asc-sub"
              >Series históricas diarias en EUR y cotización cripto en tiempo real</span
            >
          </div>
        </div>

        <ul class="auth-pitch-list">
          <li>
            Importación directa desde MyInvestor, plantillas Excel/CSV o extractos bancarios con IA
          </li>
          <li>
            Modo presentación instantáneo para compartir métricas ocultando importes sensibles
          </li>
        </ul>
      </section>

      <section class="auth-panel-wrapper">
        <div class="auth-card">
          <div class="auth-card-header">
            <span class="auth-kicker">ACCESO PRIVADO</span>
            <h2 class="auth-title">Iniciar sesión</h2>
            <p class="auth-sub">
              Accede a tu terminal patrimonial o cambia a creación de cuenta nueva.
            </p>
          </div>

          <div class="auth-tabs" role="navigation" aria-label="Cambiar entre acceso y registro">
            <a routerLink="/login" class="auth-tab-link on" aria-current="page"> Iniciar sesión </a>
            <a routerLink="/registro" class="auth-tab-link"> Crear cuenta </a>
          </div>

          @if (store.errorGlobal()) {
            <div class="auth-alert" role="alert">
              <span>{{ store.errorGlobal() }}</span>
            </div>
          }

          <form class="auth-form" (ngSubmit)="enviar()">
            <div class="campo">
              <label for="auth-email">Correo electrónico</label>
              <input
                id="auth-email"
                type="email"
                name="email"
                [(ngModel)]="email"
                placeholder="nombre@dominio.com"
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
                placeholder="Introduce tu contraseña"
                autocomplete="current-password"
                required
              />
            </div>

            <button type="submit" class="btn-primario auth-submit" [disabled]="enviando()">
              @if (enviando()) {
                <span class="girando" aria-hidden="true">↻</span>
                <span>Verificando credenciales…</span>
              } @else {
                <span>Entrar a mi cartera →</span>
              }
            </button>
          </form>

          <div class="auth-switch-prompt">
            <span>¿Todavía no tienes cuenta en Capitalia?</span>
            <a routerLink="/registro" class="btn-link">Crear una cuenta gratis</a>
          </div>
        </div>
      </section>
    </div>
  `,
})
export class LoginComponent {
  readonly store = inject(PortfolioStoreService);
  readonly enviando = signal<boolean>(false);

  email = '';
  clave = '';

  constructor() {
    this.store.errorGlobal.set(null);
  }

  async enviar(): Promise<void> {
    if (this.enviando()) return;
    const correo = this.email.trim();
    if (!correo || !this.clave) {
      this.store.notificarError('Introduce tu correo electrónico y contraseña.');
      return;
    }
    this.enviando.set(true);
    try {
      await this.store.login(correo, this.clave);
    } finally {
      this.enviando.set(false);
    }
  }
}
