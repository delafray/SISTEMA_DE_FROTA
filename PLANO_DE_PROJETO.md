# 🚛 PLANO DE PROJETO — Sistema de Gestão de Frota Inteligente

> **Versão:** 1.0 | **Data:** 2026-05-18 | **Status:** Em planejamento

---

## 1. VISÃO GERAL

Sistema de gestão de frota com foco em **automação inteligente**. O gestor acessa um dashboard web; os motoristas interagem exclusivamente via **WhatsApp Bot** com mensagens interativas (listas, botões) + **IA** para extrair dados de fotos e áudios.

**Frota:** 10 caminhões | **Motoristas:** via WhatsApp | **Gestor:** via Web (Next.js)

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
| IA (texto + visão) | OpenAI GPT-4o (ou Anthropic Claude) |
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
│   veiculos | motoristas | viagens | km_logs |            │
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
id            uuid PRIMARY KEY DEFAULT gen_random_uuid()
nome          text NOT NULL
cnpj          text UNIQUE
created_at    timestamptz DEFAULT now()
```

### 4.2 Tabela: `veiculos`
```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
empresa_id      uuid REFERENCES empresas(id)
placa           text UNIQUE NOT NULL
apelido         text            -- "Truck do João", "Caminhão 01"
modelo          text            -- "Volvo FH 540"
ano             int
km_atual        numeric(12,1)   -- atualizado a cada leitura
km_proxima_troca_oleo   numeric(12,1)
km_proxima_revisao      numeric(12,1)
ativo           boolean DEFAULT true
foto_url        text            -- URL no R2
created_at      timestamptz DEFAULT now()
```

### 4.3 Tabela: `motoristas`
```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
empresa_id      uuid REFERENCES empresas(id)
nome            text NOT NULL
whatsapp        text UNIQUE NOT NULL  -- "+5511999999999" (chave de auth)
cnh_numero      text
cnh_validade    date
ativo           boolean DEFAULT true
created_at      timestamptz DEFAULT now()
```

### 4.4 Tabela: `viagens`
```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
veiculo_id      uuid REFERENCES veiculos(id)
motorista_id    uuid REFERENCES motoristas(id)
origem          text NOT NULL
destino         text NOT NULL
km_inicial      numeric(12,1)
km_final        numeric(12,1)
km_total        numeric(12,1) GENERATED ALWAYS AS (km_final - km_inicial) STORED
status          text CHECK (status IN ('em_andamento','concluida','cancelada')) DEFAULT 'em_andamento'
data_inicio     timestamptz DEFAULT now()
data_fim        timestamptz
observacoes     text
created_at      timestamptz DEFAULT now()
```

### 4.5 Tabela: `km_logs`
```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
veiculo_id      uuid REFERENCES veiculos(id)
motorista_id    uuid REFERENCES motoristas(id)
viagem_id       uuid REFERENCES viagens(id)
km_lido         numeric(12,1) NOT NULL
foto_url        text            -- URL da foto do painel no R2
ia_confianca    numeric(4,2)    -- % de confiança da leitura da IA (0-100)
ia_raw_response text            -- resposta bruta da IA para auditoria
tipo            text CHECK (tipo IN ('inicial','final','checkpoint'))
confirmado      boolean DEFAULT false  -- confirmado pelo motorista
created_at      timestamptz DEFAULT now()
```

### 4.6 Tabela: `abastecimentos`
```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
veiculo_id      uuid REFERENCES veiculos(id)
motorista_id    uuid REFERENCES motoristas(id)
viagem_id       uuid REFERENCES viagens(id)
km_no_abast     numeric(12,1)
litros          numeric(8,2)
valor_total     numeric(10,2)
posto           text
foto_cupom_url  text            -- comprovante no R2
created_at      timestamptz DEFAULT now()
```

### 4.7 Tabela: `manutencoes`
```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
veiculo_id      uuid REFERENCES veiculos(id)
tipo            text NOT NULL   -- "troca_oleo", "revisao", "pneu", "freio", etc.
descricao       text
km_realizada    numeric(12,1)
km_proxima      numeric(12,1)
data_realizada  date
data_proxima    date
custo           numeric(10,2)
status          text CHECK (status IN ('pendente','aprovada','concluida')) DEFAULT 'pendente'
aprovado_por    uuid REFERENCES auth.users(id)
created_at      timestamptz DEFAULT now()
```

### 4.8 Tabela: `avarias`
```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
veiculo_id      uuid REFERENCES veiculos(id)
motorista_id    uuid REFERENCES motoristas(id)
viagem_id       uuid REFERENCES viagens(id)
descricao_motorista text      -- texto/áudio transcrito
descricao_ia        text      -- resumo gerado pela IA
urgencia        text CHECK (urgencia IN ('baixa','media','alta','critica'))
foto_urls       text[]          -- array de URLs no R2
status          text CHECK (status IN ('aberta','em_analise','resolvida')) DEFAULT 'aberta'
created_at      timestamptz DEFAULT now()
```

### 4.9 Tabela: `alertas`
```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
tipo            text NOT NULL   -- "manutencao_vencida", "avaria_critica", "km_sem_registro"
referencia_id   uuid            -- ID da avaria, manutenção, etc.
veiculo_id      uuid REFERENCES veiculos(id)
mensagem        text
enviado_whatsapp boolean DEFAULT false
lido            boolean DEFAULT false
created_at      timestamptz DEFAULT now()
```

### 4.10 Tabela: `sessoes_whatsapp` *(controle de estado do bot)*
```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
whatsapp        text UNIQUE NOT NULL
motorista_id    uuid REFERENCES motoristas(id)
estado          text NOT NULL   -- "aguardando_veiculo", "aguardando_acao", "aguardando_foto_km", etc.
contexto        jsonb           -- dados temporários da conversa (veiculo_id, viagem_id, etc.)
ultimo_contato  timestamptz DEFAULT now()
```

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
                   ┌─────────────────────┐
                   │ Caminhão: ABC-1234  │
                   │ KM atual: 125.430   │
                   │                     │
                   │ [📸 Informar KM]    │
                   │ [⚠️ Relatar Avaria] │
                   │ [🛣️ Iniciar Viagem] │
                   │ [⛽ Abastecimento]  │
                   └─────────────────────┘
```

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
[GPT-4o Vision analisa imagem]
  Prompt: "Extraia o valor do odômetro 
   desta imagem. Retorne JSON:
   { km: number, confianca: number (0-100),
     observacao: string }"
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
       │   GPT-4o Vision:
       │   "Analise a avaria nesta foto.
       │    Retorne: { descricao, urgencia:
       │    'baixa'|'media'|'alta'|'critica',
       │    recomendacao }"
       │
       ├── Áudio enviado
       │       ▼
       │   Whisper (transcrição) → GPT-4o
       │   (análise do texto transcrito)
       │
       └── Texto enviado
               ▼
           GPT-4o (análise de texto)
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
Bot: "📸 Agora tire a foto do painel
      para registrar o KM inicial."
       │
