/**
 * Número do pedido — AAAA.SSSS (sequência anual a partir de 1001).
 * Gerado pelo banco (db/migration_numero_pedido.sql); aqui só formatação.
 */

/** Rótulo do pedido: o número oficial ("2026.1003"); se faltar (pré-migration
 *  ou linha antiga sem backfill), cai pro id curto ("#a1b2c3d4"). */
export function rotuloPedido(numero: string | null | undefined, id: string): string {
  return numero?.trim() ? numero : `#${id.slice(0, 8)}`;
}
