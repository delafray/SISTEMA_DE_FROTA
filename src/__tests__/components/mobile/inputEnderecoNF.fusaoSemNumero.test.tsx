/**
 * Fusao das etapas (caminho por voz) — caso SEM numero:
 * quando a fala NAO tem numero e o Nominatim tambem nao devolve house_number,
 * escolher o card cai na tela unica de confirmar com o campo de numero VAZIO
 * (focado) e o botao "Confirmar e proxima" DESABILITADO ate digitar.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/lib/cep/client', () => ({
  consultarCEPBrowser: vi.fn(() => new Promise(() => {})),
}));

// Microfone: fala SEM numero da casa.
vi.mock('@/components/mobile/BotaoMicrofone', () => ({
  BotaoMicrofone: (props: { onTranscricao: (t: string) => void }) => (
    <button
      type="button"
      data-testid="mock-mic"
      onClick={() => props.onTranscricao('Avenida Afonso Pena Centro Belo Horizonte')}
    >
      mic
    </button>
  ),
}));

// Lista de opcoes: expoe um botao que seleciona a 1a opcao.
vi.mock('@/components/mobile/ListaOpcoesEndereco', () => ({
  ListaOpcoesEndereco: (props: {
    opcoes: unknown[];
    onSelecionar: (o: unknown) => void;
  }) => (
    <button type="button" data-testid="mock-opcao" onClick={() => props.onSelecionar(props.opcoes[0])}>
      escolher
    </button>
  ),
}));

import { InputEnderecoNF } from '@/components/mobile/InputEnderecoNF';

beforeEach(() => {
  Object.defineProperty(navigator, 'geolocation', {
    value: { getCurrentPosition: (_s: unknown, e: (err: unknown) => void) => e({ code: 1 }) },
    configurable: true,
  });

  // Nominatim devolve a rua SEM house_number e sem CEP.
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        resultados: [
          {
            lat: -19.92,
            lng: -43.94,
            endereco_normalizado: 'Avenida Afonso Pena, Centro, Belo Horizonte, MG',
            logradouro: 'Avenida Afonso Pena',
            bairro: 'Centro',
            cidade: 'Belo Horizonte',
            uf: 'MG',
          },
        ],
      }),
    })) as unknown as typeof fetch
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('InputEnderecoNF — voz sem numero', () => {
  it('fala sem numero → confirmar com campo vazio e botao desabilitado', async () => {
    const user = userEvent.setup();
    render(<InputEnderecoNF numeroNF={1} onConfirmar={vi.fn()} />);

    await user.click(screen.getByTestId('mock-mic'));

    await waitFor(() => screen.getByTestId('mock-opcao'));
    await user.click(screen.getByTestId('mock-opcao'));

    // Tela unica de confirmar, com o campo de numero VAZIO.
    await waitFor(() => {
      const input = screen.getByLabelText(/^Numero$/i) as HTMLInputElement;
      expect(input).toBeDefined();
      expect(input.value).toBe('');
    });
    // Botao confirmar desabilitado enquanto nao houver numero.
    const btn = screen.getByRole('button', { name: /Confirmar e proxima/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);

    // Ao digitar o numero, habilita.
    await user.type(screen.getByLabelText(/^Numero$/i), '99');
    expect(btn.disabled).toBe(false);
  });
});
