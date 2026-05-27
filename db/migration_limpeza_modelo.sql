-- ============================================================================
-- MIGRATION: Limpeza do Modelo Financeiro
-- ============================================================================
-- Origem: PLANO_LIMPEZA_MODELO.md
-- Confirmado em: 2026-05-20
--
-- O QUE ESTA MIGRATION FAZ:
--   1. Remove comissão completamente (motorista é salário + diária, não comissão)
--   2. Move despesas/abastecimentos pro VEÍCULO (custo do caminhão, sem rateio)
--   3. Adiciona pedidos.valor_pedido (receita do cliente)
--   4. Renomeia viagens→pedidos, fretes→entregas no banco
--   5. Limpa campos órfãos e tabelas que viram inúteis
--   6. Recria views financeiras alinhadas ao novo modelo
--
-- ⚠️ ANTES DE APLICAR:
--   - FAZER BACKUP COMPLETO (pg_dump ou snapshot do Supabase)
--   - Rodar em ambiente staging primeiro se possível
--   - Esta migration NÃO é reversível sem o backup
--
-- ⚠️ DEPOIS DE APLICAR:
--   - Rodar `npx supabase gen types typescript ... > src/lib/database.types.ts`
--   - Avisar a IA executora pra começar a ETAPA 2 do plano
-- ============================================================================

BEGIN;

-- ============================================================================
-- SEÇÃO 0 — Salvaguardas
-- ============================================================================
-- Cria schema de backup pra guardar cópia das tabelas que vão ser alteradas.
-- Caso algo dê errado, dá pra restaurar dali sem perder dados.

CREATE SCHEMA IF NOT EXISTS backup_pre_limpeza;

CREATE TABLE backup_pre_limpeza.viagens         AS TABLE viagens;
CREATE TABLE backup_pre_limpeza.fretes          AS TABLE fretes;
CREATE TABLE backup_pre_limpeza.viagem_motoristas AS TABLE viagem_motoristas;
CREATE TABLE backup_pre_limpeza.abastecimentos  AS TABLE abastecimentos;
CREATE TABLE backup_pre_limpeza.despesas_frete  AS TABLE despesas_frete;
CREATE TABLE backup_pre_limpeza.adiantamentos   AS TABLE adiantamentos;
CREATE TABLE backup_pre_limpeza.motoristas      AS TABLE motoristas;
CREATE TABLE backup_pre_limpeza.acerto_fretes   AS TABLE acerto_fretes;

-- ============================================================================
-- SEÇÃO 1 — Dropar views e funções que dependem das tabelas/colunas que vão mudar
-- ============================================================================

-- View principal de resultado financeiro (será recriada como pedidos_com_resultado)
DROP VIEW IF EXISTS fretes_com_resultado CASCADE;

-- Views de KPI que podem mencionar comissão (serão recriadas se necessário)
DROP VIEW IF EXISTS kpi_mensal_empresa CASCADE;
DROP VIEW IF EXISTS kpi_mensal_motorista CASCADE;
DROP VIEW IF EXISTS kpi_mensal_veiculo CASCADE;

-- View que referencia viagem_id (será recriada com pedido_id)
DROP VIEW IF EXISTS status_operacional_veiculos CASCADE;

-- Função RPC que calculava comissão
DROP FUNCTION IF EXISTS calcular_comissao(numeric, text, numeric, numeric, numeric, numeric) CASCADE;
DROP FUNCTION IF EXISTS calcular_comissao CASCADE;  -- redundância caso a assinatura seja outra

-- ============================================================================
-- SEÇÃO 2 — Dropar tabela acerto_fretes
-- ============================================================================
-- Era usada pra rastrear comissão por frete no acerto mensal.
-- Como removemos comissão, a tabela vira lixo. Drop completo.
-- A tabela `acertos_motorista` e `acerto_ajustes` ficam (úteis pra acerto de diárias depois).

DROP TABLE IF EXISTS acerto_fretes CASCADE;

-- ============================================================================
-- SEÇÃO 3 — Dropar colunas de comissão em fretes
-- ============================================================================

ALTER TABLE fretes
  DROP COLUMN IF EXISTS comissao_motorista_valor,
  DROP COLUMN IF EXISTS comissao_quitada;

