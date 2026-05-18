# 🚛 PLANO DE PROJETO — Sistema de Gestão de Frota Inteligente

> **Versão:** 1.0 | **Data:** 2026-05-18 | **Status:** Em planejamento

---

## 1. VISÃO GERAL

Sistema de gestão de frota com foco em **automação inteligente**. O gestor acessa um dashboard web; os motoristas interagem exclusivamente via **WhatsApp Bot** com mensagens interativas (listas, botões) + **IA** para extrair dados de fotos e áudios.

**Frota:** 10 caminhões | **Motoristas:** via WhatsApp | **Gestor:** via Web (Next.js)

### 1.1 Filosofia do Sistema ⭐

> **Este não é um sistema de logística super-controlador. É uma ferramenta financeira simples com automação que tira atrito do dia-a-dia.**

| O que é | O que NÃO é |
|---|---|
| ✅ Foco em **custos × lucros** por viagem, veículo e motorista | ❌ Micro-gerenciamento de cada minuto do motorista |
| ✅ WhatsApp ultra-simples para motoristas (botões + foto) | ❌ App proprietário que motorista limitado não usa |
| ✅ Dashboard com 6 módulos, Home mobile-first em 1 tela | ❌ 15+ telas, dashboards complexos, gráficos por toda parte |
| ✅ **Avisa, não impõe** — gestor decide com a informação | ❌ Sistema bloqueia ação do motorista quando algo dá errado |
| ✅ Automação onde dá ganho real (OCR, classificação, alertas) | ❌ Automação por automação que ninguém usa |
| ✅ Cadastros completos e validações no banco | ❌ Burocracia que o usuário precisa preencher manualmente |

**Pergunta-norte:** *"Isso me ajuda a saber se a operação está dando lucro ou prejuízo?"* Se sim, está no escopo. Se não, fica de fora ou vira melhoria futura.

---

## 2. STACK TECNOLÓGICA

| Camada | Tecnologia |
|---|---|
| Framework | Next.js 14+ (App Router) + React |
| Estilização | TailwindCSS |
| Banco de Dados | Supabase (PostgreSQL) |
| Autenticação | Supabase Auth |
| Storage (imagens) | Cloudflare R2 |
| Deploy | Vercel |
| Monitoramento | Sentry |
| IA (visão + texto + áudio) | **OpenAI** — `gpt-4o-mini` (OCR), `gpt-4o` (avaria), `whisper-1` (áudio) — provedor único ✅ |
| WhatsApp | **Meta Cloud API** ✅ |

---

## 3. ARQUITETURA DO SISTEMA

```
┌─────────────────────────────────────────────────────────┐
│                    MOTORISTA (WhatsApp)                  │
└──────────────────────────┬──────────────────────────────┘
                           │ Mensagem/Foto/Áudio
                           ▼
┌─────────────────────────────────────────────────────────┐
│              API Webhook (Next.js Route Handler)         │
│  /api/whatsapp/webhook                                   │
└──────┬──────────────────┬────────────────────────────────┘
       │                  │
       ▼                  ▼
┌──────────────┐  ┌───────────────────────────────────────┐
│ Session Mgr  │  │         AI Service Layer               │
│ (Supabase)   │  │  - GPT-4o Vision (OCR odômetro)       │
│              │  │  - GPT-4o (análise de avaria/áudio)    │
└──────┬───────┘  └────────────────────┬──────────────────┘
       │                               │
       ▼                               ▼
┌─────────────────────────────────────────────────────────┐
│                  Supabase (PostgreSQL)                   │
│   veiculos | motoristas | fretes | km_logs |            │
│   manutencoes | avarias | alertas | sessoes_whatsapp     │
└──────────────────────────┬──────────────────────────────┘
                           │
       ┌───────────────────┴───────────────────┐
       ▼                                       ▼
┌──────────────┐                    ┌──────────────────────┐
│ Cloudflare   │                    │   Dashboard Web       │
│ R2 (fotos)   │                    │   Next.js App Router  │
└──────────────┘                    │   (Gestor only)       │
                                    └──────────────────────┘
```

---

## 4. ESQUEMA DO BANCO DE DADOS (Supabase / PostgreSQL)

### 4.1 Tabela: `empresas`
```sql
id                  uuid PRIMARY KEY DEFAULT gen_random_uuid()
nome_fantasia       text NOT NULL
razao_social        text
cnpj                text UNIQUE NOT NULL CHECK (cnpj ~ '^\d{14}$')
inscricao_estadual  text
telefone            text CHECK (telefone ~ '^\d{10,11}$')
email               text CHECK (email ~* '^[^@]+@[^@]+\.[^@]+$')

-- Endereço (campos separados, autocompletados via ViaCEP)
cep                 text CHECK (cep ~ '^\d{8}$')
logradouro          text
numero              text
complemento         text
bairro              text
cidade              text
uf                  text CHECK (uf ~ '^[A-Z]{2}$')

logo_url            text                          -- URL no R2
created_at          timestamptz DEFAULT now()
updated_at          timestamptz DEFAULT now()
```

### 4.2 Tabela: `veiculos`
```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
empresa_id      uuid NOT NULL REFERENCES empresas(id)

-- Identificação
placa           text UNIQUE NOT NULL CHECK (placa ~ '^[A-Z]{3}-?\d[A-Z0-9]\d{2}$')  -- aceita Mercosul
apelido         text                           -- "Truck do João", "Caminhão 01"
marca           text NOT NULL                  -- Volvo, Scania, Mercedes...
modelo          text NOT NULL                  -- FH 540, R 450...
ano             int NOT NULL CHECK (ano BETWEEN 1990 AND EXTRACT(YEAR FROM CURRENT_DATE)::int + 1)
cor             text
chassi          text UNIQUE NOT NULL CHECK (length(chassi) = 17)
renavam         text UNIQUE NOT NULL CHECK (renavam ~ '^\d{9,11}$')

-- Categoria/Capacidade
tipo            text NOT NULL CHECK (tipo IN ('caminhao','van','carro','utilitario'))
categoria       text CHECK (categoria IN ('toco','truck','bitruck','carreta','cavalo','3_4'))
eixos           smallint CHECK (eixos > 0)
capacidade_carga_kg numeric(10,2)
pbt_kg          numeric(10,2)                  -- Peso Bruto Total

-- Combustível
combustivel     text NOT NULL CHECK (combustivel IN ('diesel','diesel_s10','gasolina','etanol','flex'))
capacidade_tanque numeric(6,1)                 -- litros (para cálculo de autonomia)

-- Aquisição (opcional)
data_aquisicao  date
valor_aquisicao numeric(12,2)

-- Documentação legal (geram alertas automáticos)
ipva_vencimento         date
licenciamento_vencimento date
seguradora              text
apolice_numero          text
seguro_vencimento       date

-- Manutenção
km_atual                numeric(12,1) DEFAULT 0
km_proxima_troca_oleo   numeric(12,1)
km_proxima_revisao      numeric(12,1)
data_proxima_revisao    date

-- Status/Mídia
ativo           boolean DEFAULT true
foto_url        text                           -- URL no R2

created_at      timestamptz DEFAULT now()
updated_at      timestamptz DEFAULT now()
```

### 4.3 Tabela: `motoristas`
```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
empresa_id      uuid NOT NULL REFERENCES empresas(id)

-- Dados pessoais
nome            text NOT NULL
cpf             text UNIQUE NOT NULL CHECK (cpf ~ '^\d{11}$')
rg              text
data_nascimento date CHECK (data_nascimento < CURRENT_DATE)
email           text CHECK (email IS NULL OR email ~* '^[^@]+@[^@]+\.[^@]+$')
whatsapp        text UNIQUE NOT NULL CHECK (whatsapp ~ '^\d{12,13}$')  -- com DDI: 55DD9XXXXXXXX

-- CNH
cnh_numero               text NOT NULL
cnh_categoria            text NOT NULL CHECK (cnh_categoria IN ('A','B','C','D','E','AB','AC','AD','AE'))
cnh_validade             date NOT NULL
cnh_primeira_habilitacao date
cnh_ear                  boolean DEFAULT false  -- Exerce Atividade Remunerada (obrigatório p/ profissional)

-- Endereço (autocompletado via ViaCEP)
cep             text CHECK (cep ~ '^\d{8}$')
logradouro      text
numero          text
complemento     text
bairro          text
cidade          text
uf              text CHECK (uf ~ '^[A-Z]{2}$')

-- Vínculo empregatício
data_admissao       date
data_desligamento   date CHECK (data_desligamento IS NULL OR data_desligamento >= data_admissao)
cargo               text DEFAULT 'motorista'

-- Remuneração (configurável por motorista — flexível)
tipo_comissao   text NOT NULL CHECK (tipo_comissao IN (
                  'salario_fixo',           -- só salário, sem comissão por viagem
                  'percentual_frete',       -- % do valor_frete por viagem
                  'valor_fixo_viagem',      -- R$ X por viagem (qualquer)
                  'valor_por_km',           -- R$ X / km rodado
                  'salario_mais_percentual', -- salário + % do frete
                  'salario_mais_km'         -- salário + valor por km
                )) DEFAULT 'percentual_frete'

salario_fixo            numeric(10,2) CHECK (salario_fixo IS NULL OR salario_fixo >= 0)
percentual_frete        numeric(5,2) CHECK (percentual_frete IS NULL OR (percentual_frete >= 0 AND percentual_frete <= 100))
valor_fixo_por_viagem   numeric(10,2) CHECK (valor_fixo_por_viagem IS NULL OR valor_fixo_por_viagem >= 0)
valor_por_km            numeric(8,4) CHECK (valor_por_km IS NULL OR valor_por_km >= 0)

-- Status/Mídia
ativo           boolean DEFAULT true
foto_url        text                            -- foto do motorista (R2)
cnh_foto_url    text                            -- foto da CNH (opcional, ver alerta LGPD abaixo)

created_at      timestamptz DEFAULT now()
updated_at      timestamptz DEFAULT now()
```

> **⚠️ LGPD — `cnh_foto_url`:** Dado pessoal sensível. Armazenar **apenas com consentimento explícito** do motorista, em URL assinada com expiração curta (≤15 min), bucket privado, e registrar todo acesso em log de auditoria (`audit_logs`). Banner de consentimento obrigatório no formulário.

> **💰 Configuração de comissão flexível:** cada motorista tem seu modelo. Exemplos práticos:
> - **João (percentual)**: `tipo_comissao='percentual_frete'`, `percentual_frete=10` → ganha 10% do `valor_frete` de cada viagem
> - **Carlos (salário fixo)**: `tipo_comissao='salario_fixo'`, `salario_fixo=3500` → ganha R$ 3.500/mês, sem comissão
> - **Maria (misto)**: `tipo_comissao='salario_mais_percentual'`, `salario_fixo=2000`, `percentual_frete=5` → ganha R$ 2.000 + 5% do frete
> - **Pedro (por km)**: `tipo_comissao='valor_por_km'`, `valor_por_km=1.50` → R$ 1,50/km rodado
>
> O cálculo é feito pela função `calcular_comissao(motorista_id, valor_frete, km_total)` (vide seção 14.4) e gravado em `fretes.comissao_motorista_valor` como **snapshot** ao encerrar a viagem — mudanças futuras de comissão não alteram fretes já fechadas.

### 4.4 Tabela: `fretes`
```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
empresa_id      uuid NOT NULL REFERENCES empresas(id)
veiculo_id      uuid NOT NULL REFERENCES veiculos(id)
motorista_id    uuid NOT NULL REFERENCES motoristas(id)
cliente_id      uuid REFERENCES clientes(id)             -- opcional (frete avulso pode não ter)

-- Rota
origem          text NOT NULL
destino         text NOT NULL
km_inicial      numeric(12,1) NOT NULL CHECK (km_inicial >= 0)
km_final        numeric(12,1) CHECK (km_final IS NULL OR km_final > km_inicial)
km_total        numeric(12,1) GENERATED ALWAYS AS (km_final - km_inicial) STORED

-- Operacional
status          text NOT NULL CHECK (status IN ('agendado','em_andamento','concluido','cancelado')) DEFAULT 'agendado'
data_coleta_prevista    date                              -- combinado com o cliente
data_entrega_prevista   date CHECK (data_entrega_prevista IS NULL OR data_coleta_prevista IS NULL OR data_entrega_prevista >= data_coleta_prevista)
data_inicio     timestamptz                              -- preenchido quando motorista inicia (foto do painel)
data_fim        timestamptz CHECK (data_fim IS NULL OR data_inicio IS NULL OR data_fim >= data_inicio)
observacoes     text

-- Origem do cadastro (rastreabilidade)
criado_por_usuario_id uuid REFERENCES auth.users(id)
criado_via      text NOT NULL CHECK (criado_via IN ('web','whatsapp_gestor','whatsapp_motorista','api')) DEFAULT 'web'

-- Aceite do motorista (quando frete é criado pelo gestor e enviado por HSM)
aceito_pelo_motorista_em timestamptz

-- Financeiro (CORAÇÃO do sistema — receita × custo × lucro)
valor_frete     numeric(12,2) CHECK (valor_frete IS NULL OR valor_frete > 0)
peso_carga_kg   numeric(10,2)                            -- opcional, para custo por kg
tipo_carga      text                                     -- "carga seca", "granel", etc — opcional
forma_pagamento text CHECK (forma_pagamento IS NULL OR forma_pagamento IN ('a_vista','7d','14d','21d','30d','45d','60d','outros'))
pago            boolean DEFAULT false
data_pagamento  date
comissao_motorista_valor numeric(10,2)                   -- snapshot calculado no encerramento (vide 4.3)
observacoes_financeiras text

created_at      timestamptz DEFAULT now()
updated_at      timestamptz DEFAULT now()
```

> **Triggers:**
> - `BEFORE INSERT`: valida `veiculo.empresa_id = motorista.empresa_id = cliente.empresa_id = empresa_id`.
> - `BEFORE UPDATE` se `status='concluido'`: exige `km_final`, `data_fim` e calcula `comissao_motorista_valor` usando `calcular_comissao(motorista_id, valor_frete, km_total)` (vide 14.4).
> - `BEFORE UPDATE` quando `status` passa de `agendado` para `em_andamento`: exige `data_inicio` preenchido (geralmente vem do timestamp do primeiro `km_log` tipo='inicial').
>
> **Filosofia:** `valor_frete` é o número mais importante do sistema. Sem ele, não há lucro a calcular. **Bot do WhatsApp pergunta automaticamente o valor do frete ao iniciar viagem** (ou ao encerrar, conforme preferência da empresa).

### 4.5 Tabela: `km_logs`
```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
empresa_id      uuid NOT NULL REFERENCES empresas(id)
veiculo_id      uuid NOT NULL REFERENCES veiculos(id)
motorista_id    uuid NOT NULL REFERENCES motoristas(id)
frete_id       uuid REFERENCES fretes(id)

km_lido         numeric(12,1) NOT NULL CHECK (km_lido >= 0)
foto_urls       text[] DEFAULT '{}'              -- padronizado como array (R2)

-- IA
ia_confianca    numeric(4,2) CHECK (ia_confianca IS NULL OR ia_confianca BETWEEN 0 AND 100)
ia_raw_response jsonb                            -- jsonb (estruturado, não text)

tipo            text NOT NULL CHECK (tipo IN ('inicial','final','checkpoint','abastecimento','manutencao'))
confirmado      boolean DEFAULT false            -- confirmado pelo motorista

-- Correção retroativa (exige justificativa + log de auditoria)
correcao        boolean DEFAULT false
correcao_motivo text CHECK (correcao = false OR correcao_motivo IS NOT NULL)

created_at      timestamptz DEFAULT now()
```
> **Trigger `AFTER INSERT`:** quando `confirmado = true` e `correcao = false`, propaga `km_lido` para `veiculos.km_atual` (se for maior que o atual).

### 4.6 Tabela: `abastecimentos`
```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
empresa_id      uuid NOT NULL REFERENCES empresas(id)
veiculo_id      uuid NOT NULL REFERENCES veiculos(id)
motorista_id    uuid NOT NULL REFERENCES motoristas(id)
frete_id       uuid REFERENCES fretes(id)

km_no_abast     numeric(12,1) CHECK (km_no_abast IS NULL OR km_no_abast >= 0)
litros          numeric(8,2) NOT NULL CHECK (litros > 0)
valor_litro     numeric(8,3) CHECK (valor_litro IS NULL OR valor_litro > 0)
valor_total     numeric(10,2) NOT NULL CHECK (valor_total > 0)
posto           text

foto_cupom_urls text[] DEFAULT '{}'              -- padronizado como array (R2)

-- IA (extração automática do cupom)
ia_confianca    numeric(4,2) CHECK (ia_confianca IS NULL OR ia_confianca BETWEEN 0 AND 100)
ia_raw_response jsonb
confirmado      boolean DEFAULT false

created_at      timestamptz DEFAULT now()
```

### 4.7 Tabela: `manutencoes`

Registro de cada manutenção realizada (ou planejada). O tipo é referência ao catálogo (`tipos_manutencao`, seção 4.20) para garantir padronização. Itens fora do catálogo usam o tipo `outros` com descrição livre.

```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
empresa_id      uuid NOT NULL REFERENCES empresas(id)
veiculo_id      uuid NOT NULL REFERENCES veiculos(id)
tipo_id         uuid NOT NULL REFERENCES tipos_manutencao(id)  -- catálogo padronizado

descricao       text                              -- detalhes (obrigatório quando tipo = 'outros')
km_realizada    numeric(12,1) CHECK (km_realizada IS NULL OR km_realizada >= 0)
km_proxima      numeric(12,1) CHECK (km_proxima IS NULL OR km_realizada IS NULL OR km_proxima > km_realizada)
data_realizada  date
data_proxima    date CHECK (data_proxima IS NULL OR data_realizada IS NULL OR data_proxima > data_realizada)

-- Financeiro
custo_pecas     numeric(10,2) CHECK (custo_pecas IS NULL OR custo_pecas >= 0)
custo_mao_obra  numeric(10,2) CHECK (custo_mao_obra IS NULL OR custo_mao_obra >= 0)
custo_total     numeric(10,2) GENERATED ALWAYS AS (COALESCE(custo_pecas, 0) + COALESCE(custo_mao_obra, 0)) STORED

-- Fornecedor / Comprovante
fornecedor      text                              -- oficina/posto/concessionária
fornecedor_cnpj text
nota_fiscal_numero text
nota_fiscal_urls   text[] DEFAULT '{}'           -- NF/comprovantes (R2)

-- Status / Aprovação
status          text NOT NULL CHECK (status IN ('planejada','pendente','aprovada','em_execucao','concluida','cancelada')) DEFAULT 'planejada'
aprovado_por    uuid REFERENCES auth.users(id)
aprovado_em     timestamptz
observacoes     text

created_at      timestamptz DEFAULT now()
updated_at      timestamptz DEFAULT now()
```

> **Trigger ao marcar `concluida`:** se a manutenção é recorrente (tipo do catálogo tem `intervalo_km` ou `intervalo_meses`), calcula automaticamente `km_proxima = km_realizada + intervalo_km` e `data_proxima = data_realizada + intervalo_meses meses`.
>
> **Status `planejada`** = sistema gerou automaticamente (cron de alerta), aguardando o gestor revisar/aprovar.

### 4.8 Tabela: `avarias`
```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
empresa_id      uuid NOT NULL REFERENCES empresas(id)
veiculo_id      uuid NOT NULL REFERENCES veiculos(id)
motorista_id    uuid REFERENCES motoristas(id)
frete_id       uuid REFERENCES fretes(id)

descricao_motorista text                          -- texto/áudio transcrito
audio_url           text                          -- áudio original (R2), se houver
descricao_ia        text                          -- resumo gerado pela IA
ia_raw_response     jsonb

urgencia        text NOT NULL CHECK (urgencia IN ('baixa','media','alta','critica'))
foto_urls       text[] DEFAULT '{}'
status          text NOT NULL CHECK (status IN ('aberta','em_analise','em_reparo','resolvida','descartada')) DEFAULT 'aberta'

resolvido_por   uuid REFERENCES auth.users(id)
resolvido_em    timestamptz
manutencao_id   uuid REFERENCES manutencoes(id)   -- link se virou ordem de serviço

created_at      timestamptz DEFAULT now()
updated_at      timestamptz DEFAULT now()
```

### 4.9 Tabela: `alertas`
```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
empresa_id      uuid NOT NULL REFERENCES empresas(id)
veiculo_id      uuid REFERENCES veiculos(id)
motorista_id    uuid REFERENCES motoristas(id)

tipo            text NOT NULL CHECK (tipo IN (
                  'manutencao_vencida','revisao_proxima','troca_oleo_proxima',
                  'cnh_vencendo','ipva_vencendo','licenciamento_vencendo','seguro_vencendo',
                  'avaria_critica','km_sem_registro','frete_longo_sem_checkpoint',
                  'ia_indisponivel','billing_limite_proximo',
                  'checklist_com_problemas','adiantamento_solicitado',
                  'imprevisto_viagem','descanso_obrigatorio','jornada_excedida',
                  'frete_nao_aceito','novo_pedido_atribuido'
                ))
referencia_id   uuid                              -- ID da avaria, manutenção, etc.
mensagem        text NOT NULL
severidade      text NOT NULL CHECK (severidade IN ('info','aviso','urgente','critico')) DEFAULT 'aviso'

enviado_whatsapp boolean DEFAULT false
enviado_em      timestamptz
destinatario    text                              -- whatsapp do destinatário (gestor ou motorista)
lido            boolean DEFAULT false
lido_em         timestamptz

created_at      timestamptz DEFAULT now()
```

### 4.10 Tabela: `sessoes_whatsapp` *(controle de estado do bot)*
```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
empresa_id      uuid REFERENCES empresas(id)     -- nullable enquanto o número não é identificado
whatsapp        text UNIQUE NOT NULL
motorista_id    uuid REFERENCES motoristas(id)
estado          text NOT NULL                    -- "aguardando_veiculo", "aguardando_acao", etc.
contexto        jsonb                            -- dados temporários (veiculo_id, frete_id, etc.)
ultimo_contato  timestamptz NOT NULL DEFAULT now()
expira_em       timestamptz GENERATED ALWAYS AS (ultimo_contato + interval '24 hours') STORED
```
> **Limpeza:** cron diário deleta sessões com `expira_em < now()` (Meta encerra a janela de 24h mesmo).

---

### 4.11 Tabela: `perfis` *(extends `auth.users`)*

Cada usuário do Supabase Auth tem um registro 1:1 em `perfis` com dados de aplicação.

```sql
id              uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE
nome            text NOT NULL
cpf             text UNIQUE CHECK (cpf IS NULL OR cpf ~ '^\d{11}$')
telefone        text CHECK (telefone IS NULL OR telefone ~ '^\d{10,11}$')

-- WhatsApp para receber/enviar mensagens do bot (gestor/master usa para cadastrar pedidos por foto/PDF)
whatsapp_bot    text UNIQUE CHECK (whatsapp_bot IS NULL OR whatsapp_bot ~ '^\d{12,13}$')

-- Vínculo a motorista (1:1 quando role='motorista', NULL nos demais casos)
motorista_id    uuid UNIQUE REFERENCES motoristas(id)

foto_url        text
ativo           boolean DEFAULT true

created_at      timestamptz DEFAULT now()
updated_at      timestamptz DEFAULT now()
```
> **Trigger:** ao criar usuário no Auth (`auth.users`), cria registro em `perfis` automaticamente (função `handle_new_user`).

