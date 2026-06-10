/**
 * Apagar Último Flow — "apaga o último" (aprovado pelo dono em 09/06/2026).
 *
 * O motorista manda "apaga o último" e o bot desfaz o registro mais recente
 * DELE (abastecimento, despesa ou KM), com confirmação antes (propose→confirm,
 * como o resto do bot).
 *
 * Salvaguardas:
 * - Só registros do PRÓPRIO motorista (motorista_id da sessão) e da empresa.
 * - Janela curta: só registros das últimas 2 horas.
 * - Preview + botões ✅/❌ antes de apagar; revalidação no confirm (o registro
 *   ainda é dele e ainda está na janela — protege contra confirmação tardia).
 * - KM: km_logs tem trigger que propaga pro veiculos.km_atual; ao apagar um
 *   km_log, o km_atual do caminhão é recomposto pelo maior km_lido restante.
 */

import type { ParsedMessage } from '@/lib/whatsapp/messageParser';
import { enviarTexto } from '@/lib/whatsapp/messageSender';
import { enviarMenuBotoes } from '@/lib/whatsapp/menuHelper';
import { updateSession, resetToMenu, type Sessao } from '@/lib/whatsapp/sessionManager';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/** Janela em que um registro ainda pode ser desfeito pelo motorista */
const JANELA_MS = 2 * 60 * 60 * 1000; // 2h

// Tabelas que o comando alcança — NUNCA aceitar tabela vinda de fora desta lista
const TABELAS = ['abastecimentos', 'despesas_veiculo', 'km_logs'] as const;
type TabelaApagavel = (typeof TABELAS)[number];

type Candidato = {
  tabela: TabelaApagavel;
  id: string;
  created_at: string;
  descricao: string;
  veiculo_id?: string;
};

/** Detecta o comando em texto livre: "apaga o último", "desfaz o ultimo registro", etc. */
export function ehComandoApagarUltimo(texto: string): boolean {
  const t = texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
  return /\b(apaga(r)?|desfaz(er)?|exclui(r)?|cancela(r)?)\b.{0,20}\bultimo\b/.test(t);
}

