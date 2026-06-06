-- Contexto de conversa: o "caminhão atual" do papo (cache, não na IA).
-- Permite "quantos km ESSE caminhão tem?" depois de citar o leão. TTL 10 min.
-- Idempotente.
CREATE TABLE IF NOT EXISTS bot_contexto_conversa (
  telefone      TEXT PRIMARY KEY,
  veiculo_id    UUID,
  apelido       TEXT,
  expira_em     TIMESTAMPTZ NOT NULL,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE bot_contexto_conversa DISABLE ROW LEVEL SECURITY;
GRANT ALL ON bot_contexto_conversa TO anon, authenticated, service_role;
