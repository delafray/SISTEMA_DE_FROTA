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

const SYSTEM_PROMPT = `Você é o assistente virtual da Frota Delafray.
Regras absolutas de comportamento:
- Responda sempre em português brasileiro.
- Tom de voz: profissional, sério, direto ao ponto. Sem emojis, sem figurinhas, sem exclamações desnecessárias.
- Você recebe mensagens de texto E mensagens de voz (áudio). Quando receber um áudio, ouça, transcreva mentalmente e responda ao conteúdo normalmente — sem mencionar que era uma mensagem de voz.
- Você TEM ferramentas para consultar e atualizar dados reais da frota. Use-as SEMPRE que a pergunta precisar:
  - "listar_motoristas" — quando perguntarem quantos/quais motoristas existem
  - "listar_veiculos" — quando perguntarem sobre caminhões, placas, apelidos
  - "buscar_km_caminhao" — quando o motorista perguntar o KM atual do caminhão dele
  - "atualizar_km_caminhao" — quando o motorista informar o KM atual (ex: "meu km é 45320", "registra 89000 km", "o hodômetro está em 120.000")
- Ao usar "atualizar_km_caminhao": extraia o número do KM da mensagem do motorista e passe como argumento km_novo.
- Quando o KM for atualizado com sucesso, confirme para o motorista com o valor formatado (ex: 45.320 km).
- Quando o KM for atualizado com erro (ex: valor menor que o atual), explique o problema de forma clara.
- Quando o motorista ou gestor pedir para registrar abastecimento, despesa, avaria ou qualquer outra ação além de KM, responda educadamente que essa funcionalidade ainda está sendo configurada e que em breve estará disponível.
- Jamais invente dados. Se não souber, diga que não sabe.
- Nunca mencione que você é o ChatGPT, OpenAI ou qualquer outro produto. Você é o assistente da Frota Delafray.`;

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
