# 🌙 PLANO DE GESTÃO — MADRUGADA 11/06/2026 (início 02:00)

> **ESTE É O ARQUIVO DE CONTROLE.** Quem executa (Claude ou agente) DEVE:
> 1. Antes de começar um item: marcar `[~]` (em andamento) + hora.
> 2. Ao terminar: marcar `[x]` + hora + quem fez (principal/sonnet/haiku) + resultado da suíte.
> 3. Se os tokens acabarem: o próximo na retomada lê este arquivo + memória e continua do `[~]`.
> 4. **NUNCA commitar/pushar** — acumular a lista de commits prontos na seção final.
> 5. Suíte verde entre cada item (`npm test`); typecheck após cada bloco de código.
> 6. Delegação (regra do dono): haiku=pesquisa · sonnet=código simples/bem especificado ·
>    principal=crítico (bot, regras, banco, mobile/rota) · revisão de TODO diff de agente = principal.

**Contexto pra retomada fria:** memória persistente (auto-carrega) + `docs/PLANO_ZAP_GESTOR.md`
(spec das 7 regras) + `docs/arquivo/ARQUIVAO_PARA_REFATORAR.md` §0 (dívidas). Trabalho de hoje
já no working tree (bot status/frota — NÃO commitado; commit já está na lista do fim).

---

## FASE A — REGRAS DO GESTOR LEIGO NO ZAP (principal — CRÍTICO, eu mesmo)

> Spec completa: `docs/PLANO_ZAP_GESTOR.md`. Padrão técnico: `escopo_dados.consulta_dedicada`
> → leitor dedicado no botExecutor (modelo: consultarStatusFrota). Regra gravada via REST
> direto no Supabase (como feito 11/06 — PATCH/POST com JSON em arquivo temp + curl).
> **REGRAS NOVAS NASCEM `ativa=false`** — o código só chega em produção no deploy da manhã;
> ativar antes = resposta errada. Na manhã: dono pusha → Vercel deploya → ativar as 7 via REST
> (ou o dono pela tela, 1 clique cada). A matriz "Tabelas e campos" de CADA regra deve ficar
> preenchida certinha — o dono vai CONFERIR pela tela (prints de referência: Editar Regra +
> Tabelas e campos do KM Gestor).

- [x] A0. (02:02→02:06, Explore/haiku + validação principal) Recon completo: rota inicia = `rotas_otimizadas.status`
      rascunho|otimizada|em_andamento|concluida|cancelada (1 rota=1 motorista, `data` YMD); parada concluída =
      `paradas.concluida_em`; entrega concluída = `entregas.data_fim`; pedidos status agendad*/em_andamento/conclu*;
      CNH = `motoristas.cnh_validade`; lembrete pendente = `ciente_em IS NULL`; NÃO existe tabela despachos.
- [x] A1-A7. (02:06→02:12, principal) **OS 7 LEITORES + TESTES + REGRAS NO BANCO**: criado
      `src/lib/whatsapp/botLeitores.ts` (andamento_rotas, entregas_dia, pedidos_abertos, resumo_dia,
      vencimentos, onde_esta, meus_lembretes) + gancho `escopo_dados.consulta_dedicada` no classificadorBot
      + 16 testes novos (`botLeitores.test.ts`) + **7 regras POSTadas no Supabase (HTTP 201, ativa=false)**
      com gatilhos/frases de áudio/negativas/matriz. Tela da matriz ganhou a linha `entregas` (dados/page.tsx).
- [x] A8. (02:12, principal) **Teste de mesa anti-conflito AUTOMATIZADO** (script temp mesa.mjs, respeita
      gatilho_inicio): 18 regras × frases — 2 colisões reais corrigidas via PATCH (KM Gestor ganhou negativas
      de "meu km"; Consultar Motoristas perdeu gatilho "cnh do" que era do Vencimentos) → **0 colisões não cobertas**.
- [x] A9. (02:13) Conferência da ótica da tela: GET de verificação ok — regras novas com gatilhos/frases/
      negativas/colunas legíveis pela tela Editar Regras + matriz. Suíte: ✅ 1283/1283.

## FASE B — ESCRITOR GENÉRICO DO MOTOR DE REGRAS (principal — CRÍTICO)

- [x] B1. (02:14→02:20, sonnet + revisão do principal) Tela: seção "Escrita — campos esperados" na
      Tabelas-e-campos (aparece quando a regra tem ação Inclui): tabela destino, sem_empresa_id,
      linhas campo/rótulo/tipo/obrigatório/pergunta; grava `escopo_dados.escrita`; preserva `fixos`.
      Diff revisado e aprovado (atualizado_em existe; layout matriz 60vh ok).
