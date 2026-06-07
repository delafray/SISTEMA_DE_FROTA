# Plano de Execução — EMPRESA 2 (HÍBRIDA)

> **Para a IA executora:** seu contexto foi apagado. Este arquivo é autossuficiente — não procure os planos anteriores na memória, eles já estão resumidos aqui onde necessário. Leia tudo antes de codar. Padrão do projeto: **SEM TRAVA** (sem RLS, sem FK rígida, `GRANT ALL`, `ADD COLUMN IF NOT EXISTS`). Stack: **Next.js App Router + Supabase + VROOM/OSRM auto-hospedados**. **Antes de codar, valide cada passo deste plano com o dono** (regra forte do projeto).

---

## 0. O que é a Empresa 2 e o que ela JUNTA

A Empresa 2 (Híbrida) = **Empresa 3 (frota 100% própria, roteirização antecipada em lote) + módulo de TERCEIROS**.

- A **E1** trouxe a fundação: campo `executor_tipo TEXT` em `pedidos`/`entregas` (valores `'proprio'|'terceiro'|'agregado'`), mas só usou `'proprio'`.
- A **E3** trouxe o motor de roteirização em lote: tabelas `lote_roteirizacao`, `rotas`, `rota_paradas`; setorização Sweep (`src/lib/routing/sweep.ts`); endpoint `POST /api/routing/otimizar-lote` (multi-veículo); tela de planejamento no mapa (pins, lasso, drag-drop, contador peso/volume); despacho para app PWA do motorista próprio; mapa multi-rota colorido.
- A **E2 é o DELTA**: adiciona transportadores externos (terceiros) como "veículos" na mesma otimização, despacha-os por webhook em vez de app, recebe POD de volta por callback, e os mostra no MESMO mapa que os próprios.

**PRÉ-REQUISITO OBRIGATÓRIO:** `empresa01.md` e `empresa03.md` já aplicados. Se as tabelas `rotas` / `rota_paradas` / `lote_roteirizacao` **não existirem** no banco, **PARE** — a E2 não pode ser construída sobre o vazio. Verifique antes de tudo (passo 1).

**Este plano descreve SÓ o delta.** Não reescreve importação de notas, geocoding, tela de mapa, setorização nem app do motorista — tudo isso vem da E3 e é **reutilizado sem alteração**, exceto onde explicitamente marcado abaixo.

---

## 1. Verificação de pré-requisitos (FAÇA PRIMEIRO)

**Critério de PRONTO do passo:** confirmado que as 3 tabelas da E3 existem e que `executor_tipo` existe em `pedidos`/`entregas`.

Rode no Supabase (SQL Editor) ou via cliente:

```sql
-- Devem retornar linhas. Se vier vazio para rotas/rota_paradas/lote_roteirizacao → E3 não foi aplicada → PARE.
select table_name from information_schema.tables
where table_schema='public'
  and table_name in ('rotas','rota_paradas','lote_roteirizacao','terceiros');

-- Confirma a fundação E1:
select column_name, table_name from information_schema.columns
where table_schema='public' and column_name='executor_tipo';
```

- Se `terceiros` já existir, alguém adiantou parte da E2 — leia o schema atual antes de aplicar a migration (use `ADD COLUMN IF NOT EXISTS`, então é idempotente).
- Anote os **nomes reais das colunas** de `rotas` e `rota_paradas` criadas pela E3 (o plano abaixo assume os nomes do roadmap; ajuste se a E3 divergiu).

---

## 2. Migração SQL adicional (delta E2)

**Arquivo a criar:** `db/migration_empresa02_hibrida.sql`

**Critério de PRONTO:** migration roda sem erro no Supabase; `database.types.ts` regenerado contém a tabela `terceiros` e os novos campos em `rotas`/`rota_paradas`.

Cole exatamente (idempotente, SEM TRAVA — sem RLS, sem FK rígida):

