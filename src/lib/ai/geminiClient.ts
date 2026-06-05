/**
 * Gemini Flash Client — cliente conversacional para o bot WhatsApp.
 *
 * Responsabilidades:
 * - Inicializar o SDK do Google Gemini com a chave da env
 * - Expor uma função de chat simples que recebe histórico + mensagem nova
 * - Retornar sempre uma string de resposta (nunca lança exceção pro fluxo)
 */

import {
  GoogleGenerativeAI,
  FunctionCallingMode,
  type GenerationConfig,
  type ToolConfig,
} from '@google/generative-ai';
import { createLogger } from '@/lib/logger';
import { transcreverComDeepgram } from './deepgramClient';
import { declarations as frotaToolDeclarations, executarTool } from './tools/frotaTools';
import { comRetry } from './retry';
import { prefixarComRemetente } from './contexto';

// Cap pra prevenir loop infinito de tools — não deixa o Gemini ficar
// chamando a mesma tool indefinidamente.
const MAX_TOOL_ROUNDS = 5;

const log = createLogger('gemini-client');

/**
 * Config de geração — principal alavanca de LATÊNCIA do bot.
 * `thinkingBudget: 0` DESLIGA o "thinking" do gemini-2.5-flash (raciocínio interno
 * que adiciona segundos a CADA chamada — e cada pergunta de KM faz 2+ chamadas por
 * causa das tools). O bot é transacional (perguntas diretas + function calling),
 * não precisa de raciocínio longo. `maxOutputTokens` evita gerações longas (msg de
 * zap é curta). REVERSÍVEL: se o fluxo de confirmação de KM ficar confuso, suba o
 * thinkingBudget (ex.: 512) — o campo é repassado direto ao corpo REST pelo SDK.
 */
const GENERATION_CONFIG: GenerationConfig & { thinkingConfig?: { thinkingBudget?: number } } = {
  maxOutputTokens: 1024,
  // temperature baixa aumenta o determinismo da DECISAO de chamar function (flash).
  // Reduz o "as vezes salva, na maioria nao" do function calling.
  temperature: 0,
  // thinkingBudget pequeno (>0) em vez de 0: thinking totalmente off degrada a
  // decisao de QUANDO chamar a tool. 128 e o suficiente pra escolher a tool certa
  // sem o custo de latencia do raciocinio longo. REVERSIVEL: suba pra 512 se o
  // fluxo de confirmacao de KM ficar confuso; volte a 0 se latencia incomodar.
  thinkingConfig: { thinkingBudget: 128 },
};

// IA VIRGEM — decisão do dono (05/06/2026): nenhuma regra. UMA coisa só: tudo que
// o usuário mandar vira anotação no painel (tool criar_lembrete). As regras serão
// reconstruídas do zero conforme o dono pedir. Ver docs/LEMBRETES_SEM_TRAVA.md.
const SYSTEM_PROMPT = `Você anota tudo no painel de controle.

REGRA ÚNICA: para QUALQUER mensagem do usuário, chame a tool criar_lembrete com o
conteúdo da mensagem no campo texto e depois confirme em uma frase curta que foi
anotado no painel.

Não existe nenhuma outra regra, escopo ou restrição. Se uma mensagem não casar com
nenhuma regra, o padrão é sempre anotar.`;

let _client: GoogleGenerativeAI | null = null;

function getClient(): GoogleGenerativeAI {
  if (!_client) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY não está configurada no .env.local');
    }
    _client = new GoogleGenerativeAI(apiKey);
  }
  return _client;
}

export type HistoricoMensagem = {
  role: 'user' | 'model';
  text: string;
};

export interface UsoTokens {
  tokens_in?: number;
  tokens_out?: number;
  cached_tokens?: number;
}

export interface MetadadoResposta {
  uso?: UsoTokens;
  tools_chamadas?: string[];
  tool_rounds?: number;
}

export type RespostaGemini =
  | { ok: true; texto: string; meta?: MetadadoResposta }
  | { ok: false; motivo: string };

