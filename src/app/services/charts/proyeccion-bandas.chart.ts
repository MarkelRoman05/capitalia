import { FormatService } from '../format.service';
import {
  colocaTooltip,
  colorCssSeguro,
  conectarInteraccionGrafico,
  crearSvgEl,
  crearSvgTxt,
  creaSvgBase,
  creaTooltip,
  dibujaRejillaY,
  escalaBonita,
  indicesEjeX,
  MESES_CORTOS,
  mostrarVacio,
  rellenaTooltip,
} from './chart-utils';

export interface ProyeccionEscenariosOptions {
  /** Fechas ISO (`YYYY-MM-DD`) o etiquetas anuales (`2026`, `Año 1`, ...). */
  fechas: string[];
  optimista: (number | null)[];
  base: (number | null)[];
  pesimista: (number | null)[];
  aportado: (number | null)[];
  objetivo?: { valor: number; etiqueta?: string } | null;
  altura?: number;
  alto?: number;
  colorBase?: string;
  colorOptimista?: string;
  colorPesimista?: string;
  colorBanda?: string;
  etiquetas?: {
    optimista?: string;
    base?: string;
    pesimista?: string;
    aportado?: string;
  };
  formatoY?: (v: number) => string;
  formatoValor?: (v: number) => string;
}

function esNumero(v: number | null | undefined): v is number {
  return v !== null && v !== undefined && Number.isFinite(v);
}

function trazaLineaSegmentada(
  valores: (number | null)[],
  n: number,
  x: (i: number) => number,
  y: (v: number) => number
): string {
  let dd = '';
  let abierto = false;
  for (let i = 0; i < n; i++) {
    const v = valores[i];
    if (!esNumero(v)) {
      abierto = false;
      continue;
    }
    dd += `${abierto ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)} `;
    abierto = true;
  }
  return dd;
}

function etiquetaEjeProyeccion(fechas: string[], i: number): string {
  const f = fechas[i] ?? '';
  if (/^\d{4}-\d{2}-\d{2}/.test(f)) {
    const mes = MESES_CORTOS[+f.slice(5, 7) - 1] ?? '';
    return i === 0 ? `${mes} ${f.slice(0, 4)}` : f.slice(0, 4);
  }
  if (/^\d{4}-\d{2}$/.test(f)) {
    return f.slice(0, 4);
  }
  return f;
}

function tituloTooltipProyeccion(fechas: string[], i: number): string {
  const f = fechas[i] ?? '';
  if (/^\d{4}$/.test(f)) {
    return i === 0 ? `${f} (Inicio)` : `Año ${f}`;
  }
  if (/^\d{4}-\d{2}/.test(f)) {
    const yyyy = +f.slice(0, 4);
    const mes = MESES_CORTOS[+f.slice(5, 7) - 1] ?? '';
    const f0 = fechas[0] ?? '';
    if (/^\d{4}-\d{2}/.test(f0)) {
      const m0 = +f0.slice(0, 4) * 12 + (+f0.slice(5, 7) - 1);
      const mi = yyyy * 12 + (+f.slice(5, 7) - 1);
      const diffMeses = Math.max(0, mi - m0);
      if (diffMeses === 0) return `Hoy (${mes} ${yyyy})`;
      const anios = Math.floor(diffMeses / 12);
      const remMeses = diffMeses % 12;
      if (anios === 0) return `Mes ${remMeses} · ${mes} ${yyyy}`;
      return remMeses === 0
        ? `Año ${anios} · ${mes} ${yyyy}`
        : `Año ${anios} (+${remMeses}m) · ${mes} ${yyyy}`;
    }
    return `${mes} ${yyyy}`.trim();
  }
  return f || `Año ${i}`;
}

/**
 * Renderiza la proyección patrimonial con abanico sombreado de 3 escenarios
 * (`optimista`, `base`, `pesimista`), línea discontinua de `aportado`,
 * línea opcional de `objetivo` si entra en rango y tooltip interactivo por año.
 */
