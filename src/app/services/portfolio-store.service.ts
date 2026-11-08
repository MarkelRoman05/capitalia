import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
  CarteraConfig,
  CopiaSeguridad,
  DatosPanel,
  InformeImportacion,
  MetricasCalculadas,
  MovimientoCfg,
  ProductoCalculado,
  ProductoCfg,
  RespuestaAuthYo,
  ResultadoBusqueda,
  Usuario,
  ValoracionCfg,
} from '../models/portfolio.model';
import { FormatService } from './format.service';

export type TabId = 'patrimonio' | 'mes' | 'fondos' | 'rendimiento' | 'datos' | 'ayuda';
export type RangoId = '1m' | '3m' | '6m' | 'ytd' | '1a' | 'todo';
export type VistaEvolucionId = 'apilado' | 'total' | 'dinero' | 'reparto';
export type AgrupacionDistId = 'clase' | 'producto' | 'entidad' | 'tipo';

export interface ConfirmacionDialog {
  titulo: string;
  mensaje: string;
  textoConfirmar: string;
  peligro?: boolean;
  accion: () => void | Promise<void>;
}

@Injectable({ providedIn: 'root' })
export class PortfolioStoreService {
  private readonly http = inject(HttpClient);
  private readonly fmt = inject(FormatService);

  // Auth state
  readonly cargandoInicial = signal<boolean>(true);
  readonly autenticado = signal<boolean>(false);
  readonly modoAuth = signal<'local' | 'nube'>('nube');
  readonly usuario = signal<Usuario | null>(null);

  // Data state
  readonly datos = signal<DatosPanel | null>(null);
  readonly cartera = signal<CarteraConfig | null>(null);
  readonly tipos = signal<Record<string, [string, string]>>({});
  readonly fuentes = signal<string[]>([]);
  readonly tiposMovimiento = signal<string[]>([]);
  readonly copias = signal<CopiaSeguridad[]>([]);

  // Notifications & Dialogs (No native alert/confirm)
  readonly errorGlobal = signal<string | null>(null);
  readonly mensajeExito = signal<string | null>(null);
  readonly actualizandoPrecios = signal<boolean>(false);
  readonly confirmacionActiva = signal<ConfirmacionDialog | null>(null);
  readonly modalObjetivoAbierto = signal<boolean>(false);

  // UI state
  readonly tabActiva = signal<TabId>('patrimonio');
  readonly subTabDatos = signal<'productos' | 'movimientos' | 'saldos' | 'importar' | 'copias'>('productos');
  readonly tema = signal<'oscuro' | 'claro'>('oscuro');
  readonly modoVideo = signal<boolean>(false);
  readonly rango = signal<RangoId>('todo');
  readonly vistaEvolucion = signal<VistaEvolucionId>('apilado');
  readonly agrupacionDist = signal<AgrupacionDistId>('clase');
  readonly ocultos = signal<Set<string>>(new Set<string>());
  readonly productoSeleccionadoId = signal<string | null>(null);
  readonly mesSeleccionadoIdx = signal<number>(-1);
  readonly compRef = signal<string>('msci_world');
  readonly btcVivo = signal<number | null>(null);

