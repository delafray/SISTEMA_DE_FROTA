-- Qualquer telefone cadastrado (motorista OU gestor) pode criar lembrete.
-- Solta a exigência de usuario_id (motorista pode não ter perfil vinculado)
-- e guarda nome + telefone de quem criou direto, pra atribuição sempre funcionar.

ALTER TABLE lembretes ALTER COLUMN usuario_id DROP NOT NULL;

ALTER TABLE lembretes
  ADD COLUMN IF NOT EXISTS criado_por_nome     TEXT,
  ADD COLUMN IF NOT EXISTS criado_por_telefone TEXT;

COMMENT ON COLUMN lembretes.criado_por_nome     IS 'Nome de quem criou (motorista ou gestor) — atribuição independente de perfil';
COMMENT ON COLUMN lembretes.criado_por_telefone IS 'Telefone WhatsApp de quem criou';
