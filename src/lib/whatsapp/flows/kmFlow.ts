/**
 * KM Flow — Fluxo de informar quilometragem com IA Vision.
 *
 * Seção 6.2 do plano:
 * 1. Motorista envia foto do painel
 * 2. IA lê o odômetro (gpt-4o-mini)
 * 3. Se confiança ≥ 85% → mostra valor + botões confirmar/digitar
 * 4. Se confiança < 85% → pede digitação manual
 * 5. Salva em km_logs + atualiza veiculos.km_atual via trigger
 */

import type { ParsedMessage } from '@/lib/whatsapp/messageParser';
import { getMediaUrl } from '@/lib/whatsapp/messageParser';
import { enviarTexto } from '@/lib/whatsapp/messageSender';
import { enviarMenuBotoes } from '@/lib/whatsapp/menuHelper';
import { updateSession, resetToMenu, type Sessao } from '@/lib/whatsapp/sessionManager';
import { lerOdometro } from '@/services/aiService';
import { createClient } from '@supabase/supabase-js';

const CONFIANCA_MINIMA = 85;

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function processarKmFlow(msg: ParsedMessage, sessao: Sessao): Promise<void> {
  switch (sessao.estado) {
    case 'aguardando_foto_km':
      await processarFotoKm(msg, sessao);
      return;

    case 'aguardando_confirmacao_km':
      await processarConfirmacaoKm(msg, sessao);
      return;

    case 'aguardando_km_manual':
      await processarKmManual(msg, sessao);
      return;
  }
}

// ─── ETAPA 1: Receber foto do painel ─────────────────────────────────

async function processarFotoKm(msg: ParsedMessage, sessao: Sessao): Promise<void> {
  // Se mandou texto em vez de foto → pedir foto novamente ou aceitar digitação
  if (msg.tipo === 'texto' && msg.texto) {
    // Verificar se é um número (digitação direta)
    const km = parseKm(msg.texto);
    if (km !== null) {
      await salvarKm(msg.from, sessao, km, 'manual');
      return;
    }

    await enviarTexto(msg.from, 'Preciso de uma *foto do painel* mostrando o odômetro. 📷\nOu *digite o KM* manualmente (ex: 125430).');
    return;
  }

  if (msg.tipo !== 'foto' || !msg.mediaId) {
    await enviarTexto(msg.from, 'Tire uma foto clara do painel mostrando o odômetro. 📷');
    return;
  }

  // Buscar URL da mídia na Meta
  await enviarTexto(msg.from, '🔍 Analisando a foto do painel...');

  const mediaUrl = await getMediaUrl(msg.mediaId);
  if (!mediaUrl) {
    await enviarTexto(msg.from, 'Não consegui baixar a foto. Tente novamente ou *digite o KM* manualmente.');
    await updateSession(sessao.id, { estado: 'aguardando_km_manual' });
    return;
  }

  // Chamar IA
  const resultado = await lerOdometro(mediaUrl);

  if (!resultado.ok) {
    // Fallback manual — nunca trava o motorista
    await enviarTexto(msg.from, 'Não consegui ler o odômetro. 😕\nPor favor, *digite* o KM:');
    await updateSession(sessao.id, { estado: 'aguardando_km_manual' });
    return;
  }

  const { km, confianca } = resultado.data;

  if (confianca >= CONFIANCA_MINIMA) {
    // IA confiante → confirmar com botões
    const kmFormatado = new Intl.NumberFormat('pt-BR').format(km);

    await enviarMenuBotoes(
      sessao.id,
      msg.from,
      `✅ KM lido: *${kmFormatado} km*\nEstá correto?`,
      [
        { id: 'km_confirmar', titulo: '✅ Confirmar' },
        { id: 'km_digitar', titulo: '✏️ Digitar manual' },
      ]
    );

    await updateSession(sessao.id, {
      estado: 'aguardando_confirmacao_km',
      contexto: { km_lido: km, km_confianca: confianca, foto_url: mediaUrl },
    });
  } else {
    // Confiança baixa → pedir digitação
    await enviarTexto(
      msg.from,
      `Não consegui ler bem o odômetro (confiança: ${confianca}%). 😕\nPor favor, *digite* o KM:`
    );
    await updateSession(sessao.id, {
      estado: 'aguardando_km_manual',
      contexto: { foto_url: mediaUrl },
    });
  }
}

