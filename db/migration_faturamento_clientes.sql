-- =============================================================================
-- migration_faturamento_clientes.sql — Agregação do Financeiro por Cliente
-- =============================================================================
-- A tela /faturamento baixava TODOS os pedidos + TODAS as parcelas da empresa
-- a cada abertura só pra montar o resumo por cliente (loadAll). Esta function
-- devolve o resumo pronto (uma linha por cliente), e a tela passou a carregar
-- os pedidos de cada cliente SOB DEMANDA (ao expandir, paginado).
--
-- Réplica exata da lógica que estava no cliente (src/app/(dashboard)/faturamento):
--   total do pedido   = valor + acréscimos - descontos (arredondado a 2 casas)
--   valor pago        = parcelado → soma das parcelas pagas; único → tudo ou nada
--   quitado           = parcelado → todas as parcelas pagas; único → pago
--   em atraso         = parcela vencida não paga; único não pago com fim previsto passado
--   p_hoje vem do CLIENTE (fuso do navegador), igual ao hojeISO() da tela.
--
-- Pré-requisito: db/migration_pedido_acrescimos_descontos.sql (colunas
-- acrescimos/descontos em pedidos).
--
-- Cliente: src/lib/financeiro/faturamentoClientes.ts (com fallback pro
-- comportamento antigo enquanto esta migration não tiver rodado).
--
-- Idempotente: CREATE OR REPLACE + GRANT.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.faturamento_clientes(p_empresa_id uuid, p_hoje date DEFAULT current_date)
RETURNS TABLE (
  cliente_id uuid,
  nome text,
  qtd bigint,
  qtd_pagos bigint,
  valor_total numeric,
  valor_pago numeric,
  valor_aberto numeric,
  valor_atrasado numeric
)
LANGUAGE sql
STABLE
AS $$
  WITH pars AS (
    SELECT pp.pedido_id,
           count(*)                                            AS qtd,
           count(*) FILTER (WHERE pp.pago)                     AS qtd_pagas,
           COALESCE(sum(pp.valor) FILTER (WHERE pp.pago), 0)   AS valor_pago,
           COALESCE(sum(pp.valor) FILTER (
             WHERE NOT pp.pago AND pp.vencimento IS NOT NULL AND pp.vencimento < p_hoje
           ), 0)                                               AS valor_vencido
    FROM public.pedido_parcelas pp
    WHERE pp.empresa_id = p_empresa_id
    GROUP BY pp.pedido_id
  ),
  ped AS (
    SELECT p.cliente_id,
           round((COALESCE(p.valor_pedido, 0) + COALESCE(p.acrescimos, 0) - COALESCE(p.descontos, 0))::numeric, 2) AS total,
           CASE
             WHEN pr.qtd > 0 THEN pr.valor_pago
             WHEN COALESCE(p.pago, false)
               THEN round((COALESCE(p.valor_pedido, 0) + COALESCE(p.acrescimos, 0) - COALESCE(p.descontos, 0))::numeric, 2)
             ELSE 0
           END AS valor_pago,
           CASE
             WHEN pr.qtd > 0 THEN pr.qtd_pagas = pr.qtd
             ELSE COALESCE(p.pago, false)
           END AS quitado,
           CASE
             WHEN pr.qtd > 0 THEN pr.valor_vencido
             WHEN NOT COALESCE(p.pago, false) AND p.data_fim_prevista IS NOT NULL AND p.data_fim_prevista < p_hoje
               THEN round((COALESCE(p.valor_pedido, 0) + COALESCE(p.acrescimos, 0) - COALESCE(p.descontos, 0))::numeric, 2)
             ELSE 0
           END AS valor_atrasado
    FROM public.pedidos p
    LEFT JOIN pars pr ON pr.pedido_id = p.id
    WHERE p.empresa_id = p_empresa_id
      AND p.valor_pedido IS NOT NULL
      AND p.valor_pedido > 0
      AND p.status NOT IN ('cancelada', 'cancelado')
  )
  SELECT ped.cliente_id,
         COALESCE(
           c.nome_fantasia, c.apelido,
           CASE WHEN ped.cliente_id IS NULL THEN 'Sem cliente / avulsos' ELSE 'Cliente' END
         )                                                    AS nome,
         count(*)::bigint                                     AS qtd,
         (count(*) FILTER (WHERE ped.quitado))::bigint        AS qtd_pagos,
         COALESCE(sum(ped.total), 0)::numeric                 AS valor_total,
         COALESCE(sum(ped.valor_pago), 0)::numeric            AS valor_pago,
         COALESCE(sum(ped.total - ped.valor_pago), 0)::numeric AS valor_aberto,
         COALESCE(sum(ped.valor_atrasado), 0)::numeric        AS valor_atrasado
  FROM ped
  LEFT JOIN public.clientes c ON c.id = ped.cliente_id
  GROUP BY ped.cliente_id, c.nome_fantasia, c.apelido
  ORDER BY valor_aberto DESC;
$$;

GRANT EXECUTE ON FUNCTION public.faturamento_clientes(uuid, date) TO anon, authenticated, service_role;
