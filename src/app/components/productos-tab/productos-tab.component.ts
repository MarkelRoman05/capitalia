import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PortfolioStoreService } from '../../services/portfolio-store.service';
import { FormatService } from '../../services/format.service';
import { ChartRenderFn, ChartService } from '../../services/chart.service';
import { SvgChartComponent } from '../svg-chart/svg-chart.component';
import { IconComponent } from '../icon/icon.component';
import { ProductoCalculado } from '../../models/portfolio.model';

interface SelectorGrupoProductos {
  esGrupo: true;
  grupoId: string;
  nombre: string;
  entidad?: string;
  color: string;
  colorPar: [string, string];
  miembros: ProductoCalculado[];
  valor: number;
  aportado: number | null;
  plusvalia: number | null;
  rentabilidad: number | null;
}

interface SelectorItemProducto {
  esGrupo: false;
  comp: ProductoCalculado;
}

type SelectorElementoProductos = SelectorGrupoProductos | SelectorItemProducto;

@Component({
  selector: 'cap-productos-tab',
  imports: [SvgChartComponent, IconComponent, RouterLink],
  template: `
    @if (store.datos(); as d) {
      @if (!d.productos || !d.productos.length) {
        <section class="panel-card vacio-bloque">
          <h2>No hay fondos, ETFs ni acciones con seguimiento de compras</h2>
          <p>Ve a la pestaña «Mis datos» para añadir tus primeros productos de inversión.</p>
          <a routerLink="/datos" class="btn-primario" (click)="store.tabActiva.set('datos')">
            Ir a Mis datos
          </a>
        </section>
      } @else {
        <!-- SELECTOR DE PRODUCTO Y CARTERAS AGRUPADAS -->
        <section class="barra-filtro" aria-label="Seleccionar producto o cartera de inversión">
          @for (el of elementosSelector(); track el.esGrupo ? 'grp-' + el.grupoId : el.comp.id) {
            @if (el.esGrupo) {
              <button
                type="button"
                class="pill"
                [class.on]="grupoActivo()?.grupoId === el.grupoId && !productoActivo()"
                (click)="seleccionarGrupo(el.grupoId)"
              >
                <span class="dot" [style.background]="el.color"></span>
                <span>{{ el.nombre }} ({{ el.miembros.length }})</span>
                <span class="pill-val valor-privado">{{ fmt.eurCompacto(el.valor) }}</span>
              </button>
            } @else {
              <button
                type="button"
                class="pill"
                [class.on]="!grupoActivo() && productoActivo()?.id === el.comp.id"
                (click)="seleccionarProducto(el.comp.id)"
              >
                <span class="dot" [style.background]="colorPrimario(el.comp)"></span>
                <span>{{ el.comp.corto || el.comp.nombre }}</span>
                <span class="pill-val valor-privado">
                  {{ fmt.eurCompacto(store.valorProductoConVivo(el.comp)) }}
                </span>
              </button>
            }
          }
        </section>

        @if (grupoActivo(); as grp) {
          <nav class="productos-subbar" aria-label="Productos incluidos en la cartera">
            <span class="productos-subbar-label">{{ grp.nombre }}:</span>
            <button
              type="button"
              class="pill"
              [class.on]="!productoActivo()"
              (click)="seleccionarGrupo(grp.grupoId)"
            >
              <span>Resumen cartera</span>
            </button>
            @for (m of grp.miembros; track m.id) {
              <button
                type="button"
                class="pill"
                [class.on]="productoActivo()?.id === m.id"
                (click)="seleccionarProducto(m.id)"
              >
                <span class="dot" [style.background]="colorPrimario(m)"></span>
                <span>{{ m.corto || m.nombre }}</span>
                <span class="pill-val valor-privado">
                  {{ fmt.eurCompacto(store.valorProductoConVivo(m)) }}
                </span>
              </button>
            }
          </nav>
        }

        @if (!productoActivo() && grupoActivo(); as grp) {
          <!-- VISTA CONSOLIDADA DE CARTERA AGRUPADA -->
          <section class="panel-card bloque-seccion ficha-producto" [style.--prod-color]="grp.color">
            <div class="ficha-cab">
              <div>
                <div class="prod-tags">
                  <span class="pm-type-badge pm-type-cartera">Cartera indexada agrupada</span>
                  <span class="tag">{{ grp.miembros.length }} productos incluidos</span>
                  @if (grp.entidad) {
                    <span class="tag">{{ grp.entidad }}</span>
                  }
                </div>
                <h2 class="ficha-titulo">{{ grp.nombre }}</h2>
              </div>

              <div class="ficha-valor-der">
                <span class="kpi-label">Valor total de la cartera</span>
                <div class="ficha-cifra valor-privado">{{ fmt.eur(grp.valor, 2) }}</div>
                <div class="hero-badges">
                  @if (grp.plusvalia !== null && grp.plusvalia !== undefined) {
                    <span
                      class="chip-rent"
                      [class.pos]="fmt.claseSigno(grp.plusvalia) === 'pos'"
                      [class.neg]="fmt.claseSigno(grp.plusvalia) === 'neg'"
                    >
                      {{ fmt.eurSigno(grp.plusvalia, 2) }}
                      @if (grp.rentabilidad !== null && grp.rentabilidad !== undefined) {
                        ({{ fmt.pctSigno(grp.rentabilidad, 2) }})
                      }
                    </span>
                  }
                </div>
              </div>
            </div>

            <div class="ficha-kpis-grid">
              <div class="ficha-kpi">
                <span>Capital invertido total</span>
                <strong class="mono valor-privado">
                  {{ grp.aportado !== null ? fmt.eur(grp.aportado, 2) : '—' }}
                </strong>
              </div>
              <div class="ficha-kpi">
                <span>Fondos activos</span>
                <strong class="mono">{{ grp.miembros.length }}</strong>
              </div>
              <div class="ficha-kpi">
                <span>Peso sobre patrimonio</span>
                <strong class="mono">
                  {{ d.total.patrimonio > 0 ? fmt.pct(grp.valor / d.total.patrimonio, 2) : '—' }}
                </strong>
              </div>
            </div>
          </section>

          <section class="panel-card bloque-seccion">
            <div class="card-header">
              <div>
                <h3 class="card-title">Evolución conjunta de {{ grp.nombre }}</h3>
                <p class="card-sub">
                  Suma diaria del valor de todos los fondos de la cartera frente al capital invertido.
                </p>
              </div>
            </div>
            <cap-svg-chart [renderFn]="renderGraficoGrupoFn()" [minHeight]="330" />
          </section>

          <section class="panel-card bloque-seccion">
            <div class="card-header">
              <div>
                <h3 class="card-title">Productos incluidos y distribución real frente a objetivo</h3>
                <p class="card-sub">
                  Pulsa en cualquiera para inspeccionar sus participaciones, cotización y compras.
                </p>
              </div>
              <a routerLink="/datos" class="btn-secundario btn-sm" (click)="irAPonerImportes(grp.grupoId)">
                Gestionar importes en Mis datos
              </a>
            </div>

            <div class="tabla-scroll">
              <table class="tabla-datos">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th class="num">Peso objetivo</th>
                    <th class="num">Peso real</th>
                    <th class="num">Participaciones</th>
                    <th class="num">Valor actual</th>
                    <th class="num">Plusvalía</th>
                    <th class="num">Ficha</th>
                  </tr>
                </thead>
                <tbody>
                  @for (m of grp.miembros; track m.id) {
                    @let valM = store.valorProductoConVivo(m);
                    @let pesoRealM = grp.valor > 0 ? valM / grp.valor : 0;
                    <tr>
                      <td>
                        <div class="celda-prod-nombre">
                          <span class="dot" [style.background]="colorPrimario(m)"></span>
                          <span>{{ m.nombre }}</span>
                        </div>
                      </td>
                      <td class="num mono">
                        {{ m.pesoObjetivo !== null && m.pesoObjetivo !== undefined ? fmt.num(m.pesoObjetivo, 1) + '%' : '—' }}
                      </td>
                      <td class="num mono">{{ grp.valor > 0 ? fmt.pct(pesoRealM, 1) : '—' }}</td>
                      <td class="num mono">
                        {{ fmt.num(m.titulos ?? m.participaciones ?? 0, 4) }}
                      </td>
                      <td class="num mono valor-privado">
                        <strong>{{ fmt.eur(valM, 2) }}</strong>
                      </td>
                      <td
                        class="num mono valor-privado"
                        [class.pos]="fmt.claseSigno(m.plusvalia) === 'pos'"
                        [class.neg]="fmt.claseSigno(m.plusvalia) === 'neg'"
                      >
                        {{ m.plusvalia !== null && m.plusvalia !== undefined ? fmt.eurSigno(m.plusvalia, 2) : '—' }}
                      </td>
                      <td class="num">
                        <button
                          type="button"
                          class="btn-tabla"
                          (click)="seleccionarProducto(m.id)"
                        >
                          <span>Ver ficha</span>
                          <cap-icon name="arrow-right" [size]="12" />
                        </button>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </section>
        }

        @if (productoActivo(); as p) {
          <!-- FICHA TÉCNICA Y MÉTRICAS DEL PRODUCTO -->
          <section class="panel-card bloque-seccion ficha-producto" [style.--prod-color]="colorPrimario(p)">
            <div class="ficha-cab">
              <div>
                <div class="prod-tags">
                  <span class="tag">{{ p.tipo }}</span>
                  @if (p.identificador || p.isin) {
                    <span class="tag mono">{{ p.identificador || p.isin }}</span>
                  }
                  @if (p.entidad) {
                    <span class="tag">{{ p.entidad }}</span>
                  }
                  @if (p.gestora) {
                    <span class="tag">{{ p.gestora }}</span>
                  }
                  @if (p.clase) {
                    <span class="tag">{{ p.clase }}</span>
                  }
                  @if (p.ter) {
                    <span class="tag">TER {{ fmt.pct(p.ter, 2) }}</span>
                  }
                  @if (p.riesgo) {
                    <span class="tag">Riesgo {{ p.riesgo }}/7</span>
                  }
                </div>
                <h2 class="ficha-titulo">{{ p.nombre }}</h2>
                @if (p.papel || p.indiceDetalle) {
                  <p class="ficha-desc">{{ p.papel || p.indiceDetalle }}</p>
                }
              </div>

              <div class="ficha-valor-der">
                <span class="kpi-label">Valor actual de la posición</span>
                <div class="ficha-cifra valor-privado">{{ fmt.eur(store.valorProductoConVivo(p), 2) }}</div>
                <div class="hero-badges">
                  @if (p.plusvalia !== null && p.plusvalia !== undefined) {
                    <span
                      class="chip-rent"
                      [class.pos]="fmt.claseSigno(p.plusvalia) === 'pos'"
                      [class.neg]="fmt.claseSigno(p.plusvalia) === 'neg'"
                    >
                      {{ fmt.eurSigno(p.plusvalia, 2) }}
                      @if (p.rentabilidad !== null && p.rentabilidad !== undefined) {
                        ({{ fmt.pctSigno(p.rentabilidad, 2) }})
                      }
                    </span>
                  }
                  @if (p.tir !== null && p.tir !== undefined) {
                    <span class="chip-neutro">TIR {{ fmt.pctSigno(p.tir, 2) }}</span>
                  }
                </div>
              </div>
            </div>

            <div class="ficha-kpis-grid">
              <div class="ficha-kpi">
                <span>Capital invertido</span>
                <strong class="mono valor-privado">{{ fmt.eur(p.aportado ?? 0, 2) }}</strong>
              </div>
              <div class="ficha-kpi">
                <span>{{ p.etqUnidades || 'Participaciones' }}</span>
                <strong class="mono">{{ fmt.num(p.titulos ?? p.participaciones ?? 0, 4) }}</strong>
              </div>
              <div class="ficha-kpi">
                <span>Precio medio de compra</span>
                <strong class="mono valor-privado">
                  {{ p.precioMedio ? fmt.eur(p.precioMedio, 2) : '—' }}
                </strong>
              </div>
              <div class="ficha-kpi">
                <span>{{ p.etqPrecio || 'Cotización actual' }}</span>
                <strong class="mono valor-privado">
                  {{ store.precioProductoConVivo(p) ? fmt.eur(store.precioProductoConVivo(p), 2) : '—' }}
                </strong>
                @if (store.preciosVivo()[p.id]) {
                  <small class="muted">en tiempo real</small>
                } @else if (p.navFecha) {
                  <small class="muted">al {{ fmt.fechaCorta(p.navFecha) }}</small>
                }
              </div>
              <div class="ficha-kpi">
                <span>Peso en cartera</span>
                <strong class="mono">{{ fmt.pct(p.peso ?? 0, 2) }}</strong>
              </div>
              <div class="ficha-kpi">
                <span>Fuente de precios</span>
                <strong>{{ p.fuenteTexto || p.fuentePrecio || 'Manual' }}</strong>
              </div>
            </div>

            <!-- VENTANAS DE RENTABILIDAD -->
            @if (p.ventanas) {
              <div class="ventanas-box">
                <span class="ventanas-titulo">
                  {{ p.etqVentanas || 'Variación de cotización por periodo' }}
                </span>
                <div class="ventanas-grid">
                  @for (v of clavesVentanas; track v.clave) {
                    <div
                      class="ventana-celda"
                      [class.pos-tint]="(p.ventanas[v.clave] ?? 0) > 0.0001"
                      [class.neg-tint]="(p.ventanas[v.clave] ?? 0) < -0.0001"
                    >
                      <span class="ventana-etq">{{ v.etiqueta }}</span>
                      <strong
                        class="mono"
                        [class.pos]="fmt.claseSigno(p.ventanas[v.clave] ?? null) === 'pos'"
                        [class.neg]="fmt.claseSigno(p.ventanas[v.clave] ?? null) === 'neg'"
                      >
                        {{ p.ventanas[v.clave] !== null && p.ventanas[v.clave] !== undefined ? fmt.pctSigno(p.ventanas[v.clave]!, 2) : '—' }}
                      </strong>
                    </div>
                  }
                </div>
              </div>
            }
          </section>

          <!-- GRÁFICO DEL PRODUCTO: POSICIÓN VS PRECIO CON COMPRAS -->
          <section class="panel-card bloque-seccion">
            <div class="card-header">
              <div>
                <h3 class="card-title">
                  {{ modoGraficoProd() === 'valor' ? 'Evolución de tu posición (€) frente a capital aportado' : 'Evolución del ' + (p.etqPrecio || 'precio') + ' y momentos de compra' }}
                </h3>
                <p class="card-sub">
                  @if (modoGraficoProd() === 'valor') {
                    Comparativa diaria entre el valor de mercado de tus participaciones y el coste acumulado.
                  } @else {
                    Cada círculo marca una compra sobre la cotización oficial; la línea discontinua indica tu precio medio de adquisición.
                  }
                </p>
              </div>

              <div class="seg-group">
                <button
                  type="button"
                  class="seg-btn"
                  [class.on]="modoGraficoProd() === 'valor'"
                  (click)="modoGraficoProd.set('valor')"
                >
                  Valor posición (€)
                </button>
                <button
                  type="button"
                  class="seg-btn"
                  [class.on]="modoGraficoProd() === 'vl'"
                  (click)="modoGraficoProd.set('vl')"
                >
                  {{ p.etqPrecio || 'Precio' }} y compras
                </button>
              </div>
            </div>

            @if (modoGraficoProd() === 'vl' && p.tramos && p.tramos.n >= 3 && p.tramos.p33 !== null) {
              <div class="leyenda-tramos">
                <span>Tamaño de tus compras:</span>
                <span>
                  <i class="dot" style="background: #38bdf8"></i>
                  Pequeña (&le; {{ fmt.eur(p.tramos.p33, 0) }})
                </span>
                <span>
                  <i class="dot" style="background: #10b981"></i>
                  Habitual ({{ fmt.eur(p.tramos.p33, 0) }} – {{ fmt.eur(p.tramos.p67!, 0) }})
                </span>
                <span>
                  <i class="dot" style="background: #f59e0b"></i>
                  Extraordinaria (&gt; {{ fmt.eur(p.tramos.p67!, 0) }})
                </span>
              </div>
            }

            <cap-svg-chart [renderFn]="renderGraficoProductoFn()" [minHeight]="330" />
          </section>

          <!-- EXPOSICIÓN DEL ÍNDICE (SI APLICA) -->
          @if (p.exposicion; as exp) {
            <section class="panel-card bloque-seccion">
              <div class="card-header">
                <div>
                  <h3 class="card-title">Radiografía del índice subyacente ({{ p.indiceDetalle || p.nombre }})</h3>
                  <p class="card-sub">
                    Fuente: {{ exp.fuente }} · Actualizado en {{ exp.actualizado }}
                    @if (exp.constituyentes) {
                      · {{ fmt.entero(exp.constituyentes) }} empresas en cartera
                    }
                  </p>
                </div>
              </div>

              <div class="exposicion-grid">
                <div>
                  <h4 class="sub-bloque-titulo">Distribución geográfica</h4>
                  <cap-svg-chart [renderFn]="crearBarrasExpoFn(exp.paises, p)" />
                </div>
                <div>
                  <h4 class="sub-bloque-titulo">Distribución sectorial</h4>
                  <cap-svg-chart [renderFn]="crearBarrasExpoFn(exp.sectores, p)" />
                </div>
                @if (exp.top10 && exp.top10.length) {
                  <div>
                    <h4 class="sub-bloque-titulo">Principales posiciones (Top 10)</h4>
                    <cap-svg-chart [renderFn]="crearBarrasExpoFn(exp.top10, p)" />
                  </div>
                }
              </div>
            </section>
          }

          <!-- HISTORIAL DE COMPRAS DEL PRODUCTO -->
          <section class="panel-card bloque-seccion">
            <div class="card-header">
              <div>
                <h3 class="card-title">Compras registradas en {{ p.corto || p.nombre }}</h3>
                <p class="card-sub">
                  {{ (p.aportaciones || []).length }} aportaciones · Importe medio:
                  {{ p.tramos?.mediana ? fmt.eur(p.tramos!.mediana, 0) : '—' }}
                </p>
              </div>
            </div>

            <div class="tabla-scroll">
              <table class="tabla-datos">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Clasificación</th>
                    <th class="num">{{ p.etqUnidades || 'Participaciones' }}</th>
                    <th class="num">{{ p.etqPrecio || 'Precio compra' }}</th>
                    <th class="num">Importe</th>
                  </tr>
                </thead>
                <tbody>
                  @for (a of aportacionesOrdenadas(p); track $index) {
                    <tr>
                      <td class="mono">{{ fmt.fechaCorta(a.fecha) }}</td>
                      <td>
                        <span class="tag" [class.tag-lp]="a.nivel === 3">
                          {{ etiquetaNivelAportacion(a.nivel) }}
                        </span>
                      </td>
                      <td class="num mono">
                        {{ a.participaciones ? fmt.num(a.participaciones, 4) : '—' }}
                      </td>
                      <td class="num mono valor-privado">
                        {{ a.precio ? fmt.eur(a.precio, 2) : '—' }}
                      </td>
                      <td class="num mono valor-privado">{{ fmt.eur(a.importe, 2) }}</td>
                    </tr>
                  } @empty {
                    <tr>
                      <td colspan="5" class="vacio-celda">No hay compras registradas en este producto.</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </section>
        }
      }
    }
  `,
})
export class ProductosTabComponent {
  readonly store = inject(PortfolioStoreService);
  readonly fmt = inject(FormatService);
  private readonly chart = inject(ChartService);

