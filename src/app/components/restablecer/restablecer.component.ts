import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PortfolioStoreService } from '../../services/portfolio-store.service';
import { LogoComponent } from '../logo/logo.component';
import { IconComponent } from '../icon/icon.component';

@Component({
  selector: 'cap-restablecer',
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

          <span class="auth-pill-kicker">NUEVA CONTRASEÑA</span>
          <h1 class="auth-pitch-title">Elige una nueva contraseña segura.</h1>
          <p class="auth-pitch-text">
            Usa al menos 8 caracteres. Una vez guardada, este enlace quedará invalidado
            automáticamente.
          </p>
        </div>
      </section>

      <section class="auth-panel-wrapper">
        <div class="auth-card">
          <div class="auth-card-header">
            <span class="auth-kicker">SEGURIDAD</span>
            <h2 class="auth-title">Restablecer contraseña</h2>
            <p class="auth-sub">Introduce y confirma tu nueva clave de acceso a Capitalia.</p>
          </div>

          @if (store.errorGlobal()) {
            <div class="auth-alert" role="alert">
              <span>{{ store.errorGlobal() }}</span>
            </div>
          }

          @if (!token()) {
            <div class="auth-alert" role="alert">
              <span>Falta el token de recuperación o el enlace está incompleto.</span>
            </div>
            <div class="auth-success-actions">
              <a routerLink="/recuperar" class="btn-primario auth-submit">Solicitar nuevo enlace</a>
              <a routerLink="/login" class="btn-link">Volver a iniciar sesión</a>
            </div>
          } @else {
            <form class="auth-form" (ngSubmit)="enviar()">
              <div class="campo">
                <label for="rst-clave">Nueva contraseña (mínimo 8 caracteres)</label>
                <input
                  id="rst-clave"
                  type="password"
                  name="clave"
                  [(ngModel)]="clave"
                  placeholder="Introduce la nueva contraseña"
                  autocomplete="new-password"
                  minlength="8"
                  maxlength="128"
                  required
                />
              </div>

              <div class="campo">
                <label for="rst-clave2">Repetir nueva contraseña</label>
                <input
                  id="rst-clave2"
                  type="password"
                  name="claveConfirm"
                  [(ngModel)]="claveConfirm"
                  placeholder="Repite la nueva contraseña"
                  autocomplete="new-password"
                  minlength="8"
                  maxlength="128"
                  required
                />
              </div>

              <button type="submit" class="btn-primario auth-submit" [disabled]="enviando()">
                @if (enviando()) {
                  <cap-icon name="spinner" [size]="15" [spin]="true" />
                  <span>Guardando contraseña…</span>
                } @else {
                  <span>Guardar nueva contraseña</span>
                  <cap-icon name="arrow-right" [size]="15" />
                }
              </button>
            </form>

            <div class="auth-switch-prompt">
              <span>¿Necesitas otro enlace?</span>
              <a routerLink="/recuperar" class="btn-link">Solicitar recuperación</a>
            </div>
          }
        </div>
      </section>
    </div>
  `,
})
export class RestablecerComponent {
  readonly store = inject(PortfolioStoreService);
  readonly enviando = signal<boolean>(false);
  readonly token = signal<string>('');

  clave = '';
  claveConfirm = '';

  constructor() {
    this.store.errorGlobal.set(null);
    this.extraerToken();
  }

  private extraerToken(): void {
    if (typeof window === 'undefined') return;
    let tok = '';
    const hash = window.location.hash || '';
    if (hash.startsWith('#')) {
      tok = new URLSearchParams(hash.slice(1)).get('token') || '';
    }
    if (!tok && window.location.search) {
      tok = new URLSearchParams(window.location.search).get('token') || '';
    }
    if (tok) {
      this.token.set(tok.trim());
      window.history.replaceState(null, '', '/restablecer');
    }
  }

  async enviar(): Promise<void> {
    if (this.enviando() || !this.token()) return;
    if (this.clave.length < 8) {
      this.store.notificarError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (this.clave !== this.claveConfirm) {
      this.store.notificarError('Las dos contraseñas no coinciden.');
      return;
    }
    this.enviando.set(true);
    try {
      await this.store.restablecerContrasena(this.token(), this.clave);
    } finally {
      this.enviando.set(false);
    }
  }
}
