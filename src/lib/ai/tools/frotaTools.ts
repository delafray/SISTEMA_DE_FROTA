/**
 * Tools (function calling) que o Gemini pode chamar quando o motorista/gestor
 * pergunta sobre a frota. Mantém escopo bem restrito pra teste inicial:
 * - listar motoristas (count + nomes)
 * - listar veiculos (count + placa/apelido/marca/modelo)
 * - buscar_km_caminhao (km_atual do caminhão do motorista)
 * - atualizar_km_caminhao (registra novo KM via km_logs → trigger atualiza veiculos.km_atual)
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
  {
    name: 'buscar_km_caminhao',
    description:
      'Busca a quilometragem atual (KM do hodometro) do caminhao do motorista. ' +
      'Use quando o motorista perguntar: "qual meu km", "quantos km tem o caminhao", ' +
      '"me fala o km atual", "qual o km do caminhao", "qual e o hodometro". ' +
      'Devolve placa, km_atual e data da ultima atualizacao.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {},
      required: [],
    },
  },
  {
    name: 'atualizar_km_caminhao',
    description:
      'Atualiza a quilometragem (KM do hodometro) do caminhao do motorista. ' +
      'Use quando o motorista disser o km atual, como: "meu km e 45320", ' +
      '"o caminhao ta em 125.000 km", "quero atualizar o km para 89500", ' +
      '"registra 45000 km", "coloca 89000 no km". Extraia o numero do km da mensagem e chame esta funcao.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        km_novo: {
          type: SchemaType.NUMBER,
          description: 'O valor de KM do hodometro a ser registrado (numero inteiro positivo).',
        },
      },
      required: ['km_novo'],
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

/**
 * Busca o km_atual do caminhão vinculado ao motorista.
 * Estratégia 1: último km_log do motorista → pega veiculo_id → busca veiculos.km_atual.
 * Estratégia 2 (fallback): pedido ativo do motorista → veiculo vinculado.
 */
export async function buscarKmCaminhao(
  empresaId: string,
  motoristaId: string
): Promise<ResultadoTool> {
  if (!motoristaId) return { ok: false, erro: 'motorista nao identificado' };
  const supabase = getSupabase();

  // 1. Último km_log do motorista
  const { data: kmLog } = await supabase
    .from('km_logs')
    .select('veiculo_id, km_lido, created_at')
    .eq('motorista_id', motoristaId)
    .eq('empresa_id', empresaId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (kmLog?.veiculo_id) {
    const { data: veiculo } = await supabase
      .from('veiculos')
      .select('placa, km_atual, apelido, marca, modelo')
      .eq('id', kmLog.veiculo_id)
      .maybeSingle();

    if (veiculo) {
      log.info('buscar_km_caminhao_via_km_log', { motoristaId, placa: veiculo.placa });
      return {
        ok: true,
        dados: {
          placa: veiculo.placa,
          apelido: veiculo.apelido ?? null,
          marca: veiculo.marca ?? null,
          modelo: veiculo.modelo ?? null,
          km_atual: veiculo.km_atual,
          ultima_atualizacao: kmLog.created_at,
        },
      };
    }
  }

  // 2. Fallback: pedido ativo
  const { data: pedido } = await supabase
    .from('pedidos')
    .select('veiculo_id, veiculos(placa, km_atual, apelido, marca, modelo)')
    .eq('motorista_id', motoristaId)
    .eq('empresa_id', empresaId)
    .in('status', ['em_andamento', 'aguardando'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (pedido && pedido.veiculos) {
    const v = pedido.veiculos as {
      placa: string;
      km_atual: number | null;
      apelido: string | null;
      marca: string | null;
      modelo: string | null;
    };
    log.info('buscar_km_caminhao_via_pedido', { motoristaId, placa: v.placa });
    return {
      ok: true,
      dados: {
        placa: v.placa,
        apelido: v.apelido ?? null,
        marca: v.marca ?? null,
        modelo: v.modelo ?? null,
        km_atual: v.km_atual,
        ultima_atualizacao: null,
      },
    };
  }

  log.warn('buscar_km_caminhao_sem_veiculo', { motoristaId });
  return {
    ok: false,
    erro: 'Nao encontrei um caminhao vinculado a voce. Informe qual caminhao voce esta usando.',
  };
}

/**
 * Registra novo KM para o caminhão do motorista via km_logs.
 * O trigger do banco propaga o valor para veiculos.km_atual automaticamente.
 * Rejeita valores menores que o km_atual atual (integridade do odômetro).
 */
export async function atualizarKmCaminhao(
  empresaId: string,
  motoristaId: string,
  kmNovo: number
): Promise<ResultadoTool> {
  if (!motoristaId) return { ok: false, erro: 'motorista nao identificado' };
  if (!kmNovo || kmNovo <= 0 || kmNovo > 9_999_999) {
    return { ok: false, erro: `km invalido: ${kmNovo}` };
  }

  const supabase = getSupabase();

  // Reutiliza busca para encontrar o veiculo
  const kmResult = await buscarKmCaminhao(empresaId, motoristaId);
  if (!kmResult.ok) {
    return { ok: false, erro: 'Nao encontrei o caminhao vinculado a voce.' };
  }

  const dados = kmResult.dados as { placa: string; km_atual: number | null };

  const { data: veiculo } = await supabase
    .from('veiculos')
    .select('id, km_atual')
    .eq('placa', dados.placa)
    .eq('empresa_id', empresaId)
    .maybeSingle();

  if (!veiculo) {
    return { ok: false, erro: 'Veiculo nao encontrado no banco.' };
  }

  const kmAtual = veiculo.km_atual ?? 0;
  if (kmNovo < kmAtual) {
    return {
      ok: false,
      erro: `O KM informado (${kmNovo.toLocaleString('pt-BR')}) e menor que o atual (${kmAtual.toLocaleString('pt-BR')}). Verifique o valor ou fale com o gestor.`,
    };
  }

  const { error } = await supabase.from('km_logs').insert({
    veiculo_id: veiculo.id,
    motorista_id: motoristaId,
    empresa_id: empresaId,
    km_lido: kmNovo,
    tipo: 'informado',
  });

  if (error) {
    log.error('atualizar_km_erro', { motoristaId, kmNovo, message: error.message });
    return { ok: false, erro: error.message };
  }

  log.info('atualizar_km_ok', { motoristaId, placa: dados.placa, kmNovo });
  return {
    ok: true,
    dados: {
      placa: dados.placa,
      km_registrado: kmNovo,
      km_anterior: kmAtual,
    },
  };
}

// ─── Dispatcher (chamado pelo geminiClient quando Gemini pede tool) ──

export async function executarTool(
  nome: string,
  empresaId: string,
  motoristaId?: string,
  args?: Record<string, unknown>
): Promise<ResultadoTool> {
  switch (nome) {
    case 'listar_motoristas':
      return listarMotoristas(empresaId);
    case 'listar_veiculos':
      return listarVeiculos(empresaId);
    case 'buscar_km_caminhao':
      return buscarKmCaminhao(empresaId, motoristaId ?? '');
    case 'atualizar_km_caminhao': {
      const kmNovo = typeof args?.km_novo === 'number' ? args.km_novo : Number(args?.km_novo);
      return atualizarKmCaminhao(empresaId, motoristaId ?? '', kmNovo);
    }
    default:
      return { ok: false, erro: `tool desconhecida: ${nome}` };
  }
}
