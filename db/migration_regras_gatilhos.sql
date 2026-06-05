-- ════════════════════════════════════════════════════════════════════════
-- REGRAS: campo GATILHO + regra FIXA do Lembrete (decisão do dono, 05/06/2026)
-- - `gatilhos`: palavras que disparam a regra (a 1ª palavra no contexto da frase)
-- - `fixa`: regra que fica sempre em 1º e não pode ser apagada
-- Cole no SQL Editor do Supabase. Idempotente.
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE regras ADD COLUMN IF NOT EXISTS gatilhos TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE regras ADD COLUMN IF NOT EXISTS fixa     BOOLEAN NOT NULL DEFAULT false;

-- Regra FIXA do Lembrete/Anotar — reflete como o lembrete funciona hoje.
-- Idempotente: só insere se ainda não existir uma regra fixa de anotar.
INSERT INTO regras (nome, tipo, ativa, fixa, prioridade, gatilhos, frases_exemplo, frases_negativas, quem_pode_disparar, resposta, observacao)
SELECT
  'Lembrete / Anotar',
  'anotar',
  true,
  true,
  1000,
  ARRAY['anota','anote','anotar','lembrete','me lembra','me lembre','lembra','guarda','guardar','não esquece','não esquece de','aviso','nota'],
  ARRAY[
    'anota aí que fechei o contrato',
    'me lembra de pagar o fornecedor amanhã',
    'cria um lembrete pra ligar pro cliente',
    'guarda essa nota: comprar pneu',
    'não esquece de revisar o caminhão',
    'lembrete: buscar documento no cartório'
  ],
  ARRAY['nota fiscal','número da nota'],
  ARRAY['qualquer'],
  NULL,
  'Regra fixa: representa o comportamento de anotar lembrete. Edite os gatilhos/frases aqui.'
WHERE NOT EXISTS (SELECT 1 FROM regras WHERE fixa = true AND tipo = 'anotar');
