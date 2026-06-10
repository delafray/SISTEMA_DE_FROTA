-- ============================================================================
-- migration_entregas_despacho_nullable.sql
-- Novo fluxo Pedido -> Despacho (2026-06-09): a entrega agora NASCE sem
-- caminhao/motorista/km (o vinculo acontece DEPOIS, na tela Despacho).
-- Hoje essas colunas sao NOT NULL no banco e o insert do formulario simples
-- de Novo Pedido FALHA em runtime. Este script destrava.
--
-- Idempotente (DROP NOT NULL em coluna ja nullable nao da erro).
-- Rodar no SQL editor do Supabase de producao.
-- ============================================================================

ALTER TABLE entregas ALTER COLUMN motorista_id DROP NOT NULL;
ALTER TABLE entregas ALTER COLUMN veiculo_id   DROP NOT NULL;
ALTER TABLE entregas ALTER COLUMN km_inicial   DROP NOT NULL;

COMMENT ON COLUMN entregas.motorista_id IS 'NULL ate o despacho (tela /despacho vincula caminhao+motorista ao pedido).';
COMMENT ON COLUMN entregas.veiculo_id   IS 'NULL ate o despacho.';
COMMENT ON COLUMN entregas.km_inicial   IS 'NULL ate o motorista iniciar (era NOT NULL no fluxo antigo).';

-- ─── Verificacao (deve rodar sem erro apos a migration) ─────────────────────
-- INSERT de teste mental: entregas com so empresa_id+pedido_id+status+origem+
-- destino agora e valido. Confirme com:
-- SELECT column_name, is_nullable FROM information_schema.columns
-- WHERE table_name='entregas' AND column_name IN ('motorista_id','veiculo_id','km_inicial');