// ─── ETAPA 2: Confirmar leitura da IA ────────────────────────────────

async function processarConfirmacaoKm(msg: ParsedMessage, sessao: Sessao): Promise<void> {
  if (msg.tipo === 'botao') {
    if (msg.botaoId === 'km_confirmar') {
      const km = sessao.contexto.km_lido;
      if (typeof km !== 'number') {
        await enviarTexto(msg.from, 'Erro interno. Digite o KM manualmente:');
        await updateSession(sessao.id, { estado: 'aguardando_km_manual' });
        return;
      }
      await salvarKm(msg.from, sessao, km, 'ia_confirmado');
      return;
    }

    if (msg.botaoId === 'km_digitar') {
      await enviarTexto(msg.from, 'Ok! *Digite* o KM correto:');
      await updateSession(sessao.id, { estado: 'aguardando_km_manual' });
      return;
    }
  }

  // Se mandou texto com número → aceitar como correção
  if (msg.tipo === 'texto' && msg.texto) {
    const km = parseKm(msg.texto);
    if (km !== null) {
      await salvarKm(msg.from, sessao, km, 'manual');
      return;
    }
  }

  await enviarMenuBotoes(
    sessao.id,
    msg.from,
    'Use os botões para confirmar ou corrigir:',
    [
      { id: 'km_confirmar', titulo: '✅ Confirmar' },
      { id: 'km_digitar', titulo: '✏️ Digitar manual' },
    ]
  );
}

// ─── ETAPA 3: Digitação manual ───────────────────────────────────────

async function processarKmManual(msg: ParsedMessage, sessao: Sessao): Promise<void> {
  if (msg.tipo !== 'texto' || !msg.texto) {
    await enviarTexto(msg.from, '*Digite* o KM do odômetro (apenas números, ex: 125430):');
    return;
  }

  const km = parseKm(msg.texto);
  if (km === null) {
    await enviarTexto(msg.from, 'Não entendi. Digite apenas o *número* do KM (ex: 125430):');
    return;
  }

  await salvarKm(msg.from, sessao, km, 'manual');
}

// ─── SALVAR KM ───────────────────────────────────────────────────────

async function salvarKm(
  para: string,
  sessao: Sessao,
  km: number,
  origem: 'ia_confirmado' | 'manual'
): Promise<void> {
  const supabase = getSupabase();

  const veiculoId = sessao.contexto.veiculo_id;
  if (!veiculoId) {
    await enviarTexto(para, 'Erro: nenhum caminhão selecionado. Envie "Oi" para começar.');
    return;
  }

  // Inserir km_log (o trigger propaga para veiculos.km_atual)
  const { error } = await supabase.from('km_logs').insert({
    veiculo_id: veiculoId,
    motorista_id: sessao.motorista_id ?? '',
    empresa_id: sessao.empresa_id,
    km_lido: km,
    tipo: 'informado',
    foto_urls: sessao.contexto.foto_url ? [sessao.contexto.foto_url as string] : null,
    ia_raw_response: sessao.contexto.km_lido
      ? JSON.stringify({ km_lido: sessao.contexto.km_lido, confianca: sessao.contexto.km_confianca })
      : null,
  });

  if (error) {
    console.error('[kmFlow] Erro ao salvar KM:', error);

    // Verificar se é erro de KM retroativo (trigger bloqueia)
    if (error.message?.includes('km_atual') || error.message?.includes('retroativ')) {
      await enviarTexto(
        para,
        '⚠️ O KM informado é *menor* que o atual do caminhão.\nDigite um valor igual ou maior, ou fale com o gestor.'
      );
      return;
    }

    await enviarTexto(para, '❌ Erro ao salvar KM. Tente novamente.');
    return;
  }

  const kmFormatado = new Intl.NumberFormat('pt-BR').format(km);
  await enviarTexto(para, `✅ KM *${kmFormatado}* registrado com sucesso! 👍`);
  await resetToMenu(sessao.id);
}

// ─── HELPERS ─────────────────────────────────────────────────────────

function parseKm(texto: string): number | null {
  // Remove pontos, vírgulas, espaços, "km", "KM"
  const limpo = texto.replace(/[.\s]/g, '').replace(/,.*$/, '').replace(/km/gi, '').trim();
  const num = parseInt(limpo, 10);
  if (isNaN(num) || num <= 0 || num > 9_999_999) return null;
  return num;
}
