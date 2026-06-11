/**
 * Utilitarios internos da tela Ajuste de Rota.
 * Logica pura — sem React, sem side-effects.
 */

import type { Parada } from '@/lib/routing/types';

/**
 * Reordena paradas pondo as ja entregues (concluida_em != null) no topo,
 * por timestamp de conclusao ASC. Pendentes vem depois na ordem original.
 * Motorista nao quer ficar olhando pra paradas terminadas no meio da lista.
 */
export function ordenarConcluidasPrimeiro(paradas: Parada[]): Parada[] {
  const concluidas = paradas
    .filter((p) => p.concluida_em)
    .sort((a, b) => (a.concluida_em ?? '').localeCompare(b.concluida_em ?? ''));
  const pendentes = paradas.filter((p) => !p.concluida_em).sort((a, b) => a.ordem - b.ordem);
  return [...concluidas, ...pendentes];
}

/**
 * Bipe curto sintetizado via Web Audio API (sem precisar de arquivo .mp3).
 * Cria/destroi o contexto sob demanda — leve. Falha silenciosamente em
 * browsers sem suporte (ou autoplay-blocked).
 */
export function bipeCurto(): void {
  try {
    type WindowAudio = typeof window & { webkitAudioContext?: typeof AudioContext };
    const w = window as WindowAudio;
    const AC = window.AudioContext ?? w.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 660; // E5 (audivel mas nao agressivo)
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
    osc.onended = () => ctx.close();
  } catch { /* sem permissao de audio — ok */ }
}
