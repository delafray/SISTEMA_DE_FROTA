# Sistema de Gestão de Frota — Delafray

> **Sistema completo de gestão de frota** com WhatsApp Bot (IA), roteirização, dashboard web e app mobile.

## 📚 Documentação

**Toda a documentação do projeto está centralizada em [`framework/INDEX.md`](framework/INDEX.md).**

| Quer... | Vá para |
|---|---|
| Entender como o bot funciona | [framework/01-whatsapp-bot/](framework/01-whatsapp-bot/INDEX.md) |
| Adicionar nova consulta via WhatsApp | [framework/01-whatsapp-bot/como-consultar-tabela.md](framework/01-whatsapp-bot/como-consultar-tabela.md) |
| Ver todas as APIs e chaves | [framework/02-apis-e-chaves/](framework/02-apis-e-chaves/INDEX.md) |
| Fazer deploy ou implantar novo cliente | [framework/03-deploy/](framework/03-deploy/INDEX.md) |
| Regras de código e arquitetura | [docs/BOT_FRAMEWORK.md](docs/BOT_FRAMEWORK.md) |
| Política de testes | [TESTING.md](TESTING.md) |

## Getting Started

```bash
npm install
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000).

## Stack

- **Frontend:** Next.js + React + TypeScript
- **Backend:** Next.js API Routes (Vercel, região `iad1`)
- **Banco:** Supabase (PostgreSQL)
- **WhatsApp:** Evolution API v2.3.0 (Railway)
- **IA:** Gemini 2.5 Flash + Deepgram + OpenAI GPT-4o
- **Roteirização:** OSRM + VROOM (Oracle Cloud VM)
- **Fotos:** Cloudflare R2

## Deploy

Deploy automático via Vercel. Cada push em `main` gera novo deploy.
Detalhes em [framework/03-deploy/vercel.md](framework/03-deploy/vercel.md).
