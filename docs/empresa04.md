# Empresa 4 — BROKER / 4PL ASSET-LIGHT — Plano de Execução Autossuficiente

> **Status:** PLANO. Nada implementado. **Validar cada ponto com o dono antes de codar** (regra forte do projeto — ver `memory/feedback_confirmar_plano.md`).
> **Modelo de negócio:** orquestrador SEM caminhão e SEM armazém. O ativo é a tecnologia (TMS + matching). Recebe carga de múltiplos embarcadores, **casa** com transportadores/agregados, **rastreia e fiscaliza SLA**, cobra **comissão 5–10%** (ou spread). O sistema deixa de ser **ROUTER** e vira **DISPATCHER + TRACKER**.
> **Fonte de verdade do conceito:** `docs/PLANO_LOGISTICA_4_EMPRESAS.md` linhas 348–434 e 513–514. Leia se quiser o porquê; este arquivo já traz o COMO pronto.

---

## 0. O salto arquitetural (leia isto primeiro)

Nas Empresas 1/2/3 o sistema **decide a sequência de paradas** (OSRM + VROOM = core). Na Empresa 4 **o parceiro roteiriza no sistema dele** — o broker NÃO calcula rotas. OSRM/VROOM ficam **opcionais**, usados só pra (a) calcular raio de matching e (b) visualizar no mapa.

O papel do sistema muda para 4 verbos:
1. **Publica** a oferta de carga (marketplace).
2. **Casa** carga ⇄ transportador (matching: raio, capacidade, skill, score, prazo).
3. **Rastreia** status via pull (puxa GPS) ou push (webhook do parceiro).
4. **Fatura** por comissão com split N-way (broker cobra embarcador, repassa parceiro).

A lógica central desloca-se de **algoritmos de otimização** para **API de matching + SLA tracking + scoring de parceiros**.

O **app do motorista vira TRACKER**: sem roteirização, sem "conferir rota", sem VROOM. Só recebe paradas (que vêm do TMS do parceiro ou são digitadas) e devolve POD reduzido (foto + GPS + timestamp, sem assinatura).

---

## 1. PRÉ-REQUISITOS (NÃO comece sem isto aplicado)

A Empresa 4 é a **Fase D** do roadmap (`PLANO_LOGISTICA_4_EMPRESAS.md:513-514`). Ela **reaproveita** o que as empresas anteriores construíram. Antes de tocar qualquer coisa aqui, confirme que existe no banco:

- **Empresa 1 aplicada** (`docs/empresa01.md`, quando existir): hierarquia `pedido → entrega` com campos neutros de fundação:
  - `pedidos.origem_demanda` ENUM (`notas_antecipadas`|`frete_voz_texto`|`importacao_massa`|`api_externa`) — a E4 usa `'api_externa'`.
  - `pedidos.pedido_pai_id` (self-FK nullable) — split N-way.
  - tabela `pod` (ou as colunas POD nas paradas).
- **Empresa 3 aplicada** (`docs/empresa03.md`): tabelas/colunas de rota planejada e POD do executor (reaproveitadas para receber o POD do terceiro).
- **Empresa 2 aplicada** (`docs/empresa02.md`): tabela `terceiros` (semente do `transportador`), colunas `executor_tipo` em rota, e o **mecanismo webhook dispatch → callback** (`webhook_url`, `webhook_token`, `webhook_dispatch_id`, callback de status/POD). A E4 usa esse canal para **TODA** operação (não só overflow).

> ⚠️ Se as migrations de E1/E2/E3 ainda **não existem** no diretório `db/` (hoje só existe a fundação: `migration_limpeza_modelo.sql` renomeou `viagens→pedidos`, `fretes→entregas`), **PARE e alinhe com o dono** qual é o estado real. Este plano assume que `pedidos`, `entregas`, `empresas`, `terceiros`, `executor_tipo`, `origem_demanda` já existem. Os campos da E4 abaixo usam `ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS`, então são seguros mesmo se algum pré-requisito faltar — mas o **comportamento** depende deles.

