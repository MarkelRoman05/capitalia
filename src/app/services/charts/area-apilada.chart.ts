import { FormatService } from '../format.service';
import type { SerieGrafico } from '../chart.service';
import {
  FilaTooltip,
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

export interface AreaApiladaConfig {
  fechas: string[];
  series: SerieGrafico[];
  overlay?: { nombre: string; valores: (number | null)[] } | null;
  alto?: number;
  maxForzado?: number;
  formatoY?: (v: number) => string;
  formatoValor?: (v: number) => string;
}

export function renderAreaApiladaChart(
  cont: HTMLElement,
  cfg: AreaApiladaConfig,
  fmt: FormatService
): void {
  cont.replaceChildren();
  const W = Math.max(cont.clientWidth, 320);
  const H = cfg.alto || 320;
  const P = { t: 14, r: 14, b: 26, l: 64 };
  const iw = W - P.l - P.r;
  const ih = H - P.t - P.b;
  const fechas = cfg.fechas;
  const n = fechas.length;
  const series = cfg.series.filter((s) => s.valores.some((v) => v));
  if (!n || !series.length) {
    mostrarVacio(cont);
    return;
  }

  const acum: number[][] = [];
  for (let s = 0; s < series.length; s++) {
    const prev = s === 0 ? new Array<number>(n).fill(0) : acum[s - 1];
    acum.push(series[s].valores.map((v, i) => prev[i] + (v || 0)));
  }
  const totales = acum[acum.length - 1];
  let maxV = Math.max(...totales);
  if (cfg.overlay) {
    const ovVals = cfg.overlay.valores.filter((v): v is number => v != null);
    if (ovVals.length) maxV = Math.max(maxV, ...ovVals);
  }

  const esc = cfg.maxForzado
    ? { min: 0, max: cfg.maxForzado, paso: cfg.maxForzado / 4 }
    : escalaBonita(maxV, 0);

  const x = (i: number) => P.l + (n === 1 ? iw / 2 : (i * iw) / (n - 1));
  const y = (v: number) => P.t + ih - ((v - esc.min) / (esc.max - esc.min)) * ih;
  const fY = cfg.formatoY || ((v: number) => fmt.fmtEurCorto(v));
  const fV = cfg.formatoValor || ((v: number) => fmt.fmtEur(v));

  const aria = `Gráfico de área apilada con ${series.length} series ${rangoFechasAria(fechas, fmt)}`.trim();
  const svg = creaSvgBase(W, H, 'grafico', aria);

  for (let v = esc.min; v <= esc.max + 1e-9; v += esc.paso) {
    svg.appendChild(crearSvgEl('line', { x1: P.l, x2: W - P.r, y1: y(v), y2: y(v), class: 'rejilla' }));
    svg.appendChild(crearSvgTxt(P.l - 8, y(v) + 4, fY(v), 'ejeY'));
  }

  for (let s = series.length - 1; s >= 0; s--) {
    const arriba = acum[s];
    const abajo = s === 0 ? new Array<number>(n).fill(0) : acum[s - 1];
    let dd = '';
    for (let i = 0; i < n; i++) dd += (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(arriba[i]).toFixed(1) + ' ';
    for (let i = n - 1; i >= 0; i--) dd += 'L' + x(i).toFixed(1) + ' ' + y(abajo[i]).toFixed(1) + ' ';
    svg.appendChild(
      crearSvgEl('path', { d: dd + 'Z', fill: colorCssSeguro(series[s].color), 'fill-opacity': 0.88 })
    );
  }

  for (let s = 0; s < series.length - 1; s++) {
    let dd = '';
    for (let i = 0; i < n; i++) dd += (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(acum[s][i]).toFixed(1) + ' ';
    svg.appendChild(crearSvgEl('path', { d: dd, fill: 'none', class: 'separador' }));
  }

  if (cfg.overlay) {
    let dd = '';
    let abierto = false;
    cfg.overlay.valores.forEach((v, i) => {
      if (v == null) {
        abierto = false;
        return;
      }
      dd += (abierto ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1) + ' ';
      abierto = true;
    });
    svg.appendChild(crearSvgEl('path', { d: dd, fill: 'none', class: 'overlay' }));
  }

  dibujaEjeXFechas(svg, fechas, n, W, H, P, x);

  const g = crearSvgEl('g', { class: 'cursor', opacity: 0 });
  const linea = crearSvgEl('line', { y1: P.t, y2: P.t + ih, class: 'crosshair' });
  g.appendChild(linea);
  const puntos = series.map((s) =>
    crearSvgEl('circle', { r: 4.5, fill: colorCssSeguro(s.color), class: 'punto' })
  );
  puntos.forEach((p) => g.appendChild(p));
  const puntoTot = crearSvgEl('circle', { r: 5.5, class: 'puntoTotal' });
  g.appendChild(puntoTot);
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
    let i = Math.round(((px - P.l) / (iw || 1)) * (n - 1));
    i = Math.max(0, Math.min(n - 1, i));
    g.setAttribute('opacity', '1');
    linea.setAttribute('x1', String(x(i)));
    linea.setAttribute('x2', String(x(i)));
    series.forEach((s, k) => {
      const vis = s.valores[i] ? 1 : 0;
      puntos[k].setAttribute('cx', String(x(i)));
      puntos[k].setAttribute('cy', String(y(acum[k][i])));
      puntos[k].setAttribute('opacity', String(vis));
    });
    puntoTot.setAttribute('cx', String(x(i)));
    puntoTot.setAttribute('cy', String(y(totales[i])));

    const filas: FilaTooltip[] = series
      .map((s) =>
        s.valores[i]
          ? { color: s.color, nombre: s.nombre, valor: fV(s.valores[i] as number) }
          : null
      )
      .filter((f): f is NonNullable<typeof f> => f !== null)
      .reverse();

    if (cfg.overlay && cfg.overlay.valores[i] != null) {
      filas.push({
        raya: true,
        nombre: cfg.overlay.nombre,
        valor: fmt.fmtEur(cfg.overlay.valores[i]),
        destacado: true,
      });
    }
    rellenaTooltip(tt, fmt.fmtFecha(fechas[i]), fV(totales[i]), filas);
    tt.classList.add('on');
    colocaTooltip(tt, cont, x(i) * (r.width / W), ev.clientY - r.top);
  };
  conectarInteraccionGrafico(captura, cont, mover, () => {
    g.setAttribute('opacity', '0');
    tt.classList.remove('on');
  });
}
