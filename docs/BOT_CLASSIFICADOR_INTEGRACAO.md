# 🤖 Motor do Bot — Classificador ligado ao WhatsApp (modo classificador)

> Liga o classificador Gemini + regras ao fluxo real do bot. Implantado 05/06/2026.
> Fundamentado em 10 agentes de pesquisa (Gemini SDK, Supabase seguro, estado serverless,
> confirmação de escrita, desambiguação, robustez). **Atrás de env flag, reversível.**

## Como ligar / desligar

```bash
MODO_CLASSIFICADOR=true     # liga o motor (regras + Gemini)
MODO_SOMENTE_LEMBRETE=true  # MANTENHA ligado — é a rede de segurança (o que o
                            # classificador não tratar vira lembrete)
```

- `MODO_CLASSIFICADOR` **default OFF** → zero mudança no comportamento atual.
- Pré-requisito: rodar `db/migration_bot_classificador.sql` (cria `bot_msgs_processadas`
  e `bot_estado_pendente`).
- Reverter: `MODO_CLASSIFICADOR=false` (ou remover a env). Volta ao lembrete puro.

## Fluxo (arquivo `src/lib/whatsapp/classificadorBot.ts`)

```
mensagem (texto) →
  idempotência (wamid já processado? → ignora)
  estado pendente? (desambiguação "1/2/3" ou confirmação "sim/não") → resolve
  montarContextoIA (regras do telefone) — não autorizado → cai no lembrete
  classificar (Gemini, timeout 9s, fail-safe)
    0 regras  → cai no lembrete (anota)
    1 regra   → executa:
        anotar     → cria lembrete
        consultar  → SELECT seguro (allowlist + empresa_id) → responde dado real
        alterar KM → propose→confirm (preview + "sim" + revalida + optimistic lock)
        outra gravação → "em construção" (NÃO grava)
    2+ regras → pergunta "1️⃣ X 2️⃣ Y 3️⃣ Z" (máx 3) e guarda pendência
```

Ponto de integração: `messageRouter.ts → processarMensagem`, bloco **1.3** (antes do
MODO_SOMENTE_LEMBRETE). Se `disparou` → encerra; senão → segue pro lembrete.

## Segurança (o que os agentes prescreveram e está implementado)

| Lição | Onde |
|---|---|
| IA **não monta SQL** — sistema gera de allowlist (`escopo_dados.colunas`) | `botExecutor.ts` |
| Allowlist + regex de identificador (anti-injection) | `colunasPermitidas`, `assertIdent` |
| **Filtro forçado `empresa_id`** em toda query (multi-tenant, lição L7) | `executarConsulta`, `commitAtualizarKm` |
| **Escrita só com propose→confirm** (preview → "sim") | `executarRegra` (KM) + `bot_estado_pendente` |
| **km nunca decresce** + revalida no commit | `commitAtualizarKm` |
| **Optimistic lock** (`updated_at` no WHERE; 0 linhas = conflito) | `commitAtualizarKm` |
| Confirmação **explícita** (sim/ok/pode…); ambíguo → não executa | `botParse.parseSimNao` |
| Estado pendente **no banco** com TTL (serverless, lição B1) | `bot_estado_pendente` (5 min) |
| **Idempotência** por wamid (WhatsApp entrega 2x) | `bot_msgs_processadas` |
| Gemini: **structured output** (não function calling ANY, que é instável) | `classificador.ts` |
| `thinkingBudget: 0` (latência/custo) | `classificador.ts` |
| **Fail-safe**: erro/timeout do Gemini → cai no lembrete (nunca muta nem fica mudo) | `classificarERotear` try/catch + Promise.race |
| Desambiguação **≤ 3 opções** numeradas (IBM/AWS) | `classificadorBot` |

## Validado (teste ao vivo, Gemini real + dados reais)

| Mensagem | Resultado |
|---|---|
| "qual o km do leão" | 🚚 Leão (ABC0001): km_atual 270200 |
| "o km do leão agora é 280000" | ✏️ preview 270200→280000, pede confirmação |
| "o km do leão é 100000" | ⚠️ **RECUSA** (menor que atual — km não decresce) |
| "o leão está em manutenção" | 🤔 desambigua 1/2/3 |
| "quais caminhões eu tenho" | 📋 lista os 5 |

Testes unitários: `src/__tests__/whatsapp/botParse.test.ts` + `botExecutor.test.ts` (parsers + allowlist + km).

## O que AINDA NÃO está ligado (próximas fases)

