-- Regra: conjunto de AÇÕES (decisão do dono, 05/06/2026).
-- acoes = subconjunto de {consultar, alterar, registrar}. A célula da matriz cicla
-- SÓ por estas ações (ex: KM = consultar+alterar, sem "criar"). Substitui o `teto`.
-- Cole no SQL Editor do Supabase. Idempotente.

ALTER TABLE regras ADD COLUMN IF NOT EXISTS acoes TEXT[] NOT NULL DEFAULT '{}';

-- regras existentes
UPDATE regras SET acoes = ARRAY['consultar','alterar'] WHERE nome IN ('KM Motorista', 'KM Gestor');
-- Lembrete / Anotar continua tipo 'anotar' com acoes vazio (é o flag Anotar da matriz).
