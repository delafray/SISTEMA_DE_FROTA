/**
 * MOTOR DO BOT (modo classificador) — liga o classificador Gemini ao WhatsApp real.
 * Atrás do flag MODO_CLASSIFICADOR. Reversível. Fail-safe: qualquer erro → devolve
 * { disparou: false } e o caller cai no fluxo de lembrete (anota). Nunca lança.
 *
 * Fluxo (texto):
 *   idempotência (wamid) → estado pendente? (desambiguação/confirmação) → classificar
 *   → 0 regras: cai no lembrete · 1 regra: executa · 2+: pergunta 1/2/3 (desambigua).
 *
 * Segurança de escrita: KM passa por propose→confirm (preview + "sim" + revalidação +
 * optimistic lock). Outras escritas ficam "em construção" (não gravam). Leituras são
 * filtradas por empresa_id. Baseado nos 10 agentes de pesquisa (ver docs).
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ParsedMessage } from "@/lib/whatsapp/messageParser";
import { getMediaAsBase64DataUrl } from "@/lib/whatsapp/messageParser";
import type { UserIdentity } from "@/lib/whatsapp/auth";
import { transcreverAudio } from "@/services/aiService";
import { variacoesTelefone, telefoneCanonico } from "@/lib/utils/telefone";
import { montarContextoIA, type RegraCtx, type TelCtx } from "@/lib/whatsapp/montarContexto";
import { classificar, type RegraClassif } from "@/lib/whatsapp/classificador";
import { enviarTexto } from "@/lib/whatsapp/messageSender";
import { criarLembrete } from "@/lib/ai/tools/frotaTools";
import { createLogger } from "@/lib/logger";
import {
  executarConsulta, acharVeiculo, commitAtualizarKm, colunasPermitidas,
  type EscopoColunas,
} from "@/lib/whatsapp/botExecutor";
import { parseSimNao, parseSelecao, ehReset, comecaComGatilho } from "@/lib/whatsapp/botParse";

const log = createLogger("classificadorBot");
const TTL_MIN = 5;
const CLASSIFY_TIMEOUT_MS = 9000;

function sb(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

// ─── estado pendente (tabela bot_estado_pendente) ──────────────────────
type Pendente =
  | { tipo: "desambiguacao"; opcoes: string[]; alvo: string | null; valor: number | null; tentativas?: number }
  | { tipo: "confirmacao"; acao: "km"; veiculo_id: string; km_novo: number; km_atual: number; updated_at: string | null; rotulo: string }
  | { tipo: "confirmacao"; acao: "anotar"; texto: string };

// R4: reserva idempotente com status. 'duplicada' = já processada (ok) ou em curso recente.
async function reservarWamid(supa: SupabaseClient, wamid: string): Promise<"reservado" | "duplicada"> {
  const { error } = await supa.from("bot_msgs_processadas").insert({ wamid, status: "processando" });
  if (!error) return "reservado";
  if (error.code !== "23505") return "reservado"; // erro de infra → fail-open (processa)
  const { data } = await supa.from("bot_msgs_processadas").select("status,processado_em").eq("wamid", wamid).maybeSingle();
  if (!data) return "reservado";
  const recente = Date.now() - new Date(data.processado_em).getTime() < 120_000;
  if (data.status === "ok" || recente) return "duplicada";
  // 'processando' antigo → tentativa anterior morreu (timeout) → reprocessa
  await supa.from("bot_msgs_processadas").update({ processado_em: new Date().toISOString() }).eq("wamid", wamid);
  return "reservado";
}
async function marcarWamidOk(supa: SupabaseClient, wamid: string) {
  await supa.from("bot_msgs_processadas").update({ status: "ok", processado_em: new Date().toISOString() }).eq("wamid", wamid);
}

// R3: chave SEMPRE canônica (mesmo formato em salvar/ler/limpar). Evita o estado
// pendente "sumir" por variação de telefone e o "1" executar a ação errada.
async function lerPendente(supa: SupabaseClient, telefone: string): Promise<Pendente | null> {
  const { data } = await supa.from("bot_estado_pendente")
    .select("dados,expira_em").eq("telefone", telefoneCanonico(telefone)).maybeSingle();
  if (!data) return null;
  if (new Date(data.expira_em).getTime() < Date.now()) return null; // expirado → ignora
  const d = data.dados as Pendente;
  if (d?.tipo !== "desambiguacao" && d?.tipo !== "confirmacao") return null; // R15: guard de formato
  return d;
}
async function salvarPendente(supa: SupabaseClient, telefone: string, dados: Pendente) {
  const expira = new Date(Date.now() + TTL_MIN * 60_000).toISOString();
  await supa.from("bot_estado_pendente").upsert(
    { telefone: telefoneCanonico(telefone), tipo: dados.tipo, dados, expira_em: expira },
    { onConflict: "telefone" }
  );
}
async function limparPendente(supa: SupabaseClient, telefone: string) {
  await supa.from("bot_estado_pendente").delete().eq("telefone", telefoneCanonico(telefone));
}

// ─── regra carregada com escopo de colunas ─────────────────────────────
type RegraFull = RegraCtx & { acoes: string[]; escopo: EscopoColunas; gatilho_inicio: boolean };

/** Executa UMA regra já resolvida. Retorna o texto a responder. */
async function executarRegra(
  supa: SupabaseClient, telefone: string, regra: RegraFull,
  alvo: string | null, valor: number | null,
  identity: UserIdentity
): Promise<string> {
  const empresaId = "empresa_id" in identity ? identity.empresa_id : null;
  const usuarioId = ("usuario_id" in identity ? identity.usuario_id : undefined) ?? undefined;
  const nome = "nome" in identity ? identity.nome : undefined;

  // ANOTAR → lembrete (não precisa de empresa; criarLembrete tem default)
  if (regra.tipo === "anotar") {
    const r = await criarLembrete(empresaId ?? "", usuarioId, alvo ? `${regra.nome}: ${alvo}` : `(${regra.nome})`, nome, telefone);
    return r.ok ? "✅ Anotado! Já está no painel." : "❌ Não consegui anotar agora.";
  }

  if (!empresaId) return "Pra consultar/alterar dados eu preciso te identificar. Seu número precisa estar vinculado a um usuário ou motorista.";
  const ctx = { empresa_id: empresaId };

  const podeAlterarKm = colunasPermitidas(regra.escopo, "veiculos", "alterar").includes("km_atual");

  // ALTERAR KM (valor presente + permissão) → propose→confirm
  if (valor != null && podeAlterarKm) {
    if (!alvo) return "Qual caminhão? Me diz o apelido ou a placa.";
    const v = await acharVeiculo(supa, empresaId, alvo);
    if (v.tipo === "nenhum") return `Não achei o caminhão "${alvo}".`;
    if (v.tipo === "varios") return `Tem mais de um parecido com "${alvo}": ${v.veiculos.map((x) => x.apelido ?? x.placa).join(", ")}. Qual?`;
    const kmAtual = Number(v.veiculo.km_atual ?? 0);
    if (valor < kmAtual) return `⚠️ O KM informado (${valor}) é menor que o atual (${kmAtual}). KM não pode diminuir. Confere?`;
    const rotulo = `${v.veiculo.apelido ?? "?"}${v.veiculo.placa ? ` (${v.veiculo.placa})` : ""}`;
    await salvarPendente(supa, telefone, {
      tipo: "confirmacao", acao: "km", veiculo_id: v.veiculo.id,
      km_novo: valor, km_atual: kmAtual, updated_at: v.veiculo.updated_at, rotulo,
    });
    return `✏️ Alterar KM do ${rotulo}\nDe:   ${kmAtual.toLocaleString("pt-BR")} km\nPara: ${valor.toLocaleString("pt-BR")} km  (+${(valor - kmAtual).toLocaleString("pt-BR")})\n\nResponda *sim* pra confirmar ou *não* pra cancelar.`;
  }

  // CONSULTAR
  if (colunasPermitidas(regra.escopo, Object.keys(regra.escopo)[0] ?? "", "consultar").length > 0 || regra.acoes.includes("consultar")) {
    try {
      return await executarConsulta(supa, regra.escopo, ctx, alvo);
    } catch (e) {
      log.error("consulta_erro", { regra: regra.nome, message: e instanceof Error ? e.message : String(e) });
      return "❌ Tive um problema ao consultar agora. Tenta de novo.";
    }
  }

  // ALTERAR/REGISTRAR não-KM → ainda não executa (segurança)
  return `Entendi: *${regra.nome}*. Essa ação (gravar) ainda está sendo liberada com confirmação — em breve. Por ora não alterei nada.`;
}

