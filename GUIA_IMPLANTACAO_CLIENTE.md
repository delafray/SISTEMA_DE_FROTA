# Guia Completo de Implantação para Novo Cliente
## Sistema de Gestão de Frota

> **Para usar este guia:** leia do início ao fim antes de começar. Siga a ordem exata.
> Tempo total estimado: **1 tarde** (exceto Oracle Cloud que fica rodando em background).

---

## O que você vai criar

| # | Serviço | Tempo | Custo |
|---|---|---|---|
| 1 | Supabase (banco de dados) | 5 min | Grátis |
| 2 | Cloudflare R2 (armazenamento) | 10 min | Grátis |
| 3 | GitHub (repositório) | 5 min | Grátis |
| 4 | Railway + Evolution API (WhatsApp) | 10 min | Grátis |
| 5 | Vercel (sistema web) | 10 min | Grátis |
| 6 | Sentry (monitoramento) | 5 min | Grátis |
| 7 | OpenAI (IA) | 5 min | ~R$5-20/mês |
| 8 | Oracle Cloud (roteirização) | Background | Grátis |
| 9 | Configurar WhatsApp Bot | 10 min | Grátis |
| 10 | Cadastrar empresa no sistema | 10 min | — |

---

## O que a empresa-cliente precisa providenciar

Peça antes de começar:

| Item | Para que serve |
|---|---|
| **Número de celular com chip, SEM WhatsApp** | O número do bot |
| **Lista de motoristas** (nome + celular) | Cadastro no sistema |
| **Lista de veículos** (placa + modelo) | Cadastro no sistema |
| **Logo e nome da empresa** | Configuração visual |

> ⚠️ O número do bot **não pode ter WhatsApp já instalado**. Se tiver, o cliente precisa excluir a conta antes (WhatsApp → Configurações → Conta → Excluir minha conta).

---

## Passo 1 — Supabase (Banco de Dados)

**Onde:** https://supabase.com

1. Crie uma conta (ou logue) → **New Project**
2. Nome: `frota-[nome-cliente]` (ex: `frota-claudio`)
3. Gere uma senha forte para o banco → anote
4. Região: **East US (North Virginia)** — melhor para o Brasil
5. Aguarde criar (~2 minutos)
6. Vá em **Settings → API** e anote:

```
NEXT_PUBLIC_SUPABASE_URL = https://XXXX.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY = eyJhbG...
SUPABASE_SERVICE_ROLE_KEY = eyJhbG...  ← NUNCA exponha este!
```

7. Vá em **SQL Editor** e execute as migrations do projeto:
   - Abra o arquivo `supabase/migrations/` do repositório
   - Copie e execute cada arquivo `.sql` em ordem

---

## Passo 2 — Cloudflare R2 (Fotos e Documentos)

**Onde:** https://cloudflare.com

1. Crie conta (ou logue) → **R2 Object Storage → Create Bucket**
2. Nome do bucket: `frota-storage`
3. Região: Automatic
4. Vá em **R2 → Manage R2 API Tokens → Create API Token**
   - Permissão: **Object Read & Write**
   - Bucket: selecione `frota-storage`
5. Anote:

```
R2_ACCOUNT_ID = (Account ID na página inicial do Cloudflare)
R2_ACCESS_KEY_ID = (gerado no token)
R2_SECRET_ACCESS_KEY = (gerado no token — só aparece uma vez!)
R2_BUCKET_NAME = frota-storage
```

6. Ative o **Domínio público** do bucket:
   - R2 → frota-storage → Settings → Public Access → Allow
   - Anote a URL pública:

```
R2_PUBLIC_URL = https://pub-XXXX.r2.dev
```

---

## Passo 3 — GitHub (Repositório)

**Onde:** https://github.com

1. Logue com sua conta GitHub
2. Acesse o repositório original do Sistema de Frota
3. Clique em **Fork** → crie um fork na conta do cliente (ou na sua própria, com nome diferente)
4. O fork vai ser usado pela Vercel para deploy automático

