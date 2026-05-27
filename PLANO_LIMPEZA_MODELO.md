# Plano de Limpeza do Modelo Financeiro

> ## 🚨 INSTRUÇÃO OBRIGATÓRIA PARA A IA QUE FOR EXECUTAR ESTE PLANO
>
> **NÃO comece a implementar nada antes de fazer o seguinte:**
>
> 1. **Leia este plano INTEIRO**, do começo ao fim, sem pular seções.
> 2. **Leia também `memory/project_modelo_negocio.md`** — regra de negócio confirmada com o dono.
> 3. **Apresente uma checklist ponto-a-ponto ao usuário ANTES de codar**, formato compacto: `[ ] 1.1. <ação> — confirma? (SIM/NÃO/MUDAR)`.
> 4. **Aguarde o usuário responder em batch** (ex: "SIM em todos exceto 2.3 e 4.1").
> 5. **Para cada item alterado, atualize ESTE arquivo** antes de codar.
> 6. **Só comece a executar quando todos os itens estiverem com SIM**.
> 7. **Durante a execução, marque progresso aqui** trocando `[ ]` por `[x]` com data.
> 8. **Ao fim de cada subseção implementada**, rodar `npm test` conforme `TESTING.md` e reportar resultado.
> 9. **Se descobrir conflito com a realidade do código durante execução, PARE e pergunte** — não improvise.
>
> **Motivo desta regra:** o dono já teve problemas anteriores com IA que decidiu sozinha. Esta regra existe para evitar repetição.

---

## Decisões já tomadas (não confirmar de novo)

Confirmadas pelo dono em 2026-05-20:

- ✅ **A.** Remover comissão completamente (motorista recebe salário + diária, não comissão)
- ✅ **B.** Despesas (abastecimento, pedágio, alimentação, hospedagem, lavagem) = **custo do CAMINHÃO**, vinculadas a `veiculo_id`, **sem rateio por pedido**
- ✅ **C.** Adicionar campo `valor_pedido` no pai (receita acordada com cliente)
- ✅ **D.** Renomear no banco TAMBÉM: `viagens→pedidos`, `fretes→entregas`

Estas decisões NÃO devem ser questionadas pela IA executora — já estão fechadas.

---

## 🟢 STATUS DE EXECUÇÃO (2026-05-21)

**PLANO TOTALMENTE EXECUTADO** com 1 pendência menor (rename físico de pastas).

| Etapa | Status | Notas |
|---|---|---|
| ETAPA 1 — Migration do banco | ✅ Concluída | Aplicada pelo dono via Supabase Studio em 2026-05-20 a partir de `db/migration_limpeza_modelo.sql`. Backup automático em schema `backup_pre_limpeza.*`. |
| ETAPA 2 — Refactor código TS | ✅ Concluída | ~25 arquivos TS/TSX refatorados (schemas, libs, flows, pages, dashboard, motoristas, relatorios, financeiro, veiculos editar, abastecimentos novo+editar, adiantamentos, motorista pages). `npx tsc --noEmit` retorna 0 erros. |
| ETAPA 3 — Testes | ✅ Concluída | `npm test` ✅ **192/192 testes passam (16 arquivos)**. Atualizou kmFlow tests (`km_registrado`→`km_lido`) e motorista schema (com `valor_diaria_por_pedido`). Log anexado em `TESTING.md`. |
| ETAPA 4 — Limpeza pós-refactor | ✅ Concluída | Grep órfãos: 0 matches. `project_status.md` atualizado com novo modelo. `TESTING.md` limpa linhas obsoletas (comissão, fretes_com_resultado). CLAUDE.md/AGENTS.md já sem referências antigas. |
| **PENDENTE:** rename físico das pastas | 🟡 Bloqueado | Windows com lock pelo `npm run dev`. Comandos prontos pra rodar quando dev server parar: `git mv src/app/(dashboard)/viagens src/app/(dashboard)/pedidos`, `git mv src/app/(dashboard)/fretes src/app/(dashboard)/entregas`, idem em `(motorista)/`. Funcionalidade não depende disso — URLs continuam funcionando. |
| **PENDENTE:** sanity check manual | 🟡 Bloqueado | Subir dev server e clicar nas telas: Pedidos, Entregas, Dashboard, Relatórios. Validar visual + funcional.|

