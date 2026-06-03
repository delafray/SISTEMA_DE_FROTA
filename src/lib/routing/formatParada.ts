/**
 * Formatadores de endereço/horário de uma parada — PUROS e testáveis.
 *
 * Centraliza os templates de string que estavam repetidos inline na tela do
 * motorista (card da próxima parada, lista, bottom sheet, modal de encaminhar).
 */

import type { EnderecoParada, JanelaHorario } from './types';

/**
 * Linha da rua: "Logradouro, 104" (com CEP opcional: "... - CEP 01310100").
 * Sem logradouro → "(sem rua)". Número/CEP ausentes são omitidos.
 */
export function formatarRua(e: EnderecoParada, opts?: { cep?: boolean }): string {
  let s = e.logradouro || '(sem rua)';
  if (e.numero) s += `, ${e.numero}`;
  if (opts?.cep && e.cep) s += ` - CEP ${e.cep}`;
  return s;
}

/** "Bairro, Cidade/UF" (bairro omitido quando ausente). */
export function formatarBairroCidade(e: EnderecoParada): string {
  const cidadeUf = `${e.cidade ?? ''}/${e.uf ?? ''}`;
  return e.bairro ? `${e.bairro}, ${cidadeUf}` : cidadeUf;
}

/** "09:00–12:00 / 14:00–18:00". Vazio ('') quando não há janelas. */
export function formatarJanelas(janelas: JanelaHorario | null | undefined): string {
  if (!janelas || janelas.length === 0) return '';
  return janelas.map((j) => `${j[0]}–${j[1]}`).join(' / ');
}
