import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PortfolioStoreService } from '../../../services/portfolio-store.service';
import { FormatService } from '../../../services/format.service';
import { MovimientoCfg, ProductoCfg } from '../../../models/portfolio.model';
import { IconComponent } from '../../icon/icon.component';

type TipoMov = 'compra' | 'venta' | 'dividendo' | 'comision' | 'traspaso';

@Component({
  selector: 'cap-movimiento-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, IconComponent],
  host: {
    '(document:keydown.escape)': 'cerrarSiAbierto()',
  },
  template: `
    @if (abierto()) {
      <div class="modal-backdrop" (click)="cerrar.emit()">
        <div
          class="modal-card modal-lg pm-modal"
          (click)="$event.stopPropagation()"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-mov-titulo"
        >
          <div class="modal-header pm-header">
            <div class="modal-title-group">
              <span class="modal-kicker">Libro de Operaciones (FIFO)</span>
              <h3 id="modal-mov-titulo">
                {{
                  movimientoEditar()
                    ? 'Editar operación'
                    : movimientoDuplicar()
                      ? 'Duplicar operación'
                      : 'Anotar compra, venta, traspaso, dividendo o comisión'
                }}
              </h3>
            </div>
            <button type="button" class="btn-cerrar" (click)="cerrar.emit()" aria-label="Cerrar">
              <cap-icon name="close" [size]="16" />
            </button>
          </div>

          <div class="pm-body">
            @if (!productosLista().length) {
              <div class="pm-search-empty">
                No tienes ningún fondo, ETF, acción o cripto cotizada en la cartera. Añade primero un
                producto cotizado para registrar compras o ventas.
              </div>
            } @else {
              <!-- Selector visual de tipo de operación -->
              <div class="mv-type-grid" role="group" aria-label="Tipo de operación">
                @for (op of tiposOperacion; track op.id) {
                  <button
                    type="button"
                    class="mv-type-btn"
                    [class.mv-type-compra]="op.id === 'compra'"
                    [class.mv-type-venta]="op.id === 'venta'"
                    [class.mv-type-traspaso]="op.id === 'traspaso'"
                    [class.mv-type-dividendo]="op.id === 'dividendo'"
                    [class.mv-type-comision]="op.id === 'comision'"
                    [class.on]="tipoMov() === op.id"
                    (click)="cambiarTipo(op.id)"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      aria-hidden="true"
                    >
                      @switch (op.id) {
                        @case ('compra') {
                          <path d="M12 5v14M5 12l7-7 7 7" />
                        }
                        @case ('venta') {
                          <path d="M12 19V5M5 12l7 7 7-7" />
                        }
                        @case ('traspaso') {
                          <path d="M7 16V4m0 0L3 8m4-4 4 4M17 8v12m0 0 4-4m-4 4-4-4" />
                        }
                        @case ('dividendo') {
                          <circle cx="12" cy="12" r="8" />
                          <path d="M12 8v8M9.5 10.5h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4" />
                        }
                        @case ('comision') {
                          <path d="M19 5L5 19" />
                          <circle cx="7.5" cy="7.5" r="2.5" />
                          <circle cx="16.5" cy="16.5" r="2.5" />
                        }
                      }
                    </svg>
                    <span>{{ op.etiqueta }}</span>
                  </button>
                }
              </div>

              <form id="form-movimiento" (ngSubmit)="guardar()" class="pm-sections">
                <section class="pm-section">
                  <div class="form-grid-2">
                    <div class="campo campo-full">
                      <label for="mv-prod">{{ tipoMov() === 'traspaso' ? 'Producto origen' : 'Producto de inversión' }}</label>
                      <select
                        id="mv-prod"
                        autofocus
                        class="input-select"
                        [ngModel]="productoId()"
                        (ngModelChange)="seleccionarProducto($event)"
                        name="producto"
                        required
                      >
                        @for (p of productosLista(); track p.id) {
                          <option [value]="p.id">
                            {{ p.nombre }}@if (p.entidad) { ({{ p.entidad }})}
                          </option>
                        }
                      </select>

                      @if (productoSeleccionadoInfo(); as info) {
                        <div class="mv-hint-bar">
                          <span class="mv-hint-items">
                            @if (info.entidad) {
                              <span class="tag">{{ info.entidad }}</span>
                            }
                            @if (info.precio) {
                              <span class="mono muted">
                                Cotización actual:
                                <strong>{{ fmt.eur(info.precio, 4) }}</strong>
                              </span>
                            }
                            @if ((tipoMov() === 'venta' || tipoMov() === 'traspaso') && info.unidades !== null) {
                              <span class="mono muted">
                                Disponibles:
                                <strong>{{ fmt.num(info.unidades, 4) }}</strong>
                              </span>
                            }
                          </span>
                          <span class="mv-hint-actions">
                            @if ((tipoMov() === 'compra' || tipoMov() === 'venta') && info.precio) {
                              <button
                                type="button"
                                class="mv-inline-chip"
                                (click)="usarPrecioActual(info.precio)"
                              >
                                Usar precio actual
                              </button>
                            }
                            @if ((tipoMov() === 'venta' || tipoMov() === 'traspaso') && info.unidades && info.unidades > 0) {
                              <button
                                type="button"
                                class="mv-inline-chip"
                                (click)="venderTodo(info.unidades)"
                              >
                                {{ tipoMov() === 'traspaso' ? 'Traspasar todo' : 'Vender todo' }}
                              </button>
                            }
                          </span>
                        </div>
                      }
                    </div>

                    <div class="campo campo-full">
                      <div class="mv-date-row">
                        <label for="mv-fecha">Fecha de la operación</label>
                        <div class="mv-date-shortcuts">
                          <button type="button" class="mv-inline-chip" (click)="ponerFechaDias(0)">
                            Hoy
                          </button>
                          <button type="button" class="mv-inline-chip" (click)="ponerFechaDias(-1)">
                            Ayer
                          </button>
                        </div>
                      </div>
                      <input
                        id="mv-fecha"
                        type="date"
                        [ngModel]="fecha()"
                        (ngModelChange)="fecha.set($event)"
                        name="fecha"
                        required
                      />
                    </div>
                  </div>
                </section>

                @if (tipoMov() === 'compra' || tipoMov() === 'venta') {
                  <section class="pm-section mv-calc-card">
                    <div class="pm-section-head">
                      <h4 class="pm-section-title">Calculadora de importes y participaciones</h4>
                      @if (precioUnitario() && precioUnitario()! > 0) {
                        <span class="tag mono">1 título = {{ fmt.eur(precioUnitario()!, 4) }}</span>
                      }
                    </div>

                    <div class="mv-calc-grid">
                      <div class="campo">
                        <label for="mv-unidades">Participaciones / Títulos</label>
                        <input
                          id="mv-unidades"
                          type="number"
                          step="any"
                          min="0.00000001"
                          [ngModel]="unidades()"
                          (ngModelChange)="alCambiarUnidades($event)"
                          name="unidades"
                          placeholder="Ej. 10.5234"
                          required
                        />
                      </div>

                      <div class="campo">
                        <label for="mv-precio">Precio unitario (€)</label>
                        <input
                          id="mv-precio"
                          type="number"
                          step="any"
                          min="0"
                          [ngModel]="precioUnitario()"
                          (ngModelChange)="alCambiarPrecio($event)"
                          name="precioUnitario"
                          placeholder="Opcional: auto"
                        />
                      </div>

                      <div class="campo">
                        <label for="mv-importe">Importe total (€)</label>
                        <input
                          id="mv-importe"
                          type="number"
                          step="0.01"
                          min="0.01"
                          [ngModel]="importe()"
                          (ngModelChange)="alCambiarImporte($event)"
                          name="importe"
                          placeholder="Ej. 500.00"
                          required
                        />
                      </div>
                    </div>

                    <div class="form-grid-2" style="margin-top: 0.25rem">
                      <div class="campo">
                        <label for="mv-comision">Comisión bróker (€, opcional)</label>
                        <input
                          id="mv-comision"
                          type="number"
                          step="0.01"
                          min="0"
                          [ngModel]="comision()"
                          (ngModelChange)="alCambiarComision($event)"
                          name="comision"
                          placeholder="Ej. 1.00"
                        />
                      </div>

                      <div class="campo">
                        <label for="mv-nota">Nota o comentario (opcional)</label>
                        <input
                          id="mv-nota"
                          type="text"
                          [ngModel]="nota()"
                          (ngModelChange)="nota.set($event)"
                          name="nota"
                          placeholder="Ej. Aportación mensual DCA"
                        />
                      </div>
                    </div>
                  </section>
                } @else if (tipoMov() === 'traspaso') {
                  <section class="pm-section mv-calc-card">
                    <div class="pm-section-head">
                      <h4 class="pm-section-title">Detalle del traspaso entre fondos/productos</h4>
                    </div>

                    @if (!productosDestinoLista().length) {
                      <div class="pm-search-empty">
                        Necesitas al menos dos productos cotizados distintos en la cartera para registrar un traspaso.
                      </div>
                    } @else {
                      <div class="form-grid-2">
                        <div class="campo campo-full">
                          <label for="mv-prod-dest">Producto destino</label>
                          <select
                            id="mv-prod-dest"
                            class="input-select"
                            [ngModel]="productoDestinoId()"
                            (ngModelChange)="productoDestinoId.set($event)"
                            name="productoDestino"
                            required
                          >
                            @for (p of productosDestinoLista(); track p.id) {
                              <option [value]="p.id">
                                {{ p.nombre }}@if (p.entidad) { ({{ p.entidad }})}
                              </option>
                            }
                          </select>

                          @if (productoDestinoInfo(); as destInfo) {
                            <div class="mv-hint-bar">
                              <span class="mv-hint-items">
                                @if (destInfo.entidad) {
                                  <span class="tag">{{ destInfo.entidad }}</span>
                                }
                                @if (destInfo.precio) {
                                  <span class="mono muted">
                                    Cotización destino:
                                    <strong>{{ fmt.eur(destInfo.precio, 4) }}</strong>
                                  </span>
                                }
                              </span>
                              <span class="mv-hint-actions">
                                @if (destInfo.precio) {
                                  <button
                                    type="button"
                                    class="mv-inline-chip"
                                    (click)="calcularUnidadesDestino(destInfo.precio)"
                                  >
                                    Calcular con cotización destino
                                  </button>
                                }
                              </span>
                            </div>
                          }
                        </div>

                        <div class="campo">
                          <label for="mv-tr-u-origen">Participaciones traspasadas (origen)</label>
                          <input
                            id="mv-tr-u-origen"
                            type="number"
                            step="any"
                            min="0.00000001"
                            [ngModel]="unidades()"
                            (ngModelChange)="alCambiarUnidadesTraspaso($event)"
                            name="unidadesTraspaso"
                            placeholder="Ej. 15.2500"
                            required
                          />
                        </div>

                        <div class="campo">
                          <label for="mv-tr-u-dest">Participaciones recibidas (destino)</label>
                          <input
                            id="mv-tr-u-dest"
                            type="number"
                            step="any"
                            min="0.00000001"
                            [ngModel]="unidadesDestino()"
                            (ngModelChange)="alCambiarUnidadesDestino($event)"
                            name="unidadesDestino"
                            placeholder="Ej. 12.8400"
                            required
                          />
                        </div>

                        <div class="campo">
                          <label for="mv-tr-importe">Importe equivalente (€)</label>
                          <input
                            id="mv-tr-importe"
                            type="number"
                            step="0.01"
                            min="0.01"
                            [ngModel]="importe()"
                            (ngModelChange)="alCambiarImporteTraspaso($event)"
                            name="importeTraspaso"
                            placeholder="Ej. 1500.00"
                            required
                          />
                        </div>

                        <div class="campo">
                          <label for="mv-tr-nota">Nota o comentario (opcional)</label>
                          <input
                            id="mv-tr-nota"
                            type="text"
                            [ngModel]="nota()"
                            (ngModelChange)="nota.set($event)"
                            name="notaTraspaso"
                            placeholder="Ej. Traspaso a indexado global"
                          />
                        </div>
                      </div>

                      <div class="mv-traspaso-aviso" role="note">
                        <cap-icon name="info" [size]="15" />
                        <span>
                          Traspaso fiscalmente neutro: hereda el coste y fecha de adquisición FIFO del fondo origen.
                        </span>
                      </div>
                    }
                  </section>
                } @else {
                  <section class="pm-section">
                    <div class="form-grid-2">
                      <div class="campo">
                        <label for="mv-importe-simple">Importe bruto (€)</label>
                        <input
                          id="mv-importe-simple"
                          type="number"
                          step="0.01"
                          min="0.01"
                          [ngModel]="importe()"
                          (ngModelChange)="alCambiarImporte($event)"
                          name="importeSimple"
                          placeholder="Ej. 24.50"
                          required
                        />
                      </div>

                      @if (tipoMov() === 'dividendo') {
                        <div class="campo">
                          <label for="mv-retencion">Retención practicada (€, opcional)</label>
                          <input
                            id="mv-retencion"
                            type="number"
                            step="0.01"
                            min="0"
                            [ngModel]="retencion()"
                            (ngModelChange)="alCambiarRetencion($event)"
                            name="retencion"
                            placeholder="Ej. 4.65"
                          />
                        </div>
                      }

                      <div class="campo" [class.campo-full]="tipoMov() === 'dividendo'">
                        <label for="mv-nota-simple">Nota o comentario (opcional)</label>
                        <input
                          id="mv-nota-simple"
                          type="text"
                          [ngModel]="nota()"
                          (ngModelChange)="nota.set($event)"
                          name="notaSimple"
                          placeholder="Ej. Dividendo trimestral"
                        />
                      </div>
                    </div>
                  </section>
                }
              </form>
            }
          </div>

          <div class="modal-footer pm-footer">
            <button type="button" class="btn-fantasma" (click)="cerrar.emit()">Cancelar</button>
            @if (productosLista().length) {
              <button
                type="submit"
                form="form-movimiento"
                class="btn-primario"
                [disabled]="guardando() || !formularioValido()"
              >
                @if (guardando()) {
                  <cap-icon name="spinner" [size]="15" [spin]="true" />
                  <span>Guardando…</span>
                } @else {
                  <span>{{
                    movimientoEditar() ? 'Guardar cambios' : 'Guardar operación'
                  }}</span>
                }
              </button>
            }
          </div>
        </div>
      </div>
    }
  `,
})
export class MovimientoModalComponent {
  readonly store = inject(PortfolioStoreService);
  readonly fmt = inject(FormatService);

