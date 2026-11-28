import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { FormatService } from '../../services/format.service';
import { SaludFinanciera } from '../../models/portfolio.model';

@Component({
  selector: 'cap-salud-financiera-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (salud(); as sal) {
      <section class="panel-card bloque-seccion salud-barra" aria-label="Salud financiera">
        <div class="salud-cab">
          <span class="hero-kicker">Salud financiera</span>
          <h2 class="salud-titulo">Liquidez, colchón y endeudamiento</h2>
        </div>

        <div class="salud-items">
          <div class="salud-item">
            <span class="salud-etq">Liquidez inmediata</span>
            <strong class="salud-val mono valor-privado">{{ fmt.eur(sal.liquidez, 0) }}</strong>
            <span class="salud-sub">Efectivo, cuentas y monetarios</span>
          </div>

          <div class="salud-item">
            <span class="salud-etq">Colchón de emergencia</span>
            @if (sal.mesesColchon !== null && sal.mesesColchon !== undefined) {
              <strong
                class="salud-val mono"
                [class.pos]="sal.mesesColchon >= 6"
                [class.neg]="sal.mesesColchon < 3"
              >
                {{ fmt.num(sal.mesesColchon, 1) }} meses
              </strong>
              <span class="salud-sub valor-privado">
                Sobre {{ fmt.eur(sal.gastoMensual ?? 0, 0) }}/mes ·
                <button type="button" class="btn-link" (click)="configurarGasto.emit()">
                  Editar
                </button>
              </span>
            } @else {
              <button type="button" class="btn-secundario btn-sm" (click)="configurarGasto.emit()">
                Configurar gasto mensual
              </button>
            }
          </div>

          @if (sal.deudaTotal > 0) {
            <div class="salud-item">
              <span class="salud-etq">Ratio deuda / activos</span>
              <strong class="salud-val mono" [class.neg]="sal.ratioDeuda > 0.5">
                {{ fmt.pct(sal.ratioDeuda, 1) }}
              </strong>
              <span class="salud-sub valor-privado">
                Pasivos: {{ fmt.eur(sal.deudaTotal, 0) }}
              </span>
            </div>
          }
        </div>
      </section>
    }
  `,
})
export class SaludFinancieraCardComponent {
  readonly fmt = inject(FormatService);
  readonly salud = input.required<SaludFinanciera>();
  readonly configurarGasto = output<void>();
}
