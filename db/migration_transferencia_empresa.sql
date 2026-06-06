-- Transferência de ATIVO (caminhão/motorista) entre empresas + AUDITORIA.
-- A função é UMA transação: ou move tudo, ou nada (sem ficar pela metade). Idempotente.

CREATE TABLE IF NOT EXISTS transferencias_empresa (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo            TEXT NOT NULL,            -- 'veiculo' | 'motorista'
  alvo_id         UUID NOT NULL,
  empresa_origem  UUID,
  empresa_destino UUID NOT NULL,
  mover_tudo      BOOLEAN NOT NULL,         -- true = histórico inteiro; false = só daqui pra frente
  feito_por       UUID,                     -- perfil que fez (rastro)
  feito_em        TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE transferencias_empresa DISABLE ROW LEVEL SECURITY;
GRANT ALL ON transferencias_empresa TO anon, authenticated, service_role;

-- CAMINHÃO: manutenções (feitas e a fazer) SEMPRE vão junto; o resto só se mover_tudo.
CREATE OR REPLACE FUNCTION transferir_veiculo_empresa(p_veiculo UUID, p_nova UUID, p_mover_tudo BOOLEAN, p_por UUID DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_antiga UUID;
BEGIN
  SELECT empresa_id INTO v_antiga FROM veiculos WHERE id = p_veiculo;
  UPDATE veiculos    SET empresa_id = p_nova WHERE id = p_veiculo;
  UPDATE manutencoes SET empresa_id = p_nova WHERE veiculo_id = p_veiculo;   -- SEMPRE
  IF p_mover_tudo THEN
    UPDATE abastecimentos SET empresa_id = p_nova WHERE veiculo_id = p_veiculo;
    UPDATE avarias        SET empresa_id = p_nova WHERE veiculo_id = p_veiculo;
    UPDATE pedidos        SET empresa_id = p_nova WHERE veiculo_id = p_veiculo;
    UPDATE km_logs        SET empresa_id = p_nova WHERE veiculo_id = p_veiculo;
  END IF;
  INSERT INTO transferencias_empresa(tipo, alvo_id, empresa_origem, empresa_destino, mover_tudo, feito_por)
    VALUES ('veiculo', p_veiculo, v_antiga, p_nova, p_mover_tudo, p_por);
END; $$;
GRANT EXECUTE ON FUNCTION transferir_veiculo_empresa(UUID, UUID, BOOLEAN, UUID) TO anon, authenticated, service_role;

-- MOTORISTA: pagamentos (adiantamentos) só se mover_tudo. Fretes NÃO — pertencem ao caminhão.
CREATE OR REPLACE FUNCTION transferir_motorista_empresa(p_motorista UUID, p_nova UUID, p_mover_tudo BOOLEAN, p_por UUID DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_antiga UUID;
BEGIN
  SELECT empresa_id INTO v_antiga FROM motoristas WHERE id = p_motorista;
  UPDATE motoristas SET empresa_id = p_nova WHERE id = p_motorista;
  IF p_mover_tudo THEN
    UPDATE adiantamentos SET empresa_id = p_nova WHERE motorista_id = p_motorista;
  END IF;
  INSERT INTO transferencias_empresa(tipo, alvo_id, empresa_origem, empresa_destino, mover_tudo, feito_por)
    VALUES ('motorista', p_motorista, v_antiga, p_nova, p_mover_tudo, p_por);
END; $$;
GRANT EXECUTE ON FUNCTION transferir_motorista_empresa(UUID, UUID, BOOLEAN, UUID) TO anon, authenticated, service_role;
