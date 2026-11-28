import { ChangeDetectionStrategy, Component, computed, inject, model, output, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PortfolioStoreService } from '../../services/portfolio-store.service';
import { FormatService } from '../../services/format.service';
import { IconComponent } from '../icon/icon.component';
import { CapTooltipDirective } from '../../directives/tooltip.directive';
import { ProductoCalculado, ProductoCfg } from '../../models/portfolio.model';

export interface GrupoProductosDatos {
  tipo: 'grupo';
  grupoId: string;
  grupoNombre: string;
  entidad: string;
  productos: ProductoCfg[];
  valorTotal: number;
  aportadoTotal: number;
  plusvaliaTotal: number | null;
  rentabilidadTotal: number | null;
  numMovsTotal: number;
  color: string;
}

interface ItemProductoSueltoDatos {
  tipo: 'producto';
  producto: ProductoCfg;
}

type ElementoListaDatos = GrupoProductosDatos | ItemProductoSueltoDatos;

@Component({
  selector: 'cap-productos-subtab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet, FormsModule, IconComponent, CapTooltipDirective],
  template: `
    @if (store.cartera(); as c) {
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
            @if (c.productos.length > 1) {
              <button
                type="button"
                class="btn-fantasma btn-sm"
                (click)="store.repartirColores()"
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
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 3v9l6.5 4.5" />
                </svg>
                <span>Repartir colores</span>
              </button>
            }
            <button type="button" class="btn-primario" (click)="abrirProducto.emit(undefined)">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.2"
                stroke-linecap="round"
                aria-hidden="true"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
              <span>Añadir producto</span>
            </button>
          </div>
        </div>

        @if (c.productos.length) {
          <div class="datos-kpi-strip">
            <div class="datos-kpi">
              <span>Total activos</span>
              <strong class="mono">{{ productosStats().total }}</strong>
            </div>
            <div class="datos-kpi">
              <span>Cotización automática</span>
              <strong class="mono">{{ productosStats().cotizados }}</strong>
            </div>
            <div class="datos-kpi">
              <span>Saldos manuales</span>
              <strong class="mono">{{ productosStats().manuales }}</strong>
            </div>
            <div class="datos-kpi">
              <span>Valor neto actual</span>
              <strong class="mono valor-privado">{{
                fmt.eur(productosStats().valorTotal, 2)
              }}</strong>
            </div>
          </div>

          <div class="datos-toolbar">
            <div class="datos-search-wrap">
              <svg
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
                type="text"
                [ngModel]="filtroProdTexto()"
                (ngModelChange)="filtroProdTexto.set($event)"
                placeholder="Buscar por nombre, ISIN, banco o clase…"
                aria-label="Filtrar productos"
              />
              @if (filtroProdTexto()) {
                <button
                  type="button"
                  class="pm-search-clear"
                  (click)="filtroProdTexto.set('')"
                  aria-label="Limpiar filtro"
                >
                  <cap-icon name="close" [size]="13" />
                </button>
              }
            </div>

            <div class="seg-group" role="group" aria-label="Filtrar por tipo de seguimiento">
              <button
                type="button"
                class="seg-btn"
                [class.on]="filtroProdModo() === 'todos'"
                (click)="filtroProdModo.set('todos')"
              >
                Todos ({{ productosStats().total }})
              </button>
              <button
                type="button"
                class="seg-btn"
                [class.on]="filtroProdModo() === 'cotizado'"
                (click)="filtroProdModo.set('cotizado')"
              >
                Cotizados ({{ productosStats().cotizados }})
              </button>
              <button
                type="button"
                class="seg-btn"
                [class.on]="filtroProdModo() === 'manual'"
                (click)="filtroProdModo.set('manual')"
              >
                Manuales ({{ productosStats().manuales }})
              </button>
            </div>
          </div>
        }

        <div class="datos-prod-list">
          <ng-template #filaProdTpl let-p let-grupoTotal="grupoTotal" let-enGrupo="enGrupo">
            @let calc = infoCalculadaProducto(p.id);
            @let logo = logoEntidad(p.entidad);
            <article
              class="datos-prod-row"
              [class.datos-group-child]="enGrupo"
              [style.--prod-color]="colorProducto(p.id)"
            >
              <div class="datos-prod-main">
                <div class="datos-prod-title-line">
                  <strong class="datos-prod-name">{{ p.nombre }}</strong>
                  <span [class]="'pm-type-badge pm-type-' + (p.tipo || 'otro')">
                    {{ etiquetaTipo(p.tipo) }}
                  </span>
                  @if (p.pesoObjetivo !== null && p.pesoObjetivo !== undefined) {
                    <span class="tag pm-tag-isin mono">
                      Obj. {{ fmt.num(p.pesoObjetivo, 1) }}%
                    </span>
                  }
                  @if (enGrupo && grupoTotal > 0) {
                    <span class="tag pos mono">
                      Real {{ fmt.pct(valorActualProducto(p.id) / grupoTotal, 1) }}
                    </span>
                  }
                  @if (p.largoPlazo) {
                    <span class="tag tag-lp">LP</span>
                  }
                </div>

                <div class="datos-prod-meta">
                  @if (!enGrupo && p.entidad) {
                    <span class="datos-prod-bank">
                      @if (logo) {
                        <img
                          [src]="logo"
                          [alt]="p.entidad"
                          loading="lazy"
                          (error)="marcarLogoFallido(logo)"
                        />
                      }
                      <span>{{ p.entidad }}</span>
                    </span>
                  }
                  @if (p.identificador || p.codigo) {
                    <span class="tag mono">{{ p.identificador || p.codigo }}</span>
                  }
                  <span class="tag">{{ p.fuente }}</span>
                  @if (p.clase) {
                    <span class="tag">{{ p.clase }}</span>
                  }
                  @if (p.ter !== null && p.ter !== undefined && p.ter > 0) {
                    <span class="tag">TER {{ fmt.pct(p.ter, 2) }}</span>
                  }
                </div>
              </div>

              <div class="datos-prod-metrics">
                <div class="datos-prod-val-block">
                  <strong class="datos-prod-val mono valor-privado">
                    {{ fmt.eur(valorActualProducto(p.id), 2) }}
                  </strong>
                  @if (
                    esProductoCotizado(p) &&
                    calc?.plusvalia !== null &&
                    calc?.plusvalia !== undefined
                  ) {
                    <span
                      class="datos-prod-pnl mono valor-privado"
                      [class.pos]="(calc!.plusvalia ?? 0) >= 0"
                      [class.neg]="(calc!.plusvalia ?? 0) < 0"
                    >
                      {{ fmt.eurSigno(calc!.plusvalia, 0) }}
                      @if (calc!.rentabilidad !== null && calc!.rentabilidad !== undefined) {
                        ({{ fmt.pctSigno(calc!.rentabilidad, 1) }})
                      }
                    </span>
                  } @else {
                    <span class="datos-prod-subcount">
                      {{
                        esProductoCotizado(p)
                          ? numMovimientos(p.id) + ' operac.'
                          : numValoraciones(p.id) + ' saldos'
                      }}
                    </span>
                  }
                </div>

                <div class="datos-prod-actions">
                  @if (esProductoCotizado(p)) {
                    <button
                      type="button"
                      class="btn-tabla btn-tabla-primario"
                      (click)="abrirMovimientoParaProducto.emit(p.id)"
                      capTooltip="Anotar compra, venta o dividendo"
                    >
                      <cap-icon name="plus" [size]="13" />
                      <span>Compra</span>
                    </button>
                    <button
                      type="button"
                      class="btn-tabla"
                      (click)="verMovimientos.emit(p.id)"
                      capTooltip="Ver operaciones de este producto"
                    >
                      Movs ({{ numMovimientos(p.id) }})
                    </button>
                  } @else {
                    <button
                      type="button"
                      class="btn-tabla btn-tabla-primario"
                      (click)="abrirValoracionParaProducto.emit(p.id)"
                      capTooltip="Anotar saldo o valoración"
                    >
                      <cap-icon name="plus" [size]="13" />
                      <span>Saldo</span>
                    </button>
                    <button
                      type="button"
                      class="btn-tabla"
                      (click)="verSaldos.emit(p.id)"
                      capTooltip="Ver saldos de este producto"
                    >
                      Saldos ({{ numValoraciones(p.id) }})
                    </button>
                  }
                  <button
                    type="button"
                    class="btn-tabla"
                    (click)="abrirProducto.emit(p)"
                    capTooltip="Editar configuración del producto"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      aria-hidden="true"
                    >
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                    </svg>
                    <span>Editar</span>
                  </button>
                  <button
                    type="button"
                    class="btn-tabla btn-tabla-peligro"
                    (click)="confirmarBorrarProducto(p)"
                    capTooltip="Eliminar producto"
                    aria-label="Eliminar producto"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      aria-hidden="true"
                    >
                      <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
                    </svg>
                  </button>
                </div>
              </div>
            </article>
          </ng-template>

          @for (
            el of elementosProductos();
            track el.tipo === 'grupo' ? 'grp-' + el.grupoId : el.producto.id
          ) {
            @if (el.tipo === 'grupo') {
              <article class="datos-group-card" [style.--prod-color]="el.color">
                <div class="datos-group-head">
                  <button
                    type="button"
                    class="datos-group-toggle"
                    [attr.aria-expanded]="esGrupoExpandido(el.grupoId)"
                    (click)="alternarGrupoDatos(el.grupoId)"
                  >
                    <cap-icon
                      [name]="esGrupoExpandido(el.grupoId) ? 'chevron-down' : 'chevron-right'"
                      [size]="16"
                    />
                    <div class="datos-prod-main">
                      <div class="datos-prod-title-line">
                        <strong class="datos-prod-name">{{ el.grupoNombre }}</strong>
                        <span class="pm-type-badge pm-type-cartera">
                          Cartera · {{ el.productos.length }} productos
                        </span>
                      </div>
                      <div class="datos-prod-meta">
                        @if (el.entidad) {
                          @let logoGrp = logoEntidad(el.entidad);
                          <span class="datos-prod-bank">
                            @if (logoGrp) {
                              <img
                                [src]="logoGrp"
                                [alt]="el.entidad"
                                loading="lazy"
                                (error)="marcarLogoFallido(logoGrp)"
                              />
                            }
                            <span>{{ el.entidad }}</span>
                          </span>
                        }
                        <span class="tag">{{ el.numMovsTotal }} operac.</span>
                      </div>
                    </div>
                  </button>

                  <div class="datos-prod-metrics">
                    <div class="datos-prod-val-block">
                      <strong class="datos-prod-val mono valor-privado">
                        {{ fmt.eur(el.valorTotal, 2) }}
                      </strong>
                      @if (el.plusvaliaTotal !== null && el.aportadoTotal > 0) {
                        <span
                          class="datos-prod-pnl mono valor-privado"
                          [class.pos]="el.plusvaliaTotal >= 0"
                          [class.neg]="el.plusvaliaTotal < 0"
                        >
                          {{ fmt.eurSigno(el.plusvaliaTotal, 0) }}
                          @if (el.rentabilidadTotal !== null) {
                            ({{ fmt.pctSigno(el.rentabilidadTotal, 1) }})
                          }
                        </span>
                      } @else {
                        <span class="datos-prod-subcount">
                          {{ el.valorTotal > 0 ? 'Con posiciones' : 'Sin importes aún' }}
                        </span>
                      }
                    </div>

                    <div class="datos-prod-actions">
                      <button
                        type="button"
                        class="btn-tabla btn-tabla-primario"
                        (click)="
                          abrirPosicionesGrupo.emit({ id: el.grupoId, nombre: el.grupoNombre })
                        "
                        capTooltip="Indicar exactamente cuánto tienes en cada producto"
                      >
                        <cap-icon name="plus" [size]="13" />
                        <span>Poner importes</span>
                      </button>
                      <button
                        type="button"
                        class="btn-tabla"
                        (click)="irAImportarGrupo.emit(el)"
                        capTooltip="Importar extractos CSV/Excel de MyInvestor"
                      >
                        <span>Importar MyInvestor</span>
                      </button>
                      <button
                        type="button"
                        class="btn-tabla btn-tabla-peligro"
                        (click)="confirmarBorrarGrupo(el)"
                        capTooltip="Eliminar cartera completa"
                        aria-label="Eliminar cartera completa"
                      >
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2"
                          aria-hidden="true"
                        >
                          <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>

                @if (esGrupoExpandido(el.grupoId)) {
                  <div class="datos-group-body">
                    @for (p of el.productos; track p.id) {
                      <ng-container
                        [ngTemplateOutlet]="filaProdTpl"
                        [ngTemplateOutletContext]="{
                          $implicit: p,
                          grupoTotal: el.valorTotal,
                          enGrupo: true,
                        }"
                      />
                    }
                  </div>
                }
              </article>
            } @else {
              <ng-container
                [ngTemplateOutlet]="filaProdTpl"
                [ngTemplateOutletContext]="{
                  $implicit: el.producto,
                  grupoTotal: 0,
                  enGrupo: false,
                }"
              />
            }
          } @empty {
            <div class="datos-empty-box">
              @if (!c.productos.length) {
                <p>
                  Aún no has añadido ningún producto. Pulsa «Añadir producto» para configurar tu
                  primer activo, cuenta o inmueble.
                </p>
                <button
                  type="button"
                  class="btn-primario"
                  (click)="abrirProducto.emit(undefined)"
                >
                  <cap-icon name="plus" [size]="15" />
                  <span>Añadir mi primer producto</span>
                </button>
              } @else {
                <p>No hay productos que coincidan con el filtro aplicado.</p>
                <button
                  type="button"
                  class="btn-secundario btn-sm"
                  (click)="filtroProdTexto.set(''); filtroProdModo.set('todos')"
                >
                  Restablecer filtros
                </button>
              }
            </div>
          }
        </div>
      </section>
    }
  `,
})
export class ProductosSubtabComponent {
  readonly store = inject(PortfolioStoreService);
  readonly fmt = inject(FormatService);

