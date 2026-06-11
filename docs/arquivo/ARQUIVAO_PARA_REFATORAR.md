# 🧹 ARQUIVÃO DO GARIMPO — ⚠️ PRECISA SER REFATORADO

> **O que é isto:** na faxina de 10/06/2026, ~20 arquivos .md desatualizados foram lidos um a um,
> o que ainda prestava foi extraído pra cá, e os originais foram **deletados** (recuperáveis no git).
> **Isto NÃO é documentação viva.** É matéria-prima: cada seção precisa ser validada contra o código
> atual antes de virar feature, e depois movida pro lugar certo (`framework/` ou `docs/`) ou apagada.
> Documentação viva = `framework/INDEX.md`.

**Origem do conteúdo (todos deletados):** `PLANO_DE_PROJETO.md`, `RESEARCH_PEDIDOS_DESPACHO_2026-06-09.md`,
`docs/empresa01–04.md`, `docs/pesquisas-brutas/` (3 arquivos), `docs/AUDITORIA_CONTEXTO_2026-06-06.md`,
`PLANO_EXECUCAO_OSRM_VM.md`. Os demais (`logistica.md`, `log.md`, `documentacao.md`, `PLANO_LIMPEZA_MODELO.md`,
`RESEARCH_OPEN_SOURCE_TMS.md`, `ACOES_PENDENTES_USUARIO.md`, `PLANO_LOGISTICA_4_EMPRESAS.md`,
`PROPOSTA/REDESIGN/PROGRESSO_PEDIDOS_DESPACHO`) foram deletados **sem garimpo** — tudo já executado,
consolidado em outro doc, ou obsoleto.

---

## ÍNDICE

