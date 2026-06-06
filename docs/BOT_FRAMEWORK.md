# 🤖 Framework do Bot WhatsApp — Frota Delafray

> 🟢 **FONTE DE VERDADE ATUAL (06/06/2026): [BOT_CLASSIFICADOR_INTEGRACAO.md](./BOT_CLASSIFICADOR_INTEGRACAO.md).** O bot hoje roda em **modo classificador** (regras + Gemini structured output) atrás de `MODO_CLASSIFICADOR`: consulta/altera-KM/anota com allowlist de colunas, propose→confirm e optimistic lock — **sem function calling**. Os trechos abaixo que ensinam **tools do Gemini** (`buscar_km_caminhao`, `propor/confirmar_atualizacao_km`, `listar_*`, `meu_caminhao`) são **HISTÓRICOS** — não existem mais; quem monta o SQL é o `botExecutor.ts`, não a IA. Auditoria de 24 agentes (06/06/2026) com riscos/bugs pré-detectados está no doc do classificador.

> ⚠️ **05/06/2026 — IA VIRGEM.** Tools antigas do Gemini removidas; ver `docs/LEMBRETES_SEM_TRAVA.md`.

> **Documento de arquitetura, regras invioláveis, padrões obrigatórios e roadmap.**
> Toda IA que tocar no código do bot **deve ler este arquivo antes** de qualquer alteração.
>
> 📎 **Documento irmão:** [GUIA_APIS_SETUP.md](./GUIA_APIS_SETUP.md) — como configurar cada API do zero (chaves, contas, variáveis de ambiente, armadilhas de setup).

