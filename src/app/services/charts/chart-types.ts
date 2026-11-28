export interface SerieGrafico {
  id?: string;
  nombre: string;
  color: string;
  valores: (number | null)[];
  destacado?: boolean;
}

export interface EventoGrafico {
  fecha: string;
  color?: string;
  aro?: boolean;
  r?: number;
  texto: string;
}

export interface DatoDonut {
  id?: string;
  nombre: string;
  valor: number;
  color: string;
}

export type ChartRenderFn = (el: HTMLElement) => void;

export type ChartConfig =
  | {
      tipo: 'areaApilada';
      fechas: string[];
      series: SerieGrafico[];
      overlay?: { nombre: string; valores: (number | null)[] } | null;
      alto?: number;
      maxForzado?: number;
      formatoY?: (v: number) => string;
      formatoValor?: (v: number) => string;
    }
  | {
      tipo: 'lineaConEventos';
      fechas: string[];
      valores: (number | null)[];
      color: string;
      alto?: number;
      desdeCero?: boolean;
      overlay?: { nombre: string; valores: (number | null)[] } | null;
      referencia?: { valor: number; etiqueta: string } | null;
      eventos?: EventoGrafico[];
      formatoY?: ((v: number) => string) | null;
    }
  | {
      tipo: 'barrasApiladas';
      categorias: string[];
      series: SerieGrafico[];
      alto?: number;
    }
  | {
      tipo: 'barrasAgrupadas';
      categorias: string[];
      series: SerieGrafico[];
      alto?: number;
      formatoCat?: (c: string) => string;
    }
  | {
      tipo: 'barrasSimples';
      categorias: string[];
      valores: (number | null)[];
      color: string;
      colores?: string[];
      alto?: number;
      esPorcentaje?: boolean;
      formatoY?: (v: number) => string;
      formatoValor?: (v: number) => string;
    }
  | {
      tipo: 'barrasHorizontales';
      datos: [string, number][];
      color: string;
      filaAlto?: number;
    }
  | {
      tipo: 'multiLinea';
      fechas: string[];
      series: SerieGrafico[];
      alto?: number;
      desdeCero?: boolean;
      formatoY?: (v: number) => string;
      formatoValor?: (v: number) => string;
    }
  | {
      tipo: 'donut';
      datos: DatoDonut[];
      alto?: number;
      tituloCentro?: string;
      valorCentro?: string;
      onSelect?: (d: DatoDonut) => void;
    }
  | {
      tipo: 'sparkline';
      valores: (number | null)[];
      color: string;
      alto?: number;
    };
