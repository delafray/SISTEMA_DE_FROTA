-- ─────────────────────────────────────────────────────────────────────
-- Migration: tabela bot_metricas
--
-- Registra cada turno do bot WhatsApp: tokens, latencia, tools chamadas,
-- custo estimado. Permite dashboard semanal + alertas de regressao.
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS bot_metricas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telefone text NOT NULL,
  empresa_id uuid,
  modo text NOT NULL CHECK (modo IN ('fast_path', 'gemini_texto', 'gemini_audio')),
  fast_path_matcher text,
  modelo text,
  tokens_in int,
  tokens_out int,
  cached_tokens int,
  tools_chamadas text[],
  tool_rounds int,
  latency_ms int,
  sucesso boolean NOT NULL DEFAULT true,
  erro text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_metricas_created ON bot_metricas (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_metricas_empresa ON bot_metricas (empresa_id, created_at DESC);

GRANT ALL ON TABLE bot_metricas TO service_role;
