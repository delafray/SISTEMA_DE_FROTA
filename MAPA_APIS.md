# Mapa Completo de APIs e Serviços — Sistema de Frota

> Referência rápida de tudo que está "pendurado" no sistema.
> Atualizado: 27/05/2026

---

## Resumo Visual

```
┌─────────────────────────────────────────────────────────────────┐
│                    SISTEMA DE FROTA                             │
│                    (Vercel / Next.js)                           │
└───────────────────────────┬─────────────────────────────────────┘
                            │
        ┌───────────────────┼────────────────────┐
        │                   │                    │
   BANCO DE DADOS     ARMAZENAMENTO          MONITORAMENTO
   Supabase           Cloudflare R2          Sentry
   (PostgreSQL)       (Fotos/docs)           (Erros)
        │
        ├──────── WHATSAPP BOT
        │         Evolution API (Railway)
        │         └── WhatsApp-Baileys
        │
        ├──────── INTELIGÊNCIA ARTIFICIAL
        │         OpenAI (GPT-4o)
        │
        └──────── ROTEIRIZAÇÃO (em implantação)
                  ├── ViaCEP (CEP → endereço) GRÁTIS
                  ├── Nominatim (endereço → lat/lng) GRÁTIS
                  ├── OSRM (cálculo de rota) AUTO-HOSPEDADO
                  ├── VROOM (otimização VRP) AUTO-HOSPEDADO
                  └── Waze / Google Maps (deep link) GRÁTIS
```

---

## Tabela Completa

| # | Serviço | Tipo | Custo | Cadastro necessário | Status |
|---|---|---|---|---|---|
| 1 | **Supabase** | Banco de dados (PostgreSQL) | Grátis (free tier) | Sim | ✅ Ativo |
| 2 | **Vercel** | Hospedagem do sistema | Grátis (free tier) | Sim | ✅ Ativo |
| 3 | **GitHub** | Repositório / CI-CD | Grátis | Sim | ✅ Ativo |
| 4 | **Cloudflare R2** | Armazenamento de fotos | Grátis até 10GB | Sim | ✅ Ativo |
| 5 | **Evolution API** | WhatsApp Bot | Grátis (self-hosted) | Não | ✅ Ativo (Railway) |
| 6 | **Railway** | Hospedagem Evolution API | Grátis (free tier) | Sim | ✅ Ativo |
| 7 | **OpenAI** | GPT-4o (IA) | **PAGO por uso** | Sim | ✅ Ativo |
| 8 | **Sentry** | Monitoramento de erros | Grátis (free tier) | Sim | ✅ Ativo |
| 9 | **ViaCEP** | CEP → endereço | **Grátis / Ilimitado** | Não | ⏳ Fase 1 |
| 10 | **Nominatim** | Endereço → lat/lng | **Grátis** (1 req/s) | Não | ⏳ Fase 1 |
| 11 | **OSRM** | Cálculo de rotas | **Grátis** (auto-hospedado) | Não | ⏳ Aguarda VM |
| 12 | **VROOM** | Otimização de rotas (VRP) | **Grátis** (auto-hospedado) | Não | ⏳ Aguarda VM |
| 13 | **Oracle Cloud** | VM para OSRM + VROOM | **Grátis para sempre** | Sim | ⏳ Script rodando |
| 14 | **Waze / Google Maps** | Navegação do motorista | **Grátis** (deep link) | Não | ⏳ Fase 1 |
| 15 | **Geofabrik** | Mapa do Brasil (.osm.pbf) | **Grátis** (download único) | Não | ⏳ Aguarda VM |

---

## Por Plataforma

### ▲ Vercel (Sistema Principal)
Variáveis que precisa ter configuradas:
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
R2_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET_NAME
R2_PUBLIC_URL
EVOLUTION_API_URL
EVOLUTION_API_KEY
EVOLUTION_INSTANCE_NAME
EVOLUTION_WEBHOOK_SECRET
OPENAI_API_KEY
NEXT_PUBLIC_SENTRY_DSN
SENTRY_AUTH_TOKEN
NOMINATIM_URL          ← (roteirização Fase 1)
VIACEP_URL             ← (roteirização Fase 1)
OSRM_URL               ← (após VM Oracle)
VROOM_URL              ← (após VM Oracle)
```

### 🚂 Railway (Evolution API)
```
AUTHENTICATION_TYPE
AUTHENTICATION_API_KEY
PORT
SERVER_PORT
DATABASE_ENABLED
DEL_INSTANCE
LOG_LEVEL
```

### 🐘 Supabase
- Nenhuma variável para configurar lá
- Apenas criar projeto e copiar as chaves para a Vercel

### 🌐 Oracle Cloud (VM OSRM/VROOM)
- Nenhuma variável de ambiente
- Configuração via SSH + Docker

---

## Custos Reais por Mês

| Serviço | Custo |
|---|---|
| Supabase | R$ 0 (free tier) |
| Vercel | R$ 0 (free tier) |
| GitHub | R$ 0 (grátis) |
| Cloudflare R2 | R$ 0 (até 10GB) |
| Evolution API + Railway | R$ 0 |
| Sentry | R$ 0 (free tier) |
| ViaCEP, Nominatim, Geofabrik | R$ 0 |
| Oracle Cloud VM | R$ 0 (Always Free) |
| OSRM + VROOM | R$ 0 (auto-hospedado) |
| Waze / Google Maps | R$ 0 (deep link) |
| **OpenAI GPT-4o** | **~R$ 5-20/mês** (depende do uso) |
| **TOTAL** | **~R$ 5-20/mês** |

> O único serviço pago é a OpenAI. Todo o resto é 100% gratuito.

---

## APIs Sem Necessidade de Cadastro

Pode usar direto, sem criar conta:
- ✅ ViaCEP — `https://viacep.com.br/ws/{CEP}/json/`
- ✅ Nominatim — `https://nominatim.openstreetmap.org/search`
- ✅ Waze deep link — `https://waze.com/ul?ll=LAT,LNG&navigate=yes`
- ✅ Google Maps deep link — `https://www.google.com/maps/dir/?api=1&destination=LAT,LNG`
- ✅ Geofabrik (download do mapa) — `https://download.geofabrik.de/south-america/brazil-latest.osm.pbf`

---

## Fase 2 — APIs Opcionais (Futuro)

| API | Para que | Custo |
|---|---|---|
| MeuDanfe | Consultar NFe pelo QR Code | Grátis (~100 consultas/dia) |
| NFe.io | Consultar NFe pelo QR Code | Grátis (~100 consultas/mês) |
| SEFAZ direto | Consultar NFe sem limite | R$ 200/ano (certificado A1) |
| Cloudflare (domínio próprio) | HTTPS no OSRM | Grátis |

---

*Atualizado em 27/05/2026*
