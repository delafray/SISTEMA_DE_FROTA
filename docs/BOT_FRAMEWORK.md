# 🤖 Framework do Bot WhatsApp — Frota Delafray

> **Documento de arquitetura, regras invioláveis, padrões obrigatórios e roadmap.**
> Toda IA que tocar no código do bot **deve ler este arquivo antes** de qualquer alteração.

Última revisão: 2026-05-30 — Claude Opus 4.7
Base: consolidação de 7 agentes (5 pesquisa documentação + 2 auditoria código).

---

## 📋 ÍNDICE

1. [Princípios não-negociáveis](#1-princípios-não-negociáveis)
2. [Arquitetura em camadas](#2-arquitetura-em-camadas)
3. [Bugs críticos identificados (corrigir primeiro)](#3-bugs-críticos-identificados-corrigir-primeiro)
4. [Regras pra tools](#4-regras-pra-tools)
5. [Regras pro system prompt](#5-regras-pro-system-prompt)
6. [Operações destrutivas: Permission Loop](#6-operações-destrutivas-permission-loop)
7. [Gestão de histórico / memória](#7-gestão-de-histórico--memória)
8. [Token economy](#8-token-economy)
9. [Error handling](#9-error-handling)
10. [Onde NÃO mexer (zona protegida)](#10-onde-não-mexer-zona-protegida)
11. [Roadmap de migração](#11-roadmap-de-migração)

---

## 1. Princípios não-negociáveis

1. **Stack atual permanece**: Gemini Flash 2.5 + Deepgram + Evolution API + Supabase. **Não adotar framework agente** (Mastra/LangChain/AutoGPT) — 30 funcionários e fluxos previsíveis não justificam complexidade.
2. **NUNCA bloquear o motorista**: erro de tool, timeout, falha de validação → degrada graciosamente, nunca trava conversa.
3. **NUNCA executar ação destrutiva sem confirmação explícita** (atualizar KM, registrar despesa, etc).
4. **NUNCA vazar dados entre empresas**: toda query filtra por `empresa_id`. Validação no runtime, não confiar no LLM.
5. **Histórico persistido**: nada de Map em memória — Vercel serverless mata a instância.
6. **Tools server-side**: jamais expor URL do Overpass/Supabase/Deepgram no cliente. Server-only.
7. **Testes obrigatórios** (regra do `TESTING.md`): toda mudança = teste novo. `npm test` verde antes de commitar.

---

## 2. Arquitetura em camadas

```
┌──────────────────────────────────────────────────────────────┐
│                    Webhook (Evolution API)                    │
└──────────────────────┬───────────────────────────────────────┘
                       ↓
┌──────────────────────────────────────────────────────────────┐
│  L1 — PARSER (messageParser.ts)                              │
│  Recebe payload Evolution → ParsedMessage normalizado         │
│  ZERO lógica de negócio, ZERO Supabase, ZERO LLM             │
└──────────────────────┬───────────────────────────────────────┘
                       ↓
┌──────────────────────────────────────────────────────────────┐
│  L2 — AUTH (auth.ts)                                          │
│  Telefone → UserIdentity (motorista_id, empresa_id, role)    │
│  Tem Supabase mas APENAS pra autenticação                    │
└──────────────────────┬───────────────────────────────────────┘
                       ↓
┌──────────────────────────────────────────────────────────────┐
│  L3 — FAST PATH (NOVO — a criar)                             │
│  Regex / keywords pra comandos óbvios:                       │
│    "menu", "ajuda", "/help", "cancelar", "sair", "oi"        │
│  Resposta sem chamar LLM = 0 tokens, <50ms                   │
└──────────────────────┬───────────────────────────────────────┘
                       ↓ (não match)
┌──────────────────────────────────────────────────────────────┐
│  L4 — ROUTER (messageRouter.ts)                              │
│  Decide: Gemini OU flow rígido (fallback). Sem chamar DB.    │
└──────────────────────┬───────────────────────────────────────┘
                       ↓
┌──────────────────────────────────────────────────────────────┐
│  L5 — BOT ORCHESTRATOR (geminiBot.ts)                        │
│  Coordena: histórico → LLM → tool → resposta                 │
│  Persiste histórico no Supabase (NOVO — hoje é Map)          │
└──────────────────────┬───────────────────────────────────────┘
                       ↓
┌──────────────────────────────────────────────────────────────┐
│  L6 — LLM CLIENT (geminiClient.ts)                           │
│  Chama Gemini, gerencia function calling loop,                │
│  retorna { texto, tools_chamadas, tokens_usados }             │
└──────────────────────┬───────────────────────────────────────┘
                       ↓ (se Gemini pediu tool)
┌──────────────────────────────────────────────────────────────┐
│  L7 — TOOL REGISTRY (tools/*.ts)                             │
│  Cada tool valida args com Zod, chama REPO (não Supabase).   │
│  Resposta padronizada: { ok, dados?, erro? }                 │
└──────────────────────┬───────────────────────────────────────┘
                       ↓
┌──────────────────────────────────────────────────────────────┐
│  L8 — REPOSITORIES (lib/repos/*.ts) — NOVO                   │
│  Única camada que toca Supabase. Tipos Zod. Cacheável.       │
└──────────────────────────────────────────────────────────────┘
```

**Regra ouro**: tool NUNCA chama `supabase.from()` direto. Toda query passa por um repo.

---

## 3. Bugs críticos identificados (corrigir primeiro)

Auditoria do agente identificou e PRIORIZA:

### 🔴 CRÍTICO — corrigir antes de qualquer feature

**B1. Histórico em memória perde no cold start**
- Arquivo: `geminiBot.ts:15` (`_historicos = new Map`)
- Sintoma: motorista conversa, instância Vercel reinicia, Gemini esquece tudo
- Fix: persistir em Supabase (`whatsapp_historico` table) com TTL de 24h por telefone

**B2. Validação NaN em `atualizar_km_caminhao`**
- Arquivo: `frotaTools.ts:325-326`
- Sintoma: `Number("abc") = NaN`. Validação `!kmNovo || kmNovo <= 0` não pega NaN. Pode gravar lixo no banco
- Fix: `if (!Number.isFinite(kmNovo) || kmNovo <= 0)` + Zod validation upstream

**B3. Erro Supabase silenciado**
- Arquivo: `messageRouter.ts:346-350, 693-709`
- Sintoma: query falha (rede/auth), código vê `data = undefined` e mostra "Caminhão não encontrado" — motorista pensa que erro é dele
- Fix: sempre verificar `error` separado de `data`

**B4. Operação destrutiva sem confirmação**
- Arquivo: `frotaTools.ts` (`atualizar_km_caminhao`)
- Sintoma: Gemini pode chamar a tool direto sem perguntar. Risco real de motorista falar "meu km tava em 45 mil" e bot atualizar (em vez de só conversar)
- Fix: implementar Permission Loop (§6)

### 🟠 ALTO — corrigir no MVP

**B5. Sem motorista_id quando seleção de veículo está pendente**
- Arquivo: `messageRouter.ts:282-294`
- Sintoma: tool é chamada mas `motoristaId=undefined` → falha silenciosa

**B6. Tool loop sem limite**
- Arquivo: `geminiClient.ts:88-109`
- Sintoma: hoje só faz 1 round. Se mudar pra multi-turn, falta cap (ex: max 5 rounds) — risco de explodir tokens

**B7. System prompt contraditório**
- Arquivo: `geminiClient.ts:17-32`
- Sintoma: diz "use tools SEMPRE" mas depois "abastecimento/despesa → diga indisponível". Gemini pode alucinar tools que não existem
- Fix: separar persona vs gatilhos vs constraints (§5)

### 🟡 MÉDIO — limpeza posterior

- **B8.** Duplicação de prefixo `[Motorista: X]` em geminiClient + geminiBot
- **B9.** Sem retry/backoff em Gemini/Deepgram
- **B10.** Cast `as string`/`as VeiculoJoin` sem runtime validation
- **B11.** `messageRouter` chama Supabase direto (deveria delegar pra repo)

---

## 4. Regras pra tools

### 4.1 Naming
- **Namespace por recurso**: `motorista_*`, `veiculo_*`, `pedido_*`, `km_*`
- **Verbo no início**: `listar_*`, `buscar_*`, `atualizar_*`, `criar_*`
- Manter < 20 tools ativas por turno (acima disso a acurácia cai — consensus Anthropic + OpenAI)

### 4.2 Description (gatilhos de intent)
- Liste **2-3 exemplos REAIS de pergunta do motorista** que devem disparar a tool
- Mencione **quando NÃO usar** (corta ambiguidade entre tools próximas)
- Tamanho: ~30-50 palavras. Mais que isso = waste de token

✅ **BOA**:
```
"Busca KM atual do caminhão DO motorista que está perguntando.
Use quando perguntarem: 'qual meu km', 'quanto km tem o leão',
'me fala o km'. NÃO use pra perguntar KM de outro motorista (sem suporte ainda)."
```

❌ **RUIM**:
```
"Esta função busca informações de quilometragem do veículo associado
ao motorista, retornando uma estrutura completa com placa, apelido,
marca, modelo e a data da última atualização do hodômetro..."
```

### 4.3 Parâmetros
- **SchemaType.NUMBER** > `STRING` quando for número (evita Gemini mandar "45.000")
- **Enums** > strings livres (status, tipo)
- **Sempre `required: []` ou `required: ['campo']`** explícito
- **Validação Zod no handler ANTES de chamar repo**

### 4.4 Retorno padronizado

```ts
type ResultadoTool =
  | { ok: true; dados: unknown; mensagem?: string }
  | { ok: false; erro: string; codigo?: 'sem_permissao' | 'nao_encontrado' | 'validacao' | 'db' };
```

`mensagem` pode ser uma sugestão de resposta natural — o LLM usa como inspiração mas não copia literal.

### 4.5 Tools destrutivas
Ver §6 (Permission Loop). **Toda tool que MODIFICA dado** segue o pattern.

---

## 5. Regras pro system prompt

### 5.1 Estrutura obrigatória

```
[PERSONA — 1-2 linhas]
[ESCOPO — o que o bot sabe e o que não sabe]
[TOM — como falar]
[GATILHOS DE TOOL — quando usar cada tipo]
[CONSTRAINTS — o que jamais fazer]
[IDENTIDADE FIXA]
```

### 5.2 Princípios

- **Markdown OU XML, não os 2**. Gemini aceita ambos, escolha 1.
- **Instruções positivas** > negativas ("texto puro" > "sem emojis") — efeito Elefante Rosa
- **Persona curta** vale mais que adjetivos: "assistente corporativo da Frota Delafray" evoca registro inteiro
- **Não liste tools** — Gemini vê elas via `functionDeclarations`. Liste apenas **gatilhos de quando usar**
- **System prompt cacheável**: alvo >1024 tokens pra ativar implicit caching do Gemini (75% desconto). Inflar com few-shot examples se necessário
- **Sem few-shot dentro de cada mensagem** — coloca no system (cacheado)

### 5.3 Template aplicável (substitui o atual)

```
Você é o assistente da Frota Delafray.

ESCOPO:
Responde perguntas sobre frota, motoristas, veículos e KM dos caminhões.
Outras operações (abastecimento, despesa, avaria, adiantamento) ainda
estão sendo configuradas — informe que estarão disponíveis em breve.

TOM:
Português brasileiro. Corporativo, direto, texto puro. Pontuação neutra.
Não comente sobre o formato (texto vs áudio) — só responda ao conteúdo.

GATILHOS:
- Pergunta sobre QUEM são os motoristas → tool listar_motoristas
- Pergunta sobre QUAIS caminhões / placas / apelidos → tool listar_veiculos
- Pergunta sobre KM atual do caminhão DO motorista → tool buscar_km_caminhao
- Motorista INFORMA novo KM (ex: "meu km é 45000") → primeiro propor_atualizacao_km
- Motorista CONFIRMA atualização ("sim", "confirma", "isso") → confirmar_atualizacao_km

CONFIRMAÇÃO DESTRUTIVA:
Para QUALQUER ação que modifica dado (KM, despesa, qualquer write):
1. Use a tool "propor_*" — ela retorna preview
2. Apresente o preview ao motorista (ex: "Vou registrar KM 45.000 no leão. Confirma?")
3. Aguarde resposta afirmativa explícita
4. Aí sim chame "confirmar_*"

DADOS:
Filtra automaticamente por empresa do motorista — você nunca vê de outra empresa.
Jamais invente número, placa, nome ou data. Se não souber, diga "não tenho essa informação ainda".

IDENTIDADE:
Assistente da Frota Delafray. Não mencione modelo, fornecedor ou tecnologia.
```

Ganho estimado: ~50% redução de tokens do system + remove contradições.

---

## 6. Operações destrutivas: Permission Loop

Pattern adotado (consenso Anthropic + LangChain):

### 6.1 Separar em DUAS tools

```ts
// 1ª — READ-ONLY, retorna preview
propor_atualizacao_km(km_novo)
  → { preview: { km_anterior: 40000, km_novo: 45000, delta: +5000 },
      mensagem_sugerida: "Vou registrar 45.000 km no leão (atual 40.000). Confirma?" }

// 2ª — EXECUTA, exige token de confirmação
confirmar_atualizacao_km(km_novo, km_anterior_esperado)
  → executa SE km_anterior_esperado === km_atual atual (optimistic locking)
  → senão devolve erro "outro motorista atualizou enquanto isso"
```

### 6.2 Fluxo

```
Motorista: "meu km é 45000"
   ↓
Gemini chama propor_atualizacao_km(45000)
   ↓
Tool devolve preview
   ↓
Gemini responde: "Vou registrar 45.000 km no leão (atual 40.000). Confirma?"
   ↓
Motorista: "sim"
   ↓
Gemini chama confirmar_atualizacao_km(45000, km_anterior_esperado=40000)
   ↓
Tool valida (optimistic lock) + grava
   ↓
Gemini: "Registrado: 45.000 km."
```

### 6.3 Anti-loop
- Timeout 5min: preview pendente sem confirmação → cancela automaticamente
- Max 1 retry: se motorista negar/corrigir, só 1 nova proposta. Depois, encerra ciclo
- Confirmação ambígua ("sim... mas espera"): NÃO executa, pergunta de novo

### 6.4 Sem botões interativos
Como WhatsApp pessoal + Evolution não renderiza listas/botões confiavelmente, **usa texto livre**. Aceita: "sim", "ok", "pode", "confirmo", "vai", "isso". Rejeita: qualquer outra coisa.

---

## 7. Gestão de histórico / memória

### 7.1 Persistência (corrige B1)

Nova tabela Supabase:

```sql
CREATE TABLE whatsapp_historico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telefone text NOT NULL,
  empresa_id uuid NOT NULL,
  motorista_id uuid,
  role text NOT NULL,           -- 'user' | 'model'
  texto text NOT NULL,
  tool_calls jsonb,             -- log de tools chamadas neste turno
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_hist_tel_data ON whatsapp_historico (telefone, created_at DESC);
GRANT ALL ON TABLE whatsapp_historico TO service_role;
```

### 7.2 Política de janela

- **Manter últimas 8 mensagens** (4 turnos user+model)
- Trunca por **quantidade**, não por tokens (simples, previsível)
- **Reset automático**: 30min de inatividade → próxima mensagem começa "fresca" (sumário das 8 anteriores)
- **Reset manual**: motorista digita "/novo" ou "começar de novo" → limpa

### 7.3 Sumarização (futuro)

Quando histórico > 15 turnos: pede pro Gemini Flash-Lite gerar resumo de 200 chars. Coloca como primeira mensagem `role: 'model'` no contexto. Custo desprezível.

---

## 8. Token economy

### 8.1 Implicit caching (Gemini 2.5 Flash — automático)

- **Threshold**: 1024 tokens no prefixo estático (system + tools declarations)
- **Desconto**: 75% no preço dos tokens cacheados
- **Ação**: garantir que system + tool declarations totalizem > 1024 tokens. Hoje provável < 800 → inflar com gatilhos de intent (texto, não dados)

### 8.2 Fast path (corta 20-40% das calls)

Antes de chamar Gemini, regex/keyword router:

```ts
const FAST_PATH = [
  { regex: /^(oi|olá|ola|bom dia|boa tarde|boa noite)$/i, resposta: msg => `Olá, ${motorista.nome.split(' ')[0]}. No que posso ajudar?` },
  { regex: /^(menu|ajuda|help|\/help)$/i, resposta: () => MENU_TEXTO },
  { regex: /^(sair|tchau|valeu)$/i, resposta: () => 'Até logo.' },
  { regex: /^(cancelar|esquece)$/i, resposta: ctx => limparHistorico(ctx.telefone) && 'Conversa reiniciada.' },
];
```

### 8.3 Truncamento de histórico
- 8 mensagens máximo (4 turnos)
- Sumário automático quando > 15 turnos (Flash-Lite)

### 8.4 Pula Gemini quando não precisa

- Operação confirmada via Permission Loop com "sim" → chama tool direto, sem novo round Gemini
- Resposta cacheada (mesmo motorista, mesma pergunta, < 5min) → devolve cache

### 8.5 Métricas obrigatórias

Logar por turno:
```json
{
  "telefone_hash": "...",
  "fast_path": false,
  "model": "gemini-2.5-flash",
  "tokens_in": 1240,
  "tokens_out": 89,
  "cached_tokens": 1024,
  "tool_calls": ["buscar_km_caminhao"],
  "latency_ms": 743,
  "custo_estimado_usd": 0.000123
}
```

Dashboard semanal: tokens médios, cache hit ratio, top tools chamadas, latência p95.

---

## 9. Error handling

### 9.1 3 classes de erro

| Classe | Exemplo | Resposta ao motorista |
|---|---|---|
| **Usuário** | "atualiza km pra abc" | "Não entendi o número. Pode repetir só o número?" |
| **Validação** | KM regressivo, motorista sem caminhão vinculado | "KM precisa ser ≥ atual (40.000). Quer corrigir?" |
| **Sistema** | DB down, Gemini 503, Deepgram timeout | "Erro temporário. Tente em 1 minuto. (ref: A3F7)" + logar correlation ID |

### 9.2 Retry com backoff

- Gemini/Deepgram: 2 retries com 1s, 3s
- Supabase: 1 retry com 500ms
- Nunca retry em erro de validação (4xx)

### 9.3 Correlation ID

Cada requisição gera UUID curto (7 chars). Loga em todos os spans. Envia ao motorista em erros sistêmicos pra debug ("código A3F7B12").

---

## 10. Onde NÃO mexer (zona protegida)

### 🚫 Não alterar sem aprovação

- **Stack core**: Gemini 2.5 Flash, Deepgram nova-2, Evolution API, Supabase
- **Estrutura dos flows rígidos** (`flows/kmFlow.ts`, `flows/avariaFlow.ts`, etc) — são o **fallback** se Gemini cair. Preserva exato como está.
- **Schema das tabelas existentes** (`motoristas`, `veiculos`, `km_logs`, etc) — só adições, nunca renames
- **Auth flow** (`auth.ts` `identificarRemetente`) — 3 variações de telefone BR já funcionam, não tocar
- **getMediaAsBase64DataUrl** (descriptografia WhatsApp via Evolution) — descoberta dolorosa, funciona
- **deepgramClient.ts** — bug do `;codecs=opus` no data URL já resolvido, não regredir

### ❌ Não fazer

- ~~Adotar Mastra/LangChain/AutoGPT~~ — overkill pra 30 funcionários
- ~~Streaming~~ — WhatsApp não usa
- ~~Semantic cache~~ — risco alto de falso positivo em conversa multi-turn
- ~~Explicit context caching do Gemini~~ — só vale pra prompts > 32k tokens
- ~~Mexer no SYSTEM_PROMPT do Gemini sem testar~~ — sempre cobrir com teste de snapshot

### ⚠️ Alertar antes de tocar

- `messageRouter.ts` — coração do roteamento, qualquer mudança quebra tudo
- `webhook/route.ts` — entrada única, deploy errado = bot offline
- `sessionManager.ts` — UNIQUE constraints sutis no Supabase

---

## 11. Roadmap de migração

### Fase 1 — Estabilização (críticos, ~3h)
- [ ] B2: validação NaN no `atualizar_km_caminhao`
- [ ] B3: tratar `error` em todas as queries do `messageRouter`
- [ ] B4: implementar Permission Loop (separar `propor_*` + `confirmar_*`)
- [ ] B1: persistir histórico no Supabase (nova tabela)

### Fase 2 — Eficiência (alto ROI, ~2h)
- [ ] Fast path regex/keyword (corta 20-40% das calls Gemini)
- [ ] Truncamento de histórico (8 msgs)
- [ ] Métricas estruturadas (tokens_in/out, latency, custo) → tabela `bot_metricas`
- [ ] Reescrever SYSTEM_PROMPT no template do §5.3 + teste de snapshot

### Fase 3 — Arquitetura limpa (~3h)
- [ ] Criar `lib/repos/` — repository pattern (motoristas, veiculos, km_logs)
- [ ] Tools deixam de chamar Supabase direto, usam repos
- [ ] Tool registry centralizado (`tools/index.ts`)
- [ ] Middleware chain (logging + retry + métricas)

### Fase 4 — Inteligência adicional (~conforme necessidade)
- [ ] Tools de gestor (relatórios, comparações entre motoristas)
- [ ] Sumarização automática de histórico longo
- [ ] Cache de resposta exata (5min TTL)
- [ ] Fallback Gemini Flash-Lite pra perguntas simples

### Fase 5 — Polish (futuro)
- [ ] Migração opcional pra Vercel AI SDK (apenas se ganho real, não por moda)
- [ ] Dashboard de métricas em `/admin/bot`
- [ ] A/B testing de prompts

---

## 📚 Referências (fontes consultadas pelos agentes)

**Function calling & tools:**
- [Gemini Function Calling](https://ai.google.dev/gemini-api/docs/function-calling)
- [Anthropic — Writing Tools for Agents](https://www.anthropic.com/engineering/writing-tools-for-agents)
- [Vercel AI SDK Tools](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling)
- [Permission Loop pattern](https://medium.com/@mbonsign/the-permission-loop-a-design-specification-for-tool-to-llm-confirmation-ff10f2b0cbce)

**Prompt engineering:**
- [Gemini Prompting Strategies](https://ai.google.dev/gemini-api/docs/prompting-strategies)
- [Eugene Yan — Prompting](https://eugeneyan.com/writing/prompting/)
- [Pink Elephant — Negative Instructions](https://eval.16x.engineer/blog/the-pink-elephant-negative-instructions-llms-effectiveness-analysis)

**Framework comparison:**
- [Vercel AI SDK vs Mastra vs LangChain](https://buttondown.com/vadima/archive/vercel-ai-sdk-vs-mastra-vs-langchainjs-which/)
- [Choosing an agent framework — Speakeasy](https://www.speakeasy.com/blog/ai-agent-framework-comparison)

**Token economy:**
- [Gemini Implicit Caching](https://developers.googleblog.com/gemini-2-5-models-now-support-implicit-caching/)
- [Simon Willison — Implicit caching analysis](https://simonwillison.net/2025/May/9/gemini-implicit-caching/)
- [Mem0 — Chat history summarization](https://mem0.ai/blog/llm-chat-history-summarization-guide-2025)

**WhatsApp bot patterns:**
- Botpress memory patterns, LangChain memory, Twilio Conversational AI whitepaper, Meta WhatsApp Business API docs
