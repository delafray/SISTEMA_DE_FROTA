# Setup Evolution API (WhatsApp)

> 📎 Voltar ao [INDEX do Bot](INDEX.md) | [INDEX principal](../INDEX.md)
>
> Fonte completa: [docs/GUIA_APIS_SETUP.md §2](../../docs/GUIA_APIS_SETUP.md)

---

## O que é

API open-source que roda WhatsApp Web via Baileys. Substitui a API oficial da Meta (que exige CNPJ, templates aprovados, e cobra por mensagem).

---

## Pré-requisitos

- Acesso SSH à VM Oracle Cloud (chave `C:\Users\ronal\.ssh\osrm-key.pem`, IP `129.80.27.159`)
- Vercel já com deploy feito (precisa da URL para o webhook). Ver [../03-deploy/vercel.md](../03-deploy/vercel.md)
- Número de celular com chip **SEM WhatsApp instalado** (se tiver, excluir a conta antes: WhatsApp → Configurações → Conta → Excluir minha conta)

---

## Setup passo a passo (Oracle Cloud VM)

> ⚠️ O Railway foi cancelado. A Evolution API agora roda na **VM Oracle Cloud** (`129.80.27.159:8080`)
> co-locada com o OSRM/VROOM. Ver [../03-deploy/migrar-railway-para-oracle.md](../03-deploy/migrar-railway-para-oracle.md) para o guia completo.

### 1. Docker + docker-compose (já instalado na VM)

```bash
ssh ubuntu@129.80.27.159  # usa C:\Users\ronal\.ssh\osrm-key.pem
docker ps  # deve mostrar evolution-api, evolution-db, evolution-redis
```

### `docker-compose.yml` de PRODUÇÃO (v2.3.7 + Postgres + Redis) — config canônica

`/home/ubuntu/evolution/docker-compose.yml` — **este é o stack que roda hoje** (validado 04/06/2026, 0 perda de mensagens):

> ⚠️ **A v2.3.7 EXIGE banco** (`DATABASE_ENABLED=true` + Postgres). `DATABASE_ENABLED=false` **NÃO funciona** nesta versão — entra em loop de migrations ou crasha (bug B32). Postgres + Redis voltaram a ser obrigatórios.

```yaml
services:
  evolution-api:
    image: evoapicloud/evolution-api:v2.3.7   # NUNCA atendai/ (B3)
    container_name: evolution-api
    restart: always
    ports:
      - '8080:8080'
    environment:
      AUTHENTICATION_TYPE: apikey
      AUTHENTICATION_API_KEY: <SUA_EVOLUTION_API_KEY>
      PORT: '8080'
      SERVER_PORT: '8080'
      DATABASE_ENABLED: 'true'              # ⚠️ DEVE ser true na v2.3.7
      DATABASE_PROVIDER: postgresql
      DATABASE_CONNECTION_URI: postgresql://evolution:<SENHA_POSTGRES>@evolution-db:5432/evolution
      CACHE_REDIS_ENABLED: 'true'           # NÃO desligar (retry de decriptação do Baileys)
      CACHE_REDIS_URI: redis://evolution-redis:6379
      CACHE_LOCAL_ENABLED: 'false'
      CONFIG_SESSION_PHONE_CLIENT: Evolution API
      CONFIG_SESSION_PHONE_NAME: Chrome
      QRCODE_LIMIT: '30'
      WEBSOCKET_ENABLED: 'true'
      DEL_INSTANCE: 'false'
      LOG_LEVEL: ERROR
    volumes:
      - evolution_instances:/evolution/instances
    depends_on:
      evolution-db:
        condition: service_healthy
      evolution-redis:
        condition: service_healthy

  evolution-db:
    image: postgres:16-alpine
    container_name: evolution-db
    restart: always
    environment:
      POSTGRES_USER: evolution
      POSTGRES_PASSWORD: <SENHA_POSTGRES>
      POSTGRES_DB: evolution
    volumes:
      - evolution_pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U evolution']
      interval: 5s
      timeout: 5s
      retries: 5

  evolution-redis:
    image: redis:7-alpine
    container_name: evolution-redis
    restart: always
    volumes:
      - evolution_redis:/data
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  evolution_instances:
  evolution_pgdata:
  evolution_redis:
```
```bash
cd /home/ubuntu/evolution && docker compose pull && docker compose up -d && docker compose logs -f
# esperar as migrations Prisma rodarem 1x no Postgres (sem loop) antes de criar a instância
```

