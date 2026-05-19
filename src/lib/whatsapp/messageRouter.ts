/**
 * Message Router — Cérebro central do bot WhatsApp.
 *
 * Recebe uma mensagem parseada e direciona para o fluxo correto
 * com base no estado da sessão + tipo da mensagem + role do remetente.
 *
 * Ordem de decisão:
 * 1. Identificar remetente (motorista / gestor / desconhecido)
 * 2. Buscar/criar sessão
 * 3. Se há estado pendente → delegar ao fluxo correto
 * 4. Se não há estado → analisar a mensagem (Smart Router ou menu)
 */

import type { ParsedMessage } from '@/lib/whatsapp/messageParser';
import { getMediaUrl } from '@/lib/whatsapp/messageParser';
import { createLogger } from '@/lib/logger';
import { identificarRemetente, type UserIdentity } from '@/lib/whatsapp/auth';
import { getOrCreateSession, updateSession, type Sessao } from '@/lib/whatsapp/sessionManager';
import { enviarTexto, enviarBotoes, enviarLista } from '@/lib/whatsapp/messageSender';
import {
  classificarMidia,
  classificarIntentTexto,
  transcreverAudio,
} from '@/services/aiService';
import { processarKmFlow } from '@/lib/whatsapp/flows/kmFlow';
import { processarAvariaFlow } from '@/lib/whatsapp/flows/avariaFlow';
import { processarViagemFlow } from '@/lib/whatsapp/flows/viagemFlow';
import { processarAbastecimentoFlow } from '@/lib/whatsapp/flows/abastecimentoFlow';
import { processarChecklistFlow } from '@/lib/whatsapp/flows/checklistFlow';
import { processarAdiantamentoFlow } from '@/lib/whatsapp/flows/adiantamentoFlow';
import { processarDespesaFlow } from '@/lib/whatsapp/flows/despesaFlow';
import { processarImprevistoFlow } from '@/lib/whatsapp/flows/imprevistoFlow';
import { processarGestorFlow } from '@/lib/whatsapp/flows/gestorFlow';

const log = createLogger('router');

const SMART_ROUTER_CONFIANCA_MINIMA = 60;

// ─── ROUTER PRINCIPAL ─────────────────────────────────────────────────

export async function processarMensagem(msg: ParsedMessage): Promise<void> {
  // 1. Identificar remetente
  const identity = await identificarRemetente(msg.from);

  if (identity.tipo === 'desconhecido') {
    log.warn('remetente_desconhecido', { from: msg.from, msg_id: msg.messageId });
    return;
  }

  // 2. Buscar/criar sessão
  const sessao = await getOrCreateSession({
    whatsapp: msg.from,
    motorista_id: identity.tipo === 'motorista' ? identity.motorista_id : null,
    usuario_id: identity.tipo === 'motorista' ? identity.usuario_id : identity.usuario_id,
    empresa_id: identity.empresa_id,
  });

  log.info('sessao_resolvida', {
    session_id: sessao.id,
    estado: sessao.estado,
    is_temp: sessao.id.startsWith('temp-'),
    empresa_id: sessao.empresa_id,
  });

  // 3. Rotear com base no role
  if (identity.tipo === 'motorista') {
    await rotearMotorista(msg, sessao, identity);
  } else {
    await rotearGestor(msg, sessao, identity);
  }
}

// ─── ROTEAMENTO MOTORISTA ─────────────────────────────────────────────

