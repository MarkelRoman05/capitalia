import { DatosPanel, MetricasCalculadas, ProductoCalculado } from '../models/portfolio.model';

export interface RebalanceoEntrada {
  id: string;
  nombre: string;
  color: string;
  valorActual: number;
  pesoObjetivo: number | null | undefined;
}

export interface RebalanceoResultado {
  id: string;
  nombre: string;
  color: string;
  valorActual: number;
  pesoObjetivo: number | null;
  pesoActualPct: number;
  driftActualPp: number;
  driftActualEur: number;
  aportar: number;
  nuevoValor: number;
  nuevoPesoPct: number;
  driftResultantePp: number;
}

export interface ProyeccionParams {
  patrimonioActual: number;
  anos: number;
  rentAnualPct: number;
  aportacionMensual: number;
  ajustarInflacion: boolean;
  tasaInflacion?: number;
  tasaRetiroFire?: number;
}

export interface ProyeccionEscenariosResultado {
  fechas: string[];
  pesimista: number[];
  base: number[];
  optimista: number[];
  aportado: number[];
  finalTotal: number;
  finalPesimista: number;
  finalOptimista: number;
  finalAportado: number;
  ganancia: number;
  rentaFireMensual: number;
  anioCrossover: number | null;
  tasaBaseEfectivaPct: number;
  tasaPesimistaEfectivaPct: number;
  tasaOptimistaEfectivaPct: number;
}

export interface SimulacionHipotecaParams {
  capitalPendiente: number;
  tipoInteresAnualPct: number;
  mesesRestantes: number;
  amortizacionAnticipada: number;
  rentabilidadInvertirPct: number;
}

export interface SimulacionHipotecaResultado {
  cuotaActual: number;
  totalInteresesActual: number;
  nuevoCapital: number;
  nuevaCuotaReduciendoCuota: number;
  ahorroMensualCuota: number;
  interesesReduciendoCuota: number;
  ahorroInteresesCuota: number;
  nuevosMesesPlazo: number;
  mesesAhorrados: number;
  interesesReduciendoPlazo: number;
  ahorroInteresesPlazo: number;
  valorFinalInversion: number;
  gananciaInversionBruta: number;
  diferenciaInvertirVsAmortizar: number;
  convieneInvertir: boolean;
}

/**
 * Calcula la TIR anualizada (XIRR) mediante Newton-Raphson sobre pares `[fechaISO, flujo]`.
 */
export function calcularXirr(flujos: [string, number][]): number | null {
  if (!flujos || flujos.length < 2) return null;
  const tienePos = flujos.some((f) => f[1] > 0);
  const tieneNeg = flujos.some((f) => f[1] < 0);
  if (!tienePos || !tieneNeg) return null;

  const t0 = new Date(flujos[0][0] + 'T00:00:00').getTime();
  const puntos = flujos.map(([f, imp]) => [
    (new Date(f + 'T00:00:00').getTime() - t0) / (86400000 * 365.25),
    imp,
  ]);

  const npv = (r: number) =>
    puntos.reduce((s, [t, cf]) => s + cf / Math.pow(1 + r, t), 0);
  const dnpv = (r: number) =>
    puntos.reduce(
      (s, [t, cf]) => (t === 0 ? s : s - (t * cf) / Math.pow(1 + r, t + 1)),
      0
    );

  let r = 0.1;
  for (let i = 0; i < 100; i++) {
    if (r <= -0.99) r = -0.99;
    const f = npv(r);
    if (Math.abs(f) < 1e-6) return r;
    const df = dnpv(r);
    if (Math.abs(df) < 1e-12) break;
    const nr = r - f / df;
    if (Math.abs(nr - r) < 1e-7) return nr;
    r = Math.max(-0.99, Math.min(10, nr));
  }
  return null;
}

