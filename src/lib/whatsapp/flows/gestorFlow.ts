/**
 * Gestor Flow — Comandos do gestor via WhatsApp.
 *
 * Usa classificarIntentTexto para identificar a intenção e responde
 * com dados agregados do Supabase. Foco em consultas rápidas para
 * o gestor não precisar abrir o dashboard pra checks rápidos.
 */

import { createClient } from '@supabase/supabase-js';
import type { ParsedMessage } from '@/lib/whatsapp/messageParser';
import type { UserIdentity } from '@/lib/whatsapp/auth';
import { enviarTexto } from '@/lib/whatsapp/messageSender';
import { classificarIntentTexto } from '@/services/aiService';
import { createLogger } from '@/lib/logger';
import { extrairLembrete } from '@/lib/whatsapp/lembreteParser';
import { criarLembrete } from '@/lib/ai/tools/frotaTools';

const log = createLogger('gestorFlow');

const INTENT_CONFIANCA_MINIMA = 55;

// Lembretes têm DOIS caminhos: (1) deterministic via extrairLembrete (gatilho exato:
// "lembrete", "me lembra", "anota") — tratado aqui ANTES do intent classifier, pra
// não cair em "fallback → menu"; (2) frases fora do padrão ficam pra tool do Gemini
// (criar_lembrete em frotaTools.ts). O caminho (1) é defense-in-depth: o router já
// detecta no topo, mas o gestorFlow também garante caso seja chamado por outra via.

