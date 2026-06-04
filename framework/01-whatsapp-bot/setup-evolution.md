# Setup Evolution API (WhatsApp)

> 📎 Voltar ao [INDEX do Bot](INDEX.md) | [INDEX principal](../INDEX.md)
>
> Fonte completa: [docs/GUIA_APIS_SETUP.md §2](../../docs/GUIA_APIS_SETUP.md)

---

## O que é

API open-source que roda WhatsApp Web via Baileys. Substitui a API oficial da Meta (que exige CNPJ, templates aprovados, e cobra por mensagem).

---

## Pré-requisitos

- Conta no Railway (railway.app → Sign Up com conta GitHub)
- Vercel já com deploy feito (precisa da URL para o webhook). Ver [../03-deploy/vercel.md](../03-deploy/vercel.md)
- Número de celular com chip **SEM WhatsApp instalado** (se tiver, excluir a conta antes: WhatsApp → Configurações → Conta → Excluir minha conta)

---

## Setup passo a passo (Railway)

### 1. Criar projeto no Railway
1. Acesse **railway.app** → logue com GitHub
2. **New Project → Deploy a Docker Image**
3. **Imagem:** `evoapicloud/evolution-api:v2.3.0`

> ⚠️ **NUNCA usar `atendai/evolution-api`** — repositório descontinuado, máximo v2.2.3 que tem bug do QR Code!

### 2. Configurar variáveis
Vá em **Variables** (ícone de variáveis no painel do serviço) e adicione:
```
AUTHENTICATION_TYPE=apikey
AUTHENTICATION_API_KEY=sua-chave-segura-aqui    ← INVENTE uma chave forte (ex: minha-frota-2026-x7k)
PORT=8080
SERVER_PORT=8080
DATABASE_ENABLED=false
DEL_INSTANCE=false
LOG_LEVEL=ERROR
```

### 3. Ativar URL pública
1. Clique no serviço → **Settings → Networking**
2. Clique em **Generate Domain** (ou "Public Networking")
3. Anote a URL gerada (ex: `https://evolution-api-production-ab12.up.railway.app`)

### 4. Criar volume de persistência
1. **Settings → Volumes → Add Volume**
2. Mount Path: `/evolution/instances`
3. Sem volume = QR Code precisa ser escaneado a cada restart!

### 5. Aguardar deploy ficar verde (~2 minutos)

---

## Configurar instância e webhook

> Os comandos abaixo são colados no **console do navegador** (F12 → aba Console, em qualquer site).
> Substitua `SUA-URL-RAILWAY` e `SUA-CHAVE` pelos valores dos passos acima.

### 6. Criar instância do bot
```javascript
fetch('https://SUA-URL-RAILWAY/instance/create', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'apikey': 'SUA-CHAVE' },
  body: JSON.stringify({ instanceName: 'seu-bot', integration: 'WHATSAPP-BAILEYS' })
}).then(r => r.json()).then(console.log)
```
Resposta esperada: objeto com `instanceName` e `status`.

### 7. Configurar webhook
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

> ⚠️ A URL do webhook precisa ser a da **Vercel** (deploy já feito). Se ainda não fez, veja [../03-deploy/vercel.md](../03-deploy/vercel.md) primeiro.

### 8. Gerar QR Code e escanear
```javascript
fetch('https://SUA-URL-RAILWAY/instance/connect/seu-bot', {
  headers: { 'apikey': 'SUA-CHAVE' }
}).then(r => r.json()).then(console.log)
```

1. A resposta traz o QR Code (base64 ou link)
2. No celular do número do bot: **WhatsApp → Aparelhos conectados → Conectar aparelho**
3. Escaneie o QR Code

### 9. Verificar conexão
```bash
curl -H "apikey: SUA-CHAVE" https://SUA-URL-RAILWAY/instance/connectionState/seu-bot
# Esperado: { "state": "open" } ✅
```

Se vier `"close"` → repita o passo 8 (gerar QR Code de novo).

---

## Variáveis para o .env.local / Vercel

Anote estes 4 valores e configure tanto no `.env.local` local quanto na Vercel:

```env
EVOLUTION_API_URL=https://evolution-api-production-XXXX.up.railway.app   ← URL do passo 3
EVOLUTION_API_KEY=sua-chave-segura-aqui                                  ← mesma do passo 2
EVOLUTION_INSTANCE_NAME=seu-bot                                          ← nome do passo 6
EVOLUTION_WEBHOOK_SECRET=segredo-do-webhook                              ← valor ARBITRÁRIO que você inventa
```

> **EVOLUTION_WEBHOOK_SECRET**: você inventa esse valor (ex: `wh-secret-frota-2026`). O código do webhook valida que as mensagens recebidas têm esse secret no header. Configure o **mesmo valor** na Vercel e no código.

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
| Repo Docker `atendai/` | Usar `evoapicloud/evolution-api:v2.3.0` |
| Evolution v2.2.3 | Atualizar — QR Code não funciona nela |
| Webhook sem `{ webhook: {} }` | Aninhar dados em `webhook: {}` (formato v2.x) |
| JID com sufixo `1900` | Remover sufixo no `messageParser.ts` |
| Sem volume no Railway | QR Code a cada restart |
| Áudio encriptado | Usar `getBase64FromMediaMessage` (ver [audio-e-transcricao.md](audio-e-transcricao.md)) |
| URL pública não aparece | Settings → Networking → Generate Domain |

---

## Veja também

- [bugs-conhecidos.md](bugs-conhecidos.md) — todos os 27 bugs documentados
- [audio-e-transcricao.md](audio-e-transcricao.md) — download de áudio encriptado
- [../03-deploy/railway.md](../03-deploy/railway.md) — detalhes do Railway
- [../03-deploy/vercel.md](../03-deploy/vercel.md) — deploy na Vercel (precisa fazer ANTES do webhook)
- [../02-apis-e-chaves/env-template.md](../02-apis-e-chaves/env-template.md) — todas as variáveis
