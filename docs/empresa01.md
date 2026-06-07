# Plano de Execução — EMPRESA 1 (Transportadora)

> **Documento autossuficiente.** Quem executar isto pode estar sem nenhum contexto prévio. Todos os caminhos de arquivo, nomes de coluna/tabela e SQL estão embutidos aqui, baseados no código real do repositório `SISTEMA_DE_FROTA` (Next.js App Router + Supabase). **Padrão obrigatório do projeto: SEM TRAVA** — `ADD COLUMN IF NOT EXISTS`, sem RLS, sem FK rígida, `GRANT ALL ... TO service_role`. **Antes de codar, valide este plano ponto a ponto com o dono** (regra forte do projeto).

---

## 0. O que é a Empresa 1

Transportadora com caminhões próprios que presta serviço de entrega. A unidade de faturamento é o **pedido** (`pedidos.valor_pedido`); cada pedido contém **N entregas** (paradas individuais). Dois modos de operação, **mesmo schema**, muda só quem cria a entrega e quando:

- **MODO A (antecipado / `origem_demanda='notas_antecipadas'`):** o cliente manda as entregas antes (XML de NFe, CSV ou digitação). Geocoding automático → roteirização VROOM → **motorista confere no app** → executa com POD. Característica: *cadastra → confere → executa*.
- **MODO B (na hora / `origem_demanda='frete_voz_texto'`):** o gestor cria um pedido "leve" (cliente + valor + caminhão/motorista, **sem NF**). O motorista **dita os destinos por voz/texto no WhatsApp**; o bot grava cada parada como entrega com `origem='voz'|'texto'`. Gestor confere depois no painel. Sem NF = registro operacional + prova de entrega, **não** documento fiscal. Característica: *executa → grava → confere*.

---

## 1. Estado atual REAL do código (o que já existe e será reaproveitado)

### 1.1 Roteirização (VROOM) — FUNCIONA, mas desacoplada do Pedido
- **Endpoint:** `POST /api/routing/otimizar` em `src/app/api/routing/otimizar/route.ts`.
  - **Entrada (body JSON):** `{ motorista_id: string, empresa_id: string, origem: { lat, lng } }`; opcionais `data` (YYYY-MM-DD, default hoje) e `destino` (default = origem). Sem auth de usuário — usa `SUPABASE_SERVICE_ROLE_KEY`. Campos faltando → 400 `campos_obrigatorios`.
  - **Saída (201):** `{ rota_id, paradas: [{ nota_id, ordem, endereco, latitude, longitude, chegada_estimada }], distancia_total_km, tempo_total_min, nao_atendidas: string[], nao_atendidas_detalhe: [{ id, motivo, endereco, numero, cep }] }`. Erros: 400 `sem_notas`/`json_invalido`, 500 `db_*`/`todas_geocoding_falharam`, 503 `otimizacao_falhou` (VROOM_URL ausente).
- **VROOM:** `src/lib/routing/vroom.ts` → `otimizarRota({ veiculos, jobs, dataBase? })`. Hoje monta **1 veículo** (id=1) com origem/destino do body e **N jobs** (1 por nota geocodificada), `tempo_descarga_s=300` (5min), **sem janelas nem prioridade**. Chama `VROOM_URL` (env) com `{ vehicles, jobs, options: { g: true } }`, timeout 30s.
- **Mapeamento IDs:** `src/lib/routing/restricoes.ts` → `indexarJobs()` (índice 1-based → UUID da nota) e `traduzirParadasComMapping()` (volta para UUID).
- **Geocoding:** `src/app/api/routing/otimizar/route.ts:geocodarPendentes()` + `src/lib/routing/geocoding.ts`. Cascata: coordenada aprendida pela frota → Overpass → Nominatim (rate-limit 1req/s, `MIN_INTERVAL_MS=1100`). Resolvidas gravam de volta em `notas_capturadas`. **NOTA:** o pipeline Google (cache→Google→ViaCEP) das memórias está em `geocode_cache`/`coordenadas_aprendidas` (já com GRANTs aplicados em `db/migration_fix_permissions_e_cep.sql`); `resolverCoordenada` é o ponto de entrada.
- **Persistência atual:** INSERT em `rotas_otimizadas` (status `otimizada`, `otimizada_em=now()`) + INSERT em `paradas` (1 por nota, `montarParadasPersistir` em `restricoes.ts`), depois `notas_capturadas.status='em_rota'`.
- **Vínculo atual = só `motorista_id`.** O endpoint busca `notas_capturadas` por `.eq('motorista_id', ...)` + `.in('status', ['capturada','geocodificada'])`. **Não há `pedido_id` em nenhuma das três tabelas do módulo.** Esse é o gap central que o Passo 2 resolve.

