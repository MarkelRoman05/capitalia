import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PortfolioStoreService } from '../../services/portfolio-store.service';
import { FormatService } from '../../services/format.service';
import { LogoComponent } from '../logo/logo.component';

@Component({
  selector: 'cap-footer',
  imports: [RouterLink, LogoComponent],
  styles: [':host { display: block; }'],
  template: `
    <footer class="app-footer">
      <div class="footer-brand-info">
        <div class="footer-logo-row">
          <cap-logo class="footer-logo" [size]="20" />
          <strong>Capitalia</strong>
        </div>
        @if (store.datos()?.fechaExtracto) {
          <span class="footer-meta">
            Series valoradas al cierre del
            <strong>{{ fmt.fechaCorta(store.datos()!.fechaExtracto) }}</strong>
            @if (store.datos()?.preciosActualizados) {
              · Sincronizado con Morningstar, Yahoo Finance y CoinGecko
            }
          </span>
        }
      </div>

      <div class="footer-right">
        <div class="footer-shortcuts hide-sm" aria-label="Atajos de teclado rápidos">
          <span><kbd>1</kbd>–<kbd>6</kbd> Rutas</span>
          <span><kbd>V</kbd> Presentación</span>
          <span><kbd>L</kbd> Tema</span>
          <span><kbd>Esc</kbd> Restablecer</span>
        </div>
        <div class="footer-links">
          <a routerLink="/patrimonio">Patrimonio</a>
          <a routerLink="/rendimiento">Rendimiento</a>
          <a routerLink="/datos" class="solo-edicion">Mis datos</a>
          <a routerLink="/ayuda">Ayuda</a>
        </div>
      </div>
    </footer>
  `,
})
export class FooterComponent {
  readonly store = inject(PortfolioStoreService);
  readonly fmt = inject(FormatService);
}
