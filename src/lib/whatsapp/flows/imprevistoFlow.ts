/**
 * Imprevisto Flow — Comunicar imprevisto na estrada.
 *
 * Seção 6.10 do plano:
 * 1. Motorista escolhe tipo (trânsito, pane, acidente, etc)
 * 2. Estima tempo de atraso
 * 3. Opcionalmente envia foto/áudio
 * 4. Alerta ao gestor criado automaticamente
 */

import type { ParsedMessage } from '@/lib/whatsapp/messageParser';
import { enviarTexto, enviarBotoes, enviarLista } from '@/lib/whatsapp/messageSender';
import { updateSession, resetToMenu, type Sessao } from '@/lib/whatsapp/sessionManager';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const TIPOS_IMPREVISTO = [
  { id: 'imp_transito', titulo: '🚦 Trânsito', valor: 'transito' },
  { id: 'imp_acidente', titulo: '💥 Acidente na pista', valor: 'acidente_pista' },
  { id: 'imp_pane', titulo: '🔧 Pane mecânica', valor: 'pane_mecanica' },
  { id: 'imp_clima', titulo: '🌧️ Clima ruim', valor: 'clima' },
  { id: 'imp_fiscal', titulo: '🚓 Fiscalização', valor: 'fiscalizacao' },
  { id: 'imp_outro', titulo: '💼 Outro', valor: 'outro' },
];

const TEMPOS_ATRASO = [
  { id: 'tempo_15', titulo: '15 min', minutos: 15 },
  { id: 'tempo_30', titulo: '30 min', minutos: 30 },
  { id: 'tempo_60', titulo: '1 hora', minutos: 60 },
  { id: 'tempo_120', titulo: '2 horas', minutos: 120 },
  { id: 'tempo_nd', titulo: 'Não sei', minutos: null },
];

export async function processarImprevistoFlow(
  msg: ParsedMessage,
  sessao: Sessao,
  iniciar?: boolean
): Promise<void> {
  if (iniciar) {
    await enviarLista(
      msg.from,
      'O que aconteceu?',
      '⚠️ Selecionar',
      [{ titulo: 'Tipo', itens: TIPOS_IMPREVISTO.map((t) => ({ id: t.id, titulo: t.titulo })) }]
    );
    await updateSession(sessao.id, { estado: 'aguardando_imprevisto_tipo' });
    return;
  }

  switch (sessao.estado) {
    case 'aguardando_imprevisto_tipo':
      await processarTipo(msg, sessao);
      return;

    case 'aguardando_imprevisto_tempo':
      await processarTempo(msg, sessao);
      return;

    case 'aguardando_imprevisto_midia':
      await processarMidia(msg, sessao);
      return;
  }
}

async function processarTipo(msg: ParsedMessage, sessao: Sessao): Promise<void> {
  if (msg.tipo !== 'lista' || !msg.listaId?.startsWith('imp_')) {
    await enviarTexto(msg.from, 'Selecione o tipo de imprevisto da lista. ⚠️');
    return;
  }

  const tipo = TIPOS_IMPREVISTO.find((t) => t.id === msg.listaId);
  if (!tipo) return;

  await updateSession(sessao.id, {
    estado: 'aguardando_imprevisto_tempo',
    contexto: {
      imprevisto_dados: { tipo: tipo.valor, tipo_label: tipo.titulo },
    },
  });

  await enviarLista(
    msg.from,
    'Quanto tempo de atraso, mais ou menos?',
    '⏱️ Selecionar',
    [{ titulo: 'Tempo', itens: TEMPOS_ATRASO.map((t) => ({ id: t.id, titulo: t.titulo })) }]
  );
}

