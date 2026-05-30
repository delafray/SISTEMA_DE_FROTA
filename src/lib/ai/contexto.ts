/**
 * Helpers de contexto de mensagem — fonte unica pra prefixos/formatacao.
 * Antes (B8 do BOT_FRAMEWORK.md) o prefixo "[Motorista: X]" era duplicado
 * em geminiClient + geminiBot. Mudanca em um lugar desincronizava o outro.
 */

export function prefixarComRemetente(mensagem: string, nomeRemetente?: string): string {
  if (!nomeRemetente || !nomeRemetente.trim()) return mensagem;
  return `[Motorista: ${nomeRemetente.trim()}] ${mensagem}`;
}
