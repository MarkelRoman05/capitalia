import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { PortfolioStoreService } from '../../services/portfolio-store.service';
import { ProductoModalComponent } from '../modals/producto-modal/producto-modal.component';
import { MovimientoModalComponent } from '../modals/movimiento-modal/movimiento-modal.component';
import { ValoracionModalComponent } from '../modals/valoracion-modal/valoracion-modal.component';
import { LoteSaldosModalComponent } from '../modals/lote-saldos-modal/lote-saldos-modal.component';
import { CarteraPosicionesModalComponent } from '../modals/cartera-posiciones-modal/cartera-posiciones-modal.component';
import {
  GrupoProductosDatos,
  ProductosSubtabComponent,
} from './productos-subtab.component';
import { FiltroMovTipo, MovimientosSubtabComponent } from './movimientos-subtab.component';
import { SaldosSubtabComponent } from './saldos-subtab.component';
import { GrupoImportarActivo, ImportarSubtabComponent } from './importar-subtab.component';
import { CopiasSubtabComponent } from './copias-subtab.component';
import { MovimientoCfg, ProductoCfg, ValoracionCfg } from '../../models/portfolio.model';

@Component({
  selector: 'cap-datos-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ProductoModalComponent,
    MovimientoModalComponent,
    ValoracionModalComponent,
    LoteSaldosModalComponent,
    CarteraPosicionesModalComponent,
    ProductosSubtabComponent,
    MovimientosSubtabComponent,
    SaldosSubtabComponent,
    ImportarSubtabComponent,
    CopiasSubtabComponent,
  ],
  template: `
    @if (store.cartera(); as c) {
      <!-- SUB-NAVEGACIÓN DE MIS DATOS -->
      <div class="datos-subnav-bar">
        <nav class="datos-tabs" role="tablist" aria-label="Secciones de Mis datos">
          <button
            type="button"
            role="tab"
            class="datos-tab"
            [class.on]="store.subTabDatos() === 'productos'"
            [attr.aria-selected]="store.subTabDatos() === 'productos'"
            (click)="cambiarSubTab('productos')"
          >
            <svg
              class="datos-tab-ico"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.85"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <rect x="3" y="3" width="7" height="7" rx="1.5" />
              <rect x="14" y="3" width="7" height="7" rx="1.5" />
              <rect x="3" y="14" width="7" height="7" rx="1.5" />
              <rect x="14" y="14" width="7" height="7" rx="1.5" />
            </svg>
            <span>Productos</span>
            <span class="datos-tab-badge">{{ c.productos.length }}</span>
          </button>

          <button
            type="button"
            role="tab"
            class="datos-tab"
            [class.on]="store.subTabDatos() === 'movimientos'"
            [attr.aria-selected]="store.subTabDatos() === 'movimientos'"
            (click)="cambiarSubTab('movimientos')"
          >
            <svg
              class="datos-tab-ico"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.85"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" />
            </svg>
            <span>Compras y ventas</span>
            <span class="datos-tab-badge">{{ c.movimientos.length }}</span>
          </button>

          <button
            type="button"
            role="tab"
            class="datos-tab"
            [class.on]="store.subTabDatos() === 'saldos'"
            [attr.aria-selected]="store.subTabDatos() === 'saldos'"
            (click)="cambiarSubTab('saldos')"
          >
            <svg
              class="datos-tab-ico"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.85"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path
                d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"
              />
              <path d="M16 12h5v4h-5a2 2 0 0 1 0-4Z" />
            </svg>
            <span>Saldos y valores</span>
            <span class="datos-tab-badge">{{ c.valoraciones.length }}</span>
          </button>

          <button
            type="button"
            role="tab"
            class="datos-tab"
            [class.on]="store.subTabDatos() === 'importar'"
            [attr.aria-selected]="store.subTabDatos() === 'importar'"
            (click)="cambiarSubTab('importar')"
          >
            <svg
              class="datos-tab-ico"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.85"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <path d="M17 8l-5-5-5 5M12 3v12" />
            </svg>
            <span>Importar datos</span>
          </button>

          <button
            type="button"
            role="tab"
            class="datos-tab"
            [class.on]="store.subTabDatos() === 'copias'"
            [attr.aria-selected]="store.subTabDatos() === 'copias'"
            (click)="cambiarSubTab('copias')"
          >
            <svg
              class="datos-tab-ico"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.85"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6l7-3Z" />
              <path d="M9.5 12l1.8 1.8L15 10" />
            </svg>
            <span>Copias y web</span>
          </button>
        </nav>

        <div class="datos-acciones-globales">
          <button
            type="button"
            class="btn-peligro-outline btn-sm"
            (click)="confirmarVaciarCartera()"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.9"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
            </svg>
            <span>Vaciar cartera</span>
          </button>
        </div>
      </div>

      @if (store.subTabDatos() === 'productos') {
        <cap-productos-subtab
          [(gruposExpandidos)]="gruposExpandidos"
          (abrirProducto)="abrirModalProducto($event)"
          (abrirMovimientoParaProducto)="abrirModalMovimiento(undefined, $event)"
          (abrirValoracionParaProducto)="abrirModalValoracion(undefined, $event)"
          (verMovimientos)="verMovimientosDeProducto($event)"
          (verSaldos)="verSaldosDeProducto($event)"
          (abrirPosicionesGrupo)="abrirModalPosicionesGrupo($event.id, $event.nombre)"
          (irAImportarGrupo)="irAImportarGrupo($event)"
        />
      }

      @if (store.subTabDatos() === 'movimientos') {
        <cap-movimientos-subtab
          [(filtroMovProd)]="filtroMovProd"
          [(filtroMovTipo)]="filtroMovTipo"
          [(filtroMovTexto)]="filtroMovTexto"
          (abrirMovimiento)="abrirModalMovimiento($event)"
          (duplicarMovimiento)="duplicarMovimiento($event)"
        />
      }

      @if (store.subTabDatos() === 'saldos') {
        <cap-saldos-subtab
          [(filtroValProd)]="filtroValProd"
          (abrirValoracion)="abrirModalValoracion($event)"
          (abrirLoteSaldos)="abrirModalLoteSaldos()"
        />
      }

      @if (store.subTabDatos() === 'importar') {
        <cap-importar-subtab
          [productos]="c.productos"
          [(importarGrupo)]="importarGrupoActivo"
        />
      }

      @if (store.subTabDatos() === 'copias') {
        <cap-copias-subtab />
      }

      <!-- MODALES -->
      <cap-producto-modal
        [abierto]="modalProductoAbierto()"
        [productoEditar]="prodEditando()"
        (cerrar)="modalProductoAbierto.set(false)"
        (creadoYAbrir)="onProductoCreadoYAbrir($event)"
        (carteraCreada)="onCarteraCreada($event)"
      />
      <cap-cartera-posiciones-modal
        [abierto]="modalPosicionesAbierto()"
        [grupoId]="modalPosicionesGrupo()?.id ?? null"
        [grupoNombre]="modalPosicionesGrupo()?.nombre ?? ''"
        (cerrar)="modalPosicionesAbierto.set(false)"
        (irAImportar)="onIrAImportarDesdePosiciones($event)"
      />
      <cap-movimiento-modal
        [abierto]="modalMovimientoAbierto()"
        [movimientoEditar]="movEditando()"
        [movimientoDuplicar]="movDuplicando()"
        [productoPreseleccionado]="movProductoPreseleccionado()"
        (cerrar)="modalMovimientoAbierto.set(false)"
      />
      <cap-valoracion-modal
        [abierto]="modalValoracionAbierto()"
        [valoracionEditar]="valEditando()"
        [productoPreseleccionado]="valProductoPreseleccionado()"
        (cerrar)="modalValoracionAbierto.set(false)"
      />
      <cap-lote-saldos-modal
        [abierto]="modalLoteSaldosAbierto()"
        (cerrar)="modalLoteSaldosAbierto.set(false)"
      />
    }
  `,
})
export class DatosTabComponent {
  readonly store = inject(PortfolioStoreService);