  readonly modoGraficoProd = signal<'valor' | 'vl'>('valor');

  readonly clavesVentanas = [
    { clave: '1m', etiqueta: '1 mes' },
    { clave: '3m', etiqueta: '3 meses' },
    { clave: '6m', etiqueta: '6 meses' },
    { clave: 'ytd', etiqueta: 'Este año (YTD)' },
    { clave: '1a', etiqueta: '1 año' },
    { clave: 'total', etiqueta: 'Desde inicio' },
  ];

  readonly productosConColor = computed<ProductoCalculado[]>(() => {
    const prods = this.store.datos()?.productos || [];
    return prods.map((p, idx) => ({
      ...p,
      color: p.slotColor || p.color || this.fmt.colorDeSlot(p.slot ?? idx),
    }));
  });

  readonly elementosSelector = computed<SelectorElementoProductos[]>(() => {
    const prods = this.productosConColor();
    const grupos = new Map<string, ProductoCalculado[]>();
    const orden: ({ esGrupo: true; gid: string } | { esGrupo: false; comp: ProductoCalculado })[] = [];

    for (const p of prods) {
      const gid = (p.grupoId || '').trim().toLowerCase();
      if (!gid) {
        orden.push({ esGrupo: false, comp: p });
        continue;
      }
      if (!grupos.has(gid)) {
        grupos.set(gid, []);
        orden.push({ esGrupo: true, gid });
      }
      grupos.get(gid)!.push(p);
    }

    return orden.map((entry) => {
      if (!entry.esGrupo) return { esGrupo: false, comp: entry.comp };
      const miembros = grupos
        .get(entry.gid)!
        .slice()
        .sort((a, b) => (b.pesoObjetivo ?? -1) - (a.pesoObjetivo ?? -1));
      const primero = miembros[0];
      const valor = miembros.reduce((s, m) => s + this.store.valorProductoConVivo(m), 0);
      const conAport = miembros.filter((m) => m.aportado !== null && m.aportado !== undefined);
      const aportado = conAport.length
        ? conAport.reduce((s, m) => s + (m.aportado || 0), 0)
        : null;
      const conPlus = miembros.filter((m) => m.plusvalia !== null && m.plusvalia !== undefined);
      const plusvalia = conPlus.length
        ? conPlus.reduce(
            (s, m) => s + (m.plusvalia || 0) + this.store.ajusteVivoProducto(m),
            0,
          )
        : null;
      const rentabilidad =
        aportado && aportado > 0 && plusvalia !== null ? plusvalia / aportado : null;
      const colorPar = (primero.color ||
        primero.slotColor ||
        this.fmt.colorDeSlot(primero.slot || 0)) as [string, string];
      return {
        esGrupo: true,
        grupoId: entry.gid,
        nombre: primero.grupoNombre || entry.gid,
        entidad: primero.entidad,
        color: Array.isArray(colorPar) ? colorPar[0] : '#10b981',
        colorPar,
        miembros,
        valor,
        aportado,
        plusvalia,
        rentabilidad,
      };
    });
  });

