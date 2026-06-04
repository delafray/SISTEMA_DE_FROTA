# Template .env.local Completo

> 📎 Voltar ao [INDEX de APIs](INDEX.md) | [INDEX principal](../INDEX.md)

Copie este template e preencha com suas chaves reais.

```env
# ══════════════════════════════════════════════════
# SISTEMA DE FROTA — Variáveis de Ambiente
# !! NUNCA commitar este arquivo no Git !!
# ══════════════════════════════════════════════════

# ── Supabase ────────────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=https://SEU-PROJETO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua-anon-key
SUPABASE_SERVICE_ROLE_KEY=sua-service-role-key

# ── Cloudflare R2 — storage de FOTOS do sistema (OBRIGATÓRIO) ──
# 10GB grátis, egress zero. Upload JÁ IMPLEMENTADO (src/lib/storage/r2.ts, usado nos
# fluxos km/avaria/abastecimento/despesa). SEM estas chaves, o helper faz passthrough
# e a foto cai como base64 no Postgres (incha o banco) — por isso são obrigatórias.
R2_ACCOUNT_ID=seu-account-id
R2_ACCESS_KEY_ID=sua-access-key
R2_SECRET_ACCESS_KEY=sua-secret-key
R2_BUCKET_NAME=frota-storage
R2_PUBLIC_URL=https://pub-XXXX.r2.dev

# ── OpenAI GPT-4o ───────────────────────────────────
OPENAI_API_KEY=sk-proj-sua-chave

# ── Evolution API / WhatsApp ──────────────────────────────────
EVOLUTION_API_URL=http://IP-DA-VM:8080              ← IP da VM Oracle Cloud (Railway cancelado)
EVOLUTION_API_KEY=sua-evolution-api-key             ← AUTHENTICATION_API_KEY configurado na Evolution
EVOLUTION_INSTANCE_NAME=seu-bot                     ← nome da instância
EVOLUTION_WEBHOOK_SECRET=seu-webhook-secret         ← deve bater com webhook.headers.apikey

# ── Sentry ──────────────────────────────────────────
NEXT_PUBLIC_SENTRY_DSN=https://XXXX@oXXXX.ingest.us.sentry.io/XXXX
# SENTRY_DSN=                                              ← opcional; server/edge leem SENTRY_DSN ?? NEXT_PUBLIC_SENTRY_DSN
SENTRY_AUTH_TOKEN=sntrys_seu-token                         ← usado no build (upload de source maps)

# ── Roteirização OSRM + VROOM ──────────────────────
OSRM_URL=http://IP-DA-VM:5000
VROOM_URL=http://IP-DA-VM:3000

# ── Gemini API (Google AI Studio) ───────────────────
GEMINI_API_KEY=sua-gemini-key

# ── Deepgram API (Speech-to-Text) ───────────────────
DEEPGRAM_API_KEY=sua-deepgram-key
DEEPGRAM_MODEL=nova-3                                     ← modelo de transcrição (padrão: nova-3)

# ── Google Maps Geocoding API ───────────────────────
GOOGLE_MAPS_API_KEY=sua-google-maps-key

# ── Overpass API (validação de coordenadas / self-hosted na VM Oracle) ──
OVERPASS_URL=http://129.80.27.159:12345/api/interpreter  ← Overpass self-hosted na VM Oracle (porta 12345)

# ── Guarda de cota Gemini (SÓ free tier) ────────────
# Descomente apenas se estiver no plano GRATUITO:
# GEMINI_RPM=5
# GEMINI_RPD=250
# GEMINI_LIMITE_DIA=250                                   ← limite diário de chamadas

# ── Geocoding ───────────────────────────────────────
GEOCODE_LIMITE_MENSAL=9800
NOMINATIM_URL=https://nominatim.openstreetmap.org
VIACEP_URL=https://viacep.com.br/ws

# ── Tracking de uso de APIs ─────────────────────────
USO_APIS_ENC_KEY=chave-criptografia-32-chars-aqui          ← chave AES para criptografar dados de uso

# ── Build (automático na Vercel, não precisa setar) ──
# NEXT_PUBLIC_BUILD_SHA=abc123                             ← preenchido automaticamente pelo Vercel
```

---

## ⚠️ Importante

- **NUNCA commitar** este arquivo — está no `.gitignore`
- Ao configurar na **Vercel**, TODAS estas variáveis precisam ser adicionadas em Settings → Environment Variables
- Após mudar qualquer variável na Vercel: **Deployments → Redeploy**

---

## Veja também

- [todas-as-apis.md](todas-as-apis.md) — como obter cada chave
- [../03-deploy/vercel.md](../03-deploy/vercel.md) — configurar na Vercel
