/**
 * Testes do fluxo de OCR multi-foto do InputEnderecoNF (até 3 fotos da mesma NF).
 * Mocka @/lib/ocr/lerImagem (sem WASM) e @/lib/cep/client (sem fetch real).
 *
 * Casos cobertos:
 *  - Foto 1 só com CEP → fica na tela com cartão parcial + 📷 ainda visível.
 *  - Foto 2 com o número → soma os textos e avança pra confirmar preenchido.
 *  - Botão "Continuar" → avança com número vazio pro motorista digitar.
 *  - 3ª foto sem número → avança mesmo assim (não fica preso).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ─── MOCKS ──────────────────────────────────────────────────────────────

const lerTextoDaImagem = vi.fn();
const encerrarOcr = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/ocr/lerImagem', () => ({
  lerTextoDaImagem: (...a: unknown[]) => lerTextoDaImagem(...a),
  encerrarOcr: () => encerrarOcr(),
}));

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

// Texto de OCR típico: bloco do destinatário com CEP, sem número legível.
const FOTO_SO_CEP = 'DESTINATARIO / REMETENTE\nRUA DAS PALMEIRAS\nCEP 01310-100  SAO PAULO SP';
const FOTO_NUMERO = 'Nº 742';

function fotografar() {
  const input = screen.getByTestId('ocr-file-input') as HTMLInputElement;
  const file = new File(['fake-bytes'], 'nota.jpg', { type: 'image/jpeg' });
  fireEvent.change(input, { target: { files: [file] } });
}

beforeEach(() => {
  vi.clearAllMocks();
  cepMock.mockReturnValue(new Promise(() => {})); // default: nunca resolve
  // fetch defensivo (effect de validar-endereco roda após 700ms se chegar em confirmar).
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('InputEnderecoNF — OCR multi-foto', () => {
  it('foto 1 só com CEP → fica na tela com cartão parcial e 📷 ainda disponível', async () => {
    lerTextoDaImagem.mockResolvedValueOnce({ texto: FOTO_SO_CEP, confianca: 90 });

    render(<InputEnderecoNF numeroNF={1} totalNFs={70} onConfirmar={vi.fn()} />);
    fotografar();

    await waitFor(() => expect(screen.getByTestId('ocr-parcial')).toBeDefined());
    // Mostra o CEP lido e que faltou o número
    expect(screen.getByTestId('ocr-parcial').textContent).toMatch(/01310-100/);
    expect(screen.getByTestId('ocr-parcial').textContent).toMatch(/faltou o número/i);
    // Câmera continua na tela pra tirar a próxima foto + botão continuar
    expect(screen.getByTestId('btn-ler-nota')).toBeDefined();
    expect(screen.getByTestId('ocr-continuar')).toBeDefined();
    // NÃO avançou: ainda na tela CEP, e o ViaCEP nem foi chamado
    expect(screen.getByLabelText(/CEP/i)).toBeDefined();
    expect(cepMock).not.toHaveBeenCalled();
  });

  it('foto 2 com o número → soma os textos e avança pra confirmar preenchido', async () => {
    cepMock.mockResolvedValue({ ok: true, cep: '01310100', endereco: enderecoExemplo, fonte: 'api' });
    lerTextoDaImagem
      .mockResolvedValueOnce({ texto: FOTO_SO_CEP, confianca: 90 })
      .mockResolvedValueOnce({ texto: FOTO_NUMERO, confianca: 88 });

    render(<InputEnderecoNF numeroNF={1} totalNFs={70} onConfirmar={vi.fn()} />);

    fotografar(); // foto 1
    await waitFor(() => screen.getByTestId('ocr-parcial'));

    fotografar(); // foto 2 (close do número)
    await waitFor(() => screen.getByLabelText(/^Numero$/i));

    expect((screen.getByLabelText(/^Numero$/i) as HTMLInputElement).value).toBe('742');
    expect(screen.getByText(/Confirmar\?/)).toBeDefined();
    expect(screen.getByText(/Avenida Paulista, 742/)).toBeDefined();
  });

  it('botão "Continuar" avança com número vazio pro motorista digitar', async () => {
    cepMock.mockResolvedValue({ ok: true, cep: '01310100', endereco: enderecoExemplo, fonte: 'api' });
    lerTextoDaImagem.mockResolvedValueOnce({ texto: FOTO_SO_CEP, confianca: 90 });

    const user = userEvent.setup();
    render(<InputEnderecoNF numeroNF={1} totalNFs={70} onConfirmar={vi.fn()} />);

    fotografar();
    await waitFor(() => screen.getByTestId('ocr-continuar'));
    await user.click(screen.getByTestId('ocr-continuar'));

    await waitFor(() => screen.getByLabelText(/^Numero$/i));
    expect((screen.getByLabelText(/^Numero$/i) as HTMLInputElement).value).toBe('');
    expect(screen.getByText(/Confirmar\?/)).toBeDefined();
  });

  it('3 fotos sem número → avança mesmo assim (não fica preso)', async () => {
    cepMock.mockResolvedValue({ ok: true, cep: '01310100', endereco: enderecoExemplo, fonte: 'api' });
    lerTextoDaImagem.mockResolvedValue({ texto: FOTO_SO_CEP, confianca: 90 }); // sempre só CEP

    render(<InputEnderecoNF numeroNF={1} totalNFs={70} onConfirmar={vi.fn()} />);

    fotografar(); // 1
    await waitFor(() => screen.getByTestId('ocr-parcial'));
    fotografar(); // 2
    await waitFor(() => screen.getByTestId('ocr-parcial'));
    fotografar(); // 3 → esgotou, avança

    await waitFor(() => screen.getByLabelText(/^Numero$/i));
    expect((screen.getByLabelText(/^Numero$/i) as HTMLInputElement).value).toBe('');
    expect(screen.getByText(/Confirmar\?/)).toBeDefined();
  });
});
