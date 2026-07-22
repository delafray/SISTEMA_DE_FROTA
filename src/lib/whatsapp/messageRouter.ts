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
 *
 * Quebra de 22/07/2026 (arquivo tinha 1.098 linhas): as peças moram em
 * src/lib/whatsapp/router/ — routerLembrete (detecção/gravação de lembrete),
 * menuMotorista (menu + status), selecaoVeiculo, smartRouter (mídia/texto
 * solto) e routerGemini (IA). Este arquivo mantém SÓ a orquestração e os
 * flags de modo. Comportamento idêntico; a suíte cobre o roteamento.
 */

import type { ParsedMessage } from '@/lib/whatsapp/messageParser';
import { createLogger } from '@/lib/logger';
import { identificarRemetente, type UserIdentity } from '@/lib/whatsapp/auth';
import {
  getOrCreateSession,
  updateSession,
  resetToMenu,
  encerrarSessao,
  type Sessao,
} from '@/lib/whatsapp/sessionManager';
import { enviarTexto, RESERVED_MENU_IDS } from '@/lib/whatsapp/messageSender';
import { processarKmFlow } from '@/lib/whatsapp/flows/kmFlow';
import { processarAvariaFlow } from '@/lib/whatsapp/flows/avariaFlow';
import { processarViagemFlow } from '@/lib/whatsapp/flows/viagemFlow';
import { processarAbastecimentoFlow } from '@/lib/whatsapp/flows/abastecimentoFlow';
import { processarChecklistFlow } from '@/lib/whatsapp/flows/checklistFlow';
import { processarAdiantamentoFlow } from '@/lib/whatsapp/flows/adiantamentoFlow';
import { processarDespesaFlow } from '@/lib/whatsapp/flows/despesaFlow';
import { processarImprevistoFlow } from '@/lib/whatsapp/flows/imprevistoFlow';
import { ehComandoApagarUltimo, iniciarApagarUltimo, processarApagarUltimoFlow } from '@/lib/whatsapp/flows/apagarUltimoFlow';
import { processarGestorFlow } from '@/lib/whatsapp/flows/gestorFlow';
import { cotaGeminiDisponivel } from '@/lib/whatsapp/geminiRateLimit';
import { classificarERotear } from '@/lib/whatsapp/classificadorBot';
import { arquivarPrintZap } from '@/lib/whatsapp/printsZap';
import { tentarLembreteDeterministico, salvarComoLembrete } from './router/routerLembrete';
import { enviarMenuMotorista, enviarStatusVeiculo } from './router/menuMotorista';
import { enviarSelecaoVeiculo, processarSelecaoVeiculo } from './router/selecaoVeiculo';
import { smartRouterFoto, smartRouterAudio, smartRouterTexto } from './router/smartRouter';
import { rotearComGemini } from './router/routerGemini';

const log = createLogger('router');

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

// MODO CLASSIFICADOR — quando LIGADO, a mensagem passa primeiro pelo classificador
// (regras + Gemini). Se disparou uma regra (consulta/altera/ambíguo/anota) → trata e
// encerra. Se NÃO disparou → cai no fluxo normal (lembrete). DESLIGADO por padrão:
// zero mudança. Ligar: env MODO_CLASSIFICADOR=true (mantenha MODO_SOMENTE_LEMBRETE=true
// como rede de segurança — o que o classificador não tratar vira lembrete).
const MODO_CLASSIFICADOR = process.env.MODO_CLASSIFICADOR === 'true';

// ─── ROUTER PRINCIPAL ─────────────────────────────────────────────────

export async function processarMensagem(msg: ParsedMessage): Promise<void> {
  // 1. Identificar remetente
  const identity = await identificarRemetente(msg.from);

  // 1.2. PRINTS DO ZAP (decisão do dono 10/06): TODA imagem recebida é arquivada
  // no R2 (prints/) + registrada em prints_zap, pro dono mostrar telas do celular
  // ao Claude. SIDE-EFFECT puro: não muda nenhuma resposta do bot (que segue
  // tratando a imagem como sempre). Nunca lança.
  if (msg.tipo === 'foto') {
    await arquivarPrintZap(msg, identity);
  }

  // 1.3. MODO CLASSIFICADOR — roteia pela IA/regras ANTES do lembrete. Se tratou a
  // mensagem (consulta/altera/ambíguo/anota) encerra; senão, segue pro lembrete.
  // Fail-safe interno: qualquer erro devolve disparou=false (cai no lembrete).
  if (MODO_CLASSIFICADOR) {
    const r = await classificarERotear(msg, identity);
    if (r.disparou) return;
  }

  // 1.4. MODO SOMENTE LEMBRETE — atalho total: TODA mensagem vira lembrete, sem
  // LLM, sem sessão, sem menu. SEM TRAVA: vale para QUALQUER número — cadastrado
  // ou DESCONHECIDO. Quem manda do "celular do lixo" também gera lembrete; a
  // empresa cai no default (ver criarLembrete) e o telefone fica registrado.
  // Por isso esse bloco vem ANTES do filtro de desconhecido. Reverter: MODO_SOMENTE_LEMBRETE=false.
  if (MODO_SOMENTE_LEMBRETE) {
    log.info('modo_somente_lembrete', { from: msg.from, tipo: msg.tipo, identidade: identity.tipo });
    await salvarComoLembrete(msg, identity);
    return;
  }

  // Fora do modo lembrete, os flows abaixo precisam de identidade conhecida.
  if (identity.tipo === 'desconhecido') {
    log.warn('remetente_desconhecido', { from: msg.from, msg_id: msg.messageId });
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

  // ── "APAGA O ÚLTIMO" (comando determinístico, ANTES do Gemini) ──────
  // Precisa vir antes do bloco Gemini: senão a IA sequestra o texto e o
  // comando nunca chega ao flow. Só motorista, só ocioso (sem flow ativo).
  const ociosoParaApagar = sessao.estado === 'novo' || sessao.estado === 'aguardando_acao';
  if (
    identity.tipo === 'motorista' && ociosoParaApagar &&
    msgResolvida.tipo === 'texto' && !!msgResolvida.texto &&
    ehComandoApagarUltimo(msgResolvida.texto)
  ) {
    log.info('comando_apagar_ultimo', { session_id: sessao.id });
    await iniciarApagarUltimo(msgResolvida, sessao);
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

  // Apagar último registro (confirmação)
  if (estado === 'aguardando_confirmacao_apagar') {
    await processarApagarUltimoFlow(msg, sessao);
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

// ─── PROCESSAMENTO DO MENU PRINCIPAL ─────────────────────────────────

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

// ─── HELPERS ─────────────────────────────────────────────────────────

export function isSaudacao(msg: ParsedMessage): boolean {
  if (msg.tipo !== 'texto' || !msg.texto) return false;
  const texto = msg.texto.toLowerCase().trim();
  const saudacoes = ['oi', 'olá', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'hey', 'hi', 'hello', 'e aí', 'eai', 'fala'];
  return saudacoes.some((s) => texto === s || texto.startsWith(s + ' ') || texto.startsWith(s + ',') || texto.startsWith(s + '!'));
}
