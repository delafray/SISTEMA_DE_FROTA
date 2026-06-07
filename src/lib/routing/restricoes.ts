/**
 * Helpers de restricoes pra VROOM — converte entidades do dominio
 * (Parada, ClientePreferencia) em `Job`/`Veiculo` que o cliente VROOM aceita.
 *
 * Aqui ficam todas as decisoes de "como mapear nossas regras de negocio
 * pras restricoes do solver". Isolando aqui, podemos trocar de solver
 * (futuro) sem mexer no flow principal.
 *
 * Referencia: PLANO_ROTEIRIZACAO.md passo 1.9 + 3.10 (tabela de restricoes).
 */

import type { Coordenada, JanelaHorario, NotaCapturada, Parada } from './types';
import type { Job, Veiculo } from './vroom';

// Tempo padrao de descarga (segundos)
const TEMPO_DESCARGA_DEFAULT_S = 300; // 5 minutos

// Prioridades semanticas (0-100)
export const PRIORIDADE = {
  NORMAL: 0,
  ALTA: 50,
  FIXADA: 100, // junto com skills, garante que VROOM nao vai mexer
} as const;

// ─── HELPERS DE CONVERSAO ───────────────────────────────────────────

/**
 * Mapeia indices 0,1,2... pra IDs numericos do VROOM porque VROOM exige
 * id: number. Devolve um par {ids->id_local, payload}.
 */
export function indexarJobs<T extends { id: string }>(
  items: T[]
): { mapping: Map<number, string>; items: Array<T & { _idVroom: number }> } {
  const mapping = new Map<number, string>();
  const reindexed = items.map((item, i) => {
    const _idVroom = i + 1; // 1-based
    mapping.set(_idVroom, item.id);
    return { ...item, _idVroom };
  });
  return { mapping, items: reindexed };
}

/**
 * Converte uma NotaCapturada geocodificada em Job pro VROOM.
 * Throw se a nota nao tem lat/lng.
 */
export function notaParaJob(
  nota: NotaCapturada,
  idVroom: number,
  opts: {
    janelas?: JanelaHorario;
    prioridade?: number;
    tempo_descarga_s?: number;
  } = {}
): Job {
  if (nota.latitude === null || nota.longitude === null) {
    throw new Error(`nota ${nota.id} sem coordenadas — geocodifique antes`);
  }
  return {
    id: idVroom,
    localizacao: { lat: nota.latitude, lng: nota.longitude },
    tempo_descarga_s: opts.tempo_descarga_s ?? TEMPO_DESCARGA_DEFAULT_S,
    janelas: opts.janelas,
    prioridade: opts.prioridade,
  };
}

/**
 * Constroi um Veiculo VROOM a partir de uma coordenada de origem/destino.
 */
export function montarVeiculo(input: {
  id: number;
  inicio: Coordenada;
  fim?: Coordenada;
  capacidade?: number[];
  skills?: number[];
}): Veiculo {
  return {
    id: input.id,
    inicio: input.inicio,
    fim: input.fim,
    capacidade: input.capacidade,
    skills: input.skills,
  };
}

// ─── REGRAS DE NEGOCIO ──────────────────────────────────────────────

/**
 * Quando o motorista clica "Fixar nesta posicao" no app, queremos garantir
 * que VROOM nao mova a parada da posicao N. Estrategia: prioridade maxima
 * + skill exclusiva no veiculo (so o veiculo ate a posicao N consegue
 * atender). Como o motorista vai aplicar isso aos vivo (manual override),
 * por enquanto retornamos so a prioridade — a logica de "trancar posicao"
 * exata fica pra iteracao futura quando a tela de ajuste-rota for feita.
 */
export function aplicarFixacao(job: Job, _posicaoDesejada: number): Job {
  return { ...job, prioridade: PRIORIDADE.FIXADA };
}

