-- R4: status na dedup de mensagens. 'processando' enquanto roda; 'ok' ao terminar.
-- Se a função morrer no meio (timeout), fica 'processando' e a reentrega da Evolution
-- reprocessa (não perde a mensagem). Idempotente.
ALTER TABLE bot_msgs_processadas ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ok';