function calcularCaidaMaxima(
  lista: ProductoCalculado[],
  totalComponentes: number,
  d: DatosPanel | null,
  fechas: string[],
  serie: number[],
  serieAportado: number[]
): { caida: number; caidaFecha: string | null } {
  if (
    lista.length > 0 &&
    lista.length === totalComponentes &&
    d?.total?.caidaMaxima !== undefined &&
    d.total.caidaMaxima !== null
  ) {
    return {
      caida: d.total.caidaMaxima,
      caidaFecha: d.total.caidaMaximaFecha ?? null,
    };
  }

  const n = fechas.length;
  if (!lista.length || n === 0) {
    return { caida: 0, caidaFecha: null };
  }

  if (lista.length === 1 && Array.isArray(lista[0].navSerie)) {
    const nav = lista[0].navSerie;
    const puntosValidos = nav.filter(
      (v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0
    ).length;
    if (puntosValidos >= 2) {
      let pico = 0;
      let caida = 0;
      let caidaFecha: string | null = null;
      const len = Math.min(n, nav.length);
      for (let i = 0; i < len; i++) {
        const v = nav[i];
        if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) continue;
        if (v > pico) pico = v;
        if (pico > 0) {
          const dd = (v - pico) / pico;
          if (dd < caida) {
            caida = dd;
            caidaFecha = fechas[i] ?? null;
          }
        }
      }
      return { caida, caidaFecha };
    }
  }

  const hayInversion =
    lista.some((c) => Array.isArray(c.serieAportado) && c.serieAportado.length > 0) &&
    serieAportado.some((v) => v > 0);
  if (hayInversion) {
    let nivel = 100;
    let pico = 100;
    let ant: number | null = null;
    let caida = 0;
    let caidaFecha: string | null = null;
    for (let i = 0; i < n; i++) {
      const v = serie[i];
      const flujo = i > 0 ? serieAportado[i] - serieAportado[i - 1] : serieAportado[0];
      if (v <= 0 && (flujo < 0 || ant === null || ant <= 1)) {
        ant = 0;
        continue;
      }
      if (ant === null || ant <= 1) {
        if (flujo > 0 && v > 0) {
          nivel *= Math.max(v / flujo, 0.05);
        }
      } else {
        nivel *= 1 + Math.max((v - flujo) / ant - 1, -0.95);
      }
      if (v > 0 || (ant !== null && ant > 1)) {
        if (nivel > pico) pico = nivel;
        const dd = (nivel - pico) / pico;
        if (dd < caida) {
          caida = dd;
          caidaFecha = fechas[i] ?? null;
        }
      }
      ant = v;
    }
    return { caida, caidaFecha };
  }

  let pico = 0;
  let caida = 0;
  let caidaFecha: string | null = null;
  for (let i = 0; i < n; i++) {
    if (serie[i] > pico) pico = serie[i];
    if (pico > 0) {
      const dd = (serie[i] - pico) / pico;
      if (dd < caida) {
        caida = dd;
        caidaFecha = fechas[i] ?? null;
      }
    }
  }
  return { caida, caidaFecha };
}

/**
 * Calcula las métricas agregadas (valor, aportado, TIR, Max DD sin sesgo TWR, ritmo y racha)
 * para un subconjunto de componentes o la cartera completa.
 */
export function calcularMetricasCartera(
  lista: ProductoCalculado[],
  totalComponentes: number,
  d: DatosPanel | null
): MetricasCalculadas {
  const fechas = d?.fechas || [];
  const n = fechas.length;
  const serie = new Array<number>(n).fill(0);
  const serieAportado = new Array<number>(n).fill(0);

  let valor = 0;
  let aportado = 0;
  let valorConCoste = 0;
  const flujos: [string, number][] = [];
  let numAportaciones = 0;
  const mesesConAportacion = new Set<string>();

  for (const c of lista) {
    valor += c.valor || 0;
    if (c.aportado !== null && c.aportado !== undefined) {
      aportado += c.aportado;
      valorConCoste += c.valor;
    }
    for (let i = 0; i < n; i++) {
      serie[i] += c.serie?.[i] || 0;
      if (c.serieAportado) {
        serieAportado[i] += c.serieAportado[i] || 0;
      }
    }
    if (c.flujos && c.flujos.length) {
      for (const fl of c.flujos) {
        flujos.push(fl);
      }
    }
    if (c.aportaciones && c.aportaciones.length) {
      for (const a of c.aportaciones) {
        if (a.importe > 0) {
          numAportaciones++;
          mesesConAportacion.add(a.fecha.slice(0, 7));
        }
      }
    }
  }

  if (flujos.length && valorConCoste > 0 && n > 0) {
    flujos.push([fechas[n - 1], valorConCoste]);
    flujos.sort((a, b) => a[0].localeCompare(b[0]));
  }

  const plusvalia = aportado > 0 ? valorConCoste - aportado : null;
  const rentabilidad =
    aportado > 0 && plusvalia !== null ? plusvalia / aportado : null;
  const tir =
    lista.length === 1 && lista[0].tir !== undefined
      ? lista[0].tir ?? null
      : calcularXirr(flujos);

  const { caida, caidaFecha } = calcularCaidaMaxima(
    lista,
    totalComponentes,
    d,
    fechas,
    serie,
    serieAportado
  );

  let primerIdx = serie.findIndex((v) => v > 0);
  if (primerIdx < 0) primerIdx = 0;
  const dias =
    n > 0
      ? Math.max(
          1,
          (new Date(fechas[n - 1]).getTime() -
            new Date(fechas[primerIdx]).getTime()) /
            86400000
        )
      : 1;
  const mesesActivos = Math.max(1, dias / 30.4375);
  const ritmo = aportado > 0 ? aportado / mesesActivos : 0;

  let racha = 0;
  if (mesesConAportacion.size && n > 0) {
    let [y, m] = fechas[n - 1].slice(0, 7).split('-').map(Number);
    while (mesesConAportacion.has(`${y}-${String(m).padStart(2, '0')}`)) {
      racha++;
      m--;
      if (m === 0) {
        m = 12;
        y--;
      }
    }
  }

  return {
    valor,
    aportado,
    valorConCoste,
    plusvalia,
    rentabilidad,
    tir,
    numAportaciones,
    ritmo,
    racha,
    caida,
    caidaFecha,
    serie,
    serieAportado,
  };
}

