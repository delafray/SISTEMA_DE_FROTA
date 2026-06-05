# 🔧 Bug de Lembretes via WhatsApp — Documento de Contexto Vivo

> **PROPÓSITO DESTE ARQUIVO:** registrar TODO o contexto da investigação do bug de lembretes
> para sobreviver a perdas de contexto/token entre sessões. Se você é uma IA retomando este
> trabalho, **leia o topo primeiro** (STATUS ATUAL). O histórico do diagnóstico original (gerado
> por 30 agentes) está no final, já anotado com o que foi resolvido ou superado.
>
> Última atualização: 2026-06-04 (sessão Claude Opus 4.8).

---

## 🔁 REESCRITA — "Modo Somente Lembrete" (2026-06-05)

Decisão do dono após o function calling do Gemini se mostrar inconsistente: **por enquanto o bot
faz UMA coisa só — gravar lembrete.** Reescrito do zero, determinístico, **sem LLM no caminho**.

- **`MODO_SOMENTE_LEMBRETE`** (`messageRouter.ts`): quando ligado, TODA mensagem (texto ou áudio) de
  qualquer número cadastrado vira um registro na tabela `lembretes`, interceptada no topo de
  `processarMensagem` — antes de sessão, cota, role, menu e Gemini.
- Texto → salva direto. Áudio → transcreve (Deepgram via `messageId`, não `mediaId`) e salva o texto.
- **Liga/desliga:** default LIGADO em produção/dev, DESLIGADO em teste (`NODE_ENV==='test'`); override
  por env `MODO_SOMENTE_LEMBRETE=true|false`. **Para devolver o bot completo: `MODO_SOMENTE_LEMBRETE=false`.**
- Logs em cada etapa (`modo_somente_lembrete`, `lembrete_salvando`, `lembrete_salvo`, `lembrete_falhou`).
- **Verificado contra o Supabase REAL:** insert/leitura funcionam fim-a-fim (a tabela estava VAZIA — nenhum
  lembrete jamais fora salvo, confirmando que o bug era 100% o `criarLembrete` nunca ser chamado).
- ⚠️ **PENDÊNCIA DE BANCO:** o `service_role` **não tem GRANT de DELETE** (nem provavelmente UPDATE) em
  `lembretes` (erro `42501`). Isso quebra "dar ciência"/apagar pelo painel. Rodar no SQL editor do Supabase:
  `GRANT DELETE, UPDATE ON public.lembretes TO service_role;` (não tenho acesso de DDL pra rodar isso).
- Suíte: **1208/1208** ✅ (modo desligado em teste preserva o roteamento antigo).

---

## ✅✅ RESOLUÇÃO FINAL — 2 bugs distintos, ambos resolvidos

Foram **dois** bugs separados que produziam o mesmo sintoma ("lembrete não funciona"):

### Bug 1 — TRANSPORTE (webhook) — ✅ RESOLVIDO
Evolution API disparava o webhook pra uma **URL de preview velha** do Vercel em vez de produção.
Corrigido via `/webhook/set/frota-bot-novo` → `https://sistema-de-frota.vercel.app/api/whatsapp/webhook`.
Por isso o bot voltou a **receber e responder**. (Detalhes no histórico abaixo.)

### Bug 2 — PERSISTÊNCIA (o "ok" vazio) — ✅ RESOLVIDO (workflow de 30 agentes)
O bot respondia "Ok, lembrete registrado" mas **não gravava no Supabase**. Investigado por 30 agentes
(docs oficiais Google/Vercel/Supabase/Deepgram + fóruns + leitura do código). **Causa raiz combinada:**

1. **Function calling em modo AUTO (default).** `geminiClient.ts` nunca setava
   `toolConfig.functionCallingConfig.mode`. Em AUTO o gemini-2.5-flash PODE, por design, responder
   texto ("ok") em vez de emitir a `functionCall criar_lembrete`. Não é bug do modelo — é o contrato do AUTO.
2. **Gestor não-ocioso nunca chegava na tool.** `rotearGestor → processarGestorFlow` usa um classificador
   de intent que **não tinha intent de lembrete** → caía em fallback → menu.
3. **Parser determinístico escondido atrás de 2 gates** (sessão ociosa + cota do Gemini). Cota estourada
   = parser (custo 0 token) nem rodava.
4. `thinkingBudget:0` agravava a decisão de quando chamar a tool.

**Hipóteses REFUTADAS** (não reinvestigar): tool fora do array (estava lá), system prompt recusando
(ele mandava usar a tool), multi-turn quebrado (functionResponse era reenviado), `properties:{}` quebrando
em AUTO (as listagens funcionavam em prod — mas vira armadilha em modo ANY).

