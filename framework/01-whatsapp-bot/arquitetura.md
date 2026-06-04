# Arquitetura do Bot WhatsApp

> 📎 Voltar ao [INDEX do Bot](INDEX.md) | [INDEX principal](../INDEX.md)
>
> Documento detalhado completo: [docs/BOT_FRAMEWORK.md](../../docs/BOT_FRAMEWORK.md) (68KB, 1300 linhas)
> Este arquivo é um **resumo prático** para entender o bot rapidamente.

---

## Stack

| Componente | Tecnologia | Onde roda |
|---|---|---|
| Gateway WhatsApp | Evolution API v2.3.0 (Baileys) | Railway (Docker) |
| Backend | Next.js (API Routes) | Vercel (região `iad1`) |
| Banco de dados | PostgreSQL | Supabase |
| IA conversacional | Gemini 2.5 Flash (`thinkingBudget: 0`) | Google AI Studio |
| Transcrição de áudio | Deepgram nova-2 | Deepgram Cloud (US) |
| OCR de fotos | OpenAI GPT-4o Vision | OpenAI |
| Armazenamento de fotos | Cloudflare R2 | Cloudflare |

---

## Fluxo de uma mensagem

```
1. Motorista envia mensagem no WhatsApp
2. WhatsApp → Evolution API (Railway) → POST /api/whatsapp/webhook (Vercel)
3. security.ts → valida apikey do webhook
4. messageParser.ts → extrai tipo, telefone, conteúdo
5. auth.ts → identifica: motorista, gestor ou desconhecido
6. fastPath.ts → regex: "oi", "menu", "tchau" → resposta <1ms, sem IA
7. sessionManager.ts → carrega estado da sessão (Supabase)
8. geminiBot.ts → orquestra Gemini:
   a. Se áudio → Deepgram transcreve
   b. Se foto → OpenAI classifica
   c. Monta contexto + histórico + system prompt
   d. Envia pro Gemini → Gemini pode chamar tools
   e. Se tool: executarTool() → query Supabase → resultado → Gemini
   f. Gemini formula resposta em português
9. messageSender.ts → envia resposta → Evolution API → WhatsApp
```

---

## Estrutura de arquivos

```
src/
├── app/api/whatsapp/webhook/route.ts   ← Endpoint HTTP (POST)
└── lib/
    ├── whatsapp/
    │   ├── auth.ts              ← Identifica motorista/gestor/desconhecido
    │   ├── sessionManager.ts    ← Estado da conversa (Supabase)
    │   ├── messageParser.ts     ← Parseia payload da Evolution API
    │   ├── messageSender.ts     ← Envia textos, menus, listas
    │   ├── menuHelper.ts        ← Menus numerados (fallback WhatsApp pessoal)
    │   ├── fastPath.ts          ← "oi/menu/tchau" sem chamar IA (<1ms)
    │   ├── geminiBot.ts         ← Orquestra Gemini (texto e áudio)
    │   ├── geminiRateLimit.ts   ← Guarda de cota RPM/RPD
    │   ├── historico.ts         ← Últimas 8 msgs por número (4 turnos)
    │   ├── security.ts          ← Valida apikey do webhook
    │   └── flows/               ← Fluxos determinísticos (fallback sem IA)
    └── ai/
        ├── geminiClient.ts      ← SDK Gemini + retry + thinkingBudget
        ├── deepgramClient.ts    ← Transcrição de áudio
        ├── tools/frotaTools.ts  ← Function calling (declarations + queries)
        ├── prompts.ts           ← System prompts
        ├── metricas.ts          ← Registro de chamadas
        └── retry.ts             ← Retry com backoff (429/5xx)
```

---

## Regras invioláveis

1. **NUNCA bloquear o motorista** — erro de tool, timeout → degrada, nunca trava
2. **NUNCA executar ação destrutiva sem confirmação** (Permission Loop)
3. **NUNCA vazar dados entre empresas** — toda query filtra por `empresa_id`
4. **Histórico persistido no Supabase** — Vercel serverless mata instância
5. **Tools server-side** — nunca expor URLs de Supabase/Deepgram no client

---

## Permission Loop (propor/confirmar)

Toda operação que ESCREVE no banco segue:
```
propor_*  → read-only preview → "Confirma?"
confirmar_* → grava → só após "sim" explícito
```

Detalhes em [como-adicionar-tool.md](como-adicionar-tool.md).

---

## Otimizações de latência (Junho 2026)

| Otimização | Impacto | Arquivo |
|---|---|---|
| `thinkingBudget: 0` | -3 a -8s | `geminiClient.ts` |
| Região `iad1` (US East) | -0.8 a -1.2s | `webhook/route.ts` + `vercel.json` |
| Guarda de cota desligada no pago | -0.1 a -0.2s | `geminiRateLimit.ts` |
| Fast path (regex) | -6 a -12s | `fastPath.ts` |

Resultado: 17s → 12s percebidos para áudio.

---

## Veja também

- [como-consultar-tabela.md](como-consultar-tabela.md) — adicionar nova consulta
- [como-adicionar-tool.md](como-adicionar-tool.md) — criar tool que escreve no banco
- [bugs-conhecidos.md](bugs-conhecidos.md) — armadilhas
- [../02-apis-e-chaves/todas-as-apis.md](../02-apis-e-chaves/todas-as-apis.md) — chaves de cada serviço
- [docs/BOT_FRAMEWORK.md](../../docs/BOT_FRAMEWORK.md) — documento completo (68KB)