  readonly abierto = input.required<boolean>();
  readonly movimientoEditar = input<MovimientoCfg | null>(null);
  readonly movimientoDuplicar = input<MovimientoCfg | null>(null);
  readonly productoPreseleccionado = input<string | undefined>(undefined);
  readonly cerrar = output<void>();

  readonly guardando = signal(false);
  readonly productoId = signal('');
  readonly productoDestinoId = signal('');
  readonly tipoMov = signal<TipoMov>('compra');
  readonly fecha = signal(this.fechaIso(0));
  readonly unidades = signal<number | null>(null);
  readonly unidadesDestino = signal<number | null>(null);
  readonly precioUnitario = signal<number | null>(null);
  readonly importe = signal<number | null>(null);
  readonly comision = signal<number | null>(null);
  readonly retencion = signal<number | null>(null);
  readonly nota = signal('');
  private precioFijado = false;

  readonly tiposOperacion: { id: TipoMov; etiqueta: string }[] = [
    { id: 'compra', etiqueta: 'Compra' },
    { id: 'venta', etiqueta: 'Venta' },
    { id: 'traspaso', etiqueta: 'Traspaso' },
    { id: 'dividendo', etiqueta: 'Dividendo' },
    { id: 'comision', etiqueta: 'Comisión' },
  ];

