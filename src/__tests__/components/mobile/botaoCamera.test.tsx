/**
 * Testes do BotaoCamera — seleção da foto dispara o OCR e reporta texto/erro.
 * Mocka o wrapper de OCR (sem WASM real).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const lerTextoDaImagem = vi.fn();
vi.mock('@/lib/ocr/lerImagem', () => ({
  lerTextoDaImagem: (...a: unknown[]) => lerTextoDaImagem(...a),
}));

import { BotaoCamera } from '@/components/mobile/BotaoCamera';

function selecionarFoto() {
  const input = screen.getByTestId('ocr-file-input') as HTMLInputElement;
  const file = new File(['fake-bytes'], 'nota.jpg', { type: 'image/jpeg' });
  fireEvent.change(input, { target: { files: [file] } });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('BotaoCamera', () => {
  it('lê a foto e devolve o texto do OCR via onTexto', async () => {
    lerTextoDaImagem.mockResolvedValue({ texto: 'CEP 01310-100', confianca: 90 });
    const onTexto = vi.fn();
    const onLendoChange = vi.fn();
    render(<BotaoCamera onTexto={onTexto} onLendoChange={onLendoChange} />);

    selecionarFoto();

    await waitFor(() => expect(onTexto).toHaveBeenCalledWith({ texto: 'CEP 01310-100', confianca: 90 }));
    expect(lerTextoDaImagem).toHaveBeenCalledOnce();
    // Sinalizou início e fim da leitura
    expect(onLendoChange).toHaveBeenCalledWith(true);
    expect(onLendoChange).toHaveBeenLastCalledWith(false);
  });

  it('falha do OCR → onErro e não chama onTexto', async () => {
    lerTextoDaImagem.mockRejectedValue(new Error('wasm boom'));
    const onTexto = vi.fn();
    const onErro = vi.fn();
    render(<BotaoCamera onTexto={onTexto} onErro={onErro} />);

    selecionarFoto();

    await waitFor(() => expect(onErro).toHaveBeenCalled());
    expect(onTexto).not.toHaveBeenCalled();
  });

  it('sem arquivo selecionado não dispara OCR', () => {
    render(<BotaoCamera onTexto={vi.fn()} />);
    const input = screen.getByTestId('ocr-file-input') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [] } });
    expect(lerTextoDaImagem).not.toHaveBeenCalled();
  });
});
