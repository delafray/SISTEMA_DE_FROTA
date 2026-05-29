import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSpeechToText } from '@/hooks/useSpeechToText';

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
      const event = {
        resultIndex: 0,
        results: [
          [{ transcript: transcriptText }]
        ]
      };
      this.onresult(event as any);
    }
  }

  simulateError(errorType: string) {
    if (this.onerror) {
      this.onerror({ error: errorType } as any);
    }
  }
}

describe('useSpeechToText', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (global as any).window = global;
  });

  it('deve retornar supported: false se a API nao existir no browser', () => {
    delete (window as any).SpeechRecognition;
    delete (window as any).webkitSpeechRecognition;

    const { result } = renderHook(() => useSpeechToText());
    
    expect(result.current.supported).toBe(false);
  });

  it('deve retornar supported: true e inicializar corretamente', () => {
    (window as any).SpeechRecognition = MockSpeechRecognition;

    const { result } = renderHook(() => useSpeechToText());
    
    expect(result.current.supported).toBe(true);
    expect(result.current.listening).toBe(false);
    expect(result.current.transcript).toBe('');
    expect(result.current.error).toBeNull();
  });

  it('deve alterar o estado listening e processar resultados ao iniciar', () => {
    let mockInstance: any;

    class ConstructorMock extends MockSpeechRecognition {
      constructor() {
        super();
        mockInstance = this;
      }
    }
    (window as any).SpeechRecognition = ConstructorMock;

    const { result } = renderHook(() => useSpeechToText());
    
    act(() => {
      result.current.start();
    });

    expect(result.current.listening).toBe(true);

    act(() => {
      mockInstance.simulateResult('teste de voz');
    });

    expect(result.current.transcript).toBe('teste de voz');

    act(() => {
      mockInstance.stop();
    });

    expect(result.current.listening).toBe(false);
  });

  it('deve lidar com erros de reconhecimento', () => {
    let mockInstance: any;

    class ConstructorMock extends MockSpeechRecognition {
      constructor() {
        super();
        mockInstance = this;
      }
    }
    (window as any).SpeechRecognition = ConstructorMock;

    const { result } = renderHook(() => useSpeechToText());
    
    act(() => {
      result.current.start();
    });

    expect(result.current.listening).toBe(true);

    act(() => {
      mockInstance.simulateError('not-allowed');
    });

    expect(result.current.error).toBe('not-allowed');
    expect(result.current.listening).toBe(false);
  });
});
