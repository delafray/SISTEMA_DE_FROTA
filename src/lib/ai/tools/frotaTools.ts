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
      'Busca a quilometragem atual (KM do hodometro) de um caminhao. ' +
      'Sem parametro: busca o caminhao VINCULADO ao motorista (via km_logs ou pedido ativo). ' +
      'Com parametro: busca por placa OU apelido na empresa (ex: "leao", "ABC1234"). ' +
      'Use quando perguntarem: "qual meu km", "quantos km tem o leao", "quanto km tem o caminhao X", ' +
      '"qual o km do hodometro". Devolve placa, apelido, km_atual e data da ultima atualizacao.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        placa_ou_apelido: {
          type: SchemaType.STRING,
          description:
            'OPCIONAL. Placa (ex: "ABC1234") ou apelido (ex: "leao", "tigrao") do caminhao. ' +
            'Omita se o motorista nao especificou qual caminhao — ai usa o vinculado a ele.',
        },
      },
      required: [],
    },
  },
  {
    name: 'meu_caminhao',
    description:
      'Devolve o caminhao VINCULADO ao motorista (placa, apelido, marca, modelo, km_atual). ' +
      'Use quando o motorista perguntar: "qual e meu caminhao", "qual caminhao esta comigo", ' +
      '"qual veiculo esta relacionado a mim", "que caminhao estou dirigindo".',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {},
      required: [],
    },
  },
  {
    name: 'propor_atualizacao_km',
    description:
      'PRIMEIRO passo pra atualizar o KM do caminhao. NAO atualiza nada — devolve preview ' +
      'pra mostrar pro motorista (km_atual vs km_novo, diferenca). ' +
      'Use quando o motorista informar o KM novo (ex: "meu km e 45320", "ta em 125000"). ' +
      'Apresente o preview e pergunte "confirma?". Depois da confirmacao, use confirmar_atualizacao_km.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        km_novo: {
          type: SchemaType.NUMBER,
          description: 'KM do hodometro proposto. Numero inteiro positivo.',
        },
      },
      required: ['km_novo'],
    },
  },
  {
    name: 'confirmar_atualizacao_km',
    description:
      'SEGUNDO passo — executa a gravacao do KM no banco. Use APENAS depois que o motorista ' +
      'confirmou EXPLICITAMENTE ("sim", "confirma", "isso", "pode", "ok") a proposta feita ' +
      'pela propor_atualizacao_km. NUNCA chame esta tool sem confirmacao explicita do motorista.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        km_novo: {
          type: SchemaType.NUMBER,
          description: 'O MESMO KM que foi proposto e confirmado pelo motorista.',
        },
      },
      required: ['km_novo'],
    },
  },
  {
    name: 'criar_lembrete',
    description:
      'Cria/salva um lembrete (anotação) que aparece no painel do gestor. ' +
      'Use SEMPRE que o gestor pedir para ANOTAR, LEMBRAR, GUARDAR, REGISTRAR ou SALVAR uma informação — ' +
      'em QUALQUER frase, ex: "cria um lembrete pra eu ligar pro cliente", "me lembra de pagar o fornecedor", ' +
      '"anota aí que fechei contrato com fulano por 5 mil", "guarda esse dado: ...", "registra que a carreta voltou". ' +
      'NÃO use para nota fiscal, número de nota ou consultas — só para anotações que o gestor quer guardar. ' +
      'Passe no campo texto o conteúdo limpo do que ele quer lembrar (sem a palavra "lembrete"). ' +
      'Após salvar, confirme em uma frase curta que foi anotado.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        texto: {
          type: SchemaType.STRING,
          description: 'O conteúdo do lembrete, limpo (ex: "Ligar pro cliente João amanhã de manhã").',
        },
      },
      required: ['texto'],
    },
  },
];

// ─── Implementacao das tools ──────────────────────────────────────────

export interface ResultadoTool {
  ok: boolean;
  dados?: unknown;
  erro?: string;
  /** Codigo de erro tipado pra discriminar handling no caller (logging, retry, refusal). */
  codigo?: 'sem_permissao' | 'nao_encontrado' | 'validacao' | 'db';
}

