# Plano de Execução — EMPRESA 3 (Frota 100% Própria / Daily Dispatch)

> **Documento autossuficiente.** Quem executar isto pode estar SEM nenhum contexto prévio: abra só este arquivo e construa o delta da Empresa 3. Todos os caminhos de arquivo, nomes de coluna/tabela e SQL estão embutidos, baseados no código REAL do repositório `SISTEMA_DE_FROTA` (Next.js App Router + Supabase).
>
> **PADRÃO OBRIGATÓRIO DO PROJETO: SEM TRAVA** — `ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`, sem RLS, sem FK rígida, `GRANT ALL ... TO service_role`. Migrations idempotentes (rodam mais de uma vez sem erro). Endpoints de routing usam `SUPABASE_SERVICE_ROLE_KEY`, sem auth de usuário.
>
> **REGRA FORTE: valide este plano ponto a ponto com o dono ANTES de codar.**

---

## 0. Pré-requisito — a fundação (EMPRESA 1) JÁ está aplicada

Este plano descreve **só o DELTA da Empresa 3**. Ele assume que `docs/empresa01.md` foi executado e que a migração `db/migration_empresa01_logistica.sql` **já rodou no Supabase de prod**. Em particular, a fundação já entregou:

- **Tabela `entregas`** com as colunas (via `ADD COLUMN IF NOT EXISTS`): `latitude NUMERIC`, `longitude NUMERIC`, `geocode_status TEXT DEFAULT 'pendente'` (valores `pendente|geocodificado|falhou`), `sequencia INTEGER`, `janela_inicio TIMESTAMPTZ`, `janela_fim TIMESTAMPTZ`, `service_time_seg INTEGER DEFAULT 600`, e os **3 campos do futuro**: `origem_demanda TEXT DEFAULT 'notas_antecipadas'`, `executor_tipo TEXT`, `pedido_pai_id UUID`.
- **`pedidos`** com `modo`, `tamanho`, `cliente_id`, `origem_demanda`, `executor_tipo`, `pedido_pai_id`.
- **Tabela `pod`** (prova de entrega) criada do zero na fundação.
- **`paradas`** com `entrega_id UUID` adicionado (vínculo routing ↔ `entregas`).

> **Antes de começar, CONFIRME** rodando no SQL Editor do Supabase:
> ```sql
> SELECT column_name FROM information_schema.columns
>  WHERE table_name='entregas'
>    AND column_name IN ('latitude','longitude','geocode_status','sequencia',
>      'janela_inicio','janela_fim','service_time_seg','origem_demanda');
> ```
> Devem voltar 8 linhas. Se voltar menos, **PARE e aplique `db/migration_empresa01_logistica.sql` primeiro** (não é objeto deste plano repeti-la).

---

## 1. O que é a Empresa 3 (e como difere da 1)

Embarcador com **frota 100% própria**. O dono da carga é a própria empresa (NF-e própria de produto). Transporte é **CUSTO INTERNO (CPV)**, não receita — o objetivo financeiro é **minimizar custo/entrega e TCO**, não faturar frete. Demanda é **PREVISÍVEL** (carteira do ERP), roteirizada **48–72h antes**. Só **motoristas internos** veem a rota.

**O coração da Empresa 3 é o Daily Dispatch (roteirização antecipada em lote):**

1. **Importar carteira** (centenas de NF-e) → grava em `entregas` com `geocode_status='pendente'`.
2. **Selecionar ~100 para amanhã** numa **tela de mapa interativa** (pins, filtros por janela/região/crítico, seleção visual).
3. **Geocodificar** o lote (reusa o pipeline existente cache→Google→ViaCEP→aprendidas).
4. **Setorizar (Sweep)** + **dividir por N caminhões via VROOM multi-veículo** (CVRPTW: capacidade + janelas + `service_time` de cliente crítico).
5. **Revisar/ajustar no mapa** (drag-drop de paradas entre rotas).
6. **Despachar** → cada motorista interno recebe sua rota no app/WhatsApp.
7. **POD por parada** (prova interna de SLA) → alimenta **dashboard de KPIs de frota** (OTIF, OTD, utilização, custo/entrega).

