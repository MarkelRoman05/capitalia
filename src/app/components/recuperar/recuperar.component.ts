import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PortfolioStoreService } from '../../services/portfolio-store.service';
import { LogoComponent } from '../logo/logo.component';
import { IconComponent } from '../icon/icon.component';

@Component({
  selector: 'cap-recuperar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, LogoComponent, IconComponent],
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

          <span class="auth-pill-kicker">RECUPERACIÓN DE ACCESO</span>
          <h1 class="auth-pitch-title">Vuelve a entrar a tu cartera de forma segura.</h1>
          <p class="auth-pitch-text">
            Generaremos un enlace temporal de un solo uso y lo enviaremos a tu correo electrónico
            para que puedas establecer una contraseña nueva.
          </p>
        </div>

        <ul class="auth-pitch-list">
          <li>Enlace cifrado con validez de 30 minutos y consumo único</li>
          <li>Tus datos patrimoniales e historial en PostgreSQL permanecen intactos</li>
        </ul>
      </section>

      <section class="auth-panel-wrapper">
        <div class="auth-card">
          <div class="auth-card-header">
            <span class="auth-kicker">RECUPERAR CLAVE</span>
            <h2 class="auth-title">¿Olvidaste tu contraseña?</h2>
            <p class="auth-sub">
              Introduce el correo de tu cuenta y te enviaremos instrucciones para restablecerla.
            </p>
          </div>

          @if (store.errorGlobal()) {
            <div class="auth-alert" role="alert">
              <span>{{ store.errorGlobal() }}</span>
            </div>
          }

          @if (enviado()) {
            <div class="auth-success-box" role="status">
              <h3>Revisa tu bandeja de entrada</h3>
              <p>{{ mensajeConfirmacion() }}</p>
              <p class="muted">
                El enlace caduca en 30 minutos. Si no lo ves, revisa tu carpeta de spam.
              </p>
              <div class="auth-success-actions">
                <a routerLink="/login" class="btn-primario auth-submit">Volver a iniciar sesión</a>
                <button type="button" class="btn-link" (click)="reiniciar()">
                  Probar con otro correo electrónico
                </button>
              </div>
            </div>
          } @else {
            <form class="auth-form" (ngSubmit)="enviar()">
              <div class="campo">
                <label for="rec-email">Correo electrónico</label>
                <input
                  id="rec-email"
                  type="email"
                  name="email"
                  [(ngModel)]="email"
                  placeholder="nombre@dominio.com"
                  autocomplete="email"
                  required
                />
              </div>

              <button type="submit" class="btn-primario auth-submit" [disabled]="enviando()">
                @if (enviando()) {
                  <cap-icon name="spinner" [size]="15" [spin]="true" />
                  <span>Enviando enlace…</span>
                } @else {
                  <span>Enviar enlace de recuperación</span>
                  <cap-icon name="arrow-right" [size]="15" />
                }
              </button>
            </form>

            <div class="auth-switch-prompt">
              <span>¿Ya recordaste tu contraseña?</span>
              <a routerLink="/login" class="btn-link">Volver a iniciar sesión</a>
            </div>
          }
        </div>
      </section>
    </div>
  `,
})
export class RecuperarComponent {
  readonly store = inject(PortfolioStoreService);
  readonly enviando = signal<boolean>(false);
  readonly enviado = signal<boolean>(false);
  readonly mensajeConfirmacion = signal<string>('');

  email = '';

  constructor() {
    this.store.errorGlobal.set(null);
  }

  reiniciar(): void {
    this.enviado.set(false);
    this.store.errorGlobal.set(null);
  }

  async enviar(): Promise<void> {
    if (this.enviando()) return;
    const correo = this.email.trim();
    if (!correo) {
      this.store.notificarError('Introduce tu correo electrónico.');
      return;
    }
    this.enviando.set(true);
    try {
      const res = await this.store.solicitarRecuperacion(correo);
      if (res.ok) {
        this.mensajeConfirmacion.set(
          res.mensaje ||
            'Si existe una cuenta asociada a ese correo, recibirás en unos instantes un enlace para restablecer tu contraseña.',
        );
        this.enviado.set(true);
      }
    } finally {
      this.enviando.set(false);
    }
  }
}
