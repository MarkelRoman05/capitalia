import { Injectable } from '@angular/core';
import { ProductoCalculado } from '../models/portfolio.model';

export const PALETA_SLOTS: Record<number, [string, string]> = {
  1: ['#0f766e', '#2dd4bf'], // esmeralda / teal
  2: ['#c2410c', '#fb923c'], // ámbar cobrizo
  3: ['#1d4ed8', '#60a5fa'], // azul cobalto
  4: ['#a16207', '#facc15'], // oro
  5: ['#be185d', '#f472b6'], // magenta
  6: ['#15803d', '#4ade80'], // verde bosque
  7: ['#6d28d9', '#a78bfa'], // violeta
  8: ['#b91c1c', '#f87171'], // carmesí
  9: ['#0e7490', '#22d3ee'], // cian
  10: ['#78350f', '#d97706'], // bronce
  11: ['#475569', '#94a3b8'], // pizarra
  12: ['#4d7c0f', '#a3e635'], // lima
};

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MESES_LARGOS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

@Injectable({ providedIn: 'root' })
export class FormatService {
  readonly paleta: [string, string][] = Object.values(PALETA_SLOTS).map(([light, dark]) => [
    dark,
    light,
  ]);

  private readonly nfEur = new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  private readonly nfEur0 = new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  });

  private readonly nfNum2 = new Intl.NumberFormat('es-ES', {
    maximumFractionDigits: 2,
  });

  private readonly nfNum4 = new Intl.NumberFormat('es-ES', {
    maximumFractionDigits: 4,
  });

  // Primary component helpers
  eur(v: number | null | undefined, dec = 2): string {
    return this.fmtEur(v, dec);
  }

  eurCompacto(v: number | null | undefined): string {
    return this.fmtEurCorto(v);
  }

  eurSigno(v: number | null | undefined, dec = 2): string {
    return this.fmtEurSigno(v, dec);
  }

  pct(v: number | null | undefined, dec = 2): string {
    return this.fmtPct(v, dec);
  }

  pctSigno(v: number | null | undefined, dec = 2): string {
    return this.fmtPctSigno(v, dec);
  }

  num(v: number | null | undefined, dec = 2): string {
    if (v === null || v === undefined || Number.isNaN(v)) return '—';
    return v.toLocaleString('es-ES', {
      minimumFractionDigits: 0,
      maximumFractionDigits: dec,
    });
  }

  entero(v: number | null | undefined): string {
    if (v === null || v === undefined || Number.isNaN(v)) return '—';
    return Math.round(v).toLocaleString('es-ES');
  }

  fechaCorta(iso: string | null | undefined): string {
    return this.fmtFecha(iso);
  }

  fechaHora(iso: string | null | undefined): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return this.fmtFechaCorta(iso);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return `${dd}/${mm}/${yyyy} · ${hh}:${min}:${ss}`;
  }

  mesCorto(ym: string | null | undefined): string {
    return this.fmtMes(ym);
  }

  mesLargo(ym: string | null | undefined): string {
    if (!ym) return '—';
    const p = ym.split('-');
    if (p.length < 2) return ym;
    const m = MESES_LARGOS[+p[1] - 1] ?? '';
    return `${m.charAt(0).toUpperCase() + m.slice(1)} ${p[0]}`;
  }

  claseSigno(v: number | null | undefined): string {
    if (v === null || v === undefined || Number.isNaN(v)) return '';
    if (v > 0.0001) return 'pos';
    if (v < -0.0001) return 'neg';
    return '';
  }

  colorDeSlot(slot = 0): [string, string] {
    const idx = ((Math.abs(Math.round(slot)) % 12) + 1) as keyof typeof PALETA_SLOTS;
    const par = PALETA_SLOTS[idx] || PALETA_SLOTS[1];
    return [par[1], par[0]];
  }

  // Legacy / ChartService helpers
  fmtEur(v: number | null | undefined, dec = 2): string {
    if (v === null || v === undefined || Number.isNaN(v)) return '—';
    return dec === 0 ? this.nfEur0.format(v) : this.nfEur.format(v);
  }

  fmtEurCorto(v: number | null | undefined): string {
    if (v === null || v === undefined || Number.isNaN(v)) return '—';
    const a = Math.abs(v);
    if (a >= 1e6) {
      return (v / 1e6).toLocaleString('es-ES', { maximumFractionDigits: 2 }) + ' M€';
    }
    if (a >= 1000) {
      return (v / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 }) + 'k €';
    }
    return Math.round(v) + ' €';
  }

  fmtEurSigno(v: number | null | undefined, dec = 2): string {
    if (v === null || v === undefined || Number.isNaN(v)) return '—';
    return (v >= 0 ? '+' : '') + this.fmtEur(v, dec);
  }

  fmtPct(v: number | null | undefined, dec = 2): string {
    if (v === null || v === undefined || Number.isNaN(v)) return '—';
    return (
      (v * 100).toLocaleString('es-ES', {
        minimumFractionDigits: dec,
        maximumFractionDigits: dec,
      }) + ' %'
    );
  }

  fmtPctSigno(v: number | null | undefined, dec = 2): string {
    if (v === null || v === undefined || Number.isNaN(v)) return '—';
    return (v >= 0 ? '+' : '') + this.fmtPct(v, dec);
  }

  fmtNum(v: number | null | undefined, dec = 4): string {
    if (v === null || v === undefined || Number.isNaN(v)) return '—';
    return dec <= 2 ? this.nfNum2.format(v) : this.nfNum4.format(v);
  }

  fmtFecha(iso: string | null | undefined): string {
    if (!iso) return '—';
    const p = iso.slice(0, 10).split('-');
    if (p.length < 3) return iso;
    return `${+p[2]} ${MESES[+p[1] - 1] ?? ''} ${p[0]}`;
  }

  fmtFechaCorta(iso: string | null | undefined): string {
    if (!iso) return '—';
    const p = iso.slice(0, 10).split('-');
    if (p.length < 3) return iso;
    return `${String(+p[2]).padStart(2, '0')}/${String(+p[1]).padStart(2, '0')}/${p[0]}`;
  }

  fmtMes(ym: string | null | undefined): string {
    if (!ym) return '—';
    const p = ym.split('-');
    if (p.length < 2) return ym;
    return `${MESES[+p[1] - 1] ?? ''} ${p[0].slice(2)}`;
  }

  decimalInput(v: number | string | null | undefined): string {
    if (v === null || v === undefined || v === '') return '';
    return String(v).replace('.', ',');
  }

  leeNum(txt: string | number | null | undefined): number {
    if (typeof txt === 'number') return txt;
    let t = String(txt ?? '').replace(/[€%\s]/g, '');
    if (!t) return NaN;
    if (t.includes(',') || /^-?\d{1,3}(\.\d{3})+$/.test(t)) {
      t = t.replace(/\./g, '').replace(',', '.');
    }
    return parseFloat(t);
  }

  colorProducto(
    p:
      | Pick<ProductoCalculado, 'slotColor' | 'color' | 'slot'>
      | { slot?: number; slotColor?: [string, string]; color?: [string, string] },
    oscuro: boolean
  ): string {
    if (p.slot && PALETA_SLOTS[p.slot]) {
      return oscuro ? PALETA_SLOTS[p.slot][1] : PALETA_SLOTS[p.slot][0];
    }
    const c = p.slotColor ?? p.color ?? PALETA_SLOTS[1];
    return oscuro ? c[1] : c[0];
  }

  colorSlot(slot: number | undefined, oscuro: boolean): string {
    const par = PALETA_SLOTS[slot ?? 1] ?? PALETA_SLOTS[1];
    return oscuro ? par[1] : par[0];
  }

  tonosProducto(baseHex: string, oscuro: boolean): [string, string, string] {
    return oscuro
      ? [this.mezclaHex(baseHex, '#0f172a', 0.52), baseHex, this.mezclaHex(baseHex, '#ffffff', 0.42)]
      : [this.mezclaHex(baseHex, '#f8fafc', 0.56), baseHex, this.mezclaHex(baseHex, '#0f172a', 0.32)];
  }

  private hex2rgb(h: string): [number, number, number] {
    let clean = String(h).replace('#', '').trim();
    if (clean.length === 3) {
      clean = clean
        .split('')
        .map((c) => c + c)
        .join('');
    }
    return [
      parseInt(clean.slice(0, 2) || '2d', 16),
      parseInt(clean.slice(2, 4) || 'd4', 16),
      parseInt(clean.slice(4, 6) || 'bf', 16),
    ];
  }

  private mezclaHex(a: string, b: string, t: number): string {
    const A = this.hex2rgb(a);
    const B = this.hex2rgb(b);
    return (
      '#' +
      A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('')
    );
  }
}
