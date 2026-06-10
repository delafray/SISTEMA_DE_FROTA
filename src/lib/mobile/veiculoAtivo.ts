/**
 * Caminhão ativo do motorista — apelido, modelo, placa e último km informado.
 *
 * Fonte: alocação OPERACIONAL aberta (`alocacoes.fim IS NULL`) do motorista →
 * veículo correspondente. Mesmo critério já usado no formulário de
 * abastecimento (src/app/(motorista)/motorista/abastecimentos/novo).
 *
 * Offline-first: ao buscar com sucesso, guarda um snapshot no localStorage;
 * sem internet (ou qualquer falha), devolve o snapshot salvo — o motorista
 * continua vendo o caminhão dele na tela inicial e na tela de rota.
 */

import { createClient } from '@/lib/supabase/client';

export interface VeiculoAtivo {
  id: string;
  apelido: string | null;
  modelo: string;
  placa: string;
  km_atual: number | null;
}

const chaveCache = (motoristaId: string) => `frota_veiculo_${motoristaId}`;

function lerCache(motoristaId: string): VeiculoAtivo | null {
  try {
    const bruto = localStorage.getItem(chaveCache(motoristaId));
    if (!bruto) return null;
    const dados = JSON.parse(bruto) as { veiculo?: VeiculoAtivo };
    return dados.veiculo ?? null;
  } catch {
    return null;
  }
}

function salvarCache(motoristaId: string, veiculo: VeiculoAtivo): void {
  try {
    localStorage.setItem(
      chaveCache(motoristaId),
      JSON.stringify({ veiculo, salvo_em: new Date().toISOString() })
    );
  } catch {
    /* localStorage cheio/indisponível — cache é best-effort */
  }
}

/**
 * Busca o caminhão da alocação ativa do motorista. Online atualiza o cache;
 * em falha de rede cai pro snapshot local. Retorna null se o motorista não
 * tem alocação ativa (estado real, não usa cache).
 */
export async function carregarVeiculoAtivo(motoristaId: string): Promise<VeiculoAtivo | null> {
  try {
    const supabase = createClient();
    const { data: vinculo, error: erroVinculo } = await supabase
      .from('alocacoes')
      .select('veiculo_id')
      .eq('motorista_id', motoristaId)
      .eq('status', 'operacional')
      .is('fim', null)
      .maybeSingle();
    if (erroVinculo) throw erroVinculo;
    if (!vinculo?.veiculo_id) return null;

    const { data: veiculo, error: erroVeiculo } = await supabase
      .from('veiculos')
      .select('id, apelido, modelo, placa, km_atual')
      .eq('id', vinculo.veiculo_id)
      .maybeSingle();
    if (erroVeiculo) throw erroVeiculo;
    if (!veiculo) return null;

    salvarCache(motoristaId, veiculo);
    return veiculo;
  } catch {
    // Offline ou erro de rede — usa o último snapshot salvo no aparelho.
    return lerCache(motoristaId);
  }
}

/** Linha compacta pra exibir nos headers: "Leão · VW 24.280 · ABC1D23 · 152.340 km". */
export function linhaVeiculo(v: VeiculoAtivo): string {
  const partes: string[] = [];
  if (v.apelido) partes.push(v.apelido);
  partes.push(v.modelo, v.placa);
  if (v.km_atual != null) partes.push(`${v.km_atual.toLocaleString('pt-BR')} km`);
  return partes.join(' · ');
}
