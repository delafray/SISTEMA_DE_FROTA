/**
 * Lembretes do router — detecção determinística e gravação (extraído do
 * messageRouter na quebra de 22/07/2026; comportamento idêntico).
 *
 * Camadas (da mais exata pra mais ampla):
 *  1. `tentarLembreteDeterministico` — gatilho EXATO ("lembrete:", "me lembra",
 *     "anota que"). Custo 0 token, roda antes de cota/sessão/role.
 *  2. `salvarComoLembrete` — MODO_SOMENTE_LEMBRETE: TODA mensagem vira lembrete
 *     (texto direto; áudio transcrito via Deepgram), com trava da tabela
 *     `telefones` (autorização Anotar).
 *  3. `pareceLembreteLeve` — sinal amplo (guarda/registra/salva/não esquece)
 *     usado só pra FORÇAR a tool criar_lembrete no Gemini (mode ANY).
 */

import type { ParsedMessage } from '@/lib/whatsapp/messageParser';
import { getMediaAsBase64DataUrl } from '@/lib/whatsapp/messageParser';
import { createLogger } from '@/lib/logger';
import type { UserIdentity } from '@/lib/whatsapp/auth';
import { enviarTexto } from '@/lib/whatsapp/messageSender';
import { transcreverAudio } from '@/services/aiService';
import { extrairLembrete } from '@/lib/whatsapp/lembreteParser';
import { criarLembrete } from '@/lib/ai/tools/frotaTools';
import { verificarTelefone } from '@/lib/whatsapp/autorizacao';

const log = createLogger('router');

/**
 * Detecção DETERMINÍSTICA de lembrete (custo 0 token), reutilizável em qualquer
 * ponto do router. Roda ANTES da guarda de cota, do gate de ociosidade e do
 * intent classifier — o gatilho exato ("lembrete", "me lembra", "anota") sempre
 * salva, independente de role (motorista/gestor/master), estado da sessão ou
 * orçamento da IA. A tool do Gemini (criar_lembrete) fica como reserva pra frases
 * fora do padrão.
 *
 * Retorno:
 *  - true  → era lembrete (já tratado: salvo, ou pediu o texto). O caller deve `return`.
 *  - false → NÃO era lembrete. Segue o fluxo normal.
 */
export async function tentarLembreteDeterministico(
  msg: ParsedMessage,
  identity: UserIdentity,
  empresaId?: string
): Promise<boolean> {
  if (msg.tipo !== 'texto' || !msg.texto) return false;
  const conteudo = extrairLembrete(msg.texto);
  if (conteudo === null) return false;

  const usuarioId = ('usuario_id' in identity ? identity.usuario_id : undefined) ?? undefined;
  const nomeQuemMandou = 'nome' in identity ? identity.nome : undefined;

  if (!conteudo) {
    log.info('lembrete_deterministico_detectado', { from: msg.from, sem_conteudo: true });
    await enviarTexto(msg.from, '📝 O que você quer anotar? Ex: "lembrete: comprar pneu"');
    return true;
  }

  log.info('lembrete_deterministico_detectado', { from: msg.from, chars: conteudo.length });
  const r = await criarLembrete(empresaId ?? '', usuarioId, conteudo, nomeQuemMandou, msg.from);
  if (r.ok) {
    log.info('lembrete_deterministico_salvo', { from: msg.from, empresa_id: empresaId });
  } else {
    log.warn('lembrete_deterministico_falhou', { from: msg.from, erro: r.erro });
  }
  await enviarTexto(
    msg.from,
    r.ok
      ? `✅ Anotado: ${conteudo}\n\nVai aparecer no painel até alguém dar ciência.`
      : '❌ Não consegui salvar o lembrete agora. Tenta de novo em instantes.'
  );
  return true;
}

/**
 * Limpa o texto do lembrete: tira um prefixo opcional ("lembrete:", "nota -",
 * "anota aí", "aviso") quando há conteúdo depois. Se sobrar vazio, mantém o
 * texto original (melhor salvar algo do que nada).
 */
export function limparTextoLembrete(texto: string): string {
  const t = (texto ?? '').trim();
  const m = t.match(/^(?:lembrete|lembra|lembrar|nota|aviso|anota|anote|anotar)\b[\s:,.\-–—!]*([\s\S]*)/i);
  const limpo = m && m[1].trim() ? m[1].trim() : t;
  return limpo;
}