> **🤖 `whatsapp_bot`** identifica o usuário (master/gestor) que pode interagir com o bot via WhatsApp para **cadastrar pedidos por foto/PDF/print**, aprovar adiantamentos e fazer consultas rápidas. Diferente de `motoristas.whatsapp` (que identifica o motorista). Ao receber mensagem, o bot resolve a role em ordem:
> 1. `motoristas.whatsapp = X` → role `motorista`
> 2. `perfis.whatsapp_bot = X` (com `usuario_empresas.role IN ('master','gestor')`) → role `gestor`
> 3. Nenhum → descarta sem responder

---

### 4.12 Tabela: `usuario_empresas` *(junção N:N + role por empresa)*

Permite que um usuário tenha acesso a **múltiplas empresas** (multi-CNPJ) com **role específico em cada uma** e **uma empresa marcada como padrão**.

```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
usuario_id      uuid NOT NULL REFERENCES perfis(id) ON DELETE CASCADE
empresa_id      uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE

role            text NOT NULL CHECK (role IN ('master','gestor','motorista')) DEFAULT 'gestor'
is_padrao       boolean DEFAULT false             -- empresa carregada ao logar

created_at      timestamptz DEFAULT now()

UNIQUE (usuario_id, empresa_id)
```

```sql
-- Garante apenas UMA empresa padrão por usuário
CREATE UNIQUE INDEX uniq_usuario_empresa_padrao
  ON usuario_empresas(usuario_id)
  WHERE is_padrao = true;
```

**Níveis de acesso:**

| Role | O que enxerga/faz |
|---|---|
| `master` | Tudo da empresa: dados + gestão de usuários + backup + configurações |
| `gestor` | Tudo da empresa: dados operacionais (frota, motoristas, fretes, manutenções, avarias, relatórios) — **sem** gestão de usuários nem backup |
| `motorista` | Apenas seus próprios dados: seus fretes, seus km_logs, suas avarias, seus abastecimentos. Não vê dados de outros motoristas nem da frota completa |

**Cenário típico (seu caso):**
```
usuario: você (master)
  ├── empresa_id: CNPJ-1 → role: master, is_padrao: true
  └── empresa_id: CNPJ-2 → role: master, is_padrao: false

usuario: gestor contratado
  ├── empresa_id: CNPJ-1 → role: gestor, is_padrao: true

usuario: motorista João
  └── empresa_id: CNPJ-1 → role: motorista, is_padrao: true
```

No header da UI: dropdown de empresas (carrega lista de `usuario_empresas` do usuário logado). Trocar de empresa **filtra todo o conteúdo** do dashboard pelo `empresa_id` selecionado.

---

### 4.13 Tabela: `audit_logs`

Registra ações críticas e acessos a dados sensíveis para conformidade (LGPD) e rastreabilidade.

```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
empresa_id      uuid REFERENCES empresas(id)
usuario_id      uuid REFERENCES auth.users(id)

acao            text NOT NULL CHECK (acao IN (
                  'create','update','delete','soft_delete','restore',
                  'view_sensitive',         -- acesso a CNH foto, CPF completo, etc.
                  'correcao_km',            -- leitura retroativa de KM
                  'export_backup',          -- geração de backup completo
                  'troca_empresa',          -- usuário alternou empresa ativa
                  'login','logout','login_failed'
                ))
entidade        text NOT NULL              -- 'veiculo','motorista','viagem','avaria',...
entidade_id     uuid
descricao       text                       -- mensagem livre ("Visualizou CNH de João")
dados_antes     jsonb                      -- estado anterior (para update/delete)
dados_depois    jsonb                      -- estado novo
ip              inet
user_agent      text

created_at      timestamptz DEFAULT now()
```

**Quando gravar (obrigatório):**
- Toda visualização de `cnh_foto_url`
- Toda correção retroativa de KM (`km_logs.correcao = true`)
- Toda alteração em `usuario_empresas` (atribuição/revogação de acesso)
- Geração de backup completo
- Soft delete e restauração de qualquer entidade
- Login falhado (alimenta detecção de brute force)

**Retenção:** mínimo 5 anos (LGPD recomenda).

---

### 4.14 Tabela: `checklists_diarios`

Inspeção pré-viagem feita pelo motorista via WhatsApp (botões SIM/NÃO).

```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
empresa_id      uuid NOT NULL REFERENCES empresas(id)
veiculo_id      uuid NOT NULL REFERENCES veiculos(id)
motorista_id    uuid NOT NULL REFERENCES motoristas(id)
frete_id       uuid REFERENCES fretes(id)        -- se associado a um frete específico

data            date NOT NULL DEFAULT CURRENT_DATE
respostas       jsonb NOT NULL                     -- {"pneus":"ok","freios":"problema","oleo":"ok",...}
problemas       text[] DEFAULT '{}'                -- itens marcados como "problema"
observacoes     text                               -- texto livre opcional
status          text NOT NULL CHECK (status IN ('ok','com_problemas','incompleto')) DEFAULT 'ok'

created_at      timestamptz DEFAULT now()

UNIQUE (veiculo_id, motorista_id, data)            -- 1 checklist por veículo+motorista+dia
```
> **Trigger:** se `status = 'com_problemas'`, cria automaticamente uma `avaria` com `descricao_motorista = 'Detectado no checklist diário: ' || array_to_string(problemas, ', ')` e urgência `media`.

---

### 4.15 Tabela: `adiantamentos`

Motorista pede dinheiro adiantado via WhatsApp (pedágio, alimentação, etc). Gestor aprova/recusa por botão.

```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
empresa_id      uuid NOT NULL REFERENCES empresas(id)
motorista_id    uuid NOT NULL REFERENCES motoristas(id)
frete_id       uuid REFERENCES fretes(id)

tipo            text NOT NULL CHECK (tipo IN ('pedagio','alimentacao','hospedagem','reparo_pequeno','outros'))
valor           numeric(10,2) NOT NULL CHECK (valor > 0)
justificativa   text

status          text NOT NULL CHECK (status IN ('pendente','aprovado','recusado','pago','prestado_contas')) DEFAULT 'pendente'
aprovado_por    uuid REFERENCES auth.users(id)
aprovado_em     timestamptz
recusa_motivo   text

valor_prestado_contas numeric(10,2)                -- soma das despesas comprovadas com foto
data_pagamento  timestamptz                        -- quando o gestor efetivou o pagamento

created_at      timestamptz DEFAULT now()
updated_at      timestamptz DEFAULT now()
```

---

### 4.16 Tabela: `despesas_frete`

Despesas avulsas da viagem (pedágio, alimentação, hospedagem, lavagem) registradas por foto do cupom.

```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
empresa_id      uuid NOT NULL REFERENCES empresas(id)
frete_id       uuid NOT NULL REFERENCES fretes(id)
motorista_id    uuid NOT NULL REFERENCES motoristas(id)
adiantamento_id uuid REFERENCES adiantamentos(id)  -- vincula à origem do dinheiro (se houver)

tipo            text NOT NULL CHECK (tipo IN ('pedagio','alimentacao','hospedagem','lavagem','reparo_pequeno','outros'))
valor           numeric(10,2) NOT NULL CHECK (valor > 0)
local           text                               -- "Posto Shell km 230", "Restaurante BR-101"
data_despesa    timestamptz NOT NULL DEFAULT now()
foto_cupom_urls text[] DEFAULT '{}'

-- IA (extração do cupom)
ia_confianca    numeric(4,2) CHECK (ia_confianca IS NULL OR ia_confianca BETWEEN 0 AND 100)
ia_raw_response jsonb
confirmado      boolean DEFAULT false              -- motorista confirmou os dados extraídos

created_at      timestamptz DEFAULT now()
```

---

### 4.17 Tabela: `imprevistos`

Avisos rápidos do motorista sobre atrasos/eventos na estrada.

```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
empresa_id      uuid NOT NULL REFERENCES empresas(id)
motorista_id    uuid NOT NULL REFERENCES motoristas(id)
frete_id       uuid REFERENCES fretes(id)

tipo            text NOT NULL CHECK (tipo IN (
                  'transito','acidente_na_pista','pane','clima','fiscalizacao','outros'
                ))
descricao       text
duracao_estimada_min int CHECK (duracao_estimada_min IS NULL OR duracao_estimada_min > 0)

resolvido       boolean DEFAULT false
resolvido_em    timestamptz
notificado_gestor boolean DEFAULT false

created_at      timestamptz DEFAULT now()
```
> **Trigger:** ao inserir, cria `alertas.tipo = 'imprevisto_viagem'` (severidade conforme tipo) destinado ao gestor.

---

### 4.18 Tabela: `clientes` *(CRM básico para frete recorrente)*

Cadastro de clientes que contratam fretes. Liga a `fretes.cliente_id`.

```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
empresa_id      uuid NOT NULL REFERENCES empresas(id)

-- Identificação
nome_fantasia   text NOT NULL
razao_social    text
documento       text NOT NULL                       -- CPF (11) ou CNPJ (14)
tipo_pessoa     text NOT NULL CHECK (tipo_pessoa IN ('fisica','juridica'))
inscricao_estadual text

-- Contato
contato_nome    text                                -- responsável (comprador, logística)
telefone        text CHECK (telefone IS NULL OR telefone ~ '^\d{10,11}$')
email           text CHECK (email IS NULL OR email ~* '^[^@]+@[^@]+\.[^@]+$')

-- Endereço
cep             text CHECK (cep IS NULL OR cep ~ '^\d{8}$')
logradouro      text
numero          text
complemento     text
bairro          text
cidade          text
uf              text CHECK (uf IS NULL OR uf ~ '^[A-Z]{2}$')

-- Comercial
forma_pagamento_padrao text CHECK (forma_pagamento_padrao IN ('a_vista','7d','14d','21d','30d','45d','60d','outros'))
observacoes     text

ativo           boolean DEFAULT true
created_at      timestamptz DEFAULT now()
updated_at      timestamptz DEFAULT now()

UNIQUE (empresa_id, documento)
```

> **CRM minimalista** — só o suficiente para identificar quem contratou cada frete e gerar relatórios por cliente. Sem pipeline de vendas, sem oportunidades, sem follow-up. Pode evoluir depois se necessário.

---

### 4.19 Tabela: `tipos_manutencao` *(catálogo padronizado)*

Catálogo de tipos de manutenção. Vem com **~35 itens pré-cadastrados** (seed) cobrindo o padrão de caminhões pesados. Cada empresa pode habilitar/desabilitar ou adicionar tipos custom.

```sql
id                  uuid PRIMARY KEY DEFAULT gen_random_uuid()
empresa_id          uuid REFERENCES empresas(id)   -- NULL = item do catálogo global do sistema
codigo              text NOT NULL                  -- 'troca_oleo_motor', 'troca_filtro_ar', etc
nome                text NOT NULL                  -- "Troca de óleo do motor"
categoria           text NOT NULL CHECK (categoria IN (
                      'motor','arrefecimento','transmissao','freios','pneus',
                      'suspensao','eletrica','ar_condicionado','cabine',
                      'documentacao','outros'
                    ))
intervalo_km        int CHECK (intervalo_km IS NULL OR intervalo_km > 0)
intervalo_meses     int CHECK (intervalo_meses IS NULL OR intervalo_meses > 0)
criticidade         text NOT NULL CHECK (criticidade IN ('baixa','media','alta','critica')) DEFAULT 'media'
descricao           text                           -- detalhes/dica para o gestor
custo_estimado_min  numeric(10,2)                  -- referência para alerta de orçamento abusivo
custo_estimado_max  numeric(10,2)
ativo               boolean DEFAULT true

created_at          timestamptz DEFAULT now()
updated_at          timestamptz DEFAULT now()

UNIQUE (COALESCE(empresa_id::text, 'global'), codigo)
```

#### Seed inicial — 35 itens padrão (`empresa_id = NULL`)

| Código | Nome | Categoria | KM | Meses | Criticidade |
|---|---|---|---|---|---|
| `troca_oleo_motor` | Troca de óleo do motor | motor | 15.000 | 6 | alta |
| `troca_filtro_oleo` | Troca de filtro de óleo | motor | 15.000 | 6 | alta |
| `troca_filtro_ar` | Troca de filtro de ar | motor | 30.000 | 12 | media |
| `troca_filtro_combustivel` | Troca de filtro de combustível | motor | 30.000 | 12 | alta |
| `troca_filtro_separador_agua` | Troca de filtro separador de água (Racor) | motor | 20.000 | 12 | media |
| `troca_filtro_arla` | Troca de filtro do ARLA 32 (SCR) | motor | 60.000 | 24 | media |
| `troca_correia_dentada` | Troca de correia dentada | motor | 80.000 | 60 | critica |
| `troca_correia_alternador` | Troca de correia do alternador | motor | 60.000 | 36 | media |
| `regulagem_motor` | Regulagem de motor (válvulas, injeção) | motor | 80.000 | 36 | media |
| `limpeza_bicos_injetores` | Limpeza/troca de bicos injetores | motor | 100.000 | 48 | media |
| `troca_liquido_arrefecimento` | Troca do líquido de arrefecimento | arrefecimento | 40.000 | 24 | alta |
| `limpeza_radiador` | Limpeza do radiador | arrefecimento | 60.000 | 24 | media |
| `troca_oleo_cambio` | Troca de óleo do câmbio | transmissao | 80.000 | 24 | alta |
| `troca_oleo_diferencial` | Troca de óleo do diferencial | transmissao | 80.000 | 24 | alta |
| `troca_embreagem` | Substituição da embreagem | transmissao | 150.000 | NULL | critica |
| `troca_lonas_freio` | Troca de lonas/pastilhas de freio | freios | 60.000 | NULL | critica |
| `troca_discos_tambores` | Troca de discos/tambores de freio | freios | 120.000 | NULL | critica |
| `troca_fluido_freio` | Troca de fluido de freio | freios | 40.000 | 24 | alta |
| `troca_filtro_secador_ar` | Troca de filtro secador de ar | freios | 60.000 | 24 | alta |
| `revisao_cuicas` | Revisão das cuícas pneumáticas | freios | 100.000 | 36 | alta |
| `rodizio_pneus` | Rodízio de pneus | pneus | 15.000 | NULL | media |
| `troca_pneus` | Troca de pneus | pneus | 100.000 | NULL | alta |
| `alinhamento_balanceamento` | Alinhamento e balanceamento | pneus | 15.000 | 6 | media |
| `troca_amortecedores` | Troca de amortecedores | suspensao | 80.000 | 36 | alta |
| `revisao_molas` | Revisão de molas/feixe de molas | suspensao | 60.000 | 24 | media |
| `troca_bolsa_ar` | Troca de bolsa de ar (suspensão pneumática) | suspensao | 100.000 | 48 | alta |
| `engraxamento_chassi` | Engraxamento geral do chassi | suspensao | 10.000 | NULL | media |
| `troca_bateria` | Troca de bateria | eletrica | NULL | 24 | alta |
| `revisao_alternador` | Revisão do alternador | eletrica | 100.000 | 36 | media |
| `troca_lampadas` | Substituição de lâmpadas | eletrica | NULL | NULL | baixa |
| `carga_gas_ar_condicionado` | Carga de gás do ar condicionado | ar_condicionado | NULL | 12 | baixa |
| `higienizacao_ar_condicionado` | Higienização do ar condicionado | ar_condicionado | NULL | 12 | baixa |
| `troca_filtro_cabine` | Troca de filtro da cabine | cabine | 30.000 | 12 | baixa |
| `troca_palhetas` | Troca de palhetas do limpador | cabine | NULL | 12 | baixa |
| `afericao_tacografo` | Aferição do tacógrafo (INMETRO) | documentacao | NULL | 24 | critica |
| `outros` | Outros (descrever) | outros | NULL | NULL | media |

> **Comportamentos:**
> - Quando uma empresa é criada, herda automaticamente os 35 tipos globais via `LEFT JOIN` (não duplica — referencia)
> - Empresa pode **desabilitar** um tipo global (`UPDATE` criando registro próprio com `ativo = false`)
> - Empresa pode **criar tipos custom** (`INSERT` com `empresa_id` preenchido)
> - Intervalos do seed são **referência geral** — devem ser ajustados conforme manual do fabricante de cada veículo via `plano_manutencao_veiculo` (4.20)

---

### 4.20 Tabela: `plano_manutencao_veiculo` *(overrides por veículo)*

Quando o veículo tem intervalo diferente do padrão (ex.: caminhão novo da Volvo com óleo sintético troca a cada 30.000 km em vez de 15.000), o plano específico fica aqui.

```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
empresa_id      uuid NOT NULL REFERENCES empresas(id)
veiculo_id      uuid NOT NULL REFERENCES veiculos(id)
tipo_id         uuid NOT NULL REFERENCES tipos_manutencao(id)

intervalo_km    int CHECK (intervalo_km IS NULL OR intervalo_km > 0)        -- override do catálogo
intervalo_meses int CHECK (intervalo_meses IS NULL OR intervalo_meses > 0)
ativo           boolean DEFAULT true                                         -- false = não aplicar este tipo neste veículo
observacoes     text

created_at      timestamptz DEFAULT now()
updated_at      timestamptz DEFAULT now()

UNIQUE (veiculo_id, tipo_id)
```

> **Lógica de cálculo (fallback em cascata):**
> ```
> intervalo_efetivo = plano_manutencao_veiculo.intervalo_km
>                  OR tipos_manutencao.intervalo_km
>                  OR NULL (não recorrente — registro manual apenas)
> ```

---

### 4.21 Validações, Máscaras e Regras de Negócio

#### Estratégia: Defesa em Profundidade

| Camada | Função |
|---|---|
| **Frontend (UI)** | Máscaras de digitação + validação visual (Zod + react-hook-form) |
| **Server Action** | Re-validação Zod antes de qualquer `INSERT`/`UPDATE` |
| **Banco (CHECK + Triggers)** | Última linha de defesa — recusa dados inválidos no Postgres |

> **Regra de ouro:** nunca confiar só no frontend. Toda regra crítica é replicada em pelo menos 2 camadas.

#### Máscaras de Input (frontend)

| Campo | Máscara visual | Armazenado como | Validação extra |
|---|---|---|---|
| **CPF** | `000.000.000-00` | só dígitos (11) | Dígito verificador (algoritmo) |
| **CNPJ** | `00.000.000/0000-00` | só dígitos (14) | Dígito verificador |
| **CEP** | `00000-000` | só dígitos (8) | Lookup ViaCEP no `onBlur` |
| **Telefone** | `(00) 0000-0000` ou `(00) 00000-0000` | só dígitos (10 ou 11) | Detecta fixo/celular automaticamente |
| **WhatsApp** | `+55 (00) 00000-0000` | dígitos com DDI: `55DD9XXXXXXXX` | Validar prefixo 55 |
| **Placa** | `AAA-0000` ou `AAA-0A00` | maiúsculas, com ou sem hífen | Regex aceita Mercosul |
| **RENAVAM** | `00000000000` | só dígitos (9 a 11) | — |
| **Chassi** | 17 caracteres alfanuméricos | maiúsculas | Sem letras `I`, `O`, `Q` |
| **CNH** | `00000000000` | só dígitos (11) | — |
| **Valor (R$)** | `R$ 0,00` (vírgula decimal pt-BR) | numeric | — |
| **KM** | `0.000,0` (1 casa decimal) | numeric(12,1) | — |

**Bibliotecas sugeridas:**
- `react-imask` ou `@react-input/mask` — máscaras de digitação
- `zod` — schema de validação compartilhado entre client/server
- Helpers próprios em `lib/validators/` para CPF, CNPJ, placa Mercosul

#### Autocompletar Endereço (ViaCEP)

```ts
// lib/cep/viaCep.ts
export type EnderecoCep = {
  logradouro: string;
  bairro: string;
  cidade: string;
  uf: string;
  complemento: string;
};

export async function lookupCep(cep: string): Promise<EnderecoCep | null> {
  const digits = cep.replace(/\D/g, '');
  if (digits.length !== 8) return null;

  const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) return null;

  const data = await res.json();
  if (data.erro) return null;

  return {
    logradouro: data.logradouro ?? '',
    bairro: data.bairro ?? '',
    cidade: data.localidade ?? '',
    uf: data.uf ?? '',
    complemento: data.complemento ?? '',
  };
}
```

**Comportamento na UI:**
- Trigger: `onBlur` do campo CEP (não a cada tecla)
- Loading: spinner discreto à direita do CEP enquanto consulta
- Sucesso: preenche logradouro/bairro/cidade/UF, foca em `numero`
- Campos preenchidos pelo ViaCEP ficam **editáveis** (usuário pode ajustar)
- Erro/timeout: campos liberados para preenchimento manual, sem bloqueio

#### Regras de Negócio Críticas

**KM (núcleo da operação):**
- `fretes.km_inicial >= veiculos.km_atual` no momento da abertura
- `fretes.km_final > fretes.km_inicial` ao encerrar
- Toda nova leitura (`km_logs`, `abastecimentos`, `manutencoes.km_realizada`) deve ser `>= veiculos.km_atual`
- Atualização válida de KM **propaga** para `veiculos.km_atual` via trigger
- Leitura retroativa (KM menor) só é aceita com flag `correcao = true` + justificativa textual + registro em `audit_logs`

**Datas:**
- `data_admissao <= CURRENT_DATE`
- `data_desligamento >= data_admissao` (CHECK)
- `cnh_validade > CURRENT_DATE` ao cadastrar/editar
- **Alertas automáticos (cron diário)** quando faltar < 30 dias para vencer:
  - `cnh_validade`
  - `ipva_vencimento`
  - `licenciamento_vencimento`
  - `seguro_vencimento`
  - `data_proxima_revisao`
- Motorista com CNH C/D/E deve ter idade ≥ 21 anos (calculado de `data_nascimento`)

**Soft delete (sem DELETE físico):**
- Veículo/motorista → `ativo = false` em vez de excluir
- **Bloquear inativação** se houver:
  - `fretes.status = 'em_andamento'` associada
  - `manutencoes.status IN ('pendente','aprovada')` pendente
  - `avarias.status IN ('aberta','em_analise')` aberta

**Unicidade (escopo global):**
- `cpf`, `cnpj`, `placa`, `chassi`, `renavam`, `whatsapp` são únicos no sistema todo (não por empresa) — evita conflito futuro entre empresas
- `email` do motorista: único por empresa (se preenchido)

**Coerência cross-tabela (triggers):**
- `fretes.veiculo_id` e `fretes.motorista_id` devem pertencer à mesma `empresa_id`
- `km_logs.frete_id` (se preenchido) deve referenciar viagem do mesmo `veiculo_id` e `motorista_id`

#### Onde implementar cada regra