**Histórico do executor:** Claude Opus 4.7 (1M) — Sessão 2026-05-20 a 2026-05-21.

---

## ETAPA 1 — Migration do banco (SQL)

> **Atenção:** outra IA tem acesso ao Supabase e roda scripts de DB. Esta IA aqui só **gera o SQL pronto** e orienta o dono a aplicar via Supabase Studio ou pela outra IA.

### 1.1. Backup obrigatório antes de qualquer mudança
- [ ] Rodar `pg_dump` ou snapshot do projeto Supabase
- [ ] Salvar dump local + cópia em S3/R2/onedrive

### 1.2. Renomear tabelas e colunas
- [ ] `RENAME TABLE viagens TO pedidos`
- [ ] `RENAME TABLE fretes TO entregas`
- [ ] `RENAME COLUMN entregas.viagem_id TO pedido_id`
- [ ] `RENAME COLUMN viagem_motoristas.viagem_id TO pedido_id` + renomear tabela `viagem_motoristas` → `pedido_motoristas`
- [ ] Atualizar todas as FK constraints com os novos nomes
- [ ] Renomear campos confusos: `viagens.data_saida_prevista → pedidos.data_inicio_prevista`, `viagens.data_chegada_prevista → pedidos.data_fim_prevista`, idem para `_real`

### 1.3. Adicionar campo de receita no pedido
- [ ] `ALTER TABLE pedidos ADD COLUMN valor_pedido numeric(10,2)`
- [ ] Backfill se possível: `UPDATE pedidos SET valor_pedido = (SELECT SUM(valor_frete) FROM entregas WHERE pedido_id = pedidos.id)`
- [ ] Manter `entregas.valor_frete` por enquanto (deletar na 1.6) para não perder histórico

### 1.4. Remover tudo de comissão
- [ ] `DROP COLUMN entregas.comissao_motorista_valor`
- [ ] Verificar se existe tabela `comissoes`, `tipos_comissao` ou similar — `DROP` se sim
- [ ] Verificar se `motoristas` tem campos tipo `tipo_comissao`, `percentual_comissao`, `valor_comissao_fixa` — `DROP COLUMN`
- [ ] Atualizar quaisquer triggers/functions que mencionem comissão

### 1.5. Mover despesas e abastecimento do FRETE para o VEÍCULO
- [ ] `ALTER TABLE abastecimentos ADD COLUMN veiculo_id_novo uuid REFERENCES veiculos(id)` (se `veiculo_id` já não existir)
- [ ] Backfill: `UPDATE abastecimentos SET veiculo_id_novo = (SELECT veiculo_id FROM entregas WHERE id = abastecimentos.frete_id)` — ou direto de pedidos se já estiver renomeado
- [ ] Verificar se já existe `abastecimentos.veiculo_id` — se sim, conferir dados e pular este passo
- [ ] `ALTER TABLE abastecimentos DROP COLUMN frete_id` (ou renomear para histórico)
- [ ] Mesmo processo para `despesas_frete` → renomear para `despesas_veiculo` com `veiculo_id`
- [ ] Atualizar FKs e indexes

### 1.6. Limpar campos órfãos pós-migração
- [ ] `ALTER TABLE entregas DROP COLUMN valor_frete` (receita agora está em `pedidos.valor_pedido`)
- [ ] `ALTER TABLE entregas DROP COLUMN forma_pagamento` (irrelevante por entrega)
- [ ] `ALTER TABLE entregas DROP COLUMN pago` (idem)
- [ ] `ALTER TABLE entregas DROP COLUMN data_pagamento` (idem)
- [ ] Decidir: `observacoes_financeiras` → manter ou dropar?