### O que NÃO entra na Empresa 3 (fase posterior / outras empresas)
- **MDF-e** → **fase posterior** desta mesma empresa (NT 2025.001, obrigatória out/2025). Deixar gancho de dados, não construir agora.
- **Módulo de terceiros** (cotação, matching, webhook a parceiro, score) → é da **Empresa 2**. NÃO construir.
- **CT-e** → é da Empresa 1/2 (faturam frete). Empresa 3 usa NF-e própria. NÃO construir.
- **Forecast de demanda semanal** → desejável, mas **fase 2**. Não bloqueia o despacho diário.
- **Roteirização "na hora" por voz** → é o Modo B da Empresa 1. Aqui é exceção, **não construir** modo principal.

---

## 2. Estado REAL do código — o que reusar (NÃO reimplementar)

Caminhos confirmados no repositório:

| Capacidade | Arquivo real | Status |
|---|---|---|
| **VROOM multi-veículo** | `src/lib/routing/vroom.ts` → `otimizarRota({ veiculos: Veiculo[], jobs: Job[], dataBase? })` | **PRONTO.** `Veiculo` tem `capacidade?: number[]`, `skills?: number[]`. `Job` tem `amount?: number[]`, `janelas?: JanelaHorario`, `prioridade?`, `tempo_descarga_s?`. O payload já faz `vehicles: input.veiculos.map(...)`. Só o **chamador** passa 1 veículo hoje. |
| **Helpers UUID↔VROOM** | `src/lib/routing/restricoes.ts` → `indexarJobs()` (índice 1-based ↔ UUID), `notaParaJob()`, `montarVeiculo()`, `traduzirParadasComMapping()`, `montarParadasPersistir()` | **PRONTO.** Agnósticos à fonte (`{id: string}` + lat/lng). |
| **Geocoding cascata** | `src/lib/routing/resolverCoordenada.ts` + `geocoding.ts` + `googleGeocoding.ts` + `geocodeCache.ts` + `coordsAprendidas.ts` | **PRONTO.** cache→Google(<38k/mês)→ViaCEP→aprendidas, grava de volta. `resolverCoordenada` é o ponto de entrada. |
| **Endpoint otimizar single** | `src/app/api/routing/otimizar/route.ts` | Referência. Recebe `{ motorista_id, empresa_id, origem, data?, destino? }`, monta **1 veículo (id=1)**, busca `notas_capturadas` por `motorista_id`. **NÃO serve** ao lote — será espelhado num endpoint novo (Passo 3). |
| **Drag-drop / reorganizar** | `src/app/api/routing/rota/[id]/paradas/route.ts` (PATCH 3-pass sem colisão) e `rota/[id]/reorganizar/route.ts` (POST re-otimiza pendentes) | **PRONTO.** Base do "ajustar no mapa". |
| **Mapa Leaflet** | `src/components/MapaRota.tsx` (wrapper `next/dynamic` ssr:false) + `src/components/MapaRotaInner.tsx` (Leaflet 1.9.4 + react-leaflet 5.0.0, OSM público) | **PRONTO p/ 1 rota.** Pinos numerados coloridos por status, polyline, GPS, clique. **Falta:** múltiplas polylines coloridas por veículo (1 prop nova). |
| **App motorista offline + POD** | `src/app/mobile/rota/page.tsx` (state machine + `FaseEmRota` + `concluida_em`), `src/lib/offline/acoesRota.ts` (`enfileirarConcluirParada`, `enfileirarEncerrarRota`) | **PRONTO.** Reusa trocando a origem das paradas (lote pré-despachado em vez de captura mobile). |
| **Dashboard status frota** | `src/app/(dashboard)/page.tsx` → view `status_operacional_veiculos` (disponível/em_andamento por `empresa_id`) | **PRONTO** como widget de utilização. |
| **Relatório financeiro** | `src/app/(dashboard)/relatorios/page.tsx` → views `pedidos_com_resultado`, `veiculos_resultado_periodo` (receita, custo combustível, custo despesas, km, lucro, margem) | Base parcial dos KPIs (km, custo combustível/despesas por veículo). **Falta:** OTIF/OTD/utilização/custo-entrega. |
| **Capacidade do veículo (já no banco)** | `src/types/database.types.ts` → `veiculos.capacidade_carga_kg` (linha ~2443) e `capacidade_tanque` | **PRONTO** — usar `capacidade_carga_kg` como `capacity:[kg]` do VROOM. |
| **Peso da entrega (já no banco)** | `src/types/database.types.ts` → `entregas.peso_carga_kg` (linha ~1222) | **PRONTO** — usar como `amount:[kg]` do job. |

