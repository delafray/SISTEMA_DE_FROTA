/**
 * Message Router — Cérebro central do bot WhatsApp.
 *
 * Recebe uma mensagem parseada e direciona para o fluxo correto
 * com base no estado da sessão + tipo da mensagem + role do remetente.
 *
 * Ordem de decisão:
 * 1. Identificar remetente (motorista / gestor / desconhecido)
 * 2. Buscar/criar sessão
 * 3. Se há estado pendente → delegar ao fluxo correto
 * 4. Se não há estado → analisar a mensagem (Smart Router ou menu)
 */

import type { ParsedMessage } from '@/lib/whatsapp/messageParser';
import { identificarRemetente, type UserIdentity } from '@/lib/whatsapp/auth';
import { getOrCreateSession, updateSession, type Sessao } from '@/lib/whatsapp/sessionManager';
import { enviarTexto, enviarBotoes, enviarLista } from '@/lib/whatsapp/messageSender';
import { processarKmFlow } from '@/lib/whatsapp/flows/kmFlow';
import { processarAvariaFlow } from '@/lib/whatsapp/flows/avariaFlow';
import { processarViagemFlow } from '@/lib/whatsapp/flows/viagemFlow';
import { processarAbastecimentoFlow } from '@/lib/whatsapp/flows/abastecimentoFlow';
import { processarChecklistFlow } from '@/lib/whatsapp/flows/checklistFlow';
import { processarAdiantamentoFlow } from '@/lib/whatsapp/flows/adiantamentoFlow';
import { processarDespesaFlow } from '@/lib/whatsapp/flows/despesaFlow';
import { processarImprevistoFlow } from '@/lib/whatsapp/flows/imprevistoFlow';

// ─── ROUTER PRINCIPAL ─────────────────────────────────────────────────

export async function processarMensagem(msg: ParsedMessage): Promise<void> {
  // 1. Identificar remetente
  const identity = await identificarRemetente(msg.from);

  if (identity.tipo === 'desconhecido') {
    // Não responder — conforme decisão do plano
    console.log(`[router] Número desconhecido: ${msg.from}. Ignorando.`);
    return;
  }

  // 2. Buscar/criar sessão
  const sessao = await getOrCreateSession({
    whatsapp: msg.from,
    motorista_id: identity.tipo === 'motorista' ? identity.motorista_id : null,
    usuario_id: identity.tipo === 'motorista' ? identity.usuario_id : identity.usuario_id,
    empresa_id: identity.empresa_id,
  });

  // 3. Rotear com base no role
  if (identity.tipo === 'motorista') {
    await rotearMotorista(msg, sessao, identity);
  } else {
    await rotearGestor(msg, sessao, identity);
  }
}

// ─── ROTEAMENTO MOTORISTA ─────────────────────────────────────────────

async function rotearMotorista(
  msg: ParsedMessage,
  sessao: Sessao,
  identity: Extract<UserIdentity, { tipo: 'motorista' }>
): Promise<void> {
  const { estado } = sessao;

  // Se sessão é nova ou saudação → enviar seleção de veículo
  if (estado === 'novo' || isSaudacao(msg)) {
    await enviarSelecaoVeiculo(msg.from, identity.nome, identity.empresa_id, sessao.id);
    return;
  }

  // Se está aguardando seleção de veículo
  if (estado === 'aguardando_veiculo') {
    await processarSelecaoVeiculo(msg, sessao, identity);
    return;
  }

  // ── ESTADOS DELEGADOS AOS FLOWS ──

  // KM
  if (['aguardando_foto_km', 'aguardando_confirmacao_km', 'aguardando_km_manual'].includes(estado)) {
    await processarKmFlow(msg, sessao);
    return;
  }

  // Avaria
  if (['aguardando_avaria_midia', 'aguardando_confirmacao_avaria'].includes(estado)) {
    await processarAvariaFlow(msg, sessao);
    return;
  }

  // Viagem
  if (['aguardando_origem_destino', 'aguardando_cliente', 'aguardando_valor_frete'].includes(estado)) {
    await processarViagemFlow(msg, sessao);
    return;
  }

  // Abastecimento
  if (['aguardando_foto_abastecimento', 'aguardando_confirmacao_abastecimento'].includes(estado)) {
    await processarAbastecimentoFlow(msg, sessao);
    return;
  }

  // Checklist
  if (estado === 'aguardando_checklist') {
    await processarChecklistFlow(msg, sessao);
    return;
  }

  // Adiantamento
  if (['aguardando_adiantamento_tipo', 'aguardando_adiantamento_valor', 'aguardando_confirmacao_adiantamento'].includes(estado)) {
    await processarAdiantamentoFlow(msg, sessao);
    return;
  }

  // Despesa
  if (['aguardando_despesa_tipo', 'aguardando_despesa_foto', 'aguardando_confirmacao_despesa'].includes(estado)) {
    await processarDespesaFlow(msg, sessao);
    return;
  }

  // Imprevisto
  if (['aguardando_imprevisto_tipo', 'aguardando_imprevisto_tempo', 'aguardando_imprevisto_midia'].includes(estado)) {
    await processarImprevistoFlow(msg, sessao);
    return;
  }

  // ── MENU PRINCIPAL (aguardando_acao) ──

  if (estado === 'aguardando_acao') {
    await processarMenuMotorista(msg, sessao);
    return;
  }

  // Fallback: qualquer estado não mapeado → voltar ao menu
  await enviarMenuMotorista(msg.from, sessao);
}

