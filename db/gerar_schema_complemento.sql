-- ═══════════════════════════════════════════════════════════════════════════
-- GERADOR DO COMPLEMENTO DO SCHEMA — Funções + Triggers + GRANTs
--
-- POR QUÊ: a auditoria de db/schema_base_completo.sql (11/06) encontrou
-- 0 funções, 0 triggers e 0 GRANTs — sem eles um banco novo quebra:
--   · sem trigger propagar_km_para_veiculo → KM do zap não chega no veículo
--   · sem RPCs (ctx_incrementar_turns, update_session_atomic, cota geocode) → bot quebra
--   · sem GRANTs (com RLS off) → o PAINEL INTEIRO não lê nada ("RLS silencioso")
--
-- COMO USAR (IA via MCP):
--   1. Executar esta query no banco de PRODUÇÃO.
--   2. Concatenar a coluna `stmt` na ordem retornada (quebra de linha dupla).
--   3. Salvar como db/schema_base_complemento.sql
--   4. Na implantação, rodar DEPOIS do schema_base_completo.sql.
-- ═══════════════════════════════════════════════════════════════════════════

WITH secoes AS (

  SELECT 0 AS ord, 0::bigint AS sub,
    '-- COMPLEMENTO DO SCHEMA BASE — funções, triggers e GRANTs (gerado da produção em ' || now()::date || ')' || chr(10) ||
    '-- Rodar DEPOIS de db/schema_base_completo.sql.' AS stmt

  -- 1) Funções do projeto (exclui as que pertencem a extensões)
  UNION ALL
  SELECT 1, row_number() OVER (ORDER BY p.oid),
    pg_get_functiondef(p.oid) || ';'
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
  WHERE p.prokind = 'f'
    AND NOT EXISTS (SELECT 1 FROM pg_depend dep WHERE dep.objid = p.oid AND dep.deptype = 'e')

  -- 2) Triggers (as funções acima precisam existir antes)
  UNION ALL
  SELECT 2, row_number() OVER (ORDER BY t.oid),
    pg_get_triggerdef(t.oid) || ';'
  FROM pg_trigger t
  JOIN pg_class rel ON rel.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = rel.relnamespace AND n.nspname = 'public'
  WHERE NOT t.tgisinternal

  -- 3) Política do projeto: RLS OFF explícito + GRANT ALL (estado real de produção;
  --    multi-tenant com RLS é fase futura — decisão registrada do dono)
  UNION ALL
  SELECT 3, row_number() OVER (ORDER BY c.relname),
    'ALTER TABLE public.' || quote_ident(c.relname) || ' DISABLE ROW LEVEL SECURITY;'
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
  WHERE c.relkind = 'r'

  UNION ALL
  SELECT 4, 1,
    'GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;' || chr(10) ||
    'GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;' || chr(10) ||
    'GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;' || chr(10) ||
    'GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;' || chr(10) ||
    'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;' || chr(10) ||
    'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;' || chr(10) ||
    'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;'
)
SELECT stmt FROM secoes ORDER BY ord, sub;