```sql
-- ============================================================
-- migration_empresa02_hibrida.sql
-- DELTA da Empresa 2 (Híbrida) sobre a Empresa 3 já aplicada.
-- Padrão do projeto: SEM TRAVA (sem RLS, sem FK rígida, GRANT ALL).
-- Idempotente: pode rodar mais de uma vez.
-- ============================================================

-- 1) Tabela de transportadores externos (terceiros / parceiros / agregados)
CREATE TABLE IF NOT EXISTS public.terceiros (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      UUID,                          -- sem FK rígida (padrão do projeto)
  nome            TEXT NOT NULL,
  webhook_url     TEXT,                          -- destino do despacho JSON
  webhook_token   TEXT,                          -- token p/ autenticar callback de volta
  contato         TEXT,                          -- telefone/email p/ a torre de controle
  prioridade      INTEGER DEFAULT 100,           -- menor = preferido entre terceiros
  confianca_score NUMERIC DEFAULT 100,           -- % entregas confirmadas no prazo
  capacidade_kg   INTEGER,                       -- p/ montar slot no VROOM
  capacidade_m3   NUMERIC,
  skills          JSONB DEFAULT '[]'::jsonb,     -- ex: ["refrigerado","palete"]
  raio_atuacao_km INTEGER,                        -- opcional, p/ filtrar candidatos
  ativo           BOOLEAN DEFAULT TRUE,
  criado_em       TIMESTAMPTZ DEFAULT now(),
  atualizado_em   TIMESTAMPTZ DEFAULT now()
);

-- 2) Campos novos em `rotas` (criada pela E3) p/ diferenciar próprio x terceiro
ALTER TABLE public.rotas ADD COLUMN IF NOT EXISTS tipo TEXT DEFAULT 'propria';        -- 'propria' | 'terceiro'
ALTER TABLE public.rotas ADD COLUMN IF NOT EXISTS terceiro_id UUID;                   -- nullable, sem FK
ALTER TABLE public.rotas ADD COLUMN IF NOT EXISTS webhook_dispatch_id TEXT;           -- id da chamada de despacho
ALTER TABLE public.rotas ADD COLUMN IF NOT EXISTS webhook_despachado_em TIMESTAMPTZ;
ALTER TABLE public.rotas ADD COLUMN IF NOT EXISTS webhook_callback_status TEXT DEFAULT 'pendente'; -- 'pendente'|'aceita'|'recusada'|'concluida'

-- 3) Campos novos em `rota_paradas` (criada pela E3) p/ POD vindo do terceiro
ALTER TABLE public.rota_paradas ADD COLUMN IF NOT EXISTS pod_terceiro_foto_url   TEXT;
ALTER TABLE public.rota_paradas ADD COLUMN IF NOT EXISTS pod_terceiro_assinatura TEXT;
ALTER TABLE public.rota_paradas ADD COLUMN IF NOT EXISTS pod_terceiro_lat        DOUBLE PRECISION;
ALTER TABLE public.rota_paradas ADD COLUMN IF NOT EXISTS pod_terceiro_lng        DOUBLE PRECISION;
ALTER TABLE public.rota_paradas ADD COLUMN IF NOT EXISTS pod_terceiro_timestamp  TIMESTAMPTZ;

-- 4) GRANT ALL (padrão do projeto, sem RLS)
GRANT ALL ON public.terceiros TO anon, authenticated, service_role;

-- 5) índice leve p/ a torre de controle filtrar rotas de terceiro
CREATE INDEX IF NOT EXISTS idx_rotas_terceiro ON public.rotas (terceiro_id) WHERE terceiro_id IS NOT NULL;
```

Depois de aplicar, **regenere os tipos** (mesmo procedimento usado nos outros migrations do projeto — veja `db/PROMPT_outra_ia_rodar_migration.md`). O arquivo gerado é `src/types/database.types.ts`.

> **Nota sobre `executor_tipo`:** ele já existe em `pedidos`/`entregas` (fundação E1). A E2 é a primeira a gravar `'terceiro'` nesses campos quando um pedido for despachado a um parceiro. Não precisa de migration nova para isso.

---

## 3. Extensões na camada de roteirização (delta sobre E3)

### 3.1 `notaParaJob()` — segunda dimensão de capacidade (volume)

**Arquivo:** `src/lib/routing/restricoes.ts` (função `notaParaJob`, hoje nas linhas ~47-66).