**Correção aplicada** (8 itens, 1208/1208 testes ✅, `tsc`/`eslint` limpos):
- Tools sem parâmetro agora **omitem** `parameters` (era `properties:{}` — quebraria em ANY) + sanitizer defensivo.
- `chatGemini(forcarTool)`: 1ª rodada em **mode ANY restrito a `criar_lembrete`**, depois reabre a sessão em
  AUTO com `getHistory()` (evita loop infinito). `temperature:0` e `thinkingBudget:128`.
- **Parser determinístico movido pro topo de `processarMensagem`** — antes de cota/sessão/role. Gatilho exato
  ("lembrete:", "me lembra", "anota") salva 100%, sempre.
- **Gestor**: guarda determinística de lembrete antes do classificador.
- **Sinal leve** ("guarda", "registra", "salva", "não esquece" — exceto "nota fiscal") **força a tool via ANY**.
- Atribuição `criado_por_nome/telefone` também pela tool; **logs estruturados** em todo o caminho.

### 🛡️ PREVENÇÃO — regras pra nunca mais acontecer
- **Nunca confiar no modo AUTO para ações que DEVEM persistir (escrita).** Toda ação transacional precisa de:
  (a) caminho determinístico primário, OU (b) `mode ANY + allowedFunctionNames` restrito naquele turno, + (c)
  fallback que detecta ausência de `functionCall`. AUTO é livre pra responder texto — é contrato da API.
- **Parser determinístico SEMPRE antes de qualquer gate** (cota, estado de sessão, role). Custa 0 token.
- **Toda funcionalidade nova do bot deve ser testada nos 3 roles** (motorista, gestor, master) **e** em sessão
  ociosa **e** com flow pendente. O bug do gestor passou porque só se testou "motorista ocioso".
