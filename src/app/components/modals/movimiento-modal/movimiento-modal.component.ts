import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PortfolioStoreService } from '../../../services/portfolio-store.service';
import { FormatService } from '../../../services/format.service';
import { MovimientoCfg, ProductoCfg } from '../../../models/portfolio.model';

type TipoMov = 'compra' | 'venta' | 'dividendo' | 'comision';

@Component({
  selector: 'cap-movimiento-modal',
  imports: [FormsModule],
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
                      : 'Anotar compra, venta, dividendo o comisión'
                }}
              </h3>
            </div>
            <button type="button" class="btn-cerrar" (click)="cerrar.emit()" aria-label="Cerrar">
              ✕
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
                      <label for="mv-prod">Producto de inversión</label>
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
                            @if (tipoMov() === 'venta' && info.unidades !== null) {
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
                            @if (tipoMov() === 'venta' && info.unidades && info.unidades > 0) {
                              <button
                                type="button"
                                class="mv-inline-chip"
                                (click)="venderTodo(info.unidades)"
                              >
                                Vender todo
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
                } @else {
                  <section class="pm-section">
                    <div class="form-grid-2">
                      <div class="campo">
                        <label for="mv-importe-simple">Importe (€)</label>
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

                      <div class="campo">
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
                  <span class="girando" aria-hidden="true">↻</span>
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
  readonly tipoMov = signal<TipoMov>('compra');
  readonly fecha = signal(this.fechaIso(0));
  readonly unidades = signal<number | null>(null);
  readonly precioUnitario = signal<number | null>(null);
  readonly importe = signal<number | null>(null);
  readonly comision = signal<number | null>(null);
  readonly nota = signal('');
  private precioFijado = false;

  readonly tiposOperacion: { id: TipoMov; etiqueta: string }[] = [
    { id: 'compra', etiqueta: 'Compra' },
    { id: 'venta', etiqueta: 'Venta' },
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

  readonly productoSeleccionadoInfo = computed(() => {
    const id = this.productoId();
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
  });

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
          const imp = fuente.importe && fuente.importe > 0 ? fuente.importe : null;
          this.unidades.set(u);
          this.importe.set(imp);
          this.precioUnitario.set(u && imp ? this.redondear(imp / u, 4) : null);
          this.comision.set(fuente.comision ?? null);
          this.nota.set(fuente.nota || '');
          this.precioFijado = false;
        } else {
          const pre = this.productoPreseleccionado();
          const inicial =
            (pre && lista.some((p) => p.id === pre) ? pre : '') || lista[0]?.id || '';
          this.productoId.set(inicial);
          this.tipoMov.set('compra');
          this.fecha.set(this.fechaIso(0));
          this.unidades.set(null);
          this.importe.set(null);
          this.precioUnitario.set(null);
          this.comision.set(null);
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
  }

  cambiarTipo(tipo: TipoMov): void {
    this.tipoMov.set(tipo);
    if (tipo === 'dividendo' || tipo === 'comision') {
      this.precioFijado = false;
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
    this.alCambiarUnidades(u);
    const info = this.productoSeleccionadoInfo();
    if (info?.precio && (!this.importe() || this.precioFijado)) {
      this.usarPrecioActual(info.precio);
    }
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
    const imp = this.importe();
    if (!imp || imp <= 0) return false;
    if (this.tipoMov() === 'compra' || this.tipoMov() === 'venta') {
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
      const esOpTitulos = this.tipoMov() === 'compra' || this.tipoMov() === 'venta';
      const payload: Partial<MovimientoCfg> = {
        producto: this.productoId(),
        tipo: this.tipoMov(),
        fecha: this.fecha(),
        unidades: esOpTitulos ? Number(this.unidades() || 0) : 0,
        importe: Number(this.importe() || 0),
        comision: esOpTitulos && this.comision() ? Number(this.comision()) : null,
        nota: this.nota().trim(),
      };
      const ok = await this.store.guardarMovimiento(payload, this.movimientoEditar()?.id);
      if (ok) {
        this.cerrar.emit();
      }
    } finally {
      this.guardando.set(false);
    }
  }
}
