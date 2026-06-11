-- =============================================================================
-- SCHEMA BASE COMPLETO — SISTEMA DE FROTA
-- Gerado via Supabase MCP em: 2026-06-11
-- Projeto: ltfthfbounngaubwsxfw | Região: sa-east-1 (São Paulo)
-- Migrations aplicadas: 001_empresas → migration_fix_cota_ambiguo (37 migrations)
-- =============================================================================
-- ⚠️  ATENÇÃO: Este arquivo é referência de instalação/ensaio.
--     Para produção, use as migrations em supabase/migrations/ via Supabase CLI.
--     RLS está desabilitado — ativar apenas após definir as policies.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- EXTENSÕES
-- -----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- TABELAS (ordem respeitando dependências de FK)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. empresas
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS empresas (
  id                  uuid        NOT NULL DEFAULT gen_random_uuid(),
  nome_fantasia       text        NOT NULL,
  razao_social        text,
  cnpj                text        NOT NULL,
  inscricao_estadual  text,
  telefone            text,
  email               text,
  cep                 text,
  logradouro          text,
  numero              text,
  complemento         text,
  bairro              text,
  cidade              text,
  uf                  text,
  logo_url            text,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now(),
  whatsapp_instance   text,
  whatsapp_numero     text,
  CONSTRAINT empresas_pkey         PRIMARY KEY (id),
  CONSTRAINT empresas_cnpj_key     UNIQUE (cnpj),
  CONSTRAINT empresas_cnpj_check   CHECK (cnpj ~ '^\d{14}$'),
  CONSTRAINT empresas_email_check  CHECK (email IS NULL OR email ~* '^[^@]+@[^@]+\.[^@]+$'),
  CONSTRAINT empresas_telefone_check CHECK (telefone IS NULL OR telefone ~ '^\d{10,11}$'),
  CONSTRAINT empresas_cep_check    CHECK (cep IS NULL OR cep ~ '^\d{8}$'),
  CONSTRAINT empresas_uf_check     CHECK (uf IS NULL OR uf ~ '^[A-Z]{2}$')
);

