# 🌙 Plano da Madrugada 12/06/2026 — Auditoria Mobile v3 (cega) + correção + rodar até secar

> Runbook para a sessão agendada das 01:10. Autorizado pelo dono em 11/06 ~22h:
> auditoria cega → correções → re-auditoria se necessário → **commit + push direto** (autorização EXCEPCIONAL desta noite, só com tudo verde).

## Contexto

- Rodada 1 (153 achados) e rodada 2 (166 achados) corrigidas e commitadas em 11/06 (commits `83e8b09` e o seguinte do dono pós-rodada-2).
- Relatórios anteriores: `docs/AUDITORIA_MOBILE_GESTOR_2026-06-11.md` (v1) e `docs/AUDITORIA_MOBILE_V2_2026-06-11.md` (v2).
- Script da auditoria v2 (REUSAR a receita — mesma estrutura, schemas e grupos):
  `C:\Users\ronal\.claude\projects\C--Users-ronal-Documents-Antigravity-SISTEMA-DE-FROTA\d4df48a7-db7e-4620-919f-24e136249cf3\workflows\scripts\auditoria-mobile-gestor-v2-wf_5be2a3da-05e.js`
- Memória relevante: `project_auditoria_mobile.md` no diretório de memória.

## O pedido do dono, VERBATIM (vai dentro do prompt dos auditores cegos, como pedido original)

"Veja meu problema agora o mais atual, eu entrei para verificar oque esta certo e errado no sistema mobile, par o gestor, onde mostra tudo.e o que acontece, parece que esta tudo ruim, botões de confirmar não funciona, clico em outro botão as vezes esta ate carregando mas não informa isso, ai fico clicando vai carregar novamente, se estou em uma tela clico em uma aba, ai clico no botão voltar do celular, volta para tela de login, telas muito mal formatada [...] também tem os botões que parece que é so escrita, poxa se vai demorar algo, coloque algo na tela carregando, tabelas desalinhadas digo no front ai tem uma informação e no campo a informação é grande ai, vai quebra a coluna criando varias, linhas. preciso que o sistema pesquise veja melhores praticas, o sistema esta funcionando perfeitamente na web ate então mas preciso que o mobilile seja um reflexo, mas com um detalhe para uma pessoa leiga. tem de ter foco, para um leigo, usar, e por traz no backend, tudo linkando certinho não deixando nada quebrar. se o usuário tiver fazendo cagada, alerte, peça confirmação, não deixe nada ser registrado sem alertar o usuário. [...] Gostaria que tenha uma engenharia, extrair a informação de forma amigável do usuário no mobile, mas alimentar o banco, com dados super concisos"

## Receita da auditoria v3 (idêntica à v2, com upgrade de opus)

1. **10 auditores de tela** — mesmos grupos e arquivos da v2, mesmos 8 critérios (ação, loading, affordance, guard-rail, tabela, entrada→dado, layout, clareza pro leigo), CEGOS (sem mencionar rodadas anteriores). Modelos:
   - Grupo **financeiro** (financeiro/** + faturamento/**): **model: 'opus'** (dinheiro).
   - Demais 9 grupos: sonnet.
2. **+1 auditor transversal NOVO em opus**: "integridade de gravação" — varre TODOS os fluxos de escrita no banco do dashboard de ponta a ponta (estado local vs banco, corrida de cliques, update otimista sem rollback, dado inconsistente passando — ex.: pago sem data). Não por tela: por fluxo de escrita. Schema igual ao AUDIT_SCHEMA.
3. **3 pesquisadores web sonnet** (mesmos temas da v2).
4. **1 investigador de navegação** (modelo da sessão) — veredicto voltar/login/histórico.

## Filtro do relatório (decisões já acordadas — NÃO reportar, NÃO corrigir)

- Topbar não renderizado no layout (componente morto — decisão pendente do dono).
- `router.replace` em `/pedidos/[id]` (redirect-shim correto).
- minmax(150px)/minmax(240px) nos grids do painel (valores escolhidos).
- m-show sem `display:none` inline (padrão escolhido; CSS controla).
- Card de pedido abre /despacho (decisão: Despacho é o cérebro), botão Editar separado.
- 6 `alert()` de erro restantes (polimento futuro aceito): clientes/novo:91,117, PlanoTab:103, faturamento:210 (modal de baixa usa alert no erro), AcertoMensalTab:232, empresas/novo:71. Se a correção for barata dentro de um grupo já em edição, pode trocar por banner; não é obrigatório.

## Ciclo da noite (rodar até secar — LIMITES)

1. Auditoria v3 → filtrar → interpretar.
2. Corrigir: frota sonnet (grupos disjuntos, KIT da correção v2 — script `correcao-mobile-gestor-v2-wf_b3e928c9-d41.js` no mesmo dir de scripts) + **na mão do modelo principal**: auth, dinheiro, componentes compartilhados, e qualquer crítico.
3. Validar: `npx tsc --noEmit` + `npx eslint src --max-warnings=0` + `npm test` (1320+).
4. **Se a rodada achou crítico ou médio ligado à angústia do dono** (botão sem ação/feedback, registro sem aviso, voltar→login, tabela quebrada): repetir auditoria CEGA do zero e corrigir de novo.
5. **Máximo 2 ciclos completos de auditoria+correção + 1 auditoria final de verificação.** Se a última ainda vier carregada: PARAR, não commitar a parte duvidosa, relatar.
6. SECOU = última rodada só com baixos/corriqueiros.

## O que NÃO fazer sozinho de madrugada

- Migration/DDL de banco, mudança de regra de negócio, achado ambíguo que exige decisão de produto → fora do auto-fix, listar no topo do relatório da manhã.
- Não mexer em `src/app/mobile/**` (fluxo do motorista) nem no bot (`src/lib/whatsapp/**`) — escopo é o dashboard do gestor.
- Não recolocar travas em lembretes (regra do dono: lembretes SEM trava).

## Commit final (SÓ com tsc 0 + eslint 0 + suíte 100% verde)

```
git add -A
git commit -m "feat(mobile): madrugada 12/06 - auditoria cega v3 (+opus em financeiro e integridade de gravacao), correcoes e re-verificacao ate secar"
git push
```

Se qualquer validação ficar vermelha sem solução confiante: **não pushar**, deixar no working tree e explicar no relatório.

## Entregáveis da manhã

- `docs/AUDITORIA_MOBILE_V3_2026-06-12.md` (+ V4 se houver segundo ciclo) — achados filtrados + veredicto de convergência.
- Linha no `TESTING_LOG.md`.
- Atualizar memória `project_auditoria_mobile.md`.
- Resumo executivo no chat: secou ou não, o que foi corrigido, o que ficou pra decisão do dono.
- Apagar o agendamento (CronDelete) após a execução — é corrida única.
