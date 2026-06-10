-- ============================================================================
-- MIGRATION: Beta teste rota (decisão do dono, 10/06/2026)
--
-- Motoristas EXTERNOS pagos pra validar a roteirização: usuário com
-- perfis.beta_rota = true usa o app de rota como era ANTES do vínculo com
-- despacho — captura → otimiza → segue, sem caminhão, sem despachos, sem
-- pedido. As rotas dele são gravadas em rotas_otimizadas/notas_capturadas com
-- motorista_id = perfis.id (o próprio usuário; não há FK), então dá pra
-- auditar pelo nome/login do usuário:
--
--   SELECT p.login, p.nome, r.numero_de_rotas FROM perfis p
--   JOIN LATERAL (SELECT count(*) numero_de_rotas FROM rotas_otimizadas r
--                 WHERE r.motorista_id = p.id) r ON true
--   WHERE p.beta_rota;
--
-- Idempotente. O código degrada sem ela (flag aparece desmarcada e não salva).
-- ============================================================================

ALTER TABLE perfis ADD COLUMN IF NOT EXISTS beta_rota BOOLEAN NOT NULL DEFAULT false;
COMMENT ON COLUMN perfis.beta_rota IS 'Usuário beta de roteirização: app de rota standalone (sem caminhão/despacho/pedido); rotas gravadas com motorista_id = perfis.id';

-- Verificação:
-- SELECT login, nome, beta_rota FROM perfis WHERE beta_rota;
