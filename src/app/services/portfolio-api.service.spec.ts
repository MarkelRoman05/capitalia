import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PortfolioApiService } from './portfolio-api.service';

describe('PortfolioApiService', () => {
  let api: PortfolioApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(PortfolioApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('obtiene el panel y la configuración de cartera', async () => {
    const pPanel = api.obtenerPanel();
    const reqPanel = httpMock.expectOne('/api/panel');
    expect(reqPanel.request.method).toBe('GET');
    reqPanel.flush({ ok: true, modo: 'propio', datos: null });
    await pPanel;

    const pCfg = api.obtenerCarteraConfig();
    const reqCfg = httpMock.expectOne('/api/cartera');
    expect(reqCfg.request.method).toBe('GET');
    reqCfg.flush({
      cartera: { titular: 'Test', productos: [], movimientos: [], valoraciones: [] },
      tipos: {},
      fuentes: [],
      tiposMovimiento: [],
      avisos: [],
    });
    const cfg = await pCfg;
    expect(cfg.cartera.titular).toBe('Test');
  });

  it('usa POST al crear producto y PUT al editarlo', async () => {
    const pCrear = api.guardarProducto({ nombre: 'MSCI World', tipo: 'fondo', fuente: 'manual' });
    const reqCrear = httpMock.expectOne('/api/productos');
    expect(reqCrear.request.method).toBe('POST');
    reqCrear.flush({ ok: true, panel: null });
    await pCrear;

    const pEdit = api.guardarProducto({ nombre: 'MSCI World Edit' }, 'world');
    const reqEdit = httpMock.expectOne('/api/productos/world');
    expect(reqEdit.request.method).toBe('PUT');
    reqEdit.flush({ ok: true, panel: null });
    await pEdit;
  });

  it('busca productos pasando filtro de tipo solo cuando no es todos', async () => {
    const p = api.buscarProductos('MSCI', 'fondo');
    const req = httpMock.expectOne('/api/buscar?q=MSCI&tipo=fondo');
    expect(req.request.method).toBe('GET');
    req.flush({ resultados: [] });
    const res = await p;
    expect(res.resultados).toEqual([]);
  });
});
