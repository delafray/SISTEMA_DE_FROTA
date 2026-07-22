-- =============================================================================
-- migration_kpis_financeiro.sql — Somas de KPI agregadas no SERVIDOR
-- =============================================================================
-- Regra das listagens (09/06/2026): telas que crescem não podem baixar a tabela
-- inteira. As somas de KPI de abastecimentos, adiantamentos e entregas (receita
-- de pedidos) faziam loadAll de TODAS as linhas só pra somar no cliente.
-- Estas functions devolvem as somas prontas em uma chamada.
--
-- Cliente: src/lib/financeiro/kpis.ts (com fallback pro loadAll antigo
-- enquanto esta migration não tiver rodado).
--
-- Idempotente: CREATE OR REPLACE + GRANT (re-rodar é seguro).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.somas_abastecimentos(p_empresa_id uuid)
RETURNS TABLE (qtd bigint, litros numeric, valor_total numeric)
LANGUAGE sql
STABLE
AS $$
  SELECT count(*)::bigint,
         COALESCE(sum(a.litros), 0)::numeric,
         COALESCE(sum(a.valor_total), 0)::numeric
  FROM public.abastecimentos a
  WHERE a.empresa_id = p_empresa_id;
$$;

CREATE OR REPLACE FUNCTION public.somas_adiantamentos(p_empresa_id uuid)
RETURNS TABLE (solicitado numeric, aprovado numeric, pendente numeric, prestado numeric)
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(sum(ad.valor), 0)::numeric,
         COALESCE(sum(ad.valor) FILTER (WHERE ad.status = 'aprovado'), 0)::numeric,
         COALESCE(sum(ad.valor) FILTER (WHERE ad.status = 'pendente'), 0)::numeric,
         COALESCE(sum(ad.valor) FILTER (WHERE ad.status = 'prestado'), 0)::numeric
  FROM public.adiantamentos ad
  WHERE ad.empresa_id = p_empresa_id;
$$;

-- Receita dos pedidos concluídos (KPIs da tela Entregas). Status tem as duas
-- grafias no banco ('concluido'/'concluida'), igual ao .or() que a tela usava.
CREATE OR REPLACE FUNCTION public.somas_pedidos_receita(p_empresa_id uuid)
RETURNS TABLE (receita_concluidos numeric, receita_pagos numeric)
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(sum(p.valor_pedido) FILTER (WHERE p.status IN ('concluido','concluida')), 0)::numeric,
         COALESCE(sum(p.valor_pedido) FILTER (WHERE p.status IN ('concluido','concluida') AND p.pago), 0)::numeric
  FROM public.pedidos p
  WHERE p.empresa_id = p_empresa_id;
$$;

GRANT EXECUTE ON FUNCTION public.somas_abastecimentos(uuid)   TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.somas_adiantamentos(uuid)    TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.somas_pedidos_receita(uuid)  TO anon, authenticated, service_role;
