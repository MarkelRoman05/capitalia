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
  escalaBonita,
  mostrarVacio,
  rellenaTooltip,
  trazaBarraRedondeada,
} from './chart-utils';

export interface BarrasApiladasConfig {
  categorias: string[];
  series: SerieGrafico[];
  alto?: number;
}

export interface BarrasAgrupadasConfig {
  categorias: string[];
  series: SerieGrafico[];
  alto?: number;
  formatoCat?: (c: string) => string;
}

export interface BarrasSimplesConfig {
  categorias: string[];
  valores: (number | null)[];
  color: string;
  colores?: string[];
  alto?: number;
  esPorcentaje?: boolean;
  formatoY?: (v: number) => string;
  formatoValor?: (v: number) => string;
}

export interface BarrasHorizontalesConfig {
  datos: [string, number][];
  color: string;
  filaAlto?: number;
}

export function renderBarrasApiladasChart(
  cont: HTMLElement,
  cfg: BarrasApiladasConfig,
  fmt: FormatService
): void {
  cont.replaceChildren();
  const W = Math.max(cont.clientWidth, 320);
  const H = cfg.alto || 236;
  const P = { t: 14, r: 14, b: 30, l: 58 };
  const iw = W - P.l - P.r;
  const ih = H - P.t - P.b;
  const cats = cfg.categorias;
  const n = cats.length;
  const series = cfg.series.filter((s) => s.valores.some((v) => v));
  if (!n || !series.length) {
    mostrarVacio(cont, 'Sin aportaciones en este rango.');
    return;
  }

  const totales = cats.map((_, i) => series.reduce((a, s) => a + (s.valores[i] || 0), 0));
  const esc = escalaBonita(Math.max(...totales), 0);
  const paso = iw / n;
  const ancho = Math.max(4, Math.min(paso - 6, 44));
  const y = (v: number) => P.t + ih - (v / esc.max) * ih;

  const svg = creaSvgBase(W, H, 'grafico', `Gráfico de barras apiladas con ${n} periodos y ${series.length} series`);
  for (let v = 0; v <= esc.max + 1e-9; v += esc.paso) {
    svg.appendChild(crearSvgEl('line', { x1: P.l, x2: W - P.r, y1: y(v), y2: y(v), class: 'rejilla' }));
    svg.appendChild(crearSvgTxt(P.l - 8, y(v) + 4, fmt.fmtEurCorto(v), 'ejeY'));
  }

  for (let i = 0; i < n; i++) {
    const cx = P.l + paso * i + paso / 2;
    const g = crearSvgEl('g', { class: 'barraGrupo' });
    let base = 0;
    const trozos = series.map((s) => ({ s, v: s.valores[i] || 0 })).filter((t) => t.v > 0);
    trozos.forEach((t, ord) => {
      const y0 = y(base + t.v);
      const y1 = y(base);
      const ultimo = ord === trozos.length - 1;
      const d = ultimo
        ? trazaBarraRedondeada(cx - ancho / 2, y1, y0, ancho, true)
        : `M${cx - ancho / 2} ${y1} L${cx - ancho / 2} ${y0} L${cx + ancho / 2} ${y0} L${cx + ancho / 2} ${y1} Z`;
      g.appendChild(crearSvgEl('path', { d, fill: colorCssSeguro(t.s.color), class: ord ? 'segSep' : '' }));
      base += t.v;
    });
    svg.appendChild(g);
  }

  svg.appendChild(crearSvgEl('line', { x1: P.l, x2: W - P.r, y1: P.t + ih, y2: P.t + ih, class: 'eje' }));
  const cada = Math.max(1, Math.ceil(n / (W < 520 ? 5 : 12)));
  cats.forEach((c, i) => {
    if (i % cada) return;
    svg.appendChild(crearSvgTxt(P.l + paso * i + paso / 2, H - 10, fmt.fmtMes(c), 'ejeX', { 'text-anchor': 'middle' }));
  });

  const resalte = crearSvgEl('rect', { class: 'resalte', y: P.t, height: ih, width: paso, opacity: 0 });
  svg.insertBefore(resalte, svg.firstChild);
  const captura = crearSvgEl('rect', { x: P.l, y: P.t, width: iw, height: ih, fill: 'transparent' });
  svg.appendChild(captura);
  cont.appendChild(svg);

  const tt = creaTooltip(cont);
  const mover = (ev: PointerEvent) => {
    const r = svg.getBoundingClientRect();
    const px = (ev.clientX - r.left) * (W / r.width);
    let i = Math.floor((px - P.l) / paso);
    i = Math.max(0, Math.min(n - 1, i));
    resalte.setAttribute('x', String(P.l + paso * i));
    resalte.setAttribute('opacity', '1');
    const filas = series
      .map((s) => {
        const val = s.valores[i] || 0;
        return val ? { color: s.color, nombre: s.nombre, valor: fmt.fmtEur(val), _num: val } : null;
      })
      .filter((f): f is NonNullable<typeof f> => f !== null)
      .sort((a, b) => b._num - a._num)
      .map(({ color, nombre, valor }) => ({ color, nombre, valor }));
    rellenaTooltip(tt, fmt.fmtMes(cats[i]), fmt.fmtEur(totales[i]), filas);
    tt.classList.add('on');
    colocaTooltip(tt, cont, (P.l + paso * i + paso / 2) * (r.width / W), ev.clientY - r.top);
  };
  conectarInteraccionGrafico(captura, cont, mover, () => {
    tt.classList.remove('on');
    resalte.setAttribute('opacity', '0');
  });
}