/**
 * Distribuye una nueva aportación sin vender posiciones existentes mediante
 * water-filling sobre los productos con peso objetivo definido.
 */
export function calcularRebalanceoAportacion(
  items: RebalanceoEntrada[],
  importeAportar: number
): RebalanceoResultado[] {
  const totalActual = items.reduce((s, it) => s + Math.max(0, it.valorActual || 0), 0);
  const aporte = Number.isFinite(importeAportar) && importeAportar > 0 ? importeAportar : 0;

  const conObjetivo = items
    .map((it) => ({
      ...it,
      valor: Math.max(0, it.valorActual || 0),
      obj:
        it.pesoObjetivo !== null && it.pesoObjetivo !== undefined && it.pesoObjetivo > 0
          ? it.pesoObjetivo
          : 0,
    }))
    .filter((it) => it.obj > 0);

  const sumaObjetivos = conObjetivo.reduce((s, it) => s + it.obj, 0);
  const asignaciones = new Map<string, number>();

  if (aporte > 0 && sumaObjetivos > 0 && conObjetivo.length > 0) {
    const ordenados = conObjetivo
      .map((it) => {
        const w = it.obj / sumaObjetivos;
        return {
          id: it.id,
          valor: it.valor,
          w,
          nivel: it.valor / w,
        };
      })
      .sort((a, b) => a.nivel - b.nivel);

    let sumV = ordenados[0].valor;
    let sumW = ordenados[0].w;
    let lambda = (aporte + sumV) / sumW;

    for (let i = 1; i < ordenados.length; i++) {
      if (ordenados[i].nivel < lambda) {
        sumV += ordenados[i].valor;
        sumW += ordenados[i].w;
        lambda = (aporte + sumV) / sumW;
      } else {
        break;
      }
    }

    const crudos = ordenados.map((item) => ({
      id: item.id,
      raw: item.nivel < lambda ? Math.max(0, lambda * item.w - item.valor) : 0,
    }));

    const objetivoCent = Math.round(aporte * 100);
    const redondeados = crudos.map((c) => ({
      id: c.id,
      cent: Math.round(c.raw * 100),
      frac: c.raw * 100 - Math.round(c.raw * 100),
    }));

    let diffCent = objetivoCent - redondeados.reduce((s, r) => s + r.cent, 0);
    if (diffCent !== 0) {
      const ajustables = redondeados
        .filter((r) => r.cent > 0 || diffCent > 0)
        .sort((a, b) => (diffCent > 0 ? b.frac - a.frac : a.frac - b.frac));
      for (let i = 0; i < ajustables.length && diffCent !== 0; i++) {
        const paso = diffCent > 0 ? 1 : -1;
        if (ajustables[i].cent + paso >= 0) {
          ajustables[i].cent += paso;
          diffCent -= paso;
        }
      }
    }

    for (const r of redondeados) {
      asignaciones.set(r.id, r.cent / 100);
    }
  }

  const totalAportadoReal = Array.from(asignaciones.values()).reduce((s, v) => s + v, 0);
  const nuevoTotal = totalActual + totalAportadoReal;

  return items.map((it) => {
    const val = Math.max(0, it.valorActual || 0);
    const tieneObj =
      it.pesoObjetivo !== null && it.pesoObjetivo !== undefined && Number.isFinite(it.pesoObjetivo);
    const pesoObj = tieneObj ? it.pesoObjetivo! : null;
    const pesoActualPct = totalActual > 0 ? (val / totalActual) * 100 : 0;
    const driftActualPp = pesoObj !== null ? pesoActualPct - pesoObj : 0;
    const driftActualEur = pesoObj !== null ? val - totalActual * (pesoObj / 100) : 0;

    const aportar = asignaciones.get(it.id) ?? 0;
    const nuevoValor = val + aportar;
    const nuevoPesoPct = nuevoTotal > 0 ? (nuevoValor / nuevoTotal) * 100 : 0;
    const driftResultantePp = pesoObj !== null ? nuevoPesoPct - pesoObj : 0;

    return {
      id: it.id,
      nombre: it.nombre,
      color: it.color,
      valorActual: val,
      pesoObjetivo: pesoObj,
      pesoActualPct,
      driftActualPp,
      driftActualEur,
      aportar,
      nuevoValor,
      nuevoPesoPct,
      driftResultantePp,
    };
  });
}

