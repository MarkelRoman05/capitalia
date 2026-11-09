import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { PortfolioStoreService, TabId } from '../../services/portfolio-store.service';
import { FormatService } from '../../services/format.service';

export interface NavItem {
  id: TabId;
  ruta: string;
  etiqueta: string;
  tecla: string;
}

@Component({
  selector: 'cap-navbar',
  imports: [RouterLink, RouterLinkActive],
  styles: [':host { display: contents; }'],
  template: `
    <aside class="sidebar" aria-label="Barra lateral de navegación">
      <a routerLink="/patrimonio" class="brand-group" aria-label="Ir a Patrimonio">
        <div class="brand-logo-wrap">
          <svg class="brand-logo" viewBox="0 0 32 32" aria-hidden="true">
            <rect width="32" height="32" rx="8" fill="currentColor" opacity="0.16" />
            <path
              d="M7 22V12m6 10V15m6 7V8m6 14V11"
              stroke="currentColor"
              stroke-width="2.6"
              stroke-linecap="round"
            />
          </svg>
        </div>
        <span class="brand-texts">
          <span class="brand-name">Capitalia</span>
          <span class="brand-sub">{{ store.datos()?.titular || 'Private Wealth' }}</span>
        </span>
      </a>

      @if (store.datos(); as d) {
        <div class="sidebar-patrimonio-mini hide-mobile">
          <span class="spm-label">Patrimonio neto</span>
          <strong class="spm-val valor-privado">{{ fmt.eur(d.total.patrimonio, 0) }}</strong>
          @if (d.total.tir !== null) {
            <span class="spm-badge" [class]="fmt.claseSigno(d.total.tir)">
              TIR {{ fmt.pctSigno(d.total.tir, 1) }}
            </span>
          }
        </div>
      }

      <div class="sidebar-section-label hide-mobile">MENÚ PRINCIPAL</div>

      <nav class="main-nav" aria-label="Navegación principal">
        @for (p of pestanas; track p.id) {
          <a
            [routerLink]="p.ruta"
            routerLinkActive="on"
            #rla="routerLinkActive"
            class="nav-tab"
            [class.solo-edicion]="p.id === 'datos'"
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
            <kbd class="nav-kbd">{{ p.tecla }}</kbd>
          </a>
        }
      </nav>

      <div class="sidebar-foot">
        <button
          type="button"
          class="side-btn side-btn-primary solo-edicion"
          [disabled]="store.actualizandoPrecios()"
          (click)="store.actualizarPrecios()"
          title="Sincronizar las últimas cotizaciones de mercado"
        >
          <span [class.girando]="store.actualizandoPrecios()" aria-hidden="true">↻</span>
          <span>{{ store.actualizandoPrecios() ? 'Sincronizando…' : 'Actualizar precios' }}</span>
        </button>

        <div class="side-row">
          <button
            type="button"
            class="side-btn side-btn-sm"
            [class.on]="store.modoVideo()"
            (click)="store.alternarModoVideo()"
            title="Modo presentación (Atajo: V)"
          >
            <span aria-hidden="true">{{ store.modoVideo() ? '◉' : '◎' }}</span>
            <span>Presentar</span>
          </button>
          <button
            type="button"
            class="side-btn side-btn-sm"
            (click)="store.alternarTema()"
            title="Cambiar tema visual (Atajo: L)"
          >
            <span aria-hidden="true">{{ store.tema() === 'oscuro' ? '☀' : '☾' }}</span>
            <span>{{ store.tema() === 'oscuro' ? 'Claro' : 'Oscuro' }}</span>
          </button>
        </div>

        @if (store.usuario(); as u) {
          <div class="user-chip solo-edicion">
            <span class="user-avatar" aria-hidden="true">{{
              (u.nombre || u.email)[0].toUpperCase()
            }}</span>
            <div class="user-meta">
              <span class="user-name">{{ u.nombre || u.email }}</span>
              <span class="user-role">Sesión activa</span>
            </div>
            <button type="button" class="btn-salir" (click)="store.logout()" title="Cerrar sesión">
              Salir
            </button>
          </div>
        }
      </div>
    </aside>
  `,
})
export class NavbarComponent {
  readonly store = inject(PortfolioStoreService);
  readonly fmt = inject(FormatService);

  readonly pestanas: NavItem[] = [
    { id: 'patrimonio', ruta: '/patrimonio', etiqueta: 'Patrimonio', tecla: '1' },
    { id: 'mes', ruta: '/mes', etiqueta: 'Este mes', tecla: '2' },
    { id: 'fondos', ruta: '/productos', etiqueta: 'Productos', tecla: '3' },
    { id: 'rendimiento', ruta: '/rendimiento', etiqueta: 'Rendimiento', tecla: '4' },
    { id: 'datos', ruta: '/datos', etiqueta: 'Mis datos', tecla: '5' },
    { id: 'ayuda', ruta: '/ayuda', etiqueta: 'Ayuda', tecla: '6' },
  ];
}
