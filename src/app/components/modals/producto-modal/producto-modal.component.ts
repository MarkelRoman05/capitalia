import { Component, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PortfolioStoreService } from '../../../services/portfolio-store.service';
import { FormatService } from '../../../services/format.service';
import { ProductoCfg, ResultadoBusqueda } from '../../../models/portfolio.model';

@Component({
  selector: 'cap-producto-modal',
  imports: [FormsModule],
  host: {
    '(document:keydown.escape)': 'cerrarSiAbierto()',
  },
  template: `
    @if (abierto()) {
      <div class="modal-backdrop" (click)="cerrar.emit()">
        <div
          class="modal-card modal-lg"
          (click)="$event.stopPropagation()"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-prod-titulo"
        >
          <div class="modal-header">
            <div>
              <span class="modal-kicker">Catálogo de Activos y Pasivos</span>
              <h3 id="modal-prod-titulo">
                {{
                  productoEditar() ? 'Editar producto o activo' : 'Añadir nuevo producto o activo'
                }}
              </h3>
            </div>
            <button type="button" class="btn-cerrar" (click)="cerrar.emit()" aria-label="Cerrar">
              ✕
            </button>
          </div>

          <div class="modal-body">
            <div class="seg-group" style="margin-bottom: 1.15rem; width: 100%">
              <button
                type="button"
                class="seg-btn"
                style="flex: 1"
                [class.on]="modoModalProd() === 'cotizado'"
                (click)="cambiarModoModalProd('cotizado')"
              >
                Fondo, ETF, acción o cripto (cotización automática)
              </button>
              <button
                type="button"
                class="seg-btn"
                style="flex: 1"
                [class.on]="modoModalProd() === 'manual'"
                (click)="cambiarModoModalProd('manual')"
              >
                Cuenta, efectivo, inmueble o deuda (saldo manual)
              </button>
            </div>

            @if (modoModalProd() === 'cotizado') {
              <div class="buscador-box">
                <label for="busq-input">
                  Buscar por ISIN, ticker o nombre (Morningstar, Yahoo Finance, CoinGecko)
                </label>
                <div class="buscador-row">
                  <input
                    id="busq-input"
                    autofocus
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
                        <div class="mono">{{ r.precio }} {{ r.moneda }}</div>
                      </button>
                    }
                  </div>
                }
              </div>
            }

            <form (ngSubmit)="guardar()" class="form-grid-2">
              <div class="campo">
                <label for="pr-nombre">Nombre completo</label>
                <input
                  id="pr-nombre"
                  type="text"
                  [(ngModel)]="formProd.nombre"
                  name="nombre"
                  required
                  placeholder="Ej. Vanguard Global Stock Index"
                />
              </div>

              <div class="campo">
                <label for="pr-corto">Nombre corto (para gráficos)</label>
                <input
                  id="pr-corto"
                  type="text"
                  [(ngModel)]="formProd.corto"
                  name="corto"
                  placeholder="Ej. MSCI World"
                />
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
                <input
                  id="pr-entidad"
                  type="text"
                  [(ngModel)]="formProd.entidad"
                  name="entidad"
                  placeholder="Ej. MyInvestor, Indexa, Interactive Brokers..."
                />
              </div>

              <div class="campo">
                <label for="pr-clase">Clase de activo (para distribución)</label>
                <input
                  id="pr-clase"
                  type="text"
                  [(ngModel)]="formProd.clase"
                  name="clase"
                  placeholder="Ej. Renta variable global, Liquidez, Cripto..."
                />
              </div>

              <div class="campo">
                <label for="pr-ident">ISIN o Ticker visible</label>
                <input
                  id="pr-ident"
                  type="text"
                  [(ngModel)]="formProd.identificador"
                  name="identificador"
                  placeholder="Ej. IE00B03HCZ61"
                />
              </div>

              @if (modoModalProd() === 'cotizado') {
                <div class="campo">
                  <label for="pr-ter">Comisión anual TER (%)</label>
                  <input
                    id="pr-ter"
                    type="number"
                    step="0.01"
                    min="0"
                    [(ngModel)]="formProd.ter"
                    name="ter"
                    placeholder="Ej. 0.12"
                  />
                </div>

                <div class="campo">
                  <label for="pr-riesgo">Nivel de riesgo SRRI (1 a 7)</label>
                  <input
                    id="pr-riesgo"
                    type="number"
                    step="1"
                    min="1"
                    max="7"
                    [(ngModel)]="formProd.riesgo"
                    name="riesgo"
                    placeholder="Ej. 5"
                  />
                </div>
              }

              <div class="campo campo-full">
                <label>Color identificativo</label>
                <div class="paleta-colores">
                  @for (par of fmt.paleta; track $index; let i = $index) {
                    <button
                      type="button"
                      class="color-swatch"
                      [class.on]="formProd.slot === i + 1"
                      [style.background]="par[0]"
                      (click)="formProd.slot = i + 1"
                      [attr.aria-label]="'Color ' + (i + 1)"
                    ></button>
                  }
                </div>
              </div>

              <div class="campo campo-full">
                <label class="check-row">
                  <input type="checkbox" [(ngModel)]="formProd.largoPlazo" name="largoPlazo" />
                  <span
                    >Inversión a largo plazo (incluir en el filtro rápido «Solo largo plazo»)</span
                  >
                </label>
              </div>

              <div class="campo campo-full">
                <button
                  type="button"
                  class="btn-link"
                  (click)="mostrarAvanzadoProd.set(!mostrarAvanzadoProd())"
                >
                  {{
                    mostrarAvanzadoProd()
                      ? '▾ Ocultar configuración técnica de fuentes'
                      : '▸ Configuración avanzada de fuente de precios (Morningstar / Yahoo / CoinGecko)'
                  }}
                </button>
              </div>

              @if (mostrarAvanzadoProd()) {
                <div class="campo">
                  <label for="pr-fuente">Fuente de cotización</label>
                  <select
                    id="pr-fuente"
                    class="input-select"
                    [(ngModel)]="formProd.fuente"
                    name="fuente"
                  >
                    <option value="morningstar">Morningstar (Fondos/ETFs)</option>
                    <option value="yahoo">Yahoo Finance (Acciones/ETFs/Cripto)</option>
                    <option value="coingecko">CoinGecko (Cripto)</option>
                    <option value="manual">Manual (Saldos)</option>
                  </select>
                </div>

                <div class="campo">
                  <label for="pr-codigo">Código interno en la fuente</label>
                  <input
                    id="pr-codigo"
                    type="text"
                    [(ngModel)]="formProd.codigo"
                    name="codigo"
                    placeholder="SecId de Morningstar, ticker de Yahoo o ID CoinGecko"
                  />
                </div>

                <div class="campo">
                  <label for="pr-moneda">Divisa de cotización</label>
                  <select
                    id="pr-moneda"
                    class="input-select"
                    [(ngModel)]="formProd.moneda"
                    name="moneda"
                  >
                    <option value="EUR">EUR (€)</option>
                    <option value="USD">USD ($ - conversión automática a EUR)</option>
                    <option value="GBP">GBP (£)</option>
                  </select>
                </div>

                <div class="campo">
                  <label for="pr-vivo">ID CoinGecko en vivo (opcional)</label>
                  <input
                    id="pr-vivo"
                    type="text"
                    [(ngModel)]="formProd.vivo"
                    name="vivo"
                    placeholder="Ej. bitcoin, ethereum"
                  />
                </div>
              }

              <div class="modal-footer campo-full">
                <button type="button" class="btn-fantasma" (click)="cerrar.emit()">Cancelar</button>
                <button type="submit" class="btn-primario">
                  {{ productoEditar() ? 'Guardar cambios' : 'Crear producto' }}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    }
  `,
})
export class ProductoModalComponent {
  readonly store = inject(PortfolioStoreService);
  readonly fmt = inject(FormatService);

