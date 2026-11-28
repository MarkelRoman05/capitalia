import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
  CarteraConfig,
  CopiaSeguridad,
  DatosPanel,
  EntidadBanco,
  InformeImportacion,
  LineaLoteCartera,
  MovimientoCfg,
  ProductoCfg,
  RespuestaBancos,
  RespuestaLoteProductos,
  ResultadoBusqueda,
  ValoracionCfg,
} from '../models/portfolio.model';

export type RespuestaPanelApi =
  | {
      ok?: boolean;
      modo?: 'propio' | 'demo' | 'estatico';
      datos?: DatosPanel | null;
      panel?: DatosPanel | null;
      cartera?: CarteraConfig;
      tipos?: Record<string, [string, string]>;
      fuentes?: string[];
      tiposMovimiento?: string[];
    }
  | DatosPanel;

export interface RespuestaCarteraConfig {
  cartera: CarteraConfig;
  tipos: Record<string, [string, string]>;
  fuentes: string[];
  tiposMovimiento: string[];
  avisos: string[];
}

export interface RespuestaPreciosVivo {
  ok: boolean;
  actualizado?: string;
  precios?: Record<string, number>;
}

@Injectable({ providedIn: 'root' })
export class PortfolioApiService {
  private readonly http = inject(HttpClient);

  obtenerPanel(): Promise<RespuestaPanelApi> {
    return firstValueFrom(this.http.get<RespuestaPanelApi>('/api/panel'));
  }

  obtenerCarteraConfig(): Promise<RespuestaCarteraConfig> {
    return firstValueFrom(this.http.get<RespuestaCarteraConfig>('/api/cartera'));
  }

  obtenerPreciosVivo(): Promise<RespuestaPreciosVivo> {
    return firstValueFrom(this.http.get<RespuestaPreciosVivo>('/api/precios-vivo'));
  }

  actualizarPrecios(): Promise<{ ok: boolean; panel: DatosPanel | null }> {
    return firstValueFrom(
      this.http.post<{ ok: boolean; panel: DatosPanel | null }>('/api/actualizar', {})
    );
  }

  guardarObjetivo(payload: Record<string, unknown>): Promise<{ ok: boolean; panel: DatosPanel }> {
    return firstValueFrom(
      this.http.post<{ ok: boolean; panel: DatosPanel }>('/api/objetivo', payload)
    );
  }

  cargarEjemplo(): Promise<{ ok: boolean; panel: DatosPanel }> {
    return firstValueFrom(
      this.http.post<{ ok: boolean; panel: DatosPanel }>('/api/cargar-ejemplo', {})
    );
  }

  empezarConMiCartera(): Promise<{ ok: boolean; panel: DatosPanel }> {
    return firstValueFrom(
      this.http.post<{ ok: boolean; panel: DatosPanel }>('/api/empezar', {})
    );
  }

  reiniciarCartera(): Promise<{ ok: boolean; panel: DatosPanel }> {
    return firstValueFrom(
      this.http.post<{ ok: boolean; panel: DatosPanel }>('/api/reiniciar', {})
    );
  }

  buscarProductos(q: string, tipo = 'todos'): Promise<{ resultados: ResultadoBusqueda[] }> {
    const params: Record<string, string> = { q };
    if (tipo && tipo !== 'todos') {
      params['tipo'] = tipo;
    }
    return firstValueFrom(
      this.http.get<{ resultados: ResultadoBusqueda[] }>('/api/buscar', { params })
    );
  }

  obtenerDetalleCarteraModelo(
    carteraId: string
  ): Promise<{ ok: boolean; cartera?: ResultadoBusqueda }> {
    return firstValueFrom(
      this.http.get<{ ok: boolean; cartera?: ResultadoBusqueda }>(
        `/api/cartera-modelo/${encodeURIComponent(carteraId)}`
      )
    );
  }

  guardarProductosLote(payload: {
    productos: Partial<ProductoCfg>[];
    entidad: string;
    grupoId: string;
    grupoNombre: string;
  }): Promise<{ ok: boolean; item?: RespuestaLoteProductos; panel: DatosPanel }> {
    return firstValueFrom(
      this.http.post<{ ok: boolean; item?: RespuestaLoteProductos; panel: DatosPanel }>(
        '/api/productos/lote',
        payload
      )
    );
  }

  guardarImportesCartera(payload: {
    fecha: string;
    nota?: string;
    reemplazarPrevios?: boolean;
    lineas: LineaLoteCartera[];
  }): Promise<{
    ok: boolean;
    item?: { guardados: number; reemplazados: number };
    panel: DatosPanel;
  }> {
    return firstValueFrom(
      this.http.post<{
        ok: boolean;
        item?: { guardados: number; reemplazados: number };
        panel: DatosPanel;
      }>('/api/movimientos/lote-cartera', payload)
    );
  }

