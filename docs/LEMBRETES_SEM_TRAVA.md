# 📌 Lembretes SEM TRAVA + Realtime

> **Decisão do dono (05/06/2026):** o bot deve anotar lembrete de **QUALQUER**
> número que falar com ele — cadastrado ou não, conhecido ou não. **Nenhuma
> regra** (empresa, usuário, motorista, papel/role, RLS). As travas voltam
> **DEPOIS**, quando o dono pedir explicitamente.
>
> ⚠️ **NÃO reintroduza validação / RLS / FK / filtro de role sem ordem explícita do dono.**

Este doc fica **fora** do `framework/` de propósito (é uma decisão pontual de
produto, não parte da doc estrutural). Referenciado no `framework/INDEX.md`.

---

## 1. O que é

Qualquer mensagem que chega no bot vira um registro na tabela `lembretes`, sem
passar por nenhuma trava. O painel (`LembretesWidget`) mostra **todos** os
lembretes pra **qualquer** login, e se atualiza **instantaneamente** (push via
Supabase Realtime) quando um lembrete entra/muda/sai.

**Fluxo fim-a-fim:**
```
Qualquer número  →  WhatsApp (Evolution)  →  POST /api/whatsapp/webhook
  →  processarMensagem (MODO_SOMENTE_LEMBRETE)  →  criarLembrete()
  →  INSERT em `lembretes` (service-role, sem RLS)
  →  Postgres dispara Realtime  →  LembretesWidget recarrega NA HORA
```

---

## 2. O bug que disparou tudo

O lembrete **gravava** mas **não aparecia** no painel. Causa: o dono logava com a
conta `borba@frota.sys` (papel **motorista**), e o `GET /api/lembretes` só
liberava `master`/`gestor` → devolvia lista vazia ("Nenhum lembrete registrado
ainda"). Não era bug de gravação; era trava de leitura por papel + RLS.

**Contexto de contas / empresa (projeto ltfthfbounngaubwsxfw):**
- `ronaldo@ronaldoborba.com.br` → **master**
- `borba@frota.sys` → **motorista** (mesmo telefone do zap: `553189791317`)
- Empresa única: **DELAFRAY TRANSPORTES** — `84dead56-1e3a-4476-9b2b-6b166402c84d`

---

## 3. Mudanças no CÓDIGO

| Arquivo | O que mudou |
|---|---|
| `src/lib/whatsapp/messageRouter.ts` | Bloco `MODO_SOMENTE_LEMBRETE` movido pra **antes** do filtro de `desconhecido` → número desconhecido também vira lembrete (não é mais descartado). |
| `src/lib/ai/tools/frotaTools.ts` | `criarLembrete` não exige empresa; `getEmpresaDefault()` preenche a 1ª empresa enquanto o schema pedir; aceita `null` após a migration. |
| `src/app/api/lembretes/route.ts` | GET sem auth, sem role, sem filtro de empresa, via **service-role** (`createAdminClient`) → traz TUDO. Fallback se o embed `perfis` quebrar. |
| `src/app/api/lembretes/[id]/ciente/route.ts` | PATCH sem auth, sem role, service-role, `ciente_por: null`. |
| `src/components/dashboard/LembretesWidget.tsx` | **Sem polling.** Subscription **Supabase Realtime** (`postgres_changes` em `lembretes`) → recarrega na hora. Refresh extra ao voltar o foco da aba. |

**Flag de modo:** `MODO_SOMENTE_LEMBRETE` (em `messageRouter.ts`) — default **LIGADO**
em produção/dev, desligado em testes. Override: env `MODO_SOMENTE_LEMBRETE=true|false`.
Se setarem `=false` na Vercel, número desconhecido volta a ser descartado.

---

## 4. Mudanças no BANCO (schema)

Rodadas via `db/migration_lembretes_sem_trava.sql` (SQL Editor do Supabase).
Verificado: 0 FKs, `relrowsecurity=false`, insert sem empresa/usuário grava,
publication contém `public | lembretes`, REPLICA IDENTITY = FULL.

1. `empresa_id` e `usuario_id` → **NULLABLE** (drop NOT NULL).
2. **Todas as foreign keys** da tabela dropadas (empresa, usuario, ciente_por).
3. **RLS desligada** + policies removidas.
4. `GRANT ALL ON lembretes TO anon, authenticated, service_role`.
5. **Realtime ligado:** tabela adicionada à publication `supabase_realtime` +
   `REPLICA IDENTITY FULL`.

> Pra mandar outra IA (com acesso ao Supabase) aplicar/refazer: usar o prompt
> pronto em `db/PROMPT_outra_ia_rodar_migration.md`.

---

## 5. Como REVERTER (recolocar as travas — só quando o dono pedir)

- **Banco:** ver bloco comentado no fim de `db/migration_lembretes_sem_trava.sql`
  (re-enable RLS, recriar FK de `empresa_id`, voltar NOT NULL, recriar policies
  do `db/migration_lembretes.sql`).
- **Código:** voltar os gates de role/auth nas rotas `api/lembretes/*` e o filtro
  de `desconhecido` no `messageRouter.ts`.
- **Realtime:** pode permanecer ligado (não é trava). Para desligar:
  `ALTER PUBLICATION supabase_realtime DROP TABLE lembretes;`.

---

## 6. Checklist pra funcionar em produção

1. ✅ SQL de destrave + Realtime rodado no Supabase.
2. ✅ Código deployado na Vercel (`git push` → build).
3. ⚙️ Env na Vercel: `MODO_SOMENTE_LEMBRETE` **não** pode estar `=false`;
   `SUPABASE_SERVICE_ROLE_KEY` e `NEXT_PUBLIC_SUPABASE_URL`/`_ANON_KEY` setadas.
4. ⚙️ Evolution API conectada (instância `frota-bot-novo`).
5. ⚙️ Realtime habilitado no projeto Supabase (Dashboard → Database → Replication).

---

*Histórico: 05/06/2026 — destrave total de lembretes + Realtime instantâneo.
Arquivos de apoio: `db/migration_lembretes_sem_trava.sql`,
`db/PROMPT_outra_ia_rodar_migration.md`.*
