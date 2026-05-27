/**
 * Adiantamento Flow — Pedir adiantamento via WhatsApp.
 *
 * Seção 6.8 do plano:
 * 1. Motorista escolhe tipo (pedágio, alimentação, etc)
 * 2. Digita valor
 * 3. Confirma
 * 4. Cria registro com status='pendente' + alerta ao gestor
 */

import type { ParsedMessage } from '@/lib/whatsapp/messageParser';
import { enviarTexto } from '@/lib/whatsapp/messageSender';
import { enviarMenuLista, enviarMenuBotoes } from '@/lib/whatsapp/menuHelper';
import { updateSession, resetToMenu, type Sessao } from '@/lib/whatsapp/sessionManager';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const TIPOS_ADIANTAMENTO = [
  { id: 'tipo_pedagio', titulo: '⛽ Pedágio', valor: 'pedagio' },
  { id: 'tipo_alimentacao', titulo: '🍽️ Alimentação', valor: 'alimentacao' },
  { id: 'tipo_hospedagem', titulo: '🏨 Hospedagem', valor: 'hospedagem' },
  { id: 'tipo_reparo', titulo: '🔧 Reparo pequeno', valor: 'reparo' },
  { id: 'tipo_outro', titulo: '💼 Outro', valor: 'outro' },
];

export async function processarAdiantamentoFlow(
  msg: ParsedMessage,
  sessao: Sessao,
  iniciar?: boolean
): Promise<void> {
  if (iniciar) {
    await enviarMenuLista(
      sessao.id,
      msg.from,
      'Para que é o adiantamento?',
      TIPOS_ADIANTAMENTO.map((t) => ({ id: t.id, titulo: t.titulo }))
    );
    await updateSession(sessao.id, { estado: 'aguardando_adiantamento_tipo' });
    return;
  }

  switch (sessao.estado) {
    case 'aguardando_adiantamento_tipo':
      await processarTipo(msg, sessao);
      return;

    case 'aguardando_adiantamento_valor':
      await processarValor(msg, sessao);
      return;

    case 'aguardando_confirmacao_adiantamento':
      await processarConfirmacao(msg, sessao);
      return;
  }
}

async function processarTipo(msg: ParsedMessage, sessao: Sessao): Promise<void> {
  if (msg.tipo !== 'lista' || !msg.listaId?.startsWith('tipo_')) {
    await enviarTexto(msg.from, 'Selecione o tipo de adiantamento da lista. 💰');
    return;
  }

  const tipo = TIPOS_ADIANTAMENTO.find((t) => t.id === msg.listaId);
  if (!tipo) return;

  await updateSession(sessao.id, {
    estado: 'aguardando_adiantamento_valor',
    contexto: {
      adiantamento_dados: { tipo: tipo.valor, tipo_label: tipo.titulo },
    },
  });

  await enviarTexto(msg.from, 'Quanto você precisa? Digite só o *valor* (R$):');
}

async function processarValor(msg: ParsedMessage, sessao: Sessao): Promise<void> {
  if (msg.tipo !== 'texto' || !msg.texto) {
    await enviarTexto(msg.from, 'Digite o valor do adiantamento (ex: 200):');
    return;
  }

  const valor = parseValor(msg.texto);
  if (valor === null || valor <= 0) {
    await enviarTexto(msg.from, 'Valor inválido. Digite apenas números (ex: 200 ou 200,00):');
    return;
  }

  const dados = sessao.contexto.adiantamento_dados as Record<string, unknown> ?? {};
  const tipoLabel = (dados.tipo_label as string) ?? 'Outro';
  const valorStr = `R$ ${valor.toFixed(2).replace('.', ',')}`;

  await enviarMenuBotoes(
    sessao.id,
    msg.from,
    `Confirmar? *${valorStr}* para *${tipoLabel}*.\nPosso mandar pro gestor?`,
    [
      { id: 'adiant_confirmar', titulo: '✅ Confirmar' },
      { id: 'adiant_cancelar', titulo: '❌ Cancelar' },
    ]
  );

  await updateSession(sessao.id, {
    estado: 'aguardando_confirmacao_adiantamento',
    contexto: {
      adiantamento_dados: { ...dados, valor },
    },
  });
}

async function processarConfirmacao(msg: ParsedMessage, sessao: Sessao): Promise<void> {
  if (msg.tipo === 'botao' && msg.botaoId === 'adiant_cancelar') {
    await enviarTexto(msg.from, '❌ Adiantamento cancelado.');
    await resetToMenu(sessao.id);
    return;
  }

  if (msg.tipo === 'botao' && msg.botaoId === 'adiant_confirmar') {
    await salvarAdiantamento(msg.from, sessao);
    return;
  }

  await enviarMenuBotoes(sessao.id, msg.from, 'Confirma o pedido?', [
    { id: 'adiant_confirmar', titulo: '✅ Confirmar' },
    { id: 'adiant_cancelar', titulo: '❌ Cancelar' },
  ]);
}

async function salvarAdiantamento(para: string, sessao: Sessao): Promise<void> {
  const supabase = getSupabase();
  const dados = sessao.contexto.adiantamento_dados as Record<string, unknown> | undefined;

  if (!dados) {
    await enviarTexto(para, '❌ Erro interno. Tente novamente.');
    await resetToMenu(sessao.id);
    return;
  }

  const { error } = await supabase.from('adiantamentos').insert({
    motorista_id: sessao.motorista_id ?? '',
    empresa_id: sessao.empresa_id,
    tipo: dados.tipo as string,
    valor: dados.valor as number,
    status: 'pendente',
  });

  if (error) {
    console.error('[adiantamentoFlow] Erro ao salvar:', error);
    await enviarTexto(para, '❌ Erro ao registrar pedido. Tente novamente.');
    return;
  }

  await enviarTexto(para, '✅ Pedido enviado! Você será avisado assim que for aprovado. ⏳');
  // O trigger no banco já cria alerta para o gestor
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
