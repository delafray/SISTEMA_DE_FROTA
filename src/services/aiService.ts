/**
 * AI Service Layer — Porta ÚNICA de entrada para qualquer chamada de IA.
 *
 * Regras:
 * 1. Toda função retorna AIResult<T> — NUNCA lança exceção para o fluxo.
 * 2. Se a IA falha, retorna { ok: false, fallbackManual: true, motivo }.
 * 3. O fluxo do WhatsApp NUNCA trava por causa da IA.
 *
 * Modelos por tarefa (decisão do plano de projeto):
 * - gpt-4o-mini: tarefas leves (OCR odômetro, cupom, classificação)
 * - gpt-4o: tarefas que exigem raciocínio (avaria, pedido de frete)
 * - whisper-1: transcrição de áudio
 */

import { chatCompletion, whisperTranscription } from '@/lib/ai/openaiClient';
import {
  PROMPT_LER_ODOMETRO,
  PROMPT_LER_CUPOM_ABASTECIMENTO,
  PROMPT_LER_CUPOM_GENERICO,
  PROMPT_ANALISAR_AVARIA_FOTO,
  PROMPT_ANALISAR_AVARIA_TEXTO,
  PROMPT_CLASSIFICAR_MIDIA,
  PROMPT_EXTRAIR_PEDIDO_FRETE,
  PROMPT_CLASSIFICAR_INTENT_GESTOR,
  PROMPT_CLASSIFICAR_INTENT_MOTORISTA,
} from '@/lib/ai/prompts';

// ─── TIPOS ────────────────────────────────────────────────────────────

export type AIResult<T> =
  | { ok: true; data: T; usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number } }
  | { ok: false; fallbackManual: true; motivo: string };

export type LeituraOdometro = {
  km: number;
  confianca: number;
  observacao: string;
};

export type LeituraCupomAbastecimento = {
  litros: number | null;
  valor_total: number | null;
  valor_litro: number | null;
  posto: string | null;
  data: string | null;
  confianca: number;
};

export type LeituraCupomGenerico = {
  tipo: 'pedagio' | 'alimentacao' | 'hospedagem' | 'lavagem' | 'reparo' | 'combustivel' | 'outro';
  valor: number | null;
  local: string | null;
  data: string | null;
  descricao: string;
  confianca: number;
};

export type AnaliseAvaria = {
  descricao: string;
  urgencia: 'baixa' | 'media' | 'alta' | 'critica';
  recomendacao: string;
  confianca: number;
};

export type TranscricaoAudio = {
  texto: string;
};

export type ClassificacaoMidia = {
  tipo: 'painel' | 'bomba_combustivel' | 'cupom_combustivel' | 'cupom_generico' | 'avaria' | 'documento' | 'documento_pedido_frete' | 'outro';
  confianca: number;
  observacao: string;
};

export type PedidoFreteExtraido = {
  cliente_nome: string | null;
  cliente_cnpj: string | null;
  origem: string | null;
  destino: string | null;
  valor_frete: number | null;
  peso_carga_kg: number | null;
  tipo_carga: string | null;
  data_coleta: string | null;
  data_entrega: string | null;
  observacoes: string | null;
  confianca: number;
};

export type IntentClassificada = {
  intent: string;
  confianca: number;
  parametros?: Record<string, string | null>;
};

// ─── FUNÇÕES ──────────────────────────────────────────────────────────

/**
 * Lê o odômetro de uma foto do painel.
 * Modelo: gpt-4o-mini (leve, rápido, barato)
 */
export async function lerOdometro(fotoUrl: string): Promise<AIResult<LeituraOdometro>> {
  const result = await chatCompletion({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: PROMPT_LER_ODOMETRO.system },
      {
        role: 'user',
        content: [
          { type: 'text', text: PROMPT_LER_ODOMETRO.user },
          { type: 'image_url', image_url: { url: fotoUrl } },
        ],
      },
    ],
    response_format: { type: 'json_object' },
  });

  if (!result.ok) {
    console.error('[aiService] lerOdometro falhou:', result.error);
    return { ok: false, fallbackManual: true, motivo: `Erro na IA: ${result.code}` };
  }

  try {
    const data = JSON.parse(result.content) as LeituraOdometro;
    if (typeof data.km !== 'number' || typeof data.confianca !== 'number') {
      return { ok: false, fallbackManual: true, motivo: 'Resposta da IA em formato inválido' };
    }
    return { ok: true, data, usage: result.usage };
  } catch {
    return { ok: false, fallbackManual: true, motivo: 'Resposta da IA não é JSON válido' };
  }
}