function convertirTasaReal(rNominal: number, ajustarInflacion: boolean, tasaInflacion: number): number {
  if (!ajustarInflacion) return rNominal;
  return (1 + rNominal) / (1 + tasaInflacion) - 1;
}

function simularSerieMensual(
  saldoInicial: number,
  aportacionMensual: number,
  tasaAnual: number,
  meses: number
): number[] {
  const rMes = Math.pow(1 + Math.max(-0.95, tasaAnual), 1 / 12) - 1;
  const serie: number[] = [];
  let saldo = saldoInicial;
  for (let m = 0; m <= meses; m++) {
    serie.push(saldo);
    saldo = saldo * (1 + rMes) + aportacionMensual;
  }
  return serie;
}

/**
 * Proyecta tres escenarios de interés compuesto (pesimista, base y optimista),
 * soporta ajuste por inflación y calcula renta FIRE + año estimado de crossover.
 */
export function calcularProyeccionEscenarios(
  params: ProyeccionParams
): ProyeccionEscenariosResultado {
  const actual = Math.max(0, params.patrimonioActual || 0);
  const anos = Math.max(1, Math.round(params.anos || 10));
  const aportMes = Math.max(0, params.aportacionMensual || 0);
  const tasaInflacion = params.tasaInflacion ?? 0.025;
  const tasaRetiro = params.tasaRetiroFire ?? 0.04;

  const rNomBase = params.rentAnualPct / 100;
  const rNomPes = Math.max(0, params.rentAnualPct - 2) / 100;
  const rNomOpt = (params.rentAnualPct + 2) / 100;

  const rBase = convertirTasaReal(rNomBase, params.ajustarInflacion, tasaInflacion);
  const rPes = convertirTasaReal(rNomPes, params.ajustarInflacion, tasaInflacion);
  const rOpt = convertirTasaReal(rNomOpt, params.ajustarInflacion, tasaInflacion);

  const meses = anos * 12;
  const hoy = new Date();
  const fechas: string[] = [];
  const aportado: number[] = [];
  for (let m = 0; m <= meses; m++) {
    const f = new Date(hoy.getFullYear(), hoy.getMonth() + m, 1);
    fechas.push(f.toISOString().slice(0, 10));
    aportado.push(actual + aportMes * m);
  }

  const base = simularSerieMensual(actual, aportMes, rBase, meses);
  const pesimista = simularSerieMensual(actual, aportMes, rPes, meses);
  const optimista = simularSerieMensual(actual, aportMes, rOpt, meses);

  const finalTotal = base[base.length - 1] ?? actual;
  const finalPesimista = pesimista[pesimista.length - 1] ?? actual;
  const finalOptimista = optimista[optimista.length - 1] ?? actual;
  const finalAportado = aportado[aportado.length - 1] ?? actual;
  const rentaFireMensual = (finalTotal * tasaRetiro) / 12;

  let anioCrossover: number | null = null;
  const anioActual = hoy.getFullYear();
  if (rBase > 0) {
    if (aportMes <= 0) {
      anioCrossover = actual > 0 ? anioActual : null;
    } else if (actual * rBase >= aportMes * 12) {
      anioCrossover = anioActual;
    } else {
      const rMesBase = Math.pow(1 + rBase, 1 / 12) - 1;
      let saldoY = actual;
      const maxAnos = Math.max(anos, 60);
      for (let y = 1; y <= maxAnos; y++) {
        const saldoInicio = saldoY;
        for (let m = 0; m < 12; m++) {
          saldoY = saldoY * (1 + rMesBase) + aportMes;
        }
        const rendimientoAno = saldoY - saldoInicio - aportMes * 12;
        if (rendimientoAno >= aportMes * 12) {
          anioCrossover = anioActual + y;
          break;
        }
      }
    }
  }

  return {
    fechas,
    pesimista,
    base,
    optimista,
    aportado,
    finalTotal,
    finalPesimista,
    finalOptimista,
    finalAportado,
    ganancia: finalTotal - finalAportado,
    rentaFireMensual,
    anioCrossover,
    tasaBaseEfectivaPct: rBase * 100,
    tasaPesimistaEfectivaPct: rPes * 100,
    tasaOptimistaEfectivaPct: rOpt * 100,
  };
}

