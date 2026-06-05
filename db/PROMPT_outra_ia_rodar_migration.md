# 🤖 PROMPT — Rodar migration "lembretes sem trava" no Supabase

> Cole TUDO abaixo (a partir de "TAREFA") no chat de uma IA que tenha acesso ao
> Supabase deste projeto (MCP do Supabase, SQL Editor, ou Supabase CLI linkado).
> O dono autorizou: remover TODAS as travas da tabela `lembretes`.

---

## TAREFA

Você tem acesso ao banco Supabase do projeto **SISTEMA_DE_FROTA**
(project ref: `ltfthfbounngaubwsxfw`). Preciso que você **execute um DDL** na
tabela `lembretes` e confirme o resultado. O objetivo é: **qualquer mensagem de
qualquer número que chega no bot deve gravar um lembrete, sem nenhuma trava** —
sem exigir empresa, usuário, motorista ou RLS.

### Passo 1 — Rodar este SQL (idempotente, pode rodar mais de uma vez)

```sql
-- empresa_id e usuario_id deixam de ser obrigatórios
ALTER TABLE lembretes ALTER COLUMN empresa_id DROP NOT NULL;
ALTER TABLE lembretes ALTER COLUMN usuario_id DROP NOT NULL;

-- derruba TODAS as foreign keys da tabela (empresa, usuario, ciente_por)
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'lembretes'::regclass AND contype = 'f'
  LOOP
    EXECUTE format('ALTER TABLE lembretes DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

-- desliga RLS e remove as policies
ALTER TABLE lembretes DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "gestor vê lembretes da empresa" ON lembretes;
DROP POLICY IF EXISTS "gestor cria lembrete"           ON lembretes;
DROP POLICY IF EXISTS "gestor dá ciente"               ON lembretes;

-- acesso total pra qualquer papel
GRANT ALL ON lembretes TO anon, authenticated, service_role;
```

### Passo 2 — Verificar (rode e me mostre o resultado das 3 queries)

```sql
-- (a) empresa_id e usuario_id devem aparecer como is_nullable = YES
SELECT column_name, is_nullable
FROM information_schema.columns
WHERE table_name = 'lembretes' AND column_name IN ('empresa_id','usuario_id');

-- (b) NÃO deve sobrar nenhuma foreign key (0 linhas = sucesso)
SELECT conname FROM pg_constraint
WHERE conrelid = 'lembretes'::regclass AND contype = 'f';

-- (c) RLS deve estar desligada: relrowsecurity = false
SELECT relrowsecurity FROM pg_class WHERE relname = 'lembretes';
```

### Passo 1.5 — Ligar o REALTIME (push instantâneo pro painel)

Faz o Postgres EMPURRAR cada mudança pro navegador, sem polling. Rode:

```sql
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'lembretes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE lembretes;
  END IF;
END $$;
ALTER TABLE lembretes REPLICA IDENTITY FULL;
```

Verificação (deve retornar 1 linha com a tabela `lembretes`):

```sql
SELECT schemaname, tablename FROM pg_publication_tables
WHERE pubname = 'supabase_realtime' AND tablename = 'lembretes';
```

Se o projeto não tiver a publication `supabase_realtime` (raro em projeto Supabase),
crie antes: `CREATE PUBLICATION supabase_realtime;` e então rode o bloco acima.

### Passo 3 — Teste de fumaça (prova que grava sem empresa nem usuário)

```sql
-- insert SEM empresa e SEM usuário (o "mendigo do lixo")
INSERT INTO lembretes (texto, origem, criado_por_telefone, criado_por_nome)
VALUES ('[TESTE sem trava] gravou sem empresa', 'whatsapp', '5599000000000', 'Desconhecido')
RETURNING id, empresa_id, usuario_id;

-- limpe o teste depois de confirmar que gravou:
DELETE FROM lembretes WHERE texto = '[TESTE sem trava] gravou sem empresa';
```

### Critério de sucesso
- Passo 1 roda sem erro.
- (a) ambas as colunas `is_nullable = YES`.
- (b) zero foreign keys.
- (c) `relrowsecurity = false`.
- (Passo 3) o INSERT retorna uma linha com `empresa_id = NULL` e `usuario_id = NULL`.

Me devolva o resultado das queries de verificação para eu confirmar.

---

## Contexto (caso a IA pergunte "por quê")

- Decisão do dono (05/06/2026): o bot deve anotar lembrete de **qualquer** número,
  sem regra. As regras (filtro por empresa/role) serão recolocadas **depois**.
- O lado da aplicação (Next.js) **já foi ajustado** e funciona mesmo sem este SQL —
  ele só remove as travas no nível do schema. Arquivos já alterados:
  `messageRouter.ts`, `frotaTools.ts`, `api/lembretes/route.ts`, `api/lembretes/[id]/ciente/route.ts`.
- Para reverter no futuro, ver o bloco comentado em `db/migration_lembretes_sem_trava.sql`.