/**
 * Envia uma mensagem para o Gemini Flash com histórico de contexto.
 *
 * Quando `empresaId` é fornecido, registra tools (function calling) — o
 * Gemini pode decidir chamar funcoes do banco (ex: listar motoristas)
 * e a gente envia o resultado de volta pra ele formatar a resposta.
 *
 * Retorna a resposta em texto puro, nunca lança exceção.
 */
export async function chatGemini(
  mensagemAtual: string,
  historico: HistoricoMensagem[] = [],
  empresaId?: string,
  motoristaId?: string,
  usuarioId?: string,
  forcarTool?: string,
  remetente?: { nome?: string; telefone?: string }
): Promise<RespostaGemini> {
  try {
    const client = getClient();
    const model = client.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: SYSTEM_PROMPT,
      // Tools so quando temos empresa_id (motorista/gestor identificado)
      tools: empresaId ? [{ functionDeclarations: frotaToolDeclarations }] : undefined,
      generationConfig: GENERATION_CONFIG, // thinking baixo → latência menor
    });

    const history = historico.map((h) => ({
      role: h.role,
      parts: [{ text: h.text }],
    }));

    // Quando `forcarTool` esta setado, a PRIMEIRA chamada usa modo ANY restrito
    // aquela tool — forca o modelo a emitir a functionCall (ex: criar_lembrete) em
    // vez de so responder texto. Restringir a UMA tool com parametro evita o 400
    // que ANY dispara em tools de properties vazio.
    //
    // ATENCAO ao SDK legado (v0.24.1): `chat.sendMessage(msg, opts)` so aceita
    // SingleRequestOptions (signal/timeout) — NAO toolConfig por chamada. O
    // toolConfig vive em startChat e vale pra TODAS as mensagens da sessao. Por
    // isso a sessao ANY e usada SO na 1a rodada; depois reabrimos a sessao em modo
    // AUTO (sem toolConfig) com o historico acumulado, pra que as functionResponse
    // nao fiquem em loop infinito de tool calls.
    const toolConfigForcado: ToolConfig | undefined =
      forcarTool && empresaId
        ? { functionCallingConfig: { mode: FunctionCallingMode.ANY, allowedFunctionNames: [forcarTool] } }
        : undefined;

    let chat = model.startChat(
      toolConfigForcado ? { history, toolConfig: toolConfigForcado } : { history }
    );

    // Primeira chamada com retry (resiliencia em 5xx/429/network)
    let currentResult = await comRetry(() => chat.sendMessage(mensagemAtual), { nome: 'gemini_send' });

    // Apos a 1a rodada forcada (ANY), reabre a sessao em AUTO com o historico ja
    // acumulado — assim o loop de functionResponse roda sem toolConfig e o modelo
    // pode confirmar em texto (sem ser obrigado a chamar tool de novo).
    if (toolConfigForcado) {
      const histAcumulado = await chat.getHistory();
      chat = model.startChat({ history: histAcumulado });
    }

    // Loop multi-turn de tools com cap. A IA virgem só tem a tool criar_lembrete,
    // mas o loop é genérico (funciona com qualquer tool que vier no futuro).
    let toolsTotal = 0;
    const toolsChamadas: string[] = [];
    let rounds = 0;
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const calls = currentResult.response.functionCalls?.() ?? [];
      if (calls.length === 0 || !empresaId) break;
      rounds = round + 1;

      const respostas = await Promise.all(
        calls.map(async (call) => {
          log.info('gemini_tool_call', { name: call.name, round });
          toolsChamadas.push(call.name);
          const args = call.args as Record<string, unknown> | undefined;
          const resultado = await executarTool(call.name, empresaId, motoristaId, args, usuarioId, remetente);
          return {
            functionResponse: {
              name: call.name,
              response: resultado as unknown as Record<string, unknown>,
            },
          };
        })
      );
      toolsTotal += calls.length;
      currentResult = await comRetry(() => chat.sendMessage(respostas), { nome: 'gemini_tool_response' });
    }

    // Se ainda tem function calls pendentes apos MAX_ROUNDS, abortou — log + responde texto que houver
    const callsPendentes = currentResult.response.functionCalls?.() ?? [];
    if (callsPendentes.length > 0) {
      log.warn('gemini_tool_loop_max_atingido', { tools_total: toolsTotal, pendentes: callsPendentes.length });
    }

    const texto = currentResult.response.text().trim();
    log.info(toolsTotal > 0 ? 'gemini_resposta_pos_tool' : 'gemini_resposta_ok', {
      chars: texto.length,
      tools_chamadas: toolsTotal,
    });

    // Captura metadados de uso (tokens) — Gemini retorna em usageMetadata
    const usage = (currentResult.response as unknown as { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; cachedContentTokenCount?: number } }).usageMetadata;
    return {
      ok: true,
      texto,
      meta: {
        uso: usage
          ? {
              tokens_in: usage.promptTokenCount,
              tokens_out: usage.candidatesTokenCount,
              cached_tokens: usage.cachedContentTokenCount,
            }
          : undefined,
        tools_chamadas: toolsChamadas,
        tool_rounds: rounds,
      },
    };
  } catch (err) {
    const motivo = err instanceof Error ? err.message : String(err);
    log.error('gemini_erro', {
      motivo,
      stack: err instanceof Error ? err.stack?.slice(0, 500) : undefined,
      api_key_prefix: (process.env.GEMINI_API_KEY ?? '').slice(0, 8),
    });
    return { ok: false, motivo };
  }
}