type IdentityGestor = Extract<UserIdentity, { tipo: 'gestor' | 'master' }>;

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const fmtBRL = (v: number | null | undefined) =>
  (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const fmtPct = (v: number | null | undefined) =>
  `${(v ?? 0).toFixed(1)}%`;

export async function processarGestorFlow(
  msg: ParsedMessage,
  identity: IdentityGestor
): Promise<void> {
  if (msg.tipo === 'foto' || msg.tipo === 'documento') {
    await enviarTexto(
      msg.from,
      '📄 Recebi seu arquivo. A extração automática de pedidos via foto/PDF está em desenvolvimento. Por enquanto, cadastre o pedido pelo dashboard.'
    );
    return;
  }

  if (msg.tipo !== 'texto' || !msg.texto) {
    await enviarMenuGestor(msg.from, identity);
    return;
  }

  // Lembrete DETERMINÍSTICO (gatilho exato) ANTES do intent classifier — senão
  // "anota que fechei contrato" vira 'fallback' e cai no menu sem nunca salvar.
  const conteudoLembrete = extrairLembrete(msg.texto);
  if (conteudoLembrete !== null) {
    const usuarioId = 'usuario_id' in identity ? identity.usuario_id : undefined;
    if (!conteudoLembrete) {
      await enviarTexto(msg.from, '📝 O que você quer anotar? Ex: "lembrete: comprar pneu"');
      return;
    }
    log.info('lembrete_gestor_detectado', { from: msg.from, chars: conteudoLembrete.length });
    const r = await criarLembrete(identity.empresa_id, usuarioId, conteudoLembrete, identity.nome, msg.from);
    if (r.ok) log.info('lembrete_gestor_salvo', { from: msg.from });
    else log.warn('lembrete_gestor_falhou', { from: msg.from, erro: r.erro });
    await enviarTexto(
      msg.from,
      r.ok
        ? `✅ Anotado: ${conteudoLembrete}\n\nVai aparecer no painel até alguém dar ciência.`
        : '❌ Não consegui salvar o lembrete agora. Tenta de novo em instantes.'
    );
    return;
  }

  const resultado = await classificarIntentTexto(msg.texto, 'gestor');
  if (!resultado.ok) {
    log.warn('intent_classificacao_falhou', { motivo: resultado.motivo });
    await enviarMenuGestor(msg.from, identity);
    return;
  }

  const { intent, confianca, parametros } = resultado.data;
  log.info('intent_classificado', { intent, confianca });

  if (confianca < INTENT_CONFIANCA_MINIMA || intent === 'fallback') {
    await enviarMenuGestor(msg.from, identity);
    return;
  }

  switch (intent) {
    case 'consulta_lucro_mensal':
      await responderLucroMensal(msg.from, identity);
      return;
    case 'consulta_fretes_ativos':
    case 'consulta_pedidos_ativos':
      await responderPedidosAtivos(msg.from, identity);
      return;
    case 'consulta_motorista':
      await responderMotorista(msg.from, identity, parametros?.motorista_nome ?? null);
      return;
    case 'consulta_fretes_mes':
    case 'consulta_pedidos_mes':
      await responderPedidosMes(msg.from, identity);
      return;
    case 'consulta_pendencias':
      await responderPendencias(msg.from, identity);
      return;
    case 'consulta_frota_saude':
      await responderFrotaSaude(msg.from, identity);
      return;
    case 'consulta_lucro_veiculo':
      await responderLucroVeiculo(msg.from, identity, parametros?.veiculo_placa ?? null);
      return;
    case 'cadastrar_pedido':
      await enviarTexto(
        msg.from,
        '📦 Pra cadastrar um novo pedido, mande uma foto ou PDF — vou extrair automaticamente (em breve). Ou cadastre direto em /pedidos/novo no dashboard.'
      );
      return;
    default:
      await enviarMenuGestor(msg.from, identity);
      return;
  }
}

// ─── HANDLERS ────────────────────────────────────────────────────────

async function enviarMenuGestor(para: string, identity: IdentityGestor): Promise<void> {
  await enviarTexto(
    para,
    `Olá, ${identity.nome}! 👋 Eu entendo perguntas como:\n\n` +
      `• "qual o lucro do mês?"\n` +
      `• "quem está em rota?"\n` +
      `• "status do João"\n` +
      `• "quantos pedidos esse mês?"\n` +
      `• "tem pendência pra aprovar?"\n` +
      `• "como está a frota?"\n` +
      `• "lucro do caminhão ABC1D23"\n\n` +
      `📌 *Para anotar um lembrete:*\n` +
      `• "lembrete: fechei contrato com fulano"\n` +
      `• "anote que recebi pagamento de 5 mil"\n` +
      `• "registro: viagem cancelada"\n` +
      `• "guarda esse dado: ..."\n\n` +
      `É só perguntar 🤖`
  );
}

async function responderLucroMensal(para: string, identity: IdentityGestor): Promise<void> {
  const supabase = getSupabase();
  const now = new Date();
  const inicioMes = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const fimMes = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);

  // Receita: pedidos concluídos no mês
  const { data: pedidos, error: errPed } = await supabase
    .from('pedidos_com_resultado')
    .select('receita, status')
    .eq('empresa_id', identity.empresa_id)
    .gte('data_inicio_real', inicioMes)
    .lte('data_inicio_real', fimMes);

  if (errPed) {
    log.error('lucro_mensal_query_failed', { code: errPed.code, message: errPed.message });
    await enviarTexto(para, '❌ Não consegui consultar agora. Tenta de novo daqui a pouco.');
    return;
  }

  // Custo: agregado por veículo (despesas + combustível) no mês
  const { data: custosVeiculo } = await supabase
    .from('veiculos_resultado_periodo')
    .select('custo_combustivel, custo_despesas, mes_referencia')
    .eq('empresa_id', identity.empresa_id)
    .gte('mes_referencia', inicioMes)
    .lte('mes_referencia', fimMes);

  const concluidos = (pedidos ?? []).filter((p) => p.status === 'concluido');
  const receita = concluidos.reduce((s, p) => s + (p.receita ?? 0), 0);
  const custo = (custosVeiculo ?? []).reduce(
    (s, v) => s + (v.custo_combustivel ?? 0) + (v.custo_despesas ?? 0),
    0
  );
  const lucro = receita - custo;
  const margem = receita > 0 ? (lucro / receita) * 100 : 0;
  const mesNome = now.toLocaleDateString('pt-BR', { month: 'long' });

  await enviarTexto(
    para,
    `📊 *Resultado de ${mesNome}*\n\n` +
      `💰 Receita: ${fmtBRL(receita)}\n` +
      `📤 Custo: ${fmtBRL(custo)}\n` +
      `${lucro >= 0 ? '✅' : '🚨'} Lucro: *${fmtBRL(lucro)}*\n` +
      `📈 Margem: *${fmtPct(margem)}*\n` +
      `📦 Pedidos concluídos: ${concluidos.length}`
  );
}