/**
 * Aplica preferencias salvas do cliente (tabela `cliente_preferencias`) a
 * um Job. Suporta:
 * - janela_horario do cliente (sobrescreve janela do job se nao tinha)
 * - tempo_descarga_min do cliente (converte minutos -> segundos)
 * - posicao_preferida: 'primeira' → prioridade alta; 'ultima' → prioridade baixa (0)
 */
export function aplicarPreferenciaCliente(
  job: Job,
  pref: {
    janela_horario?: JanelaHorario | null;
    tempo_descarga_min?: number | null;
    posicao_preferida?: 'primeira' | 'ultima' | 'qualquer' | null;
  }
): Job {
  const resultado: Job = { ...job };

  if (pref.janela_horario && !job.janelas) {
    resultado.janelas = pref.janela_horario;
  }

  if (typeof pref.tempo_descarga_min === 'number' && pref.tempo_descarga_min > 0) {
    resultado.tempo_descarga_s = pref.tempo_descarga_min * 60;
  }

  if (pref.posicao_preferida === 'primeira') {
    resultado.prioridade = PRIORIDADE.ALTA;
  }
  // 'ultima' = manter prioridade 0 (VROOM tende a alocar prioridades altas primeiro)
  // 'qualquer' = sem mudanca

  return resultado;
}

/**
 * Calcula a ordem final aplicada ao banco a partir do resultado VROOM,
 * traduzindo de volta os IDs numericos do VROOM pros id_local das notas.
 */
export function traduzirParadasComMapping(
  paradasVroom: Array<{ nota_id: string; ordem: number; chegada_estimada: string }>,
  mapping: Map<number, string>
): Array<{ nota_id_local: string; ordem: number; chegada_estimada: string }> {
  return paradasVroom.map((p) => {
    const idLocal = mapping.get(Number(p.nota_id));
    if (!idLocal) {
      throw new Error(`mapping nao tem id ${p.nota_id} — bug no indexarJobs?`);
    }
    return { nota_id_local: idLocal, ordem: p.ordem, chegada_estimada: p.chegada_estimada };
  });
}

/**
 * Snapshot de Parada (entidade do dominio) que vai pro banco a partir do
 * resultado da otimizacao. Util pro endpoint /api/routing/otimizar persistir.
 */
export function montarParadasPersistir(
  paradasOrdenadas: Array<{ nota_id_local: string; ordem: number; chegada_estimada: string }>,
  notasIndexadas: Map<string, NotaCapturada>,
  rotaId: string,
  // EMPRESA 1: quando a rota nasce de um pedido, carimba pedido_id na parada.
  // Default undefined = captura solta (comportamento atual, parada sem pedido).
  pedidoId?: string | null
): Omit<Parada, 'id' | 'concluida_em'>[] {
  return paradasOrdenadas.map((p) => {
    const nota = notasIndexadas.get(p.nota_id_local);
    if (!nota || nota.latitude === null || nota.longitude === null) {
      throw new Error(`nota ${p.nota_id_local} faltando ou sem coords`);
    }
    return {
      rota_id: rotaId,
      nota_id: nota.id,
      pedido_id: pedidoId ?? nota.pedido_id ?? null,
      ordem: p.ordem,
      // Snapshot completo: copia o numero da casa + a confianca da coordenada
      // pra dentro do endereco jsonb. Sem isso a parada mostraria so "Rua Piata"
      // em vez de "Rua Piata, 104", e a tela de navegacao nao saberia se a coord
      // e precisa. Sem migration — coluna ja e jsonb. Default 'baixa' pra notas
      // que ja vinham geocodificadas (sem passar pelo resolver).
      endereco: {
        ...nota.endereco,
        numero: nota.numero,
        coord_confianca: nota.coord_confianca ?? 'baixa',
        coord_fonte: nota.coord_fonte ?? 'nominatim',
      },
      latitude: nota.latitude,
      longitude: nota.longitude,
      fixada: false,
      janela_horario: null,
      tempo_descarga_min: 5,
      observacao: nota.observacao,
    };
  });
}