async function rotearMotorista(
  msg: ParsedMessage,
  sessao: Sessao,
  identity: Extract<UserIdentity, { tipo: 'motorista' }>
): Promise<void> {
  const { estado } = sessao;

  // Se sessão é nova ou saudação → enviar seleção de veículo
  if (estado === 'novo' || isSaudacao(msg)) {
    await enviarSelecaoVeiculo(msg.from, identity.nome, identity.empresa_id, sessao.id);
    return;
  }

  // Se está aguardando seleção de veículo
  if (estado === 'aguardando_veiculo') {
    await processarSelecaoVeiculo(msg, sessao, identity);
    return;
  }

  // ── ESTADOS DELEGADOS AOS FLOWS ──

  // KM
  if (['aguardando_foto_km', 'aguardando_confirmacao_km', 'aguardando_km_manual'].includes(estado)) {
    await processarKmFlow(msg, sessao);
    return;
  }

  // Avaria
  if (['aguardando_avaria_midia', 'aguardando_confirmacao_avaria'].includes(estado)) {
    await processarAvariaFlow(msg, sessao);
    return;
  }

  // Viagem
  if (['aguardando_origem_destino', 'aguardando_cliente', 'aguardando_valor_frete'].includes(estado)) {
    await processarViagemFlow(msg, sessao);
    return;
  }

  // Abastecimento
  if (['aguardando_foto_abastecimento', 'aguardando_confirmacao_abastecimento'].includes(estado)) {
    await processarAbastecimentoFlow(msg, sessao);
    return;
  }

  // Checklist
  if (estado === 'aguardando_checklist') {
    await processarChecklistFlow(msg, sessao);
    return;
  }

  // Adiantamento
  if (['aguardando_adiantamento_tipo', 'aguardando_adiantamento_valor', 'aguardando_confirmacao_adiantamento'].includes(estado)) {
    await processarAdiantamentoFlow(msg, sessao);
    return;
  }

  // Despesa
  if (['aguardando_despesa_tipo', 'aguardando_despesa_foto', 'aguardando_confirmacao_despesa'].includes(estado)) {
    await processarDespesaFlow(msg, sessao);
    return;
  }

  // Imprevisto
  if (['aguardando_imprevisto_tipo', 'aguardando_imprevisto_tempo', 'aguardando_imprevisto_midia'].includes(estado)) {
    await processarImprevistoFlow(msg, sessao);
    return;
  }

  // ── MENU PRINCIPAL (aguardando_acao) ──

  if (estado === 'aguardando_acao') {
    await processarMenuMotorista(msg, sessao);
    return;
  }

  // Fallback: qualquer estado não mapeado → voltar ao menu
  await enviarMenuMotorista(msg.from, sessao);
}

// ─── ROTEAMENTO GESTOR ────────────────────────────────────────────────

async function rotearGestor(
  msg: ParsedMessage,
  _sessao: Sessao,
  identity: Extract<UserIdentity, { tipo: 'gestor' | 'master' }>
): Promise<void> {
  await processarGestorFlow(msg, identity);
}

// ─── SELEÇÃO DE VEÍCULO ──────────────────────────────────────────────

async function enviarSelecaoVeiculo(
  para: string,
  nomeMotorista: string,
  empresaId: string,
  sessionId: string
): Promise<void> {
  log.info('enviar_selecao_veiculo_inicio', { para, empresa_id: empresaId });

  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: veiculos, error } = await supabase
    .from('veiculos')
    .select('id, placa, apelido, marca, modelo')
    .eq('empresa_id', empresaId)
    .eq('ativo', true)
    .order('placa');

  if (error) {
    log.error('veiculos_query_failed', { code: error.code, message: error.message });
  }

  log.info('veiculos_carregados', { count: veiculos?.length ?? 0, empresa_id: empresaId });

  if (!veiculos || veiculos.length === 0) {
    const enviado = await enviarTexto(para, `Olá, ${nomeMotorista}! 👋\n\nNenhum caminhão cadastrado na empresa. Fale com o gestor.`);
    log.info('aviso_sem_veiculo_enviado', { para, enviado });
    return;
  }

  const enviado = await enviarLista(
    para,
    `Olá, ${nomeMotorista}! 👋\nQual caminhão você vai usar hoje?`,
    '🚛 Selecionar',
    [
      {
        titulo: 'Caminhões disponíveis',
        itens: veiculos.slice(0, 10).map((v) => ({
          id: `veiculo_${v.id}`,
          titulo: v.placa,
          descricao: `${v.apelido || ''} ${v.marca || ''} ${v.modelo || ''}`.trim().slice(0, 72),
        })),
      },
    ]
  );
  log.info('lista_veiculos_enviada', { para, count: veiculos.length, enviado });

  await updateSession(sessionId, { estado: 'aguardando_veiculo' });
}

