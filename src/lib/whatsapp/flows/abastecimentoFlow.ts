/**
 * Abastecimento Flow — Registrar abastecimento com OCR.
 *
 * Seção 6.5 do plano:
 * 1. Motorista envia foto do comprovante
 * 2. IA extrai litros, valor, posto (gpt-4o-mini)
 * 3. Mostra resumo + botões confirmar/corrigir
 * 4. Salva em abastecimentos
 */

import type { ParsedMessage } from '@/lib/whatsapp/messageParser';
import { getMediaUrl } from '@/lib/whatsapp/messageParser';
import { enviarTexto, enviarBotoes } from '@/lib/whatsapp/messageSender';
import { updateSession, resetToMenu, type Sessao } from '@/lib/whatsapp/sessionManager';
import { lerCupomAbastecimento } from '@/services/aiService';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function processarAbastecimentoFlow(msg: ParsedMessage, sessao: Sessao): Promise<void> {
  switch (sessao.estado) {
    case 'aguardando_foto_abastecimento':
      await processarFotoAbastecimento(msg, sessao);
      return;

    case 'aguardando_confirmacao_abastecimento':
      await processarConfirmacaoAbastecimento(msg, sessao);
      return;
  }
}

// ─── ETAPA 1: Receber foto do comprovante ────────────────────────────

async function processarFotoAbastecimento(msg: ParsedMessage, sessao: Sessao): Promise<void> {
  if (msg.tipo !== 'foto' || !msg.mediaId) {
    await enviarTexto(msg.from, '📸 Tire uma foto do comprovante de abastecimento.');
    return;
  }

  await enviarTexto(msg.from, '🔍 Analisando o comprovante...');

  const mediaUrl = await getMediaUrl(msg.mediaId);
  if (!mediaUrl) {
    await enviarTexto(msg.from, 'Não consegui baixar a foto. Tente novamente.');
    return;
  }

  const resultado = await lerCupomAbastecimento(mediaUrl);

  if (!resultado.ok) {
    // Fallback: pedir dados manualmente
    await enviarTexto(
      msg.from,
      'Não consegui ler o comprovante. 😕\nDigite os dados assim:\n*Litros, Valor Total, Nome do Posto*\n(ex: 45.3, 387.50, Shell Anhanguera)'
    );
    await updateSession(sessao.id, {
      contexto: { foto_url: mediaUrl },
    });
    return;
  }

  const { litros, valor_total, valor_litro, posto } = resultado.data;

  const litrosStr = litros ? `${litros.toFixed(1)} litros` : '---';
  const valorStr = valor_total ? `R$ ${valor_total.toFixed(2).replace('.', ',')}` : '---';
  const postoStr = posto ?? '---';

  const resumo = `⛽ *Abastecimento identificado:*\n\n🛢️ ${litrosStr}\n💰 ${valorStr}\n📍 ${postoStr}\n\nTá certo?`;

  await enviarBotoes(msg.from, resumo, [
    { id: 'abast_confirmar', titulo: '✅ Confirmar' },
    { id: 'abast_corrigir', titulo: '✏️ Corrigir' },
  ]);

  await updateSession(sessao.id, {
    estado: 'aguardando_confirmacao_abastecimento',
    contexto: {
      abastecimento_dados: {
        litros,
        valor_total,
        valor_litro,
        posto,
        foto_url: mediaUrl,
        ia_raw: resultado.data,
      },
    },
  });
}

// ─── ETAPA 2: Confirmar ou Corrigir ──────────────────────────────────

async function processarConfirmacaoAbastecimento(msg: ParsedMessage, sessao: Sessao): Promise<void> {
  // Confirmar
  if (msg.tipo === 'botao' && msg.botaoId === 'abast_confirmar') {
    await salvarAbastecimento(msg.from, sessao);
    return;
  }

  // Corrigir
  if (msg.tipo === 'botao' && msg.botaoId === 'abast_corrigir') {
    await enviarTexto(
      msg.from,
      'Ok! Digite os dados corretos assim:\n*Litros, Valor Total, Nome do Posto*\n(ex: 45.3, 387.50, Shell Anhanguera)'
    );
    return;
  }

  // Dados manuais (texto)
  if (msg.tipo === 'texto' && msg.texto) {
    const dados = parseDadosManuais(msg.texto);
    if (dados) {
      await updateSession(sessao.id, {
        contexto: {
          abastecimento_dados: {
            ...dados,
            foto_url: (sessao.contexto.abastecimento_dados as Record<string, unknown>)?.foto_url ?? sessao.contexto.foto_url ?? null,
          },
        },
      });
      await salvarAbastecimento(msg.from, sessao);
      return;
    }

    await enviarTexto(msg.from, 'Não entendi. Formato: *Litros, Valor Total, Posto*\n(ex: 45.3, 387.50, Shell)');
    return;
  }

  await enviarBotoes(msg.from, 'Use os botões:', [
    { id: 'abast_confirmar', titulo: '✅ Confirmar' },
    { id: 'abast_corrigir', titulo: '✏️ Corrigir' },
  ]);
}

// ─── SALVAR ──────────────────────────────────────────────────────────

async function salvarAbastecimento(para: string, sessao: Sessao): Promise<void> {
  const supabase = getSupabase();
  const dados = sessao.contexto.abastecimento_dados as Record<string, unknown> | undefined;

  if (!dados || !sessao.contexto.veiculo_id) {
    await enviarTexto(para, '❌ Erro interno. Tente novamente.');
    await resetToMenu(sessao.id);
    return;
  }

  const { error } = await supabase.from('abastecimentos').insert({
    veiculo_id: sessao.contexto.veiculo_id ?? '',
    motorista_id: sessao.motorista_id ?? '',
    empresa_id: sessao.empresa_id,
    litros: (dados.litros as number) ?? 0,
    valor_total: (dados.valor_total as number) ?? 0,
    valor_litro: (dados.valor_litro as number) ?? null,
    posto: (dados.posto as string) ?? null,
    foto_cupom_urls: dados.foto_url ? [dados.foto_url as string] : null,
    ia_raw_response: dados.ia_raw ? JSON.stringify(dados.ia_raw) : null,
  });

  if (error) {
    console.error('[abastecimentoFlow] Erro ao salvar:', error);
    await enviarTexto(para, '❌ Erro ao registrar abastecimento. Tente novamente.');
    return;
  }

  const valorStr = dados.valor_total ? `R$ ${(dados.valor_total as number).toFixed(2).replace('.', ',')}` : '';
  await enviarTexto(para, `✅ Abastecimento registrado! ${valorStr} ⛽`);
  await resetToMenu(sessao.id);
}

// ─── HELPERS ─────────────────────────────────────────────────────────

function parseDadosManuais(texto: string): { litros: number | null; valor_total: number | null; posto: string | null } | null {
  // Formato esperado: "45.3, 387.50, Shell Anhanguera"
  const partes = texto.split(',').map((p) => p.trim());
  if (partes.length < 2) return null;

  const litros = parseFloat(partes[0].replace(',', '.'));
  const valor = parseFloat(partes[1].replace(',', '.'));

  if (isNaN(litros) && isNaN(valor)) return null;

  return {
    litros: isNaN(litros) ? null : litros,
    valor_total: isNaN(valor) ? null : valor,
    posto: partes[2] ?? null,
  };
}
