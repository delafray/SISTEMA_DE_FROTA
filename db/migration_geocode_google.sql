-- Migration: geocode_google (cache + cota mensal da Google Geocoding API)
--
-- Estrategia (definida com o dono em 2026-06-01):
--   1. Toda resolucao le PRIMEIRO o cache (geocode_cache). Hit → usa, NAO chama
--      a API do Google (custo zero).
--   2. Miss → consome 1 da cota mensal (geocode_uso) de forma ATOMICA. Se ainda
--      ha cota (< limite, default 38000/mes), chama o Google e grava no cache.
--   3. Estourou a cota do mes → cai no fallback gratis (ViaCEP + escolher).
--
-- Contador GLOBAL da frota (uma conta Google so, por enquanto). Vira o mes → zera.
--
-- Rodar no Supabase de producao (SQL editor).

-- ─── Cache de geocoding (chave = endereco/consulta normalizada) ──────
create table if not exists public.geocode_cache (
  chave              text        primary key,   -- normalizado em geocodeCache.ts::chaveGeocode
  lat                numeric     not null,
  lng                numeric     not null,
  cep                text,
  logradouro         text,
  numero             text,
  bairro             text,
  cidade             text,
  uf                 text,
  precisao           text,                       -- location_type do Google (ROOFTOP/...)
  endereco_formatado text,
  fonte              text        not null default 'google',
  criado_em          timestamptz not null default now()
);

comment on table public.geocode_cache is
  'Cache de geocoding (Google). Lido antes de chamar a API — hit nao gera custo.';

-- ─── Contador mensal de chamadas reais ao Google ────────────────────
create table if not exists public.geocode_uso (
  mes           text        primary key,         -- 'YYYY-MM'
  total         integer     not null default 0,
  atualizado_em timestamptz not null default now()
);

comment on table public.geocode_uso is
  'Chamadas reais a Google Geocoding por mes (global da frota). Cap em geocodeCache.ts.';

-- ─── RPC atomica: consome 1 da cota SE houver folga ─────────────────
-- Incrementa o contador do mes apenas se total < limite, de forma atomica
-- (a-prova de concorrencia em serverless). Devolve se foi permitido + o total.
create or replace function public.consumir_geocode_cota(p_mes text, p_limite integer)
returns table(permitido boolean, total integer)
language plpgsql
as $$
declare
  v_total integer;
begin
  insert into public.geocode_uso (mes, total) values (p_mes, 0)
    on conflict (mes) do nothing;

  -- Alias `gu` + colunas qualificadas pra evitar ambiguidade com a coluna de
  -- saída `total` do RETURNS TABLE (erro 42702).
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

-- RLS: acesso so via service_role (API routes no backend). Sem policies anon.
alter table public.geocode_cache enable row level security;
alter table public.geocode_uso  enable row level security;

-- GRANTs: service_role tem BYPASSRLS mas AINDA precisa de GRANT de tabela —
-- sem isto, da "permission denied for table" (42501) e o Google nunca roda.
grant all privileges on table public.geocode_cache to service_role;
grant all privileges on table public.geocode_uso  to service_role;
grant execute on function public.consumir_geocode_cota(text, integer) to service_role;
