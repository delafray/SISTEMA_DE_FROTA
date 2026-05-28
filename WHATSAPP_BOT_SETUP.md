# WhatsApp Bot — Documentação Completa da Solução

> Registro detalhado de todos os problemas encontrados, soluções tentadas e resolução final do bot de WhatsApp para o Sistema de Frota.
> Data: 27/05/2026.

---

## 1. O Problema Original: API Oficial da Meta

### Por que não usar a API oficial do WhatsApp (Meta)

A princípio, a ideia era usar a **API oficial do WhatsApp Business** (via Meta/Facebook). Porém:

| Problema | Impacto |
|---|---|
| **Verificação do CNPJ travada** | Burocracia cruzando dados públicos, prova de endereço, documentos |
| **Limite de 250 conversas/dia** | Conta "Unverified Tier" extremamente limitada |
| **Templates obrigatórios** | Cada mensagem precisa ser aprovada pelo Facebook antes de enviar |
| **Custo por conversa** | Centavos por mensagem + cartão de crédito obrigatório |
| **Complexidade excessiva** | Feita para marketing de grandes empresas, não uso interno |

**Decisão:** Abandonar a API oficial da Meta e adotar a **Evolution API** (API não-oficial baseada no WhatsApp Web/Baileys).

---

## 2. Solução Escolhida: Evolution API

### O que é

A Evolution API é uma API open-source que roda uma instância invisível do WhatsApp Web (biblioteca Baileys). Em vez de usar servidores da Meta, ela fala diretamente com os servidores do WhatsApp via WebSocket + Noise Protocol.

### Vantagens

| Característica | API Oficial (Meta) | Evolution API ✅ |
|---|---|---|
| Burocracia | CNPJ, verificação, documentos | Nenhuma (QR Code) |
| Custo | Centavos por mensagem | Gratuito |
| Templates | Precisam aprovação do Facebook | Liberdade total |
| Limite de mensagens | 250/dia (unverified) | Sem limite |
| Tempo de setup | Dias/semanas | Minutos |
| Hospedagem | Servidores da Meta | Railway (nosso controle) |

---

## 3. Migração do Código (Conversa 1: ~13h-17h)

### 3.1 O que foi feito

A outra IA (Claude) fez a migração completa do código do sistema, trocando de Meta Cloud API para Evolution API. Apenas **4 arquivos de transporte** foram modificados:

| Arquivo | O que mudou |
|---|---|
| `security.ts` | `verifyMetaSignature` (HMAC SHA-256) → `verifyEvolutionSignature` (token simples no header `apikey`) |
| `messageParser.ts` | Parse do payload Meta → parse do payload Evolution API (formato `messages.upsert`) |
| `messageSender.ts` | Endpoints Meta Graph API → endpoints Evolution REST (`/message/sendText`, etc.) |
| `webhook/route.ts` | Validação e roteamento adaptados para formato Evolution |

**Todos os 9 fluxos do bot** (km, abastecimento, despesa, adiantamento, avaria, checklist, imprevisto, viagem, gestor) **não precisaram de alteração** — a interface pública das funções foi mantida idêntica.

### 3.2 Testes passaram

Todos os testes unitários foram atualizados e executados com sucesso via `npm test`.

---

## 4. Deploy da Evolution API no Railway (Conversa 1: ~17h-20h)

### 4.1 Primeira tentativa — Docker Image `atendai/evolution-api:v2.2.3`

| Passo | Resultado |
|---|---|
| Deploy via Docker Image no Railway | ✅ Container subiu |
| Variáveis de ambiente configuradas | ✅ API Key, porta, auth |
| Evolution API ficou ONLINE | ✅ URL gerada |

**URL da API:** `https://evolution-api-production-d261.up.railway.app`

### 4.2 Problemas com PostgreSQL + SSL

Assim que tentamos criar instâncias do bot, surgiu um **ciclo infernal de erros de SSL** com o PostgreSQL interno do Railway:

```
SSL error: unexpected eof while reading
```

**Tentativas de solução (todas falharam):**

1. ❌ Adicionou `?sslmode=no-verify` na DATABASE_URL
2. ❌ Usou URL externa do Postgres com `no-verify`
3. ❌ Variável `PGSSLMODE=no-verify`
4. ❌ Railway sanitizava as query strings e o SSL continuava quebrando
5. ❌ Tentou usar SQLite — Evolution API v2.2.3 **não suporta SQLite**