**Tabelas REAIS que já existem hoje (confirmadas no código):**
- `empresas` (com `whatsapp_instance`, `whatsapp_numero`) — `db/migration_whatsapp_empresa.sql`.
- `pedidos` (ex-`viagens`): `id`, `empresa_id`, `motorista_id`, `veiculo_id`, `empresa_motorista_id`, `cliente_id`, `valor_pedido`, `forma_pagamento`, `pago`, `data_pagamento`, `status`, `km_inicial`, `km_final`, `data_inicio_*`, `data_fim_*`, `created_at`, `updated_at` — `db/migration_limpeza_modelo.sql`.
- `entregas` (ex-`fretes`): `id`, `pedido_id`, `cliente_id`, `empresa_id`, `motorista_id`, `veiculo_id`.
- `clientes`, `veiculos`, `motoristas`, `pedido_motoristas`.
- **Módulo routing já existente** (tabelas `notas_capturadas`, `rotas_otimizadas`, `paradas` — ver `src/lib/routing/types.ts`). NÃO confundir com `pedidos/entregas`: routing é o app do motorista de captura/rota. O tracker da E4 vai **estender `rotas_otimizadas` + `paradas`**, não recriar.
- Views: `pedidos_com_resultado`, `veiculos_resultado_periodo`, `kpi_mensal_*`.

---

## 2. DELTA da Empresa 4 (o que esta empresa adiciona)

| # | Delta | Onde |
|---|---|---|
| 1 | Feature flag por tenant: `empresas.modelo='broker'` liga/desliga telas | migration §3.1 + helper §6 |
| 2 | Tabelas novas: `transportador`, `transportador_score`, `oferta_frete`, `split_faturamento` | migration §3.2–3.5 |
| 3 | Matching carga ⇄ transportador (raio, capacidade, skill, score, prazo) | `src/lib/broker/matching.ts` |
| 4 | Marketplace de oferta (ofertar / aceitar / rejeitar / expirar) | tabela `oferta_frete` + API §5 |
| 5 | Recebimento de status/POD de terceiros via webhook (pull + push) | `POST /api/tracker/webhook` |
| 6 | Faturamento por comissão + split N-way | `split_faturamento` + `src/lib/broker/split.ts` |

**Variantes (apenas flags, NÃO construir agora):**
- **Cooperativa (CTC):** `transportador.tipo='cooperado'` + consolidação CT-e/MDF-e. Reaproveita ~80% (= Transportadora com pool de agregados).
- **Fulfillment e-commerce:** roteiriza próprio + clustering geográfico (k-means++ capacitado) — é híbrido, NÃO é broker puro. Fica como flag futura.

---

## 3. MIGRAÇÃO SQL (pronta pra colar no Supabase)

> Padrão do projeto **SEM TRAVA**: `ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`, **sem RLS**, **sem FK rígida** (FKs comentadas — o dono não quer travar por empresa_id; ver `memory/project_empresas_fiscais.md`), `GRANT ALL`. Idempotente. Salvar como `db/migration_empresa04_broker.sql`.

