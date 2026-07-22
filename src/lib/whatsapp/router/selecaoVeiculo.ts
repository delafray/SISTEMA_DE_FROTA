/**
 * Seleção de veículo do motorista (extraído do messageRouter na quebra de
 * 22/07/2026; comportamento idêntico).
 *
 * Fluxo: sessão nova/saudação → lista de caminhões ativos da empresa →
 * escolha salva na sessão (veiculo_id/placa) → menu principal.
 */

import type { ParsedMessage } from '@/lib/whatsapp/messageParser';
import { createLogger } from '@/lib/logger';
import type { UserIdentity } from '@/lib/whatsapp/auth';
import { updateSession, type Sessao } from '@/lib/whatsapp/sessionManager';
import { enviarTexto, type OpcaoMenu } from '@/lib/whatsapp/messageSender';
import { enviarMenuLista } from '@/lib/whatsapp/menuHelper';
import { enviarMenuMotorista } from './menuMotorista';

const log = createLogger('router');

export async function enviarSelecaoVeiculo(
  para: string,
  nomeMotorista: string,
  empresaId: string,
  sessionId: string
): Promise<void> {
  log.info('enviar_selecao_veiculo_inicio', { para, empresa_id: empresaId });

  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: veiculos, error } = await supabase
    .from('veiculos')
    .select('id, placa, apelido, marca, modelo')
    .eq('empresa_id', empresaId)
    .eq('ativo', true)
    .order('placa');

  if (error) {
    log.error('veiculos_query_failed', { code: error.code, message: error.message });
  }

  log.info('veiculos_carregados', { count: veiculos?.length ?? 0, empresa_id: empresaId });

  if (!veiculos || veiculos.length === 0) {
    const enviado = await enviarTexto(para, `Olá, ${nomeMotorista}! 👋\n\nNenhum caminhão cadastrado na empresa. Fale com o gestor.`);
    log.info('aviso_sem_veiculo_enviado', { para, enviado });
    return;
  }

  const opcoes: OpcaoMenu[] = veiculos.slice(0, 10).map((v) => ({
    id: `veiculo_${v.id}`,
    titulo: v.placa,
    descricao: `${v.apelido || ''} ${v.marca || ''} ${v.modelo || ''}`.trim() || undefined,
  }));

  const enviado = await enviarMenuLista(
    sessionId,
    para,
    `Olá, ${nomeMotorista}! 👋\nQual caminhão você vai usar hoje?`,
    opcoes,
    undefined,
    { incluirVoltar: false, incluirSair: false }
  );
  log.info('lista_veiculos_enviada', { para, count: veiculos.length, enviado });

  await updateSession(sessionId, { estado: 'aguardando_veiculo' });
}

export async function processarSelecaoVeiculo(
  msg: ParsedMessage,
  sessao: Sessao,
  identity: Extract<UserIdentity, { tipo: 'motorista' }>
): Promise<void> {
  // Verificar se é resposta de lista
  if (msg.tipo !== 'lista' || !msg.listaId?.startsWith('veiculo_')) {
    await enviarTexto(msg.from, 'Por favor, selecione um caminhão da lista acima. 🚛');
    return;
  }

  const veiculoId = msg.listaId.replace('veiculo_', '');

  // Buscar dados do veículo
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: veiculo, error: errVeiculo } = await supabase
    .from('veiculos')
    .select('id, placa, km_atual, empresa_id')
    .eq('id', veiculoId)
    .eq('empresa_id', identity.empresa_id)
    .single();

  if (errVeiculo) {
    log.error('selecao_veiculo_db_error', { veiculoId, code: errVeiculo.code, message: errVeiculo.message });
    await enviarTexto(msg.from, 'Erro temporario ao buscar o caminhao. Tente em alguns segundos.');
    return;
  }

  if (!veiculo) {
    await enviarTexto(msg.from, 'Caminhão não encontrado. Tente novamente.');
    return;
  }

  // Salvar veículo na sessão e enviar menu
  await updateSession(sessao.id, {
    estado: 'aguardando_acao',
    contexto: {
      veiculo_id: veiculo.id,
      veiculo_placa: veiculo.placa,
    },
  });

  // Atualizar sessão local
  sessao.contexto.veiculo_id = veiculo.id;
  sessao.contexto.veiculo_placa = veiculo.placa;

  await enviarMenuMotorista(msg.from, sessao);
}
