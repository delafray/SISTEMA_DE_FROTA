-- ============================================================================
-- migration_empresa01_logistica.sql
-- EMPRESA 1 (Transportadora): roteirização ligada ao Pedido + POD.
-- Padrao SEM TRAVA: ADD COLUMN IF NOT EXISTS, sem RLS, sem FK rigida, GRANT ALL.
-- Idempotente. Rodar no SQL editor do Supabase de prod.
-- Os 3 campos do futuro (origem_demanda/executor_tipo/pedido_pai_id) entram ja
-- agora pra preparar Empresas 2/3/4 sem migracao destrutiva depois.
-- ============================================================================

-- ─── 1. ENTREGAS: geocoding + sequencia + janela/service_time + 3 do futuro ──
ALTER TABLE entregas ADD COLUMN IF NOT EXISTS latitude        NUMERIC;
ALTER TABLE entregas ADD COLUMN IF NOT EXISTS longitude       NUMERIC;
ALTER TABLE entregas ADD COLUMN IF NOT EXISTS geocode_status  TEXT DEFAULT 'pendente';
-- valores usados: pendente | geocodificado | falhou
ALTER TABLE entregas ADD COLUMN IF NOT EXISTS sequencia       INTEGER;        -- ordem na rota (1,2,3...)
ALTER TABLE entregas ADD COLUMN IF NOT EXISTS janela_inicio   TIMESTAMPTZ;    -- VRPTW
ALTER TABLE entregas ADD COLUMN IF NOT EXISTS janela_fim      TIMESTAMPTZ;    -- VRPTW
ALTER TABLE entregas ADD COLUMN IF NOT EXISTS service_time_seg INTEGER DEFAULT 600; -- 10min; alto = cliente lento/critico
-- origem-da-demanda (NAO confundir com a coluna `origem` que ja existe = endereco-texto)
ALTER TABLE entregas ADD COLUMN IF NOT EXISTS origem_demanda  TEXT DEFAULT 'notas_antecipadas';
-- notas_antecipadas | frete_voz_texto | importacao_massa | api_externa
ALTER TABLE entregas ADD COLUMN IF NOT EXISTS executor_tipo   TEXT DEFAULT 'proprio';
-- proprio | terceiro | agregado
ALTER TABLE entregas ADD COLUMN IF NOT EXISTS pedido_pai_id   UUID;          -- split/multi-caminhao (sem FK)

-- ─── 2. PEDIDOS: modo/tamanho/cliente + 3 do futuro ─────────────────────────
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS modo            TEXT DEFAULT 'antecipado'; -- antecipado | na_hora
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS tamanho         TEXT DEFAULT 'pequeno';    -- pequeno | grande | gigante
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS cliente_id      UUID;          -- contratante do frete (sem FK)
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS origem_demanda  TEXT DEFAULT 'notas_antecipadas';
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS executor_tipo   TEXT DEFAULT 'proprio';
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS pedido_pai_id   UUID;          -- self-ref logico (sem FK)

-- ─── 3. Ligar o modulo de routing isolado ao Pedido ─────────────────────────
-- notas_capturadas/rotas_otimizadas/paradas foram criadas no painel em 2026-05-27.
-- Adicionamos pedido_id pra amarrar a rota ao pedido (gap principal). Sem FK.
ALTER TABLE notas_capturadas  ADD COLUMN IF NOT EXISTS pedido_id UUID;
ALTER TABLE rotas_otimizadas  ADD COLUMN IF NOT EXISTS pedido_id UUID;
ALTER TABLE paradas           ADD COLUMN IF NOT EXISTS pedido_id UUID;
ALTER TABLE paradas           ADD COLUMN IF NOT EXISTS entrega_id UUID; -- liga parada<->entrega quando origem=pedido

-- ─── 4. ROTAS (NOVA) — 1 por veiculo dentro do pedido (gigante/multi-caminhao)
-- Em pequeno/grande fica NULL (pedido -> veiculo direto). Preenchida em gigante.
CREATE TABLE IF NOT EXISTS rotas (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id          UUID,
  pedido_id           UUID,            -- pedido pai (sem FK)
  veiculo_id          UUID,
  motorista_id        UUID,
  data_planejada      DATE,
  status              TEXT DEFAULT 'rascunho', -- rascunho|otimizada|em_andamento|concluida|cancelada
  km_estimado         NUMERIC,
  tempo_estimado_min  NUMERIC,
  polyline            TEXT,            -- geometria OSRM p/ desenhar no mapa
  vroom_payload       JSONB,           -- auditoria planejado vs realizado
  executor_tipo       TEXT DEFAULT 'proprio',
  criada_em           TIMESTAMPTZ DEFAULT now(),
  otimizada_em        TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_rotas_pedido    ON rotas (pedido_id);
CREATE INDEX IF NOT EXISTS idx_rotas_empresa   ON rotas (empresa_id);

-- ─── 5. POD (NOVA) — prova de entrega por parada. Reusavel nos 4 modelos. ────
CREATE TABLE IF NOT EXISTS pod (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entrega_id      UUID,                -- a qual entrega pertence (sem FK)
  empresa_id      UUID,
  foto_url        TEXT,
  assinatura_url  TEXT,                -- opcional
  latitude        NUMERIC,             -- GPS do momento da entrega
  longitude       NUMERIC,
  capturado_em    TIMESTAMPTZ DEFAULT now(),
  observacao      TEXT,
  recebedor       TEXT,                -- nome de quem recebeu
  tipo_ocorrencia TEXT DEFAULT 'entregue'
  -- entregue | falha_ausencia | recusada | endereco_invalido | devolvida
);
CREATE INDEX IF NOT EXISTS idx_pod_entrega ON pod (entrega_id);

-- ─── 6. GRANTs (PostgREST usa service_role com a service key). SEM TRAVA. ────
GRANT ALL PRIVILEGES ON TABLE public.rotas             TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.pod               TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.notas_capturadas  TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.rotas_otimizadas  TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.paradas           TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.entregas          TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.pedidos           TO service_role;

-- ─── 7. Documentacao inline ─────────────────────────────────────────────────
COMMENT ON COLUMN entregas.origem_demanda IS 'Fonte da demanda: notas_antecipadas|frete_voz_texto|importacao_massa|api_externa. NAO confundir com `origem` (endereco-texto).';
COMMENT ON COLUMN entregas.service_time_seg IS 'Tempo de descarga p/ VROOM. Alto = cliente lento/critico (distribui naturalmente entre caminhoes).';
COMMENT ON TABLE  rotas IS 'EMPRESA 1+: 1 rota por veiculo dentro do pedido. NULL em pequeno/grande, preenchida em gigante.';
COMMENT ON TABLE  pod   IS 'Proof of Delivery por parada (foto+GPS+timestamp). Reusavel nos 4 modelos.';