  readonly grupoActivo = computed<SelectorGrupoProductos | null>(() => {
    const els = this.elementosSelector();
    const gidSel = (this.store.grupoSeleccionadoId() || '').trim().toLowerCase();
    if (gidSel) {
      const match = els.find((e) => e.esGrupo && e.grupoId === gidSel);
      if (match && match.esGrupo) return match;
    }
    const prodSel = this.store.productoSeleccionadoId();
    if (prodSel) {
      const parent = els.find(
        (e) => e.esGrupo && e.miembros.some((m) => m.id === prodSel),
      );
      if (parent && parent.esGrupo) return parent;
    }
    if (!prodSel && els[0]?.esGrupo) {
      return els[0];
    }
    return null;
  });

  readonly productoActivo = computed<ProductoCalculado | null>(() => {
    const lista = this.productosConColor();
    if (!lista.length) return null;
    const sel = this.store.productoSeleccionadoId();
    if (sel) {
      return lista.find((p) => p.id === sel) || null;
    }
    if (this.grupoActivo()) return null;
    return lista[0];
  });

  seleccionarGrupo(gid: string): void {
    this.store.grupoSeleccionadoId.set(gid);
    this.store.productoSeleccionadoId.set(null);
  }

  seleccionarProducto(id: string): void {
    const p = this.productosConColor().find((x) => x.id === id);
    const gid = (p?.grupoId || '').trim().toLowerCase() || null;
    this.store.grupoSeleccionadoId.set(gid);
    this.store.productoSeleccionadoId.set(id);
  }