| Tipo de regra | Onde |
|---|---|
| Formato (regex, range simples) | `CHECK` constraint no banco |
| Dígito verificador (CPF/CNPJ) | Zod refinement no client + server |
| Coerência entre tabelas | Trigger PL/pgSQL `BEFORE INSERT/UPDATE` |
| Propagação de `km_atual` | Trigger `AFTER INSERT` em `km_logs` |
| Alertas temporais (vencimentos) | Edge Function agendada (cron diário) → grava em `alertas` |
| Bloqueio de inativação | Server Action + trigger de segurança |
| Auditoria de correção retroativa | Tabela `audit_logs` + Server Action |

---

## 5. DECISÃO: PROVEDOR WHATSAPP

### Opções avaliadas:

| Provedor | Prós | Contras | Custo |
|---|---|---|---|
| **Meta Cloud API** (BSP direto) | Oficial, suporte a botões/listas nativos, estável | Processo de aprovação de conta Business | Pago por conversa (barato) |
| **Evolution API** | Open-source, fácil setup, suporte a baileys | Não-oficial (risco de ban), requer servidor próprio | Self-hosted |
| **Twilio** | Documentação excelente, confiável | Mais caro, suporte a botões limitado no WhatsApp | Pago por mensagem |

> **✅ DECISÃO TOMADA: Meta Cloud API** — Escolha definitiva para produção.

### Estimativa de Custo Real (10 motoristas)

| Cenário | Mensagens/mês | Custo estimado |
|---|---|---|
| Maioria dentro da janela 24h (motorista inicia) | ~500–1000 msg | **~R$ 0–10/mês** |
| Alertas proativos do gestor (manutenção, avisos) | ~30–50 msg | **~R$ 5–15/mês** |
| **Total estimado mensal** | | **R$ 5 a R$ 25/mês** |

> 💡 Como os motoristas **sempre iniciam** a conversa ("Oi"), praticamente toda a interação cai na **janela gratuita de 24h**. O custo real será próximo de zero na operação diária.

---

## 6. FLUXO CONVERSACIONAL HÍBRIDO (WhatsApp Bot)

### 6.1 Diagrama Geral do Fluxo

```
Motorista envia "Oi"
        │
        ▼
[AUTH] Busca whatsapp na tabela motoristas
        │
    ┌───┴────────────────┐
    │ Não encontrado      │ Encontrado
    ▼                     ▼
"Número não            "Olá, [Nome]! 👋
 cadastrado."           Qual caminhão você
                        vai usar hoje?"
                              │
                              ▼
                   [LISTA INTERATIVA]
                   ┌─────────────────┐
                   │ 🚛 Selecione o  │
                   │    Caminhão     │
                   ├─────────────────┤
                   │ • Volvo FH -    │
                   │   ABC-1234      │
                   │ • Scania R450 - │
                   │   DEF-5678      │
                   │ • ...           │
                   └─────────────────┘
                              │
                   Motorista clica no caminhão
                              │
                              ▼
                   [MENU DE AÇÕES - BOTÕES]
                   ┌──────────────────────────┐
                   │ Caminhão: ABC-1234       │
                   │ KM atual: 125.430        │
                   │                          │
                   │ [📋 Checklist do dia]    │
                   │ [🛣️ Iniciar Viagem]      │
                   │ [📸 Informar KM]         │
                   │ [⛽ Abastecimento]       │
                   │ [⚠️ Relatar Avaria]      │
                   │ [💰 Pedir adiantamento]  │
                   │ [🧾 Registrar despesa]   │
                   │ [⚠️ Comunicar imprevisto]│
                   │ [🔍 Status do caminhão]  │
                   │ [📄 Meus documentos]     │
                   └──────────────────────────┘
```

> **💡 Dica para o leitor:** o menu acima é o caminho "explícito". Mas o bot também aceita ação **implícita** — qualquer foto/áudio sem clicar em botão é roteada automaticamente pelo **Smart Intent Router** (seção 6.14). Ex.: motorista manda foto do painel sem clicar em nada → bot infere "Iniciar Viagem" ou "Informar KM" com base no contexto.

### 6.2 Fluxo: Informar KM (com IA Vision)

```
Motorista: [📸 Informar KM]
       │
       ▼
Bot: "Ótimo! Tire uma foto clara do painel 
      mostrando o odômetro. 📷"
       │
Motorista envia FOTO
       │
       ▼
[Webhook recebe foto]
       │
       ▼
[Upload foto → Cloudflare R2]
       │
       ▼
[gpt-4o-mini analisa imagem]
  Prompt: "Extraia o valor do odômetro 
   desta imagem. Retorne JSON:
   { km: number, confianca: number (0-100),
     observacao: string }"
  (modelo leve = baixa latência + custo)
       │
       ├── Confiança >= 85%
       │       │
       │       ▼
       │   Bot envia BOTÕES:
       │   "✅ KM lido: *125.847 km*
       │    Está correto?"
       │   [✅ Confirmar] [✏️ Digitar manualmente]
       │
       └── Confiança < 85%
               │
               ▼
           Bot: "Não consegui ler bem 
                 o odômetro. 😕
                 Por favor, *digite* o KM:"
               │
           Motorista digita → salva
```

### 6.3 Fluxo: Relatar Avaria (com IA Analysis)

```
Motorista: [⚠️ Relatar Avaria]
       │
       ▼
Bot: "Me conte o que aconteceu.
      Pode mandar foto, áudio ou texto. 🔍"
       │
       ├── Foto enviada
       │       ▼
       │   gpt-4o (modelo full = melhor raciocínio):
       │   "Analise a avaria nesta foto.
       │    Retorne: { descricao, urgencia:
       │    'baixa'|'media'|'alta'|'critica',
       │    recomendacao }"
       │
       ├── Áudio enviado
       │       ▼
       │   whisper-1 (transcrição pt-BR) → gpt-4o
       │   (análise do texto transcrito)
       │
       └── Texto enviado
               ▼
           gpt-4o (análise de texto)
               │
               ▼
       [Todos os caminhos convergem aqui]
               │
               ▼
       Bot envia BOTÕES com resumo da IA:
       "⚠️ *Avaria registrada:*
        Pneu traseiro direito com desgaste
        excessivo. Urgência: *ALTA* 🔴
        Recomendação: Substituição imediata.
        
        Deseja adicionar mais fotos?"
       [📸 Adicionar foto] [✅ Confirmar]
               │
       Urgência ALTA ou CRITICA?
               │
               ▼
       [Alerta automático ao gestor via WhatsApp]
       "🚨 ALERTA FROTA: Avaria CRÍTICA
        Caminhão: ABC-1234 | Motorista: João
        Descrição: [resumo IA]"
```

### 6.4 Fluxo: Iniciar Viagem

```
[🛣️ Iniciar Viagem]
       │
       ▼
Bot: "Para onde vai? Digite a *origem* e
      o *destino* (ex: São Paulo → Campinas)"
       │
Motorista digita
       │
       ▼
Bot: "Para qual cliente?"
     [📋 Lista de clientes recorrentes]
     [➕ Frete avulso (sem cliente)]
       │
       ▼
Bot: "Qual o valor do frete? (R$)"
     ⏭️ Pode digitar agora ou
     pular e informar no fim:
     [⏭️ Pular] [💰 Digitar valor]
       │
       ▼
Bot: "📸 Agora tire a foto do painel
      para registrar o KM inicial."
       │
[IA lê KM inicial → confirma com botões]
       │
       ▼
Viagem criada no Supabase (status: em_andamento)
Bot: "✅ Viagem iniciada! Boa viagem, João! 🛣️"
```

> **💰 Sobre o valor do frete:** se o motorista pular, o bot **pergunta de novo ao encerrar a viagem** ("antes de finalizar, qual foi o valor do frete?"). Sem o valor não dá pra calcular lucro — então o sistema garante que perguntou pelo menos uma vez. Se o motorista insistir em pular, gestor recebe alerta no dashboard ("3 fretes sem valor_frete preenchido").

### 6.5 Fluxo: Abastecimento

```
[⛽ Abastecimento]
       │
       ▼
Bot: "📸 Tire uma foto do comprovante
      de abastecimento."
       │
[gpt-4o-mini extrai: litros, valor, posto]
       │
       ▼
Bot: "⛽ Abastecimento registrado:
      *45,3 litros | R$ 387,50*
      Posto: Shell Rodovia Anhanguera
      [✅ Confirmar] [✏️ Corrigir]"
```

### 6.6 Estados da Sessão (`sessoes_whatsapp.estado`)

| Estado | Descrição |
|---|---|
| `novo` | Primeira mensagem, aguardando identificação |
| `aguardando_veiculo` | Lista de caminhões enviada |
| `aguardando_acao` | Menu de ações enviado |
| `aguardando_foto_km` | Solicitou foto do odômetro |
| `aguardando_confirmacao_km` | KM lido pela IA, aguardando confirmação |
| `aguardando_km_manual` | IA falhou, pediu digitação manual |
| `aguardando_avaria_midia` | Aguardando foto/áudio/texto da avaria |
| `aguardando_confirmacao_avaria` | Resumo IA enviado, aguardando confirmação |
| `aguardando_origem_destino` | Fluxo viagem: aguardando texto origem→destino |
| `aguardando_foto_abastecimento` | Aguardando foto do comprovante |
| `aguardando_checklist` | Checklist diário em andamento (índice do item atual no contexto) |
| `aguardando_adiantamento_tipo` | Pediu adiantamento, escolhendo tipo |
| `aguardando_adiantamento_valor` | Digitando valor do adiantamento |
| `aguardando_despesa_foto` | Tirando foto do cupom de despesa |
| `aguardando_imprevisto_tipo` | Escolhendo tipo de imprevisto |
| `inferindo_intencao` | Mídia recebida sem ação clara, Smart Router processando |

---

### 6.7 Fluxo: Checklist Diário Pré-Viagem

Disparado automaticamente no primeiro "Oi" do dia OU pelo botão `[📋 Checklist do dia]`. Bloqueia o início de viagem se não foi feito.

```
Bot: "Bom dia, João! 🌅
      Vamos conferir o caminhão ABC-1234?"

      ┌─────────────────────────────┐
      │ 1/6  PNEUS                  │
      │ Calibragem e desgaste estão │
      │ ok?                         │
      │  [✅ OK]  [❌ Problema]     │
      └─────────────────────────────┘
              │
   (mesmo padrão para os próximos)
   2. Freios       3. Faróis/Lanternas
   4. Óleo/Água    5. Triângulo/Estepe
   6. Documentos
              │
              ▼
   Bot: "✅ Checklist completo! Bom dia 🛣️"
         (se algum ❌)
   Bot: "Você marcou problema em: FREIO.
         Pode tirar uma foto? Vou registrar
         uma avaria automaticamente."
         [📸 Tirar foto] [⏭️ Pular foto]
```

**Lógica:**
- 1 checklist por veículo+motorista+dia (`UNIQUE`)
- Resposta vai pra `checklists_diarios.respostas` (jsonb)
- Qualquer ❌ cria automaticamente registro em `avarias` (urgência `media`) via trigger
- Itens com problema **disparam alerta imediato ao gestor** via WhatsApp (`checklist_com_problemas`), mas o sistema **não bloqueia** o início da viagem — quem decide é o gestor (ele responde "pode rodar" ou liga pro motorista)
- Itens configuráveis por empresa (futuro — MVP fixo nos 6 padrão)

> **Filosofia:** o sistema **avisa, não impõe**. Bloquear a viagem cria atrito desnecessário e motoristas começariam a clicar tudo ✅ no automático para destravar. Melhor: o gestor vê o problema, conversa com o motorista, decide.

---

### 6.8 Fluxo: Pedir Adiantamento

```
Motorista: [💰 Pedir adiantamento]
        │
        ▼
Bot: "Para que é o adiantamento?"
     [⛽ Pedágio]  [🍽️ Alimentação]
     [🏨 Hospedagem] [🔧 Reparo pequeno]
     [💼 Outro]
        │
        ▼
Bot: "Quanto você precisa? Digite só o valor (R$)"
        │
   Motorista: 200
        │
        ▼
Bot: "Confirmar? R$ 200,00 para pedágio.
      Posso mandar pro gestor?"
     [✅ Confirmar] [❌ Cancelar]
        │
        ▼
[Cria adiantamentos.status = 'pendente']
[Envia para gestor via WhatsApp + dashboard]
        │
        ▼
Bot (ao motorista): "Pedido enviado! Você
      será avisado assim que for aprovado. ⏳"

[Gestor recebe]
   "💰 João pediu R$ 200 (pedágio).
    Viagem: SP → Campinas"
    [✅ Aprovar] [❌ Recusar]
        │
   Gestor clica [✅ Aprovar]
        │
        ▼
[adiantamentos.status = 'aprovado']
Bot (ao motorista): "✅ Aprovado! R$ 200 será
      depositado em até 30 min."
```

**Regras:**
- Valor digitado pelo motorista; sem máscara complicada (aceita "200", "200,00", "200.00")
- Adiantamento sempre vinculado a viagem ativa (se houver) ou avulso
- Auditoria: gestor que aprovou + timestamp em `aprovado_por` / `aprovado_em`
- Quando motorista registra despesas (6.9) que somam ≥ valor aprovado, status muda para `prestado_contas`

---

### 6.9 Fluxo: Registrar Despesa (foto do cupom)

```
Motorista: [🧾 Registrar despesa]
        │
        ▼
Bot: "Que tipo de despesa?"
     [⛽ Pedágio]  [🍽️ Alimentação]
     [🏨 Hospedagem] [🚿 Lavagem]
     [🔧 Reparo]  [💼 Outro]
        │
        ▼
Bot: "📸 Tire uma foto do cupom/recibo."
        │
   Motorista envia FOTO
        │
        ▼
[gpt-4o-mini analisa: valor, data, local]
        │
        ▼
Bot: "🧾 Despesa identificada:
      Pedágio - R$ 18,50
      Local: Rodovia Anhanguera km 23
      Data: hoje 14:32

      Tá certo?"
     [✅ Confirmar] [✏️ Corrigir valor]
        │
        ▼
[Cria despesas_frete com confirmado=true]
[Se houver adiantamento ativo do mesmo tipo,
 vincula automaticamente em adiantamento_id]
        │
Bot: "✅ Despesa registrada! Boa viagem 🛣️"
```

> Reusa **`lerCupomAbastecimento()`** do `aiService` — generaliza para "ler cupom genérico" e identifica tipo (gas/comida/pedágio) automaticamente.

---

### 6.10 Fluxo: Comunicar Imprevisto

```
Motorista: [⚠️ Comunicar imprevisto]
        │
        ▼
Bot: "O que aconteceu?"
     [🚦 Trânsito]      [💥 Acidente na pista]
     [🔧 Pane mecânica] [🌧️ Clima ruim]
     [🚓 Fiscalização]  [💼 Outro]
        │
        ▼
Bot: "Quanto tempo de atraso, mais ou menos?"
     [15 min] [30 min] [1 hora]
     [2 horas] [Não sei]
        │
        ▼
Bot: "Quer mandar uma foto ou áudio explicando?"
     [📸 Foto] [🎤 Áudio] [⏭️ Não, só registrar]
        │
        ▼
[Cria imprevistos + alerta ao gestor]
        │
Bot: "✅ Avisado! O gestor já recebeu.
      Pode continuar a viagem 🛣️"

[Gestor recebe]
   "⚠️ JOÃO comunicou imprevisto:
    Trânsito (≈ 30 min)
    Viagem: SP → Campinas
    [📍 Ver detalhes]"
```

---

### 6.11 Fluxo: Status do Caminhão (consulta)

```
Motorista: [🔍 Status do caminhão]
        │
        ▼
[Bot consulta veiculos + manutencoes + avarias]
        │
        ├─── Tudo OK
        │
        ▼
   "🚛 ABC-1234 — TUDO CERTO ✅
    
    📏 KM atual: 125.430
    🔧 Próxima revisão: faltam 3.420 km
    🛢️ Troca de óleo: faltam 1.800 km
    📄 IPVA: pago, válido até 12/2026
    🛡️ Seguro: válido até 03/2027
    
    Nenhuma avaria pendente. Bom trabalho!"

        ├─── Tem problema
        │
        ▼
   "🚛 ABC-1234 — ATENÇÃO ⚠️
    
    🔴 Avaria aberta: Freio dianteiro
       (em análise pelo gestor)
    🟡 Troca de óleo vencida há 800 km
    
    ⚠️ Fale com o gestor antes de
       iniciar nova viagem."
    [📞 Chamar gestor]
```

---

### 6.12 Fluxo: Meus Documentos

```
Motorista: [📄 Meus documentos]
        │
        ▼
Bot: "Qual documento você precisa?"
     [📄 CRLV do caminhão]
     [🛡️ Seguro]
     [📋 RNTRC/ANTT]
     [🆔 Minha CNH]      ← com consentimento LGPD
        │
   Motorista escolhe [📄 CRLV]
        │
        ▼
[Server Action: gera URL R2 assinada (15 min)]
[Grava audit_logs.acao = 'view_sensitive']
        │
        ▼
Bot envia DOCUMENTO PDF/JPG diretamente
"📄 CRLV ABC-1234 (válido até 12/2026)
 Link expira em 15 min."
```

**Segurança:**
- URLs assinadas com expiração 15 min
- Acesso à CNH **sempre** grava `audit_logs`
- LGPD: na primeira solicitação da CNH, bot pede confirmação: *"Esta é sua foto da CNH. Posso enviar? [✅ Sim] [❌ Não]"*

---

### 6.13 Alerta de Descanso e Jornada (Lei 13.103)

Não é fluxo iniciado pelo motorista — é **automático**, baseado em cálculo de jornada.

**Gerado por:**
- Trigger ao inserir `km_logs` ou Edge Function a cada 15 min processando fretes ativos
- Cálculo: `tempo_dirigindo = now() - fretes.data_inicio` (descontando pausas registradas)

**Alertas disparados:**

| Condição | Alerta WhatsApp |
|---|---|
| 5h30 dirigindo sem pausa | *"⏰ João, você está há 5h30 dirigindo. Faça 30 min de pausa agora. ☕"* |
| 8h de jornada | *"🛑 Sua jornada de 8h acabou. Procure local seguro para descansar."* |
| Próximo de 10h (limite com hora extra) | *"⚠️ ATENÇÃO: você está perto de 10h. Risco de multa. Pare imediatamente."* |
| Iniciou nova viagem com < 11h de descanso | Bloqueia início + alerta gestor |

**Registro:**
- Cada pausa registrada vira `km_logs.tipo = 'pausa'` (precisa adicionar ao CHECK) OU evento em tabela separada `pausas_descanso` (futuro)
- MVP: campo `descanso_iniciado_em` na sessão WhatsApp

---

### 6.14 Smart Intent Router (camada inteligente) ⭐

> **O coração da experiência fácil para motoristas limitados.** O bot NÃO exige que o motorista clique em botão certo antes de enviar mídia. Ele **infere a ação** com base no que recebeu + contexto da sessão.

#### Como funciona

```
Motorista envia QUALQUER coisa (foto, áudio, texto)
        │
        ▼
[Bot verifica se há ação explícita pendente]
        │
   ┌────┴─────────────────────────┐
   │ SIM (ex.: aguardando_foto_km) │ NÃO (envio "livre")
   ▼                                ▼
Processa fluxo normal      [Smart Intent Router ativa]
                                   │
                                   ▼
                    [Etapa 1: Classificar mídia]
                    gpt-4o-mini analisa:
                    "Esta foto é de:
                     (a) painel/odômetro
                     (b) bomba de combustível
                     (c) cupom fiscal de combustível
                     (d) cupom fiscal genérico
                     (e) avaria/defeito visível
                     (f) documento (CRLV, CNH)
                     (g) outro/não identificado"
                                   │
                                   ▼
                    [Etapa 2: Cruzar com contexto]
                    Lê sessao.contexto:
                    - veiculo_id selecionado?
                    - viagem ativa?
                    - última ação?
                    - hora do dia?
                                   │
                                   ▼
                    [Etapa 3: Inferir intent]
                    Tabela de decisão →
                                   │
                                   ▼
                    [Etapa 4: Confirmar com 1 botão]
                    "Entendi que você quer X.
                     Tá certo?"
                     [✅ Sim] [✏️ É outra coisa]
                                   │
                                   ▼
                    Executa fluxo correspondente
```

#### Identificação de Role (primeira etapa do Router)

Antes de classificar a mídia, o bot **resolve o role do remetente**:

```
mensagem chega de WhatsApp X
       │
       ▼
SELECT id, motorista_id FROM motoristas WHERE whatsapp = X AND ativo
       │
   ┌───┴────────────────────┐
   │ Encontrou               │ Não encontrou
   ▼                         ▼
role='motorista'      SELECT p.id, ue.role
                      FROM perfis p
                      JOIN usuario_empresas ue ON ue.usuario_id = p.id
                      WHERE p.whatsapp_bot = X AND ue.role IN ('master','gestor')
                             │
                       ┌─────┴──────┐
                       │ Encontrou   │ Não encontrou
                       ▼             ▼
                role='gestor'  DESCARTA mensagem
                                    (sem resposta)
```

Apenas usuários com `whatsapp_bot` configurado (master/gestor) podem usar o bot do lado da gestão. Motoristas ficam no fluxo já existente.

#### Tabela de decisão (mídia × contexto × ROLE)

| Role | Mídia detectada | Contexto da sessão | Intent inferida |
|---|---|---|---|
| motorista | Painel/odômetro | Caminhão selecionado, **sem** frete ativo | **Iniciar frete** (pede origem/destino + valor + KM inicial) |
| motorista | Painel/odômetro | Frete **agendado** do dia, sem outro em andamento | **Iniciar frete agendado** (1 clique confirma → trigger atualiza status) |
| motorista | Painel/odômetro | Frete ativo, > 4h andando | Checkpoint de KM |
| motorista | Painel/odômetro | Frete ativo, perto de horário típico de fim | **Encerrar frete** (registra KM final) |
| motorista | Painel/odômetro | Caminhão selecionado, frete ativo recente (< 30 min) | Confirma KM inicial (ignora duplicata) |
| motorista | Bomba de combustível | Caminhão selecionado | **Iniciar abastecimento** (pergunta valor pago) |
| motorista | Cupom de combustível | Caminhão selecionado | **Abastecimento** (extrai litros/valor automaticamente) |
| motorista | Cupom genérico (não combustível) | Frete ativo | **Registrar despesa** (extrai valor + identifica tipo) |
| motorista | Foto de avaria | Qualquer | **Relatar avaria** |
| motorista | CRLV/CNH | Qualquer | "Você quer consultar este documento?" |
| motorista | Áudio livre | Qualquer | Transcreve + classifica texto |
| motorista | Texto livre | Qualquer | Match por palavras-chave (`adiantamento`, `pedágio`, `quebrou`, etc) |
| **gestor** | **PDF** | Qualquer | **Cadastrar pedido de frete** (6.15) |
| **gestor** | **Screenshot/Print** (UI WhatsApp/email) | Qualquer | **Cadastrar pedido de frete** (6.15) — mesma extração |
| **gestor** | **Foto de documento texto** (não-painel/não-cupom) | Qualquer | **Cadastrar pedido de frete** (6.15) |
| **gestor** | Foto de painel/cupom (raro) | Qualquer | "Isto parece ser de motorista. Você quer registrar uma despesa retroativa?" |
| **gestor** | Áudio | Qualquer | Transcreve → trata como texto |
| **gestor** | Texto livre | Qualquer | **Consulta rápida** (6.16) — classifica intent (lucro, fretes ativos, status motorista, pendências…) |

