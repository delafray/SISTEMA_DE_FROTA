/**
 * Testes da sessao local offline (Dexie + IndexedDB).
 * Usa `fake-indexeddb/auto` pra polyfill IndexedDB em node.
 */

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';

import {
  salvarSessaoLocal,
  lerSessaoLocal,
  limparSessaoLocal,
  sessaoExpirada,
  SESSAO_TTL_MS,
  type PerfilParaSalvar,
} from '@/lib/offline/sessao';
import { getDB } from '@/lib/offline/fila';

function makePerfil(over: Partial<PerfilParaSalvar> = {}): PerfilParaSalvar {
  return {
    usuario_id: over.usuario_id ?? 'user-1',
    empresa_id: over.empresa_id ?? 'emp-1',
    motorista_id: over.motorista_id ?? 'mot-1',
    role: over.role ?? 'motorista',
    nome: over.nome ?? 'João',
  };
}

beforeEach(async () => {
  await getDB().sessao_local.clear();
});

describe('sessaoExpirada (pura)', () => {
  const base = new Date('2026-06-02T12:00:00Z').getTime();

  it('false quando salvo agora', () => {
    expect(sessaoExpirada({ salvo_em: new Date(base).toISOString() }, base)).toBe(false);
  });

  it('false no limite (exatamente 7 dias)', () => {
    const salvo = new Date(base - SESSAO_TTL_MS).toISOString();
    expect(sessaoExpirada({ salvo_em: salvo }, base)).toBe(false);
  });

  it('true 1ms depois de 7 dias', () => {
    const salvo = new Date(base - SESSAO_TTL_MS - 1).toISOString();
    expect(sessaoExpirada({ salvo_em: salvo }, base)).toBe(true);
  });

  it('true quando salvo_em e invalido (fail-safe)', () => {
    expect(sessaoExpirada({ salvo_em: 'lixo' }, base)).toBe(true);
  });
});

describe('salvar/ler/limpar sessao local', () => {
  it('salva e le o perfil', async () => {
    await salvarSessaoLocal(makePerfil({ usuario_id: 'u9', empresa_id: 'e9', motorista_id: 'm9' }));
    const s = await lerSessaoLocal();
    expect(s?.usuario_id).toBe('u9');
    expect(s?.empresa_id).toBe('e9');
    expect(s?.motorista_id).toBe('m9');
    expect(s?.role).toBe('motorista');
    expect(s?.salvo_em).toBeTruthy();
  });

  it('so guarda UMA sessao (sobrescreve a anterior)', async () => {
    await salvarSessaoLocal(makePerfil({ usuario_id: 'primeiro' }));
    await salvarSessaoLocal(makePerfil({ usuario_id: 'segundo' }));
    const total = await getDB().sessao_local.count();
    expect(total).toBe(1);
    expect((await lerSessaoLocal())?.usuario_id).toBe('segundo');
  });

  it('lerSessaoLocal devolve null quando vazio', async () => {
    expect(await lerSessaoLocal()).toBeNull();
  });

  it('lerSessaoLocal devolve null e APAGA quando expirada', async () => {
    await salvarSessaoLocal(makePerfil());
    // Forca salvo_em pra 8 dias atras
    const antigo = new Date(Date.now() - SESSAO_TTL_MS - 86_400_000).toISOString();
    await getDB().sessao_local.update('atual', { salvo_em: antigo });

    expect(await lerSessaoLocal()).toBeNull();
    expect(await getDB().sessao_local.count()).toBe(0); // limpeza preguicosa
  });

  it('limparSessaoLocal remove o registro', async () => {
    await salvarSessaoLocal(makePerfil());
    await limparSessaoLocal();
    expect(await lerSessaoLocal()).toBeNull();
  });
});