### 4.3 Problemas com Volume de Persistência

O Railway montava um volume `/evolution/instances` para persistir sessões do Baileys, mas:

- Permissões quebradas no plano gratuito
- Container crashava com `SIGTERM` na inicialização
- Erros `502 Bad Gateway` constantes

### 4.4 Instância presa em "connecting"

Mesmo quando a API voltava online, as instâncias criadas ficavam em loop infinito:

```json
{ "state": "connecting" }
```

O endpoint `/instance/connect` retornava `{ "count": 0 }` e **nunca gerava o QR Code**.

---

## 5. Solução Final: Evolution API v2.3.0 (Conversa 2: ~17h-19h)

### 5.1 Diagnóstico: Bug da v2.2.3

Após horas de debug, foi identificado que a **Evolution API v2.2.3** tinha bugs conhecidos:

- Inicialização do Baileys travava em loop de "connecting"
- Endpoint `/instance/connect` não gerava QR Code
- Conflitos com persistência de sessão via volume do Railway

### 5.2 Tentativa de upgrade para v2.3.0

**Problema:** O repositório Docker antigo `atendai/evolution-api` foi **descontinuado** e só ia até a versão v2.2.3. A v2.3.0 não existia nesse repositório!

**Tentativas com versão errada:**

| Tentativa | Resultado |
|---|---|
| `atendai/evolution-api:v2.3.0` | ❌ Imagem não encontrada |
| Railway sugeriu voltar para v2.2.3 | ❌ Ignoramos (sabíamos que era bugada) |
| Deploy acidental da v2.2.0 | ❌ Ainda mais antiga e bugada |

### 5.3 Descoberta: Nova organização Docker

A Evolution API mudou de organização oficial no Docker Hub:

| Repositório | Status |
|---|---|
| `atendai/evolution-api` | ❌ **Descontinuado** (máximo v2.2.3) |
| `evoapicloud/evolution-api` | ✅ **Oficial e atualizado** |

### 5.4 Deploy da v2.3.0 com sucesso

Alterado no Railway Settings → Source:
```
evoapicloud/evolution-api:v2.3.0
```

**Logs confirmaram:**
```
> evolution-api@2.3.0 start:prod
```

### 5.5 Limpeza de sessão corrompida

Após subir a v2.3.0, a instância ainda tentava recuperar a sessão corrompida da versão anterior:

```javascript
// Logout para limpar sessão corrompida
fetch('/instance/logout/frota-bot-final', {
  method: 'DELETE',
  headers: { 'apikey': 'frota-evo-key-2026' }
})
// Resultado: Sessão limpa com sucesso!
```

---

## 6. QR Code e Conexão (Conversa 2: ~19h-19:30h)

### 6.1 Geração do QR Code — Funcionou!

Após a limpeza, o `/instance/connect` finalmente gerou o QR Code:

```javascript
fetch('/instance/connect/frota-bot-novo', {
  headers: { 'apikey': 'frota-evo-key-2026' }
})
```

O QR Code foi escaneado com o celular e a instância mudou para:
```json
{ "state": "open" }
```

### 6.2 Teste de envio — Mensagem chegou!

```javascript
// Teste de envio direto
// Resultado: Mensagem "teste direto evolution" chegou no celular!
```

**Conexão de SAÍDA (enviar) confirmada: ✅**

---

## 7. Bug Final: Mensagens de ENTRADA (Conversa 2: ~19:30h-20h)

### 7.1 O problema

O bot **enviava** mensagens com sucesso, mas **não respondia** quando recebia mensagens. O webhook recebia os dados mas o processamento falhava silenciosamente.

### 7.2 Causa raiz: Formato do JID na v2.3.0

A Evolution API v2.3.0 mudou o formato do JID (identificador do remetente):

| Versão | Formato do JID |
|---|---|
| Meta Cloud API | `5531XXXXX` (número puro) |
| Evolution v2.2.x | `5531XXXXX@s.whatsapp.net` |
| Evolution v2.3.0 | `5531XXXXX1900@s.whatsapp.net` (com sufixo `1900`!) |

O `messageParser.ts` extraía o JID mas não removia o sufixo `1900`, fazendo com que a busca no banco de dados do motorista falhasse (não encontrava nenhum motorista com número `553189791317 1900`).

### 7.3 A correção

