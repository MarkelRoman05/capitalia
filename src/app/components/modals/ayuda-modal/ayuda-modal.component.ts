import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { PortfolioStoreService } from '../../../services/portfolio-store.service';
import { IconComponent } from '../../icon/icon.component';

interface PreguntaAyuda {
  id: string;
  pregunta: string;
  respuesta: string;
}

@Component({
  selector: 'cap-ayuda-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  host: {
    '(document:keydown.escape)': 'cerrar()',
  },
  template: `
    @if (store.modalAyudaAbierto()) {
      <div class="modal-backdrop" (click)="cerrar()">
        <div
          class="modal-card modal-lg pm-modal"
          (click)="$event.stopPropagation()"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-ayuda-titulo"
        >
          <div class="modal-header pm-header">
            <div class="modal-title-group">
              <span class="modal-kicker">Guía rápida</span>
              <h3 id="modal-ayuda-titulo">Cómo funciona Capitalia</h3>
            </div>
            <button type="button" class="btn-cerrar" (click)="cerrar()" aria-label="Cerrar">
              <cap-icon name="close" [size]="16" />
            </button>
          </div>

          <div class="pm-body">
            <p class="card-sub" style="margin: 0 0 1.1rem">
              Capitalia es un gestor patrimonial personal que te permite anotar tus compras, ventas,
              traspasos y dividendos de fondos, ETFs, acciones, criptomonedas, renta fija, cuentas
              remuneradas, inmuebles y préstamos hipotecarios. Calcula automáticamente tu
              rentabilidad total, TIR, TWR, X-Ray, fiscalidad IRPF y métricas de riesgo.
            </p>

            <div class="faq-lista" style="margin-bottom: 1.25rem">
              @for (item of preguntas; track item.id) {
                <div class="faq-item" [class.abierto]="abierta() === item.id">
                  <button
                    type="button"
                    class="faq-pregunta"
                    [attr.aria-expanded]="abierta() === item.id"
                    (click)="alternar(item.id)"
                  >
                    <span>{{ item.pregunta }}</span>
                    <span class="faq-icono">
                      <cap-icon [name]="abierta() === item.id ? 'minus' : 'plus'" [size]="16" />
                    </span>
                  </button>
                  @if (abierta() === item.id) {
                    <div class="faq-respuesta">
                      <p>{{ item.respuesta }}</p>
                    </div>
                  }
                </div>
              }
            </div>

            <section class="pm-section" style="margin-bottom: 0">
              <h4 class="pm-section-title">Tus datos en PostgreSQL</h4>
              <p class="card-sub" style="margin: 0">
                Toda tu cartera, historial diario de patrimonio, puntos de restauración automáticos
                y tablas relacionales de productos, movimientos y valoraciones se almacenan en tu
                base de datos PostgreSQL local del servidor, protegidos con sesiones firmadas y
                contraseñas cifradas con PBKDF2-HMAC-SHA256.
              </p>
            </section>
          </div>

          <div class="modal-footer pm-footer">
            <button type="button" class="btn-primario" (click)="cerrar()">Entendido</button>
          </div>
        </div>
      </div>
    }
  `,
})
export class AyudaModalComponent {
  readonly store = inject(PortfolioStoreService);
  readonly abierta = signal<string>('diferencia-rent');

  readonly preguntas: PreguntaAyuda[] = [
    {
      id: 'diferencia-rent',
      pregunta: '¿Qué diferencia hay entre Rentabilidad Total, TIR y TWR?',
      respuesta:
        'La Rentabilidad Total mide cuánto has ganado en porcentaje sobre el total aportado. La TIR (Tasa Interna de Retorno o XIRR) calcula tu rentabilidad anualizada real teniendo en cuenta la fecha exacta de cada aportación o reembolso. El TWR (Time-Weighted Return, en la pestaña Rendimiento) mide cómo se han comportado los activos en sí mismos año a año, aislando el momento en que metiste o sacaste dinero.',
    },
    {
      id: 'fiscalidad-fifo',
      pregunta: '¿Cómo se calculan las ventas, traspasos y plusvalías realizadas?',
      respuesta:
        'Cuando anotas una venta, el motor aplica automáticamente el método FIFO (First In, First Out) exigido por la Agencia Tributaria en España: las primeras participaciones que compraste son las primeras que se venden. Los traspasos entre fondos se procesan de forma fiscalmente neutra heredando coste y fecha FIFO de origen.',
    },
    {
      id: 'cotizados-vs-saldos',
      pregunta: '¿Cuándo debo usar «Compras y ventas» y cuándo «Saldos y valores»?',
      respuesta:
        'Usa «Compras y ventas» para productos con cotización automática (fondos indexados, ETFs, acciones y criptomonedas): tú solo anotas cuántas participaciones compraste e importe, y Capitalia actualiza su valor diario con Morningstar, Yahoo Finance o CoinGecko. Usa «Saldos y valores» para cuentas remuneradas, efectivo, inmuebles o préstamos hipotecarios.',
    },
    {
      id: 'importacion-bancos',
      pregunta: '¿Cómo importo datos desde MyInvestor u otros bancos?',
      respuesta:
        'En «Mis datos → Importar datos» puedes subir directamente los CSV de órdenes de MyInvestor (detecta automáticamente los fondos por su ISIN), usar la plantilla oficial en Excel/CSV o copiar el prompt del Asistente IA para convertir capturas de pantalla o extractos PDF de cualquier entidad.',
    },
    {
      id: 'copias-postgresql',
      pregunta: '¿Qué ocurre si me equivoco al importar o borrar un producto?',
      respuesta:
        'Antes de cualquier cambio importante (importar, borrar o vaciar), Capitalia guarda automáticamente una instantánea en la tabla copias_cartera de PostgreSQL. Puedes restaurar cualquier versión anterior con un solo clic desde «Mis datos → Copias y web».',
    },
  ];

  alternar(id: string): void {
    this.abierta.set(this.abierta() === id ? '' : id);
  }

  cerrar(): void {
    this.store.modalAyudaAbierto.set(false);
  }
}
