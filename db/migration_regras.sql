-- ════════════════════════════════════════════════════════════════════════
-- MOTOR DE REGRAS — estrutura básica (decisão do dono, 05/06/2026)
-- SEM TRAVA: sem RLS, sem FK, sem escopo obrigatório de empresa.
-- A regra nasce GLOBAL (vale pra todas as empresas). `empresas_alvo` vazio = todas;
-- depois dá pra fixar uma ou várias (multi-select). Ver docs/MOTOR_REGRAS_ARQUITETURA.md.
-- Como rodar: cole no SQL Editor do Supabase. Idempotente.
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS regras (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  nome               TEXT NOT NULL,
  tipo               TEXT NOT NULL DEFAULT 'consultar',   -- consultar | registrar | anotar
  ativa              BOOLEAN NOT NULL DEFAULT true,
  prioridade         INTEGER NOT NULL DEFAULT 0,          -- desempate quando 2 regras casam

  frases_exemplo     TEXT[] NOT NULL DEFAULT '{}',        -- o que DISPARA a regra
  frases_negativas   TEXT[] NOT NULL DEFAULT '{}',        -- o que NÃO deve disparar

  empresas_alvo      UUID[] NOT NULL DEFAULT '{}',        -- vazio = TODAS as empresas
  quem_pode_disparar TEXT[] NOT NULL DEFAULT '{qualquer}',-- qualquer | motorista | gestor | master

  -- Consultar: resposta estática (MVP). Depois: leitura de tabelas.
  resposta           TEXT,
  -- Registrar/Consultar avançado (fase 2): campos a coletar + tabelas permitidas.
  campos             JSONB NOT NULL DEFAULT '[]',
  escopo_dados       JSONB NOT NULL DEFAULT '{}',
  exige_confirmacao  BOOLEAN NOT NULL DEFAULT false,

  observacao         TEXT,
  versao             INTEGER NOT NULL DEFAULT 1,
  criado_em          TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS regras_tipo_ativa ON regras (tipo, ativa);

-- SEM TRAVA: acesso total, sem RLS (consistente com a tabela lembretes).
ALTER TABLE regras DISABLE ROW LEVEL SECURITY;
GRANT ALL ON regras TO anon, authenticated, service_role;