> Alternativa: crie um repositório novo e faça `git push` do código para ele.

---

## Passo 4 — Railway + Evolution API (WhatsApp Bot)

**Onde:** https://railway.app

> ⚠️ **ATENÇÃO:** Use SEMPRE `evoapicloud/evolution-api:v2.3.0`
> NUNCA use `atendai/evolution-api` — esse repositório foi descontinuado e tem bugs graves.

1. Crie conta (ou logue) → **New Project**
2. Escolha **Deploy a Docker Image**
3. Digite exatamente: `evoapicloud/evolution-api:v2.3.0`
4. Clique em **Deploy**
5. Aguarde o container ficar verde (~2 minutos)
6. Vá em **Settings → Variables** e adicione:

```
AUTHENTICATION_TYPE = apikey
AUTHENTICATION_API_KEY = [crie uma chave secreta, ex: frota-cliente-2026]
PORT = 8080
SERVER_PORT = 8080
DATABASE_ENABLED = false
DEL_INSTANCE = false
LOG_LEVEL = ERROR
```

7. Vá em **Settings → Networking** e anote a URL pública:

```
EVOLUTION_API_URL = https://evolution-api-XXXX.up.railway.app
EVOLUTION_API_KEY = [o mesmo valor de AUTHENTICATION_API_KEY]
EVOLUTION_INSTANCE_NAME = frota-bot
EVOLUTION_WEBHOOK_SECRET = [crie outro segredo, ex: webhook-secret-2026]
```

8. Crie o volume para persistir sessões:
   - **Volumes → Add Volume**
   - Mount Path: `/evolution/instances`

---

## Passo 5 — OpenAI (Inteligência Artificial)

**Onde:** https://platform.openai.com

1. Crie conta (ou logue)
2. Vá em **API Keys → Create new secret key**
3. Nome: `frota-[nome-cliente]`
4. Anote:

```
OPENAI_API_KEY = sk-proj-...  ← NUNCA exponha este!
```

> Configure um limite de gasto mensal em **Billing → Usage Limits** para evitar surpresas.

---

## Passo 6 — Sentry (Monitoramento de Erros)

**Onde:** https://sentry.io

1. Crie conta (ou logue) → **Create Project**
2. Plataforma: **Next.js**
3. Nome: `frota-[nome-cliente]`
4. Anote:

```
NEXT_PUBLIC_SENTRY_DSN = https://XXXX@oXXXX.ingest.sentry.io/XXXX
```

5. Vá em **Settings → Auth Tokens → Create New Token**
6. Anote:

```
SENTRY_AUTH_TOKEN = sntrys_...
```

---

## Passo 7 — Vercel (Sistema Web)

**Onde:** https://vercel.com

1. Crie conta (ou logue) → **Add New Project**
2. Selecione **Import Git Repository** → escolha o fork do GitHub (Passo 3)
3. Framework: **Next.js** (detectado automaticamente)
4. Antes de fazer o primeiro deploy, vá em **Environment Variables** e adicione TODAS as variáveis:

```env
# ── Supabase ──────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=https://XXXX.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbG...
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...

# ── Cloudflare R2 ─────────────────────────
R2_ACCOUNT_ID=XXXX
R2_ACCESS_KEY_ID=XXXX
R2_SECRET_ACCESS_KEY=XXXX
R2_BUCKET_NAME=frota-storage
R2_PUBLIC_URL=https://pub-XXXX.r2.dev

# ── Evolution API / WhatsApp ──────────────
EVOLUTION_API_URL=https://evolution-api-XXXX.up.railway.app
EVOLUTION_API_KEY=frota-cliente-2026
EVOLUTION_INSTANCE_NAME=frota-bot
EVOLUTION_WEBHOOK_SECRET=webhook-secret-2026

# ── OpenAI ────────────────────────────────
OPENAI_API_KEY=sk-proj-...

# ── Sentry ────────────────────────────────
NEXT_PUBLIC_SENTRY_DSN=https://XXXX@oXXXX.ingest.sentry.io/XXXX
SENTRY_AUTH_TOKEN=sntrys_...

# ── Roteirização (preencher após Passo 8) ──
NOMINATIM_URL=https://nominatim.openstreetmap.org
VIACEP_URL=https://viacep.com.br/ws
# OSRM_URL=http://[IP-ORACLE]:5000   ← preencher quando VM Oracle criar
# VROOM_URL=http://[IP-ORACLE]:3000  ← preencher quando VM Oracle criar
```