  // Shared cross-subtab filter & group expansion state
  readonly filtroMovProd = signal<string>('todos');
  readonly filtroMovTipo = signal<FiltroMovTipo>('todos');
  readonly filtroMovTexto = signal<string>('');
  readonly filtroValProd = signal<string>('todos');
  readonly gruposExpandidos = signal<Set<string>>(new Set());

  // Product modal state
  readonly modalProductoAbierto = signal<boolean>(false);
  readonly prodEditando = signal<ProductoCfg | null>(null);

  // Group portfolio positions modal & contextual MyInvestor import banner
  readonly modalPosicionesAbierto = signal<boolean>(false);
  readonly modalPosicionesGrupo = signal<{ id: string; nombre: string } | null>(null);
  readonly importarGrupoActivo = signal<GrupoImportarActivo | null>(null);

  // Movement modal state
  readonly modalMovimientoAbierto = signal<boolean>(false);
  readonly movEditando = signal<MovimientoCfg | null>(null);
  readonly movDuplicando = signal<MovimientoCfg | null>(null);
  readonly movProductoPreseleccionado = signal<string | undefined>(undefined);

  // Balance modal state
  readonly modalValoracionAbierto = signal<boolean>(false);
  readonly valEditando = signal<ValoracionCfg | null>(null);
  readonly valProductoPreseleccionado = signal<string | undefined>(undefined);

