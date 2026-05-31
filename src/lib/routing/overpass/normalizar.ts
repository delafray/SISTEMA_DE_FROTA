/**
 * Normaliza nome de rua pra comparacao consistente entre OSM e input do motorista.
 *
 * OSM Brasil tem inconsistencias enormes em nomes:
 * - "Av. do Contorno" vs "Avenida do Contorno" vs "AV DO CONTORNO"
 * - acentos as vezes presentes, as vezes nao
 * - "Cel." vs "Coronel", "Sgt." vs "Sargento"
 *
 * Normalizar permite:
 * 1. cache key consistente (mesma rua = mesma key)
 * 2. regex pro Overpass aceitar variacoes
 */

/** Remove acentos (NFD normalize + filter diacritics). */
export function removerAcentos(texto: string): string {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Normalizacao agressiva pra usar como CACHE KEY:
 * - lowercase
 * - sem acentos
 * - sem prefixos comuns (av, rua, r, alameda, etc — viram nada)
 * - sem pontuacao
 * - espacos colapsados
 *
 * "Avenida do Contorno" → "contorno"
 * "Av. do Contorno"     → "contorno"
 * "Rua Mal. Castelo Branco" → "mal castelo branco"
 *   (atencao: "Mal." nao vira "Marechal" pra evitar ambiguidade)
 */
const PREFIXOS = [
  'avenida', 'av',
  'rua', 'r',
  'alameda', 'al',
  'travessa', 'tv',
  'praca', 'pca',
  'estrada', 'estr',
  'rodovia', 'rod',
  'largo', 'lgo',
  'beco', 'bc',
];

export function normalizarRua(rua: string): string {
  if (!rua) return '';
  let n = removerAcentos(rua).toLowerCase();
  // Apostrofo JUNTA as partes (nao vira espaco): "D'Alva" → "dalva",
  // "Sant'Ana" → "santana", "D'Avila" → "davila". Assim casa com quem digita
  // ou fala o nome SEM o apostrofo, que e o caso comum em ruas/bairros do BR.
  // Cobre as variantes de aspas simples que vem de teclado de celular.
  n = n.replace(/['’‘`´]/g, '');
  // Demais pontuacoes viram espaco.
  n = n.replace(/[.,;:!?()"]/g, ' ');
  n = n.replace(/\s+/g, ' ').trim();
  // Remove prefixos do INICIO (so 1 vez). Ordem do alternation importa:
  // "dos|das" antes de "do|da" pra evitar "rua das flores" → "rua das" + "s flores"
  for (const prefixo of PREFIXOS) {
    const re = new RegExp(`^${prefixo}\\s+(?:dos|das|de|do|da)?\\s*`);
    if (re.test(n)) {
      n = n.replace(re, '').trim();
      break;
    }
  }
  return n;
}

/**
 * Monta regex Overpass-compativel pra buscar variantes do nome.
 * Aceita case-insensitive, com/sem acento (via classes brasileiras), com/sem
 * prefixo, com/sem pontuacao.
 *
 * Ex: "Av do Contorno" → "(av\\.?\\s+(do\\s+)?)?contorno"
 *
 * Usado dentro de `[\"addr:street\"~\"<regex>\",i]` no Overpass QL.
 */
export function regexOverpassRua(rua: string): string {
  const nucleo = normalizarRua(rua);
  if (!nucleo) return '';
  // Escape caracteres regex
  const escapado = nucleo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Aceita qualquer prefixo (opcional) + variacoes de "do/da/de" (opcionais)
  return escapado;
}