#### Exemplo 1 — Motorista inicia frete só com foto do painel

```
[Cenário: motorista deu "Oi", selecionou caminhão,
 mas NÃO clicou em "Iniciar Viagem".
 Direto manda foto do painel. E tem um frete AGENDADO
 pra hoje (criado ontem pelo gestor via WhatsApp).]

Motorista: 📷 [foto do odômetro mostrando 125.430]
        │
        ▼
[Router: role=motorista, mídia=painel,
 frete agendado do dia existe]
[Inferência: iniciar o frete agendado]
        │
        ▼
Bot: "Identifiquei KM 125.430.
      Quer iniciar o frete pra ACME LTDA agora?"
      [✅ Sim, começar] [❌ Não, é outra coisa]
        │
   Motorista: [✅ Sim]
        │
        ▼
[Trigger frete_iniciado_atualiza_status:
 status='em_andamento', data_inicio=now()
 km_log inicial criado]
        │
        ▼
Bot: "✅ Viagem iniciada às 06:42!
      KM inicial: 125.430
      ACME LTDA — SP → Campinas
      Boa viagem 🛣️"
```

> **Note:** motorista nunca clicou em "Iniciar Viagem". O bot pulou 3 etapas (escolher veículo, escolher destino, digitar KM). Tudo inferido por contexto.

#### Exemplo 2 — Gestor cadastra pedido encaminhando PDF

```
[Cenário: gestor recebeu PDF de pedido por email,
 encaminhou pro bot.]

Gestor: 📄 [PDF "Pedido_142_ACME.pdf"]
        │
        ▼
[Router: role=gestor, mídia=PDF]
[extrairPedidoFrete via gpt-4o]
        │
        ▼
Bot: "📋 Pedido identificado:

      Cliente: ACME LTDA
      Rota: São Paulo → Campinas
      Frete: R$ 1.500
      Carga: 15.000 kg
      Coleta: 22/05

      Tá certo?"
   [✅ Confirmar] [✏️ Corrigir] [❌ Cancelar]
        │
   Gestor: [✅ Confirmar]
        │
   ... (atribui motorista + caminhão)
        │
        ▼
Bot: "✅ Pedido criado e enviado pro João!"
```

> Em ~20 segundos de chat, sem abrir o sistema.

#### Implementação no `aiService`

```typescript
// services/aiService.ts
export async function classificarMidia(
  url: string,
  tipo: 'foto' | 'audio' | 'texto'
): Promise<MediaClassification> {
  // Para foto: gpt-4o-mini com prompt de classificação
  // Para áudio: whisper-1 → gpt-4o-mini classifica o texto
  // Para texto: gpt-4o-mini direto (ou regex de palavras-chave first)
  // Retorna: { tipo, confianca, dados_extraidos }
}

// lib/whatsapp/intentRouter.ts
export async function rotearIntencao(
  midia: MediaInput,
  sessao: Sessao
): Promise<Intent> {
  const classificacao = await aiService.classificarMidia(midia);
  return decidirIntent(classificacao, sessao.contexto);
  // Função pura que aplica a tabela de decisão
}
```

#### Princípios de UX para motoristas limitados

1. **Sempre confirmar antes de agir** — nunca executa ação inferida sem 1 botão de OK
2. **Botão de escape** — toda confirmação tem `[❌ Cancelar]` ou `[✏️ É outra coisa]`
3. **Mensagens em pt-BR coloquial** — "Tá certo?" em vez de "Confirma a operação?"
4. **Emoji + palavra curta** nos botões — `[🛣️ Sim, iniciar]` é melhor que `[Confirmar início de viagem]`
5. **Fallback humano** — se Router não conseguiu inferir (`g) outro`), bot pergunta: *"Hmm, não entendi. O que você quer fazer?"* + mostra menu de ações
6. **Nunca trava** — se IA falha, cai pro fluxo manual padrão (já documentado em 13.4)

---

### 6.15a Templates HSM (mensagens iniciadas pelo bot fora da janela 24h)

Quando o bot precisa **iniciar** uma conversa (gestor → motorista de manhã, alerta de manutenção, atribuição de frete agendado), o WhatsApp exige uso de **templates HSM pré-aprovados pela Meta**.

**Templates a registrar e aprovar:**

| Código | Categoria Meta | Uso |
|---|---|---|
| `novo_pedido_motorista` | UTILITY | Gestor atribuiu frete — motorista recebe com botões `[✅ Aceitar] [📞 Ligar]` |
| `lembrete_checklist_diario` | UTILITY | 07:00 dia útil — "Bom dia! Vamos conferir o caminhão de hoje?" |
| `alerta_manutencao_vencendo` | UTILITY | Próxima manutenção em < 1.000 km — para o gestor |
| `alerta_documento_vencendo` | UTILITY | CNH/IPVA/seguro vence em < 30 dias |
| `adiantamento_pendente_aprovacao` | UTILITY | Motorista pediu — gestor recebe com `[✅ Aprovar] [❌ Recusar]` |
| `pagamento_adiantamento_realizado` | UTILITY | Gestor pagou — motorista recebe confirmação |
| `frete_nao_aceito_alerta` | UTILITY | Motorista não aceitou em 12h — gestor escolhe reatribuir/cancelar |
| `resumo_diario_gestor` | UTILITY | (opcional pós-MVP) — 18:00 resumo do dia |
| `ia_indisponivel` | UTILITY | Sistema avisa gestor que IA está fora — fluxo manual ativado |

> **Categoria UTILITY** é cobrada por mensagem (~R$ 0,02-0,04 cada). Categoria MARKETING é mais cara e exige opt-in. Todos os templates acima se encaixam em UTILITY (relacionados a transação/serviço).

**Implementação:** salvar IDs dos templates aprovados em variáveis de ambiente, e ter helper `enviarTemplate(template_code, parametros, destinatario)` em `lib/whatsapp/messageSender.ts`.

---

### 6.15 Fluxo (Gestor): Cadastrar Pedido via WhatsApp (foto / PDF / print) ⭐

Maior ganho de produtividade do gestor. Encaminha qualquer mensagem com pedido de frete → bot extrai → cria.

```
Gestor encaminha pro bot:
  📸 foto do pedido / 🖼️ print de tela / 📄 PDF
       │
       ▼
[Bot identifica role: perfis.whatsapp_bot]
[Smart Router classifica: documento_pedido_frete]
       │
       ▼
[extrairPedidoFrete(midia) - gpt-4o full]
   Extrai:
   - cliente_nome, cliente_cnpj
   - origem, destino
   - valor_frete, peso_carga, tipo_carga
   - data_coleta, data_entrega
   - observacoes
       │
       ▼
[Bot busca cliente_nome/cnpj na tabela clientes]
       │
   ┌───┴────────────────────────────┐
   │ ENCONTRADO                      │ NÃO ENCONTRADO
   ▼                                 ▼
Bot mostra resumo c/ cliente_id   Bot: "Cliente 'ACME LTDA'
                                         não está cadastrado.
                                         Quer cadastrar agora?"
                                   [✅ Cadastrar e seguir]
                                   [📋 Buscar outro cliente]
                                   [⏭️ Frete avulso (sem cliente)]
       │
       ▼
Bot: "📋 Pedido identificado:

      Cliente: ACME LTDA
      Rota: São Paulo → Campinas
      Frete: R$ 1.500,00
      Carga: 15.000 kg (carga seca)
      Coleta: 22/05
      Entrega: 23/05

      Tá certo?"
   [✅ Confirmar] [✏️ Corrigir] [❌ Cancelar]
       │
       ▼
Bot: "Atribuir a qual motorista?"
   [Lista interativa: motoristas ativos]
       │
   Gestor clica: João
       │
       ▼
Bot: "Qual caminhão?"
   [Lista interativa: caminhões ativos e sem frete em andamento]
       │
   Gestor clica: ABC-1234
       │
       ▼
[Cria fretes status='agendado', criado_via='whatsapp_gestor',
 criado_por_usuario_id=usuario logado]
       │
       ├─── Envia HSM template ao motorista (fora janela 24h)
       │    "📋 Novo pedido pra você:
       │     ACME LTDA — SP → Campinas
       │     Coleta: amanhã 22/05
       │     Frete: R$ 1.500 (sua comissão: R$ 150)
       │     [✅ Aceitar] [📞 Ligar pro gestor]"
       │
       └─── Confirma pro gestor
            "✅ Pedido criado e enviado pro João!
             Frete #142. Acompanha pelo dashboard."
```

> **Auditoria:** registra em `audit_logs.acao = 'create'`, entidade `frete`, com `criado_via = 'whatsapp_gestor'` para rastreabilidade.

> **Quando o motorista aceitar e mandar foto do painel:** o trigger `frete_iniciado_atualiza_status` (seção 14.2) muda automaticamente o status de `agendado` → `em_andamento` e preenche `data_inicio`. Ninguém precisa clicar nada extra.

---

### 6.16 Fluxo (Gestor): Consultas Rápidas em Texto Livre

Gestor manda texto livre → bot interpreta intenção e responde.

```
Gestor: "Quanto deu de lucro este mês?"
       │
       ▼
[Smart Router (role=gestor, mídia=texto)]
[gpt-4o-mini classifica intent: consulta_lucro_mensal]
       │
       ▼
[Consulta kpi_mensal_empresa do mês corrente]
       │
       ▼
Bot: "📊 Maio/2026 (até hoje):
      Receita: R$ 32.400
      Custo:   R$ 22.100
      Lucro:   *R$ 10.300* (margem 31,8%)
      
      14 fretes concluídos • 8.230 km rodados"
```

**Outras perguntas comuns reconhecidas:**

| Texto | Intent | Resposta |
|---|---|---|
| "quem tá na estrada?" / "fretes em andamento" | `consulta_fretes_ativos` | Lista de fretes com status=em_andamento + motorista + rota |
| "como o João tá indo?" / "status do João" | `consulta_motorista` | Frete ativo do João + KM rodado hoje + última posição |
| "fretes do mês" / "quantos fretes esse mês" | `consulta_fretes_mes` | Contagem + soma de receita |
| "adiantamentos pendentes" / "tem coisa pra aprovar?" | `consulta_pendencias` | Lista de adiantamentos `pendente` com botões aprovar/recusar |
| "frota" / "como tá a frota?" / "tem manutenção vencida?" | `consulta_frota_saude` | Resumo: X em dia, Y próximos, Z vencidos |
| "lucro do ABC-1234" / "lucro do caminhão X" | `consulta_lucro_veiculo` | Lucro do mês daquele veículo |
| qualquer texto não reconhecido | `fallback_menu_gestor` | "Hmm, não entendi. Opções: [📋 Cadastrar pedido] [📊 Lucro do mês] [📍 Quem tá na estrada]" |

> **Custo:** ~$0,10/mês para todas as consultas (modelo leve, prompts curtos).

---

### 6.17 Fluxo (Motorista): Aceitar Frete Agendado

Disparado quando gestor atribui um frete (6.15) e o sistema envia HSM ao motorista.

```
[Motorista recebe template HSM via WhatsApp]
   "📋 Novo pedido pra você:
    ACME LTDA — SP → Campinas
    Coleta: amanhã 22/05
    Frete: R$ 1.500 (sua comissão: R$ 150)
    [✅ Aceitar] [📞 Ligar pro gestor]"
       │
   Motorista clica [✅ Aceitar]
       │
       ▼
[Bot registra aceite em fretes (campo aceito_pelo_motorista_em)]
       │
       ▼
Bot: "✅ Pedido aceito! Quando começar a viagem,
      é só me mandar a foto do painel para registrar
      o KM inicial.
      
      Boa viagem amanhã! 🛣️"

[No dia da coleta — Smart Router em ação]
   Motorista manda foto do painel
       │
       ▼
[Smart Router: painel + frete agendado do dia + sem outro em andamento]
[Inferência: motorista está iniciando o frete agendado]
       │
       ▼
Bot: "Identifiquei KM 125.430.
      Quer iniciar o frete pra ACME LTDA agora?"
      [✅ Sim, começar] [❌ Não, é outra coisa]
       │
   Clica ✅
       │
       ▼
[Trigger frete_iniciado_atualiza_status:
 status='em_andamento', data_inicio=now()
 km_log inicial criado]
       │
       ▼
Bot: "✅ Viagem iniciada às 06:42!
      KM inicial: 125.430
      Boa viagem! 🛣️"
```

> **Se o motorista recusar/não aceitar em 12h:** alerta automático pro gestor (`alertas.tipo = 'frete_nao_aceito'`) com botões `[🔄 Reatribuir]` / `[❌ Cancelar frete]`.

> **Novo campo necessário em `fretes`:** `aceito_pelo_motorista_em timestamptz` — fica registrado o aceite. Vou adicionar na próxima migration.

---

## 7. MÓDULOS DO DASHBOARD WEB (Gestor)

> **Filosofia:** apenas **6 módulos no menu principal**. Tudo o que era operacional fino (checklists, imprevistos, adiantamentos, jornada) vira **drill-down** dentro dos módulos principais ou aparece no **Home** como card de ação. O gestor não precisa decorar 15 menus.

### 7.1 Os 6 módulos

| # | Módulo | O que tem |
|---|---|---|
| 🏠 1 | **Home** | KPIs financeiros do mês (lucro, receita, custo, margem), tarefas urgentes (adiantamentos a aprovar, avarias críticas, documentos vencendo), fretes em andamento, insight de IA |
| 🛣️ 2 | **Fretes** | Lista (com lucro/margem em cada linha) + drill-down: rota, KM, **despesas consolidadas** (combustível + cupons + adiantamentos), **imprevistos** ocorridos, foto cupons, comissão calculada |
| 🚛 3 | **Frota** | Caminhões + drill-down: documentos (IPVA, licenciamento, seguro), **manutenções** (catálogo de 35 tipos: última × próxima × custo, em verde/amarelo/vermelho, com aba para registrar nova), **avarias** abertas, **checklists** dos últimos dias, KPI mensal por veículo (lucro/km) |
| 👤 4 | **Motoristas** | Cadastro + drill-down: histórico de fretes, **comissões a pagar** (fechamento mensal), CNH validade, jornada da semana (resumo simples), foto/CNH |
| 💰 5 | **Financeiro** | Lucro/prejuízo mensal e anual, fluxo de caixa, fretes a receber, **adiantamentos** (pendentes/aprovados/prestação), comissões a pagar, relatórios exportáveis (PDF/CSV), **clientes (CRM)** com fretes e receita por cliente |
| ⚙️ 6 | **Config** | Dados da empresa, **usuários** (Master only), seletor de empresa ativa, thresholds (KM revisão, dias para alerta vencimento), itens do checklist, **backup completo** (Master only) |

### 7.2 O que foi consolidado (vs versão anterior)

| Antes (módulo dedicado) | Agora (onde está) |
|---|---|
| Checklists | Drill-down em **Frota → caminhão → aba "Checklists"** + card no Home |
| Adiantamentos | Aba dentro de **Financeiro** + card no Home (pendentes de aprovação) |
| Despesas | Drill-down em **Fretes → viagem → aba "Despesas"** |
| Imprevistos | Drill-down em **Fretes → viagem → timeline** + feed lateral no Home |
| Avarias | Drill-down em **Frota → caminhão → aba "Avarias"** + card no Home (críticas) |
| Manutenções | Drill-down em **Frota → caminhão → aba "Manutenções"** |
| Jornada (Lei 13.103) | **Removido como módulo.** Mantido só como alertas WhatsApp em tempo real ao motorista + resumo simples em "Motoristas → motorista" |
| Usuários | Dentro de **Config** (Master only) |

### 7.3 Drill-down de Manutenção (Frota → Caminhão → Manutenções)

A view `proxima_manutencao_veiculo` (14.5) entrega tudo pronto. UI proposta:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 🚛 ABC-1234 (Volvo FH 540)  •  KM atual: 125.847                            │
├─────────────────────────────────────────────────────────────────────────────┤
│ [📊 Geral] [🔧 Manutenções] [⚠️ Avarias] [📋 Checklists] [📄 Documentos]    │
├─────────────────────────────────────────────────────────────────────────────┤
│ 🔧 MANUTENÇÕES                                                              │
│                                                                             │
│ Filtros: [Categoria ▼] [Status ▼] [🔍 Buscar]   [+ NOVA MANUTENÇÃO]         │
│                                                                             │
│ ┌─────────────────────────────────────────────────────────────────────────┐ │
│ │ ✅ EM DIA           ⚠️ PRÓXIMO (<1.000 km)        🔴 VENCIDO            │ │
│ │      24                  3                              2               │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│ TIPO                       ÚLTIMA          PRÓXIMA       FALTAM    STATUS  │
│ ──────────────────────────────────────────────────────────────────────────  │
│ 🔴 Troca óleo motor        110.000 km     125.000 km    -847 km    VENCIDO │
│   última: 12/02/2026 • R$ 850 • Oficina Diesel & Cia                       │
│   [📝 Registrar realização]                                                │
│                                                                             │
│ ⚠️ Troca filtro de ar      95.000 km      125.000 km    -847 km   PRÓXIMO  │
│   última: 03/12/2025 • R$ 180 • Posto Shell                                │
│                                                                             │
│ ✅ Troca lonas de freio   80.000 km      140.000 km    14.153 km   EM DIA  │
│   última: 18/08/2025 • R$ 2.400 • Concessionária Volvo                     │
│                                                                             │
│ ⚪ Troca correia dentada   nunca feito    —             —       NUNCA FEITO│
│   [📝 Registrar primeira realização]                                       │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Comportamento:**
- Tabela usa cores semânticas (verde / amarelo / vermelho / cinza)
- Ordenação padrão: vencidos primeiro, depois próximos, depois em-dia
- Botão **`+ NOVA MANUTENÇÃO`** abre modal: escolhe tipo (lista do catálogo + busca), data, KM realizada, custo (peças + mão de obra), fornecedor, anexo da NF — sistema calcula próxima automaticamente pelo intervalo
- Para tipos que ainda **nunca** foram feitos: mostra "Nunca feito" em cinza + ação rápida
- **Tipo `outros`** disponível na lista pra qualquer coisa avulsa (ex.: "Pintar a cabine após batida") com campo de descrição obrigatório

### 7.4 Home Dashboard — mobile-first

O gestor abre o sistema (web ou celular) e vê **tudo o que importa em uma tela**:

```
┌─────────────────────────────────────┐
│  RB Transportes ▼  |  Olá Ronaldo  │ ← seletor de empresa + nome
├─────────────────────────────────────┤
│  📊 ESTE MÊS (maio/2026)            │
│  ┌─────────────────────────────────┐│
│  │   LUCRO    R$ 12.450  ↑18%     ││ ← NÚMERO GRANDE (verde/vermelho)
│  │   Receita: R$ 48.300            ││
│  │   Custo:   R$ 35.850            ││
│  │   Margem:  25,8%                ││
│  └─────────────────────────────────┘│
│                                     │
│  🔥 PRECISA DE VOCÊ AGORA           │
│  ⏳ 2 adiantamentos p/ aprovar  →   │ ← clica e aprova ali mesmo
│  ⚠️ 1 avaria crítica (ABC-1234) →   │
│  📄 IPVA vence em 5 dias        →   │
│  📋 1 checklist com problema    →   │
│                                     │
│  📍 AGORA NA ESTRADA                │
│  🛣️ João → Campinas (em curso)     │
│  🛣️ Carlos → Sorocaba (parado 30m) │ ← imprevisto registrado
│                                     │
│  💡 INSIGHT DO MÊS                  │
│  "Caminhão DEF-5678 está gastando   │
│   12% mais combustível que a média. │
│   Verificar."                       │
└─────────────────────────────────────┘
```

**Princípios do Home:**
- 1 tela, sem rolar no desktop; rolar mínimo no mobile
- **Números antes de gráficos** (gestor olha "R$ 12.450", não barra)
- **Cores semânticas binárias**: verde = bom, vermelho = atenção. Sem nuance.
- **Tarefas urgentes acionáveis** — clica e resolve sem sair da Home
- **Sem dashboards complexos** (gráfico de torta, heatmap, etc) — fica no módulo Financeiro pra quem quiser
- **Insight de IA mensal** — análise leve baseada em `kpi_mensal_veiculo`/`_motorista`

---

## 8. IDENTIDADE VISUAL E PADRÕES DE FRONTEND

> **Referência:** Projeto `RBARROS-Galeria-Repositorio-SISTEMARB`. Todo o dashboard do Sistema de Frota deve seguir fielmente estes padrões visuais.

### 8.1 Paleta de Cores

| Token | Hex / Classe | Uso |
|---|---|---|
| Sidebar background | `#313f50` | Fundo fixo da barra lateral |
| Sidebar item ativo | `#3d4f63` | Background do item de navegação selecionado |
| Texto inativo sidebar | `#A8ACC0` | Links não selecionados |
| Main background | `bg-slate-50` | Fundo geral do conteúdo |
| Texto principal | `text-slate-800` | Títulos e dados |
| Texto secundário | `text-slate-500` | Labels, subtítulos |
| Acento primário | `bg-blue-600` | Botão principal, bordas de foco |
| **Botão Backup/Destaque** | `bg-amber-500` | Ações críticas/de atenção (backup, exportar) |
| Danger | `bg-red-500` | Exclusão, logout, encerrar acesso |
| Success | `bg-green-500` | Confirmações, status ativo |

### 8.2 Tipografia

- **Fonte:** `Inter` (Google Fonts) — importada no `layout.tsx`
- **Labels de campo/coluna:** `text-[10px] font-black uppercase tracking-widest text-slate-500`
  - Tudo em maiúsculas, espaçamento largo, peso máximo
- **Títulos de seção (dentro de formulários):** `text-[13px] font-black uppercase tracking-widest` com `border-b-2 border-slate-950`
- **Dados nas tabelas:** `text-sm font-bold text-slate-800`
- **Versão do sistema:** `text-[13px] text-blue-300/60 font-mono` na sidebar

### 8.3 Componentes Base

#### Tabelas (Listagens Densas)
- **Desktop:** `<table>` com cabeçalho `bg-slate-50`, linhas `divide-y divide-slate-100`, padding `px-4 py-3`
- **Mobile:** Cards empilhados (`flex-col divide-y divide-slate-100`) — mesmos dados, layout adaptado
- Hover nas linhas: `hover:bg-slate-50 transition-colors`
- **Nunca** usar espaçamento generoso: listagens **densas** são a regra

#### Inputs / Campos de Formulário
```
bg-slate-50 → fundo padrão
bg-white    → fundo ao focar
border-2 border-slate-200 → borda padrão
focus:border-blue-600    → borda ao focar
rounded-none             → SEM arredondamento (sharp corners)
p-3                      → padding interno
font-bold text-sm text-slate-800
outline-none transition-all
```

