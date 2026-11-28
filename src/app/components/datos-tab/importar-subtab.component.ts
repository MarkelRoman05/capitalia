import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  model,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PortfolioStoreService } from '../../services/portfolio-store.service';
import { FormatService } from '../../services/format.service';
import { IconComponent } from '../icon/icon.component';
import { InformeImportacion, ProductoCfg } from '../../models/portfolio.model';

interface ArchivoLeido {
  nombre: string;
  base64: string;
}

export interface GrupoImportarActivo {
  id: string;
  nombre: string;
  isins: string[];
}

@Component({
  selector: 'cap-importar-subtab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, IconComponent],
  template: `
    <section class="panel-card bloque-seccion">
      <div class="card-header">
        <div>
          <h2 class="card-title">Importar operaciones y saldos</h2>
          <p class="card-sub">
            Sube extractos de MyInvestor, utiliza nuestra plantilla oficial Excel/CSV o convierte
            capturas de cualquier banco con IA.
          </p>
        </div>
        <div class="seg-group">
          <button
            type="button"
            class="seg-btn"
            [class.on]="modoImportar() === 'myinvestor'"
            (click)="cambiarModoImportar('myinvestor')"
          >
            MyInvestor (CSV)
          </button>
          <button
            type="button"
            class="seg-btn"
            [class.on]="modoImportar() === 'plantilla'"
            (click)="cambiarModoImportar('plantilla')"
          >
            Plantilla Excel / CSV
          </button>
          <button
            type="button"
            class="seg-btn"
            [class.on]="modoImportar() === 'ia'"
            (click)="cambiarModoImportar('ia')"
          >
            Cualquier banco con IA
          </button>
        </div>
      </div>

      @if (modoImportar() === 'myinvestor') {
        <div class="import-box">
          @if (importarGrupo(); as grp) {
            <div class="datos-import-banner">
              <div>
                <strong>Importando para «{{ grp.nombre }}»</strong>
                <div class="muted" style="margin-top: 0.2rem">
                  Sube los extractos «Plusvalías y minusvalías» de MyInvestor; estos
                  {{ grp.isins.length }} ISINs ya están agrupados en tu cartera y recibirán sus
                  operaciones automáticamente:
                  <span class="mono">{{ grp.isins.join(', ') }}</span>
                </div>
              </div>
              <button type="button" class="btn-link" (click)="importarGrupo.set(null)">
                Cerrar aviso
              </button>
            </div>
          }
          <p>
            Descarga el extracto «Plusvalías y minusvalías» de cada fondo en CSV o Excel y
            selecciónalos aquí. Si el nombre del archivo incluye el código ISIN, Capitalia
            vinculará las operaciones automáticamente al producto correspondiente de tu cartera.
          </p>
          <div class="form-grid-2" style="margin-top: 1rem">
            <div class="campo">
              <label for="imp-files-my">Archivos de MyInvestor (CSV o Excel)</label>
              <input
                id="imp-files-my"
                type="file"
                accept=".csv,.txt,.xlsx"
                multiple
                (change)="onSeleccionarArchivosImportar($event)"
              />
            </div>
            <div class="campo">
              <label for="imp-prod-def"
                >Producto por defecto (solo si el CSV no trae ISIN)</label
              >
              <select id="imp-prod-def" class="input-select" [(ngModel)]="impProductoDefecto">
                <option value="">Detectar automáticamente por ISIN</option>
                @for (p of productos(); track p.id) {
                  <option [value]="p.id">{{ p.nombre }}</option>
                }
              </select>
            </div>
          </div>
        </div>
      }

      @if (modoImportar() === 'plantilla') {
        <div class="import-box">
          <p>
            Descarga la plantilla con ejemplos e instrucciones, rellena tus compras, ventas o saldos
            mensuales y súbela para previsualizar.
          </p>
          <div class="header-btns" style="margin: 1rem 0">
            <a href="/api/plantilla.xlsx" download class="btn-secundario btn-sm">
              Descargar Plantilla Excel (.xlsx)
            </a>
            <a href="/api/plantilla.csv" download class="btn-fantasma btn-sm">
              Descargar Plantilla CSV (.csv)
            </a>
          </div>
          <div class="campo">
            <label for="imp-files-pl">Subir plantilla rellena (.xlsx o .csv)</label>
            <input
              id="imp-files-pl"
              type="file"
              accept=".xlsx,.csv,.txt"
              multiple
              (change)="onSeleccionarArchivosImportar($event)"
            />
          </div>
        </div>
      }

      @if (modoImportar() === 'ia') {
        <div class="import-box">
          <p>
            1. Copia estas instrucciones y pégalas en ChatGPT, Claude o Gemini junto con capturas,
            PDFs o extractos de tu banco o bróker.<br />
            2. Pega debajo el CSV que te devuelva la IA (o súbelo como archivo) para previsualizarlo
            antes de guardar.
          </p>
          <div class="ia-prompt-bar">
            <button type="button" class="btn-secundario btn-sm" (click)="copiarPromptIA()">
              Copiar instrucciones para la IA
            </button>
            @if (promptCopiado()) {
              <span class="pos mono">¡Instrucciones copiadas al portapapeles!</span>
            }
          </div>
          <div class="campo" style="margin-top: 1rem">
            <label for="imp-texto-ia">Pegar respuesta CSV de la IA</label>
            <textarea
              id="imp-texto-ia"
              rows="5"
              [(ngModel)]="impTextoPegado"
              placeholder="fecha;producto;isin;tipo;participaciones;importe&#10;2025-01-15;MSCI World;IE00B03HCZ61;compra;12,345;500,00"
            ></textarea>
          </div>
        </div>
      }

      <div class="import-footer-bar">
        <label class="check-row">
          <input type="checkbox" [(ngModel)]="impReemplazar" />
          <span>Sustituir el historial previo de los productos incluidos en esta importación</span>
        </label>
        <button
          type="button"
          class="btn-primario"
          [disabled]="analizandoImportacion()"
          (click)="ejecutarPrevisualizacion()"
        >
          {{ analizandoImportacion() ? 'Analizando datos...' : 'Previsualizar importación' }}
        </button>
      </div>

      @if (informePrevia(); as inf) {
        <div class="previa-box">
          <div class="previa-header">
            <div>
              <h3>Resultado del análisis previo</h3>
              <div class="prod-tags" style="margin-top: 0.4rem">
                <span class="tag pos">{{ inf['añadidos'] }} operaciones nuevas</span>
                <span class="tag">{{ inf.saldos }} saldos</span>
                <span class="tag">{{ inf.repetidos }} ya existentes (se omitirán)</span>
                @if (inf.errores.length) {
                  <span class="tag neg">{{ inf.errores.length }} con avisos/errores</span>
                }
              </div>
            </div>
            <button
              type="button"
              class="btn-primario"
              [disabled]="
                confirmandoImportacion() ||
                (inf['añadidos'] === 0 && inf.saldos === 0 && inf.productosNuevos.length === 0)
              "
              (click)="ejecutarConfirmacionImportar()"
            >
              @if (confirmandoImportacion()) {
                <cap-icon name="spinner" [size]="15" [spin]="true" />
                <span>Guardando en PostgreSQL…</span>
              } @else {
                <cap-icon name="check" [size]="15" />
                <span>Confirmar e importar ahora</span>
              }
            </button>
          </div>

          @if (inf.productosNuevos.length) {
            <div class="previa-nuevos">
              <strong
                >Se darán de alta automáticamente
                {{ inf.productosNuevos.length }} productos:</strong
              >
              <ul>
                @for (pn of inf.productosNuevos; track $index) {
                  <li>
                    <strong>{{ pn.nombre }}</strong> ({{ pn.tipo }} ·
                    {{ pn.identificador || pn.codigo }} · {{ pn.fuente }})
                  </li>
                }
              </ul>
            </div>
          }

          <div class="tabla-scroll" style="margin-top: 1rem; max-height: 320px">
            <table class="tabla-datos">
              <thead>
                <tr>
                  <th>Fila</th>
                  <th>Estado</th>
                  <th>Fecha</th>
                  <th>Producto</th>
                  <th>Tipo</th>
                  <th class="num">Unidades</th>
                  <th class="num">Importe</th>
                </tr>
              </thead>
              <tbody>
                @for (f of inf.filas; track $index) {
                  <tr>
                    <td class="mono">{{ f.fila }}</td>
                    <td>
                      <span
                        [class]="
                          'tag ' +
                          (f.estado === 'nuevo' ? 'pos' : f.estado === 'error' ? 'neg' : '')
                        "
                      >
                        {{ f.estado }}
                      </span>
                    </td>
                    <td class="mono">{{ f.fecha }}</td>
                    <td>{{ f.productoNombre || f.producto }}</td>
                    <td>{{ f.tipo }}</td>
                    <td class="num mono">
                      {{ f.unidades !== null ? fmt.num(f.unidades, 4) : '—' }}
                    </td>
                    <td class="num mono">{{ fmt.eur(f.importe, 2) }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }
    </section>
  `,
})
export class ImportarSubtabComponent {
  readonly store = inject(PortfolioStoreService);
  readonly fmt = inject(FormatService);