- [x] B2. (02:14→02:20, principal) Executor genérico de ESCRITA v1 (=REGISTRAR/INSERT):
      `extrairCampos()` no classificador (Gemini responseSchema dinâmico, datas relativas→YYYY-MM-DD) +
      `escritaDaRegra/commitEscritaGenerica/previewEscrita` no botExecutor (allowlist "Inclui" +
      obrigatórios + tipos + empresa_id + REVALIDA a regra atual no sim) + fiação no classificadorBot
      (pendente acao "escrita", campo faltando → UMA pergunta). UPDATE genérico ficou de fora de
      propósito (KM e status já cobrem os críticos; resolver alvo de UPDATE genérico = projeto próprio).
- [x] B3. (02:18, principal) Consulta com **soma e período**: `escopo_dados.consulta_soma = {coluna,
      periodo: hoje|semana|mes, coluna_data?}` → `consultaSoma()` no botExecutor (SUM determinístico,
      filtro empresa + veículo, R$ pt-BR) + gancho no classificadorBot + teste. Pronto pra usar na regra
      Consultar Abastecimentos quando o dono quiser ("quanto gastei no mês").
- [x] B4. (02:20, sonnet + revisão do principal) **Validador no salvar**: novo `POST /api/regras/validar`
      (identificador regex → existência via service role 42P01/42703/PGRST205 → acesso da tela via anon
      42501/permission denied, em paralelo); a tela chama antes de gravar e mostra "⚠️ problemas…";
      clicar Salvar de novo em 10s = salvar mesmo assim; falha de rede não bloqueia.
- [x] B5. (02:21) Testes: +10 do escritor/soma (`botEscritor.test.ts`) + 16 dos leitores. tsc limpo.
      **Suíte completa: ✅ 1293/1293.**

## FASE C — REFATORAÇÃO DOS BLOCOS GIGANTES (sonnet executa · principal revisa CADA diff)

> SEM mudança de comportamento. Sequencial (um por vez, nunca paralelo no mesmo tree).
> Após cada um: typecheck + `npm test` + revisão do diff pelo principal antes de ticar.

- [x] C1. (02:21→02:28, sonnet + revisão do principal) `despacho/[id]/page.tsx` 734→352 linhas:
      `_components/` com AbaPrincipal (190), AbaRota (157), AbaMapa (38), types.ts (118), shared.tsx (45).
      Diff revisado (shell limpo, props tipadas, zero mudança de comportamento). Suíte: ✅ 1293/1293.
- [x] C2. (02:28→02:36, sonnet + revisão do principal) `pedidos/importar/page.tsx` 891→112 linhas:
      hook `useImportacao` (436) + 4 componentes de etapa + tipos. Parse já estava em lib (nada novo
      pra testar). Diff revisado (shell de 4 etapas, props tipadas). Suíte: ✅ 121 arquivos verdes.
- [x] C3. (02:36→02:50, sonnet + revisão do principal) `InputEnderecoNF.tsx` 869→297 linhas:
      pasta `inputEnderecoNF/` (TelaCEP, TelaConfirmar, BadgeValidacao, CabecalhoNF, FormEnderecoManual,
      useOcrState, useTranscricaoEndereco, estilos) + lib browser-safe `src/lib/cep/formatarCEP.ts`
      com 11 testes novos. Diff revisado. Suíte: ✅ 122 arquivos verdes.
- [x] C4. (02:50→02:58, sonnet + revisão do principal) `despacho/page.tsx` 879→279 linhas:
      hook `useDespacho` (502 — paginação .range incremental e busca no servidor PRESERVADAS,
      conferi o trecho crítico) + LinhaDespacho + CardDespachoMobile + KpisDespacho + tiposDespacho.
      ModalDespacho/ModalRota intactos. Suíte: ✅ 122 arquivos verdes.
- [x] C5. (02:58→03:06, sonnet + revisão do principal) `ajuste-rota/page.tsx` 980→577 linhas:
      `_components/` (HeaderAjusteRota, PopupAdicao, AbaOrdenar, SortableTijolinho, OverlayEscolherPosicao,
      useAjusteRota, utils, estilos). Handlers entrelaçados ficaram na page DE PROPÓSITO (tela de toque —
      clareza > meta de linhas; decisão aprovada na revisão). Suíte: ✅ 122 arquivos verdes.
      Commit sugerido (C1-C5): `git add -A && git commit -m "refactor: quebra dos blocos gigantes sem mudanca de comportamento (despacho/[id] 734->352, importar 891->112, InputEnderecoNF 869->297, despacho 879->279, ajuste-rota 980->577) + lib cep browser-safe com testes"`
