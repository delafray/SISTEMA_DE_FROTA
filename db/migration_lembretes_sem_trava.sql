-- ════════════════════════════════════════════════════════════════════════
-- LEMBRETES SEM TRAVA — qualquer um que falar com o bot, o bot anota. PRONTO.
-- Remove TODA dependência pra gravar uma nota: empresa, usuário, motorista, RLS.
-- Decisão do dono (05/06/2026): "não tem de ter regra alguma, depois eu coloco".
--
-- Como rodar: cole TUDO no SQL Editor do Supabase (projeto ltfthfbounngaubwsxfw)
-- e execute. Idempotente — pode rodar mais de uma vez sem quebrar.
-- Pra REVERTER as travas depois, ver o bloco comentado no fim.
-- ════════════════════════════════════════════════════════════════════════

-- 1) empresa_id e usuario_id deixam de ser obrigatórios.
ALTER TABLE lembretes ALTER COLUMN empresa_id DROP NOT NULL;
ALTER TABLE lembretes ALTER COLUMN usuario_id DROP NOT NULL;

-- 2) Derruba TODAS as foreign keys da tabela (empresa, usuario, ciente_por).
--    Sem FK, um id inexistente/errado nunca mais bloqueia o insert.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'lembretes'::regclass AND contype = 'f'
  LOOP
    EXECUTE format('ALTER TABLE lembretes DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

-- 3) Desliga RLS e remove todas as policies (nenhuma regra de quem lê/escreve).
ALTER TABLE lembretes DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "gestor vê lembretes da empresa" ON lembretes;
DROP POLICY IF EXISTS "gestor cria lembrete"           ON lembretes;
DROP POLICY IF EXISTS "gestor dá ciente"               ON lembretes;

-- 4) Acesso total pra qualquer papel (anon, logado, service_role).
GRANT ALL ON lembretes TO anon, authenticated, service_role;

-- ════════════════════════════════════════════════════════════════════════
-- PARA RECOLOCAR AS TRAVAS DEPOIS (descomentar e ajustar quando quiser regras):
-- ALTER TABLE lembretes ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE lembretes ADD CONSTRAINT lembretes_empresa_id_fkey
--   FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE;
-- ALTER TABLE lembretes ALTER COLUMN empresa_id SET NOT NULL;
-- (recriar as policies do migration_lembretes.sql)
-- ════════════════════════════════════════════════════════════════════════