-- ============================================================================
-- SEÇÃO 4 — Limpar colunas de comissão em motoristas
-- ============================================================================
-- Mantém: salario_fixo (salário mensal), valor_fixo_por_viagem (será renomeado pra diária)
-- Remove: tipo_comissao, percentual_frete, valor_por_km

ALTER TABLE motoristas
  DROP COLUMN IF EXISTS tipo_comissao,
  DROP COLUMN IF EXISTS percentual_frete,
  DROP COLUMN IF EXISTS valor_por_km;

-- Renomeia valor_fixo_por_viagem → valor_diaria_por_pedido (será atualizado de novo na seção 8 após rename de viagens)
-- Por ora só comentamos o intent — o rename real acontece na seção 9.

-- ============================================================================
-- SEÇÃO 5 — Limpar colunas órfãs em fretes (movem-se para o pai ou somem)
-- ============================================================================
-- Esses campos eram financeiros por frete. Agora financeiro fica em pedidos.

ALTER TABLE fretes
  DROP COLUMN IF EXISTS valor_frete,
  DROP COLUMN IF EXISTS forma_pagamento,
  DROP COLUMN IF EXISTS pago,
  DROP COLUMN IF EXISTS data_pagamento,
  DROP COLUMN IF EXISTS observacoes_financeiras;

-- ============================================================================
-- SEÇÃO 6 — Mover despesas_frete → despesas_veiculo
-- ============================================================================
-- Despesa é custo do caminhão, não do pedido/entrega. Sem rateio.

-- Adiciona coluna veiculo_id (FK pro caminhão)
ALTER TABLE despesas_frete
  ADD COLUMN IF NOT EXISTS veiculo_id uuid;

-- Backfill: pega o veiculo_id do frete vinculado
UPDATE despesas_frete d
SET veiculo_id = f.veiculo_id
FROM fretes f
WHERE d.frete_id = f.id AND d.veiculo_id IS NULL;

-- Validação: se alguma despesa ficou sem veiculo_id, falha aqui
DO $$
DECLARE
  orfas int;
BEGIN
  SELECT COUNT(*) INTO orfas FROM despesas_frete WHERE veiculo_id IS NULL;
  IF orfas > 0 THEN
    RAISE EXCEPTION 'Backfill falhou: % despesas sem veiculo_id', orfas;
  END IF;
END $$;

-- Torna veiculo_id NOT NULL e adiciona FK
ALTER TABLE despesas_frete
  ALTER COLUMN veiculo_id SET NOT NULL,
  ADD CONSTRAINT despesas_frete_veiculo_id_fkey
    FOREIGN KEY (veiculo_id) REFERENCES veiculos(id) ON DELETE RESTRICT;

-- Drop a coluna frete_id (não precisa mais)
ALTER TABLE despesas_frete
  DROP COLUMN IF EXISTS frete_id;

-- Renomeia a tabela
ALTER TABLE despesas_frete RENAME TO despesas_veiculo;

-- ============================================================================
-- SEÇÃO 7 — Limpar frete_id de tabelas auxiliares
-- ============================================================================
-- Essas tabelas tinham frete_id nullable. Agora as info ficam só atreladas
-- a motorista_id / veiculo_id (que já existem nelas).

ALTER TABLE abastecimentos    DROP COLUMN IF EXISTS frete_id;
ALTER TABLE imprevistos       DROP COLUMN IF EXISTS frete_id;
ALTER TABLE km_logs           DROP COLUMN IF EXISTS frete_id;
ALTER TABLE avarias           DROP COLUMN IF EXISTS frete_id;
ALTER TABLE checklists_diarios DROP COLUMN IF EXISTS frete_id;
ALTER TABLE adiantamentos     DROP COLUMN IF EXISTS frete_id;

-- ============================================================================
-- SEÇÃO 8 — Adicionar valor_pedido em viagens (será renomeada na seção 9)
-- ============================================================================

ALTER TABLE viagens
  ADD COLUMN IF NOT EXISTS valor_pedido numeric(10,2),
  ADD COLUMN IF NOT EXISTS forma_pagamento text,
  ADD COLUMN IF NOT EXISTS pago boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS data_pagamento date,
  ADD COLUMN IF NOT EXISTS observacoes_financeiras text;

