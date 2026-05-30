/**
 * Tools (function calling) que o Gemini pode chamar quando o motorista/gestor
 * pergunta sobre a frota. Mantém escopo bem restrito pra teste inicial:
 * - listar motoristas (count + nomes)
 * - listar veiculos (count + placa/apelido/marca/modelo)
 *
 * O Gemini decide QUANDO chamar baseado nas descricoes das functionDeclarations
 * (em frotaTools.declarations). O retorno volta pro Gemini que entao formata
 * a resposta em linguagem natural.
 *
 * Sempre filtra por empresa_id pra nao vazar dados entre empresas.
 */

import { createClient } from '@supabase/supabase-js';
import { createLogger } from '@/lib/logger';
import { SchemaType, type FunctionDeclaration } from '@google/generative-ai';

const log = createLogger('frota-tools');

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ─── Declaracoes pro Gemini ──────────────────────────────────────────

export const declarations: FunctionDeclaration[] = [
  {
    name: 'listar_motoristas',
    description:
      'Lista TODOS os motoristas ativos da empresa do usuario. Use quando o usuario perguntar: ' +
      '"quantos motoristas tenho", "quais sao meus motoristas", "me da os nomes dos motoristas", ' +
      '"quem sao os motoristas". Devolve quantidade e nomes.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {},
      required: [],
    },
  },
  {
    name: 'listar_veiculos',
    description:
      'Lista TODOS os veiculos (caminhoes/carros) ativos da empresa do usuario. ' +
      'Use quando perguntar: "quantos caminhoes tenho", "quais sao meus veiculos", ' +
      '"qual a placa do (apelido/marca)", "me fala sobre os caminhoes". ' +
      'Devolve quantidade e detalhes: placa, apelido, marca, modelo.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {},
      required: [],
    },
  },
];

// ─── Implementacao das tools ──────────────────────────────────────────

export interface ResultadoTool {
  ok: boolean;
  dados?: unknown;
  erro?: string;
}

export async function listarMotoristas(empresaId: string): Promise<ResultadoTool> {
  if (!empresaId) return { ok: false, erro: 'sem empresa identificada' };
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('motoristas')
    .select('nome')
    .eq('empresa_id', empresaId)
    .eq('ativo', true)
    .order('nome');

  if (error) {
    log.error('listar_motoristas_erro', { empresaId, message: error.message });
    return { ok: false, erro: error.message };
  }

  const nomes = (data ?? []).map((m) => m.nome as string);
  return {
    ok: true,
    dados: {
      quantidade: nomes.length,
      nomes,
    },
  };
}

export async function listarVeiculos(empresaId: string): Promise<ResultadoTool> {
  if (!empresaId) return { ok: false, erro: 'sem empresa identificada' };
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('veiculos')
    .select('placa, apelido, marca, modelo')
    .eq('empresa_id', empresaId)
    .eq('ativo', true)
    .order('placa');

  if (error) {
    log.error('listar_veiculos_erro', { empresaId, message: error.message });
    return { ok: false, erro: error.message };
  }

  const veiculos = data ?? [];
  return {
    ok: true,
    dados: {
      quantidade: veiculos.length,
      veiculos: veiculos.map((v) => ({
        placa: v.placa,
        apelido: v.apelido || null,
        marca: v.marca || null,
        modelo: v.modelo || null,
      })),
    },
  };
}

// ─── Dispatcher (chamado pelo geminiClient quando Gemini pede tool) ──

export async function executarTool(
  nome: string,
  empresaId: string
): Promise<ResultadoTool> {
  switch (nome) {
    case 'listar_motoristas':
      return listarMotoristas(empresaId);
    case 'listar_veiculos':
      return listarVeiculos(empresaId);
    default:
      return { ok: false, erro: `tool desconhecida: ${nome}` };
  }
}