Atualizado o `messageParser.ts` para:
1. Extrair o JID do payload
2. Remover o sufixo `1900` do número
3. Remover o `@s.whatsapp.net`
4. Buscar corretamente no banco de dados

### 7.4 Resultado final

Após a correção e deploy na Vercel:
- ✅ Bot recebe mensagens
- ✅ Bot identifica o motorista
- ✅ Bot responde com o menu
- ✅ Todos os fluxos funcionando

---

## 8. Configuração Webhook (Formato v2.x)

A Evolution API v2.x exige que os dados do webhook fiquem dentro de uma propriedade `"webhook"`:

```javascript
// ✅ Formato CORRETO para Evolution API v2.x/v2.3.0
fetch('/webhook/set/frota-bot-novo', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'apikey': 'frota-evo-key-2026' },
  body: JSON.stringify({
    webhook: {
      url: 'https://sistema-de-frota.vercel.app/api/whatsapp/webhook',
      enabled: true,
      events: ['MESSAGES_UPSERT'],
      webhookByEvents: false
    }
  })
})
```

> **IMPORTANTE:** Na versão anterior (v1.x), os dados iam direto no body sem o wrapper `webhook: {}`. Essa mudança causou erro `400 Bad Request` durante a migração.

---

## 9. Infraestrutura Final e Variáveis de Ambiente

### 9.1 Visão Geral

```
┌──────────────┐       ┌─────────────────────┐       ┌──────────────────────┐
│  Motorista    │       │   Evolution API      │       │   Sistema de Frota   │
│  (WhatsApp)   │◄─────►│   (Railway)          │──────►│   (Vercel/Next.js)   │
│              │       │                     │       │                      │
│  Envia msg   │       │  frota-bot-novo     │       │  /api/whatsapp/      │
│  Recebe menu │       │  WhatsApp-Baileys   │       │  webhook/route.ts    │
└──────────────┘       └─────────────────────┘       └──────────────────────┘
                                │                              │
                                │                              │
                        ┌───────▼──────────────────────────────▼───┐
                        │          Supabase (PostgreSQL)           │
                        │   motoristas, sessões, abastecimentos   │
                        └─────────────────────────────────────────┘
```

---

### 9.2 Evolution API — Railway