### Gaps a CONSTRUIR (o delta E3)
1. Importação em lote de NF-e/CSV (parser + endpoint + tela).
2. Tela de mapa com **seleção visual** do lote (a tela-chave).
3. Endpoint `POST /api/routing/otimizar-lote` (multi-veículo, fonte = `entregas`).
4. Setorização **Sweep** (`src/lib/routing/sweep.ts`).
5. Tabelas `rotas` + `rota_paradas` (modelo de lote diário, separadas das `rotas_otimizadas`/`paradas` da captura mobile).
6. Tela de **despacho** (revisar N rotas → "Despachar").
7. Dashboard de **KPIs de frota**.
8. Mapa: múltiplas polylines coloridas por veículo.

---

## 3. MIGRAÇÃO SQL ADICIONAL — pronta para colar

Crie **`db/migration_empresa03_frota.sql`** com o conteúdo abaixo. Estilo idêntico às migrations existentes (ver `db/migration_pedidos_empresa_motorista.sql`, `db/migration_fix_permissions_e_cep.sql`): comentário de contexto no topo, `ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`, `GRANT ALL ... TO service_role`, **sem RLS, sem FK rígida**, idempotente.

```sql
-- ============================================================================
-- migration_empresa03_frota.sql
-- EMPRESA 3 (Frota 100% Propria / Daily Dispatch).
-- DELTA sobre a fundacao (migration_empresa01_logistica.sql JA aplicada).
-- Padrao SEM TRAVA: ADD COLUMN IF NOT EXISTS, CREATE TABLE IF NOT EXISTS,
-- sem RLS, sem FK rigida, GRANT ALL. Idempotente.
-- Pre-requisito: entregas ja tem latitude/longitude/geocode_status/sequencia/
-- janela_inicio/janela_fim/service_time_seg (vindos da fundacao).
-- ============================================================================

-- ─── 1. LOTE DE ROTEIRIZACAO (o "amanha" selecionado no mapa) ───────────────
-- Um lote = 1 dia de operacao, agrupa as ~100 entregas escolhidas e as N rotas.
CREATE TABLE IF NOT EXISTS lote_roteirizacao (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id      UUID,
  data_operacao   DATE,                 -- dia em que as rotas serao executadas
  nome            TEXT,                 -- ex: "Despacho 07/06 - Zona Sul"
  status          TEXT DEFAULT 'rascunho',
  -- rascunho | otimizado | despachado | concluido | cancelado
  total_entregas  INTEGER DEFAULT 0,
  total_veiculos  INTEGER DEFAULT 0,
  origem_lat      NUMERIC,              -- deposito/CD de partida
  origem_lng      NUMERIC,
  criado_por      TEXT,                 -- telefone/usuario (SEM TRAVA, qualquer)
  criado_em       TIMESTAMPTZ DEFAULT now(),
  otimizado_em    TIMESTAMPTZ,
  despachado_em   TIMESTAMPTZ
);

-- ─── 2. ROTAS (1 por veiculo dentro do lote) ────────────────────────────────
-- Distinta de `rotas_otimizadas` (captura mobile single-driver). Esta e a rota
-- do despacho em lote, com veiculo, setor e metricas planejadas.
CREATE TABLE IF NOT EXISTS rotas (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lote_id          UUID,                -- FK logica -> lote_roteirizacao.id
  empresa_id       UUID,
  veiculo_id       UUID,
  motorista_id     UUID,
  data_operacao    DATE,
  setor            TEXT,                -- rotulo do cluster Sweep (ex: "S1")
  cor              TEXT,                -- cor da polyline no mapa (ex: "#2563eb")
  status           TEXT DEFAULT 'otimizada',
  -- otimizada | despachada | em_andamento | concluida | cancelada
  km_plan          NUMERIC,            -- km planejado pelo VROOM
  duracao_plan_min INTEGER,           -- duracao planejada (min)
  carga_plan_kg    NUMERIC,           -- soma dos amount das paradas
  polyline_encoded TEXT,              -- track da rota (desenhar no mapa)
  iniciada_em      TIMESTAMPTZ,
  concluida_em     TIMESTAMPTZ,
  criada_em        TIMESTAMPTZ DEFAULT now()
);

-- ─── 3. ROTA_PARADAS (parada do despacho, ligada a `entregas`) ──────────────
-- Distinta de `paradas` (que aponta pra notas_capturadas). Esta aponta pra
-- `entregas` (coracao da Empresa 3) e guarda planejado vs real pro OTIF/OTD.
CREATE TABLE IF NOT EXISTS rota_paradas (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  rota_id           UUID,              -- FK logica -> rotas.id
  entrega_id        UUID,              -- FK logica -> entregas.id (VINCULO!)
  empresa_id        UUID,
  sequencia         INTEGER,           -- ordem na rota (1,2,3...)
  latitude          NUMERIC,
  longitude         NUMERIC,
  endereco_snapshot JSONB,             -- snapshot do endereco (nao muda)
  -- planejado vs real (base de OTIF/OTD)
  eta               TIMESTAMPTZ,       -- chegada estimada (planejada)
  janela_inicio     TIMESTAMPTZ,       -- copiado da entrega no momento do lote
  janela_fim        TIMESTAMPTZ,
  service_time_seg  INTEGER DEFAULT 600,
  chegada_real      TIMESTAMPTZ,       -- preenchido pelo app do motorista
  concluida_em      TIMESTAMPTZ,       -- POD registrado
  status            TEXT DEFAULT 'pendente',
  -- pendente | em_rota | concluida | falha (ausencia/recusa/end_errado)
  motivo_ocorrencia TEXT,             -- log reverso (ausencia, recusa, etc)
  pod_foto_url      TEXT,             -- prova interna de SLA
  fixada            BOOLEAN DEFAULT false,
  criada_em         TIMESTAMPTZ DEFAULT now()
);

-- ─── 4. ENTREGAS: campos de capacidade/lote/critico que faltam ──────────────
-- peso_carga_kg JA existe. Adicionar volume/paletes/lote/critico.
ALTER TABLE entregas ADD COLUMN IF NOT EXISTS volume_m3      NUMERIC;
ALTER TABLE entregas ADD COLUMN IF NOT EXISTS paletes        INTEGER;
ALTER TABLE entregas ADD COLUMN IF NOT EXISTS lote_id        UUID;     -- -> lote_roteirizacao.id (quando selecionada)
ALTER TABLE entregas ADD COLUMN IF NOT EXISTS cliente_critico BOOLEAN DEFAULT false; -- slow mover
-- service_time_seg JA existe (fundacao). cliente_critico => service_time alto.

-- ─── 5. VEICULOS: skills/capacidade extra (capacidade_carga_kg JA existe) ────
ALTER TABLE veiculos ADD COLUMN IF NOT EXISTS capacidade_volume_m3 NUMERIC;
ALTER TABLE veiculos ADD COLUMN IF NOT EXISTS capacidade_paletes   INTEGER;
ALTER TABLE veiculos ADD COLUMN IF NOT EXISTS skills_json          JSONB;   -- ex: [1] habilita slow_mover
ALTER TABLE veiculos ADD COLUMN IF NOT EXISTS origem_padrao_lat    NUMERIC; -- CD de partida do veiculo
ALTER TABLE veiculos ADD COLUMN IF NOT EXISTS origem_padrao_lng    NUMERIC;

-- ─── 6. GRANTS (SEM TRAVA) ──────────────────────────────────────────────────
GRANT ALL ON lote_roteirizacao TO service_role;
GRANT ALL ON rotas             TO service_role;
GRANT ALL ON rota_paradas      TO service_role;
GRANT ALL ON lote_roteirizacao TO anon, authenticated;
GRANT ALL ON rotas             TO anon, authenticated;
GRANT ALL ON rota_paradas      TO anon, authenticated;

-- ─── 7. INDICES (performance, nao sao trava) ────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_rotas_lote        ON rotas(lote_id);
CREATE INDEX IF NOT EXISTS idx_rotaparadas_rota  ON rota_paradas(rota_id);
CREATE INDEX IF NOT EXISTS idx_rotaparadas_entr  ON rota_paradas(entrega_id);
CREATE INDEX IF NOT EXISTS idx_entregas_lote     ON entregas(lote_id);
CREATE INDEX IF NOT EXISTS idx_entregas_geocode  ON entregas(geocode_status);
```

