-- ============================================================================
-- MIGRATION: Prints do Zap — galeria de imagens recebidas no WhatsApp
-- (decisão do dono, 10/06/2026)
--
-- Toda IMAGEM que chegar no bot é arquivada no R2 (pasta prints/) e registrada
-- aqui — o bot continua respondendo como sempre (não entende imagem), mas o
-- dono passa a poder mostrar prints do celular ao Claude pelo zap:
-- o Claude busca em GET /api/prints e baixa a imagem pra analisar.
--
-- Padrão SEM TRAVA do projeto: sem RLS, GRANT ALL. Idempotente.
-- ============================================================================

CREATE TABLE IF NOT EXISTS prints_zap (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telefone   TEXT,                 -- de quem mandou (msg.from)
  nome       TEXT,                 -- nome do remetente quando identificado
  legenda    TEXT,                 -- caption da imagem, se houver
  url        TEXT NOT NULL,        -- URL pública no R2 (ou passthrough)
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_prints_zap_criado ON prints_zap (criado_em DESC);

ALTER TABLE prints_zap DISABLE ROW LEVEL SECURITY;
GRANT ALL PRIVILEGES ON TABLE public.prints_zap TO service_role, authenticated, anon;

COMMENT ON TABLE prints_zap IS 'Imagens recebidas pelo bot do WhatsApp, arquivadas no R2 (prints/) — galeria pro dono mostrar telas ao Claude';

-- Verificação:
-- SELECT telefone, nome, url, criado_em FROM prints_zap ORDER BY criado_em DESC LIMIT 5;
