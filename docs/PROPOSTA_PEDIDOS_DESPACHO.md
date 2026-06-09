# Proposta — Menu "Pedidos" + "Despacho" (substituir Viagens/Fretes)

> Consolidação da pesquisa de 14 agentes (2026-06-09): 7 em fóruns/comunidades de logística (BR e internacionais) + 7 em GitHub/sistemas prontos (Fleetbase, ERPNext, Odoo, Onfleet, Routific, Circuit, Detrack, TMS comerciais BR: Bsoft, SSW, ESL, Sankhya, TOTVS).
> **Regra do projeto: validar cada ponto com o dono ANTES de codar.**

---

## 1. Diagnóstico do problema atual

| Hoje | Realidade |
|---|---|
| Menu **"Viagens"** → rota `/pedidos` | Lista a tabela `pedidos` com foco operacional |
| Menu **"Fretes"** → rota `/entregas` | Lista a **mesma** tabela `pedidos`, com foco financeiro (pago/não pago, marcar pago) |

São **duas visões da mesma entidade** com nomes que não descrevem nada. Não existe tela simples de lançar pedido (o wizard de `/pedidos/novo` tem 3 passos e exige entregas pré-cadastradas), nem tela de despacho (vincular caminhão/motorista a pedidos pendentes).

## 2. O que a pesquisa concluiu (convergência de 12+ dos 14 agentes)

### 2.1 Nomenclatura
- **"Frete" é o nome errado** para a etapa de vincular caminhão: no mercado BR, "frete" significa o **valor** cobrado, a modalidade ou o documento fiscal (CT-e) — nunca a operação de atribuição. (Fontes: TOTVS, Bsoft, Plimor "Dicionário do Frete", glossários.)
- O ato de vincular pedido a veículo+motorista e liberar a saída chama-se **DESPACHO** em todo o mercado: Sankhya ("Ordem de Despacho"), Odoo ("Dispatch Management"), Fleetbase ("Dispatch"), Intelipost ("Despacho Manual"), internacional ("dispatch/assignment").
- **"Pedido" é o nome certo** para a tela de lançamento — é o que o cliente entende e o que TMS BR usam ("Pedido de Carga"). Alinha com o internacional *Order*.
- **"Viagem"** no mercado = agrupamento de N pedidos num caminhão+motorista+dia, usado pra acerto financeiro (receitas − despesas da viagem). É um conceito **pós-despacho** — não deve ser nome de menu de lançamento. Pode voltar no futuro como entidade de agrupamento (a tabela `rotas` da migration empresa01 já cumpre esse papel).

### 2.2 Fluxo validado pelo mercado
O fluxo de 2 etapas que o dono imaginou **bate exatamente** com o padrão:

```
1. PEDIDO (lançar)  →  2. DESPACHO (caminhão + motorista)  →  3. Execução (rota + POD)
   status: lançado          status: despachado                   em_andamento → concluído
```

- Fleetbase: `Order created → Assign Driver/Vehicle → Dispatch → Navigator app → POD`.
- ERPNext: `Sales Order → Delivery Note → Delivery Trip (driver + vehicle + paradas)`.
- TMS BR (Bsoft/Sankhya): `Pedido de Carga → Minuta/Ordem de Despacho → Viagem`.
- A etapa 3 **já existe** no sistema (roteirização VROOM + app do motorista + POD).

### 2.3 Motorista padrão trocável
Padrão universal (Fleetbase, ERPNext, Upper, TMS BR): ao escolher o caminhão, o sistema **pré-carrega o motorista padrão** (no nosso caso: tabela `alocacoes`, que o wizard atual já consulta) e oferece **dropdown para trocar naquele dia** (folga/férias), registrando auditoria de quem trocou. Frotas pequenas com motorista fixo por caminhão são o caso ideal desse modelo.

### 2.4 Cliente avulso
Padrão de mercado (Saipos/Tiny/Bling "consumidor final", Routific/Onfleet "customer opcional"): **cliente NÃO é obrigatório** para lançar pedido. Grava-se só o nome livre; depois é possível vincular retroativamente a um cliente cadastrado se ele virar recorrente. O schema já suporta: `pedidos.cliente_id` é nullable e `entregas.nome_cliente_avulso` existe.

### 2.5 Importação em massa de notas — estratégia recomendada
Consenso técnico dos agentes de GitHub:

| Canal | Esforço | Qualidade | Quando |
|---|---|---|---|
| **XML de NFe** (upload múltiplo/ZIP) | Baixo (~50-100ms/arquivo, parser pronto: `fast-xml-parser`/`nfe-xml`) | Excelente — XML tem 100% dos dados (destinatário, endereço, CEP, valor) | **MVP** |
| **Planilha XLS/CSV** (wizard com mapeamento de colunas) | Baixo (componente pronto: `react-spreadsheet-import` MIT, ou SheetJS) | Boa — template mínimo estilo Routific/Circuit (endereço obrigatório, resto opcional) | **MVP** |
| **PDF de DANFE** | Alto (pdf2json por coordenadas; OCR Tesseract 5-30s/página e impreciso) | Fraca — a DANFE expõe ~10% dos dados do XML | **Fase 2** — antes disso, pedir o XML ao cliente |