| Campo | Valor |
|---|---|
| **Plataforma** | Railway (https://railway.app) |
| **Imagem Docker** | `evoapicloud/evolution-api:v2.3.0` |
| **URL** | `https://evolution-api-production-d261.up.railway.app` |
| **Instância do Bot** | `frota-bot-novo` |

#### Variáveis de Ambiente no Railway:

| Variável | Valor | Descrição |
|---|---|---|
| `AUTHENTICATION_TYPE` | `apikey` | Método de autenticação da API |
| `AUTHENTICATION_API_KEY` | `frota-evo-key-2026` | Chave global para acessar a API |
| `PORT` | `8080` | Porta interna do container |
| `SERVER_PORT` | `8080` | Porta do servidor HTTP |
| `DATABASE_ENABLED` | `false` | Desativado (usa persistência local) |
| `DEL_INSTANCE` | `false` | NÃO deletar instâncias ao desconectar |
| `LOG_LEVEL` | `ERROR` | Nível de log (reduzido para evitar ruído) |

> **⚠️ IMPORTANTE:** O volume `/evolution/instances` no Railway é necessário para persistir sessões do Baileys entre redeploys. Sem ele, o QR Code precisa ser escaneado novamente a cada restart.

---

### 9.3 Sistema de Frota — Vercel

| Campo | Valor |
|---|---|
| **Plataforma** | Vercel (https://vercel.com) |
| **Framework** | Next.js |
| **Webhook** | `/api/whatsapp/webhook` |
| **Repositório** | GitHub (deploy automático via push) |

#### Variáveis de Ambiente na Vercel:

| Variável | Valor | Descrição |
|---|---|---|
| **Supabase** | | |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://[SEU-PROJETO].supabase.co` | URL pública do Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `[sua-anon-key]` | Chave anônima (client-side) |
| `SUPABASE_SERVICE_ROLE_KEY` | `[sua-service-role-key]` | Chave admin (server-side only!) |
| **WhatsApp / Evolution API** | | |
| `EVOLUTION_API_URL` | `https://evolution-api-[XXXX].up.railway.app` | URL da Evolution API no Railway |
| `EVOLUTION_API_KEY` | `[sua-api-key]` | Mesma API Key configurada no Railway |
| `EVOLUTION_INSTANCE_NAME` | `frota-bot` | Nome da instância do bot |
| `EVOLUTION_WEBHOOK_SECRET` | `[seu-webhook-secret]` | Token que a Evolution envia no header `apikey` do webhook |
| **Cloudflare R2 (Armazenamento)** | | |
| `R2_ACCOUNT_ID` | `[seu-account-id]` | ID da conta Cloudflare |
| `R2_ACCESS_KEY_ID` | `[sua-access-key]` | Chave de acesso R2 |
| `R2_SECRET_ACCESS_KEY` | `[sua-secret-key]` | Chave secreta R2 |
| `R2_BUCKET_NAME` | `frota-storage` | Nome do bucket |
| `R2_PUBLIC_URL` | `https://pub-[XXXX].r2.dev` | URL pública dos arquivos |
| **OpenAI** | | |
| `OPENAI_API_KEY` | `sk-proj-[sua-chave]` | Chave da API OpenAI (GPT-4o) |
| **Sentry (Monitoramento)** | | |
| `NEXT_PUBLIC_SENTRY_DSN` | `https://[XXXX]@o[XXXX].ingest.sentry.io/[XXXX]` | DSN do Sentry para erros |
| `SENTRY_AUTH_TOKEN` | `sntrys_[seu-token]` | Token de autenticação Sentry |
| **Roteirização (a configurar)** | | |
| `OSRM_URL` | *(após VM Oracle)* | URL do OSRM Backend |
| `VROOM_URL` | *(após VM Oracle)* | URL do VROOM Optimizer |

> **⚠️ Cuidado:** As variáveis da Vercel precisam estar configuradas tanto no painel web da Vercel (Production Environment) quanto no `.env.local` para desenvolvimento local.

---

### 9.4 Supabase — Banco de Dados

| Campo | Valor |
|---|---|
| **Plataforma** | Supabase (https://supabase.com) |
| **Região** | US East |
| **URL do Projeto** | `https://ltfthfbounngaubwsxfw.supabase.co` |
| **Tipo** | PostgreSQL gerenciado |

O Supabase é usado pelo **Sistema de Frota** (Vercel) para armazenar:
- Cadastro de motoristas e seus números de WhatsApp
- Sessões de conversa do bot
- Registros de abastecimento, despesas, avarias, etc.
- Dados de veículos, empresas e usuários

> **NOTA:** O banco do Supabase **não é usado** pela Evolution API diretamente. A Evolution API persiste suas sessões localmente via volume no Railway.

---

### 9.5 Arquivo `.env.local` Completo (Referência)

```env
# ══════════════════════════════════════════════════
# SISTEMA DE FROTA — Variáveis de Ambiente
# !! NUNCA commitar este arquivo no Git !!
# ══════════════════════════════════════════════════

# ── Supabase ────────────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=https://[SEU-PROJETO].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=[sua-anon-key]
SUPABASE_SERVICE_ROLE_KEY=[sua-service-role-key]

# ── Cloudflare R2 ───────────────────────────────────
R2_ACCOUNT_ID=[seu-account-id]
R2_ACCESS_KEY_ID=[sua-access-key]
R2_SECRET_ACCESS_KEY=[sua-secret-key]
R2_BUCKET_NAME=frota-storage
R2_PUBLIC_URL=https://pub-[XXXX].r2.dev

# ── OpenAI GPT-4o ───────────────────────────────────
OPENAI_API_KEY=sk-proj-[sua-chave]

# ── Evolution API / WhatsApp ────────────────────────
EVOLUTION_API_URL=https://evolution-api-production-d261.up.railway.app
EVOLUTION_API_KEY=frota-evo-key-2026
EVOLUTION_INSTANCE_NAME=frota-bot-novo
EVOLUTION_WEBHOOK_SECRET=frota-webhook-secret-2026

# ── Sentry ──────────────────────────────────────────
NEXT_PUBLIC_SENTRY_DSN=https://34752f95c353daf6a5743612e33f987c@o4511221455454208.ingest.us.sentry.io/...
SENTRY_AUTH_TOKEN=sntrys_eyJpYXQiOjE3NzkxNTk3ODA...

# ── Roteirização (após VM Oracle) ───────────────────
# OSRM_URL=http://SEU-IP-ORACLE:5000
# VROOM_URL=http://SEU-IP-ORACLE:3000
```

---

## 10. Resumo Cronológico dos Erros

| # | Erro | Causa | Solução |
|---|---|---|---|
| 1 | Verificação CNPJ travada (Meta) | Burocracia da API oficial | Migrou para Evolution API |
| 2 | `"frota-bot" instance does not exist` (404) | Instância deletada/renomeada | Criou `frota-bot-novo` |
| 3 | `"instance requires property webhook"` (400) | Formato da API mudou na v2 | Aninhado dados em `{ webhook: {} }` |
| 4 | `SSL error: unexpected eof while reading` | PostgreSQL Railway + SSL | Resolvido com config, mas causou outros problemas |
| 5 | Container crashando com `SIGTERM` | Volume `/evolution/instances` com permissão quebrada | Tentou remover volume (parcial) |
| 6 | `502 Bad Gateway` | Container não inicializava | Relacionado aos problemas de SSL + volume |
| 7 | Instância presa em `"connecting"` | **Bug da Evolution API v2.2.3** | **Atualizou para v2.3.0** |
| 8 | QR Code nunca aparecia (`count: 0`) | **Bug da v2.2.3** no endpoint `/instance/connect` | **Resolvido na v2.3.0** |
| 9 | Imagem `atendai/evolution-api:v2.3.0` não existe | Repositório Docker descontinuado | Mudou para `evoapicloud/evolution-api:v2.3.0` |
| 10 | Bot enviava mas não respondia | JID com sufixo `1900` na v2.3.0 | Corrigiu `messageParser.ts` para remover sufixo |

---

## 11. Estrutura de Arquivos do Bot

```
src/
├── app/api/whatsapp/webhook/
│   └── route.ts                 # Webhook que recebe dados da Evolution API
├── lib/whatsapp/
│   ├── auth.ts                  # Autenticação e validação de motoristas
│   ├── menuHelper.ts            # Monta menus interativos de texto
│   ├── messageParser.ts         # Parser de mensagens (corrigido para v2.3.0)
│   ├── messageRouter.ts         # Roteamento por tipo de mensagem
│   ├── messageSender.ts         # Envio via Evolution API REST
│   ├── security.ts              # Validação do webhook secret
│   ├── sessionManager.ts        # Gerenciamento de sessão/conversa
│   └── flows/                   # 9 fluxos do bot
│       ├── abastecimentoFlow.ts
│       ├── adiantamentoFlow.ts
│       ├── avariaFlow.ts
│       ├── checklistFlow.ts
│       ├── despesaFlow.ts
│       ├── gestorFlow.ts
│       ├── imprevistoFlow.ts
│       ├── kmFlow.ts
│       └── viagemFlow.ts
└── __tests__/whatsapp/          # Testes unitários completos
```

---

## 12. Manutenção e Reconexão

### Verificar se o bot está online:

```bash
curl -X GET \
  "https://evolution-api-production-d261.up.railway.app/instance/connectionState/frota-bot-novo" \
  -H "apikey: frota-evo-key-2026"
```

**Resposta esperada:** `{ "state": "open" }` → bot ativo.

### Se desconectar (`state: "close"`):

1. Gerar QR Code: `GET /instance/connect/frota-bot-novo`
2. Escanear com o celular (WhatsApp → Aparelhos conectados)

### Lições aprendidas:
- ⚠️ Sempre usar a imagem Docker oficial: `evoapicloud/evolution-api`
- ⚠️ Nunca usar `atendai/evolution-api` (descontinuado)
- ⚠️ Verificar formato do JID ao atualizar versões da Evolution API
- ⚠️ Se Railway der SSL, verificar configuração do banco de dados

---

*Documentação criada em 27/05/2026 com base nas conversas do dia.*

---

## 13. Guia de Implantação para Novo Cliente (Do Zero)

> Use esta seção quando for criar um ambiente identico para um novo cliente.
> Tempo estimado: 1-2 horas seguindo este guia.

---

### ETAPA 1 - Supabase (Banco de Dados)

1. Acesse supabase.com -> New Project
2. Nome: frota-cliente-xyz | Regiao: US East
3. Anote em Settings -> API:
   - NEXT_PUBLIC_SUPABASE_URL
   - NEXT_PUBLIC_SUPABASE_ANON_KEY
   - SUPABASE_SERVICE_ROLE_KEY
4. Execute as migrations do projeto para criar as tabelas

---

### ETAPA 2 - Cloudflare R2 (Fotos)

1. cloudflare.com -> R2 -> Create Bucket
2. Crie API Token com permissao leitura/escrita
3. Anote: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL

---

### ETAPA 3 - Railway (Evolution API)

> ATENCAO: Use SEMPRE evoapicloud/evolution-api:v2.3.0 - NUNCA atendai/

1. railway.app -> New Project -> Deploy a Docker Image
2. Imagem: evoapicloud/evolution-api:v2.3.0
3. Settings -> Variables:

AUTHENTICATION_TYPE=apikey
AUTHENTICATION_API_KEY=CHAVE-NOVA-DO-CLIENTE
PORT=8080
SERVER_PORT=8080
DATABASE_ENABLED=false
DEL_INSTANCE=false
LOG_LEVEL=ERROR

4. Aguarde ficar verde e anote a URL publica
5. Crie o volume /evolution/instances para persistir sessoes

---

### ETAPA 4 - GitHub + Vercel

1. Fork/clone o repositorio para GitHub do cliente
2. vercel.com -> Add New Project -> importe o repo
3. Environment Variables - configure TODAS:

NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
R2_PUBLIC_URL=
EVOLUTION_API_URL=https://evolution-api-CLIENTE.up.railway.app
EVOLUTION_API_KEY=CHAVE-NOVA-DO-CLIENTE
EVOLUTION_INSTANCE_NAME=frota-bot
EVOLUTION_WEBHOOK_SECRET=SEGREDO-WEBHOOK-NOVO
OPENAI_API_KEY=

4. Deploy -> anote a URL (ex: https://frota-cliente.vercel.app)

---

### ETAPA 5 - Criar Instancia e Conectar WhatsApp

1. Criar instancia (console do navegador):

fetch('https://evolution-api-CLIENTE.up.railway.app/instance/create', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'apikey': 'CHAVE-NOVA-DO-CLIENTE' },
  body: JSON.stringify({ instanceName: 'frota-bot', integration: 'WHATSAPP-BAILEYS' })
}).then(r => r.json()).then(console.log)

2. Configurar webhook:

fetch('https://evolution-api-CLIENTE.up.railway.app/webhook/set/frota-bot', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'apikey': 'CHAVE-NOVA-DO-CLIENTE' },
  body: JSON.stringify({
    webhook: {
      url: 'https://frota-CLIENTE.vercel.app/api/whatsapp/webhook',
      enabled: true,
      events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE', 'QRCODE_UPDATED'],
      webhookByEvents: false
    }
  })
}).then(r => r.json()).then(console.log)