> **Por que `rotas`/`rota_paradas` novas e não reusar `rotas_otimizadas`/`paradas`?** As tabelas antigas têm semântica de **captura mobile single-driver** (`paradas.nota_id` → `notas_capturadas`, `rotas_otimizadas.motorista_id` singular, sem `veiculo_id`/`lote_id`/`setor`). O despacho em lote precisa de N rotas por lote, ligadas a **`entregas`** e a um veículo. Misturar quebraria o módulo existente. Mantêm-se separadas (SEM TRAVA permite coexistência).

**Critério de PRONTO do Passo 3:** as 4 queries abaixo retornam sem erro no SQL Editor:
```sql
SELECT 1 FROM lote_roteirizacao LIMIT 1;
SELECT 1 FROM rotas LIMIT 1;
SELECT 1 FROM rota_paradas LIMIT 1;
SELECT column_name FROM information_schema.columns
 WHERE table_name='entregas' AND column_name IN ('volume_m3','lote_id','cliente_critico');
```

Após aplicar, **regenerar `src/types/database.types.ts`** (ou adicionar tipos manuais para `lote_roteirizacao`/`rotas`/`rota_paradas` em `src/lib/routing/types.ts`, seguindo o padrão dos tipos manuais já existentes lá para `NotaCapturada`/`RotaOtimizada`/`Parada`).

