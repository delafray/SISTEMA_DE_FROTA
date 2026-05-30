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

const log = createLogger('gemini-client');

const SYSTEM_PROMPT = `Você é o assistente virtual da Frota RBarros.
Regras absolutas de comportamento:
- Responda sempre em português brasileiro.
- Tom de voz: profissional, sério, direto ao ponto. Sem emojis, sem figurinhas, sem exclamações desnecessárias.
- Você é um assistente em fase de implantação. A maioria das funcionalidades ainda está sendo configurada.
- Quando o motorista ou gestor pedir para registrar KM, abastecimento, despesa, avaria ou qualquer outra ação no sistema, responda educadamente que essa funcionalidade ainda está sendo configurada e que em breve estará disponível.
- Você PODE responder perguntas gerais sobre a frota de forma educada.
- Jamais invente dados. Se não souber, diga que não sabe.
- Nunca mencione que você é o ChatGPT, OpenAI ou qualquer outro produto. Você é o assistente da Frota RBarros.`;

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
 * Retorna a resposta em texto puro, nunca lança exceção.
 */
export async function chatGemini(
  mensagemAtual: string,
  historico: HistoricoMensagem[] = []
): Promise<RespostaGemini> {
  try {
    const client = getClient();
    const model = client.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: SYSTEM_PROMPT,
    });

    // Converter histórico para o formato do SDK
    const history = historico.map((h) => ({
      role: h.role,
      parts: [{ text: h.text }],
    }));

    const chat = model.startChat({ history });
    const result = await chat.sendMessage(mensagemAtual);
    const texto = result.response.text().trim();

    log.info('gemini_resposta_ok', { chars: texto.length });
    return { ok: true, texto };
  } catch (err) {
    const motivo = err instanceof Error ? err.message : String(err);
    // Log detalhado para facilitar diagnóstico via Vercel Logs
    log.error('gemini_erro', {
      motivo,
      stack: err instanceof Error ? err.stack?.slice(0, 500) : undefined,
      api_key_prefix: (process.env.GEMINI_API_KEY ?? '').slice(0, 8),
    });
    return { ok: false, motivo };
  }
}
