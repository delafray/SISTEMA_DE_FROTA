/**
 * Regressao: ao capturar endereco por VOZ, o numero da casa falado deve ser
 * preenchido automaticamente (antes era jogado fora — passava-se '' como texto
 * original na selecao da opcao).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/lib/cep/client', () => ({
  consultarCEPBrowser: vi.fn(() => new Promise(() => {})),
}));

// Microfone: ao clicar, simula a transcricao de uma fala com numero no meio.
vi.mock('@/components/mobile/BotaoMicrofone', () => ({
  BotaoMicrofone: (props: { onTranscricao: (t: string) => void }) => (
    <button
      type="button"
      data-testid="mock-mic"
      onClick={() => props.onTranscricao('Rua Piatã 104 São Mateus Contagem')}
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
  // jsdom nao tem geolocation — sem isso o await em getCurrentPosition trava.
  Object.defineProperty(navigator, 'geolocation', {
    value: { getCurrentPosition: (_s: unknown, e: (err: unknown) => void) => e({ code: 1 }) },
    configurable: true,
  });

  // Nominatim devolve a rua SEM house_number (caso real BR) — o numero tem que
  // vir da fala.
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        resultados: [
          {
            lat: -19.86,
            lng: -44.02,
            endereco_normalizado: 'Rua Piatã, São Mateus, Contagem, MG',
            logradouro: 'Rua Piatã',
            bairro: 'São Mateus',
            cidade: 'Contagem',
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

describe('InputEnderecoNF — captura por voz preenche o numero', () => {
  it('fala "Rua Piatã 104 ..." → numero 104 vai pro campo automaticamente', async () => {
    const user = userEvent.setup();
    render(<InputEnderecoNF numeroNF={1} onConfirmar={vi.fn()} />);

    // 1. Fala o endereco (mock do microfone)
    await user.click(screen.getByTestId('mock-mic'));

    // 2. Aparece a lista de opcoes; escolhe a primeira
    await waitFor(() => screen.getByTestId('mock-opcao'));
    await user.click(screen.getByTestId('mock-opcao'));

    // 3. Vai pra etapa numero com o numero JA preenchido (vindo da fala)
    await waitFor(() => {
      const input = screen.getByLabelText(/Numero/i) as HTMLInputElement;
      expect(input.value).toBe('104');
    });
  });
});