Última revisão: **2026-06-03** — Antigravity / Claude Opus 4.6 (Thinking). Adições: §3.C (bugs B25-B27 latência/billing), §8.8 (otimizações de latência aplicadas em produção), stack atualizada (Gemini como IA principal do gestor, `thinkingBudget: 0`, região `iad1`).
Revisão anterior: 2026-05-31 — Claude Opus 4.7 (Wave 2: +8 agentes, B17-B24, novas seções 3.B/4.6/5.4-5.6/8.6-8.7/9.4/10.2, roadmap §11 reescrito + §12/§13)
Base: Wave 1 + Wave 2 + 27 bugs documentados (24 originais + 3 novos de produção junho).

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
11. [Roadmap de migração](#11-roadmap-atualizado-2026-05-31)
12. [Critérios de priorização](#12-critérios-de-priorização)
13. [Métricas de sucesso por fase](#13-métricas-de-sucesso-por-fase)

---

## 1. Princípios não-negociáveis

1. **Stack atual permanece**: Gemini 2.5 Flash (`thinkingBudget: 0`, região `iad1`) + Deepgram nova-2 + Evolution API v2.3.0 (Railway) + Supabase. **Não adotar framework agente** (Mastra/LangChain/AutoGPT) — 30 funcionários e fluxos previsíveis não justificam complexidade.
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
- (tool removida em 05/06/2026 — lição mantida como referência)

**B3. Erro Supabase silenciado**
- Arquivo: `messageRouter.ts:346-350, 693-709`
- Sintoma: query falha (rede/auth), código vê `data = undefined` e mostra "Caminhão não encontrado" — motorista pensa que erro é dele
- Fix: sempre verificar `error` separado de `data`

**B4. Operação destrutiva sem confirmação**
- Arquivo: `frotaTools.ts` (`atualizar_km_caminhao`)
- Sintoma: Gemini pode chamar a tool direto sem perguntar. Risco real de motorista falar "meu km tava em 45 mil" e bot atualizar (em vez de só conversar)
- Fix: implementar Permission Loop (§6)
- (tool removida em 05/06/2026 — lição mantida como referência)

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

### 🔥 BUGS DESCOBERTOS EM PRODUÇÃO (pós-deploy 2026-05-31) — LIÇÕES

Estes só apareceram em uso real. **Toda IA que adicionar feature nova DEVE evitar repetir esses padrões.**

**B12. Race condition em fire-and-forget de persistência ordenada**
- Sintoma vivo: `[GoogleGenerativeAI Error]: First content should be with role 'user', got model` — Gemini rejeitava 100% das chamadas
- Causa: `void gravarMensagem(user) + void gravarMensagem(model)` em paralelo. Postgres atribuía `created_at` na ordem que as roundtrips de rede chegavam — model às vezes vinha antes de user.
- **REGRA INVIOLÁVEL:** quando 2+ inserts precisam preservar ordem temporal, **gravação SEMPRE sequencial com `await`**. Nunca `void` + `void` pra coisas ordenadas. Latência extra (~80ms) é aceitável.
- **Defesa adicional:** `lerHistorico` filtra `model` do início — resiliência contra dados legados quebrados.
- Commit: `60f0724`

**B13. Tools com filtro fixo, sem aceitar identificador opcional**
- Sintoma vivo: motorista perguntava "quanto km tem o leão" → bot respondia "não encontrei" porque `buscar_km_caminhao` só procurava o caminhão DO motorista, não aceitava apelido
- Causa: tool desenhada pra UM caso (qual MEU km), não pra QUALQUER caso (qual km de X)
- **REGRA:** toda tool de consulta com escopo "do usuário" deve aceitar **identificador opcional**. Sem param = comportamento padrão (do usuário). Com param = busca específica. Exemplo: `buscar_km_caminhao(placa_ou_apelido?: string)`.
- **REGRA:** descrição da tool deve dar **2-3 exemplos de cada modo** (com e sem param) pro Gemini saber quando passar.
- Commit: `b9490bc`
- (tool removida em 05/06/2026 — lição mantida como referência)

**B14. CHECK constraints do banco não refletidas no código**
- Sintoma vivo: `new row for relation "km_logs" violates check constraint "km_logs_tipo_check"` — insert com `tipo: 'informado'` rejeitado (banco só aceita `inicial/final/checkpoint/abastecimento/manutencao/pausa`)
- Causa: código foi escrito com palpite do valor do enum, sem checar a constraint real
- **REGRA INVIOLÁVEL antes de qualquer INSERT em tabela do Supabase:**
  ```sql
  SELECT pg_get_constraintdef(oid)
  FROM pg_constraint
  WHERE conrelid = 'NOME_DA_TABELA'::regclass;
  ```
  Lista TODAS as CHECKs/FKs. Documente os valores aceitos como comentário ao lado do insert.
- Commit: `a2c6430`

**B15. Triggers obsoletos após rename/drop de coluna**
- Sintoma vivo: `record "new" has no field "frete_id"` — trigger `frete_iniciado_atualiza_status` em `km_logs` ainda referenciava `NEW.frete_id` (coluna removida) e `fretes` (tabela renomeada pra `entregas`)
- Causa: migração `migration_limpeza_modelo.sql` dropou as colunas mas não auditou triggers que dependiam delas. PL/pgSQL faz lazy parsing — só explode na primeira invocação após o drop.
- **REGRA INVIOLÁVEL ao dropar coluna ou renomear tabela:**
  ```sql
  -- Antes do ALTER, listar dependências
  SELECT proname, prosrc FROM pg_proc
  WHERE prosrc LIKE '%COLUNA_OU_TABELA%';
  -- E triggers que referenciam
  SELECT tgname, tgrelid::regclass FROM pg_trigger WHERE NOT tgisinternal;
  ```
- Commit: `a7bcfab`

**B16. Insert sem setar flags que triggers exigem**
- Sintoma vivo: `confirmar_atualizacao_km` gravava no `km_logs` mas `veiculos.km_atual` não atualizava — bot dizia "registrado" mas próxima consulta retornava KM antigo
- Causa: trigger `propagar_km_para_veiculo` só dispara quando `confirmado=true AND correcao=false`. Insert da tool não setava nem uma das duas — Postgres assumia DEFAULT (NULL/false), trigger não disparava
- **REGRA:** antes de inserir em tabela com triggers, **leia o `prosrc` de TODOS os triggers da tabela**:
  ```sql
  SELECT proname, prosrc FROM pg_proc
  WHERE oid IN (SELECT tgfoid FROM pg_trigger WHERE tgrelid = 'TABELA'::regclass AND NOT tgisinternal);
  ```
  Identifique campos referenciados em `IF NEW.X = ...` e **sete-os explicitamente no insert** (não confie em DEFAULTs).
- Commit: `a7bcfab`
- (tool removida em 05/06/2026 — lição mantida como referência)

### 🔥 §3.B — Bugs descobertos em auditoria pós-Fase 2 (Wave 2, 2026-05-31)

Auditoria estática + análise de padrões recorrentes em 4 módulos críticos revelou 8 bugs adicionais. **Devem ser corrigidos antes da Fase 3 (Arquitetura limpa).**

> ✅ **STATUS 2026-05-31**: B17-B24 **TODOS RESOLVIDOS** na Fase 2.5. Migration `db/migration_session_atomic.sql` aplicar em prod antes do deploy. Suite 700/700.

#### 🔴 CRÍTICO — vazamento entre empresas / corrupção de sessão

**B17. `enviarStatusVeiculo` lê veículos sem filtrar por empresa**
- Arquivo: `messageRouter.ts:701-705`
- Sintoma: motorista da empresa A pode receber dados de veículo da empresa B se o `id` coincidir / for adivinhado. Quebra o princípio §1.4.
- Causa: `supabase.from('veiculos').select(...).eq('id', veiculoId)` — sem `.eq('empresa_id', sessao.empresa_id)`.
- Fix:
  ```ts
  .from('veiculos')
  .select('id, placa, apelido, km_atual, status, empresa_id')
  .eq('id', veiculoId)
  .eq('empresa_id', sessao.empresa_id)  // OBRIGATÓRIO
  .single();
  ```

**B18. `processarSelecaoVeiculo` mesma vulnerabilidade**
- Arquivo: `messageRouter.ts:348-352`
- Sintoma e fix idênticos a B17. Padrão se repete — daí Categoria B abaixo.

**B19. `updateSession` race condition no read→merge→write**
- Arquivo: `sessionManager.ts:189-233`
- Sintoma: 2 mensagens paralelas do mesmo telefone (WhatsApp envia em rajada quando há fila) — segunda lê estado antes da primeira gravar, sobrescreve `contexto` da primeira. Resultado: campos somem do meio do fluxo.
- Causa: não-atômico. Sem optimistic locking.
- Fix (3 opções, escolher 1):
  1. Coluna `version int` + UPDATE com `WHERE version = $expected` e retry no caller.
  2. Função RPC Postgres `update_session_atomic(telefone, patch jsonb)` com `FOR UPDATE`.
  3. Advisory lock por hash(telefone) na transação (mais simples se já houver client com pgcrypto).
- Severidade: ALTA. Já houve evidência intermitente em logs.

**B20. `updateSession` não checa `affected_rows`**
- Arquivo: `sessionManager.ts:221-232`
- Sintoma: UPDATE não acha linha (telefone removido por outro turno) → função retorna `void` silenciosamente. Próxima leitura traz dado antigo, motorista repete passo.
- Fix: sempre `.select()` no UPDATE e verificar `data?.length === 1`. Caso contrário, log + erro tipado `{ ok: false, codigo: 'sessao_perdida' }`.

#### 🟠 ALTO — validação fraca e ordem temporal

**B21. `motoristaId` coerced com `?? ''` no dispatcher mascara `undefined`**
- Arquivo: `frotaTools.ts:535-545`
- Sintoma: dispatcher faz `const motoristaId = args.motoristaId ?? ''`. Tool valida com `if (!motoristaId)` — string vazia entra como vazia, mas semanticamente é "ausente". Mensagem de erro fica ruim ("motorista vazio") e log dificulta debug.
- Fix:
  ```ts
  // dispatcher
  const motoristaId = typeof args.motoristaId === 'string' ? args.motoristaId : undefined;
  // tool
  if (typeof motoristaId !== 'string' || motoristaId.trim() === '') {
    return { ok: false, codigo: 'sem_permissao', erro: 'motorista não identificado' };
  }
  ```
- Regra: **nunca normalize `undefined → ''`**. Tipos distintos = semântica distinta.

**B22. Extensão de B12 — gravação ainda fire-and-forget em outros pontos**
- Arquivo: múltiplos calls a `gravarMensagem` no `geminiBot.ts` e em flows
- Sintoma esperado: terceiro turno rápido (usuário manda 3 áudios em <2s) pode ler histórico parcial — só vê user da rodada 1 e nada da rodada 2, repete pergunta.
- Causa: B12 corrigiu o caso main (alternância user/model). Outros call-sites de `gravarMensagem` foram esquecidos como `void`.
- Fix:
  1. Auditar todo `void gravarMensagem(` no repo (`rg "void gravarMensagem"`).
  2. Trocar para `await` em todos antes de chamar `lerHistorico`.
  3. Schema hardening: `created_at timestamptz NOT NULL DEFAULT now()` + ordenar por `(created_at, id)` (não só `created_at` — empate na mesma ms é real em Postgres).
- Severidade: ALTA — degrada percepção de "bot esquece".

#### 🟡 BAIXO — edge cases e polish

**B23. Redundância em `temProblema && avarias`**
- Arquivo: `messageRouter.ts` (loop de avarias)
- Sintoma: condição redundante (`temProblema` já implica `avarias.length > 0`). Sem bug funcional, mas confunde leitura.
- Fix: simplificar para `if (avarias.length > 0)` e remover a flag derivada.

**B24. Loop de avarias sem default de urgência**
- Arquivo: `messageRouter.ts` (loop de avarias)
- Sintoma: se `avaria.urgencia` for `null` (legado), template renderiza "urgência: undefined" no WhatsApp.
- Fix: `const urgencia = avaria.urgencia ?? 'média';` antes de renderizar. Considerar `CHECK (urgencia IN ('baixa','média','alta'))` + `DEFAULT 'média'` no schema.

### 📊 3 categorias de anti-pattern recorrentes (3+ ocorrências cada)

Quando você notar uma dessas formas no seu próximo PR, **pare e refatore antes de mergeear** (detalhes/exemplos em §10.2).

**CATEGORIA A — Silent fail em Supabase** — `messageRouter.ts:297`, `sessionManager.ts:159`, `historico.ts:55`, `geminiClient.ts:145`.
**CATEGORIA B — Falta `empresa_id` em SELECT** — `messageRouter.ts:704`, `:721`. Provavelmente mais.
**CATEGORIA C — Type casts sem runtime validation** — `geminiClient.ts:145/150/172`, `deepgramClient.ts:56`, `frotaTools.ts:308-309`.

### 🔥 §3.C — Bugs de produção Junho 2026 (latência e billing)

Descobertos em uso real após deploy do Gemini como IA principal.

**B25. Latência de 17s por mensagem de áudio — thinkingBudget ligado por padrão**
- Sintoma: motorista enviava áudio, resposta demorava 12-17s percebidos (~6-9s no Vercel + ~6s transporte)
- Causa: Gemini 2.5 Flash tem `thinkingBudget` LIGADO por padrão. Cada chamada gastava 2-4s extras de raciocínio interno, e cada áudio faz 2+ chamadas (tool round-trips) = até 8s perdidos
- Fix: `generationConfig.thinkingConfig.thinkingBudget = 0` em `geminiClient.ts`. SDK legado (`@google/generative-ai@0.24.1`) não tipa `thinkingConfig` mas repassa verbatim pro REST body
- **Trade-off**: thinking off reduz raciocínio complexo — REVERSÍVEL subindo `thinkingBudget` pra 512 se necessário
- Impacto: **-5s na latência percebida** (17s → 12s)
- Commit: `6ea3667`

**B26. Região gru1 piorava latência de áudio — serviços pesados nos EUA**
- Sintoma: configurar `preferredRegion: 'gru1'` (São Paulo) deveria melhorar mas não ajudava pra áudio
- Causa: Evolution API (Railway), Deepgram e Gemini estão TODOS nos EUA. Ao pinar em São Paulo, cada chamada fazia viagem transoceânica extra (~200ms × 4 viagens = ~800ms perdidos)
- Fix: mudar para `preferredRegion: 'iad1'` (US East) no webhook + `vercel.json`
- **REGRA**: verificar ONDE ficam os serviços pesados antes de escolher região. Supabase BR é leve (queries pequenas), os serviços de IA são pesados.
- Impacto: **-1s na latência percebida**
- Commit: `d77dd01`

**B27. Erro 429 em produção — Google mudou billing do Gemini**
- Sintoma: bot parou de responder com erro `429 Too Many Requests` mesmo com poucas mensagens
- Causa: Google mudou de pós-pagamento para **pré-pagamento obrigatório**. Conta sem crédito é "rebaixada" e bloqueia chamadas
- Fix: adicionar crédito (R$60) no Google Cloud Billing via AI Studio
- **REGRA**: monitorar billing do Google AI Studio periodicamente. Alerta visual: se resposta do bot vier com erro 429, verificar créditos primeiro
- **Guarda implementada**: `geminiRateLimit.ts` com `limitesConfigurados()` — se `GEMINI_RPM`/`GEMINI_RPD` NÃO estiverem setadas (plano pago), a guarda fica DESLIGADA e pula 2 queries por mensagem (economia de ~100-200ms). Setar as envs liga a guarda (free tier).

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

### 4.6 Tools multimodais (foto + texto)

A partir da Fase 8, tools de OCR/visão (ex: ler foto de placa, bordereau de NF, hodômetro) seguem regras adicionais. Baseado em [Gemini Vision docs](https://ai.google.dev/gemini-api/docs/vision) e benchmarks internos.

#### 4.6.1 Pattern de envio multimodal

Foto + texto + tool no **mesmo turno** via `parts`:
```ts
const parts = [
  { inlineData: { mimeType: 'image/jpeg', data: base64 } },  // imagem PRIMEIRO
  { text: 'Extraia placa e KM do hodômetro desta foto.' },
];
```
**Imagem antes do texto reduz latência ~15%** (preenchimento do KV cache do Vision encoder ocorre em paralelo com tokenização do texto).

#### 4.6.2 `media_resolution` por intenção

| Caso | Resolução | Tokens por foto 3000×4000 |
|---|---|---|
| OCR (placa, número, código) | `'low'` | ~1500 |
| Reconhecimento de objeto / cena | `'medium'` | ~3000 |
| Avaria visual com detalhe (arranhão) | `'high'` | ~6192 |

`media_resolution: 'low'` corta **~75% dos tokens** quando só importa texto da imagem. Aplicar por default em qualquer tool de OCR.

#### 4.6.3 `response_schema` obrigatório

Tools multimodais que extraem dados estruturados **devem** declarar `response_schema` (Gemini 2.5 Flash respeita confiavelmente; Flash-Lite não — não usar em multimodal):
```ts
{
  type: SchemaType.OBJECT,
  properties: {
    placa: { type: SchemaType.STRING, pattern: '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$' },
    km_lido: { type: SchemaType.NUMBER },
    confianca: { type: SchemaType.NUMBER, minimum: 0, maximum: 1 },
  },
  required: ['placa', 'km_lido', 'confianca'],
}
```

#### 4.6.4 Double-pass validation

Antes de qualquer **persistência** baseada em extração visual, segunda chamada Flash:
```
"Aqui está a foto e o JSON extraído. O JSON é coerente com a imagem?
Responda apenas: { ok: boolean, motivo?: string }"
```
Custo: ~1500 tokens extras. Ganho: corta >80% das hallucinations de OCR. Aplicar em: leitura de hodômetro, placa, valor monetário. NÃO aplicar em: avaria descritiva (texto livre tolera erro).

#### 4.6.5 Áudio: **manter Deepgram, não migrar para Gemini native audio**

Gemini 2.5 native audio ainda em preview até pelo menos Q3/2026, function calling com audio é buggy (drops de tool_call em ~12% dos turnos com áudio). Deepgram nova-3 é mais barato, mais estável, e o pipeline atual (transcrever → text-only Gemini) funciona. Reavaliar quando Google declarar GA.

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

### 5.3 Template aplicável (versão 1 — em produção)

```
Você é o assistente da Frota Delafray.

ESCOPO:
Responde perguntas sobre frota, motoristas, veículos e KM dos caminhões.
Outras operações (abastecimento, despesa, avaria, adiantamento) ainda
estão sendo configuradas — informe que estarão disponíveis em breve.

TOM:
Português brasileiro. Corporativo, direto, texto puro. Pontuação neutra.
Não comente sobre o formato (texto vs áudio) — só responda ao conteúdo.

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

### 5.4 Template SYSTEM_PROMPT v2 (com fallback gracioso + repair) — alvo da Fase 6

Substitui o §5.3. Adiciona seções **CAPACIDADES_EM_BREVE**, **FALLBACK**, **REPAIR**. Baseado em [Liao et al. 2019](https://dl.acm.org/doi/10.1145/3290605.3300776) e [CHI 2024 — Conversational Repair in Voice Assistants](https://dl.acm.org/doi/10.1145/3613904.3642491).

```
Você é o assistente da Frota Delafray.

CAPACIDADES:
- Listar motoristas e veículos da empresa.
- Consultar KM atual de qualquer caminhão por placa ou apelido.
- Registrar nova leitura de KM (com confirmação).

CAPACIDADES_EM_BREVE:
- Registrar abastecimento, despesa, avaria e adiantamento.
- Consultar pedidos do dia.
- Solicitar rota otimizada.
Quando perguntarem sobre essas, diga "em breve" e ofereça registrar manualmente no painel web.

FALLBACK (quando você não pode atender):
1. Reconheça o pedido em 1 frase ("Entendi que você quer X").
2. Explique brevemente por que não dá hoje ("ainda não estou registrando despesa").
3. Ofereça canal alternativo ("no painel em frota.delafray.com.br").
4. NUNCA invente que registrou. NUNCA prometa "vou anotar pra depois".

REPAIR (quando o motorista corrige você ou não entendeu):
- Se motorista negar ("não, não é isso"): peça 1 dado específico ("qual o KM correto?").
- Se você não entendeu: ofereça 2 opções concretas, não pergunta aberta.
- Se tool retornou erro: use a mensagem_motorista dela, NÃO improvise.

PERMISSION LOOP:
Toda ação que modifica dado segue: propor_* → preview → motorista confirma → confirmar_*.
Nunca pular propor_*. Nunca chamar confirmar_* sem "sim" explícito do motorista no turno anterior.

TOM:
Português brasileiro corporativo. Texto puro. Pontuação neutra. 1 fato + 1 pergunta por resposta. Máx 25 palavras por frase. Sem markdown rico, sem emoji, sem "olá", sem links.

EXTRAÇÃO:
Números: aceite formatos "45000", "45.000", "45 mil", "quarenta e cinco mil". Normalize antes de propor.
Placas: aceite "ABC1D23" e "ABC-1D23". Apelidos: case-insensitive, sem acento.

DADOS:
Filtra automaticamente por empresa do motorista — você nunca vê de outra empresa.
Jamais invente número, placa, nome ou data. Se não souber, diga "não tenho essa informação ainda".

IDENTIDADE:
Assistente da Frota Delafray. Não mencione modelo, fornecedor ou tecnologia.
```

Tamanho-alvo: 1100-1300 tokens (acima do threshold de implicit caching = 1024).

### 5.5 Padrões de refusal e repair (com exemplos)

#### 5.5.1 — 8 padrões de refusal nomeados

Catalogados de HCI literature 2019-2024 + Google Assistant guidelines. Use o nome do padrão no comentário do prompt pra facilitar revisão.

| # | Padrão | Quando usar | Exemplo |
|---|---|---|---|
| 1 | **Deflection lateral** | Capacidade próxima existe | "Não registro despesa ainda, mas posso te mostrar o KM atual." |
| 2 | **Acknowledge-then-bridge** | Pedido válido mas fora do escopo | "Faz sentido pedir isso. Hoje só dá no painel web." |
| 3 | **Options strategy** | Pedido ambíguo | "Quer registrar KM ou só consultar?" |
| 4 | **Soft refusal com timeline** | Feature planejada | "Ainda não. Está previsto pro próximo mês." |
| 5 | **Capability hint inline** | Bot acha que motorista não sabe da feature | "Posso atualizar o KM se quiser — é só me passar o número." |
| 6 | **Defer to channel** | Operação complexa | "Pra editar pedido inteiro, é mais rápido no painel." |
| 7 | **Reframing** | Pedido baseado em pressuposto errado | "Eu não envio mensagem pros outros motoristas — só respondo você." |
| 8 | **No-bridge honest** | Sem alternativa | "Não consigo fazer isso. Falar com o gestor da frota." |

**Anti-pattern**: refusal genérico ("não posso ajudar com isso"). Sempre acompanhar de 1 dos 8 padrões acima.

#### 5.5.2 — 4 técnicas de repair

| # | Técnica | Trigger | Implementação |
|---|---|---|---|
| 1 | **Soft re-ask com slot** | Não entendeu campo específico | "Não peguei o número. Me passa só o KM, sem outras palavras?" |
| 2 | **Options strategy** | Múltiplas intents possíveis | "Você quer atualizar KM ou consultar o atual?" |
| 3 | **Multi-turn coherence via `intent_ativo`** | 2+ turnos sobre mesmo assunto | Manter `sessao.contexto.intent_ativo = { tipo, dados, ttl_ate }` (TTL 10min). Próxima mensagem é interpretada à luz do intent. Expira → limpa. |
| 4 | **Tool error → mensagem determinística** | Tool retorna `ok: false` | Bot copia `tool.mensagem_motorista` literalmente. NÃO improvisa em cima de erro — risco de prometer demais. |

#### 5.5.3 — Tabela de exemplos práticos

| Pedido do motorista | Resposta correta | Padrão / Técnica |
|---|---|---|
| "registra 200 reais de pedágio" | "Não registro despesa ainda. Anotar no painel é rápido — frota.delafray.com.br/despesas/novo." | Deflection lateral + Defer to channel |
| "qual meu km" (sem caminhão vinculado) | "Você não tem caminhão atribuído. Falar com o gestor." | No-bridge honest |
| "atualiza km" (sem número) | "Qual o KM atual do leão?" | Soft re-ask com slot |
| "ok" (sem contexto) | "Ok pra quê? Me lembra o que estava combinando." | Options strategy |
| "meu km tava em 45 mil" | "Vou registrar 45.000 km no leão. Confirma?" | Permission Loop (propor_*) |
| "não, é 44 mil" (após preview) | "Vou registrar 44.000 km no leão. Confirma?" | Multi-turn coherence (mantém intent) |
| Tool retorna erro DB | (copia mensagem_motorista da tool, ex: "Erro temporário, tenta em 1 min. ref A3F7") | Tool error → determinística |

### 5.6 Microcopy WhatsApp PT-BR

Regras de estilo para todas as respostas. WhatsApp é um canal pessoal, motorista lê com 1 mão dirigindo. **1 fato, 1 frase.**

#### Do / Don't

| Faça | Não faça |
|---|---|
| Texto puro | Markdown rico (`**bold**`, `_italic_`, listas `-`) |
| Pontuação neutra (`.`) | Pontuação excessiva (`!!`, `?!`, `...`) |
| Vocativo direto ("Maria, ...") | "Olá!" / "Oi!" / "Tudo bem?" |
| Verbo direto ("Registrado: 45000 km.") | "Foi com sucesso atualizado o..." |
| Pergunta única clara | Pergunta + sub-pergunta + parêntese |
| Máx 25 palavras por frase | Período longo encadeado |
| Confirmar com dado ("KM 45.000 no leão. Confirma?") | "Pode confirmar a operação?" |
| Erros com referência curta ("ref A3F7") | "Houve um erro interno, por favor tente novamente mais tarde" |
| Sugestão concreta de próximo passo | "Estou à disposição" / "Qualquer dúvida..." |
| `km`, `KM`, `Km` (qualquer caixa) | "quilômetros" ou "kilometragem" |
| Plataforma: "no painel" | Link cru (Evolution às vezes não previewa) |

#### Regra "1 fato, 1 frase"

Cada resposta = **no máximo 1 dado novo + 1 pergunta/hint**. Se precisar dar 2 dados, mande em 2 mensagens (Evolution suporta; motorista lê melhor).

Errado: "O leão está com 45.000 km, atualizado em 12/05, e o último abastecimento foi de 180L em São Paulo, quer ver mais detalhes?"
Certo: "Leão: 45.000 km (atualizado 12/05). Quer ver abastecimentos?"

---

## 6. Operações destrutivas: Permission Loop

Pattern adotado (consenso Anthropic + LangChain):

### 6.1 Separar em DUAS tools

```ts
// 1ª — READ-ONLY, retorna preview
propor_X(valor_novo)
  → { preview: { valor_anterior: 40000, valor_novo: 45000, delta: +5000 },
      mensagem_sugerida: "Vou registrar 45.000 km no leão (atual 40.000). Confirma?" }

// 2ª — EXECUTA, exige token de confirmação
confirmar_X(valor_novo, valor_anterior_esperado)
  → executa SE valor_anterior_esperado === valor atual (optimistic locking)
  → senão devolve erro "outro motorista atualizou enquanto isso"
```

### 6.2 Fluxo

```
Motorista: "meu km é 45000"
   ↓
Gemini chama propor_X(45000)
   ↓
Tool devolve preview
   ↓
Gemini responde: "Vou registrar 45.000 km no leão (atual 40.000). Confirma?"
   ↓
Motorista: "sim"
   ↓
Gemini chama confirmar_X(45000, valor_anterior_esperado=40000)
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
  "tool_calls": ["criar_lembrete"],
  "latency_ms": 743,
  "custo_estimado_usd": 0.000123
}
```

Dashboard semanal: tokens médios, cache hit ratio, top tools chamadas, latência p95.

### 8.8 Otimizações de latência aplicadas (Junho 2026)

> Status: **TODAS em produção**. Resultado: 17s → 12s percebidos para áudio.

| # | Otimização | Impacto | Arquivo | Reversível? |
|---|---|---|---|---|
| 1 | `thinkingBudget: 0` | **-3 a -8s** por mensagem | `geminiClient.ts` | Sim (subir pra 512) |
| 2 | Região `iad1` (US East) | **-0.8 a -1.2s** | `webhook/route.ts` + `vercel.json` | Sim (mudar região) |
| 3 | Guarda de cota desligada no pago | **-0.1 a -0.2s** | `geminiRateLimit.ts` | Sim (setar GEMINI_RPM) |

#### Configuração atual do Gemini:
```typescript
// geminiClient.ts
const model = genAI.getGenerativeModel({
  model: 'gemini-2.5-flash-preview-05-20',
  generationConfig: {
    thinkingConfig: { thinkingBudget: 0 },  // desliga thinking
    maxOutputTokens: 1024,
  },
});
```

#### Configuração de região:
```typescript
// webhook/route.ts
export const preferredRegion = 'iad1';  // US East, perto de Evolution/Deepgram/Gemini
```
```json
// vercel.json
{ "framework": "nextjs", "regions": ["iad1"] }
```

> ⚠️ **NÃO usar `gru1`** mesmo o sistema sendo BR. Veja B26 em §3.C.

#### Próximas alavancas (NÃO aplicadas):
- Fast path com queries diretas para perguntas comuns ("quantos caminhões") → potencial -3 a -5s
- Cache TTL 30s para respostas repetidas → -6s na segunda pergunta igual
- Flash-Lite como alternativa (menor latência, menor qualidade) → só considerar se iad1 não bastar

### 8.6 Audio: configuração Deepgram otimizada

Migração nova-2 → **nova-3** documentada em [Deepgram nova-3 release notes](https://developers.deepgram.com/docs/models-languages-overview#nova-3) (24% menos WER em PT-BR vs nova-2). **Ação imediata na Fase 5.**

#### 8.6.1 Params recomendados

```ts
const TRANSCRIBE_OPTIONS = {
  model: 'nova-3',
  language: 'pt-BR',
  smart_format: true,
  punctuate: true,
  numerals: true,           // "quarenta e cinco mil" → "45000"
  endpointing: 500,         // ms de silêncio = fim de fala (default 10ms é agressivo demais)
  filler_words: false,      // remove "é", "aaah", "tipo"
  diarize: false,           // 1 falante só, economia
  utterances: false,
  keyterm: KEYTERMS_DA_EMPRESA,  // ver 8.6.2
};
```

`keyterm` (não `keywords` — `keywords` é o param legado pra modelos antigos) é específico do nova-3 e [boosta reconhecimento de termos raros](https://developers.deepgram.com/docs/keyterm) sem penalizar termos comuns.

#### 8.6.2 `keyterm` dinâmico por empresa

Construir lista a cada chamada (cacheada por 10min):
```ts
async function keytermsDaEmpresa(empresaId: string): Promise<string[]> {
  const [veiculos, motoristas] = await Promise.all([
    repo.veiculos.listar(empresaId),  // placa + apelido
    repo.motoristas.listar(empresaId), // nome + apelido
  ]);
  return [
    ...veiculos.map(v => v.placa),
    ...veiculos.map(v => v.apelido).filter(Boolean),
    ...motoristas.map(m => m.nome),
    ...motoristas.map(m => m.apelido).filter(Boolean),
    ...VOCAB_FLEET_FIXO,  // 100 termos: 'hodômetro', 'cavalo mecânico', 'reboque', 'fretista'...
  ];
}
```

Limite Deepgram: 100 keyterms por request. Priorizar veículos/motoristas + truncar `VOCAB_FLEET_FIXO` se passar.

#### 8.6.3 Fallback chain

| Ordem | Provider | Custo | Quando usar |
|---|---|---|---|
| 1 | Deepgram nova-3 | $0.0043/min | Default |
| 2 | OpenAI gpt-4o-mini-transcribe | $0.003/1000min ([docs](https://platform.openai.com/docs/models/gpt-4o-mini-transcribe)) | Deepgram 5xx ou timeout >8s. Aceita OGG/Opus nativo. |
| 3 | Gemini Flash audio | já incluso | Último recurso, com prompt explícito "transcreva fielmente, não responda" |

Implementar em `src/lib/ai/transcribe.ts` com `comRetry` (§B9). Logar qual provider entregou em `bot_metricas.fallback_acionado`.

#### 8.6.4 Pré-processamento para DTX

WhatsApp grava OGG/Opus com **DTX (Discontinuous Transmission)** — silêncios saem como frames vazios. Deepgram às vezes interpreta como "ambiente silencioso → não transcreve nada". Mitigação via ffmpeg ANTES da chamada:
```bash
ffmpeg -i in.ogg -af "apad=pad_dur=0.3:whole_dur=0,loudnorm=I=-16:LRA=11:TP=-1.5" -c:a libopus out.ogg
```
- `apad`: adiciona 300ms de silêncio no início e fim (preenche DTX edges).
- `loudnorm`: normaliza volume para -16 LUFS (Deepgram performa melhor entre -20 e -14).

Implementação serverless: usar [`@ffmpeg-installer/ffmpeg`](https://www.npmjs.com/package/@ffmpeg-installer/ffmpeg) (binário estático, ~30MB, dentro do limit Vercel).

### 8.7 Audio: tratamento de erros UX-diferenciado

Trocar mensagem genérica "não entendi seu áudio" por UX específica baseada no sintoma real.

#### 8.7.1 Tabela de detecção

| Detecção | Causa provável | Resposta ao motorista |
|---|---|---|
| `audioBuffer.byteLength < 3000` | Áudio < 1s, motorista tocou no botão sem querer | "Áudio muito curto. Fala uns 2 segundos a mais e manda de novo." |
| Transcrição vazia (sem erro Deepgram) | Silêncio total ou só ruído | "Não ouvi nada. Tem certeza que gravou com som?" |
| `confidence < 0.6` | Ambiente barulhento, sotaque forte, distorção | **Eco antes de processar**: "Entendi: 'X'. Tá certo? (responde sim/não)" |
| Deepgram timeout/5xx | Provider down | Fallback chain (§8.6.3). Se todos falharem: "Não consegui processar o áudio. Pode mandar por texto?" |
| Tamanho > 5MB (60s+) | Áudio longo demais | "Áudio grande. Tenta dividir em 2 ou manda por texto." |

#### 8.7.2 Eco de confirmação (confidence baixo)

Padrão **`echo_repair`**:
```
Bot: Entendi: "atualiza km do leão pra 45 mil". Tá certo?
Motorista: sim → processa
Motorista: não → "Manda de novo, falando devagar."
Motorista: outra coisa → trata como nova mensagem (sem eco anterior)
```

Implementar como estado de sessão `aguardando_eco_audio` (TTL 2min). Não confundir com Permission Loop — eco valida **transcrição**, Permission Loop valida **ação**. Pode rodar os dois em sequência:
```
Áudio ruim → eco → "sim" → processa → propor_* → preview → "sim" → confirmar_*
```

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

### 9.4 Métricas obrigatórias da tabela `bot_metricas` (v2)

Schema atual (Fase 2) cobre tokens/latência/tools. v2 adiciona 5 colunas para fechar gaps de observabilidade. Migration em `db/migration_bot_metricas_v2.sql`.

#### 9.4.1 Colunas a adicionar

```sql
ALTER TABLE bot_metricas
  ADD COLUMN mensagem_user_chars int,        -- proxy de "comprimento da pergunta"
  ADD COLUMN resposta_bot_chars int,         -- proxy de "comprimento da resposta"
  ADD COLUMN turno_numero_na_sessao int,     -- 1, 2, 3... reset em /novo ou TTL 30min
  ADD COLUMN tool_resultado_ok boolean,      -- agregado: TRUE se TODAS as tools do turno ok
  ADD COLUMN custo_estimado_usd numeric(10,8), -- calculado server-side, não confiar no Gemini
  ADD COLUMN fallback_acionado text;         -- 'deepgram_nova3' | 'openai_mini' | 'gemini_audio' | null
```

#### 9.4.2 KPIs principais

| KPI | Fórmula | Alvo | Significado |
|---|---|---|---|
| **Cache hit ratio** | `avg(cached_tokens / tokens_in)` | **> 0.6** | Implicit caching ativo. < 0.4 = system prompt mudou ou < 1024 tokens. |
| **Fast-path rate** | `count(fast_path=true) / count(*)` | > 0.25 | Regex cobrindo mensagens triviais. |
| **Tool success rate** | `avg(tool_resultado_ok)` | > 0.95 | Tools bem desenhadas + validação Zod boa. |
| **Custo médio por turno** | `avg(custo_estimado_usd)` | < $0.0005 | Combina caching + tools eficientes. |
| **Latência p95** | `percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms)` | < 5000ms | Deepgram + Gemini + Supabase combinados. |
| **Custo diário por motorista** | `sum(custo_estimado_usd) GROUP BY motorista, date` | **< $0.20/dia** | Cap individual — alerta acima disso. |

#### 9.4.3 Alertas práticos (Supabase Edge Function + email/push)

1. **Error rate spike**: `tool_resultado_ok=false` em ≥30 turnos consecutivos → alerta crítico ("alguma tool quebrada").
2. **Custo anômalo**: custo do dia > 2× rolling-7d-avg → alerta médio (provavelmente loop ou regressão de prompt).
3. **Latência sustentada**: p95 > 8s por 3 dias seguidos → alerta médio (provider degradado ou query lenta).

#### 9.4.4 Dois dashboards canônicos

**Dashboard "Hoje" (últimas 24h)** — visão operacional, leitura ao vivo:
- Turnos totais, fast-path %, cache hit ratio
- Top 5 motoristas por volume
- Top 5 tools chamadas
- Erros recentes (últimas 20 falhas)
- Latência p50/p95 em sparkline horário

**Dashboard "Tendência" (30d, materialized view)** — visão estratégica:
- Custo diário (linha) + cap projetado
- Cache hit ratio (linha) — quedas indicam mudança de prompt
- Distribuição de `confianca` Deepgram (histograma)
- Heat map: turnos por hora x dia da semana
- Drill-down por motorista

```sql
CREATE MATERIALIZED VIEW bot_metricas_diaria AS
SELECT
  date_trunc('day', created_at) AS dia,
  empresa_id, motorista_id,
  count(*) AS turnos,
  sum(custo_estimado_usd) AS custo_usd,
  avg(cached_tokens::float / NULLIF(tokens_in, 0)) AS cache_ratio,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95_latency
FROM bot_metricas
GROUP BY 1, 2, 3;
-- Refresh via cron job 1x/hora
```

---

## 10. Onde NÃO mexer (zona protegida)

### 🚫 Não alterar sem aprovação

- **Stack core**: Gemini 2.5 Flash (`thinkingBudget: 0`, região `iad1`), Deepgram nova-2 (migrar pra nova-3 só na Fase 5), Evolution API v2.3.0, Supabase
- **Estrutura dos flows rígidos** (`flows/kmFlow.ts`, `flows/avariaFlow.ts`, etc) — são o **fallback** se Gemini cair. Preserva exato como está até que sejam migrados pra tools (Fase 7).
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

### 10.2 Padrões a EVITAR (anti-patterns recorrentes)

Complementa §10. Estes não são "zona protegida" — são **forma de codar** que produz bug. Quando você ver no review, pede refactor.

#### CATEGORIA A — Silent fail em Supabase

❌ **Errado:**
```ts
const { data } = await supabase.from('veiculos').select('*').eq('id', id);
if (!data) return mensagem('não encontrado');
```
Problema: `error` ignorado. Erro de rede vira "não encontrado" — motorista é culpado por bug de infra.

✅ **Certo:** verificar `error` separadamente. Logar com contexto. Retornar código tipado (`db` vs `nao_encontrado`).

Onde já vi: `messageRouter.ts:297`, `sessionManager.ts:159`, `historico.ts:55`, `geminiClient.ts:145`.

#### CATEGORIA B — Falta `empresa_id` em SELECT tenant-scoped

❌ **Errado:**
```ts
.from('veiculos').select('*').eq('id', veiculoId).single()
```
Problema: vaza dado entre empresas se `id` for adivinhado/colidir.

✅ **Certo:** **toda** query a tabela com coluna `empresa_id` filtra por ela. Auditoria:
```bash
rg "from\('(veiculos|motoristas|pedidos|entregas|despesas|abastecimentos|km_logs|avarias|adiantamentos)'\)" src/ -A 6 | rg -v empresa_id | rg "from\("
```
Onde já vi: `messageRouter.ts:704`, `:721`.

#### CATEGORIA C — Type casts sem runtime validation

❌ **Errado:**
```ts
const km = args.km as number;
const placa = args.placa as string;
```
Problema: dado de fronteira (LLM, webhook, Deepgram) não é confiável. `as` mente pro compilador.

✅ **Certo:** Zod no dispatcher. Tipos TypeScript derivados (`z.infer<typeof Schema>`).
```ts
const ToolArgs = z.object({
  km: z.number().finite().positive(),
  placa: z.string().regex(/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/),
});
const parsed = ToolArgs.safeParse(args);
if (!parsed.success) return { ok: false, codigo: 'validacao', erro: parsed.error.message };
const { km, placa } = parsed.data;
```

Onde já vi: `geminiClient.ts:145/150/172`, `deepgramClient.ts:56`, `frotaTools.ts:308-309`.

#### Regra geral

Toda fronteira externa (LLM, webhook HTTP, transcrição de áudio, query SQL bruta) é **untrusted input**. Casts são dívida. Zod ou type guards explícitos sempre.

---

## 11. Roadmap atualizado (2026-05-31)

Reescrito após auditoria paralela de 6 agentes (2 code audits + 4 research). Fases priorizadas por **segurança > correção > capacidade > performance > polish**. Dependências e paralelismo marcados explicitamente em cada fase.

### ✅ CONCLUÍDO

- **Fase 1 — Bugs críticos (B1-B4)** — commits `b7f7c53`, `1117a2e`
  - B1 histórico migrado pra Supabase (`whatsapp_historico`)
  - B2 validação NaN/Infinity em KM
  - B3 error handling no `messageRouter`
  - B4 Permission Loop em `propor_atualizacao_km` / `confirmar_atualizacao_km`

- **Fase 2 — Token economy + métricas** — commits `26d6845`, `60f0724`, `a2c6430`, `a7bcfab`
  - Fast-path regex (saudação/ajuda/encerramento/reset)
  - Retry centralizado (`comRetry`, só 5xx/429/network)
  - Multi-turn tool loop com cap `MAX_TOOL_ROUNDS=5`
  - Métricas estruturadas em `bot_metricas` (fire-and-forget)
  - Prefixo de remetente extraído pra `lib/ai/contexto.ts`
  - Correções B12-B16 descobertas em produção (histórico race, tools com apelido, constraint check, trigger obsoleto, flags de trigger)

---

### 🚨 Fase 2.5 — Vulnerabilidades de segurança (URGENTE, ~3h)

**Bloqueia tudo abaixo.** B17/B18 são vazamento entre empresas — risco LGPD. Tem que sair antes de qualquer expansão de tools.

- [ ] **B17** (1h) — `enviarStatusVeiculo` em `messageRouter.ts:701-705`: filtrar por `empresa_id` na query `veiculos`. Teste: motorista de empresa A não consegue ler veículo de empresa B mesmo com `veiculo_id` válido.
- [ ] **B18** (1h) — `processarSelecaoVeiculo` em `messageRouter.ts:348-352`: mesmo fix.
- [ ] **B19** (1h) — `updateSession` race em `sessionManager.ts:189-233`: optimistic locking via coluna `version` OU função RPC com `FOR UPDATE`.
- [ ] **B20** (30min) — `updateSession` checar `affected_rows` no UPDATE; retornar erro tipado se vazio.
- [ ] **B21** (30min) — `frotaTools.ts:535-545` dispatcher: trocar `?? ''` por `typeof === 'string'`.

**Dependência:** nenhuma. **Pode rodar em paralelo com:** nada — bloqueia.
**Critério de saída:** todos os 5 itens com teste novo, suíte verde, deploy em produção.

---

### 📐 Fase 3 — Arquitetura defensiva + foundations (~8h)

Foundation pra tudo que vem depois. Repository pattern + Permission Loop genérico + validação Zod runtime resolvem as **3 categorias recorrentes** (§10.2) de uma vez.

- [ ] **Repository pattern** (3h) — `lib/repos/motoristasRepo.ts`, `veiculosRepo.ts`, `kmLogsRepo.ts`, `abastecimentosRepo.ts`, `despesasRepo.ts`, `pedidosRepo.ts`. Toda função recebe `empresa_id` como primeiro argumento obrigatório (impossível esquecer). Tools deixam de chamar Supabase direto.
- [ ] **Permission Loop genérico** (2h) — extrair pattern de `propor_*` / `confirmar_*` pra helper reutilizável. Próximas tools de escrita (abastecimento, despesa, avaria) herdam de graça. Tabela `bot_propostas_pendentes` com TTL 5min.
- [ ] **Validação Zod runtime universal** (1h) — wrapper `parseToolArgs(schema, raw)` que substitui todo cast `as`. Loga falhas em `bot_metricas` (categoria `parse_error`).
- [ ] **Middleware chain** (1h) — `withRetry → withMetrics → withAuth → toolHandler`. Hoje cada tool implementa retry/métricas ad-hoc.
- [ ] **Tool registry centralizado** (1h) — `tools/index.ts` exporta declarations + dispatchers num único lugar.
- [ ] **B22** (1h) — auditar todo `void gravarMensagem` no repo, trocar pra `await`. Schema: `created_at NOT NULL DEFAULT now()` + ordenar por `(created_at, id)`.

**Dependência:** Fase 2.5. **Pode rodar em paralelo com:** Fase 4 (observability) e Fase 5 (audio).
**Critério de saída:** Repository + Permission Loop usados pela tool KM existente (refactor sem mudança de comportamento), suíte verde com testes novos cobrindo edge cases de `empresa_id`.

---

### 📊 Fase 4 — Observability completa (~8h)

Sem isso, voamos cego nas próximas fases. Pré-requisito pra qualquer decisão de "tool X tá lenta / cara / errando".

- [ ] **`bot_metricas` v2** (30min) — adicionar 5 colunas (§9.4.1): `mensagem_user_chars`, `resposta_bot_chars`, `turno_numero_na_sessao`, `tool_resultado_ok`, `custo_estimado_usd`, `fallback_acionado`. Migration em `db/migration_bot_metricas_v2.sql`.
- [ ] **Cost monitoring** (30min) — função `estimarCustoUSD(model, in, out, cached)` em `lib/ai/custo.ts` chamada no fim de cada turno.
- [ ] **Dashboard `/admin/bot/hoje`** (2-3h) — server component com gráfico de tokens/hora, top tools, latência p50/p95, taxa de erro por categoria, custo estimado do dia. Filtros por empresa/motorista.
- [ ] **Dashboard `/admin/bot/tendencia`** (2-3h) — agregação semanal/mensal via materialized view, custo por motorista, eficiência do fast-path, intent não-coberto.
- [ ] **Alertas via Cron** (2h) — Vercel Cron + Resend pros 3 alertas do §9.4.3.

**Dependência:** Fase 2.5 (precisa de `empresa_id` confiável). **Pode rodar em paralelo com:** Fase 3, 5, 6.
**Critério de saída:** dashboards no ar, 1 alerta disparado de teste, custo do dia visível.

---

### 🎙️ Fase 5 — Audio resilience (~5h)

Áudio é 60%+ do tráfego do bot. Toda melhoria aqui multiplica.

- [x] **Migração Deepgram nova-2 → nova-3** (~30min, feito 2026-05-31) — `deepgramClient.ts` default nova-3 + numerals/endpointing/filler_words/punctuate (§8.6.1) + `VOCAB_FROTA_FIXO` (~55 keyterms PT-BR). Rollback via `DEEPGRAM_MODEL=nova-2`.
- [ ] **Keyterm dinâmico por empresa** (1-2h) — `keytermsDaEmpresa()` (§8.6.2). Cache 10min em memória.
- [ ] **Fallback chain** (2-3h) — Deepgram nova-3 → gpt-4o-mini-transcribe → Gemini audio. Loga `fallback_acionado` em `bot_metricas`.
- [ ] **UX diferenciada por erro** (1h) — implementar tabela §8.7.1.
- [ ] **Eco de confirmação** (1h) — estado `aguardando_eco_audio` quando `confidence < 0.6`.
- [ ] **FFmpeg WASM pre-processing** (3-4h, OPCIONAL) — só fazer se métricas mostrarem que >20% dos áudios falham por volume baixo.

**Dependência:** Fase 4 (precisa de métricas pra justificar FFmpeg). **Pode rodar em paralelo com:** Fase 3, 6.
**Critério de saída:** taxa de transcrição vazia cai pelo menos 30%, p95 de latência audio < 4s.

---

### 💬 Fase 6 — SYSTEM_PROMPT v2 + multi-turn coherence (~4h)

Template v2 já disponível em §5.4. Implementação curta mas tem que ter teste de snapshot pra qualquer mudança futura.

- [ ] **Reescrever SYSTEM_PROMPT** (2h) — substituir pelo template do §5.4 em `geminiClient.ts`. Teste de snapshot do prompt final (tools incluídas + contexto).
- [ ] **Tabela `intent_ativo`** (1h) — coluna nova em `whatsapp_historico` + migration. Multi-turn coherence (§5.5.2.3).
- [ ] **Repair turns** (1h) — quando confiança da resposta < 0.6, pedir confirmação ao motorista em vez de chutar. Métricas em `bot_metricas.categoria=repair_turn`.

**Dependência:** Fase 3 (precisa do registry + middleware). **Pode rodar em paralelo com:** Fase 4, 5.
**Critério de saída:** snapshot do prompt comitado, 1 caso de repair turn em teste e2e, motorista consegue completar Permission Loop mesmo trocando texto↔áudio no meio.

---

### 🔧 Fase 7 — Expansão de tools (5 sprints, ~5 semanas)

Plano do Code Audit 2 (Tools Surface). Hoje **5 tools**, alvo **15 tools** (cobertura 3x do domínio).

**Sprint 1 — Estabilização base (semana 1, 8h)**
- [ ] Refactor tools existentes pra usarem repos + Permission Loop genérico da Fase 3.
- [ ] Documentar os 5 **anti-patterns proibidos** nos flows legados.

**Sprint 2 — Operacional do motorista (semana 2-3, 12h)**
- [ ] `propor_registro_abastecimento` + `confirmar_registro_abastecimento`.
- [ ] `propor_registro_despesa` + `confirmar_registro_despesa`.
- [ ] Tests: valor inválido, despesa duplicada no mesmo dia, despesa sem veiculo_id ativo.

**Sprint 3 — Eventos do dia (semana 3, 10h)**
- [ ] `relatar_avaria` (sem Permission Loop — registro imediato, gravidade alta).
- [ ] `iniciar_checklist` + `proxima_resposta_checklist` (state machine simples em `bot_checklists_pendentes`).

**Sprint 4 — Financeiro (semana 4, 10h)**
- [ ] `propor_pedido_adiantamento` + `confirmar_pedido_adiantamento` (notifica gestor).
- [ ] `comunicar_imprevisto` (vai pra `imprevistos`, notifica gestor).
- [ ] `consultar_saldo_adiantamento`.

**Sprint 5 — Consultas e perfil (semana 5, 6h)**
- [ ] `consultar_status_pedido` (entregue / a entregar / em rota).
- [ ] `atualizar_dados_motorista` (telefone alt, CNH, etc — com Permission Loop).

**Dependência:** Fase 2.5 + Fase 3. **Pode rodar em paralelo com:** Fase 5, 6 dentro de cada sprint.
**Critério de saída por sprint:** todas as tools com teste unitário + 1 teste e2e + métricas no dashboard da Fase 4.

---

### 🖼️ Fase 8 — Multimodal (foto + tool no mesmo turno, ~6 dias)

Padrão `propor_X_via_foto`: Gemini Vision extrai dados → propõe via Permission Loop → motorista confirma. Mantém Deepgram pra áudio.

- [ ] **`propor_registro_abastecimento_via_foto`** (1-2 dias) — foto da nota fiscal → extrai valor + litros + posto.
- [ ] **`relatar_avaria_via_foto`** (1-2 dias) — foto do dano → Gemini Vision descreve + categoriza gravidade.

**Dependência:** Fase 7 sprint 2-3. **Pode rodar em paralelo com:** Fase 9.
**Critério de saída:** taxa de erro de extração visual < 10% medida em `bot_metricas.categoria=vision_extract_*`.

---

### 📈 Fase 9 — Inteligência adicional (futuro, conforme necessidade)

- [ ] Tools de gestor: `relatorio_motorista_semana`, `comparar_motoristas`, `top_despesas_mes`, `caminhao_mais_caro`.
- [ ] Sumarização automática de histórico longo (> 30 turnos) via Flash-Lite.
- [ ] Cache de resposta exata (5min TTL).
- [ ] Fallback Gemini Flash-Lite pra perguntas triviais sem tool call.

**Dependência:** Fase 4 (métricas dizem se vale a pena). **Pode rodar em paralelo com:** Fase 10.

---

### 🎁 Fase 10 — Polish (futuro)

- [ ] PostHog free tier como complemento opcional ao dashboard interno.
- [ ] Migração opcional pra Vercel AI SDK — só se ganho real medido.
- [ ] A/B testing de prompts (variantes do SYSTEM_PROMPT em subset de motoristas).
- [ ] Dashboard de qualidade de transcrição (Word Error Rate amostral).

**Dependência:** todas as anteriores. **Risco:** baixo.

---

## 12. Critérios de priorização

**Ordem fixa:** segurança > correção > capacidade > performance > polish.

- **Segurança** (Fase 2.5) bloqueia tudo. Não tem negociação — vazar dado entre empresas é game over.
- **Correção/Foundation** (Fase 3) bloqueia Fase 7 e 8. Sem repos + Permission Loop genérico, cada tool nova adiciona dívida técnica que precisaria ser paga 3x.
- **Observability** (Fase 4) é prerequisito *informacional*: sem ela, decisões das fases 5/9/10 viram chute.
- **Capacidade** (Fases 5, 6, 7, 8) são o que o usuário enxerga — entram em paralelo conforme as foundations destravam.
- **Performance/Polish** (Fases 9, 10) só depois que o uso real revela onde dói.

**Paralelismo possível** (depois que 2.5 e 3 fecharem):
- Track A: Fase 4 (observability) — agente solo, sem mexer em código de tool.
- Track B: Fase 5 (audio) — agente solo, sem mexer em tools.
- Track C: Fase 6 (prompt v2) — agente solo, mexe só em `geminiBot.ts` + migration leve.
- Track D: Fase 7 sprints sequenciais — 1 sprint por semana, motorista testa em produção entre sprints.

**Risco × Esforço × Impacto:**

| Fase | Risco | Esforço | Impacto | Veredito |
|---|---|---|---|---|
| 2.5 | ⬆ (LGPD) | ⬇ 3h | ⬆ | **FAZER JÁ** |
| 3 | ➡ | ➡ 8h | ⬆ (destrava 7+8) | **FAZER LOGO** |
| 4 | ⬇ | ➡ 8h | ⬆ (informa todas) | **PARALELO** |
| 5 | ⬇ | ⬇ 5h | ➡ (60% tráfego) | **PARALELO** |
| 6 | ➡ (snapshot protege) | ⬇ 4h | ➡ | **PARALELO** |
| 7 | ➡ | ⬆ 5 sem | ⬆ (3x cobertura) | **SEQUENCIAL pós-3** |
| 8 | ➡ (Vision pode errar) | ⬆ 6 dias | ➡ | **DEPOIS DE 7** |
| 9 | ⬇ | ➡ | ⬇ (conforme demanda) | **REATIVO** |
| 10 | ⬇ | ➡ | ⬇ | **FUTURO** |

**Regras de ouro:**
1. Nenhuma fase entra em produção sem **suíte verde** e teste novo (regra `TESTING.md`).
2. Toda fase que muda SYSTEM_PROMPT exige **snapshot test** do prompt final.
3. Toda tool nova precisa de teste e2e + métrica no dashboard antes de ser "concluída".
4. Refactor (Fase 3) não pode mudar comportamento — só mover código. Testes existentes têm que passar sem alteração.

---

## 13. Métricas de sucesso por fase

| Fase | KPI | Meta numérica |
|---|---|---|
| 2.5 | Vazamento entre empresas em teste de penetração | **0** (com teste e2e provando) |
| 2.5 | Casts `as` sem Zod no código de tools | **0** |
| 3 | Tools chamando Supabase direto | **0** (todas via repo) |
| 3 | Cobertura de testes nas tools refatoradas | **≥ 85%** |
| 4 | Tempo p/ detectar incidente de produção | **< 15min** (alerta dispara) |
| 4 | Custo diário do bot visível no dashboard | **100% dos dias** |
| 5 | Taxa de "não entendi seu áudio" | **queda ≥ 30%** vs baseline atual |
| 5 | p95 latência transcrição | **< 4s** |
| 6 | Diff do SYSTEM_PROMPT revisável em PR | **100%** (snapshot test) |
| 6 | Conclusão de Permission Loop com troca texto↔áudio | **≥ 95%** |
| 7 | Tools disponíveis | **15** (de 5 hoje) |
| 7 | % de mensagens atendidas por tool (não cai em flow legado) | **≥ 80%** ao fim do Sprint 5 |
| 7 | Custo médio por mensagem | **manter ≤ baseline atual** |
| 8 | Taxa de erro de extração visual | **< 10%** |
| 8 | Adoção de foto vs digitação manual | **≥ 40%** dos registros |
| 9 | Demanda concreta de gestor por relatório via bot | **≥ 3 pedidos distintos** antes de implementar |
| 10 | — | Só faz se medições anteriores justificarem |

**Baseline a capturar antes da Fase 4 entrar:** tokens/dia atual, custo/dia atual, latência p50/p95 atual, taxa de erro atual, % de mensagens com tool call atual.

---

## 📚 Referências (fontes consultadas pelos agentes)

**Function calling & tools:**
- [Gemini Function Calling](https://ai.google.dev/gemini-api/docs/function-calling)
- [Anthropic — Writing Tools for Agents](https://www.anthropic.com/engineering/writing-tools-for-agents)
- [Vercel AI SDK Tools](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling)
- [Permission Loop pattern](https://medium.com/@mbonsign/the-permission-loop-a-design-specification-for-tool-to-llm-confirmation-ff10f2b0cbce)

**Multimodal Gemini (Wave 2):**
- [Gemini Vision — Best practices](https://ai.google.dev/gemini-api/docs/vision)
- [Gemini Image understanding](https://ai.google.dev/gemini-api/docs/image-understanding)
- [Response Schemas em Gemini](https://ai.google.dev/gemini-api/docs/structured-output)
- [Gemini 2.5 Native Audio upgrade](https://blog.google/products-and-platforms/products/gemini/gemini-audio-model-updates/) — preview, não migrar ainda
- [Gemini Vision OCR guide](https://github.com/asreynolds1000/gemini-vision-ocr-guide)

**Audio (Wave 2):**
- [Deepgram nova-3 release notes](https://developers.deepgram.com/docs/models-languages-overview#nova-3)
- [Deepgram nova-3 PT-BR announcement](https://deepgram.com/learn/deepgram-expands-nova-3-with-spanish-french-and-portuguese-support)
- [Deepgram keyterm prompting](https://developers.deepgram.com/docs/keyterm)
- [Deepgram endpointing](https://developers.deepgram.com/docs/endpointing)
- [OpenAI gpt-4o-mini-transcribe](https://platform.openai.com/docs/models/gpt-4o-mini-transcribe)
- [Opus DTX explainer](https://getstream.io/resources/projects/webrtc/advanced/dtx/)
- [ffmpeg loudnorm filter](https://ffmpeg.org/ffmpeg-filters.html#loudnorm)

**Prompt engineering & conversational design:**
- [Gemini Prompting Strategies](https://ai.google.dev/gemini-api/docs/prompting-strategies)
- [Eugene Yan — Prompting](https://eugeneyan.com/writing/prompting/)
- [Pink Elephant — Negative Instructions](https://eval.16x.engineer/blog/the-pink-elephant-negative-instructions-llms-effectiveness-analysis)
- [Liao et al. CHI 2019 — Resilient Chatbots: Repair Strategy Preferences](http://qveraliao.com/chi19-1.pdf)
- [CHI 2024 — "As an AI language model, I cannot": LLM Denials](https://dl.acm.org/doi/fullHtml/10.1145/3613904.3642135)
- [LLM Refusal Design Perspective — Swaraj Renghe](https://swarajrenghe.dev/blog/how-to-design-llm-refusal)
- [Anthropic — Effective Context Engineering for AI Agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- [Landbot — WhatsApp Bot Design](https://landbot.io/blog/design-whatsapp-bot-dialogue)

**Observability (Wave 2):**
- [PostHog — Best LLM observability tools](https://posthog.com/blog/best-open-source-llm-observability-tools)
- [Langfuse Self-Hosting](https://langfuse.com/self-hosting/deployment/docker-compose)
- [Google SRE Workbook — Alerting on SLOs](https://sre.google/workbook/alerting-on-slos/)
- [OpenObserve — LLM Cost Monitoring](https://openobserve.ai/blog/llm-cost-monitoring/)
- [Supabase Materialized Views](https://supabase.com/docs/guides/database/postgres/materialized-views)
- [Supabase Metrics + Grafana](https://supabase.com/docs/guides/telemetry/metrics)

**Framework comparison:**
- [Vercel AI SDK vs Mastra vs LangChain](https://buttondown.com/vadima/archive/vercel-ai-sdk-vs-mastra-vs-langchainjs-which/)
- [Choosing an agent framework — Speakeasy](https://www.speakeasy.com/blog/ai-agent-framework-comparison)

**Token economy:**
- [Gemini Implicit Caching](https://developers.googleblog.com/gemini-2-5-models-now-support-implicit-caching/)
- [Simon Willison — Implicit caching analysis](https://simonwillison.net/2025/May/9/gemini-implicit-caching/)
- [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Mem0 — Chat history summarization](https://mem0.ai/blog/llm-chat-history-summarization-guide-2025)

**WhatsApp bot patterns:**
- Botpress memory patterns, LangChain memory, Twilio Conversational AI whitepaper, Meta WhatsApp Business API docs
