import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PortfolioStoreService } from '../../../services/portfolio-store.service';
import { FormatService } from '../../../services/format.service';
import { LineaLoteCartera, ProductoCfg } from '../../../models/portfolio.model';
import { IconComponent } from '../../icon/icon.component';

interface FilaPosicionCartera {
  prodId: string;
  nombre: string;
  identificador: string;
  moneda: string;
  pesoObjetivo: number | null;
  valorActual: number;
  participacionesActuales: number | null;
  importe: number | null;
  unidades: number | null;
}

@Component({
  selector: 'cap-cartera-posiciones-modal',
  imports: [FormsModule, IconComponent],
  host: {
    '(document:keydown.escape)': 'cerrarSiAbierto()',
  },
  template: `
    @if (abierto()) {
      <div class="modal-backdrop" (click)="cerrar.emit()">
        <div
          class="modal-card modal-lg pm-modal cp-modal"
          (click)="$event.stopPropagation()"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-cp-titulo"
        >
          <div class="modal-header pm-header">
            <div class="modal-title-group">
              <span class="modal-kicker">Posiciones por producto de la cartera</span>
              <h3 id="modal-cp-titulo">{{ grupoNombre() || 'Asignar importes de la cartera' }}</h3>
            </div>
            <button type="button" class="btn-cerrar" (click)="cerrar.emit()" aria-label="Cerrar">
              <cap-icon name="close" [size]="16" />
            </button>
          </div>

          <div class="pm-body">
            @if (!filas().length) {
              <div class="pm-search-empty">
                No hay productos vinculados a esta cartera todavía.
              </div>
            } @else {
              <section class="pm-section cp-toolbar">
                <div class="form-grid-2">
                  <div class="campo">
                    <div class="mv-date-row">
                      <label for="cp-fecha">Fecha de las posiciones / compras</label>
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
                      id="cp-fecha"
                      type="date"
                      [ngModel]="fecha()"
                      (ngModelChange)="fecha.set($event)"
                      name="fecha"
                      required
                    />
                  </div>

                  <div class="campo">
                    <label for="cp-total">Repartir un importe total según pesos (€, opcional)</label>
                    <div class="cp-dist-box">
                      <input
                        id="cp-total"
                        type="number"
                        step="0.01"
                        min="0"
                        [ngModel]="importeGlobal()"
                        (ngModelChange)="importeGlobal.set($event)"
                        name="importeGlobal"
                        placeholder="Ej. 5000"
                      />
                      <button
                        type="button"
                        class="btn-secundario btn-sm"
                        [disabled]="!puedeRepartirPorPesos()"
                        (click)="aplicarPesosOficiales()"
                      >
                        <cap-icon name="sparkle" [size]="14" />
                        <span>Aplicar pesos</span>
                      </button>
                    </div>
                  </div>
                </div>

                <label class="check-row" style="margin-top: 0.75rem">
                  <input
                    type="checkbox"
                    [ngModel]="reemplazarPrevios()"
                    (ngModelChange)="reemplazarPrevios.set($event)"
                  />
                  <span>
                    Sustituir operaciones anteriores de los fondos que rellenes (útil si estás
                    ajustando el importe exacto actual)
                  </span>
                </label>
              </section>

              <div class="cp-rows">
                @for (f of filas(); track f.prodId) {
                  <div class="cp-row">
                    <div class="cp-row-main">
                      <div class="cp-row-title">
                        <strong>{{ f.nombre }}</strong>
                        @if (f.pesoObjetivo !== null && f.pesoObjetivo !== undefined) {
                          <span class="tag pm-tag-isin mono">
                            Peso {{ fmt.num(f.pesoObjetivo, 1) }}%
                          </span>
                        }
                      </div>
                      <div class="prod-tags">
                        @if (f.identificador) {
                          <span class="tag mono">{{ f.identificador }}</span>
                        }
                        <span class="tag">{{ f.moneda }}</span>
                        @if (f.valorActual > 0) {
                          <span class="tag pos valor-privado">
                            Actual: {{ fmt.eur(f.valorActual, 2) }}
                            @if (f.participacionesActuales) {
                              ({{ fmt.num(f.participacionesActuales, 4) }} part.)
                            }
                          </span>
                        }
                      </div>
                    </div>

                    <div class="cp-row-inputs">
                      <div class="campo">
                        <label [for]="'cp-imp-' + f.prodId">Importe (€)</label>
                        <input
                          [id]="'cp-imp-' + f.prodId"
                          type="number"
                          step="0.01"
                          min="0"
                          [ngModel]="f.importe"
                          (ngModelChange)="actualizarImporte(f.prodId, $event)"
                          placeholder="0,00"
                        />
                      </div>
                      <div class="campo">
                        <label [for]="'cp-uni-' + f.prodId">Participaciones (opc.)</label>
                        <input
                          [id]="'cp-uni-' + f.prodId"
                          type="number"
                          step="any"
                          min="0"
                          [ngModel]="f.unidades"
                          (ngModelChange)="actualizarUnidades(f.prodId, $event)"
                          placeholder="Auto según VL"
                        />
                      </div>
                    </div>
                  </div>
                }
              </div>
            }
          </div>

          @if (filas().length) {
            <div class="cp-footer-summary">
              <span>
                Anotarás datos en <strong>{{ resumenCaptura().count }}</strong> de
                {{ filas().length }} productos
              </span>
              <strong class="mono valor-privado">
                Total introducido: {{ fmt.eur(resumenCaptura().totalEur, 2) }}
              </strong>
            </div>
          }

          <div class="modal-footer pm-footer cp-footer">
            <button
              type="button"
              class="btn-secundario btn-sm"
              (click)="saltarAImportar()"
              [disabled]="guardando()"
            >
              <span>Importar CSV desde MyInvestor</span>
            </button>
            <div class="cp-footer-right">
              <button type="button" class="btn-fantasma" (click)="cerrar.emit()">Más tarde</button>
              <button
                type="button"
                class="btn-primario"
                [disabled]="guardando() || !resumenCaptura().count"
                (click)="guardar()"
              >
                @if (guardando()) {
                  <cap-icon name="spinner" [size]="15" [spin]="true" />
                  <span>Calculando y guardando…</span>
                } @else {
                  <cap-icon name="check" [size]="15" />
                  <span>Guardar importes</span>
                }
              </button>
            </div>
          </div>
        </div>
      </div>
    }
  `,
})
export class CarteraPosicionesModalComponent {
  readonly store = inject(PortfolioStoreService);
  readonly fmt = inject(FormatService);

