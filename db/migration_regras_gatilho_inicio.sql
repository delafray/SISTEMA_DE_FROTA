-- Exigir que o gatilho seja a PRIMEIRA palavra (senão a regra é pulada).
-- Liga no Lembrete: só dispara se a frase começar com "lembrete" (ou outro gatilho dele).
ALTER TABLE regras ADD COLUMN IF NOT EXISTS gatilho_inicio BOOLEAN NOT NULL DEFAULT false;
UPDATE regras SET gatilho_inicio = true WHERE nome = 'Lembrete / Anotar';