### 1.2 Captura offline (Modo A — coleta de notas)
- `src/app/mobile/captura-notas/page.tsx` — módulo isolado, sem auth de sessão (usa `?motorista_id=...&empresa_id=...` na URL). Motorista digita CEP+número por NF (`InputEnderecoNF`), grava em IndexedDB (`adicionarNota`) e sincroniza com `POST /api/notas/sync` (`sincronizarFila`). Detecta online/offline. Botão "Finalizar Rota" hoje só muda estado local — tem **TODO explícito** (linha ~117): "passos 1.5+: chamar API de geocoding + otimização".
- `POST /api/notas/sync` em `src/app/api/notas/sync/route.ts` — recebe `motorista_id`+`empresa_id`, **mas NÃO recebe `pedido_id`** (gap a corrigir no Passo 2).

### 1.3 Telas de pedido/entrega já existentes
- **`src/app/(dashboard)/pedidos/novo/page.tsx`** — wizard 3 steps (versão principal): (1) seleciona motorista → busca veículo fixo em `alocacoes`; (2) tabela de `entregas` com `status='agendado'` e `pedido_id IS NULL`, marca checkboxes; (3) form (veículo + roteiro `useMemo` + status/data/valor/km/observações). Submit insere em `pedidos`, atualiza `entregas` selecionadas com `pedido_id/motorista_id/veiculo_id`, redireciona para `/pedidos/[id]`. **É aqui que entra o botão Roteirizar (Passo 3).**
- `src/app/(dashboard)/entregas/novo/page.tsx` — form tabbed alternativo (insere em `pedidos` com `status='agendado'`).
- **App motorista:**
  - `src/app/(motorista)/motorista/page.tsx` — home; busca rotas via `GET /api/routing/rotas`; fallback offline (Dexie `listarRotasCacheadas`); link "Rota do dia" → `/mobile/rota?motorista_id=...&empresa_id=...`.
  - `src/app/(motorista)/motorista/pedidos/[id]/page.tsx` — detalhe do pedido; muda status (`agendada`→`em_andamento` grava `data_inicio_real`; `em_andamento`→`concluida` grava `data_fim_real`) via `supabase.from('pedidos').update()` direto no client. **É aqui/na entrega que entra o POD (Passo 4).**
  - `src/app/(motorista)/motorista/entregas/[id]/page.tsx` — detalhe da entrega, **somente leitura, sem botão de status** (o motorista precisará de ação "Entregar + POD" aqui — Passo 4).

### 1.4 Modo B — extração órfã pronta para plugar
- `src/services/aiService.ts:extrairPedidoFrete()` (linha ~329) — usa gpt-4o com `PROMPT_EXTRAIR_PEDIDO_FRETE`, extrai `cliente_nome, cliente_cnpj, origem, destino, valor_pedido, peso_carga_kg, tipo_carga, data_coleta, data_entrega, observacoes, confianca` de imagem de documento. **Exportada, compila, tem testes** (`src/__tests__/services/aiService.test.ts`), mas **nenhum código de produção a chama**.
- Pontos de integração que hoje só emitem placeholder: `src/lib/whatsapp/flows/gestorFlow.ts` case `'cadastrar_pedido'` (linha ~121) e `src/lib/whatsapp/messageRouter.ts` (linha ~745, tipo `'documento_pedido_frete'`). **Passo 5 conecta isso.**