Hoje a função **não preenche `amount[]`**. A E3 ativa `amount: [peso_kg]`. A E2 acrescenta volume como segunda dimensão para que terceiros com restrição de m³ sejam respeitados.

- O tipo `Job` (em `src/lib/routing/vroom.ts:32-40`) **já tem** `amount?: number[]`. Nenhuma mudança de tipo necessária.
- Estender o retorno de `notaParaJob` para incluir `amount: [peso_kg, volume_m3]` (preencher 0 quando faltar o dado, nunca lançar).
- **Consequência:** todo `Veiculo` (próprio e terceiro) passa a precisar de `capacidade: [cap_kg, cap_m3]` com **mesmo número de dimensões** (VROOM exige vetores de tamanho igual). Garanta isso em `montarVeiculo` (linha ~71) e no montador de slots de terceiro (passo 3.2).

**Critério de PRONTO:** otimização de um lote com peso E volume retorna rotas que não estouram nenhuma das duas capacidades.

### 3.2 `alocarFrota()` — prioridade próprio > parceiro (NOVO)

**Arquivo a criar:** `src/lib/routing/alocarFrota.ts`

Função pura (não é endpoint) que, dado um `lote_id`, monta o array `Veiculo[]` heterogêneo para o VROOM:

1. Lista veículos **próprios** com capacidade disponível (reusa `alocacoes` com `fim IS NULL` — vínculo veículo↔motorista da E3). Cada um vira `Veiculo` com `id` numérico (use `indexarJobs`/esquema de índice já existente em `restricoes.ts`), `capacidade: [cap_kg, cap_m3]`.
2. Calcula o **overflow** = demanda total do lote (soma peso/volume das notas selecionadas) − capacidade somada dos próprios.
3. Se houver overflow, instancia **slots de terceiros** (de `terceiros` onde `ativo=true`, ordenados por `prioridade` asc, depois `confianca_score` desc) até cobrir o overflow. Cada slot vira `Veiculo` com `capacidade` do terceiro e uma marca interna `{ tipo: 'terceiro', terceiro_id }` mantida no mapping (fora do payload VROOM — VROOM só conhece `id` numérico).
4. Retorna `{ veiculos: Veiculo[], mappingFrota: Map<number, { tipo, veiculo_id?, terceiro_id? }> }`.

**Regra de prioridade no solver:** próprios entram com `id` numérico baixo e, idealmente, custo interno menor. Como o VROOM minimiza custo total, a forma mais simples e robusta de garantir "próprio antes de terceiro" é **só adicionar slots de terceiro quando o overflow existir** (passo 2). Não invente custos por km no payload nesta fase — controle pela quantidade de slots.

**Critério de PRONTO:** lote que cabe nos próprios NÃO gera nenhum slot de terceiro; lote que excede gera slots na ordem `prioridade`/`confianca_score`.

### 3.3 `POST /api/routing/otimizar-lote` — passar frota heterogênea

**Arquivo (criado na E3, estendido na E2):** `src/app/api/routing/otimizar-lote/route.ts`

> A E3 cria este endpoint. Se ele ainda não existir, é porque a E3 nomeou diferente — confira em `src/app/api/routing/` (hoje existem `otimizar`, `rotas`, `rota/[id]`). **Não crie um endpoint paralelo**; estenda o da E3.

Delta da E2: antes de chamar `otimizarRota()` (`src/lib/routing/vroom.ts:139`), montar o array de veículos via `alocarFrota(lote_id)` (passo 3.2) em vez de listar só próprios. Ao persistir as rotas resultantes em `rotas`, gravar:
- `tipo = 'propria'` ou `'terceiro'` conforme o `mappingFrota`;
- `terceiro_id` quando `tipo='terceiro'`;
- para os pedidos/entregas dessas rotas, setar `executor_tipo = 'terceiro'` (campo da fundação E1).

`otimizarRota()` **não muda** — ela já aceita `veiculos[]` (array). Só muda como o array é montado.

**Critério de PRONTO:** otimizar um lote grande cria N rotas próprias + M rotas com `tipo='terceiro'` e `terceiro_id` preenchido, e os pedidos dessas rotas ficam com `executor_tipo='terceiro'`.