  readonly productos = input.required<ProductoCfg[]>();
  readonly importarGrupo = model<GrupoImportarActivo | null>(null);

  readonly modoImportar = signal<'myinvestor' | 'plantilla' | 'ia'>('myinvestor');
  readonly analizandoImportacion = signal<boolean>(false);
  readonly confirmandoImportacion = signal<boolean>(false);
  readonly informePrevia = signal<InformeImportacion | null>(null);
  readonly promptCopiado = signal<boolean>(false);

  impArchivos: ArchivoLeido[] = [];
  impProductoDefecto = '';
  impTextoPegado = '';
  impReemplazar = false;

  constructor() {
    effect(() => {
      if (this.importarGrupo()) {
        this.cambiarModoImportar('myinvestor');
      }
    });
  }

  cambiarModoImportar(m: 'myinvestor' | 'plantilla' | 'ia'): void {
    this.modoImportar.set(m);
    this.informePrevia.set(null);
    this.impArchivos = [];
  }

  async onSeleccionarArchivosImportar(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    if (!input.files?.length) return;
    const leidos: ArchivoLeido[] = [];
    for (const file of Array.from(input.files)) {
      const base64 = await this.archivoABase64(file);
      leidos.push({ nombre: file.name, base64 });
    }
    this.impArchivos = leidos;
    await this.ejecutarPrevisualizacion();
  }

