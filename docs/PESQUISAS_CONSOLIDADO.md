# 📚 PESQUISAS CONSOLIDADO — Logística (junho/2026)

> **Documento mestre** de todas as pesquisas feitas entre 06/06 e 09/06/2026 (outra IA + 14 agentes haiku em fóruns/GitHub). Aqui está o resumo por tema com as conclusões; o material bruto completo está nos arquivos-fonte listados no fim.

---

## 1. Nomenclatura — como o mercado chama cada coisa (DECIDIDO)

Convergência de 12+ dos 14 agentes (fóruns BR, internacionais, TMS comerciais, open-source):

| Termo | Significado de mercado | Decisão no sistema |
|---|---|---|
| **Pedido** | Unidade de faturamento: cliente + valor + cargas. "Pedido de Carga" nos TMS BR; *Order* no internacional | ✅ Menu "Pedidos" (era "Viagens") |
| **Despacho** | Ato de vincular pedido a veículo+motorista e liberar a saída (Sankhya "Ordem de Despacho", Odoo "Dispatch", Fleetbase, Intelipost) | ✅ Menu "Despacho" (novo) |
| **Frete** | O VALOR cobrado, a modalidade (dedicado/fracionado) ou o documento (CT-e) — **nunca** a etapa de atribuição | ✅ Removido do menu (era o nome errado) |
| **Viagem** | Agrupamento de N pedidos num caminhão+motorista+dia; serve pro acerto financeiro (receita − despesas) | Conceito pós-despacho; a tabela `rotas` (migration empresa01) já prepara; não é menu agora |
| **Entrega** | Parada individual com endereço (= *stop/waypoint*) | Já existe (tabela `entregas`) |
| **Romaneio** | Lista NÃO-fiscal das notas embarcadas num veículo; checklist do motorista | Fase futura (PDF simples) |
| **CT-e / MDF-e** | Documentos FISCAIS (conhecimento por carga / manifesto por veículo), via SEFAZ | Épico fiscal — fora do MVP |
| **Ordem de Coleta (mod. 20)** | Documento de retirada no remetente; obrigatório só em SP/MG/GO | Fora do MVP |
| **NOTFIS/PROCEDA (EDI)** | Layout .txt que embarcadores grandes mandam pra transportadora importar | Só se aparecer cliente que exija |

## 2. Fluxo operacional validado (DECIDIDO)

O fluxo de 2 etapas bate com o padrão mundial (Fleetbase, ERPNext Delivery Trip, TMS BR):

```
1. PEDIDO (lançar: cliente/avulso + valor + entregas)
2. DESPACHO (caminhão → motorista padrão pré-carregado → trocável no dia)
3. EXECUÇÃO (roteirização VROOM + app motorista + POD)   ← já existia
```

- **Motorista padrão trocável** é padrão universal: veículo carrega o titular (nossa tabela `alocacoes`), dropdown troca pontualmente (folga), com auditoria.
- **Cliente avulso** é padrão de mercado (PDV "consumidor final"; Routific/Onfleet com customer opcional): aceita só o nome, vincula retroativamente depois se virar recorrente.
- **Despacho em lote** (N pedidos → mesmo caminhão) existe em Intelipost/Circuit; implementado.
- Status sugerido pelo mercado: `lançado → despachado → em trânsito → entregue`; no nosso sistema mantivemos os status existentes e a fila de despacho = pedido com `veiculo_id IS NULL`.

## 3. Importação de notas em massa (estratégia DECIDIDA)

| Canal | Veredito | Ferramentas prontas |
|---|---|---|
| **XML de NFe** (upload múltiplo/ZIP) | ⭐ MVP — XML tem 100% dos dados (destinatário, endereço, CEP, valor); parse em ~50-100ms | `nfe-xml`, `fast-xml-parser`, `djf-nfe` (npm) |
| **Planilha XLS/CSV** com wizard de mapeamento | ⭐ MVP — template mínimo estilo Routific/Circuit (endereço obrigatório, resto opcional) | `react-spreadsheet-import` (MIT), SheetJS, PapaParse |
| **PDF de DANFE** | Fase 2 — DANFE expõe só ~10% do XML; melhor pedir o XML ao cliente | `pdf2json` (por coordenadas); OCR Tesseract só como fallback (5-30s/página, impreciso) |
| **EDI NOTFIS / API / e-mail monitorado** | Futuro, sob demanda de cliente | — |

Regras do fluxo (padrão TOTVS/Sankhya/Detrack): upload em lote → preview → operador confirma; importado nasce como rascunho (nunca despacha sozinho); dedupe pela chave da NFe; falha em 1 arquivo não aborta o lote (relatório sucesso/falha por arquivo).

Template CSV de referência (Routific/Detrack/Onfleet): `address` (obrigatório), `customer_name`, `order_number`, `phone`, `notes`, `time_window_start/end`, `delivery_date` — tudo opcional menos endereço.

## 4. Benchmarks de UX (o que copiar)