  // Batch Balances modal state
  readonly modalLoteSaldosAbierto = signal<boolean>(false);

  constructor() {
    void this.store.cargarBancosIniciales();
    effect(() => {
      if (this.store.subTabDatos() === 'copias') {
        this.store.cargarCopias();
      }
    });
  }

  cambiarSubTab(sub: 'productos' | 'movimientos' | 'saldos' | 'importar' | 'copias'): void {
    this.store.subTabDatos.set(sub);
  }

  verMovimientosDeProducto(id: string): void {
    this.filtroMovProd.set(id);
    this.filtroMovTipo.set('todos');
    this.filtroMovTexto.set('');
    this.store.subTabDatos.set('movimientos');
  }

  verSaldosDeProducto(id: string): void {
    this.filtroValProd.set(id);
    this.store.subTabDatos.set('saldos');
  }

  onProductoCreadoYAbrir(ev: { id: string; accion: 'movimiento' | 'saldo' }): void {
    if (ev.accion === 'movimiento') {
      this.abrirModalMovimiento(undefined, ev.id);
    } else {
      this.abrirModalValoracion(undefined, ev.id);
    }
  }

  onCarteraCreada(ev: { grupoId: string; grupoNombre: string }): void {
    this.gruposExpandidos.update((prev) => {
      const next = new Set(prev);
      next.add(ev.grupoId);
      return next;
    });
    this.abrirModalPosicionesGrupo(ev.grupoId, ev.grupoNombre);
  }

  abrirModalPosicionesGrupo(id: string, nombre: string): void {
    this.modalPosicionesGrupo.set({ id, nombre });
    this.modalPosicionesAbierto.set(true);
  }

  onIrAImportarDesdePosiciones(grupoId: string): void {
    const prods = (this.store.cartera()?.productos || []).filter(
      (p) => (p.grupoId || '').trim().toLowerCase() === grupoId.trim().toLowerCase(),
    );
    const nombre = prods[0]?.grupoNombre || grupoId;
    const isins = prods
      .map((p) => (p.identificador || p.codigo || '').trim().toUpperCase())
      .filter(Boolean);
    this.importarGrupoActivo.set({ id: grupoId, nombre, isins });
    this.store.subTabDatos.set('importar');
  }

  irAImportarGrupo(grp: GrupoProductosDatos): void {
    const isins = grp.productos
      .map((p) => (p.identificador || p.codigo || '').trim().toUpperCase())
      .filter(Boolean);
    this.importarGrupoActivo.set({ id: grp.grupoId, nombre: grp.grupoNombre, isins });
    this.store.subTabDatos.set('importar');
  }

  abrirModalProducto(p?: ProductoCfg): void {
    this.prodEditando.set(p ?? null);
    this.modalProductoAbierto.set(true);
  }

  abrirModalMovimiento(
    m?: MovimientoCfg,
    productoPreseleccionado?: string,
    duplicar?: MovimientoCfg,
  ): void {
    this.movEditando.set(m ?? null);
    this.movDuplicando.set(duplicar ?? null);
    this.movProductoPreseleccionado.set(productoPreseleccionado);
    this.modalMovimientoAbierto.set(true);
  }

  duplicarMovimiento(m: MovimientoCfg): void {
    this.abrirModalMovimiento(undefined, undefined, m);
  }

  abrirModalValoracion(v?: ValoracionCfg, productoPreseleccionado?: string): void {
    this.valEditando.set(v ?? null);
    this.valProductoPreseleccionado.set(productoPreseleccionado);
    this.modalValoracionAbierto.set(true);
  }

  abrirModalLoteSaldos(): void {
    this.modalLoteSaldosAbierto.set(true);
  }

  confirmarVaciarCartera(): void {
    this.store.pedirConfirmacion({
      titulo: 'Vaciar toda la cartera',
      mensaje:
        '¿Estás seguro de que quieres vaciar todos los productos, movimientos y saldos? Se creará automáticamente una copia de seguridad en PostgreSQL por si deseas deshacerlo.',
      textoConfirmar: 'Sí, vaciar cartera',
      peligro: true,
      accion: async () => {
        await this.store.reiniciarCartera();
      },
    });
  }
}