[IA lê KM inicial → confirma com botões]
       │
       ▼
Viagem criada no Supabase (status: em_andamento)
Bot: "✅ Viagem iniciada! Boa viagem, João! 🛣️"
```

### 6.5 Fluxo: Abastecimento

```
[⛽ Abastecimento]
       │
       ▼
Bot: "📸 Tire uma foto do comprovante
      de abastecimento."
       │
[IA extrai: litros, valor, posto]
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

---

## 7. MÓDULOS DO DASHBOARD WEB (Gestor)

| Módulo | Descrição |
|---|---|
| **Dashboard Home** | Cards: viagens ativas, alertas pendentes, KM total do mês |
| **Frota** | Lista de caminhões, status, KM atual, próximas manutenções |
| **Motoristas** | Cadastro, histórico de viagens, CNH validade |
| **Viagens** | Timeline de viagens, mapa (se possível), KM rodado |
| **Manutenções** | Agenda, aprovação de ordens de serviço |
| **Avarias** | Galeria de fotos, urgência, status de resolução |
| **Relatórios** | KM por veículo, custo por km, alertas por período |
| **Configurações** | Alertas de KM, thresholds de manutenção, dados da empresa |

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
│  🛣️ Viagens                             │
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
| **Tabelas densas** | Frota, Motoristas, Viagens, Manutenções, Avarias |
| **Botão amber de destaque** | "Exportar Relatório", "Backup de Dados", ações críticas do gestor |
| **Cards mobile empilhados** | Versão mobile de todas as tabelas |
| **Labels uppercase tiny** | Todos os campos de formulário e cabeçalhos de tabela |
| **Sharp corners nos inputs** | `rounded-none` em todos os campos |
| **Sombra neobrutalist no submit** | Botão principal de cada formulário |
| **Modal de progresso** | Ações longas: exportar relatório, backup, sincronização |
| **Versão no sidebar** | `v1.0.0` em fonte mono, cor desbotada |
| **Alertas com confirmação** | Toda ação destrutiva (excluir, encerrar viagem, cancelar manutenção) |

