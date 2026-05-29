/**
 * Testes da page unificada de Roteirização /mobile/rota.
 * State machine: carregando → inicio | captura | em_rota.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ─── MOCKS ──────────────────────────────────────────────────────────────

const searchParamsMock = vi.fn();
vi.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: searchParamsMock }),
}));

vi.mock('@/lib/offline/fila', () => ({
  adicionarNota: vi.fn().mockResolvedValue(undefined),
  listarTodas: vi.fn().mockResolvedValue([]),
  contarPorStatus: vi.fn().mockResolvedValue({ pendente: 0, sincronizada: 0, erro: 0 }),
}));

vi.mock('@/lib/offline/sync', () => ({
  iniciarSyncWorker: vi.fn(() => vi.fn()),
  sincronizarFila: vi.fn().mockResolvedValue({ tentadas: 0, sucesso: 0, erro: 0, pulados: 0 }),
}));

vi.mock('@/lib/offline/onlineDetector', () => ({
  iniciarOnlineDetector: vi.fn(() => vi.fn()),
  estaOnline: vi.fn(() => true),
}));

vi.mock('@/components/MapaRota', () => ({
  MapaRota: () => <div data-testid="mapa-rota" />,
}));

vi.mock('@/components/mobile/InputEnderecoNF', () => ({
  InputEnderecoNF: (props: {
    onConfirmar: (n: {
      cep: string;
      numero: string;
      endereco: { logradouro: string; bairro: string; cidade: string; uf: string };
    }) => void | Promise<void>;
  }) => (
    <div data-testid="input-endereco">
      <button
        type="button"
        onClick={() =>
          props.onConfirmar({
            cep: '01310100',
            numero: '1',
            endereco: { logradouro: 'X', bairro: '', cidade: 'SP', uf: 'SP' },
          })
        }
      >
        capturar-mock
      </button>
    </div>
  ),
}));

import RotaPage from '@/app/mobile/rota/page';
import { listarTodas, adicionarNota } from '@/lib/offline/fila';
import type { NotaNaFila } from '@/lib/offline/types';

// ─── HELPERS ────────────────────────────────────────────────────────────

function setParams(p: Record<string, string | null>) {
  searchParamsMock.mockImplementation((k: string) => p[k] ?? null);
}

function nota(over: Partial<NotaNaFila> = {}): NotaNaFila {
  return {
    id_local: 'l-' + Math.random().toString(36).slice(2, 8),
    motorista_id: 'mot-1',
    empresa_id: 'emp-1',
    cep: '01310100',
    numero: '1',
    endereco: { logradouro: 'X', bairro: '', cidade: 'SP', uf: 'SP' },
    latitude: null,
    longitude: null,
    observacao: null,
    status: 'capturada',
    capturado_em: new Date().toISOString(),
    status_sync: 'pendente',
    tentativas: 0,
    ...over,
  };
}

// Mock global fetch (cada teste sobrescreve conforme cenário)
function setupFetch(handlers: Array<{ match: (url: string) => boolean; res: Response | object }>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | Request) => {
      const u = typeof url === 'string' ? url : url.url;
      for (const h of handlers) {
        if (h.match(u)) {
          if (h.res instanceof Response) return h.res;
          return { ok: true, status: 200, json: async () => h.res } as unknown as Response;
        }
      }
      return { ok: true, status: 200, json: async () => ({}) } as unknown as Response;
    })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID !== 'function') {
    Object.defineProperty(crypto, 'randomUUID', {
      value: () => 'uuid-' + Math.random().toString(36).slice(2, 14),
      configurable: true,
    });
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ─── TESTES ─────────────────────────────────────────────────────────────

describe('RotaPage — params', () => {
  it('erro quando params faltam', () => {
    setParams({});
    render(<RotaPage />);
    expect(screen.getByRole('alert').textContent).toMatch(/Parametros faltando/);
  });
});

describe('RotaPage — fase inicio', () => {
  it('quando nao ha rota em andamento nem notas, mostra tela de inicio', async () => {
    setParams({ motorista_id: 'mot-1', empresa_id: 'emp-1' });
    (listarTodas as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    setupFetch([{ match: (u) => u.includes('/api/routing/rotas?'), res: { rotas: [] } }]);

    render(<RotaPage />);

    await waitFor(() => expect(screen.getByTestId('btn-iniciar')).toBeDefined());
    expect(screen.getByText(/Pronto pra rodar/)).toBeDefined();
  });

  it('clicar "Começar nova rota" vai pra fase captura', async () => {
    setParams({ motorista_id: 'mot-1', empresa_id: 'emp-1' });
    (listarTodas as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    setupFetch([{ match: (u) => u.includes('/api/routing/rotas?'), res: { rotas: [] } }]);

    const user = userEvent.setup();
    render(<RotaPage />);

    await waitFor(() => screen.getByTestId('btn-iniciar'));
    await user.click(screen.getByTestId('btn-iniciar'));

    await waitFor(() => expect(screen.getByTestId('input-endereco')).toBeDefined());
  });
});

describe('RotaPage — fase captura', () => {
  it('quando ha notas pendentes na fila, abre direto na fase captura', async () => {
    setParams({ motorista_id: 'mot-1', empresa_id: 'emp-1' });
    (listarTodas as ReturnType<typeof vi.fn>).mockResolvedValue([nota({ id_local: 'a' })]);
    setupFetch([{ match: (u) => u.includes('/api/routing/rotas?'), res: { rotas: [] } }]);

    render(<RotaPage />);

    await waitFor(() => expect(screen.getByTestId('input-endereco')).toBeDefined());
    expect(screen.getByTestId('btn-otimizar')).toBeDefined();
  });

  it('botao Otimizar desabilitado quando nao ha capturas', async () => {
    setParams({ motorista_id: 'mot-1', empresa_id: 'emp-1' });
    (listarTodas as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    setupFetch([{ match: (u) => u.includes('/api/routing/rotas?'), res: { rotas: [] } }]);

    const user = userEvent.setup();
    render(<RotaPage />);

    await waitFor(() => screen.getByTestId('btn-iniciar'));
    await user.click(screen.getByTestId('btn-iniciar'));

    await waitFor(() => screen.getByTestId('btn-otimizar'));
    const btn = screen.getByTestId('btn-otimizar') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('capturar nota chama adicionarNota', async () => {
    setParams({ motorista_id: 'mot-1', empresa_id: 'emp-1' });
    (listarTodas as ReturnType<typeof vi.fn>).mockResolvedValue([nota({ id_local: 'a' })]);
    setupFetch([{ match: (u) => u.includes('/api/routing/rotas?'), res: { rotas: [] } }]);

    const user = userEvent.setup();
    render(<RotaPage />);

    await waitFor(() => screen.getByTestId('input-endereco'));
    await user.click(screen.getByRole('button', { name: /capturar-mock/ }));

    await waitFor(() => expect(adicionarNota).toHaveBeenCalled());
    const novaNota = (adicionarNota as ReturnType<typeof vi.fn>).mock.calls[0][0] as NotaNaFila;
    expect(novaNota.motorista_id).toBe('mot-1');
    expect(novaNota.cep).toBe('01310100');
  });
});

describe('RotaPage — fase em_rota', () => {
  it('quando ha rota com status otimizada, abre direto na fase em_rota com mapa', async () => {
    setParams({ motorista_id: 'mot-1', empresa_id: 'emp-1' });
    (listarTodas as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    setupFetch([
      {
        match: (u) => u.includes('/api/routing/rotas?'),
        res: {
          rotas: [
            {
              id: 'r1',
              motorista_id: 'mot-1',
              empresa_id: 'emp-1',
              status: 'otimizada',
              distancia_total_km: 25,
              tempo_total_min: 60,
            },
          ],
        },
      },
      {
        match: (u) => u.match(/\/api\/routing\/rota\/r1$/) !== null,
        res: {
          rota: {
            id: 'r1',
            motorista_id: 'mot-1',
            empresa_id: 'emp-1',
            data: '2026-05-29',
            distancia_total_km: 25,
            tempo_total_min: 60,
            status: 'otimizada',
            otimizada_em: '2026-05-29T12:00:00Z',
            criada_em: '2026-05-29T11:50:00Z',
          },
          paradas: [
            {
              id: 'p1',
              rota_id: 'r1',
              nota_id: 'n1',
              ordem: 1,
              endereco: { logradouro: 'A', bairro: '', cidade: 'SP', uf: 'SP' },
              latitude: -23.5,
              longitude: -46.6,
              fixada: false,
              janela_horario: null,
              tempo_descarga_min: 5,
              observacao: null,
              concluida_em: null,
            },
            {
              id: 'p2',
              rota_id: 'r1',
              nota_id: 'n2',
              ordem: 2,
              endereco: { logradouro: 'B', bairro: '', cidade: 'SP', uf: 'SP' },
              latitude: -23.6,
              longitude: -46.7,
              fixada: false,
              janela_horario: null,
              tempo_descarga_min: 5,
              observacao: null,
              concluida_em: null,
            },
          ],
        },
      },
    ]);

    render(<RotaPage />);

    await waitFor(() => expect(screen.getByTestId('mapa-rota')).toBeDefined());
    expect(screen.getByTestId('parada-1')).toBeDefined();
    expect(screen.getByTestId('parada-2')).toBeDefined();
    expect(screen.getByText(/25.0 km/)).toBeDefined();
    expect(screen.getByTestId('link-ajustar')).toBeDefined();
  });

  it('clicar Encerrar volta pra fase inicio', async () => {
    setParams({ motorista_id: 'mot-1', empresa_id: 'emp-1' });
    (listarTodas as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    setupFetch([
      {
        match: (u) => u.includes('/api/routing/rotas?'),
        res: { rotas: [{ id: 'r1', status: 'otimizada', distancia_total_km: 10, tempo_total_min: 20 }] },
      },
      {
        match: (u) => u.match(/\/api\/routing\/rota\/r1$/) !== null,
        res: {
          rota: { id: 'r1', distancia_total_km: 10, tempo_total_min: 20, status: 'otimizada' },
          paradas: [],
        },
      },
    ]);

    const user = userEvent.setup();
    render(<RotaPage />);

    await waitFor(() => screen.getByTestId('btn-encerrar'));
    await user.click(screen.getByTestId('btn-encerrar'));

    await waitFor(() => expect(screen.getByTestId('btn-iniciar')).toBeDefined());
  });

  it('parada concluida chama PATCH e marca visualmente', async () => {
    setParams({ motorista_id: 'mot-1', empresa_id: 'emp-1' });
    (listarTodas as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const fetchSpy = vi.fn(async (url: string | Request, _init?: RequestInit) => {
      const u = typeof url === 'string' ? url : url.url;
      if (u.includes('/api/routing/rotas?')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ rotas: [{ id: 'r1', status: 'otimizada', distancia_total_km: 5, tempo_total_min: 15 }] }),
        } as unknown as Response;
      }
      if (u.match(/\/api\/routing\/rota\/r1$/) !== null) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            rota: { id: 'r1', distancia_total_km: 5, tempo_total_min: 15, status: 'otimizada' },
            paradas: [
              {
                id: 'p1',
                rota_id: 'r1',
                nota_id: 'n1',
                ordem: 1,
                endereco: { logradouro: 'X', bairro: '', cidade: 'SP', uf: 'SP' },
                latitude: -23.5,
                longitude: -46.6,
                fixada: false,
                janela_horario: null,
                tempo_descarga_min: 5,
                observacao: null,
                concluida_em: null,
              },
            ],
          }),
        } as unknown as Response;
      }
      // PATCH paradas
      return { ok: true, status: 200, json: async () => ({ ok: true }) } as unknown as Response;
    });
    vi.stubGlobal('fetch', fetchSpy);

    const user = userEvent.setup();
    render(<RotaPage />);

    await waitFor(() => screen.getByTestId('btn-concluir-1'));
    await user.click(screen.getByTestId('btn-concluir-1'));

    // Status visual muda
    await waitFor(() => expect(screen.getByText(/Concluída/)).toBeDefined());

    // PATCH foi feito
    const patchCalls = fetchSpy.mock.calls.filter((c) => {
      const init = c[1] as RequestInit | undefined;
      return init?.method === 'PATCH';
    });
    expect(patchCalls.length).toBeGreaterThan(0);
  });
});