const fmtBRL = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`;
const haQuanto = (iso: string) => {
  const min = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  return min < 60 ? `há ${min} min` : `há ${Math.floor(min / 60)}h${min % 60 ? ` ${min % 60}min` : ''}`;
};

/** Busca o registro mais recente do motorista (últimas 2h) nas 3 tabelas. */
async function acharUltimoRegistro(
  empresaId: string,
  motoristaId: string
): Promise<Candidato | null> {
  const supabase = getSupabase();
  const corte = new Date(Date.now() - JANELA_MS).toISOString();
  const base = (tabela: string, campos: string) =>
    supabase.from(tabela).select(campos)
      .eq('empresa_id', empresaId)
      .eq('motorista_id', motoristaId)
      .gte('created_at', corte)
      .order('created_at', { ascending: false })
      .limit(1).maybeSingle();

  const [abast, desp, km] = await Promise.all([
    base('abastecimentos', 'id,created_at,litros,valor_total,posto'),
    base('despesas_veiculo', 'id,created_at,tipo,valor,local'),
    base('km_logs', 'id,created_at,km_lido,veiculo_id,veiculos(apelido,placa)'),
  ]);

  const candidatos: Candidato[] = [];

  if (abast.data) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const a = abast.data as any;
    candidatos.push({
      tabela: 'abastecimentos', id: a.id, created_at: a.created_at,
      descricao: `⛽ Abastecimento: ${a.litros ?? '?'} L — ${fmtBRL(a.valor_total ?? 0)}${a.posto ? ` (${a.posto})` : ''}, ${haQuanto(a.created_at)}`,
    });
  }
  if (desp.data) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = desp.data as any;
    candidatos.push({
      tabela: 'despesas_veiculo', id: d.id, created_at: d.created_at,
      descricao: `🧾 Despesa: ${d.tipo ?? '?'} — ${fmtBRL(d.valor ?? 0)}${d.local ? ` (${d.local})` : ''}, ${haQuanto(d.created_at)}`,
    });
  }
  if (km.data) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const k = km.data as any;
    const veic = Array.isArray(k.veiculos) ? k.veiculos[0] : k.veiculos;
    const rotulo = veic ? ` do ${veic.apelido ?? veic.placa ?? 'caminhão'}` : '';
    candidatos.push({
      tabela: 'km_logs', id: k.id, created_at: k.created_at, veiculo_id: k.veiculo_id,
      descricao: `📍 KM ${Number(k.km_lido ?? 0).toLocaleString('pt-BR')}${rotulo}, ${haQuanto(k.created_at)}`,
    });
  }

  if (candidatos.length === 0) return null;
  candidatos.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return candidatos[0];
}

/** Passo 1 (propose): acha o último registro e pede confirmação. */
export async function iniciarApagarUltimo(msg: ParsedMessage, sessao: Sessao): Promise<void> {
  if (!sessao.motorista_id) {
    await enviarTexto(msg.from, 'Esse comando é só pra motoristas cadastrados.');
    return;
  }

  const alvo = await acharUltimoRegistro(sessao.empresa_id, sessao.motorista_id);
  if (!alvo) {
    await enviarTexto(msg.from, '🔍 Não achei nenhum registro seu nas últimas 2 horas (abastecimento, despesa ou KM). Registros mais antigos só com o gestor.');
    return;
  }

  await updateSession(sessao.id, {
    estado: 'aguardando_confirmacao_apagar',
    contexto: {
      apagar_alvo: { tabela: alvo.tabela, id: alvo.id, descricao: alvo.descricao, veiculo_id: alvo.veiculo_id },
    },
  });

  await enviarMenuBotoes(
    sessao.id,
    msg.from,
    `Encontrei seu último registro:\n\n${alvo.descricao}\n\n⚠️ Apagar não tem volta. Confirma?`,
    [
      { id: 'apagar_confirma', titulo: '✅ Apagar' },
      { id: 'apagar_cancela', titulo: '❌ Manter' },
    ]
  );
}

/** Passo 2 (confirm): revalida e apaga. Estado: aguardando_confirmacao_apagar */
export async function processarApagarUltimoFlow(msg: ParsedMessage, sessao: Sessao): Promise<void> {
  const alvo = sessao.contexto.apagar_alvo;

  const textoNorm = (msg.texto ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
  const confirmou = (msg.tipo === 'botao' && msg.botaoId === 'apagar_confirma') ||
    (msg.tipo === 'texto' && /^(sim|s|pode|confirmo|apaga)$/.test(textoNorm));
  const cancelou = (msg.tipo === 'botao' && msg.botaoId === 'apagar_cancela') ||
    (msg.tipo === 'texto' && /^(nao|n|cancela|deixa|manter|mantem)$/.test(textoNorm));

  if (cancelou || !alvo) {
    await enviarTexto(msg.from, alvo ? '👍 Beleza, mantive o registro.' : '❌ Esse pedido expirou. Manda "apaga o último" de novo se precisar.');
    await resetToMenu(sessao.id);
    return;
  }

  if (!confirmou) {
    await enviarMenuBotoes(sessao.id, msg.from, 'Use os botões: apagar ou manter o registro?', [
      { id: 'apagar_confirma', titulo: '✅ Apagar' },
      { id: 'apagar_cancela', titulo: '❌ Manter' },
    ]);
    return;
  }

  // ── CONFIRMOU: revalidar tudo antes de apagar ─────────────────────────
  if (!TABELAS.includes(alvo.tabela as TabelaApagavel) || !sessao.motorista_id) {
    await enviarTexto(msg.from, '❌ Não consegui apagar (registro inválido).');
    await resetToMenu(sessao.id);
    return;
  }

  const supabase = getSupabase();
  const corte = new Date(Date.now() - JANELA_MS).toISOString();

  // Revalida: ainda existe, ainda é DELE, ainda está na janela
  const { data: registro } = await supabase.from(alvo.tabela)
    .select('id,created_at,motorista_id')
    .eq('id', alvo.id)
    .eq('empresa_id', sessao.empresa_id)
    .eq('motorista_id', sessao.motorista_id)
    .gte('created_at', corte)
    .maybeSingle();

  if (!registro) {
    await enviarTexto(msg.from, '⚠️ Esse registro não está mais disponível pra apagar (passou da janela de 2h ou já foi removido). Fala com o gestor se precisar.');
    await resetToMenu(sessao.id);
    return;
  }

  const { error } = await supabase.from(alvo.tabela).delete()
    .eq('id', alvo.id)
    .eq('empresa_id', sessao.empresa_id)
    .eq('motorista_id', sessao.motorista_id);

  if (error) {
    console.error('[apagarUltimoFlow] Erro ao apagar:', error);
    await enviarTexto(msg.from, '❌ Erro ao apagar o registro. Tenta de novo.');
    await resetToMenu(sessao.id);
    return;
  }

  // KM: recompor veiculos.km_atual (o insert propagou via trigger; o delete não desfaz)
  let avisoKm = '';
  if (alvo.tabela === 'km_logs' && alvo.veiculo_id) {
    const { data: restante } = await supabase.from('km_logs')
      .select('km_lido')
      .eq('veiculo_id', alvo.veiculo_id)
      .eq('confirmado', true)
      .order('km_lido', { ascending: false })
      .limit(1).maybeSingle();
    if (restante?.km_lido != null) {
      const { error: errKm } = await supabase.from('veiculos')
        .update({ km_atual: restante.km_lido })
        .eq('id', alvo.veiculo_id)
        .eq('empresa_id', sessao.empresa_id);
      avisoKm = errKm
        ? '\n⚠️ Não consegui recompor o KM do caminhão — avisa o gestor.'
        : `\n🚛 KM do caminhão voltou para ${Number(restante.km_lido).toLocaleString('pt-BR')}.`;
    } else {
      avisoKm = '\nℹ️ Era o único registro de KM — o KM do caminhão não foi alterado; confere com o gestor se precisar.';
    }
  }

  await enviarTexto(msg.from, `🗑️ Apagado!\n\n${alvo.descricao}${avisoKm}`);
  await resetToMenu(sessao.id);
}