export function renderBarrasAgrupadasChart(
  cont: HTMLElement,
  cfg: BarrasAgrupadasConfig,
  fmt: FormatService
): void {
  cont.replaceChildren();
  const cats = cfg.categorias;
  const series = cfg.series;
  const n = cats.length;
  const m = series.length;
  if (!n || !m) {
    mostrarVacio(cont);
    return;
  }
  const W = Math.max(cont.clientWidth, 300);
  const H = cfg.alto || 250;
  const P = { t: 16, r: 14, b: 30, l: 60 };
  const iw = W - P.l - P.r;
  const ih = H - P.t - P.b;

  let max = 0;
  let min = 0;
  series.forEach((s) =>
    s.valores.forEach((v) => {
      if (v == null) return;
      if (v > max) max = v;
      if (v < min) min = v;
    })
  );
  const esc = escalaBonita(max, min);
  const y = (v: number) => P.t + ih - ((v - esc.min) / (esc.max - esc.min)) * ih;
  const paso = iw / n;
  const hueco = 3;
  const ancho = Math.max(3, (Math.min(paso - 8, 54) - hueco * (m - 1)) / m);

  const svg = creaSvgBase(W, H, 'grafico', `Gráfico de barras agrupadas con ${n} categorías y ${m} series`);
  for (let v = esc.min; v <= esc.max + 1e-9; v += esc.paso) {
    svg.appendChild(crearSvgEl('line', { x1: P.l, x2: W - P.r, y1: y(v), y2: y(v), class: 'rejilla' }));
    svg.appendChild(crearSvgTxt(P.l - 8, y(v) + 4, fmt.fmtEurCorto(v), 'ejeY'));
  }
  const y0 = y(0);
  const anchoGrupo = ancho * m + hueco * (m - 1);

  for (let i = 0; i < n; i++) {
    const x0 = P.l + paso * i + (paso - anchoGrupo) / 2;
    series.forEach((s, k) => {
      const v = s.valores[i];
      if (v == null || v === 0) return;
      const bx = x0 + k * (ancho + hueco);
      const yv = y(v);
      const d = trazaBarraRedondeada(bx, y0, yv, ancho, v >= 0);
      svg.appendChild(crearSvgEl('path', { d, fill: colorCssSeguro(s.color) }));
    });
  }
  svg.appendChild(crearSvgEl('line', { x1: P.l, x2: W - P.r, y1: y0, y2: y0, class: 'eje' }));
  const cada = Math.max(1, Math.ceil(n / (W < 520 ? 5 : 12)));
  cats.forEach((c, i) => {
    if (i % cada) return;
    svg.appendChild(
      crearSvgTxt(P.l + paso * i + paso / 2, H - 10, cfg.formatoCat ? cfg.formatoCat(c) : fmt.fmtMes(c), 'ejeX', {
        'text-anchor': 'middle',
      })
    );
  });

  const resalte = crearSvgEl('rect', { class: 'resalte', y: P.t, height: ih, width: paso, opacity: 0 });
  svg.insertBefore(resalte, svg.firstChild);
  const captura = crearSvgEl('rect', { x: P.l, y: P.t, width: iw, height: ih, fill: 'transparent' });
  svg.appendChild(captura);
  cont.appendChild(svg);

  const tt = creaTooltip(cont);
  const mover = (ev: PointerEvent) => {
    const r = svg.getBoundingClientRect();
    const px = (ev.clientX - r.left) * (W / r.width);
    const i = Math.max(0, Math.min(n - 1, Math.floor((px - P.l) / paso)));
    resalte.setAttribute('x', String(P.l + paso * i));
    resalte.setAttribute('opacity', '1');
    const filas = series
      .map((s) =>
        s.valores[i] != null ? { color: s.color, nombre: s.nombre, valor: fmt.fmtEur(s.valores[i]) } : null
      )
      .filter((f): f is NonNullable<typeof f> => f !== null);
    const total = series.reduce((a, s) => a + (s.valores[i] || 0), 0);
    rellenaTooltip(
      tt,
      cfg.formatoCat ? cfg.formatoCat(cats[i]) : fmt.fmtMes(cats[i]),
      fmt.fmtEurSigno(total),
      filas
    );
    tt.classList.add('on');
    colocaTooltip(tt, cont, (P.l + paso * i + paso / 2) * (r.width / W), ev.clientY - r.top);
  };
  conectarInteraccionGrafico(captura, cont, mover, () => {
    tt.classList.remove('on');
    resalte.setAttribute('opacity', '0');
  });
}