async function responderPedidosAtivos(para: string, identity: IdentityGestor): Promise<void> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('pedidos')
    .select('id, valor_pedido, motoristas(nome), veiculos(placa), entregas(origem, destino)')
    .eq('empresa_id', identity.empresa_id)
    .eq('status', 'em_andamento')
    .order('updated_at', { ascending: false });

  if (error) {
    log.error('pedidos_ativos_query_failed', { code: error.code, message: error.message });
    await enviarTexto(para, '❌ Não consegui consultar agora.');
    return;
  }

  if (!data || data.length === 0) {
    await enviarTexto(para, '🚛 Nenhum pedido em andamento agora.');
    return;
  }

  let msg = `🛣️ *${data.length} pedido${data.length > 1 ? 's' : ''} em rota:*\n`;
  for (const p of data.slice(0, 10)) {
    const mot = Array.isArray(p.motoristas) ? p.motoristas[0] : p.motoristas;
    const v = Array.isArray(p.veiculos) ? p.veiculos[0] : p.veiculos;
    const entregas = Array.isArray(p.entregas) ? p.entregas : p.entregas ? [p.entregas] : [];
    const primeira = entregas[0];
    const ultima = entregas[entregas.length - 1];
    const origem = primeira?.origem ?? '?';
    const destino = ultima?.destino ?? primeira?.destino ?? '?';
    msg += `\n• ${origem} → ${destino}`;
    if (entregas.length > 1) msg += ` (${entregas.length} entregas)`;
    msg += '\n';
    if (mot) msg += `  👤 ${mot.nome}`;
    if (v) msg += ` · 🚚 ${v.placa}`;
    if (p.valor_pedido) msg += ` · ${fmtBRL(p.valor_pedido)}`;
    msg += '\n';
  }
  if (data.length > 10) msg += `\n_... e mais ${data.length - 10}_`;

  await enviarTexto(para, msg);
}

async function responderMotorista(
  para: string,
  identity: IdentityGestor,
  nomeFiltro: string | null
): Promise<void> {
  if (!nomeFiltro) {
    await enviarTexto(para, 'Qual motorista? Diz o nome (ex: "como está o João?")');
    return;
  }

  const supabase = getSupabase();
  const { data: motoristas, error } = await supabase
    .from('motoristas')
    .select('id, nome, cnh_validade, ativo')
    .eq('empresa_id', identity.empresa_id)
    .ilike('nome', `%${nomeFiltro}%`)
    .limit(3);

  if (error || !motoristas || motoristas.length === 0) {
    await enviarTexto(para, `Não achei motorista com o nome "${nomeFiltro}".`);
    return;
  }

  if (motoristas.length > 1) {
    const nomes = motoristas.map((m) => `• ${m.nome}`).join('\n');
    await enviarTexto(para, `Achei mais de um motorista:\n${nomes}\n\nSeja mais específico.`);
    return;
  }

  const m = motoristas[0];
  const { data: pedidoAtivo } = await supabase
    .from('pedidos')
    .select('id, entregas(origem, destino)')
    .eq('motorista_id', m.id)
    .eq('status', 'em_andamento')
    .maybeSingle();

  const hoje = new Date().toISOString().slice(0, 10);
  const cnhVencida = m.cnh_validade && m.cnh_validade < hoje;
  const cnhValidade = m.cnh_validade
    ? new Date(m.cnh_validade + 'T00:00:00').toLocaleDateString('pt-BR')
    : '—';

  let resp = `👤 *${m.nome}*\n\n`;
  resp += `${m.ativo ? '✅ Ativo' : '⏸️ Inativo'}\n`;
  resp += `${cnhVencida ? '🚨' : '📄'} CNH: ${cnhValidade}${cnhVencida ? ' (VENCIDA)' : ''}\n`;
  if (pedidoAtivo) {
    const entregas = Array.isArray(pedidoAtivo.entregas)
      ? pedidoAtivo.entregas
      : pedidoAtivo.entregas
      ? [pedidoAtivo.entregas]
      : [];
    const primeira = entregas[0];
    const ultima = entregas[entregas.length - 1];
    resp += `\n🛣️ Em rota: ${primeira?.origem ?? '?'} → ${ultima?.destino ?? primeira?.destino ?? '?'}`;
  } else {
    resp += '\n🅿️ Sem pedido em andamento';
  }

  await enviarTexto(para, resp);
}