1. [Funcionalidades planejadas e nunca implementadas (PLANO_DE_PROJETO)](#1-funcionalidades-planejadas-e-nunca-implementadas)
2. [Decisões de negócio registradas só no plano antigo](#2-decisões-de-negócio-registradas-só-no-plano-antigo)
3. [Glossário fiscal/operacional BR (termos sem tela no sistema)](#3-glossário-fiscaloperacional-br)
4. [Importação de notas — XML/XLS/PDF (fase 4 pendente)](#4-importação-de-notas--xmlxlspdf)
5. [Features futuras com benchmark de mercado (despacho/pedidos)](#5-features-futuras-com-benchmark-de-mercado)
6. [Empresa 01 — gaps e migrations não confirmadas](#6-empresa-01--transportadora-gaps)
7. [Empresa 02 — terceiros/agregados (delta sobre E3)](#7-empresa-02--terceirosagregados)
8. [Empresa 03 — roteirização em lote multi-veículo](#8-empresa-03--roteirização-em-lote)
9. [Empresa 04 — broker (marketplace/split/tracker)](#9-empresa-04--broker)
10. [Motor de regras — pesquisa de arquitetura (classificador híbrido, estado pendente)](#10-motor-de-regras--pesquisa-de-arquitetura)
11. [Auditoria do contexto do bot — furos ainda abertos](#11-auditoria-do-contexto-do-bot)
12. [Setup OSRM+VROOM na VM Oracle (guia de reconstrução)](#12-setup-osrmvroom-na-vm-oracle)
13. [Referências/links de mercado](#13-referênciaslinks)

---

# 1. Funcionalidades planejadas e nunca implementadas

*Fonte: PLANO_DE_PROJETO.md (19/05/2026). ⚠️ Escrito antes do rename fretes→pedidos e da remoção de comissão — ler nomes de tabela com esse filtro.*

## 1.1 Edge Functions / Crons (não existe `supabase/functions/` hoje)

- `cron_limpar_sessoes_expiradas` — diário 03h: `DELETE FROM sessoes_whatsapp WHERE expira_em < now()`
- `cron_gerar_alertas_vencimento` — diário 06h: CNH, IPVA, licenciamento, seguro, próxima revisão (dedup: sem alerta repetido nos últimos 7 dias)
- `cron_detectar_km_sem_registro` — diário 20h: veículo sem `km_logs` há N dias (default 3) → alerta
- `cron_alertas_manutencao` — diário 06h30: INSERT em `alertas` a partir de `proxima_manutencao_veiculo WHERE status IN ('vencido','proximo')`, com dedup 7 dias
- `cron_enviar_alertas_whatsapp` — a cada 15 min: processa alertas urgentes/críticos não enviados *(⚠️ plano assumia Meta Cloud API; hoje o bot é Evolution API — revalidar)*
- `cron_refresh_kpis` — 04h: refresh de materialized views `kpi_mensal_*` (só se latência de dashboard incomodar)

## 1.2 Relatório mensal automático

Edge Function na primeira segunda do mês, 07h: PDF (`@react-pdf/renderer`) a partir das views KPI + insight de IA (1-2 frases pt-BR) + salvo no R2 + enviado ao Master via Resend.
Conteúdo: resultado (receita/custo/lucro/margem vs mês anterior), operação (qtd pedidos, KM, custo/km, receita/km), top 3 caminhões por lucro, top 3 clientes, alertas pendentes. Custo IA estimado ~$0,03/relatório.

## 1.3 Jornada/descanso do motorista — Lei 13.103

- Alerta via WhatsApp em: 5h30 de rodagem, 8h de jornada, próximo de 10h
- Bloquear início de nova viagem com < 11h de descanso desde a última
- Cálculo por cron a cada 15 min nos pedidos ativos (`now() - data_inicio`)
- Registro de pausas: campo `descanso_iniciado_em` na sessão WhatsApp (MVP) ou tabela `pausas_descanso` (futuro)

## 1.4 Gestor cadastra pedido por foto/PDF/print no WhatsApp

- `gestorFlow.ts` tem o stub ("em desenvolvimento"); **`extrairPedidoFrete()` JÁ EXISTE em `aiService.ts` (exportada, com testes)** — falta plugar no `gestorFlow` (case `cadastrar_pedido`) e no `messageRouter` (tipo `documento_pedido_frete`)
- Extrai: `{ cliente_nome, cliente_cnpj, origem, destino, valor_frete, peso_carga_kg, tipo_carga, data_coleta, data_entrega, observacoes, confianca }`
- Fluxo propose→confirm: cliente encontrado → pré-seleciona; não encontrado → `[Cadastrar e seguir] [Buscar outro] [Avulso]`
- Ao confirmar: pedido `status='agendado'`, `criado_via='whatsapp_gestor'`, `origem_demanda='frete_voz_texto'`

## 1.5 Backup completo (Master only)

Botão em Config → Backup: gera `.zip` no navegador com SQL de todas as tabelas, schema DDL, funções, RLS policies, migrations, arquivos do R2.
Deps: `jszip`, `file-saver`. Modal de progresso 4 fases (db 2–29%, storage 30–80%, source 80–88%, zip 88–100%). Registra `audit_logs.acao='export_backup'`.

## 1.6 LGPD

- `anonimizarMotorista(id)`: substitui nome/CPF/RG/fotos por hash; preserva FKs
- `exportarDadosMotorista(id)`: endpoint `/api/lgpd/export` — JSON completo
- `getCnhFotoUrl(motoristaId)`: URL assinada R2 (15 min) + `audit_logs.acao='view_sensitive'`
- Consentimento explícito no primeiro acesso à foto da CNH via bot

## 1.7 Rateio de manutenção por km no custo do pedido

View de resultado tem `custo_manutencao_rateada = 0` no MVP. Plano: tabela `parametros_empresa` com `provisao_manutencao_por_km` (ex: R$ 0,30/km) → somar `km_total × valor` na view. Ajustável por empresa sem mudar lógica core.

## 1.8 Templates HSM (⚠️ assumiam Meta Cloud API — bot atual é Evolution; revalidar tudo)

9 templates UTILITY planejados: `novo_pedido_motorista` (com botões aceitar/ligar), `lembrete_checklist_diario` (07:00 útil), `alerta_manutencao_vencendo` (<1.000 km), `alerta_documento_vencendo` (<30 dias), `adiantamento_pendente_aprovacao` (aprovar/recusar ao gestor), `pagamento_adiantamento_realizado`, `frete_nao_aceito_alerta` (12h), `ia_indisponivel`.

---

# 2. Decisões de negócio registradas só no plano antigo

*Fonte: PLANO_DE_PROJETO.md. Validar se ainda valem antes de aplicar.*

- **Custo zero no WhatsApp:** nunca disparar mensagens proativas para motoristas/gestores; 100% da comunicação iniciada pelo usuário. Notificações vão pro dashboard. (Exceção planejada: os HSM transacionais acima.)
- **Unicidade global (não por empresa):** `cpf`, `cnpj`, `placa`, `chassi`, `renavam`, `whatsapp` únicos no sistema todo. Email do motorista único por empresa.
- **Precedência de role no webhook:** número em `motoristas.whatsapp` E `perfis.whatsapp_bot` → trata como **motorista**. Número em `whatsapp_bot` com role motorista → descarta.
- **Throttle do alerta `ia_indisponivel`:** máx. 1 a cada 30 min.
- ~~Snapshot de comissão no encerramento~~ → **OBSOLETO** (modelo atual não tem comissão; diária por pedido).

---

# 3. Glossário fiscal/operacional BR

*Fonte: RESEARCH_PEDIDOS_DESPACHO_2026-06-09.md. Termos de mercado que o sistema ainda NÃO tem.*

- **Ordem de Coleta (modelo 20):** documento de retirada no remetente; obrigatório em SP/MG/GO; gera checklist de conferência de volumes. Não é fiscal. No Bsoft, etapa anterior à Minuta de Despacho.
- **Romaneio:** lista interna (não fiscal) das notas embarcadas num veículo para uma viagem; motorista leva; acompanha o MDF-e.
- **Minuta de Despacho:** preview com valores estimados antes de confirmar o despacho; ao concluir vira CT-e.
- **MDF-e:** manifesto eletrônico; agrupa CT-e/NF-e da viagem; obrigatório interestadual/intermunicipal; SEFAZ; exige evento de encerramento ao fechar a viagem.
- **CT-e:** documento fiscal por viagem/carga; pode ser gerado a partir do XML da NF-e importada.
- **CIOT:** obrigatório em contratos com transportadores autônomos.
- **NOTFIS / CONEMB (EDI PROCEDA):** EDI .txt bidirecional embarcador↔transportadora; só relevante se aparecer cliente grande que exija.

---

# 4. Importação de notas — XML/XLS/PDF

*Fonte: RESEARCH_PEDIDOS_DESPACHO + empresa03. **Esta é a fase 4 pendente do roadmap atual.***

| Canal | Lib recomendada | Esforço | Quando |
|---|---|---|---|
| **XML de NF-e** (upload múltiplo/ZIP) | `nfe-xml` (npm, regex, ~50-100ms/arquivo, zero deps) ou `fast-xml-parser` | Baixo | MVP |
| **Planilha XLS/CSV** com wizard | `react-spreadsheet-import` v4.7+ (MIT, fuzzy matching) + fallback `PapaParse` | Baixo | MVP |
| **PDF de DANFE** (layout) | `pdf2json` (preserva coordenadas) | Alto | Fase 2 — antes disso, pedir o XML ao cliente |
| **OCR de DANFE** | `tesseract.js` (5-30s/página, impreciso) | Muito alto | Nunca como fonte de verdade |

**Regras do fluxo (padrão TOTVS/Sankhya/Detrack):**
1. Upload em lote → preview do extraído → operador confirma.
2. Importados entram como rascunho/lançado — **nunca criam despacho automático**.
3. Dedup pela chave da NF-e (não importar a mesma nota 2×).
4. Falha em 1 arquivo não aborta o lote — retornar `{sucesso: 49, falhas: 1, motivo}`.
5. CEP/campo faltando → salvar como rascunho, operador completa.

**Campos mínimos do XML NF-e:** `destinatario.nome`, `endereco.logradouro/numero/cep`, `total.icmsTotal.vNF`. Peso dos produtos em `infNFe`.
**Template mínimo CSV (Routific/Detrack/eLogii):** `address` (obrigatório), `customer_name`, `order_number`, `phone`, `notes`, `time_window_start/end`, `delivery_date`, `items_description`.
**Endpoint planejado:** `POST /api/entregas/importar` — `{ empresa_id, entregas: [...] }` → INSERT com `geocode_status='pendente'`, `origem_demanda='importacao_lote'`.
**Parser planejado:** `src/lib/importacao/parseNFe.ts`.

---

# 5. Features futuras com benchmark de mercado

*Fonte: RESEARCH_PEDIDOS_DESPACHO. Ideias avaliadas e adiadas conscientemente no redesign de 10/06.*

- **Checklist de saída de viagem** (Bsoft/TOTVS): validar CNH, documentação pronta, observações; liberação bloqueada se item crítico falhar.
- **Atribuição com alertas** antes de confirmar despacho: documentação vencida, motorista em folga, capacidade excedida (fallback simples: limite de qtd de entregas).
- **Sugestão de agrupamento** (Mecalux/Bsoft): agrupar pedidos por CEP/cidade + peso/volume vs capacidade; mostrar como "Sugestões de Consolidação" — operador aprova ou desmonta. Sugerir, não obrigar.
- **Despacho automático/Orchestrator** (Fleetbase): engine avalia status/GPS/capacidade e propõe atribuições para revisão. Estrutura de dados atual já é compatível.
- **Kanban de status** no Despacho (`Lançado → Despachado → Em Rota → Entregue`). Hoje fila única com busca é mais rápida pra 1 operador; Kanban se a operação crescer.
- **Relatório de Manifesto pro motorista** (PDF): nº pedido, cliente, endereço, itens, campo "Assinado?", notas (romaneio BR + delivery list).
- **Histórico de locais usados** no Novo Pedido (chips reutilizáveis de pedidos anteriores do cliente) — decidido NÃO fazer em 10/06; pode voltar depois.
- **Vínculo retroativo de cliente avulso** a cliente cadastrado após a entrega.
- **Tipos de pedido configuráveis** (Fleetbase Order Config): templates com campos por tipo (Normal, Express, Refrigerado, Assinatura Obrigatória).
- **Service Rate / cálculo de frete automático** (Fleetbase): base fee + R$/km + taxa por parada + surcharge de pico — se o dono quiser cobrar por km/parada.
- **POD com assinatura digital** (canvas) + código de barras/QR, além de foto+GPS; armazenar 5 anos (disputes). Ref: track-pod.com, Odoo Delivery Signature.
- **Preparação MDF-e** (se interestadual): tabela `manifestos` (1:N com pedidos despachados), `chave_mdfe`, evento de encerramento. Schema preparado antes do primeiro cliente interestadual; não emitir agora.

---

# 6. Empresa 01 — transportadora (gaps)

*Fonte: docs/empresa01.md. ⚠️ Verificar no banco o que já foi aplicado antes de usar.*

## Migrations planejadas (conferir se rodaram)

```sql
-- entregas
latitude, longitude, geocode_status (pendente|geocodificado|falhou)
sequencia, janela_inicio, janela_fim, service_time_seg (default 600)
origem_demanda (notas_antecipadas|frete_voz_texto|importacao_massa|api_externa)
executor_tipo (proprio|terceiro|agregado), pedido_pai_id UUID

-- pedidos
modo (antecipado|na_hora), tamanho (pequeno|grande|gigante)
cliente_id UUID, origem_demanda, executor_tipo, pedido_pai_id

-- notas_capturadas, rotas_otimizadas, paradas: pedido_id UUID
-- paradas: entrega_id UUID
```

Tabelas planejadas: `rotas` (1 por veículo dentro do pedido gigante), `pod` (foto+GPS+timestamp+recebedor+tipo_ocorrencia por parada).

## Passos não implementados (2–6 do plano)

- **P2:** `pedido_id` em `/api/notas/sync` e `/api/routing/otimizar` (hoje filtra só por `motorista_id`)
- **P3:** botão "Roteirizar" na tela de pedido + geocoding em lote de `entregas` + `MapaRota.tsx` com pinos numerados por `sequencia` e polyline; gravar `entregas.sequencia` a partir de `paradas.ordem`
- **P4:** `POST /api/pod` + bucket `pod` + botão "Registrar entrega" no mobile + fila offline Dexie para POD
- **P5:** plugar `extrairPedidoFrete()` no gestorFlow (ver §1.4)
- **P6:** Supabase Realtime na tela de pedido para `entregas` e `pod`
- **Modo B:** `mobile/captura-notas/page.tsx` tem TODO (~linha 117): "Finalizar Rota" só muda estado local, nunca chama geocoding/otimização

## Fase 2 explícita (fora do MVP)
XML de NF-e na importação (começar por digitação/CSV) · CT-e/MDF-e/canhoto eletrônico (épico fiscal) · GPS contínuo via WebSocket.

---

# 7. Empresa 02 — terceiros/agregados

*Fonte: docs/empresa02.md. **Pré-requisito: E3 (§8) aplicada primeiro** — E2 é um delta sobre as tabelas de lote.*

## Tabela `terceiros` (não existe)

```sql
CREATE TABLE IF NOT EXISTS public.terceiros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID, nome TEXT NOT NULL,
  webhook_url TEXT, webhook_token TEXT, contato TEXT,
  prioridade INTEGER DEFAULT 100,        -- menor = preferido
  confianca_score NUMERIC DEFAULT 100,   -- % entregas confirmadas
  capacidade_kg INTEGER, capacidade_m3 NUMERIC,
  skills JSONB DEFAULT '[]'::jsonb,      -- ["refrigerado","palete"]
  raio_atuacao_km INTEGER, ativo BOOLEAN DEFAULT TRUE,
  criado_em TIMESTAMPTZ DEFAULT now(), atualizado_em TIMESTAMPTZ DEFAULT now()
);
```

## Deltas em tabelas de E3

```sql
-- rotas: tipo ('propria'|'terceiro'), terceiro_id, webhook_dispatch_id,
--        webhook_despachado_em, webhook_callback_status ('pendente'...)
-- rota_paradas: pod_terceiro_foto_url, pod_terceiro_assinatura,
--        pod_terceiro_lat/lng, pod_terceiro_timestamp
```

## Funcionalidades

- `alocarFrota.ts` — função pura: próprios primeiro, slots de terceiros só pra overflow de capacidade (peso+volume); ordena `prioridade` asc, `confianca_score` desc
- Segunda dimensão de capacidade no VROOM: `amount: [peso_kg, volume_m3]` (todos os veículos com vetores do mesmo tamanho)
- `POST /api/terceiros/[id]/despachar` — payload JSON com paradas → `fetch(webhook_url)` sem lançar em falha; grava dispatch_id/timestamp
- `POST /api/terceiros/webhook/callback` — público autenticado por `webhook_token`; grava POD, atualiza `confianca_score`, emite Realtime
- CRUD `terceiros/page.tsx` (espelhar clientes/) · bifurcar botão "Despachar" por `rotas.tipo` · `empresaDoTerceiro()` em `empresaDe.ts` · torre de controle unificada (Realtime de terceiros + próprios no mesmo mapa)

**E2 NÃO inclui (não construir antes da hora):** split de faturamento pra terceiros, app próprio do terceiro (só webhook), decisão próprio-vs-terceiro por custo/km (é por overflow).

---

# 8. Empresa 03 — roteirização em lote

*Fonte: docs/empresa03.md (lote de ~100 entregas/dia, multi-veículo).*

## Tabelas/colunas (verificar existência)

- `lote_roteirizacao` (agrupa as entregas do dia), `rotas` (1 por veículo no lote), `rota_paradas` — **separadas** de `rotas_otimizadas`/`paradas`
- `entregas`: `volume_m3`, `paletes`, `lote_id`, `cliente_critico BOOLEAN`
- `veiculos`: `capacidade_volume_m3`, `capacidade_paletes`, `skills_json JSONB`, `origem_padrao_lat/lng`

## Código

- **`vroom.ts` (~linhas 183-197):** o loop atual achata as rotas e ignora `route.vehicle`. Mudar: adicionar `veiculo_id` ao tipo de parada em `ResultadoVROOM` (`src/lib/routing/types.ts:121`), guardar `route.vehicle`, reiniciar `ordem` por veículo
- `entregaParaJob()` em `restricoes.ts` — espelho de `notaParaJob` lendo de `entregas`; `amount:[peso_carga_kg]`, `tempo_descarga_s: service_time_seg`, janelas
- Setorização Sweep: `src/lib/routing/sweep.ts` — ângulo polar, puro, sem dependência
- `POST /api/routing/otimizar-lote` — fonte = `entregas`, N veículos; persiste 1 lote + N rotas + M paradas
- Tela `roteirizacao/lote/page.tsx` — seleção visual (lasso/polígono), painel peso/críticos, N rotas coloridas, drag-drop de paradas entre rotas
- `MapaRotaInner.tsx` — aceitar `polylines: Array<{encoded, cor}>` (hoje polyline única azul)
- `POST /api/routing/lote/[id]/despachar` — lote→despachado, rotas→despachadas, notifica motoristas
- `mobile/rota/page.tsx` — buscar também `rotas` (lote) por motorista+status; POD grava em `rota_paradas`
- Dashboard: view `frota_kpis_periodo` (OTD, OTIF, utilização, km/entrega, custo/entrega) + tela `relatorios/frota/`

## Cliente crítico
`service_time_seg` alto (ex: 7200 = 2h supermercado) → VROOM distribui sem empilhar lentos na mesma rota. Complemento: skill `slow_mover`. Marcador: `entregas.cliente_critico=true`, vermelho no mapa.

## Perguntas em aberto pro dono (antes de codar E3)
1. Tabelas `rotas`/`rota_paradas` separadas das atuais — OK?
2. Capacidade só por peso ou também volume no MVP?
3. Sweep antes do VROOM ou VROOM multi-veículo direto?
4. Despacho notifica via WhatsApp ou Realtime?
5. Importação prioriza XML, CSV ou ambos?
6. MDF-e confirmado como fase posterior?

---

# 9. Empresa 04 — broker

*Fonte: docs/empresa04.md. Salto arquitetural: broker NÃO roteiriza — o parceiro roteiriza no sistema dele.*

## Feature flag e tabelas

```sql
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS modelo TEXT NOT NULL DEFAULT 'transportadora';
-- transportadora|hibrida|frota_propria|broker|cooperativa|fulfillment
```

Tabelas novas: `transportador` (parceiros), `transportador_score` (on_time_pct, entregas, avarias, score por período), `oferta_frete` (marketplace 1 carga → N ofertas: ofertada|aceita|rejeitada|expirada), `split_faturamento` (broker cobra 100%, fica comissão, repassa).
Campos: `pedidos.status_externo`, `pedidos.prazo_entrega` (SLA); `paradas.pod_foto_url/pod_lat/pod_lng/pod_gps_ok`.

## Módulos (`src/lib/broker/`)

- `featureFlags.ts` — `getModelo(empresaId)` + `isBroker()`
- `matching.ts` — filtra transportadores por raio (Haversine), capacidade, skills; ordena por score
- `oferta.ts` — transições; aceitar uma expira as demais
- `split.ts` — `comissao = bruto × pct`, `repasse = bruto − comissao`; N-way via `pedido_pai_id`
- `scoring.ts` — recalcula score por período; on_time = entregue ≤ `prazo_entrega`
- APIs: `POST /api/embarcador/pedidos` (cria com `origem_demanda='api_externa'`), `POST /api/tracker/webhook` (clone da arquitetura do webhook do zap: token, fire-and-forget, 200 imediato; valida `pod_gps_ok`), `POST /api/broker/ofertas` + aceitar/rejeitar
- Telas atrás de `isBroker()`: marketplace, ranking/score, split

## Regras centrais
- App do motorista vira **tracker**: sem VROOM, sem conferir rota; recebe paradas, devolve POD reduzido (foto+GPS+timestamp). Rastreamento é **push** do parceiro via webhook.
- **Risco técnico:** GPS hoje é local (`watchPosition` em estado React, nunca persiste). Tracker em tempo real exige POST periódico de posição — ou aceitar só POD pontual no MVP.
- Telas que **somem** no modo broker: mapa de planejamento, divisão por N caminhões, conferência de rota, roteirização por voz, dashboard de utilização/TCO.
- Variantes futuras (só flag, não construir): `cooperativa` (pool de agregados + CT-e/MDF-e consolidado), `fulfillment` (k-means++ capacitado antes do solver).

---

# 10. Motor de regras — pesquisa de arquitetura

*Fonte: pesquisas-brutas/2026-06-05a06_logistica-mega (155 agentes). Complementa `docs/MOTOR_REGRAS_ARQUITETURA.md`.*

## Classificação híbrida (não "IA pura")
1. **Retriever por embeddings** → shortlist das N regras semanticamente próximas
2. **LLM escolhe** entre as candidatas com structured output (schema garante JSON)

Vence "colar todas as regras no prompt" (custo/latência) e "embeddings sozinhos" (precisão). Padrão validado: Voiceflow Hybrid Intent Classification / "Tool RAG".

- **Gemini:** `responseMimeType: "application/json"` + `responseSchema` (suporta anyOf/$ref/constraints). Pra classificação pura, `responseSchema` > function calling (menos overhead).
- Resposta tipo: `{regra_id, tipo, tabela_alvo, campos, confianca}`

## Camadas de roteamento
1. **Parser determinístico** (trigram "lembrete", "me lembra" → rota direto, sem LLM)
2. **Classificador Gemini com retriever** (top 3–5 candidatas → escolhe + extrai parâmetros)
3. **Executor** (dispatcher `tipo` → função) com log de auditoria: pergunta NL → regra → decisão humana → resultado

## Decision tables (DMN)
- Regras como JSON estilo `json-rules-engine` (`all`/`any`/`not` + event/actions) em coluna JSONB
- Agrupar em `rule_set` com `hit_policy` (first/priority) + `priority` pra conflitos
- UI: query-builder visual (tabela de decisão) pra não-técnico; grafo DMN só se precisar encadear
- Prompt em 2 partes: estável ("você é um classificador...") + dinâmica (regras carregadas do DB, cache TTL curto)
- API planejada: `POST /api/regras/classificar` → `{regra_id, tipo, confianca, parametros}`

## Estado pendente multi-turn (sessão WhatsApp)
- Vercel serverless não guarda memória → persistir em `whatsapp_sessoes` com `propostas_pendentes[]` (tipo `desambiguacao` com opções numeradas, ou `confirmacao` com ação+preview+parametros) e `timeout_em` (TTL ~5 min)
- `estadoPendente.ts`: `resolverRespostaPendente(contexto, resposta)` — interpreta "1"/"sim"/"ok", executa ou cancela
- No `messageRouter`: interceptar resposta pendente ANTES do roteamento normal
- Cron limpa sessões expiradas ("Menu expirado. Digite 'menu'.")

---

# 11. Auditoria do contexto do bot

*Fonte: docs/AUDITORIA_CONTEXTO_2026-06-06.md (27 agentes). Backlog técnico de furos AINDA ABERTOS (verificar antes de corrigir).*

**Furos altos:**
1. Consulta de alocações vaza TODOS os caminhões (falta filtro `veiculo_id`) — `botExecutor.ts:92-94`
2. Race condition no contador `turns` (read-modify-write não atômico) — `classificadorBot.ts:142-143,156,177`
3. ~~Cache sem empresa_id~~ → **dono decidiu NÃO corrigir** (empresa única, não SaaS)

Ordem recomendada de correção: #1 → #2 (o #3 fica como está, por design).
Conceito validado: Dialogue State Tracking dual-gate (TTL + turns), refs Dialogflow/Rasa/PostgreSQL locking.

---

# 12. Setup OSRM+VROOM na VM Oracle

*Fonte: PLANO_EXECUCAO_OSRM_VM.md — guia de reconstrução da VM (decisão OSRM vs ORS ainda pendente). Config atual da VM: `framework/03-deploy/oracle-cloud.md`.*

**VM:** 129.80.27.159 · chave `C:\Users\ronal\.ssh\osrm-key.pem` · ubuntu · Ubuntu 22.04 ARM · 4 OCPU, 24GB RAM, 200GB

Sequência (cada passo validado antes do próximo):
1. SSH + validar specs (`uname -a`, `df -h`, `free -h`)
2. `apt update && upgrade`
3. Docker: `curl -fsSL https://get.docker.com | sudo bash && sudo usermod -aG docker ubuntu`
4. `apt install docker-compose-plugin`
5. `mkdir -p ~/osrm-data ~/routing`
6. Mapa Brasil (~3.5GB): `wget -c https://download.geofabrik.de/south-america/brazil-latest.osm.pbf` (5-15 min)
7. `osrm-extract -p /opt/car.lua /data/brazil-latest.osm.pbf` (imagem `ghcr.io/project-osrm/osrm-backend`; ~20GB RAM, 20-60 min)
8. `osrm-partition /data/brazil-latest.osrm`
9. `osrm-customize /data/brazil-latest.osrm`
10. `~/routing/docker-compose.yml`:

```yaml
services:
  osrm:
    image: ghcr.io/project-osrm/osrm-backend
    container_name: osrm
    restart: unless-stopped
    ports: ["5000:5000"]
    volumes: [/home/ubuntu/osrm-data:/data]
    command: osrm-routed --algorithm mld --max-table-size 10000 /data/brazil-latest.osrm
  vroom:
    image: vroomvrp/vroom-docker:latest
    container_name: vroom
    restart: unless-stopped
    ports: ["3000:3000"]
    environment:
      - VROOM_ROUTER=osrm
      - VROOM_HOST_osrmCar=osrm
      - VROOM_PORT_osrmCar=5000
    depends_on: [osrm]
```

11. `docker compose up -d`
12. Teste OSRM: `curl 'http://localhost:5000/route/v1/driving/-46.6333,-23.5505;-47.0608,-22.9056?overview=false'`
13. Teste VROOM: POST em `:3000` com vehicles+jobs
14. Firewall interno: `iptables -I INPUT -p tcp --dport 5000/3000 -j ACCEPT` + `iptables-persistent`
15. Keep-alive anti-recuperação Oracle: `/opt/keepalive.sh` (curl no OSRM) em crontab `0 */6 * * *`
16. Teste externo; se bloquear → Oracle Console → VCN → Security List → Ingress TCP 5000/3000

**Vars Vercel:** `OSRM_URL=http://129.80.27.159:5000` · `VROOM_URL=http://129.80.27.159:3000`

---

# 13. Referências/links

*Fonte: RESEARCH_PEDIDOS_DESPACHO.*

- Fleetbase (TMS open-source, Order→Dispatch→Navigator): https://github.com/fleetbase/fleetbase · https://docs.fleetbase.io
- ERPNext Delivery Trip: https://docs.frappe.io/erpnext/delivery-trip
- Odoo Dispatch v19: https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/inventory/shipping_receiving/setup_configuration/dispatch.html
- `nfe-xml` (npm): https://www.npmjs.com/package/nfe-xml
- `react-spreadsheet-import`: https://github.com/UgnisSoftware/react-spreadsheet-import
- `pdf2json` (npm): https://www.npmjs.com/package/pdf2json
- VROOM API: https://github.com/VROOM-Project/vroom/blob/master/docs/API.md
- Sankhya — Pedido de Frete na Ordem de Despacho: https://ajuda.sankhya.com.br/hc/pt-br/articles/360044599154
- TOTVS Protheus — Importação XML TMSAE80: https://centraldeatendimento.totvs.com/hc/pt-br/articles/360026949131
- Routific — campos mínimos: https://help.routific.com/en/articles/6-how-to-add-orders
- Detrack — import deliveries: https://help.detrack.com/en/articles/6553433-how-to-import-deliveries
- Redwood — 5 UX features TMS: https://www.redwoodlogistics.com/insights/5-ux-features-your-next-tms-needs
