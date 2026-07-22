import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { variacoesTelefone } from "@/lib/utils/telefone";
import { montarContextoIA, type RegraCtx, type TelCtx } from "@/lib/whatsapp/montarContexto";
import { classificar, type RegraClassif } from "@/lib/whatsapp/classificador";
import { requireSessao } from '@/lib/auth/requireSessao';

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

// MODO SEGURO: classifica a mensagem contra as regras que o telefone pode usar e
// devolve a decisão (1 / ambíguo / nenhuma). NÃO executa nada (não grava KM, etc.).
export async function POST(req: NextRequest) {
  const { erro: erroSessao } = await requireSessao();
  if (erroSessao) return erroSessao;
  const { telefone, mensagem } = await req.json().catch(() => ({}));
  if (!telefone || !mensagem) return NextResponse.json({ error: "telefone e mensagem são obrigatórios" }, { status: 400 });
  const supa = sb();

  const { data: telRow } = await supa.from("telefones")
    .select("telefone,usuario_nome,ativo,anotar,permissoes")
    .in("telefone", variacoesTelefone(telefone)).limit(1).maybeSingle();
  const tel: TelCtx | null = telRow
    ? { telefone: telRow.telefone, usuario_nome: telRow.usuario_nome, ativo: telRow.ativo, anotar: telRow.anotar, permissoes: (telRow.permissoes as Record<string, string>) ?? {} }
    : null;

  const { data: regrasData } = await supa.from("regras")
    .select("id,nome,tipo,gatilhos,frases_exemplo,resposta,ativa,fixa")
    .eq("ativa", true).order("fixa", { ascending: false }).order("prioridade", { ascending: false });
  const regras = (regrasData ?? []) as RegraCtx[];

  const contexto = montarContextoIA({ telefone, tel, regras, mensagem });
  if (!contexto.autorizado)
    return NextResponse.json({ autorizado: false, motivo: contexto.motivo, resposta: "Seu número não está autorizado a usar o sistema." });

  const candidatas: RegraClassif[] = contexto.regras.map((r) => ({ id: r.id, nome: r.nome, tipo: r.tipo, gatilhos: r.gatilhos ?? [], frases_exemplo: r.frases_exemplo ?? [] }));

  // contexto global da IA (config dentro do sistema — tabela contexto_ia)
  const { data: ctxData } = await supa.from("contexto_ia").select("conteudo").eq("ativo", true).order("ordem");
  const contextoGlobal = (ctxData ?? []).map((c) => c.conteudo).join("\n");

  const decisao = await classificar(mensagem, candidatas, contextoGlobal);
  const casaram = decisao.regras;

  let resposta: string;
  if (casaram.length === 0) {
    resposta = "Não casou com nenhuma regra. Eu sugeriria anotar como lembrete. (modo seguro)";
  } else if (casaram.length === 1) {
    resposta = `Entendi: "${casaram[0]}". (modo seguro — eu faria isso, mas ainda não executo.)`;
  } else {
    const emoji = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣"];
    const ops = casaram.map((n, i) => `${emoji[i] ?? `${i + 1}.`} ${n}`).join("   ·   ");
    resposta = `Não tenho certeza do que você quer. Responda:   ${ops}`;
  }

  return NextResponse.json({
    autorizado: true,
    candidatas: candidatas.map((c) => c.nome),
    casaram,
    raciocinio: decisao.raciocinio,
    resposta,
  });
}