  readonly abierto = input.required<boolean>();
  readonly productoEditar = input<ProductoCfg | null>(null);
  readonly cerrar = output<void>();

  readonly modoModalProd = signal<'cotizado' | 'manual'>('cotizado');
  readonly mostrarAvanzadoProd = signal<boolean>(false);
  readonly buscando = signal<boolean>(false);
  readonly resultadosBusqueda = signal<ResultadoBusqueda[]>([]);
  consultaBusqueda = '';

  formProd: Partial<ProductoCfg> = this.crearFormProductoVacio();

  constructor() {
    effect(() => {
      if (this.abierto()) {
        const p = this.productoEditar();
        this.resultadosBusqueda.set([]);
        this.consultaBusqueda = '';
        this.mostrarAvanzadoProd.set(false);
        if (p) {
          this.formProd = { ...p };
          // La cartera guarda la TER como fracción (0.0012); el formulario y el backend la manejan en %.
          this.formProd.ter = p.ter != null ? p.ter * 100 : null;
          this.modoModalProd.set(
            p.fuente === 'manual' || !this.esTipoInversion(p.tipo) ? 'manual' : 'cotizado',
          );
        } else {
          this.formProd = this.crearFormProductoVacio();
          this.modoModalProd.set('cotizado');
        }
      }
    });
  }

  private esTipoInversion(tipo: string): boolean {
    return ['fondo', 'etf', 'accion', 'cripto'].includes(tipo);
  }

  private crearFormProductoVacio(): Partial<ProductoCfg> {
    const usados = new Set((this.store.cartera()?.productos || []).map((p) => p.slot ?? 0));
    // Los colores van de 1 a 12 (así los usa el backend y la paleta).
    let slotLibre = 1;
    for (let i = 1; i <= 12; i++) {
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

  cerrarSiAbierto(): void {
    if (this.abierto()) this.cerrar.emit();
  }

  async guardar(): Promise<void> {
    if (!this.formProd.nombre?.trim()) return;
    const idExistente = this.productoEditar()?.id;
    const ok = await this.store.guardarProducto(this.formProd, idExistente);
    if (ok) {
      this.cerrar.emit();
    }
  }
}