3. Gerar QR Code:

fetch('https://evolution-api-CLIENTE.up.railway.app/instance/connect/frota-bot', {
  headers: { 'apikey': 'CHAVE-NOVA-DO-CLIENTE' }
}).then(r => r.json()).then(console.log)

4. WhatsApp do cliente -> Aparelhos conectados -> Conectar aparelho -> Escanear QR Code
5. Verificar: { "state": "open" } = Bot conectado!

---

### ETAPA 6 - Teste Final

Envie uma mensagem e verifique:
- Bot recebe a mensagem
- Bot identifica o motorista
- Bot responde com o menu

---

### Checklist de Entrega

[ ] Supabase criado e migrations executadas
[ ] Bucket R2 criado com URL publica
[ ] Evolution API v2.3.0 no Railway (evoapicloud/)
[ ] Todas variaveis configuradas na Vercel
[ ] Deploy Vercel sem erros de build
[ ] Instancia frota-bot criada
[ ] Webhook apontando para URL correta da Vercel
[ ] QR Code escaneado -> state: open
[ ] Teste: bot recebeu e respondeu
[ ] Cliente treinado para reconectar QR se necessario

---

### Armadilhas Conhecidas - NAO REPITA!

| Armadilha | NAO fazer | Fazer |
|---|---|---|
| Repo Docker errado | atendai/evolution-api | evoapicloud/evolution-api |
| Versao com bug QR | v2.2.3 (count: 0) | v2.3.0 ou superior |
| Webhook sem wrapper | {url: ..., events: ...} | {webhook: {url: ..., events: ...}} |
| JID sufixo 1900 | Usar 55319991900 direto | Remover 1900 no messageParser.ts |
| PostgreSQL Railway SSL | Banco interno Railway | Supabase (SSL estavel) |
| Sem volume Railway | Container sem persistencia | Volume /evolution/instances |

---

*Documentacao criada em 27/05/2026 com base nas conversas do dia.*
