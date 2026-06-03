'use client';

import { useEffect } from 'react';
import { useSpeechToText } from '@/hooks/useSpeechToText';
import { cores } from '@/lib/mobile/ui';

interface BotaoMicrofoneProps {
  onTranscricao: (texto: string) => void;
  disabled?: boolean;
  /** Tamanho do botão circular em px. Padrão: 48. */
  tamanho?: number;
}

export function BotaoMicrofone({ onTranscricao, disabled, tamanho = 48 }: BotaoMicrofoneProps) {
  const { transcript, listening, supported, start, stop, error } = useSpeechToText();

  // Quando a escuta terminar e houver uma transcrição, passamos para o pai
  useEffect(() => {
    if (!listening && transcript) {
      onTranscricao(transcript);
    }
  }, [listening, transcript, onTranscricao]);

  // Se houver erro, podemos disparar um callback ou apenas parar de tentar
  useEffect(() => {
    if (error) {
      console.error('Erro no SpeechToText:', error);
    }
  }, [error]);

  if (!supported) {
    return null; // Não renderiza nada se o browser não suporta
  }

  const handleClick = () => {
    if (listening) {
      stop();
    } else {
      start();
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      aria-label={listening ? "Parar gravação" : "Falar endereço"}
      style={{
        width: tamanho,
        height: tamanho,
        borderRadius: '50%',
        border: 'none',
        background: listening ? '#fee2e2' : cores.divisoria,
        color: listening ? '#ef4444' : cores.textoFraco,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: Math.round(tamanho * 0.5),
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'all 0.2s',
        boxShadow: listening ? '0 0 0 4px rgba(239, 68, 68, 0.2)' : 'none',
        animation: listening ? 'pulse 1.5s infinite' : 'none',
        position: 'relative',
        flexShrink: 0,
      }}
    >
      {listening ? '🔴' : '🎤'}
      
      {/* Estilo embutido para a animação do pulse */}
      <style>{`
        @keyframes pulse {
          0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
          70% { box-shadow: 0 0 0 10px rgba(239, 68, 68, 0); }
          100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
        }
      `}</style>
    </button>
  );
}