- **Routific**: criação de ordem com SÓ endereço obrigatório — meta: 3 cliques pra criar pedido, 1 pra atribuir motorista.
- **Circuit/Detrack**: importação de planilha tolerante (detecta colunas, sem ordem fixa).
- **Fleetbase** (open-source, referência principal): `Order → Assign Driver/Vehicle → Dispatch (push pro app) → Activity flow → POD`. Entidades: Order, Payload/Entity, Place (endereços reutilizáveis), Driver, Vehicle, Service Rate. Tem Orchestrator (atribuição automática via VROOM) — referência se um dia quisermos auto-despacho.
- **ERPNext Delivery Trip**: doctype pronto de "viagem de entrega" (driver + vehicle + delivery stops com status por parada + ETA Google Maps).
- **Bsoft TMS** (líder BR): Kanban de pedidos, módulos Pedidos de Carga / Controle de Viagens / acerto com motorista.
- **Dispatch board** (padrão internacional): fila visual de pedidos pendentes com drag-drop pra caminhão — evolução futura da nossa tela Despacho.
- Dor nº 1 relatada por operadores: digitação manual (3-4h/dia, ~4% de erro) → por isso a importação em massa é prioridade.

## 5. TMS open-source mapeados (pesquisa 06/06 + 09/06)

- **Engines de rota**: OSRM (usamos), VROOM (usamos), GraphHopper, Google OR-Tools, jsprit.
- **Plataformas completas**: Odoo (Dispatch Management, Batch Transfer), ERPNext (Delivery Trip), Dolibarr, Apache OFBiz.
- **Específicos**: **Fleetbase** (o mais relevante pra nós), CoopCycle (courier cooperativas), Karrio (etiquetas/shipping multi-carrier), LoadPartner TMS, LogiFlow, FreightCentralized, LogistIQ.
- Módulos OCA do Odoo: `delivery-carrier`, `stock_picking_dispatch` (despacho em lote).

## 6. Modelos de negócio — as 4 empresas (pesquisa 06/06)

Os planos detalhados (ex-`PLANO_LOGISTICA_4_EMPRESAS.md` e `empresa01–04.md`) foram garimpados para `docs/arquivo/ARQUIVAO_PARA_REFATORAR.md` (§6–§9) na faxina de 10/06:

1. **Empresa 1 — Transportadora** (atual): Modo A (notas antecipadas → rota → POD) + Modo B (frete na hora via WhatsApp). Migration aplicada, roteirização ligada ao pedido, POD implementado.
2. **Empresa 2 — Híbrida** (própria + terceiros): roteirização antecipada de ~500 notas, setorização, torre de controle dupla, `executor_tipo`.
3. **Empresa 3 — Frota própria** (embarcador): multi-caminhão/CVRP, janelas (VRPTW), tabela `rotas` 1-por-veículo.
4. **Empresa 4 — Broker/4PL**: só matching/repasse, `origem_demanda='api_externa'`, split N-way via `pedido_pai_id`.

Os campos `origem_demanda`, `executor_tipo`, `pedido_pai_id` + tabelas `rotas`/`pod` já estão no banco (migration empresa01) preparando tudo isso sem migração destrutiva.

## 7. Decisões já tomadas com o dono (não rediscutir)

- ✅ Menus: **Pedidos** / **Despacho** / **A Receber** (aprovado 09/06).
- ✅ Wizard antigo preservado em `/pedidos/novo-avancado`; novo form simples em `/pedidos/novo`.
- ✅ Ordem: 1) menus → 2) Despacho → 3) Novo Pedido → 4) importação XML+XLS → (fase 2) PDF DANFE.
- ✅ Política de delegação por modelo (CLAUDE.md): haiku=pesquisa, sonnet=código simples, opus/principal=difícil+importante, revisão no principal.
- ✅ CT-e/MDF-e/canhoto fiscal: fase 2 (confirmado também no plano empresa01 §5).

## 8. Arquivos-fonte (deletados na faxina de 10/06/2026)

Os brutos abaixo foram lidos um a um, o conteúdo ainda útil foi extraído para **`docs/arquivo/ARQUIVAO_PARA_REFATORAR.md`**, e os arquivos foram deletados (recuperáveis no histórico do git, commits ≤ 10/06):

- `RESEARCH_OPEN_SOURCE_TMS.md`, `docs/PLANO_LOGISTICA_4_EMPRESAS.md`, `docs/empresa01–04.md` (4 modelos de empresa → arquivão §6–§9)
- `docs/RESEARCH_PEDIDOS_DESPACHO_2026-06-09.md`, `docs/PROPOSTA_PEDIDOS_DESPACHO.md` (glossário fiscal, importação, benchmarks → arquivão §3–§5)
- `docs/AUDITORIA_CONTEXTO_2026-06-06.md` (furos do bot → arquivão §11)
- `docs/pesquisas-brutas/` — 3 dumps de 215 agentes (~1MB); o único com conteúdo não consolidado era a sessão mega de logística (motor de regras/estado pendente → arquivão §10)

> **Escopo:** este consolidado (seções 1–7) resume a pesquisa de **logística**. A pesquisa do **bot/motor de regras** já está destilada em `docs/MOTOR_REGRAS_ARQUITETURA.md`, `docs/BOT_CLASSIFICADOR_INTEGRACAO.md` e `docs/BOT_FRAMEWORK.md`.
