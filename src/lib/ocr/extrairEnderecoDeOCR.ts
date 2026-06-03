/**
 * Extração de endereço a partir do TEXTO BRUTO do OCR (Tesseract) de uma nota
 * fiscal / DANFE. LÓGICA PURA e testável — sem I/O, sem OCR aqui.
 *
 * Estratégia (o CEP é a âncora mais confiável):
 *  1. Acha TODOS os CEPs (regex de 5+3 dígitos, evitando CNPJ/valores).
 *  2. Escolhe o CEP do DESTINATÁRIO: a DANFE tem o CEP do emitente (topo) e o do
 *     destinatário (bloco "DESTINATÁRIO/REMETENTE", mais abaixo). Heurística:
 *     o 1º CEP que aparece DEPOIS da palavra "DESTINAT…"; se não houver âncora,
 *     o ÚLTIMO CEP (destinatário costuma ficar abaixo do emitente).
 *  3. Número da casa: 1º por rótulo explícito ("Nº 123", "NUMERO: 123"); 2º pelo
 *     número logo após a vírgula na linha do logradouro ("RUA X, 123"). Conservador:
 *     na dúvida devolve null e o motorista digita (campo é obrigatório e editável).
 *
 * Nunca confia cegamente: devolve TODOS os CEPs achados pra UI poder oferecer
 * escolha, e a linha do logradouro pra ajudar a revisão.
 */

export interface EnderecoOCR {
  /** CEP do destinatário (8 dígitos, sem hífen) — ou null se não achou. */
  cep: string | null;
  /** Número da casa, se identificado com segurança — senão null. */
  numero: string | null;
  /** Todos os CEPs achados no texto (8 dígitos), em ordem de aparição. */
  cepsEncontrados: string[];
  /** Linha que parece o logradouro do destinatário (ajuda a revisão na UI). */
  linhaLogradouro: string | null;
}

/** Prefixos de logradouro comuns em endereços BR (após normalizar pra maiúsculas). */
const PREFIXOS_LOGRADOURO = [
  'RUA', 'R.', 'AV', 'AVENIDA', 'AV.', 'TRAVESSA', 'TV', 'ESTRADA', 'EST.',
  'RODOVIA', 'ROD', 'PRACA', 'PRAÇA', 'ALAMEDA', 'AL.', 'LARGO', 'VIELA',
  'BECO', 'QUADRA', 'LOTE', 'LOTEAMENTO', 'CONDOMINIO', 'CONDOMÍNIO',
];

/** Normaliza um CEP de "01310-100" / "01310 100" pra "01310100". */
function normalizarCep(d: string): string {
  return d.replace(/\D/g, '').slice(0, 8);
}

/**
 * Acha CEPs no texto com a posição de cada um. Evita capturar pedaços de CNPJ
 * ("12.345.678/0001-90") exigindo que o separador seja hífen, espaço ou nada
 * (não ponto nem barra) e que não esteja colado a outros dígitos.
 */
function acharCeps(texto: string): Array<{ cep: string; index: number }> {
  const out: Array<{ cep: string; index: number }> = [];
  // (?<!\d) e (?!\d): garante exatamente 8 dígitos isolados (não parte de 14 do CNPJ).
  const re = /(?<!\d)(\d{5})[-\s]?(\d{3})(?!\d)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto)) !== null) {
    out.push({ cep: normalizarCep(m[1] + m[2]), index: m.index });
  }
  return out;
}

/** Índice da âncora "DESTINAT…" (destinatário) no texto, ou -1. Tolera acentos. */
function indiceDestinatario(textoUpper: string): number {
  const m = /DESTINAT[ÁA]?RIO|DESTINAT[ÁA]?RI[OÔ]|DESTINAT/.exec(textoUpper);
  return m ? m.index : -1;
}

/** True se a linha começa (após lixo) com um prefixo de logradouro. */
function pareceLogradouro(linhaUpper: string): boolean {
  const t = linhaUpper.trim();
  return PREFIXOS_LOGRADOURO.some(
    (p) => t === p || t.startsWith(p + ' ') || t.startsWith(p + '.') || t.startsWith(p + ',')
  );
}

