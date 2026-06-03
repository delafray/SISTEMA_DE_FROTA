import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  SpeechRecognitionLike,
  SpeechRecognitionEventLike,
  SpeechRecognitionErrorEventLike,
} from '@/types/speech';

interface UseSpeechToTextReturn {
  transcript: string;
  listening: boolean;
  supported: boolean;
  start: (lang?: string) => void;
  stop: () => void;
  error: string | null;
}

export function useSpeechToText(): UseSpeechToTextReturn {
  const [transcript, setTranscript] = useState('');
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState(true); // Assumimos true até verificar no mount

  // Usa useRef para guardar a instância para não recriar a cada render e permitir cleanup
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Acessa as implementações do browser
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSupported(false);
      return;
    }

    setSupported(true);
    const recognition = new SpeechRecognition();
    
    // Configurações padrão
    recognition.continuous = false; // Para sozinho quando o usuário parar de falar
    recognition.interimResults = true; // Retorna resultados parciais enquanto fala
    recognition.lang = 'pt-BR';

    recognition.onstart = () => {
      setListening(true);
      setError(null);
    };

    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      let currentTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        currentTranscript += event.results[i][0].transcript;
      }
      setTranscript(currentTranscript);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEventLike) => {
      setError(event.error);
      setListening(false);
    };

    recognition.onend = () => {
      setListening(false);
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort(); // Interrompe se o componente desmontar
      }
    };
  }, []);

  const start = useCallback((lang: string = 'pt-BR') => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.lang = lang;
        recognitionRef.current.start();
        setTranscript('');
        setError(null);
      } catch {
        // Se já estiver escutando, o start() lança erro "recognition has already started". Ignoramos.
      }
    }
  }, []);

  const stop = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  }, []);

  return { transcript, listening, supported, start, stop, error };
}