### 3.4 `empresaDe.ts` — caminho do terceiro

**Arquivo:** `src/lib/utils/empresaDe.ts`

Hoje `empresaDoVeiculo()` (linha 8) e `empresaDoMotorista()` (linha 14) derivam empresa de ativo próprio. Terceiro não tem veículo/motorista próprio. Adicione:

```ts
export async function empresaDoTerceiro(sb, terceiroId) {
  if (!terceiroId) return null;
  const { data } = await sb.from("terceiros").select("empresa_id").eq("id", terceiroId).maybeSingle();
  return data?.empresa_id ?? null;
}
```

E onde se resolve a empresa de uma rota: `if (rota.terceiro_id) empresaDoTerceiro(...) else empresaDoVeiculo(...)`. **Lembrete (regra do projeto "empresas = fiscais"):** NÃO trave nada por `empresa_id` — o campo é informativo, não barreira.

**Critério de PRONTO:** rota de terceiro resolve sua empresa sem exigir `veiculo_id`.

---

## 4. Despacho dual — próprios via app, terceiros via webhook

### 4.1 Próprios (REUSO da E3 — sem código novo)

A tela de despacho da E3 manda a rota ao app PWA offline do motorista (`src/app/mobile/rota/page.tsx`, fila offline em `src/lib/offline/acoesRota.ts`). A E2 **reutiliza integralmente** para rotas `tipo='propria'`. Não reimplemente.

### 4.2 Terceiros — push de webhook (NOVO)

**Arquivo a criar:** `src/app/api/terceiros/[id]/despachar/route.ts` (método `POST`)

Hoje o **único webhook do projeto é de ENTRADA** (`src/app/api/whatsapp/webhook/route.ts`). Não existe nenhum client HTTP de saída — este é novo.

Comportamento:
1. Recebe `{ rota_id }`. Carrega a rota e suas `rota_paradas`, e o `terceiros` row pelo `[id]`.
2. Monta payload JSON por rota/parada: `{ rota_id, callback_url, callback_token, paradas: [{ pedido_id, endereco, lat, lng, janela_inicio, janela_fim, peso_kg, volume_m3, referencia, contato, prioridade, sequencia }] }`.
   - `callback_url` = URL absoluta do endpoint do passo 4.3.
   - `callback_token` = `terceiros.webhook_token` (para o terceiro autenticar o callback).
3. `fetch(terceiro.webhook_url, { method:'POST', body: JSON.stringify(payload) })`. **Trate falha sem lançar** (padrão tolerante do projeto): se o POST falhar, grave `webhook_callback_status='pendente'` e registre erro no log (`createLogger`, ver uso em `vroom.ts:18`); não derrube a request.
4. Em sucesso, grava em `rotas`: `webhook_dispatch_id` (gere um UUID), `webhook_despachado_em = now()`, `webhook_callback_status='aceita'` (ou mantenha `'pendente'` até o terceiro confirmar — escolha alinhar com o dono).

**PowerShell warning (regra do projeto):** ao testar este endpoint, NÃO cole `curl` com JSON no PowerShell/SSH — use um `.sh` via SCP (LF) ou `fetch` no navegador. Evita quebra de aspas.

**Critério de PRONTO:** chamar `POST /api/terceiros/{id}/despachar` com um `rota_id` envia o JSON ao `webhook_url` configurado e atualiza os campos de despacho na rota.

### 4.3 Callback de POD do terceiro (NOVO)

**Arquivo a criar:** `src/app/api/terceiros/webhook/callback/route.ts` (método `POST`)

Endpoint **público autenticado por token** (terceiro não loga no Supabase Auth). Comportamento:
1. Valida o `callback_token` recebido (header ou body) contra `terceiros.webhook_token`. Token inválido → 401.
2. Recebe `{ rota_id, parada_id?, pedido_id?, status, foto_url?, assinatura?, lat?, lng?, timestamp? }`.
3. Atualiza a `rota_paradas` correspondente: `pod_terceiro_foto_url`, `pod_terceiro_assinatura`, `pod_terceiro_lat`, `pod_terceiro_lng`, `pod_terceiro_timestamp`, e marca a parada concluída no mesmo campo de status que a E3 usa para paradas próprias (reuse o nome real da coluna de status de `rota_paradas`).
4. Se for evento de posição em trânsito (sem POD final), grava só `pod_terceiro_lat/lng` e **emite evento Supabase Realtime** no canal das rotas — é a ÚNICA fonte de posição do terceiro (ele não usa o app PWA).
5. Quando todas as paradas confirmadas, set `rotas.webhook_callback_status='concluida'` e atualize `terceiros.confianca_score` (regra simples: % de paradas confirmadas no prazo).

