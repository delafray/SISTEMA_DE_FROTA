/**
 * Tipos do modulo de CEP — captura/consulta ViaCEP.
 * Veja PLANO_ROTEIRIZACAO.md secao 0.5.
 *
 * Tipos aqui sao BROWSER-SAFE — nao puxam Supabase nem outras deps server-only.
 * Use estes tipos no client.ts (browser fetch wrapper) e nos componentes UI.
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

/**
 * Resultado da consulta de CEP. Sempre tipado — funcoes que retornam isto
 * nunca lancam excecao. Use discriminated union (`if (ok)`) pra acessar
 * `endereco` em sucesso ou `motivo` em falha.
 */
export type ResultadoCEP =
  | { ok: true; cep: string; endereco: EnderecoCEP; fonte: 'cache' | 'api' }
  | { ok: false; motivo: 'cep_invalido' | 'nao_encontrado' | 'erro_rede' | 'timeout' };
