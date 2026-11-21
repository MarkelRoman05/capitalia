import {
  Component,
  ElementRef,
  OnDestroy,
  computed,
  inject,
  input,
  model,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { EntidadBanco } from '../../../models/portfolio.model';
import { PortfolioStoreService } from '../../../services/portfolio-store.service';

function normalizarTexto(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

@Component({
  selector: 'cap-banco-selector',
  host: {
    '(document:click)': 'alClicDocumento($event)',
    '(document:keydown.escape)': 'alEscape($event)',
  },
  template: `
    <div class="banco-sel" [class.abierto]="abierto()">
      <div class="banco-sel-trigger-wrap">
        <button
          type="button"
          class="banco-sel-trigger"
          [attr.aria-expanded]="abierto()"
          aria-haspopup="listbox"
          (click)="alternar()"
        >
          @if (opcionSeleccionada(); as sel) {
            <span class="banco-logo-frame" aria-hidden="true">
              @if (sel.logo && !logosFallidos().has(sel.logo)) {
                <img
                  class="banco-logo-img"
                  [src]="sel.logo"
                  [alt]="sel.nombre"
                  (error)="alErrorLogo($event, sel)"
                />
              } @else {
                <svg
                  class="banco-logo-fallback"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.85"
                >
                  <path d="M3 10h18M5 10v8m4-8v8m6-8v8m4-8v8M2 20h20M12 3l10 5H2l10-5Z" />
                </svg>
              }
            </span>
            <span class="banco-sel-val">
              <strong>{{ sel.nombre }}</strong>
              <small>{{ sel.categoria || sel.dominio || 'Entidad' }}</small>
            </span>
          } @else {
            <span class="banco-logo-frame banco-logo-vacio" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85">
                <path d="M3 10h18M5 10v8m4-8v8m6-8v8m4-8v8M2 20h20M12 3l10 5H2l10-5Z" />
              </svg>
            </span>
            <span class="banco-sel-placeholder">Seleccionar banco, bróker o entidad…</span>
          }

          <svg class="banco-sel-caret" viewBox="0 0 12 12" aria-hidden="true">
            <path
              d="M2.5 4.5 6 8l3.5-3.5"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </button>

        @if (valor().trim()) {
          <button
            type="button"
            class="banco-sel-clear"
            (click)="limpiar($event)"
            aria-label="Quitar banco seleccionado"
            title="Limpiar"
          >
            ✕
          </button>
        }
      </div>

      @if (abierto()) {
        <div class="banco-sel-dropdown" role="listbox" aria-label="Lista de bancos y entidades">
          <div class="banco-sel-search">
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
              #buscadorInput
              type="text"
              [value]="filtro()"
              (input)="alEscribirFiltro($any($event.target).value)"
              (keydown.enter)="$event.preventDefault(); seleccionarPrimeraOCustom()"
              placeholder="Buscar cualquier banco o bróker (BBVA, MyInvestor, Trade Republic…)"
            />
            @if (filtro()) {
              <button
                type="button"
                class="banco-sel-search-clear"
                (click)="alEscribirFiltro('')"
                aria-label="Borrar búsqueda"
              >
                ✕
              </button>
            }
          </div>

          <div class="banco-sel-list">
            @if (!filtro().trim() && recientesLista().length) {
              <div class="banco-sel-group">Usados recientemente</div>
              @for (item of recientesLista(); track 'rec-' + item.nombre) {
                <button
                  type="button"
                  role="option"
                  class="banco-sel-opt"
                  [class.on]="esSeleccionada(item.nombre)"
                  [attr.aria-selected]="esSeleccionada(item.nombre)"
                  (click)="elegir(item)"
                >
                  <span class="banco-logo-frame" aria-hidden="true">
                    @if (item.logo && !logosFallidos().has(item.logo)) {
                      <img
                        class="banco-logo-img"
                        [src]="item.logo"
                        [alt]="item.nombre"
                        loading="lazy"
                        (error)="alErrorLogo($event, item)"
                      />
                    } @else {
                      <svg
                        class="banco-logo-fallback"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.85"
                      >
                        <path d="M3 10h18M5 10v8m4-8v8m6-8v8m4-8v8M2 20h20M12 3l10 5H2l10-5Z" />
                      </svg>
                    }
                  </span>
                  <span class="banco-sel-opt-main">
                    <strong>{{ item.nombre }}</strong>
                  </span>
                  <span class="banco-sel-opt-cat">{{
                    item.categoria || item.dominio || 'Reciente'
                  }}</span>
                  @if (esSeleccionada(item.nombre)) {
                    <span class="banco-sel-check" aria-hidden="true">✓</span>
                  }
                </button>
              }
              <div class="banco-sel-group">Lista de entidades bancarias</div>
            }

            @if (filtro().trim().length >= 2) {
              @if (buscandoOnline()) {
                <div class="banco-sel-loading">
                  <span class="girando" aria-hidden="true">↻</span>
                  <span>Buscando bancos y logos en la base de datos y online…</span>
                </div>
              } @else if (onlineFiltradas().length) {
                <div class="banco-sel-group">Resultados online</div>
                @for (item of onlineFiltradas(); track 'on-' + (item.dominio || item.nombre)) {
                  <button
                    type="button"
                    role="option"
                    class="banco-sel-opt"
                    [class.on]="esSeleccionada(item.nombre)"
                    [attr.aria-selected]="esSeleccionada(item.nombre)"
                    (click)="elegir(item)"
                  >
                    <span class="banco-logo-frame" aria-hidden="true">
                      @if (item.logo && !logosFallidos().has(item.logo)) {
                        <img
                          class="banco-logo-img"
                          [src]="item.logo"
                          [alt]="item.nombre"
                          loading="lazy"
                          (error)="alErrorLogo($event, item)"
                        />
                      } @else {
                        <svg
                          class="banco-logo-fallback"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="1.85"
                        >
                          <path d="M3 10h18M5 10v8m4-8v8m6-8v8m4-8v8M2 20h20M12 3l10 5H2l10-5Z" />
                        </svg>
                      }
                    </span>
                    <span class="banco-sel-opt-main">
                      <strong>{{ item.nombre }}</strong>
                    </span>
                    <span class="banco-sel-opt-cat">{{ item.dominio || item.categoria }}</span>
                    @if (esSeleccionada(item.nombre)) {
                      <span class="banco-sel-check" aria-hidden="true">✓</span>
                    }
                  </button>
                }
              }
            }

            @if (catalogoVisible().length && filtro().trim().length >= 2 && onlineFiltradas().length) {
              <div class="banco-sel-group">En base de datos</div>
            }

            @for (item of catalogoVisible(); track 'db-' + item.nombre) {
              <button
                type="button"
                role="option"
                class="banco-sel-opt"
                [class.on]="esSeleccionada(item.nombre)"
                [attr.aria-selected]="esSeleccionada(item.nombre)"
                (click)="elegir(item)"
              >
                <span class="banco-logo-frame" aria-hidden="true">
                  @if (item.logo && !logosFallidos().has(item.logo)) {
                    <img
                      class="banco-logo-img"
                      [src]="item.logo"
                      [alt]="item.nombre"
                      loading="lazy"
                      (error)="alErrorLogo($event, item)"
                    />
                  } @else {
                    <svg
                      class="banco-logo-fallback"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.85"
                    >
                      <path d="M3 10h18M5 10v8m4-8v8m6-8v8m4-8v8M2 20h20M12 3l10 5H2l10-5Z" />
                    </svg>
                  }
                </span>
                <span class="banco-sel-opt-main">
                  <strong>{{ item.nombre }}</strong>
                </span>
                <span class="banco-sel-opt-cat">{{ item.categoria || item.dominio }}</span>
                @if (esSeleccionada(item.nombre)) {
                  <span class="banco-sel-check" aria-hidden="true">✓</span>
                }
              </button>
            }

            @if (mostrarOpcionCustom()) {
              <button
                type="button"
                class="banco-sel-opt banco-sel-custom"
                (click)="elegir({ nombre: filtro().trim(), categoria: 'Entidad personalizada' })"
              >
                <span class="banco-logo-frame banco-logo-custom" aria-hidden="true">+</span>
                <span class="banco-sel-opt-main">
                  Usar «<strong>{{ filtro().trim() }}</strong>» como entidad personalizada
                </span>
              </button>
            } @else if (!catalogoVisible().length && !onlineFiltradas().length && !buscandoOnline()) {
              <div class="banco-sel-empty">
                {{
                  filtro().trim().length < 2 && !store.bancosCatalogo().length
                    ? 'Escribe al menos 2 letras para buscar bancos o entidades.'
                    : 'No se encontraron bancos con ese nombre.'
                }}
              </div>
            }
          </div>
        </div>
      }
    </div>
  `,
})
export class BancoSelectorComponent implements OnDestroy {
  private readonly hostRef = inject(ElementRef<HTMLElement>);
  readonly store = inject(PortfolioStoreService);
  private readonly buscadorInput = viewChild<ElementRef<HTMLInputElement>>('buscadorInput');

  readonly valor = model<string>('');
  readonly entidadesCartera = input<string[]>([]);
  readonly entidadSeleccionada = output<EntidadBanco | null>();

  readonly abierto = signal(false);
  readonly filtro = signal('');
  readonly buscandoOnline = signal(false);
  readonly resultadosDbBusqueda = signal<EntidadBanco[] | null>(null);
  readonly resultadosOnline = signal<EntidadBanco[]>([]);
  readonly logosFallidos = signal<Set<string>>(new Set());
  private readonly seleccionLocal = signal<EntidadBanco | null>(null);

  private temporizadorDebounce: ReturnType<typeof setTimeout> | null = null;
  private peticionActualId = 0;

  constructor() {
    void this.store.cargarBancosIniciales();
  }

  private readonly mapaConocidas = computed<Map<string, EntidadBanco>>(() => {
    const mapa = new Map<string, EntidadBanco>();
    const agregar = (e: EntidadBanco | null | undefined) => {
      if (!e?.nombre) return;
      const k = normalizarTexto(e.nombre);
      const prev = mapa.get(k);
      if (!prev || (!prev.logo && e.logo)) {
        mapa.set(k, e);
      }
    };
    for (const e of this.store.bancosCatalogo()) agregar(e);
    for (const e of this.store.bancosRecientes()) agregar(e);
    for (const e of this.resultadosDbBusqueda() || []) agregar(e);
    for (const e of this.resultadosOnline()) agregar(e);
    agregar(this.seleccionLocal());
    return mapa;
  });

  readonly opcionSeleccionada = computed<EntidadBanco | null>(() => {
    const actual = this.valor().trim();
    if (!actual) return null;
    return (
      this.mapaConocidas().get(normalizarTexto(actual)) || {
        nombre: actual,
        categoria: 'Entidad',
      }
    );
  });

  readonly recientesLista = computed<EntidadBanco[]>(() => {
    const mapa = this.mapaConocidas();
    const vistos = new Set<string>();
    const lista: EntidadBanco[] = [];

    for (const r of this.store.bancosRecientes()) {
      const k = normalizarTexto(r.nombre);
      if (!k || vistos.has(k)) continue;
      vistos.add(k);
      lista.push(r);
      if (lista.length >= 6) break;
    }

    if (lista.length < 6) {
      for (const nombre of this.entidadesCartera()) {
        const k = normalizarTexto(nombre);
        if (!k || vistos.has(k)) continue;
        vistos.add(k);
        lista.push(mapa.get(k) || { nombre: nombre.trim(), categoria: 'En tu cartera' });
        if (lista.length >= 6) break;
      }
    }
    return lista;
  });

  readonly catalogoVisible = computed<EntidadBanco[]>(() => {
    const q = normalizarTexto(this.filtro());
    if (!q) return this.store.bancosCatalogo();
    const dbRes = this.resultadosDbBusqueda();
    if (dbRes && q.length >= 2) return dbRes;
    return this.store.bancosCatalogo().filter(
      (e) =>
        normalizarTexto(e.nombre).includes(q) ||
        (e.dominio && normalizarTexto(e.dominio).includes(q)) ||
        (e.categoria && normalizarTexto(e.categoria).includes(q)),
    );
  });

  readonly onlineFiltradas = computed<EntidadBanco[]>(() => {
    const locales = new Set(this.catalogoVisible().map((x) => normalizarTexto(x.nombre)));
    const dominiosLocales = new Set(
      this.catalogoVisible()
        .map((x) => x.dominio?.toLowerCase())
        .filter((d): d is string => Boolean(d)),
    );
    return this.resultadosOnline().filter(
      (x) =>
        !locales.has(normalizarTexto(x.nombre)) &&
        (!x.dominio || !dominiosLocales.has(x.dominio.toLowerCase())),
    );
  });

  readonly mostrarOpcionCustom = computed<boolean>(() => {
    const q = this.filtro().trim();
    if (!q) return false;
    const norm = normalizarTexto(q);
    return (
      !this.catalogoVisible().some((op) => normalizarTexto(op.nombre) === norm) &&
      !this.onlineFiltradas().some((op) => normalizarTexto(op.nombre) === norm)
    );
  });

  ngOnDestroy(): void {
    if (this.temporizadorDebounce) clearTimeout(this.temporizadorDebounce);
  }

  alErrorLogo(ev: Event, item: EntidadBanco): void {
    const img = ev.target as HTMLImageElement | null;
    if (img && item.dominio && !img.dataset['fallback']) {
      img.dataset['fallback'] = '1';
      img.src = `https://icon.horse/icon/${encodeURIComponent(item.dominio)}`;
      return;
    }
    if (item.logo) {
      this.marcarLogoFallido(item.logo);
    }
  }

  marcarLogoFallido(url: string): void {
    if (!url) return;
    this.logosFallidos.update((prev) => {
      if (prev.has(url)) return prev;
      const next = new Set(prev);
      next.add(url);
      return next;
    });
  }

  alternar(): void {
    const next = !this.abierto();
    this.abierto.set(next);
    if (next) {
      void this.store.cargarBancosIniciales(true);
      this.filtro.set('');
      this.resultadosDbBusqueda.set(null);
      this.resultadosOnline.set([]);
      this.buscandoOnline.set(false);
      setTimeout(() => {
        this.buscadorInput()?.nativeElement.focus();
      });
    }
  }

  alEscribirFiltro(valor: string): void {
    this.filtro.set(valor);
    if (this.temporizadorDebounce) {
      clearTimeout(this.temporizadorDebounce);
      this.temporizadorDebounce = null;
    }

    const q = valor.trim();
    if (q.length < 2) {
      this.peticionActualId++;
      this.resultadosDbBusqueda.set(null);
      this.resultadosOnline.set([]);
      this.buscandoOnline.set(false);
      return;
    }

    const id = ++this.peticionActualId;
    this.buscandoOnline.set(true);
    this.temporizadorDebounce = setTimeout(() => {
      void this.consultarBancos(q, id);
    }, 280);
  }

  private async consultarBancos(q: string, id: number): Promise<void> {
    try {
      const res = await this.store.buscarBancos(q);
      if (id !== this.peticionActualId) return;
      this.resultadosDbBusqueda.set(res.entidades);
      this.resultadosOnline.set(res.online);
    } catch {
      if (id === this.peticionActualId) {
        this.resultadosDbBusqueda.set(null);
        this.resultadosOnline.set([]);
      }
    } finally {
      if (id === this.peticionActualId) {
        this.buscandoOnline.set(false);
      }
    }
  }

  elegir(op: EntidadBanco): void {
    this.seleccionLocal.set(op);
    this.valor.set(op.nombre);
    this.entidadSeleccionada.emit(op);
    this.abierto.set(false);
    this.filtro.set('');
    this.resultadosDbBusqueda.set(null);
    this.resultadosOnline.set([]);
  }

  limpiar(ev: Event): void {
    ev.stopPropagation();
    this.seleccionLocal.set(null);
    this.valor.set('');
    this.entidadSeleccionada.emit(null);
  }

  esSeleccionada(nombre: string): boolean {
    const actual = normalizarTexto(this.valor());
    return Boolean(actual) && actual === normalizarTexto(nombre);
  }

  seleccionarPrimeraOCustom(): void {
    const online = this.onlineFiltradas();
    const locales = this.catalogoVisible();
    if (locales.length) {
      this.elegir(locales[0]);
    } else if (online.length) {
      this.elegir(online[0]);
    } else if (this.mostrarOpcionCustom()) {
      this.elegir({ nombre: this.filtro().trim(), categoria: 'Entidad personalizada' });
    }
  }

  alClicDocumento(ev: Event): void {
    if (!this.abierto()) return;
    const target = ev.target as Node | null;
    if (target && !this.hostRef.nativeElement.contains(target)) {
      this.abierto.set(false);
    }
  }

  alEscape(ev: Event): void {
    if (!this.abierto()) return;
    ev.stopPropagation();
    this.abierto.set(false);
  }
}
