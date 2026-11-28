import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PortfolioStoreService } from '../../services/portfolio-store.service';

@Component({
  selector: 'cap-copias-subtab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  template: `
    <div class="dos-columnas bloque-seccion">
      <section class="panel-card">
        <h2 class="card-title">Copia de seguridad en archivo JSON</h2>
        <p class="card-sub">
          Tus datos están respaldados en PostgreSQL, pero puedes descargar o restaurar un archivo
          JSON completo en cualquier momento.
        </p>
        <div class="header-btns" style="margin-top: 1.25rem">
          <a href="/api/copia/descargar" download class="btn-primario">
            Descargar cartera (.json)
          </a>
          <label class="btn-secundario" style="cursor: pointer">
            Restaurar desde archivo (.json)
            <input
              type="file"
              accept=".json"
              style="display: none"
              (change)="onSubirCopiaJson($event)"
            />
          </label>
        </div>
      </section>

      <section class="panel-card">
        <h2 class="card-title">Exportar informe web interactivo (.html)</h2>
        <p class="card-sub">
          Genera un único archivo HTML autónomo que funciona sin conexión para guardar o compartir.
        </p>
        <label class="check-row" style="margin-top: 1rem">
          <input
            type="checkbox"
            [ngModel]="ocultarImportesWeb()"
            (ngModelChange)="ocultarImportesWeb.set(!!$event)"
          />
          <span
            >Modo discreto: ocultar todos los importes en euros (mostrar solo porcentajes y
            evolución base 100)</span
          >
        </label>
        <div style="margin-top: 1rem">
          <a
            [href]="'/api/exportar-web?ocultar=' + (ocultarImportesWeb() ? '1' : '0')"
            download
            class="btn-secundario"
          >
            Descargar página web interactiva (.html)
          </a>
        </div>
      </section>
    </div>

    <section class="panel-card bloque-seccion">
      <div class="card-header">
        <div>
          <h2 class="card-title">Puntos de restauración automáticos en PostgreSQL</h2>
          <p class="card-sub">
            Capitalia guarda una copia instantánea antes de cualquier importación, vaciado o
            restauración.
          </p>
        </div>
      </div>

      <div class="tabla-scroll">
        <table class="tabla-datos">
          <thead>
            <tr>
              <th>Fecha y hora</th>
              <th>Motivo</th>
              <th class="num">Productos</th>
              <th class="num">Movimientos</th>
              <th class="num">Acción</th>
            </tr>
          </thead>
          <tbody>
            @for (cp of store.copias(); track cp.archivo) {
              <tr>
                <td class="mono">{{ cp.fecha }}</td>
                <td>{{ cp.motivo }}</td>
                <td class="num mono">{{ cp.productos }}</td>
                <td class="num mono">{{ cp.movimientos }}</td>
                <td class="num">
                  <button
                    type="button"
                    class="btn-tabla"
                    (click)="confirmarRecuperarCopia(cp.archivo, cp.fecha)"
                  >
                    Restaurar esta versión
                  </button>
                </td>
              </tr>
            } @empty {
              <tr>
                <td colspan="5" class="vacio-celda">
                  Aún no se han generado copias automáticas de cambios previos.
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </section>
  `,
})
export class CopiasSubtabComponent {
  readonly store = inject(PortfolioStoreService);
  readonly ocultarImportesWeb = signal<boolean>(false);

  async onSubirCopiaJson(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const texto = await file.text();
      const json = JSON.parse(texto);
      await this.store.subirCopia(json);
    } catch {
      this.store.notificarError('El archivo seleccionado no es un JSON válido.');
    } finally {
      input.value = '';
    }
  }

  confirmarRecuperarCopia(archivo: string, fecha: string): void {
    this.store.pedirConfirmacion({
      titulo: 'Restaurar copia de seguridad',
      mensaje: `¿Seguro que quieres restaurar la cartera al estado del ${fecha}? Se guardará una copia de seguridad de tu cartera actual antes de restaurar.`,
      textoConfirmar: 'Restaurar versión',
      peligro: false,
      accion: async () => {
        await this.store.recuperarCopia(archivo);
      },
    });
  }
}
