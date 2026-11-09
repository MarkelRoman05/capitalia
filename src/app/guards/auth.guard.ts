import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { PortfolioStoreService } from '../services/portfolio-store.service';

export const authGuard: CanActivateFn = async () => {
  const store = inject(PortfolioStoreService);
  const router = inject(Router);

  await store.inicializarApp();

  if (store.autenticado()) {
    return true;
  }
  return router.createUrlTree(['/login']);
};

export const guestGuard: CanActivateFn = async () => {
  const store = inject(PortfolioStoreService);
  const router = inject(Router);

  await store.inicializarApp();

  if (!store.autenticado()) {
    return true;
  }
  return router.createUrlTree(['/patrimonio']);
};
