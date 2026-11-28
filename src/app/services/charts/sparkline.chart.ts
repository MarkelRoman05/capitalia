import { colorCssSeguro, creaSvgBase, crearSvgEl } from './chart-utils';

export function renderSparklineChart(
  cont: HTMLElement,
  valores: (number | null)[],
  color: string,
  alto = 28
): void {
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
  const svg = creaSvgBase(W, H, 'spark', `Miniatura de tendencia con ${v.length} puntos`);
  svg.appendChild(
    crearSvgEl('path', {
      d: dd,
      fill: 'none',
      stroke: colorCssSeguro(color, '#10b981'),
      'stroke-width': 1.85,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    })
  );
  cont.appendChild(svg);
}