**Critério de PRONTO:** um POST de callback com token válido grava o POD na `rota_parada` e a posição aparece no mapa em tempo real.

---

## 5. Frente UI — torre de controle, painel de terceiros, despacho, dashboard

### 5.1 Tela de planejamento do dia + resultado da otimização (REUSO da E3)

A tela-chave (mapa com pins, filtros, lasso, drag-drop, contador peso/volume) é da E3 e **reaproveitada 100%**. Endpoints de ajuste já existem e funcionam:
- `PATCH src/app/api/routing/rota/[id]/paradas/route.ts` (reordena paradas, 3-pass sem colisão);
- `POST src/app/api/routing/rota/[id]/reorganizar/route.ts` (re-otimiza pendentes).

**Delta E2 na tela de resultado:** no painel lateral da fase "Setorizar + dividir por N caminhões", além dos N caminhões próprios, listar os **slots de terceiros disponíveis** com badge `terceiro`, capacidade e custo estimado. São **colunas/linhas extras na lista existente**, não uma tela nova.

**Mapa multi-rota:** o componente `src/components/MapaRotaInner.tsx` (hoje 1 polyline) ganha na E3 a prop `rotas[]` com polylines coloridas por veículo. A E2 só pede que rotas de terceiro recebam **estilo diferente** (ex: linha tracejada / ícone distinto) — é uma prop visual adicional, não componente novo. (`src/components/MapaRota.tsx` é o wrapper.)

**Critério de PRONTO:** a tela de resultado mostra próprios e terceiros como destinos atribuíveis, com diferenciação visual no mapa.

### 5.2 Tela de despacho — bifurca por `executor_tipo` (delta na tela da E3)

A tela de despacho da E3 envia rotas próprias ao app. **Delta E2:** para rotas `tipo='terceiro'`, o botão "Despachar" chama `POST /api/terceiros/{terceiro_id}/despachar` (passo 4.2) em vez de marcar a rota para o app. **Mesma tela, lógica condicional por `tipo`/`executor_tipo`.**

**Critério de PRONTO:** despachar um lote envia rotas próprias ao app e rotas de terceiro ao webhook, na mesma ação de UI.

### 5.3 Painel de Terceiros cadastrados (NOVO — CRUD padrão)

**Pasta a criar:** `src/app/(dashboard)/terceiros/page.tsx` (e subpáginas `novo`/`[id]` no padrão dos outros CRUDs do projeto — espelhe `src/app/(dashboard)/motoristas/` ou `clientes/`).

CRUD simples sobre a tabela `terceiros`: listar; cadastrar (nome, `webhook_url`, `webhook_token`, capacidade_kg/m3, skills, raio_atuacao_km, contato); ver histórico de despachos (rotas com aquele `terceiro_id`); mostrar `confianca_score`. **Nenhum componente de rota novo** — é formulário + tabela padrão.

**Critério de PRONTO:** consigo cadastrar um terceiro com webhook e ele aparece como slot disponível na otimização (passo 3.2).

### 5.4 Torre de controle — visibilidade unificada (delta na tela de acompanhamento da E3)

A tela de acompanhamento da E3 rastreia motoristas próprios via Supabase Realtime. **Delta E2:** o mapa passa a escutar **também** o canal das rotas de terceiro, alimentado pelo callback (passo 4.4/4.3 item 4). Próprios e terceiros no MESMO mapa, diferenciados por cor/ícone. SLA/OTIF/ocorrências contam ambos.

**Critério de PRONTO:** um único mapa mostra, ao vivo, posição de motoristas próprios (app) e de terceiros (callback), sem telas separadas.

