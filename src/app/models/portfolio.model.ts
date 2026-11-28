export interface Usuario {
  id: number;
  email: string;
  nombre: string;
  creado?: string | null;
}

export interface RespuestaAuthYo {
  autenticado: boolean;
  modo: 'local' | 'nube';
  usuario: Usuario | null;
}

export interface AportacionCalculada {
  fecha: string;
  importe: number;
  participaciones?: number;
  precio?: number | null;
  valor?: number | null;
  nivel?: number;
}

export interface TramosAportacion {
  p33: number | null;
  p67: number | null;
  min: number;
  max: number;
  mediana: number;
  n: number;
}

export interface ExposicionIndice {
  actualizado: string;
  constituyentes?: number;
  fuente: string;
  paises: [string, number][];
  sectores: [string, number][];
  top10?: [string, number][];
}

export interface DesgloseFx {
  moneda: string;
  fxCompraMedio: number;
  fxActual: number;
  variacionFxPct: number;
  plusvaliaTotalEur: number;
  efectoActivoEur: number;
  efectoDivisaEur: number;
  efectoActivoPct: number;
  efectoDivisaPct: number;
}

export interface DesgloseFxTotal {
  numProductos: number;
  plusvaliaTotalEur: number;
  efectoActivoEur: number;
  efectoDivisaEur: number;
}

export interface ProductoCalculado {
  id: string;
  nombre: string;
  corto: string;
  tipo: string;
  tipoClave?: string;
  isin?: string;
  identificador?: string;
  indice?: string;
  indiceDetalle?: string;
  papel?: string;
  ter?: number | null;
  riesgo?: number | null;
  entidad?: string;
  gestora?: string;
  clase?: string;
  politica?: string;
  mercado?: string;
  origen?: string;
  desde?: string;
  etqUnidades?: string;
  etqPrecio?: string;
  etqVentanas?: string;
  titulos?: number | null;
  participaciones?: number | null;
  precioMedio?: number | null;
  nav?: number | null;
  navFecha?: string | null;
  fuenteTexto?: string;
  fuentePrecio?: string;
  realizado?: number;
  peso?: number;
  valor: number;
  aportado?: number | null;
  plusvalia?: number | null;
  rentabilidad?: number | null;
  tir?: number | null;
  largoPlazo?: boolean;
  grupoId?: string;
  grupoNombre?: string;
  pesoObjetivo?: number | null;
  slot?: number;
  slotColor?: [string, string];
  color?: [string, string];
  serie: (number | null)[];
  serieAportado?: (number | null)[];
  navSerie?: (number | null)[];
  aportaciones?: AportacionCalculada[];
  flujos?: [string, number][];
  ventanas?: Record<string, number | null>;
  tramos?: TramosAportacion;
  exposicion?: ExposicionIndice;
  desgloseFx?: DesgloseFx;
}

export interface GrupoAgrupado {
  nombre: string;
  valor: number;
  peso?: number;
  color: [string, string] | string;
}

export interface HitoPatrimonio {
  importe: number;
  fecha: string | null;
}

export interface TotalCalculado {
  patrimonio: number;
  aportado: number;
  valorConCoste: number;
  plusvalia: number;
  rentabilidad: number | null;
  tir: number | null;
  realizado: number;
  serie: number[];
  serieAportado: number[];
  porClase: GrupoAgrupado[];
  porEntidad: GrupoAgrupado[];
  porTipo: GrupoAgrupado[];
  hitos: HitoPatrimonio[];
  racha: number;
  ritmoMensual: number;
  numAportaciones: number;
  diasInvertido: number;
  caidaMaxima: number;
  caidaMaximaFecha: string | null;
}

export interface AportacionesMensuales {
  meses: string[];
  porProducto: Record<string, number[]>;
  total: number[];
}

export interface ObjetivoPatrimonio {
  activo: boolean;
  importe: number;
  etiqueta: string;
}

export interface LineaComision {
  id: string;
  nombre: string;
  ter: number;
  valor: number;
  anual: number;
  color: [string, string];
  impacto10a?: number;
  impacto20a?: number;
}

export interface ComisionesDatos {
  lineas: LineaComision[];
  anual: number;
  base: number;
  terPonderado: number | null;
  compraventaPagada: number;
  impacto10a?: number;
  impacto20a?: number;
  tasaReferencia?: number;
}

export interface RentabilidadAnual {
  anos: string[];
  cartera: (number | null)[];
  parcial: boolean[];
  porProducto: Record<string, (number | null)[]>;
  desde: Record<string, (string | null)[]>;
}

export interface DetalleMesProducto {
  inicio: number;
  fin: number;
  aportado: number;
  nuevo: number;
  mercado: number;
}

