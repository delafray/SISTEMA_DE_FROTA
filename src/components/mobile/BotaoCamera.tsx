'use client';

import { useRef, useState } from 'react';
import { lerTextoDaImagem, type ResultadoOCR } from '@/lib/ocr/lerImagem';
import { cores } from '@/lib/mobile/ui';

interface BotaoCameraProps {
  /** Recebe o texto bruto do OCR + confiança média (0-100) pra o pai extrair o endereço. */
  onTexto: (resultado: ResultadoOCR) => void;
  /** Avisa o pai quando começa/termina a leitura (pra ele mostrar "lendo…"/desabilitar). */
  onLendoChange?: (lendo: boolean) => void;
  /** Reporta erro de leitura pro pai exibir na área de status. */
  onErro?: (msg: string) => void;
  disabled?: boolean;
}

/**
 * Botão 📷 "Ler nota" — irmão do BotaoMicrofone. Abre a câmera do celular,
 * roda OCR (Tesseract, offline) na foto da nota e devolve o texto pro pai.
 * Mantém a foto fora de qualquer upload: tudo roda no aparelho.
 */
export function BotaoCamera({ onTexto, onLendoChange, onErro, disabled }: BotaoCameraProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [lendo, setLendo] = useState(false);

  const handleArquivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Limpa o value pra permitir re-selecionar a MESMA foto (onChange dispara de novo).
    e.target.value = '';
    if (!file) return;

    setLendo(true);
    onLendoChange?.(true);
    try {
      const resultado = await lerTextoDaImagem(file);
      onTexto(resultado);
    } catch (err) {
      console.error('Erro no OCR:', err);
      onErro?.('Não consegui ler a foto. Tente de novo com mais luz.');
    } finally {
      setLendo(false);
      onLendoChange?.(false);
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleArquivo}
        style={{ display: 'none' }}
        aria-hidden="true"
        tabIndex={-1}
        data-testid="ocr-file-input"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || lendo}
        aria-label={lendo ? 'Lendo a nota' : 'Ler nota com a câmera'}
        data-testid="btn-ler-nota"
        style={{
          width: 48,
          height: 48,
          borderRadius: '50%',
          border: 'none',
          background: lendo ? '#dbeafe' : cores.divisoria,
          color: lendo ? cores.azul : cores.textoFraco,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 22,
          cursor: disabled || lendo ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
          transition: 'all 0.2s',
        }}
      >
        {lendo ? '⏳' : '📷'}
      </button>
    </>
  );
}