```sql
-- ============================================================================
-- MIGRATION: Empresa 4 — Broker / 4PL Asset-Light
-- Padrão SEM TRAVA: idempotente, sem RLS, FK comentada, GRANT ALL.
-- PRÉ-REQUISITO: E1/E2/E3 aplicadas (pedidos, entregas, terceiros, executor_tipo).
-- ============================================================================
BEGIN;

-- ── §3.1 Feature flag por tenant ──────────────────────────────────────────
-- 'modelo' governa quais telas/features aparecem. 1 sistema, 4 comportamentos.
ALTER TABLE empresas
  ADD COLUMN IF NOT EXISTS modelo TEXT NOT NULL DEFAULT 'transportadora';
COMMENT ON COLUMN empresas.modelo IS
  'transportadora|hibrida|frota_propria|broker — liga/desliga features por tenant';
-- Validação leve (sem ENUM rígido pra não travar evolução):
-- valores aceitos hoje: transportadora, hibrida, frota_propria, broker, cooperativa, fulfillment

-- ── §3.2 transportador (parceiros da rede) ────────────────────────────────
-- Semente = tabela `terceiros` (E2). Aqui é a entidade central do M4.
CREATE TABLE IF NOT EXISTS transportador (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id       UUID,                         -- broker dono da rede (sem FK: SEM TRAVA)
  nome             TEXT NOT NULL,
  documento        TEXT,                          -- CNPJ/CPF do parceiro
  tipo             TEXT NOT NULL DEFAULT 'terceiro', -- terceiro|agregado|cooperado
  telefone         TEXT,                          -- casa com auth do bot (sem 55, ver memory)
  capacidade_kg    NUMERIC(10,2),
  capacidade_m3    NUMERIC(10,2),
  skills           JSONB DEFAULT '[]'::jsonb,     -- ['refrigerado','quimico','frota_leve']
  raio_atuacao_km  NUMERIC(10,2) DEFAULT 50,
  base_lat         NUMERIC(10,7),                 -- ponto de origem p/ cálculo de raio
  base_lng         NUMERIC(10,7),
  webhook_url      TEXT,                          -- p/ push de oferta (reusa padrão E2)
  webhook_token    TEXT,                          -- segredo do callback
  ativo            BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE transportador IS 'Parceiro da rede do broker que executa rotas (terceiro/agregado/cooperado).';

-- ── §3.3 transportador_score (reputação por período) ──────────────────────
CREATE TABLE IF NOT EXISTS transportador_score (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transportador_id   UUID,                        -- sem FK: SEM TRAVA
  periodo            DATE NOT NULL,               -- 1º dia do mês de referência
  on_time_pct        NUMERIC(5,2) DEFAULT 0,      -- % entregas no prazo (0-100)
  entregas           INTEGER DEFAULT 0,           -- total no período
  avarias            INTEGER DEFAULT 0,           -- ocorrências/devoluções
  score              NUMERIC(5,2) DEFAULT 0,      -- score consolidado (calculado)
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_score_transportador ON transportador_score(transportador_id, periodo);
COMMENT ON TABLE transportador_score IS 'Reputação do parceiro por período. Alimenta o matching e o ranking.';

-- ── §3.4 oferta_frete (marketplace: 1 carga → N ofertas) ──────────────────
CREATE TABLE IF NOT EXISTS oferta_frete (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id         UUID,                         -- a carga (reusa `pedidos`); sem FK
  transportador_id  UUID,                         -- p/ quem foi ofertada; sem FK
  valor_ofertado    NUMERIC(10,2),                -- frete proposto ao parceiro
  comissao_pct      NUMERIC(5,2) DEFAULT 8,       -- comissão do broker (5-10%)
  status            TEXT NOT NULL DEFAULT 'ofertada', -- ofertada|aceita|rejeitada|expirada
  ofertada_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
  respondida_em     TIMESTAMPTZ,
  expira_em         TIMESTAMPTZ,                  -- p/ expiração automática
  motivo_rejeicao   TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_oferta_pedido ON oferta_frete(pedido_id);
CREATE INDEX IF NOT EXISTS idx_oferta_status ON oferta_frete(status);
COMMENT ON TABLE oferta_frete IS 'Marketplace: cada carga pode ter N ofertas em paralelo. Parceiro aceita/rejeita.';

-- ── §3.5 split_faturamento (divisão financeira N-way) ─────────────────────
CREATE TABLE IF NOT EXISTS split_faturamento (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  oferta_id         UUID,                         -- a oferta aceita; sem FK
  pedido_id         UUID,                         -- denormalizado p/ relatório
  transportador_id  UUID,
  valor_bruto       NUMERIC(10,2),                -- cobrado do embarcador (100%)
  comissao_pct      NUMERIC(5,2),
  valor_comissao    NUMERIC(10,2),                -- fica com o broker
  valor_repasse     NUMERIC(10,2),                -- repassado ao parceiro
  status            TEXT NOT NULL DEFAULT 'pendente', -- pendente|faturado|pago
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_split_pedido ON split_faturamento(pedido_id);
COMMENT ON TABLE split_faturamento IS 'Broker cobra embarcador 100%, fica com comissão, repassa parceiro. N-way = N parceiros por pedido pai.';

-- ── §3.6 Espelho de status externo do parceiro (não sobrescreve status interno) ──
-- pedido recebido do embarcador via api_externa: marca origem.
-- (origem_demanda já deve existir da E1; reforço idempotente)
ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS origem_demanda TEXT,
  ADD COLUMN IF NOT EXISTS status_externo TEXT,        -- status cru do TMS do parceiro
  ADD COLUMN IF NOT EXISTS prazo_entrega  TIMESTAMPTZ; -- SLA acordado com embarcador
COMMENT ON COLUMN pedidos.status_externo IS 'Status espelhado do TMS do parceiro (não sobrescreve pedidos.status interno).';

-- POD do terceiro chega por webhook → grava nas paradas (reusa schema routing).
ALTER TABLE paradas
  ADD COLUMN IF NOT EXISTS pod_foto_url   TEXT,
  ADD COLUMN IF NOT EXISTS pod_lat        NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS pod_lng        NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS pod_gps_ok     BOOLEAN;      -- GPS dentro do raio da entrega?

-- ── §3.7 GRANT ALL (padrão SEM TRAVA) ─────────────────────────────────────
GRANT ALL ON transportador, transportador_score, oferta_frete, split_faturamento
  TO anon, authenticated, service_role;

COMMIT;
-- ROLLBACK; -- use se algo der errado
```