#### Botão Primário (Gravar / Salvar)
```
bg-blue-600 text-white hover:bg-blue-700
text-[10px] font-black uppercase tracking-widest
border-2 border-transparent hover:border-blue-900
shadow-[4px_4px_0px_#1e3a8a]     ← sombra neobrutalist
active:translate-y-1 active:translate-x-1 active:shadow-none ← efeito de press
```

#### Botão de Backup / Ação Crítica (Amber)
```
bg-amber-500 hover:bg-amber-600
text-[10px] font-black uppercase tracking-widest
text-white shadow-sm
```
> Deve ter **modal de progresso** com barra animada quando a ação demora.

#### Botão Outline / Cancelar
```
bg-white text-slate-600
border-2 border-slate-200 hover:bg-slate-100
text-[10px] font-black uppercase tracking-widest
```

#### Cards de Seleção (Permissões / Status)
- Borda `border-2` que muda de cor ao selecionar
- Sombra neobrutalist ao ativar: `shadow-[4px_4px_0px_#2563eb] -translate-y-1`
- Triângulo decorativo no canto superior direito quando ativo

#### Status Badges (Pills)
```
px-2 py-0.5 rounded-full
text-[10px] font-black uppercase tracking-tighter
bg-green-100 text-green-700  → Ativo / Concluído
bg-red-100 text-red-700      → Inativo / Crítico
bg-amber-100 text-amber-700  → Pendente / Atenção
bg-blue-100 text-blue-700    → Em andamento
bg-orange-100 text-orange-700 → Alerta / Manutenção
```

### 8.4 Layout Geral

```
┌─────────────────────────────────────────┐
│ SIDEBAR (w-56, fixed, #313f50)          │ ← Logo + versão + nav
│  [Logo]                                 │
│  v1.0.0                                 │
│  ─────────────                          │
│  🚛 Frota              ← item ativo     │
│  👤 Motoristas                          │
│  🛣️ Fretes                             │
│  🔧 Manutenções                         │
│  ⚠️ Avarias                             │
│  📊 Relatórios                          │
│  ─────────────                          │
│  Sair                                   │
├─────────────────────────────────────────┤
│ MAIN (ml-56, bg-slate-50)               │
│  [Header: título + user badge]          │
│  ─────────────────────────────          │
│  [Conteúdo da página]                   │
└─────────────────────────────────────────┘
```

- **Sidebar:** Fixa, largura `w-56` (224px), recolhível no mobile com backdrop
- **Header:** Título da página à esquerda + avatar/role do gestor à direita
- **Zoom por Ctrl+Scroll:** Feature do conteúdo principal (não do header/sidebar)
- **Safe area iOS:** `env(safe-area-inset-bottom)` aplicado em mobile

### 8.5 Modais

- **Desktop:** Centralizado, `max-w-lg` ou `max-w-3xl`, `rounded-xl`, `backdrop-blur-sm`
- **Mobile:** Ocupa tela inteira (`h-full sm:h-auto`)
- Header do modal: `bg-slate-50/30 border-b border-slate-100`, botão X à direita
- Animação de entrada: `animate-in fade-in zoom-in duration-200`

### 8.6 Padrões Obrigatórios do Sistema de Frota

| Padrão | Aplicação |
|---|---|
| **Tabelas densas** | Frota, Motoristas, Fretes, Manutenções, Avarias |
| **Botão amber de destaque** | "Exportar Relatório", "Backup de Dados", ações críticas do gestor |
| **Cards mobile empilhados** | Versão mobile de todas as tabelas |
| **Labels uppercase tiny** | Todos os campos de formulário e cabeçalhos de tabela |
| **Sharp corners nos inputs** | `rounded-none` em todos os campos |
| **Sombra neobrutalist no submit** | Botão principal de cada formulário |
| **Modal de progresso** | Ações longas: exportar relatório, backup, sincronização |
| **Versão no sidebar** | `v1.0.0` em fonte mono, cor desbotada |
| **Alertas com confirmação** | Toda ação destrutiva (excluir, encerrar viagem, cancelar manutenção) |

### 8.7 Botão de Backup Completo do Sistema (Master Only)

> **Referência:** `backupService.ts` + `Users.tsx` do projeto RBARROS. Recurso exclusivo do usuário **Master/Admin** do Sistema de Frota.

#### O que é o Backup

Um backup completo e automático gerado no **próprio navegador**, que baixa um arquivo `.zip` contendo:

| Conteúdo do ZIP | Descrição |
|---|---|
| `database/1_auth_users_restore.sql` | Usuários do Supabase Auth |
| `database/2_schema_ddl.sql` | Schema completo das tabelas |
| `database/4_database_backup.sql` | Todos os dados (INSERTs) |
| `database/5_functions_ddl.sql` | Funções PostgreSQL |
| `database/6_rls_policies.sql` | Políticas RLS |
| `schema_migrations/` | Todas as migrations versionadas |
| `storage_backup/` | Todos os arquivos do Cloudflare R2 (fotos, PDFs) |
| `source_code/` | Todo o código-fonte do projeto |
| `RESTORE_GUIDE.md` | Guia passo-a-passo de restauração |

> ✅ **Apenas leitura** — nenhum dado é modificado ou excluído. Zero risco.

#### Localização no Sistema de Frota

O botão ficará na **página de Configurações**, visível apenas para o gestor Master:

```
┌─────────────────────────────────────────────────┐
│ CONFIGURAÇÕES DO SISTEMA                         │
│ ─────────────────────────────────────────────── │
│ Empresa | Alertas | Thresholds de Manutenção     │
│                                                  │
│ ┌─────────────────────────────────────────────┐ │
│ │ 🗄️ BACKUP COMPLETO DO SISTEMA               │ │
│ │ Exporta banco + arquivos + código-fonte      │ │
│ │ [⬇ GERAR BACKUP]  ← botão amber             │ │
│ └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

#### Aparência do Botão

```tsx
// Botão amber — igual ao padrão RBARROS
<button
  onClick={handleBackup}
  disabled={backupLoading}
  className="flex items-center gap-2 px-4 py-2.5
             bg-amber-500 hover:bg-amber-600
             disabled:opacity-50 text-white
             text-[10px] font-black uppercase tracking-widest
             transition-colors shadow-sm"
>
  {backupLoading ? (
    <span>Gerando...</span>
  ) : (
    <>
      <DownloadIcon className="w-4 h-4" />
      Backup Completo
    </>
  )}
</button>
```

#### Modal de Progresso (durante o backup)

Abre automaticamente ao clicar. Mostra 5 fases com barra de progresso animada:

```
┌──────────────────────────────────────────┐
│ Backup do Sistema                    [X] │
├──────────────────────────────────────────┤
│                                          │
│    [⟳ spinner amber girando]             │
│                                          │
│    EXPORTANDO TABELAS                    │
│    Consultando 12 tabelas em paralelo... │
│                                          │
│  Progresso                        27%    │
│  ████████░░░░░░░░░░░░░░░░░░░░░░░░░       │
│                                          │
│ ⚠️ Não feche esta janela até concluir.   │
└──────────────────────────────────────────┘
```

**Fases do progresso:**
| Fase | Label exibido | % |
|---|---|---|
| `db` | "Exportando banco de dados..." | 2–29% |
| `storage` | "Baixando arquivos do R2 (N de M)..." | 30–80% |
| `source` | "Incluindo código-fonte..." | 80–88% |
| `zipping` | "Compactando arquivo final..." | 88–100% |
| `done` | "Backup concluído! ✅" | 100% |

Quando `done`: spinner vira **ícone de check verde** com `animate-bounce`.

#### Lógica Técnica para o Sistema de Frota

```typescript
// backupService.ts — adaptação para o Sistema de Frota
export const backupService = {
  async downloadFull(onProgress?: BackupProgressCallback): Promise<void> {
    const zip = new JSZip();

    // 1. Exportar banco (todas as tabelas em paralelo)
    onProgress?.({ phase: 'db', label: 'Exportando banco...', pct: 2 });
    const sql = await this.exportDatabase(onProgress);
    zip.folder('database')!.file('backup.sql', sql);

    // 2. Baixar arquivos do Cloudflare R2
    onProgress?.({ phase: 'storage', label: 'Baixando arquivos...', pct: 30 });
    await this.downloadR2Files(zip.folder('storage')!, onProgress);

    // 3. Código-fonte (via Vite glob)
    onProgress?.({ phase: 'source', label: 'Incluindo código-fonte...', pct: 80 });
    // ... adicionar arquivos

    // 4. Compactar e disparar download
    onProgress?.({ phase: 'zipping', label: 'Compactando...', pct: 88 });
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    saveAs(blob, `SistemaFrota_Backup_${dateStr}.zip`);

    onProgress?.({ phase: 'done', label: 'Backup concluído!', pct: 100 });
  }
};
```

**Dependências necessárias:**
```bash
npm install jszip file-saver
npm install -D @types/file-saver
```

**Downloads paralelos:** 40 arquivos simultâneos com timeout de 30s por arquivo. Imagens/PDFs adicionados com `STORE` (sem compressão dupla).



### 8.8 Padrão de Listagem e Pesquisa (Filtros)

> **Referência:** `usePhotoFilters.ts` + `Photos.tsx` do projeto RBARROS. Aplicar este padrão em **todas** as páginas de listagem do Sistema de Frota.

#### Arquitetura da Busca

O sistema de filtros é extraído para um **hook customizado** (`useFilters`), separado da UI. Ele encapsula toda a lógica de filtragem e devolve o resultado já processado para o componente.

```
Hook useFilters (lógica pura, sem UI)
  ├── searchTerm          → filtro por texto livre (nome, placa, etc.)
  ├── selectedFilters     → filtros por categoria/valor (dropdown)
  ├── sortBy / sortOrder  → ordenação
  └── filteredResult      → IDs/objetos filtrados (useMemo)

Componente de Listagem (apenas UI)
  ├── Barra de Filtros     → inputs conectados ao hook
  ├── Contador de Resultados → "{N} registros encontrados"
  └── Tabela/Cards         → renderiza filteredResult
```

#### Barra de Filtros (Topo da Listagem)

**Desktop — linha única acima da tabela:**
```
┌─────────────────────────────────────────────────────────────────────┐
│ [🔍 Pesquisar por placa, motorista...] [Dropdown Veículo▼] [Status▼]│
│ [Checkbox: Apenas Ativos] [Ordenar por: Data▼]    [LIMPAR FILTROS] │
│ ── 70 de 99 registros ──────────────────────────────────────────────│
└─────────────────────────────────────────────────────────────────────┘
```

**Mobile — filtros no sidebar recolhível (mesmo padrão da galeria):**
- Botão `[🔽 Filtros]` abre/fecha painel de filtros
- Filtros dentro do sidebar no mobile (injetados via prop `mobileSidebarContent`)

#### Campo de Busca (Search Input)

```tsx
// Estilo padrão do campo de busca — igual ao projeto RBARROS
className="w-full bg-slate-100 border-none rounded-2xl py-3 pl-11 pr-4
           text-sm font-medium text-slate-700
           placeholder:text-slate-400
           focus:bg-white focus:ring-2 focus:ring-blue-100
           transition-all outline-none"
```

- Ícone de lupa à esquerda (`absolute inset-y-0 left-0 pl-4`)
- Fundo `bg-slate-100` → muda para `bg-white` ao focar
- Ring sutil `focus:ring-2 focus:ring-blue-100` (não a borda azul forte dos inputs de formulário)
- Busca é **reativa** — filtra à medida que o usuário digita (`onChange`)
- Busca em **múltiplos campos**: placa, apelido, motorista, modelo, etc.

#### Dropdowns de Filtro

```tsx
// Label + select inline (padrão RBARROS)
<div className="flex items-center gap-2 px-3 py-1 bg-slate-50 rounded-lg border border-slate-200">
  <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
    Status:
  </label>
  <select className="bg-transparent text-xs font-bold text-slate-700 focus:outline-none cursor-pointer">
    <option value="all">Todos</option>
    <option value="ativo">Ativo</option>
    <option value="manutencao">Em Manutenção</option>
  </select>
</div>
```

#### Contador de Resultados

Sempre visível, atualiza em tempo real:
```tsx
<span className="text-xs font-semibold text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">
  {filteredResult.length} registros
</span>
// ou no rodapé da tabela:
<span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
  {filteredResult.length} de {total} documentos