5. Clique **Deploy**
6. Aguarde o build (~3 minutos)
7. Anote a URL do sistema:

```
URL do sistema = https://frota-XXXX.vercel.app
```

> ⚠️ Toda vez que mudar uma variável na Vercel: **Deployments → último → ⋯ → Redeploy**.

---

## Passo 8 — Oracle Cloud (Roteirização — Roda em Background)

> Esta etapa fica rodando sozinha. Pode continuar o Passo 9 em paralelo.

**Onde:** https://www.oracle.com/cloud/free/

1. Crie conta na Oracle com cartão de crédito (não cobra — só verificação)
2. Região: **US East (Ashburn)** — libera capacidade mais rápido que São Paulo
3. Configure o OCI CLI no seu computador:
   - Instale: https://docs.oracle.com/iaas/Content/API/SDKDocs/cliinstall.htm
   - Configure: `oci setup config`
4. Execute o script de criação automática da VM (arquivo `criar_vm_osrm.ps1`):

```powershell
Set-ExecutionPolicy Bypass -Scope Process -Force
& "C:\Users\[seu-usuario]\criar_vm_osrm.ps1"
```

5. **Deixe rodando.** O script tenta a cada 30s até conseguir capacidade.
   - Ashburn: normalmente consegue em minutos a horas
   - São Paulo: pode levar dias (muito disputado)

6. Quando criar, o IP fica salvo em `C:\Users\[seu-usuario]\vm_ip.txt`

7. Com o IP em mãos, conecte via SSH e instale OSRM + VROOM:

```bash
ssh -i ~/.ssh/osrm-key.pem ubuntu@[IP-DA-VM]

# Instalar Docker
curl -fsSL https://get.docker.com | sudo bash
sudo usermod -aG docker ubuntu && newgrp docker

# Baixar mapa do Brasil (~3GB)
mkdir -p ~/osrm-data && cd ~/osrm-data
wget https://download.geofabrik.de/south-america/brazil-latest.osm.pbf

# Processar mapa (30-90 min — só 1 vez)
docker run --rm -t -v "${PWD}:/data" ghcr.io/project-osrm/osrm-backend \
  osrm-extract -p /opt/car.lua /data/brazil-latest.osm.pbf

docker run --rm -t -v "${PWD}:/data" ghcr.io/project-osrm/osrm-backend \
  osrm-partition /data/brazil-latest.osrm

docker run --rm -t -v "${PWD}:/data" ghcr.io/project-osrm/osrm-backend \
  osrm-customize /data/brazil-latest.osrm

# Subir OSRM + VROOM com Docker Compose
mkdir -p ~/routing && cat > ~/routing/docker-compose.yml << 'EOF'
services:
  osrm:
    image: ghcr.io/project-osrm/osrm-backend
    container_name: osrm
    restart: unless-stopped
    ports:
      - "5000:5000"
    volumes:
      - ~/osrm-data:/data
    command: osrm-routed --algorithm mld --max-table-size 10000 /data/brazil-latest.osrm

  vroom:
    image: vroomvrp/vroom-docker:latest
    container_name: vroom
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - VROOM_ROUTER=osrm
      - VROOM_HOST_osrmCar=osrm
      - VROOM_PORT_osrmCar=5000
    depends_on:
      - osrm
EOF

cd ~/routing && docker compose up -d
```

8. Libere as portas no firewall Oracle:
   - Console Oracle → Networking → VCN → Security List → Add Ingress Rules
   - Porta 5000 (OSRM) e 3000 (VROOM): TCP, origem 0.0.0.0/0