**Critério de PRONTO §3:** rodar no SQL editor do Supabase sem erro; `SELECT * FROM transportador LIMIT 1` retorna estrutura; `SELECT column_name FROM information_schema.columns WHERE table_name='empresas' AND column_name='modelo'` retorna 1 linha. Depois rodar `npx supabase gen types typescript ... > src/types/database.types.ts`.

---

## 4. ARQUIVOS A CRIAR / TOCAR

| Arquivo | Ação | O que faz |
|---|---|---|
| `db/migration_empresa04_broker.sql` | **criar** | migração §3 acima |
| `src/lib/broker/featureFlags.ts` | **criar** | `getModeloEmpresa(empresaId)` + `isBroker()` — lê `empresas.modelo` |
| `src/lib/broker/matching.ts` | **criar** | core: dado um `pedido`, retorna transportadores elegíveis ordenados por score |
| `src/lib/broker/oferta.ts` | **criar** | criar/aceitar/rejeitar/expirar oferta (transições de `oferta_frete.status`) |
| `src/lib/broker/split.ts` | **criar** | calcula `valor_comissao`/`valor_repasse` e grava `split_faturamento` |
| `src/lib/broker/scoring.ts` | **criar** | recalcula `transportador_score` (on_time_pct, avarias) por período |
| `src/lib/broker/types.ts` | **criar** | tipos TS espelho das 4 tabelas (siga o padrão de `src/lib/routing/types.ts`) |
| `src/app/api/broker/ofertas/route.ts` | **criar** | POST cria oferta(s) p/ um pedido; GET lista por pedido/status |
| `src/app/api/broker/ofertas/[id]/aceitar/route.ts` | **criar** | parceiro aceita → grava rota + split |
| `src/app/api/broker/ofertas/[id]/rejeitar/route.ts` | **criar** | parceiro rejeita |
| `src/app/api/tracker/webhook/route.ts` | **criar** | recebe status/POD do parceiro (push). **Clonar a arquitetura de** `src/app/api/whatsapp/webhook/route.ts` (auth por header `apikey`/token, parse de envelope, fire-and-forget, 200 imediato) |
| `src/app/api/embarcador/pedidos/route.ts` | **criar** | API pública p/ embarcador enviar carga (`origem_demanda='api_externa'`). Auth por token de embarcador |
| `src/app/(dashboard)/broker/marketplace/page.tsx` | **criar** | tela de marketplace de oferta de frete |
| `src/app/(dashboard)/broker/transportadores/page.tsx` | **criar** | ranking/score de transportadores |
| `src/app/(dashboard)/broker/faturamento/page.tsx` | **criar** | split N-way |

> **Reaproveitamento direto (NÃO recriar):**
> - Geocoding: `src/lib/routing/resolverCoordenada.ts` (cache→Google→ViaCEP) — usado p/ geocodar endereço do embarcador e calcular raio de matching.
> - Mapa/torre de controle: componentes Leaflet de routing (próprios + terceiros no mesmo mapa).
> - Bot WhatsApp + motor de regras no-code: gestores de embarcador/parceiro confirmam fretes e recebem alertas SLA pelo mesmo canal — `src/lib/whatsapp/messageRouter.ts`.
> - App do motorista (PWA offline): vira **tracker** — desligar VROOM/“conferir rota”, manter POD reduzido offline-first (`src/lib/offline/acoesRota.ts`).

---

## 5. PASSOS NUMERADOS (ordem de execução + critério de PRONTO)

> Cada passo deixa software útil. NÃO pule o passo 0.

**Passo 0 — Validar plano com o dono.** Mostrar este `.md`. Confirmar: (a) E1/E2/E3 estão aplicadas? (b) comissão default 8%? (c) expiração de oferta automática ou manual? (d) há embarcador-piloto exigindo API pública já, ou começa interno?
**PRONTO:** dono aprovou ponto a ponto.

**Passo 1 — Migração.** Aplicar `db/migration_empresa04_broker.sql` no Supabase (revisar antes do COMMIT). Regenerar `database.types.ts`.
**PRONTO:** 4 tabelas + colunas existem; types atualizados; `empresas.modelo` setado para o tenant broker.

**Passo 2 — Feature flag + tipos.** `src/lib/broker/featureFlags.ts` (`isBroker(empresaId)`) e `src/lib/broker/types.ts`.
**PRONTO:** `isBroker()` retorna true p/ o tenant marcado `'broker'`; tipos compilam (`npm run build` ou `tsc --noEmit`).

