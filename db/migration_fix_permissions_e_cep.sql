-- Migration CORRETIVA (rodar no Supabase de prod — SQL editor).
--
-- Conserta 2 erros vistos no log de prod em 2026-06-01:
--
-- 1. "permission denied for table" (42501) em geocode_cache, geocode_uso e
--    coordenadas_aprendidas. O service_role tem BYPASSRLS, mas isso NAO dispensa
--    o GRANT de tabela — sem ele, toda leitura/escrita e negada e o Google nunca
--    e chamado (cota_rpc_failed → permitido:false → fallback Nominatim → pino
--    vermelho). As tabelas antigas (notas_capturadas etc) ja tinham os grants;
--    as novas, criadas por SQL cru, nao receberam.
--
-- 2. 'violates check constraint "notas_cep_formato"' — o CEP virou OPCIONAL no
--    código (rua com vários CEPs grava ''), mas o CHECK exige 8 dígitos e rejeita
--    o ''. Relaxa pra aceitar vazio OU 8 dígitos.

-- ─── 1. GRANTs pro service_role (PostgREST usa essa role com a service key) ──
grant all privileges on table public.geocode_cache            to service_role;
grant all privileges on table public.geocode_uso              to service_role;
grant all privileges on table public.coordenadas_aprendidas   to service_role;
grant execute on function public.consumir_geocode_cota(text, integer) to service_role;

-- ─── 2. CEP opcional: aceita '' (sem CEP) OU 8 dígitos ──────────────────────
alter table public.notas_capturadas drop constraint if exists notas_cep_formato;
alter table public.notas_capturadas
  add constraint notas_cep_formato check (cep = '' or cep ~ '^[0-9]{8}$');
