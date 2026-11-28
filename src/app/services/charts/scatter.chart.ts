import { FormatService } from '../format.service';
import {
  colocaTooltip,
  colorCssSeguro,
  crearSvgEl,
  crearSvgTxt,
  creaSvgBase,
  creaTooltip,
  dibujaRejillaY,
  escalaBonita,
  mostrarVacio,
  rellenaTooltip,
} from './chart-utils';

export interface PuntoScatterRiesgo {
  id?: string;
  nombre: string;
  corto?: string;
  /** Volatilidad anual en ratio decimal (ej. `0.145` = `14,5 %`). */
  volatilidad: number;
  /** Rentabilidad anualizada CAGR en ratio decimal (ej. `0.092` = `9,2 %`). */
  cagr: number;
  /** Peso en cartera (ej. `0.25` = `25 %`) para dimensionar el radio de la burbuja (`6px..22px`). */
  peso?: number | null;
  sharpe?: number | null;
  sortino?: number | null;
  color?: string;
  destacado?: boolean;
}

export interface ScatterRiesgoOptions {
  puntos: PuntoScatterRiesgo[];
  altura?: number;
  alto?: number;
  tituloEjeX?: string;
  tituloEjeY?: string;
  mostrarPromedio?: boolean;
  onSelect?: (punto: PuntoScatterRiesgo) => void;
}

