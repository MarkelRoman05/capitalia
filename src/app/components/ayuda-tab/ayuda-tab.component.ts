import { Component, signal } from '@angular/core';

interface PreguntaAyuda {
  id: string;
  pregunta: string;
  respuesta: string;
}

@Component({
  selector: 'cap-ayuda-tab',
  template: `
    <div class="dos-columnas bloque-seccion">
      <section class="panel-card">
        <span class="hero-kicker">Guía rápida</span>
        <h2 class="card-title">Cómo funciona Capitalia</h2>
        <p class="card-sub" style="margin-bottom: 1.25rem">
          Capitalia combina un motor cuantitativo en Python con persistencia relacional en PostgreSQL y una interfaz reactiva en Angular 22.
        </p>

        <div class="faq-lista">
          @for (item of preguntas; track item.id) {
            <div class="faq-item" [class.abierto]="abierta() === item.id">
              <button
                type="button"
                class="faq-pregunta"
                (click)="alternar(item.id)"
              >
                <span>{{ item.pregunta }}</span>
                <span class="faq-icono">{{ abierta() === item.id ? '−' : '+' }}</span>
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
        <section class="panel-card bloque-seccion">
          <span class="hero-kicker">Atajos</span>
          <h2 class="card-title">Atajos de teclado</h2>
          <p class="card-sub" style="margin-bottom: 1rem">
            Navega por las pestañas y modos de visualización sin usar el ratón:
          </p>

          <table class="tabla-compacta">
            <thead>
              <tr>
                <th>Tecla</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><kbd>1</kbd> … <kbd>6</kbd></td>
                <td>Cambiar rápidamente entre las 6 pestañas principales</td>
              </tr>
              <tr>
                <td><kbd>V</kbd></td>
                <td>Activar / desactivar el Modo Vídeo / Presentación (oculta controles de edición)</td>
              </tr>
              <tr>
                <td><kbd>L</kbd></td>
                <td>Alternar entre tema Oscuro (Obsidian) y Claro (Alabaster)</td>
              </tr>
              <tr>
                <td><kbd>Esc</kbd></td>
                <td>Quitar cualquier filtro activo y volver a mostrar toda la cartera</td>
              </tr>
              <tr>
                <td><kbd>Alt</kbd> + Clic</td>
                <td>En una pastilla de filtro: aislar únicamente ese producto</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section class="panel-card">
          <span class="hero-kicker">Tus datos</span>
          <h2 class="card-title">Tus datos en PostgreSQL</h2>
          <p class="card-sub">
            Toda tu cartera, historial diario de patrimonio, puntos de restauración automáticos y tablas relacionales de productos, movimientos y valoraciones se almacenan en tu base de datos PostgreSQL local del servidor, protegidos con sesiones firmadas y contraseñas cifradas con PBKDF2-HMAC-SHA256.
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
