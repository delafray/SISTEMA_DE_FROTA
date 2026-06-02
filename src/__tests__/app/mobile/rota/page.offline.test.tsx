/**
 * Teste do caminho OFFLINE da /mobile/rota: quando o fetch de rotas falha (sem
 * internet), a page retoma a rota salva localmente (rotaCache) e entra em_rota.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { RotaCacheada } from '@/lib/offline/types';

// ─── MOCKS ──────────────────────────────────────────────────────────────
const searchParamsMock = vi.fn();
vi.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: searchParamsMock }),
}));

vi.mock('@/lib/offline/fila', () => ({
  adicionarNota: vi.fn().mockResolvedValue(undefined),
  editarNota: vi.fn().mockResolvedValue(undefined),
  listarTodas: vi.fn().mockResolvedValue([]),
  contarPorStatus: vi.fn().mockResolvedValue({ pendente: 0, sincronizada: 0, erro: 0 }),
  remover: vi.fn().mockResolvedValue(undefined),
  limparFila: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/offline/sync', () => ({
  iniciarSyncWorker: vi.fn(() => vi.fn()),
  sincronizarFila: vi.fn().mockResolvedValue({ tentadas: 0, sucesso: 0, erro: 0, pulados: 0 }),
}));
vi.mock('@/lib/offline/onlineDetector', () => ({
  iniciarOnlineDetector: vi.fn(() => vi.fn()),
  estaOnline: vi.fn(() => false),
}));
vi.mock('@/components/MapaRota', () => ({ MapaRota: () => <div data-testid="mapa-rota" /> }));
vi.mock('@/components/mobile/InputEnderecoNF', () => ({ InputEnderecoNF: () => <div data-testid="input-endereco" /> }));

// rotaCache — controla o snapshot local
const lerUltimaRotaAtiva = vi.fn();
const lerRotaAtiva = vi.fn();
const salvarRotaAtiva = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/offline/rotaCache', () => ({
  lerUltimaRotaAtiva: (...a: unknown[]) => lerUltimaRotaAtiva(...a),
  lerRotaAtiva: (...a: unknown[]) => lerRotaAtiva(...a),
  salvarRotaAtiva: (...a: unknown[]) => salvarRotaAtiva(...a),
}));

import RotaPage from '@/app/mobile/rota/page';

function rotaCacheada(): RotaCacheada {
  return {
    id: 'rota-cache-1',
    empresa_id: 'emp-1',
    motorista_id: 'mot-1',
    rota: {
      id: 'rota-cache-1', motorista_id: 'mot-1', empresa_id: 'emp-1', data: '2026-06-02',
      distancia_total_km: 10, tempo_total_min: 30, status: 'em_andamento',
      otimizada_em: '2026-06-02T10:00:00Z', criada_em: '2026-06-02T09:00:00Z',
    },
    paradas: [{
      id: 'p1', rota_id: 'rota-cache-1', nota_id: null, ordem: 1,
      endereco: { logradouro: 'Av Cache', bairro: 'Centro', cidade: 'SP', uf: 'SP', numero: '50' },
      latitude: -23.5, longitude: -46.6, fixada: false, janela_horario: null,
      tempo_descarga_min: 5, observacao: null, concluida_em: null,
    }],
    salvo_em: '2026-06-02T11:00:00Z',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  searchParamsMock.mockImplementation((k: string) => (k === 'motorista_id' ? 'mot-1' : k === 'empresa_id' ? 'emp-1' : null));
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('RotaPage — offline', () => {
  it('retoma a rota salva localmente quando o fetch de rotas falha (sem internet)', async () => {
    // fetch sempre rejeita = offline
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('Failed to fetch'); }));
    lerUltimaRotaAtiva.mockResolvedValue(rotaCacheada());

    render(<RotaPage />);

    // Entrou na fase em_rota com a rota do cache (mapa renderiza)
    await waitFor(() => expect(screen.getByTestId('mapa-rota')).toBeInTheDocument());
    expect(lerUltimaRotaAtiva).toHaveBeenCalledWith('mot-1');
    expect(screen.getByText(/usando a rota salva no aparelho/i)).toBeInTheDocument();
  });

  it('cai pra fase inicio quando offline e NAO ha rota salva', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('Failed to fetch'); }));
    lerUltimaRotaAtiva.mockResolvedValue(null);

    render(<RotaPage />);

    await waitFor(() => expect(lerUltimaRotaAtiva).toHaveBeenCalled());
    // sem cache → nao entra em_rota (mapa nao aparece)
    expect(screen.queryByTestId('mapa-rota')).not.toBeInTheDocument();
  });
});
