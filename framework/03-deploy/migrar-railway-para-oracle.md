# Migrar Evolution API do Railway → Oracle Cloud (Free Tier)

> **Quando fazer isso?** Quando o sistema tiver volume real de uso (5+ empresas, 20+ motoristas ativos).
> O Railway Hobby ($5/mês) é suficiente durante o período de testes/MVP. Só vale migrar quando o custo começar a escalar.

---

## Por que migrar?

| Situação | Railway | Oracle Cloud |
|---|---|---|
| Custo | US$5/mês fixo + consumo | **Grátis para sempre** (Free Tier) |
| Postgres | Pago por uso | Usar **Supabase** (já existe) |
| Redis | Pago por uso | Usar **Upstash** (free até 10k req/dia) |
| Complexidade | Simples (drag-and-drop) | Requer configuração de VM |
| Uptime | 99.9% garantido | Depende da VM ser configurada corretamente |

---

## Arquitetura alvo após migração

```
WhatsApp ←→ Evolution API (Oracle Cloud VM #2 - gratuita)
                ↓
          Supabase (Postgres) ← já existe
          Upstash (Redis)     ← novo, free tier
```

A VM do OSRM/VROOM continua separada (VM #1). A Oracle oferece **2 VMs ARM gratuitas** (4 OCPUs + 24GB RAM compartilhados).

---

## Passo a Passo

### 1. Criar a segunda VM na Oracle Cloud

1. Acesse `cloud.oracle.com` → **Compute > Instances > Create Instance**
2. Selecione:
   - **Shape:** `VM.Standard.A1.Flex` (ARM, gratuito)
   - **OCPUs:** 2 | **RAM:** 12 GB
   - **OS:** Ubuntu 22.04
   - **Chave SSH:** mesma chave usada na VM do OSRM (ou crie uma nova)
3. Abra as portas no Security Group:
   - `8080` (Evolution API HTTP)
   - `22` (SSH)

### 2. Configurar Redis no Upstash

1. Acesse `upstash.com` → criar conta → **Create Database**
2. Selecione **Redis** → região mais próxima (ex: `us-east-1`)
3. Copie a **REDIS_URL** (formato: `redis://default:senha@host:porta`)
4. O free tier suporta **10.000 comandos/dia** — suficiente para a Evolution API em produção normal

### 3. Instalar Docker na nova VM

```bash
ssh ubuntu@<IP-DA-VM>

# Instalar Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker ubuntu
newgrp docker
```

### 4. Fazer deploy da Evolution API com Docker Compose

Crie o arquivo `/home/ubuntu/evolution/docker-compose.yml`:

```yaml
version: '3.9'

services:
  evolution-api:
    image: atendai/evolution-api:latest
    container_name: evolution-api
    restart: always
    ports:
      - "8080:8080"
    environment:
      # --- Servidor ---
      SERVER_URL: https://evo.seu-dominio.com  # ou http://IP:8080

      # --- Banco de Dados (Supabase) ---
      DATABASE_ENABLED: "true"
      DATABASE_PROVIDER: postgresql
      DATABASE_CONNECTION_URI: postgresql://postgres:[SENHA]@db.[PROJETO].supabase.co:5432/postgres

      # --- Redis (Upstash) ---
      CACHE_REDIS_ENABLED: "true"
      CACHE_REDIS_URI: redis://default:[SENHA]@[HOST].upstash.io:[PORTA]
      CACHE_REDIS_PREFIX_KEY: evolution

      # --- Autenticação ---
      AUTHENTICATION_TYPE: apikey
      AUTHENTICATION_API_KEY: [SUA_CHAVE_GLOBAL]

      # --- Storage de instâncias ---
      STORE_MESSAGES: "true"
      STORE_MESSAGE_UP: "true"
      STORE_CONTACTS: "true"
      STORE_CHATS: "true"
    volumes:
      - evolution_instances:/evolution/instances

volumes:
  evolution_instances:
```

### 5. Subir o serviço

```bash
cd /home/ubuntu/evolution
docker compose up -d

# Verificar se está rodando
docker compose logs -f
```

### 6. Atualizar as variáveis de ambiente no projeto (Vercel)

No painel da Vercel, atualize:
```
EVOLUTION_API_URL=http://<IP-DA-ORACLE-VM>:8080
EVOLUTION_API_KEY=<SUA_CHAVE_GLOBAL>
```

> **Opcional:** Configure um domínio com Nginx + SSL para a URL ficar mais limpa (`https://evo.seu-dominio.com`).

### 7. Reconectar o WhatsApp

1. Acesse `http://<IP>:8080/manager` (painel visual)
2. Crie a instância com o mesmo nome de antes
3. Faça o scan do QR Code no celular do motorista/gestor

### 8. Desligar os serviços no Railway

Após confirmar que tudo funciona:
1. Railway → seu projeto → `evolution-api` → **Settings > Delete Service**
2. Repita para `Postgres` e `Redis`
3. Projeto ficará vazio → pode deletar o projeto

---

## Checklist de Validação

- [ ] Evolution API respondendo em `http://<IP>:8080`
- [ ] Instância do WhatsApp reconectada (status "open")
- [ ] Mensagem de teste enviada e recebida pelo bot
- [ ] Logs sem erros de conexão com Supabase ou Redis
- [ ] Variáveis na Vercel atualizadas e redeploy feito

---

## Custo final após migração

| Serviço | Custo |
|---|---|
| Oracle Cloud VM (Evolution API) | **Grátis** |
| Upstash Redis | **Grátis** (até 10k req/dia) |
| Supabase (Postgres) | **Grátis** (já usado) |
| Railway | **$0** (cancelado) |
| **Total mensal** | **R$ 0,00** |

---

*Documentado em: 04/06/2026*
