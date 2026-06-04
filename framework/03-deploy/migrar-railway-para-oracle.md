# Migrar Evolution API do Railway → Oracle Cloud (Free Tier)

> 📎 Voltar ao [INDEX de Deploy](INDEX.md) | [INDEX principal](../INDEX.md)

## Por que migrar?

Dois motivos (o segundo é o que motivou esta nota):

1. **Custo:** Railway Hobby ~US$5/mês → Oracle Always Free = R$0.
2. **Latência:** a VM Oracle do OSRM está em **`us-ashburn-1`** — a **MESMA região do Vercel (`iad1`)**. Hoje o Railway adiciona um hop extra. Colocar o Evolution lá deixa os hops **Evolution ↔ Vercel na mesma região** (~1ms) e dá **muito mais CPU/RAM** (4 OCPU/24GB ARM) que o Hobby.

> ⚠️ **Importante:** parte da latência percebida (~6s) é **entrega do Meta/Baileys** (conexão não-oficial) — isso a migração **não** conserta. Ela ataca o Railway lento + o hop de rede. Antes de migrar, **cheque CPU/RAM do Railway**: se estiver no talo → migrar ajuda latência; se estiver folgado → ajuda só custo. Ver [../01-whatsapp-bot/bugs-conhecidos.md](../01-whatsapp-bot/bugs-conhecidos.md) B29.

---

## Decisão: mesma VM (co-locar) vs 2ª VM

O Always Free dá **4 OCPU / 24GB ARM no TOTAL** (somando todas as VMs). A VM#1 (OSRM/VROOM/Overpass) já consome parte disso.

| Opção | Prós | Contras |
|---|---|---|
| **Co-locar na VM#1 (recomendado)** | Não gasta o teto Always Free; hop interno zero; 1 VM pra manter | Disputa RAM com Overpass (faminto) |
| 2ª VM separada | Isola recursos | Pode estourar o teto 4/24 → deixa de ser grátis |

