/**
 * Helpers de dispositivo/UX mobile compartilhados entre as telas do motorista.
 *
 * Antes, `vibrar()` estava copiado em 3 arquivos (rota, ajuste-rota,
 * InputEnderecoNF) e a trava de orientacao em 2 (rota, captura-notas).
 * Centralizado aqui pra ter uma fonte só.
 *
 * Tudo BROWSER-ONLY com guards — em SSR/jsdom vira no-op silencioso.
 */

/** Vibra o aparelho (se suportado). Aceita duracao em ms ou padrao [on,off,...]. */
export function vibrar(padrao: number | number[] = 50): void {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    navigator.vibrate(padrao);
  }
}

/**
 * Trava a tela em retrato quando possivel. Android Chrome suporta; iOS e
 * navegadores sem permissao ignoram silenciosamente (catch). No-op em SSR.
 */
export function lockOrientacaoRetrato(): void {
  if (typeof window === 'undefined') return;
  type ScreenOrientationLock = ScreenOrientation & { lock?: (o: string) => Promise<void> };
  const so = screen.orientation as ScreenOrientationLock | undefined;
  if (so && typeof so.lock === 'function') {
    so.lock('portrait').catch(() => { /* iOS / browser sem permissao — ok */ });
  }
}
