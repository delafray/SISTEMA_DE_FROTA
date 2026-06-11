// ─── Tipos compartilhados entre a page e os componentes de etapa ─────────────

export type Modo = "xml" | "planilha";
export type Etapa = "selecionar_pedido" | "upload" | "preview" | "resultado";

/** Linha unificada para a tabela de preview */
export type LinhaPreview = {
  /** índice original (para manter estado de checkbox) */
  idx: number;
  destinatario: string;
  endereco: string;
  numeroNota: string;
  valorNota: number | null;
  observacoes: string;
  // apenas XML
  nfeChave?: string;
  // estado calculado na etapa preview
  jaImportada: boolean;
};

export type PedidoAlvo = {
  id: string;
  numero?: string | null;
  status: string;
  data_inicio_prevista: string | null;
  local_carregamento: string | null;
  veiculo_id: string | null;
  motorista_id: string | null;
  motoristas: { nome: string } | null;
  entregas: { id: string }[];
};

export type PedidoOpcao = {
  id: string;
  numero?: string | null;
  status: string;
  data_inicio_prevista: string | null;
  entregas: { id: string; destino: string | null; nome_cliente_avulso: string | null }[];
};

export const STATUS_FINALIZADOS = ["concluido", "concluida", "cancelado", "cancelada"];

// ─── helpers puros ────────────────────────────────────────────────────────────

export function fmtValor(v: number | null): string {
  if (v === null) return "—";
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Quebra um array em pedaços de `size` */
export function chunks<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size));
  return result;
}

/** Retorna os 8 primeiros caracteres do UUID como ID curto (fallback sem numero) */
export function idCurto(id: string): string {
  return id.slice(0, 8);
}
