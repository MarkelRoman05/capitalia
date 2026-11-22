import { Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { PortfolioStoreService, TabId } from '../../services/portfolio-store.service';
import { LogoComponent } from '../logo/logo.component';

export interface NavItem {
  id: TabId;
  ruta: string;
  etiqueta: string;
}

@Component({
  selector: 'cap-navbar',
  imports: [RouterLink, RouterLinkActive, LogoComponent],
  styles: [':host { display: contents; }'],
  host: {
    '(document:click)': 'cerrarMenu()',
    '(document:keydown.escape)': 'cerrarMenu()',
  },
  template: `
    <header class="topbar">
      <div class="topbar-inner">
        <a routerLink="/patrimonio" class="brand-group" aria-label="Ir a Patrimonio">
          <span class="brand-logo-wrap">
            <cap-logo class="brand-logo" [size]="30" />
          </span>
          <span class="brand-texts">
            <span class="brand-name">Capitalia</span>
          </span>
        </a>

        <nav class="main-nav" aria-label="Navegación principal">
          @for (p of pestanas; track p.id) {
            <a
              [routerLink]="p.ruta"
              routerLinkActive="on"
              #rla="routerLinkActive"
              class="nav-tab"
              [attr.aria-current]="rla.isActive ? 'page' : null"
              (click)="store.tabActiva.set(p.id)"
            >
              <svg
                class="nav-ico"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.85"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                @switch (p.id) {
                  @case ('patrimonio') {
                    <path d="M3 20h18M6 20V10m6 10V4m6 16v-7" />
                  }
                  @case ('mes') {
                    <rect x="4" y="5" width="16" height="15" rx="2" />
                    <path d="M4 10h16M9 3v4m6-4v4" />
                  }
                  @case ('fondos') {
                    <circle cx="12" cy="12" r="8" />
                    <path d="M12 4v8l5.5 3.5" />
                  }
                  @case ('rendimiento') {
                    <path d="M3 17l6-6 4 4 8-8M15 7h6v6" />
                  }
                  @case ('datos') {
                    <path
                      d="M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zm4 5h6m-6 4h6m-6 4h3"
                    />
                  }
                  @case ('ayuda') {
                    <circle cx="12" cy="12" r="9" />
                    <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 1-1 1.7M12 17h.01" />
                  }
                }
              </svg>
              <span class="nav-label">{{ p.etiqueta }}</span>
            </a>
          }
        </nav>

        <div class="topbar-actions">
          <button
            type="button"
            class="btn-secundario btn-sm topbar-btn"
            [class.on]="store.modoPrivado()"
            [attr.aria-pressed]="store.modoPrivado()"
            (click)="store.alternarPrivado()"
            title="Ocultar o mostrar importes monetarios (Modo discreto)"
            [attr.aria-label]="
              store.modoPrivado() ? 'Desactivar modo discreto' : 'Activar modo discreto'
            "
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              @if (store.modoPrivado()) {
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                <line x1="1" y1="1" x2="23" y2="23" />
              } @else {
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              }
            </svg>
            <span class="topbar-label">{{ store.modoPrivado() ? 'Discreto' : 'Visible' }}</span>
          </button>

          <button
            type="button"
            class="btn-secundario btn-sm topbar-btn"
            [disabled]="store.actualizandoPrecios()"
            (click)="store.actualizarPrecios()"
            title="Sincronizar las últimas cotizaciones de mercado"
            [attr.aria-label]="
              store.actualizandoPrecios() ? 'Sincronizando precios' : 'Actualizar precios'
            "
          >
            <svg
              [class.girando]="store.actualizandoPrecios()"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.95"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M21 12a9 9 0 1 1-2.64-6.36" />
              <path d="M21 3v6h-6" />
            </svg>
          </button>

          @if (store.usuario(); as u) {
            <div class="user-menu" (click)="$event.stopPropagation()">
              <button
                type="button"
                class="user-menu-btn"
                [attr.aria-expanded]="menuAbierto()"
                aria-haspopup="menu"
                (click)="alternarMenu()"
                title="Cuenta y ajustes"
              >
                <span class="user-avatar" aria-hidden="true">{{
                  (u.nombre || u.email)[0].toUpperCase()
                }}</span>
                <span class="user-menu-name">{{ u.nombre || u.email }}</span>
                <svg class="user-menu-caret" viewBox="0 0 12 12" aria-hidden="true">
                  <path
                    d="M2.5 4.5 6 8l3.5-3.5"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.6"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </button>

              @if (menuAbierto()) {
                <div class="user-menu-panel" role="menu">
                  <div class="user-menu-head">
                    <span class="user-avatar" aria-hidden="true">{{
                      (u.nombre || u.email)[0].toUpperCase()
                    }}</span>
                    <span class="user-menu-head-txt">
                      <strong>{{ u.nombre || 'Sin nombre' }}</strong>
                      <small>{{ u.email }}</small>
                    </span>
                  </div>

                  <button
                    type="button"
                    class="user-menu-item"
                    role="menuitem"
                    (click)="abrirPerfil()"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                    </svg>
                    Modificar perfil
                  </button>

                  <button
                    type="button"
                    class="user-menu-item"
                    role="menuitem"
                    (click)="store.alternarPrivado()"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      @if (store.modoPrivado()) {
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      } @else {
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      }
                    </svg>
                    Modo discreto
                    <span class="um-val">{{ store.modoPrivado() ? 'Activo' : 'Inactivo' }}</span>
                  </button>

                  <button
                    type="button"
                    class="user-menu-item"
                    role="menuitem"
                    (click)="store.alternarTema()"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      @if (store.tema() === 'oscuro') {
                        <circle cx="12" cy="12" r="4.5" />
                        <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19" />
                      } @else {
                        <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11Z" />
                      }
                    </svg>
                    Tema
                    <span class="um-val">{{ store.tema() === 'oscuro' ? 'Claro' : 'Oscuro' }}</span>
                  </button>

                  <div class="user-menu-sep"></div>

                  <button
                    type="button"
                    class="user-menu-item user-menu-danger"
                    role="menuitem"
                    (click)="cerrarMenu(); store.logout()"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <path d="M10 17l5-5-5-5M15 12H3M21 4v16a2 2 0 0 1-2 2H5" />
                    </svg>
                    Cerrar sesión
                  </button>
                </div>
              }
            </div>
          }
        </div>
      </div>
    </header>
  `,
})
export class NavbarComponent {
  readonly store = inject(PortfolioStoreService);

  readonly menuAbierto = signal(false);

  readonly pestanas: NavItem[] = [
    { id: 'patrimonio', ruta: '/patrimonio', etiqueta: 'Patrimonio' },
    { id: 'mes', ruta: '/mes', etiqueta: 'Este mes' },
    { id: 'fondos', ruta: '/productos', etiqueta: 'Productos' },
    { id: 'rendimiento', ruta: '/rendimiento', etiqueta: 'Rendimiento' },
    { id: 'datos', ruta: '/datos', etiqueta: 'Mis datos' },
    { id: 'ayuda', ruta: '/ayuda', etiqueta: 'Ayuda' },
  ];

  alternarMenu(): void {
    this.menuAbierto.update((v) => !v);
  }

  cerrarMenu(): void {
    this.menuAbierto.set(false);
  }

  abrirPerfil(): void {
    this.cerrarMenu();
    this.store.modalPerfilAbierto.set(true);
  }
}