---

## 4. PASSOS DE EXECUÇÃO (ordem obrigatória)

### Passo 1 — Aplicar a migração e os tipos
- Criar `db/migration_empresa03_frota.sql` (Seção 3), rodar no SQL Editor do Supabase de prod.
- Adicionar interfaces TS de `LoteRoteirizacao`, `Rota` (lote), `RotaParada` em `src/lib/routing/types.ts` (mesmo estilo dos tipos manuais já lá). Reaproveitar `EnderecoParada` para `endereco_snapshot`.
- **PRONTO quando:** tabelas criadas (queries da Seção 3 passam) + tipos compilam (`npm run build` ou `tsc --noEmit` sem erro nesses arquivos).

### Passo 2 — Importação em lote de NF-e/CSV
- **Parser** novo: `src/lib/importacao/parseNFe.ts` — extrai de `infNFe/dest/enderDest` do XML (CEP, número, logradouro, bairro, município, UF) + `infNFe/transp/vol` (pesoB) e peso dos produtos. Suportar também CSV (colunas: cep, numero, cliente, peso_kg, janela_inicio, janela_fim, critico).
- **Endpoint** novo: `POST /api/entregas/importar` em `src/app/api/entregas/importar/route.ts` — recebe `{ empresa_id, entregas: [...] }`, faz INSERT em `entregas` com `geocode_status='pendente'`, `origem_demanda='importacao_lote'`, `status='agendado'`, `pedido_id IS NULL`. Usa `SUPABASE_SERVICE_ROLE_KEY`. Retorna `{ inseridas: n, ids: [...] }`.
- **Tela** de upload: estender `src/app/(dashboard)/entregas/novo/page.tsx` (ou nova `src/app/(dashboard)/entregas/importar/page.tsx`) com input de arquivo (drag XML/CSV) → preview tabular → "Importar".
- **PRONTO quando:** subir um XML/CSV de teste cria N linhas em `entregas` com `geocode_status='pendente'` e `origem_demanda='importacao_lote'`.

### Passo 3 — Geocodificar o lote (reuso)
- Reusar `resolverCoordenada` (`src/lib/routing/resolverCoordenada.ts`). Criar/estender endpoint `POST /api/routing/geocodar` (já existe a pasta `src/app/api/routing/geocodar/`) para aceitar `{ empresa_id, entrega_ids?: string[] }` e geocodificar `entregas` com `geocode_status='pendente'`, gravando `latitude/longitude/geocode_status='geocodificado'` (ou `'falhou'`).
- **PRONTO quando:** após chamar, as entregas do lote têm lat/lng e `geocode_status='geocodificado'`; as que falharam ficam `'falhou'` e aparecem em vermelho no mapa.

### Passo 4 — Setorização Sweep
- Criar `src/lib/routing/sweep.ts` — matemática pura, sem dependência externa:
  1. recebe `{ origem: Coordenada, entregas: Array<{id, lat, lng, peso_kg}>, nVeiculos, capacidadePorVeiculo }`.
  2. calcula ângulo polar de cada entrega em relação ao depósito (`Math.atan2(lat-oLat, lng-oLng)`).
  3. ordena por ângulo, varre acumulando peso até atingir `capacidadePorVeiculo` → fecha um setor → próximo.
  4. devolve `Array<{ setor: string, entregaIds: string[] }>`.