1. **Escritas não-KM** (mudar status, registrar) — respondem "em construção" (não gravam).
   Falta generalizar o propose→confirm pra UPDATE/INSERT de outras colunas.
2. ✅ **Áudio JÁ funciona** no modo classificador (transcreve via Deepgram/Whisper antes de
   classificar — `classificarERotear`).
3. **Fila/ACK assíncrono** (QStash) — hoje é síncrono; a pesquisa recomenda ACK rápido +
   worker pra escalar. Aceitável no volume atual.
4. **Consultar Financeiro** — tabela `financeiro` ainda não está na curadoria de colunas.
5. **Rate-limit por telefone** e observabilidade com PII redigida — recomendados pela pesquisa.

## Bugs/lições novas pro catálogo do framework

- **B-CLS-1**: tabelas sem coluna `id` (ex: `bot_estado_pendente`, PK=telefone) quebram o
  `DeleteBtn` genérico (`.eq("id")` vira `never` na união de tabelas). Fix: `DeleteBtn` agora
  restringe o tipo às tabelas que têm `id`.
- **B-CLS-2**: SELECT com colunas dinâmicas no supabase-js tipado retorna `GenericStringError[]`
  — cast via `unknown`. As colunas vêm sempre da allowlist (seguro).
- **B-CLS-3**: function calling mode ANY do Gemini 2.5 é instável (500s, às vezes texto). Usamos
  **structured output** pra classificar E extrair (alvo/valor) numa só chamada.

---

## 🔍 AUDITORIA 06/06/2026 — 24 agentes (docs oficiais + fóruns + revisão de código)

> Varredura de Supabase/PostgREST, Gemini, Deepgram, Evolution, Vercel, Zod + revisão do nosso
> código. **Veredito: profissionalismo 8/10 · baixa-manutenção 5.5/10.** Arquitetura sólida
> (idempotência, estado em banco com TTL, optimistic lock, KM monotônico, allowlist determinística,
> fail-safe, parsers testáveis). Notas abaixo por causa de 3 dívidas: SDK Gemini EOL, lock por
> `updated_at` com furo, e parse do Gemini sem validação runtime + docs desatualizadas.

### 🔴 Riscos ALTA prioridade (o código ainda NÃO trata) — corrigir