export function renderBarrasSimplesChart(
  cont: HTMLElement,
  cfg: BarrasSimplesConfig,
  fmt: FormatService
): void {
  cont.replaceChildren();
  const cats = cfg.categorias;
  const vals = cfg.valores;
  const n = cats.length;
  if (!n) {
    mostrarVacio(cont);
    return;
  }
  const W = Math.max(cont.clientWidth, 280);
  const H = cfg.alto || 240;
  const P = { t: 22, r: 14, b: 30, l: 60 };
  const iw = W - P.l - P.r;
  const ih = H - P.t - P.b;

  const esPct = cfg.esPorcentaje !== false;
  const fY = cfg.formatoY || (esPct ? (v: number) => fmt.fmtPct(v, 0) : (v: number) => fmt.fmtEurCorto(v));
  const fValor = cfg.formatoValor || (esPct ? (v: number) => fmt.fmtPctSigno(v, 1) : (v: number) => fmt.fmtEur(v, 0));

  const validos = vals.filter((v): v is number => v != null);
  let max = Math.max(0, ...validos);
  let min = Math.min(0, ...validos);
  const margen = (max - min) * 0.14 || (esPct ? 0.01 : 10);
  max += margen;
  if (esPct || min < 0) {
    min -= margen;
  }
  const y = (v: number) => P.t + ih - ((v - min) / (max - min)) * ih;
  const paso = iw / n;
  const ancho = Math.max(8, Math.min(paso - (n > 8 ? 10 : 18), 64));

  const svg = creaSvgBase(
    W,
    H,
    'grafico',
    `Gráfico de barras con ${n} elementos (${esPct ? 'porcentaje' : 'euros'})`
  );
  const esc = escalaBonita(max, min);
  const nPasos = Math.min(20, Math.max(1, Math.round((esc.max - esc.min) / (esc.paso || 1))));
  for (let k = 0; k <= nPasos; k++) {
    const raw = esc.min + k * esc.paso;
    const v = Math.abs(raw) < 1e-12 ? 0 : raw;
    if (v < min - 1e-9 || v > max + 1e-9) continue;
    svg.appendChild(crearSvgEl('line', { x1: P.l, x2: W - P.r, y1: y(v), y2: y(v), class: 'rejilla' }));
    svg.appendChild(crearSvgTxt(P.l - 8, y(v) + 4, fY(v), 'ejeY'));
  }
  const y0 = y(0);
  svg.appendChild(crearSvgEl('line', { x1: P.l, x2: W - P.r, y1: y0, y2: y0, class: 'eje' }));

  vals.forEach((v, i) => {
    if (v == null) return;
    const cx = P.l + paso * i + paso / 2;
    const yv = y(v);
    const arriba = v >= 0;
    const d = trazaBarraRedondeada(cx - ancho / 2, y0, yv, ancho, arriba);
    const col = colorCssSeguro((cfg.colores && cfg.colores[i]) || cfg.color, '#10b981');
    svg.appendChild(crearSvgEl('path', { d, fill: col }));
    svg.appendChild(
      crearSvgTxt(cx, arriba ? yv - 7 : yv + 15, fValor(v), 'barValArriba', {
        'text-anchor': 'middle',
      })
    );
    svg.appendChild(crearSvgTxt(cx, H - 10, cats[i], 'ejeX', { 'text-anchor': 'middle' }));
  });
  cont.appendChild(svg);
}

export function renderBarrasHorizontalesChart(
  cont: HTMLElement,
  cfg: BarrasHorizontalesConfig
): void {
  cont.replaceChildren();
  const datos = cfg.datos || [];
  if (!datos.length) {
    mostrarVacio(cont);
    return;
  }
  const W = Math.max(cont.clientWidth, 260);
  const filaAlto = cfg.filaAlto || 26;
  const H = datos.length * filaAlto + 6;
  const anchoEtq = Math.min(Math.max(...datos.map((d) => String(d[0]).length)) * 7 + 10, W * 0.42);
  const anchoVal = 54;
  const iw = W - anchoEtq - anchoVal;
  const max = Math.max(...datos.map((d) => d[1])) || 1;
  const col = colorCssSeguro(cfg.color, '#10b981');

  const svg = creaSvgBase(W, H, 'grafico', `Gráfico de barras horizontales con ${datos.length} elementos`);
  datos.forEach((dd, i) => {
    const yy = i * filaAlto + 3;
    const ancho = Math.max((dd[1] / max) * iw, 2);
    svg.appendChild(crearSvgTxt(anchoEtq - 10, yy + filaAlto / 2 + 1, dd[0], 'barEtq', { 'text-anchor': 'end' }));
    svg.appendChild(
      crearSvgEl('rect', {
        x: anchoEtq,
        y: yy + 3,
        width: ancho,
        height: filaAlto - 10,
        rx: 4,
        fill: col,
        'fill-opacity': 0.85,
      })
    );
    svg.appendChild(
      crearSvgTxt(
        W - 6,
        yy + filaAlto / 2 + 1,
        dd[1].toLocaleString('es-ES', { maximumFractionDigits: 2 }) + ' %',
        'barVal',
        { 'text-anchor': 'end' }
      )
    );
  });
  cont.appendChild(svg);
}