  readonly abierto = input.required<boolean>();
  readonly grupoId = input<string | null>(null);
  readonly grupoNombre = input<string>('');
  readonly cerrar = output<void>();
  readonly irAImportar = output<string>();

  readonly fecha = signal<string>(this.hoyIso());
  readonly importeGlobal = signal<number | null>(null);
  readonly reemplazarPrevios = signal<boolean>(false);
  readonly guardando = signal<boolean>(false);
  readonly filas = signal<FilaPosicionCartera[]>([]);

  readonly puedeRepartirPorPesos = computed<boolean>(() => {
    const total = Number(this.importeGlobal() || 0);
    if (!Number.isFinite(total) || total <= 0) return false;
    const sumaPesos = this.filas().reduce((s, f) => s + (f.pesoObjetivo || 0), 0);
    return sumaPesos > 0;
  });

  readonly resumenCaptura = computed(() => {
    let count = 0;
    let totalEur = 0;
    for (const f of this.filas()) {
      const imp = Number(f.importe || 0);
      const uni = Number(f.unidades || 0);
      if (imp > 0 || uni > 0) {
        count++;
        if (imp > 0) totalEur += imp;
      }
    }
    return { count, totalEur };
  });

  constructor() {
    effect(() => {
      if (this.abierto()) {
        const gid = (this.grupoId() || '').trim().toLowerCase();
        const prods: ProductoCfg[] = (this.store.cartera()?.productos || [])
          .filter((p) => (p.grupoId || '').trim().toLowerCase() === gid)
          .slice()
          .sort((a, b) => (b.pesoObjetivo ?? -1) - (a.pesoObjetivo ?? -1));
        const calcMap = new Map(this.store.todosComponentes().map((c) => [c.id, c]));

        this.filas.set(
          prods.map((p) => {
            const calc = calcMap.get(p.id);
            return {
              prodId: p.id,
              nombre: p.nombre,
              identificador: p.identificador || p.codigo || '',
              moneda: p.moneda || 'EUR',
              pesoObjetivo: p.pesoObjetivo ?? null,
              valorActual: calc ? this.store.valorProductoConVivo(calc) : 0,
              participacionesActuales: calc?.participaciones ?? calc?.titulos ?? null,
              importe: null,
              unidades: null,
            };
          }),
        );
        this.fecha.set(this.hoyIso());
        this.importeGlobal.set(null);
        this.reemplazarPrevios.set(false);
        this.guardando.set(false);
      }
    });
  }

