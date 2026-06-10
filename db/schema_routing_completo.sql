-- ============================================================================
-- schema_routing_completo.sql
-- A "RECEITA" das tabelas que foram criadas a mao no painel do Supabase e nao
-- existiam em nenhum .sql do repo: notas_capturadas, rotas_otimizadas, paradas
-- (criadas 2026-05-27, PLANO_ROTEIRIZACAO.md) e locais_carregamento (criada
-- 2026-06-09 pela outra IA). Sem isso, "implantar do zero" num cliente novo
-- e impossivel (modelo de venda do dono = deploy proprio por cliente).
--
-- Derivada do codigo real: src/lib/routing/types.ts (interfaces NotaCapturada/
-- RotaOtimizada/Parada), src/app/api/notas/sync/route.ts (insert), e telas de
-- locais_carregamento (clientes/[id]/editar + pedidos/novo).
--
-- Padrao SEM TRAVA: sem RLS, sem FK rigida, GRANT ALL. Idempotente — rodar no
-- banco de PRODUCAO e seguro (IF NOT EXISTS nao toca no que ja existe) e e
-- OBRIGATORIO em toda implantacao nova, junto com as migrations db/*.sql.
-- ============================================================================

-- ─── notas_capturadas — captura offline de NFs pelo motorista ───────────────
CREATE TABLE IF NOT EXISTS notas_capturadas (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  motorista_id    UUID,
  empresa_id      UUID,
  pedido_id       UUID,                          -- EMPRESA 1: NULL = captura solta
  cep             TEXT DEFAULT '',               -- 8 digitos sem hifen ('' = sem CEP)
  numero          TEXT,
  endereco        JSONB,                         -- { logradouro, bairro, cidade, uf }
  latitude        NUMERIC,
  longitude       NUMERIC,
  observacao      TEXT,
  status          TEXT DEFAULT 'capturada',
  -- capturada | geocodificada | em_rota | concluida | cancelada
  capturado_em    TIMESTAMPTZ,
  sincronizado_em TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_notas_capturadas_motorista ON notas_capturadas (motorista_id, status);
CREATE INDEX IF NOT EXISTS idx_notas_capturadas_empresa   ON notas_capturadas (empresa_id);
CREATE INDEX IF NOT EXISTS idx_notas_capturadas_pedido    ON notas_capturadas (pedido_id);

-- ─── rotas_otimizadas — 1 rota gerada pelo VROOM (captura solta OU pedido) ──
CREATE TABLE IF NOT EXISTS rotas_otimizadas (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  motorista_id       UUID,
  empresa_id         UUID,
  pedido_id          UUID,                       -- EMPRESA 1: NULL = captura solta
  data               DATE,
  distancia_total_km NUMERIC,
  tempo_total_min    NUMERIC,
  status             TEXT DEFAULT 'rascunho',
  -- rascunho | otimizada | em_andamento | concluida | cancelada
  otimizada_em       TIMESTAMPTZ,
  criada_em          TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rotas_otimizadas_motorista ON rotas_otimizadas (motorista_id, data);
CREATE INDEX IF NOT EXISTS idx_rotas_otimizadas_pedido    ON rotas_otimizadas (pedido_id);

-- ─── paradas — 1 parada da rota (snapshot do endereco; nao muda se editar) ──
CREATE TABLE IF NOT EXISTS paradas (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rota_id            UUID,
  nota_id            UUID,                       -- origem captura solta (ou NULL)
  pedido_id          UUID,                       -- EMPRESA 1: denormalizado
  entrega_id         UUID,                       -- EMPRESA 1: origem ramo entregas
  ordem              INTEGER,
  endereco           JSONB,                      -- snapshot + coord_confianca/coord_fonte
  latitude           NUMERIC,
  longitude          NUMERIC,
  fixada             BOOLEAN DEFAULT false,
  janela_horario     JSONB,                      -- [["HH:MM","HH:MM"], ...]
  tempo_descarga_min INTEGER DEFAULT 5,
  observacao         TEXT,
  concluida_em       TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_paradas_rota   ON paradas (rota_id, ordem);
CREATE INDEX IF NOT EXISTS idx_paradas_pedido ON paradas (pedido_id);

-- ─── locais_carregamento — enderecos de coleta salvos por cliente ───────────
CREATE TABLE IF NOT EXISTS locais_carregamento (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID,
  cliente_id UUID,
  nome       TEXT,
  endereco   TEXT,
  principal  BOOLEAN DEFAULT false,
  ativo      BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_locais_carregamento_cliente ON locais_carregamento (cliente_id, ativo);

-- ─── GRANTs ──────────────────────────────────────────────────────────────────
-- paradas e locais_carregamento sao lidas/escritas DIRETO do browser (client
-- supabase autenticado) — precisam de grant pra authenticated/anon, igual o
-- painel cria por padrao. notas/rotas passam pelas APIs (service_role).
GRANT ALL PRIVILEGES ON TABLE public.notas_capturadas    TO service_role, authenticated, anon;
GRANT ALL PRIVILEGES ON TABLE public.rotas_otimizadas    TO service_role, authenticated, anon;
GRANT ALL PRIVILEGES ON TABLE public.paradas             TO service_role, authenticated, anon;
GRANT ALL PRIVILEGES ON TABLE public.locais_carregamento TO service_role, authenticated, anon;

-- ─── Documentacao inline ─────────────────────────────────────────────────────
COMMENT ON TABLE notas_capturadas    IS 'NFs capturadas offline pelo motorista (mobile/captura-notas). pedido_id NULL = captura solta.';
COMMENT ON TABLE rotas_otimizadas    IS 'Rotas geradas pelo VROOM (POST /api/routing/otimizar). pedido_id NULL = captura solta.';
COMMENT ON TABLE paradas             IS 'Paradas da rota com snapshot jsonb do endereco (coord_confianca/coord_fonte decidem navegacao por coord vs texto).';
COMMENT ON TABLE locais_carregamento IS 'Enderecos de coleta salvos por cliente (chips no Novo Pedido).';

-- ============================================================================
-- VERIFICACAO (opcional): rode o SELECT abaixo no banco de PRODUCAO e compare
-- com este arquivo. Se aparecer alguma coluna que nao esta aqui, me avise que
-- eu atualizo a receita.
--
-- SELECT table_name, column_name, data_type, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
--   AND table_name IN ('notas_capturadas','rotas_otimizadas','paradas','locais_carregamento')
-- ORDER BY table_name, ordinal_position;
-- ============================================================================
