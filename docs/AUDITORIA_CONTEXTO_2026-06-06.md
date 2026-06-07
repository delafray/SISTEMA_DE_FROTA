# 🧠 Auditoria do Motor de Contexto/Memória — 27 agentes (06/06/2026, 04:10)

> Auditoria autônoma agendada pelo dono. 27 agentes (4 varrem código · 8 adversariais ·
> 4 verificam vs código · 8 validam na web · 3 sintetizam). **91 dúvidas levantadas.**
> ~1,7M tokens. **NENHUM código foi alterado** — só análise.

## VEREDITO — nota média **5,7/10** (sínteses: 6 · 5,5 · 5,5)

**Conceito/arquitetura: certo e acima da média.** O motor é um Dialogue State Tracking
honesto: dual-gate TTL+turns (padrão Dialogflow/Rasa), telefone canônico, escrita de KM
exemplar (propose→confirm + optimistic lock + km monotônico). **Robustez de produção:
incompleta.** Para 1 empresa / poucos caminhões / conversa sequencial (o caso de hoje),
**funciona bem**. Para multi-empresa, grupos de WhatsApp ou concorrência (serverless paralelo),
precisa de blindagem antes de confiar. Resumo: **bom esqueleto, faltam vértebras.**

---

## ✅ O QUE ESTÁ CERTO (manter — consenso dos 3)
- **Dual-gate TTL (10min) + turns (6)** pra expirar o "assunto atual" — alinhado a Dialogflow/Rasa.
- **Telefone SEMPRE canônico** em ler/salvar/limpar (contexto e pendente) — evita o estado "sumir".
- **Escrita de KM exemplar:** propose→confirm, re-leitura no commit, km só aumenta, optimistic lock
  por valor (`.eq('km_atual', esperado)`). **TOCTOU coberto.** (botExecutor.ts:116-130)
- **Eco "Assumindo o Leão (do contexto)"** antes de GRAVAR KM — confirmação no ponto de maior risco.
- **Limpeza ao mudar de domínio** (regra não-veículo → esquece o caminhão).
- **Pendente separado** (TTL 5min) + abandono gracioso (não trava no "sim/não").
- **Fail-safe total** (erro → cai no lembrete, nunca lança) + **idempotência por wamid**.

---

## 🔴 OS 3 FUROS ALTOS (corrigir antes de escalar)

### 1. ⚠️ CRÍTICO — Consulta de alocações/abastecimentos vaza TODOS os caminhões
"qual o status **desse**?" com contexto=Leão → retorna status de **TODOS os caminhões da empresa**
(até 20), e o caminhão do contexto é **silenciosamente ignorado**. Furo de **privacidade/correção**,
não só UX. O filtro por `veiculo_id` só existe pra tabela `veiculos`; em `alocacoes`/`abastecimentos`
a query é genérica (`WHERE empresa_id`).
**Como corrigir:** `botExecutor.ts:92-94` — quando a tabela tem `veiculo_id` e há alvo resolvido,
adicionar `.eq('veiculo_id', id)`. Passar o `veiculo_id` resolvido (não só o apelido) de
`classificadorBot.ts:177`. Sem caminhão resolvido → perguntar "de qual caminhão?" em vez de listar tudo.

### 2. Race condition no contador `turns` (read-modify-write não atômico)
`lerContexto` e `salvarContexto` são 2 operações sem atomicidade; o app calcula `turns+1` em JS e
regrava (last-write-wins). Em rajada/grupo, duas mensagens leem `turns=N` e ambas gravam `N+1` →
o dual-gate desincroniza. Não corrompe dado de negócio, mas fura a proteção anti-"pinning".
**Como corrigir:** incremento atômico no banco — RPC/SQL `UPDATE ... SET turns = turns + 1 RETURNING`,
ou `pg_advisory_xact_lock(hashtext(telefone))` pra serializar por telefone. (classificadorBot.ts:142-143,156,177)

### 3. Cache sem `empresa_id` → ❌ NÃO CORRIGIR (decisão de negócio, 06/06/2026)
> **O DONO DECIDIU:** as várias "empresas" cadastradas são **CNPJs fiscais de UMA empresa real**
> (ex: 10 empresas × 7 caminhões = todos da mesma operação). O sistema **NÃO é SaaS** e **NÃO deve
> travar por empresa** — o contexto e tudo mais devem ler **todas as empresas como uma só**.
> Portanto **não adicionar `empresa_id`** ao cache/pendente — isso fragmentaria uma empresa só.
> Watch-item futuro: se um dia houver múltiplos `empresa_id` (split fiscal de fato), o bot deve
> ler ACROSS todos eles (tratar como um), e não isolar. Hoje há 1 só `empresa_id` — nada a fazer.