- [x] C6. (03:06→03:27, PRINCIPAL — não delegado) `mobile/rota/page.tsx` 1.178→685 linhas:
      6 hooks em `hooks/` (useAncora, useDespachos, useCarregamentoInicial, useFaseEmRotaSync,
      useCapturaWorkers, useVoltarHardware) + função pura `lib/routing/statsRota.ts` com 4 testes.
      Handlers entrelaçados (otimizar/concluir/encerrar — offline-first) ficaram na page de propósito.
      Código copiado VERBATIM pros hooks (zero mudança de comportamento). Suíte: ✅ 1308/1308.

## FORA DO ESCOPO desta madrugada (não tocar)

`messageRouter.ts` (ok por ora) · `pedidos/novo`×`novo-avancado` (decisão: ficam os dois) ·
crons/alertas, Modo B, POD offline, lembrete→pedido, GPS token (dívidas #1-#5, próximas) ·
qualquer coisa fiscal (NUNCA) · commits/pushes (sempre do dono).

## 📋 LISTA DE COMMITS PRONTOS (preencher ao longo da noite — o dono roda de manhã)

1. `git add -A && git commit -m "feat(bot): mudar status do veiculo executa de verdade (propose->confirm via alocacoes) + status da frota com consulta dedicada + regras enriquecidas"` *(trabalho de 11/06 ~00h, já no tree)*
2. *(FASE A, 02:12)* os arquivos novos da fase A entram no mesmo `git add -A` acima — sugestão de commit separado:
   `git add src/lib/whatsapp/botLeitores.ts src/__tests__/whatsapp/botLeitores.test.ts src/lib/whatsapp/classificadorBot.ts "src/app/(dashboard)/regras/[id]/dados/page.tsx" && git commit -m "feat(bot): 7 leitores dedicados do gestor leigo (andamento rotas, resumo do dia, entregas, pedidos, vencimentos, onde esta, lembretes) via escopo_dados.consulta_dedicada + entregas na matriz da tela"`
3. *(FASE B, 02:21)* sugestão de commit:
   `git add src/lib/whatsapp/classificador.ts src/lib/whatsapp/botExecutor.ts src/lib/whatsapp/classificadorBot.ts src/__tests__/whatsapp/botEscritor.test.ts "src/app/(dashboard)/regras/[id]/dados/page.tsx" src/app/api/regras/validar/route.ts && git commit -m "feat(bot): escritor generico v1 (campos esperados na tela + extracao Gemini + INSERT pela allowlist com confirmacao) + consulta com soma/periodo + validador de regra no salvar (existencia + RLS)"`
4. *(C6, 03:27)* incluído no commit do refactor acima (item 3 da FASE C) — ou separado:
   `git add src/app/mobile/rota src/lib/routing/statsRota.ts src/__tests__/lib/statsRota.test.ts && git commit -m "refactor(mobile/rota): 1178->685 linhas - 6 hooks extraidos (ancora, despachos, carregamento inicial, sync em rota, workers captura, voltar hardware) + statsRota puro com testes"`

> 💡 MAIS SIMPLES: como está tudo verde, um único `git add -A` + um commit geral da madrugada também funciona.
> O que importa: **commitar TUDO e pushar** antes de ativar as regras novas.

## ☀️ CHECKLIST DA MANHÃ (pro dono — deixar mastigado)

- [ ] **Fallback da nuvem**: às 03:33 uma rotina na nuvem (sonnet) abre um PR
      `[FALLBACK NUVEM] Regras zap gestor` no GitHub como contingência. Se a madrugada local
      rodou (este arquivo está ticado), **FECHAR o PR sem mergear**. Se a sessão local morreu,
      o PR é o rascunho pra retomada. Gerenciar: https://claude.ai/code/routines
- [ ] Rodar os commits da lista acima + `git push` (Vercel deploya)
- [ ] Confirmar deploy OK na Vercel
- [ ] Avisar o Claude pra ATIVAR as 7 regras novas (ou ativar pela tela: Regras → cada uma → Ativa ✓)
- [ ] Testar no zap: "o leão já saiu?" · "resumo" · "põe o leão em manutenção" (confirma com *sim*)

---
*Status geral: ✅ **CONCLUÍDO 03:30** — FASES A, B e C inteiras (A1-A9, B1-B5, C1-C6).
Suíte final: **1308/1308 verdes** (+41 testes novos na noite). tsc limpo.
Falta só o ritual da manhã (checklist acima): commits → push → ativar as 7 regras → fechar o PR da nuvem.*
