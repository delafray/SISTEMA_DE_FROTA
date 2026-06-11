'use client';

/**
 * useOcrState — estado de acúmulo de fotos OCR por NF.
 *
 * O motorista pode tirar até MAX_FOTOS_OCR fotos da mesma NF (ex: 1ª pega o
 * CEP, 2ª um close do número). O texto de cada foto é somado e re-extraído a
 * cada nova foto. Este hook encapsula toda essa lógica de acúmulo.
 *
 * Estados expostos:
 *   ocrFotos    — quantas fotos foram acumuladas
 *   ocrParcial  — resultado parcial: CEP lido mas número ainda faltando
 *   ocrDica     — mensagem de orientação ao motorista (reenquadrar / conferir)
 *   ocrLendo    — true enquanto o worker de OCR está processando
 *
 * Callbacks:
 *   handleOcrTexto    — chamado pelo BotaoCamera com o resultado de cada foto
 *   handleContinuarComOcr — o motorista toca "Continuar" no cartão parcial
 *   setOcrLendo       — passado direto ao BotaoCamera (onLendoChange)
 *   resetarOcr        — zera o acúmulo (ao confirmar / cancelar / voltar ao CEP)
 */

import { useCallback, useRef, useState } from 'react';
import { extrairEnderecoDeOCR, type EnderecoOCR } from '@/lib/ocr/extrairEnderecoDeOCR';
import type { ResultadoOCR } from '@/lib/ocr/lerImagem';

/** Máximo de fotos acumuladas por NF antes de seguir pro preenchimento manual. */
export const MAX_FOTOS_OCR = 3;

interface UseOcrStateParams {
  /** Chamado quando CEP foi lido com sucesso (e opcionalmente número).
   *  Nota: o aviso de qualidade/múltiplos CEPs já foi gravado em ocrDica
   *  pelo hook antes de disparar este callback. */
  onCepLido: (cep: string, numero?: string) => void;
}

interface UseOcrStateReturn {
  ocrFotos: number;
  ocrParcial: EnderecoOCR | null;
  ocrDica: string | null;
  /** Permite ao pai (ou BotaoCamera.onErro) setar uma dica diretamente. */
  setOcrDica: (v: string | null) => void;
  ocrLendo: boolean;
  setOcrLendo: (v: boolean) => void;
  handleOcrTexto: (resultado: ResultadoOCR) => void;
  handleContinuarComOcr: () => void;
  resetarOcr: () => void;
}

export function useOcrState({ onCepLido }: UseOcrStateParams): UseOcrStateReturn {
  const [ocrFotos, setOcrFotos] = useState(0);
  const [ocrParcial, setOcrParcial] = useState<EnderecoOCR | null>(null);
  const [ocrDica, setOcrDica] = useState<string | null>(null);
  const [ocrLendo, setOcrLendo] = useState(false);
  const ocrTextosRef = useRef<string[]>([]);

  const resetarOcr = useCallback(() => {
    ocrTextosRef.current = [];
    setOcrFotos(0);
    setOcrParcial(null);
  }, []);

  // Recebe o texto de UMA foto e SOMA ao texto das fotos anteriores da mesma NF
  // (até MAX_FOTOS_OCR). Re-extrai do texto acumulado a cada foto:
  //  - CEP + número achados (ou esgotou as fotos) → chama onCepLido → 'confirmar'.
  //  - CEP achado, falta número e ainda há fotos → mostra cartão parcial.
  //  - Sem CEP → orienta reenquadrar no bloco do destinatário e fotografar de novo.
  const handleOcrTexto = useCallback((resultado: ResultadoOCR) => {
    setOcrDica(null);

    const textos = [...ocrTextosRef.current, resultado.texto];
    ocrTextosRef.current = textos;
    setOcrFotos(textos.length);

    const ext = extrairEnderecoDeOCR(textos.join('\n'));
    const aviso =
      resultado.confianca && resultado.confianca < 60
        ? 'Leitura com baixa qualidade — confira o endereço antes de confirmar.'
        : ext.cepsEncontrados.length > 1
          ? 'A nota tinha mais de um CEP — usei o do destinatário. Confira o endereço.'
          : null;

    if (ext.cep) {
      // Achou número OU esgotou as fotos → avança. Número vazio = motorista digita.
      if (ext.numero || textos.length >= MAX_FOTOS_OCR) {
        if (aviso) setOcrDica(aviso);
        resetarOcr();
        onCepLido(ext.cep, ext.numero ?? undefined);
        return;
      }
      // CEP lido, falta o número e ainda há fotos disponíveis → oferece nova foto.
      setOcrParcial(ext);
      return;
    }

    // Sem CEP.
    setOcrParcial(null);
    if (textos.length >= MAX_FOTOS_OCR) {
      setOcrDica('Não consegui ler o CEP em 3 fotos. Digite ou fale o CEP.');
    } else {
      setOcrDica(
        `Não achei o CEP. Aproxime a câmera do bloco do DESTINATÁRIO (endereço de entrega) e fotografe de novo (foto ${textos.length + 1} de ${MAX_FOTOS_OCR}) — ou digite/fale o CEP.`
      );
    }
  }, [onCepLido, resetarOcr]);

  // "Continuar" no cartão parcial: segue pro endereço com o CEP lido e deixa o
  // motorista digitar o número (campo já focado na tela de confirmar).
  const handleContinuarComOcr = useCallback(() => {
    if (!ocrTextosRef.current.length) return;
    const ext = extrairEnderecoDeOCR(ocrTextosRef.current.join('\n'));
    if (!ext.cep) return;
    resetarOcr();
    onCepLido(ext.cep, ext.numero ?? undefined);
  }, [onCepLido, resetarOcr]);

  return {
    ocrFotos,
    ocrParcial,
    ocrDica,
    setOcrDica,
    ocrLendo,
    setOcrLendo,
    handleOcrTexto,
    handleContinuarComOcr,
    resetarOcr,
  };
}