/**
 * Lê um cupom fiscal de posto de combustível.
 * Modelo: gpt-4o-mini
 */
export async function lerCupomAbastecimento(fotoUrl: string): Promise<AIResult<LeituraCupomAbastecimento>> {
  const result = await chatCompletion({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: PROMPT_LER_CUPOM_ABASTECIMENTO.system },
      {
        role: 'user',
        content: [
          { type: 'text', text: PROMPT_LER_CUPOM_ABASTECIMENTO.user },
          { type: 'image_url', image_url: { url: fotoUrl } },
        ],
      },
    ],
    response_format: { type: 'json_object' },
  });

  if (!result.ok) {
    console.error('[aiService] lerCupomAbastecimento falhou:', result.error);
    return { ok: false, fallbackManual: true, motivo: `Erro na IA: ${result.code}` };
  }

  try {
    const data = JSON.parse(result.content) as LeituraCupomAbastecimento;
    return { ok: true, data, usage: result.usage };
  } catch {
    return { ok: false, fallbackManual: true, motivo: 'Resposta da IA não é JSON válido' };
  }
}

/**
 * Lê um cupom/recibo genérico (despesas: pedágio, alimentação, etc).
 * Modelo: gpt-4o-mini
 */
export async function lerCupomGenerico(fotoUrl: string): Promise<AIResult<LeituraCupomGenerico>> {
  const result = await chatCompletion({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: PROMPT_LER_CUPOM_GENERICO.system },
      {
        role: 'user',
        content: [
          { type: 'text', text: PROMPT_LER_CUPOM_GENERICO.user },
          { type: 'image_url', image_url: { url: fotoUrl } },
        ],
      },
    ],
    response_format: { type: 'json_object' },
  });

  if (!result.ok) {
    console.error('[aiService] lerCupomGenerico falhou:', result.error);
    return { ok: false, fallbackManual: true, motivo: `Erro na IA: ${result.code}` };
  }

  try {
    const data = JSON.parse(result.content) as LeituraCupomGenerico;
    return { ok: true, data, usage: result.usage };
  } catch {
    return { ok: false, fallbackManual: true, motivo: 'Resposta da IA não é JSON válido' };
  }
}

/**
 * Analisa uma avaria a partir de foto, áudio ou texto.
 * Modelo: gpt-4o (raciocínio mais sofisticado para classificar urgência)
 */
export async function analisarAvaria(params: {
  tipo: 'foto' | 'audio' | 'texto';
  url?: string;
  texto?: string;
}): Promise<AIResult<AnaliseAvaria>> {
  const { tipo, url, texto } = params;

  // Se for áudio, transcrever primeiro
  if (tipo === 'audio' && url) {
    const transcricao = await transcreverAudio(url);
    if (!transcricao.ok) {
      return { ok: false, fallbackManual: true, motivo: 'Não foi possível transcrever o áudio' };
    }
    // Redireciona para análise por texto
    return analisarAvaria({ tipo: 'texto', texto: transcricao.data.texto });
  }

  // Análise por foto
  if (tipo === 'foto' && url) {
    const result = await chatCompletion({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: PROMPT_ANALISAR_AVARIA_FOTO.system },
        {
          role: 'user',
          content: [
            { type: 'text', text: PROMPT_ANALISAR_AVARIA_FOTO.user },
            { type: 'image_url', image_url: { url } },
          ],
        },
      ],
      response_format: { type: 'json_object' },
    });

    if (!result.ok) {
      console.error('[aiService] analisarAvaria(foto) falhou:', result.error);
      return { ok: false, fallbackManual: true, motivo: `Erro na IA: ${result.code}` };
    }

    try {
      const data = JSON.parse(result.content) as AnaliseAvaria;
      return { ok: true, data, usage: result.usage };
    } catch {
      return { ok: false, fallbackManual: true, motivo: 'Resposta da IA não é JSON válido' };
    }
  }

  // Análise por texto
  if (tipo === 'texto' && texto) {
    const result = await chatCompletion({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: PROMPT_ANALISAR_AVARIA_TEXTO.system },
        { role: 'user', content: PROMPT_ANALISAR_AVARIA_TEXTO.user(texto) },
      ],
      response_format: { type: 'json_object' },
    });

    if (!result.ok) {
      console.error('[aiService] analisarAvaria(texto) falhou:', result.error);
      return { ok: false, fallbackManual: true, motivo: `Erro na IA: ${result.code}` };
    }

    try {
      const data = JSON.parse(result.content) as AnaliseAvaria;
      return { ok: true, data, usage: result.usage };
    } catch {
      return { ok: false, fallbackManual: true, motivo: 'Resposta da IA não é JSON válido' };
    }
  }

  return { ok: false, fallbackManual: true, motivo: 'Parâmetros inválidos para análise de avaria' };
}

