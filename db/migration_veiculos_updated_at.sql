-- Gatilho que mantém veiculos.updated_at automaticamente em qualquer UPDATE.
-- Defesa extra: o lock do bot agora é por km_atual (valor), mas updated_at correto
-- ajuda outros fluxos (dashboard, CRUD) e auditoria. Idempotente.
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_veiculos_updated_at ON veiculos;
CREATE TRIGGER trg_veiculos_updated_at
  BEFORE UPDATE ON veiculos
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