interface CajaTexto {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const PALETA_DEFECTO = [
  '#2b44cc',
  '#10b981',
  '#f59e0b',
  '#ec4899',
  '#8b5cf6',
  '#06b6d4',
  '#f43f5e',
  '#84cc16',
];

function acortarEtiqueta(texto: string, max = 16): string {
  const limpio = texto.trim();
  return limpio.length > max ? limpio.slice(0, max - 1) + '…' : limpio;
}

function solapa(a: CajaTexto, b: CajaTexto): boolean {
  return !(a.x2 < b.x1 || a.x1 > b.x2 || a.y2 < b.y1 || a.y1 > b.y2);
}

/**
 * Renderiza un diagrama de dispersión Riesgo (Volatilidad anual) vs. Rentabilidad (CAGR),
 * con burbujas proporcionales al peso, líneas de referencia y tooltip en hover/focus.
 */
export function renderScatterRiesgoChart(
  cont: HTMLElement,
  opts: ScatterRiesgoOptions,
  fmt: FormatService
): void {
  cont.replaceChildren();
  const validos = (opts.puntos || []).filter(
    (p) => Number.isFinite(p.volatilidad) && Number.isFinite(p.cagr)
  );
  if (!validos.length) {
    mostrarVacio(cont, 'Sin datos suficientes de riesgo y rentabilidad.');
    return;
  }

  const W = Math.max(cont.clientWidth, 320);
  const H = opts.alto || opts.altura || 300;
  const P = { t: 24, r: 24, b: 44, l: 62 };
  const iw = W - P.l - P.r;
  const ih = H - P.t - P.b;

  const vols = validos.map((p) => p.volatilidad);
  const cagrs = validos.map((p) => p.cagr);
  const minVol = Math.min(...vols);
  const maxVol = Math.max(...vols);
  const minCagr = Math.min(...cagrs);
  const maxCagr = Math.max(...cagrs);

  const spanVol = maxVol - minVol || Math.max(0.04, Math.abs(maxVol) * 0.4 || 0.04);
  const spanCagr = maxCagr - minCagr || Math.max(0.04, Math.abs(maxCagr) * 0.4 || 0.04);

  const escX = escalaBonita(maxVol + spanVol * 0.18, Math.max(0, minVol - spanVol * 0.18));
  const escY = escalaBonita(maxCagr + spanCagr * 0.2, minCagr - spanCagr * 0.2);

  const rangoX = escX.max - escX.min || 0.1;
  const rangoY = escY.max - escY.min || 0.1;
  const x = (v: number) => P.l + ((v - escX.min) / rangoX) * iw;
  const y = (v: number) => P.t + ih - ((v - escY.min) / rangoY) * ih;

  const fPctX = (v: number) => fmt.fmtPct(v, escX.paso < 0.015 ? 1 : 0);
  const fPctY = (v: number) => fmt.fmtPct(v, escY.paso < 0.015 ? 1 : 0);

  const svg = creaSvgBase(
    W,
    H,
    'grafico scatter',
    `Gráfico de dispersión riesgo frente a rentabilidad con ${validos.length} activos.`
  );

  // Rejilla Y y X
  dibujaRejillaY(svg, P, W, escY, y, fPctY);
  const nPasosX = Math.min(20, Math.max(1, Math.round((escX.max - escX.min) / (escX.paso || 1))));
  for (let k = 0; k <= nPasosX; k++) {
    const raw = escX.min + k * escX.paso;
    const vx = Math.abs(raw) < 1e-12 ? 0 : raw;
    if (vx > escX.max + escX.paso * 1e-4) break;
    const px = x(vx);
    svg.appendChild(crearSvgEl('line', { x1: px, x2: px, y1: P.t, y2: P.t + ih, class: 'rejilla' }));
    svg.appendChild(
      crearSvgTxt(px, P.t + ih + 16, fPctX(vx), 'ejeX', { 'text-anchor': 'middle' })
    );
  }

  // Línea base 0 % en Y si hay rentabilidades negativas y positivas
  if (escY.min < 0 && escY.max > 0) {
    const y0 = y(0);
    svg.appendChild(crearSvgEl('line', { x1: P.l, x2: W - P.r, y1: y0, y2: y0, class: 'eje' }));
  } else {
    svg.appendChild(
      crearSvgEl('line', { x1: P.l, x2: W - P.r, y1: P.t + ih, y2: P.t + ih, class: 'eje' })
    );
  }
  svg.appendChild(crearSvgEl('line', { x1: P.l, x2: P.l, y1: P.t, y2: P.t + ih, class: 'eje' }));

  // Líneas de referencia punteadas promedio X/Y
  if (opts.mostrarPromedio !== false && validos.length >= 2) {
    const avgVol = vols.reduce((a, b) => a + b, 0) / vols.length;
    const avgCagr = cagrs.reduce((a, b) => a + b, 0) / cagrs.length;
    const ax = x(avgVol);
    const ay = y(avgCagr);
    svg.appendChild(
      crearSvgEl('line', {
        x1: ax,
        x2: ax,
        y1: P.t,
        y2: P.t + ih,
        class: 'referencia',
        'stroke-opacity': 0.72,
      })
    );
    svg.appendChild(
      crearSvgEl('line', {
        x1: P.l,
        x2: W - P.r,
        y1: ay,
        y2: ay,
        class: 'referencia',
        'stroke-opacity': 0.72,
      })
    );
    svg.appendChild(
      crearSvgTxt(W - P.r - 4, ay - 5, `Media ${fmt.fmtPctSigno(avgCagr, 1)}`, 'refEtiqueta', {
        'text-anchor': 'end',
      })
    );
  }

  // Títulos de ejes
  svg.appendChild(
    crearSvgTxt(P.l + 4, P.t - 8, opts.tituloEjeY || 'CAGR anual', 'ejeY', {
      'text-anchor': 'start',
    })
  );
  svg.appendChild(
    crearSvgTxt(P.l + iw / 2, H - 6, opts.tituloEjeX || 'Volatilidad anual', 'ejeX', {
      'text-anchor': 'middle',
    })
  );

  // Calcular radios proporcionales al peso (6px..22px)
  const pesosPositivos = validos
    .map((p) => p.peso)
    .filter((w): w is number => w != null && Number.isFinite(w) && w > 0);
  const minW = pesosPositivos.length ? Math.min(...pesosPositivos) : 0;
  const maxW = pesosPositivos.length ? Math.max(...pesosPositivos) : 0;

  const calculaRadio = (p: PuntoScatterRiesgo): number => {
    if (!pesosPositivos.length) return p.destacado ? 13 : 10;
    const w = p.peso;
    if (w == null || !Number.isFinite(w) || w <= 0) return 6;
    if (maxW === minW) return p.destacado ? 14 : 11;
    const t = (Math.sqrt(w) - Math.sqrt(minW)) / (Math.sqrt(maxW) - Math.sqrt(minW));
    return Math.round((6 + t * 16) * 10) / 10;
  };

  const nodos = validos.map((p, idx) => ({
    punto: p,
    cx: x(p.volatilidad),
    cy: y(p.cagr),
    r: calculaRadio(p),
    color: colorCssSeguro(p.color, PALETA_DEFECTO[idx % PALETA_DEFECTO.length]),
  }));

  // Dibujar burbujas grandes primero para no tapar las pequeñas
  const ordenDibujo = [...nodos].sort((a, b) => b.r - a.r);
  const tt = creaTooltip(cont);

  const muestraTooltip = (
    item: (typeof nodos)[number],
    clienteX?: number,
    clienteY?: number
  ) => {
    const p = item.punto;
    const pesoNorm = p.peso != null && Number.isFinite(p.peso) ? (p.peso <= 1 ? p.peso : p.peso / 100) : null;
    rellenaTooltip(tt, p.nombre, `CAGR: ${fmt.fmtPctSigno(p.cagr, 2)}`, [
      { color: item.color, nombre: 'Volatilidad', valor: fmt.fmtPct(p.volatilidad, 2) },
      {
        color: item.color,
        nombre: 'Sharpe',
        valor: p.sharpe != null && Number.isFinite(p.sharpe) ? fmt.fmtNum(p.sharpe, 2) : '—',
      },
      {
        color: item.color,
        nombre: 'Sortino',
        valor: p.sortino != null && Number.isFinite(p.sortino) ? fmt.fmtNum(p.sortino, 2) : '—',
      },
      {
        color: item.color,
        nombre: 'Peso',
        valor: pesoNorm !== null ? fmt.fmtPct(pesoNorm, 1) : '—',
      },
    ]);
    tt.classList.add('on');
    const rectSvg = svg.getBoundingClientRect();
    const rectCont = cont.getBoundingClientRect();
    const px =
      clienteX !== undefined
        ? clienteX - rectCont.left
        : (item.cx * (rectSvg.width || W)) / W;
    const py =
      clienteY !== undefined
        ? clienteY - rectCont.top
        : (item.cy * (rectSvg.height || H)) / H;
    colocaTooltip(tt, cont, px, py);
  };

  const ocultaTooltip = (circulo: SVGElement) => {
    circulo.setAttribute('stroke-width', circulo.getAttribute('data-base-stroke') || '2');
    circulo.setAttribute('fill-opacity', circulo.getAttribute('data-base-opacity') || '0.82');
    tt.classList.remove('on');
  };

  ordenDibujo.forEach((item) => {
    const p = item.punto;
    const baseOpacity = p.destacado ? '0.94' : '0.82';
    const baseStroke = p.destacado ? '2.5' : '1.8';
    const circulo = crearSvgEl('circle', {
      cx: item.cx.toFixed(1),
      cy: item.cy.toFixed(1),
      r: item.r,
      fill: item.color,
      'fill-opacity': baseOpacity,
      stroke: 'var(--surface)',
      'stroke-width': baseStroke,
      'data-base-opacity': baseOpacity,
      'data-base-stroke': baseStroke,
      tabindex: '0',
      role: 'button',
      'aria-label': `${p.nombre}: CAGR ${fmt.fmtPctSigno(p.cagr, 2)}, Volatilidad ${fmt.fmtPct(p.volatilidad, 2)}`,
      style: 'cursor:pointer',
    });

    const activa = (ev?: PointerEvent) => {
      circulo.setAttribute('stroke-width', '3');
      circulo.setAttribute('fill-opacity', '1');
      muestraTooltip(item, ev?.clientX, ev?.clientY);
    };

    circulo.addEventListener('pointerdown', (ev) => {
      const pe = ev as PointerEvent;
      activa(pe);
      if (pe.pointerType !== 'mouse' && typeof document !== 'undefined') {
        const cerrarFuera = (docEv: PointerEvent) => {
          if (docEv.target && cont.contains(docEv.target as Node)) return;
          ocultaTooltip(circulo);
          document.removeEventListener('pointerdown', cerrarFuera, true);
        };
        document.addEventListener('pointerdown', cerrarFuera, true);
      }
    });
    circulo.addEventListener('pointerenter', (ev) => {
      if ((ev as PointerEvent).pointerType === 'mouse') activa(ev as PointerEvent);
    });
    circulo.addEventListener('pointermove', (ev) => {
      if ((ev as PointerEvent).pointerType === 'mouse') activa(ev as PointerEvent);
    });
    circulo.addEventListener('pointerleave', (ev) => {
      if ((ev as PointerEvent).pointerType === 'mouse') ocultaTooltip(circulo);
    });
    circulo.addEventListener('focus', () => activa());
    circulo.addEventListener('blur', () => ocultaTooltip(circulo));
    if (opts.onSelect) {
      circulo.addEventListener('click', () => opts.onSelect?.(p));
      circulo.addEventListener('keydown', (ev) => {
        const ke = ev as KeyboardEvent;
        if (ke.key === 'Enter' || ke.key === ' ') {
          ke.preventDefault();
          opts.onSelect?.(p);
        }
      });
    }
    svg.appendChild(circulo);
  });

  // Etiquetas cortas junto a burbujas si hay espacio disponible
  const cajasOcupadas: CajaTexto[] = nodos.map((n) => ({
    x1: n.cx - n.r - 2,
    y1: n.cy - n.r - 2,
    x2: n.cx + n.r + 2,
    y2: n.cy + n.r + 2,
  }));

  const ordenEtiquetas = [...nodos].sort(
    (a, b) => Number(Boolean(b.punto.destacado)) - Number(Boolean(a.punto.destacado)) || b.r - a.r
  );

  ordenEtiquetas.forEach((item) => {
    const etq = acortarEtiqueta(item.punto.corto || item.punto.nombre);
    if (!etq) return;
    const anchoTxt = Math.max(24, etq.length * 6.3);
    const altoTxt = 12;

    const candidatas: { x: number; y: number; anchor: 'start' | 'end' | 'middle'; caja: CajaTexto }[] = [
      {
        x: item.cx + item.r + 5,
        y: item.cy + 4,
        anchor: 'start',
        caja: {
          x1: item.cx + item.r + 4,
          y1: item.cy - 6,
          x2: item.cx + item.r + 6 + anchoTxt,
          y2: item.cy + 6,
        },
      },
      {
        x: item.cx - item.r - 5,
        y: item.cy + 4,
        anchor: 'end',
        caja: {
          x1: item.cx - item.r - 6 - anchoTxt,
          y1: item.cy - 6,
          x2: item.cx - item.r - 4,
          y2: item.cy + 6,
        },
      },
      {
        x: item.cx,
        y: item.cy - item.r - 5,
        anchor: 'middle',
        caja: {
          x1: item.cx - anchoTxt / 2,
          y1: item.cy - item.r - 5 - altoTxt,
          x2: item.cx + anchoTxt / 2,
          y2: item.cy - item.r - 3,
        },
      },
    ];

    const valida = candidatas.find(
      (c) =>
        c.caja.x1 >= P.l + 2 &&
        c.caja.x2 <= W - P.r - 2 &&
        c.caja.y1 >= P.t &&
        c.caja.y2 <= P.t + ih &&
        !cajasOcupadas.some((o) => solapa(c.caja, o))
    );

    if (valida) {
      cajasOcupadas.push(valida.caja);
      svg.appendChild(
        crearSvgTxt(valida.x, valida.y, etq, 'barEtq', {
          'text-anchor': valida.anchor,
          style: 'pointer-events:none',
        })
      );
    }
  });

  cont.appendChild(svg);
}