-- -----------------------------------------------------------------------------
-- 2. perfis (espelha auth.users)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS perfis (
  id              uuid        NOT NULL,
  nome            text        NOT NULL,
  cpf             text,
  telefone        text,
  whatsapp_bot    text,
  motorista_id    uuid,
  foto_url        text,
  ativo           bool        DEFAULT true,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  login           text,
  beta_rota       bool        NOT NULL DEFAULT false,
  CONSTRAINT perfis_pkey              PRIMARY KEY (id),
  CONSTRAINT perfis_cpf_key           UNIQUE (cpf),
  CONSTRAINT perfis_whatsapp_bot_key  UNIQUE (whatsapp_bot),
  CONSTRAINT perfis_motorista_id_key  UNIQUE (motorista_id),
  CONSTRAINT perfis_cpf_check         CHECK (cpf IS NULL OR cpf ~ '^\d{11}$'),
  CONSTRAINT perfis_telefone_check    CHECK (telefone IS NULL OR telefone ~ '^\d{10,11}$'),
  CONSTRAINT perfis_whatsapp_bot_check CHECK (whatsapp_bot IS NULL OR whatsapp_bot ~ '^\d{12,13}$'),
  CONSTRAINT perfis_id_fkey           FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- -----------------------------------------------------------------------------
-- 3. usuario_empresas
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usuario_empresas (
  id          uuid  NOT NULL DEFAULT gen_random_uuid(),
  usuario_id  uuid  NOT NULL,
  empresa_id  uuid  NOT NULL,
  role        text  NOT NULL DEFAULT 'gestor',
  is_padrao   bool  DEFAULT false,
  created_at  timestamptz DEFAULT now(),
  CONSTRAINT usuario_empresas_pkey                    PRIMARY KEY (id),
  CONSTRAINT usuario_empresas_usuario_id_empresa_id_key UNIQUE (usuario_id, empresa_id),
  CONSTRAINT usuario_empresas_role_check              CHECK (role = ANY (ARRAY['master','gestor','motorista'])),
  CONSTRAINT usuario_empresas_usuario_id_fkey         FOREIGN KEY (usuario_id) REFERENCES perfis(id) ON DELETE CASCADE,
  CONSTRAINT usuario_empresas_empresa_id_fkey         FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE
);

-- -----------------------------------------------------------------------------
-- 4. veiculos
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS veiculos (
  id                        uuid      NOT NULL DEFAULT gen_random_uuid(),
  empresa_id                uuid      NOT NULL,
  placa                     text      NOT NULL,
  apelido                   text,
  marca                     text      NOT NULL,
  modelo                    text      NOT NULL,
  ano                       int4      NOT NULL,
  cor                       text,
  chassi                    text      NOT NULL,
  renavam                   text      NOT NULL,
  tipo                      text      NOT NULL,
  categoria                 text,
  eixos                     int2,
  capacidade_carga_kg       numeric,
  pbt_kg                    numeric,
  combustivel               text      NOT NULL,
  capacidade_tanque         numeric,
  data_aquisicao            date,
  valor_aquisicao           numeric,
  ipva_vencimento           date,
  licenciamento_vencimento  date,
  seguradora                text,
  apolice_numero            text,
  seguro_vencimento         date,
  km_atual                  numeric   DEFAULT 0,
  km_proxima_troca_oleo     numeric,
  km_proxima_revisao        numeric,
  data_proxima_revisao      date,
  ativo                     bool      DEFAULT true,
  foto_url                  text,
  created_at                timestamptz DEFAULT now(),
  updated_at                timestamptz DEFAULT now(),
  CONSTRAINT veiculos_pkey            PRIMARY KEY (id),
  CONSTRAINT veiculos_placa_key       UNIQUE (placa),
  CONSTRAINT veiculos_renavam_key     UNIQUE (renavam),
  CONSTRAINT veiculos_chassi_key      UNIQUE (chassi),
  CONSTRAINT veiculos_placa_check     CHECK (placa ~ '^[A-Z]{3}-?\d[A-Z0-9]\d{2}$'),
  CONSTRAINT veiculos_renavam_check   CHECK (renavam ~ '^\d{9,11}$'),
  CONSTRAINT veiculos_chassi_check    CHECK (length(chassi) = 17),
  CONSTRAINT veiculos_tipo_check      CHECK (tipo = ANY (ARRAY['caminhao','van','carro','utilitario'])),
  CONSTRAINT veiculos_categoria_check CHECK (categoria = ANY (ARRAY['toco','truck','bitruck','carreta','cavalo','3_4'])),
  CONSTRAINT veiculos_combustivel_check CHECK (combustivel = ANY (ARRAY['diesel','diesel_s10','gasolina','etanol','flex'])),
  CONSTRAINT veiculos_eixos_check     CHECK (eixos > 0),
  CONSTRAINT veiculos_ano_check       CHECK (ano >= 1990 AND ano <= (EXTRACT(year FROM CURRENT_DATE)::integer + 1)),
  CONSTRAINT veiculos_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES empresas(id)
);

-- -----------------------------------------------------------------------------
-- 5. motoristas
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS motoristas (
  id                      uuid  NOT NULL DEFAULT gen_random_uuid(),
  empresa_id              uuid  NOT NULL,
  nome                    text  NOT NULL,
  cpf                     text  NOT NULL,
  rg                      text,
  data_nascimento         date,
  email                   text,
  whatsapp                text  NOT NULL,
  cnh_numero              text  NOT NULL,
  cnh_categoria           text  NOT NULL,
  cnh_validade            date  NOT NULL,
  cnh_primeira_habilitacao date,
  cnh_ear                 bool  DEFAULT false,
  cep                     text,
  logradouro              text,
  numero                  text,
  complemento             text,
  bairro                  text,
  cidade                  text,
  uf                      text,
  data_admissao           date,
  data_desligamento       date,
  cargo                   text  DEFAULT 'motorista',
  salario_fixo            numeric,
  valor_diaria_por_pedido numeric,
  ativo                   bool  DEFAULT true,
  foto_url                text,
  cnh_foto_url            text,
  created_at              timestamptz DEFAULT now(),
  updated_at              timestamptz DEFAULT now(),
  chave_pix               text,
  tipo_chave_pix          text  DEFAULT 'cpf',
  usuario_id              uuid,
  CONSTRAINT motoristas_pkey            PRIMARY KEY (id),
  CONSTRAINT motoristas_cpf_key         UNIQUE (cpf),
  CONSTRAINT motoristas_whatsapp_key    UNIQUE (whatsapp),
  CONSTRAINT motoristas_cpf_check       CHECK (cpf ~ '^\d{11}$'),
  CONSTRAINT motoristas_whatsapp_check  CHECK (whatsapp ~ '^\d{12,13}$'),
  CONSTRAINT motoristas_email_check     CHECK (email IS NULL OR email ~* '^[^@]+@[^@]+\.[^@]+$'),
  CONSTRAINT motoristas_cep_check       CHECK (cep IS NULL OR cep ~ '^\d{8}$'),
  CONSTRAINT motoristas_uf_check        CHECK (uf IS NULL OR uf ~ '^[A-Z]{2}$'),
  CONSTRAINT motoristas_cnh_categoria_check CHECK (cnh_categoria = ANY (ARRAY['A','B','C','D','E','AB','AC','AD','AE'])),
  CONSTRAINT motoristas_data_nascimento_check CHECK (data_nascimento < CURRENT_DATE),
  CONSTRAINT motoristas_salario_fixo_check CHECK (salario_fixo IS NULL OR salario_fixo >= 0),
  CONSTRAINT motoristas_valor_fixo_por_viagem_check CHECK (valor_diaria_por_pedido IS NULL OR valor_diaria_por_pedido >= 0),
  CONSTRAINT motoristas_check CHECK (data_desligamento IS NULL OR data_admissao IS NULL OR data_desligamento >= data_admissao),
  CONSTRAINT motoristas_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES empresas(id)
);

-- FK perfis.motorista_id → motoristas
ALTER TABLE perfis ADD CONSTRAINT perfis_motorista_id_fkey FOREIGN KEY (motorista_id) REFERENCES motoristas(id);

-- -----------------------------------------------------------------------------
-- 6. clientes
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clientes (
  id                      uuid  NOT NULL DEFAULT gen_random_uuid(),
  empresa_id              uuid  NOT NULL,
  nome_fantasia           text  NOT NULL,
  razao_social            text,
  documento               text  NOT NULL,
  tipo_pessoa             text  NOT NULL,
  inscricao_estadual      text,
  contato_nome            text,
  telefone                text,
  email                   text,
  cep                     text,
  logradouro              text,
  numero                  text,
  complemento             text,
  bairro                  text,
  cidade                  text,
  uf                      text,
  forma_pagamento_padrao  text,
  observacoes             text,
  ativo                   bool  DEFAULT true,
  created_at              timestamptz DEFAULT now(),
  updated_at              timestamptz DEFAULT now(),
  apelido                 text,
  CONSTRAINT clientes_pkey                      PRIMARY KEY (id),
  CONSTRAINT clientes_empresa_id_documento_key  UNIQUE (empresa_id, documento),
  CONSTRAINT clientes_tipo_pessoa_check         CHECK (tipo_pessoa = ANY (ARRAY['fisica','juridica'])),
  CONSTRAINT clientes_email_check               CHECK (email IS NULL OR email ~* '^[^@]+@[^@]+\.[^@]+$'),
  CONSTRAINT clientes_telefone_check            CHECK (telefone IS NULL OR telefone ~ '^\d{10,11}$'),
  CONSTRAINT clientes_cep_check                 CHECK (cep IS NULL OR cep ~ '^\d{8}$'),
  CONSTRAINT clientes_uf_check                  CHECK (uf IS NULL OR uf ~ '^[A-Z]{2}$'),
  CONSTRAINT clientes_forma_pagamento_padrao_check CHECK (forma_pagamento_padrao = ANY (ARRAY['a_vista','7d','14d','21d','30d','45d','60d','outros'])),
  CONSTRAINT clientes_empresa_id_fkey           FOREIGN KEY (empresa_id) REFERENCES empresas(id)
);

-- -----------------------------------------------------------------------------
-- 7. pedidos
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pedidos (
  id                      uuid  NOT NULL DEFAULT gen_random_uuid(),
  empresa_id              uuid  NOT NULL,
  motorista_id            uuid,
  veiculo_id              uuid,
  status                  text  NOT NULL DEFAULT 'agendada',
  data_inicio_prevista    date,
  data_fim_prevista       date,
  data_inicio_real        timestamptz,
  data_fim_real           timestamptz,
  km_inicial              numeric,
  km_final                numeric,
  observacoes             text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  valor_pedido            numeric,
  forma_pagamento         text,
  pago                    bool  DEFAULT false,
  data_pagamento          date,
  observacoes_financeiras text,
  modo                    text  DEFAULT 'antecipado',
  tamanho                 text  DEFAULT 'pequeno',
  cliente_id              uuid,
  origem_demanda          text  DEFAULT 'notas_antecipadas',
  executor_tipo           text  DEFAULT 'proprio',
  pedido_pai_id           uuid,
  local_carregamento      text,
  local_carregamento_id   uuid,
  empresa_motorista_id    uuid,
  empresa_faturamento_id  uuid,
  acrescimos              numeric NOT NULL DEFAULT 0,
  descontos               numeric NOT NULL DEFAULT 0,
  numero                  text,
  CONSTRAINT viagens_pkey             PRIMARY KEY (id),
  CONSTRAINT pedidos_status_check     CHECK (status = ANY (ARRAY['agendada','agendado','em_andamento','concluida','concluido','cancelada','cancelado'])),
  CONSTRAINT pedidos_empresa_id_fkey  FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  CONSTRAINT pedidos_motorista_id_fkey FOREIGN KEY (motorista_id) REFERENCES motoristas(id),
  CONSTRAINT pedidos_veiculo_id_fkey  FOREIGN KEY (veiculo_id) REFERENCES veiculos(id)
);

-- -----------------------------------------------------------------------------
-- 8. km_logs
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS km_logs (
  id              uuid    NOT NULL DEFAULT gen_random_uuid(),
  empresa_id      uuid    NOT NULL,
  veiculo_id      uuid    NOT NULL,
  motorista_id    uuid    NOT NULL,
  km_lido         numeric NOT NULL,
  foto_urls       text[]  DEFAULT '{}',
  ia_confianca    numeric,
  ia_raw_response jsonb,
  tipo            text    NOT NULL,
  confirmado      bool    DEFAULT false,
  correcao        bool    DEFAULT false,
  correcao_motivo text,
  created_at      timestamptz DEFAULT now(),
  CONSTRAINT km_logs_pkey             PRIMARY KEY (id),
  CONSTRAINT km_logs_tipo_check       CHECK (tipo = ANY (ARRAY['inicial','final','checkpoint','abastecimento','manutencao','pausa'])),
  CONSTRAINT km_logs_km_lido_check    CHECK (km_lido >= 0),
  CONSTRAINT km_logs_ia_confianca_check CHECK (ia_confianca IS NULL OR (ia_confianca >= 0 AND ia_confianca <= 100)),
  CONSTRAINT km_logs_check            CHECK (correcao = false OR correcao_motivo IS NOT NULL),
  CONSTRAINT km_logs_empresa_id_fkey  FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  CONSTRAINT km_logs_veiculo_id_fkey  FOREIGN KEY (veiculo_id) REFERENCES veiculos(id),
  CONSTRAINT km_logs_motorista_id_fkey FOREIGN KEY (motorista_id) REFERENCES motoristas(id)
);

-- -----------------------------------------------------------------------------
-- 9. abastecimentos
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS abastecimentos (
  id              uuid    NOT NULL DEFAULT gen_random_uuid(),
  empresa_id      uuid    NOT NULL,
  veiculo_id      uuid    NOT NULL,
  motorista_id    uuid    NOT NULL,
  km_no_abast     numeric,
  litros          numeric NOT NULL,
  valor_litro     numeric,
  valor_total     numeric NOT NULL,
  posto           text,
  foto_cupom_urls text[]  DEFAULT '{}',
  ia_confianca    numeric,
  ia_raw_response jsonb,
  confirmado      bool    DEFAULT false,
  created_at      timestamptz DEFAULT now(),
  pago            bool    NOT NULL DEFAULT false,
  data_pagamento  date,
  data_vencimento date,
  forma_pagamento text,
  CONSTRAINT abastecimentos_pkey              PRIMARY KEY (id),
  CONSTRAINT abastecimentos_litros_check      CHECK (litros > 0),
  CONSTRAINT abastecimentos_valor_total_check CHECK (valor_total > 0),
  CONSTRAINT abastecimentos_valor_litro_check CHECK (valor_litro IS NULL OR valor_litro > 0),
  CONSTRAINT abastecimentos_km_no_abast_check CHECK (km_no_abast IS NULL OR km_no_abast >= 0),
  CONSTRAINT abastecimentos_ia_confianca_check CHECK (ia_confianca IS NULL OR (ia_confianca >= 0 AND ia_confianca <= 100)),
  CONSTRAINT abastecimentos_empresa_id_fkey   FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  CONSTRAINT abastecimentos_veiculo_id_fkey   FOREIGN KEY (veiculo_id) REFERENCES veiculos(id),
  CONSTRAINT abastecimentos_motorista_id_fkey FOREIGN KEY (motorista_id) REFERENCES motoristas(id)
);

-- -----------------------------------------------------------------------------
-- 10. tipos_manutencao
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tipos_manutencao (
  id                  uuid  NOT NULL DEFAULT gen_random_uuid(),
  empresa_id          uuid,
  codigo              text  NOT NULL,
  nome                text  NOT NULL,
  categoria           text  NOT NULL,
  intervalo_km        int4,
  intervalo_meses     int4,
  criticidade         text  NOT NULL DEFAULT 'media',
  descricao           text,
  custo_estimado_min  numeric,
  custo_estimado_max  numeric,
  ativo               bool  DEFAULT true,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now(),
  CONSTRAINT tipos_manutencao_pkey             PRIMARY KEY (id),
  CONSTRAINT tipos_manutencao_categoria_check  CHECK (categoria = ANY (ARRAY['motor','arrefecimento','transmissao','freios','pneus','suspensao','eletrica','ar_condicionado','cabine','documentacao','outros'])),
  CONSTRAINT tipos_manutencao_criticidade_check CHECK (criticidade = ANY (ARRAY['baixa','media','alta','critica'])),
  CONSTRAINT tipos_manutencao_intervalo_km_check CHECK (intervalo_km IS NULL OR intervalo_km > 0),
  CONSTRAINT tipos_manutencao_intervalo_meses_check CHECK (intervalo_meses IS NULL OR intervalo_meses > 0),
  CONSTRAINT tipos_manutencao_empresa_id_fkey  FOREIGN KEY (empresa_id) REFERENCES empresas(id)
);

-- -----------------------------------------------------------------------------
-- 11. plano_manutencao_veiculo
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS plano_manutencao_veiculo (
  id              uuid  NOT NULL DEFAULT gen_random_uuid(),
  empresa_id      uuid  NOT NULL,
  veiculo_id      uuid  NOT NULL,
  tipo_id         uuid  NOT NULL,
  intervalo_km    int4,
  intervalo_meses int4,
  ativo           bool  DEFAULT true,
  observacoes     text,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  CONSTRAINT plano_manutencao_veiculo_pkey              PRIMARY KEY (id),
  CONSTRAINT plano_manutencao_veiculo_veiculo_id_tipo_id_key UNIQUE (veiculo_id, tipo_id),
  CONSTRAINT plano_manutencao_veiculo_intervalo_km_check CHECK (intervalo_km IS NULL OR intervalo_km > 0),
  CONSTRAINT plano_manutencao_veiculo_intervalo_meses_check CHECK (intervalo_meses IS NULL OR intervalo_meses > 0),
  CONSTRAINT plano_manutencao_veiculo_empresa_id_fkey   FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  CONSTRAINT plano_manutencao_veiculo_veiculo_id_fkey   FOREIGN KEY (veiculo_id) REFERENCES veiculos(id),
  CONSTRAINT plano_manutencao_veiculo_tipo_id_fkey      FOREIGN KEY (tipo_id) REFERENCES tipos_manutencao(id)
);

-- -----------------------------------------------------------------------------
-- 12. manutencoes
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS manutencoes (
  id                  uuid  NOT NULL DEFAULT gen_random_uuid(),
  empresa_id          uuid  NOT NULL,
  veiculo_id          uuid  NOT NULL,
  tipo_id             uuid  NOT NULL,
  descricao           text,
  km_realizada        numeric,
  km_proxima          numeric,
  data_realizada      date,
  data_proxima        date,
  custo_pecas         numeric,
  custo_mao_obra      numeric,
  custo_total         numeric,
  fornecedor          text,
  fornecedor_cnpj     text,
  nota_fiscal_numero  text,
  nota_fiscal_urls    text[]  DEFAULT '{}',
  status              text  NOT NULL DEFAULT 'planejada',
  aprovado_por        uuid,
  aprovado_em         timestamptz,
  observacoes         text,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now(),
  pago                bool  NOT NULL DEFAULT false,
  data_pagamento      date,
  data_vencimento     date,
  forma_pagamento     text,
  CONSTRAINT manutencoes_pkey                 PRIMARY KEY (id),
  CONSTRAINT manutencoes_status_check         CHECK (status = ANY (ARRAY['planejada','pendente','aprovada','em_execucao','concluida','cancelada'])),
  CONSTRAINT manutencoes_km_realizada_check   CHECK (km_realizada IS NULL OR km_realizada >= 0),
  CONSTRAINT manutencoes_custo_pecas_check    CHECK (custo_pecas IS NULL OR custo_pecas >= 0),
  CONSTRAINT manutencoes_custo_mao_obra_check CHECK (custo_mao_obra IS NULL OR custo_mao_obra >= 0),
  CONSTRAINT manutencoes_check                CHECK (km_proxima IS NULL OR km_realizada IS NULL OR km_proxima > km_realizada),
  CONSTRAINT manutencoes_check1               CHECK (data_proxima IS NULL OR data_realizada IS NULL OR data_proxima > data_realizada),
  CONSTRAINT manutencoes_empresa_id_fkey      FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  CONSTRAINT manutencoes_veiculo_id_fkey      FOREIGN KEY (veiculo_id) REFERENCES veiculos(id),
  CONSTRAINT manutencoes_tipo_id_fkey         FOREIGN KEY (tipo_id) REFERENCES tipos_manutencao(id),
  CONSTRAINT manutencoes_aprovado_por_fkey    FOREIGN KEY (aprovado_por) REFERENCES auth.users(id)
);

-- -----------------------------------------------------------------------------
-- 13. avarias
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS avarias (
  id                uuid  NOT NULL DEFAULT gen_random_uuid(),
  empresa_id        uuid  NOT NULL,
  veiculo_id        uuid  NOT NULL,
  motorista_id      uuid,
  descricao_motorista text,
  audio_url         text,
  descricao_ia      text,
  ia_raw_response   jsonb,
  urgencia          text  NOT NULL,
  foto_urls         text[]  DEFAULT '{}',
  status            text  NOT NULL DEFAULT 'aberta',
  resolvido_por     uuid,
  resolvido_em      timestamptz,
  manutencao_id     uuid,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now(),
  CONSTRAINT avarias_pkey             PRIMARY KEY (id),
  CONSTRAINT avarias_urgencia_check   CHECK (urgencia = ANY (ARRAY['baixa','media','alta','critica'])),
  CONSTRAINT avarias_status_check     CHECK (status = ANY (ARRAY['aberta','em_analise','em_reparo','resolvida','descartada'])),
  CONSTRAINT avarias_empresa_id_fkey  FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  CONSTRAINT avarias_veiculo_id_fkey  FOREIGN KEY (veiculo_id) REFERENCES veiculos(id),
  CONSTRAINT avarias_motorista_id_fkey FOREIGN KEY (motorista_id) REFERENCES motoristas(id),
  CONSTRAINT avarias_manutencao_id_fkey FOREIGN KEY (manutencao_id) REFERENCES manutencoes(id),
  CONSTRAINT avarias_resolvido_por_fkey FOREIGN KEY (resolvido_por) REFERENCES auth.users(id)
);

-- -----------------------------------------------------------------------------
-- 14. alertas
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS alertas (
  id              uuid  NOT NULL DEFAULT gen_random_uuid(),
  empresa_id      uuid  NOT NULL,
  veiculo_id      uuid,
  motorista_id    uuid,
  tipo            text  NOT NULL,
  referencia_id   uuid,
  mensagem        text  NOT NULL,
  severidade      text  NOT NULL DEFAULT 'aviso',
  enviado_whatsapp bool  DEFAULT false,
  enviado_em      timestamptz,
  destinatario    text,
  lido            bool  DEFAULT false,
  lido_em         timestamptz,
  created_at      timestamptz DEFAULT now(),
  CONSTRAINT alertas_pkey             PRIMARY KEY (id),
  CONSTRAINT alertas_severidade_check CHECK (severidade = ANY (ARRAY['info','aviso','urgente','critico'])),
  CONSTRAINT alertas_tipo_check       CHECK (tipo = ANY (ARRAY['manutencao_vencida','revisao_proxima','troca_oleo_proxima','cnh_vencendo','ipva_vencendo','licenciamento_vencendo','seguro_vencendo','avaria_critica','km_sem_registro','frete_longo_sem_checkpoint','ia_indisponivel','billing_limite_proximo','checklist_com_problemas','adiantamento_solicitado','imprevisto_viagem','descanso_obrigatorio','jornada_excedida','frete_nao_aceito','novo_pedido_atribuido'])),
  CONSTRAINT alertas_empresa_id_fkey  FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  CONSTRAINT alertas_veiculo_id_fkey  FOREIGN KEY (veiculo_id) REFERENCES veiculos(id),
  CONSTRAINT alertas_motorista_id_fkey FOREIGN KEY (motorista_id) REFERENCES motoristas(id)
);

-- -----------------------------------------------------------------------------
-- 15. sessoes_whatsapp
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessoes_whatsapp (
  id            uuid  NOT NULL DEFAULT gen_random_uuid(),
  empresa_id    uuid,
  whatsapp      text  NOT NULL,
  motorista_id  uuid,
  estado        text  NOT NULL DEFAULT 'novo',
  contexto      jsonb DEFAULT '{}',
  ultimo_contato timestamptz NOT NULL DEFAULT now(),
  -- Sessões expiram após 24h sem contato (ultimo_contato + 24h). Limpeza via cron.
  CONSTRAINT sessoes_whatsapp_pkey           PRIMARY KEY (id),
  CONSTRAINT sessoes_whatsapp_whatsapp_key   UNIQUE (whatsapp),
  CONSTRAINT sessoes_whatsapp_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  CONSTRAINT sessoes_whatsapp_motorista_id_fkey FOREIGN KEY (motorista_id) REFERENCES motoristas(id)
);

-- -----------------------------------------------------------------------------
-- 16. audit_logs
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id          uuid  NOT NULL DEFAULT gen_random_uuid(),
  empresa_id  uuid,
  usuario_id  uuid,
  acao        text  NOT NULL,
  entidade    text  NOT NULL,
  entidade_id uuid,
  descricao   text,
  dados_antes jsonb,
  dados_depois jsonb,
  ip          inet,
  user_agent  text,
  created_at  timestamptz DEFAULT now(),
  CONSTRAINT audit_logs_pkey        PRIMARY KEY (id),
  CONSTRAINT audit_logs_acao_check  CHECK (acao = ANY (ARRAY['create','update','delete','soft_delete','restore','view_sensitive','correcao_km','export_backup','troca_empresa','login','logout','login_failed'])),
  CONSTRAINT audit_logs_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  CONSTRAINT audit_logs_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES auth.users(id)
);

