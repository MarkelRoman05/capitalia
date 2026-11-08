import { Component, OnInit, inject } from '@angular/core';
import { PortfolioStoreService, TabId } from './services/portfolio-store.service';
import { FormatService } from './services/format.service';
import { LoginComponent } from './components/login/login.component';
import { PatrimonioTabComponent } from './components/patrimonio-tab/patrimonio-tab.component';
import { MesTabComponent } from './components/mes-tab/mes-tab.component';
import { ProductosTabComponent } from './components/productos-tab/productos-tab.component';
import { RendimientoTabComponent } from './components/rendimiento-tab/rendimiento-tab.component';
import { DatosTabComponent } from './components/datos-tab/datos-tab.component';
import { AyudaTabComponent } from './components/ayuda-tab/ayuda-tab.component';

@Component({
  selector: 'app-root',
  imports: [
    LoginComponent,
    PatrimonioTabComponent,
    MesTabComponent,
    ProductosTabComponent,
    RendimientoTabComponent,
    DatosTabComponent,
    AyudaTabComponent,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  host: {
    '(document:keydown)': 'onKeydown($event)',
  },
})
export class App implements OnInit {
  readonly store = inject(PortfolioStoreService);
  readonly fmt = inject(FormatService);

  readonly pestanas: { id: TabId; etiqueta: string; tecla: string }[] = [
    { id: 'patrimonio', etiqueta: 'Patrimonio', tecla: '1' },
    { id: 'mes', etiqueta: 'Este mes', tecla: '2' },
    { id: 'fondos', etiqueta: 'Productos', tecla: '3' },
    { id: 'rendimiento', etiqueta: 'Rendimiento', tecla: '4' },
    { id: 'datos', etiqueta: 'Mis datos', tecla: '5' },
    { id: 'ayuda', etiqueta: 'Ayuda', tecla: '6' },
  ];

  ngOnInit(): void {
    this.store.inicializarApp();
  }

  onKeydown(ev: KeyboardEvent): void {
    if (!this.store.autenticado()) return;
    const tag = (ev.target as HTMLElement | null)?.tagName || '';
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;

    if (ev.key === 'Escape') {
      if (this.store.confirmacionActiva()) {
        this.store.cerrarConfirmacion();
        return;
      }
      if (this.store.modalObjetivoAbierto()) {
        this.store.modalObjetivoAbierto.set(false);
        return;
      }
      this.store.mostrarTodos();
      return;
    }

    const k = ev.key.toLowerCase();
    if (k === 'v') {
      this.store.alternarModoVideo();
    } else if (k === 'l') {
      this.store.alternarTema();
    } else if (k >= '1' && k <= '6') {
      const idx = Number(k) - 1;
      const p = this.pestanas[idx];
      if (p) this.store.tabActiva.set(p.id);
    }
  }
}