- Adicionar teste `src/__tests__/lib/sweep.test.ts` (recomendado — lógica de negócio): caso N=2 balanceado, caso capacidade estoura, caso 1 entrega só.
- **PRONTO quando:** 500 pontos sintéticos viram N setores sem zigzag, cada setor respeitando a capacidade; teste verde.

### Passo 5 — Endpoint de otimização em lote multi-veículo
- Criar `POST /api/routing/otimizar-lote` em `src/app/api/routing/otimizar-lote/route.ts` — **espelha** `otimizar/route.ts` mas:
  - **Entrada:** `{ empresa_id, lote_id?, data_operacao, origem: {lat,lng}, entrega_ids: string[], veiculos: Array<{ veiculo_id, motorista_id?, origem?: {lat,lng}, capacidade_kg, skills?: number[] }> }`.
  - Busca `entregas` por `.in('id', entrega_ids)` (fonte = **`entregas`**, NÃO `notas_capturadas`).
  - Opcional: rodar **Sweep** (Passo 4) para pré-clusterizar antes do VROOM por setor, OU passar tudo ao VROOM multi-veículo de uma vez.
  - Monta jobs com `notaParaJob`-equivalente para `entregas`: `amount:[peso_carga_kg]`, `tempo_descarga_s: service_time_seg` (cliente crítico → alto), `janelas` de `janela_inicio/janela_fim`. **Criar `entregaParaJob()` em `restricoes.ts`** (espelho de `notaParaJob`, lendo de `entregas`).
  - Monta N veículos com `montarVeiculo` + `capacidade:[capacidade_carga_kg]` + `skills`.
  - Chama `otimizarRota({ veiculos, jobs })` — **já suporta multi-veículo**.
  - **AJUSTE NO VROOM (necessário):** `src/lib/routing/vroom.ts` linhas ~183-197 hoje achata todas as rotas numa lista plana e ignora `route.vehicle`. Para multi-veículo: (a) adicionar `veiculo_id: number` ao tipo de parada em `ResultadoVROOM` (`src/lib/routing/types.ts:121`), (b) no loop guardar `route.vehicle` em cada parada, (c) reiniciar `ordem` por veículo.
  - Persiste: 1 `lote_roteirizacao` + N `rotas` (1 por veículo, com `setor`/`cor`/`km_plan`/`carga_plan_kg`/`polyline_encoded`) + M `rota_paradas` (`entrega_id`, `sequencia`, `eta`, janela copiada). Atualiza `entregas.lote_id` e `entregas.sequencia`.
  - **Saída:** `{ lote_id, rotas: [{ rota_id, veiculo_id, setor, cor, paradas: [...], km_plan, duracao_plan_min, carga_plan_kg }], nao_atendidas: [...] }`.
- **PRONTO quando:** um POST com 100 entregas + 4 veículos cria 1 lote + 4 rotas + ~100 rota_paradas, cada rota respeitando `capacidade_carga_kg`, e nenhuma parada com `peso > capacidade` fica numa rota cheia.

### Passo 6 — Tela-chave: mapa com seleção + drag-drop
- Criar `src/app/(dashboard)/roteirizacao/lote/page.tsx` (nova subrota; a `roteirizacao/page.tsx` single-driver fica intacta).
- **Estender `src/components/MapaRotaInner.tsx`** para:
  - aceitar `pontos: Array<{ id, lat, lng, status, critico?, selecionado? }>` e renderizar pins (cor por status/crítico).
  - aceitar `onSelecionar(ids: string[])` — seleção por clique e por **polígono/lasso** (usar `leaflet` draw simples ou retângulo de seleção; sem lib paga).
  - aceitar `polylines: Array<{ encoded: string; cor: string }>` (uma por veículo) em vez de `polylineEncoded?: string` único — renderizar um `<Polyline>` por entrada (hoje cor fixa `#2563eb` em `MapaRotaInner.tsx:127`).
