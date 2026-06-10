-- ============================================================================
-- MIGRATION: Número do pedido — AAAA.SSSS (decisão do dono, 10/06/2026)
--
-- Formato: ano + "." + sequência por ano começando em 1001 (pra virada de ano
-- não parecer estranha: 2027.1001, 2027.1002, ... e não 2027.0001).
--
-- 1. pedidos.numero  — o número legível, único.
-- 2. pedido_numeracao — contador por ano (próximo número a usar).
-- 3. Trigger BEFORE INSERT — numera automaticamente todo pedido novo de forma
--    ATÔMICA (upsert no contador; sem furo nem duplicata em concorrência).
-- 4. BACKFILL — numera tudo que já existe, por ordem de criação dentro de
--    cada ano, e semeia o contador.
--
-- Padrão SEM TRAVA do projeto: sem RLS, GRANT ALL. Idempotente (re-rodar não
-- renumera nada: só completa onde numero IS NULL).
--
-- ⚠️ Rodar ANTES de fazer o deploy do código que exibe o número.
-- ============================================================================

-- 1. Coluna + unicidade
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS numero TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_pedidos_numero ON pedidos (numero) WHERE numero IS NOT NULL;
COMMENT ON COLUMN pedidos.numero IS 'Número do pedido AAAA.SSSS (sequência anual a partir de 1001) — gerado por trigger';

-- 2. Contador por ano
CREATE TABLE IF NOT EXISTS pedido_numeracao (
  ano     INTEGER PRIMARY KEY,
  proximo INTEGER NOT NULL    -- próximo número a ser usado (ex.: 1001)
);
GRANT ALL PRIVILEGES ON TABLE public.pedido_numeracao TO service_role, authenticated, anon;
COMMENT ON TABLE pedido_numeracao IS 'Próxima sequência do número de pedido por ano (AAAA.SSSS começa em 1001)';

-- 3. BACKFILL dos pedidos existentes (por ordem de criação dentro de cada ano)
WITH numerados AS (
  SELECT id,
         EXTRACT(YEAR FROM COALESCE(created_at, now()))::INTEGER AS ano,
         1000 + ROW_NUMBER() OVER (
           PARTITION BY EXTRACT(YEAR FROM COALESCE(created_at, now()))
           ORDER BY created_at ASC NULLS LAST, id ASC
         ) AS seq
  FROM pedidos
  WHERE numero IS NULL
)
UPDATE pedidos p
   SET numero = n.ano || '.' || n.seq
  FROM numerados n
 WHERE p.id = n.id;

-- 4. Semeia/avança o contador pro próximo número de cada ano já usado
INSERT INTO pedido_numeracao (ano, proximo)
SELECT split_part(numero, '.', 1)::INTEGER,
       MAX(split_part(numero, '.', 2)::INTEGER) + 1
  FROM pedidos
 WHERE numero IS NOT NULL
 GROUP BY 1
ON CONFLICT (ano) DO UPDATE
   SET proximo = GREATEST(pedido_numeracao.proximo, EXCLUDED.proximo);

-- 5. Função + trigger: numera todo pedido novo (se vier sem numero)
CREATE OR REPLACE FUNCTION gerar_numero_pedido()
RETURNS TRIGGER AS $$
DECLARE
  v_ano INTEGER;
  v_seq INTEGER;
BEGIN
  IF NEW.numero IS NOT NULL THEN
    RETURN NEW;  -- respeitou número informado manualmente
  END IF;
  v_ano := EXTRACT(YEAR FROM COALESCE(NEW.created_at, now()))::INTEGER;
  -- upsert atômico: primeira vez no ano usa 1001; depois incrementa
  INSERT INTO pedido_numeracao (ano, proximo) VALUES (v_ano, 1002)
    ON CONFLICT (ano) DO UPDATE SET proximo = pedido_numeracao.proximo + 1
    RETURNING proximo - 1 INTO v_seq;
  NEW.numero := v_ano || '.' || v_seq;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pedidos_numero ON pedidos;
CREATE TRIGGER trg_pedidos_numero
  BEFORE INSERT ON pedidos
  FOR EACH ROW EXECUTE FUNCTION gerar_numero_pedido();

-- Verificação:
-- SELECT numero, created_at FROM pedidos ORDER BY numero DESC LIMIT 10;
-- SELECT * FROM pedido_numeracao;