</span>
```

#### Botão "Limpar Filtros"

- Aparece apenas quando **há filtros ativos**
- Cor muda conforme estado (azul claro = sem seleção, azul forte = com seleção)
- Reset completo: limpa texto, dropdowns, checkboxes e seleções

#### Lógica de Filtragem (Hook)

```typescript
// Padrão do useFilters — aplicar em Frota, Fretes, Manutenções, etc.
const filteredResult = useMemo(() => {
  let items = [...allItems];

  // 1. Filtro por texto livre
  if (searchTerm) {
    const lower = searchTerm.toLowerCase();
    items = items.filter(item =>
      item.placa?.toLowerCase().includes(lower) ||
      item.apelido?.toLowerCase().includes(lower) ||
      item.motoristaNome?.toLowerCase().includes(lower)
    );
  }

  // 2. Filtros por categoria (dropdowns)
  if (statusFilter !== 'all') {
    items = items.filter(item => item.status === statusFilter);
  }

  // 3. Ordenação
  if (sortBy === 'data') {
    items = [...items].sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  return items;
}, [allItems, searchTerm, statusFilter, sortBy]);
```

#### Paginação / "Carregar Mais"

- **Não usar paginação tradicional com páginas** (1, 2, 3...)
- Usar padrão **"Load More"**: exibir N registros, botão "Carregar mais" ao final
- Ou **scroll infinito** com `IntersectionObserver` (ver `onLastVisible` no `PhotoCard`)
- Constante `ITEMS_PER_PAGE = 30` para tabelas (vs 24 da galeria de fotos)

#### Filtros por Módulo do Sistema de Frota

| Módulo | Campos de Busca | Dropdowns de Filtro |
|---|---|---|
| **Frota** | Placa, Apelido, Modelo | Status (ativo/inativo), Marca |
| **Motoristas** | Nome, WhatsApp, CNH | Status (ativo/inativo) |
| **Fretes** | Cliente, Origem, Destino, Placa, Motorista | Status (agendado/andamento/concluído/cancelado), Veículo, Cliente |
| **Manutenções** | Descrição, Tipo | Status (pendente/aprovada/concluída), Veículo |
| **Avarias** | Descrição, Placa | Urgência (baixa/média/alta/crítica), Status |
| **Abastecimentos** | Posto, Placa | Veículo, Período |

---

## 9. ORDEM DE SETUP DA INFRAESTRUTURA

Antes de começar a codar, vamos configurar as plataformas na ordem abaixo:

| Passo | Plataforma | O que fazer | Status |
|---|---|---|---|
| 1️⃣ | **GitHub** | Criar repositório privado e subir o projeto inicial | ✅ **Concluído** |
| 2️⃣ | **Supabase** | Criar projeto, aplicar migrations, configurar Auth e RLS | ✅ **Concluído** |
| 3️⃣ | **Vercel** | Conectar ao repositório GitHub, configurar variáveis de ambiente | ✅ **Concluído** |
| 4️⃣ | **Sentry** | Criar projeto, obter DSN, integrar ao Next.js | ⏳ Aguardando |
| 5️⃣ | **Cloudflare R2** | Criar bucket, gerar credenciais de acesso | ⏳ Aguardando |
| 6️⃣ | **Meta Cloud API** | Criar conta Business, configurar número WhatsApp (Fase 3) | ⏳ Aguardando |
| 7️⃣ | **OpenAI** | Gerar API Key GPT-4o (Fase 4) | ⏳ Aguardando |

> ✅ **Progresso atual:** Passos 1, 2 e 3 concluídos. Repositório, Banco de Dados e Vercel (CI/CD) estão no ar e conectados. Próximo passo sugerido: **Inicializar o projeto Next.js localmente.**

### Detalhes do que já foi feito:

| Item | Detalhe | Status |
|---|---|---|
| Repositório GitHub | `https://github.com/delafray/SISTEMA_DE_FROTA` — branch `main` | ✅ |
| Arquivos no Git | `CLAUDE.md`, `PLANO_DE_PROJETO.md`, `.gitignore` | ✅ |
| Supabase projeto | `sistema-de-frota` — região **South America (São Paulo)** | ✅ |
| Supabase URL | `https://ltfthfbounngaubwsxfw.supabase.co` | ✅ |
| Auth — Confirm email | Desativado (gestor cria contas sem precisar confirmar email) | ✅ |
| `.env.local` | Criado com `NEXT_PUBLIC_SUPABASE_URL`, `ANON_KEY` e `SECRET_KEY` | ✅ |
| MCP Supabase | Token atualizado para conta `delafray` (projeto visível via MCP) | ✅ |
| Migrations DB | 20 tabelas + 5 views + 25 triggers + 36 tipos de manutenção aplicados | ✅ |
| RLS | Ativado em todas as 20 tabelas com políticas por role | ✅ |

---

## 10. FASES DE IMPLEMENTAÇÃO

---

### 🔵 FASE 1 — Setup e Banco de Dados

**Objetivo:** Criar a estrutura base do projeto e o banco de dados completo, incluindo multi-empresa, roles e auditoria.

**Tarefas:**

**Projeto e plataformas:**
- [x] Criar repositório no GitHub (privado) e fazer commit inicial → `https://github.com/delafray/SISTEMA_DE_FROTA`
- [x] Inicializar projeto Next.js 14+ (App Router) com TailwindCSS + TypeScript
- [ ] Instalar dependências: `@supabase/ssr`, `zod`, `react-hook-form`, `@hookform/resolvers`, `react-imask`, `jszip`, `file-saver`
- [x] Configurar variáveis de ambiente (`.env.local` criado com URL + keys do Supabase)
- [ ] Criar `.env.example` com placeholders (sem valores reais) e commitar
- [ ] Configurar Cloudflare R2 (bucket privado + credenciais)
- [ ] Configurar Sentry (DSN + integração Next.js)

**Banco de dados (Supabase):**
- [x] Criar projeto Supabase exclusivo do Sistema de Frota → `ltfhfbounngaubwsxfw` (São Paulo)
- [x] Configurar Supabase Auth — email confirmation desativado
- [x] Migration `001_empresas` — tabela empresas
- [x] Migration `002_perfis` — tabela perfis + trigger `handle_new_user`
- [x] Migration `003_usuario_empresas` — tabela usuario_empresas + índice único de `is_padrao`
- [x] Migration `004_veiculos` — tabela veiculos
- [x] Migration `005_motoristas` — tabela motoristas + FK circular com perfis
- [x] Migration `006_clientes` — tabela clientes (CRM básico)
- [x] Migration `007_fretes` — tabela fretes (com `aceito_pelo_motorista_em` e `km_total` GENERATED)
- [x] Migration `008_km_logs` — tabela km_logs + trigger propagação km + trigger início de frete
- [x] Migration `009_abastecimentos` — tabela abastecimentos
- [x] Migration `010a_tipos_manutencao` — tabela tipos_manutencao + seed 36 tipos padrão
- [x] Migration `010b_plano_manutencao_veiculo` — tabela plano_manutencao_veiculo
- [x] Migration `011_manutencoes` — tabela manutencoes + trigger calcula km_proxima/data_proxima
- [x] Migration `012_avarias` — tabela avarias
- [x] Migration `013_alertas` — tabela alertas + trigger alerta avaria crítica
- [x] Migration `014_sessoes_whatsapp` — tabela sessoes_whatsapp (expira_em via query: ultimo_contato + 24h)
- [x] Migration `015_audit_logs` — tabela audit_logs + trigger log_correcao_km
- [x] Migration `016_checklists_diarios` — tabela checklists_diarios + trigger cria avaria + alerta
- [x] Migration `017_adiantamentos` — tabela adiantamentos + trigger alerta gestor
- [x] Migration `018_despesas_frete` — tabela despesas_frete
- [x] Migration `019_imprevistos` — tabela imprevistos + trigger alerta imprevisto
- [x] Migration `020_financeiro` — função `calcular_comissao()` + 4 views KPI (fretes, empresa, veículo, motorista)
- [x] Migration `021_view_manutencao` — view `proxima_manutencao_veiculo`
- [x] Migration `022_rls_functions` — helpers `get_user_empresas()`, `get_user_role()`, `get_user_motorista_id()` + triggers `updated_at`
- [x] Migration `023_rls_policies` — RLS ativado e policies aplicadas em todas as 20 tabelas
- [x] Migration `024_triggers_validacao` — cross-empresa, frete exige km_final, bloqueia inativação com viagem ativa
- [x] Migration `025_trigger_comissao_snapshot` — snapshot automático de comissão ao concluir frete
- [ ] Edge Functions agendadas: limpeza de `sessoes_whatsapp` + alertas de vencimento (CNH, IPVA, etc.)

**Auth e dados iniciais:**
- [x] Configurar Supabase Auth (email/senha, confirm email desativado)
- [ ] Criar usuário Master inicial (você) via SQL seed
- [ ] Popular dados iniciais (seed): suas 2 empresas (CNPJs), vínculo do Master nas duas com `is_padrao` na principal
- [ ] Popular 10 veículos e motoristas reais (CSV → script de import)

**Tipos TypeScript:**
- [ ] Gerar `types/database.types.ts` via `supabase gen types typescript`
- [ ] Criar `lib/validators/` com helpers de CPF, CNPJ, placa, dígito verificador
- [ ] Criar schemas Zod compartilhados em `lib/schemas/` (um por entidade de cadastro)

**Entregável:** Banco de dados completo (15+ tabelas, RLS ativo, triggers funcionando, Edge Functions agendadas) + projeto Next.js rodando localmente conectado ao Supabase + Master conseguindo logar e trocar entre as 2 empresas.

---

### 🟢 FASE 2 — Dashboard Web (Gestor)

**Objetivo:** Interface web **mobile-first** com **6 módulos** (Home, Fretes, Frota, Motoristas, Financeiro, Config), foco em **custo × lucro** e ações em 1 clique.

**Tarefas:**

**Base:**
- [ ] Layout: sidebar `w-56` (#313f50), header com seletor de empresa, responsivo de verdade (mobile = bottom nav ou sidebar drawer)
- [ ] Tela de login (Supabase Auth)
- [ ] Middleware Next.js que injeta empresa ativa em todas as queries
- [ ] Componente `<EmpresaSelector />` no header (multi-CNPJ)
- [ ] Upload de imagens/PDFs para R2 (helper compartilhado)

**🏠 Módulo Home:**
- [ ] Card KPI financeiro do mês (lucro grande, receita, custo, margem, vs mês anterior)
- [ ] Card "Precisa de você agora" (adiantamentos pendentes, avarias críticas, documentos vencendo, checklist com problema)
- [ ] Card "Agora na estrada" (fretes em andamento + status: rodando/parado por imprevisto)
- [ ] Card "Insight do mês" (texto gerado por IA, atualizado dia 1)
- [ ] Aprovar adiantamento em 1 clique no card

**🛣️ Módulo Fretes:**
- [ ] Listagem com filtros (seção 8.8) — colunas: data, motorista, veículo, rota, KM, **receita, custo, lucro, margem %**
- [ ] Drill-down de viagem: rota + KM + despesas consolidadas + imprevistos timeline + foto cupons + comissão
- [ ] Criar/editar viagem manualmente (caso o motorista esqueça de abrir)
- [ ] Cancelar viagem (com motivo)

**🚛 Módulo Frota:**
- [ ] Listagem de caminhões + filtros + KPI mensal por veículo (lucro/km)
- [ ] Drill-down de caminhão: documentos + manutenções + avarias + checklists últimos 30 dias
- [ ] CRUD completo + foto + validações
- [ ] Alertas de documento vencendo (badge)

**👤 Módulo Motoristas:**
- [ ] Listagem + filtros + fechamento mensal de comissão por motorista
- [ ] Drill-down: histórico fretes + comissões a pagar + CNH + jornada da semana (resumo)
- [ ] CRUD com configuração de comissão flexível (5 modos)
- [ ] Acesso à CNH com consentimento LGPD + audit log

**💰 Módulo Financeiro:**
- [ ] Aba: Resumo do mês/ano (gráficos simples — barras de lucro mensal)
- [ ] Aba: Fluxo de caixa (fretes recebidos, fretes a receber, despesas)
- [ ] Aba: Adiantamentos (pendentes/aprovados/prestação de contas)
- [ ] Aba: Comissões (fechamento mensal por motorista)
- [ ] Aba: Clientes (CRM) — lista + cadastro + drill-down com fretes e receita por cliente
- [ ] Aba: Relatórios sob demanda (filtros + exportação PDF/CSV)

**⚙️ Módulo Config:**
- [ ] Dados da empresa (editar empresas que o usuário tem acesso)
- [ ] Gestão de usuários (Master only) — convidar, atribuir role por empresa, marcar padrão
- [ ] Thresholds: KM revisão, dias para alerta vencimento
- [ ] Itens do checklist (lista editável — futuro)
- [ ] Backup completo (Master only — seção 8.7)
- [ ] LGPD: exportar/anonimizar motorista

**Entregável:** Dashboard funcional, mobile-first, conectado ao Supabase. Gestor consegue ver lucro do mês, aprovar adiantamento e responder avaria crítica direto do celular em < 30s.

---

### 🟡 FASE 3 — Webhook WhatsApp + Fluxo Conversacional

**Objetivo:** Bot WhatsApp com mensagens interativas (botões e listas) cobrindo todas as 10+ ações do motorista, com **Smart Intent Router** para experiência ultra-simples.

**Tarefas:**

**Setup Meta Cloud API:**
- [x] Decidir provedor → **Meta Cloud API** ✅
- [ ] Criar conta Business Manager e configurar número WhatsApp Business
- [ ] Cadastrar e aprovar **9 templates HSM** (seção 6.15a) — todos categoria UTILITY
- [ ] Configurar HMAC signature para validação do webhook
- [ ] Helper `enviarTemplate(code, params, destinatario)` em `lib/whatsapp/messageSender.ts`

**Infraestrutura do bot:**
- [ ] Criar rota `/api/whatsapp/webhook` no Next.js (GET de verificação + POST de mensagens)
- [ ] Implementar `messageParser.ts` (texto, interativo, foto, áudio, documento)
- [ ] Implementar `messageSender.ts` (texto, botões, lista, mídia)
- [ ] Implementar `SessionManager` (CRUD em `sessoes_whatsapp` + expiração 24h)
- [ ] Implementar autenticação por número (busca em `motoristas.whatsapp`)
- [ ] Rate limiting por whatsapp (proteção contra spam)

**Fluxos básicos (seções 6.2 a 6.5):**
- [ ] Fluxo: Informar KM (com fallback manual)
- [ ] Fluxo: Relatar Avaria (foto/áudio/texto + classificação de urgência)
- [ ] Fluxo: Iniciar/Encerrar Viagem
- [ ] Fluxo: Abastecimento

**Fluxos novos do MVP de operação (seções 6.7 a 6.12):**
- [ ] Fluxo: Checklist Diário (6.7) — aviso ao gestor (sem bloquear viagem)
- [ ] Fluxo: Pedir Adiantamento (6.8) — com aprovação por botão pelo gestor
- [ ] Fluxo: Registrar Despesa por foto (6.9) — reusa OCR de cupom
- [ ] Fluxo: Comunicar Imprevisto (6.10) — alerta imediato ao gestor
- [ ] Fluxo: Status do Caminhão (6.11) — consulta read-only
- [ ] Fluxo: Meus Documentos (6.12) — entrega CRLV/CNH com URL assinada

**Fluxos do gestor via WhatsApp (seções 6.15 a 6.17) ⭐:**
- [ ] Resolução de role na entrada do webhook (motoristas.whatsapp → motorista; perfis.whatsapp_bot → gestor; senão descarta)
- [ ] Fluxo 6.15: Cadastrar pedido por foto/PDF/print (extração via gpt-4o)
- [ ] Fluxo 6.16: Consultas rápidas em texto livre (intent classifier de gestor)
- [ ] Fluxo 6.17: Motorista aceita frete agendado + trigger de start automático

**Smart Intent Router (seção 6.14) — diferencial crítico de UX:**
- [ ] Implementar `lib/whatsapp/intentRouter.ts` com **decisão por role + mídia + contexto**
- [ ] Integrar `aiService.classificarMidia(url, tipo, role)` (Fase 4 entrega)
- [ ] Implementar tabela de decisão expandida (motorista E gestor)
- [ ] Padrão de confirmação por 1 botão antes de executar intent inferida
- [ ] Fallback: se confiança < 70%, mostrar menu padrão do role correspondente

**Alertas e jobs automatizados:**
- [ ] Implementar envio de alertas ao gestor (avaria crítica, imprevisto, adiantamento pendente)
- [ ] Edge Function: cálculo de jornada/descanso (Lei 13.103) com alertas a 5h30 / 8h / 10h (seção 6.13)
- [ ] Edge Function: lembrete de checklist matinal (07:00 dia útil)

**Testes:**
- [ ] Testes de regressão em sandbox com cada fluxo end-to-end
- [ ] Teste de Smart Router com 20 cenários diferentes de foto/contexto
- [ ] Teste de carga: 10 motoristas mandando mensagem ao mesmo tempo

**Entregável:** Bot funcional no WhatsApp cobrindo as 10+ ações, com Smart Intent Router (motorista pode mandar foto sem clicar em botão e o sistema entende), alertas automáticos de jornada e bloqueio de viagem se checklist tiver problema crítico.

---

### 🔴 FASE 4 — Integração com IA

**Objetivo:** Extração automática de dados de fotos e áudios usando **OpenAI como provedor único** (decisão da seção 2), com fallback gracioso para nunca derrubar o fluxo do motorista.

**Tarefas:**

**Setup OpenAI:**
- [ ] Criar conta OpenAI Platform (organização separada para o Sistema de Frota)
- [ ] Gerar API key dedicada (`OPENAI_API_KEY`) com restrição por IP (Vercel)
- [ ] Configurar **auto-recarga**: cobre US$ 50 quando saldo < US$ 10
- [ ] Configurar **soft limit** US$ 20/mês (email alert)
- [ ] Configurar **hard limit** US$ 100/mês (rede de segurança)
- [ ] Habilitar prompt caching nativo (default no GPT-4o)

**Camada `aiService` (provedor único, modelos por tarefa):**
- [ ] Criar `services/aiService.ts` como **única porta de entrada** para qualquer chamada de IA
- [ ] Roteamento por tarefa:
  - `lerOdometro()` → `gpt-4o-mini`
  - `lerCupomAbastecimento()` → `gpt-4o-mini`
  - `analisarAvaria()` → `gpt-4o`
  - `transcreverAudio()` → `whisper-1`
- [ ] Implementar **fallback universal**: todo método retorna `{ ok: true, data }` ou `{ ok: false, fallbackManual: true, motivo }` — nunca lança exceção pro fluxo

**Implementações específicas:**
- [ ] `lerOdometro(fotoUrl)`: prompt + JSON schema + threshold de confiança ≥85%
- [ ] `lerCupomAbastecimento(fotoUrl)`: extrai `{ litros, valor_total, valor_litro, posto }`
- [ ] `lerCupomGenerico(fotoUrl)`: extrai `{ tipo, valor, local, data }` — usado em despesas avulsas (6.9)
- [ ] `analisarAvaria(midia)`: aceita foto/áudio/texto, retorna `{ descricao, urgencia, recomendacao }`
- [ ] `transcreverAudio(audioUrl)`: Whisper-1 com `language: 'pt'`
- [ ] `classificarMidia(url, tipo, role)`: **núcleo do Smart Intent Router (6.14)** — classifica foto em `(painel|bomba|cupom_combustivel|cupom_generico|avaria|documento|documento_pedido_frete|outro)`, áudio via Whisper + texto, ou texto direto. **Toma o `role` como input** para considerar o universo de tipos esperados (gestor manda mais pedidos; motorista manda mais painel/cupom). Retorna `{ tipo, confianca, dados_extraidos }`
- [ ] `extrairPedidoFrete(midia)`: **exclusivo fluxo gestor (6.15)** — usa `gpt-4o` full (raciocínio mais sofisticado, aceita PDF/imagem). Extrai `{ cliente_nome, cliente_cnpj, origem, destino, valor_frete, peso_carga_kg, tipo_carga, data_coleta, data_entrega, observacoes, confianca }`. PDF → usa OpenAI Files API; imagem → Vision direta.
- [ ] `classificarIntentTexto(texto, role)`: para o fluxo 6.16 (consultas do gestor) — classifica perguntas em intent (`consulta_lucro_mensal`, `consulta_fretes_ativos`, `consulta_motorista`, etc). `role='motorista'` reconhece outras intents (palavras como "adiantamento", "quebrou", "atrasado")

**Resiliência (crítico — "alertar mas não parar"):**
- [ ] Detectar erros de billing/rate limit/timeout no `aiService`
- [ ] Criar alerta automático tipo `ia_indisponivel` (gestor recebe via WhatsApp)
- [ ] Garantir que **toda falha de IA** cai pro fallback manual já existente (motorista digita)
- [ ] Edge Function diária: consulta saldo OpenAI; se < US$ 5 → alerta `billing_limite_proximo`
- [ ] Documentar runbook: o que fazer se IA falhar repetidamente (verificar billing → trocar chave → contato suporte)

**Auditoria de IA:**
- [ ] Toda chamada de IA grava `ia_raw_response` (jsonb) na tabela correspondente
- [ ] Toda correção manual de leitura IA-extraída registra em `audit_logs`

**Testes:**
- [ ] Conjunto de 30+ fotos reais de odômetros (variações: limpo, sujo, noturno, com reflexo)
- [ ] Conjunto de 10+ cupons de abastecimento de diferentes redes (Shell, Ipiranga, Petrobras)
- [ ] 10+ áudios em pt-BR com ruído de motor de fundo
- [ ] Meta de acurácia: ≥90% KM, ≥85% cupom, ≥95% transcrição

**Entregável:** IA operacional integrada ao fluxo do WhatsApp, com fallback automático para input manual em qualquer falha (motorista nunca fica travado). Custo controlado por soft+hard limits.

---

### ⚫ FASE 5 — Polimento, Testes e Deploy

**Objetivo:** Sistema pronto para produção, coberto por testes automatizados (vide Seção 15).

**Tarefas:**

**Testes (vide Seção 15):**
- [ ] Implementar todos os testes unit (validators, schemas, intentRouter, ai mocks)
- [ ] Implementar todos os testes integration (triggers, views, RLS, server actions, webhook)
- [ ] Implementar testes E2E críticos (Playwright): login → home → aprovar adiantamento; cadastro de veículo; criar viagem; backup
- [ ] Configurar GitHub Actions com `test:ci`
- [ ] Atingir thresholds de cobertura: services ≥85%, validators ≥95%, whatsapp ≥80%
- [ ] Documentar como rodar localmente: `npm run test:db:setup && npm test`

**Polimento UX:**
- [ ] Teste em viewport mobile real (iPhone SE, Galaxy A) — todas as telas
- [ ] Lighthouse score ≥90 (Performance, Accessibility) em Home, Fretes, Frota
- [ ] Skeleton loaders nas listagens
- [ ] Empty states amigáveis ("Nenhuma viagem ainda — clique em + para criar")

**Deploy:**
- [ ] Configurar variáveis de ambiente na Vercel (production + preview)
- [ ] Deploy na Vercel (produção)
- [ ] Configurar webhook WhatsApp apontando para produção
- [ ] Configurar alertas Sentry
- [ ] Smoke test em produção (login, criar viagem, gerar relatório)

**Validação com usuários:**
- [ ] Teste com motoristas reais — 1 semana de uso supervisionado
- [ ] Documentação de uso para motoristas (PDF com prints + GIF do WhatsApp)
- [ ] Sessão de treinamento (1h) com Master e Gestor
- [ ] Coleta de feedback estruturada após 1 semana

**Critério de aceitação:** `npm run test:ci` verde, cobertura nos thresholds da seção 15.7, smoke test em prod OK, e ao menos 1 motorista usando sem suporte por 1 semana inteira.

**Entregável:** Sistema em produção, com cobertura de testes documentada, monitoramento ativo (Sentry + alertas internos), documentação de uso para motoristas e gestor.

---

## 11. VARIÁVEIS DE AMBIENTE

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Cloudflare R2
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
R2_PUBLIC_URL=

# OpenAI
OPENAI_API_KEY=

# WhatsApp (Meta Cloud API)
WHATSAPP_TOKEN=
WHATSAPP_VERIFY_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_BUSINESS_ACCOUNT_ID=

# Sentry
SENTRY_DSN=
NEXT_PUBLIC_SENTRY_DSN=

# App
GESTOR_WHATSAPP=  # número do gestor para receber alertas
```

---

## 12. ESTRUTURA DE PASTAS (Next.js App Router)

```
SISTEMA_DE_FROTA/
├── app/
│   ├── (auth)/
│   │   └── login/
│   ├── (dashboard)/
│   │   ├── layout.tsx
│   │   ├── page.tsx              # Home / Dashboard
│   │   ├── frota/
│   │   ├── motoristas/
│   │   ├── fretes/
│   │   ├── manutencoes/
│   │   ├── avarias/
│   │   └── relatorios/
│   └── api/
│       └── whatsapp/
│           └── webhook/
│               └── route.ts
├── components/
│   ├── ui/                       # Botões, Cards, Modais genéricos
│   └── dashboard/                # Componentes específicos do dashboard
├── lib/
│   ├── supabase/
│   │   ├── client.ts
│   │   └── server.ts
│   ├── r2/
│   │   └── r2Client.ts
│   └── whatsapp/
│       ├── sessionManager.ts
│       ├── messageParser.ts
│       ├── messageSender.ts
│       └── flows/
│           ├── kmFlow.ts
│           ├── avariaFlow.ts
│           ├── viagemFlow.ts
│           └── abastecimentoFlow.ts
├── services/
│   ├── aiService.ts              # GPT-4o Vision + Whisper
│   ├── alertService.ts
│   └── kpiService.ts
├── types/
│   └── database.types.ts        # Gerado pelo Supabase CLI
└── supabase/
    └── migrations/               # Migrations SQL versionadas
```

---

## 13. CONSIDERAÇÕES DE SEGURANÇA

### 13.1 Princípios Gerais

- **RLS ativado** em **todas** as tabelas do Supabase (incluindo `perfis`, `usuario_empresas`, `audit_logs`)
- Webhook WhatsApp validado via **HMAC signature** (Meta) ou token secreto
- `SUPABASE_SERVICE_ROLE_KEY` usado **apenas no servidor** (nunca exposto ao cliente)
- Rate limiting no webhook para prevenir spam
- Imagens sensíveis (CNH, comprovantes) no R2 com **URLs assinadas** de expiração curta (≤15 min)
- Conformidade LGPD: consentimento explícito para foto da CNH + `audit_logs` de acesso

### 13.2 Política RLS (Row Level Security)

Toda tabela com `empresa_id` segue o mesmo padrão de RLS, baseado em **3 funções helper**:

```sql
-- Função: empresas a que o usuário tem acesso
CREATE FUNCTION auth.user_empresas() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT empresa_id FROM usuario_empresas WHERE usuario_id = auth.uid()
$$;

-- Função: role do usuário em uma empresa específica
CREATE FUNCTION auth.user_role(emp_id uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT role FROM usuario_empresas
   WHERE usuario_id = auth.uid() AND empresa_id = emp_id
   LIMIT 1
$$;

-- Função: motorista_id vinculado ao usuário (NULL se não for motorista)
CREATE FUNCTION auth.user_motorista_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT motorista_id FROM perfis WHERE id = auth.uid()
$$;
```

**Padrão de policy aplicado a cada tabela operacional:**

```sql
-- Exemplo: fretes
ALTER TABLE fretes ENABLE ROW LEVEL SECURITY;

-- Gestor e Master: enxergam tudo da empresa
CREATE POLICY fretes_gestor_all ON fretes
  FOR ALL TO authenticated
  USING (
    empresa_id IN (SELECT auth.user_empresas())
    AND auth.user_role(empresa_id) IN ('master','gestor')
  );

-- Motorista: enxerga só as próprias
CREATE POLICY fretes_motorista_own ON fretes
  FOR SELECT TO authenticated
  USING (
    empresa_id IN (SELECT auth.user_empresas())
    AND auth.user_role(empresa_id) = 'motorista'
    AND motorista_id = auth.user_motorista_id()
  );
```

**Tabela de visibilidade por role:**

| Tabela | Master | Gestor | Motorista |
|---|---|---|---|
| `empresas` | RW (das suas) | R (das suas) | R (das suas) |
| `usuario_empresas` | RW (das suas) | R (somente próprio) | R (somente próprio) |
| `perfis` | RW (da empresa) | R (da empresa) | RW (somente próprio) |
| `audit_logs` | R (da empresa) | — | — |
| `veiculos` | RW | RW | R (apenas o veículo da viagem ativa) |
| `motoristas` | RW | RW | R (somente próprio) |
| `fretes` | RW | RW | RW (somente próprias) |
| `km_logs` | RW | RW | RW (somente próprios) |
| `abastecimentos` | RW | RW | RW (somente próprios) |
| `manutencoes` | RW | RW | R (do veículo da viagem ativa) |
| `avarias` | RW | RW | RW (somente próprias) |
| `alertas` | RW | RW | R (destinados ao próprio motorista) |

### 13.3 Seletor de Empresa (Multi-CNPJ na UI)

**Componente:** `<EmpresaSelector />` no canto superior direito do header (ao lado do avatar).

```
┌────────────────────────────────────────────────┐
│                            🏢 RB Transportes ▼ │  ← clica abre dropdown
└────────────────────────────────────────────────┘
                                  ┌──────────────────────────────┐
                                  │ 🏢 RB Transportes        ✓   │ (atual / padrão)
                                  │     CNPJ 12.345.678/0001-XX  │
                                  ├──────────────────────────────┤
                                  │ 🏢 RB Logística              │
                                  │     CNPJ 12.345.678/0002-XX  │
                                  ├──────────────────────────────┤
                                  │ ⚙️  Gerenciar empresas       │  (master only)
                                  └──────────────────────────────┘
```

**Comportamento:**
- Mostra todas as empresas onde o usuário tem registro em `usuario_empresas`
- Empresa padrão (`is_padrao = true`) é a inicial após login
- Trocar empresa: persiste seleção em `localStorage` (`fleet:active_empresa`) **e** envia para o servidor (cookie HttpOnly) para o middleware Next.js filtrar todas as queries
- Trocar empresa gera `audit_logs.acao = 'troca_empresa'`
- Botão "Definir como padrão" no item ativo (atualiza `is_padrao`)
- Se usuário tem só 1 empresa: dropdown vira badge estático (sem ação)

**Server-side enforcement:**
- Toda Server Action lê a empresa ativa do cookie e injeta o `empresa_id` em **todas** as queries
- RLS é a rede de segurança final caso a aplicação esqueça de filtrar

### 13.4 Resiliência da IA e Controle de Custo

> **Princípio:** o motorista **nunca** pode ficar travado por causa da IA. Qualquer falha cai pro fluxo manual silenciosamente.

#### Camadas de defesa de billing (OpenAI)

| Camada | Configuração | O que faz |
|---|---|---|
| 1. Auto-recarga | Saldo < US$ 10 → cobra US$ 50 no cartão | Garante que a API **nunca para** por crédito zerado |
| 2. Soft limit | US$ 20/mês | Email pra você sem cortar serviço |
| 3. Alerta interno | Edge Function diária consulta saldo | Cria alerta `billing_limite_proximo` se < US$ 5 |
| 4. Hard limit | US$ 100/mês | Rede de segurança contra fuga de gastos (bug/abuso) |

#### Fallback gracioso no `aiService`

Toda chamada de IA usa o contrato:
```typescript
type AiResult<T> =
  | { ok: true; data: T; confianca: number }
  | { ok: false; fallbackManual: true; motivo: string };
```

Qualquer erro (timeout, billing, rate limit, resposta inválida) → retorna `{ ok: false, fallbackManual: true }`. O fluxo do WhatsApp **detecta isso e cai pro mesmo prompt manual** já existente (motorista digita o valor) — exatamente igual ao fluxo de "confiança < 85%" já documentado em 6.2.

#### Alerta automático ao gestor

Quando o `aiService` detecta falha, dispara:
- `alertas.tipo = 'ia_indisponivel'` (severidade `urgente`)
- Mensagem WhatsApp ao gestor: *"⚠️ IA temporariamente indisponível — motoristas seguem operando em modo manual. Verifique billing OpenAI."*
- Throttle: máximo 1 alerta a cada 30 min (evita spam)

#### Modo degradado documentado

| Cenário | Comportamento |
|---|---|
| IA fora do ar (qualquer motivo) | Motorista digita KM/cupom; sistema funciona 100% sem IA |
| Áudio de avaria não transcreve | Bot pede pra motorista enviar texto ou foto |
| Análise de avaria falha | Bot pede descrição em texto + classificação de urgência manual (botões) |

> O sistema **degrada com graça**, não trava. IA é otimização, não dependência crítica.

### 13.5 Conformidade LGPD

| Item | Tratamento |
|---|---|
| Foto da CNH | Opt-in explícito + URL assinada 15 min + `audit_logs` em todo acesso |
| CPF, RG, data nascimento | Mascarados na listagem (`***.***.***-XX`), completos só no detalhe |
| Localização (origem/destino) | Sem rastreamento contínuo, apenas pontos declarados |
| Direito ao esquecimento | Server Action `anonimizar_motorista()` substitui PII por hash, preserva FK |
| Exportação de dados pessoais | Endpoint `/api/lgpd/export` por motorista (JSON com tudo dele) |
| Retenção de `audit_logs` | Mínimo 5 anos |

---

## 14. TRIGGERS, FUNÇÕES E JOBS AGENDADOS

> Catálogo único de toda a lógica que vive no Postgres ou em Edge Functions agendadas. Cada item indica **quando dispara**, **o que faz** e em qual **migration** mora.

### 14.1 Funções Helper de RLS (`auth.*`)

Já documentadas em 13.2. Resumo:

| Função | Retorno | Uso |
|---|---|---|
| `auth.user_empresas()` | `SETOF uuid` | Lista empresas onde o usuário tem vínculo |
| `auth.user_role(emp_id)` | `text` | Role do usuário na empresa indicada |
| `auth.user_motorista_id()` | `uuid` | Motorista vinculado ao usuário (NULL se não for motorista) |

Migration: `014_rls_functions`.

### 14.2 Triggers de Integridade

#### `handle_new_user` — cria `perfis` ao registrar usuário no Auth
- **Dispara:** `AFTER INSERT ON auth.users`
- **Ação:** insere registro em `perfis` com `id = NEW.id` e `nome = NEW.raw_user_meta_data->>'nome'`
- **Migration:** `002_perfis`

#### `set_updated_at` — atualiza coluna `updated_at` automaticamente
- **Dispara:** `BEFORE UPDATE` em todas as tabelas que possuem `updated_at`
- **Ação:** `NEW.updated_at = now()`
- **Migration:** `017_triggers_updated_at`

#### `validar_empresa_cross_fretes`
- **Dispara:** `BEFORE INSERT OR UPDATE ON fretes`
- **Ação:** garante que `veiculo.empresa_id = motorista.empresa_id = NEW.empresa_id`. Levanta exceção se divergir.
- **Migration:** `016_triggers_validacao`

#### `validar_empresa_cross_km_logs` / `_abastecimentos` / `_manutencoes` / `_avarias` / `_alertas`
- Mesma lógica do anterior, aplicada a cada tabela operacional.

#### `frete_concluido_exige_km_final`
- **Dispara:** `BEFORE UPDATE ON fretes`
- **Ação:** se `NEW.status = 'concluido'`, exige `km_final IS NOT NULL` e `data_fim IS NOT NULL`. Bloqueia update caso contrário.

#### `frete_iniciado_atualiza_status`
- **Dispara:** `AFTER INSERT ON km_logs`
- **Ação:** se `NEW.tipo = 'inicial'` e o frete está `agendado` → atualiza para `em_andamento` + preenche `data_inicio = NEW.created_at`. Permite que o motorista "abra" frete agendado simplesmente fotografando o painel (via Smart Router).

#### `bloquear_inativacao_veiculo` / `_motorista`
- **Dispara:** `BEFORE UPDATE ON veiculos`/`motoristas` quando `ativo` muda de `true` para `false`
- **Ação:** bloqueia se houver `fretes.status = 'em_andamento'` ou `manutencoes.status IN ('pendente','aprovada')` ou `avarias.status IN ('aberta','em_analise')` associadas.

### 14.3 Triggers de Propagação

#### `propagar_km_para_veiculo`
- **Dispara:** `AFTER INSERT ON km_logs`
- **Ação:** se `NEW.confirmado = true` AND `NEW.correcao = false` AND `NEW.km_lido > veiculos.km_atual` → `UPDATE veiculos SET km_atual = NEW.km_lido`
- Garante que o KM do veículo sempre reflete a última leitura confirmada
- **Migration:** `007_km_logs`

#### `criar_alerta_avaria_critica`
- **Dispara:** `AFTER INSERT ON avarias`
- **Ação:** se `urgencia IN ('alta','critica')` → insere registro em `alertas` (severidade `urgente` ou `critico`) destinado ao gestor da empresa

#### `log_correcao_km`
- **Dispara:** `AFTER INSERT ON km_logs`
- **Ação:** se `NEW.correcao = true` → insere em `audit_logs` (`acao = 'correcao_km'`, `dados_depois = row_to_json(NEW)`)

#### `log_acesso_cnh_foto`
- **Estratégia:** não é trigger SQL — implementado como Server Action obrigatória. Toda rota que serve `cnh_foto_url` deve gerar a URL assinada via `getCnhFotoUrl(motoristaId)` que grava `audit_logs` antes de retornar.

### 14.4 Edge Functions Agendadas (Supabase Cron)

#### `cron_limpar_sessoes_expiradas`
- **Schedule:** diário às 03:00 BRT
- **Ação:** `DELETE FROM sessoes_whatsapp WHERE expira_em < now()`
- **Por quê:** Meta encerra a janela de 24h; manter sessões vencidas não tem efeito útil.

#### `cron_gerar_alertas_vencimento`
- **Schedule:** diário às 06:00 BRT
- **Ação:** para cada veículo/motorista da base:
  - Se `cnh_validade - CURRENT_DATE <= 30` → cria alerta `cnh_vencendo`
  - Se `ipva_vencimento - CURRENT_DATE <= 30` → cria alerta `ipva_vencendo`
  - Mesma lógica para `licenciamento_vencimento`, `seguro_vencimento`, `data_proxima_revisao`
  - Evita duplicar alerta já criado nos últimos 7 dias
- **Por quê:** não dá pra confiar em o gestor lembrar — sistema avisa automaticamente.

#### `cron_detectar_km_sem_registro`
- **Schedule:** diário às 20:00 BRT
- **Ação:** para cada veículo `ativo = true`, se não houver `km_logs` há mais de N dias (configurável, default 3), cria alerta `km_sem_registro` destinado ao gestor.

#### `cron_enviar_alertas_whatsapp`
- **Schedule:** a cada 15 min
- **Ação:** processa `alertas` com `enviado_whatsapp = false` AND `severidade IN ('urgente','critico')`. Dispara mensagem via Meta Cloud API. Marca `enviado_whatsapp = true` e `enviado_em = now()`.

### 14.5 Funções e Views Financeiras (núcleo de custo × lucro)

#### Função `calcular_comissao(motorista_id, valor_frete, km_total)`

Calcula a comissão do motorista naquela viagem específica, baseado no `tipo_comissao` configurado.

```sql
CREATE FUNCTION calcular_comissao(
  p_motorista_id uuid,
  p_valor_frete numeric,
  p_km_total numeric
) RETURNS numeric
LANGUAGE plpgsql STABLE AS $$
DECLARE
  m record;
BEGIN
  SELECT tipo_comissao, salario_fixo, percentual_frete,
         valor_fixo_por_viagem, valor_por_km
    INTO m FROM motoristas WHERE id = p_motorista_id;

  RETURN CASE m.tipo_comissao
    WHEN 'salario_fixo'             THEN 0       -- comissão por viagem = 0 (recebe salário no fim do mês)
    WHEN 'percentual_frete'         THEN COALESCE(p_valor_frete, 0) * COALESCE(m.percentual_frete, 0) / 100
    WHEN 'valor_fixo_viagem'        THEN COALESCE(m.valor_fixo_por_viagem, 0)
    WHEN 'valor_por_km'             THEN COALESCE(p_km_total, 0) * COALESCE(m.valor_por_km, 0)
    WHEN 'salario_mais_percentual'  THEN COALESCE(p_valor_frete, 0) * COALESCE(m.percentual_frete, 0) / 100  -- só a parte variável; salário entra no relatório à parte
    WHEN 'salario_mais_km'          THEN COALESCE(p_km_total, 0) * COALESCE(m.valor_por_km, 0)
    ELSE 0
  END;
END;
$$;
```

> **Salário fixo** entra no fechamento mensal (não em `fretes.comissao_motorista_valor`), via view de custos mensais por motorista.

#### View `fretes_com_resultado`

Calcula receita, custo total e lucro de cada viagem em tempo real.

```sql
CREATE VIEW fretes_com_resultado AS
SELECT
  v.id,
  v.empresa_id,
  v.veiculo_id,
  v.motorista_id,
  v.cliente_id,
  v.origem,
  v.destino,
  v.km_total,
  v.status,
  v.data_inicio,
  v.data_fim,

  -- Receita
  COALESCE(v.valor_frete, 0) AS receita,

  -- Custos diretos
  COALESCE((SELECT SUM(valor_total) FROM abastecimentos    WHERE frete_id = v.id), 0) AS custo_combustivel,
  COALESCE((SELECT SUM(valor)       FROM despesas_frete   WHERE frete_id = v.id), 0) AS custo_despesas,
  COALESCE(v.comissao_motorista_valor, 0) AS custo_comissao,
  -- Manutenções rateadas (sem aproximação no MVP — vide nota)
  0::numeric AS custo_manutencao_rateada,

  -- Totalizadores
  COALESCE((SELECT SUM(valor_total) FROM abastecimentos  WHERE frete_id = v.id), 0)
  + COALESCE((SELECT SUM(valor)     FROM despesas_frete WHERE frete_id = v.id), 0)
  + COALESCE(v.comissao_motorista_valor, 0)                                        AS custo_total,

  COALESCE(v.valor_frete, 0)
  - (
      COALESCE((SELECT SUM(valor_total) FROM abastecimentos  WHERE frete_id = v.id), 0)
    + COALESCE((SELECT SUM(valor)       FROM despesas_frete WHERE frete_id = v.id), 0)
    + COALESCE(v.comissao_motorista_valor, 0)
  )                                                                                AS lucro_bruto,

  -- Margem %
  CASE WHEN COALESCE(v.valor_frete, 0) > 0
       THEN ROUND(
              ((COALESCE(v.valor_frete, 0)
              - COALESCE((SELECT SUM(valor_total) FROM abastecimentos  WHERE frete_id = v.id), 0)
              - COALESCE((SELECT SUM(valor)       FROM despesas_frete WHERE frete_id = v.id), 0)
              - COALESCE(v.comissao_motorista_valor, 0))
              / v.valor_frete * 100), 2)
       ELSE NULL
  END                                                                              AS margem_pct
FROM fretes v;
```

> **Rateio de manutenção:** MVP deixa em zero. Pós-MVP: criar tabela `parametros_empresa` com `provisao_manutencao_por_km` (ex.: R$ 0,30/km) e somar `km_total × valor` no `custo_manutencao_rateada`. Mantém o modelo simples e ajustável por empresa.

#### View `kpi_mensal_empresa`

Resumo financeiro mensal para o Home do gestor.

```sql
CREATE VIEW kpi_mensal_empresa AS
SELECT
  empresa_id,
  date_trunc('month', data_inicio) AS mes,
  COUNT(*)              AS qtd_fretes,
  SUM(receita)          AS receita_total,
  SUM(custo_total)      AS custo_total,
  SUM(lucro_bruto)      AS lucro_bruto,
  CASE WHEN SUM(receita) > 0
       THEN ROUND(SUM(lucro_bruto) / SUM(receita) * 100, 2)
       ELSE NULL
  END                   AS margem_pct,
  SUM(km_total)         AS km_total,
  CASE WHEN SUM(km_total) > 0
       THEN ROUND(SUM(custo_total) / SUM(km_total), 2)
       ELSE NULL
  END                   AS custo_por_km
FROM fretes_com_resultado
WHERE status = 'concluido'
GROUP BY empresa_id, date_trunc('month', data_inicio);
```

#### View `kpi_mensal_veiculo` e `kpi_mensal_motorista`

Mesma lógica, mas agrupado por `veiculo_id` / `motorista_id`. Útil para descobrir qual caminhão dá mais lucro e qual motorista é mais eficiente.

```sql
-- Resumido — segue padrão da view acima, adicionando GROUP BY veiculo_id (ou motorista_id)
CREATE VIEW kpi_mensal_veiculo AS
SELECT empresa_id, veiculo_id, date_trunc('month', data_inicio) AS mes,
       COUNT(*) AS qtd_fretes, SUM(receita) AS receita_total,
       SUM(custo_total) AS custo_total, SUM(lucro_bruto) AS lucro_bruto,
       SUM(km_total) AS km_total
FROM fretes_com_resultado
WHERE status = 'concluido'
GROUP BY empresa_id, veiculo_id, date_trunc('month', data_inicio);
```

#### View `proxima_manutencao_veiculo` (controle do "última × próxima")

Retorna, para cada veículo, a situação de **todos os tipos de manutenção aplicáveis**: última realizada, custo, e quando é a próxima.

```sql
CREATE VIEW proxima_manutencao_veiculo AS
SELECT
  v.empresa_id,
  v.id            AS veiculo_id,
  v.placa,
  v.apelido,
  v.km_atual,
  t.id            AS tipo_id,
  t.codigo,
  t.nome          AS tipo_nome,
  t.categoria,
  t.criticidade,

  -- Intervalo efetivo (override do veículo OU catálogo)
  COALESCE(pmv.intervalo_km, t.intervalo_km)       AS intervalo_km,
  COALESCE(pmv.intervalo_meses, t.intervalo_meses) AS intervalo_meses,

  -- Última manutenção concluída deste tipo
  ult.km_realizada    AS ultima_km,
  ult.data_realizada  AS ultima_data,
  ult.custo_total     AS ultimo_custo,
  ult.fornecedor      AS ultimo_fornecedor,

  -- Próxima (calculada)
  CASE
    WHEN ult.km_realizada IS NOT NULL AND COALESCE(pmv.intervalo_km, t.intervalo_km) IS NOT NULL
      THEN ult.km_realizada + COALESCE(pmv.intervalo_km, t.intervalo_km)
  END                                                AS proxima_km,

  CASE
    WHEN ult.data_realizada IS NOT NULL AND COALESCE(pmv.intervalo_meses, t.intervalo_meses) IS NOT NULL
      THEN ult.data_realizada + (COALESCE(pmv.intervalo_meses, t.intervalo_meses) || ' months')::interval
  END                                                AS proxima_data,

  -- Quanto falta
  CASE
    WHEN ult.km_realizada IS NOT NULL AND COALESCE(pmv.intervalo_km, t.intervalo_km) IS NOT NULL
      THEN (ult.km_realizada + COALESCE(pmv.intervalo_km, t.intervalo_km)) - v.km_atual
  END                                                AS km_faltando,

  -- Status semafórico
  CASE
    WHEN ult.km_realizada IS NULL THEN 'nunca_feito'
    WHEN (ult.km_realizada + COALESCE(pmv.intervalo_km, t.intervalo_km, 999999999)) - v.km_atual <= 0 THEN 'vencido'
    WHEN (ult.km_realizada + COALESCE(pmv.intervalo_km, t.intervalo_km, 999999999)) - v.km_atual <= 1000 THEN 'proximo'
    ELSE 'em_dia'
  END                                                AS status

FROM veiculos v
CROSS JOIN tipos_manutencao t
LEFT JOIN plano_manutencao_veiculo pmv
       ON pmv.veiculo_id = v.id AND pmv.tipo_id = t.id
LEFT JOIN LATERAL (
  SELECT *
  FROM manutencoes m
  WHERE m.veiculo_id = v.id AND m.tipo_id = t.id AND m.status = 'concluida'
  ORDER BY m.data_realizada DESC NULLS LAST, m.km_realizada DESC NULLS LAST
  LIMIT 1
) ult ON true
WHERE v.ativo = true
  AND t.ativo = true
  AND (t.empresa_id IS NULL OR t.empresa_id = v.empresa_id)
  AND COALESCE(pmv.ativo, true) = true;
```

> **Output:** para 10 veículos × 35 tipos = 350 linhas. Filtrável por `status`, `categoria`, `criticidade`. É a base do **módulo Frota → caminhão → aba Manutenções**.

#### Edge Function: alertas de manutenção próxima

`cron_alertas_manutencao` — diário, 06:30 BRT:
```sql
INSERT INTO alertas (empresa_id, veiculo_id, tipo, severidade, mensagem, referencia_id)
SELECT
  empresa_id, veiculo_id,
  CASE WHEN status = 'vencido' THEN 'manutencao_vencida' ELSE 'revisao_proxima' END,
  CASE WHEN status = 'vencido' AND criticidade IN ('alta','critica') THEN 'urgente' ELSE 'aviso' END,
  tipo_nome || ' — ' ||
    CASE
      WHEN status = 'vencido'  THEN 'VENCIDA há ' || ABS(km_faltando) || ' km'
      WHEN status = 'proximo'  THEN 'faltam ' || km_faltando || ' km'
    END,
  tipo_id
FROM proxima_manutencao_veiculo
WHERE status IN ('vencido', 'proximo')
  AND NOT EXISTS (
    -- evita duplicar alerta nos últimos 7 dias
    SELECT 1 FROM alertas a
    WHERE a.veiculo_id = proxima_manutencao_veiculo.veiculo_id
      AND a.referencia_id = proxima_manutencao_veiculo.tipo_id
      AND a.created_at > now() - interval '7 days'
  );
```

#### Onde isso é consumido

| View / Função | Consumido por |
|---|---|
| `fretes_com_resultado` | Listagem de fretes (mostra lucro/margem em cada linha), drill-down de frete |
| `kpi_mensal_empresa` | Home dashboard (cards principais), módulo Financeiro |
| `kpi_mensal_veiculo` | Módulo Frota (qual caminhão dá mais lucro), insights de IA |
| `kpi_mensal_motorista` | Módulo Motoristas (eficiência), fechamento mensal de comissões |
| `calcular_comissao` | Trigger ao encerrar viagem (snapshot em `comissao_motorista_valor`) |
| `proxima_manutencao_veiculo` | Módulo Frota → aba Manutenções; cron de alertas; Home (próximas críticas) |

> **Performance:** as views recalculam a cada SELECT. Para dashboards com muitos meses históricos, considerar **materialized view** com refresh diário (Edge Function `cron_refresh_kpis` às 04h) — fica como melhoria pós-MVP se a latência incomodar.

---

### 14.6 Relatórios Automáticos (PDF mensal + insights)

#### Relatório Mensal Automático

Toda primeira segunda-feira do mês, o sistema gera e envia automaticamente o relatório do mês anterior.

**Edge Function:** `cron_relatorio_mensal`
- **Schedule:** primeira segunda do mês, 07:00 BRT
- **Para cada empresa**: monta PDF + envia ao Master via email + link no WhatsApp

**Conteúdo do PDF (1 página, denso, fácil de bater olho):**

```
┌──────────────────────────────────────────────────┐
│  RB TRANSPORTES — RELATÓRIO MENSAL — ABRIL/2026  │
├──────────────────────────────────────────────────┤
│  RESULTADO                                       │
│  Receita      R$ 48.300                          │
│  Custo total  R$ 35.850                          │
│  ────────────────────                            │
│  LUCRO        R$ 12.450  (margem 25,8%)          │
│  vs mês anterior:  ↑ 18%                         │
├──────────────────────────────────────────────────┤
│  OPERAÇÃO                                        │
│  Fretes concluídos: 42                          │
│  KM rodado:          12.430                      │
│  Custo médio/km:     R$ 2,88                     │
│  Receita média/km:   R$ 3,88                     │
├──────────────────────────────────────────────────┤
│  TOP 3 CAMINHÕES (lucro)         TOP 3 CLIENTES  │
│  1. ABC-1234   R$ 5.200          1. Acme  R$ 18k │
│  2. DEF-5678   R$ 3.800          2. ABC   R$ 12k │
│  3. GHI-9012   R$ 2.100          3. XYZ   R$ 8k  │
├──────────────────────────────────────────────────┤
│  ATENÇÃO                                         │
│  ⚠️ Caminhão JKL-3456 deu prejuízo em 2 fretes  │
│  ⚠️ IPVA de 3 veículos vence em junho            │
│  ⚠️ CNH do João vence em 15 dias                 │
├──────────────────────────────────────────────────┤
│  INSIGHT (gerado por IA)                         │
│  "Custo de combustível subiu 8% vs março, mas a  │
│   média de R$/km caiu — sinal de fretes mais    │
│   longas e eficientes. Boa otimização!"          │
└──────────────────────────────────────────────────┘
```

**Implementação:**
- PDF gerado com `@react-pdf/renderer` (Server Action no Next.js)
- Dados vindos das views `kpi_mensal_empresa`, `kpi_mensal_veiculo`, `kpi_mensal_motorista`
- Insight gerado por chamada única a `gpt-4o` com prompt: *"Analise estes números mensais e gere 1-2 frases curtas em pt-BR destacando o que é positivo ou preocupante"*
- Arquivo salvo no R2 com URL assinada de 30 dias
- Email via Resend (ou similar): assunto *"Relatório de Abril/2026 — RB Transportes"*
- WhatsApp ao Master: *"📊 Relatório de Abril chegou! Link: …"*

**Custo da IA:** ~$0,03 por relatório/mês/empresa. Irrelevante.

#### Relatórios sob demanda (dashboard)

No módulo **Financeiro**, gestor pode gerar relatórios filtrados:
- Por período (qualquer intervalo)
- Por veículo
- Por motorista
- Por cliente
- Exportação: PDF (mesmo template) ou CSV (para abrir no Excel)

#### Insights mensais no Home

Independente do PDF, no Home do dashboard aparece sempre o **insight mais recente** (gerado automaticamente). Atualiza no dia 1 de cada mês.

---

### 14.7 Server Actions Críticas (Next.js)

Não são triggers, mas pertencem ao mesmo catálogo conceitual de "lógica de domínio que protege invariantes".

| Server Action | Responsabilidade |
|---|---|
| `trocarEmpresaAtiva(empresaId)` | Valida vínculo em `usuario_empresas`, grava cookie HttpOnly, registra `audit_logs.acao = 'troca_empresa'` |
| `getCnhFotoUrl(motoristaId)` | Gera URL assinada R2 (15 min) + registra `audit_logs.acao = 'view_sensitive'` |
| `corrigirKmLog(logId, novoKm, motivo)` | Insere novo `km_logs` com `correcao = true`, exige `motivo`, gera `audit_logs` |
| `inativarMotorista(id)` / `inativarVeiculo(id)` | Soft delete com verificação de pendências (espelha a do trigger, mas com mensagem amigável) |
| `anonimizarMotorista(id)` | LGPD: substitui `nome`, `cpf`, `rg`, `foto_url`, `cnh_foto_url` por valores hash; preserva FK em fretes/km_logs |
| `exportarDadosMotorista(id)` | LGPD: gera JSON com todos os dados pessoais do motorista para download |
| `gerarBackupCompleto()` | Master only. Roda no navegador, registra `audit_logs.acao = 'export_backup'` |

---

## 15. ESTRATÉGIA DE TESTES

> **Princípio:** todo código que processa dinheiro, KM ou alterações de estado **tem teste**. UI pode ter teste leve, mas regra de negócio é coberta. Meta de cobertura: **≥80% em `services/`, `lib/`, e funções/triggers do banco**.

### 15.1 Stack de Testes

| Camada | Ferramenta | Por quê |
|---|---|---|
| Runner | **Vitest** | Rápido, compatível com Vite/Next, sintaxe Jest |
| React components | **@testing-library/react** | Padrão de mercado, focado em UX |
| Mocks HTTP | **MSW** (Mock Service Worker) | OpenAI, ViaCEP, WhatsApp — sem hit real |
| E2E (web) | **Playwright** | Cross-browser, mobile viewport, vídeo de falhas |
| DB local | **Supabase CLI** (`supabase start`) | Postgres real local, mesma versão de produção |
| Coverage | **Vitest --coverage** (v8 provider) | Relatório HTML + threshold no CI |
| CI/CD | **GitHub Actions** | Grátis para repo privado dentro da quota |

### 15.2 Estrutura de Pastas

```
tests/
├── unit/
│   ├── validators/
│   │   ├── cpf.test.ts
│   │   ├── cnpj.test.ts
│   │   ├── placa.test.ts
│   │   ├── renavam.test.ts
│   │   ├── chassi.test.ts
│   │   └── telefone-cep.test.ts
│   ├── schemas/
│   │   ├── motorista.schema.test.ts
│   │   ├── veiculo.schema.test.ts
│   │   ├── viagem.schema.test.ts
│   │   └── ... (1 por entidade)
│   ├── ai/
│   │   ├── classificarMidia.test.ts        # com OpenAI mockado
│   │   ├── lerOdometro.test.ts
│   │   ├── lerCupom.test.ts
│   │   └── intentRouter.test.ts             # tabela de decisão completa
│   ├── whatsapp/
│   │   ├── hmac.test.ts                     # validação de assinatura
│   │   ├── messageParser.test.ts
│   │   └── messageSender.test.ts
│   └── financeiro/
│       └── calcular-comissao-frontend.test.ts  # versão JS para preview
│
├── integration/
│   ├── db/
│   │   ├── triggers/
│   │   │   ├── propagar-km.test.ts
│   │   │   ├── validar-empresa-cross.test.ts
│   │   │   ├── checklist-cria-avaria.test.ts
│   │   │   ├── frete-concluido-exige-km-final.test.ts
│   │   │   ├── frete-iniciado-atualiza-status.test.ts
│   │   │   ├── bloquear-inativacao.test.ts
│   │   │   ├── calcular-comissao.test.ts
│   │   │   └── manutencao-calcula-proxima.test.ts
│   │   ├── views/
│   │   │   ├── fretes-com-resultado.test.ts
│   │   │   ├── kpi-mensal-empresa.test.ts
│   │   │   ├── kpi-mensal-veiculo.test.ts
│   │   │   ├── kpi-mensal-motorista.test.ts
│   │   │   └── proxima-manutencao-veiculo.test.ts
│   │   ├── functions/
│   │   │   ├── calcular-comissao-pgsql.test.ts   # 6 modos × cenários
│   │   │   └── auth-helpers.test.ts               # user_empresas, user_role
│   │   ├── constraints/
│   │   │   ├── check-formato.test.ts              # CPF/CNPJ/placa regex
│   │   │   ├── check-km.test.ts                   # km_final > km_inicial
│   │   │   ├── unique.test.ts                     # placa, CPF, etc
│   │   │   └── fk-cascade.test.ts
│   │   ├── rls/
│   │   │   ├── master.test.ts                     # vê tudo da empresa
│   │   │   ├── gestor.test.ts                     # mesma da empresa, sem usuarios
│   │   │   ├── motorista.test.ts                  # só dados próprios
│   │   │   └── cross-empresa.test.ts              # NUNCA vaza entre empresas
│   │   └── seed.test.ts                           # 35 tipos_manutencao após migration
│   │
│   ├── actions/
│   │   ├── trocar-empresa-ativa.test.ts
│   │   ├── get-cnh-foto-url.test.ts               # registra audit_logs
│   │   ├── corrigir-km-log.test.ts                # exige motivo + audit
│   │   ├── inativar-motorista.test.ts             # bloqueio se viagem ativa
│   │   ├── anonimizar-motorista.test.ts           # LGPD
│   │   └── aprovar-adiantamento.test.ts
│   │
│   ├── webhook/
│   │   ├── whatsapp-verify-get.test.ts
│   │   ├── whatsapp-role-routing.test.ts          # motorista vs gestor vs descarte
│   │   ├── whatsapp-checklist.test.ts
│   │   ├── whatsapp-iniciar-frete.test.ts
│   │   ├── whatsapp-informar-km.test.ts           # com IA mockada
│   │   ├── whatsapp-avaria.test.ts
│   │   ├── whatsapp-adiantamento.test.ts
│   │   ├── whatsapp-despesa.test.ts
│   │   ├── whatsapp-imprevisto.test.ts
│   │   ├── whatsapp-smart-router-motorista.test.ts
│   │   ├── whatsapp-gestor-cadastrar-pedido.test.ts   # 6.15 — PDF/foto/print
│   │   ├── whatsapp-gestor-consultas.test.ts          # 6.16 — texto livre
│   │   ├── whatsapp-motorista-aceitar-frete.test.ts   # 6.17
│   │   ├── whatsapp-hsm-templates.test.ts             # 9 templates
│   │   └── whatsapp-smart-router-gestor.test.ts       # PDF sem contexto
│   │
│   ├── api/
│   │   ├── lgpd-export.test.ts
│   │   └── relatorio-mensal-pdf.test.ts
│   │
│   └── ai-service/
│       ├── fallback-billing.test.ts               # OpenAI 429 → fallback manual
│       ├── fallback-timeout.test.ts
│       └── alerta-ia-indisponivel.test.ts
│
├── e2e/                                            # Playwright
│   ├── auth.spec.ts                                # login Master, trocar empresa
│   ├── home-mobile.spec.ts                         # viewport 375px, KPI + tarefas
│   ├── home-desktop.spec.ts
│   ├── cadastro-veiculo.spec.ts                   # CRUD completo com validações
│   ├── cadastro-motorista.spec.ts                 # CRUD + comissão flexível
│   ├── cadastro-cliente-crm.spec.ts
│   ├── criar-viagem-manual.spec.ts
│   ├── aprovar-adiantamento.spec.ts               # 1 clique no home
│   ├── manutencao-registrar.spec.ts               # catálogo + nova
│   ├── viacep-autocomplete.spec.ts                # CEP preenche endereço
│   ├── seletor-empresa.spec.ts                    # multi-CNPJ
│   ├── backup-completo.spec.ts                    # Master only, modal progress
│   └── relatorios.spec.ts                         # PDF + CSV
│
├── fixtures/
│   ├── empresas.ts                                # 2 empresas (CNPJs)
│   ├── perfis.ts                                  # Master, Gestor, Motorista
│   ├── veiculos.ts                                # 5 caminhões variados
│   ├── motoristas.ts                              # 5 motoristas com diferentes comissões
│   ├── clientes.ts                                # 3 clientes recorrentes
│   ├── fretes.ts                                 # 20 fretes (concluídos/em-andamento/cancelados)
│   ├── manutencoes.ts                             # histórico + planejadas
│   ├── fotos/                                     # imagens reais para teste de OCR
│   │   ├── odometro-claro.jpg
│   │   ├── odometro-sujo.jpg
│   │   ├── odometro-noturno.jpg
│   │   ├── cupom-shell.jpg
│   │   ├── cupom-ipiranga.jpg
│   │   ├── bomba-combustivel.jpg
│   │   ├── pneu-careca.jpg
│   │   └── crlv.jpg
│   └── audios/
│       ├── avaria-clara.m4a
│       └── avaria-com-ruido.m4a
│
├── helpers/
│   ├── supabase-client.ts                         # client com role override (user_id)
│   ├── seed.ts                                    # popula DB local antes dos testes
│   ├── reset.ts                                   # truncate tabelas entre suites
│   ├── mock-openai.ts                             # MSW handler do OpenAI
│   ├── mock-viacep.ts                             # MSW handler do ViaCEP
│   ├── mock-whatsapp.ts                           # MSW handler da Meta Cloud API
│   └── factories.ts                               # ex: criarMotorista({ overrides })
│
└── setup/
    ├── vitest.setup.ts                            # MSW listen, env vars de teste
    ├── playwright.config.ts
    └── supabase-test.sh                           # supabase start + migrations + seed
```

### 15.3 Casos de Teste por Módulo

#### Validators (unit)

| Campo | Casos válidos | Casos inválidos |
|---|---|---|
| CPF | 11122233344, 11144477735 | 12345678900 (DV errado), 11111111111 (todos iguais), `abc` |
| CNPJ | 12345678000195 | DV errado, 14 dígitos com checksum quebrado, vazio |
| Placa antiga | ABC-1234, ABC1234 | abc-1234 (lowercase), AB-1234 (curta), ABCD-1234 |
| Placa Mercosul | ABC-1A23 | ABC-1234 com aceitação ambígua, formato errado |
| RENAVAM | 12345678901 | 8 dígitos, com letras, com hífen |
| Chassi | 9BWZZZ377VT004251 | menos de 17 chars, com letras proibidas (I/O/Q) |
| Telefone fixo | (11) 3333-4444 | sem DDD, com 9 |
| Telefone cel | (11) 99999-9999 | sem 9 inicial, 8 dígitos |
| CEP | 01310-100, 01310100 | 7 dígitos, com letras |
| Data nascimento | 1980-01-01 | futuro, <16 anos (motorista) |

#### Triggers DB (integration)

| Trigger | Cenário | Esperado |
|---|---|---|
| `propagar_km_para_veiculo` | INSERT km_log confirmado com km > km_atual | `veiculos.km_atual` atualizado |
| `propagar_km_para_veiculo` | INSERT km_log com `correcao=true` | NÃO propaga |
| `validar_empresa_cross_fretes` | viagem com veículo e motorista de empresas diferentes | Erro lançado |
| `checklist_cria_avaria` | checklist com 1 item ❌ crítico | avaria criada com urgência `media`, sem bloquear |
| `frete_concluido_exige_km_final` | UPDATE status='concluido' sem km_final | Erro |
| `frete_iniciado_atualiza_status` | INSERT km_log tipo='inicial' em frete 'agendado' | frete.status='em_andamento', data_inicio preenchido |
| `calcular_comissao` (snapshot) | frete concluído com motorista 'percentual_frete=10' e valor_frete=1000 | `fretes.comissao_motorista_valor = 100` |
| `manutencao_calcula_proxima` | concluir manutenção tipo 'troca_oleo' (intervalo 15k) com km_realizada=100000 | `km_proxima = 115000`, `data_proxima = +6 meses` |
| `bloquear_inativacao_motorista` | tentar ativo=false com viagem em_andamento | Erro |

#### Função `calcular_comissao` (PL/pgSQL — todos os 6 modos)

| Tipo | salario | percentual | fixo_viagem | valor_km | valor_frete | km_total | Esperado |
|---|---|---|---|---|---|---|---|
| `salario_fixo` | 3000 | - | - | - | 5000 | 200 | 0 |
| `percentual_frete` | - | 10 | - | - | 5000 | 200 | 500 |
| `valor_fixo_viagem` | - | - | 150 | - | 5000 | 200 | 150 |
| `valor_por_km` | - | - | - | 1.50 | 5000 | 200 | 300 |
| `salario_mais_percentual` | 2000 | 5 | - | - | 5000 | 200 | 250 (só parte variável) |
| `salario_mais_km` | 2000 | - | - | 0.80 | 5000 | 200 | 160 (só parte variável) |

#### RLS (integration — crítico)

Casos mínimos para garantir que nada vaza:

| Cenário | Usuário | Query | Esperado |
|---|---|---|---|
| Master vê veículos da própria empresa | Master CNPJ-1 | SELECT veiculos | Vê só CNPJ-1 |
| Master alterna empresa e vê outra | Master CNPJ-1+2 | SELECT veiculos após `trocarEmpresa(CNPJ-2)` | Vê só CNPJ-2 |
| Motorista vê só fretes próprios | Motorista João | SELECT fretes | Vê só fretes com motorista_id=João |
| Motorista NÃO vê outros motoristas | Motorista João | SELECT motoristas | Vê só linha do próprio João |
| Motorista NÃO vê adiantamentos de outros | Motorista João | SELECT adiantamentos | Vê só os próprios |
| Gestor NÃO vê audit_logs | Gestor | SELECT audit_logs | 0 linhas (apenas Master) |
| Cross-empresa | Master CNPJ-1 | SELECT veiculos onde empresa_id=CNPJ-2 | 0 linhas (mesmo sendo Master) |
| Master gerencia usuários | Master | INSERT usuario_empresas | OK |
| Gestor NÃO gerencia usuários | Gestor | INSERT usuario_empresas | Erro RLS |

#### Role Routing no Webhook (integration) — gestor vs motorista

| Cenário | Esperado |
|---|---|
| Whatsapp X em `motoristas.whatsapp` | role='motorista', fluxo motorista |
| Whatsapp X em `perfis.whatsapp_bot` + role gestor | role='gestor', fluxo gestor |
| Whatsapp X em ambos (caso raro: dono-operador) | precedência `motorista` |
| Whatsapp X em nenhum | DESCARTA (não responde) |
| Whatsapp X em `perfis.whatsapp_bot` mas só com role `motorista` em `usuario_empresas` | DESCARTA (whatsapp_bot é só pra gestor/master) |

#### Cadastro de Pedido via WhatsApp (integration) — fluxo 6.15

| Cenário | Esperado |
|---|---|
| Gestor envia PDF com pedido bem formado | Extrai cliente, rota, valor, datas; bot pede confirmação |
| Gestor envia print de WhatsApp com pedido | Mesma extração (Vision) |
| Gestor envia foto borrada de papel | Confiança baixa → bot pede pra digitar manualmente |
| Cliente extraído **não está cadastrado** | Bot oferece `[Cadastrar] [Buscar] [Frete avulso]` |
| Cliente extraído **está cadastrado** | Bot pré-seleciona cliente_id |
| Confirma + atribui motorista + caminhão | Cria `fretes` status='agendado', `criado_via='whatsapp_gestor'`, dispara HSM ao motorista |
| Motorista não aceita em 12h | Cria alerta `frete_nao_aceito` |
| Motorista aceita | Preenche `aceito_pelo_motorista_em` |
| Motorista manda foto do painel no dia | Trigger muda status='em_andamento' + `data_inicio` |

#### Consultas Rápidas do Gestor (integration) — fluxo 6.16

| Texto enviado | Intent esperada | Resposta deve conter |
|---|---|---|
| "Quanto deu de lucro este mês?" | `consulta_lucro_mensal` | "R$ X.XXX" + margem |
| "Quem tá na estrada?" | `consulta_fretes_ativos` | Lista de motoristas + rota |
| "Como o João tá indo?" | `consulta_motorista` | Frete ativo + KM rodado |
| "Tem coisa pra aprovar?" | `consulta_pendencias` | Lista de adiantamentos pendentes |
| "Manutenção vencida?" | `consulta_frota_saude` | Contagem por status |
| "Lucro do ABC-1234" | `consulta_lucro_veiculo` | Lucro mensal daquele veículo |
| "asdfgh" (texto sem sentido) | `fallback_menu_gestor` | Menu padrão |

#### Templates HSM (integration)

| Template | Cenário | Esperado |
|---|---|---|
| `novo_pedido_motorista` | Gestor cria frete 6.15 | Motorista recebe template com `[✅ Aceitar] [📞 Ligar]` |
| `lembrete_checklist_diario` | Cron 07:00 dia útil | Motoristas ativos recebem mensagem |
| `alerta_manutencao_vencendo` | Cron diário detecta vencimento | Gestor recebe HSM |
| `adiantamento_pendente_aprovacao` | Motorista pede 6.8 | Gestor recebe com botões aprovar/recusar |
| Sandbox sem template aprovado | Tentativa de envio | Erro tratado + log (não derruba o fluxo) |

#### Smart Intent Router (unit, IA mockada)

Mock `classificarMidia()` para retornar tipo fixo, testar a **tabela de decisão**:

| Mídia classificada | Contexto sessão | Intent esperada |
|---|---|---|
| `painel` | `{ veiculo_id, viagem_ativa: null }` | `iniciar_viagem` (pede origem/destino + valor frete) |
| `painel` | `{ veiculo_id, viagem_ativa, duracao_h: 5 }` | `checkpoint_km` |
| `painel` | `{ veiculo_id, viagem_ativa, hora_perto_fim: true }` | `encerrar_viagem` |
| `bomba_combustivel` | `{ veiculo_id }` | `abastecimento` |
| `cupom_combustivel` | `{ veiculo_id }` | `abastecimento` (com extração) |
| `cupom_generico` | `{ viagem_ativa }` | `despesa_viagem` |
| `avaria` | qualquer | `relatar_avaria` |
| `documento` | qualquer | `pergunta_intencao_documento` (consultar/cadastrar) |
| `texto: "preciso de 200 pro pedagio"` | qualquer | `adiantamento` (tipo=pedagio, valor=200) |
| `audio: "...estou parado no trânsito"` | viagem ativa | `imprevisto_transito` |
| `outro` (confiança <70%) | qualquer | `mostrar_menu_padrao` |

#### Webhook WhatsApp (integration)

| Cenário | Esperado |
|---|---|
| GET `/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=X` | Retorna `hub.challenge` se token bate |
| POST sem HMAC válido | Retorna 401 |
| POST de número não cadastrado | Bot responde "número não cadastrado" + grava em sessões? Não — descarta |
| POST de número cadastrado primeira vez | Cria `sessoes_whatsapp`, manda lista de veículos |
| POST com seleção de veículo (botão) | Atualiza `contexto.veiculo_id`, envia menu de ações |
| POST com foto (sem ação explícita) | Aciona Smart Router |
| POST com áudio | Whisper + classificação |
| Sessão > 24h | Próximo POST inicia sessão nova (limpa estado) |

#### aiService — Fallbacks (integration)

| Cenário | Esperado |
|---|---|
| OpenAI retorna 429 (rate limit) | `lerOdometro` retorna `{ok:false, fallbackManual:true, motivo:'rate_limit'}` |
| OpenAI retorna 401 (billing) | Cria alerta `ia_indisponivel` + retorna fallback |
| Timeout (>10s) | Aborta + fallback |
| Resposta JSON inválida | Tenta parse, falha → fallback |
| Confiança < 85% (KM) | Pede digitação manual (não é "falha", é fluxo previsto) |
| Alerta `ia_indisponivel` repetido | Throttle: máx 1 a cada 30 min |

#### Views Financeiras (integration)

| View | Cenário | Esperado |
|---|---|---|
| `fretes_com_resultado` | viagem com frete=1000, combustível=200, despesas=100, comissão=100 | lucro=600, margem=60% |
| `fretes_com_resultado` | viagem em_andamento (sem km_final) | lucro=NULL ou frete-custos-parciais |
| `kpi_mensal_empresa` | 5 fretes concluídos em maio | 1 linha agregada |
| `proxima_manutencao_veiculo` | veículo + 35 tipos, sem nenhuma manutenção feita | 35 linhas com `status='nunca_feito'` |
| `proxima_manutencao_veiculo` | manutenção feita há intervalo+1 | `status='vencido'`, `km_faltando<0` |

### 15.4 Fixtures e Factories

Toda suite começa do mesmo ponto: **DB local zerado → migrations → seed básico → fixtures por teste**.

```typescript
// tests/helpers/factories.ts
export const criarEmpresa = (overrides?: Partial<Empresa>) => ({
  nome_fantasia: 'RB Transportes',
  razao_social: 'RB Transportes LTDA',
  cnpj: '12345678000195',
  ...overrides,
});

export const criarMotorista = (empresaId: string, overrides?: Partial<Motorista>) => ({
  empresa_id: empresaId,
  nome: 'João da Silva',
  cpf: '11144477735',
  whatsapp: '5511999999999',
  cnh_numero: '12345678901',
  cnh_categoria: 'E',
  cnh_validade: '2030-12-31',
  tipo_comissao: 'percentual_frete',
  percentual_frete: 10,
  ...overrides,
});

// + criarVeiculo, criarViagem, criarManutencao, etc.
```

```typescript
// tests/fixtures/scenarios.ts
export const cenarioOperacaoCompleta = async (sb: SupabaseClient) => {
  const empresa = await criar(sb, 'empresas', criarEmpresa());
  const veiculo = await criar(sb, 'veiculos', criarVeiculo(empresa.id));
  const motorista = await criar(sb, 'motoristas', criarMotorista(empresa.id));
  const viagem = await criar(sb, 'fretes', { ... });
  return { empresa, veiculo, motorista, viagem };
};
```

### 15.5 Scripts NPM

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:unit": "vitest run tests/unit",
    "test:integration": "vitest run tests/integration",
    "test:e2e": "playwright test",
    "test:coverage": "vitest run --coverage",
    "test:db:setup": "supabase start && supabase db reset && tsx tests/helpers/seed.ts",
    "test:db:teardown": "supabase stop",
    "test:ci": "npm run test:db:setup && npm run test && npm run test:e2e && npm run test:db:teardown"
  }
}
```

### 15.6 CI/CD (GitHub Actions)

`.github/workflows/test.yml`:

```yaml
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci

      # Supabase local
      - uses: supabase/setup-cli@v1
      - run: supabase start

      # Aplicar migrations + seed
      - run: supabase db reset
      - run: npx tsx tests/helpers/seed.ts

      # Unit + Integration
      - run: npm run test:coverage
        env:
          SUPABASE_URL: http://localhost:54321
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_LOCAL_SERVICE_KEY }}
          OPENAI_API_KEY: sk-mock-do-msw

      # E2E
      - uses: microsoft/playwright-github-action@v1
      - run: npm run test:e2e

      # Coverage
      - uses: codecov/codecov-action@v4
        with:
          files: ./coverage/lcov.info
          fail_ci_if_error: true
```

### 15.7 Coverage Targets

`vitest.config.ts`:

```typescript
test: {
  coverage: {
    provider: 'v8',
    reporter: ['text', 'html', 'lcov'],
    thresholds: {
      'services/**':          { lines: 85, functions: 85, branches: 80 },
      'lib/validators/**':    { lines: 95, functions: 95, branches: 90 },
      'lib/whatsapp/**':      { lines: 80, functions: 80, branches: 75 },
      'lib/cep/**':           { lines: 90, functions: 90, branches: 85 },
      'app/api/**':           { lines: 75, functions: 75, branches: 70 },
    },
  },
}
```

### 15.8 Estratégia de Mocks

| Serviço externo | Estratégia |
|---|---|
| OpenAI (GPT, Whisper) | **MSW**: handlers retornam JSON fixos por tipo de prompt. Testes específicos de fallback simulam 429/401/timeout. |
| ViaCEP | **MSW**: 1 handler de sucesso, 1 de 404, 1 de timeout |
| Meta Cloud API (WhatsApp) | **MSW** + utilitário `recordedMessages[]` para asserts |
| Cloudflare R2 | Mock do client S3 com `fs/promises` (escreve em `/tmp/test-r2/`) |
| Supabase Auth | Cliente real local; usuários de teste criados no seed com senhas fixas |
| Sentry | Desabilitado em ambiente de teste (`SENTRY_DSN=''`) |

### 15.9 O que NÃO testar

Para evitar pseudo-cobertura:
- ❌ Getters/setters triviais sem lógica
- ❌ Tipos TypeScript puros
- ❌ Arquivos de configuração (`next.config.ts`, etc.)
- ❌ Migrations SQL em si (mas testar **efeito** das migrations sim — triggers/views)
- ❌ Componentes UI puramente visuais sem lógica (ex: ícone wrapper)
- ❌ Código gerado (`database.types.ts`)

### 15.10 Atualização da Fase 5 (Testes e Deploy)

A Fase 5 ganha uma seção dedicada de teste antes do deploy. **Critério de aceitação para passar à produção: `npm run test:ci` verde + cobertura nos thresholds**.

---

*Documento gerado em 2026-05-18. Última atualização: 2026-05-18 — Schema expandido com multi-empresa, roles, auditoria, catálogo de manutenções, camada financeira completa e estratégia de testes abrangente.*
