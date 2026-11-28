import {
  calcularProyeccionEscenarios,
  calcularRebalanceoAportacion,
  calcularXirr,
  RebalanceoEntrada,
  simularAmortizacionHipoteca,
} from './portfolio-metrics.util';

describe('portfolio-metrics.util', () => {
  describe('calcularXirr()', () => {
    it('devuelve null con flujos insuficientes o sin cambio de signo', () => {
      expect(calcularXirr([])).toBeNull();
      expect(calcularXirr([['2024-01-01', -1000]])).toBeNull();
      expect(
        calcularXirr([
          ['2024-01-01', -1000],
          ['2025-01-01', -200],
        ])
      ).toBeNull();
    });

    it('calcula correctamente la TIR anualizada sobre flujos fechados', () => {
      const tir = calcularXirr([
        ['2024-01-01', -1000],
        ['2024-12-31', 1120],
      ]);
      expect(tir).not.toBeNull();
      expect(tir!).toBeCloseTo(0.12, 2);
    });
  });

  describe('calcularRebalanceoAportacion() (water-filling sin venta)', () => {
    it('asigna el 100 % de una aportación pequeña al activo más infraponderado sin vender el sobreponderado', () => {
      const items: RebalanceoEntrada[] = [
        { id: 'a', nombre: 'Fondo A', color: '#10b981', valorActual: 7000, pesoObjetivo: 60 },
        { id: 'b', nombre: 'Fondo B', color: '#38bdf8', valorActual: 3000, pesoObjetivo: 40 },
      ];

      const res = calcularRebalanceoAportacion(items, 1000);
      const filaA = res.find((r) => r.id === 'a')!;
      const filaB = res.find((r) => r.id === 'b')!;

      expect(filaA.driftActualPp).toBeCloseTo(10, 4);
      expect(filaB.driftActualPp).toBeCloseTo(-10, 4);
      expect(filaA.aportar).toBe(0);
      expect(filaB.aportar).toBe(1000);
      expect(filaB.nuevoPesoPct).toBeCloseTo((4000 / 11000) * 100, 3);
      expect(Math.abs(filaB.driftResultantePp)).toBeLessThan(Math.abs(filaB.driftActualPp));
    });

    it('reparte entre todos los activos alcanzando drift 0 cuando la aportación cubre la desviación', () => {
      const items: RebalanceoEntrada[] = [
        { id: 'a', nombre: 'Fondo A', color: '#10b981', valorActual: 7000, pesoObjetivo: 60 },
        { id: 'b', nombre: 'Fondo B', color: '#38bdf8', valorActual: 3000, pesoObjetivo: 40 },
      ];

      const res = calcularRebalanceoAportacion(items, 5000);
      const filaA = res.find((r) => r.id === 'a')!;
      const filaB = res.find((r) => r.id === 'b')!;

      expect(filaA.aportar).toBeCloseTo(2000, 2);
      expect(filaB.aportar).toBeCloseTo(3000, 2);
      expect(filaA.driftResultantePp).toBeCloseTo(0, 4);
      expect(filaB.driftResultantePp).toBeCloseTo(0, 4);
    });

    it('asigna según pesoObjetivo en una cartera que parte de 0 €', () => {
      const items: RebalanceoEntrada[] = [
        { id: 'a', nombre: 'RV Global', color: '#10b981', valorActual: 0, pesoObjetivo: 70 },
        { id: 'b', nombre: 'RF Global', color: '#38bdf8', valorActual: 0, pesoObjetivo: 30 },
        { id: 'c', nombre: 'Sin objetivo', color: '#f59e0b', valorActual: 0, pesoObjetivo: null },
      ];

      const res = calcularRebalanceoAportacion(items, 1000);
      expect(res[0].aportar).toBe(700);
      expect(res[1].aportar).toBe(300);
      expect(res[2].aportar).toBe(0);
    });
  });

  describe('calcularProyeccionEscenarios()', () => {
    it('calcula escenarios pesimista, base y optimista con ajuste real por inflación', () => {
      const nominal = calcularProyeccionEscenarios({
        patrimonioActual: 20000,
        anos: 10,
        rentAnualPct: 7,
        aportacionMensual: 500,
        ajustarInflacion: false,
        tasaRetiroFire: 0.04,
      });

      const real = calcularProyeccionEscenarios({
        patrimonioActual: 20000,
        anos: 10,
        rentAnualPct: 7,
        aportacionMensual: 500,
        ajustarInflacion: true,
        tasaRetiroFire: 0.04,
      });

      expect(nominal.tasaBaseEfectivaPct).toBeCloseTo(7, 4);
      expect(nominal.tasaPesimistaEfectivaPct).toBeCloseTo(5, 4);
      expect(nominal.tasaOptimistaEfectivaPct).toBeCloseTo(9, 4);
      expect(real.tasaBaseEfectivaPct).toBeCloseTo((1.07 / 1.025 - 1) * 100, 4);
      expect(nominal.finalOptimista).toBeGreaterThan(nominal.finalTotal);
      expect(nominal.finalTotal).toBeGreaterThan(nominal.finalPesimista);
      expect(real.finalTotal).toBeLessThan(nominal.finalTotal);
      expect(nominal.rentaFireMensual).toBeCloseTo((nominal.finalTotal * 0.04) / 12, 2);
      expect(nominal.anioCrossover).not.toBeNull();
    });
  });

  describe('simularAmortizacionHipoteca()', () => {
    it('calcula cuota francesa, mayor ahorro reduciendo plazo que cuota, y comparación vs invertir', () => {
      const res = simularAmortizacionHipoteca({
        capitalPendiente: 120000,
        tipoInteresAnualPct: 3.0,
        mesesRestantes: 240,
        amortizacionAnticipada: 10000,
        rentabilidadInvertirPct: 7.0,
      });

      // Cuota francesa estándar de 120.000 € al 3 % a 20 años: ~665,52 €/mes
      expect(res.cuotaActual).toBeCloseTo(665.52, 1);
      expect(res.nuevoCapital).toBe(110000);
      expect(res.nuevaCuotaReduciendoCuota).toBeLessThan(res.cuotaActual);
      expect(res.mesesAhorrados).toBeGreaterThan(20);
      // Reducir plazo ahorra estrictamente más intereses que reducir cuota
      expect(res.ahorroInteresesPlazo).toBeGreaterThan(res.ahorroInteresesCuota);
      // Invertir 10.000 € al 7 % a 20 años rinde ~28.697 € > ahorro intereses al 3 %
      expect(res.convieneInvertir).toBe(true);
      expect(res.gananciaInversionBruta).toBeGreaterThan(res.ahorroInteresesPlazo);
    });

    it('recomienda amortizar cuando el interés hipotecario supera la rentabilidad esperada de inversión', () => {
      const res = simularAmortizacionHipoteca({
        capitalPendiente: 100000,
        tipoInteresAnualPct: 6.5,
        mesesRestantes: 180,
        amortizacionAnticipada: 15000,
        rentabilidadInvertirPct: 4.0,
      });

      expect(res.ahorroInteresesPlazo).toBeGreaterThan(res.gananciaInversionBruta);
      expect(res.convieneInvertir).toBe(false);
    });
  });
});
