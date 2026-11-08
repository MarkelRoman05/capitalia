import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PortfolioStoreService } from '../../services/portfolio-store.service';
import { FormatService } from '../../services/format.service';
import {
  InformeImportacion,
  MovimientoCfg,
  ProductoCfg,
  ResultadoBusqueda,
  ValoracionCfg,
} from '../../models/portfolio.model';

interface ArchivoLeido {
  nombre: string;
  base64: string;
}

@Component({
  selector: 'cap-datos-tab',
  imports: [FormsModule],
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
          <button type="button" class="btn-peligro-outline btn-sm" (click)="confirmarVaciarCartera()">
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
                Configura cada activo de tu patrimonio. Los fondos, ETFs, acciones y cripto actualizan su cotización automáticamente.
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
                El motor calcula automáticamente las plusvalías realizadas aplicando el criterio fiscal FIFO español.
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
                      <span class="tag" [class]="'tag-mov-' + m.tipo">{{ m.tipo.toUpperCase() }}</span>
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
              <h2 class="card-title">Saldos de cuentas, inmuebles, deudas y valoraciones manuales</h2>
              <p class="card-sub">
                Anota el saldo de tus cuentas bancarias, el valor tasado de tus inmuebles o el capital pendiente de tus préstamos.
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
                      {{ v.aportado !== null && v.aportado !== undefined ? fmt.eur(v.aportado, 2) : '—' }}
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
                Sube extractos de MyInvestor, utiliza nuestra plantilla oficial Excel/CSV o convierte capturas de cualquier banco con IA.
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
                Exporta tus órdenes o movimientos en formato CSV desde MyInvestor y selecciónalos aquí. Si el archivo incluye el código ISIN, Capitalia creará y vinculará cada fondo automáticamente.
              </p>
              <div class="form-grid-2" style="margin-top: 1rem">
                <div class="campo">
                  <label for="imp-files-my">Archivos CSV de MyInvestor</label>
                  <input
                    id="imp-files-my"
                    type="file"
                    accept=".csv,.txt,.xlsx"
                    multiple
                    (change)="onSeleccionarArchivosImportar($event)"
                  />
                </div>
                <div class="campo">
                  <label for="imp-prod-def">Producto por defecto (solo si el CSV no trae ISIN)</label>
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
                Descarga la plantilla con ejemplos e instrucciones, rellena tus compras, ventas o saldos mensuales y súbela para previsualizar.
              </p>
              <div class="header-btns" style="margin: 1rem 0">
                <a href="/api/plantilla.xlsx" download class="btn-secundario btn-sm">
                  ⬇ Descargar Plantilla Excel (.xlsx)
                </a>
                <a href="/api/plantilla.csv" download class="btn-fantasma btn-sm">
                  ⬇ Descargar Plantilla CSV (.csv)
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
                1. Copia estas instrucciones y pégalas en ChatGPT, Claude o Gemini junto con capturas, PDFs o extractos de tu banco o bróker.<br />
                2. Pega debajo el CSV que te devuelva la IA (o súbelo como archivo) para previsualizarlo antes de guardar.
              </p>
              <div class="ia-prompt-bar">
                <button type="button" class="btn-secundario btn-sm" (click)="copiarPromptIA()">
                  📋 Copiar instrucciones para la IA
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
              <span>Sustituir el historial previo de los productos incluidos en esta importación</span>
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
                  [disabled]="confirmandoImportacion() || (inf['añadidos'] === 0 && inf.saldos === 0 && inf.productosNuevos.length === 0)"
                  (click)="ejecutarConfirmacionImportar()"
                >
                  {{ confirmandoImportacion() ? 'Guardando en PostgreSQL...' : '✓ Confirmar e importar ahora' }}
                </button>
              </div>

              @if (inf.productosNuevos.length) {
                <div class="previa-nuevos">
                  <strong>Se darán de alta automáticamente {{ inf.productosNuevos.length }} productos:</strong>
                  <ul>
                    @for (pn of inf.productosNuevos; track $index) {
                      <li>
                        <strong>{{ pn.nombre }}</strong> ({{ pn.tipo }} · {{ pn.identificador || pn.codigo }} · {{ pn.fuente }})
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
                            [class]="f.estado === 'nuevo' ? 'pos' : f.estado === 'error' ? 'neg' : ''"
                          >
                            {{ f.estado }}
                          </span>
                        </td>
                        <td class="mono">{{ f.fecha }}</td>
                        <td>{{ f.productoNombre || f.producto }}</td>
                        <td>{{ f.tipo }}</td>
                        <td class="num mono">{{ f.unidades !== null ? fmt.num(f.unidades, 4) : '—' }}</td>
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
              Tus datos están respaldados en PostgreSQL, pero puedes descargar o restaurar un archivo JSON completo en cualquier momento.
            </p>
            <div class="header-btns" style="margin-top: 1.25rem">
              <a href="/api/copia/descargar" download class="btn-primario">
                ⬇ Descargar cartera (.json)
              </a>
              <label class="btn-secundario" style="cursor: pointer">
                ⬆ Restaurar desde archivo (.json)
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
              Genera un único archivo HTML autónomo que funciona sin conexión para guardar o compartir.
            </p>
            <label class="check-row" style="margin-top: 1rem">
              <input type="checkbox" [(ngModel)]="ocultarImportesWeb" />
              <span>Modo discreto: ocultar todos los importes en euros (mostrar solo porcentajes y evolución base 100)</span>
            </label>
            <div style="margin-top: 1rem">
              <a
                [href]="'/api/exportar-web?ocultar=' + (ocultarImportesWeb ? '1' : '0')"
                download
                class="btn-secundario"
              >
                🌐 Descargar página web interactiva (.html)
              </a>
            </div>
          </section>
        </div>

        <section class="panel-card bloque-seccion">
          <div class="card-header">
            <div>
              <h2 class="card-title">Puntos de restauración automáticos en PostgreSQL</h2>
              <p class="card-sub">
                Capitalia guarda una copia instantánea antes de cualquier importación, vaciado o restauración.
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

      <!-- ========================================================= -->
      <!-- MODAL: CREAR / EDITAR PRODUCTO                            -->
      <!-- ========================================================= -->
      @if (modalProductoAbierto()) {
        <div class="modal-backdrop" (click)="modalProductoAbierto.set(false)">
          <div class="modal-card modal-lg" (click)="$event.stopPropagation()">
            <div class="modal-header">
              <h3>{{ prodEditandoId() ? 'Editar producto o activo' : 'Añadir nuevo producto o activo' }}</h3>
              <button type="button" class="btn-cerrar" (click)="modalProductoAbierto.set(false)">✕</button>
            </div>

            <div class="modal-body">
              <div class="seg-group" style="margin-bottom: 1rem">
                <button
                  type="button"
                  class="seg-btn"
                  [class.on]="modoModalProd() === 'cotizado'"
                  (click)="cambiarModoModalProd('cotizado')"
                >
                  Fondo, ETF, acción o cripto (cotización automática)
                </button>
                <button
                  type="button"
                  class="seg-btn"
                  [class.on]="modoModalProd() === 'manual'"
                  (click)="cambiarModoModalProd('manual')"
                >
                  Cuenta, efectivo, inmueble o deuda (saldo manual)
                </button>
              </div>

              @if (modoModalProd() === 'cotizado') {
                <div class="buscador-box">
                  <label for="busq-input">Buscar por ISIN, ticker o nombre (Morningstar, Yahoo Finance, CoinGecko)</label>
                  <div class="buscador-row">
                    <input
                      id="busq-input"
                      type="text"
                      [(ngModel)]="consultaBusqueda"
                      (keydown.enter)="$event.preventDefault(); lanzarBusqueda()"
                      placeholder="Ej. IE00B03HCZ61, MSCI World, AAPL, Bitcoin..."
                    />
                    <button
                      type="button"
                      class="btn-secundario"
                      [disabled]="buscando()"
                      (click)="lanzarBusqueda()"
                    >
                      {{ buscando() ? 'Buscando...' : 'Buscar' }}
                    </button>
                  </div>

                  @if (resultadosBusqueda().length) {
                    <div class="resultados-lista">
                      @for (r of resultadosBusqueda(); track $index) {
                        <button
                          type="button"
                          class="resultado-item"
                          (click)="seleccionarResultadoBusqueda(r)"
                        >
                          <div>
                            <strong>{{ r.nombre }}</strong>
                            <div class="prod-tags">
                              <span class="tag">{{ r.tipo }}</span>
                              <span class="tag mono">{{ r.identificador }}</span>
                              <span class="tag">{{ r.fuente }}</span>
                              @if (r.ficha?.ter) {
                                <span class="tag">TER {{ r.ficha!.ter }}%</span>
                              }
                            </div>
                          </div>
                          <div class="mono">
                            {{ r.precio }} {{ r.moneda }}
                          </div>
                        </button>
                      }
                    </div>
                  }
                </div>
              }

              <form (ngSubmit)="guardarProductoModal()" class="form-grid-2">
                <div class="campo">
                  <label for="pr-nombre">Nombre completo</label>
                  <input id="pr-nombre" type="text" [(ngModel)]="formProd.nombre" name="nombre" required placeholder="Ej. Vanguard Global Stock Index" />
                </div>

                <div class="campo">
                  <label for="pr-corto">Nombre corto (para gráficos)</label>
                  <input id="pr-corto" type="text" [(ngModel)]="formProd.corto" name="corto" placeholder="Ej. MSCI World" />
                </div>

                <div class="campo">
                  <label for="pr-tipo">Tipo de activo</label>
                  <select id="pr-tipo" class="input-select" [(ngModel)]="formProd.tipo" name="tipo">
                    <option value="fondo">Fondo de inversión</option>
                    <option value="etf">ETF</option>
                    <option value="accion">Acción</option>
                    <option value="cripto">Criptomoneda</option>
                    <option value="efectivo">Efectivo y cuentas</option>
                    <option value="inmueble">Inmueble</option>
                    <option value="deuda">Deuda / Préstamo (resta al patrimonio)</option>
                    <option value="otro">Otro activo</option>
                  </select>
                </div>

                <div class="campo">
                  <label for="pr-entidad">Banco, bróker o entidad</label>
                  <input id="pr-entidad" type="text" [(ngModel)]="formProd.entidad" name="entidad" placeholder="Ej. MyInvestor, Indexa, Interactive Brokers..." />
                </div>

                <div class="campo">
                  <label for="pr-clase">Clase de activo (para distribución)</label>
                  <input id="pr-clase" type="text" [(ngModel)]="formProd.clase" name="clase" placeholder="Ej. Renta variable global, Liquidez, Cripto..." />
                </div>

                <div class="campo">
                  <label for="pr-ident">ISIN o Ticker visible</label>
                  <input id="pr-ident" type="text" [(ngModel)]="formProd.identificador" name="identificador" placeholder="Ej. IE00B03HCZ61" />
                </div>

                @if (modoModalProd() === 'cotizado') {
                  <div class="campo">
                    <label for="pr-ter">Comisión anual TER (%)</label>
                    <input id="pr-ter" type="number" step="0.01" min="0" [(ngModel)]="formProd.ter" name="ter" placeholder="Ej. 0.12" />
                  </div>

                  <div class="campo">
                    <label for="pr-riesgo">Nivel de riesgo SRRI (1 a 7)</label>
                    <input id="pr-riesgo" type="number" step="1" min="1" max="7" [(ngModel)]="formProd.riesgo" name="riesgo" placeholder="Ej. 5" />
                  </div>
                }

                <div class="campo campo-full">
                  <label>Color identificativo</label>
                  <div class="paleta-colores">
                    @for (par of fmt.paleta; track $index; let s = $index) {
                      <button
                        type="button"
                        class="color-swatch"
                        [class.on]="formProd.slot === s"
                        [style.background]="par[0]"
                        (click)="formProd.slot = s"
                        [attr.aria-label]="'Color ' + (s + 1)"
                      ></button>
                    }
                  </div>
                </div>

                <div class="campo campo-full">
                  <label class="check-row">
                    <input type="checkbox" [(ngModel)]="formProd.largoPlazo" name="largoPlazo" />
                    <span>Inversión a largo plazo (incluir en el filtro rápido «Solo largo plazo»)</span>
                  </label>
                </div>

                <div class="campo campo-full">
                  <button
                    type="button"
                    class="btn-link"
                    (click)="mostrarAvanzadoProd.set(!mostrarAvanzadoProd())"
                  >
                    {{ mostrarAvanzadoProd() ? '▾ Ocultar configuración técnica de fuentes' : '▸ Configuración avanzada de fuente de precios (Morningstar / Yahoo / CoinGecko)' }}
                  </button>
                </div>

                @if (mostrarAvanzadoProd()) {
                  <div class="campo">
                    <label for="pr-fuente">Fuente de cotización</label>
                    <select id="pr-fuente" class="input-select" [(ngModel)]="formProd.fuente" name="fuente">
                      <option value="morningstar">Morningstar (Fondos/ETFs)</option>
                      <option value="yahoo">Yahoo Finance (Acciones/ETFs/Cripto)</option>
                      <option value="coingecko">CoinGecko (Cripto)</option>
                      <option value="manual">Manual (Saldos)</option>
                    </select>
                  </div>

                  <div class="campo">
                    <label for="pr-codigo">Código interno en la fuente</label>
                    <input id="pr-codigo" type="text" [(ngModel)]="formProd.codigo" name="codigo" placeholder="SecId de Morningstar, ticker de Yahoo o ID CoinGecko" />
                  </div>

                  <div class="campo">
                    <label for="pr-moneda">Divisa de cotización</label>
                    <select id="pr-moneda" class="input-select" [(ngModel)]="formProd.moneda" name="moneda">
                      <option value="EUR">EUR (€)</option>
                      <option value="USD">USD ($ - conversión automática a EUR)</option>
                      <option value="GBP">GBP (£)</option>
                    </select>
                  </div>

                  <div class="campo">
                    <label for="pr-vivo">ID CoinGecko en vivo (opcional)</label>
                    <input id="pr-vivo" type="text" [(ngModel)]="formProd.vivo" name="vivo" placeholder="Ej. bitcoin, ethereum" />
                  </div>
                }

                <div class="modal-footer campo-full">
                  <button type="button" class="btn-fantasma" (click)="modalProductoAbierto.set(false)">
                    Cancelar
                  </button>
                  <button type="submit" class="btn-primario">
                    {{ prodEditandoId() ? 'Guardar cambios' : 'Crear producto' }}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      }

      <!-- ========================================================= -->
      <!-- MODAL: CREAR / EDITAR MOVIMIENTO                          -->
      <!-- ========================================================= -->
      @if (modalMovimientoAbierto()) {
        <div class="modal-backdrop" (click)="modalMovimientoAbierto.set(false)">
          <div class="modal-card" (click)="$event.stopPropagation()">
            <div class="modal-header">
              <h3>{{ movEditandoId() ? 'Editar operación' : 'Anotar compra, venta, dividendo o comisión' }}</h3>
              <button type="button" class="btn-cerrar" (click)="modalMovimientoAbierto.set(false)">✕</button>
            </div>
            <form (ngSubmit)="guardarMovimientoModal()" class="modal-body">
              <div class="campo">
                <label for="mv-prod">Producto</label>
                <select id="mv-prod" class="input-select" [(ngModel)]="formMov.producto" name="producto" required>
                  @for (p of c.productos; track p.id) {
                    <option [value]="p.id">{{ p.nombre }}</option>
                  }
                </select>
              </div>

              <div class="form-grid-2">
                <div class="campo">
                  <label for="mv-tipo">Tipo de operación</label>
                  <select id="mv-tipo" class="input-select" [(ngModel)]="formMov.tipo" name="tipo">
                    <option value="compra">Compra / Suscripción</option>
                    <option value="venta">Venta / Reembolso (FIFO)</option>
                    <option value="dividendo">Dividendo cobrado</option>
                    <option value="comision">Comisión custodia / bróker</option>
                  </select>
                </div>

                <div class="campo">
                  <label for="mv-fecha">Fecha</label>
                  <input id="mv-fecha" type="date" [(ngModel)]="formMov.fecha" name="fecha" required />
                </div>
              </div>

              @if (formMov.tipo === 'compra' || formMov.tipo === 'venta') {
                <div class="form-grid-2">
                  <div class="campo">
                    <label for="mv-unidades">Participaciones / Títulos</label>
                    <input
                      id="mv-unidades"
                      type="number"
                      step="any"
                      min="0.00000001"
                      [(ngModel)]="formMov.unidades"
                      name="unidades"
                      required
                    />
                  </div>
                  <div class="campo">
                    <label for="mv-importe">Importe total (€)</label>
                    <input
                      id="mv-importe"
                      type="number"
                      step="0.01"
                      min="0.01"
                      [(ngModel)]="formMov.importe"
                      name="importe"
                      required
                    />
                  </div>
                </div>
                @if (formMov.unidades > 0 && formMov.importe > 0) {
                  <p class="muted mono" style="font-size: 0.82rem; margin: -0.25rem 0 0.75rem">
                    Precio unitario implícito: {{ fmt.eur(formMov.importe / formMov.unidades, 4) }} por título
                  </p>
                }
              } @else {
                <div class="campo">
                  <label for="mv-importe-simple">Importe (€)</label>
                  <input
                    id="mv-importe-simple"
                    type="number"
                    step="0.01"
                    min="0.01"
                    [(ngModel)]="formMov.importe"
                    name="importeSimple"
                    required
                  />
                </div>
              }

              <div class="campo">
                <label for="mv-nota">Nota o comentario (opcional)</label>
                <input id="mv-nota" type="text" [(ngModel)]="formMov.nota" name="nota" placeholder="Ej. Aportación mensual DCA" />
              </div>

              <div class="modal-footer">
                <button type="button" class="btn-fantasma" (click)="modalMovimientoAbierto.set(false)">
                  Cancelar
                </button>
                <button type="submit" class="btn-primario">
                  Guardar operación
                </button>
              </div>
            </form>
          </div>
        </div>
      }

      <!-- ========================================================= -->
      <!-- MODAL: CREAR / EDITAR SALDO PUNTUAL                       -->
      <!-- ========================================================= -->
      @if (modalValoracionAbierto()) {
        <div class="modal-backdrop" (click)="modalValoracionAbierto.set(false)">
          <div class="modal-card" (click)="$event.stopPropagation()">
            <div class="modal-header">
              <h3>{{ valEditandoId() ? 'Editar saldo o valoración' : 'Anotar saldo o valoración' }}</h3>
              <button type="button" class="btn-cerrar" (click)="modalValoracionAbierto.set(false)">✕</button>
            </div>
            <form (ngSubmit)="guardarValoracionModal()" class="modal-body">
              <div class="campo">
                <label for="vl-prod">Activo / Cuenta / Deuda</label>
                <select id="vl-prod" class="input-select" [(ngModel)]="formVal.producto" name="producto" required>
                  @for (p of c.productos; track p.id) {
                    <option [value]="p.id">{{ p.nombre }} ({{ etiquetaTipo(p.tipo) }})</option>
                  }
                </select>
              </div>

              <div class="form-grid-2">
                <div class="campo">
                  <label for="vl-fecha">Fecha del saldo</label>
                  <input id="vl-fecha" type="date" [(ngModel)]="formVal.fecha" name="fecha" required />
                </div>
                <div class="campo">
                  <label for="vl-valor">Saldo o valor actual (€)</label>
                  <input id="vl-valor" type="number" step="0.01" min="0" [(ngModel)]="formVal.valor" name="valor" required />
                </div>
              </div>

              <div class="campo">
                <label for="vl-aportado">Coste de adquisición / Capital aportado (opcional)</label>
                <input
                  id="vl-aportado"
                  type="number"
                  step="0.01"
                  min="0"
                  [(ngModel)]="formVal.aportado"
                  name="aportado"
                  placeholder="Déjalo vacío para cuentas corrientes o deudas"
                />
              </div>

              <div class="modal-footer">
                <button type="button" class="btn-fantasma" (click)="modalValoracionAbierto.set(false)">
                  Cancelar
                </button>
                <button type="submit" class="btn-primario">Guardar saldo</button>
              </div>
            </form>
          </div>
        </div>
      }

      <!-- ========================================================= -->
      <!-- MODAL: ANOTAR SALDOS DE TODOS DE UNA VEZ                  -->
      <!-- ========================================================= -->
      @if (modalLoteSaldosAbierto()) {
        <div class="modal-backdrop" (click)="modalLoteSaldosAbierto.set(false)">
          <div class="modal-card modal-lg" (click)="$event.stopPropagation()">
            <div class="modal-header">
              <h3>Actualizar todos los saldos en una fecha</h3>
              <button type="button" class="btn-cerrar" (click)="modalLoteSaldosAbierto.set(false)">✕</button>
            </div>
            <form (ngSubmit)="guardarLoteSaldos()" class="modal-body">
              <div class="campo" style="max-width: 240px">
                <label for="lote-fecha">Fecha de cierre</label>
                <input id="lote-fecha" type="date" [(ngModel)]="loteFecha" name="loteFecha" required />
              </div>

              <div class="tabla-scroll" style="margin-top: 1rem">
                <table class="tabla-datos">
                  <thead>
                    <tr>
                      <th>Activo / Cuenta</th>
                      <th>Tipo</th>
                      <th class="num">Saldo o valor (€)</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (item of loteItems; track item.producto) {
                      <tr>
                        <td><strong>{{ item.nombre }}</strong></td>
                        <td><span class="tag">{{ etiquetaTipo(item.tipo) }}</span></td>
                        <td class="num">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            class="input-inline-num"
                            [(ngModel)]="item.valor"
                            [name]="'lote_' + item.producto"
                          />
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>

              <div class="modal-footer">
                <button type="button" class="btn-fantasma" (click)="modalLoteSaldosAbierto.set(false)">
                  Cancelar
                </button>
                <button type="submit" class="btn-primario">Guardar todos los saldos</button>
              </div>
            </form>
          </div>
        </div>
      }
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
  readonly prodEditandoId = signal<string | null>(null);
  readonly modoModalProd = signal<'cotizado' | 'manual'>('cotizado');
  readonly mostrarAvanzadoProd = signal<boolean>(false);
  readonly buscando = signal<boolean>(false);
  readonly resultadosBusqueda = signal<ResultadoBusqueda[]>([]);
  consultaBusqueda = '';

  formProd: Partial<ProductoCfg> = this.crearFormProductoVacio();

  // Movement modal state
  readonly modalMovimientoAbierto = signal<boolean>(false);
  readonly movEditandoId = signal<string | null>(null);
  formMov: {
    producto: string;
    tipo: 'compra' | 'venta' | 'dividendo' | 'comision';
    fecha: string;
    unidades: number;
    importe: number;
    comision: number | null;
    nota: string;
  } = {
    producto: '',
    tipo: 'compra',
    fecha: new Date().toISOString().slice(0, 10),
    unidades: 0,
    importe: 0,
    comision: null,
    nota: '',
  };

  // Balance modal state
  readonly modalValoracionAbierto = signal<boolean>(false);
  readonly valEditandoId = signal<string | null>(null);
  formVal: {
    producto: string;
    fecha: string;
    valor: number;
    aportado: number | null;
  } = {
    producto: '',
    fecha: new Date().toISOString().slice(0, 10),
    valor: 0,
    aportado: null,
  };

  // Batch Balances modal state
  readonly modalLoteSaldosAbierto = signal<boolean>(false);
  loteFecha = new Date().toISOString().slice(0, 10);
  loteItems: { producto: string; nombre: string; tipo: string; valor: number | null }[] = [];

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
  private crearFormProductoVacio(): Partial<ProductoCfg> {
    const usados = new Set(
      (this.store.cartera()?.productos || []).map((p) => p.slot ?? 0)
    );
    let slotLibre = 0;
    for (let i = 0; i < 12; i++) {
      if (!usados.has(i)) {
        slotLibre = i;
        break;
      }
    }
    return {
      nombre: '',
      corto: '',
      tipo: 'fondo',
      identificador: '',
      fuente: 'morningstar',
      codigo: '',
      moneda: 'EUR',
      entidad: '',
      clase: '',
      gestora: '',
      ter: null,
      riesgo: null,
      slot: slotLibre,
      largoPlazo: true,
      vivo: '',
      papel: '',
    };
  }

  abrirModalProducto(p?: ProductoCfg): void {
    this.resultadosBusqueda.set([]);
    this.consultaBusqueda = '';
    if (p) {
      this.prodEditandoId.set(p.id);
      this.formProd = { ...p };
      this.modoModalProd.set(
        p.fuente === 'manual' || !this.esTipoInversion(p.tipo)
          ? 'manual'
          : 'cotizado'
      );
    } else {
      this.prodEditandoId.set(null);
      this.formProd = this.crearFormProductoVacio();
      this.modoModalProd.set('cotizado');
    }
    this.mostrarAvanzadoProd.set(false);
    this.modalProductoAbierto.set(true);
  }

  cambiarModoModalProd(modo: 'cotizado' | 'manual'): void {
    this.modoModalProd.set(modo);
    if (modo === 'manual') {
      this.formProd.fuente = 'manual';
      if (this.esTipoInversion(this.formProd.tipo || 'fondo')) {
        this.formProd.tipo = 'efectivo';
      }
      this.formProd.largoPlazo = false;
    } else {
      this.formProd.fuente = 'morningstar';
      if (!this.esTipoInversion(this.formProd.tipo || 'efectivo')) {
        this.formProd.tipo = 'fondo';
      }
      this.formProd.largoPlazo = true;
    }
  }

  async lanzarBusqueda(): Promise<void> {
    const q = this.consultaBusqueda.trim();
    if (q.length < 2) return;
    this.buscando.set(true);
    try {
      const res = await this.store.buscarProductos(q);
      this.resultadosBusqueda.set(res);
    } catch {
      this.resultadosBusqueda.set([]);
    } finally {
      this.buscando.set(false);
    }
  }

  seleccionarResultadoBusqueda(r: ResultadoBusqueda): void {
    this.formProd.nombre = r.nombre;
    this.formProd.corto = r.nombre.slice(0, 22);
    this.formProd.tipo = r.tipo;
    this.formProd.identificador = r.identificador;
    this.formProd.fuente = r.fuente;
    this.formProd.codigo = r.codigo;
    this.formProd.moneda = r.moneda || 'EUR';
    if (r.vivo) this.formProd.vivo = r.vivo;
    if (r.ficha) {
      if (r.ficha.ter !== undefined) this.formProd.ter = r.ficha.ter;
      if (r.ficha.riesgo !== undefined) this.formProd.riesgo = r.ficha.riesgo;
      if (r.ficha.clase) this.formProd.clase = r.ficha.clase;
      if (r.ficha.gestora) this.formProd.gestora = r.ficha.gestora;
    }
    this.resultadosBusqueda.set([]);
  }

  async guardarProductoModal(): Promise<void> {
    if (!this.formProd.nombre?.trim()) return;
    const ok = await this.store.guardarProducto(
      this.formProd,
      this.prodEditandoId() || undefined
    );
    if (ok) {
      this.modalProductoAbierto.set(false);
    }
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
    const prods = this.store.cartera()?.productos || [];
    if (m) {
      this.movEditandoId.set(m.id);
      this.formMov = {
        producto: m.producto,
        tipo: m.tipo,
        fecha: m.fecha,
        unidades: m.unidades || 0,
        importe: m.importe,
        comision: m.comision ?? null,
        nota: m.nota || '',
      };
    } else {
      this.movEditandoId.set(null);
      const prodInicial =
        productoPreseleccionado ||
        prods.find((p) => this.esTipoInversion(p.tipo))?.id ||
        prods[0]?.id ||
        '';
      this.formMov = {
        producto: prodInicial,
        tipo: 'compra',
        fecha: new Date().toISOString().slice(0, 10),
        unidades: 0,
        importe: 0,
        comision: null,
        nota: '',
      };
    }
    this.modalMovimientoAbierto.set(true);
  }

  async guardarMovimientoModal(): Promise<void> {
    const payload: Partial<MovimientoCfg> = {
      producto: this.formMov.producto,
      tipo: this.formMov.tipo,
      fecha: this.formMov.fecha,
      unidades:
        this.formMov.tipo === 'compra' || this.formMov.tipo === 'venta'
          ? Number(this.formMov.unidades)
          : 0,
      importe: Number(this.formMov.importe),
      comision: this.formMov.comision ? Number(this.formMov.comision) : null,
      nota: this.formMov.nota,
    };
    const ok = await this.store.guardarMovimiento(
      payload,
      this.movEditandoId() || undefined
    );
    if (ok) {
      this.modalMovimientoAbierto.set(false);
    }
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
    const prods = this.store.cartera()?.productos || [];
    if (v) {
      this.valEditandoId.set(v.id);
      this.formVal = {
        producto: v.producto,
        fecha: v.fecha,
        valor: v.valor,
        aportado: v.aportado ?? null,
      };
    } else {
      this.valEditandoId.set(null);
      const prodInicial =
        productoPreseleccionado ||
        prods.find((p) => !this.esTipoInversion(p.tipo) || p.fuente === 'manual')
          ?.id ||
        prods[0]?.id ||
        '';
      this.formVal = {
        producto: prodInicial,
        fecha: new Date().toISOString().slice(0, 10),
        valor: this.valorActualProducto(prodInicial),
        aportado: null,
      };
    }
    this.modalValoracionAbierto.set(true);
  }

  async guardarValoracionModal(): Promise<void> {
    const ok = await this.store.guardarValoracion(
      {
        producto: this.formVal.producto,
        fecha: this.formVal.fecha,
        valor: Number(this.formVal.valor),
        aportado:
          this.formVal.aportado !== null && this.formVal.aportado !== undefined
            ? Number(this.formVal.aportado)
            : null,
      },
      this.valEditandoId() || undefined
    );
    if (ok) {
      this.modalValoracionAbierto.set(false);
    }
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
    const prods = this.store.cartera()?.productos || [];
    const manuales = prods.filter(
      (p) => !this.esTipoInversion(p.tipo) || p.fuente === 'manual'
    );
    const lista = manuales.length ? manuales : prods;
    this.loteFecha = new Date().toISOString().slice(0, 10);
    this.loteItems = lista.map((p) => ({
      producto: p.id,
      nombre: p.nombre,
      tipo: p.tipo,
      valor: Math.abs(this.valorActualProducto(p.id)),
    }));
    this.modalLoteSaldosAbierto.set(true);
  }

  async guardarLoteSaldos(): Promise<void> {
    const saldos = this.loteItems
      .filter((it) => it.valor !== null && it.valor !== undefined)
      .map((it) => ({
        producto: it.producto,
        valor: Number(it.valor),
      }));
    const ok = await this.store.guardarValoracion({
      fecha: this.loteFecha,
      saldos,
    });
    if (ok) {
      this.modalLoteSaldosAbierto.set(false);
    }
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
