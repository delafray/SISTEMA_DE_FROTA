# Todas as APIs — Mapa Completo

> 📎 Voltar ao [INDEX de APIs](INDEX.md) | [INDEX principal](../INDEX.md)
>
> Fonte detalhada: [docs/GUIA_APIS_SETUP.md](../../docs/GUIA_APIS_SETUP.md) (24KB, 586 linhas)
> Este arquivo aponta para a seção certa do guia completo.

---

## Mapa rápido

| # | Serviço | Função | Custo | Onde criar chave |
|---|---|---|---|---|
| 1 | **Supabase** | Banco PostgreSQL | Grátis | supabase.com → New Project |
| 2 | **Vercel** | Deploy Next.js | Grátis | vercel.com → Import repo |
| 3 | **GitHub** | Repositório / CI-CD | Grátis | github.com |
| 4 | **Cloudflare R2** | Fotos (cupons, avarias) | Grátis até 10GB | cloudflare.com → R2 |
| 5 | **Evolution API** | Gateway WhatsApp | Grátis (self-hosted) | Docker `evoapicloud/evolution-api` |
| 6 | **Railway** | Hospedagem da Evolution | Grátis | railway.app |
| 7 | **Gemini (Google)** | IA conversacional + tools | Grátis ou ~R$0,59/mês | aistudio.google.com/app/apikey |
| 8 | **Deepgram** | Transcrição de áudio | Grátis (US$200 crédito) | deepgram.com → API Keys |
| 9 | **Google Maps** | Geocoding | Grátis até ~10k/mês | console.cloud.google.com |
| 10 | **OpenAI** | OCR fotos (GPT-4o Vision) | ~R$5-20/mês | platform.openai.com/api-keys |
| 11 | **Sentry** | Monitoramento de erros | Grátis | sentry.io |
| 12 | **Oracle Cloud** | VM OSRM + VROOM | Grátis (Always Free) | cloud.oracle.com |
| 13 | **ViaCEP** | CEP → endereço | Grátis / sem cadastro | — |
| 14 | **Nominatim** | Endereço → lat/lng | Grátis (1 req/s) | — |
| 15 | **OSRM** | Cálculo de rotas | Grátis (self-hosted) | Na VM Oracle |
| 16 | **VROOM** | Otimização VRP | Grátis (self-hosted) | Na VM Oracle |

**Custo total: ~R$ 5-20/mês** (só OpenAI é obrigatoriamente pago)

---

## Como obter cada chave (links rápidos)

Para o **passo a passo detalhado** de cada serviço, veja [docs/GUIA_APIS_SETUP.md](../../docs/GUIA_APIS_SETUP.md):

| API | Seção no guia |
|---|---|
| Supabase | §3 |
| Cloudflare R2 | §4 |
| Gemini | §5 |
| Deepgram | §6 |
| Google Maps | §7 |
| OpenAI | §8 |
| Sentry | §9 |
| Oracle Cloud | §10 |
| Evolution API | §2 |
| Vercel | §12 |

---

## Veja também

- [env-template.md](env-template.md) — template .env.local completo
- [../03-deploy/vercel.md](../03-deploy/vercel.md) — como configurar env vars na Vercel
- [../01-whatsapp-bot/bugs-conhecidos.md](../01-whatsapp-bot/bugs-conhecidos.md) — armadilhas de cada API
