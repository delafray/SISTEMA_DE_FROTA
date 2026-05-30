-- ─────────────────────────────────────────────────────────────────────
-- Migration: tabela whatsapp_historico
--
-- Persiste o historico de conversa do bot WhatsApp. Substitui o Map em
-- memoria que perdia tudo no cold start da Vercel serverless (bug B1 do
-- BOT_FRAMEWORK.md).
--
-- Estrategia:
--   - Chave por telefone (1 telefone = 1 conversa)
--   - role: 'user' | 'model'
--   - metadata jsonb pra flags/tool calls/proposta_id futuros
--   - Limpeza periodica de registros antigos (recomendado cron 30 dias)
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS whatsapp_historico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telefone text NOT NULL,
  role text NOT NULL CHECK (role IN ('user', 'model')),
  texto text NOT NULL,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index principal: SEMPRE lemos por telefone + ordenamos por created_at DESC
CREATE INDEX IF NOT EXISTS idx_hist_telefone_created
  ON whatsapp_historico (telefone, created_at DESC);

-- Permissoes pro service_role (API server-side)
GRANT ALL ON TABLE whatsapp_historico TO service_role;

-- Opcional: limpeza automatica de registros > 30 dias
-- (Supabase tem extensao pg_cron disponivel)
-- SELECT cron.schedule('limpar_historico_whatsapp', '0 3 * * *', $$
--   DELETE FROM whatsapp_historico WHERE created_at < now() - interval '30 days';
-- $$);