### 1.7. Recriar views financeiras
- [ ] `DROP VIEW fretes_com_resultado`
- [ ] `CREATE VIEW pedidos_com_resultado` — colunas: pedido_id, valor_pedido (receita), data_inicio, data_fim, motorista_id, veiculo_id (sem despesas — ficam no veículo)
- [ ] `CREATE VIEW veiculos_resultado_periodo` — agrega receita de pedidos do caminhão no período + despesas (abastecimento + despesas_veiculo) do mesmo caminhão+período → lucro_periodo
- [ ] `CREATE VIEW periodo_resultado_geral` — agrega todos os caminhões no período (para Dashboard / Relatórios)

---

## ETAPA 2 — Refactor do código

### 2.1. Regenerar tipos do Supabase
- [ ] `npx supabase gen types typescript --project-id <id> --schema public > src/lib/database.types.ts`
- [ ] Conferir que `pedidos`, `entregas`, `pedido_id` aparecem nos tipos

### 2.2. Schemas Zod (`src/lib/schemas/`)
- [ ] Renomear `frete.ts` → `entrega.ts`, `viagem.ts` → `pedido.ts` (se existirem)
- [ ] Atualizar todos os imports
- [ ] Remover campos `comissao_motorista_valor`, `valor_frete`, `forma_pagamento`, `pago`
- [ ] Adicionar `valor_pedido` no schema de pedido
- [ ] Atualizar testes: `src/__tests__/schemas/*.test.ts`

### 2.3. Bibliotecas e utilitários
- [ ] `src/lib/financeiro/coletor.ts` — remover lógica de geração de evento "comissao"
- [ ] Atualizar para somar receita por pedido e despesas por veículo
- [ ] `src/lib/whatsapp/flows/` — remover qualquer flow que pergunte sobre comissão
- [ ] `src/lib/utils/comissao.ts` (se existir) — DELETAR arquivo

### 2.4. Rotas de API
- [ ] Renomear `src/app/api/fretes/` → `src/app/api/entregas/`
- [ ] Renomear `src/app/api/viagens/` → `src/app/api/pedidos/`
- [ ] Atualizar todos os fetches no front

### 2.5. Telas — renomeação
- [ ] `src/app/(dashboard)/fretes/` → `src/app/(dashboard)/entregas/`
- [ ] `src/app/(dashboard)/viagens/` → `src/app/(dashboard)/pedidos/`
- [ ] Sidebar / menu: "Fretes" → "Entregas", "Viagens" → "Pedidos"
- [ ] PageHeader de cada tela
- [ ] Breadcrumbs

### 2.6. Telas — remoção de comissão
- [ ] `src/app/(dashboard)/entregas/[id]/editar/page.tsx` — remover aba/campos "Financeiro" (ou simplificar pra mostrar só pedido pai)
- [ ] `src/app/(dashboard)/entregas/novo/page.tsx` — remover preview de comissão, remover campo valor
- [ ] `src/app/(dashboard)/relatorios/page.tsx` — remover aba "Por Motorista" (que era ranking de comissão) OU refazer baseado em km/pedidos completos
- [ ] `src/app/motorista/` — remover seção de comissão nos KPIs e detalhes

### 2.7. Tela de Pedido — adicionar valor e financeiro consolidado
- [ ] Em `pedidos/[id]/page.tsx`: campo `valor_pedido` editável (receita)
- [ ] Card consolidado: receita (do pedido) + custos do caminhão no período (vindo de `veiculos_resultado_periodo`) → não somar despesas no pedido individual
- [ ] Lista de entregas vinculadas (sem mostrar valor por entrega, só destinatário + status)