### 8.8 Botão de Backup Completo do Sistema (Master Only)

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



### 8.7 Padrão de Listagem e Pesquisa (Filtros)

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
// Padrão do useFilters — aplicar em Frota, Viagens, Manutenções, etc.
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
| **Viagens** | Origem, Destino, Placa, Motorista | Status (andamento/concluída/cancelada), Veículo |
| **Manutenções** | Descrição, Tipo | Status (pendente/aprovada/concluída), Veículo |
| **Avarias** | Descrição, Placa | Urgência (baixa/média/alta/crítica), Status |
| **Abastecimentos** | Posto, Placa | Veículo, Período |

---

## 9. ORDEM DE SETUP DA INFRAESTRUTURA

Antes de começar a codar, vamos configurar as plataformas na ordem abaixo:

| Passo | Plataforma | O que fazer |
|---|---|---|
| 1️⃣ | **GitHub** | Criar repositório privado e subir o projeto inicial |
| 2️⃣ | **Supabase** | Criar projeto, aplicar migrations, configurar Auth e RLS |
| 3️⃣ | **Vercel** | Conectar ao repositório GitHub, configurar variáveis de ambiente |
| 4️⃣ | **Sentry** | Criar projeto, obter DSN, integrar ao Next.js |
| 5️⃣ | **Cloudflare R2** | Criar bucket, gerar credenciais de acesso |
| 6️⃣ | **Meta Cloud API** | Criar conta Business, configurar número WhatsApp (Fase 3) |
| 7️⃣ | **OpenAI** | Gerar API Key GPT-4o (Fase 4) |

> ✅ Progresso atual: aguardando início do Passo 1 (GitHub)

---

## 9. FASES DE IMPLEMENTAÇÃO

---

### 🔵 FASE 1 — Setup e Banco de Dados

**Objetivo:** Criar a estrutura base do projeto e o banco de dados completo.

**Tarefas:**
- [ ] Inicializar projeto Next.js com TailwindCSS
- [ ] Configurar Supabase (criar projeto, aplicar migrations)
- [ ] Criar todas as tabelas conforme seção 4
- [ ] Configurar RLS (Row Level Security) para todas as tabelas
- [ ] Configurar Supabase Auth (gestor via email/senha)
- [ ] Configurar variáveis de ambiente (`.env.local`)
- [ ] Configurar Cloudflare R2 (bucket + credenciais)
- [ ] Configurar Sentry
- [ ] Popular dados iniciais: empresa, 10 veículos, motoristas

**Entregável:** Banco de dados operacional + projeto Next.js rodando localmente.

---

### 🟢 FASE 2 — Dashboard Web (Gestor)