> ⚠️ **Atualização 04/06/2026:** a config "leve" (`DATABASE_ENABLED=false`, sem Redis) descrita originalmente aqui **só valia na v2.3.0**. A versão atual em produção é a **v2.3.7, que EXIGE Postgres + Redis** (`DATABASE_ENABLED=true`). O `docker-compose` canônico está em [../01-whatsapp-bot/setup-evolution.md](../01-whatsapp-bot/setup-evolution.md#docker-composeyml-de-produção). O texto abaixo é o histórico da migração.

A Evolution v2.3.7 sobe **3 containers** (evolution-api + postgres + redis). Cabe na VM#1 **se houver RAM livre** (~1-2GB). Antes de tudo:

```bash
ssh ubuntu@129.80.27.159   # VM#1 (OSRM), us-ashburn-1
free -h          # RAM livre — precisa de ~1-2GB livres pro Evolution
docker ps        # ver o que já roda (osrm, vroom, overpass)
df -h            # disco livre
```

Se sobrar RAM → co-loca (segue abaixo). Se o Overpass estiver comendo quase tudo → crie a 2ª VM (mesmos passos, mas **confirme que cabe no teto 4/24**).

---

## Passo a passo (co-locando na VM#1)

### 1. Abrir a porta — NOS DOIS lugares
Oracle Ubuntu tem **iptables restritivo por padrão**; abrir só no painel não basta.

1. **OCI Console** → Networking → VCN → Security List → Ingress: liberar TCP **8080** (e **443** se usar HTTPS/domínio).
2. **No OS (na VM):**
```bash
sudo iptables -I INPUT -p tcp --dport 8080 -j ACCEPT
sudo iptables -I INPUT -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save   # persistir após reboot
```

### 2. Docker (provavelmente já instalado p/ o OSRM)
```bash
docker --version || { curl -fsSL https://get.docker.com | sh; sudo usermod -aG docker ubuntu; newgrp docker; }
```

### 3. docker-compose — v2.3.7 + Postgres + Redis
> ✅ Imagem `evoapicloud/evolution-api:v2.3.7` (**NUNCA `atendai/`** — bug B2/B3).
> ⚠️ **`DATABASE_ENABLED=true` é obrigatório na v2.3.7** (bug B32). `false` causa loop de migrations/crash. Sobe Postgres + Redis junto.

O `docker-compose.yml` completo e atual está documentado uma única vez (pra não divergir) em **[../01-whatsapp-bot/setup-evolution.md](../01-whatsapp-bot/setup-evolution.md#docker-composeyml-de-produção)**. Copie de lá. Resumo:
- `evolution-api: evoapicloud/evolution-api:v2.3.7` + `DATABASE_ENABLED=true`, `DATABASE_PROVIDER=postgresql`, `CACHE_REDIS_ENABLED=true`, `depends_on` healthcheck.
- `evolution-db: postgres:16-alpine` (volume `evolution_pgdata`).
- `evolution-redis: redis:7-alpine` (volume `evolution_redis`).

```bash
cd /home/ubuntu/evolution && docker compose pull && docker compose up -d && docker compose logs -f
# aguardar as migrations Prisma rodarem 1x no Postgres limpo (sem loop)
```

### 4. HTTPS — recomendado (não é opcional)
Expor em `http://IP:8080` puro **vaza a apikey** e deixa o `/manager` aberto. Use **Caddy** (Let's Encrypt automático) com um subdomínio (ex.: `evo.seudominio.com` apontando pro IP da VM):
```bash
sudo apt install -y caddy
# /etc/caddy/Caddyfile:
#   evo.seudominio.com {
#     reverse_proxy localhost:8080
#   }
sudo systemctl restart caddy
```
Sem domínio? No mínimo **restrinja o iptables 8080 ao IP de saída do Vercel** e troque a apikey por uma forte. Mas o ideal é HTTPS+domínio.

### 5. Recriar instância + **RECONFIGURAR O WEBHOOK** (passo crítico!)
> ⚠️ Sem refazer o webhook, o bot fica **MUDO** (não recebe mensagem). Use o **mesmo nome de instância** de antes (`EVOLUTION_INSTANCE_NAME`).

No console do navegador (troque URL/chave/nome):
```javascript
// a) criar instância JÁ COM o webhook embutido (v2.3.7 — /webhook/set dá 404, ver B33)
fetch('https://evo.seudominio.com/instance/create', {
  method:'POST', headers:{'Content-Type':'application/json','apikey':'SUA_CHAVE'},
  body: JSON.stringify({
    instanceName:'seu-bot', integration:'WHATSAPP-BAILEYS', qrcode:true,
    webhook:{
      url:'https://SEU-APP.vercel.app/api/whatsapp/webhook',
      byEvents:false, base64:false,
      events:['MESSAGES_UPSERT','CONNECTION_UPDATE','QRCODE_UPDATED'],
      headers:{ apikey:'SEU_WEBHOOK_SECRET' }   // sem isso o Vercel dá 401
    }
  })
}).then(r=>r.json()).then(console.log)

// b) gerar QR e escanear (se não veio no create acima)
fetch('https://evo.seudominio.com/instance/connect/seu-bot', { headers:{'apikey':'SUA_CHAVE'} }).then(r=>r.json()).then(console.log)
```
Detalhes em [../01-whatsapp-bot/setup-evolution.md](../01-whatsapp-bot/setup-evolution.md).

### 6. Atualizar as env vars na Vercel (as 4) + redeploy
```
EVOLUTION_API_URL=https://evo.seudominio.com   (ou http://IP:8080)
EVOLUTION_API_KEY=<a mesma chave>
EVOLUTION_INSTANCE_NAME=seu-bot
EVOLUTION_WEBHOOK_SECRET=<o mesmo de antes>
```
> **SEMPRE redeploy** após mudar env na Vercel (bug B12).

### 7. Validar ANTES de mexer no Railway
- `GET /instance/connectionState/seu-bot` → `"state":"open"`
- Manda um "oi" no zap → bot responde.
- Logs do Vercel: `message_processed` sem erro.

### 8. Só então desligar o Railway
> ⚠️ **NUNCA rode Railway + Oracle com o MESMO número ao mesmo tempo** — duas conexões Baileys no mesmo número = conflito e risco de **ban**. Re-parear o QR na VM **já derruba** a sessão do Railway; confirme que a VM está `open` e só depois delete o serviço no Railway.

---

## Confiabilidade (Always Free)

A Oracle **recupera instâncias Always Free ociosas**. Pra um gateway de produção:
- Rodando 24/7 (OSRM + Evolution) a VM fica ativa → menor risco.
- **Recomendado:** fazer upgrade pra **Pay-As-You-Go** — mantém o Always Free, só adiciona cartão, e **tira o risco de recuperação**. Em uso dentro do free tier você paga ~R$0.

---

## Checklist de validação

- [ ] `free -h` confirmou RAM livre antes de co-locar
- [ ] Porta 8080/443 aberta no **OCI Security List E no iptables do OS**
- [ ] Imagem `evoapicloud/evolution-api:v2.3.7` (não `atendai/`)
- [ ] `DATABASE_ENABLED=true` + Postgres + Redis (3 containers; B32)
- [ ] HTTPS via Caddy + domínio (ou iptables restrito)
- [ ] **Webhook embutido no `POST /instance/create`** apontando pro Vercel (não `/webhook/set` — B33)
- [ ] 4 env vars atualizadas na Vercel + **redeploy**
- [ ] `connectionState` = `open` e bot respondeu ANTES de desligar o Railway
- [ ] Railway desligado só após validar (sem número duplicado)

---

## Custo final

| Serviço | Custo |
|---|---|
| Oracle Cloud VM (co-locado com OSRM) | **Grátis** (Always Free; PAYG ~R$0) |
| Railway | **$0** (cancelado) |
| **Total** | **R$ 0,00** |

---

*Atualizado: 04/06/2026 — Evolution migrada para **v2.3.7 + Postgres + Redis** (`DATABASE_ENABLED=true`, B32); webhook embutido no `/instance/create` (B33); reinstalação limpa resolveu a intermitência de `@lid` (B34). Compose canônico em setup-evolution.md.*