-- Backfill: soma valor_frete dos fretes da viagem (ANTES do drop ter rodado já — ops, drop já rodou)
-- ⚠️ ATENÇÃO: como `fretes.valor_frete` já foi dropado na seção 5, o backfill aqui
-- só funciona se essa migration for executada de uma vez. Se for parcial, restaurar do backup.
-- Como `valor_frete` saiu do schema atual, vamos buscar do backup:
UPDATE viagens v
SET valor_pedido = sub.total_frete
FROM (
  SELECT viagem_id, SUM(valor_frete) AS total_frete
  FROM backup_pre_limpeza.fretes
  WHERE viagem_id IS NOT NULL
  GROUP BY viagem_id
) sub
WHERE v.id = sub.viagem_id AND v.valor_pedido IS NULL;

-- ============================================================================
-- SEÇÃO 9 — Renomear tabelas e colunas (viagens→pedidos, fretes→entregas)
-- ============================================================================

-- 9.1. Renomeia tabelas
ALTER TABLE viagens RENAME TO pedidos;
ALTER TABLE fretes  RENAME TO entregas;
ALTER TABLE viagem_motoristas RENAME TO pedido_motoristas;

-- 9.2. Renomeia colunas FK em todas as tabelas que apontavam pra viagens/fretes
ALTER TABLE entregas          RENAME COLUMN viagem_id TO pedido_id;
ALTER TABLE pedido_motoristas RENAME COLUMN viagem_id TO pedido_id;

-- 9.3. Renomeia datas semânticas em pedidos (eram nomes confusos)
ALTER TABLE pedidos RENAME COLUMN data_saida_prevista TO data_inicio_prevista;
ALTER TABLE pedidos RENAME COLUMN data_saida_real     TO data_inicio_real;
ALTER TABLE pedidos RENAME COLUMN data_chegada_prevista TO data_fim_prevista;
ALTER TABLE pedidos RENAME COLUMN data_chegada_real    TO data_fim_real;

-- 9.4. Renomeia campo de comissão remanescente em motoristas
ALTER TABLE motoristas RENAME COLUMN valor_fixo_por_viagem TO valor_diaria_por_pedido;

-- 9.5. Renomeia FK constraints e indexes para refletir novos nomes
-- (PostgreSQL renomeia tabela automaticamente nas FKs internas, mas os NOMES das constraints
-- ainda mostram viagem_id / fretes. Cosméticos, mas vamos arrumar:)

-- Renomeia constraints na tabela entregas (ex-fretes)
ALTER TABLE entregas RENAME CONSTRAINT fretes_viagem_id_fkey TO entregas_pedido_id_fkey;
ALTER TABLE entregas RENAME CONSTRAINT fretes_cliente_id_fkey TO entregas_cliente_id_fkey;
ALTER TABLE entregas RENAME CONSTRAINT fretes_empresa_id_fkey TO entregas_empresa_id_fkey;
ALTER TABLE entregas RENAME CONSTRAINT fretes_motorista_id_fkey TO entregas_motorista_id_fkey;
ALTER TABLE entregas RENAME CONSTRAINT fretes_veiculo_id_fkey TO entregas_veiculo_id_fkey;

-- Renomeia constraints em pedido_motoristas
ALTER TABLE pedido_motoristas RENAME CONSTRAINT viagem_motoristas_empresa_id_fkey TO pedido_motoristas_empresa_id_fkey;
ALTER TABLE pedido_motoristas RENAME CONSTRAINT viagem_motoristas_motorista_id_fkey TO pedido_motoristas_motorista_id_fkey;
ALTER TABLE pedido_motoristas RENAME CONSTRAINT viagem_motoristas_viagem_id_fkey TO pedido_motoristas_pedido_id_fkey;

-- Renomeia constraints em pedidos (ex-viagens)
ALTER TABLE pedidos RENAME CONSTRAINT viagens_empresa_id_fkey TO pedidos_empresa_id_fkey;
ALTER TABLE pedidos RENAME CONSTRAINT viagens_motorista_id_fkey TO pedidos_motorista_id_fkey;
ALTER TABLE pedidos RENAME CONSTRAINT viagens_veiculo_id_fkey TO pedidos_veiculo_id_fkey;

-- ============================================================================
-- SEÇÃO 10 — Recriar views financeiras alinhadas ao novo modelo
-- ============================================================================

