import { Injectable, inject } from '@angular/core';
import { FormatService } from './format.service';

const NS = 'http://www.w3.org/2000/svg';
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

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

@Injectable({ providedIn: 'root' })
export class ChartService {
  private readonly fmt = inject(FormatService);

  render(cont: HTMLElement, cfg: ChartConfig): void {
    switch (cfg.tipo) {
      case 'areaApilada':
        this._areaApilada(cont, cfg);
        break;
      case 'lineaConEventos':
        this._lineaConEventos(cont, cfg);
        break;
      case 'barrasApiladas':
        this._barrasApiladas(cont, cfg);
        break;
      case 'barrasAgrupadas':
        this._barrasAgrupadas(cont, cfg);
        break;
      case 'barrasSimples':
        this._barrasSimples(cont, cfg);
        break;
      case 'barrasHorizontales':
        this._barrasHorizontales(cont, cfg);
        break;
      case 'multiLinea':
        this._multiLinea(cont, cfg);
        break;
      case 'donut':
        this._donut(cont, cfg);
        break;
      case 'sparkline':
        this.sparkline(cont, cfg.valores, cfg.color, cfg.alto);
        break;
    }
  }

  areaApilada(
    cont: HTMLElement,
    opts: {
      fechas: string[];
      series: { id?: string; nombre: string; color: string | [string, string]; valores: (number | null)[] }[];
      modo?: 'absoluto' | 'porcentaje';
      lineaExtra?: { nombre: string; valores: (number | null)[]; color?: string } | null;
      altura?: number;
      alto?: number;
    }
  ): void {
    const esPct = opts.modo === 'porcentaje';
    const n = opts.fechas.length;
    const seriesNorm: SerieGrafico[] = opts.series.map((s) => ({
      id: s.id,
      nombre: s.nombre,
      color: Array.isArray(s.color) ? s.color[0] : s.color,
      valores: s.valores,
    }));

    if (esPct && n > 0) {
      const totales = new Array<number>(n).fill(0);
      seriesNorm.forEach((s) => {
        s.valores.forEach((v, i) => {
          totales[i] += Math.max(0, v || 0);
        });
      });
      seriesNorm.forEach((s) => {
        s.valores = s.valores.map((v, i) =>
          totales[i] > 0 ? (Math.max(0, v || 0) / totales[i]) * 100 : 0
        );
      });
    }

    this._areaApilada(cont, {
      tipo: 'areaApilada',
      fechas: opts.fechas,
      series: seriesNorm,
      overlay: !esPct && opts.lineaExtra ? { nombre: opts.lineaExtra.nombre, valores: opts.lineaExtra.valores } : null,
      alto: opts.altura || opts.alto || 340,
      maxForzado: esPct ? 100 : undefined,
      formatoY: esPct ? (v) => `${Math.round(v)}%` : undefined,
      formatoValor: esPct ? (v) => `${v.toFixed(1)}%` : undefined,
    });
  }

  lineaConEventos(
    cont: HTMLElement,
    opts: {
      fechas: string[];
      valores: (number | null)[];
      secundaria?: (number | null)[];
      etiquetaPri?: string;
      etiquetaSec?: string;
      color: string | [string, string];
      eventos?: {
        fecha: string;
        importe?: number;
        precio?: number | null;
        nivel?: number;
        texto: string;
      }[];
      eventosEnPrecio?: boolean;
      lineaRef?: { valor: number; etiqueta: string; color?: string } | null;
      formatoY?: (v: number) => string;
      altura?: number;
      alto?: number;
    }
  ): void {
    const col = Array.isArray(opts.color) ? opts.color[0] : opts.color;
    const evs: EventoGrafico[] = (opts.eventos || []).map((e) => {
      let c = '#10b981';
      let r = 4.5;
      if (e.nivel === 3) {
        c = '#f59e0b';
        r = 6;
      } else if (e.nivel === 1) {
        c = '#38bdf8';
        r = 3.8;
      }
      return {
        fecha: e.fecha,
        color: c,
        aro: e.nivel === 3,
        r,
        texto: e.texto,
      };
    });

    this._lineaConEventos(cont, {
      tipo: 'lineaConEventos',
      fechas: opts.fechas,
      valores: opts.valores,
      color: col,
      alto: opts.altura || opts.alto || 320,
      desdeCero: !opts.eventosEnPrecio,
      overlay: opts.secundaria
        ? { nombre: opts.etiquetaSec || 'Invertido', valores: opts.secundaria }
        : null,
      referencia: opts.lineaRef
        ? { valor: opts.lineaRef.valor, etiqueta: opts.lineaRef.etiqueta }
        : null,
      eventos: evs,
      formatoY: opts.formatoY || null,
    });
  }