- **Painel lateral** com: contador de selecionados, soma de peso, nº de críticos, filtros (janela horária, região, `cliente_critico`).
- **Fluxo da tela:** importar (Passo 2) → pins no mapa → selecionar ~100 (lasso/filtro) → escolher N veículos → "Otimizar" (chama Passo 5) → render N rotas coloridas → **drag-drop** de paradas entre rotas reusando `PATCH /api/routing/rota/[id]/paradas` (mas apontando para `rota_paradas`; criar PATCH equivalente `src/app/api/routing/rota-lote/[id]/paradas/route.ts` se a tabela diferir).
- **PRONTO quando:** dá pra importar, ver pins, selecionar visualmente ~100, otimizar, ver 4 rotas em 4 cores, e arrastar 1 parada de uma rota para outra com persistência.

### Passo 7 — Cliente crítico via service_time
- Na importação (Passo 2) e/ou no cadastro de cliente, marcar `entregas.cliente_critico=true` e setar `service_time_seg` alto (ex: 7200 = 2h para supermercado).
- No `entregaParaJob` (Passo 5), repassar `tempo_descarga_s: service_time_seg`. Opcional: skill `slow_mover` (job exige `skills:[1]`, veículo habilitado via `veiculos.skills_json`).
- **PRONTO quando:** uma entrega com `service_time_seg=7200` faz o VROOM distribuir a carga (não empilha 3 críticos numa rota); visível no `duracao_plan_min`.

### Passo 8 — Tela de despacho
- Na tela do lote (Passo 6), botão **"Despachar"** → `POST /api/routing/lote/[id]/despachar` (`src/app/api/routing/lote/[id]/despachar/route.ts`): transiciona `lote_roteirizacao.status='despachado'`, todas as `rotas` do lote `status='despachada'`, grava `despachado_em`, e notifica cada motorista (WhatsApp via infra existente, ou Realtime).
- **App motorista:** reusar `src/app/mobile/rota/page.tsx` — hoje faz poll por `motorista_id`. Adicionar fonte: buscar `rotas` (lote) por `motorista_id` + `status='despachada'` e suas `rota_paradas`. POD por parada grava `rota_paradas.concluida_em`, `chegada_real`, `pod_foto_url` (reusa `enfileirarConcluirParada` de `src/lib/offline/acoesRota.ts`).
- **PRONTO quando:** clicar "Despachar" muda o status e o motorista vê sua rota no app; concluir parada grava POD em `rota_paradas`.

### Passo 9 — Dashboard de KPIs de frota
- Criar view Supabase (no mesmo `.sql` ou nova migration) `frota_kpis_periodo` agregando de `rota_paradas` + `rotas`:
  - **OTD** = paradas com `chegada_real <= janela_fim` / total concluídas.
  - **OTIF** = paradas no prazo **e** sem `motivo_ocorrencia` / total.
  - **Utilização** = soma `duracao_plan_min` (ou real) das rotas / minutos disponíveis da frota no dia.
  - **km/entrega** = `SUM(rotas.km_plan)` / nº paradas concluídas.
  - **custo/entrega** = (custo combustível+despesas das views existentes `veiculos_resultado_periodo`) / nº entregas.
- Criar `src/app/(dashboard)/relatorios/frota/page.tsx` (ou estender `relatorios/page.tsx:111-135`) consumindo a view. Reusar o widget de `status_operacional_veiculos` (`src/app/(dashboard)/page.tsx:114`) como utilização em tempo real.
- **PRONTO quando:** após um dia com POD registrado, a tela mostra OTD/OTIF/utilização/km-entrega/custo-entrega com números coerentes.

---

## 5. O que este plano PREPARA para a Empresa 2 (terceiros)

A Empresa 2 (híbrida/broker, usa **terceiros**) reaproveita quase tudo daqui, então deixe estes ganchos prontos (já contemplados acima, sem código extra agora):

- **`entregas.executor_tipo`** (campo do futuro, já na fundação): na E3 fica `'frota_propria'`. Na E2 passa a `'terceiro'` — nenhuma migração nova.
- **`rotas.veiculo_id`/`motorista_id`** podem ser nulos: uma rota "despachável a terceiro" é a mesma estrutura sem veículo interno.
- **Endpoint `otimizar-lote`** já recebe `veiculos[]` genéricos (com `capacidade`/`skills`): a E2 só injeta veículos de parceiros + adiciona um **passo de cotação/matching** ANTES do despacho (módulo NOVO da E2, NÃO construir agora).
- **`lote_roteirizacao.status`** já tem o estado `despachado`: a E2 insere um estado intermediário `cotando`/`ofertado` sem quebrar nada (SEM TRAVA permite novos valores de texto).
- **`rota_paradas.motivo_ocorrencia`** (log reverso) serve igual para SLA de terceiro.

