# 🚚 PLANO LOGÍSTICA — 4 Tipos de Empresa

> **Origem:** pesquisa de 29 agentes (12 fóruns/sites + 12 docs/GitHub + 5 Opus de consolidação), 06/06/2026.
> **Objetivo:** preparar o SISTEMA_DE_FROTA para 4 modelos de empresa de logística, **construindo a Empresa 1 (Transportadora) primeiro** com a fundação dos outros 3 já embutida — sem retrabalho.
> **Ordem de construção decidida pelo dono:** Empresa 1 (prestadora) → Empresa 3 (frota própria) → Empresa 2 (híbrida) → Empresa 4 (a "esquecida").

---

## 📌 Resumo executivo (TL;DR)

Você (sem saber o nome) mapeou o **espectro clássico de modelos logísticos**:

| Sua empresa | Nome de mercado | Frota? | Carga própria? | Roteiriza? |
|---|---|:--:|:--:|:--:|
| **1** — tenho caminhões, presto serviço | **Transportadora (3PL asset-based)** | ✅ | ❌ | ✅ |
| **2** — fábrica + frota + terceiro | **Embarcador híbrido** | ✅ | ✅ | ✅ |
| **3** — fábrica com frota 100% própria | **Embarcador com frota privada** | ✅ | ✅ | ✅ |
| **4** — *esquecida* → **Broker / 4PL asset-light** | **Agenciador de fretes** | ❌ | ❌ | ❌ (terceiro roteiriza) |

**A 4ª empresa é o BROKER / 4PL asset-light** — não tem caminhão nem carga, só **conecta** quem tem carga com quem tem caminhão, cobra comissão (5–10%) e vira **dispatcher + tracker** (não router). É o oposto arquitetural das 1–3, por isso é o que mais força o sistema a generalizar. Cooperativa de agregados e Fulfillment e-commerce são **variantes** que reaproveitam ~80% do código.

**3 campos resolvem o futuro inteiro sem migração destrutiva:**
- `origem_demanda` (`notas_antecipadas` | `frete_voz_texto` | `importacao_massa` | `api_externa`)
- `executor_tipo` (`proprio` | `terceiro` | `agregado`)
- `pedido_pai_id` (split delivery / pedido gigante multi-caminhão)

**O que já temos pronto (reuso direto):** hierarquia `pedido → entrega`, faturamento no pedido, OSRM+VROOM na VM Oracle (custo zero), geocoding cache→Google→ViaCEP + `coordenadas_aprendidas`, bot WhatsApp (Evolution+Gemini+Deepgram), offline 7 dias + Service Worker + Dexie, motor de regras/autorizações no-code.

**Custo do stack de rota (validado): ~R$100–600/mês self-hosted** vs Google Route Optimization ~R$11k+/mês (e limite de 25 waypoints/rota inviabiliza). O stack atual já é a escolha certa.

---

## 🗺️ Índice