export interface ResumenMensual {
  mes: string;
  inicio: number;
  fin: number;
  aportado: number;
  nuevo: number;
  mercado: number;
  rentabilidad: number | null;
  porProducto: Record<string, DetalleMesProducto>;
}

export interface MetricasIndice {
  rentTotal: number | null;
  cagr: number | null;
  vol: number | null;
  sharpe: number | null;
  sortino?: number | null;
  beta?: number | null;
  alfa?: number | null;
  maxDD: number;
  maxDDFecha: string | null;
  maxDiasRecuperacion?: number | null;
  rfUsado?: number | null;
  desde: string;
  hasta: string;
}

export interface ComparadorCartera {
  id: string;
  nombre: string;
  real: boolean;
  pesos?: Record<string, number>;
  indice: (number | null)[];
  metricas: MetricasIndice;
}

export interface ReferenciaIndexado {
  id: string;
  nombre: string;
  detalle: string;
  serie: (number | null)[];
  valor: number;
  tir: number | null;
  aviso: string | null;
}

export interface ComparacionIndexado {
  desde: string;
  tuya: (number | null)[];
  aportado: (number | null)[];
  tuValor: number;
  tuTir: number | null;
  referencias: ReferenciaIndexado[];
}

export interface VivoDatos {
  productoId: string;
  coin: string;
  titulos: number;
  precioRef: number;
  btcRef: number;
  fechaRef: string;
}

export interface XRayEmpresa {
  nombre: string;
  peso: number;
  productos: string[];
  solapado: boolean;
}

export interface XRayDatos {
  paises: [string, number][];
  sectores: [string, number][];
  topEmpresas: XRayEmpresa[];
  coberturaExpoPct: number;
  divisas: [string, number][];
  alertas: string[];
  desgloseFxTotal?: DesgloseFxTotal;
}

export interface SaludFinanciera {
  liquidez: number;
  deudaTotal: number;
  activosBrutos: number;
  ratioDeuda: number;
  gastoMensual: number | null;
  mesesColchon: number | null;
}

export interface FilaHeatmapMensual {
  ano: string;
  meses: (number | null)[];
  total: number | null;
}

export interface PuntoDispersion {
  id: string;
  nombre: string;
  color: string;
  valor: number;
  peso: number;
  cagr: number;
  vol: number;
  sharpe: number | null;
  sortino?: number | null;
  maxDD: number;
}

export interface EscenarioEstres {
  id: string;
  nombre: string;
  descripcion: string;
  impactoEur: number;
  caidaPct: number;
  patrimonioResultante: number;
}

export interface OperacionFiscal {
  fecha: string;
  anio: string;
  productoId: string;
  productoNombre: string;
  tipoClave: string;
  unidades: number;
  importeVenta: number;
  costeFifo: number;
  plusvalia: number;
  fechaAdquisicionMin: string | null;
  diasTenencia: number | null;
}

export interface ResumenFiscalAnual {
  anio: string;
  ganancias: number;
  perdidas: number;
  saldoGananciasPerdidas: number;
  dividendosBrutos: number;
  retenciones: number;
  compensacionAplicada: number;
  baseAhorroNeta: number;
  impuestoEstimado: number;
  cuotaDiferencial: number;
  operaciones: OperacionFiscal[];
}

export interface PlusvaliaLatenteFiscal {
  bruta: number;
  impuestoSiLiquidaHoy: number;
  patrimonioNetoFiscal: number;
}

export interface OportunidadTLH {
  id: string;
  nombre: string;
  valor: number;
  aportado: number;
  minusvaliaLatente: number;
  ahorroFiscalEstimado: number;
  avisoRegla2Meses: boolean;
}

export interface FiscalidadDatos {
  porAnio: ResumenFiscalAnual[];
  plusvaliaLatente: PlusvaliaLatenteFiscal;
  taxLossHarvesting: OportunidadTLH[];
}

export interface DividendoMes {
  mes: string;
  bruto: number;
  neto: number;
}

export interface DividendoAnio {
  anio: string;
  bruto: number;
  neto: number;
}

export interface DividendoProducto {
  id: string;
  nombre: string;
  color: string;
  bruto: number;
  neto: number;
  yieldActual: number | null;
  yieldOnCost: number | null;
}

export interface IngresosPasivosResumen {
  anualTotal: number;
  dividendos12m: number;
  interesesRentaFija: number;
  alquileresAnuales: number;
  mediaMensual: number;
}

export interface ProximoCobro {
  fecha: string;
  mes: string;
  productoId: string;
  productoNombre: string;
  tipo: 'dividendo' | 'cupon' | 'vencimiento' | 'alquiler';
  importeEstimado: number;
  confianza: 'estimado' | 'contractual';
  nota?: string;
}

export interface ProximoCobroMes {
  mes: string;
  total: number;
  dividendos: number;
  intereses: number;
  alquileres: number;
}

