import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
process.env.OVERPASS_URL = 'http://test-overpass/api/interpreter';

// vi.hoisted garante mocks disponiveis ANTES do vi.mock (que e hoisted)
const mocks = vi.hoisted(() => ({
  consultar: vi.fn(),
  lerCache: vi.fn(),
  gravarCache: vi.fn(),
}));

vi.mock('@/lib/routing/overpass/client', () => ({
  consultarEnderecos: mocks.consultar,
}));
vi.mock('@/lib/routing/overpass/cache', () => ({
  lerCache: mocks.lerCache,
  gravarCache: mocks.gravarCache,
}));

const consultarMock = mocks.consultar;
const lerCacheMock = mocks.lerCache;
const gravarCacheMock = mocks.gravarCache;

import { validarNumero } from '@/lib/routing/overpass/validar';

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

const params = {
  numero: '5000',
  logradouro: 'Av do Contorno',
  cidade: 'Belo Horizonte',
  uf: 'MG',
  lat: -19.92,
  lng: -43.93,
};

describe('validarNumero — sem cache (consulta Overpass)', () => {
  it('confirmado: numero exato existe', async () => {
    lerCacheMock.mockResolvedValue(null);
    consultarMock.mockResolvedValue({
      ok: true,
      enderecos: Array.from({ length: 150 }, (_, i) => ({
        numero: 1000 + i * 50,
        lat: -19.92,
        lng: -43.93,
      })),
    });

    // Numero 5000 esta na lista (1000, 1050, ..., 5000, ..., 8450)
    const r = await validarNumero({ ...params, numero: '5000' });

    expect(r.status).toBe('confirmado');
    expect(r.coordenada).not.toBeNull();
    expect(r.dados.confianca).toBe('alta'); // 150 enderecos
    expect(r.cacheado).toBe(false);
    expect(gravarCacheMock).toHaveBeenCalled();
  });

  it('plausivel: dentro do range mas nao exato', async () => {
    lerCacheMock.mockResolvedValue(null);
    consultarMock.mockResolvedValue({
      ok: true,
      enderecos: Array.from({ length: 80 }, (_, i) => ({
        numero: 1000 + i * 100, // 1000, 1100, ..., 8900
        lat: -19.92,
        lng: -43.93,
      })),
    });

    // Numero 5050 esta NO range (1000-8900) mas nao exato
    const r = await validarNumero({ ...params, numero: '5050' });

    expect(r.status).toBe('plausivel');
    expect(r.dados.confianca).toBe('media'); // 80 enderecos
    expect(r.mensagem).toMatch(/dentro/);
  });

  it('suspeito: fora do range conhecido', async () => {
    lerCacheMock.mockResolvedValue(null);
    consultarMock.mockResolvedValue({
      ok: true,
      enderecos: Array.from({ length: 100 }, (_, i) => ({
        numero: 100 + i * 10, // 100 a 1090
        lat: -19.92,
        lng: -43.93,
      })),
    });

    // Numero 5000 esta MUITO fora (range 100-1090)
    const r = await validarNumero({ ...params, numero: '5000' });

    expect(r.status).toBe('suspeito');
    expect(r.mensagem).toContain('5000');
    expect(r.mensagem).toContain('1090');
  });

  it('sem_dados: poucos enderecos mapeados', async () => {
    lerCacheMock.mockResolvedValue(null);
    consultarMock.mockResolvedValue({
      ok: true,
      enderecos: [
        { numero: 100, lat: -19.92, lng: -43.93 },
        { numero: 200, lat: -19.92, lng: -43.93 },
      ],
    });

    const r = await validarNumero({ ...params, numero: '5000' });

    expect(r.status).toBe('sem_dados');
    expect(r.dados.confianca).toBe('baixa');
  });

  it('sem_dados: zero enderecos', async () => {
    lerCacheMock.mockResolvedValue(null);
    consultarMock.mockResolvedValue({ ok: true, enderecos: [] });

    const r = await validarNumero(params);

    expect(r.status).toBe('sem_dados');
    expect(r.dados.confianca).toBe('sem_dados');
  });
});

describe('validarNumero — cache hit', () => {
  it('usa dados do cache sem chamar Overpass', async () => {
    lerCacheMock.mockResolvedValue({
      dados: {
        quantidade: 100,
        min: 100,
        max: 8000,
        numeros: [100, 5000, 8000],
        confianca: 'alta',
      },
    });

    const r = await validarNumero({ ...params, numero: '5000' });

    expect(r.cacheado).toBe(true);
    expect(consultarMock).not.toHaveBeenCalled();
    // Como dados.numeros do cache nao inclui coord exata, status sera plausivel
    // (nao confirmado, mas dentro do range)
    expect(['plausivel', 'confirmado']).toContain(r.status);
  });
});

describe('validarNumero — fix: coord exata sobrevive ao cache + vence cobertura', () => {
  it('consulta fresca popula dados.coords (numero -> [lat,lng])', async () => {
    lerCacheMock.mockResolvedValue(null);
    consultarMock.mockResolvedValue({
      ok: true,
      enderecos: [
        { numero: 100, lat: -19.91, lng: -43.91 },
        { numero: 104, lat: -19.861, lng: -44.029 },
        { numero: 200, lat: -19.92, lng: -43.93 },
      ],
    });

    const r = await validarNumero({ ...params, numero: '104' });

    expect(r.dados.coords).toBeDefined();
    expect(r.dados.coords!['104']).toEqual([-19.861, -44.029]);
  });

  it('cache hit COM coords reconstroi confirmado + coordenada exata (antes se perdia)', async () => {
    lerCacheMock.mockResolvedValue({
      dados: {
        quantidade: 120,
        min: 100,
        max: 8000,
        numeros: [100, 5000, 8000],
        confianca: 'alta',
        coords: { '5000': [-19.8615, -44.0297] },
      },
    });

    const r = await validarNumero({ ...params, numero: '5000' });

    expect(r.cacheado).toBe(true);
    expect(consultarMock).not.toHaveBeenCalled();
    expect(r.status).toBe('confirmado');
    expect(r.coordenada).toEqual({ lat: -19.8615, lng: -44.0297 });
  });

  it('numero exato mapeado vence mesmo com cobertura baixa (<30)', async () => {
    lerCacheMock.mockResolvedValue(null);
    consultarMock.mockResolvedValue({
      ok: true,
      enderecos: [
        { numero: 104, lat: -19.861, lng: -44.029 },
        { numero: 200, lat: -19.92, lng: -43.93 },
      ],
    });

    // So 2 numeros (confianca 'baixa'), mas o 104 esta mapeado → confirmado.
    const r = await validarNumero({ ...params, numero: '104' });

    expect(r.status).toBe('confirmado');
    expect(r.coordenada).toEqual({ lat: -19.861, lng: -44.029 });
  });
});

describe('validarNumero — erros', () => {
  it('numero nao-numerico (SN) → sem_dados sem chamar Overpass', async () => {
    lerCacheMock.mockResolvedValue(null);

    const r = await validarNumero({ ...params, numero: 'SN' });

    expect(r.status).toBe('sem_dados');
    expect(consultarMock).not.toHaveBeenCalled();
  });

  it('Overpass falha (timeout) → sem_dados, NAO bloqueia', async () => {
    lerCacheMock.mockResolvedValue(null);
    consultarMock.mockResolvedValue({ ok: false, motivo: 'timeout' });

    const r = await validarNumero(params);

    expect(r.status).toBe('sem_dados');
    expect(r.mensagem).toMatch(/segue/i);
    expect(gravarCacheMock).not.toHaveBeenCalled();
  });
});
