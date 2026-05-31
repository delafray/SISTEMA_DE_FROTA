/**
 * Extrai o numero da casa de uma transcricao de voz de endereco.
 *
 * Regras (PT-BR falado):
 *  - O numero da casa costuma vir por ULTIMO ("Rua Piata 104 Sao Mateus").
 *  - A rua pode ter numero no nome ("Rua 7 de Setembro 104", "Av 23 de Maio
 *    1500") — por isso preferimos o ULTIMO numero, nao o primeiro.
 *  - Numeros logo apos "apto/apartamento/bloco/sala/..." sao complemento, NAO
 *    o numero da casa — ignorados ("Rua X 104 apartamento 2" → 104).
 *  - Limita a 6 digitos pra nao confundir com CEP/numeros longos (o CEP falado
 *    ja e tratado antes por extrairCepDeTranscricao).
 */

const INDICADORES_COMPLEMENTO = new Set([
  'apto',
  'apt',
  'apartamento',
  'ap',
  'bloco',
  'bl',
  'casa',
  'sala',
  'conjunto',
  'conj',
  'andar',
  'lote',
  'fundos',
]);

export function extrairNumeroDeTranscricao(texto: string): string | null {
  if (!texto) return null;

  const tokens = texto
    .toLowerCase()
    .replace(/[,.\-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  const candidatos: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const m = tokens[i].match(/\d+/); // primeiro run de digitos do token ("104a" → "104")
    if (!m) continue;
    if (m[0].length > 6) continue; // CEP/numero longo espurio
    const anterior = tokens[i - 1] ?? '';
    if (INDICADORES_COMPLEMENTO.has(anterior)) continue; // apto/bloco/etc
    candidatos.push(m[0]);
  }

  if (candidatos.length === 0) return null;
  return candidatos[candidatos.length - 1];
}