async function processarTempo(msg: ParsedMessage, sessao: Sessao): Promise<void> {
  if (msg.tipo !== 'lista' || !msg.listaId?.startsWith('tempo_')) {
    await enviarTexto(msg.from, 'Selecione o tempo estimado de atraso. ⏱️');
    return;
  }

  const tempo = TEMPOS_ATRASO.find((t) => t.id === msg.listaId);
  if (!tempo) return;

  const dados = sessao.contexto.imprevisto_dados as Record<string, unknown> ?? {};

  await updateSession(sessao.id, {
    estado: 'aguardando_imprevisto_midia',
    contexto: {
      imprevisto_dados: {
        ...dados,
        tempo_estimado_min: tempo.minutos,
        tempo_label: tempo.titulo,
      },
    },
  });

  await enviarBotoes(
    msg.from,
    'Quer mandar uma foto ou áudio explicando?',
    [
      { id: 'imp_foto', titulo: '📸 Foto' },
      { id: 'imp_pular', titulo: '⏭️ Só registrar' },
    ]
  );
}

async function processarMidia(msg: ParsedMessage, sessao: Sessao): Promise<void> {
  // Pular mídia
  if (msg.tipo === 'botao' && msg.botaoId === 'imp_pular') {
    await salvarImprevisto(msg.from, sessao);
    return;
  }

  // Foto ou áudio recebido → salvar URL e confirmar
  if ((msg.tipo === 'foto' || msg.tipo === 'audio') && msg.mediaId) {
    const { getMediaUrl } = await import('@/lib/whatsapp/messageParser');
    const mediaUrl = await getMediaUrl(msg.mediaId);

    const dados = sessao.contexto.imprevisto_dados as Record<string, unknown> ?? {};
    await updateSession(sessao.id, {
      contexto: {
        imprevisto_dados: { ...dados, foto_url: mediaUrl },
      },
    });

    await salvarImprevisto(msg.from, sessao);
    return;
  }

  // Texto livre → salvar como observação
  if (msg.tipo === 'texto' && msg.texto) {
    const dados = sessao.contexto.imprevisto_dados as Record<string, unknown> ?? {};
    await updateSession(sessao.id, {
      contexto: {
        imprevisto_dados: { ...dados, observacao: msg.texto },
      },
    });
    await salvarImprevisto(msg.from, sessao);
    return;
  }

  await enviarBotoes(msg.from, 'Mande foto/áudio ou clique para só registrar:', [
    { id: 'imp_pular', titulo: '⏭️ Só registrar' },
  ]);
}

async function salvarImprevisto(para: string, sessao: Sessao): Promise<void> {
  const supabase = getSupabase();
  const dados = sessao.contexto.imprevisto_dados as Record<string, unknown> | undefined;

  if (!dados) {
    await enviarTexto(para, '❌ Erro interno. Tente novamente.');
    await resetToMenu(sessao.id);
    return;
  }

  // Buscar frete ativo
  const { data: freteAtivo } = await supabase
    .from('fretes')
    .select('id')
    .eq('veiculo_id', sessao.contexto.veiculo_id ?? '')
    .eq('status', 'em_andamento')
    .maybeSingle();

  const { error } = await supabase.from('imprevistos').insert({
    frete_id: freteAtivo?.id ?? null,
    motorista_id: sessao.motorista_id,
    empresa_id: sessao.empresa_id,
    veiculo_id: sessao.contexto.veiculo_id ?? null,
    tipo: dados.tipo as string,
    tempo_estimado_min: (dados.tempo_estimado_min as number) ?? null,
    observacao: (dados.observacao as string) ?? null,
    foto_url: (dados.foto_url as string) ?? null,
    origem: 'whatsapp',
  });

  if (error) {
    console.error('[imprevistoFlow] Erro ao salvar:', error);
    await enviarTexto(para, '❌ Erro ao registrar imprevisto. Tente novamente.');
    return;
  }

  const tipoLabel = (dados.tipo_label as string) ?? '';
  const tempoLabel = (dados.tempo_label as string) ?? '';

  await enviarTexto(
    para,
    `✅ Avisado! O gestor já recebeu.\n*${tipoLabel}* (≈ ${tempoLabel})\nPode continuar a viagem 🛣️`
  );

  // O trigger no banco cria alerta ao gestor automaticamente
  await resetToMenu(sessao.id);
}
