# Framework WhatsApp Bot — Guia Completo de APIs e Configuração

> Documentação reutilizável para criar um bot de WhatsApp com IA.
> Baseado no **SISTEMA_DE_FROTA** (2026). Inclui TODAS as APIs, como configurar cada uma,
> armadilhas conhecidas, e o que deu dor de cabeça para funcionar.
>
> 📎 **Documento irmão:** [BOT_FRAMEWORK.md](./BOT_FRAMEWORK.md) — arquitetura interna, regras de código, bugs conhecidos, padrões de prompt, permission loop, roadmap.

---

## Índice

1. [Mapa Completo de APIs](#1-mapa-completo-de-apis)
2. [Evolution API (WhatsApp) — Railway](#2-evolution-api-whatsapp--railway)
3. [Supabase (Banco de Dados)](#3-supabase-banco-de-dados)
4. [Cloudflare R2 (Armazenamento de Fotos)](#4-cloudflare-r2-armazenamento-de-fotos)
5. [Gemini API (Google AI Studio)](#5-gemini-api-google-ai-studio)
6. [Deepgram (Speech-to-Text)](#6-deepgram-speech-to-text)
7. [Google Maps Geocoding](#7-google-maps-geocoding)
8. [OpenAI GPT-4o (OCR/Classificação)](#8-openai-gpt-4o-ocrclassificação)
9. [Sentry (Monitoramento de Erros)](#9-sentry-monitoramento-de-erros)
10. [Oracle Cloud VM (OSRM + VROOM)](#10-oracle-cloud-vm-osrm--vroom)
11. [APIs Gratuitas sem Cadastro](#11-apis-gratuitas-sem-cadastro)
12. [Vercel (Deploy)](#12-vercel-deploy)
13. [.env.local Completo](#13-envlocal-completo)
14. [Arquitetura do Bot](#14-arquitetura-do-bot)
15. [Guia de Setup do Zero (Novo Cliente)](#15-guia-de-setup-do-zero-novo-cliente)
16. [Histórico de Erros e Armadilhas](#16-histórico-de-erros-e-armadilhas)

---

## 1. Mapa Completo de APIs

| # | Serviço | Função | Custo | Onde criar chave |
|---|---|---|---|---|
| 1 | **Supabase** | Banco PostgreSQL | Grátis (free tier) | supabase.com → New Project |
| 2 | **Vercel** | Deploy Next.js | Grátis (free tier) | vercel.com → Import repo |
| 3 | **GitHub** | Repositório / CI-CD | Grátis | github.com |
| 4 | **Cloudflare R2** | Fotos (cupons, avarias) | Grátis até 10GB | cloudflare.com → R2 |
| 5 | **Evolution API** | Gateway WhatsApp | Grátis (self-hosted) | evoapicloud/evolution-api no Docker |
| 6 | **Railway** | Hospedagem da Evolution | Grátis (free tier) | railway.app |
| 7 | **Gemini (Google)** | IA conversacional + tools | Grátis (free) ou ~R$0,59/mês (pago) | aistudio.google.com/app/apikey |
| 8 | **Deepgram** | Transcrição de áudio | Grátis (US$200 crédito inicial) | deepgram.com → Dashboard → API Keys |
| 9 | **Google Maps** | Geocoding de endereços | Grátis até ~10k/mês | console.cloud.google.com/apis/credentials |
| 10 | **OpenAI** | OCR de fotos (GPT-4o Vision) | ~R$5-20/mês | platform.openai.com/api-keys |
| 11 | **Sentry** | Monitoramento de erros | Grátis (free tier) | sentry.io → Create Project |
| 12 | **Oracle Cloud** | VM OSRM + VROOM (rotas) | Grátis (Always Free) | cloud.oracle.com |
| 13 | **ViaCEP** | CEP → endereço | Grátis / Ilimitado | Sem cadastro |
| 14 | **Nominatim** | Endereço → lat/lng | Grátis (1 req/s) | Sem cadastro |
| 15 | **OSRM** | Cálculo de rotas | Grátis (auto-hospedado) | Na VM Oracle |
| 16 | **VROOM** | Otimização VRP | Grátis (auto-hospedado) | Na VM Oracle |

### Custo total mensal: ~R$ 5-20/mês (só OpenAI é pago obrigatoriamente)

---

## 2. Evolution API (WhatsApp) — Railway

### O que é
API open-source que roda WhatsApp Web via Baileys. Substitui a API oficial da Meta (que exige CNPJ verificado, templates aprovados, e custa por mensagem).

### Por que NÃO usar a API oficial da Meta
| API Oficial (Meta) | Evolution API ✅ |
|---|---|
| CNPJ + verificação + documentos (dias) | QR Code (minutos) |
| Centavos por mensagem | Gratuito |
| Templates precisam aprovação do Facebook | Liberdade total |
| 250 msgs/dia (unverified) | Sem limite |

### Como configurar

**PASSO 1:** Criar projeto no Railway
1. Acesse railway.app → New Project → Deploy a Docker Image
2. **IMAGEM:** `evoapicloud/evolution-api:v2.3.0`
   > ⚠️ **NUNCA usar `atendai/evolution-api`** — repositório descontinuado, máximo v2.2.3 que tem bug do QR Code!

**PASSO 2:** Configurar variáveis no Railway:
```
AUTHENTICATION_TYPE=apikey
AUTHENTICATION_API_KEY=sua-chave-segura-aqui
PORT=8080
SERVER_PORT=8080
DATABASE_ENABLED=false
DEL_INSTANCE=false
LOG_LEVEL=ERROR
```

**PASSO 3:** Criar volume de persistência
- Settings → Volumes → Mount Path: `/evolution/instances`
- Sem volume, QR Code precisa ser escaneado a cada restart!

**PASSO 4:** Aguardar deploy ficar verde e anotar a URL pública

**PASSO 5:** Criar instância do bot (no console do navegador):
```javascript
fetch('https://SUA-URL-RAILWAY/instance/create', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'apikey': 'SUA-CHAVE' },
  body: JSON.stringify({ instanceName: 'seu-bot', integration: 'WHATSAPP-BAILEYS' })
}).then(r => r.json()).then(console.log)
```

**PASSO 6:** Configurar webhook:
```javascript
// ⚠️ FORMATO v2.x: dados DENTRO de { webhook: {} } — sem isso dá 400!
fetch('https://SUA-URL-RAILWAY/webhook/set/seu-bot', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'apikey': 'SUA-CHAVE' },
  body: JSON.stringify({
    webhook: {
      url: 'https://seu-app.vercel.app/api/whatsapp/webhook',
      enabled: true,
      events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE', 'QRCODE_UPDATED'],
      webhookByEvents: false
    }
  })
}).then(r => r.json()).then(console.log)
```

**PASSO 7:** Gerar QR Code e escanear:
```javascript
fetch('https://SUA-URL-RAILWAY/instance/connect/seu-bot', {
  headers: { 'apikey': 'SUA-CHAVE' }
}).then(r => r.json()).then(console.log)
```
Escanear com WhatsApp → Aparelhos conectados → Conectar aparelho

**PASSO 8:** Verificar conexão:
```bash
curl -H "apikey: SUA-CHAVE" https://SUA-URL-RAILWAY/instance/connectionState/seu-bot
# Esperado: { "state": "open" }
```

### Variáveis para o .env.local / Vercel:
```env
EVOLUTION_API_URL=https://evolution-api-production-XXXX.up.railway.app
EVOLUTION_API_KEY=sua-chave-segura-aqui
EVOLUTION_INSTANCE_NAME=seu-bot
EVOLUTION_WEBHOOK_SECRET=segredo-do-webhook   # header "apikey" que a Evolution envia
```

### ⚠️ ARMADILHAS DA EVOLUTION API

| Armadilha | O que acontece | Solução |
|---|---|---|
| Repo Docker errado (`atendai/`) | Máximo v2.2.3, QR Code não gera | Usar `evoapicloud/evolution-api` |
| Versão v2.2.3 | Instância fica em "connecting" infinito | Usar v2.3.0+ |
| Webhook sem `{ webhook: {} }` | Erro 400 Bad Request | Aninhar dados em `webhook: {}` |
| JID com sufixo `1900` (v2.3.0) | Bot não encontra motorista no banco | Remover sufixo no messageParser.ts |
| Sem volume no Railway | QR Code precisa ser escaneado a cada deploy | Montar volume `/evolution/instances` |
| Áudio do WhatsApp encriptado | Deepgram recebe bytes inúteis | SEMPRE usar `getBase64FromMediaMessage` (descriptografa) |

---

## 3. Supabase (Banco de Dados)

### Como obter as chaves
1. supabase.com → New Project
2. Região: **US East** (ou a mais perto dos seus serviços)
3. Settings → API → copiar:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (client-side, segura)
   - `SUPABASE_SERVICE_ROLE_KEY` (server-side, NUNCA expor no client!)

### Tabelas necessárias para o bot

```sql
-- Estado da conversa por número de WhatsApp
CREATE TABLE whatsapp_sessoes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  whatsapp    TEXT NOT NULL UNIQUE,
  motorista_id UUID,
  usuario_id  UUID,
  empresa_id  UUID NOT NULL,
  estado      TEXT NOT NULL DEFAULT 'novo',
  contexto    JSONB NOT NULL DEFAULT '{}',
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Histórico de conversa (contexto pro Gemini)
CREATE TABLE whatsapp_historico (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telefone   TEXT NOT NULL,
  role       TEXT NOT NULL CHECK (role IN ('user', 'model')),
  conteudo   TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX ON whatsapp_historico (telefone, created_at DESC);

-- Métricas de chamadas à IA (guarda de cota)
CREATE TABLE bot_metricas (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evento     TEXT NOT NULL,
  empresa_id UUID,
  telefone   TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX ON bot_metricas (evento, created_at DESC);
```

---

## 4. Cloudflare R2 (Armazenamento de Fotos)

Para fotos de cupons, avarias, odômetro, etc.

### Como configurar
1. cloudflare.com → R2 → Create Bucket (nome: `frota-storage`)
2. Criar API Token: R2 → Manage R2 API Tokens → Create API Token
   - Permissão: Admin Read & Write
3. Anotar: Account ID (na URL), Access Key ID, Secret Access Key
4. Configurar acesso público ao bucket (R2 → bucket → Settings → Public Access)

### Variáveis:
```env
R2_ACCOUNT_ID=seu-account-id
R2_ACCESS_KEY_ID=sua-access-key
R2_SECRET_ACCESS_KEY=sua-secret-key
R2_BUCKET_NAME=frota-storage
R2_PUBLIC_URL=https://pub-XXXX.r2.dev
```

---

## 5. Gemini API (Google AI Studio)

### Como obter a chave
1. Acesse **aistudio.google.com/app/apikey**
2. Clique em **"Create API Key"**
3. Escolha ou crie um projeto do Google Cloud
4. Copie a chave

### Plano Gratuito vs Pago

| | Gratuito | Pago (Nível 1) |
|---|---|---|
| **RPM (req/min)** | 5 | 1.000 |
| **RPD (req/dia)** | ~250 | 10.000 |
| **Custo** | R$ 0 | ~R$ 0,59/mês (uso real) |
| **Pré-pagamento** | Não | Sim (R$ 20-60 de crédito) |
| **Dados p/ treinar IA** | Sim | Não |

### Configuração de latência (IMPORTANTE)
```typescript
// geminiClient.ts — desligar o "thinking" reduz 3-8 segundos por chamada!
generationConfig: {
  thinkingConfig: { thinkingBudget: 0 },
  maxOutputTokens: 1024,
}
```

### Guarda de cota (free tier)
Se estiver no plano gratuito, configure:
```env
GEMINI_RPM=5       # requisições por minuto
GEMINI_RPD=250     # requisições por dia
```
No plano pago, **NÃO setar** essas variáveis — a guarda fica desligada automaticamente (economiza 2 queries por mensagem).

### ⚠️ Armadilhas do Gemini
- Google mudou de pós-pagamento para **pré-pagamento obrigatório** — sem crédito, conta é "rebaixada"
- Chave do projeto `FrotaAPI` (pago) ≠ chave do `Default Gemini Project` (grátis) — verificar qual está no Vercel!
- Para ver consumo: aistudio.google.com → menu Gasto
- Para ver/gerenciar chaves: aistudio.google.com/app/apikey

### Variável:
```env
GEMINI_API_KEY=AQ.Ab8...sua-chave
```

---

## 6. Deepgram (Speech-to-Text)

Transcreve áudio do WhatsApp em texto antes de enviar pro Gemini.

### Como obter a chave
1. deepgram.com → Sign Up (pode usar conta Google)
2. Dashboard → API Keys → Create Key
3. Copie a chave (começa com caracteres alfanuméricos)

> **Bônus:** Deepgram dá US$ 200 de crédito gratuito para novas contas!

### Configuração no código
- Modelo: `nova-2` (melhor para português BR)
- Envio: via data URL base64 (NÃO URL direta — WhatsApp encripta o CDN!)

### ⚠️ Armadilha crítica: Download de áudio
O WhatsApp encripta a mídia no CDN. Se você tentar baixar a URL direta (`getMediaUrl`),
o Deepgram recebe bytes inúteis. **SEMPRE** usar `getMediaAsBase64DataUrl(messageId)`,
que chama o endpoint `getBase64FromMediaMessage` da Evolution API para descriptografar.

### Variável:
```env
DEEPGRAM_API_KEY=26b9b96537...sua-chave
```

---

## 7. Google Maps Geocoding

Geocoding de endereços (texto → lat/lng). Opcional — sem ela, o sistema usa ViaCEP + Nominatim (grátis).

### Como obter a chave
1. console.cloud.google.com → APIs & Services → Credentials
2. Create Credentials → API Key
3. **Restringir a chave:** APIs & Services → Credentials → editar → Application restrictions + API restrictions → **Geocoding API only**
4. Ativar a Geocoding API: APIs & Services → Library → buscar "Geocoding API" → Enable

### Cota mensal
O sistema tem guarda de cota embutida (`GEOCODE_LIMITE_MENSAL`). Estourou → cai no ViaCEP automaticamente.

```env
GOOGLE_MAPS_API_KEY=AIzaSy...sua-chave
GEOCODE_LIMITE_MENSAL=9800   # abaixo do grátis (~10k) → sem cobrança
```

---

## 8. OpenAI GPT-4o (OCR/Classificação)

Usado para: ler odômetro em fotos, classificar fotos (cupom, avaria, documento), OCR de notas fiscais.

### Como obter a chave
1. platform.openai.com → API Keys → Create new secret key
2. Copie (só mostra uma vez!)
3. Adicione crédito: Billing → Add Payment Method → Add to balance

### Variável:
```env
OPENAI_API_KEY=sk-proj-...sua-chave
```

---

## 9. Sentry (Monitoramento de Erros)

Captura exceções em produção e envia alertas.

### Como configurar
1. sentry.io → Create Project → Next.js
2. Copie o DSN
3. Gere Auth Token: Settings → Auth Tokens → Create Token

### Variáveis:
```env
NEXT_PUBLIC_SENTRY_DSN=https://XXXX@oXXXX.ingest.us.sentry.io/XXXX
SENTRY_AUTH_TOKEN=sntrys_...seu-token
```

---

## 10. Oracle Cloud VM (OSRM + VROOM)

VM gratuita permanente (Always Free Tier) para roteirização auto-hospedada.

### Especificações da VM
- **Shape:** VM.Standard.A1.Flex (ARM/Ampere)
- **4 OCPUs, 24 GB RAM, 47 GB disco**
- **OS:** Ubuntu 22.04
- **Custo:** R$ 0 (Always Free)

### Portas necessárias no firewall
| Porta | Serviço |
|---|---|
| 22 | SSH |
| 5000 | OSRM Backend |
| 3000 | VROOM |

### Variáveis:
```env
OSRM_URL=http://IP-DA-VM:5000
VROOM_URL=http://IP-DA-VM:3000
```

### Documentação completa: ver `ORACLE_CLOUD_SETUP.md` no projeto

---

## 11. APIs Gratuitas sem Cadastro

Pode usar direto, sem criar conta:
- **ViaCEP** — `https://viacep.com.br/ws/{CEP}/json/`
- **Nominatim** — `https://nominatim.openstreetmap.org/search` (1 req/s)
- **Waze deep link** — `https://waze.com/ul?ll=LAT,LNG&navigate=yes`
- **Google Maps deep link** — `https://www.google.com/maps/dir/?api=1&destination=LAT,LNG`
- **Geofabrik** — `https://download.geofabrik.de/south-america/brazil-latest.osm.pbf`

---

## 12. Vercel (Deploy)

### Configuração de região (IMPORTANTE PARA LATÊNCIA)

```json
// vercel.json
{
  "framework": "nextjs",
  "regions": ["iad1"]
}
```

```typescript
// src/app/api/whatsapp/webhook/route.ts
export const preferredRegion = 'iad1';
```

> ⚠️ **NÃO usar `gru1` (São Paulo)** mesmo o sistema sendo brasileiro!
> Evolution API, Deepgram e Gemini ficam nos EUA. O Supabase BR é leve (~150ms aceitável).
> Ao pinar em São Paulo, cada chamada pesada faz viagem transoceânica desnecessária.

### Deploy
- Conecte o repo GitHub ao Vercel
- Cada push em `main` faz deploy automático
- **Variáveis de ambiente:** Settings → Environment Variables → **configurar TODAS**
- ⚠️ Após mudar variável: **Deployments → último → ⋯ → Redeploy**

---

## 13. .env.local Completo

```env
# ══════════════════════════════════════════════════
# SISTEMA DE FROTA — Variáveis de Ambiente
# !! NUNCA commitar este arquivo no Git !!
# ══════════════════════════════════════════════════

# ── Supabase ────────────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=https://SEU-PROJETO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua-anon-key
SUPABASE_SERVICE_ROLE_KEY=sua-service-role-key

# ── Cloudflare R2 ───────────────────────────────────
R2_ACCOUNT_ID=seu-account-id
R2_ACCESS_KEY_ID=sua-access-key
R2_SECRET_ACCESS_KEY=sua-secret-key
R2_BUCKET_NAME=frota-storage
R2_PUBLIC_URL=https://pub-XXXX.r2.dev

# ── OpenAI GPT-4o ───────────────────────────────────
OPENAI_API_KEY=sk-proj-sua-chave

# ── Evolution API / WhatsApp ────────────────────────
EVOLUTION_API_URL=https://evolution-api-XXXX.up.railway.app
EVOLUTION_API_KEY=sua-api-key
EVOLUTION_INSTANCE_NAME=seu-bot
EVOLUTION_WEBHOOK_SECRET=seu-webhook-secret

# ── Sentry ──────────────────────────────────────────
NEXT_PUBLIC_SENTRY_DSN=https://XXXX@oXXXX.ingest.us.sentry.io/XXXX
SENTRY_AUTH_TOKEN=sntrys_seu-token

# ── Roteirização OSRM + VROOM ──────────────────────
OSRM_URL=http://IP-DA-VM:5000
VROOM_URL=http://IP-DA-VM:3000

# ── Gemini API (Google AI Studio) ───────────────────
GEMINI_API_KEY=sua-gemini-key

# ── Deepgram API (Speech-to-Text) ───────────────────
DEEPGRAM_API_KEY=sua-deepgram-key

# ── Google Maps Geocoding API ───────────────────────
GOOGLE_MAPS_API_KEY=sua-google-maps-key

# ── Cifra dos cadastros sensíveis (/uso-apis) ───────
# USO_APIS_ENC_KEY=frase-aleatoria-longa-para-cifrar-dados

# ── Guarda de cota Gemini (SÓ free tier) ────────────
# GEMINI_RPM=5
# GEMINI_RPD=250
```

---

## 14. Arquitetura do Bot

### Diagrama de infraestrutura:
```
┌──────────────┐       ┌─────────────────────┐       ┌──────────────────────┐
│  Motorista    │       │   Evolution API      │       │   Sistema de Frota   │
│  (WhatsApp)   │◄─────►│   (Railway, US)      │──────►│   (Vercel, US East)  │
│              │       │  evoapicloud v2.3.0  │       │  /api/whatsapp/      │
└──────────────┘       └─────────────────────┘       │  webhook/route.ts    │
                                                      └──────────┬───────────┘
                                                                 │
                    ┌────────────────────────────────────────────┼──────────────┐
                    │                    │                       │              │
              ┌─────▼──────┐     ┌──────▼───────┐     ┌────────▼──────┐  ┌───▼────────┐
              │  Supabase  │     │  Gemini API  │     │   Deepgram   │  │  OpenAI    │
              │  (Postgres)│     │  (Texto+Tools)│     │  (Áudio→Txt) │  │  (OCR/Foto)│
              └────────────┘     └──────────────┘     └──────────────┘  └────────────┘
```

### Fluxo de uma mensagem de áudio:
```
1. Motorista grava áudio no WhatsApp
2. WhatsApp → Evolution API (Railway) → POST webhook (Vercel)
3. Vercel: identifica remetente (auth.ts → Supabase)
4. Vercel: baixa áudio descriptografado (getBase64FromMediaMessage → Evolution API)
5. Vercel: transcreve áudio (Deepgram → texto)
6. Vercel: envia texto + contexto + histórico → Gemini API
7. Gemini decide chamar tool? SIM → executarTool() → query Supabase → resultado → Gemini
8. Gemini formula resposta em português
9. Vercel: envia resposta → Evolution API → WhatsApp do motorista
```

### Estrutura de arquivos:
```
src/
├── app/api/whatsapp/webhook/route.ts   ← Endpoint HTTP (POST)
└── lib/
    ├── whatsapp/
    │   ├── auth.ts              ← Identifica motorista/gestor/desconhecido
    │   ├── sessionManager.ts    ← Estado da conversa (Supabase)
    │   ├── messageParser.ts     ← Parseia payload da Evolution API
    │   ├── messageSender.ts     ← Envia textos, menus, listas
    │   ├── menuHelper.ts        ← Menus numerados (fallback WhatsApp pessoal)
    │   ├── fastPath.ts          ← "oi/menu/tchau" sem chamar IA (<1ms)
    │   ├── geminiBot.ts         ← Orquestra Gemini (texto e áudio)
    │   ├── geminiRateLimit.ts   ← Guarda de cota RPM/RPD
    │   ├── historico.ts         ← Últimas 8 msgs por número (4 turnos)
    │   ├── security.ts          ← Valida apikey do webhook
    │   └── flows/               ← Fluxos determinísticos (fallback sem IA)
    └── ai/
        ├── geminiClient.ts      ← SDK Gemini + retry + thinkingBudget
        ├── deepgramClient.ts    ← Transcrição de áudio
        ├── tools/frotaTools.ts  ← Function calling (declarations + queries)
        ├── prompts.ts           ← System prompts
        ├── metricas.ts          ← Registro de chamadas
        └── retry.ts             ← Retry com backoff (429/5xx)
```

---

## 15. Guia de Setup do Zero (Novo Cliente)

### Checklist em ordem:

- [ ] **1. Supabase** → criar projeto, copiar 3 chaves, executar migrations
- [ ] **2. Cloudflare R2** → criar bucket, criar API token, anotar 5 variáveis
- [ ] **3. Railway + Evolution API** → deploy `evoapicloud/evolution-api:v2.3.0`, configurar vars, criar volume
- [ ] **4. GitHub + Vercel** → fork/clone repo, conectar ao Vercel, configurar TODAS as env vars
- [ ] **5. OpenAI** → criar conta, gerar API key, adicionar crédito
- [ ] **6. Gemini** → aistudio.google.com/app/apikey → criar chave
- [ ] **7. Deepgram** → criar conta, gerar API key (US$200 crédito grátis)
- [ ] **8. Google Maps** → console.cloud.google.com → criar chave, ativar Geocoding API
- [ ] **9. Sentry** → criar projeto Next.js, copiar DSN + auth token
- [ ] **10. Instância + Webhook** → criar instância no Evolution, configurar webhook para URL da Vercel
- [ ] **11. QR Code** → gerar, escanear com WhatsApp, verificar `state: "open"`
- [ ] **12. Teste final** → motorista manda "oi" → recebe resposta do bot

---

## 16. Histórico de Erros e Armadilhas

> Cada erro aqui custou horas. Documente para não repetir.

### Evolution API
| # | Erro | Causa | Solução | Horas perdidas |
|---|---|---|---|---|
| 1 | API oficial Meta: CNPJ travado | Burocracia da Meta | Migrou para Evolution API | ~4h |
| 2 | QR Code nunca aparecia (`count: 0`) | Bug da Evolution v2.2.3 | Atualizou para v2.3.0 | ~3h |
| 3 | Imagem Docker `atendai/` não encontrada | Repo descontinuado | Usar `evoapicloud/evolution-api` | ~1h |
| 4 | `400 Bad Request` no webhook | Formato v2.x exige `{ webhook: {} }` | Aninhar dados no wrapper | ~1h |
| 5 | Bot enviava mas não respondia | JID com sufixo `1900` na v2.3.0 | Remover sufixo no parser | ~2h |
| 6 | `SSL error: unexpected eof` | PostgreSQL Railway + SSL | Desativar DB externo (`DATABASE_ENABLED=false`) | ~2h |
| 7 | Container crash com `SIGTERM` | Volume com permissão quebrada | Recriar volume | ~1h |
| 8 | Áudio do Deepgram vem vazio | URL direta do WhatsApp CDN é encriptada | Usar `getBase64FromMediaMessage` | ~2h |

### Gemini / Google AI Studio
| # | Erro | Causa | Solução |
|---|---|---|---|
| 9 | Erro 429 "créditos esgotados" em produção | Google mudou de pós-pagamento para pré-pagamento | Adicionar créditos no AI Studio → Faturamento |
| 10 | Latência de 17s por mensagem de áudio | `thinkingBudget` ligado por padrão no 2.5-flash | Setar `thinkingBudget: 0` |
| 11 | Função rodando no Brasil mas APIs nos EUA | `preferredRegion: 'gru1'` errado | Mudar para `'iad1'` (US East) |

### Vercel
| # | Erro | Causa | Solução |
|---|---|---|---|
| 12 | Variável de ambiente não pegou | Mudou no painel mas não fez redeploy | Sempre redeploy após mudar env var |
| 13 | Chave antiga na produção, nova no local | `.env.local` e Vercel com chaves diferentes | Sincronizar ambas |

---

*Documentação consolidada em 03/06/2026. Baseada em ~40h de desenvolvimento e debug ao vivo.*
