import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PortfolioStoreService } from '../../services/portfolio-store.service';
import { FormatService } from '../../services/format.service';
import { ProductoModalComponent } from '../modals/producto-modal/producto-modal.component';
import { MovimientoModalComponent } from '../modals/movimiento-modal/movimiento-modal.component';
import { ValoracionModalComponent } from '../modals/valoracion-modal/valoracion-modal.component';
import { LoteSaldosModalComponent } from '../modals/lote-saldos-modal/lote-saldos-modal.component';
import {
  InformeImportacion,
  MovimientoCfg,
  ProductoCfg,
  ValoracionCfg,
} from '../../models/portfolio.model';

interface ArchivoLeido {
  nombre: string;
  base64: string;
}

@Component({
  selector: 'cap-datos-tab',
  imports: [
    FormsModule,
    ProductoModalComponent,
    MovimientoModalComponent,
    ValoracionModalComponent,
    LoteSaldosModalComponent,
  ],
  template: `
    @if (store.cartera(); as c) {
      <!-- SUB-NAVEGACIÓN DE MIS DATOS -->
      <div class="datos-subnav-bar">
        <div class="seg-group" role="tablist" aria-label="Secciones de Mis datos">
          <button
            type="button"
            class="seg-btn"
            [class.on]="store.subTabDatos() === 'productos'"
            (click)="cambiarSubTab('productos')"
          >
            Productos ({{ c.productos.length }})
          </button>
          <button
            type="button"
            class="seg-btn"
            [class.on]="store.subTabDatos() === 'movimientos'"
            (click)="cambiarSubTab('movimientos')"
          >
            Compras y ventas ({{ c.movimientos.length }})
          </button>
          <button
            type="button"
            class="seg-btn"
            [class.on]="store.subTabDatos() === 'saldos'"
            (click)="cambiarSubTab('saldos')"
          >
            Saldos y valores ({{ c.valoraciones.length }})
          </button>
          <button
            type="button"
            class="seg-btn"
            [class.on]="store.subTabDatos() === 'importar'"
            (click)="cambiarSubTab('importar')"
          >
            Importar datos
          </button>
          <button
            type="button"
            class="seg-btn"
            [class.on]="store.subTabDatos() === 'copias'"
            (click)="cambiarSubTab('copias')"
          >
            Copias y web
          </button>
        </div>

        <div class="datos-acciones-globales">
          <button type="button" class="btn-secundario btn-sm" (click)="store.cargarEjemplo()">
            Cargar ejemplo
          </button>
          <button
            type="button"
            class="btn-peligro-outline btn-sm"
            (click)="confirmarVaciarCartera()"
          >
            Vaciar cartera
          </button>
        </div>
      </div>

      <!-- ========================================================= -->
      <!-- 1. SUB-TAB: PRODUCTOS                                     -->
      <!-- ========================================================= -->
      @if (store.subTabDatos() === 'productos') {
        <section class="panel-card bloque-seccion">
          <div class="card-header">
            <div>
              <h2 class="card-title">Productos, cuentas, inmuebles y deudas</h2>
              <p class="card-sub">
                Configura cada activo de tu patrimonio. Los fondos, ETFs, acciones y cripto
                actualizan su cotización automáticamente.
              </p>
            </div>
            <div class="header-btns">
              <button type="button" class="btn-fantasma btn-sm" (click)="store.repartirColores()">
                Repartir colores
              </button>
              <button type="button" class="btn-primario" (click)="abrirModalProducto()">
                + Añadir producto
              </button>
            </div>
          </div>

          <div class="tabla-scroll">
            <table class="tabla-datos">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Tipo</th>
                  <th>ISIN / Ticker / Fuente</th>
                  <th>Entidad / Clase</th>
                  <th class="num">Valor actual</th>
                  <th class="num">Acciones</th>
                </tr>
              </thead>
              <tbody>
                @for (p of c.productos; track p.id; let idx = $index) {
                  <tr>
                    <td>
                      <div class="celda-prod-nombre">
                        <span
                          class="dot"
                          [style.background]="fmt.colorDeSlot(p.slot ?? idx)[0]"
                        ></span>
                        <div>
                          <strong>{{ p.nombre }}</strong>
                          @if (p.largoPlazo) {
                            <span class="tag tag-lp" style="margin-left: 0.4rem">LP</span>
                          }
                        </div>
                      </div>
                    </td>
                    <td>
                      <span class="tag">{{ etiquetaTipo(p.tipo) }}</span>
                    </td>
                    <td class="mono">
                      {{ p.identificador || p.codigo || '—' }}
                      <small class="muted">({{ p.fuente }})</small>
                    </td>
                    <td>
                      {{ p.entidad || '—' }}
                      @if (p.clase) {
                        <small class="muted">· {{ p.clase }}</small>
                      }
                    </td>
                    <td class="num mono valor-privado">
                      {{ fmt.eur(valorActualProducto(p.id), 2) }}
                    </td>
                    <td class="num celda-acciones">
                      @if (esTipoInversion(p.tipo) && p.fuente !== 'manual') {
                        <button
                          type="button"
                          class="btn-tabla"
                          (click)="abrirModalMovimiento(undefined, p.id)"
                          title="Anotar compra o venta"
                        >
                          + Compra
                        </button>
                      } @else {
                        <button
                          type="button"
                          class="btn-tabla"
                          (click)="abrirModalValoracion(undefined, p.id)"
                          title="Anotar saldo o valoración"
                        >
                          + Saldo
                        </button>
                      }
                      <button type="button" class="btn-tabla" (click)="abrirModalProducto(p)">
                        Editar
                      </button>
                      <button
                        type="button"
                        class="btn-tabla btn-tabla-peligro"
                        (click)="confirmarBorrarProducto(p)"
                      >
                        Borrar
                      </button>
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="6" class="vacio-celda">
                      Aún no has añadido ningún producto. Pulsa «+ Añadir producto» para empezar.
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>
      }

      <!-- ========================================================= -->
      <!-- 2. SUB-TAB: COMPRAS Y VENTAS                              -->
      <!-- ========================================================= -->
      @if (store.subTabDatos() === 'movimientos') {
        <section class="panel-card bloque-seccion">
          <div class="card-header">
            <div>
              <h2 class="card-title">Compras, ventas, dividendos y comisiones</h2>
              <p class="card-sub">
                El motor calcula automáticamente las plusvalías realizadas aplicando el criterio
                fiscal FIFO español.
              </p>
            </div>
            <div class="controles-tabla">
              <select
                class="input-select"
                [ngModel]="filtroMovProd()"
                (ngModelChange)="filtroMovProd.set($event)"
                aria-label="Filtrar movimientos por producto"
              >
                <option value="todos">Todos los productos</option>
                @for (p of c.productos; track p.id) {
                  <option [value]="p.id">{{ p.nombre }}</option>
                }
              </select>
              <button type="button" class="btn-primario" (click)="abrirModalMovimiento()">
                + Anotar operación
              </button>
            </div>
          </div>

          <div class="tabla-scroll">
            <table class="tabla-datos">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Producto</th>
                  <th>Operación</th>
                  <th class="num">Unidades / Part.</th>
                  <th class="num">Importe</th>
                  <th>Nota</th>
                  <th class="num">Acciones</th>
                </tr>
              </thead>
              <tbody>
                @for (m of movimientosFiltrados(); track m.id) {
                  <tr>
                    <td class="mono">{{ fmt.fechaCorta(m.fecha) }}</td>
                    <td>{{ nombreProducto(m.producto) }}</td>
                    <td>
                      <span class="tag" [class]="'tag-mov-' + m.tipo">{{
                        m.tipo.toUpperCase()
                      }}</span>
                    </td>
                    <td class="num mono">
                      {{ m.unidades ? fmt.num(m.unidades, 4) : '—' }}
                    </td>
                    <td class="num mono valor-privado">{{ fmt.eur(m.importe, 2) }}</td>
                    <td class="muted">{{ m.nota || '—' }}</td>
                    <td class="num celda-acciones">
                      <button type="button" class="btn-tabla" (click)="abrirModalMovimiento(m)">
                        Editar
                      </button>
                      <button
                        type="button"
                        class="btn-tabla btn-tabla-peligro"
                        (click)="confirmarBorrarMovimiento(m)"
                      >
                        Borrar
                      </button>
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="7" class="vacio-celda">No hay operaciones registradas.</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>
      }

      <!-- ========================================================= -->
      <!-- 3. SUB-TAB: SALDOS Y VALORES                              -->
      <!-- ========================================================= -->
      @if (store.subTabDatos() === 'saldos') {
        <section class="panel-card bloque-seccion">
          <div class="card-header">
            <div>
              <h2 class="card-title">
                Saldos de cuentas, inmuebles, deudas y valoraciones manuales
              </h2>
              <p class="card-sub">
                Anota el saldo de tus cuentas bancarias, el valor tasado de tus inmuebles o el
                capital pendiente de tus préstamos.
              </p>
            </div>
            <div class="header-btns">
              <button type="button" class="btn-secundario" (click)="abrirModalLoteSaldos()">
                Anotar todos de una vez
              </button>
              <button type="button" class="btn-primario" (click)="abrirModalValoracion()">
                + Anotar saldo puntual
              </button>
            </div>
          </div>

          <div class="tabla-scroll">
            <table class="tabla-datos">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Activo / Cuenta / Deuda</th>
                  <th class="num">Valor o saldo (€)</th>
                  <th class="num">Coste / Aportado (opcional)</th>
                  <th class="num">Acciones</th>
                </tr>
              </thead>
              <tbody>
                @for (v of valoracionesOrdenadas(); track v.id) {
                  <tr>
                    <td class="mono">{{ fmt.fechaCorta(v.fecha) }}</td>
                    <td>{{ nombreProducto(v.producto) }}</td>
                    <td class="num mono valor-privado">{{ fmt.eur(v.valor, 2) }}</td>
                    <td class="num mono valor-privado">
                      {{
                        v.aportado !== null && v.aportado !== undefined
                          ? fmt.eur(v.aportado, 2)
                          : '—'
                      }}
                    </td>
                    <td class="num celda-acciones">
                      <button type="button" class="btn-tabla" (click)="abrirModalValoracion(v)">
                        Editar
                      </button>
                      <button
                        type="button"
                        class="btn-tabla btn-tabla-peligro"
                        (click)="confirmarBorrarValoracion(v)"
                      >
                        Borrar
                      </button>
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="5" class="vacio-celda">No hay saldos manuales registrados.</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>
      }

      <!-- ========================================================= -->
      <!-- 4. SUB-TAB: IMPORTAR                                      -->
      <!-- ========================================================= -->
      @if (store.subTabDatos() === 'importar') {
        <section class="panel-card bloque-seccion">
          <div class="card-header">
            <div>
              <h2 class="card-title">Importar operaciones y saldos</h2>
              <p class="card-sub">
                Sube extractos de MyInvestor, utiliza nuestra plantilla oficial Excel/CSV o
                convierte capturas de cualquier banco con IA.
              </p>
            </div>
            <div class="seg-group">
              <button
                type="button"
                class="seg-btn"
                [class.on]="modoImportar() === 'myinvestor'"
                (click)="cambiarModoImportar('myinvestor')"
              >
                MyInvestor (CSV)
              </button>
              <button
                type="button"
                class="seg-btn"
                [class.on]="modoImportar() === 'plantilla'"
                (click)="cambiarModoImportar('plantilla')"
              >
                Plantilla Excel / CSV
              </button>
              <button
                type="button"
                class="seg-btn"
                [class.on]="modoImportar() === 'ia'"
                (click)="cambiarModoImportar('ia')"
              >
                Cualquier banco con IA
              </button>
            </div>
          </div>

          @if (modoImportar() === 'myinvestor') {
            <div class="import-box">
              <p>
                Descarga el extracto «Plusvalías y minusvalías» de cada fondo en CSV o Excel y
                selecciónalos aquí. Si el nombre del archivo incluye el código ISIN, Capitalia
                creará y vinculará cada fondo automáticamente.
              </p>
              <div class="form-grid-2" style="margin-top: 1rem">
                <div class="campo">
                  <label for="imp-files-my">Archivos de MyInvestor (CSV o Excel)</label>
                  <input
                    id="imp-files-my"
                    type="file"
                    accept=".csv,.txt,.xlsx"
                    multiple
                    (change)="onSeleccionarArchivosImportar($event)"
                  />
                </div>
                <div class="campo">
                  <label for="imp-prod-def"
                    >Producto por defecto (solo si el CSV no trae ISIN)</label
                  >
                  <select id="imp-prod-def" class="input-select" [(ngModel)]="impProductoDefecto">
                    <option value="">Detectar automáticamente por ISIN</option>
                    @for (p of c.productos; track p.id) {
                      <option [value]="p.id">{{ p.nombre }}</option>
                    }
                  </select>
                </div>
              </div>
            </div>
          }

          @if (modoImportar() === 'plantilla') {
            <div class="import-box">
              <p>
                Descarga la plantilla con ejemplos e instrucciones, rellena tus compras, ventas o
                saldos mensuales y súbela para previsualizar.
              </p>
              <div class="header-btns" style="margin: 1rem 0">
                <a href="/api/plantilla.xlsx" download class="btn-secundario btn-sm">
                  Descargar Plantilla Excel (.xlsx)
                </a>
                <a href="/api/plantilla.csv" download class="btn-fantasma btn-sm">
                  Descargar Plantilla CSV (.csv)
                </a>
              </div>
              <div class="campo">
                <label for="imp-files-pl">Subir plantilla rellena (.xlsx o .csv)</label>
                <input
                  id="imp-files-pl"
                  type="file"
                  accept=".xlsx,.csv,.txt"
                  multiple
                  (change)="onSeleccionarArchivosImportar($event)"
                />
              </div>
            </div>
          }

          @if (modoImportar() === 'ia') {
            <div class="import-box">
              <p>
                1. Copia estas instrucciones y pégalas en ChatGPT, Claude o Gemini junto con
                capturas, PDFs o extractos de tu banco o bróker.<br />
                2. Pega debajo el CSV que te devuelva la IA (o súbelo como archivo) para
                previsualizarlo antes de guardar.
              </p>
              <div class="ia-prompt-bar">
                <button type="button" class="btn-secundario btn-sm" (click)="copiarPromptIA()">
                  Copiar instrucciones para la IA
                </button>
                @if (promptCopiado()) {
                  <span class="pos mono">¡Instrucciones copiadas al portapapeles!</span>
                }
              </div>
              <div class="campo" style="margin-top: 1rem">
                <label for="imp-texto-ia">Pegar respuesta CSV de la IA</label>
                <textarea
                  id="imp-texto-ia"
                  rows="5"
                  [(ngModel)]="impTextoPegado"
                  placeholder="fecha;producto;isin;tipo;participaciones;importe&#10;2025-01-15;MSCI World;IE00B03HCZ61;compra;12,345;500,00"
                ></textarea>
              </div>
            </div>
          }

          <div class="import-footer-bar">
            <label class="check-row">
              <input type="checkbox" [(ngModel)]="impReemplazar" />
              <span
                >Sustituir el historial previo de los productos incluidos en esta importación</span
              >
            </label>
            <button
              type="button"
              class="btn-primario"
              [disabled]="analizandoImportacion()"
              (click)="ejecutarPrevisualizacion()"
            >
              {{ analizandoImportacion() ? 'Analizando datos...' : 'Previsualizar importación' }}
            </button>
          </div>

          <!-- INFORME DE PREVISUALIZACIÓN -->
          @if (informePrevia(); as inf) {
            <div class="previa-box">
              <div class="previa-header">
                <div>
                  <h3>Resultado del análisis previo</h3>
                  <div class="prod-tags" style="margin-top: 0.4rem">
                    <span class="tag pos">{{ inf['añadidos'] }} operaciones nuevas</span>
                    <span class="tag">{{ inf.saldos }} saldos</span>
                    <span class="tag">{{ inf.repetidos }} ya existentes (se omitirán)</span>
                    @if (inf.errores.length) {
                      <span class="tag neg">{{ inf.errores.length }} con avisos/errores</span>
                    }
                  </div>
                </div>
                <button
                  type="button"
                  class="btn-primario"
                  [disabled]="
                    confirmandoImportacion() ||
                    (inf['añadidos'] === 0 && inf.saldos === 0 && inf.productosNuevos.length === 0)
                  "
                  (click)="ejecutarConfirmacionImportar()"
                >
                  {{
                    confirmandoImportacion()
                      ? 'Guardando en PostgreSQL...'
                      : '✓ Confirmar e importar ahora'
                  }}
                </button>
              </div>

              @if (inf.productosNuevos.length) {
                <div class="previa-nuevos">
                  <strong
                    >Se darán de alta automáticamente
                    {{ inf.productosNuevos.length }} productos:</strong
                  >
                  <ul>
                    @for (pn of inf.productosNuevos; track $index) {
                      <li>
                        <strong>{{ pn.nombre }}</strong> ({{ pn.tipo }} ·
                        {{ pn.identificador || pn.codigo }} · {{ pn.fuente }})
                      </li>
                    }
                  </ul>
                </div>
              }

              <div class="tabla-scroll" style="margin-top: 1rem; max-height: 320px">
                <table class="tabla-datos">
                  <thead>
                    <tr>
                      <th>Fila</th>
                      <th>Estado</th>
                      <th>Fecha</th>
                      <th>Producto</th>
                      <th>Tipo</th>
                      <th class="num">Unidades</th>
                      <th class="num">Importe</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (f of inf.filas; track $index) {
                      <tr>
                        <td class="mono">{{ f.fila }}</td>
                        <td>
                          <span
                            class="tag"
                            [class]="
                              f.estado === 'nuevo' ? 'pos' : f.estado === 'error' ? 'neg' : ''
                            "
                          >
                            {{ f.estado }}
                          </span>
                        </td>
                        <td class="mono">{{ f.fecha }}</td>
                        <td>{{ f.productoNombre || f.producto }}</td>
                        <td>{{ f.tipo }}</td>
                        <td class="num mono">
                          {{ f.unidades !== null ? fmt.num(f.unidades, 4) : '—' }}
                        </td>
                        <td class="num mono">{{ fmt.eur(f.importe, 2) }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </div>
          }
        </section>
      }

      <!-- ========================================================= -->
      <!-- 5. SUB-TAB: COPIAS Y WEB                                  -->
      <!-- ========================================================= -->
      @if (store.subTabDatos() === 'copias') {
        <div class="dos-columnas bloque-seccion">
          <section class="panel-card">
            <h2 class="card-title">Copia de seguridad en archivo JSON</h2>
            <p class="card-sub">
              Tus datos están respaldados en PostgreSQL, pero puedes descargar o restaurar un
              archivo JSON completo en cualquier momento.
            </p>
            <div class="header-btns" style="margin-top: 1.25rem">
              <a href="/api/copia/descargar" download class="btn-primario">
                Descargar cartera (.json)
              </a>
              <label class="btn-secundario" style="cursor: pointer">
                Restaurar desde archivo (.json)
                <input
                  type="file"
                  accept=".json"
                  style="display: none"
                  (change)="onSubirCopiaJson($event)"
                />
              </label>
            </div>
          </section>

          <section class="panel-card">
            <h2 class="card-title">Exportar informe web interactivo (.html)</h2>
            <p class="card-sub">
              Genera un único archivo HTML autónomo que funciona sin conexión para guardar o
              compartir.
            </p>
            <label class="check-row" style="margin-top: 1rem">
              <input type="checkbox" [(ngModel)]="ocultarImportesWeb" />
              <span
                >Modo discreto: ocultar todos los importes en euros (mostrar solo porcentajes y
                evolución base 100)</span
              >
            </label>
            <div style="margin-top: 1rem">
              <a
                [href]="'/api/exportar-web?ocultar=' + (ocultarImportesWeb ? '1' : '0')"
                download
                class="btn-secundario"
              >
                Descargar página web interactiva (.html)
              </a>
            </div>
          </section>
        </div>

        <section class="panel-card bloque-seccion">
          <div class="card-header">
            <div>
              <h2 class="card-title">Puntos de restauración automáticos en PostgreSQL</h2>
              <p class="card-sub">
                Capitalia guarda una copia instantánea antes de cualquier importación, vaciado o
                restauración.
              </p>
            </div>
          </div>

          <div class="tabla-scroll">
            <table class="tabla-datos">
              <thead>
                <tr>
                  <th>Fecha y hora</th>
                  <th>Motivo</th>
                  <th class="num">Productos</th>
                  <th class="num">Movimientos</th>
                  <th class="num">Acción</th>
                </tr>
              </thead>
              <tbody>
                @for (cp of store.copias(); track cp.archivo) {
                  <tr>
                    <td class="mono">{{ cp.fecha }}</td>
                    <td>{{ cp.motivo }}</td>
                    <td class="num mono">{{ cp.productos }}</td>
                    <td class="num mono">{{ cp.movimientos }}</td>
                    <td class="num">
                      <button
                        type="button"
                        class="btn-tabla"
                        (click)="confirmarRecuperarCopia(cp.archivo, cp.fecha)"
                      >
                        Restaurar esta versión
                      </button>
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="5" class="vacio-celda">
                      Aún no se han generado copias automáticas de cambios previos.
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>
      }

      <!-- MODALES (COMPONENTES SEPARADOS) -->
      <cap-producto-modal
        [abierto]="modalProductoAbierto()"
        [productoEditar]="prodEditando()"
        (cerrar)="modalProductoAbierto.set(false)"
      />
      <cap-movimiento-modal
        [abierto]="modalMovimientoAbierto()"
        [movimientoEditar]="movEditando()"
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
  readonly fmt = inject(FormatService);

  // Filters
  readonly filtroMovProd = signal<string>('todos');

  // Product modal state
  readonly modalProductoAbierto = signal<boolean>(false);
  readonly prodEditando = signal<ProductoCfg | null>(null);

  // Movement modal state
  readonly modalMovimientoAbierto = signal<boolean>(false);
  readonly movEditando = signal<MovimientoCfg | null>(null);
  readonly movProductoPreseleccionado = signal<string | undefined>(undefined);

  // Balance modal state
  readonly modalValoracionAbierto = signal<boolean>(false);
  readonly valEditando = signal<ValoracionCfg | null>(null);
  readonly valProductoPreseleccionado = signal<string | undefined>(undefined);

  // Batch Balances modal state
  readonly modalLoteSaldosAbierto = signal<boolean>(false);

  // Import state
  readonly modoImportar = signal<'myinvestor' | 'plantilla' | 'ia'>('myinvestor');
  readonly analizandoImportacion = signal<boolean>(false);
  readonly confirmandoImportacion = signal<boolean>(false);
  readonly informePrevia = signal<InformeImportacion | null>(null);
  readonly promptCopiado = signal<boolean>(false);
  impArchivos: ArchivoLeido[] = [];
  impProductoDefecto = '';
  impTextoPegado = '';
  impReemplazar = false;

  // Web export option
  ocultarImportesWeb = false;

  constructor() {
    effect(() => {
      if (this.store.subTabDatos() === 'copias') {
        this.store.cargarCopias();
      }
    });
  }

  cambiarSubTab(sub: 'productos' | 'movimientos' | 'saldos' | 'importar' | 'copias'): void {
    this.store.subTabDatos.set(sub);
  }

  etiquetaTipo(clave: string): string {
    const mapa = this.store.tipos();
    return mapa[clave]?.[0] || clave;
  }

  esTipoInversion(tipo: string): boolean {
    return ['fondo', 'etf', 'accion', 'cripto'].includes(tipo);
  }

  nombreProducto(id: string): string {
    const prod = this.store.cartera()?.productos.find((p) => p.id === id);
    return prod ? prod.nombre : id;
  }

  valorActualProducto(id: string): number {
    const comp = this.store.todosComponentes().find((c) => c.id === id);
    return comp ? comp.valor : 0;
  }

  readonly movimientosFiltrados = computed<MovimientoCfg[]>(() => {
    const movs = this.store.cartera()?.movimientos || [];
    const filtro = this.filtroMovProd();
    return movs
      .filter((m) => filtro === 'todos' || m.producto === filtro)
      .slice()
      .sort((a, b) => b.fecha.localeCompare(a.fecha));
  });

  readonly valoracionesOrdenadas = computed<ValoracionCfg[]>(() => {
    const vals = this.store.cartera()?.valoraciones || [];
    return vals.slice().sort((a, b) => b.fecha.localeCompare(a.fecha));
  });

  // Product modal logic
  abrirModalProducto(p?: ProductoCfg): void {
    this.prodEditando.set(p ?? null);
    this.modalProductoAbierto.set(true);
  }

  confirmarBorrarProducto(p: ProductoCfg): void {
    this.store.pedirConfirmacion({
      titulo: 'Eliminar producto',
      mensaje: `¿Seguro que quieres eliminar «${p.nombre}» y todas sus compras y saldos asociados? Se guardará una copia automática antes de borrar.`,
      textoConfirmar: 'Sí, eliminar producto',
      peligro: true,
      accion: async () => {
        await this.store.borrarProducto(p.id);
      },
    });
  }

  // Movement modal logic
  abrirModalMovimiento(m?: MovimientoCfg, productoPreseleccionado?: string): void {
    this.movEditando.set(m ?? null);
    this.movProductoPreseleccionado.set(productoPreseleccionado);
    this.modalMovimientoAbierto.set(true);
  }

  confirmarBorrarMovimiento(m: MovimientoCfg): void {
    this.store.pedirConfirmacion({
      titulo: 'Eliminar operación',
      mensaje: `¿Eliminar la operación de ${m.tipo} del ${this.fmt.fechaCorta(m.fecha)} por ${this.fmt.eur(m.importe, 2)}?`,
      textoConfirmar: 'Eliminar operación',
      peligro: true,
      accion: async () => {
        await this.store.borrarMovimiento(m.id);
      },
    });
  }

  // Balance modal logic
  abrirModalValoracion(v?: ValoracionCfg, productoPreseleccionado?: string): void {
    this.valEditando.set(v ?? null);
    this.valProductoPreseleccionado.set(productoPreseleccionado);
    this.modalValoracionAbierto.set(true);
  }

  confirmarBorrarValoracion(v: ValoracionCfg): void {
    this.store.pedirConfirmacion({
      titulo: 'Eliminar saldo',
      mensaje: `¿Eliminar el saldo del ${this.fmt.fechaCorta(v.fecha)} (${this.fmt.eur(v.valor, 2)})?`,
      textoConfirmar: 'Eliminar saldo',
      peligro: true,
      accion: async () => {
        await this.store.borrarValoracion(v.id);
      },
    });
  }

  abrirModalLoteSaldos(): void {
    this.modalLoteSaldosAbierto.set(true);
  }

  // Import logic
  cambiarModoImportar(m: 'myinvestor' | 'plantilla' | 'ia'): void {
    this.modoImportar.set(m);
    this.informePrevia.set(null);
    this.impArchivos = [];
  }

  async onSeleccionarArchivosImportar(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    if (!input.files?.length) return;
    const leidos: ArchivoLeido[] = [];
    for (const file of Array.from(input.files)) {
      const base64 = await this.archivoABase64(file);
      leidos.push({ nombre: file.name, base64 });
    }
    this.impArchivos = leidos;
    await this.ejecutarPrevisualizacion();
  }

  private archivoABase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const res = String(reader.result || '');
        const idx = res.indexOf(',');
        resolve(idx >= 0 ? res.slice(idx + 1) : res);
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  private construirPayloadImportar(): Record<string, unknown> {
    const origen = this.modoImportar() === 'myinvestor' ? 'myinvestor' : 'tabla';
    if (this.modoImportar() === 'ia' && this.impTextoPegado.trim()) {
      return {
        origen,
        archivos: [
          {
            nombre: 'importacion_ia.csv',
            contenido: this.impTextoPegado.trim(),
          },
        ],
        productoPorDefecto: this.impProductoDefecto || undefined,
        reemplazar: this.impReemplazar,
      };
    }
    return {
      origen,
      archivos: this.impArchivos,
      productoPorDefecto: this.impProductoDefecto || undefined,
      reemplazar: this.impReemplazar,
    };
  }

  async ejecutarPrevisualizacion(): Promise<void> {
    const payload = this.construirPayloadImportar();
    const archivos = payload['archivos'] as unknown[];
    if (!archivos || !archivos.length) {
      this.store.notificarError('Selecciona al menos un archivo o pega los datos CSV.');
      return;
    }
    this.analizandoImportacion.set(true);
    try {
      const inf = await this.store.previsualizarImportacion(payload);
      this.informePrevia.set(inf);
    } finally {
      this.analizandoImportacion.set(false);
    }
  }

  async ejecutarConfirmacionImportar(): Promise<void> {
    const payload = this.construirPayloadImportar();
    this.confirmandoImportacion.set(true);
    try {
      const inf = await this.store.confirmarImportacion(payload);
      if (inf) {
        this.informePrevia.set(null);
        this.impArchivos = [];
        this.impTextoPegado = '';
      }
    } finally {
      this.confirmandoImportacion.set(false);
    }
  }

  async copiarPromptIA(): Promise<void> {
    try {
      const txt = await this.store.obtenerPromptIA();
      if (txt && navigator.clipboard) {
        await navigator.clipboard.writeText(txt);
        this.promptCopiado.set(true);
        setTimeout(() => this.promptCopiado.set(false), 3500);
      }
    } catch {
      this.store.notificarError('No se pudo copiar el prompt.');
    }
  }

  // Backups & Reset
  async onSubirCopiaJson(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const texto = await file.text();
      const json = JSON.parse(texto);
      await this.store.subirCopia(json);
    } catch {
      this.store.notificarError('El archivo seleccionado no es un JSON válido.');
    } finally {
      input.value = '';
    }
  }

  confirmarRecuperarCopia(archivo: string, fecha: string): void {
    this.store.pedirConfirmacion({
      titulo: 'Restaurar copia de seguridad',
      mensaje: `¿Seguro que quieres restaurar la cartera al estado del ${fecha}? Se guardará una copia de seguridad de tu cartera actual antes de restaurar.`,
      textoConfirmar: 'Restaurar versión',
      peligro: false,
      accion: async () => {
        await this.store.recuperarCopia(archivo);
      },
    });
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
