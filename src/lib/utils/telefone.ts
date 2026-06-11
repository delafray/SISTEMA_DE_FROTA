// Normalização de telefone — o usuário cadastra como quiser, a gente canoniza.
// Canônico = só dígitos, com DDI 55 e o 9º dígito (ex: 5531989791317).
// O casamento com o que o WhatsApp manda (que às vezes vem SEM o 9) é feito
// gerando variações em `variacoesTelefone`.

export function telefoneCanonico(input: string): string {
  let d = (input || "").replace(/\D/g, "");
  if (!d) return "";
  // tira zeros à esquerda de operadora (ex: 031 -> 31)
  d = d.replace(/^0+/, "");
  if (d.startsWith("55") && d.length >= 12) return d;          // já tem DDI
  if (d.length === 10 || d.length === 11) return "55" + d;     // DDD + número
  return d;                                                    // fallback: deixa como veio
}

export function telefoneExibicao(canonicoOuInput: string): string {
  const d = (canonicoOuInput || "").replace(/\D/g, "");
  const semDDI = d.startsWith("55") ? d.slice(2) : d;
  const ddd = semDDI.slice(0, 2);
  const num = semDDI.slice(2);
  if (num.length === 9) return `(${ddd}) ${num.slice(0, 5)}-${num.slice(5)}`;
  if (num.length === 8) return `(${ddd}) ${num.slice(0, 4)}-${num.slice(4)}`;
  return canonicoOuInput;
}

/**
 * Gera as variações pra casar o número que chega no zap com o cadastrado:
 * com/sem DDI 55, com/sem o 9º dígito. Útil no lado do bot na hora de achar
 * o telefone na tabela de autorizações.
 */
export function variacoesTelefone(input: string): string[] {
  const canon = telefoneCanonico(input);
  const d = canon.replace(/\D/g, "");
  if (!d.startsWith("55")) return [d];
  const corpo = d.slice(2);                 // DDD + número
  const ddd = corpo.slice(0, 2);
  const num = corpo.slice(2);
  const set = new Set<string>();
  const add = (n: string) => { set.add("55" + ddd + n); set.add(ddd + n); };
  add(num);
  // com 9 e sem 9
  if (num.length === 9 && num.startsWith("9")) add(num.slice(1)); // tira o 9
  if (num.length === 8) add("9" + num);                          // adiciona o 9
  return [...set];
}