/** Resolve um estado pendente. Retorna texto a responder, ou null se a msg não resolve. */
async function resolverPendente(
  supa: SupabaseClient, telefone: string, pend: Pendente, texto: string,
  regrasFull: RegraFull[], identity: UserIdentity
): Promise<string | null> {
  if (pend.tipo === "confirmacao") {
    const sn = parseSimNao(texto);
    if (sn === null) return null; // não é sim/não → abandona a pergunta e processa a msg nova
    await limparPendente(supa, telefone);
    if (sn === false) return "Ok, cancelado. 👍";
    // SIM:
    if (pend.acao === "anotar") {
      const empresaId = "empresa_id" in identity ? identity.empresa_id : null;
      const usuarioId = ("usuario_id" in identity ? identity.usuario_id : undefined) ?? undefined;
      const nome = "nome" in identity ? identity.nome : undefined;
      const r = await criarLembrete(empresaId ?? "", usuarioId, pend.texto, nome, telefone);
      return r.ok ? `✅ Anotado!\n\n"${pend.texto}"` : "❌ Não consegui anotar agora.";
    }
    const empresaId = "empresa_id" in identity ? identity.empresa_id : null;
    if (!empresaId) return "Não consegui confirmar sua empresa.";
    const r = await commitAtualizarKm(supa, { empresa_id: empresaId }, pend.veiculo_id, pend.km_novo, pend.km_atual);
    return r.ok
      ? `✅ KM do ${pend.rotulo} atualizado para ${r.km.toLocaleString("pt-BR")}.`
      : `❌ ${r.motivo}`;
  }
  // desambiguacao
  const sel = parseSelecao(texto, pend.opcoes);
  if (sel === null) return null; // não é seleção → abandona e processa a msg nova
  await limparPendente(supa, telefone);
  if (sel === -1) return "Ok, cancelei. Pode mandar de outro jeito.";
  const escolhida = pend.opcoes[sel];
  const regra = regrasFull.find((r) => r.nome === escolhida);
  if (!regra) return "Essa opção não está mais disponível.";
  return executarRegra(supa, telefone, regra, pend.alvo, pend.valor, identity);
}