9. Atualize as variáveis na Vercel:
   ```
   OSRM_URL = http://[IP-DA-VM]:5000
   VROOM_URL = http://[IP-DA-VM]:3000
   ```
   → Redeploy na Vercel

10. Configure o keep-alive para evitar que Oracle recupere a VM:

```bash
sudo tee /opt/keepalive.sh > /dev/null << 'EOF'
#!/bin/bash
curl -s "http://localhost:5000/route/v1/driving/-46.6333,-23.5505;-46.6500,-23.5610?overview=false" > /dev/null
EOF
sudo chmod +x /opt/keepalive.sh
(crontab -l 2>/dev/null; echo "0 */6 * * * /opt/keepalive.sh") | crontab -
```

---

## Passo 9 — Configurar WhatsApp Bot

Com a Vercel já no ar (Passo 7), configure o bot:

### 9.1 Criar a instância do bot

Cole no console do navegador (F12 → Console):

```javascript
fetch('https://evolution-api-XXXX.up.railway.app/instance/create', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'apikey': 'frota-cliente-2026'
  },
  body: JSON.stringify({
    instanceName: 'frota-bot',
    integration: 'WHATSAPP-BAILEYS'
  })
}).then(r => r.json()).then(console.log)
```

### 9.2 Configurar o webhook

```javascript
fetch('https://evolution-api-XXXX.up.railway.app/webhook/set/frota-bot', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'apikey': 'frota-cliente-2026'
  },
  body: JSON.stringify({
    webhook: {
      url: 'https://frota-XXXX.vercel.app/api/whatsapp/webhook',
      enabled: true,
      events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE', 'QRCODE_UPDATED'],
      webhookByEvents: false
    }
  })
}).then(r => r.json()).then(console.log)
```

### 9.3 Gerar QR Code e conectar

```javascript
fetch('https://evolution-api-XXXX.up.railway.app/instance/connect/frota-bot', {
  headers: { 'apikey': 'frota-cliente-2026' }
}).then(r => r.json()).then(console.log)
```

### 9.4 Escanear com o celular do cliente

1. Abra o WhatsApp no celular do número do bot
2. Vá em **Aparelhos conectados → Conectar aparelho**
3. Escaneie o QR Code que apareceu no console
4. Verifique o estado:

```javascript
fetch('https://evolution-api-XXXX.up.railway.app/instance/connectionState/frota-bot', {
  headers: { 'apikey': 'frota-cliente-2026' }
}).then(r => r.json()).then(console.log)
// Esperado: { "state": "open" } ✅
```

---

## Passo 10 — Cadastrar Empresa no Sistema

Com o sistema no ar:

1. Acesse `https://frota-XXXX.vercel.app`
2. Faça login como admin
3. Vá em **/empresas/novo** e cadastre a empresa do cliente
4. Anote o `empresa_id` gerado (UUID)
5. Vá em **/motoristas/novo** e cadastre cada motorista:
   - Nome completo
   - Celular com DDD e 9 dígito (ex: `5531987654321`)
   - `ativo = true`
6. Vá em **/veiculos/novo** e cadastre cada veículo:
   - Placa, modelo, ano
   - `ativo = true`

---

## Passo 11 — Teste Final

Envie uma mensagem de teste para o número do bot e verifique:

```
✅ Bot recebe "Oi"
✅ Bot identifica o motorista pelo número
✅ Bot responde com a lista de veículos
✅ Motorista seleciona veículo → recebe o menu
✅ Motorista testa "Informar KM" → manda foto → IA lê odômetro
```

---

## Checklist Completo de Entrega