**Objetivo:** Interface web completa para o gestor visualizar e gerenciar a frota.

**Tarefas:**
- [ ] Layout base: sidebar, header, responsivo (mobile-first)
- [ ] Tela de login do gestor
- [ ] Dashboard Home (cards de resumo, últimos alertas)
- [ ] Módulo Frota (CRUD de veículos)
- [ ] Módulo Motoristas (CRUD)
- [ ] Módulo Viagens (listagem, filtros, detalhes)
- [ ] Módulo Manutenções (agenda, aprovação)
- [ ] Módulo Avarias (galeria, status)
- [ ] Módulo Relatórios (básico)
- [ ] Upload de imagens para R2 (foto dos caminhões)

**Entregável:** Dashboard funcional conectado ao Supabase.

---

### 🟡 FASE 3 — Webhook WhatsApp + Fluxo Conversacional

**Objetivo:** Bot WhatsApp com mensagens interativas (botões e listas).

**Tarefas:**
- [x] Decidir provedor → **Meta Cloud API** ✅
- [ ] Criar conta Business e configurar número
- [ ] Criar rota `/api/whatsapp/webhook` no Next.js
- [ ] Implementar verificação do webhook (GET + token)
- [ ] Implementar parser de mensagens recebidas (texto, interativo, mídia)
- [ ] Implementar `SessionManager` (ler/escrever `sessoes_whatsapp`)
- [ ] Implementar fluxo de autenticação por número
- [ ] Implementar envio de Lista Interativa (seleção de veículo)
- [ ] Implementar envio de Botões Interativos (menu de ações)
- [ ] Implementar todos os sub-fluxos (KM, Avaria, Viagem, Abastecimento)
- [ ] Implementar envio de alertas ao gestor

**Entregável:** Bot funcional no WhatsApp com fluxo completo.

---

### 🔴 FASE 4 — Integração com IA

**Objetivo:** Extração automática de dados de fotos e áudios.

**Tarefas:**
- [ ] Configurar cliente OpenAI (GPT-4o)
- [ ] Implementar `KmReaderService`: OCR de odômetro via GPT-4o Vision
- [ ] Implementar `AvariaAnalysisService`: análise de foto de avaria
- [ ] Implementar `AudioTranscriptionService`: Whisper para áudios
- [ ] Implementar lógica de confiança (fallback para input manual)
- [ ] Implementar `AlertService`: detecção de urgência e envio de alertas
- [ ] Testes de acurácia da leitura do odômetro

**Entregável:** IA operacional integrada ao fluxo do WhatsApp.

---

### ⚫ FASE 5 — Polimento, Testes e Deploy

**Objetivo:** Sistema pronto para produção.

**Tarefas:**
- [ ] Testes end-to-end do fluxo completo
- [ ] Configurar variáveis de ambiente na Vercel
- [ ] Deploy na Vercel (produção)
- [ ] Configurar webhook WhatsApp apontando para produção
- [ ] Configurar alertas Sentry
- [ ] Testes com motoristas reais
- [ ] Documentação de uso para motoristas (PDF/imagem de instrução)

**Entregável:** Sistema em produção, estável e documentado.

---

## 10. VARIÁVEIS DE AMBIENTE

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

## 11. ESTRUTURA DE PASTAS (Next.js App Router)

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
│   │   ├── viagens/
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

## 12. CONSIDERAÇÕES DE SEGURANÇA

- **RLS ativado** em todas as tabelas do Supabase
- Webhook WhatsApp validado via **HMAC signature** (Meta) ou token secreto
- `SUPABASE_SERVICE_ROLE_KEY` usado **apenas no servidor** (nunca exposto ao cliente)
- Rate limiting no webhook para prevenir spam
- Imagens salvas no R2 com URLs assinadas temporárias para avarias

---

*Documento gerado em 2026-05-18. Última atualização: 2026-05-18 — Meta Cloud API confirmado como provedor WhatsApp.*