-- -----------------------------------------------------------------------------
-- 17. checklists_diarios
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS checklists_diarios (
  id          uuid  NOT NULL DEFAULT gen_random_uuid(),
  empresa_id  uuid  NOT NULL,
  veiculo_id  uuid  NOT NULL,
  motorista_id uuid NOT NULL,
  data        date  NOT NULL DEFAULT CURRENT_DATE,
  respostas   jsonb NOT NULL DEFAULT '{}',
  problemas   text[]  DEFAULT '{}',
  observacoes text,
  status      text  NOT NULL DEFAULT 'ok',
  created_at  timestamptz DEFAULT now(),
  CONSTRAINT checklists_diarios_pkey              PRIMARY KEY (id),
  CONSTRAINT checklists_diarios_veiculo_id_motorista_id_data_key UNIQUE (veiculo_id, motorista_id, data),
  CONSTRAINT checklists_diarios_status_check      CHECK (status = ANY (ARRAY['ok','com_problemas','incompleto'])),
  CONSTRAINT checklists_diarios_empresa_id_fkey   FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  CONSTRAINT checklists_diarios_veiculo_id_fkey   FOREIGN KEY (veiculo_id) REFERENCES veiculos(id),
  CONSTRAINT checklists_diarios_motorista_id_fkey FOREIGN KEY (motorista_id) REFERENCES motoristas(id)
);

