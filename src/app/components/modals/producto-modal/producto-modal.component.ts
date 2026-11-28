import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PortfolioStoreService } from '../../../services/portfolio-store.service';
import { FormatService } from '../../../services/format.service';
import {
  EntidadBanco,
  ProductoCfg,
  ResultadoBusqueda,
} from '../../../models/portfolio.model';
import { BancoSelectorComponent } from './banco-selector.component';
import { IconComponent } from '../../icon/icon.component';
import {
  ProductoBuscadorComponent,
  generarNombreCortoProducto,
  inferirClaseProducto,
  inferirLargoPlazoProducto,
} from './producto-buscador.component';

@Component({
  selector: 'cap-producto-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, BancoSelectorComponent, IconComponent, ProductoBuscadorComponent],
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
              <cap-icon name="close" [size]="16" />
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
              <cap-producto-buscador
                [entidadActual]="formProd.entidad || ''"
                [bancoSeleccionado]="bancoSeleccionado()"
                [resetToken]="resetBuscadorToken()"
                [(activoSeleccionado)]="activoSeleccionado"
                (resultadoSeleccionado)="onResultadoSeleccionado($event)"
                (carteraImportada)="onCarteraImportada($event)"
              />
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
                      <option value="pension">Plan de pensiones</option>
                      <option value="bono">Bono / Renta fija / Depósito</option>
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

              <!-- SECCIÓN 3B: DATOS ESPECIALIZADOS SEGÚN TIPO -->
              @if (
                formProd.tipo === 'bono' ||
                formProd.tipo === 'efectivo' ||
                formProd.tipo === 'otro' ||
                formProd.tipo === 'pension' ||
                formProd.tipo === 'deuda' ||
                formProd.tipo === 'inmueble'
              ) {
                <section class="pm-section">
                  <h4 class="pm-section-title">
                    @switch (formProd.tipo) {
                      @case ('bono') { Renta fija, bonos y depósitos }
                      @case ('pension') { Fiscalidad del plan de pensiones }
                      @case ('deuda') { Condiciones del préstamo o hipoteca }
                      @case ('inmueble') { Rentabilidad del inmueble }
                      @default { Rendimiento e intereses (opcional) }
                    }
                  </h4>

                  @if (
                    formProd.tipo === 'bono' ||
                    formProd.tipo === 'efectivo' ||
                    formProd.tipo === 'otro'
                  ) {
                    <div class="form-grid-2">
                      <div class="campo">
                        <label for="pr-tae">TAE (%)</label>
                        <input
                          id="pr-tae"
                          type="number"
                          step="0.01"
                          min="0"
                          max="50"
                          [(ngModel)]="formProd.tae"
                          name="tae"
                          placeholder="Ej. 3,25"
                        />
                      </div>
                      <div class="campo">
                        <label for="pr-cupon">Cupón anual (%)</label>
                        <input
                          id="pr-cupon"
                          type="number"
                          step="0.01"
                          min="0"
                          max="50"
                          [(ngModel)]="formProd.cuponAnual"
                          name="cuponAnual"
                          placeholder="Ej. 3,10"
                        />
                      </div>
                      <div class="campo">
                        <label for="pr-frec-cupon">Frecuencia de pago</label>
                        <select
                          id="pr-frec-cupon"
                          class="input-select"
                          [ngModel]="formProd.frecuenciaCupon || ''"
                          (ngModelChange)="formProd.frecuenciaCupon = $event || null"
                          name="frecuenciaCupon"
                        >
                          <option value="">Sin especificar</option>
                          <option value="vencimiento">Al vencimiento</option>
                          <option value="mensual">Mensual</option>
                          <option value="trimestral">Trimestral</option>
                          <option value="semestral">Semestral</option>
                          <option value="anual">Anual</option>
                        </select>
                      </div>
                      <div class="campo">
                        <label for="pr-femi">Fecha de emisión</label>
                        <input
                          id="pr-femi"
                          type="date"
                          [(ngModel)]="formProd.fechaEmision"
                          name="fechaEmision"
                        />
                      </div>
                      <div class="campo campo-full">
                        <label for="pr-fvto">Fecha de vencimiento</label>
                        <input
                          id="pr-fvto"
                          type="date"
                          [(ngModel)]="formProd.fechaVencimiento"
                          name="fechaVencimiento"
                        />
                      </div>
                    </div>
                  }

                  @if (formProd.tipo === 'pension') {
                    <div class="form-grid-2">
                      <div class="campo">
                        <label for="pr-lim-anual">Límite legal anual (€)</label>
                        <input
                          id="pr-lim-anual"
                          type="number"
                          step="50"
                          min="0"
                          max="10000"
                          [(ngModel)]="formProd.limiteAnual"
                          name="limiteAnual"
                          placeholder="1500"
                        />
                        <div class="pm-presets-row">
                          <button
                            type="button"
                            class="mv-inline-chip"
                            (click)="formProd.limiteAnual = 1500"
                          >
                            1.500 € Individual
                          </button>
                          <button
                            type="button"
                            class="mv-inline-chip"
                            (click)="formProd.limiteAnual = 5750"
                          >
                            5.750 € Autónomo
                          </button>
                          <button
                            type="button"
                            class="mv-inline-chip"
                            (click)="formProd.limiteAnual = 8500"
                          >
                            8.500 € Empleo
                          </button>
                        </div>
                      </div>
                      <div class="campo">
                        <label for="pr-marginal">Tipo marginal IRPF (%)</label>
                        <input
                          id="pr-marginal"
                          type="number"
                          step="0.5"
                          min="0"
                          max="54"
                          [(ngModel)]="formProd.tipoMarginalIrpf"
                          name="tipoMarginalIrpf"
                          placeholder="Ej. 37"
                        />
                      </div>
                    </div>
                  }

                  @if (formProd.tipo === 'deuda') {
                    <div class="form-grid-2">
                      <div class="campo">
                        <label for="pr-ti">Tipo de interés (%)</label>
                        <input
                          id="pr-ti"
                          type="number"
                          step="0.01"
                          min="0"
                          max="30"
                          [(ngModel)]="formProd.tipoInteres"
                          name="tipoInteres"
                          placeholder="Ej. 2,85"
                        />
                      </div>
                      <div class="campo">
                        <label for="pr-ttasa">Modalidad de tipo</label>
                        <select
                          id="pr-ttasa"
                          class="input-select"
                          [ngModel]="formProd.tipoTasa || ''"
                          (ngModelChange)="formProd.tipoTasa = $event || null"
                          name="tipoTasa"
                        >
                          <option value="">Sin especificar</option>
                          <option value="fijo">Fijo</option>
                          <option value="variable">Variable</option>
                        </select>
                      </div>
                      <div class="campo">
                        <label for="pr-cuota">Cuota mensual (€)</label>
                        <input
                          id="pr-cuota"
                          type="number"
                          step="1"
                          min="0"
                          [(ngModel)]="formProd.cuotaMensual"
                          name="cuotaMensual"
                          placeholder="Ej. 850"
                        />
                      </div>
                      <div class="campo">
                        <label for="pr-fvto-deuda">Fecha de vencimiento</label>
                        <input
                          id="pr-fvto-deuda"
                          type="date"
                          [(ngModel)]="formProd.fechaVencimiento"
                          name="fechaVencimiento"
                        />
                      </div>
                      <div class="campo campo-full">
                        <label for="pr-inmueble-id">Inmueble vinculado (si es hipoteca)</label>
                        <select
                          id="pr-inmueble-id"
                          class="input-select"
                          [ngModel]="formProd.inmuebleId || ''"
                          (ngModelChange)="formProd.inmuebleId = $event || null"
                          name="inmuebleId"
                        >
                          <option value="">Sin inmueble vinculado</option>
                          @for (inm of inmueblesDisponibles(); track inm.id) {
                            <option [value]="inm.id">{{ inm.nombre }}</option>
                          }
                        </select>
                      </div>
                    </div>
                  }

                  @if (formProd.tipo === 'inmueble') {
                    <div class="form-grid-2">
                      <div class="campo">
                        <label for="pr-alquiler">Alquiler mensual bruto (€/mes)</label>
                        <input
                          id="pr-alquiler"
                          type="number"
                          step="10"
                          min="0"
                          [(ngModel)]="formProd.alquilerMensual"
                          name="alquilerMensual"
                          placeholder="Ej. 950"
                        />
                      </div>
                      <div class="campo">
                        <label for="pr-gastos-anuales">Gastos anuales (€/año)</label>
                        <input
                          id="pr-gastos-anuales"
                          type="number"
                          step="10"
                          min="0"
                          [(ngModel)]="formProd.gastosAnuales"
                          name="gastosAnuales"
                          placeholder="IBI, comunidad, seguro..."
                        />
                      </div>
                    </div>
                  }
                </section>
              }

              <!-- SECCIÓN 4: CONFIGURACIÓN TÉCNICA -->
              <div class="pm-adv-wrap">
                <button
                  type="button"
                  class="pm-adv-toggle"
                  [attr.aria-expanded]="mostrarAvanzadoProd()"
                  (click)="mostrarAvanzadoProd.set(!mostrarAvanzadoProd())"
                >
                  <span>Configuración técnica de fuente de precios</span>
                  <span class="pm-adv-state">
                    <cap-icon
                      [name]="mostrarAvanzadoProd() ? 'chevron-down' : 'chevron-right'"
                      [size]="14"
                    />
                    <span>{{ mostrarAvanzadoProd() ? 'Ocultar' : 'Mostrar' }}</span>
                  </span>
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
            @if (!productoEditar()) {
              <button
                type="button"
                class="btn-secundario"
                [disabled]="guardando() || !formProd.nombre?.trim()"
                (click)="guardarYAbrir()"
              >
                {{
                  modoModalProd() === 'cotizado'
                    ? 'Crear y anotar compra'
                    : 'Crear y anotar saldo'
                }}
              </button>
            }
            <button
              type="submit"
              form="form-producto"
              class="btn-primario"
              [disabled]="guardando() || !formProd.nombre?.trim()"
            >
              @if (guardando()) {
                <cap-icon name="spinner" [size]="15" [spin]="true" />
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
  private readonly cdr = inject(ChangeDetectorRef);

  readonly abierto = input.required<boolean>();
  readonly productoEditar = input<ProductoCfg | null>(null);
  readonly cerrar = output<void>();
  readonly creadoYAbrir = output<{ id: string; accion: 'movimiento' | 'saldo' }>();
  readonly carteraCreada = output<{ grupoId: string; grupoNombre: string }>();

  readonly modoModalProd = signal<'cotizado' | 'manual'>('cotizado');
  readonly mostrarAvanzadoProd = signal<boolean>(false);
  readonly guardando = signal<boolean>(false);
  readonly activoSeleccionado = signal<ResultadoBusqueda | null>(null);
  readonly bancoSeleccionado = signal<EntidadBanco | null>(null);
  readonly resetBuscadorToken = signal<number>(0);

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

  readonly inmueblesDisponibles = computed<ProductoCfg[]>(() => {
    const editId = this.productoEditar()?.id;
    return (this.store.cartera()?.productos || []).filter(
      (p) => p.tipo === 'inmueble' && p.id !== editId,
    );
  });

  formProd: Partial<ProductoCfg> = this.crearFormProductoVacio();

  constructor() {
    effect(() => {
      if (this.abierto()) {
        const p = this.productoEditar();
        this.activoSeleccionado.set(null);
        this.bancoSeleccionado.set(null);
        this.mostrarAvanzadoProd.set(false);
        this.guardando.set(false);
        this.resetBuscadorToken.update((n) => n + 1);
        if (p) {
          this.formProd = { ...p };
          // La cartera guarda la TER como fracción (0.0012); el formulario y el backend la manejan en %.
          this.formProd.ter = p.ter != null ? Number((p.ter * 100).toFixed(4)) : null;
          this.modoModalProd.set(
            p.fuente === 'manual' || (!this.esTipoInversion(p.tipo) && p.tipo !== 'bono')
              ? 'manual'
              : 'cotizado',
          );
        } else {
          this.formProd = this.crearFormProductoVacio();
          this.modoModalProd.set('cotizado');
        }
        this.cdr.markForCheck();
      }
    });
  }

  colorActual(): [string, string] {
    const idx = Math.max(0, Math.min(this.fmt.paleta.length - 1, (this.formProd.slot || 1) - 1));
    return this.fmt.paleta[idx];
  }

  private esTipoInversion(tipo: string): boolean {
    return ['fondo', 'etf', 'pension', 'accion', 'cripto', 'commodity'].includes(tipo);
  }

  private crearFormProductoVacio(): Partial<ProductoCfg> {
    const usados = new Set((this.store.cartera()?.productos || []).map((p) => p.slot ?? 0));
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
      tae: null,
      cuponAnual: null,
      frecuenciaCupon: null,
      fechaEmision: '',
      fechaVencimiento: '',
      limiteAnual: null,
      tipoMarginalIrpf: null,
      tipoInteres: null,
      tipoTasa: null,
      cuotaMensual: null,
      inmuebleId: '',
      alquilerMensual: null,
      gastosAnuales: null,
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

  onResultadoSeleccionado(r: ResultadoBusqueda): void {
    this.formProd.nombre = r.nombre;
    this.formProd.corto = generarNombreCortoProducto(r.nombre, r.identificador);
    this.formProd.tipo = r.tipo;
    this.formProd.identificador = r.isin || r.identificador;
    this.formProd.fuente = r.fuente;
    this.formProd.codigo = r.codigo;
    this.formProd.moneda = r.moneda || 'EUR';
    this.formProd.vivo = r.vivo || '';
    if (r.entidadSugerida && !(this.formProd.entidad || '').trim()) {
      this.formProd.entidad = r.entidadSugerida;
    }

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

    const claseInferida = r.ficha?.clase?.trim() || inferirClaseProducto(r.tipo, r.nombre);
    this.formProd.clase = claseInferida;
    this.formProd.largoPlazo = inferirLargoPlazoProducto(r.tipo, claseInferida);
    this.cdr.markForCheck();
  }

  onCarteraImportada(ev: { grupoId: string; grupoNombre: string }): void {
    this.cerrar.emit();
    this.carteraCreada.emit(ev);
  }

  cerrarSiAbierto(): void {
    if (this.abierto()) this.cerrar.emit();
  }

  async guardar(): Promise<void> {
    await this.ejecutarGuardado(false);
  }

  async guardarYAbrir(): Promise<void> {
    await this.ejecutarGuardado(true);
  }

  private async ejecutarGuardado(abrirDespues: boolean): Promise<void> {
    if (this.guardando() || !this.formProd.nombre?.trim()) return;
    this.guardando.set(true);
    try {
      const idExistente = this.productoEditar()?.id;
      const item = await this.store.guardarProducto(this.formProd, idExistente);
      if (item) {
        if (this.formProd.entidad?.trim()) {
          const sel = this.bancoSeleccionado();
          void this.store.registrarUsoBanco(
            sel && sel.nombre.trim().toLowerCase() === this.formProd.entidad.trim().toLowerCase()
              ? sel
              : { nombre: this.formProd.entidad.trim() },
          );
        }
        this.cerrar.emit();
        if (abrirDespues && item.id) {
          const accion =
            this.modoModalProd() === 'cotizado' && this.formProd.fuente !== 'manual'
              ? 'movimiento'
              : 'saldo';
          this.creadoYAbrir.emit({ id: item.id, accion });
        }
      }
    } finally {
      this.guardando.set(false);
    }
  }
}