### 1.5 Schema — gaps confirmados
- `pedidos` (`src/types/database.types.ts:1960-2077`): tem `id, empresa_id, motorista_id, veiculo_id, empresa_motorista_id, status (text), valor_pedido, forma_pagamento, pago, datas previstas/reais (text), observacoes…`. **Faltam** `modo, tamanho, cliente_id, origem_demanda, executor_tipo, pedido_pai_id`.
- `entregas` (`:1200-1361`): tem `id, empresa_id, motorista_id, veiculo_id, pedido_id, cliente_id, status (text), origem (text NOT NULL), destino (text NOT NULL), km_inicial/final/total, datas, peso_carga_kg, tipo_carga, nome_cliente_avulso, observacoes, criado_via…`. **Faltam** `latitude, longitude, geocode_status, sequencia, janela_inicio, janela_fim, service_time_seg, origem_demanda, executor_tipo, pedido_pai_id` (e nota: `origem` aqui é endereço-texto, não a "fonte da demanda" — por isso `origem_demanda` é coluna separada).
- `notas_capturadas`, `rotas_otimizadas`, `paradas`: **criadas direto no painel Supabase em 2026-05-27, NÃO existem em `database.types.ts` nem como CREATE TABLE em `.sql` do repo**. Acessadas via tipos manuais em `src/lib/routing/types.ts`. `notas_capturadas` e `rotas_otimizadas` **não têm `pedido_id`**.
- **Não existe tabela `pod`/comprovante** em lugar nenhum (nem `.sql`, nem `database.types.ts`, nem `routing/types.ts`). É criada do zero no Passo 1.

---

## 2. MIGRAÇÃO SQL — pronta para colar (Supabase SQL Editor)

Crie o arquivo **`db/migration_empresa01_logistica.sql`** com o conteúdo abaixo. Estilo idêntico às migrations existentes (`migration_pedidos_empresa_motorista.sql`, `migration_fix_permissions_e_cep.sql`): comentário de contexto no topo, `ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`, `GRANT ALL ... TO service_role`, **sem RLS, sem FK rígida**. Idempotente — pode rodar mais de uma vez.

