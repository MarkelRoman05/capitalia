import { HttpInterceptorFn } from '@angular/common/http';

export const csrfInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.url.startsWith('/api/') || req.url.startsWith('api/')) {
    const cloned = req.clone({
      withCredentials: true,
      setHeaders: {
        'X-Capitalia-CSRF': '1',
      },
    });
    return next(cloned);
  }
  return next(req);
};
