import * as XLSX from "xlsx";

/**
 * Leitura de planilha (XLSX/XLS/CSV) para importação em massa de entregas.
 * Template mínimo estilo Routific/Circuit (proposta §2.5): endereço
 * obrigatório, resto opcional. O mapeamento de colunas é escolhido pelo
 * operador na tela (com auto-detecção pelo nome do cabeçalho).
 */

export type PlanilhaLida = {
  /** Cabeçalhos da primeira linha não vazia */
  headers: string[];
  /** Demais linhas, como texto (mesma largura de headers) */
  linhas: string[][];
};

export type MapeamentoColunas = {
  /** índice da coluna em headers; endereço é o único obrigatório */
  endereco: number;
  nome?: number;
  valor?: number;
  numeroNota?: number;
  observacoes?: number;
};

export type LinhaImportada = {
  endereco: string;
  nome: string;
  valor: number | null;
  numeroNota: string;
  observacoes: string;
};

export type ResultadoPlanilha = {
  linhas: LinhaImportada[];
  falhas: { linha: number; motivo: string }[];
};

/** Lê a primeira aba da planilha. Lança Error com mensagem amigável se ilegível. */
export function lerPlanilha(buffer: ArrayBuffer): PlanilhaLida {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buffer, { type: "array" });
  } catch {
    throw new Error("Não foi possível ler a planilha (formato não reconhecido)");
  }
  const nomeAba = wb.SheetNames[0];
  if (!nomeAba) throw new Error("Planilha sem abas");

  const matriz: unknown[][] = XLSX.utils.sheet_to_json(wb.Sheets[nomeAba], {
    header: 1,
    raw: false,
    defval: "",
  });

  // primeira linha com algum conteúdo = cabeçalho
  const idxHeader = matriz.findIndex(l => l.some(c => String(c ?? "").trim() !== ""));
  if (idxHeader === -1) throw new Error("Planilha vazia");

  const headers = matriz[idxHeader].map(c => String(c ?? "").trim());
  const linhas = matriz.slice(idxHeader + 1)
    .filter(l => l.some(c => String(c ?? "").trim() !== ""))
    .map(l => headers.map((_, i) => String(l[i] ?? "").trim()));

  return { headers, linhas };
}

const norm = (s: string) =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();

/** Sugere o mapeamento pelos nomes dos cabeçalhos (operador pode trocar na tela) */
export function detectarMapeamento(headers: string[]): Partial<MapeamentoColunas> {
  const m: Partial<MapeamentoColunas> = {};
  headers.forEach((h, i) => {
    const n = norm(h);
    if (m.endereco === undefined && /(endereco|destino|address|logradouro|local de entrega|entrega)/.test(n)) m.endereco = i;
    if (m.nome === undefined && /(cliente|destinatario|nome|razao)/.test(n)) m.nome = i;
    if (m.valor === undefined && /(valor|total|vlr|preco)/.test(n)) m.valor = i;
    if (m.numeroNota === undefined && /(nota|nf|n\.?f\.?e?|numero da nota|pedido)/.test(n)) m.numeroNota = i;
    if (m.observacoes === undefined && /(obs|observac|comentario|nota fiscal obs)/.test(n)) m.observacoes = i;
  });
  return m;
}

/** Converte "1.234,56" / "1234.56" / "R$ 1.234,56" em número (ou null) */
export function parseValorBR(s: string): number | null {
  const limpo = s.replace(/[^\d.,-]/g, "");
  if (!limpo) return null;
  // se tem vírgula, assume formato BR (vírgula decimal, ponto milhar)
  const normalizado = limpo.includes(",")
    ? limpo.replace(/\./g, "").replace(",", ".")
    : limpo;
  const n = Number(normalizado);
  return Number.isFinite(n) ? n : null;
}

/** Aplica o mapeamento às linhas. Linha sem endereço vira falha (não aborta o lote). */
export function montarLinhas(planilha: PlanilhaLida, map: MapeamentoColunas): ResultadoPlanilha {
  const linhas: LinhaImportada[] = [];
  const falhas: ResultadoPlanilha["falhas"] = [];

  planilha.linhas.forEach((l, idx) => {
    const numLinha = idx + 2; // +1 do cabeçalho, +1 base-1 (como o operador vê no Excel)
    const endereco = (l[map.endereco] ?? "").trim();
    if (!endereco) {
      falhas.push({ linha: numLinha, motivo: "Endereço vazio" });
      return;
    }
    linhas.push({
      endereco,
      nome: map.nome !== undefined ? (l[map.nome] ?? "").trim() : "",
      valor: map.valor !== undefined ? parseValorBR(l[map.valor] ?? "") : null,
      numeroNota: map.numeroNota !== undefined ? (l[map.numeroNota] ?? "").trim() : "",
      observacoes: map.observacoes !== undefined ? (l[map.observacoes] ?? "").trim() : "",
    });
  });

  return { linhas, falhas };
}