> Detalhes da migração histórica Railway→Oracle: [migrar-railway-para-oracle.md](../03-deploy/migrar-railway-para-oracle.md).

---

### ⚠️ Rodando comandos na VM a partir do Windows — use SCP, NÃO cole `curl` no terminal

**Problema recorrente:** colar comandos `curl` com corpo JSON (aspas e `\` escapados) direto no **PowerShell** — seja localmente ou dentro de uma sessão SSH — **corrompe o escape das aspas**. O resultado é JSON malformado → `400 Bad Request` da Evolution, ou pior, um payload silenciosamente errado. Isso já gerou horas de debug falso.

**Regra:** nunca monte `curl` com JSON inline pelo PowerShell. Em vez disso, escolha **um** destes dois caminhos:

1. **Console do navegador (mais simples para 1-2 chamadas)** — usar `fetch(...)` (os blocos `javascript` abaixo). O JS lida com as aspas sem escape de shell.
2. **Script `.sh` + SCP (recomendado para automação / repetição)** — escrever o script localmente e transferir:
   ```powershell
   # No Windows (PowerShell), a partir da raiz do repo:
   scp -i C:\Users\ronal\.ssh\osrm-key.pem home\ubuntu\evolution\recreate.sh ubuntu@129.80.27.159:/home/ubuntu/evolution/
   ssh -i C:\Users\ronal\.ssh\osrm-key.pem ubuntu@129.80.27.159 "bash /home/ubuntu/evolution/recreate.sh"
   ```
   > ⚠️ O `.sh` precisa ter **fim de linha LF (Unix)**, não CRLF — senão o bash da VM falha com `\r`. No editor, salve como LF; ou na VM rode `sed -i 's/\r$//' recreate.sh`.
   > O script `home/ubuntu/evolution/recreate.sh` (neste repo) já traz a criação de instância + webhook + QR prontos.

---

### Configurar instância e webhook

> Os comandos abaixo são colados no **console do navegador** (F12 → aba Console, em qualquer site).
> Substitua `SUA-URL` por `http://129.80.27.159:8080` e `SUA-CHAVE` pela `EVOLUTION_API_KEY`.
> **Não** tente convertê-los para `curl` no PowerShell — ver a armadilha de escape acima.

### Criar instância JÁ COM o webhook embutido (v2.3.7)

> ⚠️ **Na v2.3.7 o endpoint `PUT/POST /webhook/set/{instance}` retorna 404.** O que funciona é passar o webhook **dentro do payload do `POST /instance/create`** (bug B33). Configure tudo de uma vez:

```javascript
// ⚠️ headers.apikey = EVOLUTION_WEBHOOK_SECRET — sem isso o Vercel devolve 401!
fetch('http://129.80.27.159:8080/instance/create', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'apikey': 'SUA-CHAVE' },
  body: JSON.stringify({
    instanceName: 'frota-bot-novo',
    integration: 'WHATSAPP-BAILEYS',
    qrcode: true,
    webhook: {
      url: 'https://sistema-de-frota.vercel.app/api/whatsapp/webhook',
      byEvents: false,
      base64: false,
      events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE', 'QRCODE_UPDATED'],
      headers: { apikey: 'SEU-EVOLUTION_WEBHOOK_SECRET' }  // ← OBRIGATÓRIO
    }
  })
}).then(r => r.json()).then(console.log)
```
Resposta esperada: objeto com `instanceName`, `status` e o QR Code (`qrcode.base64`).

> Na VM já existe `/home/ubuntu/evolution/recreate.sh` que faz isto (instância + webhook + QR) numa tacada — rode `bash recreate.sh`.

> ⚠️ A URL do webhook precisa ser a da **Vercel** (deploy já feito). Se ainda não fez, veja [../03-deploy/vercel.md](../03-deploy/vercel.md) primeiro.

### Gerar QR Code e escanear
```javascript
fetch('http://129.80.27.159:8080/instance/connect/frota-bot-novo', {
  headers: { 'apikey': 'SUA-CHAVE' }
}).then(r => r.json()).then(console.log)
```

1. A resposta traz o QR Code (base64 ou link)
2. No celular do número do bot: **WhatsApp → Aparelhos conectados → Conectar aparelho**
3. Escaneie o QR Code (expira em ~60 segundos!)

### Verificar conexão
```bash
curl -H "apikey: SUA-CHAVE" http://129.80.27.159:8080/instance/connectionState/frota-bot-novo
# Esperado: { "state": "open" } ✅
```

Se vier `"close"` → repita o passo de gerar QR Code de novo.

---

## Variáveis para o .env.local / Vercel

Anote estes 4 valores e configure tanto no `.env.local` local quanto na Vercel:

```env
EVOLUTION_API_URL=http://129.80.27.159:8080        ← IP da VM Oracle Cloud
EVOLUTION_API_KEY=<SUA_EVOLUTION_API_KEY>               ← AUTHENTICATION_API_KEY da Evolution
EVOLUTION_INSTANCE_NAME=frota-bot-novo             ← nome da instância criada
EVOLUTION_WEBHOOK_SECRET=<SEU_WEBHOOK_SECRET> ← deve ser o mesmo valor em webhook.headers.apikey
```

> **EVOLUTION_WEBHOOK_SECRET**: enviado pela Evolution como header `apikey` em cada POST ao webhook. O `security.ts` valida que esse header existe e bate com essa env. **Tem que ser o MESMO valor** no webhook (campo `headers.apikey`) e na Vercel/env.local.

---

## Reconexão (quando bot para de responder)

1. Verificar estado: `GET /instance/connectionState/seu-bot`
2. Se `"state": "close"`:
   - `GET /instance/connect/seu-bot` → escanear QR Code novamente
   - WhatsApp → Aparelhos conectados → Conectar

---

## ⚠️ Armadilhas comuns

| Armadilha | Solução |
|---|---|
| **PowerShell quebra o escape do JSON no `curl`/SSH** | **Não cole `curl` com JSON inline. Use o console do navegador (`fetch`) ou um `.sh` via SCP (LF, não CRLF). Ver seção "Rodando comandos na VM a partir do Windows".** |
| Repo Docker `atendai/` | Usar `evoapicloud/evolution-api:v2.3.7` |
| Evolution v2.2.3 | Atualizar — QR Code não funciona nela |
| **`DATABASE_ENABLED=false` na v2.3.7** | **Crasha / loop de migrations. A v2.3.7 EXIGE `DATABASE_ENABLED=true` + Postgres + Redis (bug B32)** |
| **`PUT/POST /webhook/set` dá 404 na v2.3.7** | **Configurar o webhook DENTRO do payload do `POST /instance/create` (bug B33)** |
| **Webhook sem `headers.apikey`** | **O Vercel devolve 401 `missing-header`. Incluir `headers: { apikey: WEBHOOK_SECRET }` no payload do webhook** |
| Sessões corrompidas (`Bad MAC`/`@lid`) | Reinstalar limpo: apagar volumes `instances`+`pgdata`+`redis` e reparear QR (bug B34) |
| JID com sufixo `1900` | Remover sufixo no `messageParser.ts` |
| Sem volume no Docker | QR Code a cada restart |
| QR Code expirado (60s) | Recriar a instância e gerar novo QR imediatamente |
| Áudio encriptado | Usar `getBase64FromMediaMessage` (ver [audio-e-transcricao.md](audio-e-transcricao.md)) |
| IP da VM sem porta 8080 | OCI Security List **E** `sudo iptables -I INPUT -p tcp --dport 8080 -j ACCEPT` |

---

## Veja também

- [bugs-conhecidos.md](bugs-conhecidos.md) — todos os 27 bugs documentados
- [audio-e-transcricao.md](audio-e-transcricao.md) — download de áudio encriptado
- [../03-deploy/railway.md](../03-deploy/railway.md) — detalhes do Railway
- [../03-deploy/vercel.md](../03-deploy/vercel.md) — deploy na Vercel (precisa fazer ANTES do webhook)
- [../02-apis-e-chaves/env-template.md](../02-apis-e-chaves/env-template.md) — todas as variáveis
