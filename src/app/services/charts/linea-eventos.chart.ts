import { FormatService } from '../format.service';
import type { EventoGrafico } from '../chart.service';
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

export interface LineaConEventosConfig {
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

export function renderLineaConEventosChart(
  cont: HTMLElement,
  cfg: LineaConEventosConfig,
  fmt: FormatService
): void {
  cont.replaceChildren();
  const W = Math.max(cont.clientWidth, 320);
  const H = cfg.alto || 250;
  const P = { t: 14, r: 14, b: 26, l: 64 };
  const iw = W - P.l - P.r;
  const ih = H - P.t - P.b;
  const fechas = cfg.fechas;
  const n = fechas.length;
  const vals = cfg.valores;
  const validos = vals.filter((v): v is number => v != null);
  if (!n || !validos.length) {
    mostrarVacio(cont);
    return;
  }

  let maxV = Math.max(...validos);
  let minV = Math.min(...validos);
  if (cfg.overlay) {
    const o = cfg.overlay.valores.filter((v): v is number => v != null);
    if (o.length) {
      maxV = Math.max(maxV, ...o);
      minV = Math.min(minV, ...o);
    }
  }
  const esc = escalaBonita(maxV, cfg.desdeCero === false ? minV - (maxV - minV) * 0.12 : 0);
  const x = (i: number) => P.l + (n === 1 ? iw / 2 : (i * iw) / (n - 1));
  const y = (v: number) => P.t + ih - ((v - esc.min) / (esc.max - esc.min)) * ih;
  const colorMain = colorCssSeguro(cfg.color, '#10b981');

  const nEv = cfg.eventos?.length || 0;
  const aria = `Gráfico de evolución lineal ${rangoFechasAria(fechas, fmt)}${nEv ? ` con ${nEv} eventos` : ''}`.trim();
  const svg = creaSvgBase(W, H, 'grafico', aria);

  for (let v = esc.min; v <= esc.max + 1e-9; v += esc.paso) {
    svg.appendChild(crearSvgEl('line', { x1: P.l, x2: W - P.r, y1: y(v), y2: y(v), class: 'rejilla' }));
    svg.appendChild(crearSvgTxt(P.l - 8, y(v) + 4, cfg.formatoY ? cfg.formatoY(v) : fmt.fmtEurCorto(v), 'ejeY'));
  }

  let dLin = '';
  let abierto = false;
  let primerX: number | null = null;
  let ultimoX: number | null = null;
  vals.forEach((v, i) => {
    if (v == null) {
      abierto = false;
      return;
    }
    if (primerX === null) primerX = i;
    ultimoX = i;
    dLin += (abierto ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1) + ' ';
    abierto = true;
  });
  if (primerX !== null && ultimoX !== null) {
    const dArea =
      `M${x(primerX).toFixed(1)} ${(P.t + ih).toFixed(1)} ` +
      dLin.replace(/^M/, 'L') +
      `L${x(ultimoX).toFixed(1)} ${(P.t + ih).toFixed(1)} Z`;
    svg.appendChild(crearSvgEl('path', { d: dArea, fill: colorMain, 'fill-opacity': 0.15 }));
  }

  if (cfg.overlay) {
    let dd = '';
    let ab = false;
    cfg.overlay.valores.forEach((v, i) => {
      if (v == null) {
        ab = false;
        return;
      }
      dd += (ab ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1) + ' ';
      ab = true;
    });
    svg.appendChild(crearSvgEl('path', { d: dd, fill: 'none', class: 'overlay' }));
  }

  svg.appendChild(
    crearSvgEl('path', {
      d: dLin,
      fill: 'none',
      stroke: colorMain,
      'stroke-width': 2.2,
      'stroke-linejoin': 'round',
      'stroke-linecap': 'round',
    })
  );

  if (cfg.referencia && cfg.referencia.valor >= esc.min && cfg.referencia.valor <= esc.max) {
    const yr = y(cfg.referencia.valor);
    svg.appendChild(crearSvgEl('line', { x1: P.l, x2: W - P.r, y1: yr, y2: yr, class: 'referencia' }));
    svg.appendChild(crearSvgTxt(W - P.r - 6, yr - 7, cfg.referencia.etiqueta, 'refEtiqueta', { 'text-anchor': 'end' }));
  }

  const idx: Record<string, number> = {};
  fechas.forEach((f, i) => (idx[f] = i));
  (cfg.eventos || []).forEach((ev) => {
    const i = idx[ev.fecha];
    if (i === undefined || vals[i] == null) return;
    svg.appendChild(
      crearSvgEl('circle', {
        cx: x(i),
        cy: y(vals[i] as number),
        r: ev.r || 4.5,
        fill: colorCssSeguro(ev.color || colorMain, colorMain),
        class: 'marcador' + (ev.aro ? ' aro' : ''),
      })
    );
  });

  dibujaEjeXFechas(svg, fechas, n, W, H, P, x);

  const g = crearSvgEl('g', { class: 'cursor', opacity: 0 });
  const linea = crearSvgEl('line', { y1: P.t, y2: P.t + ih, class: 'crosshair' });
  const punto = crearSvgEl('circle', { r: 5.5, fill: colorMain, class: 'punto' });
  g.appendChild(linea);
  g.appendChild(punto);
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

  const porFecha: Record<string, EventoGrafico[]> = {};
  (cfg.eventos || []).forEach((e) => {
    (porFecha[e.fecha] = porFecha[e.fecha] || []).push(e);
  });

  const tt = creaTooltip(cont);
  const mover = (ev: PointerEvent) => {
    const r = svg.getBoundingClientRect();
    const px = (ev.clientX - r.left) * (W / r.width);
    const i = Math.max(0, Math.min(n - 1, Math.round(((px - P.l) / (iw || 1)) * (n - 1))));
    if (vals[i] == null) {
      tt.classList.remove('on');
      g.setAttribute('opacity', '0');
      return;
    }
    g.setAttribute('opacity', '1');
    linea.setAttribute('x1', String(x(i)));
    linea.setAttribute('x2', String(x(i)));
    punto.setAttribute('cx', String(x(i)));
    punto.setAttribute('cy', String(y(vals[i] as number)));

    const evTextos = (porFecha[fechas[i]] || []).map((e) => e.texto);
    const filas: FilaTooltip[] = [];
    if (cfg.overlay && cfg.overlay.valores[i] != null) {
      filas.push({
        raya: true,
        nombre: cfg.overlay.nombre,
        valor: fmt.fmtEur(cfg.overlay.valores[i]),
      });
    }
    rellenaTooltip(tt, fmt.fmtFecha(fechas[i]), fmt.fmtEur(vals[i]), filas, evTextos);
    tt.classList.add('on');
    colocaTooltip(tt, cont, x(i) * (r.width / W), ev.clientY - r.top);
  };
  conectarInteraccionGrafico(captura, cont, mover, () => {
    g.setAttribute('opacity', '0');
    tt.classList.remove('on');
  });
}