-- -----------------------------------------------------------------------------
-- 18. adiantamentos
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS adiantamentos (
  id                    uuid  NOT NULL DEFAULT gen_random_uuid(),
  empresa_id            uuid  NOT NULL,
  motorista_id          uuid  NOT NULL,
  tipo                  text  NOT NULL,
  valor                 numeric NOT NULL,
  justificativa         text,
  status                text  NOT NULL DEFAULT 'pendente',
  aprovado_por          uuid,
  aprovado_em           timestamptz,
  recusa_motivo         text,
  valor_prestado_contas numeric,
  data_pagamento        timestamptz,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now(),
  CONSTRAINT adiantamentos_pkey           PRIMARY KEY (id),
  CONSTRAINT adiantamentos_tipo_check     CHECK (tipo = ANY (ARRAY['pedagio','alimentacao','hospedagem','reparo_pequeno','outros'])),
  CONSTRAINT adiantamentos_valor_check    CHECK (valor > 0),
  CONSTRAINT adiantamentos_status_check   CHECK (status = ANY (ARRAY['pendente','aprovado','recusado','pago','prestado_contas'])),
  CONSTRAINT adiantamentos_empresa_id_fkey  FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  CONSTRAINT adiantamentos_motorista_id_fkey FOREIGN KEY (motorista_id) REFERENCES motoristas(id),
  CONSTRAINT adiantamentos_aprovado_por_fkey FOREIGN KEY (aprovado_por) REFERENCES auth.users(id)
);

-- -----------------------------------------------------------------------------
-- 19. despesas_veiculo
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS despesas_veiculo (
  id              uuid  NOT NULL DEFAULT gen_random_uuid(),
  empresa_id      uuid  NOT NULL,
  motorista_id    uuid  NOT NULL,
  adiantamento_id uuid,
  tipo            text  NOT NULL,
  valor           numeric NOT NULL,
  local           text,
  data_despesa    timestamptz NOT NULL DEFAULT now(),
  foto_cupom_urls text[]  DEFAULT '{}',
  ia_confianca    numeric,
  ia_raw_response jsonb,
  confirmado      bool  DEFAULT false,
  created_at      timestamptz DEFAULT now(),
  veiculo_id      uuid  NOT NULL,
  -- Despesa do CAMINHÃO (pedágio, alimentação, hospedagem, lavagem, reparo). Sem rateio por pedido.
  CONSTRAINT despesas_frete_pkey            PRIMARY KEY (id),
  CONSTRAINT despesas_frete_tipo_check      CHECK (tipo = ANY (ARRAY['pedagio','alimentacao','hospedagem','lavagem','reparo_pequeno','outros'])),
  CONSTRAINT despesas_frete_valor_check     CHECK (valor > 0),
  CONSTRAINT despesas_frete_ia_confianca_check CHECK (ia_confianca IS NULL OR (ia_confianca >= 0 AND ia_confianca <= 100)),
  CONSTRAINT despesas_frete_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  CONSTRAINT despesas_frete_motorista_id_fkey FOREIGN KEY (motorista_id) REFERENCES motoristas(id),
  CONSTRAINT despesas_frete_veiculo_id_fkey FOREIGN KEY (veiculo_id) REFERENCES veiculos(id) ON DELETE RESTRICT,
  CONSTRAINT despesas_frete_adiantamento_id_fkey FOREIGN KEY (adiantamento_id) REFERENCES adiantamentos(id)
);

-- -----------------------------------------------------------------------------
-- 20. imprevistos
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS imprevistos (
  id                    uuid  NOT NULL DEFAULT gen_random_uuid(),
  empresa_id            uuid  NOT NULL,
  motorista_id          uuid  NOT NULL,
  tipo                  text  NOT NULL,
  descricao             text,
  duracao_estimada_min  int4,
  resolvido             bool  DEFAULT false,
  resolvido_em          timestamptz,
  notificado_gestor     bool  DEFAULT false,
  created_at            timestamptz DEFAULT now(),
  CONSTRAINT imprevistos_pkey                     PRIMARY KEY (id),
  CONSTRAINT imprevistos_tipo_check               CHECK (tipo = ANY (ARRAY['transito','acidente_na_pista','pane','clima','fiscalizacao','outros'])),
  CONSTRAINT imprevistos_duracao_estimada_min_check CHECK (duracao_estimada_min IS NULL OR duracao_estimada_min > 0),
  CONSTRAINT imprevistos_empresa_id_fkey          FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  CONSTRAINT imprevistos_motorista_id_fkey        FOREIGN KEY (motorista_id) REFERENCES motoristas(id)
);

-- -----------------------------------------------------------------------------
-- 21. acertos_motorista
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS acertos_motorista (
  id              uuid    NOT NULL DEFAULT uuid_generate_v4(),
  motorista_id    uuid,
  mes_referencia  date    NOT NULL,
  status          text    NOT NULL DEFAULT 'aberto',
  data_pagamento  date,
  saldo_anterior  numeric DEFAULT 0.00,
  total_fretes    numeric DEFAULT 0.00,
  total_ajustes   numeric DEFAULT 0.00,
  valor_final     numeric DEFAULT 0.00,
  observacoes     text,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  CONSTRAINT acertos_motorista_pkey           PRIMARY KEY (id),
  CONSTRAINT acertos_motorista_motorista_id_fkey FOREIGN KEY (motorista_id) REFERENCES motoristas(id) ON DELETE CASCADE
);

