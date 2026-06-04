# Setup Evolution API (WhatsApp)

> 📎 Voltar ao [INDEX do Bot](INDEX.md) | [INDEX principal](../INDEX.md)
>
> Fonte completa: [docs/GUIA_APIS_SETUP.md §2](../../docs/GUIA_APIS_SETUP.md)

---

## O que é

API open-source que roda WhatsApp Web via Baileys. Substitui a API oficial da Meta (que exige CNPJ, templates aprovados, e cobra por mensagem).

---

## Setup rápido (Railway)

### 1. Criar projeto no Railway
- railway.app → New Project → Deploy a Docker Image
- **Imagem:** `evoapicloud/evolution-api:v2.3.0`
- ⚠️ **NUNCA usar `atendai/evolution-api`** — descontinuado, bugs graves!

### 2. Variáveis no Railway
```
AUTHENTICATION_TYPE=apikey
AUTHENTICATION_API_KEY=sua-chave-segura-aqui
PORT=8080
SERVER_PORT=8080
DATABASE_ENABLED=false
DEL_INSTANCE=false
LOG_LEVEL=ERROR
```

### 3. Volume de persistência
- Settings → Volumes → Mount Path: `/evolution/instances`
- Sem volume = QR Code a cada restart!

### 4. Criar instância (console do navegador)
```javascript
fetch('https://SUA-URL-RAILWAY/instance/create', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'apikey': 'SUA-CHAVE' },
  body: JSON.stringify({ instanceName: 'seu-bot', integration: 'WHATSAPP-BAILEYS' })
}).then(r => r.json()).then(console.log)
```

### 5. Configurar webhook
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

### 6. QR Code
```javascript
fetch('https://SUA-URL-RAILWAY/instance/connect/seu-bot', {
  headers: { 'apikey': 'SUA-CHAVE' }
}).then(r => r.json()).then(console.log)
```
Escanear com WhatsApp → Aparelhos conectados → Conectar aparelho

### 7. Verificar conexão
```bash
curl -H "apikey: SUA-CHAVE" https://SUA-URL-RAILWAY/instance/connectionState/seu-bot
# Esperado: { "state": "open" }
```

---

## Variáveis para .env.local

```env
EVOLUTION_API_URL=https://evolution-api-production-XXXX.up.railway.app
EVOLUTION_API_KEY=sua-chave-segura-aqui
EVOLUTION_INSTANCE_NAME=seu-bot
EVOLUTION_WEBHOOK_SECRET=segredo-do-webhook
```

---

## Reconexão (quando bot para de responder)

1. Verificar estado: `GET /instance/connectionState/seu-bot`
2. Se `"state": "close"`:
   - `GET /instance/connect/seu-bot` → escanear QR Code novamente
   - WhatsApp → Aparelhos conectados → Conectar

---

## Veja também

- [bugs-conhecidos.md](bugs-conhecidos.md) — armadilhas da Evolution API (B1-B8)
- [audio-e-transcricao.md](audio-e-transcricao.md) — download de áudio encriptado
- [../03-deploy/railway.md](../03-deploy/railway.md) — detalhes do Railway