  readonly productosLista = computed<ProductoCfg[]>(() => {
    const todos = this.store.cartera()?.productos || [];
    const compatibles = todos.filter(
      (p) => !['efectivo', 'inmueble', 'deuda'].includes(p.tipo) && p.fuente !== 'manual',
    );
    const editado = this.movimientoEditar()?.producto || this.movimientoDuplicar()?.producto;
    if (editado && !compatibles.some((p) => p.id === editado)) {
      const extra = todos.find((p) => p.id === editado);
      if (extra) return [extra, ...compatibles];
    }
    return compatibles;
  });

  readonly productosDestinoLista = computed<ProductoCfg[]>(() => {
    const orig = this.productoId();
    return this.productosLista().filter(
      (p) =>
        p.id !== orig &&
        !['efectivo', 'inmueble', 'deuda'].includes(p.tipo) &&
        p.fuente !== 'manual'
    );
  });

  readonly productoSeleccionadoInfo = computed(() => {
    return this.infoProductoPorId(this.productoId());
  });

  readonly productoDestinoInfo = computed(() => {
    return this.infoProductoPorId(this.productoDestinoId());
  });

  private infoProductoPorId(id: string) {
    if (!id) return null;
    const cfg = (this.store.cartera()?.productos || []).find((p) => p.id === id);
    const calc = this.store.todosComponentes().find((c) => c.id === id);
    const precio = calc ? this.store.precioProductoConVivo(calc) || null : null;
    const unidades = calc ? (calc.participaciones ?? calc.titulos ?? null) : null;
    return {
      entidad: cfg?.entidad || calc?.entidad || '',
      precio,
      unidades,
    };
  }

