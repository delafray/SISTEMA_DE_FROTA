-- ============================================================================
-- MIGRATION: Importação em massa de notas (Fase 4 — PROPOSTA_PEDIDOS_DESPACHO §3.4)
-- Adiciona metadados de NFe nas entregas para dedupe por chave e rastreio.
-- Aplicar no SQL Editor do Supabase. Idempotente (IF NOT EXISTS).
-- ============================================================================

ALTER TABLE entregas ADD COLUMN IF NOT EXISTS nfe_chave  TEXT;            -- 44 dígitos da chave de acesso
ALTER TABLE entregas ADD COLUMN IF NOT EXISTS nfe_numero TEXT;            -- nNF (número da nota)
ALTER TABLE entregas ADD COLUMN IF NOT EXISTS nfe_valor  NUMERIC(12,2);   -- vNF (valor da nota — mercadoria, NÃO é o frete)

COMMENT ON COLUMN entregas.nfe_chave  IS 'Chave de acesso da NFe (44 dígitos) — usada para dedupe na importação em massa';
COMMENT ON COLUMN entregas.nfe_numero IS 'Número da NFe (nNF)';
COMMENT ON COLUMN entregas.nfe_valor  IS 'Valor total da NFe (vNF) — informativo; valor do frete fica em pedidos.valor_pedido';

-- Dedupe: índice para a checagem "essa chave já foi importada?" (feita no app antes do insert)
CREATE INDEX IF NOT EXISTS idx_entregas_nfe_chave ON entregas (nfe_chave) WHERE nfe_chave IS NOT NULL;

-- Verificação rápida pós-migration:
-- SELECT column_name, data_type FROM information_schema.columns
--  WHERE table_name = 'entregas' AND column_name LIKE 'nfe_%';