  borrarGrupoProductos(grupoId: string): Promise<{ ok: boolean; panel: DatosPanel }> {
    return firstValueFrom(
      this.http.delete<{ ok: boolean; panel: DatosPanel }>(
        `/api/carteras-grupo/${encodeURIComponent(grupoId)}`
      )
    );
  }

  obtenerBancos(q?: string): Promise<RespuestaBancos> {
    return firstValueFrom(
      q !== undefined
        ? this.http.get<RespuestaBancos>('/api/bancos', { params: { q } })
        : this.http.get<RespuestaBancos>('/api/bancos')
    );
  }

  registrarUsoBanco(banco: Partial<EntidadBanco> & { nombre: string }): Promise<{ ok: boolean }> {
    return firstValueFrom(this.http.post<{ ok: boolean }>('/api/bancos/uso', banco));
  }

  guardarProducto(
    prod: Partial<ProductoCfg>,
    idExistente?: string
  ): Promise<{ ok: boolean; item?: ProductoCfg; panel: DatosPanel }> {
    return firstValueFrom(
      idExistente
        ? this.http.put<{ ok: boolean; item?: ProductoCfg; panel: DatosPanel }>(
            `/api/productos/${encodeURIComponent(idExistente)}`,
            prod
          )
        : this.http.post<{ ok: boolean; item?: ProductoCfg; panel: DatosPanel }>(
            '/api/productos',
            prod
          )
    );
  }

  borrarProducto(id: string): Promise<{ ok: boolean; panel: DatosPanel }> {
    return firstValueFrom(
      this.http.delete<{ ok: boolean; panel: DatosPanel }>(
        `/api/productos/${encodeURIComponent(id)}`
      )
    );
  }

  repartirColores(): Promise<{ ok: boolean; panel: DatosPanel }> {
    return firstValueFrom(
      this.http.post<{ ok: boolean; panel: DatosPanel }>('/api/repartir-colores', {})
    );
  }

  guardarMovimiento(
    mov: Partial<MovimientoCfg>,
    idExistente?: string
  ): Promise<{ ok: boolean; panel: DatosPanel }> {
    return firstValueFrom(
      idExistente
        ? this.http.put<{ ok: boolean; panel: DatosPanel }>(
            `/api/movimientos/${encodeURIComponent(idExistente)}`,
            mov
          )
        : this.http.post<{ ok: boolean; panel: DatosPanel }>('/api/movimientos', mov)
    );
  }

  borrarMovimiento(id: string): Promise<{ ok: boolean; panel: DatosPanel }> {
    return firstValueFrom(
      this.http.delete<{ ok: boolean; panel: DatosPanel }>(
        `/api/movimientos/${encodeURIComponent(id)}`
      )
    );
  }

  guardarValoracion(
    val: Partial<ValoracionCfg> | { fecha: string; saldos: Partial<ValoracionCfg>[] },
    idExistente?: string
  ): Promise<{ ok: boolean; panel: DatosPanel }> {
    return firstValueFrom(
      idExistente
        ? this.http.put<{ ok: boolean; panel: DatosPanel }>(
            `/api/valoraciones/${encodeURIComponent(idExistente)}`,
            val
          )
        : this.http.post<{ ok: boolean; panel: DatosPanel }>('/api/valoraciones', val)
    );
  }

  borrarValoracion(id: string): Promise<{ ok: boolean; panel: DatosPanel }> {
    return firstValueFrom(
      this.http.delete<{ ok: boolean; panel: DatosPanel }>(
        `/api/valoraciones/${encodeURIComponent(id)}`
      )
    );
  }

  previsualizarImportacion(
    payload: Record<string, unknown>
  ): Promise<{ ok: boolean; informe: InformeImportacion }> {
    return firstValueFrom(
      this.http.post<{ ok: boolean; informe: InformeImportacion }>(
        '/api/importar/previsualizar',
        payload
      )
    );
  }

  confirmarImportacion(
    payload: Record<string, unknown>
  ): Promise<{ ok: boolean; informe: InformeImportacion; panel: DatosPanel }> {
    return firstValueFrom(
      this.http.post<{ ok: boolean; informe: InformeImportacion; panel: DatosPanel }>(
        '/api/importar/confirmar',
        payload
      )
    );
  }

  obtenerPromptIA(): Promise<{ prompt: string }> {
    return firstValueFrom(this.http.get<{ prompt: string }>('/api/prompt'));
  }

  obtenerCopias(): Promise<{ copias: CopiaSeguridad[] }> {
    return firstValueFrom(this.http.get<{ copias: CopiaSeguridad[] }>('/api/copias'));
  }

  subirCopia(contenido: unknown): Promise<{ ok: boolean; panel: DatosPanel }> {
    return firstValueFrom(
      this.http.post<{ ok: boolean; panel: DatosPanel }>('/api/copia/subir', { contenido })
    );
  }

  recuperarCopia(archivo: string): Promise<{ ok: boolean; panel: DatosPanel }> {
    return firstValueFrom(
      this.http.post<{ ok: boolean; panel: DatosPanel }>('/api/copia/recuperar', { archivo })
    );
  }
}