export interface DividendosDatos {
  totalHistorico: number;
  totalNetoHistorico: number;
  anioActual: number;
  ultimos12Meses: number;
  mediaMensual12m: number;
  yieldCartera: number;
  yieldOnCost: number;
  porMes: DividendoMes[];
  porAnio: DividendoAnio[];
  porProducto: DividendoProducto[];
  ingresosPasivos?: IngresosPasivosResumen;
  proximosCobros?: ProximoCobro[];
  proximosCobrosPorMes?: ProximoCobroMes[];
}

export interface ItemRentaFija {
  id: string;
  nombre: string;
  valor: number;
  tae: number | null;
  cuponAnual: number | null;
  frecuenciaCupon: string | null;
  fechaEmision: string | null;
  fechaVencimiento: string | null;
  diasRestantes: number | null;
  proximoVencimiento: boolean;
  interesAnualEstimado: number | null;
}

export interface ItemPension {
  id: string;
  nombre: string;
  valor: number;
  aportadoAnioActual: number;
  limiteAnual: number;
  margenRestante: number;
  tipoMarginalIrpf: number | null;
  ahorroFiscalEstimado: number | null;
}

export interface ResumenPensiones {
  items: ItemPension[];
  totalAportadoAnio: number;
  totalLimiteAnual: number;
  totalMargenRestante: number;
  totalAhorroEstimado: number | null;
}

export interface HipotecaResumen {
  id: string;
  nombre: string;
  deudaPendiente: number;
  tipoInteres: number | null;
  tipoTasa: 'fijo' | 'variable' | string | null;
  cuotaMensual: number | null;
  fechaVencimiento: string | null;
}

export interface InmuebleResumen {
  id: string;
  nombre: string;
  valorInmueble: number;
  deudaPendiente: number;
  equityNeto: number;
  porcentajePagado: number;
  ltv: number;
  alquilerMensual: number | null;
  gastosAnuales: number | null;
  interesesHipotecaAnuales?: number;
  rentabilidadBruta: number | null;
  rentabilidadNeta: number | null;
  rentabilidadNetaConHipoteca?: number | null;
  cashflowAnualNeto?: number | null;
  hipotecas: HipotecaResumen[];
}

export interface EspecializadosDatos {
  rentaFija: ItemRentaFija[];
  pensiones: ResumenPensiones;
  inmobiliario: {
    inmuebles: InmuebleResumen[];
    hipotecasSueltas: HipotecaResumen[];
  };
}

export interface DatosPanel {
  generado: string;
  modo?: 'propio' | 'demo' | 'estatico';
  preciosActualizados?: string | null;
  titular: string;
  moneda: string;
  fechaExtracto: string;
  fechas: string[];
  productos: ProductoCalculado[];
  otrosActivos: ProductoCalculado[];
  pasivos: ProductoCalculado[];
  total: TotalCalculado;
  aportacionesMensuales: AportacionesMensuales;
  objetivo: ObjetivoPatrimonio | null;
  comisiones: ComisionesDatos;
  rentabilidadAnual: RentabilidadAnual;
  resumenMensual: ResumenMensual[];
  comparador: ComparadorCartera[];
  comparacion: ComparacionIndexado | null;
  indiceCartera: (number | null)[];
  serieDrawdown?: (number | null)[];
  heatmapMensual?: FilaHeatmapMensual[];
  dispersionActivos?: PuntoDispersion[];
  xray?: XRayDatos | null;
  salud?: SaludFinanciera | null;
  estres?: EscenarioEstres[];
  fiscalidad?: FiscalidadDatos | null;
  dividendos?: DividendosDatos | null;
  especializados?: EspecializadosDatos | null;
  vivo: VivoDatos | null;
  avisos: string[];
}

export interface ProductoCfg {
  id: string;
  nombre: string;
  corto?: string;
  tipo: string;
  identificador?: string;
  fuente: string;
  codigo?: string;
  moneda?: string;
  entidad?: string;
  clase?: string;
  gestora?: string;
  ter?: number | null;
  riesgo?: number | null;
  slot?: number;
  largoPlazo?: boolean;
  grupoId?: string;
  grupoNombre?: string;
  pesoObjetivo?: number | null;
  respaldo?: string;
  respaldoMoneda?: string;
  vivo?: string;
  papel?: string;
  tae?: number | null;
  cuponAnual?: number | null;
  frecuenciaCupon?: 'vencimiento' | 'anual' | 'semestral' | 'trimestral' | string | null;
  fechaEmision?: string | null;
  fechaVencimiento?: string | null;
  limiteAnual?: number | null;
  tipoMarginalIrpf?: number | null;
  tipoInteres?: number | null;
  tipoTasa?: 'fijo' | 'variable' | string | null;
  cuotaMensual?: number | null;
  inmuebleId?: string | null;
  alquilerMensual?: number | null;
  gastosAnuales?: number | null;
}