// ─── ROTEAMENTO GESTOR ────────────────────────────────────────────────

async function rotearGestor(
  msg: ParsedMessage,
  sessao: Sessao,
  identity: Extract<UserIdentity, { tipo: 'gestor' | 'master' }>
): Promise<void> {
  // TODO: Implementar fluxos do gestor (Bloco 5)
  // Por enquanto, resposta simples
  await enviarTexto(
    msg.from,
    `Olá, ${identity.nome}! 👋\n\nO módulo de gestão via WhatsApp está em desenvolvimento.\nUse o Dashboard web para gerenciar a frota.\n\n🌐 Acesse: ${process.env.NEXT_PUBLIC_SUPABASE_URL ? 'o sistema web' : 'o dashboard'}`
  );
}

// ─── SELEÇÃO DE VEÍCULO ──────────────────────────────────────────────

async function enviarSelecaoVeiculo(
  para: string,
  nomeMotorista: string,
  empresaId: string,
  sessionId: string
): Promise<void> {
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Buscar veículos ativos da empresa
  const { data: veiculos } = await supabase
    .from('veiculos')
    .select('id, placa, apelido, marca, modelo')
    .eq('empresa_id', empresaId)
    .eq('ativo', true)
    .order('placa');

  if (!veiculos || veiculos.length === 0) {
    await enviarTexto(para, `Olá, ${nomeMotorista}! 👋\n\nNenhum caminhão cadastrado na empresa. Fale com o gestor.`);
    return;
  }

  // Enviar lista de veículos
  await enviarLista(
    para,
    `Olá, ${nomeMotorista}! 👋\nQual caminhão você vai usar hoje?`,
    '🚛 Selecionar',
    [
      {
        titulo: 'Caminhões disponíveis',
        itens: veiculos.slice(0, 10).map((v) => ({
          id: `veiculo_${v.id}`,
          titulo: v.placa,
          descricao: `${v.apelido || ''} ${v.marca || ''} ${v.modelo || ''}`.trim().slice(0, 72),
        })),
      },
    ]
  );

  await updateSession(sessionId, { estado: 'aguardando_veiculo' });
}