### 5.5 Dashboard — terceira dimensão de custo (delta em relatórios)

**Arquivo:** `src/app/(dashboard)/relatorios/page.tsx` (existe).

A E1 já tem receita/custo/margem por pedido; a E3 adiciona utilização/OTIF/custo-entrega. **Delta E2:** 2-3 cards comparando **custo próprio vs terceiro por lote** (próprio = combustível + motorista; terceiro = valor pago ao webhook/parceiro). São cards no dashboard existente, **não uma tela separada**.

**Critério de PRONTO:** o dashboard mostra, por lote, quanto saiu em frota própria vs quanto foi pago a terceiros.

---

## 6. Ordem recomendada de execução (resumo numerado)

1. **Passo 1** — verificar pré-requisitos E1+E3 (PARE se faltar).
2. **Passo 2** — aplicar `db/migration_empresa02_hibrida.sql` + regenerar `database.types.ts`.
3. **Passo 3.4** — `empresaDoTerceiro()` em `empresaDe.ts`.
4. **Passo 3.1** — `amount: [peso, volume]` em `notaParaJob` + capacidade 2D nos veículos.
5. **Passo 3.2** — `src/lib/routing/alocarFrota.ts` (prioridade próprio > terceiro).
6. **Passo 3.3** — estender `POST /api/routing/otimizar-lote` para frota heterogênea.
7. **Passo 4.2** — `POST /api/terceiros/[id]/despachar` (webhook de saída).
8. **Passo 4.3** — `POST /api/terceiros/webhook/callback` (POD + Realtime).
9. **Passo 5.3** — CRUD de terceiros.
10. **Passo 5.2** — bifurcar tela de despacho por `tipo`.
11. **Passo 5.1 / 5.4 / 5.5** — diferenciação visual no mapa, torre unificada, cards de custo.

Cada passo tem seu critério de PRONTO acima. Testes são **recomendados, não obrigatórios** (política do projeto): se mexer em `alocarFrota` ou na montagem de payload do webhook, vale um teste em `src/__tests__/lib/` ou `src/__tests__/routing/`. Não rode `npm test` a cada microedição.

---

## 7. O que NÃO entra (fica fora da E2)

- **Splits de faturamento / comissão automática** para terceiros: a E2 só registra o custo pago; rateio fiscal fica para depois.
- **EDI/API direto do ERP** para importação de notas: a E2 reusa o importador XML/CSV da E3; integração ERP é fase posterior.
- **App próprio para o terceiro**: terceiro só recebe webhook e responde callback — nada de PWA para parceiro.
- **Negociação de preço / leilão de carga** entre terceiros: fora de escopo.
- **Otimização de custo por km no VROOM** para decidir próprio vs terceiro: a E2 decide por overflow de capacidade (passo 3.2), não por modelagem de custo no solver.

---

## 8. O que a E2 PREPARA para a EMPRESA 4 (Broker)

A E4 é um broker (orquestra só terceiros, sem frota própria). A E2 já entrega os blocos que a E4 reaproveita:

- **Tabela `terceiros`** com `webhook_url`, `webhook_token`, `prioridade`, `confianca_score`, `skills`, `raio_atuacao_km` — a E4 escala isso para uma rede grande de parceiros (só adiciona campos de tarifa/SLA contratual).
- **Despacho por webhook + callback de POD** (`/api/terceiros/[id]/despachar` e `/api/terceiros/webhook/callback`) — na E4 vira o caminho PRINCIPAL (não mais o overflow). A E4 só precisa generalizar `alocarFrota` para "100% terceiro".
- **`confianca_score` alimentado pelo callback** — base do ranking/seleção automática de parceiros que a E4 vai usar para roteamento por reputação.
- **Torre de controle unificada via Realtime** — já agnóstica à fonte (app ou callback); a E4 herda sem mudança estrutural.
- **`executor_tipo`/`tipo`** como interruptor próprio↔terceiro — na E4 o default vira `'terceiro'`.

> **Lembrete final:** valide cada ponto deste plano com o dono antes de codar (regra forte do projeto). Padrão SEM TRAVA em todas as tabelas/colunas novas.
