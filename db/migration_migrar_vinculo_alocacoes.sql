-- Opção A (unificar): migra os vínculos ATUAIS de `motorista_veiculo` (ativos)
-- para `alocacoes`, virando a fonte única. Idempotente: só cria se o veículo
-- ainda não tem alocação atual (fim IS NULL). Rode DEPOIS de migration_alocacoes.sql.
-- Cole no SQL Editor do Supabase.

INSERT INTO alocacoes (veiculo_id, motorista_id, status, inicio)
SELECT DISTINCT ON (mv.veiculo_id)
  mv.veiculo_id, mv.motorista_id, 'operacional', now()
FROM motorista_veiculo mv
WHERE mv.veiculo_id IS NOT NULL
  AND mv.ativo = true
  AND NOT EXISTS (SELECT 1 FROM alocacoes a WHERE a.veiculo_id = mv.veiculo_id AND a.fim IS NULL)
ORDER BY mv.veiculo_id;