  barrasApiladas(
    cont: HTMLElement,
    opts: {
      categorias: string[];
      series: { id?: string; nombre: string; color: string | [string, string]; valores: (number | null)[] }[];
      altura?: number;
      alto?: number;
    }
  ): void {
    this._barrasApiladas(cont, {
      tipo: 'barrasApiladas',
      categorias: opts.categorias,
      series: opts.series.map((s) => ({
        id: s.id,
        nombre: s.nombre,
        color: Array.isArray(s.color) ? s.color[0] : s.color,
        valores: s.valores,
      })),
      alto: opts.altura || opts.alto || 250,
    });
  }

  barrasAgrupadas(
    cont: HTMLElement,
    opts: {
      categorias: string[];
      series: { nombre: string; valores: (number | null)[]; color: string; colorNeg?: string }[];
      altura?: number;
      alto?: number;
    }
  ): void {
    this._barrasAgrupadas(cont, {
      tipo: 'barrasAgrupadas',
      categorias: opts.categorias,
      series: opts.series.map((s) => ({
        nombre: s.nombre,
        color: s.color,
        valores: s.valores,
      })),
      alto: opts.altura || opts.alto || 260,
    });
  }

  barrasSimples(
    cont: HTMLElement,
    opts: {
      etiquetas?: string[];
      categorias?: string[];
      valores: (number | null)[];
      esPorcentaje?: boolean;
      altura?: number;
      alto?: number;
    }
  ): void {
    const cats = opts.etiquetas || opts.categorias || [];
    const colores = opts.valores.map((v) =>
      (v || 0) >= 0 ? '#10b981' : '#f43f5e'
    );
    this._barrasSimples(cont, {
      tipo: 'barrasSimples',
      categorias: cats,
      valores: opts.valores,
      color: '#10b981',
      colores,
      alto: opts.altura || opts.alto || 240,
    });
  }

  barrasHorizontales(
    cont: HTMLElement,
    datos: [string, number][],
    color = '#10b981'
  ): void {
    this._barrasHorizontales(cont, {
      tipo: 'barrasHorizontales',
      datos,
      color,
    });
  }

  multiLinea(
    cont: HTMLElement,
    opts: {
      fechas: string[];
      lineas?: {
        nombre: string;
        valores: (number | null)[];
        color: string;
        principal?: boolean;
        punteada?: boolean;
      }[];
      series?: SerieGrafico[];
      formatoY?: (v: number) => string;
      formatoTooltip?: (v: number) => string;
      altura?: number;
      alto?: number;
    }
  ): void {
    const series: SerieGrafico[] =
      opts.series ||
      (opts.lineas || []).map((l) => ({
        nombre: l.nombre,
        valores: l.valores,
        color: l.color,
        destacado: l.principal,
      }));
    this._multiLinea(cont, {
      tipo: 'multiLinea',
      fechas: opts.fechas,
      series,
      formatoY: opts.formatoY,
      formatoValor: opts.formatoTooltip,
      alto: opts.altura || opts.alto || 300,
    });
  }

  donut(
    cont: HTMLElement,
    opts: {
      grupos?: { nombre: string; valor: number; color: string | [string, string] }[];
      datos?: DatoDonut[];
      centroValor?: string;
      centroSub?: string;
      alto?: number;
    }
  ): void {
    const datos: DatoDonut[] =
      opts.datos ||
      (opts.grupos || []).map((g) => ({
        nombre: g.nombre,
        valor: g.valor,
        color: Array.isArray(g.color) ? g.color[0] : g.color,
      }));
    this._donut(cont, {
      tipo: 'donut',
      datos,
      tituloCentro: opts.centroSub || 'Total',
      valorCentro: opts.centroValor,
      alto: opts.alto || 236,
    });
  }

