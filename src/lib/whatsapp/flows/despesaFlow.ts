/**
 * Despesa Flow — Registrar despesa com foto do cupom.
 *
 * Seção 6.9 do plano:
 * 1. Motorista escolhe tipo de despesa
 * 2. Tira foto do cupom/recibo
 * 3. IA extrai valor, tipo, local (gpt-4o-mini)
 * 4. Confirma e salva
 */

import type { ParsedMessage } from '@/lib/whatsapp/messageParser';
import { getMediaUrl } from '@/lib/whatsapp/messageParser';
import { persistirMidiaNoR2, chaveMidia } from '@/lib/storage/r2';
import { enviarTexto } from '@/lib/whatsapp/messageSender';
import { enviarMenuLista, enviarMenuBotoes } from '@/lib/whatsapp/menuHelper';
import { updateSession, resetToMenu, type Sessao } from '@/lib/whatsapp/sessionManager';
import { lerCupomGenerico } from '@/services/aiService';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const TIPOS_DESPESA = [
  { id: 'desp_pedagio', titulo: '⛽ Pedágio', valor: 'pedagio' },
  { id: 'desp_alimentacao', titulo: '🍽️ Alimentação', valor: 'alimentacao' },
  { id: 'desp_hospedagem', titulo: '🏨 Hospedagem', valor: 'hospedagem' },
  { id: 'desp_lavagem', titulo: '🚿 Lavagem', valor: 'lavagem' },
  { id: 'desp_reparo', titulo: '🔧 Reparo', valor: 'reparo' },
  { id: 'desp_outro', titulo: '💼 Outro', valor: 'outro' },
];

export async function processarDespesaFlow(
  msg: ParsedMessage,
  sessao: Sessao,
  iniciar?: boolean
): Promise<void> {
  if (iniciar) {
    await enviarMenuLista(
      sessao.id,
      msg.from,
      'Que tipo de despesa?',
      TIPOS_DESPESA.map((t) => ({ id: t.id, titulo: t.titulo }))
    );
    await updateSession(sessao.id, { estado: 'aguardando_despesa_tipo' });
    return;
  }

  switch (sessao.estado) {
    case 'aguardando_despesa_tipo':
      await processarTipoDespesa(msg, sessao);
      return;

    case 'aguardando_despesa_foto':
      await processarFotoDespesa(msg, sessao);
      return;

    case 'aguardando_confirmacao_despesa':
      await processarConfirmacaoDespesa(msg, sessao);
      return;
  }
}

async function processarTipoDespesa(msg: ParsedMessage, sessao: Sessao): Promise<void> {
  if (msg.tipo !== 'lista' || !msg.listaId?.startsWith('desp_')) {
    await enviarTexto(msg.from, 'Selecione o tipo de despesa da lista. 🧾');
    return;
  }

  const tipo = TIPOS_DESPESA.find((t) => t.id === msg.listaId);
  if (!tipo) return;

  await updateSession(sessao.id, {
    estado: 'aguardando_despesa_foto',
    contexto: {
      despesa_dados: { tipo: tipo.valor, tipo_label: tipo.titulo },
    },
  });

  await enviarTexto(msg.from, '📸 Tire uma foto do cupom/recibo.');
}