  irAPonerImportes(grupoId: string): void {
    void grupoId;
    this.store.subTabDatos.set('productos');
    this.store.tabActiva.set('datos');
  }

  readonly renderGraficoGrupoFn = computed<ChartRenderFn>(() => {
    const d = this.store.datos();
    const grp = this.grupoActivo();
    const tema = this.store.tema();
    void tema;

    return (el: HTMLElement) => {
      if (!d || !grp || !d.fechas.length) return;
      const n = d.fechas.length;
      const valComb: (number | null)[] = new Array(n).fill(null);
      const apComb: (number | null)[] = new Array(n).fill(null);

      for (let i = 0; i < n; i++) {
        let sVal = 0;
        let hayVal = false;
        let sAp = 0;
        let hayAp = false;
        for (const m of grp.miembros) {
          const v = m.serie?.[i];
          if (v !== null && v !== undefined) {
            sVal += v;
            hayVal = true;
          }
          const a = m.serieAportado?.[i];
          if (a !== null && a !== undefined) {
            sAp += a;
            hayAp = true;
          }
        }
        valComb[i] = hayVal ? Math.round(sVal * 100) / 100 : null;
        apComb[i] = hayAp ? Math.round(sAp * 100) / 100 : null;
      }

      let ini = valComb.findIndex((v) => v !== null && v > 0);
      if (ini < 0) ini = 0;

      this.chart.lineaConEventos(el, {
        fechas: d.fechas.slice(ini),
        valores: valComb.slice(ini),
        secundaria: apComb.slice(ini),
        etiquetaPri: 'Valor cartera',
        etiquetaSec: 'Capital invertido',
        color: grp.colorPar,
        altura: 330,
      });
    };
  });

