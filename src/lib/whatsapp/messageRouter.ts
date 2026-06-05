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
import { getMediaUrl, getMediaAsBase64DataUrl } from '@/lib/whatsapp/messageParser';
import { createLogger } from '@/lib/logger';
import { identificarRemetente, type UserIdentity } from '@/lib/whatsapp/auth';
import {
  getOrCreateSession,
  updateSession,
  resetToMenu,
  encerrarSessao,
  type Sessao,
} from '@/lib/whatsapp/sessionManager';
import { enviarTexto, RESERVED_MENU_IDS, type OpcaoMenu } from '@/lib/whatsapp/messageSender';
import { enviarMenuLista } from '@/lib/whatsapp/menuHelper';
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
import { processarComGemini, processarAudioComGemini } from '@/lib/whatsapp/geminiBot';
import { cotaGeminiDisponivel } from '@/lib/whatsapp/geminiRateLimit';
import { tentarFastPath } from '@/lib/whatsapp/fastPath';
import { registrarMetrica } from '@/lib/ai/metricas';
import { extrairLembrete } from '@/lib/whatsapp/lembreteParser';
import { criarLembrete } from '@/lib/ai/tools/frotaTools';


const log = createLogger('router');

const SMART_ROUTER_CONFIANCA_MINIMA = 60;

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
async function tentarLembreteDeterministico(
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
 * GEMINI_MODE: quando true, todas as mensagens de texto e audio sao
 * processadas pelo Gemini Flash em vez dos fluxos de menu rigidos.
 * Mudar para false para reverter ao comportamento anterior.
 */
const GEMINI_MODE = true;

/**
 * MODO_SOMENTE_LEMBRETE: por decisão do dono, POR ENQUANTO o bot faz UMA coisa só
 * — gravar lembretes. TODA mensagem (texto ou áudio) de QUALQUER número cadastrado
 * vira um registro na tabela `lembretes`, de forma DETERMINÍSTICA, SEM passar pela
 * LLM (que era inconsistente: respondia "ok" e não persistia). Áudio é transcrito
 * (Deepgram) e o texto é salvo. "Depois a gente filtra" (categoria/role).
 *
 * Liga/desliga:
 *  - default LIGADO em produção/dev; DESLIGADO em testes (NODE_ENV==='test'),
 *    pra não quebrar a suíte de roteamento existente.
 *  - override explícito: env MODO_SOMENTE_LEMBRETE = 'true' | 'false'.
 *
 * Para devolver o bot completo (Gemini + flows): MODO_SOMENTE_LEMBRETE=false.
 */
const MODO_SOMENTE_LEMBRETE =
  process.env.MODO_SOMENTE_LEMBRETE != null
    ? process.env.MODO_SOMENTE_LEMBRETE === 'true'
    : process.env.NODE_ENV !== 'test';

/**
 * Limpa o texto do lembrete: tira um prefixo opcional ("lembrete:", "nota -",
 * "anota aí", "aviso") quando há conteúdo depois. Se sobrar vazio, mantém o
 * texto original (melhor salvar algo do que nada).
 */
function limparTextoLembrete(texto: string): string {
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
async function salvarComoLembrete(msg: ParsedMessage, identity: UserIdentity): Promise<void> {
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

// ─── ROUTER PRINCIPAL ─────────────────────────────────────────────────

export async function processarMensagem(msg: ParsedMessage): Promise<void> {
  // 1. Identificar remetente
  const identity = await identificarRemetente(msg.from);

  if (identity.tipo === 'desconhecido') {
    log.warn('remetente_desconhecido', { from: msg.from, msg_id: msg.messageId });
    return;
  }

  // 1.4. MODO SOMENTE LEMBRETE — atalho total: TODA mensagem vira lembrete, sem
  // LLM, sem sessão, sem menu. É o caminho mais à prova de falha (o INSERT no
  // Supabase já foi validado fim-a-fim). Reverter: MODO_SOMENTE_LEMBRETE=false.
  if (MODO_SOMENTE_LEMBRETE) {
    log.info('modo_somente_lembrete', { from: msg.from, tipo: msg.tipo });
    await salvarComoLembrete(msg, identity);
    return;
  }

  // 1.5. Lembrete DETERMINÍSTICO (gatilho exato) — ANTES de tudo: cota, sessão,
  // role e intent classifier. Garante que "lembrete: X" / "me lembra de X" /
  // "anota que X" SEMPRE salve, mesmo com cota estourada ou flow pendente.
  if (await tentarLembreteDeterministico(msg, identity, identity.empresa_id)) {
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

  // 2.5. Traduzir resposta numerica de texto em resposta de lista/botao.
  // Como WhatsApp pessoal nao renderiza listas interativas, os menus sao
  // enviados como texto numerado. O usuario responde com "1", "2", etc., e
  // aqui mapeamos de volta para o id original via sessao.contexto.menu_opcoes.
  const msgResolvida = resolverRespostaNumerica(msg, sessao);

  // 2.6. Intercepta opcoes reservadas Voltar/Sair que o menuHelper anexa
  // por padrao em todo menu. Tratadas universalmente AQUI para nao precisar
  // duplicar logica em cada flow.
  const idEscolhido = msgResolvida.listaId ?? msgResolvida.botaoId;
  if (idEscolhido === RESERVED_MENU_IDS.SAIR) {
    log.info('opcao_sair_acionada', { session_id: sessao.id });
    await handleSair(msgResolvida, sessao);
    return;
  }
  if (idEscolhido === RESERVED_MENU_IDS.VOLTAR && identity.tipo === 'motorista') {
    log.info('opcao_voltar_acionada', { session_id: sessao.id, estado: sessao.estado });
    await handleVoltar(msgResolvida, sessao, identity);
    return;
  }

  // ── GEMINI MODE: IA responde quando o motorista está OCIOSO ─────────
  // A IA só intercepta texto/audio quando NÃO há fluxo determinístico ativo
  // esperando resposta (estado 'novo' ou 'aguardando_acao'/menu). Se um fluxo
  // está em andamento (aguardando_*_km/abastecimento/despesa/avaria/etc.), o texto
  // do motorista (ex.: dados manuais do cupom) PRECISA ir pro fluxo — senão a IA
  // sequestrava a resposta e o registro nunca era salvo.
  // Para reverter ao bot antigo (sem IA): altere GEMINI_MODE para false.
  const motoristaOcioso = sessao.estado === 'novo' || sessao.estado === 'aguardando_acao';
  if (GEMINI_MODE && motoristaOcioso) {
    const isTexto = msgResolvida.tipo === 'texto' && !!msgResolvida.texto;
    const isAudio = msgResolvida.tipo === 'audio' && !!msgResolvida.mediaId;

    if (isTexto || isAudio) {
      // Camada 1: guarda de cota do free tier (RPM/RPD). Se ainda há orçamento,
      // a IA responde. Se estourou, NÃO chama o Gemini — cai no menu determinístico
      // logo abaixo (Camada 3: degradação graciosa, sem IA paga, sem perder a msg).
      const cota = await cotaGeminiDisponivel();
      if (cota.ok) {
        const motoristaId = identity.tipo === 'motorista' ? identity.motorista_id : undefined;
        await rotearComGemini(msgResolvida, identity, identity.nome ?? identity.tipo, identity.empresa_id, motoristaId);
        return;
      }
      log.warn('gemini_cota_estourada_fallback_menu', { motivo: cota.motivo, estado: sessao.estado });
      // sem return → segue pro roteamento por menu abaixo
    }
  }

  // 3. Rotear com base no role
  if (identity.tipo === 'motorista') {
    await rotearMotorista(msgResolvida, sessao, identity);
  } else {
    await rotearGestor(msgResolvida, sessao, identity);
  }
}

// ─── HANDLERS UNIVERSAIS (Voltar / Sair) ────────────────────────────

async function handleSair(msg: ParsedMessage, sessao: Sessao): Promise<void> {
  await enviarTexto(
    msg.from,
    'Até logo! 👋\nMande qualquer mensagem quando quiser começar de novo.'
  );
  await encerrarSessao(sessao.id);
}

async function handleVoltar(
  msg: ParsedMessage,
  sessao: Sessao,
  identity: Extract<UserIdentity, { tipo: 'motorista' }>
): Promise<void> {
  // Do menu principal (aguardando_acao) "Voltar" significa trocar caminhao.
  // De qualquer sub-flow, "Voltar" significa cancelar e ir para o menu principal.
  if (sessao.estado === 'aguardando_acao') {
    await enviarSelecaoVeiculo(msg.from, identity.nome, identity.empresa_id, sessao.id);
    return;
  }
  await resetToMenu(sessao.id);
  // Atualizar contexto local para refletir o reset antes de re-enviar o menu
  const sessaoMenu: Sessao = { ...sessao, estado: 'aguardando_acao' };
  await enviarMenuMotorista(msg.from, sessaoMenu);
}

/**
 * Se a mensagem for um texto contendo um numero valido (1-N) e a sessao
 * tiver `menu_opcoes` salvas, transforma a mensagem como se fosse uma resposta
 * de lista ou botao (conforme `tipo_original`). Caso contrario, retorna a
 * mensagem inalterada.
 */
function resolverRespostaNumerica(msg: ParsedMessage, sessao: Sessao): ParsedMessage {
  if (msg.tipo !== 'texto' || !msg.texto) return msg;
  const menu = sessao.contexto.menu_opcoes;
  if (!menu || !menu.opcoes?.length) return msg;

  const n = parseInt(msg.texto.trim(), 10);
  if (isNaN(n) || n < 1 || n > menu.opcoes.length) return msg;

  const escolhida = menu.opcoes[n - 1];
  log.info('resposta_numerica_resolvida', {
    numero: n,
    id: escolhida.id,
    titulo: escolhida.titulo,
    tipo_original: menu.tipo_original,
  });

  if (menu.tipo_original === 'lista') {
    return { ...msg, tipo: 'lista', listaId: escolhida.id, listaTitulo: escolhida.titulo };
  }
  return { ...msg, tipo: 'botao', botaoId: escolhida.id, botaoTitulo: escolhida.titulo };
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
  if (['aguardando_origem_destino', 'aguardando_cliente', 'aguardando_valor_pedido'].includes(estado)) {
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

  const opcoes: OpcaoMenu[] = veiculos.slice(0, 10).map((v) => ({
    id: `veiculo_${v.id}`,
    titulo: v.placa,
    descricao: `${v.apelido || ''} ${v.marca || ''} ${v.modelo || ''}`.trim() || undefined,
  }));

  const enviado = await enviarMenuLista(
    sessionId,
    para,
    `Olá, ${nomeMotorista}! 👋\nQual caminhão você vai usar hoje?`,
    opcoes,
    undefined,
    { incluirVoltar: false, incluirSair: false }
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

  const { data: veiculo, error: errVeiculo } = await supabase
    .from('veiculos')
    .select('id, placa, km_atual, empresa_id')
    .eq('id', veiculoId)
    .eq('empresa_id', identity.empresa_id)
    .single();

  if (errVeiculo) {
    log.error('selecao_veiculo_db_error', { veiculoId, code: errVeiculo.code, message: errVeiculo.message });
    await enviarTexto(msg.from, 'Erro temporario ao buscar o caminhao. Tente em alguns segundos.');
    return;
  }

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

  const opcoes: OpcaoMenu[] = [
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
  ];

  await enviarMenuLista(
    sessao.id,
    para,
    `🚛 Caminhão: *${placa}*\n\nO que você precisa fazer?`,
    opcoes,
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
    case 'pedido_iniciar':
      await enviarTexto(msg.from, 'Para onde vai? Digite a *origem* e o *destino*\n(ex: São Paulo → Campinas)');
      await updateSession(sessao.id, { estado: 'aguardando_origem_destino' });
      return;

    case 'viagem_encerrar':
    case 'pedido_encerrar':
      await enviarTexto(msg.from, 'Pra encerrar o pedido, abra o painel web ou peça pro gestor finalizar.');
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

  const { data: veiculo, error: errVeiculo } = await supabase
    .from('veiculos')
    .select('placa, km_atual, marca, modelo, empresa_id')
    .eq('id', sessao.contexto.veiculo_id)
    .eq('empresa_id', sessao.empresa_id)
    .single();

  if (errVeiculo) {
    log.error('status_veiculo_db_error', { veiculoId: sessao.contexto.veiculo_id, code: errVeiculo.code, message: errVeiculo.message });
    await enviarTexto(para, 'Erro temporario ao buscar o caminhao. Tente em alguns segundos.');
    return;
  }
  if (!veiculo) {
    await enviarTexto(para, 'Caminhão não encontrado.');
    return;
  }

  // Buscar avarias abertas
  const { data: avarias, error: errAvarias } = await supabase
    .from('avarias')
    .select('descricao, urgencia, empresa_id')
    .eq('veiculo_id', sessao.contexto.veiculo_id)
    .eq('empresa_id', sessao.empresa_id)
    .in('status', ['aberta', 'em_analise']);

  if (errAvarias) {
    log.warn('avarias_query_warn', { veiculoId: sessao.contexto.veiculo_id, message: errAvarias.message });
    // Continua com avarias=null, mensagem mostra "sem dados de avaria"
  }

  // B23: usa avarias diretamente — temProblema era flag derivada redundante.
  const temAvarias = !!avarias && avarias.length > 0;
  const kmFormatado = veiculo.km_atual ? new Intl.NumberFormat('pt-BR').format(veiculo.km_atual) : '---';

  let mensagem = `🚛 *${veiculo.placa}* — ${temAvarias ? 'ATENÇÃO ⚠️' : 'TUDO CERTO ✅'}\n\n`;
  mensagem += `📏 KM atual: ${kmFormatado}\n`;
  mensagem += `🚛 ${veiculo.marca || ''} ${veiculo.modelo || ''}\n`;

  if (temAvarias) {
    mensagem += '\n';
    for (const av of avarias) {
      // B24: urgencia pode ser null em registros legados — default 'media' antes
      // de renderizar (evita 'undefined' aparecer no WhatsApp).
      const urgencia = av.urgencia ?? 'media';
      const emoji = urgencia === 'critica' ? '🔴' : urgencia === 'alta' ? '🟠' : '🟡';
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

// ─── ROTEAMENTO VIA GEMINI ────────────────────────────────────────────

/**
 * Processa a mensagem pelo Gemini Flash.
 * Se for audio, transcreve antes de enviar.
 * Retorna sempre uma resposta em texto.
 */
async function rotearComGemini(
  msg: ParsedMessage,
  identity: UserIdentity,
  nomeRemetente: string,
  empresaId?: string,
  motoristaId?: string
): Promise<void> {
  // usuario_id vai pro Gemini pra ferramentas que precisam saber QUEM é (ex: criar_lembrete).
  const usuarioId = ('usuario_id' in identity ? identity.usuario_id : undefined) ?? undefined;
  const nomeQuemMandou = 'nome' in identity ? identity.nome : undefined;
  const remetente = { nome: nomeQuemMandou, telefone: msg.from };

  // Áudio: WhatsApp encripta a mídia no CDN — baixar a URL HTTP direta dá bytes
  // inutilizáveis pro Deepgram. SEMPRE buscar via Evolution `getBase64FromMediaMessage`
  // (que descriptografa) e mandar como data URL pro pipeline transcrever.
  if (msg.tipo === 'audio' && msg.messageId) {
    const dataUrl = await getMediaAsBase64DataUrl(msg.messageId);
    if (!dataUrl) {
      await enviarTexto(msg.from, 'Nao foi possivel baixar o audio. Por favor, envie sua mensagem por escrito.');
      return;
    }

    // Transcreve primeiro (texto direto pro Gemini é mais rápido que reprocessar o áudio).
    const transcricao = await transcreverAudio(dataUrl);
    if (transcricao.ok && transcricao.data.texto) {
      const texto = transcricao.data.texto.trim();
      // Lembrete por áudio → salva determinístico (gatilho exato), não passa pela IA.
      // Reusa o helper de módulo com uma msg sintética carregando a transcrição.
      if (await tentarLembreteDeterministico({ ...msg, tipo: 'texto', texto }, identity, empresaId)) return;
      // Sinal LEVE de lembrete (guarda/registra/salva/não esquece) → força a tool via ANY.
      const forcar = pareceLembreteLeve(texto) ? 'criar_lembrete' : undefined;
      const resposta = await processarComGemini(msg.from, texto, nomeRemetente, empresaId, motoristaId, usuarioId, forcar, remetente);
      await enviarTexto(msg.from, resposta);
      return;
    }

    // Transcrição falhou — tenta com o pipeline completo de áudio do Gemini
    const resposta = await processarAudioComGemini(msg.from, dataUrl, nomeRemetente, empresaId, motoristaId, usuarioId);
    await enviarTexto(msg.from, resposta);
    return;
  }

  // Texto: fluxo normal. (Lembrete por gatilho exato já foi tratado no topo de
  // processarMensagem — aqui só chegam mensagens que NÃO casaram com o parser.)
  const textoParaGemini = msg.texto ?? '';
  if (!textoParaGemini) {
    await enviarTexto(msg.from, 'Nao consegui entender a mensagem. Por favor, envie um texto.');
    return;
  }

  // Fast Path: regex pra comandos obvios (saudacao, ajuda, /novo).
  // Resolve sem chamar Gemini = 0 tokens, <1ms latencia.
  const inicioFp = Date.now();
  const fp = await tentarFastPath(textoParaGemini, msg.from, nomeRemetente);
  if (fp.matched && fp.resposta) {
    await enviarTexto(msg.from, fp.resposta);
    void registrarMetrica({
      telefone: msg.from,
      empresa_id: empresaId,
      modo: 'fast_path',
      fast_path_matcher: fp.matcher,
      latency_ms: Date.now() - inicioFp,
      sucesso: true,
    });
    return;
  }

  // Sinal LEVE de lembrete (não casou no parser exato, mas tem intenção de guardar:
  // "guarda esse dado", "registra que...", "salva aí", "não esquece de..."). Aqui
  // FORÇAMOS a tool via mode ANY (forcarTool) — mais confiável que torcer pro AUTO
  // chamar sozinho. A tool persiste e o modelo confirma em texto.
  const forcar = pareceLembreteLeve(textoParaGemini) ? 'criar_lembrete' : undefined;
  if (forcar) log.info('lembrete_leve_forcando_tool', { from: msg.from });

  const resposta = await processarComGemini(
    msg.from, textoParaGemini, nomeRemetente, empresaId, motoristaId, usuarioId, forcar, remetente
  );
  await enviarTexto(msg.from, resposta);
}

/**
 * Sinal LEVE de intenção de lembrete — propositalmente mais amplo que o parser
 * exato (extrairLembrete). Pega verbos de "guardar informação" que o parser
 * evita por ambiguidade (guarda/registra/salva/não esquece). Usado SÓ pra decidir
 * forçar a tool criar_lembrete no Gemini (mode ANY); a desambiguação final fica
 * com o modelo. NÃO dispara em "nota fiscal" / consultas.
 */
function pareceLembreteLeve(texto: string): boolean {
  const t = (texto ?? '').toLowerCase();
  if (!t.trim()) return false;
  // Exclui "nota fiscal" / "nota de ..." pra não confundir com despesa/documento.
  if (/\bnota\s+fiscal\b/.test(t)) return false;
  return /\b(guarda|guardar|registra|registrar|registro|salva|salvar|anota|anote|n[ãa]o\s+esque[çc]a|n[ãa]o\s+esquece)\b/.test(t);
}

