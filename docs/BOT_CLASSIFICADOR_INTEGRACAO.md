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
2. **Áudio no modo classificador** — por ora áudio cai no lembrete (transcrição via Deepgram
   já existe; é só plugar antes de classificar).
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
