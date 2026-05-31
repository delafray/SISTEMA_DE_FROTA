-- ─────────────────────────────────────────────────────────────────────
-- Migration: update_session_atomic RPC + affected_rows sentinel
--
-- Corrige bugs B19 e B20 do BOT_FRAMEWORK.md:
--   B19: race condition no read-merge-write de updateSession quando
--        WhatsApp envia 2 mensagens em rajada do mesmo telefone.
--   B20: UPDATE silencioso quando a linha some entre o read e o write.
--
-- Estrategia: bloqueio explicito FOR UPDATE dentro de uma RPC que faz
-- read+merge+write atomicamente. Retorna a row resultante (NULL se a
-- sessao foi removida).
-- ─────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_session_atomic(
  p_session_id uuid,
  p_estado text,
  p_contexto_patch jsonb
) RETURNS sessoes_whatsapp
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row sessoes_whatsapp;
BEGIN
  -- Pega lock exclusivo na linha. Outras chamadas concorrentes pra
  -- mesma sessao bloqueiam aqui ate este transaction commitar.
  SELECT * INTO v_row
    FROM sessoes_whatsapp
    WHERE id = p_session_id
    FOR UPDATE;

  IF NOT FOUND THEN
    -- Sessao foi removida (timeout, cleanup, etc) entre o turno anterior
    -- e este. Devolve NULL pra o caller sinalizar 'sessao_perdida'.
    RETURN NULL;
  END IF;

  UPDATE sessoes_whatsapp
    SET estado = COALESCE(p_estado, v_row.estado),
        contexto = COALESCE(v_row.contexto, '{}'::jsonb) || COALESCE(p_contexto_patch, '{}'::jsonb),
        ultimo_contato = now()
    WHERE id = p_session_id
    RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION update_session_atomic(uuid, text, jsonb) TO service_role;

-- Nota: o merge usa o operador `||` do jsonb (shallow merge). Se um campo
-- do patch for null, ele SOBRESCREVE o valor existente (semantica desejada
-- pra "limpar" campo). Se voce quiser preservar campos null no merge, use
-- jsonb_strip_nulls(p_contexto_patch) antes do `||`.