-- -----------------------------------------------------------------------------
-- 22. acerto_ajustes
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS acerto_ajustes (
  id              uuid  NOT NULL DEFAULT uuid_generate_v4(),
  acerto_id       uuid,
  tipo            text  NOT NULL,
  descricao       text  NOT NULL,
  valor           numeric NOT NULL,
  parcela_atual   int4  DEFAULT 1,
  total_parcelas  int4  DEFAULT 1,
  created_at      timestamptz DEFAULT now(),
  CONSTRAINT acerto_ajustes_pkey          PRIMARY KEY (id),
  CONSTRAINT acerto_ajustes_acerto_id_fkey FOREIGN KEY (acerto_id) REFERENCES acertos_motorista(id) ON DELETE CASCADE
);

-- -----------------------------------------------------------------------------
-- 23. entregas
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS entregas (
  id                      uuid  NOT NULL DEFAULT gen_random_uuid(),
  empresa_id              uuid  NOT NULL,
  veiculo_id              uuid,
  motorista_id            uuid,
  cliente_id              uuid,
  origem                  text  NOT NULL,
  destino                 text  NOT NULL,
  km_inicial              numeric,
  km_final                numeric,
  km_total                numeric,
  status                  text  NOT NULL DEFAULT 'agendado',
  data_coleta_prevista    date,
  data_entrega_prevista   date,
  data_inicio             timestamptz,
  data_fim                timestamptz,
  observacoes             text,
  criado_por_usuario_id   uuid,
  criado_via              text  NOT NULL DEFAULT 'web',
  aceito_pelo_motorista_em timestamptz,
  peso_carga_kg           numeric,
  tipo_carga              text,
  created_at              timestamptz DEFAULT now(),
  updated_at              timestamptz DEFAULT now(),
  pedido_id               uuid,
  nome_cliente_avulso     text,
  latitude                numeric,
  longitude               numeric,
  geocode_status          text  DEFAULT 'pendente',
  sequencia               int4,
  janela_inicio           timestamptz,
  janela_fim              timestamptz,
  service_time_seg        int4  DEFAULT 600,
  origem_demanda          text  DEFAULT 'notas_antecipadas',
  executor_tipo           text  DEFAULT 'proprio',
  pedido_pai_id           uuid,
  nfe_chave               text,
  nfe_numero              text,
  nfe_valor               numeric,
  -- ENTREGA = uma parada dentro do pedido. Vem da NFe escaneada.
  CONSTRAINT fretes_pkey              PRIMARY KEY (id),
  CONSTRAINT fretes_status_check      CHECK (status = ANY (ARRAY['agendado','em_andamento','concluido','cancelado'])),
  CONSTRAINT fretes_criado_via_check  CHECK (criado_via = ANY (ARRAY['web','whatsapp_gestor','whatsapp_motorista','api'])),
  CONSTRAINT fretes_km_inicial_check  CHECK (km_inicial >= 0),
  CONSTRAINT fretes_check             CHECK (km_final IS NULL OR km_final > km_inicial),
  CONSTRAINT fretes_check1            CHECK (data_entrega_prevista IS NULL OR data_coleta_prevista IS NULL OR data_entrega_prevista >= data_coleta_prevista),
  CONSTRAINT fretes_check2            CHECK (data_fim IS NULL OR data_inicio IS NULL OR data_fim >= data_inicio),
  CONSTRAINT entregas_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  CONSTRAINT entregas_veiculo_id_fkey FOREIGN KEY (veiculo_id) REFERENCES veiculos(id),
  CONSTRAINT entregas_motorista_id_fkey FOREIGN KEY (motorista_id) REFERENCES motoristas(id),
  CONSTRAINT entregas_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES clientes(id),
  CONSTRAINT entregas_pedido_id_fkey  FOREIGN KEY (pedido_id) REFERENCES pedidos(id),
  CONSTRAINT fretes_criado_por_usuario_id_fkey FOREIGN KEY (criado_por_usuario_id) REFERENCES auth.users(id)
);

-- -----------------------------------------------------------------------------
-- 24. alocacoes
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS alocacoes (
  id          uuid  NOT NULL DEFAULT gen_random_uuid(),
  veiculo_id  uuid  NOT NULL,
  motorista_id uuid,
  status      text  NOT NULL DEFAULT 'operacional',
  km_evento   int4,
  inicio      timestamptz NOT NULL DEFAULT now(),
  fim         timestamptz,
  observacao  text,
  criado_em   timestamptz NOT NULL DEFAULT now(),
  km_fim      int4,
  CONSTRAINT alocacoes_pkey PRIMARY KEY (id)
);

-- -----------------------------------------------------------------------------
-- 25. motorista_veiculo
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS motorista_veiculo (
  id          uuid  NOT NULL DEFAULT gen_random_uuid(),
  empresa_id  uuid  NOT NULL,
  motorista_id uuid NOT NULL,
  veiculo_id  uuid  NOT NULL,
  ativo       bool  NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT motorista_veiculo_pkey                   PRIMARY KEY (id),
  CONSTRAINT motorista_veiculo_empresa_id_motorista_id_key UNIQUE (empresa_id, motorista_id),
  CONSTRAINT motorista_veiculo_empresa_id_fkey        FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  CONSTRAINT motorista_veiculo_motorista_id_fkey      FOREIGN KEY (motorista_id) REFERENCES motoristas(id),
  CONSTRAINT motorista_veiculo_veiculo_id_fkey        FOREIGN KEY (veiculo_id) REFERENCES veiculos(id)
);

-- -----------------------------------------------------------------------------
-- 26. geocode_cache
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS geocode_cache (
  chave               text  NOT NULL,
  lat                 numeric NOT NULL,
  lng                 numeric NOT NULL,
  cep                 text,
  logradouro          text,
  numero              text,
  bairro              text,
  cidade              text,
  uf                  text,
  precisao            text,
  endereco_formatado  text,
  fonte               text  NOT NULL DEFAULT 'google',
  criado_em           timestamptz NOT NULL DEFAULT now(),
  -- Cache de geocoding (Google). Lido antes de chamar a API — hit não gera custo.
  CONSTRAINT geocode_cache_pkey PRIMARY KEY (chave)
);

-- -----------------------------------------------------------------------------
-- 27. geocode_uso
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS geocode_uso (
  mes           text  NOT NULL,
  total         int4  NOT NULL DEFAULT 0,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  -- Chamadas reais a Google Geocoding por mês (global da frota).
  CONSTRAINT geocode_uso_pkey PRIMARY KEY (mes)
);

-- -----------------------------------------------------------------------------
-- 28. cliente_preferencias
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cliente_preferencias (
  id                  uuid  NOT NULL DEFAULT gen_random_uuid(),
  cliente_id          uuid  NOT NULL,
  empresa_id          uuid  NOT NULL,
  posicao_preferida   text  NOT NULL DEFAULT 'qualquer',
  janela_horario      jsonb,
  tempo_descarga_min  int4,
  observacao          text,
  criada_em           timestamptz NOT NULL DEFAULT now(),
  atualizada_em       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cliente_preferencias_pkey          PRIMARY KEY (id),
  CONSTRAINT cli_pref_posicao_valida            CHECK (posicao_preferida = ANY (ARRAY['primeira','ultima','qualquer']))
);

-- -----------------------------------------------------------------------------
-- 29. pedido_numeracao
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pedido_numeracao (
  ano     int4  NOT NULL,
  proximo int4  NOT NULL,
  -- Próxima sequência do número de pedido por ano (AAAA.SSSS começa em 1001)
  CONSTRAINT pedido_numeracao_pkey PRIMARY KEY (ano)
);

-- -----------------------------------------------------------------------------
-- 30. despesas_avulsas
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS despesas_avulsas (
  id              uuid  NOT NULL DEFAULT gen_random_uuid(),
  empresa_id      uuid  NOT NULL,
  descricao       text  NOT NULL,
  categoria       text  NOT NULL,
  valor           numeric NOT NULL,
  data_vencimento date  NOT NULL,
  data_pagamento  date,
  pago            bool  NOT NULL DEFAULT false,
  forma_pagamento text,
  fornecedor      text,
  observacoes     text,
  criado_por      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT despesas_avulsas_pkey            PRIMARY KEY (id),
  CONSTRAINT despesas_avulsas_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  CONSTRAINT despesas_avulsas_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES auth.users(id)
);

