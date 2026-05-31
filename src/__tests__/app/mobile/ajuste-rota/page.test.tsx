/**
 * Testes da page Ajuste de Rota — mocka next/navigation, fetch, MapaRota,
 * @dnd-kit (drag e drop nao testado interativamente — testa side effects).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ─── MOCKS ──────────────────────────────────────────────────────────

const searchParamsMock = vi.fn();
vi.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: searchParamsMock }),
}));

vi.mock('@/components/MapaRota', () => ({
  MapaRota: (props: { paradas: unknown[] }) => (
    <div data-testid="mapa-mock" data-paradas={Array.isArray(props.paradas) ? props.paradas.length : 0}>
      mapa
    </div>
  ),
}));

// Mock @dnd-kit/core e /sortable pra desabilitar drag (testar layout sem interacao)
vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  closestCenter: vi.fn(),
  PointerSensor: vi.fn(),
  TouchSensor: vi.fn(),
  useSensor: vi.fn(),
  useSensors: vi.fn(),
}));

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  arrayMove: <T,>(arr: T[], from: number, to: number) => {
    const r = [...arr];
    const [m] = r.splice(from, 1);
    r.splice(to, 0, m);
    return r;
  },
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: null,
    isDragging: false,
  }),
  verticalListSortingStrategy: vi.fn(),
}));

vi.mock('@dnd-kit/utilities', () => ({
  CSS: { Transform: { toString: () => '' } },
}));

import AjusteRotaPage from '@/app/mobile/ajuste-rota/page';

// ─── HELPERS ────────────────────────────────────────────────────────

function setSearchParams(params: Record<string, string | null>) {
  searchParamsMock.mockImplementation((key: string) => params[key] ?? null);
}

function paradaSeed(over: Record<string, unknown> = {}) {
  return {
    id: 'p-default',
    rota_id: 'rota-1',
    nota_id: 'nota-x',
    ordem: 1,
    endereco: { logradouro: 'Av X', bairro: 'B', cidade: 'SP', uf: 'SP' },
    latitude: -23.5,
    longitude: -46.6,
    fixada: false,
    janela_horario: null,
    tempo_descarga_min: 5,
    observacao: null,
    concluida_em: null,
    ...over,
  };
}

function mockGetRotaOk(paradas: ReturnType<typeof paradaSeed>[]) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      rota: { id: 'rota-1', motorista_id: 'm1', empresa_id: 'e1', distancia_total_km: 15, tempo_total_min: 30 },
      paradas,
    }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('AjusteRotaPage — params', () => {
  it('mostra erro quando rota_id falta', () => {
    setSearchParams({ rota_id: null });
    render(<AjusteRotaPage />);
    expect(screen.getByRole('alert').textContent).toMatch(/rota_id/);
  });
});

describe('AjusteRotaPage — carregamento', () => {
  it('mostra "Carregando rota" enquanto fetch nao volta', () => {
    setSearchParams({ rota_id: 'r1' });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockReturnValue(new Promise(() => {})) // nunca resolve
    );

    render(<AjusteRotaPage />);
    expect(screen.getByText(/Carregando rota/)).toBeDefined();
  });

  it('mostra erro quando fetch falha', async () => {
    setSearchParams({ rota_id: 'r1' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    render(<AjusteRotaPage />);

    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/HTTP 500/));
  });
});

describe('AjusteRotaPage — render com paradas', () => {
  it('renderiza header com info da rota + mapa + tabs', async () => {
    setSearchParams({ rota_id: 'r1' });
    vi.stubGlobal('fetch', mockGetRotaOk([paradaSeed({ id: 'p1' }), paradaSeed({ id: 'p2', ordem: 2 })]));

    render(<AjusteRotaPage />);

    await waitFor(() => expect(screen.getByText(/Ajuste de Rota/)).toBeDefined());
    expect(screen.getByText(/2 paradas/)).toBeDefined();
    expect(screen.getByText(/15.0 km/)).toBeDefined();
    expect(screen.getByText(/30 min/)).toBeDefined();
    expect(screen.getByTestId('mapa-mock')).toBeDefined();
    expect(screen.getByRole('tab', { name: /Ordenar/ })).toBeDefined();
    expect(screen.getByRole('tab', { name: /Detalhes/ })).toBeDefined();
  });

  it('aba padrao = ordenar; clicar Detalhes troca de aba', async () => {
    setSearchParams({ rota_id: 'r1' });
    vi.stubGlobal('fetch', mockGetRotaOk([paradaSeed({ id: 'p1' })]));

    const user = userEvent.setup();
    render(<AjusteRotaPage />);

    await waitFor(() => screen.getByText(/Ajuste de Rota/));

    // Default
    expect(screen.getByRole('tab', { name: /Ordenar/ }).getAttribute('aria-selected')).toBe('true');

    await user.click(screen.getByRole('tab', { name: /Detalhes/ }));
    expect(screen.getByRole('tab', { name: /Detalhes/ }).getAttribute('aria-selected')).toBe('true');
  });

  it('botao Salvar desabilitado quando nao tem mudancas', async () => {
    setSearchParams({ rota_id: 'r1' });
    vi.stubGlobal('fetch', mockGetRotaOk([paradaSeed()]));

    render(<AjusteRotaPage />);

    await waitFor(() => screen.getByText(/Ajuste de Rota/));

    const btn = screen.getByRole('button', { name: /Sem mudancas/ }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });
});

describe('AjusteRotaPage — edicao via modal', () => {
  it('clicar tijolinho na aba Detalhes abre modal', async () => {
    setSearchParams({ rota_id: 'r1' });
    vi.stubGlobal('fetch', mockGetRotaOk([paradaSeed({ id: 'p1', ordem: 1 })]));

    const user = userEvent.setup();
    render(<AjusteRotaPage />);

    await waitFor(() => screen.getByText(/Ajuste de Rota/));
    await user.click(screen.getByRole('tab', { name: /Detalhes/ }));
    await user.click(screen.getByTestId('tijolinho-detalhes-1'));

    expect(screen.getByRole('dialog')).toBeDefined();
  });

  it('salvar edicao habilita botao Salvar mudancas', async () => {
    setSearchParams({ rota_id: 'r1' });
    vi.stubGlobal('fetch', mockGetRotaOk([paradaSeed({ id: 'p1' })]));

    const user = userEvent.setup();
    render(<AjusteRotaPage />);

    await waitFor(() => screen.getByText(/Ajuste de Rota/));
    await user.click(screen.getByRole('tab', { name: /Detalhes/ }));
    await user.click(screen.getByTestId('tijolinho-detalhes-1'));

    // Marcar fixada e Salvar
    await user.click(screen.getByLabelText(/fixar nesta posicao/i));
    await user.click(screen.getByRole('button', { name: /^Salvar$/ }));

    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /Salvar mudancas/ }) as HTMLButtonElement;
      expect(btn.disabled).toBe(false);
    });
  });
});

describe('AjusteRotaPage — reorganizar (VROOM)', () => {
  it('clicar 🪄 chama o endpoint reorganizar e aplica a nova ordem (dirty)', async () => {
    setSearchParams({ rota_id: 'r1' });

    const paradas = [
      paradaSeed({ id: 'p1', ordem: 1, endereco: { logradouro: 'Avenida Um', bairro: 'B', cidade: 'SP', uf: 'SP' } }),
      paradaSeed({ id: 'p2', ordem: 2, latitude: -23.6, longitude: -46.7, endereco: { logradouro: 'Avenida Dois', bairro: 'B', cidade: 'SP', uf: 'SP' } }),
      paradaSeed({ id: 'p3', ordem: 3, latitude: -23.7, longitude: -46.8, endereco: { logradouro: 'Avenida Tres', bairro: 'B', cidade: 'SP', uf: 'SP' } }),
    ];

    const fetchMock = vi.fn(async (url: string | Request) => {
      const u = typeof url === 'string' ? url : url.url;
      if (u.includes('/reorganizar')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            reorganizou: true,
            // nova ordem: p3, p1, p2
            paradas: [
              { id: 'p3', ordem: 1 },
              { id: 'p1', ordem: 2 },
              { id: 'p2', ordem: 3 },
            ],
            nao_atendidas: [],
          }),
        } as unknown as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          rota: { id: 'r1', motorista_id: 'm1', empresa_id: 'e1', distancia_total_km: 15, tempo_total_min: 30 },
          paradas,
        }),
      } as unknown as Response;
    });
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    render(<AjusteRotaPage />);

    await waitFor(() => screen.getByTestId('btn-reorganizar'));
    // Antes: posicao 1 = Avenida Um (p1)
    expect(screen.getByTestId('tijolinho-ordenar-1').textContent).toMatch(/Avenida Um/);

    await user.click(screen.getByTestId('btn-reorganizar'));

    // Chamou o endpoint de reorganizacao
    await waitFor(() => {
      const chamou = fetchMock.mock.calls.some((c) => {
        const u = typeof c[0] === 'string' ? c[0] : (c[0] as Request).url;
        return u.includes('/api/routing/rota/r1/reorganizar');
      });
      expect(chamou).toBe(true);
    });

    // Depois: posicao 1 = Avenida Tres (p3) e Salvar habilitado
    await waitFor(() => {
      expect(screen.getByTestId('tijolinho-ordenar-1').textContent).toMatch(/Avenida Tres/);
      expect((screen.getByRole('button', { name: /Salvar mudancas/ }) as HTMLButtonElement).disabled).toBe(false);
    });
  });

  it('botao reorganizar desabilitado com menos de 2 paradas pendentes', async () => {
    setSearchParams({ rota_id: 'r1' });
    vi.stubGlobal('fetch', mockGetRotaOk([paradaSeed({ id: 'p1' })]));

    render(<AjusteRotaPage />);

    await waitFor(() => screen.getByTestId('btn-reorganizar'));
    expect((screen.getByTestId('btn-reorganizar') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('AjusteRotaPage — salvar', () => {
  it('clicar Salvar chama PATCH com paradas', async () => {
    setSearchParams({ rota_id: 'r1' });
    const fetchMock = vi.fn();
    // GET inicial
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        rota: { id: 'r1', motorista_id: 'm1', empresa_id: 'e1', distancia_total_km: 10, tempo_total_min: 20 },
        paradas: [paradaSeed({ id: 'p1' })],
      }),
    });
    // PATCH ao salvar
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, atualizadas: 1 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    render(<AjusteRotaPage />);

    await waitFor(() => screen.getByText(/Ajuste de Rota/));
    await user.click(screen.getByRole('tab', { name: /Detalhes/ }));
    await user.click(screen.getByTestId('tijolinho-detalhes-1'));
    await user.click(screen.getByLabelText(/fixar nesta posicao/i));
    await user.click(screen.getByRole('button', { name: /^Salvar$/ }));

    await waitFor(() => screen.getByRole('button', { name: /Salvar mudancas/ }));

    await user.click(screen.getByRole('button', { name: /Salvar mudancas/ }));

    await waitFor(() => {
      const calls = fetchMock.mock.calls;
      const patchCall = calls.find((c) => c[1]?.method === 'PATCH');
      expect(patchCall).toBeDefined();
    });
  });
});
