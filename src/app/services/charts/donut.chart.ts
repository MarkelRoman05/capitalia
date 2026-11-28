import { FormatService } from '../format.service';
import type { DatoDonut } from '../chart.service';
import {
  colocaTooltip,
  colorCssSeguro,
  creaSvgBase,
  creaTooltip,
  crearSvgEl,
  crearSvgTxt,
  mostrarVacio,
  rellenaTooltip,
} from './chart-utils';

export interface DonutConfig {
  datos: DatoDonut[];
  alto?: number;
  tituloCentro?: string;
  valorCentro?: string;
  onSelect?: (d: DatoDonut) => void;
}

export function renderDonutChart(
  cont: HTMLElement,
  cfg: DonutConfig,
  fmt: FormatService
): void {
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
    mostrarVacio(cont);
    return;
  }

  const svg = creaSvgBase(W, H, 'grafico donut', `Gráfico de distribución con ${datos.length} segmentos`);
  let ang = -Math.PI / 2;
  const arcos: { arco: SVGElement; d: DatoDonut }[] = [];
  datos.forEach((d, i) => {
    const barrido = Math.min((d.valor / total) * Math.PI * 2, Math.PI * 2 - 0.0001);
    const a0 = ang;
    const a1 = ang + barrido;
    const grande = barrido > Math.PI ? 1 : 0;
    const p = (r: number, a: number) => `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`;
    const dd = `M${p(R, a0)} A${R} ${R} 0 ${grande} 1 ${p(R, a1)} L${p(r0, a1)} A${r0} ${r0} 0 ${grande} 0 ${p(r0, a0)} Z`;
    const arco = crearSvgEl('path', { d: dd, fill: colorCssSeguro(d.color), class: 'arco', 'data-i': i });
    svg.appendChild(arco);
    arcos.push({ arco, d });
    ang = a1;
  });

  const centro = crearSvgEl('g', { class: 'donutCentro' });
  centro.appendChild(crearSvgTxt(cx, cy - 5, cfg.tituloCentro || 'Total', 'donutEtiqueta', { 'text-anchor': 'middle' }));
  centro.appendChild(
    crearSvgTxt(cx, cy + 18, cfg.valorCentro || fmt.fmtEurCorto(total), 'donutValor', { 'text-anchor': 'middle' })
  );
  svg.appendChild(centro);
  cont.appendChild(svg);

  const tt = creaTooltip(cont);
  let docListener: ((ev: PointerEvent) => void) | null = null;
  const ocultarTodos = () => {
    arcos.forEach(({ arco }) => arco.classList.remove('act'));
    tt.classList.remove('on');
    if (docListener && typeof document !== 'undefined') {
      document.removeEventListener('pointerdown', docListener, true);
      docListener = null;
    }
  };
  const mostrarArco = (arco: SVGElement, d: DatoDonut, e: PointerEvent) => {
    arcos.forEach(({ arco: a }) => a.classList.toggle('act', a === arco));
    rellenaTooltip(tt, d.nombre, fmt.fmtEur(d.valor), [
      { color: d.color, nombre: 'Peso', valor: fmt.fmtPct(d.valor / total, 1) },
    ]);
    tt.classList.add('on');
    const r = cont.getBoundingClientRect();
    colocaTooltip(tt, cont, e.clientX - r.left, e.clientY - r.top);
    if (e.pointerType !== 'mouse' && !docListener && typeof document !== 'undefined') {
      docListener = (ev: PointerEvent) => {
        if (ev.target && cont.contains(ev.target as Node)) return;
        ocultarTodos();
      };
      document.addEventListener('pointerdown', docListener, true);
    }
  };
  arcos.forEach(({ arco, d }) => {
    arco.addEventListener('pointerdown', (e: PointerEvent) => mostrarArco(arco, d, e));
    arco.addEventListener('pointermove', (e: PointerEvent) => {
      if (e.pointerType === 'mouse') mostrarArco(arco, d, e);
    });
    arco.addEventListener('pointerleave', (e: PointerEvent) => {
      if (e.pointerType === 'mouse') ocultarTodos();
    });
    if (cfg.onSelect) {
      arco.addEventListener('click', () => cfg.onSelect?.(d));
    }
  });
}