  private hoyIso(): string {
    return new Date().toISOString().slice(0, 10);
  }

  ponerFechaDias(delta: number): void {
    const d = new Date();
    d.setDate(d.getDate() + delta);
    this.fecha.set(d.toISOString().slice(0, 10));
  }

  cerrarSiAbierto(): void {
    if (this.abierto()) this.cerrar.emit();
  }

  actualizarImporte(prodId: string, val: unknown): void {
    const num = val === '' || val === null || val === undefined ? null : Number(val);
    this.filas.update((list) =>
      list.map((f) =>
        f.prodId === prodId ? { ...f, importe: num !== null && Number.isFinite(num) ? num : null } : f,
      ),
    );
  }

  actualizarUnidades(prodId: string, val: unknown): void {
    const num = val === '' || val === null || val === undefined ? null : Number(val);
    this.filas.update((list) =>
      list.map((f) =>
        f.prodId === prodId ? { ...f, unidades: num !== null && Number.isFinite(num) ? num : null } : f,
      ),
    );
  }

  aplicarPesosOficiales(): void {
    const total = Number(this.importeGlobal() || 0);
    if (!Number.isFinite(total) || total <= 0) return;
    const lista = this.filas();
    const sumaPesos = lista.reduce((s, f) => s + Math.max(0, f.pesoObjetivo || 0), 0);
    if (sumaPesos <= 0) return;

    let asignado = 0;
    let idxMayor = -1;
    let pesoMayor = -1;
    const nuevas = lista.map((f, idx) => {
      const peso = Math.max(0, f.pesoObjetivo || 0);
      if (peso > pesoMayor) {
        pesoMayor = peso;
        idxMayor = idx;
      }
      const parte = peso > 0 ? Math.round(((total * peso) / sumaPesos) * 100) / 100 : null;
      if (parte) asignado += parte;
      return { ...f, importe: parte };
    });

    if (idxMayor >= 0) {
      const diff = Math.round((total - asignado) * 100) / 100;
      nuevas[idxMayor] = {
        ...nuevas[idxMayor],
        importe: Math.round(((nuevas[idxMayor].importe || 0) + diff) * 100) / 100,
      };
    }
    this.filas.set(nuevas);
  }

  saltarAImportar(): void {
    const gid = this.grupoId() || '';
    this.cerrar.emit();
    this.irAImportar.emit(gid);
  }

  async guardar(): Promise<void> {
    if (this.guardando()) return;
    const lineas: LineaLoteCartera[] = [];
    for (const f of this.filas()) {
      const imp = f.importe && f.importe > 0 ? f.importe : null;
      const uni = f.unidades && f.unidades > 0 ? f.unidades : null;
      if (imp || uni) {
        lineas.push({ producto: f.prodId, importe: imp, unidades: uni });
      }
    }
    if (!lineas.length) return;

    this.guardando.set(true);
    try {
      const resp = await this.store.guardarImportesCartera({
        fecha: this.fecha(),
        nota: this.grupoNombre() || 'Cartera agrupada',
        reemplazarPrevios: this.reemplazarPrevios(),
        lineas,
      });
      if (resp) {
        this.cerrar.emit();
      }
    } finally {
      this.guardando.set(false);
    }
  }
}
