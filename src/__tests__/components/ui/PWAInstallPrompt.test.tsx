/**
 * Testes do PWAInstallPrompt — banner "📲 Instalar FROTA (use sem internet)".
 *
 * O componente depende de APIs do browser que o jsdom não traz por padrão
 * (matchMedia, beforeinstallprompt, userAgent mutável), então stubamos cada uma
 * por teste. O registro do Service Worker (2º useEffect) é inócuo aqui:
 * `'serviceWorker' in navigator` é falso no jsdom → early-return, sem crash.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { PWAInstallPrompt } from '@/components/ui/PWAInstallPrompt';

const UA_ANDROID = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36';
const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';
const UA_DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

function setUserAgent(ua: string) {
  Object.defineProperty(window.navigator, 'userAgent', { value: ua, configurable: true });
}

/** Stub do matchMedia: por padrão NÃO standalone (banner pode aparecer). */
function stubMatchMedia(standalone = false) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes('standalone') ? standalone : false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

/** Dispara o evento que o Chrome/Android emite quando o app é instalável. */
function dispararInstallPrompt(extra: Record<string, unknown> = {}) {
  const ev = new Event('beforeinstallprompt');
  Object.assign(ev, extra);
  act(() => {
    window.dispatchEvent(ev);
  });
  return ev;
}

beforeEach(() => {
  localStorage.clear();
  stubMatchMedia(false);
  setUserAgent(UA_ANDROID);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('PWAInstallPrompt', () => {
  it('no desktop não mostra o banner (é só pra celular)', () => {
    setUserAgent(UA_DESKTOP);
    render(<PWAInstallPrompt />);
    dispararInstallPrompt(); // mesmo que dispare, não deve aparecer
    expect(screen.queryByText(/Instalar FROTA/)).toBeNull();
  });

  it('no Android, ao ficar instalável, mostra o banner com foco em "sem internet" e botão Instalar', () => {
    render(<PWAInstallPrompt />);
    // Antes do evento, nada.
    expect(screen.queryByText(/Instalar FROTA/)).toBeNull();

    dispararInstallPrompt({ prompt: vi.fn(), userChoice: Promise.resolve({ outcome: 'accepted' }) });

    expect(screen.getByText(/Instalar FROTA/)).toBeInTheDocument();
    expect(screen.getByText(/sem internet/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Instalar' })).toBeInTheDocument();
  });

  it('clicar em Instalar dispara o prompt nativo de instalação', async () => {
    render(<PWAInstallPrompt />);
    const prompt = vi.fn().mockResolvedValue(undefined);
    dispararInstallPrompt({ prompt, userChoice: Promise.resolve({ outcome: 'accepted' }) });

    fireEvent.click(screen.getByRole('button', { name: 'Instalar' }));

    await waitFor(() => expect(prompt).toHaveBeenCalledOnce());
  });

  it('dispensar (✕) some com o banner e grava no localStorage', () => {
    render(<PWAInstallPrompt />);
    dispararInstallPrompt({ prompt: vi.fn(), userChoice: Promise.resolve({ outcome: 'dismissed' }) });

    fireEvent.click(screen.getByLabelText('Fechar'));

    expect(localStorage.getItem('pwa-install-dismissed')).toBe('true');
    expect(screen.queryByText(/Instalar FROTA/)).toBeNull();
  });

  it('se já foi dispensado antes, não mostra o banner de novo', () => {
    localStorage.setItem('pwa-install-dismissed', 'true');
    render(<PWAInstallPrompt />);
    dispararInstallPrompt({ prompt: vi.fn() });
    expect(screen.queryByText(/Instalar FROTA/)).toBeNull();
  });

  it('no iPhone mostra instrução de "Adicionar à Tela de Início" após 3s (sem prompt nativo)', () => {
    vi.useFakeTimers();
    setUserAgent(UA_IPHONE);
    render(<PWAInstallPrompt />);

    // iOS não tem beforeinstallprompt — o banner só aparece após o timer.
    expect(screen.queryByText(/Instalar FROTA/)).toBeNull();

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.getByText(/Instalar FROTA/)).toBeInTheDocument();
    expect(screen.getByText(/Adicionar à Tela de Início/)).toBeInTheDocument();
    // iOS não mostra botão "Instalar" (não existe prompt nativo no Safari).
    expect(screen.queryByRole('button', { name: 'Instalar' })).toBeNull();
  });

  it('quando já está instalado (standalone), nunca mostra o banner', () => {
    stubMatchMedia(true); // display-mode: standalone
    render(<PWAInstallPrompt />);
    dispararInstallPrompt({ prompt: vi.fn() });
    expect(screen.queryByText(/Instalar FROTA/)).toBeNull();
  });
});