  private temporizadorMensaje: ReturnType<typeof setTimeout> | null = null;
  private intervaloVivo: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.inicializarTema();
  }

  private inicializarTema(): void {
    try {
      const guardado = localStorage.getItem('capitalia-tema');
      if (guardado === 'claro' || guardado === 'oscuro') {
        this.tema.set(guardado);
      }
      const videoGuardado = localStorage.getItem('capitalia-video');
      if (videoGuardado === '1') {
        this.modoVideo.set(true);
      }
    } catch {
      // Ignore storage access errors
    }
    this.aplicarAtributosDocumento();
  }

  aplicarAtributosDocumento(): void {
    if (typeof document === 'undefined') return;
    document.documentElement.setAttribute('data-theme', this.tema());
    document.documentElement.setAttribute('data-video', this.modoVideo() ? '1' : '0');
  }

  alternarTema(): void {
    const nuevo = this.tema() === 'oscuro' ? 'claro' : 'oscuro';
    this.tema.set(nuevo);
    try {
      localStorage.setItem('capitalia-tema', nuevo);
    } catch {
      // ignore
    }
    this.aplicarAtributosDocumento();
  }

  alternarModoVideo(): void {
    const nuevo = !this.modoVideo();
    this.modoVideo.set(nuevo);
    try {
      localStorage.setItem('capitalia-video', nuevo ? '1' : '0');
    } catch {
      // ignore
    }
    this.aplicarAtributosDocumento();
  }

  notificarExito(msg: string): void {
    this.mensajeExito.set(msg);
    this.errorGlobal.set(null);
    if (this.temporizadorMensaje) clearTimeout(this.temporizadorMensaje);
    this.temporizadorMensaje = setTimeout(() => {
      this.mensajeExito.set(null);
    }, 4500);
  }

  notificarError(msg: string): void {
    this.errorGlobal.set(msg);
    if (this.temporizadorMensaje) clearTimeout(this.temporizadorMensaje);
    this.temporizadorMensaje = setTimeout(() => {
      this.errorGlobal.set(null);
    }, 7000);
  }

  pedirConfirmacion(dialogo: ConfirmacionDialog): void {
    this.confirmacionActiva.set(dialogo);
  }

  cerrarConfirmacion(): void {
    this.confirmacionActiva.set(null);
  }

  async ejecutarConfirmacion(): Promise<void> {
    const diag = this.confirmacionActiva();
    this.confirmacionActiva.set(null);
    if (diag) {
      await diag.accion();
    }
  }

  // Computed signals matching app.js 100%
  readonly todosComponentes = computed<ProductoCalculado[]>(() => {
    const d = this.datos();
    if (!d) return [];
    const prods = d.productos || [];
    const otros = d.otrosActivos || [];
    const pasivos = d.pasivos || [];
    return [...prods, ...otros, ...pasivos].map((c, idx) => {
      const slot = c.slot !== undefined ? c.slot : idx;
      const color = c.slotColor || c.color || this.fmt.colorDeSlot(slot);
      return { ...c, slot, color };
    });
  });

  readonly visibles = computed<ProductoCalculado[]>(() => {
    const oc = this.ocultos();
    return this.todosComponentes().filter((c) => !oc.has(c.id));
  });

  readonly filtrando = computed<boolean>(() => {
    const todos = this.todosComponentes();
    const vis = this.visibles();
    return vis.length < todos.length && vis.length > 0;
  });

  readonly carteraVacia = computed<boolean>(() => {
    const d = this.datos();
    if (!d) return false;
    return (
      (d.productos?.length || 0) === 0 &&
      (d.otrosActivos?.length || 0) === 0 &&
      (d.pasivos?.length || 0) === 0
    );
  });

  readonly metricasTodo = computed<MetricasCalculadas>(() => {
    return this.calcularMetricas(this.todosComponentes());
  });

  readonly metricasVisibles = computed<MetricasCalculadas>(() => {
    const vis = this.visibles();
    return this.calcularMetricas(vis.length ? vis : this.todosComponentes());
  });

  readonly desdeIdx = computed<number>(() => {
    const d = this.datos();
    if (!d || !d.fechas || !d.fechas.length) return 0;
    const r = this.rango();
    const n = d.fechas.length;
    if (r === 'todo') return 0;
    const ultima = new Date(d.fechas[n - 1] + 'T00:00:00');
    let corte: Date;
    if (r === '1m') {
      corte = new Date(ultima);
      corte.setMonth(corte.getMonth() - 1);
    } else if (r === '3m') {
      corte = new Date(ultima);
      corte.setMonth(corte.getMonth() - 3);
    } else if (r === '6m') {
      corte = new Date(ultima);
      corte.setMonth(corte.getMonth() - 6);
    } else if (r === '1a') {
      corte = new Date(ultima);
      corte.setFullYear(corte.getFullYear() - 1);
    } else if (r === 'ytd') {
      corte = new Date(ultima.getFullYear(), 0, 1);
    } else {
      return 0;
    }
    const iso = corte.toISOString().slice(0, 10);
    const idx = d.fechas.findIndex((f) => f >= iso);
    return idx < 0 ? 0 : idx;
  });

  readonly fechasCortadas = computed<string[]>(() => {
    const d = this.datos();
    if (!d || !d.fechas) return [];
    return d.fechas.slice(this.desdeIdx());
  });

  // Client-side XIRR calculation (exact Newton-Raphson + fallback bisection from app.js)
  xirr(flujos: [string, number][]): number | null {
    if (!flujos || flujos.length < 2) return null;
    const tienePos = flujos.some((f) => f[1] > 0);
    const tieneNeg = flujos.some((f) => f[1] < 0);
    if (!tienePos || !tieneNeg) return null;

    const t0 = new Date(flujos[0][0] + 'T00:00:00').getTime();
    const puntos = flujos.map(([f, imp]) => [
      (new Date(f + 'T00:00:00').getTime() - t0) / (86400000 * 365.25),
      imp,
    ]);

    const npv = (r: number) =>
      puntos.reduce((s, [t, cf]) => s + cf / Math.pow(1 + r, t), 0);
    const dnpv = (r: number) =>
      puntos.reduce(
        (s, [t, cf]) => (t === 0 ? s : s - (t * cf) / Math.pow(1 + r, t + 1)),
        0
      );

    let r = 0.1;
    for (let i = 0; i < 100; i++) {
      if (r <= -0.99) r = -0.99;
      const f = npv(r);
      if (Math.abs(f) < 1e-6) return r;
      const df = dnpv(r);
      if (Math.abs(df) < 1e-12) break;
      const nr = r - f / df;
      if (Math.abs(nr - r) < 1e-7) return nr;
      r = Math.max(-0.99, Math.min(10, nr));
    }
    return null;
  }

  calcularMetricas(lista: ProductoCalculado[]): MetricasCalculadas {
    const d = this.datos();
    const fechas = d?.fechas || [];
    const n = fechas.length;
    const serie = new Array<number>(n).fill(0);
    const serieAportado = new Array<number>(n).fill(0);

    let valor = 0;
    let aportado = 0;
    let valorConCoste = 0;
    const flujos: [string, number][] = [];
    let numAportaciones = 0;
    const mesesConAportacion = new Set<string>();

    for (const c of lista) {
      valor += c.valor || 0;
      if (c.aportado !== null && c.aportado !== undefined) {
        aportado += c.aportado;
        valorConCoste += c.valor;
      }
      for (let i = 0; i < n; i++) {
        serie[i] += c.serie?.[i] || 0;
        if (c.serieAportado) {
          serieAportado[i] += c.serieAportado[i] || 0;
        }
      }
      if (c.flujos && c.flujos.length) {
        for (const fl of c.flujos) {
          flujos.push(fl);
        }
      }
      if (c.aportaciones && c.aportaciones.length) {
        for (const a of c.aportaciones) {
          if (a.importe > 0) {
            numAportaciones++;
            mesesConAportacion.add(a.fecha.slice(0, 7));
          }
        }
      }
    }

    if (flujos.length && valorConCoste > 0 && n > 0) {
      flujos.push([fechas[n - 1], valorConCoste]);
      flujos.sort((a, b) => a[0].localeCompare(b[0]));
    }

    const plusvalia = aportado > 0 ? valorConCoste - aportado : null;
    const rentabilidad =
      aportado > 0 && plusvalia !== null ? plusvalia / aportado : null;
    const tir =
      lista.length === 1 && lista[0].tir !== undefined
        ? lista[0].tir ?? null
        : this.xirr(flujos);

    let pico = 0;
    let caida = 0;
    let caidaFecha: string | null = null;
    for (let i = 0; i < n; i++) {
      if (serie[i] > pico) pico = serie[i];
      if (pico > 0) {
        const dd = (serie[i] - pico) / pico;
        if (dd < caida) {
          caida = dd;
          caidaFecha = fechas[i];
        }
      }
    }

    let primerIdx = serie.findIndex((v) => v > 0);
    if (primerIdx < 0) primerIdx = 0;
    const dias =
      n > 0
        ? Math.max(
            1,
            (new Date(fechas[n - 1]).getTime() -
              new Date(fechas[primerIdx]).getTime()) /
              86400000
          )
        : 1;
    const mesesActivos = Math.max(1, dias / 30.4375);
    const ritmo = aportado > 0 ? aportado / mesesActivos : 0;

    let racha = 0;
    if (mesesConAportacion.size && n > 0) {
      let [y, m] = fechas[n - 1].slice(0, 7).split('-').map(Number);
      while (
        mesesConAportacion.has(`${y}-${String(m).padStart(2, '0')}`)
      ) {
        racha++;
        m--;
        if (m === 0) {
          m = 12;
          y--;
        }
      }
    }

    return {
      valor,
      aportado,
      valorConCoste,
      plusvalia,
      rentabilidad,
      tir,
      numAportaciones,
      ritmo,
      racha,
      caida,
      caidaFecha,
      serie,
      serieAportado,
    };
  }

  // Filter visibility controls
  toggleComponente(id: string, solo = false): void {
    const todos = this.todosComponentes();
    const actual = new Set(this.ocultos());

    if (solo) {
      const otrosOcultos = todos
        .filter((c) => c.id !== id)
        .every((c) => actual.has(c.id));
      if (otrosOcultos && !actual.has(id)) {
        this.ocultos.set(new Set());
      } else {
        const nuevo = new Set<string>();
        todos.forEach((c) => {
          if (c.id !== id) nuevo.add(c.id);
        });
        this.ocultos.set(nuevo);
      }
      return;
    }

    if (actual.has(id)) {
      actual.delete(id);
    } else {
      actual.add(id);
      if (actual.size === todos.length) {
        actual.clear();
      }
    }
    this.ocultos.set(actual);
  }

  mostrarTodos(): void {
    this.ocultos.set(new Set());
  }

  filtrarLargoPlazo(): void {
    const todos = this.todosComponentes();
    const noLP = todos.filter((c) => !c.largoPlazo).map((c) => c.id);
    const actual = this.ocultos();
    const yaActivo =
      noLP.length > 0 &&
      noLP.every((id) => actual.has(id)) &&
      actual.size === noLP.length;

    if (yaActivo) {
      this.ocultos.set(new Set());
    } else {
      this.ocultos.set(new Set(noLP));
    }
  }

  esFiltroLargoPlazoActivo(): boolean {
    const todos = this.todosComponentes();
    const noLP = todos.filter((c) => !c.largoPlazo).map((c) => c.id);
    const actual = this.ocultos();
    return (
      noLP.length > 0 &&
      noLP.every((id) => actual.has(id)) &&
      actual.size === noLP.length
    );
  }

  irAProducto(id: string): void {
    this.productoSeleccionadoId.set(id);
    this.tabActiva.set('fondos');
  }

  // Initial load & Authentication
  async inicializarApp(): Promise<void> {
    this.cargandoInicial.set(true);
    try {
      const resp = await firstValueFrom(
        this.http.get<RespuestaAuthYo>('/api/auth/yo')
      );
      this.modoAuth.set(resp.modo);
      this.autenticado.set(resp.autenticado);
      this.usuario.set(resp.usuario);

      if (resp.autenticado) {
        await Promise.all([this.cargarPanel(), this.cargarCarteraConfig()]);
      }
    } catch {
      this.autenticado.set(false);
    } finally {
      this.cargandoInicial.set(false);
    }
  }

  async login(email: string, clave: string): Promise<boolean> {
    try {
      const resp = await firstValueFrom(
        this.http.post<{ ok: boolean; usuario: Usuario; error?: string }>(
          '/api/auth/login',
          { email, clave }
        )
      );
      if (resp.ok) {
        this.autenticado.set(true);
        this.usuario.set(resp.usuario);
        await Promise.all([this.cargarPanel(), this.cargarCarteraConfig()]);
        this.notificarExito(`Bienvenido de nuevo, ${resp.usuario.nombre || resp.usuario.email}`);
        return true;
      }
      return false;
    } catch (err: unknown) {
      const msg = this.extraerMensajeError(err, 'Credenciales incorrectas.');
      this.notificarError(msg);
      return false;
    }
  }

  async registro(
    nombre: string,
    email: string,
    clave: string
  ): Promise<boolean> {
    try {
      const resp = await firstValueFrom(
        this.http.post<{ ok: boolean; usuario: Usuario; error?: string }>(
          '/api/auth/registro',
          { nombre, email, clave }
        )
      );
      if (resp.ok) {
        this.autenticado.set(true);
        this.usuario.set(resp.usuario);
        await Promise.all([this.cargarPanel(), this.cargarCarteraConfig()]);
        this.notificarExito('Cuenta creada correctamente en Capitalia.');
        return true;
      }
      return false;
    } catch (err: unknown) {
      const msg = this.extraerMensajeError(err, 'No se pudo crear la cuenta.');
      this.notificarError(msg);
      return false;
    }
  }

  async logout(): Promise<void> {
    try {
      await firstValueFrom(this.http.post('/api/auth/logout', {}));
    } catch {
      // ignore
    }
    this.detenerPollingVivo();
    this.autenticado.set(false);
    this.usuario.set(null);
    this.datos.set(null);
    this.cartera.set(null);
  }

  // Portfolio & Dashboard API calls
  async cargarPanel(): Promise<void> {
    const panel = await firstValueFrom(this.http.get<DatosPanel>('/api/panel'));
    this.aplicarNuevoPanel(panel);
  }

  async cargarCarteraConfig(): Promise<void> {
    const resp = await firstValueFrom(
      this.http.get<{
        cartera: CarteraConfig;
        tipos: Record<string, [string, string]>;
        fuentes: string[];
        tiposMovimiento: string[];
        avisos: string[];
      }>('/api/cartera')
    );
    this.cartera.set(resp.cartera);
    this.tipos.set(resp.tipos || {});
    this.fuentes.set(resp.fuentes || []);
    this.tiposMovimiento.set(resp.tiposMovimiento || []);
  }

  private aplicarNuevoPanel(panel: DatosPanel): void {
    this.datos.set(panel);
    if (panel.productos?.length && !this.productoSeleccionadoId()) {
      this.productoSeleccionadoId.set(panel.productos[0].id);
    } else if (
      this.productoSeleccionadoId() &&
      !panel.productos?.some((p) => p.id === this.productoSeleccionadoId())
    ) {
      this.productoSeleccionadoId.set(panel.productos?.[0]?.id || null);
    }

    if (panel.resumenMensual?.length) {
      if (
        this.mesSeleccionadoIdx() < 0 ||
        this.mesSeleccionadoIdx() >= panel.resumenMensual.length
      ) {
        this.mesSeleccionadoIdx.set(panel.resumenMensual.length - 1);
      }
    }

    this.iniciarPollingVivo();
  }

  private iniciarPollingVivo(): void {
    this.detenerPollingVivo();
    const v = this.datos()?.vivo;
    if (!v) return;
    this.actualizarPrecioVivo();
    this.intervaloVivo = setInterval(() => {
      this.actualizarPrecioVivo();
    }, 60000);
  }

  private detenerPollingVivo(): void {
    if (this.intervaloVivo) {
      clearInterval(this.intervaloVivo);
      this.intervaloVivo = null;
    }
  }

  async actualizarPrecioVivo(): Promise<void> {
    const d = this.datos();
    const v = d?.vivo;
    if (!d || !v) return;
    const coin = v.coin || 'bitcoin';
    let eur: number | null = null;
    try {
      const r = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(coin)}&vs_currencies=eur`,
        { cache: 'no-store' }
      );
      const j = await r.json();
      eur = j?.[coin]?.eur ?? null;
    } catch {
      // Fallback to Binance for bitcoin
    }
    if (!eur && coin === 'bitcoin') {
      try {
        const r = await fetch(
          'https://api.binance.com/api/v3/ticker/price?symbol=BTCEUR',
          { cache: 'no-store' }
        );
        const j = await r.json();
        eur = parseFloat(j?.price);
      } catch {
        // ignore
      }
    }
    if (!eur || isNaN(eur)) return;
    this.btcVivo.set(eur);
  }

  async actualizarPrecios(): Promise<void> {
    if (this.actualizandoPrecios()) return;
    this.actualizandoPrecios.set(true);
    try {
      const resp = await firstValueFrom(
        this.http.post<{ ok: boolean; panel: DatosPanel }>('/api/actualizar', {})
      );
      if (resp.panel) {
        this.aplicarNuevoPanel(resp.panel);
      }
      await this.cargarCarteraConfig();
      this.notificarExito('Precios de mercado y series históricas actualizados.');
    } catch (err: unknown) {
      this.notificarError(
        this.extraerMensajeError(err, 'Error al actualizar precios.')
      );
    } finally {
      this.actualizandoPrecios.set(false);
    }
  }

  async guardarObjetivo(
    titular: string,
    importe: number,
    etiqueta: string,
    activo: boolean
  ): Promise<boolean> {
    try {
      const resp = await firstValueFrom(
        this.http.post<{ ok: boolean; panel: DatosPanel }>('/api/objetivo', {
          titular,
          importe,
          etiqueta,
          activo,
        })
      );
      if (resp.panel) this.aplicarNuevoPanel(resp.panel);
      await this.cargarCarteraConfig();
      this.notificarExito('Objetivo de patrimonio actualizado.');
      return true;
    } catch (err: unknown) {
      this.notificarError(
        this.extraerMensajeError(err, 'No se pudo guardar el objetivo.')
      );
      return false;
    }
  }

  async cargarEjemplo(): Promise<void> {
    try {
      this.actualizandoPrecios.set(true);
      const resp = await firstValueFrom(
        this.http.post<{ ok: boolean; panel: DatosPanel }>(
          '/api/cargar-ejemplo',
          {}
        )
      );
      if (resp.panel) this.aplicarNuevoPanel(resp.panel);
      await this.cargarCarteraConfig();
      this.notificarExito('Cartera de ejemplo cargada.');
    } catch (err: unknown) {
      this.notificarError(
        this.extraerMensajeError(err, 'Error al cargar cartera de ejemplo.')
      );
    } finally {
      this.actualizandoPrecios.set(false);
    }
  }

  async empezarConMiCartera(): Promise<void> {
    try {
      const resp = await firstValueFrom(
        this.http.post<{ ok: boolean; panel: DatosPanel }>('/api/empezar', {})
      );
      if (resp.panel) this.aplicarNuevoPanel(resp.panel);
      await this.cargarCarteraConfig();
      this.tabActiva.set('datos');
      this.notificarExito('Tu cartera personal está lista para editar.');
    } catch (err: unknown) {
      this.notificarError(
        this.extraerMensajeError(err, 'No se pudo inicializar la cartera.')
      );
    }
  }

  async reiniciarCartera(): Promise<void> {
    try {
      const resp = await firstValueFrom(
        this.http.post<{ ok: boolean; panel: DatosPanel }>('/api/reiniciar', {})
      );
      if (resp.panel) this.aplicarNuevoPanel(resp.panel);
      await this.cargarCarteraConfig();
      this.notificarExito(
        'Cartera vaciada (se ha guardado copia de seguridad previa).'
      );
    } catch (err: unknown) {
      this.notificarError(
        this.extraerMensajeError(err, 'No se pudo vaciar la cartera.')
      );
    }
  }

  // CRUD Productos
  async buscarProductos(q: string): Promise<ResultadoBusqueda[]> {
    const resp = await firstValueFrom(
      this.http.get<{ resultados: ResultadoBusqueda[] }>('/api/buscar', {
        params: { q },
      })
    );
    return resp.resultados || [];
  }

  async guardarProducto(
    prod: Partial<ProductoCfg>,
    idExistente?: string
  ): Promise<boolean> {
    try {
      const obs = idExistente
        ? this.http.put<{ ok: boolean; panel: DatosPanel }>(
            `/api/productos/${encodeURIComponent(idExistente)}`,
            prod
          )
        : this.http.post<{ ok: boolean; panel: DatosPanel }>(
            '/api/productos',
            prod
          );
      const resp = await firstValueFrom(obs);
      if (resp.panel) this.aplicarNuevoPanel(resp.panel);
      await this.cargarCarteraConfig();
      this.notificarExito(
        idExistente ? 'Producto actualizado.' : 'Producto añadido a la cartera.'
      );
      return true;
    } catch (err: unknown) {
      this.notificarError(
        this.extraerMensajeError(err, 'Error al guardar el producto.')
      );
      return false;
    }
  }

  async borrarProducto(id: string): Promise<boolean> {
    try {
      const resp = await firstValueFrom(
        this.http.delete<{ ok: boolean; panel: DatosPanel }>(
          `/api/productos/${encodeURIComponent(id)}`
        )
      );
      if (resp.panel) this.aplicarNuevoPanel(resp.panel);
      await this.cargarCarteraConfig();
      this.notificarExito('Producto eliminado.');
      return true;
    } catch (err: unknown) {
      this.notificarError(
        this.extraerMensajeError(err, 'No se pudo eliminar el producto.')
      );
      return false;
    }
  }

  async repartirColores(): Promise<void> {
    try {
      const resp = await firstValueFrom(
        this.http.post<{ ok: boolean; panel: DatosPanel }>(
          '/api/repartir-colores',
          {}
        )
      );
      if (resp.panel) this.aplicarNuevoPanel(resp.panel);
      await this.cargarCarteraConfig();
      this.notificarExito('Colores repartidos automáticamente.');
    } catch (err: unknown) {
      this.notificarError(
        this.extraerMensajeError(err, 'Error al repartir colores.')
      );
    }
  }

  // CRUD Movimientos
  async guardarMovimiento(
    mov: Partial<MovimientoCfg>,
    idExistente?: string
  ): Promise<boolean> {
    try {
      const obs = idExistente
        ? this.http.put<{ ok: boolean; panel: DatosPanel }>(
            `/api/movimientos/${encodeURIComponent(idExistente)}`,
            mov
          )
        : this.http.post<{ ok: boolean; panel: DatosPanel }>(
            '/api/movimientos',
            mov
          );
      const resp = await firstValueFrom(obs);
      if (resp.panel) this.aplicarNuevoPanel(resp.panel);
      await this.cargarCarteraConfig();
      this.notificarExito(
        idExistente ? 'Movimiento actualizado.' : 'Movimiento registrado.'
      );
      return true;
    } catch (err: unknown) {
      this.notificarError(
        this.extraerMensajeError(err, 'Error al guardar el movimiento.')
      );
      return false;
    }
  }

  async borrarMovimiento(id: string): Promise<boolean> {
    try {
      const resp = await firstValueFrom(
        this.http.delete<{ ok: boolean; panel: DatosPanel }>(
          `/api/movimientos/${encodeURIComponent(id)}`
        )
      );
      if (resp.panel) this.aplicarNuevoPanel(resp.panel);
      await this.cargarCarteraConfig();
      this.notificarExito('Movimiento eliminado.');
      return true;
    } catch (err: unknown) {
      this.notificarError(
        this.extraerMensajeError(err, 'No se pudo eliminar el movimiento.')
      );
      return false;
    }
  }

  // CRUD Valoraciones (Saldos y valores)
  async guardarValoracion(
    val:
      | Partial<ValoracionCfg>
      | { fecha: string; saldos: Partial<ValoracionCfg>[] },
    idExistente?: string
  ): Promise<boolean> {
    try {
      const obs = idExistente
        ? this.http.put<{ ok: boolean; panel: DatosPanel }>(
            `/api/valoraciones/${encodeURIComponent(idExistente)}`,
            val
          )
        : this.http.post<{ ok: boolean; panel: DatosPanel }>(
            '/api/valoraciones',
            val
          );
      const resp = await firstValueFrom(obs);
      if (resp.panel) this.aplicarNuevoPanel(resp.panel);
      await this.cargarCarteraConfig();
      this.notificarExito('Saldos guardados correctamente.');
      return true;
    } catch (err: unknown) {
      this.notificarError(
        this.extraerMensajeError(err, 'Error al guardar la valoración.')
      );
      return false;
    }
  }

  async borrarValoracion(id: string): Promise<boolean> {
    try {
      const resp = await firstValueFrom(
        this.http.delete<{ ok: boolean; panel: DatosPanel }>(
          `/api/valoraciones/${encodeURIComponent(id)}`
        )
      );
      if (resp.panel) this.aplicarNuevoPanel(resp.panel);
      await this.cargarCarteraConfig();
      this.notificarExito('Saldo eliminado.');
      return true;
    } catch (err: unknown) {
      this.notificarError(
        this.extraerMensajeError(err, 'No se pudo eliminar el saldo.')
      );
      return false;
    }
  }

  // Importación y Copias
  async previsualizarImportacion(
    payload: Record<string, unknown>
  ): Promise<InformeImportacion | null> {
    try {
      const resp = await firstValueFrom(
        this.http.post<{ ok: boolean; informe: InformeImportacion }>(
          '/api/importar/previsualizar',
          payload
        )
      );
      return resp.informe;
    } catch (err: unknown) {
      this.notificarError(
        this.extraerMensajeError(err, 'Error al analizar los archivos.')
      );
      return null;
    }
  }

  async confirmarImportacion(
    payload: Record<string, unknown>
  ): Promise<InformeImportacion | null> {
    try {
      const resp = await firstValueFrom(
        this.http.post<{
          ok: boolean;
          informe: InformeImportacion;
          panel: DatosPanel;
        }>('/api/importar/confirmar', payload)
      );
      if (resp.panel) this.aplicarNuevoPanel(resp.panel);
      await this.cargarCarteraConfig();
      this.notificarExito('Importación completada con éxito.');
      return resp.informe;
    } catch (err: unknown) {
      this.notificarError(
        this.extraerMensajeError(err, 'Error al confirmar la importación.')
      );
      return null;
    }
  }

  async obtenerPromptIA(): Promise<string> {
    const resp = await firstValueFrom(
      this.http.get<{ prompt: string }>('/api/prompt')
    );
    return resp.prompt || '';
  }

  async cargarCopias(): Promise<void> {
    try {
      const resp = await firstValueFrom(
        this.http.get<{ copias: CopiaSeguridad[] }>('/api/copias')
      );
      this.copias.set(resp.copias || []);
    } catch {
      this.copias.set([]);
    }
  }

  async subirCopia(contenido: unknown): Promise<boolean> {
    try {
      const resp = await firstValueFrom(
        this.http.post<{ ok: boolean; panel: DatosPanel }>('/api/copia/subir', {
          contenido,
        })
      );
      if (resp.panel) this.aplicarNuevoPanel(resp.panel);
      await Promise.all([this.cargarCarteraConfig(), this.cargarCopias()]);
      this.notificarExito('Copia de seguridad restaurada.');
      return true;
    } catch (err: unknown) {
      this.notificarError(
        this.extraerMensajeError(err, 'Archivo de copia no válido.')
      );
      return false;
    }
  }

  async recuperarCopia(archivo: string): Promise<boolean> {
    try {
      const resp = await firstValueFrom(
        this.http.post<{ ok: boolean; panel: DatosPanel }>(
          '/api/copia/recuperar',
          { archivo }
        )
      );
      if (resp.panel) this.aplicarNuevoPanel(resp.panel);
      await Promise.all([this.cargarCarteraConfig(), this.cargarCopias()]);
      this.notificarExito('Copia automática restaurada.');
      return true;
    } catch (err: unknown) {
      this.notificarError(
        this.extraerMensajeError(err, 'No se pudo recuperar la copia.')
      );
      return false;
    }
  }

  private extraerMensajeError(err: unknown, porDefecto: string): string {
    if (err && typeof err === 'object' && 'error' in err) {
      const inner = (err as { error?: { error?: string; errores?: string[] } }).error;
      if (inner && typeof inner.error === 'string' && inner.error) {
        return inner.error;
      }
      if (inner && Array.isArray(inner.errores) && inner.errores.length) {
        return inner.errores[0];
      }
    }
    return porDefecto;
  }
}