  constructor() {
    effect(() => {
      if (this.abierto()) {
        this.guardando.set(false);
        const m = this.movimientoEditar();
        const dup = this.movimientoDuplicar();
        const fuente = m || dup;
        const lista = this.productosLista();

        if (fuente) {
          this.productoId.set(fuente.producto);
          this.tipoMov.set(fuente.tipo);
          this.fecha.set(m ? m.fecha : this.fechaIso(0));
          const u = fuente.unidades && fuente.unidades > 0 ? fuente.unidades : null;
          const uDest =
            fuente.unidadesDestino && fuente.unidadesDestino > 0 ? fuente.unidadesDestino : null;
          const imp = fuente.importe && fuente.importe > 0 ? fuente.importe : null;
          this.unidades.set(u);
          this.unidadesDestino.set(uDest);
          this.productoDestinoId.set(
            fuente.productoDestino ||
              lista.find((p) => p.id !== fuente.producto)?.id ||
              ''
          );
          this.importe.set(imp);
          this.precioUnitario.set(u && imp ? this.redondear(imp / u, 4) : null);
          this.comision.set(fuente.comision ?? null);
          this.retencion.set(fuente.retencion ?? null);
          this.nota.set(fuente.nota || '');
          this.precioFijado = false;
        } else {
          const pre = this.productoPreseleccionado();
          const inicial =
            (pre && lista.some((p) => p.id === pre) ? pre : '') || lista[0]?.id || '';
          this.productoId.set(inicial);
          this.productoDestinoId.set(lista.find((p) => p.id !== inicial)?.id || '');
          this.tipoMov.set('compra');
          this.fecha.set(this.fechaIso(0));
          this.unidades.set(null);
          this.unidadesDestino.set(null);
          this.importe.set(null);
          this.precioUnitario.set(null);
          this.comision.set(null);
          this.retencion.set(null);
          this.nota.set('');
          this.precioFijado = false;
        }
      }
    });
  }