async function processarFotoDespesa(msg: ParsedMessage, sessao: Sessao): Promise<void> {
  // Se mandou texto com valor → aceitar manualmente
  if (msg.tipo === 'texto' && msg.texto) {
    const valor = parseValor(msg.texto);
    if (valor !== null) {
      const dados = sessao.contexto.despesa_dados as Record<string, unknown> ?? {};
      await updateSession(sessao.id, {
        contexto: {
          despesa_dados: { ...dados, valor, local: null },
        },
      });
      await salvarDespesa(msg.from, sessao);
      return;
    }

    await enviarTexto(msg.from, '📸 Mande a foto do cupom, ou *digite o valor* (ex: 18.50):');
    return;
  }

  if (msg.tipo !== 'foto' || !msg.mediaId) {
    await enviarTexto(msg.from, '📸 Tire uma foto do cupom/recibo. Ou *digite o valor*.');
    return;
  }

  await enviarTexto(msg.from, '🔍 Analisando o cupom...');

  const mediaUrl = await getMediaUrl(msg.mediaId);
  if (!mediaUrl) {
    await enviarTexto(msg.from, 'Não consegui baixar a foto. *Digite o valor* da despesa:');
    return;
  }

  // Persiste a foto no R2 (URL curta); o OCR continua usando a data URL `mediaUrl`.
  const fotoUrl = await persistirMidiaNoR2(mediaUrl, chaveMidia('despesas', sessao.empresa_id));

  const resultado = await lerCupomGenerico(mediaUrl);

  if (!resultado.ok) {
    await enviarTexto(msg.from, 'Não consegui ler o cupom. 😕\n*Digite o valor* da despesa (ex: 18.50):');
    return;
  }

  const { valor, local, descricao } = resultado.data;
  const valorStr = valor ? `R$ ${valor.toFixed(2).replace('.', ',')}` : '---';
  const localStr = local ?? '---';

  await enviarMenuBotoes(
    sessao.id,
    msg.from,
    `🧾 *Despesa identificada:*\n${descricao ?? ''}\n💰 ${valorStr}\n📍 ${localStr}\n\nTá certo?`,
    [
      { id: 'desp_confirmar', titulo: '✅ Confirmar' },
      { id: 'desp_corrigir', titulo: '✏️ Corrigir valor' },
    ]
  );

  const dados = sessao.contexto.despesa_dados as Record<string, unknown> ?? {};
  await updateSession(sessao.id, {
    estado: 'aguardando_confirmacao_despesa',
    contexto: {
      despesa_dados: { ...dados, valor, local, descricao, foto_url: fotoUrl, ia_raw: resultado.data },
    },
  });
}

async function processarConfirmacaoDespesa(msg: ParsedMessage, sessao: Sessao): Promise<void> {
  if (msg.tipo === 'botao' && msg.botaoId === 'desp_confirmar') {
    await salvarDespesa(msg.from, sessao);
    return;
  }

  if (msg.tipo === 'botao' && msg.botaoId === 'desp_corrigir') {
    await enviarTexto(msg.from, '*Digite o valor* correto (ex: 18.50):');
    return;
  }

  // Texto com valor → corrigir
  if (msg.tipo === 'texto' && msg.texto) {
    const valor = parseValor(msg.texto);
    if (valor !== null) {
      const dados = sessao.contexto.despesa_dados as Record<string, unknown> ?? {};
      const dadosAtualizados = { ...dados, valor };
      sessao.contexto.despesa_dados = dadosAtualizados;
      await updateSession(sessao.id, {
        contexto: { despesa_dados: dadosAtualizados },
      });
      await salvarDespesa(msg.from, sessao);
      return;
    }
  }

  await enviarMenuBotoes(sessao.id, msg.from, 'Use os botões:', [
    { id: 'desp_confirmar', titulo: '✅ Confirmar' },
    { id: 'desp_corrigir', titulo: '✏️ Corrigir valor' },
  ]);
}

async function salvarDespesa(para: string, sessao: Sessao): Promise<void> {
  const supabase = getSupabase();
  const dados = sessao.contexto.despesa_dados as Record<string, unknown> | undefined;

  if (!dados) {
    await enviarTexto(para, '❌ Erro interno. Tente novamente.');
    await resetToMenu(sessao.id);
    return;
  }

  const { error } = await supabase.from('despesas_veiculo').insert({
    veiculo_id: sessao.contexto.veiculo_id ?? '',
    motorista_id: sessao.motorista_id ?? '',
    empresa_id: sessao.empresa_id,
    tipo: dados.tipo as string,
    valor: (dados.valor as number) ?? 0,
    local: (dados.local as string) ?? null,
    foto_cupom_urls: dados.foto_url ? [dados.foto_url as string] : null,
    confirmado: true,
    ia_raw_response: dados.ia_raw ? JSON.stringify(dados.ia_raw) : null,
  });

  if (error) {
    console.error('[despesaFlow] Erro ao salvar:', error);
    await enviarTexto(para, '❌ Erro ao registrar despesa. Tente novamente.');
    return;
  }

  const valorStr = dados.valor ? `R$ ${(dados.valor as number).toFixed(2).replace('.', ',')}` : '';
  await enviarTexto(para, `✅ Despesa registrada! ${valorStr} 🧾`);
  await resetToMenu(sessao.id);
}

function parseValor(texto: string): number | null {
  let limpo = texto.replace(/R\$\s*/gi, '').replace(/\s/g, '');
  if (limpo.includes(',')) {
    limpo = limpo.replace(/\./g, '').replace(',', '.');
  }
  const num = parseFloat(limpo);
  if (isNaN(num) || num < 0 || num > 99_999) return null;
  return Math.round(num * 100) / 100;
}
