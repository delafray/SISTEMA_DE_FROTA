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

**Evolution roda LEVE** (`DATABASE_ENABLED=false`, sem Redis — só Node+Baileys + volume). Cabe bem na VM#1 **se houver RAM livre**. Antes de tudo:

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

### 3. docker-compose — MESMA config que funciona no Railway
> ✅ Imagem `evoapicloud/evolution-api:v2.3.0` (**NUNCA `atendai/`** — bug B2/B3).
> ✅ `DATABASE_ENABLED=false` (igual ao Railway — evita o B6 SSL e não sobrecarrega o Supabase). **Não** precisa de Postgres nem Redis.

`/home/ubuntu/evolution/docker-compose.yml`:
```yaml
services:
  evolution-api:
    image: evoapicloud/evolution-api:v2.3.0
    container_name: evolution-api
    restart: always
    ports:
      - "8080:8080"
    environment:
      AUTHENTICATION_TYPE: apikey
      AUTHENTICATION_API_KEY: SUA_CHAVE_GLOBAL   # a MESMA do Railway (reusa o EVOLUTION_API_KEY)
      PORT: 8080
      SERVER_PORT: 8080
      DATABASE_ENABLED: "false"
      DEL_INSTANCE: "false"
      LOG_LEVEL: ERROR
    volumes:
      - evolution_instances:/evolution/instances   # sem volume = QR a cada restart

volumes:
  evolution_instances:
```
```bash
cd /home/ubuntu/evolution && docker compose up -d && docker compose logs -f
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
// a) criar instância (mesmo nome)
fetch('https://evo.seudominio.com/instance/create', {
  method:'POST', headers:{'Content-Type':'application/json','apikey':'SUA_CHAVE'},
  body: JSON.stringify({ instanceName:'seu-bot', integration:'WHATSAPP-BAILEYS' })
}).then(r=>r.json()).then(console.log)

// b) RECONFIGURAR webhook (formato v2.x: dados dentro de { webhook: {} })
fetch('https://evo.seudominio.com/webhook/set/seu-bot', {
  method:'POST', headers:{'Content-Type':'application/json','apikey':'SUA_CHAVE'},
  body: JSON.stringify({ webhook: {
    url:'https://SEU-APP.vercel.app/api/whatsapp/webhook',
    enabled:true,
    events:['MESSAGES_UPSERT','CONNECTION_UPDATE','QRCODE_UPDATED'],
    webhookByEvents:false
  }})
}).then(r=>r.json()).then(console.log)

// c) gerar QR e escanear
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
- [ ] Imagem `evoapicloud/evolution-api:v2.3.0` (não `atendai/`)
- [ ] `DATABASE_ENABLED=false` (sem Postgres/Redis)
- [ ] HTTPS via Caddy + domínio (ou iptables restrito)
- [ ] **Webhook reconfigurado** (`/webhook/set/`) apontando pro Vercel
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

*Atualizado: 04/06/2026 — corrigido p/ usar a imagem/config que funciona (evoapicloud v2.3.0, DATABASE_ENABLED=false), co-locação na VM#1, webhook obrigatório, HTTPS, iptables do OS, PAYG e região us-ashburn-1.*