async function processarSelecaoVeiculo(
  msg: ParsedMessage,
  sessao: Sessao,
  identity: Extract<UserIdentity, { tipo: 'motorista' }>
): Promise<void> {
  // Verificar se é resposta de lista
  if (msg.tipo !== 'lista' || !msg.listaId?.startsWith('veiculo_')) {
    await enviarTexto(msg.from, 'Por favor, selecione um caminhão da lista acima. 🚛');
    return;
  }

  const veiculoId = msg.listaId.replace('veiculo_', '');

  // Buscar dados do veículo
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: veiculo } = await supabase
    .from('veiculos')
    .select('id, placa, km_atual')
    .eq('id', veiculoId)
    .single();

  if (!veiculo) {
    await enviarTexto(msg.from, 'Caminhão não encontrado. Tente novamente.');
    return;
  }

  // Salvar veículo na sessão e enviar menu
  await updateSession(sessao.id, {
    estado: 'aguardando_acao',
    contexto: {
      veiculo_id: veiculo.id,
      veiculo_placa: veiculo.placa,
    },
  });

  // Atualizar sessão local
  sessao.contexto.veiculo_id = veiculo.id;
  sessao.contexto.veiculo_placa = veiculo.placa;

  await enviarMenuMotorista(msg.from, sessao);
}

// ─── MENU PRINCIPAL DO MOTORISTA ─────────────────────────────────────

async function enviarMenuMotorista(para: string, sessao: Sessao): Promise<void> {
  const placa = sessao.contexto.veiculo_placa ?? '---';

  await enviarLista(
    para,
    `🚛 Caminhão: *${placa}*\n\nO que você precisa fazer?`,
    '📋 Ver opções',
    [
      {
        titulo: 'Ações',
        itens: [
          { id: 'acao_checklist', titulo: '📋 Checklist do dia' },
          { id: 'acao_viagem', titulo: '🛣️ Iniciar Viagem' },
          { id: 'acao_km', titulo: '📸 Informar KM' },
          { id: 'acao_abastecimento', titulo: '⛽ Abastecimento' },
          { id: 'acao_avaria', titulo: '⚠️ Relatar Avaria' },
          { id: 'acao_adiantamento', titulo: '💰 Pedir adiantamento' },
          { id: 'acao_despesa', titulo: '🧾 Registrar despesa' },
          { id: 'acao_imprevisto', titulo: '⚠️ Comunicar imprevisto' },
          { id: 'acao_status', titulo: '🔍 Status do caminhão' },
          { id: 'acao_documentos', titulo: '📄 Meus documentos' },
        ],
      },
    ],
    undefined,
    'Ou mande uma foto/áudio direto!'
  );
}

