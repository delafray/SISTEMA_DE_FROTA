-- ============================================================================
-- MIGRATION: Pedido — acréscimos e descontos (decisão do dono, 10/06/2026)
--
-- Total a receber do pedido = valor_pedido + acrescimos - descontos.
-- As parcelas (pedido_parcelas) são reconciliadas pra SEMPRE somar esse total
-- (lógica em src/lib/financeiro/parcelas.ts — cascata ao editar uma parcela).
--
-- Idempotente. O código degrada com segurança sem esta migration (campos
-- aparecem como "rode a migration" na tela de Financeiro por Cliente).
-- ============================================================================

ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS acrescimos NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS descontos  NUMERIC(12,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN pedidos.acrescimos IS 'Acréscimos sobre o valor do pedido (juros, taxas, extras) — total a receber = valor_pedido + acrescimos - descontos';
COMMENT ON COLUMN pedidos.descontos  IS 'Descontos sobre o valor do pedido — total a receber = valor_pedido + acrescimos - descontos';

-- Verificação:
-- SELECT column_name, data_type FROM information_schema.columns
--  WHERE table_name='pedidos' AND column_name IN ('acrescimos','descontos');