```sql
-- ============================================================================
-- migration_empresa01_logistica.sql
-- EMPRESA 1 (Transportadora): roteirização ligada ao Pedido + POD.
-- Padrao SEM TRAVA: ADD COLUMN IF NOT EXISTS, sem RLS, sem FK rigida, GRANT ALL.
-- Idempotente. Rodar no SQL editor do Supabase de prod.
-- Os 3 campos do futuro (origem_demanda/executor_tipo/pedido_pai_id) entram ja
-- agora pra preparar Empresas 2/3/4 sem migracao destrutiva depois.
-- ============================================================================

-- ─── 1. ENTREGAS: geocoding + sequencia + janela/service_time + 3 do futuro ──
ALTER TABLE entregas ADD COLUMN IF NOT EXISTS latitude        NUMERIC;
ALTER TABLE entregas ADD COLUMN IF NOT EXISTS longitude       NUMERIC;
ALTER TABLE entregas ADD COLUMN IF NOT EXISTS geocode_status  TEXT DEFAULT 'pendente';
-- valores usados: pendente | geocodificado | falhou
ALTER TABLE entregas ADD COLUMN IF NOT EXISTS sequencia       INTEGER;        -- ordem na rota (1,2,3...)
ALTER TABLE entregas ADD COLUMN IF NOT EXISTS janela_inicio   TIMESTAMPTZ;    -- VRPTW
ALTER TABLE entregas ADD COLUMN IF NOT EXISTS janela_fim      TIMESTAMPTZ;    -- VRPTW
ALTER TABLE entregas ADD COLUMN IF NOT EXISTS service_time_seg INTEGER DEFAULT 600; -- 10min; alto = cliente lento/critico
-- origem-da-demanda (NAO confundir com a coluna `origem` que ja existe = endereco-texto)
ALTER TABLE entregas ADD COLUMN IF NOT EXISTS origem_demanda  TEXT DEFAULT 'notas_antecipadas';
-- notas_antecipadas | frete_voz_texto | importacao_massa | api_externa
ALTER TABLE entregas ADD COLUMN IF NOT EXISTS executor_tipo   TEXT DEFAULT 'proprio';
-- proprio | terceiro | agregado
ALTER TABLE entregas ADD COLUMN IF NOT EXISTS pedido_pai_id   UUID;          -- split/multi-caminhao (sem FK)

-- ─── 2. PEDIDOS: modo/tamanho/cliente + 3 do futuro ─────────────────────────
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS modo            TEXT DEFAULT 'antecipado'; -- antecipado | na_hora
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS tamanho         TEXT DEFAULT 'pequeno';    -- pequeno | grande | gigante
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS cliente_id      UUID;          -- contratante do frete (sem FK)
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS origem_demanda  TEXT DEFAULT 'notas_antecipadas';
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS executor_tipo   TEXT DEFAULT 'proprio';
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS pedido_pai_id   UUID;          -- self-ref logico (sem FK)

-- ─── 3. Ligar o modulo de routing isolado ao Pedido ─────────────────────────
-- notas_capturadas/rotas_otimizadas/paradas foram criadas no painel em 2026-05-27.
-- Adicionamos pedido_id pra amarrar a rota ao pedido (gap principal). Sem FK.
ALTER TABLE notas_capturadas  ADD COLUMN IF NOT EXISTS pedido_id UUID;
ALTER TABLE rotas_otimizadas  ADD COLUMN IF NOT EXISTS pedido_id UUID;
ALTER TABLE paradas           ADD COLUMN IF NOT EXISTS pedido_id UUID;
ALTER TABLE paradas           ADD COLUMN IF NOT EXISTS entrega_id UUID; -- liga parada<->entrega quando origem=pedido

-- ─── 4. ROTAS (NOVA) — 1 por veiculo dentro do pedido (gigante/multi-caminhao)
-- Em pequeno/grande fica NULL (pedido -> veiculo direto). Preenchida em gigante.
CREATE TABLE IF NOT EXISTS rotas (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id          UUID,
  pedido_id           UUID,            -- pedido pai (sem FK)
  veiculo_id          UUID,
  motorista_id        UUID,
  data_planejada      DATE,
  status              TEXT DEFAULT 'rascunho', -- rascunho|otimizada|em_andamento|concluida|cancelada
  km_estimado         NUMERIC,
  tempo_estimado_min  NUMERIC,
  polyline            TEXT,            -- geometria OSRM p/ desenhar no mapa
  vroom_payload       JSONB,           -- auditoria planejado vs realizado
  executor_tipo       TEXT DEFAULT 'proprio',
  criada_em           TIMESTAMPTZ DEFAULT now(),
  otimizada_em        TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_rotas_pedido    ON rotas (pedido_id);
CREATE INDEX IF NOT EXISTS idx_rotas_empresa   ON rotas (empresa_id);

-- ─── 5. POD (NOVA) — prova de entrega por parada. Reusavel nos 4 modelos. ────
CREATE TABLE IF NOT EXISTS pod (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entrega_id      UUID,                -- a qual entrega pertence (sem FK)
  empresa_id      UUID,
  foto_url        TEXT,
  assinatura_url  TEXT,                -- opcional
  latitude        NUMERIC,             -- GPS do momento da entrega
  longitude       NUMERIC,
  capturado_em    TIMESTAMPTZ DEFAULT now(),
  observacao      TEXT,
  recebedor       TEXT,                -- nome de quem recebeu
  tipo_ocorrencia TEXT DEFAULT 'entregue'
  -- entregue | falha_ausencia | recusada | endereco_invalido | devolvida
);
CREATE INDEX IF NOT EXISTS idx_pod_entrega ON pod (entrega_id);

-- ─── 6. GRANTs (PostgREST usa service_role com a service key). SEM TRAVA. ────
GRANT ALL PRIVILEGES ON TABLE public.rotas             TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.pod               TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.notas_capturadas  TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.rotas_otimizadas  TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.paradas           TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.entregas          TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.pedidos           TO service_role;

-- ─── 7. Documentacao inline ─────────────────────────────────────────────────
COMMENT ON COLUMN entregas.origem_demanda IS 'Fonte da demanda: notas_antecipadas|frete_voz_texto|importacao_massa|api_externa. NAO confundir com `origem` (endereco-texto).';
COMMENT ON COLUMN entregas.service_time_seg IS 'Tempo de descarga p/ VROOM. Alto = cliente lento/critico (distribui naturalmente entre caminhoes).';
COMMENT ON TABLE  rotas IS 'EMPRESA 1+: 1 rota por veiculo dentro do pedido. NULL em pequeno/grande, preenchida em gigante.';
COMMENT ON TABLE  pod   IS 'Proof of Delivery por parada (foto+GPS+timestamp). Reusavel nos 4 modelos.';
```

