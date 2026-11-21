import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PortfolioStoreService } from '../../../services/portfolio-store.service';
import { FormatService } from '../../../services/format.service';
import { EntidadBanco, ProductoCfg, ResultadoBusqueda } from '../../../models/portfolio.model';
import { BancoSelectorComponent } from './banco-selector.component';

@Component({
  selector: 'cap-producto-modal',
  imports: [FormsModule, BancoSelectorComponent],
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
          aria-labelledby="modal-prod-titulo"
        >
          <div class="modal-header pm-header">
            <div class="modal-title-group">
              <span class="modal-kicker">Catálogo de Activos y Pasivos</span>
              <h3 id="modal-prod-titulo">
                {{ productoEditar() ? 'Editar producto' : 'Añadir producto a la cartera' }}
              </h3>
            </div>
            <button type="button" class="btn-cerrar" (click)="cerrar.emit()" aria-label="Cerrar">
              ✕
            </button>
          </div>

          <div class="pm-body">
            <!-- Selector de tipo de seguimiento -->
            <div class="pm-mode-grid" role="group" aria-label="Tipo de seguimiento del producto">
              <button
                type="button"
                class="pm-mode-card"
                [class.on]="modoModalProd() === 'cotizado'"
                (click)="cambiarModoModalProd('cotizado')"
              >
                <span class="pm-mode-ico" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9">
                    <path d="M3 17l6-6 4 4 8-8M15 7h6v6" />
                  </svg>
                </span>
                <span class="pm-mode-txt">
                  <strong>Activo cotizado</strong>
                  <small>Fondo, ETF, acción o cripto</small>
                </span>
              </button>

              <button
                type="button"
                class="pm-mode-card"
                [class.on]="modoModalProd() === 'manual'"
                (click)="cambiarModoModalProd('manual')"
              >
                <span class="pm-mode-ico" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9">
                    <path
                      d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"
                    />
                    <path d="M16 12h5v4h-5a2 2 0 0 1 0-4Z" />
                  </svg>
                </span>
                <span class="pm-mode-txt">
                  <strong>Saldo manual</strong>
                  <small>Cuenta, efectivo, inmueble o deuda</small>
                </span>
              </button>
            </div>

            <!-- Buscador automático para activos cotizados -->
            @if (modoModalProd() === 'cotizado') {
              <section class="pm-search-card" aria-label="Buscador de activos">
                @if (activoSeleccionado(); as sel) {
                  <div class="pm-linked-card">
                    <div class="pm-linked-main">
                      <div class="pm-linked-badges">
                        <span class="pm-type-badge" [class]="claseBadgeTipo(sel.tipo)">
                          {{ etiquetaTipo(sel.tipo) }}
                        </span>
                        <span class="tag mono">{{ sel.identificador }}</span>
                        <span class="tag">{{ sel.fuente }}</span>
                        @if (sel.mercado) {
                          <span class="tag">{{ sel.mercado }}</span>
                        }
                      </div>
                      <strong class="pm-linked-name">{{ sel.nombre }}</strong>
                      @if (sel.ficha?.gestora || sel.ficha?.clase) {
                        <span class="pm-linked-sub">
                          {{ sel.ficha?.gestora }}
                          @if (sel.ficha?.gestora && sel.ficha?.clase) {
                            ·
                          }
                          {{ sel.ficha?.clase }}
                        </span>
                      }
                    </div>
                    <div class="pm-linked-aside">
                      <div class="pm-linked-price mono">
                        {{ fmt.num(sel.precio, sel.precio >= 100 ? 2 : 4) }} {{ sel.moneda }}
                      </div>
                      <button
                        type="button"
                        class="btn-secundario btn-sm"
                        (click)="cambiarActivoVinculado()"
                      >
                        Cambiar activo
                      </button>
                    </div>
                  </div>
                } @else {
                  <div class="pm-search-head">
                    <label for="busq-input">Buscar producto en mercados</label>
                    <span class="pm-search-sources">Morningstar · Yahoo Finance · CoinGecko</span>
                  </div>

                  <div class="pm-search-row">
                    <div class="pm-search-input-wrap">
                      <svg
                        class="pm-search-ico"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        aria-hidden="true"
                      >
                        <circle cx="11" cy="11" r="7" />
                        <path d="m20 20-3.5-3.5" />
                      </svg>
                      <input
                        id="busq-input"
                        autofocus
                        type="text"
                        [(ngModel)]="consultaBusqueda"
                        (keydown.enter)="$event.preventDefault(); lanzarBusqueda()"
                        placeholder="ISIN, ticker o nombre (ej. IE00B03HCZ61, MSCI World, AAPL, Bitcoin…)"
                      />
                      @if (consultaBusqueda) {
                        <button
                          type="button"
                          class="pm-search-clear"
                          (click)="limpiarBusqueda()"
                          aria-label="Limpiar búsqueda"
                        >
                          ✕
                        </button>
                      }
                    </div>
                    <button
                      type="button"
                      class="btn-primario pm-search-btn"
                      [disabled]="buscando() || consultaBusqueda.trim().length < 2"
                      (click)="lanzarBusqueda()"
                    >
                      @if (buscando()) {
                        <span class="girando" aria-hidden="true">↻</span>
                        <span>Buscando…</span>
                      } @else {
                        <span>Buscar</span>
                      }
                    </button>
                  </div>

                  @if (!resultadosBusqueda().length && !buscando() && !busquedaRealizada()) {
                    <div class="pm-quick-chips">
                      <span>Ejemplos:</span>
                      @for (ej of ejemplosBusqueda; track ej) {
                        <button type="button" class="pm-quick-chip" (click)="buscarEjemplo(ej)">
                          {{ ej }}
                        </button>
                      }
                    </div>
                  }

                  @if (busquedaRealizada() && !buscando() && !resultadosBusqueda().length) {
                    <div class="pm-search-empty">
                      @if (errorBusqueda()) {
                        No se pudo conectar con las fuentes de mercado. Revisa tu conexión o rellena
                        los datos manualmente abajo.
                      } @else {
                        No encontramos resultados con cotización para «{{ ultimaConsulta() }}».
                        Prueba con el ISIN exacto, el ticker de Yahoo o rellénalo abajo.
                      }
                    </div>
                  }

                  @if (resultadosBusqueda().length) {
                    <div class="pm-results" role="list" aria-label="Resultados de búsqueda">
                      @for (r of resultadosBusqueda(); track r.fuente + '-' + r.codigo) {
                        <button
                          type="button"
                          role="listitem"
                          class="pm-result-item"
                          (click)="seleccionarResultadoBusqueda(r)"
                        >
                          <div class="pm-result-main">
                            <div class="pm-result-title-row">
                              <span class="pm-type-badge" [class]="claseBadgeTipo(r.tipo)">
                                {{ etiquetaTipo(r.tipo) }}
                              </span>
                              <strong class="pm-result-name">{{ r.nombre }}</strong>
                            </div>
                            @if (r.ficha?.gestora || r.ficha?.clase) {
                              <div class="pm-result-sub">
                                {{ r.ficha?.gestora }}
                                @if (r.ficha?.gestora && r.ficha?.clase) {
                                  ·
                                }
                                {{ r.ficha?.clase }}
                              </div>
                            }
                            <div class="prod-tags">
                              <span class="tag mono">{{ r.identificador }}</span>
                              @if (r.mercado) {
                                <span class="tag">{{ r.mercado }}</span>
                              }
                              <span class="tag">{{ r.fuente }}</span>
                              @if (r.ficha?.ter !== undefined && r.ficha?.ter !== null) {
                                <span class="tag">TER {{ fmt.num(r.ficha!.ter!, 2) }}%</span>
                              }
                              @if (r.ficha?.riesgo) {
                                <span class="tag">SRRI {{ r.ficha!.riesgo }}</span>
                              }
                            </div>
                          </div>

                          <div class="pm-result-aside">
                            <strong class="pm-result-price mono">
                              {{ fmt.num(r.precio, r.precio >= 100 ? 2 : 4) }} {{ r.moneda }}
                            </strong>
                            <small class="pm-result-date mono">{{ r.fecha }}</small>
                            <span class="pm-result-cta">Elegir →</span>
                          </div>
                        </button>
                      }
                    </div>
                  }
                }
              </section>
            }

            <form id="form-producto" (ngSubmit)="guardar()" class="pm-sections">
              <!-- SECCIÓN 1: BANCO Y DATOS PRINCIPALES -->
              <section class="pm-section">
                <h4 class="pm-section-title">Entidad y datos principales</h4>
                <div class="form-grid-2">
                  <div class="campo campo-full">
                    <label>Banco, bróker o entidad donde lo tienes contratado</label>
                    <cap-banco-selector
                      [valor]="formProd.entidad || ''"
                      (valorChange)="formProd.entidad = $event"
                      (entidadSeleccionada)="bancoSeleccionado.set($event)"
                      [entidadesCartera]="entidadesCartera()"
                    />
                  </div>

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
                      <option value="commodity">Materia prima</option>
                      <option value="efectivo">Efectivo y cuentas</option>
                      <option value="inmueble">Inmueble</option>
                      <option value="deuda">Deuda / Préstamo (resta al patrimonio)</option>
                      <option value="otro">Otro activo</option>
                    </select>
                  </div>

                  <div class="campo">
                    <label for="pr-clase">Clase de activo (para distribución)</label>
                    <input
                      id="pr-clase"
                      type="text"
                      list="clases-sugeridas"
                      [(ngModel)]="formProd.clase"
                      name="clase"
                      placeholder="Ej. Renta variable global, Liquidez, Cripto…"
                    />
                    <datalist id="clases-sugeridas">
                      <option value="Renta variable global"></option>
                      <option value="Renta variable EE. UU."></option>
                      <option value="Renta variable Europa"></option>
                      <option value="Renta variable emergente"></option>
                      <option value="Renta fija"></option>
                      <option value="Monetario"></option>
                      <option value="Liquidez"></option>
                      <option value="Criptomonedas"></option>
                      <option value="Materias primas"></option>
                      <option value="Inmobiliario"></option>
                      <option value="Deuda y préstamos"></option>
                    </datalist>
                  </div>
                </div>
              </section>

              <!-- SECCIÓN 2: IDENTIFICACIÓN Y MÉTRICAS -->
              <section class="pm-section">
                <h4 class="pm-section-title">Identificación y métricas</h4>
                <div class="form-grid-2">
                  <div class="campo" [class.campo-full]="modoModalProd() === 'manual'">
                    <label for="pr-ident">ISIN, Ticker o referencia</label>
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
                      <label for="pr-gestora">Gestora o emisor</label>
                      <input
                        id="pr-gestora"
                        type="text"
                        [(ngModel)]="formProd.gestora"
                        name="gestora"
                        placeholder="Ej. Vanguard, BlackRock, Fidelity…"
                      />
                    </div>

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
                </div>
              </section>

              <!-- SECCIÓN 3: PERSONALIZACIÓN -->
              <section class="pm-section">
                <div class="pm-section-head">
                  <h4 class="pm-section-title">Personalización visual</h4>
                  <span class="pm-preview-chip">
                    <span class="dot" [style.background]="colorActual()[0]"></span>
                    <span>{{
                      formProd.corto?.trim() || formProd.nombre?.trim() || 'Tu producto'
                    }}</span>
                    @if (formProd.entidad?.trim()) {
                      <small>· {{ formProd.entidad?.trim() }}</small>
                    }
                  </span>
                </div>

                <div class="paleta-colores" style="margin-bottom: 0.9rem">
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

                <label class="pm-switch">
                  <input type="checkbox" [(ngModel)]="formProd.largoPlazo" name="largoPlazo" />
                  <span class="pm-switch-track" aria-hidden="true"></span>
                  <span class="pm-switch-txt">
                    <strong>Inversión a largo plazo</strong>
                    <small>Incluir en el filtro rápido «Solo largo plazo»</small>
                  </span>
                </label>
              </section>

              <!-- SECCIÓN 4: CONFIGURACIÓN TÉCNICA -->
              <div class="pm-adv-wrap">
                <button
                  type="button"
                  class="pm-adv-toggle"
                  [attr.aria-expanded]="mostrarAvanzadoProd()"
                  (click)="mostrarAvanzadoProd.set(!mostrarAvanzadoProd())"
                >
                  <span>Configuración técnica de fuente de precios</span>
                  <span>{{ mostrarAvanzadoProd() ? '▾ Ocultar' : '▸ Mostrar' }}</span>
                </button>

                @if (mostrarAvanzadoProd()) {
                  <div class="pm-adv-box form-grid-2">
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
                  </div>
                }
              </div>
            </form>
          </div>

          <div class="modal-footer pm-footer">
            <button type="button" class="btn-fantasma" (click)="cerrar.emit()">Cancelar</button>
            <button
              type="submit"
              form="form-producto"
              class="btn-primario"
              [disabled]="guardando() || !formProd.nombre?.trim()"
            >
              @if (guardando()) {
                <span class="girando" aria-hidden="true">↻</span>
                <span>Guardando…</span>
              } @else {
                <span>{{ productoEditar() ? 'Guardar cambios' : 'Crear producto' }}</span>
              }
            </button>
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
  readonly busquedaRealizada = signal<boolean>(false);
  readonly errorBusqueda = signal<boolean>(false);
  readonly guardando = signal<boolean>(false);
  readonly ultimaConsulta = signal<string>('');
  readonly resultadosBusqueda = signal<ResultadoBusqueda[]>([]);
  readonly activoSeleccionado = signal<ResultadoBusqueda | null>(null);
  readonly bancoSeleccionado = signal<EntidadBanco | null>(null);

  readonly ejemplosBusqueda = ['MSCI World', 'S&P 500', 'Bitcoin', 'IE00B03HCZ61'];

  readonly entidadesCartera = computed<string[]>(() => {
    const prods = this.store.cartera()?.productos || [];
    const vistas = new Set<string>();
    const out: string[] = [];
    for (const p of prods) {
      const ent = (p.entidad || '').trim();
      if (ent && !vistas.has(ent.toLowerCase())) {
        vistas.add(ent.toLowerCase());
        out.push(ent);
      }
    }
    return out;
  });

  consultaBusqueda = '';
  formProd: Partial<ProductoCfg> = this.crearFormProductoVacio();

  constructor() {
    effect(() => {
      if (this.abierto()) {
        const p = this.productoEditar();
        this.resultadosBusqueda.set([]);
        this.activoSeleccionado.set(null);
        this.bancoSeleccionado.set(null);
        this.busquedaRealizada.set(false);
        this.errorBusqueda.set(false);
        this.ultimaConsulta.set('');
        this.consultaBusqueda = '';
        this.mostrarAvanzadoProd.set(false);
        this.guardando.set(false);
        if (p) {
          this.formProd = { ...p };
          // La cartera guarda la TER como fracción (0.0012); el formulario y el backend la manejan en %.
          this.formProd.ter = p.ter != null ? Number((p.ter * 100).toFixed(4)) : null;
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

  colorActual(): [string, string] {
    const idx = Math.max(0, Math.min(this.fmt.paleta.length - 1, (this.formProd.slot || 1) - 1));
    return this.fmt.paleta[idx];
  }

  etiquetaTipo(tipo: string): string {
    const mapa: Record<string, string> = {
      fondo: 'Fondo',
      etf: 'ETF',
      accion: 'Acción',
      cripto: 'Cripto',
      commodity: 'Materia prima',
    };
    return mapa[tipo] || tipo;
  }

  claseBadgeTipo(tipo: string): string {
    return `pm-type-${tipo || 'otro'}`;
  }

  private esTipoInversion(tipo: string): boolean {
    return ['fondo', 'etf', 'accion', 'cripto', 'commodity'].includes(tipo);
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
      if (this.formProd.fuente === 'manual') {
        this.formProd.fuente = 'morningstar';
      }
      if (!this.esTipoInversion(this.formProd.tipo || 'efectivo')) {
        this.formProd.tipo = 'fondo';
      }
      this.formProd.largoPlazo = true;
    }
  }

  buscarEjemplo(texto: string): void {
    this.consultaBusqueda = texto;
    void this.lanzarBusqueda();
  }

  limpiarBusqueda(): void {
    this.consultaBusqueda = '';
    this.resultadosBusqueda.set([]);
    this.busquedaRealizada.set(false);
    this.errorBusqueda.set(false);
  }

  cambiarActivoVinculado(): void {
    this.activoSeleccionado.set(null);
    this.busquedaRealizada.set(false);
    this.errorBusqueda.set(false);
  }

  async lanzarBusqueda(): Promise<void> {
    const q = this.consultaBusqueda.trim();
    if (q.length < 2) return;
    this.buscando.set(true);
    this.busquedaRealizada.set(true);
    this.errorBusqueda.set(false);
    this.ultimaConsulta.set(q);
    try {
      const res = await this.store.buscarProductos(q);
      this.resultadosBusqueda.set(res);
    } catch {
      this.resultadosBusqueda.set([]);
      this.errorBusqueda.set(true);
    } finally {
      this.buscando.set(false);
    }
  }

  seleccionarResultadoBusqueda(r: ResultadoBusqueda): void {
    this.activoSeleccionado.set(r);
    this.formProd.nombre = r.nombre;
    this.formProd.corto = this.generarNombreCorto(r.nombre, r.identificador);
    this.formProd.tipo = r.tipo;
    this.formProd.identificador = r.identificador;
    this.formProd.fuente = r.fuente;
    this.formProd.codigo = r.codigo;
    this.formProd.moneda = r.moneda || 'EUR';
    this.formProd.vivo = r.vivo || '';

    if (r.ficha) {
      if (r.ficha.ter !== undefined && r.ficha.ter !== null) {
        this.formProd.ter = Math.round(r.ficha.ter * 100) / 100;
      }
      if (r.ficha.riesgo !== undefined && r.ficha.riesgo !== null) {
        this.formProd.riesgo = r.ficha.riesgo;
      }
      if (r.ficha.gestora) {
        this.formProd.gestora = r.ficha.gestora;
      }
    }

    const claseInferida = r.ficha?.clase?.trim() || this.inferirClase(r.tipo, r.nombre);
    this.formProd.clase = claseInferida;
    this.formProd.largoPlazo = this.inferirLargoPlazo(r.tipo, claseInferida);
    this.resultadosBusqueda.set([]);
  }

  private generarNombreCorto(nombre: string, identificador?: string): string {
    const limpio = (nombre || '')
      .replace(/\([^)]*\)/g, ' ')
      .replace(
        /\b(UCITS|ETF|ACC|ACCUMULATING|DIST|DISTRIBUTING|EUR|USD|GBP|CLASS|INSTITUTIONAL|INVESTOR|INDEX|FUND)\b/gi,
        ' ',
      )
      .replace(/\s+/g, ' ')
      .trim();

    const base = limpio.length >= 4 ? limpio : (nombre || identificador || '').trim();
    if (base.length <= 24) return base;

    const palabras = base.split(' ');
    let out = '';
    for (const p of palabras) {
      const candidato = out ? `${out} ${p}` : p;
      if (candidato.length > 24) break;
      out = candidato;
    }
    return out || base.slice(0, 24).trim();
  }

  private inferirClase(tipo: string, nombre: string): string {
    if (tipo === 'cripto') return 'Criptomonedas';
    if (tipo === 'commodity') return 'Materias primas';
    if (tipo === 'efectivo') return 'Liquidez';
    if (tipo === 'inmueble') return 'Inmobiliario';
    if (tipo === 'deuda') return 'Deuda y préstamos';

    const n = (nombre || '').toLowerCase();
    if (/\b(monetario|money market|overnight|cash|xeon)\b/.test(n)) return 'Monetario';
    if (/\b(bono|bond|treasury|renta fija|aggregate|gilt|bund)\b/.test(n)) return 'Renta fija';
    if (/\b(world|global|acwi|all[- ]world|msci world)\b/.test(n)) return 'Renta variable global';
    if (/\b(s&p|sp\s*500|nasdaq|usa|north america)\b/.test(n)) return 'Renta variable EE. UU.';
    if (/\b(emerg|emerging)\b/.test(n)) return 'Renta variable emergente';
    if (/\b(europ|stoxx|ibex|dax|euro)\b/.test(n)) return 'Renta variable Europa';
    return 'Renta variable';
  }

  private inferirLargoPlazo(tipo: string, clase?: string): boolean {
    if (['efectivo', 'inmueble', 'deuda'].includes(tipo)) return false;
    const c = (clase || '').toLowerCase();
    if (c.includes('monetario') || c.includes('liquidez')) return false;
    return true;
  }

  cerrarSiAbierto(): void {
    if (this.abierto()) this.cerrar.emit();
  }

  async guardar(): Promise<void> {
    if (this.guardando() || !this.formProd.nombre?.trim()) return;
    this.guardando.set(true);
    try {
      const idExistente = this.productoEditar()?.id;
      const ok = await this.store.guardarProducto(this.formProd, idExistente);
      if (ok) {
        if (this.formProd.entidad?.trim()) {
          const sel = this.bancoSeleccionado();
          void this.store.registrarUsoBanco(
            sel && sel.nombre.trim().toLowerCase() === this.formProd.entidad.trim().toLowerCase()
              ? sel
              : { nombre: this.formProd.entidad.trim() },
          );
        }
        this.cerrar.emit();
      }
    } finally {
      this.guardando.set(false);
    }
  }
}
