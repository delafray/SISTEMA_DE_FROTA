-- ════════════════════════════════════════════════════════════════════════
-- LEMBRETE_NOTAS — histórico de providências do lembrete (pedido do dono 11/06/2026).
-- "Ciente" não pode só sumir: ao dar ciente o gestor anota a providência que
-- tomou/vai tomar e escolhe ocultar ou manter na tela. Cada anotação vira uma
-- linha aqui (nunca sobrescreve a anterior).
--
-- Como rodar: cole TUDO no SQL Editor do Supabase e execute.
-- Idempotente — pode rodar mais de uma vez sem quebrar.
-- Depois de rodar: regenerar os types (supabase gen types) e, se for atualizar
-- o kit de implantação, re-gerar db/schema_base_completo.sql.
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS lembrete_notas (
  id          uuid        NOT NULL DEFAULT gen_random_uuid(),
  lembrete_id uuid        NOT NULL,
  nota        text        NOT NULL,
  criado_em   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lembrete_notas_pkey PRIMARY KEY (id),
  CONSTRAINT lembrete_notas_lembrete_id_fkey
    FOREIGN KEY (lembrete_id) REFERENCES lembretes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS lembrete_notas_lembrete
  ON lembrete_notas (lembrete_id, criado_em);

-- Mesmo regime SEM TRAVA dos lembretes (decisão do dono 05/06): RLS off + acesso
-- total. NÃO recolocar travas sem o dono pedir.
ALTER TABLE lembrete_notas DISABLE ROW LEVEL SECURITY;
GRANT ALL ON lembrete_notas TO anon, authenticated, service_role;
