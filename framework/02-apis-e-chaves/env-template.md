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

# ── Cloudflare R2 ───────────────────────────────────
R2_ACCOUNT_ID=seu-account-id
R2_ACCESS_KEY_ID=sua-access-key
R2_SECRET_ACCESS_KEY=sua-secret-key
R2_BUCKET_NAME=frota-storage
R2_PUBLIC_URL=https://pub-XXXX.r2.dev

# ── OpenAI GPT-4o ───────────────────────────────────
OPENAI_API_KEY=sk-proj-sua-chave

# ── Evolution API / WhatsApp ────────────────────────
EVOLUTION_API_URL=https://evolution-api-XXXX.up.railway.app
EVOLUTION_API_KEY=sua-api-key
EVOLUTION_INSTANCE_NAME=seu-bot
EVOLUTION_WEBHOOK_SECRET=seu-webhook-secret

# ── Sentry ──────────────────────────────────────────
NEXT_PUBLIC_SENTRY_DSN=https://XXXX@oXXXX.ingest.us.sentry.io/XXXX
SENTRY_AUTH_TOKEN=sntrys_seu-token

# ── Roteirização OSRM + VROOM ──────────────────────
OSRM_URL=http://IP-DA-VM:5000
VROOM_URL=http://IP-DA-VM:3000

# ── Gemini API (Google AI Studio) ───────────────────
GEMINI_API_KEY=sua-gemini-key

# ── Deepgram API (Speech-to-Text) ───────────────────
DEEPGRAM_API_KEY=sua-deepgram-key

# ── Google Maps Geocoding API ───────────────────────
GOOGLE_MAPS_API_KEY=sua-google-maps-key

# ── Guarda de cota Gemini (SÓ free tier) ────────────
# Descomente apenas se estiver no plano GRATUITO:
# GEMINI_RPM=5
# GEMINI_RPD=250

# ── Geocoding ───────────────────────────────────────
GEOCODE_LIMITE_MENSAL=9800
NOMINATIM_URL=https://nominatim.openstreetmap.org
VIACEP_URL=https://viacep.com.br/ws
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