function calcularCuotaFrancesa(capital: number, rMes: number, meses: number): number {
  if (capital <= 0 || meses <= 0) return 0;
  if (rMes <= 0) return capital / meses;
  return (capital * rMes) / (1 - Math.pow(1 + rMes, -meses));
}

function simularPrestamo(
  capital: number,
  rMes: number,
  cuotaMensual: number,
  maxMeses: number
): { intereses: number; meses: number } {
  if (capital <= 0 || cuotaMensual <= 0 || maxMeses <= 0) {
    return { intereses: 0, meses: 0 };
  }
  let saldo = capital;
  let intereses = 0;
  let meses = 0;
  while (saldo > 0.01 && meses < maxMeses) {
    const intMes = saldo * rMes;
    if (cuotaMensual <= intMes && rMes > 0) {
      meses = maxMeses;
      intereses += intMes * (maxMeses - meses);
      break;
    }
    const amort = Math.min(saldo, cuotaMensual - intMes);
    intereses += intMes;
    saldo -= amort;
    meses++;
  }
  return { intereses, meses };
}

/**
 * Simula una amortización anticipada de hipoteca (reduciendo cuota vs. plazo)
 * y compara el ahorro de intereses frente a invertir el importe a una rentabilidad esperada.
 */
export function simularAmortizacionHipoteca(
  params: SimulacionHipotecaParams
): SimulacionHipotecaResultado {
  const capital = Math.max(0, params.capitalPendiente || 0);
  const meses = Math.max(1, Math.round(params.mesesRestantes || 1));
  const rMes = Math.max(0, params.tipoInteresAnualPct || 0) / 100 / 12;
  const extra = Math.min(capital, Math.max(0, params.amortizacionAnticipada || 0));
  const rentInv = (params.rentabilidadInvertirPct || 0) / 100;

  const cuotaActual = calcularCuotaFrancesa(capital, rMes, meses);
  const baseSim = simularPrestamo(capital, rMes, cuotaActual, meses);
  const nuevoCapital = Math.max(0, capital - extra);

  const nuevaCuotaReduciendoCuota = calcularCuotaFrancesa(nuevoCapital, rMes, meses);
  const simCuota = simularPrestamo(nuevoCapital, rMes, nuevaCuotaReduciendoCuota, meses);

  const simPlazo = simularPrestamo(nuevoCapital, rMes, cuotaActual, meses);

  const ahorroInteresesCuota = Math.max(0, baseSim.intereses - simCuota.intereses);
  const ahorroInteresesPlazo = Math.max(0, baseSim.intereses - simPlazo.intereses);
  const mesesAhorrados = Math.max(0, baseSim.meses - simPlazo.meses);

  const valorFinalInversion = extra * Math.pow(1 + rentInv, meses / 12);
  const gananciaInversionBruta = valorFinalInversion - extra;
  const diferenciaInvertirVsAmortizar = gananciaInversionBruta - ahorroInteresesPlazo;

  return {
    cuotaActual,
    totalInteresesActual: baseSim.intereses,
    nuevoCapital,
    nuevaCuotaReduciendoCuota,
    ahorroMensualCuota: Math.max(0, cuotaActual - nuevaCuotaReduciendoCuota),
    interesesReduciendoCuota: simCuota.intereses,
    ahorroInteresesCuota,
    nuevosMesesPlazo: simPlazo.meses,
    mesesAhorrados,
    interesesReduciendoPlazo: simPlazo.intereses,
    ahorroInteresesPlazo,
    valorFinalInversion,
    gananciaInversionBruta,
    diferenciaInvertirVsAmortizar,
    convieneInvertir: gananciaInversionBruta > ahorroInteresesPlazo,
  };
}

/**
 * Devuelve un color de fondo suave con intensidad proporcional al TWR mensual.
 */
export function colorFondoHeatmap(val: number | null | undefined, oscuro: boolean): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return 'transparent';
  const abs = Math.min(Math.abs(val), 0.1);
  const alpha = (0.08 + (abs / 0.1) * (oscuro ? 0.34 : 0.26)).toFixed(2);
  if (val > 0.0005) return `rgba(16, 185, 129, ${alpha})`;
  if (val < -0.0005) return `rgba(239, 68, 68, ${alpha})`;
  return oscuro ? 'rgba(148, 163, 184, 0.08)' : 'rgba(148, 163, 184, 0.12)';
}
