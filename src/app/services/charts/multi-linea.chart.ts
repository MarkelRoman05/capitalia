import { FormatService } from '../format.service';
import type { SerieGrafico } from '../chart.service';
import {
  colocaTooltip,
  colorCssSeguro,
  conectarInteraccionGrafico,
  creaSvgBase,
  creaTooltip,
  crearSvgEl,
  crearSvgTxt,
  dibujaEjeXFechas,
  escalaBonita,
  mostrarVacio,
  rangoFechasAria,
  rellenaTooltip,
} from './chart-utils';

export interface MultiLineaConfig {
  fechas: string[];
  series: SerieGrafico[];
  alto?: number;
  desdeCero?: boolean;
  formatoY?: (v: number) => string;
  formatoValor?: (v: number) => string;
}

export function renderMultiLineaChart(
  cont: HTMLElement,
  cfg: MultiLineaConfig,
  fmt: FormatService
): void {
  cont.replaceChildren();
  const W = Math.max(cont.clientWidth, 320);
  const H = cfg.alto || 310;
  const P = { t: 14, r: 14, b: 26, l: 64 };
  const iw = W - P.l - P.r;
  const ih = H - P.t - P.b;
  const fechas = cfg.fechas;
  const n = fechas.length;
  const series = (cfg.series || []).filter((s) => s.valores.some((v) => v != null));
  if (!n || !series.length) {
    mostrarVacio(cont);
    return;
  }
  const fY = cfg.formatoY || ((v: number) => String(Math.round(v)));
  const fV = cfg.formatoValor || ((v: number) => v.toFixed(1));

  let max = -Infinity;
  let min = Infinity;
  series.forEach((s) =>
    s.valores.forEach((v) => {
      if (v == null) return;
      if (v > max) max = v;
      if (v < min) min = v;
    })
  );
  const margen = (max - min) * 0.08 || 1;
  const esc = escalaBonita(max + margen, cfg.desdeCero ? 0 : min - margen);
  const x = (i: number) => P.l + (n === 1 ? iw / 2 : (i * iw) / (n - 1));
  const y = (v: number) => P.t + ih - ((v - esc.min) / (esc.max - esc.min)) * ih;

  const aria = `Gráfico comparativo de ${series.length} líneas ${rangoFechasAria(fechas, fmt)}`.trim();
  const svg = creaSvgBase(W, H, 'grafico', aria);

  for (let v = esc.min; v <= esc.max + 1e-9; v += esc.paso) {
    svg.appendChild(crearSvgEl('line', { x1: P.l, x2: W - P.r, y1: y(v), y2: y(v), class: 'rejilla' }));
    svg.appendChild(crearSvgTxt(P.l - 8, y(v) + 4, fY(v), 'ejeY'));
  }

  series.forEach((s) => {
    let d = '';
    let ab = false;
    s.valores.forEach((v, i) => {
      if (v == null) {
        ab = false;
        return;
      }
      d += (ab ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1) + ' ';
      ab = true;
    });
    svg.appendChild(
      crearSvgEl('path', {
        d,
        fill: 'none',
        stroke: colorCssSeguro(s.color),
        'stroke-width': s.destacado ? 2.8 : 1.8,
        'stroke-opacity': s.destacado ? 1 : 0.78,
        'stroke-linejoin': 'round',
        'stroke-linecap': 'round',
      })
    );
  });

  dibujaEjeXFechas(svg, fechas, n, W, H, P, x);

  const g = crearSvgEl('g', { class: 'cursor', opacity: 0 });
  const linea = crearSvgEl('line', { y1: P.t, y2: P.t + ih, class: 'crosshair' });
  g.appendChild(linea);
  const puntos = series.map((s) =>
    crearSvgEl('circle', { r: 4.5, fill: colorCssSeguro(s.color), class: 'punto' })
  );
  puntos.forEach((p) => g.appendChild(p));
  svg.appendChild(g);

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
  const mover = (ev: PointerEvent) => {
    const r = svg.getBoundingClientRect();
    const px = (ev.clientX - r.left) * (W / r.width);
    const i = Math.max(0, Math.min(n - 1, Math.round(((px - P.l) / (iw || 1)) * (n - 1))));
    g.setAttribute('opacity', '1');
    linea.setAttribute('x1', String(x(i)));
    linea.setAttribute('x2', String(x(i)));
    const orden = series
      .map((s, k) => ({ s, k, v: s.valores[i] }))
      .filter((o): o is { s: SerieGrafico; k: number; v: number } => o.v != null)
      .sort((a, b) => b.v - a.v);
    series.forEach((s, k) => {
      const v = s.valores[i];
      puntos[k].setAttribute('opacity', v == null ? '0' : '1');
      if (v != null) {
        puntos[k].setAttribute('cx', String(x(i)));
        puntos[k].setAttribute('cy', String(y(v)));
      }
    });
    const filas = orden.map((o) => ({
      color: o.s.color,
      nombre: o.s.nombre,
      valor: fV(o.v),
      destacado: o.s.destacado,
    }));
    rellenaTooltip(tt, fmt.fmtFecha(fechas[i]), null, filas);
    tt.classList.add('on');
    colocaTooltip(tt, cont, x(i) * (r.width / W), ev.clientY - r.top);
  };
  conectarInteraccionGrafico(captura, cont, mover, () => {
    g.setAttribute('opacity', '0');
    tt.classList.remove('on');
  });
}