  readonly gruposExpandidos = model<Set<string>>(new Set());

  readonly abrirProducto = output<ProductoCfg | undefined>();
  readonly abrirMovimientoParaProducto = output<string>();
  readonly abrirValoracionParaProducto = output<string>();
  readonly verMovimientos = output<string>();
  readonly verSaldos = output<string>();
  readonly abrirPosicionesGrupo = output<{ id: string; nombre: string }>();
  readonly irAImportarGrupo = output<GrupoProductosDatos>();

  readonly filtroProdTexto = signal<string>('');
  readonly filtroProdModo = signal<'todos' | 'cotizado' | 'manual'>('todos');
  readonly logosFallidos = signal<Set<string>>(new Set());

  private readonly mapaLogosBancos = computed<Map<string, string>>(() => {
    const m = new Map<string, string>();
    for (const b of [...this.store.bancosCatalogo(), ...this.store.bancosRecientes()]) {
      if (b.nombre && b.logo && !m.has(b.nombre.toLowerCase())) {
        m.set(b.nombre.toLowerCase(), b.logo);
      }
    }
    return m;
  });

  readonly productosStats = computed(() => {
    const prods = this.store.cartera()?.productos || [];
    let cotizados = 0;
    let manuales = 0;
    let valorTotal = 0;
    for (const p of prods) {
      if (this.esProductoCotizado(p)) cotizados++;
      else manuales++;
      valorTotal += this.valorActualProducto(p.id);
    }
    return { total: prods.length, cotizados, manuales, valorTotal };
  });

