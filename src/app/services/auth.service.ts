import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { RespuestaAuthYo, Usuario } from '../models/portfolio.model';

export interface RespuestaAuthAccion {
  ok: boolean;
  usuario: Usuario;
  error?: string;
  errores?: string[];
}

export interface RespuestaMensajeAuth {
  ok: boolean;
  mensaje?: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

  readonly cargandoInicial = signal<boolean>(true);
  readonly autenticado = signal<boolean>(false);
  readonly modoAuth = signal<'local' | 'nube'>('nube');
  readonly usuario = signal<Usuario | null>(null);

  consultarSesion(): Promise<RespuestaAuthYo> {
    return firstValueFrom(this.http.get<RespuestaAuthYo>('/api/auth/yo'));
  }

  login(email: string, clave: string): Promise<RespuestaAuthAccion> {
    return firstValueFrom(
      this.http.post<RespuestaAuthAccion>('/api/auth/login', { email, clave })
    );
  }

  registro(nombre: string, email: string, clave: string): Promise<RespuestaAuthAccion> {
    return firstValueFrom(
      this.http.post<RespuestaAuthAccion>('/api/auth/registro', { nombre, email, clave })
    );
  }

  actualizarPerfil(datos: {
    nombre?: string;
    email?: string;
    passwordActual?: string;
    passwordNueva?: string;
  }): Promise<RespuestaAuthAccion> {
    return firstValueFrom(this.http.post<RespuestaAuthAccion>('/api/auth/perfil', datos));
  }

  solicitarRecuperacion(email: string): Promise<RespuestaMensajeAuth> {
    return firstValueFrom(
      this.http.post<RespuestaMensajeAuth>('/api/auth/recuperar', { email })
    );
  }

  restablecerContrasena(token: string, clave: string): Promise<RespuestaMensajeAuth> {
    return firstValueFrom(
      this.http.post<RespuestaMensajeAuth>('/api/auth/restablecer', { token, clave })
    );
  }

  async logout(): Promise<void> {
    try {
      await firstValueFrom(this.http.post('/api/auth/logout', {}));
    } catch {
      // ignore network errors on logout
    } finally {
      this.limpiarEstado();
    }
  }

  establecerSesion(usuario: Usuario | null, autenticado: boolean, modo?: 'local' | 'nube'): void {
    if (modo) this.modoAuth.set(modo);
    this.autenticado.set(autenticado);
    this.usuario.set(usuario);
  }

  limpiarEstado(): void {
    this.autenticado.set(false);
    this.usuario.set(null);
  }
}