/**
 * MODO SOMENTE LEMBRETE — grava QUALQUER mensagem como lembrete, sem LLM.
 * Texto → salva direto. Áudio → transcreve (Deepgram) e salva. Outros tipos
 * (foto/doc/localização) → orienta a mandar texto/áudio. Loga cada etapa pra
 * dar visibilidade total no Vercel.
 */
export async function salvarComoLembrete(msg: ParsedMessage, identity: UserIdentity): Promise<void> {
  // TRAVA do telefone (tabela `telefones` / tela /autorizacoes): só número
  // cadastrado + Ativo + Anotar pode anotar. Não autorizado recebe aviso.
  const auth = await verificarTelefone(msg.from);
  if (!auth.ok) {
    log.warn('lembrete_bloqueado', { from: msg.from, motivo: auth.motivo });
    await enviarTexto(msg.from, 'Seu número não está autorizado a usar o sistema.');
    return;
  }
  if (!auth.anotar) {
    log.warn('lembrete_sem_permissao_anotar', { from: msg.from });
    await enviarTexto(msg.from, 'Seu número não tem permissão para anotar lembretes.');
    return;
  }

  const empresaId = 'empresa_id' in identity ? identity.empresa_id : undefined;
  const usuarioId = ('usuario_id' in identity ? identity.usuario_id : undefined) ?? undefined;
  const nome = 'nome' in identity ? identity.nome : undefined;

  let texto: string | null = null;

  if (msg.tipo === 'texto' && msg.texto) {
    texto = msg.texto;
  } else if (msg.tipo === 'audio' && msg.messageId) {
    // Áudio: baixa via Evolution (descriptografa) e transcreve. O download usa
    // messageId (NÃO mediaId — a URL crua do CDN vem encriptada e inútil).
    log.info('lembrete_audio_transcrevendo', { from: msg.from });
    const dataUrl = await getMediaAsBase64DataUrl(msg.messageId);
    if (dataUrl) {
      const tr = await transcreverAudio(dataUrl);
      if (tr.ok && tr.data.texto) texto = tr.data.texto;
    }
    if (!texto) {
      log.warn('lembrete_audio_falha_transcricao', { from: msg.from });
      await enviarTexto(msg.from, '🎤 Não consegui entender o áudio. Pode repetir ou mandar por texto?');
      return;
    }
  } else {
    await enviarTexto(
      msg.from,
      'Por enquanto eu só anoto lembretes por *texto* ou *áudio*. Manda assim que eu registro. 📝'
    );
    return;
  }

  const conteudo = limparTextoLembrete(texto).trim();
  if (!conteudo) {
    await enviarTexto(msg.from, '📝 Manda o que você quer que eu anote. Ex: "comprar pneu pro caminhão".');
    return;
  }

  log.info('lembrete_salvando', {
    from: msg.from,
    empresa_id: empresaId,
    origem: msg.tipo,
    chars: conteudo.length,
  });
  const r = await criarLembrete(empresaId ?? '', usuarioId, conteudo, nome, msg.from);
  if (r.ok) {
    log.info('lembrete_salvo', { from: msg.from, empresa_id: empresaId });
    await enviarTexto(msg.from, `✅ Anotado!\n\n"${conteudo}"\n\nJá está no painel.`);
  } else {
    log.error('lembrete_falhou', { from: msg.from, empresa_id: empresaId, erro: r.erro, codigo: r.codigo });
    await enviarTexto(msg.from, '❌ Não consegui salvar agora. Tenta de novo em instantes.');
  }
}

/**
 * Sinal LEVE de intenção de lembrete — propositalmente mais amplo que o parser
 * exato (extrairLembrete). Pega verbos de "guardar informação" que o parser
 * evita por ambiguidade (guarda/registra/salva/não esquece). Usado SÓ pra decidir
 * forçar a tool criar_lembrete no Gemini (mode ANY); a desambiguação final fica
 * com o modelo. NÃO dispara em "nota fiscal" / consultas.
 */
export function pareceLembreteLeve(texto: string): boolean {
  const t = (texto ?? '').toLowerCase();
  if (!t.trim()) return false;
  // Exclui "nota fiscal" / "nota de ..." pra não confundir com despesa/documento.
  if (/\bnota\s+fiscal\b/.test(t)) return false;
  return /\b(guarda|guardar|registra|registrar|registro|salva|salvar|anota|anote|n[ãa]o\s+esque[çc]a|n[ãa]o\s+esquece)\b/.test(t);
}
