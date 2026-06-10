-- ============================================================================
-- MIGRATION: Pedido — empresa de faturamento + parcelas com datas/valores
-- (decisões do dono em 10/06/2026: "pedido tratado dentro do pedido")
--
-- 1. pedidos.empresa_faturamento_id — qual CNPJ fatura este pedido.
--    Campo SEPARADO do empresa_id de propósito: NÃO muda o escopo/visibilidade
--    do pedido (transferência entre empresas continua sendo outro mecanismo).
-- 2. pedido_parcelas — parcelas do pagamento com valor e vencimento; o
--    A Receber passa a dar baixa POR PARCELA. Pedido sem parcelas continua
--    funcionando como hoje (pago único via pedidos.pago).
--
-- Padrão SEM TRAVA do projeto: sem RLS, GRANT ALL. Idempotente.
-- ============================================================================

ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS empresa_faturamento_id UUID;
COMMENT ON COLUMN pedidos.empresa_faturamento_id IS 'CNPJ (empresas.id) que fatura o pedido — informativo, não altera o escopo do pedido';

CREATE TABLE IF NOT EXISTS pedido_parcelas (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id      UUID NOT NULL,
  empresa_id     UUID NOT NULL,
  numero         INTEGER NOT NULL,            -- 1, 2, 3...
  valor          NUMERIC(12,2) NOT NULL,
  vencimento     DATE,
  pago           BOOLEAN NOT NULL DEFAULT false,
  data_pagamento DATE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pedido_parcelas_pedido  ON pedido_parcelas (pedido_id, numero);
CREATE INDEX IF NOT EXISTS idx_pedido_parcelas_empresa ON pedido_parcelas (empresa_id, pago, vencimento);

GRANT ALL PRIVILEGES ON TABLE public.pedido_parcelas TO service_role, authenticated, anon;

COMMENT ON TABLE pedido_parcelas IS 'Parcelas do pagamento do pedido (A Receber dá baixa por parcela). Pedido sem linhas aqui = pagamento único (pedidos.pago).';

-- Verificação:
-- SELECT column_name, data_type FROM information_schema.columns
--  WHERE table_name IN ('pedido_parcelas') OR (table_name='pedidos' AND column_name='empresa_faturamento_id');
