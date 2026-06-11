/**
 * Tipos, constantes e helpers puros da tela de Despacho.
 * Extraído de despacho/page.tsx para manter a page enxuta.
 * NÃO conflita com [id]/_components/types.ts (escopo diferente).
 */

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type EntregaLite = {
  id: string;
  destino: string | null;
  nome_cliente_avulso: string | null;
  clientes: { nome_fantasia: string } | null;
};

export type PedidoDespacho = {
  id: string;
  numero?: string | null;
  status: string;
  valor_pedido: number | null;
  created_at: string | null;
  data_inicio_prevista: string | null;
  veiculo_id?: string | null;
  motorista_id?: string | null;
  entregas: EntregaLite[];
  motoristas?: { nome: string } | null;
  veiculos?: { placa: string; apelido: string | null; modelo: string } | null;
};

export type VeiculoLista = {
  id: string;
  placa: string;
  apelido: string | null;
  marca: string;
  modelo: string;
};

export type MotoristaLista = {
  id: string;
  nome: string;
};

// ─── Constantes ───────────────────────────────────────────────────────────────

/** Tamanho de página da fila de despacho.
 *  Regra dos 10.000+ pedidos (doc 09/06): evita carregar tudo de uma vez. */
export const PAGE_SIZE_DESPACHO = 100;

export const STATUS_FINALIZADOS = ["concluido", "concluida", "cancelado", "cancelada"];

export const STATUS_LABEL: Record<string, string> = {
  agendada: "Agendado", agendado: "Agendado",
  em_andamento: "Em Andamento",
  concluida: "Concluído", concluido: "Concluído",
  cancelada: "Cancelado", cancelado: "Cancelado",
};

export const STATUS_VAR: Record<string, "warning" | "info" | "success" | "danger"> = {
  agendada: "warning", agendado: "warning",
  em_andamento: "info",
  concluida: "success", concluido: "success",
  cancelada: "danger", cancelado: "danger",
};

/** A constraint `viagens_status_check` só aceita as formas FEMININAS. Pedidos
 *  antigos podem ter status masculino ('agendado'), e o Postgres RE-VALIDA o
 *  CHECK em QUALQUER update da linha (mesmo sem mexer no status) → o despacho
 *  estourava. Normalizamos pra forma feminina no próprio update do despacho. */
const STATUS_FEMININO: Record<string, string> = {
  agendado: "agendada", concluido: "concluida", cancelado: "cancelada",
};

// ─── Helpers puros ────────────────────────────────────────────────────────────

export const normalizarStatus = (s: string) => STATUS_FEMININO[s] ?? s;

export const fmtDate = (d: string | null) =>
  d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR") : "—";

export const fmtDataCadastro = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("pt-BR") : "—";

/** Erro do Supabase em linguagem legível: mostra message + details + hint + code. */
export function fmtErroSupabase(e: unknown, contexto: string): string {
  const err = e as { message?: string; details?: string; hint?: string; code?: string } | null;
  const partes = [err?.message, err?.details, err?.hint].filter(Boolean);
  const cod = err?.code ? ` [${err.code}]` : "";
  return `${contexto}: ${partes.join(" — ") || "erro desconhecido"}${cod}`;
}

export function one<T>(x: T | T[] | null | undefined): T | null {
  if (Array.isArray(x)) return x[0] ?? null;
  return x ?? null;
}

/** Cliente do pedido — vem das entregas (cadastrado ou avulso). */
export function clienteDoPedido(entregas: EntregaLite[]): string {
  for (const e of entregas) {
    const cli = one<{ nome_fantasia: string }>(e.clientes);
    if (cli?.nome_fantasia) return cli.nome_fantasia;
  }
  for (const e of entregas) {
    if (e.nome_cliente_avulso?.trim()) return e.nome_cliente_avulso.trim();
  }
  return "Cliente não informado";
}

function rotuloDestino(destino: string): string {
  const partes = destino.trim().split(",").map(s => s.trim()).filter(Boolean);
  const alvo = partes.length >= 2 ? partes[partes.length - 1] : partes[0] ?? destino;
  return alvo.length > 22 ? alvo.slice(0, 21) + "…" : alvo;
}

/** "3 entregas · Centro / Jardim +1" */
export function resumoDestinos(entregas: EntregaLite[]): string {
  const dests = entregas.map(e => e.destino?.trim()).filter((d): d is string => !!d);
  const n = entregas.length;
  const palavra = n === 1 ? "entrega" : "entregas";
  if (dests.length === 0) return `${n} ${palavra}`;
  const rotulos = dests.slice(0, 2).map(rotuloDestino);
  const extra = dests.length > 2 ? ` +${dests.length - 2}` : "";
  return `${n} ${palavra} · ${rotulos.join(" / ")}${extra}`;
}