export interface LineaLoteCartera {
  producto: string;
  importe?: number | null;
  unidades?: number | null;
}

export interface RespuestaLoteProductos {
  añadidos: number;
  omitidos: number;
  vinculados?: number;
  grupoId?: string | null;
  grupoNombre?: string | null;
}

export interface MovimientoCfg {
  id: string;
  fecha: string;
  producto: string;
  tipo: 'compra' | 'venta' | 'dividendo' | 'comision' | 'traspaso';
  unidades: number;
  importe: number;
  comision?: number | null;
  productoDestino?: string;
  unidadesDestino?: number;
  retencion?: number | null;
  nota?: string;
  origen?: string;
}

export interface ValoracionCfg {
  id: string;
  fecha: string;
  producto: string;
  valor: number;
  aportado?: number | null;
}

export interface CarteraConfig {
  version?: number;
  titular: string;
  productos: ProductoCfg[];
  movimientos: MovimientoCfg[];
  valoraciones: ValoracionCfg[];
  hitos?: number[];
  objetivo?: ObjetivoPatrimonio;
  gastoMensual?: number | null;
}

export interface CotizacionAlternativa {
  fuente: string;
  codigo: string;
  ticker?: string;
  mercado?: string | null;
  moneda: string;
  precio: number;
  fecha: string;
  cambioDia?: number | null;
  rentabilidad1a?: number | null;
}

export interface ComponenteCarteraModelo {
  isin: string;
  nombre: string;
  categoria?: string | null;
  gestora?: string | null;
  moneda: string;
  peso?: number | null;
  fuente?: string | null;
  codigo?: string | null;
  tipo?: string | null;
  precio?: number | null;
  fecha?: string | null;
  ter?: number | null;
  riesgo?: number | null;
  clase?: string | null;
  politica?: string | null;
  rentabilidad1a?: number | null;
}

export interface ResultadoBusqueda {
  fuente: string;
  codigo: string;
  nombre: string;
  tipo: string;
  identificador: string;
  isin?: string | null;
  ticker?: string | null;
  politica?: string | null;
  cobertura?: string | null;
  rentabilidad1a?: number | null;
  cambioDia?: number | null;
  patrimonio?: number | null;
  estrellas?: number | null;
  vivo?: string | null;
  mercado?: string | null;
  precio: number;
  fecha: string;
  moneda: string;
  carteraId?: string | null;
  entidadSugerida?: string | null;
  perfilRiesgo?: string | null;
  comisionTotal?: string | null;
  actualizado?: string | null;
  fuenteUrl?: string | null;
  numComponentes?: number | null;
  planSecId?: string | null;
  componentes?: ComponenteCarteraModelo[];
  ficha?: {
    ter?: number;
    riesgo?: number;
    clase?: string;
    gestora?: string;
  };
  alternativas?: CotizacionAlternativa[];
}

export interface FilaImportacion {
  fila: string | number;
  fecha: string;
  producto: string;
  productoNombre: string;
  tipo: string;
  unidades: number | null;
  importe: number;
  marcas: string[];
  estado: 'nuevo' | 'repetido' | 'error';
}

export interface ProductoNuevoImportacion {
  id?: string;
  nombre: string;
  tipo: string;
  identificador?: string;
  fuente: string;
  codigo?: string;
  moneda?: string;
  precio?: number;
  monedaPrecio?: string;
  fechaPrecio?: string;
  mercado?: string;
}

export interface InformeImportacion {
  añadidos: number;
  repetidos: number;
  saldos: number;
  sustituidos: number;
  errores: { fila: string | number; mensaje: string }[];
  avisos: string[];
  totales: {
    compras: number;
    ventas: number;
    dividendos: number;
    comisiones: number;
    numCompras: number;
  };
  productosNuevos: ProductoNuevoImportacion[];
  filas: FilaImportacion[];
}

export interface CopiaSeguridad {
  archivo: string;
  fecha: string;
  motivo: string;
  productos: number;
  movimientos: number;
}

export interface MetricasCalculadas {
  valor: number;
  aportado: number;
  valorConCoste: number;
  plusvalia: number | null;
  rentabilidad: number | null;
  tir: number | null;
  numAportaciones: number;
  ritmo: number;
  racha: number;
  caida: number;
  caidaFecha: string | null;
  serie: number[];
  serieAportado: number[];
}

export interface EntidadBanco {
  id?: number | null;
  nombre: string;
  dominio?: string;
  logo?: string;
  categoria?: string;
  verificado?: boolean;
}

export interface RespuestaBancos {
  recientes: EntidadBanco[];
  entidades: EntidadBanco[];
  online: EntidadBanco[];
}