Regras do fluxo de importação (padrão TOTVS/Sankhya/Detrack):
1. Upload em lote → preview do que foi extraído → operador confirma.
2. Importados entram como **rascunho/lançado**, nunca criam despacho automático.
3. Detecção de duplicata pela chave da NFe (não importar a mesma nota 2×).
4. Falha em 1 arquivo não aborta o lote — relatório `{sucesso: 49, falhas: 1, motivo}`.

---

## 3. Proposta concreta para o sistema

### 3.1 Menu (só rótulo + 1 tela nova; tabelas NÃO mudam)

| Antes | Depois | Rota | Conteúdo |
|---|---|---|---|
| Viagens | **Pedidos** | `/pedidos` | Lista de pedidos + botão "Novo Pedido" simples + botão "Importar notas" |
| Fretes | **Despacho** | `/despacho` (nova) | Fila de pedidos lançados sem caminhão → atribuir caminhão/motorista |
| — | **A Receber** (ou aba em Pedidos) | `/entregas` (atual) | A tela financeira atual (pago/não pago) continua existindo, só com nome honesto |

Arquivos: `Sidebar.tsx:164-165` e `MobileBottomNav.tsx:16-17`.

### 3.2 Tela "Novo Pedido" — versão SIMPLES (substitui o wizard de 3 passos)
Formulário único, padrão "mínimo de campos" (Routific: 3 cliques para criar):

1. **Cliente** — autocomplete nos cadastrados **+ opção "avulso"** (digita só o nome, sem cadastrar).
2. **Valor** do pedido (R$).
3. **Entregas/notas** — lista dinâmica: digita endereço-texto por linha (vira `entregas.destino`) **ou** botão **Importar** (XML NFe / XLS) que preenche a lista.
4. Salvar → status `lançado`. Caminhão/motorista ficam **vazios** (são definidos no Despacho).

O wizard atual de `/pedidos/novo` continua existindo como caminho "avançado" ou é aposentado — **decidir com o dono**.

### 3.3 Tela "Despacho" (nova)
1. **Fila**: pedidos com status `lançado` (sem veículo) — cards/linhas com cliente, nº de entregas, valor, data.
2. Seleciona 1 pedido (ou vários — "despacho em lote" no mesmo caminhão, padrão Intelipost/Circuit).
3. **Caminhão** (dropdown) → **motorista padrão pré-carregado** via `alocacoes` → link "trocar motorista" (dropdown de ativos; grava auditoria).
4. Confirmar → status `despachado`, grava `veiculo_id`/`motorista_id` no pedido (e propaga às entregas, como o wizard já faz).
5. Atalho "Roteirizar" (reusa o botão já implementado na página do pedido).

### 3.4 Importação (dentro de "Novo Pedido" e/ou página própria)
- **MVP**: XML de NFe (multi-upload/ZIP) + XLS/CSV com wizard de mapeamento.
- Cada NFe/linha → 1 entrega; agrupamento em 1 pedido ou N pedidos é escolha do operador no preview (não forçar 1:1 — recomendação Sankhya/Conta Azul).
- Endereço extraído alimenta o geocoding existente (cache→Google→ViaCEP).
- **Fase 2**: PDF de DANFE (pdf2json) e e-mail/FTP monitorado.

### 3.5 O que NÃO entra agora (mercado faz, mas é fase futura)
- CT-e / MDF-e / romaneio PDF — épico fiscal (o plano empresa01 §5 já adiou).
- Entidade "Viagem" como agrupamento financeiro multi-pedido (tabela `rotas` já preparada).
- Despacho automático/orchestrator (Fleetbase faz; nosso volume não precisa).
- EDI NOTFIS/Proceda (só se aparecer cliente grande que exija).

---

## 4. Ordem de execução sugerida (cada fase é pequena e testável)

1. **Renomear menus** (Viagens→Pedidos, Fretes→A Receber) + criar entrada "Despacho" — 30 min de código.
2. **Tela Despacho** (fila + atribuição caminhão/motorista trocável).
3. **Novo Pedido simples** (cliente avulso + entregas por texto).
4. **Importação XML NFe + XLS**.
5. (Fase 2) PDF DANFE, romaneio, vínculo retroativo de cliente avulso.

## 5. Principais referências
- Fleetbase (TMS open-source, modelo Order→Dispatch): https://github.com/fleetbase/fleetbase · https://docs.fleetbase.io
- ERPNext Delivery Trip: https://docs.frappe.io/erpnext/delivery-trip
- Odoo Dispatch Management: https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/inventory/shipping_receiving/setup_configuration/dispatch.html
- Routific (campos mínimos de ordem): https://help.routific.com/en/articles/6-how-to-add-orders · Circuit (import planilha): https://help.getcircuit.com/en/articles/3850966
- Sankhya — Pedido de Frete na conclusão da Ordem de Despacho: https://ajuda.sankhya.com.br/hc/pt-br/articles/360044599154
- Parsers NFe: `nfe-xml` (npm), `fast-xml-parser`; PDF: `pdf2json`. Import XLS: `react-spreadsheet-import` (MIT).
- TOTVS Protheus TMS importação XML: https://centraldeatendimento.totvs.com/hc/pt-br/articles/360026949131