**Após rodar a migration**, regenere os tipos (as 3 tabelas isoladas + `rotas`/`pod` ainda não estão em `database.types.ts`):

```bash
npx supabase gen types typescript --project-id <PROJECT_ID> > src/types/database.types.ts
```

**Critério de PRONTO do Passo 1:** migration roda sem erro no SQL editor (idempotente — rode 2×); `SELECT latitude, sequencia, origem_demanda FROM entregas LIMIT 1;` e `SELECT * FROM pod LIMIT 1;` e `SELECT * FROM rotas LIMIT 1;` retornam sem erro de coluna; tipos regenerados incluem `rotas`, `pod`, `entregas.latitude`, `entregas.sequencia`.

---

## 3. Passos numerados (na ordem)

### Passo 1 — Schema
Já descrito na seção 2. **Faça primeiro, valide com o dono, depois rode.** Critério de pronto na seção 2.

---

### Passo 2 — Ligar Pedido ⇄ Rota (fechar o gap motorista_id-only)
**Objetivo:** rotas e notas passam a carregar `pedido_id`, e o endpoint de otimização aceita filtrar por pedido.

**Arquivos a editar:**
- `src/app/api/notas/sync/route.ts` — adicionar `pedido_id?: string` em `SyncRequest` e gravar em `notas_capturadas.pedido_id` (default null = mantém comportamento atual de Modo B/captura solta).
- `src/app/api/routing/otimizar/route.ts`:
  - `OtimizarRequest` (linha ~46): adicionar `pedido_id?: string`.
  - `buscarNotas` (linha ~71-83): se `pedido_id` vier, adicionar `.eq('pedido_id', pedido_id)` ao filtro existente (`.eq('motorista_id')` + `.in('status', [...])`).
  - INSERT em `rotas_otimizadas` (linha ~215-228): incluir `pedido_id`.
- `src/lib/routing/restricoes.ts` — `montarParadasPersistir` (linha ~156-189): propagar `pedido_id` (e, quando aplicável, `entrega_id`) para cada parada.
- `src/lib/routing/types.ts` — adicionar `pedido_id?: string | null` em `NotaCapturada`, `RotaOtimizada`, `Parada`.

**Critério de PRONTO:** chamar `POST /api/routing/otimizar` com `{ motorista_id, empresa_id, origem, pedido_id }` gera uma rota cujas `paradas` e `rotas_otimizadas` têm o `pedido_id` correto no banco; chamar sem `pedido_id` mantém o comportamento antigo (não quebra a captura existente).

---

### Passo 3 — Botão "Roteirizar" + mapa na tela do pedido
**Objetivo:** no detalhe/criação do pedido (Modo A), gerar e visualizar a sequência ótima.

**Arquivos a editar/criar:**
- `src/app/(dashboard)/pedidos/novo/page.tsx` (e/ou a tela de detalhe `src/app/(dashboard)/pedidos/[id]/page.tsx` se existir) — adicionar botão **Roteirizar** que:
  1. Para cada entrega do pedido sem `latitude/longitude`, dispara geocoding (reusar o pipeline via endpoint; **não** duplicar lógica). Caminho mais simples: o endpoint `otimizar` já geocodifica notas; para entregas, criar/usar um endpoint em lote que grava `entregas.latitude/longitude/geocode_status` chamando `resolverCoordenada` de `src/lib/routing/resolverCoordenada.ts`.
  2. Chama `POST /api/routing/otimizar` com `pedido_id`.
  3. Grava `entregas.sequencia` a partir de `paradas.ordem` retornado.