  private el(
    tag: string,
    attrs?: Record<string, string | number | null | undefined>,
    hijos?: SVGElement[]
  ): SVGElement {
    const n = document.createElementNS(NS, tag);
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

  private txt(
    x: number,
    y: number,
    s: string,
    cls = '',
    extra?: Record<string, string | number>
  ): SVGElement {
    const n = this.el('text', { x, y, class: cls, ...(extra ?? {}) });
    n.textContent = s;
    return n;
  }

  private vacio(cont: HTMLElement, msg = 'Sin datos suficientes en este rango.'): void {
    cont.replaceChildren();
    const p = document.createElement('p');
    p.className = 'vacio';
    p.textContent = msg;
    cont.appendChild(p);
  }

  private escalaBonita(max: number, min = 0): { max: number; min: number; paso: number } {
    if (max <= min) max = min + 1;
    const bruto = (max - min) / 4;
    const mag = Math.pow(10, Math.floor(Math.log10(bruto)));
    const norm = bruto / mag;
    const paso = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
    return {
      max: Math.ceil(max / paso) * paso,
      min: Math.floor(min / paso) * paso,
      paso,
    };
  }

  private indicesEjeX(n: number, cuantos: number): number[] {
    if (n <= 1) return [0];
    const k = Math.min(cuantos, n);
    const out: number[] = [];
    for (let i = 0; i < k; i++) {
      out.push(Math.round((i * (n - 1)) / (k - 1)));
    }
    return [...new Set(out)];
  }

  private etiquetaEjeX(fechas: string[], i: number, n: number): string {
    const f = fechas[i] ?? '';
    const partes = f.split('-');
    if (partes.length < 3) return f;
    if (n > 70) return `${MESES[+partes[1] - 1] ?? ''} ${partes[0].slice(2)}`;
    return `${+partes[2]} ${MESES[+partes[1] - 1] ?? ''}`;
  }

  private creaTooltip(cont: HTMLElement): HTMLElement {
    let t = cont.querySelector('.gtt') as HTMLElement | null;
    if (!t) {
      t = document.createElement('div');
      t.className = 'gtt';
      cont.appendChild(t);
    }
    return t;
  }

  private rellenaTooltip(
    tt: HTMLElement,
    titulo: string,
    totalTexto: string | null,
    filas: { color?: string; raya?: boolean; nombre: string; valor: string; destacado?: boolean }[],
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
          dot.style.background = f.color;
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

  private colocaTooltip(tt: HTMLElement, cont: HTMLElement, x: number, y: number): void {
    const cw = cont.clientWidth;
    const tw = tt.offsetWidth || 200;
    const th = tt.offsetHeight || 80;
    let px = x + 14;
    if (px + tw > cw - 4) px = x - tw - 14;
    if (px < 4) px = 4;
    let py = y - th - 12;
    if (py < 4) py = y + 18;
    tt.style.transform = `translate(${px}px, ${py}px)`;
  }

  private _areaApilada(cont: HTMLElement, cfg: Extract<ChartConfig, { tipo: 'areaApilada' }>): void {
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
      this.vacio(cont);
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
      : this.escalaBonita(maxV, 0);

    const x = (i: number) => P.l + (n === 1 ? iw / 2 : (i * iw) / (n - 1));
    const y = (v: number) => P.t + ih - ((v - esc.min) / (esc.max - esc.min)) * ih;
    const fY = cfg.formatoY || ((v: number) => this.fmt.fmtEurCorto(v));
    const fV = cfg.formatoValor || ((v: number) => this.fmt.fmtEur(v));

    const svg = this.el('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'grafico', role: 'img' });

    for (let v = esc.min; v <= esc.max + 1e-9; v += esc.paso) {
      svg.appendChild(this.el('line', { x1: P.l, x2: W - P.r, y1: y(v), y2: y(v), class: 'rejilla' }));
      svg.appendChild(this.txt(P.l - 8, y(v) + 4, fY(v), 'ejeY'));
    }

    for (let s = series.length - 1; s >= 0; s--) {
      const arriba = acum[s];
      const abajo = s === 0 ? new Array<number>(n).fill(0) : acum[s - 1];
      let dd = '';
      for (let i = 0; i < n; i++) dd += (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(arriba[i]).toFixed(1) + ' ';
      for (let i = n - 1; i >= 0; i--) dd += 'L' + x(i).toFixed(1) + ' ' + y(abajo[i]).toFixed(1) + ' ';
      svg.appendChild(this.el('path', { d: dd + 'Z', fill: series[s].color, 'fill-opacity': 0.88 }));
    }

    for (let s = 0; s < series.length - 1; s++) {
      let dd = '';
      for (let i = 0; i < n; i++) dd += (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(acum[s][i]).toFixed(1) + ' ';
      svg.appendChild(this.el('path', { d: dd, fill: 'none', class: 'separador' }));
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
      svg.appendChild(this.el('path', { d: dd, fill: 'none', class: 'overlay' }));
    }

    svg.appendChild(this.el('line', { x1: P.l, x2: W - P.r, y1: P.t + ih, y2: P.t + ih, class: 'eje' }));
    this.indicesEjeX(n, W < 520 ? 4 : 7).forEach((i) => {
      svg.appendChild(
        this.txt(x(i), H - 8, this.etiquetaEjeX(fechas, i, n), 'ejeX', {
          'text-anchor': i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle',
        })
      );
    });

    const g = this.el('g', { class: 'cursor', opacity: 0 });
    const linea = this.el('line', { y1: P.t, y2: P.t + ih, class: 'crosshair' });
    g.appendChild(linea);
    const puntos = series.map((s) => this.el('circle', { r: 4.5, fill: s.color, class: 'punto' }));
    puntos.forEach((p) => g.appendChild(p));
    const puntoTot = this.el('circle', { r: 5.5, class: 'puntoTotal' });
    g.appendChild(puntoTot);
    svg.appendChild(g);

    const captura = this.el('rect', {
      x: P.l,
      y: P.t,
      width: iw,
      height: ih,
      fill: 'transparent',
      style: 'cursor:crosshair',
    });
    svg.appendChild(captura);
    cont.appendChild(svg);

    const tt = this.creaTooltip(cont);
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

      const filas: { color?: string; raya?: boolean; nombre: string; valor: string; destacado?: boolean }[] = series
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
          valor: this.fmt.fmtEur(cfg.overlay.valores[i]),
          destacado: true,
        });
      }
      this.rellenaTooltip(tt, this.fmt.fmtFecha(fechas[i]), fV(totales[i]), filas);
      tt.classList.add('on');
      this.colocaTooltip(tt, cont, x(i) * (r.width / W), ev.clientY - r.top);
    };
    captura.addEventListener('pointermove', mover);
    captura.addEventListener('pointerdown', mover);
    captura.addEventListener('pointerleave', () => {
      g.setAttribute('opacity', '0');
      tt.classList.remove('on');
    });
  }

  private _lineaConEventos(cont: HTMLElement, cfg: Extract<ChartConfig, { tipo: 'lineaConEventos' }>): void {
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
      this.vacio(cont);
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
    const esc = this.escalaBonita(maxV, cfg.desdeCero === false ? minV - (maxV - minV) * 0.12 : 0);
    const x = (i: number) => P.l + (n === 1 ? iw / 2 : (i * iw) / (n - 1));
    const y = (v: number) => P.t + ih - ((v - esc.min) / (esc.max - esc.min)) * ih;

    const svg = this.el('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'grafico' });
    for (let v = esc.min; v <= esc.max + 1e-9; v += esc.paso) {
      svg.appendChild(this.el('line', { x1: P.l, x2: W - P.r, y1: y(v), y2: y(v), class: 'rejilla' }));
      svg.appendChild(this.txt(P.l - 8, y(v) + 4, cfg.formatoY ? cfg.formatoY(v) : this.fmt.fmtEurCorto(v), 'ejeY'));
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
      svg.appendChild(this.el('path', { d: dArea, fill: cfg.color, 'fill-opacity': 0.15 }));
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
      svg.appendChild(this.el('path', { d: dd, fill: 'none', class: 'overlay' }));
    }

    svg.appendChild(
      this.el('path', {
        d: dLin,
        fill: 'none',
        stroke: cfg.color,
        'stroke-width': 2.2,
        'stroke-linejoin': 'round',
        'stroke-linecap': 'round',
      })
    );

    if (cfg.referencia && cfg.referencia.valor >= esc.min && cfg.referencia.valor <= esc.max) {
      const yr = y(cfg.referencia.valor);
      svg.appendChild(this.el('line', { x1: P.l, x2: W - P.r, y1: yr, y2: yr, class: 'referencia' }));
      svg.appendChild(this.txt(W - P.r - 6, yr - 7, cfg.referencia.etiqueta, 'refEtiqueta', { 'text-anchor': 'end' }));
    }

    const idx: Record<string, number> = {};
    fechas.forEach((f, i) => (idx[f] = i));
    (cfg.eventos || []).forEach((ev) => {
      const i = idx[ev.fecha];
      if (i === undefined || vals[i] == null) return;
      svg.appendChild(
        this.el('circle', {
          cx: x(i),
          cy: y(vals[i] as number),
          r: ev.r || 4.5,
          fill: ev.color || cfg.color,
          class: 'marcador' + (ev.aro ? ' aro' : ''),
        })
      );
    });

    svg.appendChild(this.el('line', { x1: P.l, x2: W - P.r, y1: P.t + ih, y2: P.t + ih, class: 'eje' }));
    this.indicesEjeX(n, W < 520 ? 4 : 7).forEach((i) => {
      svg.appendChild(
        this.txt(x(i), H - 8, this.etiquetaEjeX(fechas, i, n), 'ejeX', {
          'text-anchor': i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle',
        })
      );
    });

    const g = this.el('g', { class: 'cursor', opacity: 0 });
    const linea = this.el('line', { y1: P.t, y2: P.t + ih, class: 'crosshair' });
    const punto = this.el('circle', { r: 5.5, fill: cfg.color, class: 'punto' });
    g.appendChild(linea);
    g.appendChild(punto);
    svg.appendChild(g);

    const captura = this.el('rect', {
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

    const tt = this.creaTooltip(cont);
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
      const filas: { raya?: boolean; nombre: string; valor: string }[] = [];
      if (cfg.overlay && cfg.overlay.valores[i] != null) {
        filas.push({
          raya: true,
          nombre: cfg.overlay.nombre,
          valor: this.fmt.fmtEur(cfg.overlay.valores[i]),
        });
      }
      this.rellenaTooltip(tt, this.fmt.fmtFecha(fechas[i]), this.fmt.fmtEur(vals[i]), filas, evTextos);
      tt.classList.add('on');
      this.colocaTooltip(tt, cont, x(i) * (r.width / W), ev.clientY - r.top);
    };
    captura.addEventListener('pointermove', mover);
    captura.addEventListener('pointerdown', mover);
    captura.addEventListener('pointerleave', () => {
      g.setAttribute('opacity', '0');
      tt.classList.remove('on');
    });
  }

  private _barrasApiladas(cont: HTMLElement, cfg: Extract<ChartConfig, { tipo: 'barrasApiladas' }>): void {
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
      this.vacio(cont, 'Sin aportaciones en este rango.');
      return;
    }

    const totales = cats.map((_, i) => series.reduce((a, s) => a + (s.valores[i] || 0), 0));
    const esc = this.escalaBonita(Math.max(...totales), 0);
    const paso = iw / n;
    const ancho = Math.max(4, Math.min(paso - 6, 44));
    const y = (v: number) => P.t + ih - (v / esc.max) * ih;

    const svg = this.el('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'grafico' });
    for (let v = 0; v <= esc.max + 1e-9; v += esc.paso) {
      svg.appendChild(this.el('line', { x1: P.l, x2: W - P.r, y1: y(v), y2: y(v), class: 'rejilla' }));
      svg.appendChild(this.txt(P.l - 8, y(v) + 4, this.fmt.fmtEurCorto(v), 'ejeY'));
    }

    for (let i = 0; i < n; i++) {
      const cx = P.l + paso * i + paso / 2;
      const g = this.el('g', { class: 'barraGrupo' });
      let base = 0;
      const trozos = series.map((s) => ({ s, v: s.valores[i] || 0 })).filter((t) => t.v > 0);
      trozos.forEach((t, ord) => {
        const y0 = y(base + t.v);
        const y1 = y(base);
        const alto = Math.max(y1 - y0, 1);
        const ultimo = ord === trozos.length - 1;
        const r = Math.min(4, alto / 2, ancho / 2);
        const d = ultimo
          ? `M${cx - ancho / 2} ${y1} L${cx - ancho / 2} ${y0 + r} Q${cx - ancho / 2} ${y0} ${cx - ancho / 2 + r} ${y0} L${cx + ancho / 2 - r} ${y0} Q${cx + ancho / 2} ${y0} ${cx + ancho / 2} ${y0 + r} L${cx + ancho / 2} ${y1} Z`
          : `M${cx - ancho / 2} ${y1} L${cx - ancho / 2} ${y0} L${cx + ancho / 2} ${y0} L${cx + ancho / 2} ${y1} Z`;
        g.appendChild(this.el('path', { d, fill: t.s.color, class: ord ? 'segSep' : '' }));
        base += t.v;
      });
      svg.appendChild(g);
    }

    svg.appendChild(this.el('line', { x1: P.l, x2: W - P.r, y1: P.t + ih, y2: P.t + ih, class: 'eje' }));
    const cada = Math.max(1, Math.ceil(n / (W < 520 ? 5 : 12)));
    cats.forEach((c, i) => {
      if (i % cada) return;
      svg.appendChild(this.txt(P.l + paso * i + paso / 2, H - 10, this.fmt.fmtMes(c), 'ejeX', { 'text-anchor': 'middle' }));
    });

    const resalte = this.el('rect', { class: 'resalte', y: P.t, height: ih, width: paso, opacity: 0 });
    svg.insertBefore(resalte, svg.firstChild);
    const captura = this.el('rect', { x: P.l, y: P.t, width: iw, height: ih, fill: 'transparent' });
    svg.appendChild(captura);
    cont.appendChild(svg);

    const tt = this.creaTooltip(cont);
    const mover = (ev: PointerEvent) => {
      const r = svg.getBoundingClientRect();
      const px = (ev.clientX - r.left) * (W / r.width);
      let i = Math.floor((px - P.l) / paso);
      i = Math.max(0, Math.min(n - 1, i));
      resalte.setAttribute('x', String(P.l + paso * i));
      resalte.setAttribute('opacity', '1');
      const filas = series
        .map((s) => (s.valores[i] ? { color: s.color, nombre: s.nombre, valor: this.fmt.fmtEur(s.valores[i]) } : null))
        .filter((f): f is NonNullable<typeof f> => f !== null)
        .reverse();
      this.rellenaTooltip(tt, this.fmt.fmtMes(cats[i]), this.fmt.fmtEur(totales[i]), filas);
      tt.classList.add('on');
      this.colocaTooltip(tt, cont, (P.l + paso * i + paso / 2) * (r.width / W), ev.clientY - r.top);
    };
    captura.addEventListener('pointermove', mover);
    captura.addEventListener('pointerdown', mover);
    captura.addEventListener('pointerleave', () => {
      tt.classList.remove('on');
      resalte.setAttribute('opacity', '0');
    });
  }

  private _barrasAgrupadas(cont: HTMLElement, cfg: Extract<ChartConfig, { tipo: 'barrasAgrupadas' }>): void {
    cont.replaceChildren();
    const cats = cfg.categorias;
    const series = cfg.series;
    const n = cats.length;
    const m = series.length;
    if (!n || !m) {
      this.vacio(cont);
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
    const esc = this.escalaBonita(max, min);
    const y = (v: number) => P.t + ih - ((v - esc.min) / (esc.max - esc.min)) * ih;
    const paso = iw / n;
    const hueco = 3;
    const ancho = Math.max(3, (Math.min(paso - 8, 54) - hueco * (m - 1)) / m);

    const svg = this.el('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'grafico' });
    for (let v = esc.min; v <= esc.max + 1e-9; v += esc.paso) {
      svg.appendChild(this.el('line', { x1: P.l, x2: W - P.r, y1: y(v), y2: y(v), class: 'rejilla' }));
      svg.appendChild(this.txt(P.l - 8, y(v) + 4, this.fmt.fmtEurCorto(v), 'ejeY'));
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
        const alto = Math.abs(yv - y0);
        const r = Math.min(4, alto / 2, ancho / 2);
        const arr = v >= 0;
        const d = arr
          ? `M${bx} ${y0} L${bx} ${yv + r} Q${bx} ${yv} ${bx + r} ${yv} L${bx + ancho - r} ${yv} Q${bx + ancho} ${yv} ${bx + ancho} ${yv + r} L${bx + ancho} ${y0} Z`
          : `M${bx} ${y0} L${bx} ${yv - r} Q${bx} ${yv} ${bx + r} ${yv} L${bx + ancho - r} ${yv} Q${bx + ancho} ${yv} ${bx + ancho} ${yv - r} L${bx + ancho} ${y0} Z`;
        svg.appendChild(this.el('path', { d, fill: s.color }));
      });
    }
    svg.appendChild(this.el('line', { x1: P.l, x2: W - P.r, y1: y0, y2: y0, class: 'eje' }));
    const cada = Math.max(1, Math.ceil(n / (W < 520 ? 5 : 12)));
    cats.forEach((c, i) => {
      if (i % cada) return;
      svg.appendChild(
        this.txt(P.l + paso * i + paso / 2, H - 10, cfg.formatoCat ? cfg.formatoCat(c) : this.fmt.fmtMes(c), 'ejeX', {
          'text-anchor': 'middle',
        })
      );
    });

    const resalte = this.el('rect', { class: 'resalte', y: P.t, height: ih, width: paso, opacity: 0 });
    svg.insertBefore(resalte, svg.firstChild);
    const captura = this.el('rect', { x: P.l, y: P.t, width: iw, height: ih, fill: 'transparent' });
    svg.appendChild(captura);
    cont.appendChild(svg);

    const tt = this.creaTooltip(cont);
    const mover = (ev: PointerEvent) => {
      const r = svg.getBoundingClientRect();
      const px = (ev.clientX - r.left) * (W / r.width);
      const i = Math.max(0, Math.min(n - 1, Math.floor((px - P.l) / paso)));
      resalte.setAttribute('x', String(P.l + paso * i));
      resalte.setAttribute('opacity', '1');
      const filas = series
        .map((s) =>
          s.valores[i] != null ? { color: s.color, nombre: s.nombre, valor: this.fmt.fmtEur(s.valores[i]) } : null
        )
        .filter((f): f is NonNullable<typeof f> => f !== null);
      const total = series.reduce((a, s) => a + (s.valores[i] || 0), 0);
      this.rellenaTooltip(
        tt,
        cfg.formatoCat ? cfg.formatoCat(cats[i]) : this.fmt.fmtMes(cats[i]),
        this.fmt.fmtEurSigno(total),
        filas
      );
      tt.classList.add('on');
      this.colocaTooltip(tt, cont, (P.l + paso * i + paso / 2) * (r.width / W), ev.clientY - r.top);
    };
    captura.addEventListener('pointermove', mover);
    captura.addEventListener('pointerdown', mover);
    captura.addEventListener('pointerleave', () => {
      tt.classList.remove('on');
      resalte.setAttribute('opacity', '0');
    });
  }

  private _barrasSimples(cont: HTMLElement, cfg: Extract<ChartConfig, { tipo: 'barrasSimples' }>): void {
    cont.replaceChildren();
    const cats = cfg.categorias;
    const vals = cfg.valores;
    const n = cats.length;
    if (!n) {
      this.vacio(cont);
      return;
    }
    const W = Math.max(cont.clientWidth, 280);
    const H = cfg.alto || 240;
    const P = { t: 22, r: 14, b: 30, l: 60 };
    const iw = W - P.l - P.r;
    const ih = H - P.t - P.b;

    const validos = vals.filter((v): v is number => v != null);
    let max = Math.max(0, ...validos);
    let min = Math.min(0, ...validos);
    const margen = (max - min) * 0.14 || 0.01;
    max += margen;
    min -= margen;
    const y = (v: number) => P.t + ih - ((v - min) / (max - min)) * ih;
    const paso = iw / n;
    const ancho = Math.max(8, Math.min(paso - 18, 64));

    const svg = this.el('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'grafico' });
    const esc = this.escalaBonita(max, min);
    for (let v = esc.min; v <= esc.max + 1e-9; v += esc.paso) {
      if (v < min || v > max) continue;
      svg.appendChild(this.el('line', { x1: P.l, x2: W - P.r, y1: y(v), y2: y(v), class: 'rejilla' }));
      svg.appendChild(this.txt(P.l - 8, y(v) + 4, this.fmt.fmtPct(v, 0), 'ejeY'));
    }
    const y0 = y(0);
    svg.appendChild(this.el('line', { x1: P.l, x2: W - P.r, y1: y0, y2: y0, class: 'eje' }));

    vals.forEach((v, i) => {
      if (v == null) return;
      const cx = P.l + paso * i + paso / 2;
      const yv = y(v);
      const alto = Math.abs(yv - y0);
      const r = Math.min(4, alto / 2, ancho / 2);
      const arriba = v >= 0;
      const yTop = arriba ? yv : y0;
      const d = arriba
        ? `M${cx - ancho / 2} ${y0} L${cx - ancho / 2} ${yTop + r} Q${cx - ancho / 2} ${yTop} ${cx - ancho / 2 + r} ${yTop} L${cx + ancho / 2 - r} ${yTop} Q${cx + ancho / 2} ${yTop} ${cx + ancho / 2} ${yTop + r} L${cx + ancho / 2} ${y0} Z`
        : `M${cx - ancho / 2} ${y0} L${cx - ancho / 2} ${y0 + alto - r} Q${cx - ancho / 2} ${y0 + alto} ${cx - ancho / 2 + r} ${y0 + alto} L${cx + ancho / 2 - r} ${y0 + alto} Q${cx + ancho / 2} ${y0 + alto} ${cx + ancho / 2} ${y0 + alto - r} L${cx + ancho / 2} ${y0} Z`;
      svg.appendChild(this.el('path', { d, fill: (cfg.colores && cfg.colores[i]) || cfg.color }));
      svg.appendChild(
        this.txt(cx, arriba ? yv - 7 : yv + 15, this.fmt.fmtPctSigno(v, 1), 'barValArriba', {
          'text-anchor': 'middle',
        })
      );
      svg.appendChild(this.txt(cx, H - 10, cats[i], 'ejeX', { 'text-anchor': 'middle' }));
    });
    cont.appendChild(svg);
  }

  private _barrasHorizontales(cont: HTMLElement, cfg: Extract<ChartConfig, { tipo: 'barrasHorizontales' }>): void {
    cont.replaceChildren();
    const datos = cfg.datos || [];
    if (!datos.length) {
      this.vacio(cont);
      return;
    }
    const W = Math.max(cont.clientWidth, 260);
    const filaAlto = cfg.filaAlto || 26;
    const H = datos.length * filaAlto + 6;
    const anchoEtq = Math.min(Math.max(...datos.map((d) => String(d[0]).length)) * 7 + 10, W * 0.42);
    const anchoVal = 54;
    const iw = W - anchoEtq - anchoVal;
    const max = Math.max(...datos.map((d) => d[1])) || 1;

    const svg = this.el('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'grafico' });
    datos.forEach((dd, i) => {
      const yy = i * filaAlto + 3;
      const ancho = Math.max((dd[1] / max) * iw, 2);
      svg.appendChild(this.txt(anchoEtq - 10, yy + filaAlto / 2 + 1, dd[0], 'barEtq', { 'text-anchor': 'end' }));
      svg.appendChild(
        this.el('rect', {
          x: anchoEtq,
          y: yy + 3,
          width: ancho,
          height: filaAlto - 10,
          rx: 4,
          fill: cfg.color,
          'fill-opacity': 0.85,
        })
      );
      svg.appendChild(
        this.txt(
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

  private _multiLinea(cont: HTMLElement, cfg: Extract<ChartConfig, { tipo: 'multiLinea' }>): void {
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
      this.vacio(cont);
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
    const esc = this.escalaBonita(max + margen, cfg.desdeCero ? 0 : min - margen);
    const x = (i: number) => P.l + (n === 1 ? iw / 2 : (i * iw) / (n - 1));
    const y = (v: number) => P.t + ih - ((v - esc.min) / (esc.max - esc.min)) * ih;

    const svg = this.el('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'grafico' });
    for (let v = esc.min; v <= esc.max + 1e-9; v += esc.paso) {
      svg.appendChild(this.el('line', { x1: P.l, x2: W - P.r, y1: y(v), y2: y(v), class: 'rejilla' }));
      svg.appendChild(this.txt(P.l - 8, y(v) + 4, fY(v), 'ejeY'));
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
        this.el('path', {
          d,
          fill: 'none',
          stroke: s.color,
          'stroke-width': s.destacado ? 2.8 : 1.8,
          'stroke-opacity': s.destacado ? 1 : 0.78,
          'stroke-linejoin': 'round',
          'stroke-linecap': 'round',
        })
      );
    });
    svg.appendChild(this.el('line', { x1: P.l, x2: W - P.r, y1: P.t + ih, y2: P.t + ih, class: 'eje' }));
    this.indicesEjeX(n, W < 520 ? 4 : 7).forEach((i) => {
      svg.appendChild(
        this.txt(x(i), H - 8, this.etiquetaEjeX(fechas, i, n), 'ejeX', {
          'text-anchor': i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle',
        })
      );
    });

    const g = this.el('g', { class: 'cursor', opacity: 0 });
    const linea = this.el('line', { y1: P.t, y2: P.t + ih, class: 'crosshair' });
    g.appendChild(linea);
    const puntos = series.map((s) => this.el('circle', { r: 4.5, fill: s.color, class: 'punto' }));
    puntos.forEach((p) => g.appendChild(p));
    svg.appendChild(g);
    const captura = this.el('rect', {
      x: P.l,
      y: P.t,
      width: iw,
      height: ih,
      fill: 'transparent',
      style: 'cursor:crosshair',
    });
    svg.appendChild(captura);
    cont.appendChild(svg);

    const tt = this.creaTooltip(cont);
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
      this.rellenaTooltip(tt, this.fmt.fmtFecha(fechas[i]), null, filas);
      tt.classList.add('on');
      this.colocaTooltip(tt, cont, x(i) * (r.width / W), ev.clientY - r.top);
    };
    captura.addEventListener('pointermove', mover);
    captura.addEventListener('pointerdown', mover);
    captura.addEventListener('pointerleave', () => {
      g.setAttribute('opacity', '0');
      tt.classList.remove('on');
    });
  }

  private _donut(cont: HTMLElement, cfg: Extract<ChartConfig, { tipo: 'donut' }>): void {
    cont.replaceChildren();
    const W = Math.max(cont.clientWidth, 200);
    const H = cfg.alto || 236;
    const R = Math.min(W, H) / 2 - 8;
    const r0 = R * 0.64;
    const cx = W / 2;
    const cy = H / 2;
    const datos = cfg.datos.filter((d) => d.valor > 0);
    const total = datos.reduce((a, d) => a + d.valor, 0);
    if (!total) {
      this.vacio(cont);
      return;
    }

    const svg = this.el('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'grafico donut' });
    let ang = -Math.PI / 2;
    const arcos: { arco: SVGElement; d: DatoDonut }[] = [];
    datos.forEach((d, i) => {
      const barrido = Math.min((d.valor / total) * Math.PI * 2, Math.PI * 2 - 0.0001);
      const a0 = ang;
      const a1 = ang + barrido;
      const grande = barrido > Math.PI ? 1 : 0;
      const p = (r: number, a: number) => `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`;
      const dd = `M${p(R, a0)} A${R} ${R} 0 ${grande} 1 ${p(R, a1)} L${p(r0, a1)} A${r0} ${r0} 0 ${grande} 0 ${p(r0, a0)} Z`;
      const arco = this.el('path', { d: dd, fill: d.color, class: 'arco', 'data-i': i });
      svg.appendChild(arco);
      arcos.push({ arco, d });
      ang = a1;
    });

    const centro = this.el('g', { class: 'donutCentro' });
    centro.appendChild(this.txt(cx, cy - 5, cfg.tituloCentro || 'Total', 'donutEtiqueta', { 'text-anchor': 'middle' }));
    centro.appendChild(
      this.txt(cx, cy + 18, cfg.valorCentro || this.fmt.fmtEurCorto(total), 'donutValor', { 'text-anchor': 'middle' })
    );
    svg.appendChild(centro);
    cont.appendChild(svg);

    const tt = this.creaTooltip(cont);
    arcos.forEach(({ arco, d }) => {
      arco.addEventListener('pointerenter', () => {
        arco.classList.add('act');
        this.rellenaTooltip(tt, d.nombre, this.fmt.fmtEur(d.valor), [
          { color: d.color, nombre: 'Peso', valor: this.fmt.fmtPct(d.valor / total, 1) },
        ]);
        tt.classList.add('on');
      });
      arco.addEventListener('pointermove', (e: PointerEvent) => {
        const r = cont.getBoundingClientRect();
        this.colocaTooltip(tt, cont, e.clientX - r.left, e.clientY - r.top);
      });
      arco.addEventListener('pointerleave', () => {
        arco.classList.remove('act');
        tt.classList.remove('on');
      });
      if (cfg.onSelect) {
        arco.addEventListener('click', () => cfg.onSelect?.(d));
      }
    });
  }

  sparkline(cont: HTMLElement, valores: (number | null)[], color: string, alto = 28): void {
    cont.replaceChildren();
    const W = Math.max(cont.clientWidth, 60);
    const H = alto;
    const v = valores.filter((x): x is number => x != null);
    if (v.length < 2) return;
    const mx = Math.max(...v);
    const mn = Math.min(...v);
    const rango = mx - mn || 1;
    const n = valores.length;
    let dd = '';
    let ab = false;
    valores.forEach((x, i) => {
      if (x == null) {
        ab = false;
        return;
      }
      const px = (i / (n - 1)) * (W - 2) + 1;
      const py = H - 2 - ((x - mn) / rango) * (H - 4);
      dd += (ab ? 'L' : 'M') + px.toFixed(1) + ' ' + py.toFixed(1) + ' ';
      ab = true;
    });
    const svg = this.el('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'spark' });
    svg.appendChild(
      this.el('path', {
        d: dd,
        fill: 'none',
        stroke: color,
        'stroke-width': 1.85,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
      })
    );
    cont.appendChild(svg);
  }
}
