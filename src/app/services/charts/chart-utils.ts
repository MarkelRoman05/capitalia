import { FormatService } from '../format.service';

export const SVG_NS = 'http://www.w3.org/2000/svg';

export const MESES_CORTOS = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
] as const;

export interface FilaTooltip {
  color?: string;
  raya?: boolean;
  nombre: string;
  valor: string;
  destacado?: boolean;
}

export interface EscalaBonita {
  max: number;
  min: number;
  paso: number;
}

export interface MargenesGrafico {
  t: number;
  r: number;
  b: number;
  l: number;
}

const COLOR_CSS_SEGURO =
  /^(#[0-9a-fA-F]{3,8}|rgba?\(\s*[0-9.,%\s]+\)|hsla?\(\s*[0-9.,%\sdeg]+\)|var\(--[a-zA-Z0-9_-]+\)|[a-zA-Z]{3,24})$/;

/** Valida un color CSS básico para evitar inyección en propiedades de estilo. */
export function colorCssSeguro(color: string | null | undefined, fallback = '#2b44cc'): string {
  const c = String(color ?? '').trim();
  return COLOR_CSS_SEGURO.test(c) ? c : fallback;
}

/** Crea un elemento SVG en el namespace W3C con atributos seguros. */
export function crearSvgEl(
  tag: string,
  attrs?: Record<string, string | number | null | undefined>,
  hijos?: SVGElement[]
): SVGElement {
  const n = document.createElementNS(SVG_NS, tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v !== null && v !== undefined) {
        n.setAttribute(k, String(v));
      }
    }
  }
  if (hijos) {
    hijos.forEach((h) => n.appendChild(h));
  }
  return n;
}

/** Crea un elemento `<text>` SVG insertando contenido de texto con `textContent`. */
export function crearSvgTxt(
  x: number,
  y: number,
  texto: string,
  cls = '',
  extra?: Record<string, string | number>
): SVGElement {
  const n = crearSvgEl('text', { x, y, class: cls, ...(extra ?? {}) });
  n.textContent = texto;
  return n;
}

/** Crea el nodo `<svg>` raíz con `viewBox`, clases y atributos ARIA de accesibilidad. */
export function creaSvgBase(W: number, H: number, cls: string, ariaLabel: string): SVGElement {
  return crearSvgEl('svg', {
    viewBox: `0 0 ${W} ${H}`,
    width: W,
    height: H,
    class: cls,
    role: 'img',
    'aria-label': ariaLabel,
  });
}

/** Renderiza un mensaje de estado vacío limpio mediante manipulación DOM segura. */
export function mostrarVacio(cont: HTMLElement, msg = 'Sin datos suficientes en este rango.'): void {
  cont.replaceChildren();
  const p = document.createElement('p');
  p.className = 'vacio';
  p.textContent = msg;
  cont.appendChild(p);
}

/** Calcula límites redondeados y paso legible para un eje numérico. */
export function escalaBonita(max: number, min = 0): EscalaBonita {
  if (!Number.isFinite(max) || !Number.isFinite(min)) {
    return { max: 1, min: 0, paso: 0.25 };
  }
  let mx = max;
  const mn = min;
  if (mx <= mn) mx = mn + 1;
  const bruto = (mx - mn) / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(bruto)));
  const norm = bruto / mag;
  const paso = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  const limpia = (v: number) =>
    Object.is(v, -0) || Math.abs(v) < 1e-12 ? 0 : Math.round(v * 1e10) / 1e10;
  return {
    max: limpia(Math.ceil(mx / paso) * paso),
    min: limpia(Math.floor(mn / paso) * paso),
    paso: limpia(paso),
  };
}

/** Dibuja líneas horizontales de rejilla y etiquetas del eje Y de forma uniforme. */
export function dibujaRejillaY(
  svg: SVGElement,
  pad: MargenesGrafico,
  W: number,
  esc: EscalaBonita,
  yFn: (v: number) => number,
  formatY: (v: number) => string
): void {
  const nPasos = Math.min(20, Math.max(1, Math.round((esc.max - esc.min) / (esc.paso || 1))));
  for (let k = 0; k <= nPasos; k++) {
    const raw = esc.min + k * esc.paso;
    const v = Math.abs(raw) < 1e-12 ? 0 : raw;
    if (v > esc.max + esc.paso * 1e-4) break;
    const py = yFn(v);
    svg.appendChild(crearSvgEl('line', { x1: pad.l, x2: W - pad.r, y1: py, y2: py, class: 'rejilla' }));
    svg.appendChild(crearSvgTxt(pad.l - 8, py + 4, formatY(v), 'ejeY'));
  }
}