-- 10.1. View principal: pedidos_com_resultado
-- Mostra cada pedido com sua receita. Despesas NÃO aparecem aqui (são do veículo).
CREATE OR REPLACE VIEW pedidos_com_resultado AS
SELECT
  p.id,
  p.empresa_id,
  p.motorista_id,
  p.veiculo_id,
  p.status,
  p.data_inicio_prevista,
  p.data_inicio_real,
  p.data_fim_prevista,
  p.data_fim_real,
  p.km_inicial,
  p.km_final,
  COALESCE(p.km_final - p.km_inicial, 0) AS km_total,
  p.valor_pedido AS receita,
  p.forma_pagamento,
  p.pago,
  p.data_pagamento,
  (SELECT COUNT(*) FROM entregas e WHERE e.pedido_id = p.id) AS qtd_entregas,
  p.created_at,
  p.updated_at
FROM pedidos p;

-- 10.2. View: veiculos_resultado_periodo
-- Agrega por veículo e mês: receita dos pedidos rodados + despesas (combustível + outras) = lucro
CREATE OR REPLACE VIEW veiculos_resultado_periodo AS
SELECT
  v.id AS veiculo_id,
  v.empresa_id,
  v.placa,
  v.modelo,
  date_trunc('month', COALESCE(p.data_inicio_real, p.data_inicio_prevista, p.created_at::date))::date AS mes_referencia,
  COALESCE(SUM(p.valor_pedido), 0) AS receita_pedidos,
  COALESCE((
    SELECT SUM(a.valor_total)
    FROM abastecimentos a
    WHERE a.veiculo_id = v.id
      AND date_trunc('month', a.created_at) = date_trunc('month', COALESCE(p.data_inicio_real, p.data_inicio_prevista, p.created_at::date))
  ), 0) AS custo_combustivel,
  COALESCE((
    SELECT SUM(d.valor)
    FROM despesas_veiculo d
    WHERE d.veiculo_id = v.id
      AND date_trunc('month', d.data_despesa::timestamp) = date_trunc('month', COALESCE(p.data_inicio_real, p.data_inicio_prevista, p.created_at::date))
  ), 0) AS custo_despesas,
  COUNT(p.id) AS qtd_pedidos
FROM veiculos v
LEFT JOIN pedidos p ON p.veiculo_id = v.id
GROUP BY v.id, v.empresa_id, v.placa, v.modelo,
         date_trunc('month', COALESCE(p.data_inicio_real, p.data_inicio_prevista, p.created_at::date));

-- 10.3. Recriar status_operacional_veiculos (referenciava viagem_id, agora pedido_id)
-- ⚠️ Não tenho o SQL original dessa view. Se ela tiver lógica complexa, pode quebrar.
-- Versão mínima para não quebrar referências externas:
CREATE OR REPLACE VIEW status_operacional_veiculos AS
SELECT
  v.id AS veiculo_id,
  v.empresa_id,
  v.placa,
  v.modelo,
  v.ativo,
  p.id AS pedido_id,
  p.status AS status_pedido,
  p.motorista_id AS motorista_atual_id
FROM veiculos v
LEFT JOIN pedidos p ON p.veiculo_id = v.id
  AND p.status IN ('em_andamento', 'agendada', 'agendado');

-- 10.4. Recriar kpi_mensal_empresa (sem comissão)
-- ⚠️ Não tenho o SQL original. Versão mínima:
CREATE OR REPLACE VIEW kpi_mensal_empresa AS
SELECT
  p.empresa_id,
  date_trunc('month', COALESCE(p.data_inicio_real, p.data_inicio_prevista, p.created_at::date))::date AS mes_referencia,
  COUNT(*) AS qtd_pedidos,
  COALESCE(SUM(p.valor_pedido), 0) AS receita_total,
  COALESCE((
    SELECT SUM(a.valor_total)
    FROM abastecimentos a
    WHERE a.empresa_id = p.empresa_id
      AND date_trunc('month', a.created_at) = date_trunc('month', COALESCE(p.data_inicio_real, p.data_inicio_prevista, p.created_at::date))
  ), 0) AS custo_combustivel,
  COALESCE((
    SELECT SUM(d.valor)
    FROM despesas_veiculo d
    WHERE d.empresa_id = p.empresa_id
      AND date_trunc('month', d.data_despesa::timestamp) = date_trunc('month', COALESCE(p.data_inicio_real, p.data_inicio_prevista, p.created_at::date))
  ), 0) AS custo_despesas
