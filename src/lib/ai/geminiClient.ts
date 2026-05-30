/**
 * Gemini Flash Client — cliente conversacional para o bot WhatsApp.
 *
 * Responsabilidades:
 * - Inicializar o SDK do Google Gemini com a chave da env
 * - Expor uma função de chat simples que recebe histórico + mensagem nova
 * - Retornar sempre uma string de resposta (nunca lança exceção pro fluxo)
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { createLogger } from '@/lib/logger';
import { transcreverComDeepgram } from './deepgramClient';
import { declarations as frotaToolDeclarations, executarTool } from './tools/frotaTools';

const log = createLogger('gemini-client');

const SYSTEM_PROMPT = `Você é o assistente da Frota Delafray.

ESCOPO:
Responda perguntas sobre frota, motoristas, veículos e KM dos caminhões.
Outras operações (abastecimento, despesa, avaria, adiantamento) ainda estão sendo
configuradas — informe que estarão disponíveis em breve.

TOM:
Português brasileiro. Corporativo, direto, texto puro. Pontuação neutra.
Não comente sobre o formato (texto vs áudio) — apenas responda ao conteúdo.

GATILHOS DE TOOL:
- Pergunta sobre QUEM são os motoristas → listar_motoristas
- Pergunta sobre QUAIS caminhões / placas / apelidos / marca → listar_veiculos
- Pergunta sobre KM atual do caminhão (ex: "qual meu km", "quanto km tem o leão") → buscar_km_caminhao
- Motorista INFORMA novo KM (ex: "meu km é 45000", "ta em 125 mil", "registra 89000") → propor_atualizacao_km
- Motorista CONFIRMA proposta com "sim", "ok", "isso", "confirma", "pode", "vai" → confirmar_atualizacao_km

PERMISSION LOOP — atualização de KM em DUAS etapas obrigatórias:
1. Motorista informa KM → você chama propor_atualizacao_km (não grava ainda)
2. Você apresenta o preview (use a mensagem_sugerida da tool) e PERGUNTA confirmação
3. Motorista responde afirmativamente → você chama confirmar_atualizacao_km com o MESMO km_novo
4. Você confirma o registro
NUNCA chame confirmar_atualizacao_km sem o motorista ter dito "sim" (ou equivalente) na mensagem ANTERIOR.
Se o motorista corrigir o número ("não, é 46000"), gere nova proposta.
Se ambíguo ("sim mas espera"), NÃO confirme — pergunte de novo.

EXTRAÇÃO DE NÚMEROS:
Aceite formatos brasileiros: "125.000", "125 mil", "125k", "125000". Sempre passe inteiro puro à tool.

DADOS:
Filtra automaticamente por empresa do motorista — você nunca vê de outra empresa.
Jamais invente número, placa, nome ou data. Se não souber, diga "não tenho essa informação ainda".

IDENTIDADE:
Assistente da Frota Delafray. Não mencione modelo, fornecedor ou tecnologia.`;

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

export type RespostaGemini =
  | { ok: true; texto: string }
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
  motoristaId?: string
): Promise<RespostaGemini> {
  try {
    const client = getClient();
    const model = client.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: SYSTEM_PROMPT,
      // Tools so quando temos empresa_id (motorista/gestor identificado)
      tools: empresaId ? [{ functionDeclarations: frotaToolDeclarations }] : undefined,
    });

    const history = historico.map((h) => ({
      role: h.role,
      parts: [{ text: h.text }],
    }));

    const chat = model.startChat({ history });
    const result = await chat.sendMessage(mensagemAtual);

    // Se Gemini decidiu chamar uma tool, executa e devolve o resultado
    const calls = result.response.functionCalls?.() ?? [];
    if (calls.length > 0 && empresaId) {
      const respostas = await Promise.all(
        calls.map(async (call) => {
          log.info('gemini_tool_call', { name: call.name });
          const args = call.args as Record<string, unknown> | undefined;
          const resultado = await executarTool(call.name, empresaId, motoristaId, args);
          return {
            functionResponse: {
              name: call.name,
              response: resultado as unknown as Record<string, unknown>,
            },
          };
        })
      );
      // Manda os resultados de volta pro Gemini formatar resposta natural
      const result2 = await chat.sendMessage(respostas);
      const texto = result2.response.text().trim();
      log.info('gemini_resposta_pos_tool', { chars: texto.length, tools_chamadas: calls.length });
      return { ok: true, texto };
    }

    const texto = result.response.text().trim();
    log.info('gemini_resposta_ok', { chars: texto.length });
    return { ok: true, texto };
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
  | { ok: true; texto: string; transcricao: string }
  | { ok: false; motivo: string };

export async function chatGeminiComAudio(
  audioUrl: string,
  historico: HistoricoMensagem[] = [],
  nomeRemetente?: string,
  empresaId?: string,
  motoristaId?: string
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
  // Prefixa com nome do remetente se disponível (mantém padrão de processarComGemini).
  const mensagemComContexto = nomeRemetente
    ? `[Motorista: ${nomeRemetente}] ${transcricao.texto}`
    : transcricao.texto;

  const resposta = await chatGemini(mensagemComContexto, historico, empresaId, motoristaId);
  if (!resposta.ok) {
    return { ok: false, motivo: resposta.motivo };
  }

  return { ok: true, texto: resposta.texto, transcricao: transcricao.texto };
}