async function processarMenuMotorista(msg: ParsedMessage, sessao: Sessao): Promise<void> {
  // Resposta da lista de ações
  if (msg.tipo === 'lista' && msg.listaId?.startsWith('acao_')) {
    const acao = msg.listaId.replace('acao_', '');

    switch (acao) {
      case 'km':
        await enviarTexto(msg.from, 'Ótimo! Tire uma foto clara do painel mostrando o odômetro. 📷');
        await updateSession(sessao.id, { estado: 'aguardando_foto_km' });
        return;

      case 'avaria':
        await enviarTexto(msg.from, 'Me conte o que aconteceu.\nPode mandar *foto*, *áudio* ou *texto*. 🔍');
        await updateSession(sessao.id, { estado: 'aguardando_avaria_midia' });
        return;

      case 'viagem':
        await enviarTexto(msg.from, 'Para onde vai? Digite a *origem* e o *destino*\n(ex: São Paulo → Campinas)');
        await updateSession(sessao.id, { estado: 'aguardando_origem_destino' });
        return;

      case 'abastecimento':
        await enviarTexto(msg.from, '📸 Tire uma foto do comprovante de abastecimento.');
        await updateSession(sessao.id, { estado: 'aguardando_foto_abastecimento' });
        return;

      case 'checklist':
        await processarChecklistFlow(msg, sessao, true);
        return;

      case 'adiantamento':
        await processarAdiantamentoFlow(msg, sessao, true);
        return;

      case 'despesa':
        await processarDespesaFlow(msg, sessao, true);
        return;

      case 'imprevisto':
        await processarImprevistoFlow(msg, sessao, true);
        return;

      case 'status':
        await enviarStatusVeiculo(msg.from, sessao);
        return;

      case 'documentos':
        await enviarTexto(msg.from, '📄 Módulo de documentos em desenvolvimento.\nFale com o gestor para acessar seus documentos.');
        return;

      default:
        await enviarMenuMotorista(msg.from, sessao);
        return;
    }
  }

  // Mídia/texto solto fora de um fluxo → Smart Intent Router
  if (msg.tipo === 'foto') {
    await smartRouterFoto(msg, sessao);
    return;
  }

  if (msg.tipo === 'audio') {
    await smartRouterAudio(msg, sessao);
    return;
  }

  if (msg.tipo === 'texto' && msg.texto) {
    await smartRouterTexto(msg, sessao);
    return;
  }

  await enviarMenuMotorista(msg.from, sessao);
}

// ─── SMART INTENT ROUTER ─────────────────────────────────────────────

/**
 * Classifica uma foto solta (sem fluxo ativo) e roteia para o flow correto.
 */
async function smartRouterFoto(msg: ParsedMessage, sessao: Sessao): Promise<void> {
  if (!msg.mediaId) {
    await enviarMenuMotorista(msg.from, sessao);
    return;
  }

  const mediaUrl = await getMediaUrl(msg.mediaId);
  if (!mediaUrl) {
    log.warn('smart_foto_sem_url', { msg_id: msg.messageId });
    await enviarMenuMotorista(msg.from, sessao);
    return;
  }

  await enviarTexto(msg.from, '🤖 Analisando sua foto...');
  const resultado = await classificarMidia(mediaUrl);

  if (!resultado.ok) {
    log.warn('smart_foto_classificacao_falhou', { motivo: resultado.motivo });
    await enviarTexto(msg.from, 'Não consegui entender a foto. Use o menu:');
    await enviarMenuMotorista(msg.from, sessao);
    return;
  }

  const { tipo, confianca } = resultado.data;
  log.info('smart_foto_classificada', { tipo, confianca });

  if (confianca < SMART_ROUTER_CONFIANCA_MINIMA) {
    await enviarTexto(msg.from, `Não tenho certeza do que é essa foto (confiança ${confianca}%). Use o menu:`);
    await enviarMenuMotorista(msg.from, sessao);
    return;
  }

  switch (tipo) {
    case 'painel':
      await updateSession(sessao.id, { estado: 'aguardando_foto_km' });
      await processarKmFlow(msg, { ...sessao, estado: 'aguardando_foto_km' });
      return;

    case 'bomba_combustivel':
    case 'cupom_combustivel':
      await updateSession(sessao.id, { estado: 'aguardando_foto_abastecimento' });
      await processarAbastecimentoFlow(msg, { ...sessao, estado: 'aguardando_foto_abastecimento' });
      return;

    case 'cupom_generico':
      await updateSession(sessao.id, { estado: 'aguardando_despesa_foto' });
      await processarDespesaFlow(msg, { ...sessao, estado: 'aguardando_despesa_foto' });
      return;

    case 'avaria':
      await updateSession(sessao.id, { estado: 'aguardando_avaria_midia' });
      await processarAvariaFlow(msg, { ...sessao, estado: 'aguardando_avaria_midia' });
      return;

    case 'documento':
    case 'documento_pedido_frete':
      await enviarTexto(
        msg.from,
        '📄 Recebi um documento. Por enquanto só o gestor processa documentos pelo painel web.'
      );
      await enviarMenuMotorista(msg.from, sessao);
      return;

    default:
      await enviarTexto(msg.from, 'Não reconheci o tipo da foto. Use o menu:');
      await enviarMenuMotorista(msg.from, sessao);
      return;
  }
}

