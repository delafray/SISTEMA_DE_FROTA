-- ════════════════════════════════════════════════════════════════════════
-- ALOCAÇÕES — vínculo motorista↔veículo com HISTÓRICO (decisão do dono, 05/06/2026)
-- Padrão de mercado (frota/TMS): a relação muda no tempo, então é uma tabela de
-- alocação. O "atual" = a linha com `fim` vazio pra aquele veículo.
-- - status operacional → tem motorista_id (1 responsável por vez)
-- - status parado/manutencao/inativo → motorista_id NULL (vínculo vago)
-- SEM TRAVA: sem RLS, sem FK. Cole no SQL Editor do Supabase. Idempotente.
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS alocacoes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  veiculo_id   UUID NOT NULL,
  motorista_id UUID,                                  -- NULL quando não-operacional
  status       TEXT NOT NULL DEFAULT 'operacional',   -- operacional | parado | manutencao | inativo
  km_evento    INTEGER,                               -- KM do veículo no momento do evento (hand-off)
  inicio       TIMESTAMPTZ NOT NULL DEFAULT now(),    -- data/hora do vínculo (pode ser retroativa)
  fim          TIMESTAMPTZ,                           -- NULL = vínculo ATUAL
  observacao   TEXT,
  criado_em    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 1 vínculo atual por veículo (fim IS NULL). Índice parcial garante e acelera o "atual".
CREATE UNIQUE INDEX IF NOT EXISTS alocacoes_veiculo_atual
  ON alocacoes (veiculo_id) WHERE fim IS NULL;
CREATE INDEX IF NOT EXISTS alocacoes_veiculo ON alocacoes (veiculo_id, inicio DESC);
CREATE INDEX IF NOT EXISTS alocacoes_motorista ON alocacoes (motorista_id, inicio DESC);

ALTER TABLE alocacoes DISABLE ROW LEVEL SECURITY;
GRANT ALL ON alocacoes TO anon, authenticated, service_role;
