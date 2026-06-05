/**
 * Montador de CONTEXTO da IA — "config como dado".
 * Pega o que foi cadastrado pelo sistema (regras + permissões do telefone) e
 * monta o pacote organizado, direto e simples que a IA recebe quando o zap dispara.
 * ZERO código por regra: cadastrou pela tela → entra no contexto.
 *
 * Função PURA (não acessa o banco) — quem carrega os dados é o caller (bot ou preview).
 */

export type RegraCtx = {
  id: string;
  nome: string;
  tipo: string;          // consultar | registrar | anotar
  gatilhos: string[];
  frases_exemplo: string[];
  resposta: string | null;
  ativa: boolean;
  fixa: boolean;
};

export type TelCtx = {
  telefone: string;
  usuario_nome: string | null;
  ativo: boolean;
  anotar: boolean;
  permissoes: Record<string, string>;   // { "<regra_id>": "consultar|modificar|criar" }
};

export type RegraDisponivel = RegraCtx & { nivel: string };

export type Contexto = {
  autorizado: boolean;
  motivo?: string;
  regras: RegraDisponivel[];
  texto: string;     // o pacote pronto pra IA
};

/** Nível que o telefone tem naquela regra (anotar usa o flag; resto usa permissoes). */
function nivelDoTelefone(tel: TelCtx, regra: RegraCtx): string {
  if (regra.tipo === "anotar") return tel.anotar ? "anotar" : "";
  return tel.permissoes?.[regra.id] ?? "";
}

export function montarContextoIA(p: { telefone: string; tel: TelCtx | null; regras: RegraCtx[]; mensagem: string }): Contexto {
  const { telefone, tel, regras, mensagem } = p;

  if (!tel)        return { autorizado: false, motivo: "Telefone não cadastrado.", regras: [], texto: "" };
  if (!tel.ativo)  return { autorizado: false, motivo: "Telefone inativo.",        regras: [], texto: "" };

  // só as regras ATIVAS que ESTE telefone pode usar (fixa Lembrete primeiro)
  const disp: RegraDisponivel[] = regras
    .filter((r) => r.ativa)
    .map((r) => ({ ...r, nivel: nivelDoTelefone(tel, r) }))
    .filter((r) => r.nivel !== "")
    .sort((a, b) => Number(b.fixa) - Number(a.fixa));

  const linhasRegras = disp
    .map((r, i) => `${i + 1}. ${r.nome}  [${r.nivel}]\n   gatilhos: ${(r.gatilhos ?? []).join(", ") || "(nenhum)"}`)
    .join("\n");

  const texto =
`REMETENTE: ${tel.usuario_nome ?? "(sem usuário vinculado)"} · ${telefone} · ATIVO
PERMISSÕES: anotar=${tel.anotar ? "sim" : "não"}
REGRAS QUE ELE PODE USAR:
${linhasRegras || "(nenhuma)"}

MENSAGEM DO USUÁRIO:
"${mensagem}"

SUA TAREFA: identifique qual regra a mensagem dispara (pelos gatilhos e pelo sentido).
Se for uma das regras, execute conforme o nível permitido. Se nenhuma casar, sugira anotar.`;

  return { autorizado: true, regras: disp, texto };
}
