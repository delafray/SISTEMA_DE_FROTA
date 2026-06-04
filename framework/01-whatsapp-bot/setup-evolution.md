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

> Se precisar subir do zero, ver [migrar-railway-para-oracle.md](../03-deploy/migrar-railway-para-oracle.md).

---

### Configurar instância e webhook

> Os comandos abaixo são colados no **console do navegador** (F12 → aba Console, em qualquer site).
> Substitua `SUA-URL` por `http://129.80.27.159:8080` e `SUA-CHAVE` pela `EVOLUTION_API_KEY`.

### Criar instância do bot
```javascript
fetch('http://129.80.27.159:8080/instance/create', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'apikey': 'SUA-CHAVE' },
  body: JSON.stringify({ instanceName: 'frota-bot-novo', integration: 'WHATSAPP-BAILEYS' })
}).then(r => r.json()).then(console.log)
```
Resposta esperada: objeto com `instanceName` e `status`.

### Configurar webhook (**com header apikey — obrigatório para autenticar!**)
```javascript
// ⚠️ FORMATO v2.x: dados DENTRO de { webhook: {} } — sem isso dá 400!
// ⚠️ INCLUA headers.apikey = EVOLUTION_WEBHOOK_SECRET — sem isso dá 401 no Vercel!
fetch('http://129.80.27.159:8080/webhook/set/frota-bot-novo', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'apikey': 'SUA-CHAVE' },
  body: JSON.stringify({
    webhook: {
      url: 'https://seu-app.vercel.app/api/whatsapp/webhook',
      enabled: true,
      events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE', 'QRCODE_UPDATED'],
      webhookByEvents: false,
      headers: { apikey: 'SEU-EVOLUTION_WEBHOOK_SECRET' }  // ← ESTE CAMPO É OBRIGATÓRIO!
    }
  })
}).then(r => r.json()).then(console.log)
```

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
EVOLUTION_API_KEY=frota-evo-key-2026               ← AUTHENTICATION_API_KEY da Evolution
EVOLUTION_INSTANCE_NAME=frota-bot-novo             ← nome da instância criada
EVOLUTION_WEBHOOK_SECRET=frota-webhook-secret-2026 ← deve ser o mesmo valor em webhook.headers.apikey
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
| Repo Docker `atendai/` | Usar `evoapicloud/evolution-api:v2.3.0` |
| Evolution v2.2.3 | Atualizar — QR Code não funciona nela |
| Webhook sem `{ webhook: {} }` | Aninhar dados em `webhook: {}` (formato v2.x) |
| **Webhook sem `headers.apikey`** | **O Vercel devolve 401 `missing-header`. Incluir `headers: { apikey: WEBHOOK_SECRET }` no `/webhook/set`** |
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
