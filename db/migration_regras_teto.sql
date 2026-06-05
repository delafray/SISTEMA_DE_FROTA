-- Regra: TETO de nível (decisão do dono, 05/06/2026).
-- O teto define até onde a célula da matriz pode ir (consultar → modificar → criar).
-- Ex: KM não se "cria" — só consultar/modificar. NULL = deriva do tipo (registrar→criar).
-- Cole no SQL Editor do Supabase. Idempotente.

ALTER TABLE regras ADD COLUMN IF NOT EXISTS teto TEXT;   -- consultar | modificar | criar | NULL

UPDATE regras SET teto = 'modificar'
  WHERE nome IN ('KM Motorista', 'KM Gestor') AND teto IS NULL;
