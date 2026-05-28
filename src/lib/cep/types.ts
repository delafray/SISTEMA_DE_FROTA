/**
 * Tipos do modulo de CEP — captura/consulta ViaCEP.
 * Veja PLANO_ROTEIRIZACAO.md secao 0.5.
 */

/**
 * Endereco devolvido pelo ViaCEP (formato normalizado pra usar no app).
 * Campos diretos do payload ViaCEP: logradouro, bairro, localidade, uf.
 * (Renomeamos `localidade` -> `cidade` pra consistencia com o resto do sistema.)
 */
export interface EnderecoCEP {
  logradouro: string;
  bairro: string;
  cidade: string;
  uf: string;
}