async function responderPedidosMes(para: string, identity: IdentityGestor): Promise<void> {
  const supabase = getSupabase();
  const now = new Date();
  const inicioMes = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const fimMes = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('pedidos')
    .select('status')
    .eq('empresa_id', identity.empresa_id)
    .gte('data_inicio_prevista', inicioMes)
    .lte('data_inicio_prevista', fimMes);

  if (error) {
    log.error('pedidos_mes_query_failed', { code: error.code, message: error.message });
    await enviarTexto(para, '❌ Não consegui consultar agora.');
    return;
  }

  const total = data?.length ?? 0;
  const porStatus = (data ?? []).reduce<Record<string, number>>((acc, p) => {
    const k = p.status ?? 'sem_status';
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});

  const mesNome = now.toLocaleDateString('pt-BR', { month: 'long' });
  let resp = `📅 *Pedidos de ${mesNome}* — total ${total}\n`;
  if (porStatus.concluido) resp += `\n✅ Concluídos: ${porStatus.concluido}`;
  if (porStatus.em_andamento) resp += `\n🛣️ Em andamento: ${porStatus.em_andamento}`;
  if (porStatus.agendado) resp += `\n📌 Agendados: ${porStatus.agendado}`;
  if (porStatus.cancelado) resp += `\n❌ Cancelados: ${porStatus.cancelado}`;

  await enviarTexto(para, resp);
}

async function responderPendencias(para: string, identity: IdentityGestor): Promise<void> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('adiantamentos')
    .select('valor, motoristas(nome)')
    .eq('empresa_id', identity.empresa_id)
    .eq('status', 'solicitado')
    .order('created_at', { ascending: true });

  if (error) {
    log.error('pendencias_query_failed', { code: error.code, message: error.message });
    await enviarTexto(para, '❌ Não consegui consultar agora.');
    return;
  }

  if (!data || data.length === 0) {
    await enviarTexto(para, '✅ Nenhum adiantamento pendente.');
    return;
  }

  const total = data.reduce((s, a) => s + (a.valor ?? 0), 0);
  let resp = `💰 *${data.length} adiantamento${data.length > 1 ? 's' : ''} pendente${data.length > 1 ? 's' : ''}* (${fmtBRL(total)})\n`;
  for (const a of data.slice(0, 10)) {
    const m = Array.isArray(a.motoristas) ? a.motoristas[0] : a.motoristas;
    resp += `\n• ${m?.nome ?? '?'} — ${fmtBRL(a.valor)}`;
  }
  if (data.length > 10) resp += `\n_... e mais ${data.length - 10}_`;
  resp += '\n\nAprove pelo dashboard em /adiantamentos.';

  await enviarTexto(para, resp);
}

async function responderFrotaSaude(para: string, identity: IdentityGestor): Promise<void> {
  const supabase = getSupabase();
  const hoje = new Date().toISOString().slice(0, 10);
  const em30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

  const [{ count: ativos }, { data: avarias }, { data: docsVencidos }, { data: docsVencendo }] =
    await Promise.all([
      supabase
        .from('veiculos')
        .select('*', { count: 'exact', head: true })
        .eq('empresa_id', identity.empresa_id)
        .eq('ativo', true),
      supabase
        .from('avarias')
        .select('veiculo_id, urgencia, veiculos(placa)')
        .eq('empresa_id', identity.empresa_id)
        .in('status', ['aberta', 'em_analise']),
      supabase
        .from('veiculos')
        .select('placa, ipva_vencimento, licenciamento_vencimento, seguro_vencimento')
        .eq('empresa_id', identity.empresa_id)
        .eq('ativo', true)
        .or(`ipva_vencimento.lt.${hoje},licenciamento_vencimento.lt.${hoje},seguro_vencimento.lt.${hoje}`),
      supabase
        .from('veiculos')
        .select('placa, ipva_vencimento, licenciamento_vencimento, seguro_vencimento')
        .eq('empresa_id', identity.empresa_id)
        .eq('ativo', true)
        .gte('ipva_vencimento', hoje)
        .lte('ipva_vencimento', em30),
    ]);

  let resp = `🚛 *Frota — visão geral*\n\n`;
  resp += `Veículos ativos: ${ativos ?? 0}\n`;
  resp += `Avarias abertas: ${avarias?.length ?? 0}`;

  if (avarias && avarias.length > 0) {
    const criticas = avarias.filter((a) => a.urgencia === 'critica').length;
    if (criticas > 0) resp += ` (🔴 ${criticas} crítica${criticas > 1 ? 's' : ''})`;
  }

  if (docsVencidos && docsVencidos.length > 0) {
    resp += `\n\n🚨 *Documentos vencidos:* ${docsVencidos.length} veículo${docsVencidos.length > 1 ? 's' : ''}`;
  }
  if (docsVencendo && docsVencendo.length > 0) {
    resp += `\n⚠️ *Documentos vencendo em 30 dias:* ${docsVencendo.length} veículo${docsVencendo.length > 1 ? 's' : ''}`;
  }
  if ((!docsVencidos || docsVencidos.length === 0) && (!docsVencendo || docsVencendo.length === 0) && (!avarias || avarias.length === 0)) {
    resp += '\n\n✅ Tudo certo, sem alertas.';
  }

  await enviarTexto(para, resp);
}