/**
 * Transcreve áudio e roteia pelo intent identificado.
 */
async function smartRouterAudio(msg: ParsedMessage, sessao: Sessao): Promise<void> {
  if (!msg.mediaId) {
    await enviarMenuMotorista(msg.from, sessao);
    return;
  }

  const mediaUrl = await getMediaUrl(msg.mediaId);
  if (!mediaUrl) {
    log.warn('smart_audio_sem_url', { msg_id: msg.messageId });
    await enviarMenuMotorista(msg.from, sessao);
    return;
  }

  await enviarTexto(msg.from, '🎧 Escutando seu áudio...');
  const transcricao = await transcreverAudio(mediaUrl);

  if (!transcricao.ok) {
    log.warn('smart_audio_transcricao_falhou', { motivo: transcricao.motivo });
    await enviarTexto(msg.from, 'Não consegui entender o áudio. Use o menu:');
    await enviarMenuMotorista(msg.from, sessao);
    return;
  }

  log.info('smart_audio_transcrito', { texto_len: transcricao.data.texto.length });

  // Áudio costuma ser relato de avaria/imprevisto. Trata como texto.
  await smartRouterTexto(
    { ...msg, tipo: 'texto', texto: transcricao.data.texto },
    sessao,
    { textoAdicional: '🎧 Entendi o áudio como: ' }
  );
}

/**
 * Classifica intenção de texto livre e roteia.
 */
async function smartRouterTexto(
  msg: ParsedMessage,
  sessao: Sessao,
  opts?: { textoAdicional?: string }
): Promise<void> {
  if (!msg.texto) {
    await enviarMenuMotorista(msg.from, sessao);
    return;
  }

  const resultado = await classificarIntentTexto(msg.texto, 'motorista');

  if (!resultado.ok) {
    log.warn('smart_texto_classificacao_falhou', { motivo: resultado.motivo });
    await enviarMenuMotorista(msg.from, sessao);
    return;
  }

  const { intent, confianca } = resultado.data;
  log.info('smart_texto_classificado', { intent, confianca });

  if (confianca < SMART_ROUTER_CONFIANCA_MINIMA || intent === 'fallback' || intent === 'saudacao') {
    await enviarMenuMotorista(msg.from, sessao);
    return;
  }

  if (opts?.textoAdicional) {
    await enviarTexto(msg.from, `${opts.textoAdicional}_${msg.texto}_`);
  }

  switch (intent) {
    case 'km':
      await enviarTexto(msg.from, 'Ótimo! Tire uma foto clara do painel mostrando o odômetro. 📷');
      await updateSession(sessao.id, { estado: 'aguardando_foto_km' });
      return;

    case 'abastecimento':
      await enviarTexto(msg.from, '📸 Tire uma foto do comprovante de abastecimento.');
      await updateSession(sessao.id, { estado: 'aguardando_foto_abastecimento' });
      return;

    case 'avaria':
      await enviarTexto(msg.from, 'Me conte o que aconteceu.\nPode mandar *foto*, *áudio* ou *texto*. 🔍');
      // Se já veio com texto descritivo, repassa para o avariaFlow processar
      if (msg.texto.length > 15) {
        await updateSession(sessao.id, { estado: 'aguardando_avaria_midia' });
        await processarAvariaFlow(msg, { ...sessao, estado: 'aguardando_avaria_midia' });
      } else {
        await updateSession(sessao.id, { estado: 'aguardando_avaria_midia' });
      }
      return;

    case 'despesa':
      await processarDespesaFlow(msg, sessao, true);
      return;

    case 'adiantamento':
      await processarAdiantamentoFlow(msg, sessao, true);
      return;

    case 'imprevisto':
      await processarImprevistoFlow(msg, sessao, true);
      return;

    case 'viagem_iniciar':
      await enviarTexto(msg.from, 'Para onde vai? Digite a *origem* e o *destino*\n(ex: São Paulo → Campinas)');
      await updateSession(sessao.id, { estado: 'aguardando_origem_destino' });
      return;

    case 'viagem_encerrar':
      await enviarTexto(msg.from, 'Pra encerrar viagem, abra o painel web ou peça pro gestor finalizar o frete.');
      await enviarMenuMotorista(msg.from, sessao);
      return;

    case 'status':
      await enviarStatusVeiculo(msg.from, sessao);
      return;

    case 'documentos':
      await enviarTexto(msg.from, '📄 Módulo de documentos em desenvolvimento.\nFale com o gestor para acessar seus documentos.');
      return;

    default:
      await enviarMenuMotorista(msg.from, sessao);
      return;
  }
}

