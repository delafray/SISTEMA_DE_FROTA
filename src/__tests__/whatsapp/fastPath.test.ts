import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  limparHistorico: vi.fn(),
}));

vi.mock('@/lib/whatsapp/historico', () => ({
  limparHistorico: mocks.limparHistorico,
}));

import { tentarFastPath } from '@/lib/whatsapp/fastPath';

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
});

describe('tentarFastPath — saudacoes', () => {
  it('matchea "oi" e personaliza com primeiro nome', async () => {
    const r = await tentarFastPath('oi', '+5511', 'Carlos da Silva');
    expect(r.matched).toBe(true);
    expect(r.resposta).toContain('Carlos');
    expect(r.matcher).toBe('saudacao');
  });

  it('matchea "ola", "bom dia", "boa tarde"', async () => {
    expect((await tentarFastPath('ola', '+5511')).matched).toBe(true);
    expect((await tentarFastPath('bom dia', '+5511')).matched).toBe(true);
    expect((await tentarFastPath('boa tarde', '+5511')).matched).toBe(true);
    expect((await tentarFastPath('boa noite', '+5511')).matched).toBe(true);
  });

  it('case-insensitive: "OI", "Ola"', async () => {
    expect((await tentarFastPath('OI', '+5511')).matched).toBe(true);
    expect((await tentarFastPath('Ola', '+5511')).matched).toBe(true);
  });

  it('sem nome: usa saudacao generica', async () => {
    const r = await tentarFastPath('oi', '+5511');
    expect(r.matched).toBe(true);
    expect(r.resposta).toBe('Ola. No que posso ajudar?');
  });

  it('NAO matchea "oi quanto km tem o leao" (mensagem composta)', async () => {
    const r = await tentarFastPath('oi quanto km tem o leao', '+5511');
    expect(r.matched).toBe(false);
  });
});

describe('tentarFastPath — ajuda', () => {
  it('matchea menu/ajuda/help', async () => {
    expect((await tentarFastPath('menu', '+5511')).matched).toBe(true);
    expect((await tentarFastPath('ajuda', '+5511')).matched).toBe(true);
    expect((await tentarFastPath('/help', '+5511')).matched).toBe(true);
  });

  it('resposta de ajuda lista funcionalidades', async () => {
    const r = await tentarFastPath('ajuda', '+5511');
    expect(r.resposta).toContain('Motoristas');
    expect(r.resposta).toContain('KM');
  });
});

describe('tentarFastPath — encerramento', () => {
  it('matchea tchau/valeu/obrigado', async () => {
    expect((await tentarFastPath('tchau', '+5511')).matched).toBe(true);
    expect((await tentarFastPath('valeu', '+5511')).matched).toBe(true);
    expect((await tentarFastPath('obrigado', '+5511')).matched).toBe(true);
  });
});

describe('tentarFastPath — reset (/novo)', () => {
  it('matchea /novo e chama limparHistorico', async () => {
    mocks.limparHistorico.mockResolvedValue(undefined);
    const r = await tentarFastPath('/novo', '+5511999');
    expect(r.matched).toBe(true);
    expect(mocks.limparHistorico).toHaveBeenCalledWith('+5511999');
    expect(r.resposta).toContain('reiniciada');
  });

  it('matchea "comecar de novo"', async () => {
    mocks.limparHistorico.mockResolvedValue(undefined);
    const r = await tentarFastPath('comecar de novo', '+5511');
    expect(r.matched).toBe(true);
  });
});

describe('tentarFastPath — guardas', () => {
  it('texto vazio: nao matchea', async () => {
    expect((await tentarFastPath('', '+5511')).matched).toBe(false);
    expect((await tentarFastPath('   ', '+5511')).matched).toBe(false);
  });

  it('texto longo (> 40 chars): nao matchea (e pergunta real, vai pro LLM)', async () => {
    const longo = 'oi tudo bem? gostaria de saber sobre meus caminhoes hoje';
    expect((await tentarFastPath(longo, '+5511')).matched).toBe(false);
  });

  it('pergunta real: nao matchea', async () => {
    expect((await tentarFastPath('quanto km tem o leao?', '+5511')).matched).toBe(false);
    expect((await tentarFastPath('me lista os motoristas', '+5511')).matched).toBe(false);
  });
});