/**
 * Extrai o número da casa de uma linha de logradouro.
 * 1º vírgula seguida de número ("RUA X, 123"); 2º número isolado após o nome.
 * Ignora números de 8 dígitos (CEP) e runs muito longos.
 */
function numeroDaLinha(linha: string): string | null {
  const aposVirgula = /,\s*(?:N[º°O.]*\s*)?(\d{1,6})(?!\d)/.exec(linha);
  if (aposVirgula) return aposVirgula[1];
  // Número solto após texto (evita pegar o 1º token se a linha começa com número)
  const solto = /[A-Za-zÀ-ÿ.]\s+(?:N[º°O.]*\s*)?(\d{1,6})(?!\d)/.exec(linha);
  if (solto) return solto[1];
  return null;
}

/** Procura número por rótulo explícito em todo o texto ("Nº 123", "NUMERO: 12"). */
function numeroPorRotulo(texto: string): string | null {
  const porN = /\bN[º°O]\.?\s*[:\-]?\s*(\d{1,6})(?!\d)/i.exec(texto);
  if (porN) return porN[1];
  const porPalavra = /N[UÚ]MERO\.?\s*[:\-]?\s*(\d{1,6})(?!\d)/i.exec(texto);
  if (porPalavra) return porPalavra[1];
  return null;
}

/**
 * Extrai endereço (CEP + número) do texto bruto de OCR de uma DANFE/NF.
 * Pura e determinística.
 */
export function extrairEnderecoDeOCR(textoBruto: string): EnderecoOCR {
  const vazio: EnderecoOCR = { cep: null, numero: null, cepsEncontrados: [], linhaLogradouro: null };
  if (!textoBruto || typeof textoBruto !== 'string') return vazio;

  const upper = textoBruto.toUpperCase();
  const ceps = acharCeps(textoBruto);
  const cepsEncontrados = ceps.map((c) => c.cep);

  // ── Escolhe o CEP do destinatário ────────────────────────────────────
  let cepEscolhido: string | null = null;
  if (ceps.length === 1) {
    cepEscolhido = ceps[0].cep;
  } else if (ceps.length > 1) {
    const idxDest = indiceDestinatario(upper);
    if (idxDest >= 0) {
      const apos = ceps.find((c) => c.index > idxDest);
      cepEscolhido = (apos ?? ceps[ceps.length - 1]).cep; // após âncora, senão o último
    } else {
      cepEscolhido = ceps[ceps.length - 1].cep; // sem âncora: o último (destinatário fica abaixo)
    }
  }

  // ── Acha a linha do logradouro (preferindo as DEPOIS do "DESTINAT…") ──
  const linhas = textoBruto.split(/\r?\n/);
  const idxDest = indiceDestinatario(upper);
  let linhaLogradouro: string | null = null;
  // Posição de caractere acumulada por linha, pra comparar com idxDest.
  let pos = 0;
  const candidatas: Array<{ linha: string; depoisDest: boolean }> = [];
  for (const linha of linhas) {
    if (pareceLogradouro(linha.toUpperCase())) {
      candidatas.push({ linha: linha.trim(), depoisDest: idxDest >= 0 ? pos > idxDest : true });
    }
    pos += linha.length + 1; // +1 do \n
  }
  // Prefere logradouro após a âncora do destinatário; senão a 1ª candidata.
  linhaLogradouro =
    candidatas.find((c) => c.depoisDest)?.linha ?? candidatas[0]?.linha ?? null;

  // ── Número da casa ───────────────────────────────────────────────────
  // 1º na linha do logradouro; 2º por rótulo explícito em qualquer lugar.
  let numero: string | null = null;
  if (linhaLogradouro) numero = numeroDaLinha(linhaLogradouro);
  if (!numero) numero = numeroPorRotulo(textoBruto);
  // Segurança: número não pode ser igual ao CEP nem ter 8 dígitos.
  if (numero && (numero.length >= 8 || numero === cepEscolhido)) numero = null;

  return { cep: cepEscolhido, numero, cepsEncontrados, linhaLogradouro };
}