// ─── STATUS DO VEÍCULO ──────────────────────────────────────────────

async function enviarStatusVeiculo(para: string, sessao: Sessao): Promise<void> {
  if (!sessao.contexto.veiculo_id) {
    await enviarTexto(para, 'Nenhum caminhão selecionado. Envie "Oi" para começar.');
    return;
  }

  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: veiculo } = await supabase
    .from('veiculos')
    .select('placa, km_atual, marca, modelo')
    .eq('id', sessao.contexto.veiculo_id)
    .single();

  if (!veiculo) {
    await enviarTexto(para, 'Caminhão não encontrado.');
    return;
  }

  // Buscar avarias abertas
  const { data: avarias } = await supabase
    .from('avarias')
    .select('descricao, urgencia')
    .eq('veiculo_id', sessao.contexto.veiculo_id)
    .in('status', ['aberta', 'em_analise']);

  const temProblema = avarias && avarias.length > 0;
  const kmFormatado = veiculo.km_atual ? new Intl.NumberFormat('pt-BR').format(veiculo.km_atual) : '---';

  let mensagem = `🚛 *${veiculo.placa}* — ${temProblema ? 'ATENÇÃO ⚠️' : 'TUDO CERTO ✅'}\n\n`;
  mensagem += `📏 KM atual: ${kmFormatado}\n`;
  mensagem += `🚛 ${veiculo.marca || ''} ${veiculo.modelo || ''}\n`;

  if (temProblema && avarias) {
    mensagem += '\n';
    for (const av of avarias) {
      const emoji = av.urgencia === 'critica' ? '🔴' : av.urgencia === 'alta' ? '🟠' : '🟡';
      mensagem += `${emoji} ${av.descricao}\n`;
    }
    mensagem += '\n⚠️ Fale com o gestor antes de iniciar nova viagem.';
  } else {
    mensagem += '\nNenhuma avaria pendente. Bom trabalho! 💪';
  }

  await enviarTexto(para, mensagem);
}

// ─── HELPERS ─────────────────────────────────────────────────────────

export function isSaudacao(msg: ParsedMessage): boolean {
  if (msg.tipo !== 'texto' || !msg.texto) return false;
  const texto = msg.texto.toLowerCase().trim();
  const saudacoes = ['oi', 'olá', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'hey', 'hi', 'hello', 'e aí', 'eai', 'fala'];
  return saudacoes.some((s) => texto === s || texto.startsWith(s + ' ') || texto.startsWith(s + ',') || texto.startsWith(s + '!'));
}
