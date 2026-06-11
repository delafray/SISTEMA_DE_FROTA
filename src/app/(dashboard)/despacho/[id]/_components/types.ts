/**
 * Tipos e constantes compartilhados entre as abas do detalhe do despacho.
 * Centralizar aqui evita duplicação e mantém a page.tsx enxuta.
 */

import type { MapaRotaProps } from "@/components/MapaRota";

// Parada como o MapaRota consome (subset).
export type ParadaMapa = MapaRotaProps["paradas"][number];

export type Pedido = {
  id: string;
  numero: string | null;
  empresa_id: string | null;
  status: string;
  data_inicio_prevista: string | null;
  data_fim_prevista: string | null;
  data_inicio_real: string | null;
  data_fim_real: string | null;
  km_inicial: number | null;
  km_final: number | null;
  observacoes: string | null;
  created_at: string | null;
  local_carregamento: string | null;
  motoristas: { id: string; nome: string } | null;
  veiculos: { id: string; placa: string; apelido: string | null; marca: string; modelo: string } | null;
};

export type NotaMontagem = {
  id: string;
  numero: string | null;
  endereco: unknown;
  status: string;
  capturado_em: string | null;
};

export type RotaExec = {
  id: string;
  status: string;
  data: string | null;
  criada_em: string | null;
  otimizada_em: string | null;
  distancia_total_km: number | null;
  tempo_total_min: number | null;
};

export type EntregaPedido = {
  id: string;
  origem: string | null;
  destino: string | null;
  status: string;
  sequencia: number | null;
  geocode_status: string | null;
  data_coleta_prevista: string | null;
  nome_cliente_avulso: string | null;
  clientes: { nome_fantasia: string } | null;
};

export const ROTA_STATUS_LABEL: Record<string, string> = {
  rascunho: "Rascunho", otimizada: "Em aberto", em_andamento: "Em andamento",
  concluida: "Concluída", cancelada: "Cancelada",
};
export const ROTA_STATUS_VAR: Record<string, "warning" | "info" | "success" | "danger" | "default"> = {
  rascunho: "default", otimizada: "warning", em_andamento: "info",
  concluida: "success", cancelada: "danger",
};

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

export const COR_PEDIDO   = { borda: "#bfdbfe", fundo: "#eff6ff", texto: "#1e40af" };
export const COR_DESPACHO = { borda: "#bbf7d0", fundo: "#f0fdf4", texto: "#166534" };
export const COR_ROTA     = { borda: "#fde68a", fundo: "#fffbeb", texto: "#92400e" };
export const COR_ENTREGAS = { borda: "#e2e8f0", fundo: "#f8fafc", texto: "#334155" };

export const fmtDate = (d: string | null) =>
  d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR") : "—";
export const fmtDT = (d: string | null) =>
  d ? new Date(d).toLocaleString("pt-BR") : "—";

/** Endereço legível do JSON da parada. */
export function enderecoParada(e: unknown): string {
  const o = (e ?? {}) as { logradouro?: string; numero?: string; cidade?: string; uf?: string };
  const rua = [o.logradouro, o.numero].filter(Boolean).join(", ");
  const cidade = [o.cidade, o.uf].filter(Boolean).join("/");
  return [rua, cidade].filter(Boolean).join(" — ") || "Endereço não informado";
}

/** "Apelido (PLACA)" quando tem apelido; senão "PLACA — marca modelo". */
export const veiculoLabel = (v: { placa: string; apelido: string | null; marca: string; modelo: string }) =>
  v.apelido?.trim() ? `${v.apelido} (${v.placa})` : `${v.placa} — ${v.marca} ${v.modelo}`;

/** Cliente do pedido — vem das entregas (cadastrado ou avulso), igual à lista. */
export function clienteDoPedido(entregas: EntregaPedido[]): string {
  for (const e of entregas) {
    const cli = one(e.clientes);
    if (cli?.nome_fantasia) return cli.nome_fantasia;
  }
  for (const e of entregas) {
    if (e.nome_cliente_avulso?.trim()) return e.nome_cliente_avulso.trim();
  }
  return "Cliente não informado";
}

export function one<T>(x: T | T[] | null | undefined): T | null {
  if (Array.isArray(x)) return x[0] ?? null;
  return x ?? null;
}
