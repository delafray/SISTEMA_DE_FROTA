/**
 * Avaria Flow — Relatar avaria com IA Analysis.
 *
 * Seção 6.3 do plano:
 * 1. Motorista envia foto, áudio ou texto
 * 2. IA analisa e classifica urgência (gpt-4o)
 * 3. Mostra resumo + botões confirmar/adicionar foto
 * 4. Se urgência ALTA ou CRITICA → alerta automático ao gestor
 */

import type { ParsedMessage } from '@/lib/whatsapp/messageParser';
import { getMediaUrl } from '@/lib/whatsapp/messageParser';
import { enviarTexto, enviarBotoes } from '@/lib/whatsapp/messageSender';
import { updateSession, resetToMenu, type Sessao } from '@/lib/whatsapp/sessionManager';
import { analisarAvaria, type AnaliseAvaria } from '@/services/aiService';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function processarAvariaFlow(msg: ParsedMessage, sessao: Sessao): Promise<void> {
  switch (sessao.estado) {
    case 'aguardando_avaria_midia':
      await processarMidiaAvaria(msg, sessao);
      return;

    case 'aguardando_confirmacao_avaria':
      await processarConfirmacaoAvaria(msg, sessao);
      return;
  }
}

// ─── ETAPA 1: Receber mídia da avaria ────────────────────────────────

async function processarMidiaAvaria(msg: ParsedMessage, sessao: Sessao): Promise<void> {
  let resultado;
  let fotoUrl: string | null = null;

  // FOTO
  if (msg.tipo === 'foto' && msg.mediaId) {
    await enviarTexto(msg.from, '🔍 Analisando a foto da avaria...');

    const mediaUrl = await getMediaUrl(msg.mediaId);
    if (!mediaUrl) {
      await enviarTexto(msg.from, 'Não consegui baixar a foto. Descreva o problema por *texto*:');
      return;
    }

    fotoUrl = mediaUrl;
    resultado = await analisarAvaria({ tipo: 'foto', url: mediaUrl });
  }
  // ÁUDIO
  else if (msg.tipo === 'audio' && msg.mediaId) {
    await enviarTexto(msg.from, '🎤 Ouvindo seu áudio...');

    const mediaUrl = await getMediaUrl(msg.mediaId);
    if (!mediaUrl) {
      await enviarTexto(msg.from, 'Não consegui baixar o áudio. Descreva o problema por *texto*:');
      return;
    }

    resultado = await analisarAvaria({ tipo: 'audio', url: mediaUrl });
  }
  // TEXTO
  else if (msg.tipo === 'texto' && msg.texto) {
    resultado = await analisarAvaria({ tipo: 'texto', texto: msg.texto });
  }
  // Outro tipo
  else {
    await enviarTexto(msg.from, 'Mande uma *foto*, *áudio* ou *texto* descrevendo o problema. 🔍');
    return;
  }

  // Verificar resultado
  if (!resultado || !resultado.ok) {
    // Fallback: registrar avaria sem IA
    await enviarTexto(msg.from, 'Não consegui analisar automaticamente. 😕\nDescreva o problema em *texto* que eu registro:');
    return;
  }

  const { descricao, urgencia, recomendacao } = resultado.data;

  // Montar mensagem de resumo
  const emojiUrgencia = {
    baixa: '🟢',
    media: '🟡',
    alta: '🟠',
    critica: '🔴',
  }[urgencia];

  const textoResumo = `⚠️ *Avaria registrada:*\n\n${descricao}\n\nUrgência: *${urgencia.toUpperCase()}* ${emojiUrgencia}\nRecomendação: ${recomendacao}\n\nDeseja adicionar mais fotos?`;

  await enviarBotoes(msg.from, textoResumo, [
    { id: 'avaria_confirmar', titulo: '✅ Confirmar' },
    { id: 'avaria_foto', titulo: '📸 Adicionar foto' },
  ]);

  await updateSession(sessao.id, {
    estado: 'aguardando_confirmacao_avaria',
    contexto: {
      avaria_dados: {
        descricao,
        urgencia,
        recomendacao,
        foto_url: fotoUrl,
        ia_raw: resultado.data,
      },
    },
  });
}

// ─── ETAPA 2: Confirmar ou adicionar foto ────────────────────────────

async function processarConfirmacaoAvaria(msg: ParsedMessage, sessao: Sessao): Promise<void> {
  // Botão confirmar
  if (msg.tipo === 'botao' && msg.botaoId === 'avaria_confirmar') {
    await salvarAvaria(msg.from, sessao);
    return;
  }

  // Botão adicionar foto → voltar para aguardando mídia
  if (msg.tipo === 'botao' && msg.botaoId === 'avaria_foto') {
    await enviarTexto(msg.from, '📸 Mande mais uma foto da avaria:');
    await updateSession(sessao.id, { estado: 'aguardando_avaria_midia' });
    return;
  }

  // Foto enviada diretamente
  if (msg.tipo === 'foto') {
    await processarMidiaAvaria(msg, sessao);
    return;
  }

  await enviarBotoes(msg.from, 'Use os botões:', [
    { id: 'avaria_confirmar', titulo: '✅ Confirmar' },
    { id: 'avaria_foto', titulo: '📸 Adicionar foto' },
  ]);
}

// ─── SALVAR AVARIA ───────────────────────────────────────────────────

async function salvarAvaria(para: string, sessao: Sessao): Promise<void> {
  const supabase = getSupabase();
  const dados = sessao.contexto.avaria_dados as AnaliseAvaria & { foto_url?: string; ia_raw?: unknown } | undefined;

  if (!dados || !sessao.contexto.veiculo_id) {
    await enviarTexto(para, '❌ Erro interno. Tente novamente.');
    await resetToMenu(sessao.id);
    return;
  }

  const { error } = await supabase.from('avarias').insert({
    veiculo_id: sessao.contexto.veiculo_id,
    motorista_id: sessao.motorista_id,
    empresa_id: sessao.empresa_id,
    descricao: dados.descricao,
    urgencia: dados.urgencia,
    recomendacao_ia: dados.recomendacao,
    foto_url: dados.foto_url ?? null,
    status: 'aberta',
    origem: 'whatsapp',
    ia_raw_response: dados.ia_raw ? JSON.stringify(dados.ia_raw) : null,
  });

  if (error) {
    console.error('[avariaFlow] Erro ao salvar avaria:', error);
    await enviarTexto(para, '❌ Erro ao registrar avaria. Tente novamente.');
    return;
  }

  await enviarTexto(para, '✅ Avaria registrada! O gestor já foi notificado. 👍');

  // Se urgência alta/crítica → alerta criado automaticamente pelo trigger no banco
  if (dados.urgencia === 'alta' || dados.urgencia === 'critica') {
    console.log(`[avariaFlow] ⚠️ Avaria ${dados.urgencia.toUpperCase()} registrada. Alerta ao gestor via trigger.`);
  }

  await resetToMenu(sessao.id);
}
