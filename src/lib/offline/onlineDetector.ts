/**
 * Detector de status online/offline do navegador.
 *
 * Quando o motorista esta no depósito sem sinal e a internet volta,
 * dispara `sincronizarFila()` imediatamente — sem esperar o proximo tick
 * do setInterval do sync worker.
 *
 * BROWSER-ONLY. Em SSR/node, os exports sao no-op.
 *
 * Referência: PLANO_ROTEIRIZACAO.md secao 3.8 + passo 1.2.
 */

import { sincronizarFila } from './sync';

let _listenerAttached = false;

function handleOnline(): void {
  void sincronizarFila();
}

/**
 * Liga listener no `window.online` event. Retorna funcao pra desligar.
 * Idempotente: chamar de novo nao adiciona listeners duplicados.
 */
export function iniciarOnlineDetector(): () => void {
  if (typeof window === 'undefined') return () => {};
  if (_listenerAttached) return stopOnlineDetector;
  window.addEventListener('online', handleOnline);
  _listenerAttached = true;
  return stopOnlineDetector;
}

/** Desliga o listener. Pode ser chamado mesmo sem detector ligado. */
export function stopOnlineDetector(): void {
  if (typeof window === 'undefined' || !_listenerAttached) return;
  window.removeEventListener('online', handleOnline);
  _listenerAttached = false;
}

/** True se o navegador esta online (ou em ambiente sem `navigator`, assume true). */
export function estaOnline(): boolean {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine;
}

/** True se detector esta ativo (uso: UI). */
export function detectorAtivo(): boolean {
  return _listenerAttached;
}
