import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { FormatService } from '../../services/format.service';
import { IconComponent } from '../icon/icon.component';

export interface HitoPatrimonio {
  importe: number;
  fecha?: string | null;
}

@Component({
  selector: 'cap-hitos-patrimonio',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <section class="panel-card">
      <div class="card-header">
        <div>
          <h2 class="card-title">Hitos de patrimonio</h2>
          <p class="card-sub">Metas escalonadas alcanzadas y próximas por conquistar</p>
        </div>
      </div>
      <div class="hitos-grid">
        @for (h of hitos(); track h.importe) {
          <div class="hito-item" [class.hito-logrado]="!!h.fecha">
            <div class="hito-cab">
              <span class="hito-icono">
                <cap-icon [name]="h.fecha ? 'check' : 'target'" [size]="15" />
              </span>
              <strong class="hito-imp mono valor-privado">{{ fmt.eur(h.importe, 0) }}</strong>
            </div>
            @if (h.fecha) {
              <span class="hito-fecha">Logrado el {{ fmt.fechaCorta(h.fecha) }}</span>
            } @else {
              <div class="barra-prog barra-prog-sm">
                <div
                  class="barra-prog-fill"
                  [style.width.%]="porcentajeHito(h.importe)"
                ></div>
              </div>
              <span class="hito-fecha valor-privado">
                {{ fmt.num(porcentajeHito(h.importe), 0) }}% · faltan
                {{ fmt.eur(Math.max(0, h.importe - patrimonioBase()), 0) }}
              </span>
            }
          </div>
        }
      </div>
    </section>
  `,
})
export class HitosPatrimonioComponent {
  readonly fmt = inject(FormatService);
  protected readonly Math = Math;

  readonly hitos = input<HitoPatrimonio[]>([]);
  readonly patrimonioActual = input<number>(0);
  readonly patrimonioBase = input<number>(0);

  porcentajeHito(importe: number): number {
    const pat = this.patrimonioActual();
    if (importe <= 0) return 0;
    return Math.min(100, Math.max(0, (pat / importe) * 100));
  }
}
