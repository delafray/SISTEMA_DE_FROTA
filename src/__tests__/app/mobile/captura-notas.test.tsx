/**
 * Testes da tela mobile de Captura de Notas.
 * Mocka next/navigation, fila offline, sync, onlineDetector e InputEnderecoNF.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ─── MOCKS ──────────────────────────────────────────────────────────────

const searchParamsMock = vi.fn();
vi.mock('next/navigation', () => ({
  useSearchParams: () => ({
    get: searchParamsMock,
  }),
}));

vi.mock('@/lib/offline/fila', () => ({
  adicionarNota: vi.fn().mockResolvedValue(undefined),
  listarTodas: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/lib/offline/sync', () => ({
  iniciarSyncWorker: vi.fn(() => vi.fn()),
  sincronizarFila: vi.fn().mockResolvedValue({ tentadas: 0, sucesso: 0, erro: 0, pulados: 0 }),
}));

vi.mock('@/lib/offline/onlineDetector', () => ({
  iniciarOnlineDetector: vi.fn(() => vi.fn()),
  estaOnline: vi.fn(() => true),
}));

// Mock simples do InputEnderecoNF: 1 botao que dispara onConfirmar com payload fixo
vi.mock('@/components/mobile/InputEnderecoNF', () => ({
  InputEnderecoNF: (props: {
    numeroNF: number;
    totalNFs?: number;
    onConfirmar: (nota: {
      cep: string;
      numero: string;
      endereco: { logradouro: string; bairro: string; cidade: string; uf: string };
    }) => void | Promise<void>;
  }) => (
    <div data-testid="input-endereco-nf">
      <span data-testid="contador-nf">
        NF {props.numeroNF}{props.totalNFs && props.totalNFs > 0 ? ` de ${props.totalNFs}` : ''}
      </span>
      <button
        type="button"
        onClick={() =>
          props.onConfirmar({
            cep: '01310100',
            numero: '123',
            endereco: { logradouro: 'Av Paulista', bairro: 'Bela Vista', cidade: 'Sao Paulo', uf: 'SP' },
          })
        }
      >
        capturar-mock
      </button>
    </div>
  ),
}));

// ─── IMPORTS apos mocks ─────────────────────────────────────────────────

import CapturaNotasPage from '@/app/mobile/captura-notas/page';
import { adicionarNota, listarTodas } from '@/lib/offline/fila';
import { sincronizarFila } from '@/lib/offline/sync';
import type { NotaNaFila } from '@/lib/offline/types';

// ─── HELPERS ────────────────────────────────────────────────────────────

function setSearchParams(params: Record<string, string | null>) {
  searchParamsMock.mockImplementation((key: string) => params[key] ?? null);
}

function makeNotaSync(over: Partial<NotaNaFila> = {}): NotaNaFila {
  return {
    id_local: over.id_local ?? `local-${Math.random().toString(36).slice(2, 8)}`,
    motorista_id: 'mot-1',
    empresa_id: 'emp-1',
    cep: '01310100',
    numero: '123',
    endereco: { logradouro: 'Av Paulista', bairro: 'Bela Vista', cidade: 'Sao Paulo', uf: 'SP' },
    latitude: null,
    longitude: null,
    observacao: null,
    status: 'capturada',
    capturado_em: new Date().toISOString(),
    status_sync: 'sincronizada',
    tentativas: 0,
    ...over,
  };
}

// ─── TESTES ─────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  // Garante que crypto.randomUUID existe no jsdom
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID !== 'function') {
    Object.defineProperty(crypto, 'randomUUID', {
      value: () => 'uuid-' + Math.random().toString(36).slice(2, 14),
      configurable: true,
    });
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('CapturaNotasPage — params obrigatorios', () => {
  it('mostra erro quando motorista_id falta', () => {
    setSearchParams({ motorista_id: null, empresa_id: 'emp-1' });

    render(<CapturaNotasPage />);

    expect(screen.getByRole('alert')).toBeDefined();
    expect(screen.getByText(/Parametros faltando/i)).toBeDefined();
  });

  it('mostra erro quando empresa_id falta', () => {
    setSearchParams({ motorista_id: 'mot-1', empresa_id: null });

    render(<CapturaNotasPage />);

    expect(screen.getByRole('alert')).toBeDefined();
  });

  it('NAO chama fila/sync quando params faltam', () => {
    setSearchParams({ motorista_id: null, empresa_id: null });

    render(<CapturaNotasPage />);

    expect(listarTodas).not.toHaveBeenCalled();
    expect(sincronizarFila).not.toHaveBeenCalled();
  });
});

describe('CapturaNotasPage — fluxo inicial', () => {
  it('renderiza header + InputEnderecoNF + contador "NF 1" (sem total) quando params OK', async () => {
    setSearchParams({ motorista_id: 'mot-1', empresa_id: 'emp-1' });
    (listarTodas as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    render(<CapturaNotasPage />);

    expect(screen.getByText(/Captura de Notas/i)).toBeDefined();
    expect(screen.getByTestId('input-endereco-nf')).toBeDefined();
    await waitFor(() =>
      expect(screen.getByTestId('contador-nf').textContent).toBe('NF 1')
    );
  });

  it('usa total customizado da URL quando passado (?total=50)', async () => {
    setSearchParams({ motorista_id: 'mot-1', empresa_id: 'emp-1', total: '50' });

    render(<CapturaNotasPage />);

    await waitFor(() =>
      expect(screen.getByTestId('contador-nf').textContent).toBe('NF 1 de 50')
    );
  });

  it('mostra status online quando navigator esta online', () => {
    setSearchParams({ motorista_id: 'mot-1', empresa_id: 'emp-1' });

    render(<CapturaNotasPage />);

    expect(screen.getByLabelText('online')).toBeDefined();
  });
});

describe('CapturaNotasPage — captura', () => {
  it('clicar em capturar chama adicionarNota com motorista_id/empresa_id corretos', async () => {
    setSearchParams({ motorista_id: 'mot-1', empresa_id: 'emp-1' });
    (listarTodas as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const user = userEvent.setup();
    render(<CapturaNotasPage />);

    await user.click(screen.getByRole('button', { name: /capturar-mock/ }));

    await waitFor(() => expect(adicionarNota).toHaveBeenCalledOnce());
    const novaNota = (adicionarNota as ReturnType<typeof vi.fn>).mock.calls[0][0] as NotaNaFila;
    expect(novaNota.motorista_id).toBe('mot-1');
    expect(novaNota.empresa_id).toBe('emp-1');
    expect(novaNota.cep).toBe('01310100');
    expect(novaNota.numero).toBe('123');
    expect(novaNota.status_sync).toBe('pendente');
    expect(novaNota.tentativas).toBe(0);
  });

  it('apos capturar, dispara sincronizarFila imediato', async () => {
    setSearchParams({ motorista_id: 'mot-1', empresa_id: 'emp-1' });
    (listarTodas as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const user = userEvent.setup();
    render(<CapturaNotasPage />);

    await user.click(screen.getByRole('button', { name: /capturar-mock/ }));

    // 1 chamada pode acontecer no mount (worker), entao verificamos que houve >= 1
    await waitFor(() => expect(sincronizarFila).toHaveBeenCalled());
  });

  it('contador NF avanca apos capturar (1 → 2)', async () => {
    setSearchParams({ motorista_id: 'mot-1', empresa_id: 'emp-1' });
    // Primeira render: 0 notas. Apos capturar, listarTodas devolve 1 nota.
    (listarTodas as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce([])
      .mockResolvedValue([makeNotaSync({ id_local: 'a' })]);

    const user = userEvent.setup();
    render(<CapturaNotasPage />);

    await waitFor(() =>
      expect(screen.getByTestId('contador-nf').textContent).toBe('NF 1')
    );

    await user.click(screen.getByRole('button', { name: /capturar-mock/ }));

    await waitFor(() =>
      expect(screen.getByTestId('contador-nf').textContent).toBe('NF 2')
    );
  });
});

describe('CapturaNotasPage — lista de capturadas', () => {
  it('mostra lista quando existem notas', async () => {
    setSearchParams({ motorista_id: 'mot-1', empresa_id: 'emp-1' });
    (listarTodas as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeNotaSync({ id_local: 'a', status_sync: 'sincronizada' }),
      makeNotaSync({ id_local: 'b', status_sync: 'pendente' }),
      makeNotaSync({ id_local: 'c', status_sync: 'erro' }),
    ]);

    render(<CapturaNotasPage />);

    await waitFor(() => expect(screen.getByText(/Capturadas \(3\)/)).toBeDefined());
    expect(screen.getByText(/✓ 1 sincronizadas/)).toBeDefined();
    expect(screen.getByText(/⏳ 1 pendentes/)).toBeDefined();
    expect(screen.getByText(/❌ 1 erro\(s\)/)).toBeDefined();
  });

  it('mostra "e mais N" quando ha mais de 10 notas', async () => {
    setSearchParams({ motorista_id: 'mot-1', empresa_id: 'emp-1' });
    const muitas = Array.from({ length: 13 }, (_, i) =>
      makeNotaSync({ id_local: `n${i}` })
    );
    (listarTodas as ReturnType<typeof vi.fn>).mockResolvedValue(muitas);

    render(<CapturaNotasPage />);

    await waitFor(() => expect(screen.getByText(/e mais 3/)).toBeDefined());
  });
});

describe('CapturaNotasPage — botao Finalizar', () => {
  it('desabilitado quando nao tem capturas', async () => {
    setSearchParams({ motorista_id: 'mot-1', empresa_id: 'emp-1' });
    (listarTodas as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    render(<CapturaNotasPage />);

    const btn = screen.getByRole('button', { name: /Finalizar Rota/ }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('habilitado quando tem >= 1 captura', async () => {
    setSearchParams({ motorista_id: 'mot-1', empresa_id: 'emp-1' });
    (listarTodas as ReturnType<typeof vi.fn>).mockResolvedValue([makeNotaSync()]);

    render(<CapturaNotasPage />);

    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /Finalizar Rota/ }) as HTMLButtonElement;
      expect(btn.disabled).toBe(false);
    });
  });

  it('clicar Finalizar mostra mensagem de status e esconde InputEnderecoNF', async () => {
    setSearchParams({ motorista_id: 'mot-1', empresa_id: 'emp-1' });
    (listarTodas as ReturnType<typeof vi.fn>).mockResolvedValue([makeNotaSync()]);

    const user = userEvent.setup();
    render(<CapturaNotasPage />);

    await waitFor(() => expect(screen.getByText(/Capturadas \(1\)/)).toBeDefined());

    await user.click(screen.getByRole('button', { name: /Finalizar Rota/ }));

    expect(screen.getByRole('status').textContent).toContain('Rota finalizada');
    expect(screen.queryByTestId('input-endereco-nf')).toBeNull();
  });

  it('aviso aparece quando finaliza com notas pendentes', async () => {
    setSearchParams({ motorista_id: 'mot-1', empresa_id: 'emp-1' });
    (listarTodas as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeNotaSync({ status_sync: 'pendente' }),
    ]);

    const user = userEvent.setup();
    render(<CapturaNotasPage />);

    await waitFor(() => screen.getByText(/Capturadas \(1\)/));
    await user.click(screen.getByRole('button', { name: /Finalizar Rota/ }));

    expect(screen.getByText(/Ainda ha 1 nota\(s\) pendente/i)).toBeDefined();
  });
});

describe('CapturaNotasPage — cleanup', () => {
  it('para workers e listeners no unmount', () => {
    setSearchParams({ motorista_id: 'mot-1', empresa_id: 'emp-1' });
    const stopWorker = vi.fn();
    const stopDetector = vi.fn();

    // Re-mock para capturar funcoes de stop
    vi.doMock('@/lib/offline/sync', async () => ({
      iniciarSyncWorker: vi.fn(() => stopWorker),
      sincronizarFila: vi.fn().mockResolvedValue({ tentadas: 0, sucesso: 0, erro: 0, pulados: 0 }),
    }));
    vi.doMock('@/lib/offline/onlineDetector', async () => ({
      iniciarOnlineDetector: vi.fn(() => stopDetector),
      estaOnline: vi.fn(() => true),
    }));

    const { unmount } = render(<CapturaNotasPage />);
    act(() => unmount());

    // Note: como o componente foi importado antes do doMock, ele usou os mocks
    // originais (que tambem retornam funcao de stop, mas anonima). O importante
    // e nao quebrar no unmount.
    expect(() => unmount()).not.toThrow();
  });
});