  readonly productosFiltrados = computed<ProductoCfg[]>(() => {
    const prods = this.store.cartera()?.productos || [];
    const modo = this.filtroProdModo();
    const q = this.filtroProdTexto().trim().toLowerCase();
    return prods.filter((p) => {
      const esCot = this.esProductoCotizado(p);
      if (modo === 'cotizado' && !esCot) return false;
      if (modo === 'manual' && esCot) return false;
      if (!q) return true;
      const texto = [
        p.nombre,
        p.corto,
        p.identificador,
        p.codigo,
        p.entidad,
        p.clase,
        p.gestora,
        p.grupoNombre,
        this.etiquetaTipo(p.tipo),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return texto.includes(q);
    });
  });

  readonly elementosProductos = computed<ElementoListaDatos[]>(() => {
    const filtrados = this.productosFiltrados();
    const grupos = new Map<string, ProductoCfg[]>();
    const orden: ({ tipo: 'grupo'; gid: string } | { tipo: 'producto'; p: ProductoCfg })[] = [];

    for (const p of filtrados) {
      const gid = (p.grupoId || '').trim().toLowerCase();
      if (!gid) {
        orden.push({ tipo: 'producto', p });
        continue;
      }
      if (!grupos.has(gid)) {
        grupos.set(gid, []);
        orden.push({ tipo: 'grupo', gid });
      }
      grupos.get(gid)!.push(p);
    }

    return orden.map((entry) => {
      if (entry.tipo === 'producto') {
        return { tipo: 'producto', producto: entry.p };
      }
      const miembros = grupos
        .get(entry.gid)!
        .slice()
        .sort((a, b) => (b.pesoObjetivo ?? -1) - (a.pesoObjetivo ?? -1));
      const primero = miembros[0];
      let valorTotal = 0;
      let aportadoTotal = 0;
      let plusvaliaSum = 0;
      let hayPlusvalia = false;
      let numMovsTotal = 0;

      for (const m of miembros) {
        const calc = this.infoCalculadaProducto(m.id);
        valorTotal += calc ? this.store.valorProductoConVivo(calc) : 0;
        if (calc?.aportado !== null && calc?.aportado !== undefined) {
          aportadoTotal += calc.aportado;
        }
        if (calc?.plusvalia !== null && calc?.plusvalia !== undefined) {
          plusvaliaSum += calc.plusvalia + this.store.ajusteVivoProducto(calc);
          hayPlusvalia = true;
        }
        numMovsTotal += this.numMovimientos(m.id);
      }

      const rentabilidadTotal =
        hayPlusvalia && aportadoTotal > 0 ? plusvaliaSum / aportadoTotal : null;

      return {
        tipo: 'grupo',
        grupoId: entry.gid,
        grupoNombre: primero.grupoNombre || entry.gid,
        entidad: primero.entidad || '',
        productos: miembros,
        valorTotal,
        aportadoTotal,
        plusvaliaTotal: hayPlusvalia ? plusvaliaSum : null,
        rentabilidadTotal,
        numMovsTotal,
        color: this.colorProducto(primero.id),
      };
    });
  });

  etiquetaTipo(clave: string): string {
    const mapa = this.store.tipos();
    return mapa[clave]?.[0] || clave;
  }

  esTipoInversion(tipo: string): boolean {
    return ['fondo', 'etf', 'accion', 'cripto', 'commodity', 'pension'].includes(tipo);
  }

  esProductoCotizado(p: ProductoCfg): boolean {
    return this.esTipoInversion(p.tipo) && p.fuente !== 'manual';
  }

  logoEntidad(entidad?: string): string | null {
    const clave = (entidad || '').trim().toLowerCase();
    if (!clave) return null;
    const url = this.mapaLogosBancos().get(clave);
    if (!url || this.logosFallidos().has(url)) return null;
    return url;
  }

  marcarLogoFallido(url: string): void {
    this.logosFallidos.update((prev) => {
      if (prev.has(url)) return prev;
      const next = new Set(prev);
      next.add(url);
      return next;
    });
  }

  infoCalculadaProducto(id: string): ProductoCalculado | undefined {
    return this.store.todosComponentes().find((c) => c.id === id);
  }

  valorActualProducto(id: string): number {
    const comp = this.infoCalculadaProducto(id);
    return comp ? comp.valor : 0;
  }

  numMovimientos(id: string): number {
    return (this.store.cartera()?.movimientos || []).filter((m) => m.producto === id).length;
  }

  numValoraciones(id: string): number {
    return (this.store.cartera()?.valoraciones || []).filter((v) => v.producto === id).length;
  }

  colorProducto(id: string): string {
    const color = this.infoCalculadaProducto(id)?.color;
    return Array.isArray(color) ? color[0] : this.fmt.colorDeSlot(1)[0];
  }

  esGrupoExpandido(grupoId: string): boolean {
    return this.gruposExpandidos().has(grupoId);
  }

  alternarGrupoDatos(grupoId: string): void {
    this.gruposExpandidos.update((prev) => {
      const next = new Set(prev);
      if (next.has(grupoId)) next.delete(grupoId);
      else next.add(grupoId);
      return next;
    });
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

  confirmarBorrarGrupo(grp: GrupoProductosDatos): void {
    this.store.pedirConfirmacion({
      titulo: 'Eliminar cartera agrupada',
      mensaje: `¿Seguro que quieres eliminar «${grp.grupoNombre}» junto con sus ${grp.productos.length} productos y todas sus operaciones? Se guardará una copia automática antes de borrar.`,
      textoConfirmar: 'Sí, eliminar cartera',
      peligro: true,
      accion: async () => {
        await this.store.borrarGrupoProductos(grp.grupoId, grp.grupoNombre);
      },
    });
  }
}