export function renderProyeccionEscenariosChart(
  cont: HTMLElement,
  opts: ProyeccionEscenariosOptions,
  fmt: FormatService
): void {
  cont.replaceChildren();
  const fechas = opts.fechas || [];
  const n = fechas.length;
  const opt = opts.optimista || [];
  const base = opts.base || [];
  const pes = opts.pesimista || [];
  const aport = opts.aportado || [];

  const todos = [...opt, ...base, ...pes, ...aport].filter(esNumero);
  if (!n || !todos.length) {
    mostrarVacio(cont, 'Sin datos suficientes para proyectar escenarios.');
    return;
  }

  const W = Math.max(cont.clientWidth, 320);
  const H = opts.alto || opts.altura || 250;
  const P = { t: 16, r: 16, b: 28, l: 64 };
  const iw = W - P.l - P.r;
  const ih = H - P.t - P.b;

  const maxV = Math.max(...todos);
  const minV = Math.min(0, ...todos);
  const esc = escalaBonita(maxV, minV);
  const rango = esc.max - esc.min || 1;

  const x = (i: number) => P.l + (n === 1 ? iw / 2 : (i * iw) / (n - 1));
  const y = (v: number) => P.t + ih - ((v - esc.min) / rango) * ih;
  const fY = opts.formatoY || ((v: number) => fmt.fmtEurCorto(v));
  const fV = opts.formatoValor || ((v: number) => fmt.fmtEur(v, 0));

  const colorBase = colorCssSeguro(opts.colorBase, '#f59e0b');
  const colorOpt = colorCssSeguro(opts.colorOptimista, '#10b981');
  const colorPes = colorCssSeguro(opts.colorPesimista, '#f43f5e');
  const colorBanda = colorCssSeguro(opts.colorBanda, colorBase);

  const etq = {
    optimista: opts.etiquetas?.optimista || 'Escenario optimista',
    base: opts.etiquetas?.base || 'Escenario base',
    pesimista: opts.etiquetas?.pesimista || 'Escenario pesimista',
    aportado: opts.etiquetas?.aportado || 'Capital aportado',
  };

  const svg = creaSvgBase(
    W,
    H,
    'grafico proyeccion-bandas',
    'Gráfico de proyección patrimonial con escenarios optimista, base y pesimista.'
  );

  dibujaRejillaY(svg, P, W, esc, y, fY);

  // Banda sombreada entre pesimista y optimista por segmentos válidos
  let seg: number[] = [];
  const cierraBanda = () => {
    if (seg.length >= 2) {
      let d = '';
      seg.forEach((idx, pos) => {
        const vo = opt[idx] as number;
        d += `${pos === 0 ? 'M' : 'L'}${x(idx).toFixed(1)} ${y(vo).toFixed(1)} `;
      });
      for (let k = seg.length - 1; k >= 0; k--) {
        const idx = seg[k];
        const vp = pes[idx] as number;
        d += `L${x(idx).toFixed(1)} ${y(vp).toFixed(1)} `;
      }
      svg.appendChild(
        crearSvgEl('path', {
          d: d + 'Z',
          fill: colorBanda,
          'fill-opacity': 0.15,
        })
      );
    }
    seg = [];
  };

  for (let i = 0; i < n; i++) {
    if (esNumero(opt[i]) && esNumero(pes[i])) {
      seg.push(i);
    } else {
      cierraBanda();
    }
  }
  cierraBanda();

  // Contornos de banda optimista y pesimista
  const dOpt = trazaLineaSegmentada(opt, n, x, y);
  if (dOpt) {
    svg.appendChild(
      crearSvgEl('path', {
        d: dOpt,
        fill: 'none',
        stroke: colorOpt,
        'stroke-width': 1.5,
        'stroke-opacity': 0.72,
        'stroke-dasharray': '3 3',
        'stroke-linejoin': 'round',
      })
    );
  }

  const dPes = trazaLineaSegmentada(pes, n, x, y);
  if (dPes) {
    svg.appendChild(
      crearSvgEl('path', {
        d: dPes,
        fill: 'none',
        stroke: colorPes,
        'stroke-width': 1.5,
        'stroke-opacity': 0.72,
        'stroke-dasharray': '3 3',
        'stroke-linejoin': 'round',
      })
    );
  }

  // Línea discontinua capital aportado
  const dAport = trazaLineaSegmentada(aport, n, x, y);
  if (dAport) {
    svg.appendChild(crearSvgEl('path', { d: dAport, fill: 'none', class: 'overlay' }));
  }

  // Línea sólida escenario base
  const dBase = trazaLineaSegmentada(base, n, x, y);
  if (dBase) {
    svg.appendChild(
      crearSvgEl('path', {
        d: dBase,
        fill: 'none',
        stroke: colorBase,
        'stroke-width': 2.5,
        'stroke-linejoin': 'round',
        'stroke-linecap': 'round',
      })
    );
  }

  // Línea horizontal opcional objetivo (solo si entra en rango visible)
  if (
    opts.objetivo &&
    Number.isFinite(opts.objetivo.valor) &&
    opts.objetivo.valor >= esc.min &&
    opts.objetivo.valor <= esc.max
  ) {
    const yr = y(opts.objetivo.valor);
    svg.appendChild(
      crearSvgEl('line', { x1: P.l, x2: W - P.r, y1: yr, y2: yr, class: 'referencia' })
    );
    const textoObj = opts.objetivo.etiqueta || `Objetivo: ${fV(opts.objetivo.valor)}`;
    svg.appendChild(
      crearSvgTxt(W - P.r - 6, yr - 6 < P.t + 10 ? yr + 13 : yr - 6, textoObj, 'refEtiqueta', {
        'text-anchor': 'end',
      })
    );
  }

  // Eje X
  svg.appendChild(
    crearSvgEl('line', { x1: P.l, x2: W - P.r, y1: P.t + ih, y2: P.t + ih, class: 'eje' })
  );
  indicesEjeX(n, W < 520 ? 4 : 7).forEach((i) => {
    svg.appendChild(
      crearSvgTxt(x(i), H - 8, etiquetaEjeProyeccion(fechas, i), 'ejeX', {
        'text-anchor': i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle',
      })
    );
  });

  // Crosshair interactivo + puntos de los 3 escenarios
  const gCursor = crearSvgEl('g', { class: 'cursor', opacity: 0 });
  const linea = crearSvgEl('line', { y1: P.t, y2: P.t + ih, class: 'crosshair' });
  const puntoOpt = crearSvgEl('circle', { r: 4, fill: colorOpt, class: 'punto' });
  const puntoBase = crearSvgEl('circle', { r: 5, fill: colorBase, class: 'punto' });
  const puntoPes = crearSvgEl('circle', { r: 4, fill: colorPes, class: 'punto' });
  gCursor.appendChild(linea);
  gCursor.appendChild(puntoOpt);
  gCursor.appendChild(puntoPes);
  gCursor.appendChild(puntoBase);
  svg.appendChild(gCursor);

  const captura = crearSvgEl('rect', {
    x: P.l,
    y: P.t,
    width: iw,
    height: ih,
    fill: 'transparent',
    style: 'cursor:crosshair',
  });
  svg.appendChild(captura);
  cont.appendChild(svg);

  const tt = creaTooltip(cont);
  const actualizaPunto = (nodo: SVGElement, cx: number, v: number | null | undefined) => {
    if (esNumero(v)) {
      nodo.setAttribute('opacity', '1');
      nodo.setAttribute('cx', String(cx));
      nodo.setAttribute('cy', String(y(v)));
    } else {
      nodo.setAttribute('opacity', '0');
    }
  };

  const mover = (ev: PointerEvent) => {
    const r = svg.getBoundingClientRect();
    const px = (ev.clientX - r.left) * (W / (r.width || 1));
    const i = Math.max(0, Math.min(n - 1, Math.round(((px - P.l) / (iw || 1)) * (n - 1))));
    const vo = opt[i];
    const vb = base[i];
    const vp = pes[i];
    const va = aport[i];

    if (!esNumero(vo) && !esNumero(vb) && !esNumero(vp)) {
      gCursor.setAttribute('opacity', '0');
      tt.classList.remove('on');
      return;
    }

    const cx = x(i);
    gCursor.setAttribute('opacity', '1');
    linea.setAttribute('x1', String(cx));
    linea.setAttribute('x2', String(cx));
    actualizaPunto(puntoOpt, cx, vo);
    actualizaPunto(puntoBase, cx, vb);
    actualizaPunto(puntoPes, cx, vp);

    rellenaTooltip(tt, tituloTooltipProyeccion(fechas, i), esNumero(vb) ? fV(vb) : null, [
      { color: colorOpt, nombre: etq.optimista, valor: esNumero(vo) ? fV(vo) : '—' },
      { color: colorBase, nombre: etq.base, valor: esNumero(vb) ? fV(vb) : '—' },
      { color: colorPes, nombre: etq.pesimista, valor: esNumero(vp) ? fV(vp) : '—' },
      { raya: true, nombre: etq.aportado, valor: esNumero(va) ? fV(va) : '—', destacado: true },
    ]);
    tt.classList.add('on');
    colocaTooltip(tt, cont, cx * (r.width / W), ev.clientY - r.top);
  };

  conectarInteraccionGrafico(captura, cont, mover, () => {
    gCursor.setAttribute('opacity', '0');
    tt.classList.remove('on');
  });
}
