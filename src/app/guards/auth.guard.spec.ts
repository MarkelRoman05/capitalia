import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, UrlTree } from '@angular/router';
import { authGuard, guestGuard } from './auth.guard';
import { PortfolioStoreService } from '../services/portfolio-store.service';

describe('auth guards', () => {
  const store = {
    autenticado: signal(false),
    inicializarApp: () => Promise.resolve(),
  };

  beforeEach(() => {
    store.autenticado.set(false);
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: PortfolioStoreService, useValue: store }],
    });
  });

  const ejecutar = (guard: typeof authGuard) =>
    TestBed.runInInjectionContext(() => guard(null as never, null as never));

  it('authGuard manda a login sin sesión', async () => {
    const result = await ejecutar(authGuard);
    expect(result).toBeInstanceOf(UrlTree);
  });

  it('authGuard permite el acceso con sesión', async () => {
    store.autenticado.set(true);
    await expect(ejecutar(authGuard)).resolves.toBe(true);
  });

  it('guestGuard manda al panel con sesión', async () => {
    store.autenticado.set(true);
    expect(await ejecutar(guestGuard)).toBeInstanceOf(UrlTree);
  });

  it('guestGuard permite login y registro sin sesión', async () => {
    await expect(ejecutar(guestGuard)).resolves.toBe(true);
  });
});
