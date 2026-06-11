/**
 * Utilitários de formatação de CEP — BROWSER-SAFE (sem I/O, sem Supabase).
 *
 * `normalizarCEP` e `formatarCEP` já existem em viacep.ts mas aquele arquivo
 * é SERVER-ONLY (usa service_role do Supabase). As funções abaixo são puras e
 * seguras pra usar em componentes React do lado do cliente.
 *
 * Diferença de `formatarCEP` do viacep.ts: aquele exige 8 dígitos e devolve o
 * input inalterado se faltar algum. `formatarCEPDigitando` é pensada para o
 * campo de digitação — formata parcialmente enquanto o motorista ainda digita
 * ("01310" → "01310", "013101" → "01310-1").
 */

/** Remove tudo que não for dígito. */
export function normalizarCEP(cep: string): string {
  return cep.replace(/\D/g, '');
}

/**
 * Formata pra exibição enquanto o motorista digita.
 * Aceita a string já normalizada (só dígitos) e insere o hífen na posição 5.
 *
 * Exemplos:
 *   ""         → ""
 *   "01310"    → "01310"
 *   "013101"   → "01310-1"
 *   "01310100" → "01310-100"
 */
export function formatarCEPDigitando(digitsApenas: string): string {
  const d = digitsApenas.slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}