-- -----------------------------------------------------------------------------
-- 31. recorrencias_financeiras
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS recorrencias_financeiras (
  id              uuid  NOT NULL DEFAULT gen_random_uuid(),
  empresa_id      uuid  NOT NULL,
  descricao       text  NOT NULL,
  categoria       text  NOT NULL,
  tipo            text  NOT NULL,
  valor           numeric NOT NULL,
  dia_vencimento  int2  NOT NULL,
  motorista_id    uuid,
  ativo           bool  NOT NULL DEFAULT true,
  data_inicio     date  NOT NULL DEFAULT CURRENT_DATE,
  data_fim        date,
  observacoes     text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recorrencias_financeiras_pkey                PRIMARY KEY (id),
  CONSTRAINT recorrencias_financeiras_dia_vencimento_check CHECK (dia_vencimento >= 1 AND dia_vencimento <= 31),
  CONSTRAINT recorrencias_financeiras_empresa_id_fkey     FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  CONSTRAINT recorrencias_financeiras_motorista_id_fkey   FOREIGN KEY (motorista_id) REFERENCES motoristas(id)
);

-- -----------------------------------------------------------------------------
-- 32. notas_capturadas
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notas_capturadas (
  id            uuid  NOT NULL DEFAULT gen_random_uuid(),
  motorista_id  uuid  NOT NULL,
  empresa_id    uuid  NOT NULL,
  cep           text  NOT NULL,
  numero        text  NOT NULL,
  endereco      jsonb NOT NULL,
  latitude      numeric,
  longitude     numeric,
  observacao    text,
  status        text  NOT NULL DEFAULT 'capturada',
  capturado_em  timestamptz NOT NULL DEFAULT now(),
  sincronizado_em timestamptz,
  pedido_id     uuid,
  -- NFs capturadas offline pelo motorista (mobile/captura-notas).
  CONSTRAINT notas_capturadas_pkey    PRIMARY KEY (id),
  CONSTRAINT notas_cep_formato        CHECK (cep = '' OR cep ~ '^[0-9]{8}$'),
  CONSTRAINT notas_status_valido      CHECK (status = ANY (ARRAY['capturada','geocodificada','em_rota','concluida','cancelada']))
);

-- -----------------------------------------------------------------------------
-- 33. rotas_otimizadas
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rotas_otimizadas (
  id                  uuid  NOT NULL DEFAULT gen_random_uuid(),
  motorista_id        uuid  NOT NULL,
  empresa_id          uuid  NOT NULL,
  data                date  NOT NULL DEFAULT CURRENT_DATE,
  distancia_total_km  numeric,
  tempo_total_min     int4,
  status              text  NOT NULL DEFAULT 'rascunho',
  otimizada_em        timestamptz,
  criada_em           timestamptz NOT NULL DEFAULT now(),
  pedido_id           uuid,
  -- Rotas geradas pelo VROOM (POST /api/routing/otimizar). pedido_id NULL = captura solta.
  CONSTRAINT rotas_otimizadas_pkey        PRIMARY KEY (id),
  CONSTRAINT rotas_status_valido          CHECK (status = ANY (ARRAY['rascunho','otimizada','em_andamento','concluida','cancelada']))
);

-- -----------------------------------------------------------------------------
-- 34. paradas
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS paradas (
  id                uuid  NOT NULL DEFAULT gen_random_uuid(),
  rota_id           uuid  NOT NULL,
  nota_id           uuid,
  ordem             int4  NOT NULL,
  endereco          jsonb NOT NULL,
  latitude          numeric NOT NULL,
  longitude         numeric NOT NULL,
  fixada            bool  NOT NULL DEFAULT false,
  janela_horario    jsonb,
  tempo_descarga_min int4 NOT NULL DEFAULT 5,
  observacao        text,
  concluida_em      timestamptz,
  pedido_id         uuid,
  entrega_id        uuid,
  -- Paradas da rota com snapshot jsonb do endereço.
  CONSTRAINT paradas_pkey           PRIMARY KEY (id),
  CONSTRAINT paradas_rota_ordem_unica UNIQUE (rota_id, ordem),
  CONSTRAINT paradas_ordem_positiva CHECK (ordem > 0),
  CONSTRAINT paradas_rota_id_fkey   FOREIGN KEY (rota_id) REFERENCES rotas_otimizadas(id) ON DELETE CASCADE,
  CONSTRAINT paradas_nota_id_fkey   FOREIGN KEY (nota_id) REFERENCES notas_capturadas(id) ON DELETE SET NULL
);

-- -----------------------------------------------------------------------------
-- 35. pedido_motoristas
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pedido_motoristas (
  id            uuid  NOT NULL DEFAULT gen_random_uuid(),
  pedido_id     uuid  NOT NULL,
  motorista_id  uuid  NOT NULL,
  empresa_id    uuid  NOT NULL,
  km_entrada    numeric,
  km_saida      numeric,
  data_entrada  timestamptz NOT NULL DEFAULT now(),
  data_saida    timestamptz,
  motivo_troca  text,
  ativo         bool  NOT NULL DEFAULT true,
  created_at    timestamptz DEFAULT now(),
  CONSTRAINT viagem_motoristas_pkey           PRIMARY KEY (id),
  CONSTRAINT pedido_motoristas_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE,
  CONSTRAINT pedido_motoristas_motorista_id_fkey FOREIGN KEY (motorista_id) REFERENCES motoristas(id),
  CONSTRAINT pedido_motoristas_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES empresas(id)
);

-- -----------------------------------------------------------------------------
-- 36. pedido_parcelas
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pedido_parcelas (
  id              uuid  NOT NULL DEFAULT gen_random_uuid(),
  pedido_id       uuid  NOT NULL,
  empresa_id      uuid  NOT NULL,
  numero          int4  NOT NULL,
  valor           numeric NOT NULL,
  vencimento      date,
  pago            bool  NOT NULL DEFAULT false,
  data_pagamento  date,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  -- Parcelas do pagamento do pedido. Pedido sem linhas = pagamento único.
  CONSTRAINT pedido_parcelas_pkey PRIMARY KEY (id)
);

-- -----------------------------------------------------------------------------
-- 37. locais_carregamento
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS locais_carregamento (
  id          uuid  NOT NULL DEFAULT gen_random_uuid(),
  empresa_id  uuid  NOT NULL,
  cliente_id  uuid  NOT NULL,
  nome        text  NOT NULL,
  endereco    text  NOT NULL,
  principal   bool  DEFAULT false,
  ativo       bool  DEFAULT true,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  -- Endereços de coleta salvos por cliente (chips no Novo Pedido).
  CONSTRAINT locais_carregamento_pkey           PRIMARY KEY (id),
  CONSTRAINT locais_carregamento_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  CONSTRAINT locais_carregamento_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE
);

-- FK pedidos.local_carregamento_id → locais_carregamento
ALTER TABLE pedidos ADD CONSTRAINT pedidos_local_carregamento_id_fkey FOREIGN KEY (local_carregamento_id) REFERENCES locais_carregamento(id);

-- -----------------------------------------------------------------------------
-- 38. cliente_contatos
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cliente_contatos (
  id          uuid  NOT NULL DEFAULT gen_random_uuid(),
  empresa_id  uuid  NOT NULL,
  cliente_id  uuid  NOT NULL,
  nome        text  NOT NULL,
  cargo       text,
  telefone    text,
  whatsapp    text,
  email       text,
  principal   bool  DEFAULT false,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  CONSTRAINT cliente_contatos_pkey            PRIMARY KEY (id),
  CONSTRAINT cliente_contatos_empresa_id_fkey FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
  CONSTRAINT cliente_contatos_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE
);

-- -----------------------------------------------------------------------------
-- 39. rotas
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rotas (
  id                  uuid  NOT NULL DEFAULT gen_random_uuid(),
  empresa_id          uuid,
  pedido_id           uuid,
  veiculo_id          uuid,
  motorista_id        uuid,
  data_planejada      date,
  status              text  DEFAULT 'rascunho',
  km_estimado         numeric,
  tempo_estimado_min  numeric,
  polyline            text,
  vroom_payload       jsonb,
  executor_tipo       text  DEFAULT 'proprio',
  criada_em           timestamptz DEFAULT now(),
  otimizada_em        timestamptz,
  -- EMPRESA 1+: 1 rota por veículo dentro do pedido.
  CONSTRAINT rotas_pkey PRIMARY KEY (id)
);

-- -----------------------------------------------------------------------------
-- 40. pod
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pod (
  id            uuid  NOT NULL DEFAULT gen_random_uuid(),
  entrega_id    uuid,
  empresa_id    uuid,
  foto_url      text,
  assinatura_url text,
  latitude      numeric,
  longitude     numeric,
  capturado_em  timestamptz DEFAULT now(),
  observacao    text,
  recebedor     text,
  tipo_ocorrencia text DEFAULT 'entregue',
  -- Proof of Delivery por parada (foto+GPS+timestamp). Reusável nos 4 modelos.
  CONSTRAINT pod_pkey PRIMARY KEY (id)
);