  private fechaIso(offsetDias: number): string {
    const d = new Date();
    d.setDate(d.getDate() + offsetDias);
    return d.toISOString().slice(0, 10);
  }

  private aNumeroPositivo(val: unknown): number | null {
    if (val === null || val === undefined || val === '') return null;
    const n = Number(val);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  private redondear(n: number, dec: number): number {
    const f = 10 ** dec;
    return Math.round(n * f) / f;
  }

  ponerFechaDias(offset: number): void {
    this.fecha.set(this.fechaIso(offset));
  }

  seleccionarProducto(id: string): void {
    this.productoId.set(id);
    if (this.productoDestinoId() === id) {
      this.productoDestinoId.set(this.productosDestinoLista()[0]?.id || '');
    }
  }

  cambiarTipo(tipo: TipoMov): void {
    this.tipoMov.set(tipo);
    if (tipo === 'dividendo' || tipo === 'comision') {
      this.precioFijado = false;
    }
    if (tipo === 'traspaso') {
      this.precioFijado = false;
      if (!this.productoDestinoId() || this.productoDestinoId() === this.productoId()) {
        this.productoDestinoId.set(this.productosDestinoLista()[0]?.id || '');
      }
    }
  }

  usarPrecioActual(precio: number): void {
    if (!Number.isFinite(precio) || precio <= 0) return;
    const p = this.redondear(precio, 4);
    this.precioUnitario.set(p);
    this.precioFijado = true;
    const u = this.unidades();
    const imp = this.importe();
    if (u && u > 0) {
      this.importe.set(this.redondear(u * p, 2));
    } else if (imp && imp > 0) {
      this.unidades.set(this.redondear(imp / p, 6));
    }
  }

  venderTodo(disponibles: number): void {
    if (!Number.isFinite(disponibles) || disponibles <= 0) return;
    const u = this.redondear(disponibles, 8);
    if (this.tipoMov() === 'traspaso') {
      this.alCambiarUnidadesTraspaso(u);
      const destPrecio = this.productoDestinoInfo()?.precio;
      if (destPrecio && destPrecio > 0) {
        this.calcularUnidadesDestino(destPrecio);
      }
      return;
    }
    this.alCambiarUnidades(u);
    const info = this.productoSeleccionadoInfo();
    if (info?.precio && (!this.importe() || this.precioFijado)) {
      this.usarPrecioActual(info.precio);
    }
  }

  alCambiarUnidadesTraspaso(val: unknown): void {
    const u = this.aNumeroPositivo(val);
    this.unidades.set(u);
    const origPrecio = this.productoSeleccionadoInfo()?.precio;
    if (u && origPrecio && origPrecio > 0) {
      this.importe.set(this.redondear(u * origPrecio, 2));
    }
  }

  alCambiarUnidadesDestino(val: unknown): void {
    this.unidadesDestino.set(this.aNumeroPositivo(val));
  }

  alCambiarImporteTraspaso(val: unknown): void {
    this.importe.set(this.aNumeroPositivo(val));
  }

  calcularUnidadesDestino(precioDest: number): void {
    if (!Number.isFinite(precioDest) || precioDest <= 0) return;
    let imp = this.importe();
    if (!imp || imp <= 0) {
      const u = this.unidades();
      const origPrecio = this.productoSeleccionadoInfo()?.precio;
      if (u && origPrecio && origPrecio > 0) {
        imp = this.redondear(u * origPrecio, 2);
        this.importe.set(imp);
      }
    }
    if (imp && imp > 0) {
      this.unidadesDestino.set(this.redondear(imp / precioDest, 6));
    }
  }

  alCambiarRetencion(val: unknown): void {
    if (val === null || val === undefined || val === '') {
      this.retencion.set(null);
      return;
    }
    const n = Number(val);
    this.retencion.set(Number.isFinite(n) && n >= 0 ? n : null);
  }

  alCambiarUnidades(val: unknown): void {
    const u = this.aNumeroPositivo(val);
    this.unidades.set(u);
    if (!u) return;
    const p = this.precioUnitario();
    const imp = this.importe();
    if (this.precioFijado && p && p > 0) {
      this.importe.set(this.redondear(u * p, 2));
    } else if (imp && imp > 0) {
      this.precioUnitario.set(this.redondear(imp / u, 4));
    } else if (p && p > 0) {
      this.importe.set(this.redondear(u * p, 2));
    }
  }

  alCambiarPrecio(val: unknown): void {
    const p = this.aNumeroPositivo(val);
    this.precioUnitario.set(p);
    this.precioFijado = Boolean(p && p > 0);
    if (!p) return;
    const u = this.unidades();
    const imp = this.importe();
    if (u && u > 0) {
      this.importe.set(this.redondear(u * p, 2));
    } else if (imp && imp > 0) {
      this.unidades.set(this.redondear(imp / p, 6));
    }
  }

  alCambiarImporte(val: unknown): void {
    const imp = this.aNumeroPositivo(val);
    this.importe.set(imp);
    if (!imp) return;
    const p = this.precioUnitario();
    const u = this.unidades();
    if (this.precioFijado && p && p > 0) {
      this.unidades.set(this.redondear(imp / p, 6));
    } else if (u && u > 0) {
      this.precioUnitario.set(this.redondear(imp / u, 4));
    } else if (p && p > 0) {
      this.unidades.set(this.redondear(imp / p, 6));
    }
  }

  alCambiarComision(val: unknown): void {
    if (val === null || val === undefined || val === '') {
      this.comision.set(null);
      return;
    }
    const n = Number(val);
    this.comision.set(Number.isFinite(n) && n >= 0 ? n : null);
  }

  formularioValido(): boolean {
    if (!this.productoId() || !this.fecha()) return false;
    const tipo = this.tipoMov();
    const imp = this.importe();
    if (!imp || imp <= 0) return false;
    if (tipo === 'traspaso') {
      const dest = this.productoDestinoId();
      const uOrig = this.unidades();
      const uDest = this.unidadesDestino();
      return Boolean(dest && dest !== this.productoId() && uOrig && uOrig > 0 && uDest && uDest > 0);
    }
    if (tipo === 'dividendo') {
      const ret = this.retencion();
      if (ret !== null && (ret < 0 || ret >= imp)) return false;
    }
    if (tipo === 'compra' || tipo === 'venta') {
      const u = this.unidades();
      return Boolean(u && u > 0);
    }
    return true;
  }

  cerrarSiAbierto(): void {
    if (this.abierto()) this.cerrar.emit();
  }

  async guardar(): Promise<void> {
    if (this.guardando() || !this.formularioValido()) return;
    this.guardando.set(true);
    try {
      const tipo = this.tipoMov();
      const esOpTitulos = tipo === 'compra' || tipo === 'venta';
      const esTraspaso = tipo === 'traspaso';
      const payload: Partial<MovimientoCfg> = {
        producto: this.productoId(),
        tipo,
        fecha: this.fecha(),
        unidades: esOpTitulos || esTraspaso ? Number(this.unidades() || 0) : 0,
        importe: Number(this.importe() || 0),
        comision: esOpTitulos && this.comision() ? Number(this.comision()) : null,
        nota: this.nota().trim(),
      };
      if (esTraspaso) {
        payload.productoDestino = this.productoDestinoId();
        payload.unidadesDestino = Number(this.unidadesDestino() || 0);
      }
      if (tipo === 'dividendo' && this.retencion() !== null) {
        payload.retencion = Number(this.retencion());
      }
      const ok = await this.store.guardarMovimiento(payload, this.movimientoEditar()?.id);
      if (ok) {
        this.cerrar.emit();
      }
    } finally {
      this.guardando.set(false);
    }
  }
}