/** Calcula índices equidistantes para etiquetar el eje X sin solapamientos. */
export function indicesEjeX(n: number, cuantos: number): number[] {
  if (n <= 0) return [];
  if (n === 1) return [0];
  const k = Math.max(2, Math.min(cuantos, n));
  const out: number[] = [];
  for (let i = 0; i < k; i++) {
    out.push(Math.round((i * (n - 1)) / (k - 1)));
  }
  return [...new Set(out)];
}

/** Formatea etiquetas de fecha para el eje X (`YYYY-MM-DD`, `YYYY-MM` o texto plano). */
export function etiquetaEjeX(fechas: string[], i: number, n: number): string {
  const f = fechas[i] ?? '';
  const partes = f.split('-');
  if (partes.length === 2) {
    return `${MESES_CORTOS[+partes[1] - 1] ?? ''} ${partes[0].slice(2)}`.trim();
  }
  if (partes.length < 3) return f;
  if (n > 70) return `${MESES_CORTOS[+partes[1] - 1] ?? ''} ${partes[0].slice(2)}`;
  return `${+partes[2]} ${MESES_CORTOS[+partes[1] - 1] ?? ''}`;
}

const LIMPIEZA_TOUCH_POR_CONT = new WeakMap<HTMLElement, () => void>();
let cerrarTooltipTouchActivo: (() => void) | null = null;

/**
 * Conecta eventos de ratón y táctiles en el área interactiva de un gráfico SVG:
 * - En escritorio (`mouse`): muestra al mover y oculta en `pointerleave`.
 * - En móvil (`touch` / `pen`): permite arrastrar horizontalmente (`touch-action: pan-y`),
 *   evita el menú contextual en pulsación larga y mantiene el tooltip visible al soltar el dedo
 *   hasta que el usuario toque fuera del gráfico.
 */
export function conectarInteraccionGrafico(
  objetivo: SVGElement,
  cont: HTMLElement,
  onMover: (ev: PointerEvent) => void,
  onOcultar: () => void
): void {
  const prevCleanup = LIMPIEZA_TOUCH_POR_CONT.get(cont);
  if (prevCleanup) {
    prevCleanup();
    LIMPIEZA_TOUCH_POR_CONT.delete(cont);
  }

  objetivo.style.touchAction = 'pan-y';

  let docListenerActivo = false;
  const alTocarFuera = (ev: PointerEvent) => {
    const target = ev.target as Node | null;
    if (target && cont.contains(target)) return;
    ocultarCompleto();
  };

  const quitarDocListener = () => {
    if (docListenerActivo && typeof document !== 'undefined') {
      document.removeEventListener('pointerdown', alTocarFuera, true);
      docListenerActivo = false;
    }
  };

  const ocultarCompleto = () => {
    quitarDocListener();
    if (cerrarTooltipTouchActivo === ocultarCompleto) {
      cerrarTooltipTouchActivo = null;
    }
    onOcultar();
  };

  const activarTouch = (ev: PointerEvent) => {
    if (cerrarTooltipTouchActivo && cerrarTooltipTouchActivo !== ocultarCompleto) {
      cerrarTooltipTouchActivo();
    }
    cerrarTooltipTouchActivo = ocultarCompleto;
    onMover(ev);
    if (!docListenerActivo && typeof document !== 'undefined') {
      document.addEventListener('pointerdown', alTocarFuera, true);
      docListenerActivo = true;
    }
  };

  objetivo.addEventListener('pointerdown', (ev: PointerEvent) => {
    if (ev.pointerType === 'mouse') {
      onMover(ev);
    } else {
      activarTouch(ev);
    }
  });

  objetivo.addEventListener('pointermove', (ev: PointerEvent) => {
    if (ev.pointerType === 'mouse') {
      onMover(ev);
    } else if (ev.buttons > 0 || docListenerActivo) {
      activarTouch(ev);
    }
  });

  objetivo.addEventListener('pointerleave', (ev: PointerEvent) => {
    if (ev.pointerType === 'mouse') {
      ocultarCompleto();
    }
  });

  objetivo.addEventListener('contextmenu', (ev: Event) => {
    ev.preventDefault();
  });

  LIMPIEZA_TOUCH_POR_CONT.set(cont, quitarDocListener);
}

/** Obtiene o crea el contenedor `.gtt` para tooltips flotantes. */
export function creaTooltip(cont: HTMLElement): HTMLElement {
  let t = cont.querySelector('.gtt') as HTMLElement | null;
  if (!t) {
    t = document.createElement('div');
    t.className = 'gtt';
    cont.appendChild(t);
  }
  return t;
}

