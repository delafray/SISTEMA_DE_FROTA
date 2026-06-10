import { XMLParser } from "fast-xml-parser";

/**
 * Parser de XML de NFe (modelo 55) para importação em massa de notas.
 * Extrai apenas o que vira entrega: destinatário, endereço, valor e chave.
 * Roda no navegador (client-side), igual ao resto do app.
 *
 * Aceita tanto o XML "procNFe" (nfeProc > NFe > infNFe, o distribuído pela
 * SEFAZ após autorização) quanto o XML "puro" (NFe > infNFe).
 */

export type NotaImportada = {
  /** Chave de acesso — 44 dígitos (sem o prefixo "NFe" do atributo Id) */
  chave: string;
  /** Número da nota (nNF) */
  numero: string;
  serie: string;
  /** Data/hora de emissão (dhEmi), ISO — pode ser vazia em XML antigo */
  emissao: string;
  /** Nome/razão social do destinatário */
  destinatario: string;
  /** Endereço completo formatado para geocoding/destino */
  endereco: string;
  cidade: string;
  uf: string;
  cep: string;
  /** Valor total da nota (vNF) — mercadoria, NÃO é o frete */
  valor: number | null;
};

export type ResultadoParseNFe =
  | { ok: true; nota: NotaImportada }
  | { ok: false; motivo: string };

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  // números como string p/ não perder zeros à esquerda (nNF, CEP)
  parseTagValue: false,
  parseAttributeValue: false,
});

/** Navega com segurança em objeto aninhado */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const get = (obj: any, path: string[]): any => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let cur: any = obj;
  for (const k of path) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = cur[k];
  }
  return cur;
};

const texto = (v: unknown): string => (v == null ? "" : String(v).trim());

/** Formata o endereço do destinatário no padrão que o geocoding espera */
export function formatarEnderecoNFe(ender: {
  xLgr?: string; nro?: string; xCpl?: string; xBairro?: string;
  xMun?: string; UF?: string; CEP?: string;
}): string {
  const partes: string[] = [];
  const lgr = texto(ender.xLgr);
  const nro = texto(ender.nro);
  if (lgr) partes.push(nro && nro.toUpperCase() !== "SN" ? `${lgr}, ${nro}` : lgr);
  const bairro = texto(ender.xBairro);
  if (bairro) partes.push(bairro);
  const mun = texto(ender.xMun);
  const uf = texto(ender.UF);
  if (mun) partes.push(uf ? `${mun} - ${uf}` : mun);
  else if (uf) partes.push(uf);
  const cep = texto(ender.CEP).replace(/\D/g, "");
  if (cep.length === 8) partes.push(`CEP ${cep.slice(0, 5)}-${cep.slice(5)}`);
  return partes.join(", ");
}

/**
 * Parseia o conteúdo de UM arquivo XML de NFe.
 * Nunca lança — falha vira { ok: false, motivo } para o relatório do lote.
 */
export function parseNFe(xml: string): ResultadoParseNFe {
  if (!xml || !xml.trim()) return { ok: false, motivo: "Arquivo vazio" };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let doc: any;
  try {
    doc = parser.parse(xml);
  } catch {
    return { ok: false, motivo: "XML inválido (não foi possível ler)" };
  }

  // nfeProc > NFe > infNFe  OU  NFe > infNFe
  const infNFe =
    get(doc, ["nfeProc", "NFe", "infNFe"]) ??
    get(doc, ["NFe", "infNFe"]) ??
    get(doc, ["enviNFe", "NFe", "infNFe"]);
  if (!infNFe) {
    // CT-e, NFC-e de outro layout, ou XML que não é nota
    if (get(doc, ["cteProc"]) || get(doc, ["CTe"])) {
      return { ok: false, motivo: "Arquivo é um CT-e, não uma NFe (importação de CT-e é fase futura)" };
    }
    return { ok: false, motivo: "Não é um XML de NFe (infNFe não encontrado)" };
  }

  const chave = texto(infNFe["@_Id"]).replace(/^NFe/i, "");
  if (!/^\d{44}$/.test(chave)) {
    return { ok: false, motivo: `Chave de acesso inválida ("${chave || "ausente"}")` };
  }

  const ide = infNFe.ide ?? {};
  const dest = infNFe.dest ?? {};
  const ender = dest.enderDest ?? {};

  const destinatario = texto(dest.xNome);
  const endereco = formatarEnderecoNFe(ender);
  if (!endereco) {
    return { ok: false, motivo: "NFe sem endereço de destinatário (enderDest vazio)" };
  }

  const vNFraw = texto(get(infNFe, ["total", "ICMSTot", "vNF"]));
  const vNF = vNFraw ? Number(vNFraw) : NaN;

  return {
    ok: true,
    nota: {
      chave,
      numero: texto(ide.nNF),
      serie: texto(ide.serie),
      emissao: texto(ide.dhEmi ?? ide.dEmi),
      destinatario,
      endereco,
      cidade: texto(ender.xMun),
      uf: texto(ender.UF),
      cep: texto(ender.CEP).replace(/\D/g, ""),
      valor: Number.isFinite(vNF) ? vNF : null,
    },
  };
}

export type ArquivoNFe = { nome: string; conteudo: string };
export type RelatorioLote = {
  notas: { arquivo: string; nota: NotaImportada }[];
  falhas: { arquivo: string; motivo: string }[];
};

/**
 * Parseia um lote de XMLs. Falha em 1 arquivo não aborta o lote (regra da
 * proposta §2.5) — cada falha entra no relatório com o motivo.
 * Dedupe DENTRO do lote (mesma chave 2× no upload) também é tratado aqui;
 * dedupe contra o banco é feito na tela, consultando entregas.nfe_chave.
 */
export function parseLoteNFe(arquivos: ArquivoNFe[]): RelatorioLote {
  const notas: RelatorioLote["notas"] = [];
  const falhas: RelatorioLote["falhas"] = [];
  const chavesVistas = new Set<string>();

  for (const a of arquivos) {
    const r = parseNFe(a.conteudo);
    if (!r.ok) {
      falhas.push({ arquivo: a.nome, motivo: r.motivo });
      continue;
    }
    if (chavesVistas.has(r.nota.chave)) {
      falhas.push({ arquivo: a.nome, motivo: `Nota duplicada no lote (chave ${r.nota.chave})` });
      continue;
    }
    chavesVistas.add(r.nota.chave);
    notas.push({ arquivo: a.nome, nota: r.nota });
  }

  return { notas, falhas };
}
