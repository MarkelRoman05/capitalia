import { TestBed } from '@angular/core/testing';
import { FormatService } from './format.service';

describe('FormatService', () => {
  let fmt: FormatService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    fmt = TestBed.inject(FormatService);
  });

  it('formatea importes en EUR y compactos correctamente', () => {
    expect(fmt.eur(1234.56, 2)).toMatch(/1\.?234,56/);
    expect(fmt.eur(null)).toBe('—');
    expect(fmt.eurCompacto(15000)).toContain('k');
    expect(fmt.eurCompacto(1500000)).toContain('M');
  });

  it('formatea porcentajes y signos correctamente', () => {
    expect(fmt.pct(0.1234, 2)).toContain('12,34');
    expect(fmt.pctSigno(0.05, 1)).toContain('+');
    expect(fmt.pctSigno(-0.05, 1)).toMatch(/[-−]5,0/);
    expect(fmt.claseSigno(10)).toBe('pos');
    expect(fmt.claseSigno(-10)).toBe('neg');
    expect(fmt.claseSigno(0)).toBe('');
  });

  it('formatea fechas cortas y meses correctamente', () => {
    expect(fmt.fechaCorta('2025-03-15')).toContain('15');
    expect(fmt.mesCorto('2025-03')).toBeTruthy();
    expect(fmt.mesLargo('2025-03')).toBeTruthy();
  });
});
