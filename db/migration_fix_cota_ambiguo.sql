-- Migration CORRETIVA (rodar no Supabase de prod — SQL editor).
--
-- Conserta erro 42702 "column reference \"total\" is ambiguous" na RPC
-- consumir_geocode_cota: `total` era ao mesmo tempo a coluna da tabela
-- geocode_uso E a coluna de saída do RETURNS TABLE. Dentro do UPDATE
-- (total = total + 1 / where total < ... / returning total) o Postgres não
-- sabia a qual se referia. Solução: alias da tabela (gu) e qualificar todas
-- as referências de coluna com gu.total.
--
-- create or replace = idempotente, pode rodar quantas vezes quiser.

create or replace function public.consumir_geocode_cota(p_mes text, p_limite integer)
returns table(permitido boolean, total integer)
language plpgsql
as $$
declare
  v_total integer;
begin
  insert into public.geocode_uso (mes, total) values (p_mes, 0)
    on conflict (mes) do nothing;

  update public.geocode_uso gu
    set total = gu.total + 1, atualizado_em = now()
    where gu.mes = p_mes and gu.total < p_limite
    returning gu.total into v_total;

  if found then
    return query select true, v_total;
  else
    select gu.total into v_total from public.geocode_uso gu where gu.mes = p_mes;
    return query select false, coalesce(v_total, p_limite);
  end if;
end;
$$;

grant execute on function public.consumir_geocode_cota(text, integer) to service_role;