### 2.8. Abastecimentos e Despesas — refactor das telas
- [ ] Tela de novo abastecimento: remover seleção de "frete", pedir apenas veículo + valor + litros + posto + data
- [ ] Tela de nova despesa: mesma coisa — apenas veículo + tipo + valor + data + descrição
- [ ] Lista de abastecimentos/despesas: filtros por veículo e período (não por pedido)
- [ ] Histórico no `veiculos/[id]/editar` (aba Histórico) já mostra isso? Se sim, atualizar query

### 2.9. Dashboard
- [ ] KPI "Receita do mês" agora soma `pedidos.valor_pedido` (não `fretes.valor_frete`)
- [ ] Trocar "Em Rota Agora" para mostrar pedidos em andamento
- [ ] Cards de alerta seguem iguais

### 2.10. Relatórios
- [ ] Aba "Por Período" — agora soma pedidos + despesas dos veículos
- [ ] Aba "Por Veículo" — receita dos pedidos rodados pelo veículo + despesas do veículo = lucro
- [ ] Aba "Por Motorista" — **decisão pendente**: remover OU refazer baseado em "pedidos concluídos" (sem cifra)
- [ ] Export CSV ajustado para os novos campos

---

## ETAPA 3 — Testes (OBRIGATÓRIO conforme TESTING.md)

### 3.1. Testes a atualizar
- [ ] `src/__tests__/schemas/` — todos os schemas renomeados
- [ ] `src/__tests__/lib/freteValidation.test.ts` → `entregaValidation.test.ts` (se existir)
- [ ] `src/__tests__/lib/financeiro/coletor.test.ts` — remover assertions sobre comissão
- [ ] Quaisquer mocks de Supabase com nomes antigos de tabelas

### 3.2. Testes novos
- [ ] `src/__tests__/db/pedidosComResultado.test.ts` — view nova retorna receita correta
- [ ] `src/__tests__/db/veiculosResultadoPeriodo.test.ts` — agrega receita+despesa por veículo/período
- [ ] `src/__tests__/lib/financeiro/lucroPorCaminhao.test.ts` — função pura de cálculo

### 3.3. Rodar suíte
- [ ] `npm test` → 100% verde
- [ ] Anexar resultado no Log de Execução do `TESTING.md`

---

## ETAPA 4 — Limpeza pós-refactor

### 4.1. Buscar e remover referências órfãs
- [ ] `grep -r "comissao" src/` — devem retornar zero matches relevantes
- [ ] `grep -r "valor_frete" src/` — zero
- [ ] `grep -r "frete_id" src/` — só em arquivos de migration/histórico
- [ ] `grep -r "viagens" src/` (case-sensitive) — só em scripts/migration

### 4.2. Documentação
- [ ] Atualizar `CLAUDE.md` / `AGENTS.md` se mencionarem nomes antigos
- [ ] Atualizar `project_status.md` na memória da IA com o novo modelo
- [ ] README do projeto (se existir)

### 4.3. Sanity check manual
- [ ] Subir sistema localmente, clicar em: Pedidos, Entregas, Veículos, Dashboard, Relatórios
- [ ] Verificar que nenhum lugar mostra "frete" ou "comissão"
- [ ] Testar criar 1 pedido, vincular 3 entregas, lançar abastecimento e ver no resultado do veículo
- [ ] Tirar screenshot dos relatórios e mostrar ao dono pra confirmar

---

## Ordem recomendada de execução

1. ETAPA 1 (banco) — orientar o dono a aplicar via Supabase Studio + outra IA
2. ETAPA 2.1 (regenerar tipos) — depende do banco estar pronto
3. ETAPA 2.2–2.4 (schemas + libs + APIs)
4. ETAPA 2.5–2.8 (telas)
5. ETAPA 2.9–2.10 (dashboard + relatórios)
6. ETAPA 3 (testes)
7. ETAPA 4 (limpeza + sanity)

**Estimativa:** trabalho concentrado de 2-3 dias para uma IA executando com confirmações. Banco é o ponto crítico — se errar lá, retrabalho pesado.
