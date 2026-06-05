-- Alocações: KM de devolução + Realtime (decisão do dono, 05/06/2026).
-- km_fim = KM no momento que o motorista DEVOLVEU o veículo (fecha a alocação).
-- Realtime em veiculos/alocacoes → a tela do veículo atualiza sozinha quando o
-- KM muda (sistema, zap ou app). Cole no SQL Editor do Supabase. Idempotente.

ALTER TABLE alocacoes ADD COLUMN IF NOT EXISTS km_fim INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='veiculos') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE veiculos;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='alocacoes') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE alocacoes;
  END IF;
END $$;
ALTER TABLE alocacoes REPLICA IDENTITY FULL;