/**
 * Transcreve áudio usando Whisper.
 * Modelo: whisper-1
 */
export async function transcreverAudio(audioUrl: string): Promise<AIResult<TranscricaoAudio>> {
  const result = await whisperTranscription({ audioUrl, language: 'pt' });

  if (!result.ok) {
    console.error('[aiService] transcreverAudio falhou:', result.error);
    return { ok: false, fallbackManual: true, motivo: `Erro na transcrição: ${result.code}` };
  }

  return { ok: true, data: { texto: result.text } };
}

/**
 * Classifica uma mídia (foto) para o Smart Intent Router.
 * Modelo: gpt-4o-mini (leve, rápido)
 */
export async function classificarMidia(fotoUrl: string): Promise<AIResult<ClassificacaoMidia>> {
  const result = await chatCompletion({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: PROMPT_CLASSIFICAR_MIDIA.system },
      {
        role: 'user',
        content: [
          { type: 'text', text: PROMPT_CLASSIFICAR_MIDIA.user },
          { type: 'image_url', image_url: { url: fotoUrl } },
        ],
      },
    ],
    response_format: { type: 'json_object' },
  });

  if (!result.ok) {
    console.error('[aiService] classificarMidia falhou:', result.error);
    return { ok: false, fallbackManual: true, motivo: `Erro na IA: ${result.code}` };
  }

  try {
    const data = JSON.parse(result.content) as ClassificacaoMidia;
    return { ok: true, data, usage: result.usage };
  } catch {
    return { ok: false, fallbackManual: true, motivo: 'Resposta da IA não é JSON válido' };
  }
}

/**
 * Extrai dados de um pedido de frete a partir de documento (foto/PDF).
 * Modelo: gpt-4o (precisa de raciocínio sofisticado)
 */
export async function extrairPedidoFrete(fotoUrl: string): Promise<AIResult<PedidoFreteExtraido>> {
  const result = await chatCompletion({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: PROMPT_EXTRAIR_PEDIDO_FRETE.system },
      {
        role: 'user',
        content: [
          { type: 'text', text: PROMPT_EXTRAIR_PEDIDO_FRETE.user },
          { type: 'image_url', image_url: { url: fotoUrl } },
        ],
      },
    ],
    max_tokens: 1500,
    response_format: { type: 'json_object' },
  });

  if (!result.ok) {
    console.error('[aiService] extrairPedidoFrete falhou:', result.error);
    return { ok: false, fallbackManual: true, motivo: `Erro na IA: ${result.code}` };
  }

  try {
    const data = JSON.parse(result.content) as PedidoFreteExtraido;
    return { ok: true, data, usage: result.usage };
  } catch {
    return { ok: false, fallbackManual: true, motivo: 'Resposta da IA não é JSON válido' };
  }
}

/**
 * Classifica a intenção de um texto livre.
 * Modelo: gpt-4o-mini
 */
export async function classificarIntentTexto(
  texto: string,
  role: 'motorista' | 'gestor'
): Promise<AIResult<IntentClassificada>> {
  const prompt = role === 'gestor' ? PROMPT_CLASSIFICAR_INTENT_GESTOR : PROMPT_CLASSIFICAR_INTENT_MOTORISTA;

  const result = await chatCompletion({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: prompt.system },
      { role: 'user', content: prompt.user(texto) },
    ],
    response_format: { type: 'json_object' },
  });

  if (!result.ok) {
    console.error('[aiService] classificarIntentTexto falhou:', result.error);
    return { ok: false, fallbackManual: true, motivo: `Erro na IA: ${result.code}` };
  }

  try {
    const data = JSON.parse(result.content) as IntentClassificada;
    return { ok: true, data, usage: result.usage };
  } catch {
    return { ok: false, fallbackManual: true, motivo: 'Resposta da IA não é JSON válido' };
  }
}