  colorPrimario(p: ProductoCalculado): string {
    return Array.isArray(p.color) ? p.color[0] : '#10b981';
  }

  readonly renderGraficoProductoFn = computed<ChartRenderFn>(() => {
    const d = this.store.datos();
    const p = this.productoActivo();
    const modo = this.modoGraficoProd();
    const tema = this.store.tema();
    void tema;

    return (el: HTMLElement) => {
      if (!d || !p || !d.fechas.length) return;
      const colorPar = (p.color || ['#10b981', '#059669']) as [string, string];

      // Cut leading zeros so the chart starts when the product or series starts
      const serieBase = modo === 'vl' && p.navSerie ? p.navSerie : p.serie;
      let ini = serieBase.findIndex((v) => v !== null && v > 0);
      if (ini < 0) ini = 0;

      const fechas = d.fechas.slice(ini);
      if (modo === 'valor') {
        const valores = (p.serie || []).slice(ini);
        const aportado = (p.serieAportado || []).slice(ini);
        const eventos = (p.aportaciones || [])
          .filter((a) => a.fecha >= fechas[0])
          .map((a) => ({
            fecha: a.fecha,
            importe: a.importe,
            nivel: a.nivel,
            texto: `Compra: ${this.fmt.eur(a.importe, 2)}`,
          }));

        this.chart.lineaConEventos(el, {
          fechas,
          valores,
          secundaria: aportado,
          etiquetaPri: 'Valor posición',
          etiquetaSec: 'Capital invertido',
          color: colorPar,
          eventos,
          altura: 330,
        });
      } else {
        const navs = (p.navSerie || p.serie || []).slice(ini);
        const eventos = (p.aportaciones || [])
          .filter((a) => a.fecha >= fechas[0])
          .map((a) => ({
            fecha: a.fecha,
            importe: a.importe,
            precio: a.precio,
            nivel: a.nivel,
            texto: a.precio
              ? `${this.fmt.eur(a.importe, 0)} a ${this.fmt.eur(a.precio, 2)}`
              : this.fmt.eur(a.importe, 0),
          }));

        const lineaRef =
          p.precioMedio && p.precioMedio > 0
            ? {
                valor: p.precioMedio,
                etiqueta: `Precio medio: ${this.fmt.eur(p.precioMedio, 2)}`,
                color: '#f59e0b',
              }
            : null;

        this.chart.lineaConEventos(el, {
          fechas,
          valores: navs,
          etiquetaPri: p.etqPrecio || 'Cotización',
          color: colorPar,
          eventos,
          eventosEnPrecio: true,
          lineaRef,
          formatoY: (v) => this.fmt.eur(v, 2),
          altura: 330,
        });
      }
    };
  });

  crearBarrasExpoFn(
    items: [string, number][],
    p: ProductoCalculado
  ): ChartRenderFn {
    const color = this.colorPrimario(p);
    return (el: HTMLElement) => {
      this.chart.barrasHorizontales(el, items, color);
    };
  }

  aportacionesOrdenadas(p: ProductoCalculado) {
    return [...(p.aportaciones || [])].sort((a, b) =>
      b.fecha.localeCompare(a.fecha)
    );
  }

  etiquetaNivelAportacion(nivel?: number): string {
    if (nivel === 3) return 'Extraordinaria';
    if (nivel === 1) return 'Pequeña';
    return 'Habitual';
  }
}