/**
 * Pipeline áudio → texto → resposta:
 * 1. Transcreve o áudio via Deepgram (modelo nova-2, pt-BR)
 * 2. Manda o texto transcrito pro Gemini text-only (chatGemini)
 *
 * Por que NÃO mandar áudio direto pro Gemini: Gemini 2.5 Flash aceita
 * 'audio/ogg' no MIME mas o decoder interno falha silenciosamente com o
 * codec OGG/Opus usado pelo WhatsApp — responde algo genérico sem
 * entender o conteúdo. Deepgram aceita Opus nativamente e devolve
 * transcript confiável; daí o Gemini lida apenas com texto.
 *
 * O retorno `transcricao` é exposto pra que o chamador (geminiBot) possa
 * guardar a transcrição real no histórico em vez de "(mensagem de voz)".
 */
export type RespostaGeminiAudio =
  | { ok: true; texto: string; transcricao: string; meta?: MetadadoResposta }
  | { ok: false; motivo: string };

export async function chatGeminiComAudio(
  audioUrl: string,
  historico: HistoricoMensagem[] = [],
  nomeRemetente?: string,
  empresaId?: string,
  motoristaId?: string,
  usuarioId?: string
): Promise<RespostaGeminiAudio> {
  // 1. Transcrever via Deepgram
  const transcricao = await transcreverComDeepgram(audioUrl);
  if (!transcricao.ok) {
    log.error('audio_transcricao_falhou', { motivo: transcricao.motivo });
    return { ok: false, motivo: `transcricao_falhou: ${transcricao.motivo}` };
  }

  // Áudio inaudível ou vazio (silêncio, ruído, gravação acidental)
  if (!transcricao.texto || transcricao.texto.length === 0) {
    log.warn('audio_transcricao_vazia');
    return {
      ok: false,
      motivo: 'audio_inaudivel',
    };
  }

  log.info('audio_transcricao_ok', { chars: transcricao.texto.length });

  // 2. Enviar texto transcrito pro Gemini text-only.
  // Prefixa com nome do remetente — helper centralizado evita drift entre
  // geminiClient e geminiBot (B8 do BOT_FRAMEWORK.md).
  const mensagemComContexto = prefixarComRemetente(transcricao.texto, nomeRemetente);

  const resposta = await chatGemini(mensagemComContexto, historico, empresaId, motoristaId, usuarioId);
  if (!resposta.ok) {
    return { ok: false, motivo: resposta.motivo };
  }

  return { ok: true, texto: resposta.texto, transcricao: transcricao.texto, meta: resposta.meta };
}