> **NÃO construir na E3:** cotação, matching, webhook a parceiro, score de transportadora, CT-e. Tudo isso é Empresa 2.

---

## 6. O que NÃO entra (resumo explícito)

| Item | Por quê / onde fica |
|---|---|
| **MDF-e** | Fase posterior da própria E3 (carga própria em trânsito; NT 2025.001). Deixar dados (`rotas`, `veiculo_id`, `data_operacao`) que alimentarão o MDF-e depois. NÃO emitir agora. |
| **Módulo de terceiros** (cotação/matching/webhook/score) | Empresa 2. |
| **CT-e** | E1/E2 (faturam frete). E3 usa NF-e própria. |
| **Forecast de demanda semanal** | Fase 2 da E3; não bloqueia o despacho diário. |
| **Roteirização "na hora" por voz como modo principal** | É o Modo B da Empresa 1; na E3 é exceção. |
| **Balanceamento VRPRB pós-processamento avançado** | Sweep + capacidade do VROOM já balanceia o suficiente no MVP; refino é fase 2. |

---

## 7. Checklist final de PRONTO da Empresa 3 (MVP Daily Dispatch)

- [ ] `db/migration_empresa03_frota.sql` aplicada; `lote_roteirizacao`/`rotas`/`rota_paradas` existem; colunas de capacidade/lote/crítico em `entregas`/`veiculos`.
- [ ] Importar XML/CSV cria `entregas` com `geocode_status='pendente'`, `origem_demanda='importacao_lote'`.
- [ ] Geocodificação em lote (reuso `resolverCoordenada`) preenche lat/lng.
- [ ] `src/lib/routing/sweep.ts` setoriza respeitando capacidade (teste verde — recomendado).
- [ ] `POST /api/routing/otimizar-lote` divide N caminhões via VROOM multi-veículo (CVRPTW), persiste 1 lote + N rotas + M rota_paradas.
- [ ] `vroom.ts` retorna `veiculo_id` por parada (ajuste do loop 183-197).
- [ ] Tela de mapa: importar → selecionar ~100 (lasso/filtro) → otimizar → N rotas coloridas → drag-drop entre rotas.
- [ ] Cliente crítico via `service_time_seg` distribui a carga.
- [ ] "Despachar" transiciona status e motorista interno recebe rota no app; POD grava em `rota_paradas`.
- [ ] Dashboard de KPIs: OTD/OTIF/utilização/km-entrega/custo-entrega.

---

## 8. Política de testes (do projeto)

Testes são **recomendados, não obrigatórios** (o dono relaxou a regra). Onde vale a pena criar (lógica de negócio):
- `src/__tests__/lib/sweep.test.ts` — setorização (balanceado, estouro de capacidade, 1 ponto).
- `src/__tests__/lib/restricoes.test.ts` — `entregaParaJob` (amount=peso, service=service_time, janelas).
- Teste do `otimizar-lote` com mock do VROOM (multi-veículo retorna `route.vehicle` correto).

`npm test` roda local + mockado (custo de API zero). **NÃO** rodar a cada microedição. Se rodar, reporte o resultado.

---

## 9. Validação com o dono ANTES de codar (regra forte)

Confirme ponto a ponto com o dono:
1. **Tabelas novas `rotas`/`rota_paradas`** separadas das `rotas_otimizadas`/`paradas` (vs. estender as existentes) — OK?
2. **Capacidade** começa só por **peso** (`capacidade_carga_kg`/`peso_carga_kg`) no MVP; volume/paletes ficam de gancho — OK?
3. **Sweep antes do VROOM** (cluster por setor) vs. VROOM multi-veículo direto sem Sweep no MVP — qual primeiro?
4. **Despacho** notifica via **WhatsApp** (infra existente) ou **Realtime**?
5. **Importação**: priorizar **XML NF-e**, **CSV**, ou ambos no MVP?
6. **MDF-e** confirmado como fase posterior (só deixar dados)?

> Só comece a codar após o "ok" do dono nesses 6 pontos.