~~Descrição original do "risco" (mantida só como histórico da auditoria):~~ Cache sem `empresa_id` (CONDICIONAL)
`bot_contexto_conversa` e `bot_estado_pendente` têm **PK só telefone**, sem `empresa_id`. Se um número
estiver em 2 empresas, vaza o "assunto atual" e o pendente (o pior: o pendente "anotar" **não revalida
empresa**). **Mitigação parcial JÁ existe:** `acharVeiculo` e `commitAtualizarKm` re-resolvem por
`empresa_id`, então o cache se auto-corrige na maioria dos caminhos; e o índice UNIQUE de `telefones`
força telefone global único. **Risco residual:** confusão de UX e o pendente de A respondido por B.
**Como corrigir:** `empresa_id` nas 2 tabelas + PK composta `(telefone, empresa_id)` + propagar
`identity.empresa_id` em ler/salvar/limpar. (migration_bot_contexto_conversa.sql + classificadorBot.ts:67-106)
**Curto prazo:** garantir no cadastro que 1 telefone = 1 empresa (já forçado pelo UNIQUE).

---

## 🟡 MÉDIOS
- **Eco só na escrita** — consulta "desse" responde do Leão sem avisar; o eco só aparece depois no KM
  e surpreende. → prefixar a consulta com o mesmo aviso quando `doContexto` (classificadorBot.ts:170-179).
- **Double-increment de `turns` em erro** — `salvarContexto(turns+1)` roda ANTES de `executarConsulta`;
  se a consulta falha, `turns` já subiu e o retry soma de novo. → salvar `turns` só após sucesso.
- **Sem multi-slot e sem 2 entidades** — só guarda o caminhão; não trata "compara Leão e Touro",
  "o outro", "o segundo", motorista nem período. Hoje usa o 1º silenciosamente. → curto prazo:
  detectar 2 alvos e responder "trato um caminhão por vez — qual?".
- **Confiança cega no alvo do Gemini** — se ele alucina um apelido, trata como nomeado e ignora o
  contexto. → validar o alvo contra a lista de veículos antes de cravar como "nomeado".
- **Cache não revalida veículo inativado/renomeado** — `acharVeiculo` já filtra `ativo`, mas o contexto
  fica "zumbi" até o TTL. → limpar o contexto quando `acharVeiculo` retorna "nenhum" a partir do contexto.

## 🟢 BAIXOS
- `REF_GENERICA` (regex de 9 termos) não cobre ordinais/compostos ("o outro", "o segundo").
- Linhas expiradas de contexto/pendente nunca são deletadas (lixo no banco) — falta cron de limpeza.

---

## 📚 Fontes que sustentam (top)
- Dialogflow contexts (lifespan turns+tempo) — valida o dual-gate: https://cloud.google.com/dialogflow/es/docs/contexts-overview
- Rasa slots (multi-slot: veículo+motorista+período) — caminho pra superar o slot único: https://rasa.com/docs/rasa/domain/#slots
- Supabase RLS (service_role bypassa → barreira é o app) — sustenta o risco do empresa_id: https://supabase.com/docs/guides/database/postgres/row-level-security
- Postgres locking / advisory locks — base pra corrigir a race do `turns`: https://www.postgresql.org/docs/current/explicit-locking.html
- Supabase functions (RPC pra incremento atômico): https://supabase.com/docs/guides/database/functions

## Recomendação de ordem (quando for corrigir)
1. **Furo #1** (filtro veiculo_id nas consultas) — mais visível ao usuário, é correção + privacidade.
2. **Furo #3** (empresa_id no cache) — fechar antes de qualquer multi-empresa.
3. **Furo #2** (turns atômico) — quando o volume/concorrência crescer.
4. Médios (eco na consulta, double-increment, validar alvo) — rápidos.

> **Para hoje (1 empresa, baixa concorrência) o motor roda na prática.** Os furos altos são
> dívida pra escalar — nenhum derruba o sistema agora, mas o #1 (vazar dados entre caminhões na
> consulta) é o que mais vale corrigir cedo.