-- -----------------------------------------------------------------------------
-- 41. whatsapp_historico
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS whatsapp_historico (
  id          uuid  NOT NULL DEFAULT gen_random_uuid(),
  telefone    text  NOT NULL,
  role        text  NOT NULL,
  texto       text  NOT NULL,
  metadata    jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_historico_pkey        PRIMARY KEY (id),
  CONSTRAINT whatsapp_historico_role_check  CHECK (role = ANY (ARRAY['user','model']))
);

-- -----------------------------------------------------------------------------
-- 42. bot_metricas
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bot_metricas (
  id              uuid  NOT NULL DEFAULT gen_random_uuid(),
  telefone        text  NOT NULL,
  empresa_id      uuid,
  modo            text  NOT NULL,
  fast_path_matcher text,
  modelo          text,
  tokens_in       int4,
  tokens_out      int4,
  cached_tokens   int4,
  tools_chamadas  text[],
  tool_rounds     int4,
  latency_ms      int4,
  sucesso         bool  NOT NULL DEFAULT true,
  erro            text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bot_metricas_pkey        PRIMARY KEY (id),
  CONSTRAINT bot_metricas_modo_check  CHECK (modo = ANY (ARRAY['fast_path','gemini_texto','gemini_audio']))
);

-- -----------------------------------------------------------------------------
-- 43. bot_msgs_processadas
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bot_msgs_processadas (
  wamid         text  NOT NULL,
  processado_em timestamptz NOT NULL DEFAULT now(),
  status        text  NOT NULL DEFAULT 'ok',
  CONSTRAINT bot_msgs_processadas_pkey PRIMARY KEY (wamid)
);

-- -----------------------------------------------------------------------------
-- 44. bot_contexto_conversa
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bot_contexto_conversa (
  telefone      text  NOT NULL,
  veiculo_id    uuid,
  apelido       text,
  expira_em     timestamptz NOT NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bot_contexto_conversa_pkey PRIMARY KEY (telefone)
);

-- -----------------------------------------------------------------------------
-- 45. bot_estado_pendente
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS bot_estado_pendente (
  telefone  text  NOT NULL,
  tipo      text  NOT NULL,
  dados     jsonb NOT NULL,
  expira_em timestamptz NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bot_estado_pendente_pkey PRIMARY KEY (telefone)
);

-- -----------------------------------------------------------------------------
-- 46. contexto_ia
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contexto_ia (
  id        uuid  NOT NULL DEFAULT gen_random_uuid(),
  titulo    text  NOT NULL,
  conteudo  text  NOT NULL,
  ativo     bool  NOT NULL DEFAULT true,
  ordem     int4  NOT NULL DEFAULT 0,
  criado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contexto_ia_pkey PRIMARY KEY (id)
);

-- -----------------------------------------------------------------------------
-- 47. lembretes
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lembretes (
  id                  uuid  NOT NULL DEFAULT gen_random_uuid(),
  empresa_id          uuid,
  usuario_id          uuid,
  texto               text  NOT NULL,
  origem              text  NOT NULL DEFAULT 'whatsapp',
  criado_em           timestamptz NOT NULL DEFAULT now(),
  ciente_em           timestamptz,
  ciente_por          uuid,
  criado_por_nome     text,
  criado_por_telefone text,
  CONSTRAINT lembretes_pkey PRIMARY KEY (id)
);

