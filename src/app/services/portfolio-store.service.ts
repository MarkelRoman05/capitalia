import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  CarteraConfig,
  CopiaSeguridad,
  DatosPanel,
  EntidadBanco,
  InformeImportacion,
  LineaLoteCartera,
  MetricasCalculadas,
  MovimientoCfg,
  ProductoCalculado,
  ProductoCfg,
  RespuestaBancos,
  RespuestaLoteProductos,
  ResultadoBusqueda,
  ValoracionCfg,
} from '../models/portfolio.model';
import { AuthService } from './auth.service';
import { FormatService } from './format.service';
import { PortfolioApiService } from './portfolio-api.service';
import { calcularMetricasCartera, calcularXirr } from './portfolio-metrics.util';

export type TabId = 'patrimonio' | 'mes' | 'fondos' | 'rendimiento' | 'fiscalidad' | 'datos';
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
  private readonly auth = inject(AuthService);
  private readonly api = inject(PortfolioApiService);
  private readonly fmt = inject(FormatService);
  private readonly router = inject(Router);
  private initPromise: Promise<void> | null = null;

  // Auth state (delegated to AuthService)
  readonly cargandoInicial = this.auth.cargandoInicial;
  readonly autenticado = this.auth.autenticado;
  readonly modoAuth = this.auth.modoAuth;
  readonly usuario = this.auth.usuario;

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
  readonly modalPerfilAbierto = signal<boolean>(false);
  readonly modalAyudaAbierto = signal<boolean>(false);

  // UI state
  readonly tabActiva = signal<TabId>('patrimonio');
  readonly subTabDatos = signal<'productos' | 'movimientos' | 'saldos' | 'importar' | 'copias'>('productos');
  readonly tema = signal<'oscuro' | 'claro'>('oscuro');
  readonly modoPrivado = signal<boolean>(false);
  readonly rango = signal<RangoId>('todo');
  readonly vistaEvolucion = signal<VistaEvolucionId>('apilado');
  readonly agrupacionDist = signal<AgrupacionDistId>('clase');
  readonly ocultos = signal<Set<string>>(new Set<string>());
  readonly productoSeleccionadoId = signal<string | null>(null);
  readonly grupoSeleccionadoId = signal<string | null>(null);
  readonly mesSeleccionadoIdx = signal<number>(-1);
  readonly compRef = signal<string>('msci_world');
  readonly btcVivo = signal<number | null>(null);
  readonly preciosVivo = signal<Record<string, number>>({});
  readonly ultimaActualizacion = signal<string | null>(null);
  readonly bancosCatalogo = signal<EntidadBanco[]>([]);
  readonly bancosRecientes = signal<EntidadBanco[]>([]);

  private temporizadorMensaje: ReturnType<typeof setTimeout> | null = null;
  private intervaloVivo: ReturnType<typeof setInterval> | null = null;
  private intervaloFondos: ReturnType<typeof setInterval> | null = null;
  private ultimaSyncFondosMs = 0;
  private listenerVisibilidadRegistrado = false;
  private readonly onVisibilityChange = (): void => {
    if (typeof document === 'undefined' || document.visibilityState !== 'visible') return;
    if (!this.autenticado()) return;
    if (this.hayActivosEnVivo()) {
      void this.actualizarPrecioVivo();
    }
    if (!this.carteraVacia() && Date.now() - this.ultimaSyncFondosMs > 5 * 60 * 1000) {
      void this.actualizarPrecios({ silencioso: true });
    }
  };

  constructor() {
    this.inicializarTema();
  }

  private inicializarTema(): void {
    try {
      const guardado = localStorage.getItem('capitalia-tema');
      if (guardado === 'claro' || guardado === 'oscuro') {
        this.tema.set(guardado);
      }
      this.modoPrivado.set(localStorage.getItem('capitalia-privado') === '1');
    } catch {
      // Ignore storage access errors
    }
    this.aplicarAtributosDocumento();
  }

  aplicarAtributosDocumento(): void {
    if (typeof document === 'undefined') return;
    document.documentElement.setAttribute('data-theme', this.tema());
    document.documentElement.setAttribute('data-privado', this.modoPrivado() ? '1' : '0');
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

  alternarPrivado(): void {
    const nuevo = !this.modoPrivado();
    this.modoPrivado.set(nuevo);
    try {
      localStorage.setItem('capitalia-privado', nuevo ? '1' : '0');
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

  readonly hayActivosEnVivo = computed<boolean>(() => {
    const d = this.datos();
    if (!d) return false;
    if (d.vivo) return true;
    const fuentesCfg = new Map(
      (this.cartera()?.productos || []).map((c) => [c.id, c.fuente])
    );
    return (d.productos || []).some((p) => {
      const f = fuentesCfg.get(p.id);
      const esVivo =
        f === 'yahoo' ||
        f === 'coingecko' ||
        p.fuentePrecio === 'Yahoo Finance' ||
        p.fuentePrecio === 'CoinGecko';
      return esVivo && (p.participaciones ?? p.titulos ?? 0) > 0;
    });
  });

  valorProductoConVivo(p: ProductoCalculado): number {
    const livePrice = this.preciosVivo()[p.id];
    const titulos = p.participaciones ?? p.titulos ?? 0;
    if (livePrice && livePrice > 0 && titulos > 0) {
      return titulos * livePrice;
    }
    const d = this.datos();
    const eurVivo = this.btcVivo();
    if (d?.vivo && eurVivo && p.id === d.vivo.productoId && d.vivo.btcRef > 0) {
      return d.vivo.titulos * d.vivo.precioRef * (eurVivo / d.vivo.btcRef);
    }
    return p.valor;
  }

  precioProductoConVivo(p: ProductoCalculado): number | null | undefined {
    const livePrice = this.preciosVivo()[p.id];
    if (livePrice && livePrice > 0) {
      return livePrice;
    }
    return p.nav;
  }

  ajusteVivoProducto(p: ProductoCalculado): number {
    return this.valorProductoConVivo(p) - (p.valor || 0);
  }

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

  // Client-side XIRR calculation delegated to pure utility
  xirr(flujos: [string, number][]): number | null {
    return calcularXirr(flujos);
  }

  calcularMetricas(lista: ProductoCalculado[]): MetricasCalculadas {
    return calcularMetricasCartera(
      lista,
      this.todosComponentes().length,
      this.datos()
    );
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

  toggleGrupoComponentes(ids: string[], solo = false): void {
    const grupoIds = new Set(ids);
    if (!grupoIds.size) return;
    const todos = this.todosComponentes();
    const actual = new Set(this.ocultos());

    if (solo) {
      const otrosOcultos = todos
        .filter((c) => !grupoIds.has(c.id))
        .every((c) => actual.has(c.id));
      const todosGrupoVisibles = ids.every((id) => !actual.has(id));
      if (otrosOcultos && todosGrupoVisibles) {
        this.ocultos.set(new Set());
      } else {
        const nuevo = new Set<string>();
        todos.forEach((c) => {
          if (!grupoIds.has(c.id)) nuevo.add(c.id);
        });
        this.ocultos.set(nuevo);
      }
      return;
    }

    const todosOcultos = ids.every((id) => actual.has(id));
    if (todosOcultos) {
      ids.forEach((id) => actual.delete(id));
    } else {
      ids.forEach((id) => actual.add(id));
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
    this.grupoSeleccionadoId.set(null);
    this.productoSeleccionadoId.set(id);
    this.tabActiva.set('fondos');
    void this.router.navigate(['/productos']);
  }

  irAGrupo(grupoId: string): void {
    this.grupoSeleccionadoId.set(grupoId);
    this.productoSeleccionadoId.set(null);
    this.tabActiva.set('fondos');
    void this.router.navigate(['/productos']);
  }

  // Initial load & Authentication
  async inicializarApp(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }
    this.initPromise = this._ejecutarInicializarApp();
    return this.initPromise;
  }

  private async _ejecutarInicializarApp(): Promise<void> {
    this.cargandoInicial.set(true);
    try {
      const resp = await this.auth.consultarSesion();
      this.auth.establecerSesion(resp.usuario, resp.autenticado, resp.modo);

      if (resp.autenticado) {
        await Promise.all([this.cargarPanel(), this.cargarCarteraConfig()]);
        this.autoActualizarAlEntrar();
      }
    } catch {
      this.auth.limpiarEstado();
    } finally {
      this.cargandoInicial.set(false);
    }
  }

  async login(email: string, clave: string): Promise<boolean> {
    try {
      const resp = await this.auth.login(email, clave);
      if (resp.ok) {
        this.auth.establecerSesion(resp.usuario, true);
        await Promise.all([this.cargarPanel(), this.cargarCarteraConfig()]);
        this.autoActualizarAlEntrar();
        this.notificarExito(`Bienvenido de nuevo, ${resp.usuario.nombre || resp.usuario.email}`);
        void this.router.navigate(['/patrimonio']);
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
      const resp = await this.auth.registro(nombre, email, clave);
      if (resp.ok) {
        this.auth.establecerSesion(resp.usuario, true);
        await Promise.all([this.cargarPanel(), this.cargarCarteraConfig()]);
        this.autoActualizarAlEntrar();
        this.notificarExito('Cuenta creada correctamente en Capitalia.');
        void this.router.navigate(['/patrimonio']);
        return true;
      }
      return false;
    } catch (err: unknown) {
      const msg = this.extraerMensajeError(err, 'No se pudo crear la cuenta.');
      this.notificarError(msg);
      return false;
    }
  }

  async actualizarPerfil(datos: {
    nombre?: string;
    email?: string;
    passwordActual?: string;
    passwordNueva?: string;
  }): Promise<string | null> {
    try {
      const resp = await this.auth.actualizarPerfil(datos);
      if (resp.ok) {
        this.usuario.set(resp.usuario);
        this.notificarExito('Perfil actualizado correctamente.');
        return null;
      }
      return resp.errores?.[0] || 'No se pudo actualizar el perfil.';
    } catch (err: unknown) {
      return this.extraerMensajeError(err, 'No se pudo actualizar el perfil.');
    }
  }

  async solicitarRecuperacion(email: string): Promise<{ ok: boolean; mensaje?: string }> {
    try {
      const resp = await this.auth.solicitarRecuperacion(email);
      if (resp.ok) {
        this.errorGlobal.set(null);
        return { ok: true, mensaje: resp.mensaje };
      }
      this.notificarError('No se pudo enviar el enlace de recuperación.');
      return { ok: false };
    } catch (err: unknown) {
      this.notificarError(
        this.extraerMensajeError(err, 'No se pudo enviar el enlace de recuperación.')
      );
      return { ok: false };
    }
  }

  async restablecerContrasena(token: string, clave: string): Promise<boolean> {
    try {
      const resp = await this.auth.restablecerContrasena(token, clave);
      if (resp.ok) {
        this.notificarExito(
          resp.mensaje || 'Contraseña actualizada correctamente. Ya puedes iniciar sesión.'
        );
        void this.router.navigate(['/login']);
        return true;
      }
      return false;
    } catch (err: unknown) {
      this.notificarError(
        this.extraerMensajeError(err, 'No se pudo actualizar la contraseña.')
      );
      return false;
    }
  }

  async logout(): Promise<void> {
    await this.auth.logout();
    this.detenerPollingVivo();
    this.preciosVivo.set({});
    this.ultimaActualizacion.set(null);
    this.datos.set(null);
    this.cartera.set(null);
    void this.router.navigate(['/login']);
  }

  // Portfolio & Dashboard API calls (delegated to PortfolioApiService)
  async cargarPanel(): Promise<void> {
    const resp = await this.api.obtenerPanel();
    if (resp && typeof resp === 'object' && ('ok' in resp || 'datos' in resp || 'cartera' in resp)) {
      const env = resp as {
        modo?: 'propio' | 'demo' | 'estatico';
        datos?: DatosPanel | null;
        panel?: DatosPanel | null;
        cartera?: CarteraConfig;
        tipos?: Record<string, [string, string]>;
        fuentes?: string[];
        tiposMovimiento?: string[];
      };
      if (env.cartera) this.cartera.set(env.cartera);
      if (env.tipos) this.tipos.set(env.tipos);
      if (env.fuentes) this.fuentes.set(env.fuentes);
      if (env.tiposMovimiento) this.tiposMovimiento.set(env.tiposMovimiento);
      this.aplicarNuevoPanel(env.datos ?? env.panel ?? null, env.modo, env.cartera?.titular);
    } else {
      this.aplicarNuevoPanel(resp as DatosPanel | null);
    }
  }

  async cargarCarteraConfig(): Promise<void> {
    const resp = await this.api.obtenerCarteraConfig();
    this.cartera.set(resp.cartera);
    this.tipos.set(resp.tipos || {});
    this.fuentes.set(resp.fuentes || []);
    this.tiposMovimiento.set(resp.tiposMovimiento || []);
  }

  private crearPanelVacio(
    modo: 'propio' | 'demo' | 'estatico' = 'propio',
    titular = 'Mi cartera'
  ): DatosPanel {
    const hoyIso = new Date().toISOString().slice(0, 10);
    return {
      generado: hoyIso,
      modo,
      preciosActualizados: null,
      titular,
      moneda: 'EUR',
      fechaExtracto: hoyIso,
      fechas: [],
      productos: [],
      otrosActivos: [],
      pasivos: [],
      total: {
        patrimonio: 0,
        aportado: 0,
        valorConCoste: 0,
        plusvalia: 0,
        rentabilidad: null,
        tir: null,
        realizado: 0,
        serie: [],
        serieAportado: [],
        porClase: [],
        porEntidad: [],
        porTipo: [],
        hitos: [],
        racha: 0,
        ritmoMensual: 0,
        numAportaciones: 0,
        diasInvertido: 0,
        caidaMaxima: 0,
        caidaMaximaFecha: null,
      },
      aportacionesMensuales: {
        meses: [],
        porProducto: {},
        total: [],
      },
      objetivo: null,
      comisiones: {
        lineas: [],
        anual: 0,
        base: 0,
        terPonderado: null,
        compraventaPagada: 0,
      },
      rentabilidadAnual: {
        anos: [],
        cartera: [],
        parcial: [],
        porProducto: {},
        desde: {},
      },
      resumenMensual: [],
      comparador: [],
      comparacion: null,
      indiceCartera: [],
      vivo: null,
      avisos: [],
    };
  }

  private aplicarNuevoPanel(
    rawPanel: DatosPanel | null | undefined,
    modoFallback: 'propio' | 'demo' | 'estatico' = 'propio',
    titularFallback?: string
  ): void {
    const panel =
      rawPanel && rawPanel.total
        ? rawPanel
        : this.crearPanelVacio(
            rawPanel?.modo || modoFallback,
            rawPanel?.titular || titularFallback || this.cartera()?.titular || 'Mi cartera'
          );
    this.datos.set(panel);
    const tsPanel = panel.preciosActualizados || panel.generado || null;
    if (tsPanel && this.esTimestampMasReciente(tsPanel, this.ultimaActualizacion())) {
      this.ultimaActualizacion.set(tsPanel);
    }
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
    } else {
      this.mesSeleccionadoIdx.set(-1);
    }

    this.iniciarPollingVivo();
  }

  private esTimestampMasReciente(nuevo: string, actual: string | null): boolean {
    if (!actual) return true;
    const msNuevo = Date.parse(nuevo);
    const msActual = Date.parse(actual);
    if (!Number.isNaN(msNuevo) && !Number.isNaN(msActual)) {
      return msNuevo > msActual;
    }
    return nuevo > actual;
  }

  private autoActualizarAlEntrar(): void {
    if (!this.autenticado() || this.carteraVacia()) return;
    void this.actualizarPrecios({ silencioso: true });
  }

  private iniciarPollingVivo(): void {
    this.detenerPollingVivo();
    if (typeof document !== 'undefined' && !this.listenerVisibilidadRegistrado) {
      document.addEventListener('visibilitychange', this.onVisibilityChange);
      this.listenerVisibilidadRegistrado = true;
    }
    if (this.hayActivosEnVivo()) {
      void this.actualizarPrecioVivo();
      this.intervaloVivo = setInterval(() => {
        if (typeof document === 'undefined' || document.visibilityState === 'visible') {
          void this.actualizarPrecioVivo();
        }
      }, 15000);
    }
    if (!this.carteraVacia()) {
      this.intervaloFondos = setInterval(() => {
        if (typeof document === 'undefined' || document.visibilityState === 'visible') {
          void this.actualizarPrecios({ silencioso: true });
        }
      }, 10 * 60 * 1000);
    }
  }

  private detenerPollingVivo(): void {
    if (this.intervaloVivo) {
      clearInterval(this.intervaloVivo);
      this.intervaloVivo = null;
    }
    if (this.intervaloFondos) {
      clearInterval(this.intervaloFondos);
      this.intervaloFondos = null;
    }
    if (typeof document !== 'undefined' && this.listenerVisibilidadRegistrado) {
      document.removeEventListener('visibilitychange', this.onVisibilityChange);
      this.listenerVisibilidadRegistrado = false;
    }
  }

  async actualizarPrecioVivo(): Promise<void> {
    const d = this.datos();
    if (!d || !this.hayActivosEnVivo()) return;
    try {
      const resp = await this.api.obtenerPreciosVivo();
      const precios = resp?.precios || {};
      if (Object.keys(precios).length > 0) {
        this.preciosVivo.set(precios);
        if (resp.actualizado) {
          this.ultimaActualizacion.set(resp.actualizado);
        }
        if (d.vivo && precios[d.vivo.productoId]) {
          this.btcVivo.set(precios[d.vivo.productoId]);
        }
        return;
      }
    } catch {
      // Fallback al polling directo de CoinGecko si el backend no responde
    }
    const v = d.vivo;
    if (!v) return;
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

  async actualizarPrecios(opciones?: { silencioso?: boolean }): Promise<void> {
    if (this.actualizandoPrecios()) return;
    this.actualizandoPrecios.set(true);
    try {
      const resp = await this.api.actualizarPrecios();
      this.ultimaSyncFondosMs = Date.now();
      this.aplicarNuevoPanel(resp.panel ?? null);
      if (resp.panel?.preciosActualizados || resp.panel?.generado) {
        this.ultimaActualizacion.set(
          resp.panel.preciosActualizados || resp.panel.generado
        );
      }
      await this.cargarCarteraConfig();
      if (!opciones?.silencioso) {
        this.notificarExito('Precios de mercado y series históricas actualizados.');
      }
    } catch (err: unknown) {
      if (!opciones?.silencioso) {
        this.notificarError(
          this.extraerMensajeError(err, 'Error al actualizar precios.')
        );
      }
    } finally {
      this.actualizandoPrecios.set(false);
    }
  }

  async guardarObjetivo(
    titular: string,
    importe: number,
    etiqueta: string,
    activo: boolean,
    gastoMensual?: number | null
  ): Promise<boolean> {
    try {
      const payload: Record<string, unknown> = {
        titular,
        importe,
        etiqueta,
        activo,
      };
      if (gastoMensual !== undefined) {
        payload['gastoMensual'] = gastoMensual;
      }
      const resp = await this.api.guardarObjetivo(payload);
      this.aplicarNuevoPanel(resp.panel ?? null);
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
      const resp = await this.api.cargarEjemplo();
      this.aplicarNuevoPanel(resp.panel ?? null);
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
      const resp = await this.api.empezarConMiCartera();
      this.aplicarNuevoPanel(resp.panel ?? null);
      await this.cargarCarteraConfig();
      this.tabActiva.set('datos');
      void this.router.navigate(['/datos']);
      this.notificarExito('Tu cartera personal está lista para editar.');
    } catch (err: unknown) {
      this.notificarError(
        this.extraerMensajeError(err, 'No se pudo inicializar la cartera.')
      );
    }
  }

  async reiniciarCartera(): Promise<void> {
    try {
      const resp = await this.api.reiniciarCartera();
      this.aplicarNuevoPanel(resp.panel ?? null);
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
  async buscarProductos(q: string, tipo = 'todos'): Promise<ResultadoBusqueda[]> {
    const resp = await this.api.buscarProductos(q, tipo);
    return resp.resultados || [];
  }

  async obtenerDetalleCarteraModelo(carteraId: string): Promise<ResultadoBusqueda | null> {
    try {
      const resp = await this.api.obtenerDetalleCarteraModelo(carteraId);
      return resp.cartera ?? null;
    } catch (err: unknown) {
      this.notificarError(
        this.extraerMensajeError(err, 'No se pudo cargar la composición de la cartera.')
      );
      return null;
    }
  }

  async guardarProductosLote(
    productos: Partial<ProductoCfg>[],
    opciones?: string | { entidad?: string; grupoId?: string; grupoNombre?: string }
  ): Promise<RespuestaLoteProductos | null> {
    const opts = typeof opciones === 'string' ? { entidad: opciones } : opciones || {};
    try {
      const resp = await this.api.guardarProductosLote({
        productos,
        entidad: opts.entidad || '',
        grupoId: opts.grupoId || '',
        grupoNombre: opts.grupoNombre || '',
      });
      this.aplicarNuevoPanel(resp.panel ?? null);
      await this.cargarCarteraConfig();
      const info: RespuestaLoteProductos = resp.item ?? {
        añadidos: productos.length,
        omitidos: 0,
      };
      const nombreGrp = info.grupoNombre || opts.grupoNombre;
      const totGrupo = info['añadidos'] + (info.vinculados || 0);
      if (totGrupo > 0) {
        const sufijo = info.omitidos ? ` (${info.omitidos} ya estaban en la cartera).` : '.';
        this.notificarExito(
          nombreGrp
            ? `Cartera «${nombreGrp}» lista con ${totGrupo} productos${sufijo}`
            : `Añadidos ${totGrupo} productos de la cartera${sufijo}`
        );
      } else {
        this.notificarExito('Todos los productos de esta cartera ya estaban agrupados.');
      }
      return info;
    } catch (err: unknown) {
      this.notificarError(
        this.extraerMensajeError(err, 'No se pudieron añadir los productos de la cartera.')
      );
      return null;
    }
  }

  async guardarImportesCartera(payload: {
    fecha: string;
    nota?: string;
    reemplazarPrevios?: boolean;
    lineas: LineaLoteCartera[];
  }): Promise<{ guardados: number; reemplazados: number } | null> {
    try {
      const resp = await this.api.guardarImportesCartera(payload);
      this.aplicarNuevoPanel(resp.panel ?? null);
      await this.cargarCarteraConfig();
      const res = resp.item ?? { guardados: payload.lineas.length, reemplazados: 0 };
      this.notificarExito(
        `Guardados importes en ${res.guardados} productos.` +
          (res.reemplazados ? ` (${res.reemplazados} operaciones previas sustituidas).` : '')
      );
      return res;
    } catch (err: unknown) {
      this.notificarError(
        this.extraerMensajeError(err, 'No se pudieron guardar los importes de la cartera.')
      );
      return null;
    }
  }

  async borrarGrupoProductos(grupoId: string, grupoNombre?: string): Promise<boolean> {
    try {
      const resp = await this.api.borrarGrupoProductos(grupoId);
      this.aplicarNuevoPanel(resp.panel ?? null);
      await this.cargarCarteraConfig();
      if (this.grupoSeleccionadoId() === grupoId) {
        this.grupoSeleccionadoId.set(null);
      }
      this.notificarExito(
        grupoNombre
          ? `Cartera «${grupoNombre}» y sus productos eliminados.`
          : 'Cartera eliminada.'
      );
      return true;
    } catch (err: unknown) {
      this.notificarError(
        this.extraerMensajeError(err, 'No se pudo eliminar la cartera.')
      );
      return false;
    }
  }

  async cargarBancosIniciales(forzar = false): Promise<void> {
    if (!forzar && this.bancosCatalogo().length) return;
    try {
      const resp = await this.api.obtenerBancos();
      this.bancosRecientes.set(resp.recientes || []);
      this.bancosCatalogo.set(resp.entidades || []);
    } catch {
      // Ignorar fallo silencioso al precargar catálogo de entidades
    }
  }

  async buscarBancos(q: string): Promise<RespuestaBancos> {
    const resp = await this.api.obtenerBancos(q);
    return {
      recientes: resp.recientes || [],
      entidades: resp.entidades || [],
      online: resp.online || [],
    };
  }

  async registrarUsoBanco(banco: Partial<EntidadBanco> & { nombre: string }): Promise<void> {
    try {
      await this.api.registrarUsoBanco(banco);
      await this.cargarBancosIniciales(true);
    } catch {
      // No bloquear si el registro de entidad reciente falla
    }
  }

  async guardarProducto(
    prod: Partial<ProductoCfg>,
    idExistente?: string
  ): Promise<ProductoCfg | null> {
    try {
      const resp = await this.api.guardarProducto(prod, idExistente);
      this.aplicarNuevoPanel(resp.panel ?? null);
      await this.cargarCarteraConfig();
      this.notificarExito(
        idExistente ? 'Producto actualizado.' : 'Producto añadido a la cartera.'
      );
      return resp.item ?? (prod as ProductoCfg);
    } catch (err: unknown) {
      this.notificarError(
        this.extraerMensajeError(err, 'Error al guardar el producto.')
      );
      return null;
    }
  }

  async borrarProducto(id: string): Promise<boolean> {
    try {
      const resp = await this.api.borrarProducto(id);
      this.aplicarNuevoPanel(resp.panel ?? null);
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
      const resp = await this.api.repartirColores();
      this.aplicarNuevoPanel(resp.panel ?? null);
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
      const resp = await this.api.guardarMovimiento(mov, idExistente);
      this.aplicarNuevoPanel(resp.panel ?? null);
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
      const resp = await this.api.borrarMovimiento(id);
      this.aplicarNuevoPanel(resp.panel ?? null);
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
      const resp = await this.api.guardarValoracion(val, idExistente);
      this.aplicarNuevoPanel(resp.panel ?? null);
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
      const resp = await this.api.borrarValoracion(id);
      this.aplicarNuevoPanel(resp.panel ?? null);
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
      const resp = await this.api.previsualizarImportacion(payload);
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
      const resp = await this.api.confirmarImportacion(payload);
      this.aplicarNuevoPanel(resp.panel ?? null);
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
    const resp = await this.api.obtenerPromptIA();
    return resp.prompt || '';
  }

  async cargarCopias(): Promise<void> {
    try {
      const resp = await this.api.obtenerCopias();
      this.copias.set(resp.copias || []);
    } catch {
      this.copias.set([]);
    }
  }

  async subirCopia(contenido: unknown): Promise<boolean> {
    try {
      const resp = await this.api.subirCopia(contenido);
      this.aplicarNuevoPanel(resp.panel ?? null);
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
      const resp = await this.api.recuperarCopia(archivo);
      this.aplicarNuevoPanel(resp.panel ?? null);
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