- **Tools sem parâmetro: SEMPRE omitir `parameters`, nunca `properties:{}`.** Há teste de guarda que falha o build se reaparecer.
- **Comentário que afirma comportamento deve refletir o roteamento real.** O `gestorFlow.ts:20` ("lembretes agora
  são tool do Gemini") mascarava que o gestor não passava pelo chatGemini com tools.
- **Logar presença/ausência de `functionCall`.** Sem isso é impossível diagnosticar em produção.
- **Confirmar persistência com `.select()`** e checar o `error` completo — supabase-js nunca lança exceção.
- ✅ **RISCO LATERAL BLINDADO EM CÓDIGO** (`src/app/api/whatsapp/reconectar/route.ts`): o fallback perigoso
  `VERCEL_URL` (preview, muda a cada deploy — causa original do Bug 1) foi **removido**. Agora a URL do webhook
  resolve por `APP_URL` → `VERCEL_PROJECT_PRODUCTION_URL` (alias estável), com **guarda anti-regressão** que
  recusa qualquer URL com cara de preview (`projeto-<hash>-<scope>.vercel.app`) e loga `reconectar_webhook_url`.
  **AÇÃO DE INFRA ainda necessária:** garantir a env `APP_URL` (Production) = domínio fixo (ex:
  `https://sistema-de-frota.vercel.app`) no Vercel. Sem APP_URL nem VERCEL_PROJECT_PRODUCTION_URL, o "Reconectar"
  agora **falha com erro claro** em vez de gravar uma URL quebrada silenciosamente.

---

## 🎯 STATUS ATUAL (TL;DR — leia isto primeiro)

**Sintoma relatado pelo dono:** "Quando peço pelo zap pra criar um lembrete, o bot não entende e
não aparece nenhum log no Vercel."

**CAUSA RAIZ CONFIRMADA (a "arma do crime"):**
A instância da **Evolution API** (`frota-bot-novo`, na VM Ubuntu `129.80.27.159:8080`) estava
disparando o webhook das mensagens do WhatsApp para uma **URL de PREVIEW ANTIGA do Vercel**, em
vez da URL de produção. Por isso a mensagem chegava no WhatsApp, a Evolution disparava o POST,
mas mandava pro ambiente errado → **zero log em produção** → lembrete nunca era salvo.

- ❌ URL errada (preview velho): `https://sistema-de-frota-qcymmnkwc-delafrays-projects.vercel.app/api/whatsapp/webhook`
- ✅ URL correta (produção):     `https://sistema-de-frota.vercel.app/api/whatsapp/webhook`

**NÃO é bug do código de lembrete, nem do banco.** O código (`criar_lembrete` tool + parser
determinístico) e a tabela `lembretes` estão corretos. O problema é puramente de **transporte/config**.

### ✅ Já descartado / confirmado OK
- **Banco (`lembretes`):** tabela correta. `usuario_id` aceita NULL; colunas `criado_por_nome` e
  `criado_por_telefone` existem; FKs (`usuario_id`, `ciente_por`) migradas apontando pra `perfis(id)`
  (ON DELETE CASCADE / SET NULL); migrations `migration_lembretes.sql`, `migration_fix_lembretes_fk.sql`,
  `migration_lembretes_qualquer_usuario.sql` aplicadas em produção.
- **Evolution API:** funcionando, instância `frota-bot-novo` com `state: OPEN`, número
  `55 31 9841-1123` autenticado e ativo. Eventos `MESSAGES_UPSERT` habilitados.
- **App:** roda **exclusivamente no Vercel** (NÃO roda na VM). A VM é só gateway WhatsApp + ferramentas
  de mapa (OSRM, Vroom, Overpass). Endpoint de produção `…/api/whatsapp/webhook` responde (HTTP 405 a
  GET = correto, está de pé escutando POST).

### 🔧 CORREÇÃO A APLICAR (ainda NÃO foi feita — aguardando o dono)
Sobrescrever a URL do webhook na Evolution via endpoint `/webhook/set/frota-bot-novo`, apontando para
`https://sistema-de-frota.vercel.app/api/whatsapp/webhook`, mantendo `enabled: true` e os eventos
(`MESSAGES_UPSERT`, `CONNECTION_UPDATE`, `QRCODE_UPDATED`).
> ⚠️ Quem executa isso é a IA/agente com acesso SSH à VM Ubuntu (esta sessão Claude Code NÃO tem acesso à VM).

### ⚠️ PONTO EM ABERTO — risco de regressão (PRECISA INVESTIGAR NO CÓDIGO)
Trocar a URL na mão resolve **agora**, mas falta descobrir **POR QUE** o webhook virou uma URL de
preview. **Hipótese principal:** existe algum script de deploy (no repo ou na VM) que re-seta o
webhook automaticamente usando `process.env.VERCEL_URL` — que sempre retorna a URL específica do
deploy/preview, **não** o domínio de produção. Se for isso, **o bug volta a cada deploy**.
- **TODO:** procurar no repo por `webhook/set`, `VERCEL_URL`, `setWebhook`, URLs `*.vercel.app`,
  scripts `.sh`/CI que configurem o webhook. Se achar, trocar `VERCEL_URL` por um domínio fixo de
  produção (ex.: env `NEXT_PUBLIC_APP_URL` ou hardcode do domínio estável).
- Esta verificação **ainda não foi feita** — foi adiada a pedido do dono.

---

## 🗺️ Mapa da arquitetura (como a mensagem viaja)

```
WhatsApp (cel 55 31 9841-1123)
        │
        ▼
Evolution API  ──(instância frota-bot-novo, VM Ubuntu 129.80.27.159:8080)
        │  dispara webhook POST no evento MESSAGES_UPSERT
        ▼
  >>> AQUI ESTAVA O BUG: POST ia pra URL de PREVIEW velha <<<
        │
        ▼
Vercel (produção)  ──  /api/whatsapp/webhook
        │
        ▼
src/lib/whatsapp/messageRouter.ts  →  processarMensagem()
        │  (sessão ociosa + cota Gemini OK)
        ▼
rotearComGemini() → tentarLembreteDeterministico() → extrairLembrete() (parser)
        │
        ▼
criarLembrete() (src/lib/ai/tools/frotaTools.ts) → INSERT na tabela `lembretes` (Supabase)
        │
        ▼
LembretesWidget (painel do gestor) mostra o lembrete até alguém dar ciência
```

---

## 🔍 Achados secundários no código (NÃO são a causa, mas vale anotar)

Encontrados ao ler o código nesta investigação. Não bloqueiam o lembrete hoje (o problema é a URL),
mas são pontos de fragilidade pra revisar depois:

1. **Lembrete determinístico está atrás da cota do Gemini.** Em `messageRouter.ts`, o
   `tentarLembreteDeterministico()` só roda **dentro** de `rotearComGemini`, que por sua vez só é
   chamado se `cotaGeminiDisponivel()` estiver OK (linhas ~123-128). Como o lembrete é determinístico
   e **não usa IA**, se a cota do Gemini estourar o lembrete deixa de salvar sem necessidade. → Mover
   o check de lembrete pra ANTES da guarda de cota.

2. **Caminho do lembrete sem nenhum log.** A função `tentarLembreteDeterministico()`
   (`messageRouter.ts` ~803-818) não tem nenhum `log.*`. Mesmo com a URL certa, se algo falhar ali
   (ex.: `empresaId` vazio → `criarLembrete` devolve "sem empresa identificada"), não aparece nada no
   Vercel. → Adicionar logs: entrada do texto, se o parser bateu, `empresaId`, e resultado do insert.

3. **Gate de "sessão ociosa".** O lembrete só é interceptado quando `sessao.estado` é `'novo'` ou
   `'aguardando_acao'` (`messageRouter.ts:114`). Se o usuário estiver no meio de outro fluxo, a
   mensagem de lembrete vai pro fluxo e não é salva. (Comportamento provavelmente intencional, mas
   anotado.)

4. **Schema vazio nas tools sem parâmetro** (`frotaTools.ts`): `listar_motoristas`, `listar_veiculos`,
   `meu_caminhao` declaram `parameters: { type: OBJECT, properties: {}, required: [] }`. O diagnóstico
   original alegava que isso quebra o Gemini com `properties` vazio. **Não confirmado como ativo** —
   anotar e validar se realmente causa erro no SDK atual antes de mexer.

---

## 📋 Histórico da investigação (sessão 2026-06-04)

Investigação feita por troca de relatórios entre esta IA (Claude Opus 4.8, acesso ao repo) e outra
IA (acesso SSH à VM Ubuntu).

- **Relatório 1 (Vercel + Supabase):** confirmou que a tabela `lembretes`, FKs e migrations estão
  corretas em produção; e que **não havia log nenhum** no Vercel no momento do teste — sinal de que o
  POST não chegava. (Deduziu a causa, mas não conseguia provar do lado do Vercel.)
- **Relatório 2 (VM Ubuntu / Evolution):** **provou** a causa — webhook da Evolution apontando pra URL
  de preview velha. Confirmou instância `OPEN`, número autenticado, app só no Vercel, endpoint de
  produção de pé.
- **Confirmação final:** instância `frota-bot-novo` OPEN, número `55 31 9841-1123` ativo. Único gargalo
  = URL do webhook desatualizada.

---
---

# 📜 HISTÓRICO — Diagnóstico Original (30 agentes) — PARCIALMENTE SUPERADO

> ⚠️ **ATENÇÃO:** o diagnóstico abaixo foi gerado ANTES da investigação atual e está **majoritariamente
> SUPERADO**. Boa parte do que ele aponta **já foi refatorada** no código (a tool `criar_lembrete` já
> existe, o parser determinístico já existe, o regex "assassino" já foi substituído). E a causa real do
> bug atual **não é nenhum** dos pontos abaixo — é a URL do webhook (ver topo). Mantido só como registro.

## 1. O Diagnóstico Original: Por que a IA estaria falhando?

### A. O Sequestro de Intenção pelo Regex ("anotar arquivo", "nota") — ⚠️ JÁ RESOLVIDO
Alegava que um regex `LEMBRETE_TEXTO` fast-path em `messageRouter.ts` sequestrava mensagens como "nota
fiscal" antes de chegar na IA.
> **Status atual:** substituído. Hoje existe `src/lib/whatsapp/lembreteParser.ts` (`extrairLembrete`)
> com gatilhos unívocos ("lembrete", "me lembra", "anota") que **não** dispara em "nota/registra/guarda"
> ambíguos. Não é mais a causa.

### B. O Bug Silencioso no `frotaTools.ts` que quebra o Gemini — ⚠️ NÃO CONFIRMADO
Alegava que `parameters: { properties: {}, required: [] }` em tools sem parâmetro quebra o Gemini.
> **Status atual:** o código ainda tem `properties: {}` em `listar_motoristas`/`listar_veiculos`/
> `meu_caminhao`, mas **não há evidência** de que isso esteja derrubando as tools hoje. Validar antes
> de mexer (ver "Achados secundários" #4).

### C. Ausência de Tabela de Pagamentos e Ferramenta de Texto — ℹ️ ESCOPO SEPARADO
Sobre a IA recusar registrar pagamentos só com texto (políticas financeiras).
> **Status atual:** assunto **diferente** do bug de lembretes. Fora de escopo desta investigação.

## 2. Plano de Ação Original (mantido como referência)

> Estes passos eram a recomendação do diagnóstico antigo. Vários já foram feitos (tool de lembrete
> criada, regex substituído). **Não executar cegamente** — a causa do bug atual é a URL do webhook.

### Passo 1: Ajustar o Regex em `messageRouter.ts` e `gestorFlow.ts` — ✅ feito (virou parser/tool)
### Passo 2: Corrigir o Schema Vazio em `frotaTools.ts` — ⚠️ pendente/não confirmado necessário
### Passo 3: Implementar Fluxo de "Despesa/Pagamento" via Texto (Permission Loop) — ℹ️ escopo separado
### Passo 4: Atualizar `TESTING.md` / testes — recomendado ao mexer no parser (política RECOMENDADA, não obrigatória)
