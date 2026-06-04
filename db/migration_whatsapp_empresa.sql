-- Adiciona colunas de configuração WhatsApp na tabela empresas
-- Permite que o master troque o número pelo painel sem mexer nas env vars

ALTER TABLE empresas
  ADD COLUMN IF NOT EXISTS whatsapp_instance  TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_numero    TEXT;

-- Popula com os valores atuais das env vars (ajuste se necessário)
-- UPDATE empresas SET whatsapp_instance = 'frota-bot-novo' WHERE whatsapp_instance IS NULL;

COMMENT ON COLUMN empresas.whatsapp_instance IS 'Nome da instância Evolution API (ex: frota-bot-novo)';
COMMENT ON COLUMN empresas.whatsapp_numero   IS 'Número WhatsApp com DDI (ex: 5531999887766)';