-- -----------------------------------------------------------------------------
-- 47b. lembrete_notas (providências anotadas ao dar ciente — migration_lembrete_notas)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lembrete_notas (
  id          uuid        NOT NULL DEFAULT gen_random_uuid(),
  lembrete_id uuid        NOT NULL,
  nota        text        NOT NULL,
  criado_em   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lembrete_notas_pkey PRIMARY KEY (id),
  CONSTRAINT lembrete_notas_lembrete_id_fkey
    FOREIGN KEY (lembrete_id) REFERENCES lembretes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS lembrete_notas_lembrete
  ON lembrete_notas (lembrete_id, criado_em);

-- -----------------------------------------------------------------------------
-- 48. regras
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS regras (
  id                  uuid    NOT NULL DEFAULT gen_random_uuid(),
  nome                text    NOT NULL,
  tipo                text    NOT NULL DEFAULT 'consultar',
  ativa               bool    NOT NULL DEFAULT true,
  prioridade          int4    NOT NULL DEFAULT 0,
  frases_exemplo      text[]  NOT NULL DEFAULT '{}',
  frases_negativas    text[]  NOT NULL DEFAULT '{}',
  empresas_alvo       uuid[]  NOT NULL DEFAULT '{}',
  quem_pode_disparar  text[]  NOT NULL DEFAULT '{qualquer}',
  resposta            text,
  campos              jsonb   NOT NULL DEFAULT '[]',
  escopo_dados        jsonb   NOT NULL DEFAULT '{}',
  exige_confirmacao   bool    NOT NULL DEFAULT false,
  observacao          text,
  versao              int4    NOT NULL DEFAULT 1,
  criado_em           timestamptz NOT NULL DEFAULT now(),
  atualizado_em       timestamptz NOT NULL DEFAULT now(),
  gatilhos            text[]  NOT NULL DEFAULT '{}',
  fixa                bool    NOT NULL DEFAULT false,
  acoes               text[]  NOT NULL DEFAULT '{}',
  gatilho_inicio      bool    NOT NULL DEFAULT false,
  CONSTRAINT regras_pkey PRIMARY KEY (id)
);

-- -----------------------------------------------------------------------------
-- 49. cep_cache
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cep_cache (
  cep           text  NOT NULL,
  logradouro    text,
  bairro        text,
  cidade        text  NOT NULL,
  uf            text  NOT NULL,
  consultado_em timestamptz NOT NULL DEFAULT now(),
  -- Cache de consultas ao ViaCEP. CEPs não mudam quase nunca, TTL longo.
  CONSTRAINT cep_cache_pkey       PRIMARY KEY (cep),
  CONSTRAINT cep_cache_formato    CHECK (cep ~ '^[0-9]{8}$'),
  CONSTRAINT cep_cache_uf_formato CHECK (length(uf) = 2)
);

-- -----------------------------------------------------------------------------
-- 50. endereco_validacao_cache
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS endereco_validacao_cache (
  id          uuid  NOT NULL DEFAULT gen_random_uuid(),
  rua_norm    text  NOT NULL,
  cidade      text  NOT NULL,
  uf          text  NOT NULL,
  dados       jsonb NOT NULL,
  confianca   text  NOT NULL,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT endereco_validacao_cache_pkey                    PRIMARY KEY (id),
  CONSTRAINT endereco_validacao_cache_rua_norm_cidade_uf_key  UNIQUE (rua_norm, cidade, uf)
);

-- -----------------------------------------------------------------------------
-- 51. coordenadas_aprendidas
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS coordenadas_aprendidas (
  empresa_id    uuid    NOT NULL,
  chave         text    NOT NULL,
  lat           numeric NOT NULL,
  lng           numeric NOT NULL,
  amostras      int4    NOT NULL DEFAULT 1,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  criado_em     timestamptz NOT NULL DEFAULT now(),
  -- Coordenada GPS aprendida pela frota por endereço. Média ponderada por amostras.
  CONSTRAINT coordenadas_aprendidas_pkey PRIMARY KEY (empresa_id, chave)
);

-- -----------------------------------------------------------------------------
-- 52. telefones
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS telefones (
  id              uuid  NOT NULL DEFAULT gen_random_uuid(),
  telefone        text  NOT NULL,
  telefone_exibicao text,
  usuario_id      uuid,
  usuario_nome    text,
  papel           text,
  ativo           bool  NOT NULL DEFAULT true,
  anotar          bool  NOT NULL DEFAULT true,
  permissoes      jsonb NOT NULL DEFAULT '{}',
  criado_em       timestamptz NOT NULL DEFAULT now(),
  atualizado_em   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT telefones_pkey PRIMARY KEY (id)
);

-- -----------------------------------------------------------------------------
-- 53. prints_zap
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS prints_zap (
  id        uuid  NOT NULL DEFAULT gen_random_uuid(),
  telefone  text,
  nome      text,
  legenda   text,
  url       text  NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  -- Imagens recebidas pelo bot do WhatsApp, arquivadas no R2 (prints/).
  CONSTRAINT prints_zap_pkey PRIMARY KEY (id)
);

-- =============================================================================
-- VIEWS
-- =============================================================================

CREATE OR REPLACE VIEW pedidos_com_resultado AS
  SELECT id, empresa_id, motorista_id, veiculo_id, status,
    data_inicio_prevista, data_inicio_real, data_fim_prevista, data_fim_real,
    km_inicial, km_final,
    COALESCE(km_final - km_inicial, 0) AS km_total,
    valor_pedido AS receita, forma_pagamento, pago, data_pagamento,
    (SELECT count(*) FROM entregas e WHERE e.pedido_id = p.id) AS qtd_entregas,
    created_at, updated_at
  FROM pedidos p;

CREATE OR REPLACE VIEW proxima_manutencao_veiculo AS
  SELECT v.id AS veiculo_id, v.empresa_id, v.placa, v.km_atual,
    t.id AS tipo_id, t.nome AS tipo_nome, t.categoria, t.criticidade,
    COALESCE(pmv.intervalo_km, t.intervalo_km) AS intervalo_km,
    COALESCE(pmv.intervalo_meses, t.intervalo_meses) AS intervalo_meses,
    ult.km_realizada AS km_ultima, ult.data_realizada AS data_ultima,
    CASE WHEN ult.id IS NULL THEN NULL::numeric
         WHEN COALESCE(pmv.intervalo_km, t.intervalo_km) IS NOT NULL
           THEN ult.km_realizada + COALESCE(pmv.intervalo_km, t.intervalo_km)::numeric
         ELSE NULL::numeric END AS km_proxima,
    CASE WHEN ult.id IS NULL THEN NULL::timestamp
         WHEN COALESCE(pmv.intervalo_meses, t.intervalo_meses) IS NOT NULL
           THEN ult.data_realizada + (COALESCE(pmv.intervalo_meses, t.intervalo_meses) || ' months')::interval
         ELSE NULL::timestamp END AS data_proxima,
    CASE WHEN ult.id IS NULL THEN 'nunca_feito'
         WHEN COALESCE(pmv.intervalo_km, t.intervalo_km) IS NOT NULL
          AND v.km_atual > ult.km_realizada + COALESCE(pmv.intervalo_km, t.intervalo_km)::numeric THEN 'vencido'
         WHEN COALESCE(pmv.intervalo_meses, t.intervalo_meses) IS NOT NULL
          AND now() > ult.data_realizada + (COALESCE(pmv.intervalo_meses, t.intervalo_meses) || ' months')::interval THEN 'vencido'
         WHEN COALESCE(pmv.intervalo_km, t.intervalo_km) IS NOT NULL
          AND v.km_atual > ult.km_realizada + COALESCE(pmv.intervalo_km, t.intervalo_km)::numeric * 0.9 THEN 'proximo'
         WHEN COALESCE(pmv.intervalo_meses, t.intervalo_meses) IS NOT NULL
          AND now() > ult.data_realizada + ((COALESCE(pmv.intervalo_meses, t.intervalo_meses) - 1) || ' months')::interval THEN 'proximo'
         ELSE 'ok' END AS status,
    CASE WHEN ult.id IS NOT NULL AND COALESCE(pmv.intervalo_km, t.intervalo_km) IS NOT NULL
           THEN ult.km_realizada + COALESCE(pmv.intervalo_km, t.intervalo_km)::numeric - v.km_atual
         ELSE NULL::numeric END AS km_faltando
  FROM veiculos v
  CROSS JOIN tipos_manutencao t
  LEFT JOIN plano_manutencao_veiculo pmv ON pmv.veiculo_id = v.id AND pmv.tipo_id = t.id
  LEFT JOIN LATERAL (
    SELECT * FROM manutencoes m
    WHERE m.veiculo_id = v.id AND m.tipo_id = t.id AND m.status = 'concluida'
    ORDER BY m.data_realizada DESC NULLS LAST, m.km_realizada DESC NULLS LAST
    LIMIT 1
  ) ult ON true
  WHERE v.ativo = true AND t.ativo = true
    AND (t.empresa_id IS NULL OR t.empresa_id = v.empresa_id)
    AND COALESCE(pmv.ativo, true) = true;

CREATE OR REPLACE VIEW status_operacional_veiculos AS
  SELECT v.id AS veiculo_id, v.empresa_id, v.placa, v.modelo, v.ativo,
    p.id AS pedido_id, p.status AS status_pedido, p.motorista_id AS motorista_atual_id
  FROM veiculos v
  LEFT JOIN pedidos p ON p.veiculo_id = v.id
    AND p.status = ANY (ARRAY['em_andamento','agendada','agendado']);

CREATE OR REPLACE VIEW kpi_mensal_empresa AS
  WITH base AS (
    SELECT empresa_id,
      date_trunc('month', COALESCE(data_inicio_real, data_inicio_prevista::timestamptz, created_at::date::timestamptz))::date AS mes_referencia,
      count(*) AS qtd_pedidos,
      COALESCE(sum(valor_pedido), 0) AS receita_total
    FROM pedidos GROUP BY empresa_id, 2
  ), combustivel AS (
    SELECT empresa_id,
      date_trunc('month', created_at)::date AS mes_referencia,
      COALESCE(sum(valor_total), 0) AS custo_combustivel
    FROM abastecimentos GROUP BY empresa_id, 2
  ), despesas AS (
    SELECT empresa_id,
      date_trunc('month', data_despesa::timestamp)::date AS mes_referencia,
      COALESCE(sum(valor), 0) AS custo_despesas
    FROM despesas_veiculo GROUP BY empresa_id, 2
  )
  SELECT b.empresa_id, b.mes_referencia, b.qtd_pedidos, b.receita_total,
    COALESCE(c.custo_combustivel, 0) AS custo_combustivel,
    COALESCE(d.custo_despesas, 0) AS custo_despesas
  FROM base b
  LEFT JOIN combustivel c ON c.empresa_id = b.empresa_id AND c.mes_referencia = b.mes_referencia
  LEFT JOIN despesas d ON d.empresa_id = b.empresa_id AND d.mes_referencia = b.mes_referencia;

CREATE OR REPLACE VIEW kpi_mensal_motorista AS
  SELECT motorista_id, empresa_id,
    date_trunc('month', COALESCE(data_inicio_real, data_inicio_prevista::timestamptz, created_at::date::timestamptz))::date AS mes_referencia,
    count(*) AS qtd_pedidos,
    count(*) FILTER (WHERE status = ANY (ARRAY['concluida','concluido'])) AS qtd_pedidos_concluidos,
    COALESCE(sum(km_final - km_inicial), 0) AS km_rodado
  FROM pedidos p WHERE motorista_id IS NOT NULL
  GROUP BY motorista_id, empresa_id, 3;

-- =============================================================================
-- SEEDS ESSENCIAIS
-- =============================================================================

-- pedido_numeracao: inicializa sequência do ano corrente
INSERT INTO pedido_numeracao (ano, proximo)
VALUES (EXTRACT(year FROM CURRENT_DATE)::int4, 1001)
ON CONFLICT (ano) DO NOTHING;

-- =============================================================================
-- ÍNDICES PRINCIPAIS
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_alertas_empresa_lido ON alertas (empresa_id, lido);
CREATE INDEX IF NOT EXISTS idx_alertas_created_at ON alertas (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bot_metricas_telefone ON bot_metricas (telefone);
CREATE INDEX IF NOT EXISTS idx_bot_metricas_created_at ON bot_metricas (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bot_msgs_processadas_processado_em ON bot_msgs_processadas (processado_em);
CREATE INDEX IF NOT EXISTS idx_entregas_pedido_id ON entregas (pedido_id);
CREATE INDEX IF NOT EXISTS idx_entregas_status ON entregas (status);
CREATE INDEX IF NOT EXISTS idx_manutencoes_veiculo_status ON manutencoes (veiculo_id, status);
CREATE INDEX IF NOT EXISTS idx_pedidos_empresa_status ON pedidos (empresa_id, status);
CREATE INDEX IF NOT EXISTS idx_pedidos_motorista ON pedidos (motorista_id);
CREATE INDEX IF NOT EXISTS idx_sessoes_whatsapp_ultimo_contato ON sessoes_whatsapp (ultimo_contato);
CREATE INDEX IF NOT EXISTS idx_whatsapp_historico_telefone ON whatsapp_historico (telefone, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alocacoes_veiculo_status ON alocacoes (veiculo_id, status);
CREATE INDEX IF NOT EXISTS idx_regras_ativa_prioridade ON regras (ativa, prioridade DESC);

-- =============================================================================
-- ⚠️  RLS — NÃO ATIVAR AINDA
-- =============================================================================
-- RLS está desabilitado em todas as 53 tabelas.
-- O sistema usa service_role no backend (sem risco imediato).
-- Ativar RLS sem policies bloqueia tudo — planejar policies antes.
-- Fase de RLS planejada para: implementação multi-tenant.
--
-- SQL de ativação (executar APENAS após criar as policies):
-- ALTER TABLE empresas ENABLE ROW LEVEL SECURITY; -- ... (53 tabelas)
-- =============================================================================