1. [Empresa 1 — Transportadora](#empresa-1) ← *foco de construção agora*
2. [Empresa 3 — Frota 100% própria](#empresa-3)
3. [Empresa 2 — Híbrida (roteirização antecipada)](#empresa-2)
4. [A 4ª empresa + os 4 modelos de negócio](#empresa-4)
5. [Arquitetura & Roadmap (fundação dos 4)](#arquitetura)

---
<a name="empresa-1"></a>

# EMPRESA 1 — TRANSPORTADORA (prestadora, dona dos caminhões)

> **O projeto já tem 80% das peças certas pra este modelo.** O banco já modela `pedidos` (1 caminhão + 1 motorista + N entregas, faturamento no pedido) e `entregas` (uma parada, vem da NFe — "valor da NFe não importa"), além de `alocacoes` (histórico motorista↔veículo), cache/cota de geocoding Google e OSRM+VROOM na Oracle Cloud. O trabalho aqui é **completar**, não recomeçar.

## 1. O conceito atômico (o que já existe e o que falta)

O modelo de dados atual está **certo e alinhado com o consenso da pesquisa** (TOTVS/Senior: "uma tabela `pedido` pode ter múltiplas `entregas`"). Comentários reais do banco (`db/migration_limpeza_modelo.sql`):

- `pedidos` = "PEDIDO = serviço fechado com o cliente. 1 caminhão + 1 motorista + N entregas. **Faturamento aqui**."
- `entregas` = "ENTREGA = uma parada dentro do pedido. Vem da NFe escaneada. Valor da NFe NÃO importa."

Isso já entrega o **faturamento único**: a receita fica em `pedidos.valor_pedido` (serviço inteiro), e as N entregas são só paradas. Bate com **carga fracionada LTL / faturamento único** (efrete/sciencedirect): cliente vê 1 fatura, múltiplas remessas.

**A lacuna real:** o modelo atual amarra `pedido` a **1 caminhão**. Os três tamanhos exigem flexibilizar:

| Tamanho | Definição | O que muda no modelo |
|---|---|---|
| **Pequeno** | Poucos pontos, 1 caminhão | Funciona hoje. `pedido` → N `entregas` → 1 veículo. |
| **Grande** | Vários pontos, ainda 1 caminhão | Funciona hoje. Só precisa roteirizar as N entregas (VROOM TSP/CVRP numa rota só). |
| **Gigante (multi-caminhão)** | Tantos pontos que **não cabem em 1 caminhão** | **NÃO cabe hoje.** Precisa de camada **rota/viagem por veículo** dentro do pedido. |

A pesquisa resolve o gigante com **Split Delivery VRP (SPSDVRP)** + "múltiplos CT-e referenciando 1 pedido pai". Tradução: **manter `pedido` como contêiner de faturamento e introduzir camada `rotas` (1 por veículo) entre `pedido` e `entregas`**.

## 2. Os dois modos de operação (o coração do que construir)

São os dois modos que a pesquisa chama de **pre-route (A)** e **real-time route (B)** — confirmados em múltiplas fontes. São fluxos de UX/dados **diferentes** e devem coexistir.

### MODO A — Cliente manda entregas antecipadas (com NF) → motorista confere
1. **Entrada das notas** — (a) **upload XML de NFe** (mais rico: destinatário, endereço, peso, volume); (b) digitação/CSV; (c) foto da DANFE → OCR (fase 2).
2. **Geocoding** — **já temos o pipeline**: `geocode_cache` (hit = custo zero) → cota Google atômica → fallback ViaCEP → `coordenadas_aprendidas` (após 1ª visita usa a coordenada confirmada pelo motorista).
3. **Roteirização** — pequeno/grande: VROOM monta a sequência ótima (TSP/CVRP) via OSRM. Gigante: VROOM divide entre N caminhões (CVRP/CVRPTW). **Stack já provisionado.**
4. **Conferência do motorista** — abre a rota no app (PWA offline 7 dias + SW + Dexie), **confere**: reordena, marca endereço errado, confirma coordenada.
5. **Execução + POD** — por entrega: foto + GPS + timestamp + (opcional) assinatura. Fila offline sincroniza ao reconectar.
6. **Faturamento** — fecha em `pedidos.valor_pedido`. CT-e/MDF-e é **fase posterior**.

### MODO B — Só combina o frete → motorista roteiriza na hora (voz/texto), SEM NF
1. **Combinação do frete** — gestor cria `pedido` "leve": cliente + valor + caminhão/motorista. Sem entregas pré-cadastradas, sem NF.
2. **Motorista roteiriza na hora** — pelo **WhatsApp** (Evolution + Gemini + Deepgram já existem). Fala/escreve os destinos → bot grava cada parada como `entrega` com `origem='voz'`.
3. **Roteirização opcional** — VROOM/OSRM sugerem a ordem se ele quiser; o ponto do Modo B é **registrar o que foi feito**.
4. **Gravação pra conferência** — cai no painel do gestor em tempo real (Supabase Realtime). Gestor confere depois: o que foi entregue, GPS, fotos.
5. **Sem NF / sem fiscal** — registro operacional + prova de entrega.

> **A diferença entre A e B é UX, não engine:** A = *cadastro → confere → executa*; B = *executa → grava → confere*. O mesmo `pedido`/`entrega` serve aos dois; muda só **quem cria a entrega e quando** e a **origem** (`nfe` vs `voz`/`texto`).

## 3. O QUE CONSTRUIR AGORA (MVP da Empresa 1)

### Sprint 1 — Modo A básico (pequeno/grande, 1 caminhão)
1. **Tela "Novo Pedido"** (gestor): cliente + valor + veículo/motorista + lista de entregas.
2. **Importação de entregas**: digitação/CSV primeiro; XML de NFe logo em seguida.
3. **Geocoding automático** (reusa `geocodeCache.ts` + cota Google + ViaCEP + `coordenadas_aprendidas`).
4. **Roteirizar**: botão chama VROOM (1 veículo) → grava sequência. Mostrar no **mapa** (Leaflet/OSM, sem custo).
5. **App do motorista (PWA offline)**: lista de paradas, "confere", **POD por parada**.
6. **Painel do gestor**: status em tempo real (Realtime) + PODs.

### Sprint 2 — Modo B (voz/texto via WhatsApp)
7. `pedido` leve sem entregas/NF. Motorista grava paradas por **áudio/texto** no WhatsApp. `entrega.origem = 'voz'|'texto'`.
8. Conferência do gestor (mesmo painel, filtra `origem`).

### Sprint 3 — Pedido gigante (multi-caminhão)
9. Camada `rotas` (1 por veículo) entre `pedido` e `entregas`. VROOM CVRP/CVRPTW divide. Faturamento único no `pedido`.
10. **Constraints reais:** `janela_inicio`/`janela_fim` por entrega (VRPTW) + **`service_time` por cliente** (tempo de descarga). O `service_time` alto é a chave pra **não concentrar clientes lentos/críticos num só caminhão** (supermercado 2h vs padaria 30min → VROOM distribui naturalmente).

### Explicitamente FORA do MVP
- CT-e/MDF-e/canhoto eletrônico (épico fiscal próprio, integração SEFAZ).
- Rastreamento GPS contínuo via WebSocket (overkill pra 10 caminhões; POD por parada + ping ocasional resolve).
- Re-otimização dinâmica contínua.

## 4. Data model mínimo (Empresa 1)

Aproveita `pedidos`, `entregas`, `alocacoes`, `clientes`, `geocode_cache`, `coordenadas_aprendidas`. Adições idempotentes (padrão SEM TRAVA, `ADD COLUMN IF NOT EXISTS`).

**`pedidos`** (adicionar): `modo` (`antecipado`|`na_hora`), `tamanho` (`pequeno`|`grande`|`gigante`), `valor_pedido` (já existe), `status` (já existe), `cliente_id` (contratante do frete).

**`entregas`** (adicionar): `sequencia`, `rota_id` (NULL no 1-caminhão), `lat`, `lng`, `janela_inicio`, `janela_fim`, `service_time_s` (default 600; alto = lento/crítico), `critico` (bool), `peso_kg`, `volume_m3`, `origem` (`nfe`|`csv`|`voz`|`texto`), `nfe_chave`, `status` (`pendente`|`entregue`|`falha`|`recusada`|`ausente`).

**`rotas`** (NOVA, só no pedido gigante): `id`, `pedido_id`, `veiculo_id`, `motorista_id`, `sequencia`, `distancia_m`, `duracao_s`, `status`.
> No pequeno/grande, `entrega.rota_id` fica NULL e o pedido aponta direto pro veículo — **zero atrito pro caso comum**.

**`pod`** (NOVA): `id`, `entrega_id`, `foto_url`, `lat`, `lng`, `capturado_em`, `assinatura_url`, `observacao`, `recebedor`.

## 5. Telas a construir
1. **Novo Pedido (gestor)** — cliente, valor, veículo/motorista, modo A/B; em A: importar entregas (CSV/XML) ou manual.
2. **Mapa de Roteirização** — Leaflet+OSM, paradas plotadas, botão "Roteirizar" (VROOM), reordenar manual (drag), ver sequência/ETA.
3. **App do Motorista (PWA offline)** — lista de paradas, navegação, "conferir rota", POD por parada, exceção offline-safe.
4. **Painel do Gestor (Realtime)** — pedidos em andamento, status por entrega, PODs, fila de conferência do Modo B.
5. **WhatsApp (Modo B)** — fluxo de voz/texto pro motorista ditar paradas.

## 6. Decisões pra confirmar com o dono
- **CT-e/MDF-e agora ou depois?** Recomendação: **fase 2**. O MVP operacional entrega valor sem o peso do SEFAZ. Confirmar se algum cliente-piloto **exige** CT-e já.
- **Modo B sem NF** = registro operacional + prova de entrega, **não** documento legal de transporte.
- **Rastreamento:** começar POD-por-parada (barato); WebSocket só se a escala pedir.

---
<a name="empresa-3"></a>

# EMPRESA 3 — FROTA 100% PRÓPRIA (Embarcador)

> **Definição:** dono da carga (fábrica, distribuidor, varejista) que entrega **só com frota própria** — zero terceiro. Na pesquisa: *"like Model 2 without third-party — routes go only to internal drivers"*. Em 2024, 64,1% das empresas migraram para modelo majoritariamente próprio.
>
> **A Empresa 3 é a Empresa 2 sem o módulo de terceiros.** Tudo que construirmos para a 3 é reaproveitado direto na 2 e na 1 — por isso é o melhor "núcleo" para consolidar o motor de roteirização antecipada antes de complicar com integração externa.

## 1. O que MUDA vs Empresa 1

A diferença não é tecnologia de rota (ambas usam OSRM+VROOM), é **quem é dono da carga, qual o documento fiscal e qual o objetivo financeiro**:

| Eixo | Empresa 1 (Transportadora) | Empresa 3 (Frota Própria) |
|---|---|---|
| **Dono da carga** | Cliente terceiro. Presta serviço. | A própria empresa. Não há "cliente do frete", há destinatário. |
| **Documento fiscal** | **CT-e** + MDF-e (coração do faturamento) | **NF-e própria** (produto) + **MDF-e**. Sem CT-e (não há prestação a terceiro). |
| **Objetivo financeiro** | Faturar o frete (receita) | Transporte é **custo interno** (CPV). Minimizar custo/entrega e TCO. |
| **Origem dos pedidos** | Cliente manda nota OU combina na hora. Imprevisível. | Demanda **previsível** (carteira do ERP). Roteiriza **48–72h antes**. |
| **Roteirização** | Pode ser na hora (voz/texto) | **Antecipada e em lote** (500 notas → ~100 de amanhã → divide por N caminhões → setoriza) |
| **Quem vê a rota** | Pode ir para terceiro | **Só motoristas internos** |
| **KPI principal** | Margem do frete, faturamento | **OTIF/OTD, utilização (97–98% com AI vs 70–80% manual), km −20–30%, custo/entrega** |

**Tradução:** sair da 1 para a 3 é **trocar "receita por frete" por "custo por entrega"** e **"pedido reativo" por "planejamento diário em lote (daily dispatch)"**. O motor de rota é o mesmo; muda o que está em cima e embaixo dele.

## 2. Features ADICIONAIS que a Empresa 3 exige

### 2.1 Roteirização antecipada em lote (Daily Dispatch) — **o coração**
Ciclo **Sense → Decide → Execute → Learn**: importar carteira (centenas de NF-e) → selecionar ~100 para amanhã (mapa, filtro por janela/região/crítico) → dividir por N caminhões (VROOM) ou desenhar no mapa → setorizar + balancear → despachar para motoristas internos.
> Benchmark: **Magazine Luiza reduziu roteirização de 3h → 8min** com solver automático.

### 2.2 Setorização automática (Sweep Algorithm)
Depot no centro → ordena clientes por **ângulo polar** → varre o raio acumulando setores → 1 rota por setor. ~2–9% acima do ótimo, sem zigzag. Roda no backend Node sem dependência externa.

### 2.3 Balanceamento de carga (VRPRB)
Evitar "rota pesada + rota leve". Bi-objetivo: minimizar km **e** equilibrar workload. Usa `capacity` multidimensional do VROOM + post-processamento.

### 2.4 Cliente crítico / slow mover
- **`service_time` por cliente** (supermercado = 7200s) → VROOM distribui naturalmente.
- **Skills/tags** (`slow_mover=true`) + "máx 1 por rota".
- **Matriz de tempo customizada** com histórico de descarga.
- **Post-processamento** que reatribui.

### 2.5 CVRPTW (capacidade + janelas) — VROOM nativo
A Empresa 3 quase sempre tem capacidade (peso/volume/paletes) e janelas (8–12h). A 1 muitas vezes ignora; a 3 não pode.

### 2.6 Forecast de demanda semanal (demanda previsível)
Histórico + sazonalidade (mínimo viável) para planejar a semana e dimensionar frota.

### 2.7 POD voltado ao **destinatário** (prova interna de SLA)
Alimenta logística reversa (devolução = 30% no e-commerce BR) e ocorrências (ausência, endereço errado, recusa).

### 2.8 MDF-e (sem CT-e) + canhoto eletrônico
Carga própria em trânsito → **MDF-e é o documento**. NT 2025.001 (obrigatória out/2025). **Não** há módulo de CT-e de frete.

### 2.9 KPIs de frota (não de faturamento)
Dashboard: utilização (alvo 97–98%), km/entrega, custo/entrega, OTIF (>90%), OTD (>95%), empty miles, TCO. É o "produto financeiro" da Empresa 3.

## 3. O que a Empresa 3 NÃO precisa (corta complexidade)
- ❌ Módulo de terceiros (cotação, matching, webhook a parceiro, score).
- ❌ CT-e de frete e faturamento a cliente (→ NF-e própria + MDF-e + custo interno).
- ❌ Roteirização "na hora" via voz como modo principal (existe só como exceção).
> A Empresa 3 é o **caminho mais curto** pro motor de roteirização em lote. Depois é só "plugar terceiros" para virar Empresa 2.

## 4. Data model recomendado (sobre o que já existe)

Eixo **Pedido (1) → Entrega (N) → Atribuição de Veículo (N)**. Padrão SEM TRAVA, idempotente:

- **`entregas`**: `pedido_id`, `empresa_id`, `destinatario`, `endereco`, `lat`, `lng`, `janela_ini`, `janela_fim`, `service_seg` (default 600), `slow_mover` (bool), `peso_kg`, `volume_m3`, `status` (`pendente`|`roteirizada`|`em_rota`|`entregue`|`ocorrencia`), `ocorrencia`.
- **`rotas`** (resultado da roteirização em lote): `empresa_id`, `data_operacao`, `veiculo_id`, `motorista_id`, `km_plan`, `duracao_plan_min`, `setor`, `status`, `vroom_payload` (jsonb p/ auditoria planejado vs realizado).
- **`rota_paradas`** (ordem das paradas): `rota_id`, `entrega_id`, `sequencia`, `eta`, `chegada_real`, `pod_foto_url`, `pod_assinatura_url`, `pod_lat`, `pod_lng`.

Notas: `service_seg`+`slow_mover` materializam o cliente crítico; `vroom_payload` guarda request/response p/ auditoria; `rotas.setor` vem do Sweep; reuso de `alocacoes` p/ descobrir o motorista do veículo no dia.

## 5. Telas
1. **Carteira / Importar pedidos** — upload XML/planilha + lista filtrável + "geocodificar pendentes".
2. **Tela de Roteirização (mapa)** — *a tela-chave*: seleção dos ~100 de amanhã, botão "Dividir automático por N caminhões" (VROOM), botão "Setorizar" (Sweep), **drag-and-drop de paradas entre rotas** (solver sugere, gestor aprova), N rotas em cores + resumo.
3. **Despacho** — confirma rotas → motoristas recebem no app.
4. **App/PWA do motorista (offline)** — sequência, navegação, POD num único fluxo, fila de ocorrências.
5. **Acompanhamento ao vivo** — posição dos caminhões + ETA + alertas.
6. **Dashboard de KPIs de frota** (substitui o relatório de faturamento da Empresa 1).
7. **MDF-e / Documentos** (fase posterior).

## 6. Stack — pronto vs falta
**Já temos:** OSRM+VROOM (VM Oracle), geocoding cache→Google→ViaCEP, Supabase com `pedidos`/`alocacoes`/`veiculos`/`motoristas`, multi-tenant `empresa_id`, bot WhatsApp.
**Falta:** migrations `entregas`/`rotas`/`rota_paradas`; endpoint `POST /route-optimize` (geocode → OSRM `/table` → VROOM `/solve` CVRPTW + `service_time` + skills) + wrapper Sweep; **tela de roteirização no mapa** (maior item); PWA do motorista com POD offline; dashboard de KPIs; (depois) MDF-e.

## 7. Custo
10 caminhões × ~70 entregas/dia ≈ 700/dia: OSRM+VROOM self-hosted **R$0** (VM Oracle Always Free); Google Geocoding com cache ~R$300/mês (cai com `coordenadas_aprendidas`). Google Route Optimization seria inviável (25 waypoints/rota + R$1.500+/mês).

> **Conclusão:** a Empresa 3 é o melhor primeiro alvo do roadmap de roteirização (é a 2 sem terceiros). O esforço concentra-se em **3 entregáveis**: as 3 tabelas novas, o endpoint `/route-optimize` com Sweep, e a **tela de roteirização no mapa com drag-and-drop**.

---
<a name="empresa-2"></a>

# EMPRESA 2 — HÍBRIDA: Roteirização Antecipada

> **Definição:** fabricante/embarcador com **frota própria** + **terceiriza picos/regiões secundárias**, e possui **todas as notas fiscais**. O coração é o **planejamento do dia seguinte**: jogar centenas de notas, escolher o lote de amanhã, dividir entre N caminhões respeitando capacidade/janela/clientes críticos, e empurrar rotas para o app dos próprios **e** via API para parceiros.

## 1. As 6 fases da roteirização antecipada

Pipeline **Importar → Geocodificar → Selecionar → Setorizar/Otimizar → Revisar no mapa → Despachar**, sempre com **etapa humana de aprovação** entre otimização e despacho.

| Fase | O que acontece | Stack no projeto |
|---|---|---|
| **1. Importar 500 notas** | Carga XML (NF-e), Excel/CSV ou API/EDI do ERP | Upload + endpoint `/import`; `pedidos` com `status='pendente'` |
| **2. Geocodificar** | Endereço → lat/lng | **Já temos** cache `coordenadas_aprendidas` + Google + ViaCEP |
| **3. Selecionar ~100 de amanhã** | Tela de mapa, filtros, seleção manual/regra | Mapa Leaflet/Google + multi-seleção; grava `lote_id` |
| **4. Setorizar + dividir por N caminhões** | Clusterizar + otimizar sequência | **VROOM** (CVRP/VRPTW/MDVRP) sobre **OSRM** |
| **5. Revisar/ajustar no mapa** | Drag-drop de paradas entre rotas | UI drag-drop; re-chama VROOM fixando a parada |
| **6. Despachar** | Próprios via app; terceiros via API/webhook | PWA offline (próprios) + webhook JSON (terceiros) |

## 2. Fase 1 — Importar 500 notas
Por nota (mínimo para roteirizar): `endereço/CEP`, `lat/lng`, `peso_kg`, `volume_m3`, `qtd_volumes`, `janela_inicio/fim`, `service_time` estimado (**crítico** para lentos), `cliente_id`, `prioridade`, flags `cold_chain`/`slow_mover`.
Formatos (em ordem de esforço): **XML NF-e** (parsear `infNFe/dest/enderDest`) → **Excel/CSV** → **API/EDI do ERP** (fase 2). As notas viram **pool de pendentes** (`pedidos.status='pendente'`).

## 3. Fase 3 — Mapa + seleção dos ~100 de amanhã
**A tela diferenciadora.** Mapa interativo com:
- **Pins por status/atributo:** cor por janela (manhã/tarde), ícone para crítico (slow_mover), badge para cold_chain.
- **Heatmap de concentração.**
- **Seleção manual** (lasso/polígono ou clique-a-clique → "carrinho do dia") **ou por regra** (raio X km do CD, mesma região, janela 8–12h, prioridade alta, vence SLA amanhã).
- **Painel lateral** com contadores em tempo real: nº notas, peso total, volume total, nº críticos — pra não estourar capacidade antes de otimizar.
> **Por que seleção humana importa:** padrão Brasil 2026 é **híbrido** — entrada visual manual + solver automático em background. O operador detém "conhecimento tribal" (cliente lento, rua com obra, prioridade implícita) que o solver não tem.

## 4. Fase 4 — Setorizar e dividir automático por N caminhões

**3 camadas que se combinam:**

### 4.1 Setorização (ANTES do solver)
- **Sweep algorithm:** depósito no centro → ângulo polar → varre o raio. ~2–9% acima do ótimo, sem zigzag.
- **K-means com capacidade:** k-means++ + farthest-first + swaps; 10–15 reinícios. Reduz planejamento de dias → <2h, desvio +20-25% → +2-4%.
- **Densidade alta:** dividir 500 pontos em ~5 clusters de ~100 → resolver cada um.

### 4.2 Otimização VRP por cluster — VROOM sobre OSRM
- **CVRP** — capacidade multidimensional (kg, m³, R$, paletes).
- **VRPTW** — janela `[início, fim]` por cliente.
- **MDVRP** — multi-depot (SP/BH).
Input VROOM: `vehicles[]` (start/end, `capacity`, `time_window`, `skills`, `breaks`), `jobs[]` (`location`, `service`, `skill`, `priority`, `amount`). Otimiza **duração total** via matriz OSRM. ~10s para 50 pontos; gap +2,47% vs TSPLIB.

### 4.3 Cliente crítico ("não concentrar lentos num só caminhão") — 6 técnicas
1. **`service_time` por cliente** (mais simples e eficaz — começar por aqui).
2. **Matriz de tempo customizada** (+ histórico de descarga).
3. **Skills/tags** `slow_mover=true` + "máx 1 por rota".
4. **VRPRB** (bi-objetivo distância + balanceamento → Pareto).
5. **Pré-processamento manual** (gestor marca críticos).
6. **Post-processing** (verifica e reatribui).
> **Balanceamento (VRPRB):** Google faz via `softMaxLoad + costPerUnitAboveSoftMax`; em VROOM aproxima-se com capacidade multidimensional + `max_travel_time`/`max_tasks`.

### 4.4 "N caminhões" = próprios + terceiros como frota heterogênea
A frota do solver inclui **veículos próprios E slots de terceiros** (`vehicles[]` com capacidades/custos diferentes). Motor de alocação decide por nota: **próprio > parceiro confiável > genérico**. Roda priorizando próprios (custo interno menor) e manda overflow para terceiros.

## 5. Fase 5 — Revisão no mapa
Drag-and-drop de paradas entre rotas → recálculo on-the-fly. Comparação de cenários ("4 vs 5 rotas", "com/sem terceiro"). 3 opções de rota apresentadas (A=10min, B=12min, C=8min mas zona de risco). **Override sempre permitido** — solver propõe, humano aprova.

## 6. Fase 6 — Despachar próprios E terceiros (torre de controle dupla)
### 6.1 Próprios — app/PWA offline-first
Rota + sequência + contexto do cliente cacheados offline (7 dias). POD por parada (foto+assinatura+GPS+timestamp). Rastreamento lat/lng (WebSocket/SSE) → mapa em tempo real.
### 6.2 Terceiros — API/webhook
**Push webhook JSON** (começar simples). Por rota/parada: endereço destino, lat/lng, janela, peso/volume, referência do pedido, contato, prioridade. **Callback:** confirmação de entrega + foto + assinatura. **Visibilidade unificada:** próprios e terceiros no mesmo mapa.

## 7. Data model (compatível com o atual)
Acrescentar a `pedidos`/`motoristas`/`veiculos`/`alocacoes`/geocoding:
- **`nota`/`pedido_item`**: `endereco`, `lat`, `lng`, `peso_kg`, `volume_m3`, `qtd_volumes`, `valor_nf`, `janela_inicio/fim`, `service_time_seg`, `prioridade`, `slow_mover`, `cold_chain`, `status`.
- **`lote_roteirizacao`** (carga de amanhã): `empresa_id`, `data_operacao`, `criado_por`, `status`.
- **`rota`** (1 por veículo/motorista): `lote_id`, `veiculo_id`, `motorista_id`/`terceiro_id`, `tipo` (`propria`|`terceiro`), `km_total`, `duracao_total_min`, `sequencia_otimizada` (jsonb).
- **`rota_parada`**: `rota_id`, `pedido_id`, `sequencia`, `eta`, `status`, `pod_*`.
- **`terceiro`**: `nome`, `webhook_url`, `prioridade`, `confianca_score`.
Padrão SEM TRAVA; rota↔veículo↔motorista reaproveita `alocacoes` (atual = `fim IS NULL`).

## 8. Telas
1. **Importação** (upload XML/CSV, mapper, preview, reprocessar falhos).
2. **Planejamento do dia (mapa)** (pins, heatmap, lasso/filtros, carrinho com peso/volume/críticos, "Roteirizar N caminhões").
3. **Resultado da otimização** (rotas coloridas, lista por veículo, drag-drop, comparar cenários, alerta de slow_mover concentrado).
4. **Despacho** (próprios/terceiros por rota).
5. **Acompanhamento (torre de controle)** (mapa ao vivo, SLA/OTIF, ocorrências, POD).

## 9. Ordem de implementação
1. Reaproveitar VROOM+OSRM + cache geocoding. Esforço novo: importação + tela de mapa + seleção/setorização + despacho.
2. Setorização antes do solver (não jogar 500 crus no VROOM).
3. Cliente crítico: começar pelo `service_time`.
4. Manter humano no loop (otimizar em background, drag-drop, aprovar).
5. Terceiros: webhook JSON simples + callback de POD.
6. Custo: VROOM+OSRM ≈ R$100-600/mês vs Google ~R$550/dia (inviável).

---
<a name="empresa-4"></a>

# A 4ª EMPRESA + os 4 Modelos de Negócio Logístico

## TL;DR — Qual é a 4ª empresa?

Três candidatos no espectro *asset-light* (quanto ativo físico a empresa possui):

| Candidato | O que é | Frota? | Roteiriza? |
|---|---|:--:|:--:|
| **Broker / 4PL (asset-light)** | Orquestrador que casa carga ⇄ transportador via API | ❌ | ❌ (parceiro roteiriza) |
| **Cooperativa de Agregados (CTC)** | PJ coletiva de motoristas autônomos sob 1 CNPJ | ✅ (dos cooperados) | ✅ (centralizada) |
| **Fulfillment E-commerce** | Armazém + picking + last-mile urbano denso | ✅ ou terceiriza | ✅ (com clustering) |

**Recomendação:** adotar como **4º modelo canônico o BROKER / 4PL ASSET-LIGHT** — é o **oposto arquitetural** dos modelos 1–3 (*dispatcher + tracker*, não *router*), logo é o que mais força o sistema a generalizar. Cooperativa e Fulfillment ficam como **variantes** que reaproveitam 80% do código (Cooperativa = Transportadora com pool de agregados; Fulfillment = Frota Própria + clustering geográfico).

## Os 4 Modelos

### Modelo 1 — TRANSPORTADORA (asset-based / 3PL)
Tem caminhões, presta distribuição para clientes **sem** frota. Faturamento por **pedido** (multi-ponto, multi-caminhão). Dois sub-fluxos: **(A)** notas antecipadas → motorista confere; **(B)** frete combinado na hora (voz/texto, sem NF) → grava só pra conferência. Stack: OSRM (2–5 paradas) + VROOM (grande/gigante).

### Modelo 2 — HÍBRIDA (Embarcador + Frota + Terceiros)
Fábrica com frota própria **e** terceiriza picos. Tem todas as NFs. Diferencial: **roteirização ANTECIPADA** (500 notas → ~100 de amanhã → divide por N caminhões + setorização → próprios e terceiros). Necessita VRPTW + MDVRP + VRPRB.

### Modelo 3 — FROTA 100% PRÓPRIA (Embarcador puro)
Distribuidor/indústria com logística interna. Igual ao 2 sem terceiro. Planejamento 48–72h antes, offline 7 dias, dashboard de utilização/TCO.

### Modelo 4 — BROKER / 4PL ASSET-LIGHT (a "empresa que faltava")
**Não tem caminhão nem armazém.** O ativo é a **tecnologia** (TMS + matching). Recebe carga de múltiplos embarcadores, casa com transportadores/agregados, **rastreia e fiscaliza SLA**, cobra **comissão 5–10%** (ou spread). O sistema vira **DISPATCHER + TRACKER**, **não ROUTER** — quem roteiriza é o parceiro.

**Variantes do Modelo 4:**
- **Cooperativa (CTC):** CNPJ coletivo, ≥20 agregados; centraliza CT-e/MDF-e; vínculo solidário com motoristas.
- **Fulfillment E-commerce:** WMS + last-mile urbano denso (500–2000 entregas/dia em 100km²); POD = só foto+GPS; integra marketplaces (Mercado Livre, Shopify); exige **clustering geográfico** antes do solver.

## Features do Modelo 4 (o que o sistema ganha)

| Feature | Modelos 1–3 | Modelo 4 (Broker) |
|---|:--:|:--:|
| Roteirização própria (OSRM/VROOM) | **core** | opcional só p/ visualização |
| **Matching carga ⇄ transportador** | — | **core** (raio, capacidade, score, prazo) |
| **Marketplace de frete** (oferta/aceite) | — | **core** |
| **Scoring de transportador** (% on-time) | — | **core** |
| Rastreamento GPS | Próprio (app) | **Pull/push de terceiros** |
| POD | Foto+assinatura+GPS | **Reduzido** (timestamp+foto) |
| Faturamento | Por pedido (CT-e/MDF-e) | **Comissão / split N-way** |
| Liability | Própria | **Compartilhada** |

## Fluxo do Modelo 4 (ponta-a-ponta)
```
1. Embarcador envia carga (endereço, peso, prazo, valor) via API/portal
2. Sistema geocodifica (Google cache → ViaCEP fallback)
3. MATCHING: transportadores disponíveis em raio de N km; filtra capacidade, skill, score, prazo
4. Oferta → parceiro ACEITA ou REJEITA (marketplace)
5. Parceiro coleta e ROTEIRIZA NO PRÓPRIO SISTEMA (não é do broker)
6. Broker recebe updates de status (push webhook) ou puxa GPS (pull)
7. POD: parceiro envia foto + timestamp → broker valida (GPS no raio?)
8. SLA tracking: entregou no prazo? → alimenta score do parceiro
9. FATURAMENTO: broker cobra embarcador, repassa parceiro via split (comissão 5-10%)
```

## Data Model (multi-tenant, os 4 modelos no mesmo schema)
```
empresa
  id, nome, modelo ENUM('transportadora','hibrida','frota_propria','broker')
  -- 'modelo' liga/desliga features por tenant (feature flag por tipo)
pedido
  id, empresa_id, cliente_id, data, faturamento_status
  origem_rota ENUM('antecipada','combinada_na_hora')   -- Modelo 1 A/B
entrega
  id, pedido_id, endereco_lat, endereco_lng,
  janela_inicio, janela_fim, service_time_seg,          -- VRPTW + slow mover
  cliente_critico BOOL, status, entrega_pai_id NULL     -- split delivery
rota
  id, veiculo_id NULL, transportador_id NULL,           -- próprio OU terceiro
  entrega_id, sequencia, eta, ct_e_numero

-- EXCLUSIVO MODELO 4 (broker/4PL/cooperativa):
transportador        id, empresa_id, tipo ENUM('terceiro','agregado','cooperado'),
                     capacidade, skills[], raio_atuacao_km, ativo BOOL
transportador_score  transportador_id, periodo, on_time_pct, entregas, avarias
oferta_frete         id, pedido_id, transportador_id, valor_ofertado,
                     status ENUM('ofertada','aceita','rejeitada','expirada')
split_faturamento    oferta_id, transportador_id, valor_repasse, comissao_pct
```
> **Decisão-chave:** uma coluna `empresa.modelo` governa quais telas/features aparecem. **1 sistema com feature flags por tipo de tenant**, não 4 sistemas. Casa com o motor de regras no-code (ZERO role hardcoded).

## Telas por modelo

| Tela | M1 | M2 | M3 | M4 |
|---|:--:|:--:|:--:|:--:|
| Cadastro de pedido (multi-ponto) | ✔ | ✔ | ✔ | ✔ |
| Conferência de rota pelo motorista (cenário A) | ✔ | ✔ | ✔ | — |
| Roteirização por voz/texto (cenário B) | ✔ | — | — | — |
| Mapa de planejamento (500 notas → ~100) | — | ✔ | ✔ | — |
| Divisão auto por N caminhões + Sweep | parcial | ✔ | ✔ | — |
| Painel próprios + terceiros | ✔ | ✔ | — | ✔ |
| Marketplace de oferta de frete | — | parcial | — | ✔ |
| Ranking/score de transportadores | — | — | — | ✔ |
| Dashboard utilização frota / TCO | parcial | ✔ | ✔ | — |
| Split de faturamento N-way | — | — | — | ✔ |

## Stack por modelo

| Modelo | Roteirização | Observação |
|---|---|---|
| 1 Transportadora | **OSRM** (simples) + **VROOM** (grande/gigante) | cenário B usa OSRM em tempo real |
| 2 Híbrida | **VROOM** (MDVRPTW) + OSRM matrix | setup pesado + pré-planejamento manual |
| 3 Frota própria | **VROOM** + OSRM | `service_time` por cliente; offline 7d |
| 4 Broker/4PL | **Não precisa de solver próprio** | foco em API/webhook + score |
| (var.) Cooperativa | VROOM + consolidação | igual M1, pool de agregados |
| (var.) Fulfillment | VROOM + clustering (k-means++ capacitado) | 500 pts → 5 clusters de 100 |

> **Observação fiscal transversal:** CT-e (v3.0 jan/2026), MDF-e (NT 2025.001 obrigatória out/2025), canhoto eletrônico (evento XML em até 120h, retido 5 anos) substituem POD em papel no Brasil.

---
<a name="arquitetura"></a>

# ARQUITETURA & ROADMAP — Empresa 1 com fundação para os 4 modelos

> **Objetivo:** construir a Empresa 1 de modo que os modelos 2/3/4 entrem **adicionando comportamento, não reescrevendo o núcleo**. Estabilizar o "core comum" e isolar o específico em camadas plugáveis.

## 1. Princípio: o que é COMUM vs ESPECÍFICO

Os 4 modelos compartilham o **mesmo modelo de dados de execução** (pedido → paradas → rota → veículo → prova de entrega). Muda **(a) origem da demanda**, **(b) quem executa a rota**, **(c) como fatura**.

| Camada | Comum aos 4 | Específico por modelo |
|---|---|---|
| **Demanda** | `pedido` + `entrega` | M1: notas antecipadas OU voz/texto. M2/M3: importação em massa + seleção. M4: API de múltiplos embarcadores |
| **Geocoding** | Endereço → lat/lng com cache — **já existe** | nada |
| **Roteirização** | OSRM + VROOM — **já existe** | M1: 1 caminhão/pedido. M2/M3: multi-caminhão, setorização, slow movers. M4: não roteiriza |
| **Execução / Driver app** | Rota, sequência, offline-first, POD | M4: app é só **tracker**, não router |
| **Faturamento** | `pedido.valor_pedido` — **já existe** | M1/2/3: por pedido. M4: split N-way + repasse |
| **Fiscal (CT-e/MDF-e)** | Opcional/plugável — **NÃO bloquear MVP** | Quando o cliente exigir |

**Consequência:** tudo "comum" entra agora com nomes neutros. Tudo "específico" entra atrás de **flags de capacidade por empresa** (`empresas.modelo_negocio` + `empresas.capacidades JSONB`), como já se faz com `MODO_CLASSIFICADOR`.

## 2. Data model — o núcleo a consolidar AGORA

### `pedidos` (adicionar)
- `tipo_pedido` (`pequeno`|`grande`|`gigante`)
- `origem_demanda` (`notas_antecipadas`|`frete_voz_texto`|`importacao_massa`|`api_externa`) — distingue os 4 fluxos **sem tabelas separadas**
- `tem_nota_fiscal` (bool — Cenário B)
- `valor_pedido`, `forma_pagamento`, `pago` — **já existem**
- `pedido_pai_id` self-FK nullable (futuro: split/multi-caminhão/consolidação)

### `entregas` (adicionar)
- `lat`, `lng`, `geocode_status`
- `janela_inicio`, `janela_fim` (VRPTW)
- `service_time_seg` (**chave do "cliente crítico"**)
- `is_critico` / `tags JSONB` (`cold_chain`, `slow_mover`)
- `peso_kg`, `volume_m3`, `qtd_volumes` (CVRP)
- `sequencia`
- `status` (`pendente`|`em_rota`|`entregue`|`falha_ausencia`|`recusada`|`endereco_invalido`|`devolvida`)

### `rotas` (NOVA)
- `id`, `empresa_id`, `data_planejada`, `status`, `veiculo_id`, `motorista_id`/`terceiro_id`, `km_estimado`, `tempo_estimado_min`, `polyline`
- `executor_tipo` (`proprio`|`terceiro`|`agregado`) — **este campo já prepara M2/M4 sem nova tabela**

### `pod` (NOVA, comum aos 4)
`entrega_id`, `foto_url`, `assinatura_url`, `lat/lng`, `timestamp`, `observacao`, `tipo_ocorrencia`. Ligada ao histórico da rota.

### Já servem (não recriar)
`veiculos`, `motoristas` (capacidade/skills → CVRP), `geocode_cache`/`coordenadas_aprendidas`, `alocacoes`, `telefones`, `regras`/`autorizacoes` (motor no-code autoriza terceiros depois).

> **Por que evita retrabalho:** `origem_demanda` + `executor_tipo` + `pedido_pai_id` transformam o mesmo schema em transportadora hoje, híbrida amanhã e broker depois — **sem migração destrutiva**.

## 3. Telas na Empresa 1
1. **Captura de entregas (mobile)** — `src/app/mobile/captura-notas/`. Digitação CEP+número → ViaCEP → confirmação visual. (Cenário A)
2. **Frete por voz/texto (WhatsApp)** — bot já existe; flow grava pedido sem NF (Cenário B). Reaproveita `messageRouter` + `gestorFlow` (há TODO `cadastrar_pedido` e `extrairPedidoFrete` sem flow ligado — **este é o gancho**).
3. **Tela do pedido (gestor)** — pedido + entregas + mapa Leaflet + botão "Roteirizar" (VROOM).
4. **Conferência do motorista** — rota group `(motorista)`, confere, executa, POD por entrega, offline-first.
5. **Mapa de planejamento (semente do M2)** — começa simples (ver entregas de um pedido); evolui para "500 notas → ~100" por flag.

## 4. Sequência de implementação

**Fase A — Núcleo de execução (Empresa 1, valor já):**
1. Migração aditiva: campos de roteirização em `entregas` + tabelas `rotas` e `pod` (com `executor_tipo`/`origem_demanda` já incluídos).
2. Geocoding em lote ao cadastrar/importar.
3. `routing/osrm.ts` + `routing/vroom.ts` + `routing/geocoding.ts` + endpoint `POST /api/route-optimize`.
4. Tela do pedido com mapa + roteirizar (1 caminhão).
5. App motorista: conferência + POD offline.

**Fase B — Robustez (serve aos 4):**
6. Categorias de ocorrência + reentrega → KPIs OTIF/OTD.
7. Re-otimização incremental (só quando volume justificar).
8. Frete por voz/texto sem NF (liga `extrairPedidoFrete`).

**Fase C — Habilitar M2/M3 por flag:**
9. Importação em massa (500 notas) → seleção no mapa → multi-caminhão.
10. VROOM com capacidade + time windows + `service_time` + setorização (Sweep/K-means) + balanceamento.
11. `executor_tipo = terceiro` + webhook JSON (callback de status/POD).

**Fase D — M4 (Broker) por flag:**
12. App vira **tracker**, matching de transportador, split N-way. Reusa `pod`/`rotas`/rastreamento — só muda o papel.

> Cada fase deixa software **útil e vendável**. Fase A já entrega uma transportadora funcional.

## 5. Armadilhas técnicas (resolver no design)
- **Pedido gigante (Split Delivery VRP):** 1 `pedido_pai` com N `rotas`, faturamento único no pai. Reserve `pedido_pai_id` já.
- **Cliente crítico:** NÃO é problema de mapa, é de `service_time`. Alto → VROOM distribui. Complementar com tag + "máx 1 por rota" ou post-processo.
- **Setorização:** Sweep (ângulo polar) ou K-means **capacitado**. K-means puro ignora capacidade e quebra.
- **VROOM otimiza DURAÇÃO, não distância** — não resolve "não concentrar críticos" sozinho.
- **OSRM trava acima de ~15 pontos na Trip API** — VROOM obrigatório para multi-parada.
- **Offline-first é não-negociável** no app motorista (fila IndexedDB, iOS+Android).
- **Geocoding ruim quebra tudo:** cache + confirmação visual + `coordenadas_aprendidas` mitigam.
- **Fiscal (CT-e/MDF-e) NÃO bloqueia o MVP:** módulo Fase B+/opcional por empresa.

## 6. Resumo acionável (sem retrabalho)
1. **Migração aditiva** (lat/lng, janelas, `service_time`, peso/volume, tags em `entregas`; tabelas `rotas` e `pod`; campos `origem_demanda`, `executor_tipo`, `pedido_pai_id`). Entregar o `.sql` pronto pra Supabase.
2. **3 clientes de roteirização** (`osrm.ts`, `vroom.ts`, `geocoding.ts`) + endpoint `/api/route-optimize`.
3. **Tela do pedido com mapa Leaflet + botão roteirizar.**
4. **App motorista: conferência + POD offline.**
5. **Ligar `extrairPedidoFrete`** num flow de frete por voz/texto (Cenário B).
6. Fiscal, multi-caminhão, terceiros e broker **atrás de flags por empresa**.

> A fundação da Empresa 1 **é** a fundação dos 4 modelos — desde que `origem_demanda`, `executor_tipo` e `pedido_pai_id` entrem desde o primeiro dia.

---

## 📎 Fontes principais (agregadas da pesquisa)
- **Schema Pedido→Entrega→Veículo:** ScienceDirect S1571065318301690.
- **Split Delivery VRP (pedido gigante):** ScienceDirect S095741742301309X; efrete/CIOT carga fracionada.
- **Roteirização:** github.com/VROOM-Project/vroom, project-osrm.org (CVRP/VRPTW/MDVRP).
- **Setorização/clustering:** arxiv 2303.04147 (Sweep), dev.to/emrahg (K-means capacitado), routech.tech.
- **Cliente crítico/balanceamento:** developers.google.com Route Optimization (service_time, soft limits), metaro.com.br, arxiv 1702.05577 (VRPRB).
- **TMS Embarcador vs Transportadora:** mytracking.com.br. **Broker = dispatcher+tracker:** kargu.com.br, Route4Me, wayfindr.io, clickpost.ai.
- **POD multi-fator:** onfleet.com, upperinc.com, comprovei.com.
- **Offline-first driver app:** fareye.com, wednesday.is.
- **Planejamento (3h→8min):** mobiis.com.br (Magazine Luiza), routesmart.com / here.com.
- **Modelos de negócio:** datafrete.com, totvs.com, tegma.com.br, locus.sh.
- **Fiscal:** CT-e v3.0, MDF-e NT 2025.001, canhoto eletrônico — funcional.com, lsoft.com.br, bsoft.com.br.
- **Custo:** github gis-ops (FOSS routing), ayedo.de (OSRM ref-arch), solvice.io.

---

*Documento gerado por pesquisa multi-agente em 06/06/2026. É um **plano** — nada foi implementado. Validar cada ponto com o dono antes de codar (regra do projeto).*
