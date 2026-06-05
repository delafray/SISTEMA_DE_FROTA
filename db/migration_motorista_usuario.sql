-- Link motorista → usuário do sistema (decisão do dono, 05/06/2026).
-- Usado pra: identidade no bot + indicador verde/laranja no vínculo do veículo.
-- Sem FK (sem trava). Cole no SQL Editor do Supabase. Idempotente.

ALTER TABLE motoristas ADD COLUMN IF NOT EXISTS usuario_id UUID;
