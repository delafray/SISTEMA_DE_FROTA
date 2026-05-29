/**
 * Testes do componente InputEnderecoNF.
 * Usa @testing-library/react + jsdom (configurados em vitest.config.ts).
 * Mocka @/lib/cep/client (consultarCEPBrowser) pra isolar do fetch real.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ─── MOCKS ──────────────────────────────────────────────────────────────

vi.mock('@/lib/cep/client', () => ({
  consultarCEPBrowser: vi.fn(),
}));

// ─── IMPORTS apos mocks ─────────────────────────────────────────────────

import { InputEnderecoNF } from '@/components/mobile/InputEnderecoNF';
import { consultarCEPBrowser } from '@/lib/cep/client';

const cepMock = consultarCEPBrowser as ReturnType<typeof vi.fn>;

const enderecoExemplo = {
  logradouro: 'Avenida Paulista',
  bairro: 'Bela Vista',
  cidade: 'Sao Paulo',
  uf: 'SP',
};

beforeEach(() => {
  vi.clearAllMocks();
  // Mock default: nunca resolve (testes que precisam de resultado sobrescrevem com mockResolvedValue)
  cepMock.mockReturnValue(new Promise(() => {}));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('InputEnderecoNF — fluxo CEP', () => {
  it('renderiza com cabecalho "NF X de Y" quando totalNFs e fornecido', () => {
    render(
      <InputEnderecoNF
        numeroNF={24}
        totalNFs={70}
        onConfirmar={vi.fn()}
      />
    );

    expect(screen.getByText(/NF 24 de 70/)).toBeDefined();
    expect(screen.getByLabelText(/CEP/i)).toBeDefined();
  });

  it('renderiza so "NF X" quando totalNFs e omitido (motorista nao sabe o total)', () => {
    render(<InputEnderecoNF numeroNF={3} onConfirmar={vi.fn()} />);

    const header = screen.getByText(/^NF 3$/);
    expect(header).toBeDefined();
    expect(screen.queryByText(/de \d/)).toBeNull();
  });

  it('renderiza so "NF X" quando totalNFs=0 (mesmo efeito de omitido)', () => {
    render(<InputEnderecoNF numeroNF={3} totalNFs={0} onConfirmar={vi.fn()} />);

    expect(screen.getByText(/^NF 3$/)).toBeDefined();
    expect(screen.queryByText(/de \d/)).toBeNull();
  });

  it('input de CEP abre teclado numerico no mobile (type=tel + inputMode=numeric + pattern)', () => {
    render(<InputEnderecoNF numeroNF={1} totalNFs={70} onConfirmar={vi.fn()} />);

    const input = screen.getByLabelText(/CEP/i) as HTMLInputElement;
    expect(input.type).toBe('tel');
    expect(input.inputMode).toBe('numeric');
    expect(input.pattern).toBe('[0-9]*');
  });

  it('formata CEP enquanto digita (00000-000)', async () => {
    const user = userEvent.setup();
    render(<InputEnderecoNF numeroNF={1} totalNFs={70} onConfirmar={vi.fn()} />);

    const input = screen.getByLabelText(/CEP/i) as HTMLInputElement;
    await user.type(input, '01310100');

    expect(input.value).toBe('01310-100');
  });

  it('NAO chama ViaCEP enquanto CEP tem menos de 8 digitos', async () => {
    const user = userEvent.setup();
    render(<InputEnderecoNF numeroNF={1} totalNFs={70} onConfirmar={vi.fn()} />);

    await user.type(screen.getByLabelText(/CEP/i), '0131010');

    expect(cepMock).not.toHaveBeenCalled();
  });

  it('chama ViaCEP automaticamente quando CEP atinge 8 digitos', async () => {
    cepMock.mockResolvedValue({ ok: true, cep: '01310100', endereco: enderecoExemplo, fonte: 'api' });

    const user = userEvent.setup();
    render(<InputEnderecoNF numeroNF={1} totalNFs={70} onConfirmar={vi.fn()} />);

    await user.type(screen.getByLabelText(/CEP/i), '01310100');

    await waitFor(() => expect(cepMock).toHaveBeenCalledWith('01310100'));
  });
});

describe('InputEnderecoNF — fluxo Numero', () => {
  it('mostra endereco e input de Numero apos ViaCEP sucesso', async () => {
    cepMock.mockResolvedValue({ ok: true, cep: '01310100', endereco: enderecoExemplo, fonte: 'api' });

    const user = userEvent.setup();
    render(<InputEnderecoNF numeroNF={1} totalNFs={70} onConfirmar={vi.fn()} />);

    await user.type(screen.getByLabelText(/CEP/i), '01310100');

    await waitFor(() => {
      expect(screen.getByText(/Avenida Paulista/)).toBeDefined();
      expect(screen.getByLabelText(/^Numero$/i)).toBeDefined();
    });
  });

  it('botao "Confirmar" fica desabilitado enquanto numero esta vazio', async () => {
    cepMock.mockResolvedValue({ ok: true, cep: '01310100', endereco: enderecoExemplo, fonte: 'api' });

    const user = userEvent.setup();
    render(<InputEnderecoNF numeroNF={1} totalNFs={70} onConfirmar={vi.fn()} />);

    await user.type(screen.getByLabelText(/CEP/i), '01310100');
    await waitFor(() => screen.getByLabelText(/^Numero$/i));

    const btn = screen.getByRole('button', { name: /Confirmar/ });
    expect((btn as HTMLButtonElement).disabled).toBe(true);

    await user.type(screen.getByLabelText(/^Numero$/i), '123');
    expect((btn as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('InputEnderecoNF — fluxo Confirmar', () => {
  it('mostra resumo na tela de confirmacao e chama onConfirmar com os dados', async () => {
    cepMock.mockResolvedValue({ ok: true, cep: '01310100', endereco: enderecoExemplo, fonte: 'api' });
    const onConfirmar = vi.fn();

    const user = userEvent.setup();
    render(<InputEnderecoNF numeroNF={1} totalNFs={70} onConfirmar={onConfirmar} />);

    // CEP
    await user.type(screen.getByLabelText(/CEP/i), '01310100');
    await waitFor(() => screen.getByLabelText(/^Numero$/i));

    // Numero
    await user.type(screen.getByLabelText(/^Numero$/i), '123');
    await user.click(screen.getByRole('button', { name: /Confirmar/ }));

    // Tela de confirmacao
    await waitFor(() => expect(screen.getByText(/Confirmar\?/)).toBeDefined());
    expect(screen.getByText(/Avenida Paulista, 123/)).toBeDefined();
    expect(screen.getByText(/CEP 01310-100/)).toBeDefined();

    // Clica em "Confirmar e proxima"
    await user.click(screen.getByRole('button', { name: /Confirmar e proxima/ }));

    expect(onConfirmar).toHaveBeenCalledWith({
      cep: '01310100',
      numero: '123',
      endereco: enderecoExemplo,
    });
  });

  it('botao Editar volta pra tela de numero', async () => {
    cepMock.mockResolvedValue({ ok: true, cep: '01310100', endereco: enderecoExemplo, fonte: 'api' });

    const user = userEvent.setup();
    render(<InputEnderecoNF numeroNF={1} totalNFs={70} onConfirmar={vi.fn()} />);

    await user.type(screen.getByLabelText(/CEP/i), '01310100');
    await waitFor(() => screen.getByLabelText(/^Numero$/i));
    await user.type(screen.getByLabelText(/^Numero$/i), '123');
    await user.click(screen.getByRole('button', { name: /^→ Confirmar$/ }));

    await waitFor(() => screen.getByText(/Confirmar\?/));
    await user.click(screen.getByRole('button', { name: /Editar/ }));

    expect(screen.getByLabelText(/^Numero$/i)).toBeDefined();
  });

  it('apos confirmar, reseta pra capturar proxima NF (volta pra tela CEP)', async () => {
    cepMock.mockResolvedValue({ ok: true, cep: '01310100', endereco: enderecoExemplo, fonte: 'api' });

    const user = userEvent.setup();
    render(<InputEnderecoNF numeroNF={1} totalNFs={70} onConfirmar={vi.fn().mockResolvedValue(undefined)} />);

    await user.type(screen.getByLabelText(/CEP/i), '01310100');
    await waitFor(() => screen.getByLabelText(/^Numero$/i));
    await user.type(screen.getByLabelText(/^Numero$/i), '123');
    await user.click(screen.getByRole('button', { name: /^→ Confirmar$/ }));
    await waitFor(() => screen.getByText(/Confirmar\?/));
    await user.click(screen.getByRole('button', { name: /Confirmar e proxima/ }));

    // Volta pra tela CEP com input vazio
    await waitFor(() => {
      const cepInput = screen.getByLabelText(/CEP/i) as HTMLInputElement;
      expect(cepInput.value).toBe('');
    });
  });
});

describe('InputEnderecoNF — fallback manual', () => {
  it('abre form manual quando CEP nao encontrado', async () => {
    cepMock.mockResolvedValue({ ok: false, motivo: 'nao_encontrado' });

    const user = userEvent.setup();
    render(<InputEnderecoNF numeroNF={1} totalNFs={70} onConfirmar={vi.fn()} />);

    await user.type(screen.getByLabelText(/CEP/i), '99999999');

    await waitFor(() => {
      expect(screen.getByText(/CEP nao encontrado/i)).toBeDefined();
      expect(screen.getByLabelText(/Logradouro/)).toBeDefined();
      expect(screen.getByLabelText(/Cidade/)).toBeDefined();
      expect(screen.getByLabelText(/^UF/)).toBeDefined();
    });
  });

  it('form manual permite preencher endereco e avancar pra etapa Numero', async () => {
    cepMock.mockResolvedValue({ ok: false, motivo: 'nao_encontrado' });

    const user = userEvent.setup();
    render(<InputEnderecoNF numeroNF={1} totalNFs={70} onConfirmar={vi.fn()} />);

    await user.type(screen.getByLabelText(/CEP/i), '99999999');
    await waitFor(() => screen.getByLabelText(/Cidade/));

    await user.type(screen.getByLabelText(/Logradouro/), 'Rua Nova');
    await user.type(screen.getByLabelText(/Bairro/), 'Centro');
    await user.type(screen.getByLabelText(/Cidade/), 'Cidade X');
    await user.type(screen.getByLabelText(/^UF/), 'mg');

    await user.click(screen.getByRole('button', { name: /Usar este endereco/ }));

    await waitFor(() => expect(screen.getByLabelText(/^Numero$/i)).toBeDefined());
    expect(screen.getByText(/Rua Nova/)).toBeDefined();
  });

  it('UF e auto-uppercase e limitada a 2 letras', async () => {
    cepMock.mockResolvedValue({ ok: false, motivo: 'nao_encontrado' });

    const user = userEvent.setup();
    render(<InputEnderecoNF numeroNF={1} totalNFs={70} onConfirmar={vi.fn()} />);

    await user.type(screen.getByLabelText(/CEP/i), '99999999');
    await waitFor(() => screen.getByLabelText(/^UF/));

    const uf = screen.getByLabelText(/^UF/) as HTMLInputElement;
    await user.type(uf, 'mgsp');
    expect(uf.value).toBe('MG');
  });
});

describe('InputEnderecoNF — erros de rede', () => {
  it('mostra mensagem de erro quando ViaCEP da erro_rede (sem mudar de etapa)', async () => {
    cepMock.mockResolvedValue({ ok: false, motivo: 'erro_rede' });

    const user = userEvent.setup();
    render(<InputEnderecoNF numeroNF={1} totalNFs={70} onConfirmar={vi.fn()} />);

    await user.type(screen.getByLabelText(/CEP/i), '01310100');

    await waitFor(() => expect(screen.getByRole('alert')).toBeDefined());
    expect(screen.getByText(/conexao/i)).toBeDefined();
  });

  it('mostra erro_rede sem abrir form manual (fica na etapa CEP pra retry)', async () => {
    cepMock.mockResolvedValue({ ok: false, motivo: 'erro_rede' });

    const user = userEvent.setup();
    render(<InputEnderecoNF numeroNF={1} totalNFs={70} onConfirmar={vi.fn()} />);

    await user.type(screen.getByLabelText(/CEP/i), '01310100');
    await waitFor(() => screen.getByRole('alert'));

    // Continua na etapa CEP — input ainda visivel
    expect(screen.getByLabelText(/CEP/i)).toBeDefined();
    // Form manual NAO aberto
    expect(screen.queryByLabelText(/Cidade/)).toBeNull();
  });
});
