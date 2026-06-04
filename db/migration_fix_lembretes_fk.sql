-- Corrige FK de lembretes.usuario_id para apontar a perfis(id)
-- em vez de auth.users(id), permitindo o join direto via PostgREST.
--
-- perfis.id = auth.users.id (mesmo UUID), então é equivalente funcionalmente.
-- A diferença é que PostgREST pode resolver perfis(nome) com a FK para perfis,
-- mas não consegue cruzar para a tabela pública "perfis" partindo de auth.users.

ALTER TABLE lembretes
  DROP CONSTRAINT IF EXISTS lembretes_usuario_id_fkey;

ALTER TABLE lembretes
  ADD CONSTRAINT lembretes_usuario_id_fkey
  FOREIGN KEY (usuario_id) REFERENCES perfis(id) ON DELETE CASCADE;

-- Mesma correção para ciente_por
ALTER TABLE lembretes
  DROP CONSTRAINT IF EXISTS lembretes_ciente_por_fkey;

ALTER TABLE lembretes
  ADD CONSTRAINT lembretes_ciente_por_fkey
  FOREIGN KEY (ciente_por) REFERENCES perfis(id) ON DELETE SET NULL;