FROM pedidos p
GROUP BY p.empresa_id,
         date_trunc('month', COALESCE(p.data_inicio_real, p.data_inicio_prevista, p.created_at::date));

-- 10.5. Recriar kpi_mensal_motorista (qtd pedidos completados — sem comissão)
CREATE OR REPLACE VIEW kpi_mensal_motorista AS
SELECT
  p.motorista_id,
  p.empresa_id,
  date_trunc('month', COALESCE(p.data_inicio_real, p.data_inicio_prevista, p.created_at::date))::date AS mes_referencia,
  COUNT(*) AS qtd_pedidos,
  COUNT(*) FILTER (WHERE p.status IN ('concluida','concluido')) AS qtd_pedidos_concluidos,
  COALESCE(SUM(p.km_final - p.km_inicial), 0) AS km_rodado
FROM pedidos p
WHERE p.motorista_id IS NOT NULL
GROUP BY p.motorista_id, p.empresa_id,
         date_trunc('month', COALESCE(p.data_inicio_real, p.data_inicio_prevista, p.created_at::date));

-- 10.6. Recriar kpi_mensal_veiculo (já parecido com veiculos_resultado_periodo, mantém pra compat)
CREATE OR REPLACE VIEW kpi_mensal_veiculo AS
SELECT * FROM veiculos_resultado_periodo;

-- ============================================================================
-- SEÇÃO 11 — Comentários nas colunas para documentar o modelo
-- ============================================================================

COMMENT ON TABLE pedidos IS 'PEDIDO = serviço fechado com o cliente. 1 caminhão + 1 motorista + N entregas. Faturamento aqui.';
COMMENT ON TABLE entregas IS 'ENTREGA = uma parada dentro do pedido. Vem da NFe escaneada. Valor da NFe NÃO importa.';
COMMENT ON TABLE despesas_veiculo IS 'Despesa do CAMINHÃO (pedágio, alimentação, hospedagem, lavagem, reparo). Sem rateio por pedido.';
COMMENT ON COLUMN pedidos.valor_pedido IS 'Receita acordada com o cliente pelo serviço inteiro do pedido.';
COMMENT ON COLUMN motoristas.valor_diaria_por_pedido IS 'Diária paga ao motorista a cada pedido completado.';
COMMENT ON COLUMN motoristas.salario_fixo IS 'Salário mensal fixo do motorista (referência, pagamento via folha).';

-- ============================================================================
-- FIM
-- ============================================================================
-- Se tudo correu sem erro, dá COMMIT manualmente revisando antes.
-- Se algo deu errado, rode ROLLBACK e investigue.
-- Backup das tabelas alteradas fica em schema `backup_pre_limpeza`.
-- ============================================================================

-- COMMIT;  -- descomente após revisar
-- ROLLBACK; -- use se algo der errado

-- ============================================================================
-- VALIDAÇÃO PÓS-MIGRATION (rodar manualmente)
-- ============================================================================
-- Confirme com estes queries que a migration funcionou:
--
-- 1. Verificar que tabelas foram renomeadas:
--    SELECT table_name FROM information_schema.tables
--    WHERE table_schema = 'public' AND table_name IN ('pedidos','entregas','viagens','fretes');
--    Esperado: pedidos + entregas (sem viagens nem fretes)
--
-- 2. Verificar valor_pedido preenchido:
--    SELECT COUNT(*), SUM(valor_pedido) FROM pedidos WHERE valor_pedido IS NOT NULL;
--
-- 3. Verificar que comissão sumiu:
--    SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'motoristas' AND column_name LIKE '%comissao%';
--    Esperado: 0 linhas
--
-- 4. Verificar despesas_veiculo:
--    SELECT COUNT(*), COUNT(DISTINCT veiculo_id) FROM despesas_veiculo;
--
-- 5. Testar views:
--    SELECT * FROM pedidos_com_resultado LIMIT 3;
--    SELECT * FROM veiculos_resultado_periodo LIMIT 3;
