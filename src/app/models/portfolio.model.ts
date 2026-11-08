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
}

export interface ComisionesDatos {
  lineas: LineaComision[];
  anual: number;
  base: number;
  terPonderado: number | null;
  compraventaPagada: number;
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
  rentTotal: number;
  cagr: number | null;
  vol: number | null;
  sharpe: number | null;
  maxDD: number;
  maxDDFecha: string | null;
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
  respaldo?: string;
  respaldoMoneda?: string;
  vivo?: string;
  papel?: string;
}

export interface MovimientoCfg {
  id: string;
  fecha: string;
  producto: string;
  tipo: 'compra' | 'venta' | 'dividendo' | 'comision';
  unidades: number;
  importe: number;
  comision?: number | null;
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
}

export interface ResultadoBusqueda {
  fuente: string;
  codigo: string;
  nombre: string;
  tipo: string;
  identificador: string;
  vivo?: string | null;
  mercado?: string | null;
  precio: number;
  fecha: string;
  moneda: string;
  ficha?: {
    ter?: number;
    riesgo?: number;
    clase?: string;
    gestora?: string;
  };
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
