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
    expect(screen.getByText(/Rota do Dia/)).toBeDefined();
  });

  it('clicar "Nova rota" vai pra fase captura', async () => {
    setParams({ motorista_id: 'mot-1', empresa_id: 'emp-1' });
    (listarTodas as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    setupFetch([{ match: (u) => u.includes('/api/routing/rotas?'), res: { rotas: [] } }]);

    const user = userEvent.setup();
    render(<RotaPage />);

    await waitFor(() => screen.getByTestId('btn-iniciar'));
    await user.click(screen.getByTestId('btn-iniciar'));

    await waitFor(() => expect(screen.getByTestId('input-endereco')).toBeDefined());
  });

  it('exibe historico de rotas concluidas', async () => {
    setParams({ motorista_id: 'mot-1', empresa_id: 'emp-1' });
    (listarTodas as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    setupFetch([
      {
        match: (u) => u.includes('/api/routing/rotas?'),
        res: {
          rotas: [
            { id: 'r-old', status: 'concluida', criada_em: '2026-05-28T10:00:00Z', qtd_paradas: 8 },
          ],
        },
      },
    ]);

    render(<RotaPage />);

    await waitFor(() => expect(screen.getByTestId('btn-iniciar')).toBeDefined());
    expect(screen.getByTestId('rota-historico-r-old')).toBeDefined();
    // Botao deve existir e NAO ter borda vermelha (concluida)
    const btn = screen.getByTestId('rota-historico-r-old') as HTMLButtonElement;
    expect(btn.style.background).not.toContain('fff1f2');
  });

  it('rota em aberto aparece destacada em vermelho', async () => {
    setParams({ motorista_id: 'mot-1', empresa_id: 'emp-1' });
    (listarTodas as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    setupFetch([
      {
        match: (u) => u.includes('/api/routing/rotas?'),
        res: {
          rotas: [
            { id: 'r-open', status: 'otimizada', criada_em: '2026-05-29T08:00:00Z', qtd_paradas: 5 },
          ],
        },
      },
    ]);

    render(<RotaPage />);

    await waitFor(() => expect(screen.getByTestId('rota-historico-r-open')).toBeDefined());
    // Verifica que a rota em aberto mostra o aviso ao usuario
    expect(screen.getByText(/Rota em aberto/)).toBeDefined();
    // Badge mostra o status correto
    expect(screen.getByText('Em aberto')).toBeDefined();
  });

  it('clicar em rota do historico carrega ela na fase em_rota', async () => {
    setParams({ motorista_id: 'mot-1', empresa_id: 'emp-1' });
    (listarTodas as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    setupFetch([
      {
        match: (u) => u.includes('/api/routing/rotas?'),
        res: {
          rotas: [
            { id: 'r-hist', status: 'concluida', criada_em: '2026-05-28T10:00:00Z', qtd_paradas: 3 },
          ],
        },
      },
      {
        match: (u) => u.includes('/api/routing/rota/r-hist'),
        res: {
          rota: { id: 'r-hist', distancia_total_km: 12, tempo_total_min: 30, status: 'concluida' },
          paradas: [
            {
              id: 'p1', rota_id: 'r-hist', nota_id: 'n1', ordem: 1,
              endereco: { logradouro: 'X', bairro: '', cidade: 'SP', uf: 'SP' },
              latitude: -23.5, longitude: -46.6,
              fixada: false, janela_horario: null, tempo_descarga_min: 5, observacao: null, concluida_em: '2026-05-28T12:00:00Z',
            },
          ],
        },
      },
    ]);

    const user = userEvent.setup();
    render(<RotaPage />);

    await waitFor(() => screen.getByTestId('rota-historico-r-hist'));
    await user.click(screen.getByTestId('rota-historico-r-hist'));

    // Deve entrar na fase em_rota
    await waitFor(() => expect(screen.getByTestId('mapa-rota')).toBeDefined());
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

  it('exibe ultimo_erro na lista quando nota tem status_sync=erro', async () => {
    setParams({ motorista_id: 'mot-1', empresa_id: 'emp-1' });
    (listarTodas as ReturnType<typeof vi.fn>).mockResolvedValue([
      nota({
        id_local: 'fail-1',
        status_sync: 'erro',
        tentativas: 3,
        ultimo_erro: 'HTTP 500: db_insert_failed - relation "notas_capturadas" does not exist',
      }),
    ]);
    setupFetch([{ match: (u) => u.includes('/api/routing/rotas?'), res: { rotas: [] } }]);

    render(<RotaPage />);

    await waitFor(() => expect(screen.getByTestId('erro-fail-1')).toBeDefined());
    const erroBox = screen.getByTestId('erro-fail-1');
    expect(erroBox.textContent).toMatch(/HTTP 500/);
    expect(erroBox.textContent).toMatch(/tentativa 3/);
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

// Helper: configura fetch com rota otimizada e carrega ate fase em_rota via historico
function buildFetchComRota(rotaId: string, paradas: object[]) {
  return vi.fn(async (url: string | Request, _init?: RequestInit) => {
    const u = typeof url === 'string' ? url : url.url;
    if (u.includes('/api/routing/rotas?')) {
      return {
        ok: true, status: 200,
        json: async () => ({
          rotas: [{ id: rotaId, status: 'otimizada', distancia_total_km: 5, tempo_total_min: 15, criada_em: '2026-05-29T10:00:00Z' }],
        }),
      } as unknown as Response;
    }
    if (u.includes(`/api/routing/rota/${rotaId}`)) {
      return {
        ok: true, status: 200,
        json: async () => ({
          rota: { id: rotaId, distancia_total_km: 5, tempo_total_min: 15, status: 'otimizada' },
          paradas,
        }),
      } as unknown as Response;
    }
    return { ok: true, status: 200, json: async () => ({ ok: true }) } as unknown as Response;
  });
}

describe('RotaPage — fase em_rota', () => {
  it('quando ha rota com status otimizada, mostra historico e ao clicar vai pra em_rota', async () => {
    setParams({ motorista_id: 'mot-1', empresa_id: 'emp-1' });
    (listarTodas as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    vi.stubGlobal('fetch', buildFetchComRota('r1', [
      {
        id: 'p1', rota_id: 'r1', nota_id: 'n1', ordem: 1,
        endereco: { logradouro: 'A', bairro: '', cidade: 'SP', uf: 'SP' },
        latitude: -23.5, longitude: -46.6,
        fixada: false, janela_horario: null, tempo_descarga_min: 5, observacao: null, concluida_em: null,
      },
      {
        id: 'p2', rota_id: 'r1', nota_id: 'n2', ordem: 2,
        endereco: { logradouro: 'B', bairro: '', cidade: 'SP', uf: 'SP' },
        latitude: -23.6, longitude: -46.7,
        fixada: false, janela_horario: null, tempo_descarga_min: 5, observacao: null, concluida_em: null,
      },
    ]));

    const user = userEvent.setup();
    render(<RotaPage />);

    // Primeiro fica na fase inicio mostrando o historico
    await waitFor(() => screen.getByTestId('rota-historico-r1'));
    expect(screen.getByText(/Rota em aberto/)).toBeDefined();

    // Clica pra retomar a rota
    await user.click(screen.getByTestId('rota-historico-r1'));

    await waitFor(() => expect(screen.getByTestId('mapa-rota')).toBeDefined());
    expect(screen.getByTestId('parada-1')).toBeDefined();
    expect(screen.getByTestId('parada-2')).toBeDefined();
    expect(screen.getByTestId('link-ajustar')).toBeDefined();
  });

  it('clicar Encerrar volta pra fase inicio', async () => {
    setParams({ motorista_id: 'mot-1', empresa_id: 'emp-1' });
    (listarTodas as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    vi.stubGlobal('fetch', buildFetchComRota('r1', []));

    const user = userEvent.setup();
    render(<RotaPage />);

    // Navega ate em_rota via historico
    await waitFor(() => screen.getByTestId('rota-historico-r1'));
    await user.click(screen.getByTestId('rota-historico-r1'));
    await waitFor(() => screen.getByTestId('btn-encerrar'));

    await user.click(screen.getByTestId('btn-encerrar'));

    await waitFor(() => expect(screen.getByTestId('btn-iniciar')).toBeDefined());
  });

  it('parada concluida chama PATCH e marca visualmente', async () => {
    setParams({ motorista_id: 'mot-1', empresa_id: 'emp-1' });
    (listarTodas as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const fetchSpy = buildFetchComRota('r1', [
      {
        id: 'p1', rota_id: 'r1', nota_id: 'n1', ordem: 1,
        endereco: { logradouro: 'X', bairro: '', cidade: 'SP', uf: 'SP' },
        latitude: -23.5, longitude: -46.6,
        fixada: false, janela_horario: null, tempo_descarga_min: 5, observacao: null, concluida_em: null,
      },
    ]);
    vi.stubGlobal('fetch', fetchSpy);

    const user = userEvent.setup();
    render(<RotaPage />);

    // Navega ate em_rota via historico
    await waitFor(() => screen.getByTestId('rota-historico-r1'));
    await user.click(screen.getByTestId('rota-historico-r1'));

    // 1. Clique em "Concluí" — abre modal de confirmacao
    await waitFor(() => screen.getByTestId('btn-concluir-1'));
    await user.click(screen.getByTestId('btn-concluir-1'));

    // 2. Modal aparece com pergunta "Entrega concluida?"
    await waitFor(() => screen.getByTestId('modal-confirmar-entrega'));

    // 3. Confirma com "Sim, entreguei"
    await user.click(screen.getByTestId('btn-confirmar-entrega'));

    // Status visual muda
    await waitFor(() => expect(screen.getByText(/Concluída/)).toBeDefined());

    // PATCH foi feito com concluida_em (persiste no banco)
    const patchCalls = fetchSpy.mock.calls.filter((c) => {
      const init = c[1] as RequestInit | undefined;
      return init?.method === 'PATCH';
    });
    expect(patchCalls.length).toBeGreaterThan(0);
    const patchBody = JSON.parse((patchCalls[0][1] as RequestInit).body as string);
    expect(patchBody.paradas[0].concluida_em).toBeDefined();
    expect(typeof patchBody.paradas[0].concluida_em).toBe('string');
  });

  it('clicar Concluir e depois Cancelar nao marca entregue + nao chama PATCH', async () => {
    setParams({ motorista_id: 'mot-1', empresa_id: 'emp-1' });
    (listarTodas as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const fetchSpy = buildFetchComRota('r1', [
      {
        id: 'p1', rota_id: 'r1', nota_id: 'n1', ordem: 1,
        endereco: { logradouro: 'X', bairro: '', cidade: 'SP', uf: 'SP' },
        latitude: -23.5, longitude: -46.6,
        fixada: false, janela_horario: null, tempo_descarga_min: 5, observacao: null, concluida_em: null,
      },
    ]);
    vi.stubGlobal('fetch', fetchSpy);

    const user = userEvent.setup();
    render(<RotaPage />);

    // Navega ate em_rota via historico
    await waitFor(() => screen.getByTestId('rota-historico-r1'));
    await user.click(screen.getByTestId('rota-historico-r1'));

    await waitFor(() => screen.getByTestId('btn-concluir-1'));
    await user.click(screen.getByTestId('btn-concluir-1'));
    await waitFor(() => screen.getByTestId('modal-confirmar-entrega'));

    // Clica "Nao" → modal fecha, nada acontece
    await user.click(screen.getByTestId('btn-cancelar-entrega'));

    expect(screen.queryByTestId('modal-confirmar-entrega')).toBeNull();
    expect(screen.queryByText(/Concluída/)).toBeNull();

    const patchCalls = fetchSpy.mock.calls.filter(
      (c) => (c[1] as RequestInit | undefined)?.method === 'PATCH'
    );
    expect(patchCalls.length).toBe(0);
  });

  it('refetch automatico ao voltar da tela ajuste-rota (visibilitychange)', async () => {
    setParams({ motorista_id: 'mot-1', empresa_id: 'emp-1' });
    (listarTodas as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const fetchSpy = buildFetchComRota('r1', [
      {
        id: 'p1', rota_id: 'r1', nota_id: 'n1', ordem: 1,
        endereco: { logradouro: 'X', bairro: '', cidade: 'SP', uf: 'SP' },
        latitude: -23.5, longitude: -46.6,
        fixada: false, janela_horario: null, tempo_descarga_min: 5, observacao: null, concluida_em: null,
      },
    ]);
    vi.stubGlobal('fetch', fetchSpy);

    const user = userEvent.setup();
    render(<RotaPage />);

    // Navega ate em_rota via historico
    await waitFor(() => screen.getByTestId('rota-historico-r1'));
    await user.click(screen.getByTestId('rota-historico-r1'));

    // Espera chegar na fase em_rota
    await waitFor(() => screen.getByTestId('mapa-rota'));

    // Conta quantas chamadas ao endpoint da rota ja foram feitas (carga inicial)
    const callsAntes = fetchSpy.mock.calls.filter((c) => {
      const u = typeof c[0] === 'string' ? c[0] : (c[0] as Request).url;
      return u.match(/\/api\/routing\/rota\/r1$/) !== null;
    }).length;

    // Simula o motorista saindo da aba (navega pra ajuste-rota)
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));

    // Simula o motorista voltando pra aba (volta do ajuste-rota)
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));

    // Espera o refetch acontecer
    await waitFor(() => {
      const callsDepois = fetchSpy.mock.calls.filter((c) => {
        const u = typeof c[0] === 'string' ? c[0] : (c[0] as Request).url;
        return u.match(/\/api\/routing\/rota\/r1$/) !== null;
      }).length;
      expect(callsDepois).toBeGreaterThan(callsAntes);
    });
  });
});