async function processarSelecaoVeiculo(
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

  const { data: veiculo } = await supabase
    .from('veiculos')
    .select('id, placa, km_atual')
    .eq('id', veiculoId)
    .single();

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

// ─── MENU PRINCIPAL DO MOTORISTA ─────────────────────────────────────

async function enviarMenuMotorista(para: string, sessao: Sessao): Promise<void> {
  const placa = sessao.contexto.veiculo_placa ?? '---';

  await enviarLista(
    para,
    `🚛 Caminhão: *${placa}*\n\nO que você precisa fazer?`,
    '📋 Ver opções',
    [
      {
        titulo: 'Ações',
        itens: [
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
        ],
      },
    ],
    undefined,
    'Ou mande uma foto/áudio direto!'
  );
}

async function processarMenuMotorista(msg: ParsedMessage, sessao: Sessao): Promise<void> {
  // Resposta da lista de ações
  if (msg.tipo === 'lista' && msg.listaId?.startsWith('acao_')) {
    const acao = msg.listaId.replace('acao_', '');

    switch (acao) {
      case 'km':
        await enviarTexto(msg.from, 'Ótimo! Tire uma foto clara do painel mostrando o odômetro. 📷');
        await updateSession(sessao.id, { estado: 'aguardando_foto_km' });
        return;

      case 'avaria':
        await enviarTexto(msg.from, 'Me conte o que aconteceu.\nPode mandar *foto*, *áudio* ou *texto*. 🔍');
        await updateSession(sessao.id, { estado: 'aguardando_avaria_midia' });
        return;

      case 'viagem':
        await enviarTexto(msg.from, 'Para onde vai? Digite a *origem* e o *destino*\n(ex: São Paulo → Campinas)');
        await updateSession(sessao.id, { estado: 'aguardando_origem_destino' });
        return;

      case 'abastecimento':
        await enviarTexto(msg.from, '📸 Tire uma foto do comprovante de abastecimento.');
        await updateSession(sessao.id, { estado: 'aguardando_foto_abastecimento' });
        return;

      case 'checklist':
        await processarChecklistFlow(msg, sessao, true);
        return;

      case 'adiantamento':
        await processarAdiantamentoFlow(msg, sessao, true);
        return;

      case 'despesa':
        await processarDespesaFlow(msg, sessao, true);
        return;

      case 'imprevisto':
        await processarImprevistoFlow(msg, sessao, true);
        return;

      case 'status':
        await enviarStatusVeiculo(msg.from, sessao);
        return;

      case 'documentos':
        await enviarTexto(msg.from, '📄 Módulo de documentos em desenvolvimento.\nFale com o gestor para acessar seus documentos.');
        return;

      default:
        await enviarMenuMotorista(msg.from, sessao);
        return;
    }
  }

  // Se não é resposta de lista, pode ser mídia solta → Smart Intent Router (futuro)
  // Por enquanto, mostrar o menu novamente
  if (msg.tipo === 'foto' || msg.tipo === 'audio') {
    // TODO: Smart Intent Router (Bloco 4)
    await enviarTexto(msg.from, 'Recebi sua mídia! 📸\nPor enquanto, use o menu para escolher a ação:');
    await enviarMenuMotorista(msg.from, sessao);
    return;
  }

  // Texto livre → mostrar menu
  await enviarMenuMotorista(msg.from, sessao);
}

// ─── STATUS DO VEÍCULO ──────────────────────────────────────────────

async function enviarStatusVeiculo(para: string, sessao: Sessao): Promise<void> {
  if (!sessao.contexto.veiculo_id) {
    await enviarTexto(para, 'Nenhum caminhão selecionado. Envie "Oi" para começar.');
    return;
  }

  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: veiculo } = await supabase
    .from('veiculos')
    .select('placa, km_atual, marca, modelo')
    .eq('id', sessao.contexto.veiculo_id)
    .single();

  if (!veiculo) {
    await enviarTexto(para, 'Caminhão não encontrado.');
    return;
  }

  // Buscar avarias abertas
  const { data: avarias } = await supabase
    .from('avarias')
    .select('descricao, urgencia')
    .eq('veiculo_id', sessao.contexto.veiculo_id)
    .in('status', ['aberta', 'em_analise']);

  const temProblema = avarias && avarias.length > 0;
  const kmFormatado = veiculo.km_atual ? new Intl.NumberFormat('pt-BR').format(veiculo.km_atual) : '---';

  let mensagem = `🚛 *${veiculo.placa}* — ${temProblema ? 'ATENÇÃO ⚠️' : 'TUDO CERTO ✅'}\n\n`;
  mensagem += `📏 KM atual: ${kmFormatado}\n`;
  mensagem += `🚛 ${veiculo.marca || ''} ${veiculo.modelo || ''}\n`;

  if (temProblema && avarias) {
    mensagem += '\n';
    for (const av of avarias) {
      const emoji = av.urgencia === 'critica' ? '🔴' : av.urgencia === 'alta' ? '🟠' : '🟡';
      mensagem += `${emoji} ${av.descricao}\n`;
    }
    mensagem += '\n⚠️ Fale com o gestor antes de iniciar nova viagem.';
  } else {
    mensagem += '\nNenhuma avaria pendente. Bom trabalho! 💪';
  }

  await enviarTexto(para, mensagem);
}

// ─── HELPERS ─────────────────────────────────────────────────────────

export function isSaudacao(msg: ParsedMessage): boolean {
  if (msg.tipo !== 'texto' || !msg.texto) return false;
  const texto = msg.texto.toLowerCase().trim();
  const saudacoes = ['oi', 'olá', 'ola', 'bom dia', 'boa tarde', 'boa noite', 'hey', 'hi', 'hello', 'e aí', 'eai', 'fala'];
  return saudacoes.some((s) => texto === s || texto.startsWith(s + ' ') || texto.startsWith(s + ',') || texto.startsWith(s + '!'));
}
