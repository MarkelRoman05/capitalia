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
  etiquetaEjeX,
  indicesEjeX,
  mostrarVacio,
  rellenaTooltip,
} from './chart-utils';

export interface DrawdownChartOptions {
  fechas: string[];
  /** Serie de drawdown en ratio decimal `<= 0` (ej. `-0.185` = `-18,5 %`). */
  valores: (number | null)[];
  altura?: number;
  alto?: number;
  color?: string;
  etiquetaSerie?: string;
  maxDDFecha?: string | null;
  formatoY?: (v: number) => string;
  formatoValor?: (v: number) => string;
}

/**
 * Renderiza una curva de Drawdown (*Underwater*) desde `0 %` hacia abajo,
 * con área sombreada, marcador de caída máxima (`Max DD`), crosshair y tooltip.
 */
export function renderDrawdownChart(
  cont: HTMLElement,
  opts: DrawdownChartOptions,
  fmt: FormatService
): void {
  cont.replaceChildren();
  const fechas = opts.fechas || [];
  const valsRaw = opts.valores || [];
  const n = Math.min(fechas.length, valsRaw.length);
  const vals = valsRaw.slice(0, n).map((v) =>
    v !== null && v !== undefined && Number.isFinite(v) ? Math.min(0, v) : null
  );
  const validos = vals.filter((v): v is number => v !== null);
  if (!n || !validos.length) {
    mostrarVacio(cont, 'Sin datos de drawdown en este rango.');
    return;
  }

  const W = Math.max(cont.clientWidth, 320);
  const H = opts.alto || opts.altura || 240;
  const P = { t: 16, r: 16, b: 28, l: 58 };
  const iw = W - P.l - P.r;
  const ih = H - P.t - P.b;
  const color = colorCssSeguro(opts.color, '#f43f5e');

  const minVal = Math.min(0, ...validos);
  const minConMargen = Math.min(-0.05, minVal * 1.12);
  const esc = escalaBonita(0, minConMargen);
  const rango = esc.max - esc.min || 0.05;

  const x = (i: number) => P.l + (n === 1 ? iw / 2 : (i * iw) / (n - 1));
  const y = (v: number) => P.t + ih - ((v - esc.min) / rango) * ih;
  const fY =
    opts.formatoY ||
    ((v: number) => fmt.fmtPct(v, esc.paso < 0.015 ? 1 : 0));
  const fV = opts.formatoValor || ((v: number) => fmt.fmtPct(v, 2));

  // Localizar índice de caída máxima (Max DD)
  let maxDdIdx = -1;
  let minEncontrado = Infinity;
  vals.forEach((v, i) => {
    if (v === null) return;
    if (v < minEncontrado || (opts.maxDDFecha && fechas[i] === opts.maxDDFecha && v === minEncontrado)) {
      minEncontrado = v;
      maxDdIdx = i;
    }
  });

  const ariaMax =
    maxDdIdx >= 0 && minEncontrado < 0
      ? `Curva de drawdown. Caída máxima de ${fV(minEncontrado)} el ${fmt.fmtFecha(fechas[maxDdIdx])}.`
      : 'Curva de drawdown sin caídas acumuladas en el periodo.';
  const svg = creaSvgBase(W, H, 'grafico drawdown', ariaMax);

  dibujaRejillaY(svg, P, W, esc, y, fY);

  const yCero = y(0);

  // Construir segmentos continuos para área sombreada y trazo
  let dLin = '';
  let segInicio: number | null = null;
  let segFin: number | null = null;
  let dSeg = '';

  const cerrarSegmento = () => {
    if (segInicio !== null && segFin !== null && segFin > segInicio) {
      const dArea =
        `M${x(segInicio).toFixed(1)} ${yCero.toFixed(1)} ` +
        dSeg.replace(/^M/, 'L') +
        `L${x(segFin).toFixed(1)} ${yCero.toFixed(1)} Z`;
      svg.appendChild(crearSvgEl('path', { d: dArea, fill: color, 'fill-opacity': 0.18 }));
    }
    segInicio = null;
    segFin = null;
    dSeg = '';
  };

  vals.forEach((v, i) => {
    if (v === null) {
      cerrarSegmento();
      return;
    }
    const cmd = segInicio === null ? 'M' : 'L';
    const pt = `${cmd}${x(i).toFixed(1)} ${y(v).toFixed(1)} `;
    if (segInicio === null) segInicio = i;
    segFin = i;
    dSeg += pt;
    dLin += pt;
  });
  cerrarSegmento();

  if (dLin) {
    svg.appendChild(
      crearSvgEl('path', {
        d: dLin,
        fill: 'none',
        stroke: color,
        'stroke-width': 2,
        'stroke-linejoin': 'round',
        'stroke-linecap': 'round',
      })
    );
  }

  // Línea base 0 %
  svg.appendChild(crearSvgEl('line', { x1: P.l, x2: W - P.r, y1: yCero, y2: yCero, class: 'eje' }));

  // Marcador en el punto de caída máxima (Max DD)
  if (maxDdIdx >= 0 && minEncontrado < 0) {
    const mx = x(maxDdIdx);
    const my = y(minEncontrado);
    svg.appendChild(
      crearSvgEl('circle', {
        cx: mx,
        cy: my,
        r: 5,
        fill: color,
        class: 'marcador aro',
      })
    );
    const etiquetaDd = `Max DD ${fV(minEncontrado)}`;
    const anchor = mx > P.l + iw * 0.68 ? 'end' : mx < P.l + iw * 0.32 ? 'start' : 'middle';
    const dx = anchor === 'end' ? -8 : anchor === 'start' ? 8 : 0;
    const dy = my + 18 > P.t + ih - 4 ? -10 : 16;
    svg.appendChild(
      crearSvgTxt(mx + dx, my + dy, etiquetaDd, 'barVal', {
        'text-anchor': anchor,
        fill: color,
      })
    );
  }

  // Etiquetas eje X
  indicesEjeX(n, W < 520 ? 4 : 7).forEach((i) => {
    svg.appendChild(
      crearSvgTxt(x(i), H - 8, etiquetaEjeX(fechas, i, n), 'ejeX', {
        'text-anchor': i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle',
      })
    );
  });

  // Crosshair interactivo
  const gCursor = crearSvgEl('g', { class: 'cursor', opacity: 0 });
  const linea = crearSvgEl('line', { y1: P.t, y2: P.t + ih, class: 'crosshair' });
  const punto = crearSvgEl('circle', { r: 4.8, fill: color, class: 'punto' });
  gCursor.appendChild(linea);
  gCursor.appendChild(punto);
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
  const etiquetaSerie = opts.etiquetaSerie || 'Caída desde máximo';

  const mover = (ev: PointerEvent) => {
    const r = svg.getBoundingClientRect();
    const px = (ev.clientX - r.left) * (W / (r.width || 1));
    const i = Math.max(0, Math.min(n - 1, Math.round(((px - P.l) / (iw || 1)) * (n - 1))));
    const val = vals[i];
    if (val === null) {
      tt.classList.remove('on');
      gCursor.setAttribute('opacity', '0');
      return;
    }
    const cx = x(i);
    const cy = y(val);
    gCursor.setAttribute('opacity', '1');
    linea.setAttribute('x1', String(cx));
    linea.setAttribute('x2', String(cx));
    punto.setAttribute('cx', String(cx));
    punto.setAttribute('cy', String(cy));

    const extra =
      i === maxDdIdx && minEncontrado < 0 ? ['Máxima caída del periodo (Max DD)'] : undefined;
    rellenaTooltip(
      tt,
      fmt.fmtFecha(fechas[i]),
      fV(val),
      [{ color, nombre: etiquetaSerie, valor: fV(val) }],
      extra
    );
    tt.classList.add('on');
    colocaTooltip(tt, cont, cx * (r.width / W), ev.clientY - r.top);
  };

  conectarInteraccionGrafico(captura, cont, mover, () => {
    gCursor.setAttribute('opacity', '0');
    tt.classList.remove('on');
  });
}
