import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './guards/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    title: 'Acceder · Capitalia',
    canActivate: [guestGuard],
    loadComponent: () => import('./components/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'registro',
    title: 'Crear cuenta · Capitalia',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./components/registro/registro.component').then((m) => m.RegistroComponent),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./components/shell/shell.component').then((m) => m.ShellComponent),
    children: [
      {
        path: 'patrimonio',
        title: 'Patrimonio · Capitalia',
        loadComponent: () =>
          import('./components/patrimonio-tab/patrimonio-tab.component').then(
            (m) => m.PatrimonioTabComponent,
          ),
      },
      {
        path: 'mes',
        title: 'Este mes · Capitalia',
        loadComponent: () =>
          import('./components/mes-tab/mes-tab.component').then((m) => m.MesTabComponent),
      },
      {
        path: 'productos',
        title: 'Productos · Capitalia',
        loadComponent: () =>
          import('./components/productos-tab/productos-tab.component').then(
            (m) => m.ProductosTabComponent,
          ),
      },
      {
        path: 'rendimiento',
        title: 'Rendimiento · Capitalia',
        loadComponent: () =>
          import('./components/rendimiento-tab/rendimiento-tab.component').then(
            (m) => m.RendimientoTabComponent,
          ),
      },
      {
        path: 'datos',
        title: 'Mis datos · Capitalia',
        loadComponent: () =>
          import('./components/datos-tab/datos-tab.component').then((m) => m.DatosTabComponent),
      },
      {
        path: 'ayuda',
        title: 'Ayuda · Capitalia',
        loadComponent: () =>
          import('./components/ayuda-tab/ayuda-tab.component').then((m) => m.AyudaTabComponent),
      },
      { path: '', pathMatch: 'full', redirectTo: 'patrimonio' },
    ],
  },
  { path: '**', redirectTo: '' },
];
