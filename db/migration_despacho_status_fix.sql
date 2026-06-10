-- ============================================================================
-- migration_despacho_status_fix.sql   (2026-06-10)
--
-- PROBLEMA (erro real ao CONFIRMAR DESPACHO em produção):
--   A tabela `pedidos` tem o CHECK `viagens_status_check`, que só aceita as
--   formas FEMININAS do status: agendada / em_andamento / concluida / cancelada.
--   O PostgreSQL RE-AVALIA o CHECK em QUALQUER UPDATE da linha — mesmo quando o
--   update não mexe na coluna `status`. Pedidos antigos (ou criados antes do
--   commit 2d5d130) ficaram com status MASCULINO 'agendado'. Quando o Despacho
--   tentava gravar veiculo_id/motorista_id nessas linhas, o CHECK reprovava:
--     ERROR: new row for relation "pedidos" violates check constraint "viagens_status_check"
--
-- O código do Despacho já foi corrigido para NORMALIZAR o status para a forma
-- feminina no próprio update (funciona mesmo SEM rodar este SQL). Este script
-- limpa os dados antigos e torna a constraint TOLERANTE aos dois gêneros, pra
-- nunca mais quebrar.
--
-- SEM TRAVA: idempotente. Rodar no SQL editor do Supabase de PRODUÇÃO.
-- NÃO altera nada além de `pedidos.status` e da constraint de status.
-- ============================================================================

-- 1) Normaliza os status existentes para a forma feminina (canônica).
UPDATE pedidos SET status = 'agendada'  WHERE status = 'agendado';
UPDATE pedidos SET status = 'concluida' WHERE status = 'concluido';
UPDATE pedidos SET status = 'cancelada' WHERE status = 'cancelado';

-- 2) Torna a constraint tolerante (aceita os dois gêneros) — defensivo.
--    Remove a antiga (seja qual for o nome herdado) e recria.
DO $$
BEGIN
  -- nome herdado de quando a tabela se chamava "viagens"
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'viagens_status_check'
             AND conrelid = 'pedidos'::regclass) THEN
    ALTER TABLE pedidos DROP CONSTRAINT viagens_status_check;
  END IF;
  -- caso já tenha sido renomeada
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pedidos_status_check'
             AND conrelid = 'pedidos'::regclass) THEN
    ALTER TABLE pedidos DROP CONSTRAINT pedidos_status_check;
  END IF;
END $$;

ALTER TABLE pedidos
  ADD CONSTRAINT pedidos_status_check
  CHECK (status IN (
    'agendada','agendado',
    'em_andamento',
    'concluida','concluido',
    'cancelada','cancelado'
  ));

-- ─── Verificação ────────────────────────────────────────────────────────────
-- SELECT status, count(*) FROM pedidos GROUP BY status ORDER BY 2 DESC;
-- (esperado: só formas femininas após o passo 1)