- **Novo componente de mapa:** `src/components/MapaRota.tsx` — Leaflet + tiles OSM (custo zero), desenha pinos numerados por `sequencia` e a polyline (`rotas.polyline` quando houver). Selo de cor por `coord_fonte` (aprendida=azul, google=verde, nominatim/overpass=vermelho) — convenção já em `routing/types.ts`.

**Critério de PRONTO:** abrir um pedido com ≥3 entregas, clicar Roteirizar, ver as entregas reordenadas por sequência e desenhadas no mapa na ordem otimizada; recarregar a página mantém a sequência (persistida em `entregas.sequencia`).

---

### Passo 4 — POD (foto + GPS) no app do motorista
**Objetivo:** o motorista marca cada entrega como concluída com prova.

**Arquivos a criar/editar:**
- **Novo endpoint:** `src/app/api/pod/route.ts` — `POST` recebe `{ entrega_id, empresa_id, foto_url, latitude, longitude, recebedor?, observacao?, tipo_ocorrencia? }`, insere em `pod`, e atualiza `entregas.status` (`entregue`/`falha_ausencia`/…). Sem auth de usuário (padrão do projeto, usa service role).
- **Upload de foto:** usar Supabase Storage (bucket `pod`); o app envia a foto, recebe `foto_url`, e chama o endpoint. GPS via `navigator.geolocation`.
- `src/app/(motorista)/motorista/entregas/[id]/page.tsx` — hoje é **somente leitura**; adicionar botão **"Registrar entrega"** que captura foto + GPS e chama `/api/pod`. (A mudança de status de pedido continua em `motorista/pedidos/[id]/page.tsx`.)
- Suporte offline: enfileirar POD no Dexie quando offline (mesmo padrão de `captura-notas`/`sincronizarFila`) e sincronizar ao voltar online.

**Critério de PRONTO:** motorista abre uma entrega, tira foto, confirma; aparece um registro em `pod` com `foto_url`+lat/lng+timestamp e `entregas.status='entregue'`; funciona offline (enfileira) e sincroniza ao reconectar.

---

### Passo 5 — Modo B: plugar `extrairPedidoFrete` (frete por voz/texto/foto)
**Objetivo:** conectar a função órfã ao fluxo real do WhatsApp.

**Arquivos a editar:**
- `src/lib/whatsapp/flows/gestorFlow.ts` — case `'cadastrar_pedido'` (linha ~121) e o handler de foto/documento (linha ~47): em vez do placeholder, chamar `extrairPedidoFrete()` de `src/services/aiService.ts` (linha ~329). Se `confianca >= threshold` (alinhar valor com o dono; gestorFlow já usa 55 para intent), seguir o padrão **propose → confirm** (mencionado nas memórias do projeto): bot mostra o que extraiu e pede confirmação antes de gravar.
- `src/lib/whatsapp/messageRouter.ts` (linha ~745, tipo `'documento_pedido_frete'`) — mesma ligação.
- Ao confirmar: inserir `pedidos` com `modo='na_hora'`, `origem_demanda='frete_voz_texto'`, `executor_tipo='proprio'`, `cliente_id` resolvido/null, `valor_pedido`; e cada destino ditado vira `entregas` com `origem_demanda='frete_voz_texto'`, `origem`/`destino` em texto.

**Critério de PRONTO:** mandar uma foto de documento de frete (ou ditar destinos) pelo WhatsApp do gestor cria um pedido `na_hora` com as entregas gravadas e `origem_demanda='frete_voz_texto'`, após confirmação do usuário no chat. Recomendado: atualizar `src/__tests__/services/aiService.test.ts` se mudar a assinatura (testes já existem para a função).

---

### Passo 6 — Realtime no painel do gestor
**Objetivo:** o gestor vê entregas/PODs aparecerem em tempo real (essencial no Modo B, onde a entrega é criada durante a execução).

**Arquivos a criar/editar:**
- Tela de acompanhamento (ex.: `src/app/(dashboard)/pedidos/[id]/page.tsx` ou nova `src/app/(dashboard)/operacao/page.tsx`) — assinar Supabase Realtime nas tabelas `entregas` e `pod` (filtro por `empresa_id`/`pedido_id`), atualizando a lista e o mapa sem refresh. Filtro por `origem_demanda` para separar Modo A vs B.