async function responderLucroVeiculo(
  para: string,
  identity: IdentityGestor,
  placaFiltro: string | null
): Promise<void> {
  if (!placaFiltro) {
    await enviarTexto(para, 'Qual veículo? Diz a placa (ex: "lucro do ABC1D23")');
    return;
  }

  const supabase = getSupabase();
  const { data: veiculo } = await supabase
    .from('veiculos')
    .select('id, placa')
    .eq('empresa_id', identity.empresa_id)
    .ilike('placa', `%${placaFiltro.replace(/[^A-Z0-9]/gi, '')}%`)
    .maybeSingle();

  if (!veiculo) {
    await enviarTexto(para, `Não achei veículo com placa "${placaFiltro}".`);
    return;
  }

  const now = new Date();
  const inicioMes = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const fimMes = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);

  // Pedidos do veículo no mês (receita + km)
  const { data: pedidos, error } = await supabase
    .from('pedidos_com_resultado')
    .select('receita, km_total')
    .eq('empresa_id', identity.empresa_id)
    .eq('veiculo_id', veiculo.id)
    .eq('status', 'concluido')
    .gte('data_inicio_real', inicioMes)
    .lte('data_inicio_real', fimMes);

  if (error) {
    log.error('lucro_veiculo_query_failed', { code: error.code, message: error.message });
    await enviarTexto(para, '❌ Não consegui consultar agora.');
    return;
  }

  // Custos do veículo no mês (despesas + combustível)
  const { data: custos } = await supabase
    .from('veiculos_resultado_periodo')
    .select('custo_combustivel, custo_despesas')
    .eq('empresa_id', identity.empresa_id)
    .eq('veiculo_id', veiculo.id)
    .gte('mes_referencia', inicioMes)
    .lte('mes_referencia', fimMes);

  const receita = (pedidos ?? []).reduce((s, p) => s + (p.receita ?? 0), 0);
  const km = (pedidos ?? []).reduce((s, p) => s + (p.km_total ?? 0), 0);
  const custo = (custos ?? []).reduce(
    (s, c) => s + (c.custo_combustivel ?? 0) + (c.custo_despesas ?? 0),
    0
  );
  const lucro = receita - custo;
  const margem = receita > 0 ? (lucro / receita) * 100 : 0;
  const mesNome = now.toLocaleDateString('pt-BR', { month: 'long' });

  await enviarTexto(
    para,
    `🚚 *${veiculo.placa}* — ${mesNome}\n\n` +
      `📦 Pedidos: ${pedidos?.length ?? 0}\n` +
      `📏 KM rodados: ${km.toLocaleString('pt-BR')}\n` +
      `💰 Receita: ${fmtBRL(receita)}\n` +
      `📤 Custo: ${fmtBRL(custo)}\n` +
      `${lucro >= 0 ? '✅' : '🚨'} Lucro: *${fmtBRL(lucro)}*\n` +
      `📈 Margem: *${fmtPct(margem)}*`
  );
}
