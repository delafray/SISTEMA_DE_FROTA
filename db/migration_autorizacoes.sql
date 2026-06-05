-- ════════════════════════════════════════════════════════════════════════
-- AUTORIZAÇÕES — matriz telefone × permissões (decisão do dono, 05/06/2026)
-- SEM TRAVA: sem RLS, sem FK. A trava do telefone passa a ser ESTE registro
-- (flag `ativo`). Por enquanto só Ativo + Anotar; as regras (níveis consultar/
-- modificar/criar) ficam em `permissoes` (jsonb), chaveadas por regra_id.
-- Cole no SQL Editor do Supabase. Idempotente.
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS telefones (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telefone           TEXT NOT NULL,                 -- canônico: 55 + DDD + número (com 9)
  telefone_exibicao  TEXT,                          -- formatado p/ exibir
  usuario_id         UUID,                          -- vínculo (sem FK, sem trava)
  usuario_nome       TEXT,                          -- desnormalizado p/ exibir
  papel              TEXT,                           -- master/diretor/gerente/...
  ativo              BOOLEAN NOT NULL DEFAULT true,  -- interruptor-mestre (destrava o número)
  anotar             BOOLEAN NOT NULL DEFAULT true,  -- pode anotar (lembrete)
  permissoes         JSONB NOT NULL DEFAULT '{}',    -- { "<regra_id>": "consultar|modificar|criar" }
  criado_em          TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS telefones_canonico ON telefones (telefone);

GRANT ALL ON telefones TO anon, authenticated, service_role;
