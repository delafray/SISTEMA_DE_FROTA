-- "Foto" da empresa do MOTORISTA no momento do frete — pra detectar "emprestado"
-- (frete da empresa do caminhão, mas motorista de outra empresa) de forma correta
-- no histórico, mesmo que o motorista mude de empresa depois. Idempotente.
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS empresa_motorista_id UUID;

-- Preenche os fretes já existentes com a empresa atual do motorista (melhor esforço).
UPDATE pedidos p SET empresa_motorista_id = m.empresa_id
FROM motoristas m
WHERE p.motorista_id = m.id AND p.empresa_motorista_id IS NULL;
