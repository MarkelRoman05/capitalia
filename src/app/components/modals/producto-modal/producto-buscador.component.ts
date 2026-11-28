import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  computed,
  effect,
  inject,
  input,
  model,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PortfolioStoreService } from '../../../services/portfolio-store.service';
import { FormatService } from '../../../services/format.service';
import {
  ComponenteCarteraModelo,
  CotizacionAlternativa,
  EntidadBanco,
  ProductoCfg,
  ResultadoBusqueda,
} from '../../../models/portfolio.model';
import { IconComponent } from '../../icon/icon.component';

type TipoFiltroBusq =
  | 'todos'
  | 'fondo'
  | 'etf'
  | 'pension'
  | 'cartera'
  | 'accion'
  | 'cripto';

export function generarNombreCortoProducto(nombre: string, identificador?: string): string {
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

export function inferirClaseProducto(tipo: string, nombre: string): string {
  if (tipo === 'pension') return 'Jubilación';
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

export function inferirLargoPlazoProducto(tipo: string, clase?: string): boolean {
  if (['efectivo', 'inmueble', 'deuda'].includes(tipo)) return false;
  const c = (clase || '').toLowerCase();
  if (c.includes('monetario') || c.includes('liquidez')) return false;
  return true;
}

@Component({
  selector: 'cap-producto-buscador',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, IconComponent],
  template: `
    <section class="pm-search-card" aria-label="Buscador de activos">
      @if (activoSeleccionado(); as sel) {
        <div class="pm-linked-card">
          <div class="pm-linked-main">
            <div class="pm-linked-badges">
              <span [class]="claseBadgeTipo(sel.tipo)">
                {{ etiquetaTipo(sel.tipo) }}
              </span>
              @if (sel.isin) {
                <span class="tag pm-tag-isin mono">ISIN {{ sel.isin }}</span>
              }
              @if (sel.ticker && sel.ticker !== sel.isin) {
                <span class="tag mono">{{ sel.ticker }}</span>
              } @else if (!sel.isin && sel.identificador) {
                <span class="tag mono">{{ sel.identificador }}</span>
              }
              <span
                class="tag"
                [class.pm-tag-eur]="sel.moneda === 'EUR'"
                [class.pm-tag-fx]="sel.moneda !== 'EUR'"
              >
                {{ sel.moneda }}
              </span>
              @if (sel.politica) {
                <span
                  class="tag"
                  [class.pm-tag-acc]="sel.politica === 'Acumulación'"
                  [class.pm-tag-dist]="sel.politica === 'Distribución'"
                >
                  {{ sel.politica }}
                </span>
              }
              @if (sel.cobertura) {
                <span class="tag pm-tag-hedge">{{ sel.cobertura }}</span>
              }
              @if (sel.mercado) {
                <span class="tag">{{ sel.mercado }}</span>
              }
              <span class="tag">{{ etiquetaFuente(sel.fuente) }}</span>
            </div>
            <strong class="pm-linked-name">{{ sel.nombre }}</strong>
            @if (
              sel.ficha?.gestora ||
              sel.ficha?.clase ||
              sel.ficha?.ter !== undefined ||
              sel.ficha?.riesgo
            ) {
              <span class="pm-linked-sub">
                @if (sel.ficha?.gestora) {
                  <strong>{{ sel.ficha!.gestora }}</strong>
                }
                @if (sel.ficha?.gestora && sel.ficha?.clase) {
                  ·
                }
                {{ sel.ficha?.clase }}
                @if (sel.ficha?.ter !== undefined && sel.ficha?.ter !== null) {
                  · TER {{ fmt.num(sel.ficha!.ter!, 2) }}%
                }
                @if (sel.ficha?.riesgo) {
                  · SRRI {{ sel.ficha!.riesgo }}/7
                }
              </span>
            }
          </div>
          <div class="pm-linked-aside">
            <div class="pm-linked-price mono">
              {{ fmt.num(sel.precio, sel.precio >= 100 ? 2 : 4) }} {{ sel.moneda }}
            </div>
            @if (sel.rentabilidad1a !== null && sel.rentabilidad1a !== undefined) {
              <span
                class="pm-result-ret mono"
                [class.pos]="sel.rentabilidad1a >= 0"
                [class.neg]="sel.rentabilidad1a < 0"
              >
                1A: {{ sel.rentabilidad1a >= 0 ? '+' : ''
                }}{{ fmt.num(sel.rentabilidad1a, 1) }}%
              </span>
            }
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
          <label for="busq-input">Buscar producto o cartera en mercados</label>
          <span class="pm-search-sources">
            Morningstar · Yahoo Finance · CoinGecko · Carteras
          </span>
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
              (ngModelChange)="alEscribirBusqueda($event)"
              (keydown.enter)="$event.preventDefault(); lanzarBusqueda()"
              placeholder="ISIN, ticker, banco o nombre (ej. MyInvestor, Indexa, BBVA pensiones, MSCI World…)"
            />
            @if (consultaBusqueda) {
              <button
                type="button"
                class="pm-search-clear"
                (click)="limpiarBusqueda()"
                aria-label="Limpiar búsqueda"
              >
                <cap-icon name="close" [size]="13" />
              </button>
            }
          </div>
          <button
            type="button"
            class="btn-primario pm-search-btn"
            [disabled]="buscando() || !puedeBuscar()"
            (click)="lanzarBusqueda()"
          >
            @if (buscando()) {
              <cap-icon name="spinner" [size]="15" [spin]="true" />
              <span>Buscando…</span>
            } @else {
              <span>Buscar</span>
            }
          </button>
        </div>

        <!-- Filtros de tipo y divisa -->
        <div class="pm-filter-bar">
          <div class="seg-group" role="group" aria-label="Filtrar resultados por tipo">
            @for (f of filtrosTipo; track f.id) {
              <button
                type="button"
                class="seg-btn"
                [class.on]="filtroTipoBusq() === f.id"
                (click)="cambiarFiltroTipo(f.id)"
              >
                {{ f.etiqueta }}
              </button>
            }
          </div>

          <button
            type="button"
            class="pill pm-eur-pill"
            [class.on]="soloEurBusq()"
            [attr.aria-pressed]="soloEurBusq()"
            (click)="soloEurBusq.set(!soloEurBusq())"
          >
            Solo EUR
          </button>

          @if (resultadosBusqueda().length) {
            <span class="pm-results-count">
              {{ resultadosFiltrados().length }} de {{ resultadosBusqueda().length }}
            </span>
          }
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

        @if (busquedaRealizada() && !buscando() && !resultadosFiltrados().length) {
          <div class="pm-search-empty">
            @if (errorBusqueda()) {
              No se pudo conectar con las fuentes de mercado. Revisa tu conexión o rellena los
              datos manualmente abajo.
            } @else if (resultadosBusqueda().length && soloEurBusq()) {
              Hay {{ resultadosBusqueda().length }} resultados en otras divisas.
              <button type="button" class="btn-link" (click)="soloEurBusq.set(false)">
                Mostrar todas las divisas
              </button>
            } @else if (!ultimaConsulta()) {
              No hay resultados disponibles en esta categoría en este momento. Prueba otro filtro o
              rellena los datos abajo.
            } @else {
              No encontramos resultados con cotización para «{{ ultimaConsulta() }}». Prueba con el
              ISIN exacto, otro filtro de tipo o rellénalo abajo.
            }
          </div>
        }

        @if (resultadosFiltrados().length) {
          <div class="pm-results" role="list" aria-label="Resultados de búsqueda">
            @for (r of resultadosFiltrados(); track r.fuente + '-' + r.codigo) {
              <div
                class="pm-result-card"
                [class.pm-portfolio-card]="r.tipo === 'cartera'"
                role="listitem"
              >
                @if (r.tipo === 'cartera') {
                  <div class="pm-portfolio-top">
                    <div class="pm-result-main">
                      <div class="pm-result-title-row">
                        <span [class]="claseBadgeTipo(r.tipo)">
                          {{ etiquetaTipo(r.tipo) }}
                        </span>
                        <strong class="pm-result-name">{{ r.nombre }}</strong>
                        @if (r.perfilRiesgo) {
                          <span class="tag pm-tag-isin">{{ r.perfilRiesgo }}</span>
                        }
                      </div>

                      @if (r.entidadSugerida || r.ficha?.gestora) {
                        <div class="pm-result-sub">
                          <strong>{{ r.entidadSugerida || r.ficha?.gestora }}</strong>
                          @if (r.mercado) {
                            <span> · {{ r.mercado }}</span>
                          }
                        </div>
                      }

                      <div class="prod-tags">
                        @if (r.numComponentes) {
                          <span class="tag pm-tag-eur">
                            {{ r.numComponentes }} productos incluidos
                          </span>
                        }
                        @if (r.comisionTotal) {
                          <span class="tag">Coste {{ r.comisionTotal }}</span>
                        }
                        <span class="tag pm-tag-eur">{{ r.moneda }}</span>
                        @if (r.ficha?.riesgo) {
                          <span class="tag">SRRI {{ r.ficha!.riesgo }}/7</span>
                        }
                        @if (r.actualizado) {
                          <span class="tag">Act. {{ r.actualizado }}</span>
                        }
                      </div>
                    </div>

                    <div class="pm-result-aside">
                      @if (r.rentabilidad1a !== null && r.rentabilidad1a !== undefined) {
                        <span
                          class="pm-result-ret mono"
                          [class.pos]="r.rentabilidad1a >= 0"
                          [class.neg]="r.rentabilidad1a < 0"
                          title="Rentabilidad en el último año"
                        >
                          1A {{ r.rentabilidad1a >= 0 ? '+' : ''
                          }}{{ fmt.num(r.rentabilidad1a, 1) }}%
                        </span>
                      }
                      <small class="pm-result-date">Cartera indexada</small>
                    </div>
                  </div>

                  <div class="pm-portfolio-bar">
                    <button
                      type="button"
                      class="pm-portfolio-toggle"
                      [attr.aria-expanded]="esCarteraExpandida(r)"
                      (click)="alternarDetalleCartera(r)"
                    >
                      @if (cargandoDetalleId() === claveCartera(r)) {
                        <cap-icon name="spinner" [size]="14" [spin]="true" />
                        <span>Actualizando productos incluidos…</span>
                      } @else if (esCarteraExpandida(r)) {
                        <cap-icon name="chevron-down" [size]="14" />
                        <span>
                          Ocultar {{ r.numComponentes || 'los' }} productos incluidos
                        </span>
                      } @else {
                        <cap-icon name="arrow-right" [size]="14" />
                        <span>
                          Ver los {{ r.numComponentes || '' }} productos incluidos
                        </span>
                      }
                    </button>

                    @if (r.planSecId) {
                      <button
                        type="button"
                        class="btn-secundario btn-sm"
                        (click)="elegirPlanDeCartera(r)"
                      >
                        <cap-icon name="plus" [size]="13" />
                        <span>Elegir plan de pensiones completo</span>
                      </button>
                    }
                  </div>
                } @else {
                  <button
                    type="button"
                    class="pm-result-item"
                    (click)="seleccionar(r)"
                  >
                    <div class="pm-result-main">
                      <div class="pm-result-title-row">
                        <span [class]="claseBadgeTipo(r.tipo)">
                          {{ etiquetaTipo(r.tipo) }}
                        </span>
                        <strong class="pm-result-name">{{ r.nombre }}</strong>
                        @if (yaEnCartera(r)) {
                          <span class="tag pm-tag-owned">Ya en cartera</span>
                        }
                        @if (r.estrellas) {
                          <span
                            class="tag pm-star-badge"
                            [title]="r.estrellas + ' estrellas Morningstar'"
                          >
                            <span>{{ r.estrellas }}</span>
                            <cap-icon name="star" [size]="11" />
                          </span>
                        }
                      </div>

                      @if (r.ficha?.gestora || r.ficha?.clase) {
                        <div class="pm-result-sub">
                          @if (r.ficha?.gestora) {
                            <strong>{{ r.ficha!.gestora }}</strong>
                          }
                          @if (r.ficha?.gestora && r.ficha?.clase) {
                            <span> · </span>
                          }
                          <span>{{ r.ficha?.clase }}</span>
                        </div>
                      }

                      <div class="prod-tags">
                        @if (r.entidadSugerida) {
                          <span class="tag pm-tag-bank">{{ r.entidadSugerida }}</span>
                        }
                        @if (r.isin) {
                          <span class="tag pm-tag-isin mono">ISIN {{ r.isin }}</span>
                        }
                        @if (r.ticker && r.ticker !== r.isin) {
                          <span class="tag mono">{{ r.ticker }}</span>
                        } @else if (!r.isin && r.identificador) {
                          <span class="tag mono">{{ r.identificador }}</span>
                        }
                        <span
                          class="tag"
                          [class.pm-tag-eur]="r.moneda === 'EUR'"
                          [class.pm-tag-fx]="r.moneda !== 'EUR'"
                        >
                          {{ r.moneda }}
                        </span>
                        @if (r.politica) {
                          <span
                            class="tag"
                            [class.pm-tag-acc]="r.politica === 'Acumulación'"
                            [class.pm-tag-dist]="r.politica === 'Distribución'"
                          >
                            {{ r.politica }}
                          </span>
                        }
                        @if (r.cobertura) {
                          <span class="tag pm-tag-hedge">{{ r.cobertura }}</span>
                        }
                        @if (r.mercado) {
                          <span class="tag">{{ r.mercado }}</span>
                        }
                        @if (r.ficha?.ter !== undefined && r.ficha?.ter !== null) {
                          <span class="tag">TER {{ fmt.num(r.ficha!.ter!, 2) }}%</span>
                        }
                        @if (r.ficha?.riesgo) {
                          <span class="tag">SRRI {{ r.ficha!.riesgo }}/7</span>
                        }
                        @if (formatearPatrimonio(r.patrimonio); as pat) {
                          <span class="tag" title="Patrimonio total del fondo">
                            Pat. {{ pat }}
                          </span>
                        }
                        <span class="tag">{{ etiquetaFuente(r.fuente) }}</span>
                      </div>
                    </div>

                    <div class="pm-result-aside">
                      <strong class="pm-result-price mono">
                        {{ fmt.num(r.precio, r.precio >= 100 ? 2 : 4) }} {{ r.moneda }}
                      </strong>
                      @if (r.rentabilidad1a !== null && r.rentabilidad1a !== undefined) {
                        <span
                          class="pm-result-ret mono"
                          [class.pos]="r.rentabilidad1a >= 0"
                          [class.neg]="r.rentabilidad1a < 0"
                          title="Rentabilidad en el último año"
                        >
                          1A {{ r.rentabilidad1a >= 0 ? '+' : ''
                          }}{{ fmt.num(r.rentabilidad1a, 1) }}%
                        </span>
                      }
                      <small class="pm-result-date mono">
                        {{ fmt.fechaCorta(r.fecha) }}
                      </small>
                      <span class="pm-result-cta">
                        <span>Elegir</span>
                        <cap-icon name="arrow-right" [size]="13" />
                      </span>
                    </div>
                  </button>

                  @if (r.alternativas?.length) {
                    <div class="pm-alt-bar">
                      <span class="pm-alt-label">Otras bolsas:</span>
                      @for (alt of r.alternativas!; track alt.fuente + '-' + alt.codigo) {
                        <button
                          type="button"
                          class="pm-alt-chip"
                          (click)="seleccionarAlternativa(r, alt)"
                        >
                          <span>{{ alt.mercado || alt.fuente }}</span>
                          <strong class="mono">{{ alt.ticker || alt.codigo }}</strong>
                          <span class="mono">
                            {{ fmt.num(alt.precio, alt.precio >= 100 ? 2 : 4) }}
                            {{ alt.moneda }}
                          </span>
                        </button>
                      }
                    </div>
                  }

                  @if (r.carteraId) {
                    <div class="pm-portfolio-bar">
                      <button
                        type="button"
                        class="pm-portfolio-toggle"
                        [attr.aria-expanded]="esCarteraExpandida(r)"
                        (click)="alternarDetalleCartera(r)"
                      >
                        @if (cargandoDetalleId() === claveCartera(r)) {
                          <cap-icon name="spinner" [size]="14" [spin]="true" />
                          <span>Actualizando subyacentes…</span>
                        } @else if (esCarteraExpandida(r)) {
                          <cap-icon name="chevron-down" [size]="14" />
                          <span>Ocultar ETFs incluidos</span>
                        } @else {
                          <cap-icon name="arrow-right" [size]="14" />
                          <span>
                            Ver {{ r.numComponentes || 'los' }} ETFs incluidos en este plan
                          </span>
                        }
                      </button>
                    </div>
                  }
                }

                @if (esCarteraExpandida(r)) {
                  @let det = detalleCartera(r);
                  <div class="pm-portfolio-panel">
                    @if (cargandoDetalleId() === claveCartera(r) && !det) {
                      <div class="pm-portfolio-loading">
                        <cap-icon name="spinner" [size]="15" [spin]="true" />
                        <span>
                          Consultando cotizaciones en vivo y composición actualizada…
                        </span>
                      </div>
                    } @else if (det?.componentes?.length) {
                      <div class="pm-comp-list">
                        @for (comp of det!.componentes!; track comp.isin + '-' + $index) {
                          <div class="pm-comp-row">
                            <div class="pm-comp-weight">
                              @if (comp.peso !== null && comp.peso !== undefined) {
                                <strong class="mono">{{ fmt.num(comp.peso, 1) }}%</strong>
                                <div class="pm-comp-bar" aria-hidden="true">
                                  <div
                                    class="pm-comp-bar-fill"
                                    [style.width.%]="comp.peso > 100 ? 100 : comp.peso"
                                  ></div>
                                </div>
                              } @else {
                                <span class="mono muted">—</span>
                              }
                            </div>

                            <div class="pm-comp-main">
                              <div class="pm-comp-title">
                                <strong>{{ comp.nombre }}</strong>
                              </div>
                              <div class="prod-tags">
                                <span class="tag pm-tag-isin mono">{{ comp.isin }}</span>
                                <span
                                  class="tag"
                                  [class.pm-tag-eur]="comp.moneda === 'EUR'"
                                  [class.pm-tag-fx]="comp.moneda !== 'EUR'"
                                >
                                  {{ comp.moneda }}
                                </span>
                                @if (comp.categoria || comp.clase) {
                                  <span class="tag">
                                    {{ comp.categoria || comp.clase }}
                                  </span>
                                }
                                @if (comp.politica) {
                                  <span class="tag">{{ comp.politica }}</span>
                                }
                                @if (comp.ter !== null && comp.ter !== undefined) {
                                  <span class="tag">
                                    TER {{ fmt.num(comp.ter, 2) }}%
                                  </span>
                                }
                              </div>
                            </div>

                            <div class="pm-comp-aside">
                              @if (comp.precio !== null && comp.precio !== undefined) {
                                <div class="pm-comp-price-col">
                                  <strong class="mono">
                                    {{
                                      fmt.num(comp.precio, comp.precio >= 100 ? 2 : 4)
                                    }}
                                    {{ comp.moneda }}
                                  </strong>
                                  @if (
                                    comp.rentabilidad1a !== null &&
                                    comp.rentabilidad1a !== undefined
                                  ) {
                                    <small
                                      class="pm-result-ret mono"
                                      [class.pos]="comp.rentabilidad1a >= 0"
                                      [class.neg]="comp.rentabilidad1a < 0"
                                    >
                                      1A {{ comp.rentabilidad1a >= 0 ? '+' : ''
                                      }}{{ fmt.num(comp.rentabilidad1a, 1) }}%
                                    </small>
                                  }
                                </div>
                              }
                              @if (yaEnCarteraPorIsin(comp.isin)) {
                                <span class="tag pm-tag-owned">Ya en cartera</span>
                              } @else if (comp.fuente && comp.codigo) {
                                <button
                                  type="button"
                                  class="btn-secundario btn-sm"
                                  (click)="elegirComponenteCartera(r, comp)"
                                >
                                  <span>Elegir</span>
                                  <cap-icon name="arrow-right" [size]="12" />
                                </button>
                              } @else {
                                <span class="tag muted">Sin código vivo</span>
                              }
                            </div>
                          </div>
                        }
                      </div>

                      @let nuevos = pendientesCartera(r);
                      @let faltanGrupo = componentesParaAgrupar(r);
                      <div class="pm-portfolio-actions">
                        <span class="pm-portfolio-hint">
                          @if (r.tipo === 'pension' && r.carteraId) {
                            Subyacentes reales del plan de pensiones ({{
                              det!.componentes!.length
                            }}
                            ETFs)
                          } @else if (faltanGrupo.length === 0) {
                            Todos los productos con cotización de esta cartera ya están agrupados
                            en «{{ r.nombre }}».
                          } @else if (nuevos.length === 0) {
                            Todos estos fondos ya están en tu cartera; puedes agruparlos bajo «{{
                              r.nombre
                            }}».
                          } @else {
                            Añade la cartera agrupada bajo «{{ r.nombre }}» ({{
                              nuevos.length
                            }}
                            productos) y define cuánto tiene cada uno.
                          }
                        </span>
                        @if (faltanGrupo.length > 0 && r.tipo === 'cartera') {
                          <button
                            type="button"
                            class="btn-primario btn-sm"
                            [disabled]="importandoCartera()"
                            (click)="importarCarteraCompleta(r)"
                          >
                            @if (importandoCartera()) {
                              <cap-icon name="spinner" [size]="14" [spin]="true" />
                              <span>Creando cartera…</span>
                            } @else {
                              <cap-icon name="plus" [size]="14" />
                              <span>
                                @if (nuevos.length === 0) {
                                  Agrupar cartera ({{ faltanGrupo.length }} productos)
                                } @else {
                                  Añadir cartera agrupada ({{ faltanGrupo.length }} productos)
                                }
                              </span>
                            }
                          </button>
                        }
                      </div>
                    } @else {
                      <div class="pm-search-empty">
                        No se pudieron cargar los componentes detallados de esta cartera ahora
                        mismo.
                      </div>
                    }
                  </div>
                }
              </div>
            }
          </div>
        }
      }
    </section>
  `,
})
export class ProductoBuscadorComponent implements OnDestroy {
  readonly store = inject(PortfolioStoreService);
  readonly fmt = inject(FormatService);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly entidadActual = input<string>('');
  readonly bancoSeleccionado = input<EntidadBanco | null>(null);
  readonly resetToken = input<number>(0);

  readonly activoSeleccionado = model<ResultadoBusqueda | null>(null);

  readonly resultadoSeleccionado = output<ResultadoBusqueda>();
  readonly carteraImportada = output<{ grupoId: string; grupoNombre: string }>();

  readonly buscando = signal<boolean>(false);
  readonly busquedaRealizada = signal<boolean>(false);
  readonly errorBusqueda = signal<boolean>(false);
  readonly ultimaConsulta = signal<string>('');
  readonly filtroTipoBusq = signal<TipoFiltroBusq>('todos');
  readonly soloEurBusq = signal<boolean>(false);
  readonly resultadosBusqueda = signal<ResultadoBusqueda[]>([]);
  readonly carteraExpandidaId = signal<string | null>(null);
  readonly cargandoDetalleId = signal<string | null>(null);
  readonly detallesCartera = signal<Record<string, ResultadoBusqueda>>({});
  readonly importandoCartera = signal<boolean>(false);

  readonly filtrosTipo: { id: TipoFiltroBusq; etiqueta: string }[] = [
    { id: 'todos', etiqueta: 'Todos' },
    { id: 'fondo', etiqueta: 'Fondos' },
    { id: 'etf', etiqueta: 'ETFs' },
    { id: 'pension', etiqueta: 'Pensiones' },
    { id: 'cartera', etiqueta: 'Carteras' },
    { id: 'accion', etiqueta: 'Acciones' },
    { id: 'cripto', etiqueta: 'Cripto' },
  ];

  readonly ejemplosBusqueda = [
    'MyInvestor',
    'Indexa',
    'Finizens',
    'MSCI World',
    'IE00B03HCZ61',
  ];

  readonly resultadosFiltrados = computed<ResultadoBusqueda[]>(() => {
    const lista = this.resultadosBusqueda();
    if (!this.soloEurBusq()) return lista;
    return lista.filter((r) => r.moneda === 'EUR');
  });

  readonly idsCarteraExistentes = computed<Set<string>>(() => {
    const out = new Set<string>();
    for (const p of this.store.cartera()?.productos || []) {
      for (const v of [p.identificador, p.codigo]) {
        const clean = (v || '').trim().toUpperCase();
        if (clean) out.add(clean);
      }
    }
    return out;
  });

  consultaBusqueda = '';
  private temporizadorBusqueda: ReturnType<typeof setTimeout> | null = null;
  private secuenciaBusqueda = 0;

  constructor() {
    effect(() => {
      const token = this.resetToken();
      if (token > 0) {
        this.reiniciarEstado();
      }
    });
  }

  ngOnDestroy(): void {
    if (this.temporizadorBusqueda) {
      clearTimeout(this.temporizadorBusqueda);
      this.temporizadorBusqueda = null;
    }
  }

  private reiniciarEstado(): void {
    if (this.temporizadorBusqueda) {
      clearTimeout(this.temporizadorBusqueda);
      this.temporizadorBusqueda = null;
    }
    this.secuenciaBusqueda++;
    this.resultadosBusqueda.set([]);
    this.carteraExpandidaId.set(null);
    this.cargandoDetalleId.set(null);
    this.importandoCartera.set(false);
    this.busquedaRealizada.set(false);
    this.errorBusqueda.set(false);
    this.ultimaConsulta.set('');
    this.filtroTipoBusq.set('todos');
    this.soloEurBusq.set(false);
    this.consultaBusqueda = '';
    this.cdr.markForCheck();
  }

  etiquetaTipo(tipo: string): string {
    const mapa: Record<string, string> = {
      fondo: 'Fondo',
      etf: 'ETF',
      pension: 'Plan de pensiones',
      bono: 'Bono / Renta fija',
      cartera: 'Cartera indexada',
      accion: 'Acción',
      cripto: 'Cripto',
      commodity: 'Materia prima',
    };
    return mapa[tipo] || tipo;
  }

  claseBadgeTipo(tipo: string): string {
    return `pm-type-badge pm-type-${tipo || 'otro'}`;
  }

  etiquetaFuente(fuente: string): string {
    const mapa: Record<string, string> = {
      morningstar: 'Morningstar',
      yahoo: 'Yahoo Finance',
      coingecko: 'CoinGecko',
      catalogo: 'Catálogo oficial',
      manual: 'Manual',
    };
    return mapa[fuente] || fuente;
  }

  yaEnCartera(r: ResultadoBusqueda): boolean {
    const ids = this.idsCarteraExistentes();
    for (const v of [r.isin, r.identificador, r.codigo, r.ticker]) {
      const clean = (v || '').trim().toUpperCase();
      if (clean && ids.has(clean)) return true;
    }
    return false;
  }

  yaEnCarteraPorIsin(isin?: string | null): boolean {
    const clean = (isin || '').trim().toUpperCase();
    return clean ? this.idsCarteraExistentes().has(clean) : false;
  }

  claveCartera(r: ResultadoBusqueda): string {
    return r.carteraId || r.codigo;
  }

  esCarteraExpandida(r: ResultadoBusqueda): boolean {
    const id = this.claveCartera(r);
    return !!id && this.carteraExpandidaId() === id;
  }

  detalleCartera(r: ResultadoBusqueda): ResultadoBusqueda | null {
    const id = this.claveCartera(r);
    return id ? this.detallesCartera()[id] || null : null;
  }

  pendientesCartera(r: ResultadoBusqueda): ComponenteCarteraModelo[] {
    const det = this.detalleCartera(r);
    if (!det?.componentes?.length) return [];
    return det.componentes.filter(
      (c) => !!c.fuente && !!c.codigo && !this.yaEnCarteraPorIsin(c.isin),
    );
  }

  private idsEnGrupo(grupoId: string): Set<string> {
    const gid = (grupoId || '').trim().toLowerCase();
    const out = new Set<string>();
    if (!gid) return out;
    for (const p of this.store.cartera()?.productos || []) {
      if ((p.grupoId || '').trim().toLowerCase() === gid) {
        for (const v of [p.identificador, p.codigo]) {
          const clean = (v || '').trim().toUpperCase();
          if (clean) out.add(clean);
        }
      }
    }
    return out;
  }

  componentesParaAgrupar(r: ResultadoBusqueda): ComponenteCarteraModelo[] {
    const det = this.detalleCartera(r);
    if (!det?.componentes?.length) return [];
    const enGrupo = this.idsEnGrupo(this.claveCartera(r));
    return det.componentes.filter(
      (c) => !!c.fuente && !!c.codigo && !enGrupo.has((c.isin || '').trim().toUpperCase()),
    );
  }

  puedeBuscar(): boolean {
    return (
      this.consultaBusqueda.trim().length >= 2 ||
      this.filtroTipoBusq() === 'cartera' ||
      this.filtroTipoBusq() === 'pension'
    );
  }

  formatearPatrimonio(patrimonio?: number | null): string | null {
    if (!patrimonio || patrimonio <= 0) return null;
    if (patrimonio >= 1e9) {
      return `${this.fmt.num(patrimonio / 1e9, 1)} MM€`;
    }
    if (patrimonio >= 1e6) {
      return `${this.fmt.num(patrimonio / 1e6, 0)} M€`;
    }
    return this.fmt.eurCompacto(patrimonio);
  }

  alEscribirBusqueda(texto: string): void {
    if (this.temporizadorBusqueda) {
      clearTimeout(this.temporizadorBusqueda);
      this.temporizadorBusqueda = null;
    }
    const q = (texto || '').trim();
    if (q.length < 3) return;
    this.temporizadorBusqueda = setTimeout(() => {
      void this.lanzarBusqueda();
    }, 420);
  }

  cambiarFiltroTipo(tipo: TipoFiltroBusq): void {
    if (this.filtroTipoBusq() === tipo) return;
    this.filtroTipoBusq.set(tipo);
    this.carteraExpandidaId.set(null);
    if (this.puedeBuscar()) {
      void this.lanzarBusqueda();
    }
  }

  buscarEjemplo(texto: string): void {
    this.consultaBusqueda = texto;
    this.filtroTipoBusq.set('todos');
    void this.lanzarBusqueda();
  }

  limpiarBusqueda(): void {
    if (this.temporizadorBusqueda) {
      clearTimeout(this.temporizadorBusqueda);
      this.temporizadorBusqueda = null;
    }
    this.secuenciaBusqueda++;
    this.consultaBusqueda = '';
    this.resultadosBusqueda.set([]);
    this.carteraExpandidaId.set(null);
    this.cargandoDetalleId.set(null);
    this.busquedaRealizada.set(false);
    this.errorBusqueda.set(false);
  }

  cambiarActivoVinculado(): void {
    this.activoSeleccionado.set(null);
    this.busquedaRealizada.set(false);
    this.errorBusqueda.set(false);
  }

  async lanzarBusqueda(): Promise<void> {
    if (this.temporizadorBusqueda) {
      clearTimeout(this.temporizadorBusqueda);
      this.temporizadorBusqueda = null;
    }
    if (!this.puedeBuscar()) return;
    const q = this.consultaBusqueda.trim();
    const seq = ++this.secuenciaBusqueda;
    const tipo = this.filtroTipoBusq();
    this.buscando.set(true);
    this.busquedaRealizada.set(true);
    this.errorBusqueda.set(false);
    this.ultimaConsulta.set(q);
    this.carteraExpandidaId.set(null);
    try {
      const res = await this.store.buscarProductos(q, tipo);
      if (seq !== this.secuenciaBusqueda) return;
      this.resultadosBusqueda.set(res);
    } catch {
      if (seq !== this.secuenciaBusqueda) return;
      this.resultadosBusqueda.set([]);
      this.errorBusqueda.set(true);
    } finally {
      if (seq === this.secuenciaBusqueda) {
        this.buscando.set(false);
      }
    }
  }

  async alternarDetalleCartera(r: ResultadoBusqueda): Promise<void> {
    const id = this.claveCartera(r);
    if (!id) return;
    if (this.carteraExpandidaId() === id) {
      this.carteraExpandidaId.set(null);
      return;
    }
    this.carteraExpandidaId.set(id);
    if (this.detallesCartera()[id]) return;

    this.cargandoDetalleId.set(id);
    try {
      const det = await this.store.obtenerDetalleCarteraModelo(id);
      if (det) {
        this.detallesCartera.update((prev) => ({ ...prev, [id]: det }));
      }
    } finally {
      if (this.cargandoDetalleId() === id) {
        this.cargandoDetalleId.set(null);
      }
    }
  }

  seleccionar(r: ResultadoBusqueda): void {
    this.activoSeleccionado.set(r);
    this.resultadosBusqueda.set([]);
    this.carteraExpandidaId.set(null);
    this.resultadoSeleccionado.emit(r);
  }

  seleccionarAlternativa(base: ResultadoBusqueda, alt: CotizacionAlternativa): void {
    this.seleccionar({
      ...base,
      fuente: alt.fuente,
      codigo: alt.codigo,
      ticker: alt.ticker || alt.codigo,
      mercado: alt.mercado,
      moneda: alt.moneda,
      precio: alt.precio,
      fecha: alt.fecha,
      cambioDia: alt.cambioDia,
      rentabilidad1a: alt.rentabilidad1a ?? base.rentabilidad1a,
    });
  }

  elegirComponenteCartera(cartera: ResultadoBusqueda, comp: ComponenteCarteraModelo): void {
    if (!comp.fuente || !comp.codigo) return;
    const entidad =
      this.entidadActual().trim() ||
      cartera.entidadSugerida ||
      cartera.ficha?.gestora ||
      undefined;
    this.seleccionar({
      fuente: comp.fuente,
      codigo: comp.codigo,
      nombre: comp.nombre,
      tipo: comp.tipo || 'fondo',
      identificador: comp.isin,
      isin: comp.isin,
      politica: comp.politica,
      rentabilidad1a: comp.rentabilidad1a,
      mercado: cartera.mercado || undefined,
      precio: comp.precio ?? 0,
      fecha: comp.fecha || cartera.fecha,
      moneda: comp.moneda || 'EUR',
      entidadSugerida: entidad,
      ficha: {
        ter: comp.ter ?? undefined,
        riesgo: comp.riesgo ?? undefined,
        clase: comp.clase || comp.categoria || undefined,
        gestora: comp.gestora || undefined,
      },
    });
  }

  async elegirPlanDeCartera(r: ResultadoBusqueda): Promise<void> {
    if (!r.planSecId) return;
    const det = this.detalleCartera(r);
    const res = await this.store.buscarProductos(r.planSecId, 'pension');
    const exacto =
      res.find((x) => x.codigo.toUpperCase() === r.planSecId!.toUpperCase()) || res[0];
    if (exacto) {
      this.seleccionar({
        ...exacto,
        entidadSugerida: exacto.entidadSugerida || r.entidadSugerida,
        carteraId: exacto.carteraId || r.carteraId,
        numComponentes: exacto.numComponentes || det?.componentes?.length || r.numComponentes,
      });
      return;
    }
    this.seleccionar({
      ...r,
      fuente: 'morningstar',
      codigo: r.planSecId,
      tipo: 'pension',
      identificador: r.planSecId,
    });
  }

  async importarCarteraCompleta(r: ResultadoBusqueda): Promise<void> {
    if (this.importandoCartera()) return;
    const entidad =
      this.entidadActual().trim() || r.entidadSugerida || r.ficha?.gestora || '';
    const faltan = this.componentesParaAgrupar(r);
    if (!faltan.length) return;

    const grupoId = this.claveCartera(r);
    const grupoNombre = r.nombre;

    const usados = new Set((this.store.cartera()?.productos || []).map((p) => p.slot ?? 0));
    const asignarSlot = (): number => {
      for (let s = 1; s <= 12; s++) {
        if (!usados.has(s)) {
          usados.add(s);
          return s;
        }
      }
      return (usados.size % 12) + 1;
    };

    const payloads: Partial<ProductoCfg>[] = faltan.map((comp) => {
      const tipo = comp.tipo || 'fondo';
      const clase =
        (comp.clase || comp.categoria || '').trim() || inferirClaseProducto(tipo, comp.nombre);
      return {
        nombre: comp.nombre,
        corto: generarNombreCortoProducto(comp.nombre, comp.isin),
        tipo,
        identificador: comp.isin,
        fuente: comp.fuente || 'morningstar',
        codigo: comp.codigo || '',
        moneda: comp.moneda || 'EUR',
        entidad,
        clase,
        gestora: comp.gestora || '',
        ter: comp.ter ?? null,
        riesgo: comp.riesgo ?? null,
        slot: asignarSlot(),
        largoPlazo: inferirLargoPlazoProducto(tipo, clase),
        grupoId,
        grupoNombre,
        pesoObjetivo: comp.peso ?? null,
        vivo: '',
        papel: '',
      };
    });

    this.importandoCartera.set(true);
    try {
      const res = await this.store.guardarProductosLote(payloads, {
        entidad: entidad || undefined,
        grupoId,
        grupoNombre,
      });
      if (res) {
        if (entidad) {
          const sel = this.bancoSeleccionado();
          void this.store.registrarUsoBanco(
            sel && sel.nombre.trim().toLowerCase() === entidad.toLowerCase()
              ? sel
              : { nombre: entidad },
          );
        }
        this.carteraImportada.emit({ grupoId, grupoNombre });
      }
    } finally {
      this.importandoCartera.set(false);
    }
  }
}
