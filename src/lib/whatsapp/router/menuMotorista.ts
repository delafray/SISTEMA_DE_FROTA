/**
 * Menu principal do motorista + status do veículo (extraído do messageRouter
 * na quebra de 22/07/2026; comportamento idêntico).
 *
 * Só APRESENTAÇÃO (envia menu/status). O processamento das escolhas
 * (processarMenuMotorista) fica no messageRouter, que roteia pros flows.
 */

import { createLogger } from '@/lib/logger';
import type { Sessao } from '@/lib/whatsapp/sessionManager';
import { enviarTexto, type OpcaoMenu } from '@/lib/whatsapp/messageSender';
import { enviarMenuLista } from '@/lib/whatsapp/menuHelper';

const log = createLogger('router');

export async function enviarMenuMotorista(para: string, sessao: Sessao): Promise<void> {
  const placa = sessao.contexto.veiculo_placa ?? '---';

  const opcoes: OpcaoMenu[] = [
    { id: 'acao_checklist', titulo: '📋 Checklist do dia' },
    { id: 'acao_viagem', titulo: '🛣️ Iniciar Viagem' },
    { id: 'acao_km', titulo: '📸 Informar KM' },
    { id: 'acao_abastecimento', titulo: '⛽ Abastecimento' },
    { id: 'acao_avaria', titulo: '⚠️ Relatar Avaria' },
    { id: 'acao_adiantamento', titulo: '💰 Pedir adiantamento' },
    { id: 'acao_despesa', titulo: '🧾 Registrar despesa' },
    { id: 'acao_imprevisto', titulo: '⚠️ Comunicar imprevisto' },
    { id: 'acao_status', titulo: '🔍 Status do caminhão' },
    { id: 'acao_documentos', titulo: '📄 Meus documentos' },
  ];

  await enviarMenuLista(
    sessao.id,
    para,
    `🚛 Caminhão: *${placa}*\n\nO que você precisa fazer?`,
    opcoes,
    'Ou mande uma foto/áudio direto!'
  );
}

export async function enviarStatusVeiculo(para: string, sessao: Sessao): Promise<void> {
  if (!sessao.contexto.veiculo_id) {
    await enviarTexto(para, 'Nenhum caminhão selecionado. Envie "Oi" para começar.');
    return;
  }

  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: veiculo, error: errVeiculo } = await supabase
    .from('veiculos')
    .select('placa, km_atual, marca, modelo, empresa_id')
    .eq('id', sessao.contexto.veiculo_id)
    .eq('empresa_id', sessao.empresa_id)
    .single();

  if (errVeiculo) {
    log.error('status_veiculo_db_error', { veiculoId: sessao.contexto.veiculo_id, code: errVeiculo.code, message: errVeiculo.message });
    await enviarTexto(para, 'Erro temporario ao buscar o caminhao. Tente em alguns segundos.');
    return;
  }
  if (!veiculo) {
    await enviarTexto(para, 'Caminhão não encontrado.');
    return;
  }

  // Buscar avarias abertas
  const { data: avarias, error: errAvarias } = await supabase
    .from('avarias')
    .select('descricao, urgencia, empresa_id')
    .eq('veiculo_id', sessao.contexto.veiculo_id)
    .eq('empresa_id', sessao.empresa_id)
    .in('status', ['aberta', 'em_analise']);

  if (errAvarias) {
    log.warn('avarias_query_warn', { veiculoId: sessao.contexto.veiculo_id, message: errAvarias.message });
    // Continua com avarias=null, mensagem mostra "sem dados de avaria"
  }

  // B23: usa avarias diretamente — temProblema era flag derivada redundante.
  const temAvarias = !!avarias && avarias.length > 0;
  const kmFormatado = veiculo.km_atual ? new Intl.NumberFormat('pt-BR').format(veiculo.km_atual) : '---';

  let mensagem = `🚛 *${veiculo.placa}* — ${temAvarias ? 'ATENÇÃO ⚠️' : 'TUDO CERTO ✅'}\n\n`;
  mensagem += `📏 KM atual: ${kmFormatado}\n`;
  mensagem += `🚛 ${veiculo.marca || ''} ${veiculo.modelo || ''}\n`;

  if (temAvarias) {
    mensagem += '\n';
    for (const av of avarias) {
      // B24: urgencia pode ser null em registros legados — default 'media' antes
      // de renderizar (evita 'undefined' aparecer no WhatsApp).
      const urgencia = av.urgencia ?? 'media';
      const emoji = urgencia === 'critica' ? '🔴' : urgencia === 'alta' ? '🟠' : '🟡';
      mensagem += `${emoji} ${av.descricao}\n`;
    }
    mensagem += '\n⚠️ Fale com o gestor antes de iniciar nova viagem.';
  } else {
    mensagem += '\nNenhuma avaria pendente. Bom trabalho! 💪';
  }

  await enviarTexto(para, mensagem);
}