export async function criarLembrete(
  empresaId: string,
  usuarioId: string | undefined,
  texto: unknown,
  criadoPorNome?: string,
  criadoPorTelefone?: string
): Promise<ResultadoTool> {
  // Regra: qualquer telefone cadastrado pode anotar. Só exige empresa + texto.
  // usuario_id é opcional (motorista pode não ter perfil vinculado) — o nome/telefone
  // de quem criou é guardado direto pra atribuição no painel.
  if (!empresaId) return { ok: false, erro: 'sem empresa identificada', codigo: 'sem_permissao' };
  const conteudo = typeof texto === 'string' ? texto.trim() : '';
  if (!conteudo) return { ok: false, erro: 'texto do lembrete vazio', codigo: 'validacao' };

  const supabase = getSupabase();
  const { error } = await supabase.from('lembretes').insert({
    empresa_id: empresaId,
    usuario_id: usuarioId ?? null,
    texto: conteudo,
    origem: 'whatsapp',
    criado_por_nome: criadoPorNome ?? null,
    criado_por_telefone: criadoPorTelefone ?? null,
  });

  if (error) {
    log.error('criar_lembrete_erro', { empresaId, message: error.message });
    return { ok: false, erro: error.message, codigo: 'db' };
  }

  return { ok: true, dados: { texto: conteudo, salvo: true } };
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
 * Busca o km_atual de um caminhão.
 * Modo A (placaOuApelido informado): busca por placa OU apelido (case-insensitive) na empresa.
 * Modo B (sem parametro): busca o caminhão vinculado ao motorista
 *   1. último km_log do motorista → pega veiculo_id → busca veiculos.km_atual
 *   2. fallback: pedido ativo do motorista → veiculo vinculado
 */
export async function buscarKmCaminhao(
  empresaId: string,
  motoristaId: string | undefined,
  placaOuApelido?: string
): Promise<ResultadoTool> {
  if (!empresaId) return { ok: false, erro: 'empresa nao identificada' };
  const supabase = getSupabase();

  // ── MODO A: buscar caminhao por placa/apelido (qualquer um da empresa) ──
  const filtro = (placaOuApelido ?? '').trim();
  if (filtro) {
    // ilike pra case-insensitive + or pra cobrir placa OU apelido
    const { data: veiculos, error } = await supabase
      .from('veiculos')
      .select('id, placa, apelido, marca, modelo, km_atual')
      .eq('empresa_id', empresaId)
      .eq('ativo', true)
      .or(`placa.ilike.%${filtro}%,apelido.ilike.%${filtro}%`)
      .limit(5);

    if (error) {
      log.error('buscar_km_por_apelido_erro', { filtro, message: error.message });
      return { ok: false, erro: error.message };
    }

    if (!veiculos || veiculos.length === 0) {
      return {
        ok: false,
        erro: `Nao encontrei caminhao com placa ou apelido "${filtro}". Use listar_veiculos pra ver os disponiveis.`,
      };
    }

    if (veiculos.length > 1) {
      const opcoes = veiculos.map((v) => `${v.placa}${v.apelido ? ` (${v.apelido})` : ''}`).join(', ');
      return {
        ok: false,
        erro: `Encontrei mais de um caminhao com "${filtro}": ${opcoes}. Pergunte ao motorista qual deles.`,
      };
    }

    const v = veiculos[0];
    log.info('buscar_km_por_apelido', { filtro, placa: v.placa });
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

  // ── MODO B: buscar caminhao vinculado ao motorista ──
  // B21: motoristaId pode ser undefined (semantica de "ausente"). Devolve sem_permissao.
  if (typeof motoristaId !== 'string' || motoristaId.trim() === '') {
    return { ok: false, codigo: 'sem_permissao', erro: 'motorista nao identificado (e nenhuma placa/apelido informados)' };
  }

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
    type VeiculoJoin = {
      placa: string;
      km_atual: number | null;
      apelido: string | null;
      marca: string | null;
      modelo: string | null;
    };
    // Supabase pode retornar objeto ou array dependendo da relação — normaliza
    const raw = pedido.veiculos as unknown;
    const v: VeiculoJoin = Array.isArray(raw) ? (raw[0] as VeiculoJoin) : (raw as VeiculoJoin);
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
 * Devolve o caminhão vinculado ao motorista (placa, apelido, marca, modelo, km_atual).
 * Atalho: chama buscarKmCaminhao sem filtro — caminho de descoberta é o mesmo
 * (km_logs do motorista → fallback pedido ativo).
 */
export async function meuCaminhao(
  empresaId: string,
  motoristaId: string | undefined
): Promise<ResultadoTool> {
  if (typeof motoristaId !== 'string' || motoristaId.trim() === '') {
    return { ok: false, codigo: 'sem_permissao', erro: 'motorista nao identificado' };
  }
  return buscarKmCaminhao(empresaId, motoristaId);
}

/**
 * Validação rigorosa do KM informado pela tool. Bloqueia:
 * - NaN (Number("abc") → NaN; antes passava como "verdadeiro")
 * - Infinity
 * - <= 0
 * - > 9.999.999 (caminhão extremo, qualquer coisa acima é digitação)
 * - não-inteiro (KM de hodômetro é sempre inteiro)
 */
function validarKm(kmNovo: unknown): { ok: true; valor: number } | { ok: false; erro: string } {
  if (typeof kmNovo !== 'number' && typeof kmNovo !== 'string') {
    return { ok: false, erro: `km invalido (tipo inesperado: ${typeof kmNovo})` };
  }
  const n = typeof kmNovo === 'number' ? kmNovo : Number(kmNovo);
  if (!Number.isFinite(n)) {
    return { ok: false, erro: `km invalido (NaN ou Infinity)` };
  }
  if (n <= 0) {
    return { ok: false, erro: `km invalido (deve ser maior que zero): ${n}` };
  }
  if (n > 9_999_999) {
    return { ok: false, erro: `km invalido (excede limite de 9.999.999): ${n}` };
  }
  // Aceita decimais que sao inteiros disfarcados (ex: 45000.0)
  const inteiro = Math.trunc(n);
  if (Math.abs(n - inteiro) > 0.01) {
    return { ok: false, erro: `km invalido (precisa ser inteiro): ${n}` };
  }
  return { ok: true, valor: inteiro };
}

/**
 * Localiza o veículo do motorista e devolve { id, placa, km_atual }.
 * Centraliza a logica usada pelas tools de KM (DRY).
 */
async function localizarVeiculoDoMotorista(
  empresaId: string,
  motoristaId: string
): Promise<
  | { ok: true; veiculo: { id: string; placa: string; apelido: string | null; km_atual: number } }
  | { ok: false; erro: string }
> {
  const kmResult = await buscarKmCaminhao(empresaId, motoristaId);
  if (!kmResult.ok) {
    return { ok: false, erro: kmResult.erro ?? 'caminhao nao localizado' };
  }
  const dados = kmResult.dados as { placa: string; km_atual: number | null; apelido?: string | null };

  const supabase = getSupabase();
  const { data: veiculo, error } = await supabase
    .from('veiculos')
    .select('id, placa, apelido, km_atual')
    .eq('placa', dados.placa)
    .eq('empresa_id', empresaId)
    .maybeSingle();

  if (error) {
    log.error('localizar_veiculo_erro', { motoristaId, message: error.message });
    return { ok: false, erro: error.message };
  }
  if (!veiculo) {
    return { ok: false, erro: 'Veiculo nao encontrado no banco.' };
  }
  return {
    ok: true,
    veiculo: {
      id: veiculo.id as string,
      placa: veiculo.placa as string,
      apelido: (veiculo.apelido as string | null) ?? null,
      km_atual: (veiculo.km_atual as number) ?? 0,
    },
  };
}

/**
 * Permission Loop — PASSO 1 (READ-ONLY).
 * Devolve preview da atualizacao SEM gravar nada. O Gemini usa o preview
 * pra perguntar "confirma?" ao motorista. Depois da confirmacao explicita,
 * Gemini chama confirmarAtualizacaoKm.
 */
export async function proporAtualizacaoKm(
  empresaId: string,
  motoristaId: string | undefined,
  kmNovoRaw: unknown
): Promise<ResultadoTool> {
  if (typeof motoristaId !== 'string' || motoristaId.trim() === '') {
    return { ok: false, codigo: 'sem_permissao', erro: 'motorista nao identificado' };
  }

  const val = validarKm(kmNovoRaw);
  if (!val.ok) return { ok: false, codigo: 'validacao', erro: val.erro };
  const kmNovo = val.valor;

  const vRes = await localizarVeiculoDoMotorista(empresaId, motoristaId);
  if (!vRes.ok) return { ok: false, erro: vRes.erro };
  const v = vRes.veiculo;

  if (kmNovo < v.km_atual) {
    return {
      ok: false,
      erro: `O KM proposto (${kmNovo.toLocaleString('pt-BR')}) e MENOR que o atual (${v.km_atual.toLocaleString('pt-BR')}). Hodometro nao volta — verifique o valor.`,
    };
  }

  log.info('proposta_km_gerada', { motoristaId, placa: v.placa, kmNovo, kmAtual: v.km_atual });
  return {
    ok: true,
    dados: {
      placa: v.placa,
      apelido: v.apelido,
      km_atual: v.km_atual,
      km_novo: kmNovo,
      diferenca: kmNovo - v.km_atual,
      mensagem_sugerida: `Vou registrar ${kmNovo.toLocaleString('pt-BR')} km no ${v.apelido ?? v.placa} (atual ${v.km_atual.toLocaleString('pt-BR')}). Confirma?`,
    },
  };
}

/**
 * Permission Loop — PASSO 2 (EXECUTA).
 * Re-valida tudo no momento da gravacao (optimistic — banco e a fonte da verdade).
 * Se motorista demorou pra confirmar e algo mudou, falha com mensagem clara.
 */
export async function confirmarAtualizacaoKm(
  empresaId: string,
  motoristaId: string | undefined,
  kmNovoRaw: unknown
): Promise<ResultadoTool> {
  if (typeof motoristaId !== 'string' || motoristaId.trim() === '') {
    return { ok: false, codigo: 'sem_permissao', erro: 'motorista nao identificado' };
  }

  const val = validarKm(kmNovoRaw);
  if (!val.ok) return { ok: false, codigo: 'validacao', erro: val.erro };
  const kmNovo = val.valor;

  const vRes = await localizarVeiculoDoMotorista(empresaId, motoristaId);
  if (!vRes.ok) return { ok: false, erro: vRes.erro };
  const v = vRes.veiculo;

  if (kmNovo < v.km_atual) {
    return {
      ok: false,
      erro: `O KM (${kmNovo.toLocaleString('pt-BR')}) e menor que o atual (${v.km_atual.toLocaleString('pt-BR')}). Outra atualizacao ja foi feita?`,
    };
  }

  const supabase = getSupabase();
  // tipo='checkpoint': constraint km_logs_tipo_check aceita apenas
  // inicial/final/checkpoint/abastecimento/manutencao/pausa. Update do
  // motorista no meio da operacao = checkpoint.
  // confirmado=true + correcao=false: trigger propagar_km_para_veiculo so
  // atualiza veiculos.km_atual com essas duas flags. Como passou pelo
  // Permission Loop (motorista ja confirmou), e seguro setar true.
  const { error } = await supabase.from('km_logs').insert({
    veiculo_id: v.id,
    motorista_id: motoristaId,
    empresa_id: empresaId,
    km_lido: kmNovo,
    tipo: 'checkpoint',
    confirmado: true,
    correcao: false,
  });

  if (error) {
    log.error('confirmar_km_erro', { motoristaId, kmNovo, message: error.message });
    return { ok: false, erro: error.message };
  }

  log.info('confirmar_km_ok', { motoristaId, placa: v.placa, kmNovo });
  return {
    ok: true,
    dados: {
      placa: v.placa,
      apelido: v.apelido,
      km_registrado: kmNovo,
      km_anterior: v.km_atual,
      mensagem_sugerida: `Registrado: ${kmNovo.toLocaleString('pt-BR')} km no ${v.apelido ?? v.placa}.`,
    },
  };
}

// ─── Dispatcher (chamado pelo geminiClient quando Gemini pede tool) ──

export async function executarTool(
  nome: string,
  empresaId: string,
  motoristaId?: string,
  args?: Record<string, unknown>,
  usuarioId?: string
): Promise<ResultadoTool> {
  // B21: NUNCA normalize undefined → ''. Tipos distintos = semantica distinta.
  // Tool valida e devolve erro 'sem_permissao' explicito quando motorista ausente.
  const motId = typeof motoristaId === 'string' && motoristaId.trim() !== '' ? motoristaId : undefined;
  const usrId = typeof usuarioId === 'string' && usuarioId.trim() !== '' ? usuarioId : undefined;
  switch (nome) {
    case 'criar_lembrete':
      return criarLembrete(empresaId, usrId, args?.texto);
    case 'listar_motoristas':
      return listarMotoristas(empresaId);
    case 'listar_veiculos':
      return listarVeiculos(empresaId);
    case 'buscar_km_caminhao':
      return buscarKmCaminhao(
        empresaId,
        motId,
        typeof args?.placa_ou_apelido === 'string' ? args.placa_ou_apelido : undefined
      );
    case 'meu_caminhao':
      return meuCaminhao(empresaId, motId);
    case 'propor_atualizacao_km':
      return proporAtualizacaoKm(empresaId, motId, args?.km_novo);
    case 'confirmar_atualizacao_km':
      return confirmarAtualizacaoKm(empresaId, motId, args?.km_novo);
    // BACKWARD-COMPAT: nome antigo redireciona pra propor (NUNCA executa direto).
    // Mantém pra historicos em cache ainda referenciarem a tool antiga sem erro.
    case 'atualizar_km_caminhao':
      log.warn('tool_legacy_atualizar_km', { motoristaId, args });
      return proporAtualizacaoKm(empresaId, motId, args?.km_novo);
    default:
      return { ok: false, erro: `tool desconhecida: ${nome}` };
  }
}