| # | Risco | Como resolver |
|---|---|---|
| R1 | **Optimistic lock "falha passando"**: PATCH que casa 0 linhas retorna `200 []` (não erro); ms-JS ≠ µs-Postgres faz o `.eq(updated_at)` às vezes nunca casar. Sem trigger de `updated_at` no DB. | Lock por valor de negócio: `UPDATE ... WHERE id AND empresa_id AND km_atual=$kmLido`; checar `data.length>=1`; criar trigger `set_updated_at`. (`botExecutor.ts:112-122`) |
| R2 | **`updated_at` NULL desliga o lock** (veículo legado) → 2 commits passam. | Rejeitar commit se `updatedAtEsperado==null` (resolvido junto com R1). |
| R3 | **Race no estado pendente** + `.in(variacoesTelefone)` não-determinístico → "1" executa ação errada. | Canonicizar telefone uma vez e usar `.eq(canon)`; validar `pend.tipo`; coluna `versao`. (`classificadorBot.ts:54-61,122-143`) |
| R4 | **Mensagem perdida**: wamid marcado ANTES de processar; crash descarta a reentrega da Evolution. | wamid `status='processando'`→`ok` no fim, ou `DELETE` no `catch`. (`classificadorBot.ts:151-154`) |
| R5 | **Vazamento multi-tenant**: `empresa_id` pode ser NULL no `anotar`. RLS off → allowlist+empresa_id é a única barreira. | Early-return se `!empresaId`; camada única que injeta `.eq('empresa_id')`. (`classificadorBot.ts:72-82`) |
| R6 | **`remoteJid` como `NNN@lid`** (migração WhatsApp LID) → auth falha e `sendText` dá `exists:false`. | Detectar `@lid`, buscar `senderPn`, cache jid↔telefone. (`messageParser`/`telefone.ts`) |
| R7 | **Evolution v2.3.x engole msg única como "Duplicated"** (cache Redis #2110) → bot mudo. | Confirmar versão; heartbeat alertando ausência de webhook. |
| R8/R10 | **Sem timeout/AbortController** no fetch Gemini/Deepgram → pendura e estoura `maxDuration`. | `AbortController` ~9s Gemini, ~15-20s Deepgram (o `Promise.race` atual não cancela o request). |
| R9 | **429 por quota DIÁRIA** (free 2.5 Flash = 250 RPD/projeto), `retryDelay:'1s'` engana. | Habilitar billing Tier 1; distinguir `PerDay` (fail-safe) de RPM (retry). |
| R11 | **Transcrição vazia tratada como sucesso** → Gemini alucina sobre nada e ALTERA KM. | Ler `confidence`+`duration`; vazio/<0.5s/<0.55 → `{ok:false}`. (`deepgramClient.ts:189`) |
| R12 | **`responseSchema` + tools = 400 no Gemini 2.5** (regressão do 2.0). | Um paradigma por request; guard rejeita as duas configs juntas. |
| R13 | **`thinkingBudget=0` + structured → resposta VAZIA** (`finishReason:MAX_TOKENS`). | `maxOutputTokens>=1024`; tratar texto vazio/MAX_TOKENS como erro retryável. |
| R14 | **JSON do Gemini com cercas ```json / loop** → `JSON.parse` lança → NO-OP silencioso. | Parse defensivo (trim, remover cercas, 1º`{`→último`}`); logar `txt` cru. |
| R15 | **Cast cego sem validação runtime**: `as Decisao` (`classificador.ts:89`), `as EvolutionWebhookPayload`, `pend.dados as Pendente`. | `safeParse` Zod (já em ^4.4.3) nas 3 fronteiras. |

### 🟡 Média/baixa
Reduzir `VOCAB_FROTA_FIXO` p/ 20-40 termos raros · fallback `pt-BR`→`multi` no Deepgram (400) ·
`raciocinio` antes de `regras` no schema (chain-of-thought) · refatorar `.or()` interpolado
(`gestorFlow.ts:398`) · contador de tentativas na desambiguação (auto-cancela em 3) · job de
limpeza de `bot_estado_pendente` expirado · `import 'server-only'` no client service-role ·
`security_invoker=true` nas views financeiras · testes faltando (`classificador`, `classificadorBot`,
`montarContexto`, `telefone`).

### 🧨 "Bugs bobos" pré-detectados (detalhe obscuro que custa 10h) — com fonte
- PostgREST: PATCH 0 linhas = `200 []`, não erro — https://github.com/PostgREST/postgrest/issues/2343
- Lock `updated_at`: ms-JS ≠ µs-Postgres — https://github.com/supabase/supabase-js/issues/1645
- **Supabase BREAKING 30/10/2026**: tabela nova sem GRANT some da Data API mesmo com service_role — https://github.com/orgs/supabase/discussions/45329
- Gemini 2.5: `responseSchema`+tools = 400 — https://github.com/googleapis/python-genai/issues/706
- Gemini: thinking come `maxOutputTokens` → `content:{}` vazio — https://github.com/valentinfrlch/ha-llmvision/issues/609
- **SDK `@google/generative-ai` EOL 30/11/2025** — migrar p/ `@google/genai` atrás de adapter — https://github.com/google-gemini/deprecated-generative-ai-js
- SDK novo: `response.text()` (método) → `response.text` (propriedade) — passa no TS, explode runtime
- Deepgram-JS: timeout fixo ~5min + ghost requests estouram 429 — https://github.com/orgs/deepgram/discussions/586
- Deepgram smart_format: "cem por cento"→"10%" (numeral errado → KM/despesa errada) — https://github.com/orgs/deepgram/discussions/1168
- Evolution insere 9º dígito → JID inexistente; reusar `remoteJid` do webhook — https://github.com/EvolutionAPI/evolution-api/issues/2062
- Evolution `event` no payload é `messages.upsert` (minúsculo) vs `MESSAGES_UPSERT` na config — doc oficial
- Vercel mata `void promise` ao responder (ok em dev, morre em prod) — usar `waitUntil`/`after`
- Zod v4: `z.coerce.number('')===0`, `z.coerce.boolean('false')===true` — https://github.com/colinhacks/zod/issues/2461

### 📚 Doc desatualizada a corrigir (próximo passo)
`BOT_FRAMEWORK.md` §2/§5 ensina **tools do Gemini que não existem mais** (modo classificador não
usa function calling — é o `botExecutor` que monta o SQL). `framework/01-whatsapp-bot/como-adicionar-tool.md`
e `como-consultar-tabela.md` estão obsoletos. `arquitetura.md` não cita `MODO_CLASSIFICADOR`. Este
documento (BOT_CLASSIFICADOR_INTEGRACAO.md) é a **fonte de verdade do sistema atual**.
