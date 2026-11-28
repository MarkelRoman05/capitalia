import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { IconComponent } from '../icon/icon.component';

interface PreguntaAyuda {
  id: string;
  pregunta: string;
  respuesta: string;
}

@Component({
  selector: 'cap-ayuda-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <div class="dos-columnas bloque-seccion">
      <section class="panel-card">
        <span class="hero-kicker">Guía rápida</span>
        <h2 class="card-title">Cómo funciona Capitalia</h2>
        <p class="card-sub" style="margin-bottom: 1.25rem">
          Capitalia es un gestor patrimonial personal que te permite anotar tus compras y ventas de
          fondos, ETFs, acciones, criptomonedas, cuentas remuneradas, efectivo, inmuebles y
          préstamos hipotecarios. Calcula automáticamente tu rentabilidad total, TIR y TWR y genera
          gráficos de evolución.
        </p>

        <div class="faq-lista">
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
      </section>

      <div>
        <section class="panel-card">
          <span class="hero-kicker">Tus datos</span>
          <h2 class="card-title">Tus datos en PostgreSQL</h2>
          <p class="card-sub">
            Toda tu cartera, historial diario de patrimonio, puntos de restauración automáticos y
            tablas relacionales de productos, movimientos y valoraciones se almacenan en tu base de
            datos PostgreSQL local del servidor, protegidos con sesiones firmadas y contraseñas
            cifradas con PBKDF2-HMAC-SHA256.
          </p>
        </section>
      </div>
    </div>
  `,
})
export class AyudaTabComponent {
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
      pregunta: '¿Cómo se calculan las ventas y plusvalías realizadas?',
      respuesta:
        'Cuando anotas una venta de un fondo, ETF, acción o criptomoneda, el motor aplica automáticamente el método FIFO (First In, First Out) exigido por la Agencia Tributaria en España: las primeras participaciones que compraste son las primeras que se venden, descontando su coste histórico exacto y registrando la ganancia o pérdida realizada.',
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
}
