CREATE TABLE IF NOT EXISTS lembretes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  usuario_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  texto        TEXT NOT NULL,
  origem       TEXT NOT NULL DEFAULT 'whatsapp', -- 'whatsapp' | 'painel'
  criado_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
  ciente_em    TIMESTAMPTZ,
  ciente_por   UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS lembretes_empresa_pendente
  ON lembretes (empresa_id, criado_em DESC)
  WHERE ciente_em IS NULL;

ALTER TABLE lembretes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gestor vê lembretes da empresa" ON lembretes
  FOR SELECT USING (
    empresa_id IN (
      SELECT empresa_id FROM usuario_empresas
      WHERE usuario_id = auth.uid()
      AND role IN ('master', 'gestor')
    )
  );

CREATE POLICY "gestor cria lembrete" ON lembretes
  FOR INSERT WITH CHECK (
    empresa_id IN (
      SELECT empresa_id FROM usuario_empresas
      WHERE usuario_id = auth.uid()
      AND role IN ('master', 'gestor')
    )
  );

CREATE POLICY "gestor dá ciente" ON lembretes
  FOR UPDATE USING (
    empresa_id IN (
      SELECT empresa_id FROM usuario_empresas
      WHERE usuario_id = auth.uid()
      AND role IN ('master', 'gestor')
    )
  );

-- service_role (usado pelo bot WhatsApp) pode inserir
GRANT INSERT, SELECT, UPDATE ON lembretes TO service_role;