**Critério de PRONTO:** com o painel aberto, ao gravar um POD pelo app do motorista (Passo 4) ou ao bot criar uma entrega via WhatsApp (Passo 5), a linha/pino aparece/atualiza no painel em segundos, sem recarregar.

---

## 4. O que isto PREPARA para as Empresas 2/3/4 (sem retrabalho)

Os 3 campos embutidos já agora (`origem_demanda`, `executor_tipo`, `pedido_pai_id`) e as tabelas `rotas`/`pod` são o "futuro sem migração destrutiva":

- **Empresa 3 (frota própria / multi-caminhão):** a tabela `rotas` (1 por veículo, `pedido_pai_id`/`pedido_id` ligando ao pedido pai) já permite o split CVRP/CVRPTW; `janela_inicio/janela_fim` + `service_time_seg` em `entregas` já habilitam VRPTW e a distribuição de clientes lentos/críticos. Falta só ativar setorização (Sweep/K-means) + VROOM multi-veículo por flag.
- **Empresa 2 (híbrida própria+terceiro):** `executor_tipo` (`proprio|terceiro|agregado`) em `pedidos`/`entregas`/`rotas` já distingue quem executa, sem nova tabela. Importação em massa usa `origem_demanda='importacao_massa'`.
- **Empresa 4 (broker/4PL):** `origem_demanda='api_externa'` + `pedido_pai_id` para split N-way + repasse; `pod` continua sendo a prova reusável. Broker não roteiriza — só matching/repasse.
- **Comum a todos (não muda):** pedido→entrega, geocoding com cache, OSRM+VROOM, app motorista offline+POD, faturamento em `pedidos.valor_pedido`.

---

## 5. O que NÃO entra (Fase 2 — fora do MVP da Empresa 1)

- **CT-e / MDF-e / canhoto eletrônico** — épico fiscal próprio com integração SEFAZ. Modo B = registro operacional + prova de entrega, **não** documento legal de transporte. Confirmar com o dono apenas se o cliente-piloto exigir já (recomendação: fase 2).
- **XML de NFe na importação** — começar por digitação/CSV; OCR de DANFE e parsing de XML vêm logo depois, mas **não** bloqueiam o MVP.
- **Rastreamento GPS contínuo via WebSocket** — overkill para 10 caminhões; POD por parada + ping ocasional resolve.
- **Re-otimização dinâmica contínua** — fora.
- **Empresa gigante/multi-caminhão completa** (setorização Sweep/K-means + VROOM N-veículos) — o schema já prepara (`rotas`, `pedido_pai_id`), mas a implementação é Fase C (por flag), não MVP.

---

## 6. Checklist de execução

1. [ ] Validar este plano ponto a ponto com o dono (regra forte).
2. [ ] Criar e rodar `db/migration_empresa01_logistica.sql` (idempotente) → regenerar `database.types.ts`.
3. [ ] Passo 2: `pedido_id` em sync/otimizar/restricoes/types.
4. [ ] Passo 3: botão Roteirizar + `MapaRota.tsx` + geocoding em lote de entregas.
5. [ ] Passo 4: `/api/pod` + Storage `pod` + botão no app motorista + fila offline.
6. [ ] Passo 5: plugar `extrairPedidoFrete` em gestorFlow/messageRouter (propose→confirm).
7. [ ] Passo 6: Realtime no painel.
8. [ ] (Recomendado, não obrigatório) `npm test` antes de mergear — custo de API zero, roda local+mockado.

---

## Testes
- ⚠️ Este documento é um **plano**; nenhuma alteração de código foi feita nesta tarefa, então `npm test` não foi executado.
- Recomendação para quem executar: atualizar `src/__tests__/services/aiService.test.ts` se a assinatura de `extrairPedidoFrete` mudar (Passo 5) e rodar `npm test` antes de mudanças grandes (Passos 2 e 4 são os de maior risco). Política do projeto: testes **recomendados, não obrigatórios**.
