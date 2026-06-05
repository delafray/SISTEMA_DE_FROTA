-- ════════════════════════════════════════════════════════════════════════
-- Motor do bot (modo classificador): idempotência + estado pendente.
-- Cole no SQL Editor do Supabase. Idempotente.
-- ════════════════════════════════════════════════════════════════════════

-- Dedup de mensagens (WhatsApp entrega at-least-once → não processar 2x).
CREATE TABLE IF NOT EXISTS bot_msgs_processadas (
  wamid         TEXT PRIMARY KEY,
  processado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE bot_msgs_processadas DISABLE ROW LEVEL SECURITY;
GRANT ALL ON bot_msgs_processadas TO anon, authenticated, service_role;

-- Estado pendente por telefone (desambiguação "1/2/3" e confirmação "sim/não").
-- Sobrevive ao serverless (lição B1) e expira (TTL) pra não travar o usuário.
CREATE TABLE IF NOT EXISTS bot_estado_pendente (
  telefone   TEXT PRIMARY KEY,
  tipo       TEXT NOT NULL,             -- 'desambiguacao' | 'confirmacao'
  dados      JSONB NOT NULL,
  expira_em  TIMESTAMPTZ NOT NULL,
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE bot_estado_pendente DISABLE ROW LEVEL SECURITY;
GRANT ALL ON bot_estado_pendente TO anon, authenticated, service_role;

-- Limpeza opcional (rode quando quiser, ou via cron):
-- DELETE FROM bot_msgs_processadas WHERE processado_em < now() - interval '2 days';
-- DELETE FROM bot_estado_pendente  WHERE expira_em     < now() - interval '1 day';
