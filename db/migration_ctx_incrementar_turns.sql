-- Auditoria #2: incremento ATÔMICO do contador 'turns' do contexto (anti-race).
-- Em vez de ler-no-app + somar + gravar (last-write-wins sob concorrência), o banco
-- soma de uma vez. Tambem renova o TTL (10 min) a cada uso por referencia. Idempotente.
CREATE OR REPLACE FUNCTION ctx_incrementar_turns(p_telefone TEXT)
RETURNS INTEGER
LANGUAGE sql
AS $$
  UPDATE bot_contexto_conversa
  SET turns = turns + 1,
      expira_em = now() + interval '10 minutes',
      atualizado_em = now()
  WHERE telefone = p_telefone
  RETURNING turns;
$$;
GRANT EXECUTE ON FUNCTION ctx_incrementar_turns(TEXT) TO anon, authenticated, service_role;