**Passo 3 — Cadastro de transportador.** CRUD mínimo (pode ser tela admin ou seed direto). Importar/semear da tabela `terceiros` (E2) se existir.
**PRONTO:** ao menos 2 transportadores ativos com `base_lat/lng`, `capacidade_kg`, `skills`, `raio_atuacao_km`.

**Passo 4 — Recebimento de carga do embarcador.** `POST /api/embarcador/pedidos`: cria `pedido` com `origem_demanda='api_externa'`, geocodifica endereço (resolverCoordenada), grava `prazo_entrega`.
**PRONTO:** um POST de teste cria pedido geocodificado; aparece como "carga pendente de matching".

**Passo 5 — Matching (`src/lib/broker/matching.ts`).** Dado um pedido: filtra transportadores `ativo=true` cujo `raio_atuacao_km` cobre a distância base→entrega (Haversine), com `capacidade_kg/m3` suficiente e `skills` requeridos; ordena por `transportador_score.score` desc.
**PRONTO:** função retorna lista ordenada; teste em `src/__tests__/lib/brokerMatching.test.ts` cobre: dentro/fora do raio, sem capacidade, sem skill, ordenação por score (testes recomendados, não obrigatórios — ver CLAUDE.md).

**Passo 6 — Marketplace de oferta.** `oferta.ts` + `POST /api/broker/ofertas` (cria N ofertas p/ os top-K do matching) + endpoints aceitar/rejeitar. Aceite: marca `status='aceita'`, expira as demais (`'expirada'`), cria `rotas_otimizadas` ligada ao transportador, dispara webhook ao parceiro (reusa padrão E2).
**PRONTO:** fluxo ofertar→aceitar muda status corretamente e gera 1 rota; aceitar uma expira as concorrentes.

**Passo 7 — Tracker webhook.** `POST /api/tracker/webhook`: recebe status/POD do parceiro, espelha em `pedidos.status_externo`, grava POD nas `paradas` (`pod_foto_url`, `pod_lat/lng`, `pod_gps_ok` = GPS dentro do raio?). Clonar auth/fire-and-forget de `whatsapp/webhook/route.ts`.
**PRONTO:** POST de teste com payload de status atualiza `status_externo`; POST de POD grava foto+GPS e calcula `pod_gps_ok`.

**Passo 8 — Scoring.** `scoring.ts` recalcula `transportador_score` por período a partir das entregas concluídas (on_time = entregue ≤ `prazo_entrega`). Pode rodar sob demanda (botão) ou via cron (fase 2).
**PRONTO:** após N entregas, `on_time_pct` e `score` refletem o histórico; ranking ordena por score.

**Passo 9 — Split de faturamento.** `split.ts`: ao concluir o pedido, grava `split_faturamento` (`valor_bruto`, `valor_comissao = bruto*pct`, `valor_repasse = bruto - comissao`). N-way = pedido pai com N filhos (`pedido_pai_id`) → uma linha de split por parceiro.
**PRONTO:** tela de faturamento mostra bruto/comissão/repasse por pedido; soma dos repasses + comissão = bruto.

**Passo 10 — Telas broker** (atrás de `isBroker()`): marketplace, ranking, faturamento. App do motorista em modo tracker (esconder roteirização).
**PRONTO:** com `empresas.modelo='broker'`, as 3 telas aparecem e as telas de roteirização em lote (planejamento 500→100, divisão por N caminhões) **somem**; com outro modelo, comportamento inverso.

---

## 6. Feature flag — como ligar/desligar telas

`empresas.modelo` governa tudo. Padrão (igual ao `MODO_CLASSIFICADOR` já usado no projeto):

```ts
// src/lib/broker/featureFlags.ts
export async function getModelo(empresaId: string): Promise<string> {
  const { data } = await supabase.from('empresas').select('modelo').eq('id', empresaId).single();
  return data?.modelo ?? 'transportadora';
}
export const isBroker = (m: string) => m === 'broker' || m === 'cooperativa';
```

Telas E4 (mostrar só se `isBroker`): **marketplace de oferta**, **ranking/score**, **split N-way**, **painel próprios+terceiros** (100% terceiros no broker). Telas que **somem** no broker: mapa de planejamento 500→100, divisão auto por N caminhões + Sweep, conferência de rota pelo motorista, roteirização por voz/texto, dashboard de utilização/TCO de frota.

