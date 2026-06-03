import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSpeechToText } from '@/hooks/useSpeechToText';
import type {
  SpeechRecognitionConstructor,
  SpeechRecognitionEventLike,
  SpeechRecognitionErrorEventLike,
} from '@/types/speech';

// Mock do SpeechRecognition
class MockSpeechRecognition {
  continuous = false;
  interimResults = false;
  lang = '';
  onstart = vi.fn();
  onresult = vi.fn();
  onerror = vi.fn();
  onend = vi.fn();
  start = vi.fn(() => {
    if (this.onstart) this.onstart(new Event('start'));
  });
  stop = vi.fn(() => {
    if (this.onend) this.onend(new Event('end'));
  });
  abort = vi.fn();

  // Simula o browser disparando o evento result
  simulateResult(transcriptText: string) {
    if (this.onresult) {
      const event: SpeechRecognitionEventLike = {
        resultIndex: 0,
        results: {
          length: 1,
          0: { length: 1, 0: { transcript: transcriptText } },
        },
      };
      this.onresult(event);
    }
  }

  simulateError(errorType: string) {
    if (this.onerror) {
      const event: SpeechRecognitionErrorEventLike = { error: errorType };
      this.onerror(event);
    }
  }
}

/** Atalho de cast: a classe-mock satisfaz o contrato em runtime, não no tipo do vi.fn. */
const asCtor = (c: typeof MockSpeechRecognition): SpeechRecognitionConstructor =>
  c as unknown as SpeechRecognitionConstructor;

describe('useSpeechToText', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (global as unknown as { window: unknown }).window = global;
  });

  it('deve retornar supported: false se a API nao existir no browser', () => {
    delete window.SpeechRecognition;
    delete window.webkitSpeechRecognition;

    const { result } = renderHook(() => useSpeechToText());

    expect(result.current.supported).toBe(false);
  });

  it('deve retornar supported: true e inicializar corretamente', () => {
    window.SpeechRecognition = asCtor(MockSpeechRecognition);

    const { result } = renderHook(() => useSpeechToText());

    expect(result.current.supported).toBe(true);
    expect(result.current.listening).toBe(false);
    expect(result.current.transcript).toBe('');
    expect(result.current.error).toBeNull();
  });

  it('deve alterar o estado listening e processar resultados ao iniciar', () => {
    let mockInstance: MockSpeechRecognition | undefined;

    class ConstructorMock extends MockSpeechRecognition {
      constructor() {
        super();
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        mockInstance = this;
      }
    }
    window.SpeechRecognition = asCtor(ConstructorMock);

    const { result } = renderHook(() => useSpeechToText());

    act(() => {
      result.current.start();
    });

    expect(result.current.listening).toBe(true);

    act(() => {
      mockInstance!.simulateResult('teste de voz');
    });

    expect(result.current.transcript).toBe('teste de voz');

    act(() => {
      mockInstance!.stop();
    });

    expect(result.current.listening).toBe(false);
  });

  it('deve lidar com erros de reconhecimento', () => {
    let mockInstance: MockSpeechRecognition | undefined;

    class ConstructorMock extends MockSpeechRecognition {
      constructor() {
        super();
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        mockInstance = this;
      }
    }
    window.SpeechRecognition = asCtor(ConstructorMock);

    const { result } = renderHook(() => useSpeechToText());

    act(() => {
      result.current.start();
    });

    expect(result.current.listening).toBe(true);

    act(() => {
      mockInstance!.simulateError('not-allowed');
    });

    expect(result.current.error).toBe('not-allowed');
    expect(result.current.listening).toBe(false);
  });
});
