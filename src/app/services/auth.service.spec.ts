import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('consulta la sesión actual en /api/auth/yo', async () => {
    const p = service.consultarSesion();
    const req = httpMock.expectOne('/api/auth/yo');
    expect(req.request.method).toBe('GET');
    req.flush({
      autenticado: true,
      modo: 'nube',
      usuario: { id: 1, email: 'ana@ejemplo.com', nombre: 'Ana' },
    });
    const resp = await p;
    expect(resp.autenticado).toBe(true);
    expect(resp.usuario?.email).toBe('ana@ejemplo.com');
  });

  it('envía login y limpia estado en logout', async () => {
    const pLogin = service.login('ana@ejemplo.com', 'clave-segura-123');
    const reqLogin = httpMock.expectOne('/api/auth/login');
    expect(reqLogin.request.method).toBe('POST');
    reqLogin.flush({
      ok: true,
      usuario: { id: 1, email: 'ana@ejemplo.com', nombre: 'Ana' },
    });
    const res = await pLogin;
    service.establecerSesion(res.usuario, true, 'nube');
    expect(service.autenticado()).toBe(true);
    expect(service.usuario()?.nombre).toBe('Ana');

    const pLogout = service.logout();
    const reqLogout = httpMock.expectOne('/api/auth/logout');
    expect(reqLogout.request.method).toBe('POST');
    reqLogout.flush({ ok: true });
    await pLogout;

    expect(service.autenticado()).toBe(false);
    expect(service.usuario()).toBeNull();
  });

  it('solicita recuperación de contraseña en /api/auth/recuperar', async () => {
    const p = service.solicitarRecuperacion('ana@ejemplo.com');
    const req = httpMock.expectOne('/api/auth/recuperar');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ email: 'ana@ejemplo.com' });
    req.flush({ ok: true, mensaje: 'Enviado' });
    const res = await p;
    expect(res.ok).toBe(true);
  });
});