---

## 7. O que PREPARAR para o futuro (sem construir agora)

- **Variante Cooperativa (CTC):** já cabe via `transportador.tipo='cooperado'` + um valor `empresas.modelo='cooperativa'`. Falta só: consolidação de CT-e/MDF-e (épico fiscal). Não construir agora.
- **Variante Fulfillment:** `empresas.modelo='fulfillment'` — roteiriza próprio + clustering k-means++ capacitado antes do solver. É híbrido, não broker puro. Deixar o ENUM aberto (já está: `modelo` é TEXT sem CHECK rígido).
- **Pull de GPS (vs push):** hoje o tracker webhook é **push** (parceiro envia). Para **pull** (broker puxa GPS do TMS do parceiro), reservar campo `transportador.gps_pull_url` numa migration futura — NÃO agora.
- **Tracking público sem login** (embarcador consulta por NF/token): gap conhecido, fase 2. Reservar conceito de `pedido.tracking_token`.

---

## 8. O que NÃO entra (Fase 2 / fora de escopo)

- ❌ CT-e/MDF-e/canhoto eletrônico (épico fiscal SEFAZ).
- ❌ Pull de GPS em tempo real / WebSocket contínuo (push webhook + POD resolve o MVP).
- ❌ Re-otimização dinâmica (broker não roteiriza — não se aplica).
- ❌ Solver próprio (OSRM/VROOM) como core — fica opcional só p/ raio/visualização.
- ❌ Página pública de tracking sem login (fase 2).
- ❌ Clustering/fulfillment e WMS (variante, não broker puro).
- ❌ Cron de scoring automático (passo 8 roda sob demanda no MVP).

---

## 9. Riscos / pontos de atenção (do código real)

- **GPS do motorista hoje é LOCAL** (`src/app/mobile/rota/page.tsx`): `watchPosition` guarda em estado React, **nunca persiste no servidor**. Para o tracker funcionar em tempo real, o passo 7 precisa de POST periódico de posição — ou aceitar só POD pontual no MVP (recomendado pra começar barato).
- **POD hoje é mínimo** (`paradas.concluida_em` = timestamp; sem foto). A migration §3.6 adiciona `pod_foto_url`/`pod_lat/lng`. O upload de imagem no app/callback é trabalho do passo 7.
- **Score/rating não existe em lugar nenhum** do `src/` — é construção do zero (passo 8).
- **Não confundir** `pedidos/entregas` (modelo financeiro) com `notas_capturadas/rotas_otimizadas/paradas` (módulo routing do app motorista). O tracker da E4 estende o segundo grupo; o marketplace/faturamento usa o primeiro.
- **SEM TRAVA é regra forte** (`memory/project_lembretes_sem_trava.md`, `project_empresas_fiscais.md`): não recolocar RLS nem FK rígida por `empresa_id`. Várias "empresas" são CNPJs de uma empresa real.
- **PowerShell quebra curl com JSON** (`memory/project_powershell_curl_json_scp.md`): testar webhooks via fetch no navegador ou `.sh` por SCP, não colar curl no PowerShell.

---

## 10. Testes (recomendado, não obrigatório — CLAUDE.md/TESTING.md)

`npm test` = local + mockado, custo zero. Recomendado antes do passo 6 (matching/oferta = lógica de negócio de risco). Sugeridos:
- `src/__tests__/lib/brokerMatching.test.ts` — raio, capacidade, skill, ordenação por score.
- `src/__tests__/lib/brokerSplit.test.ts` — comissão %, N-way (soma repasses + comissão = bruto), edge: valor zero.
- `src/__tests__/lib/brokerOferta.test.ts` — transições aceita/rejeita/expira; aceitar uma expira concorrentes.

Reportar resultado se rodar. Anexar linha no FINAL de `TESTING_LOG.md` (não no TESTING.md).

---

## Resumo acionável

1. Validar com o dono (passo 0).
2. Aplicar `db/migration_empresa04_broker.sql` (§3) → regenerar types.
3. `featureFlags.ts` + `matching.ts` + `oferta.ts` + `split.ts` + `scoring.ts`.
4. APIs: `embarcador/pedidos`, `broker/ofertas[/aceitar/rejeitar]`, `tracker/webhook` (clone do whatsapp webhook).
5. 3 telas broker atrás de `isBroker()`; app motorista vira tracker.
6. Reusa geocoding, mapa, bot, POD offline. NÃO roteiriza. Comissão + split N-way no lugar de faturamento por pedido.