  private archivoABase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const res = String(reader.result || '');
        const idx = res.indexOf(',');
        resolve(idx >= 0 ? res.slice(idx + 1) : res);
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  private construirPayloadImportar(): Record<string, unknown> {
    const origen = this.modoImportar() === 'myinvestor' ? 'myinvestor' : 'tabla';
    if (this.modoImportar() === 'ia' && this.impTextoPegado.trim()) {
      return {
        origen,
        archivos: [
          {
            nombre: 'importacion_ia.csv',
            contenido: this.impTextoPegado.trim(),
          },
        ],
        productoPorDefecto: this.impProductoDefecto || undefined,
        reemplazar: this.impReemplazar,
      };
    }
    return {
      origen,
      archivos: this.impArchivos,
      productoPorDefecto: this.impProductoDefecto || undefined,
      reemplazar: this.impReemplazar,
    };
  }

  async ejecutarPrevisualizacion(): Promise<void> {
    const payload = this.construirPayloadImportar();
    const archivos = payload['archivos'] as unknown[];
    if (!archivos || !archivos.length) {
      this.store.notificarError('Selecciona al menos un archivo o pega los datos CSV.');
      return;
    }
    this.analizandoImportacion.set(true);
    try {
      const inf = await this.store.previsualizarImportacion(payload);
      this.informePrevia.set(inf);
    } finally {
      this.analizandoImportacion.set(false);
    }
  }

  async ejecutarConfirmacionImportar(): Promise<void> {
    const payload = this.construirPayloadImportar();
    this.confirmandoImportacion.set(true);
    try {
      const inf = await this.store.confirmarImportacion(payload);
      if (inf) {
        this.informePrevia.set(null);
        this.impArchivos = [];
        this.impTextoPegado = '';
      }
    } finally {
      this.confirmandoImportacion.set(false);
    }
  }

  async copiarPromptIA(): Promise<void> {
    try {
      const txt = await this.store.obtenerPromptIA();
      if (txt && navigator.clipboard) {
        await navigator.clipboard.writeText(txt);
        this.promptCopiado.set(true);
        setTimeout(() => this.promptCopiado.set(false), 3500);
      }
    } catch {
      this.store.notificarError('No se pudo copiar el prompt.');
    }
  }
}