// ─── entrada principal ─────────────────────────────────────────────────
export async function classificarERotear(msg: ParsedMessage, identity: UserIdentity): Promise<{ disparou: boolean }> {
  try {
    const supa = sb();

    // idempotência (R4): reserva o wamid como 'processando'; só vira 'ok' no finally.
    // Se a função morrer no meio (timeout), fica 'processando' e a reentrega reprocessa.
    let marcarOk = false;
    if (msg.messageId) {
      if ((await reservarWamid(supa, msg.messageId)) === "duplicada") { log.info("msg_duplicada", { wamid: msg.messageId }); return { disparou: true }; }
      marcarOk = true;
    }
    try {

    // resolve o texto: texto direto OU transcrição do áudio (Deepgram/Whisper)
    let texto = (msg.texto ?? "").trim();
    if (!texto && msg.tipo === "audio" && msg.messageId) {
      const dataUrl = await getMediaAsBase64DataUrl(msg.messageId);
      if (dataUrl) {
        const tr = await transcreverAudio(dataUrl);
        if (tr.ok && tr.data.texto) texto = tr.data.texto.trim();
      }
      log.info("motor_audio_transcrito", { from: msg.from, ok: !!texto, texto: texto.slice(0, 80) });
    }
    if (!texto) {
      // áudio que não transcreveu: pede reenvio (NÃO deixa o plano B anotar ruído).
      if (msg.tipo === "audio") { await enviarTexto(msg.from, "🎤 Não consegui entender o áudio. Manda de novo ou escreve?"); return { disparou: true }; }
      return { disparou: false }; // foto/doc → fluxo normal
    }
    log.info("motor_entrou", { from: msg.from, tipo: msg.tipo });

    // RESET: "novo"/"nova"/"limpar" zera todo o contexto (estado pendente)
    if (ehReset(texto)) {
      await limparPendente(supa, msg.from);
      await enviarTexto(msg.from, "🆕 Limpei tudo. Pode começar de novo.");
      return { disparou: true };
    }

    // carrega regras (com escopo + ações) e telefone
    const [{ data: regrasData }, { data: telRow }, { data: ctxData }] = await Promise.all([
      supa.from("regras").select("id,nome,tipo,acoes,gatilhos,frases_exemplo,resposta,ativa,fixa,escopo_dados,gatilho_inicio")
        .eq("ativa", true).order("fixa", { ascending: false }).order("prioridade", { ascending: false }),
      supa.from("telefones").select("telefone,usuario_nome,ativo,anotar,permissoes")
        .in("telefone", variacoesTelefone(msg.from)).limit(1).maybeSingle(),
      supa.from("contexto_ia").select("conteudo").eq("ativo", true).order("ordem"),
    ]);

    const regrasFull: RegraFull[] = (regrasData ?? []).map((r) => ({
      id: r.id, nome: r.nome, tipo: r.tipo, gatilhos: r.gatilhos ?? [], frases_exemplo: r.frases_exemplo ?? [],
      resposta: r.resposta, ativa: r.ativa, fixa: r.fixa, acoes: r.acoes ?? [],
      escopo: ((r.escopo_dados as Record<string, unknown>)?.colunas as EscopoColunas) ?? {},
      gatilho_inicio: r.gatilho_inicio ?? false,
    }));

    // 1) estado pendente? Resolve sim/não ou seleção. Se a resposta NÃO resolve
    // (você falou outra coisa), abandona a pergunta e processa a msg nova do zero —
    // não fica preso no "sim ou não" nem acumula.
    const pend = await lerPendente(supa, msg.from);
    if (pend) {
      const resp = await resolverPendente(supa, msg.from, pend, texto, regrasFull, identity);
      if (resp !== null) { await enviarTexto(msg.from, resp); return { disparou: true }; }
      await limparPendente(supa, msg.from); // não resolveu → larga o cache e segue
    }

    // 2) contexto + autorização (sem trava: não autorizado → cai no lembrete)
    const tel: TelCtx | null = telRow
      ? { telefone: telRow.telefone, usuario_nome: telRow.usuario_nome, ativo: telRow.ativo, anotar: telRow.anotar, permissoes: (telRow.permissoes as Record<string, string>) ?? {} }
      : null;
    const regrasCtx: RegraCtx[] = regrasFull.map((r) => ({ id: r.id, nome: r.nome, tipo: r.tipo, gatilhos: r.gatilhos, frases_exemplo: r.frases_exemplo, resposta: r.resposta, ativa: r.ativa, fixa: r.fixa }));
    const contexto = montarContextoIA({ telefone: msg.from, tel, regras: regrasCtx, mensagem: texto });
    if (!contexto.autorizado) { log.info("nao_autorizado_cai_lembrete", { from: msg.from, motivo: contexto.motivo }); return { disparou: false }; }

    // 3) classificar (timeout + fail-safe). Regras com gatilho_inicio só entram
    // se a MENSAGEM COMEÇAR com um gatilho delas (ex: Lembrete exige "lembrete...").
    const candidatas: RegraClassif[] = contexto.regras
      .filter((r) => {
        const full = regrasFull.find((x) => x.id === r.id);
        if (full?.gatilho_inicio) return comecaComGatilho(texto, full.gatilhos);
        return true;
      })
      .map((r) => ({ id: r.id, nome: r.nome, tipo: r.tipo, gatilhos: r.gatilhos ?? [], frases_exemplo: r.frases_exemplo ?? [] }));
    const contextoGlobal = (ctxData ?? []).map((c) => c.conteudo).join("\n");
    const decisao = await Promise.race([
      classificar(texto, candidatas, contextoGlobal),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), CLASSIFY_TIMEOUT_MS)),
    ]).catch((e) => { log.warn("classify_timeout_ou_erro", { message: e instanceof Error ? e.message : String(e) }); return null; });

    if (!decisao) return { disparou: false }; // fail-safe → lembrete
    const casaram = decisao.regras;
    log.info("classificou", { from: msg.from, casaram, alvo: decisao.alvo, valor: decisao.valor });

    // 4) rotear
    if (casaram.length === 0) {
      // "NÃO ENTENDI": não anota sozinho. Mostra o que entendeu e PERGUNTA.
      // (Áudio com ruído transcreve em algo → aqui o usuário responde "não".)
      await salvarPendente(supa, msg.from, { tipo: "confirmacao", acao: "anotar", texto });
      await enviarTexto(msg.from, `🤔 Não entendi o que você quer. Entendi:\n"${texto}"\n\nQuer que eu *anote como lembrete*? (responda *sim* ou *não*)`);
      return { disparou: true };
    }

    if (casaram.length === 1) {
      const regra = regrasFull.find((r) => r.nome === casaram[0]);
      if (!regra) return { disparou: false };
      const resp = await executarRegra(supa, msg.from, regra, decisao.alvo ?? null, decisao.valor ?? null, identity);
      await enviarTexto(msg.from, resp);
      return { disparou: true };
    }

    // 2+ → desambiguação (máx 3, lição IBM/AWS)
    const opcoes = casaram.slice(0, 3);
    await salvarPendente(supa, msg.from, { tipo: "desambiguacao", opcoes, alvo: decisao.alvo ?? null, valor: decisao.valor ?? null });
    await enviarTexto(msg.from, `🤔 Não tenho certeza do que você quer. Qual é?\n${opcoes.map((o, i) => `${i + 1}️⃣ ${o}`).join("\n")}\n\nResponda o número.`);
    return { disparou: true };

    } finally {
      // marca 'ok' em QUALQUER saída pós-reserva (sucesso, ou erro tratado pelo lembrete).
      if (marcarOk && msg.messageId) await marcarWamidOk(supa, msg.messageId).catch(() => {});
    }
  } catch (e) {
    log.error("classificarERotear_erro", { message: e instanceof Error ? e.message : String(e) });
    return { disparou: false }; // fail-safe total → lembrete
  }
}
