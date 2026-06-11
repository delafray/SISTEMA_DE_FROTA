-- ═══════════════════════════════════════════════════════════════════════════
-- FIX: triggers-fantasma do modelo antigo (fretes/comissão) — 11/06/2026
--
-- Achados na auditoria do schema (gerado do banco real):
--   1. bloquear_inativacao_motorista/veiculo consultavam FROM fretes (tabela
--      renomeada em maio) → INATIVAR motorista/veículo dava erro de banco.
--      A proteção é legítima → REESCRITA apontando para pedidos.
--   2. calcular_comissao_snapshot chamava calcular_comissao() (não existe) ao
--      concluir entrega → erro. Comissão saiu do modelo (diária por pedido)
--      → trigger e função REMOVIDOS.
--
-- Idempotente. Rodar no SQL Editor / MCP do banco de produção.
-- Depois de rodar: re-gerar db/schema_base_complemento.sql (db/gerar_schema_complemento.sql).
-- ═══════════════════════════════════════════════════════════════════════════

-- 1a) Motorista: bloqueio de inativação agora olha PEDIDOS em andamento
CREATE OR REPLACE FUNCTION public.bloquear_inativacao_motorista()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD.ativo = true AND NEW.ativo = false THEN
    IF EXISTS (
      SELECT 1 FROM pedidos
       WHERE motorista_id = NEW.id
         AND status IN ('em_andamento')
    ) THEN
      RAISE EXCEPTION 'Motorista possui pedido em andamento. Conclua ou cancele o pedido antes de inativar.';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- 1b) Veículo: idem
CREATE OR REPLACE FUNCTION public.bloquear_inativacao_veiculo()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD.ativo = true AND NEW.ativo = false THEN
    IF EXISTS (
      SELECT 1 FROM pedidos
       WHERE veiculo_id = NEW.id
         AND status IN ('em_andamento')
    ) THEN
      RAISE EXCEPTION 'Veículo possui pedido em andamento. Conclua ou cancele o pedido antes de inativar.';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- 2) Comissão saiu do modelo → derruba trigger e função
DROP TRIGGER IF EXISTS trigger_calcular_comissao_snapshot ON public.entregas;
DROP FUNCTION IF EXISTS public.calcular_comissao_snapshot();

-- Verificação (deve retornar 0 linhas):
-- SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--  WHERE n.nspname='public' AND pg_get_functiondef(p.oid) ILIKE '%from fretes%';