/** Rellena el tooltip usando exclusivamente nodos DOM y `textContent`. */
export function rellenaTooltip(
  tt: HTMLElement,
  titulo: string,
  totalTexto: string | null,
  filas: FilaTooltip[],
  eventosExtra?: string[]
): void {
  tt.replaceChildren();
  const b = document.createElement('b');
  b.textContent = titulo;
  tt.appendChild(b);

  if (totalTexto) {
    const divTot = document.createElement('div');
    divTot.className = 'ttTotal';
    divTot.textContent = totalTexto;
    tt.appendChild(divTot);
  }

  if (eventosExtra && eventosExtra.length) {
    eventosExtra.forEach((evTxt) => {
      const dEv = document.createElement('div');
      dEv.className = 'ttEvento';
      dEv.textContent = evTxt;
      tt.appendChild(dEv);
    });
  }

  if (filas.length) {
    const table = document.createElement('table');
    filas.forEach((f) => {
      const tr = document.createElement('tr');
      if (f.destacado) tr.className = 'sep';
      const td1 = document.createElement('td');
      const dot = document.createElement('i');
      if (f.raya) {
        dot.className = 'raya';
      } else if (f.color) {
        dot.style.background = colorCssSeguro(f.color);
      }
      td1.appendChild(dot);
      td1.appendChild(document.createTextNode(f.nombre));
      const td2 = document.createElement('td');
      td2.textContent = f.valor;
      tr.appendChild(td1);
      tr.appendChild(td2);
      table.appendChild(tr);
    });
    tt.appendChild(table);
  }
}

/** Posiciona el tooltip dentro de los límites visibles del contenedor y del viewport. */
export function colocaTooltip(tt: HTMLElement, cont: HTMLElement, x: number, y: number): void {
  const cw = cont.clientWidth;
  const ch = cont.clientHeight || 240;
  const tw = tt.offsetWidth || 200;
  const th = tt.offsetHeight || 80;

  let px = x + 14;
  if (px + tw > cw - 4) px = x - tw - 14;
  if (px < 4) px = 4;

  const rect = cont.getBoundingClientRect();
  const vh = typeof window !== 'undefined' ? window.innerHeight : 0;

  // Límites verticales relativos a `cont` que mantienen el tooltip dentro del viewport
  const minPy = vh > 0 ? Math.max(-rect.top + 8, -th * 0.5) : 4;
  const maxPy = vh > 0 ? Math.min(ch + 16, vh - rect.top - th - 8) : Math.max(4, ch - th - 4);

  let py = y - th - 12;
  if (py < minPy) {
    const abajo = y + 16;
    py = abajo <= maxPy ? abajo : Math.max(minPy, Math.min(maxPy, y - th / 2));
  } else if (py > maxPy) {
    py = Math.max(minPy, maxPy);
  }

  tt.style.transform = `translate(${Math.round(px)}px, ${Math.round(py)}px)`;
}

/** Construye una descripción legible de rango temporal para atributos `aria-label`. */
export function rangoFechasAria(fechas: string[], fmt: FormatService): string {
  if (!fechas.length) return '';
  if (fechas.length === 1) return `en ${fmt.fmtFecha(fechas[0])}`;
  return `del ${fmt.fmtFecha(fechas[0])} al ${fmt.fmtFecha(fechas[fechas.length - 1])}`;
}

/** Dibuja el eje horizontal inferior y sus etiquetas equidistantes de fecha. */
export function dibujaEjeXFechas(
  svg: SVGElement,
  fechas: string[],
  n: number,
  W: number,
  H: number,
  pad: MargenesGrafico,
  xFn: (i: number) => number
): void {
  const ih = H - pad.t - pad.b;
  svg.appendChild(crearSvgEl('line', { x1: pad.l, x2: W - pad.r, y1: pad.t + ih, y2: pad.t + ih, class: 'eje' }));
  indicesEjeX(n, W < 520 ? 4 : 7).forEach((i) => {
    svg.appendChild(
      crearSvgTxt(xFn(i), H - 8, etiquetaEjeX(fechas, i, n), 'ejeX', {
        'text-anchor': i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle',
      })
    );
  });
}

/** Genera el comando `d` SVG de una barra vertical con esquinas redondeadas en su extremo libre. */
export function trazaBarraRedondeada(
  bx: number,
  yBase: number,
  yVal: number,
  ancho: number,
  haciaArriba: boolean
): string {
  const alto = Math.abs(yVal - yBase);
  const r = Math.min(4, alto / 2, ancho / 2);
  if (haciaArriba) {
    return `M${bx} ${yBase} L${bx} ${yVal + r} Q${bx} ${yVal} ${bx + r} ${yVal} L${bx + ancho - r} ${yVal} Q${bx + ancho} ${yVal} ${bx + ancho} ${yVal + r} L${bx + ancho} ${yBase} Z`;
  }
  const yFin = yVal;
  return `M${bx} ${yBase} L${bx} ${yFin - r} Q${bx} ${yFin} ${bx + r} ${yFin} L${bx + ancho - r} ${yFin} Q${bx + ancho} ${yFin} ${bx + ancho} ${yFin - r} L${bx + ancho} ${yBase} Z`;
}