```
INFRAESTRUTURA
[ ] Supabase criado e migrations executadas
[ ] Cloudflare R2 criado com URL pública habilitada
[ ] GitHub: fork do repositório criado
[ ] Railway: Evolution API v2.3.0 rodando (evoapicloud/)
[ ] Vercel: deploy bem-sucedido (sem erros de build)
[ ] Sentry: projeto criado e DSN configurado
[ ] OpenAI: API key configurada com limite de gasto

WHATSAPP BOT
[ ] Instância "frota-bot" criada na Evolution API
[ ] Webhook configurado apontando para URL correta da Vercel
[ ] QR Code escaneado com celular do cliente
[ ] Estado do bot: "open"
[ ] Teste de mensagem: bot recebeu e respondeu

SISTEMA
[ ] Empresa cadastrada no sistema
[ ] Pelo menos 1 motorista cadastrado e ativo
[ ] Pelo menos 1 veículo cadastrado e ativo
[ ] Teste completo: motorista → veículo → menu → KM/foto → IA lê

ROTEIRIZAÇÃO (pode entregar depois)
[ ] Oracle Cloud VM criada
[ ] OSRM instalado e processando mapa do Brasil
[ ] VROOM instalado
[ ] Variáveis OSRM_URL e VROOM_URL atualizadas na Vercel
[ ] Keep-alive configurado na VM
[ ] Teste: rota calculada com sucesso

DOCUMENTAÇÃO PARA O CLIENTE
[ ] Entregar senha de acesso ao dashboard
[ ] Explicar como reconectar o QR Code se desconectar
[ ] Entregar número do suporte para problemas
```

---

## Armadilhas Conhecidas — NÃO REPITA!

| ❌ NÃO fazer | ✅ Fazer |
|---|---|
| `atendai/evolution-api` | `evoapicloud/evolution-api:v2.3.0` |
| Evolution API v2.2.3 | v2.3.0 ou superior |
| `{url: '...', events: [...]}` no webhook | `{webhook: {url: '...', events: [...]}}` |
| PostgreSQL interno do Railway | Supabase (SSL estável, zero problema) |
| Container sem volume | Criar volume `/evolution/instances` |
| Mudar variável na Vercel sem redeploy | Sempre fazer Redeploy após mudar variável |
| Número de WhatsApp com conta existente | Número limpo (excluir conta antes) |

---

## Reconexão do WhatsApp (ensinar ao cliente)

Se o bot parar de responder, verificar o estado:

```javascript
// Cole no console do navegador (qualquer site)
fetch('https://evolution-api-XXXX.up.railway.app/instance/connectionState/frota-bot', {
  headers: { 'apikey': 'frota-cliente-2026' }
}).then(r => r.json()).then(console.log)
```

- `"state": "open"` → bot funcionando ✅
- `"state": "close"` → precisa reconectar:
  1. Gerar novo QR Code: `GET /instance/connect/frota-bot`
  2. WhatsApp → Aparelhos conectados → Conectar aparelho → Escanear

---

## Custos Mensais

| Serviço | Custo |
|---|---|
| Supabase | R$ 0 |
| Cloudflare R2 | R$ 0 (até 10GB) |
| Railway | R$ 0 (free tier) |
| Vercel | R$ 0 (free tier) |
| Sentry | R$ 0 (free tier) |
| Oracle Cloud | R$ 0 (Always Free) |
| ViaCEP, Nominatim, Waze, Google Maps | R$ 0 |
| **OpenAI GPT-4o** | **~R$ 5-20/mês** |
| **TOTAL** | **~R$ 5-20/mês** |

---

## Referências

- [WHATSAPP_BOT_SETUP.md](./WHATSAPP_BOT_SETUP.md) — Histórico completo de erros e soluções do bot
- [ORACLE_CLOUD_SETUP.md](./ORACLE_CLOUD_SETUP.md) — Configuração detalhada da VM Oracle
- [PLANO_ROTEIRIZACAO.md](./PLANO_ROTEIRIZACAO.md) — Plano completo de roteirização
- [MAPA_APIS.md](./MAPA_APIS.md) — Mapa de todas as APIs e serviços
- [ONBOARDING.md](./ONBOARDING.md) — Guia de cadastro de empresa no sistema

---

*Criado em 27/05/2026*
