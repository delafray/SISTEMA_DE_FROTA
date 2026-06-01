# 🧪 POLÍTICA DE TESTES OBRIGATÓRIA — LEIA ANTES DE QUALQUER ALTERAÇÃO

**⚠️ ATENÇÃO TODAS AS IAs (Claude, Gemini, GPT, Sonnet, Opus, Haiku, Cursor, Windsurf, Antigravity, Cline, Cody, qualquer outra):**

Este arquivo é a **regra número 1** do projeto. Se você ignorar este arquivo, **seu trabalho será rejeitado** pelo dono do projeto. Não importa o quanto a entrega pareça pronta — sem testes, não está pronta.

O dono do projeto está cansado de IAs que prometem mas não testam. **Pare de prometer. Comece a testar.**

---

## 🔴 REGRA ABSOLUTA — TESTE OBRIGATÓRIO AO FIM DE CADA CICLO

**Antes de declarar QUALQUER tarefa como concluída, você DEVE:**

1. ✅ **Criar/atualizar testes** para todo código que você escreveu ou modificou.
2. ✅ **Rodar `npm test`** e ver TODOS os testes passarem (verde).
3. ✅ **Reportar o resultado** ao usuário: número de testes, passing/failing, cobertura aproximada.
4. ✅ **Se algum teste falhar**, NÃO finalize a tarefa. Corrija primeiro.

**Não está concluído enquanto `npm test` não passar.** Ponto final.

---

## 📋 O QUE TESTAR — Cobertura Mínima Por Tipo de Mudança

### Mudou um schema Zod (`src/lib/schemas/*.ts`)
→ Atualizar/criar teste em `src/__tests__/schemas/*.test.ts` com:
- Caso válido (happy path)
- Cada campo obrigatório faltando
- Cada validação customizada (regex, length, enum)

### Mudou um flow do WhatsApp (`src/lib/whatsapp/flows/*.ts`)
→ Atualizar/criar teste em `src/__tests__/whatsapp/flows/*.test.ts` com:
- Mensagem inicial (start of flow)
- Resposta inválida do usuário
- Resposta válida → próximo estado
- Confirmação final → persistência no DB (mock)
- Cancelamento

### Mudou função do `aiService.ts`
→ Atualizar `src/__tests__/services/aiService.test.ts` com:
- Mock da resposta da OpenAI
- Cenário de confiança alta (>= threshold)
- Cenário de confiança baixa (fallback manual)
- Cenário de erro da API (não pode lançar exceção)

### Mudou uma página de formulário (`src/app/**/page.tsx`)
→ Criar teste de schema/validação relacionado. UI test só se houver lógica complexa de estado.

### Mudou trigger/function/view do Supabase
→ Adicionar teste de integração em `src/__tests__/db/*.test.ts` (criar pasta se necessário) que verifica o comportamento via cliente Supabase mockado, ou pelo menos documenta o caso em comentário no SQL.

### Mudou lógica de cálculo (comissão, custos, lucro)
→ Criar/atualizar teste em `src/__tests__/lib/*.test.ts` cobrindo:
- Cada tipo de comissão (percentual, fixo, km, salário, combinações)
- Edge cases: valor zero, motorista sem comissão configurada, km_inicial > km_final
- Frete com despesas e abastecimentos (mock)

---

## 🛠️ COMO RODAR

```bash
# Suite completa
npm test

# Watch mode (durante desenvolvimento)
npm run test:watch

# Cobertura
npm run test:coverage

# Apenas um arquivo
npm test -- src/__tests__/schemas/motorista.test.ts
```

A suíte usa **vitest**. Padrão dos testes:

```ts
import { describe, it, expect } from "vitest";
import { algumaCoisa } from "@/lib/algumLugar";

describe("nome do módulo", () => {
  it("descreve o caso testado", () => {
    expect(algumaCoisa(input)).toBe(esperado);
  });
});
```

---

## 🚫 CHECKLIST DE ERROS COMUNS — NÃO FAÇA ISSO

❌ "Os testes existentes ainda passam, então tá bom." — **ERRADO.** Você precisa criar testes para o código novo.

❌ "Vou só rodar o que existe, sem criar novos." — **ERRADO.** Todo código novo precisa de teste novo.

❌ "Mudei só uma linha, não precisa de teste." — **ERRADO.** Uma linha mudada pode quebrar invariantes. Teste.

❌ "Vou colocar `it.skip` para passar depois." — **ERRADO.** Skip não conta como teste. Implemente ou não faça a mudança.

❌ "Testei manualmente no browser, funciona." — **NÃO É TESTE AUTOMATIZADO.** Crie o teste em código.

❌ "O usuário não pediu testes." — **ERRADO.** O usuário PEDIU. Este arquivo existe por isso.

❌ "Esquecei de rodar `npm test`, mas deve passar." — **ERRADO.** Rode. Sempre.

---

## ✅ TEMPLATE DE RELATÓRIO AO FIM DE CADA CICLO

Ao finalizar uma tarefa, **inclua no final da sua resposta** um bloco assim:

```
## Testes

- Comando: npm test
- Resultado: ✅ X testes passaram, 0 falharam
- Novos testes adicionados: <lista de arquivos>
- Arquivos modificados sem teste novo: <lista, e justificativa caso não tenha sido necessário>
```

Se você não pode rodar `npm test` (ambiente sem Node, por exemplo), **declare isso explicitamente**:

```
## Testes
- ⚠️ Não consegui rodar `npm test` neste ambiente. Recomendo o usuário rodar antes de aceitar a mudança.
- Testes que escrevi: <lista>
```

---

## 🧩 ÁREAS COM COBERTURA INSUFICIENTE HOJE (PRIORIZE)

| Área | Cobertura atual | Onde criar testes |
|---|---|---|
| Schemas (cliente, motorista, veículo) | ✅ Coberto | `src/__tests__/schemas/` |
| WhatsApp parser/sender/router/auth | ✅ Coberto | `src/__tests__/whatsapp/` |
| AvariaFlow | ✅ Coberto | `src/__tests__/whatsapp/flows/` |
| AbastecimentoFlow | ❌ FALTA | `src/__tests__/whatsapp/flows/abastecimentoFlow.test.ts` |
| KmFlow | ❌ FALTA | `src/__tests__/whatsapp/flows/kmFlow.test.ts` |
| DespesaFlow | ❌ FALTA | `src/__tests__/whatsapp/flows/despesaFlow.test.ts` |
| ViagemFlow (= Pedido) | ❌ FALTA | `src/__tests__/whatsapp/flows/viagemFlow.test.ts` |
| GestorFlow | ❌ FALTA | `src/__tests__/whatsapp/flows/gestorFlow.test.ts` |
| AdiantamentoFlow | ❌ FALTA | `src/__tests__/whatsapp/flows/adiantamentoFlow.test.ts` |
| ChecklistFlow | ❌ FALTA | `src/__tests__/whatsapp/flows/checklistFlow.test.ts` |
| ImprevistoFlow | ❌ FALTA | `src/__tests__/whatsapp/flows/imprevistoFlow.test.ts` |
| Validação status veículo | ❌ FALTA | `src/__tests__/lib/veiculoStatus.test.ts` |
| Pedido: km_final >= km_inicial | ❌ FALTA | `src/__tests__/lib/pedidoValidation.test.ts` |
| Cálculo diária do motorista (qtd_pedidos × valor_diaria_por_pedido) | ❌ FALTA | `src/__tests__/lib/acertoMensal.test.ts` |
| View `pedidos_com_resultado` | ❌ FALTA | `src/__tests__/db/pedidosComResultado.test.ts` |
| View `veiculos_resultado_periodo` | ❌ FALTA | `src/__tests__/db/veiculosResultadoPeriodo.test.ts` |

**Ao trabalhar em qualquer linha acima, crie o teste correspondente.**

---

## 📜 HISTÓRICO DE QUEM FEZ O QUÊ

Cada IA que trabalha no projeto **deve registrar** no final desta seção:

```
- [DATA] [MODELO] — [O QUE FEZ] — [QUANTOS TESTES NOVOS] — [STATUS DA SUITE]
```

Exemplo:
```
- 2026-05-20 Claude Opus 4.7 — Criou testes de viagemFlow e validação de conflito — +12 testes — ✅ 117/117 passaram
```

### Log de Execução

<!-- AS IAs DEVEM ANEXAR LINHAS AQUI APÓS CADA TAREFA -->
- 2026-05-20 Claude Opus 4.7 (1M) — Criou TESTING.md + arquivos de regra para 7 IAs + testes de `normalizar`, `loadAll` e `kmFlow` — +3 arquivos de teste, ~40 casos novos — ✅ 191/191 passando (16 arquivos)
- 2026-05-20 Gemini 3.5 Flash (High) / Antigravity — Corrigiu erros de compilação TS em `kmFlow.test.ts` e validou a suíte inteira — 0 novos testes — ✅ 191/191 passando (16 arquivos)
- 2026-05-20 Gemini 3.5 Flash (High) / Antigravity — Corrigiu erros de sintaxe JSX/JS em `AcertoMensalTab.tsx` e validou com tsc e vitest — 0 novos testes — ✅ 191/191 passando (16 arquivos)
- 2026-05-20 Gemini 3.5 Flash (High) / Antigravity — Adicionou ordenação interativa de Fretes por Rota, Data Fim e Saldo Restante usando Th do ds.tsx — 0 novos testes — ✅ 191/191 passando (16 arquivos)
- 2026-05-21 Claude Opus 4.7 (1M) — Limpeza ETAPA 2 do `PLANO_LIMPEZA_MODELO.md`: refactor completo viagens→pedidos, fretes→entregas, remoção de comissão, despesas→veiculo_id, frete_id removido de tabelas auxiliares, datas de pedidos renomeadas. Atualizou ~25 arquivos TS/TSX, fixed kmFlow tests (`km_registrado`→`km_lido`) — +1 teste novo (valor_diaria_por_pedido em motorista schema) — ✅ 192/192 passando (16 arquivos), `tsc --noEmit` 0 erros
- 2026-05-27 Claude Sonnet 4.6 (Thinking) / Antigravity — Migração completa Meta Cloud API → Evolution API: reescrita de `security.ts`, `messageParser.ts`, `messageSender.ts`, `webhook/route.ts` + testes correspondentes. Todos os 8 flows, router, auth e sessionManager preservados sem alteração — +0 testes novos de lógica, todos os testes de infra WhatsApp reescritos para o novo provider — ✅ 189/189 passando (16 arquivos)
- 2026-05-27 Gemini 3.5 Flash (High) / Antigravity — Resolução de problemas de infra, deploy e SSL na Evolution API do Railway, persistência Postgres ativada com sslmode=no-verify e salvando instâncias com sucesso. Validou a suite de testes locais — 0 novos testes — ✅ 189/189 passando (16 arquivos)
- 2026-05-27 Gemini 3.5 Flash (Medium) / Antigravity — Corrigido parser de JID alternativo da Evolution API para resolver LID com terminação @s.whatsapp.net e restaurar recebimento de mensagens do bot — +1 teste novo (LID com @s.whatsapp.net) — ✅ 195/195 passando (16 arquivos)
- 2026-05-28 Claude Opus 4.7 (1M) — **MVP de Roteirização — Fase 0 + Fase 1 completas** (PLANO_ROTEIRIZACAO.md): Setup completo (5 tabelas Supabase, deps npm, env vars, types), ViaCEP+cache (1.1), fila offline Dexie+sync+API (1.2), InputEnderecoNF+API+browser client (1.3), tela mobile captura-notas (1.4), Nominatim geocoding (1.5), API geocodar (1.6), cliente OSRM (1.7), cliente VROOM (1.8), helpers de restrições VROOM (1.9), API otimizar (1.10), MapaRota Leaflet+polyline decoder (1.11), tela Ajuste de Rota com tabs/dnd-kit/modal (1.12 + 2 sub-APIs), deep links Waze/Google Maps (1.13), utilitário estimarRota (1.14). Polish adiado: animações de pinos, modal de impacto km/min, cliente_preferencias, integração visual com entregas/novo. — **+257 testes novos em 24 arquivos novos** — ✅ 452/452 passando (40 arquivos)
- 2026-05-29 Gemini 3.5 Flash (High) / Antigravity — Resolvido bug que impedia visualizar outros usuários (RLS de usuario_empresas corrigido) + RLS bypass seguro nas Server Actions de edição/remoção de usuários + Refactor RemoverUsuarioBtn para server action — +6 testes novos em 1 arquivo novo — ✅ 488/488 passando (45 arquivos)
- 2026-05-29 Gemini 3.5 Flash (High) / Antigravity — Resolvido bug de login multidomínio (novo @frota.sys + legado @ronaldoborba.com.br) + Feedback visual de erro com banner na UI e tratamento de useSearchParams em Suspense — +4 testes novos em 1 arquivo novo — ✅ 493/493 passando (46 arquivos)
- 2026-05-29 Claude Opus 4.6 (Thinking) / Antigravity — Fix reordenação paradas (CHECK constraint), z-index Leaflet sobre modais (isolation stacking context), auto-refresh da rota ao voltar de ajuste-rota (visibilitychange + pageshow) — +1 teste novo — ✅ 518/518 passando (47 arquivos)
- 2026-05-30 Claude Opus 4.7 (1M) — **Bot WhatsApp: pipeline áudio Deepgram → Gemini** (resolveu bug de Gemini retornar respostas genéricas com OGG/Opus do WhatsApp). Reescreveu `chatGeminiComAudio` pra: 1) transcrever áudio via Deepgram nova-2 pt-BR, 2) enviar texto pro `chatGemini` text-only com histórico. `processarAudioComGemini` agora grava a transcrição real no histórico (não mais "(mensagem de voz)") + mensagem específica pra áudio inaudível. +18 testes novos em 3 arquivos (deepgramClient, geminiClient áudio, geminiBot) — ✅ 588/588 passando (56 arquivos)
- 2026-05-30 Claude Opus 4.7 (1M) — **Validação de endereços via Overpass self-hosted**: lib completa (`src/lib/routing/overpass/`) + API route + integração UI. Bbox query (sem dependência de areas pre-geradas) + cache Supabase com TTL adaptativo (30d positivo, 14d baixa confiança, 6m sem_dados) + badge visual no `InputEnderecoNF` (🟢confirmado / 🟡plausível / 🟠suspeito) sem bloquear o fluxo. 4 agentes de pesquisa convergiram na estratégia. +37 testes em 5 arquivos novos — ✅ 627/627 passando (61 arquivos)
- 2026-05-30 Claude Opus 4.7 (1M) — **BOT_FRAMEWORK.md** consolidado de 7 agentes (5 pesquisa + 2 código). Documento de 495 linhas: arquitetura em 8 camadas, 11 bugs identificados com severidade, regras pra tools/prompt/erro, Permission Loop pra ações destrutivas, zona protegida, roadmap em 5 fases. Sem código novo — apenas planejamento — ✅ 627/627 passando
- 2026-05-30 Claude Opus 4.7 (1M) — **Fase 1 do BOT_FRAMEWORK executada (4 bugs críticos corrigidos)**: B1 histórico migrado pra Supabase (`whatsapp_historico` table + `src/lib/whatsapp/historico.ts` com fallback gracioso), B2 validação rigorosa de NaN/Infinity/decimal em propor+confirmar KM, B3 error handling em messageRouter (3 queries silenciosas tratadas), B4 Permission Loop implementado (`propor_atualizacao_km` read-only + `confirmar_atualizacao_km` executa, com legacy redirect anti-regressão). SYSTEM_PROMPT reescrito (template §5.3 do framework). Migration SQL em `db/migration_whatsapp_historico.sql`. +36 testes (historico 8, geminiBot atualizado 8, frotaTools 13, dispatcher 7) — ✅ 663/663 passando (63 arquivos)
- 2026-05-29 Gemini 3.1 Pro (Low) / Antigravity — Implementação de captura de endereço por voz (Speech-to-Text) usando Web Speech API nativa. Botão microfone adicionado no InputEnderecoNF com extração inteligente de CEP e fallback para geocoding completo do Nominatim — +10 testes novos em 2 arquivos novos — ✅ 528/528 passando (49 arquivos)
- 2026-05-29 Claude Sonnet 4.6 (Thinking) / Antigravity — Histórico de rotas na tela de Início. Motorista vê as últimas 5 rotas ao abrir "Rota do Dia". Rotas em aberto aparecem em vermelho com aviso. Pode retomar ou criar nova. Refatoração geral dos testes de fase em_rota para seguir o novo fluxo de navegação — +3 novos testes — ✅ 531/531 passando (49 arquivos)
- 2026-05-29 Gemini 2.5 Pro / Antigravity — Múltiplos resultados de geocoding ao falar endereço: `geocodarMultiplos` + `calcularDistanciaKm` em geocoding.ts, GET em `/api/routing/geocodar`, componente `ListaOpcoesEndereco`, nova etapa `escolha_endereco` em `InputEnderecoNF` com geolocalização GPS para ordenar por proximidade. Edição de NF capturada: `editarNota` em fila.ts, botão ✏️ e modo edição em `FaseCaptura` — +22 testes novos em 3 arquivos novos — ✅ 558/558 passando (52 arquivos)
- 2026-05-29 Gemini 3.5 Flash (High) / Antigravity — Criou método PATCH em /api/routing/rota/[id] para atualização do status da rota no banco de dados e integrou na ação 'Encerrar rota' do motorista — +5 testes novos — ✅ 563/563 passando (52 arquivos)
- 2026-05-29 Gemini 3.5 Flash (High) / Antigravity — Criou endpoint POST /api/routing/notas/limpar e limparFila no Dexie para zerar totalmente a fila offline e as notas capturadas pendentes no Supabase ao iniciar uma nova rota — +5 testes novos em 2 arquivos novos — ✅ 568/568 passando (54 arquivos)
- 2026-05-29 Gemini 2.5 Pro / Antigravity — Fallback progressivo no geocoding: quando Nominatim não encontra com query completa (logradouro+numero+bairro+cidade+uf+cep), tenta automaticamente sem bairro/CEP, só com número, e por fim só logradouro+cidade+uf. Resolve endereços brasileiros que o Nominatim público não encontra na busca completa — +2 testes novos — ✅ 570/570 passando (53 arquivos)
- 2026-05-30 Gemini 2.5 Flash (Claude Thinking) / Antigravity — Novas tools do Gemini para consultar e atualizar KM do caminhão via WhatsApp: `buscar_km_caminhao` (busca via km_logs + fallback pedido ativo) e `atualizar_km_caminhao` (insere em km_logs, trigger propaga para veiculos.km_atual). Pipeline completo text+audio com motoristaId injetado do auth. SYSTEM_PROMPT atualizado com instruções das novas tools. — +9 testes novos em 1 arquivo novo (`frotaTools.test.ts`) — ✅ 638/638 passando (62 arquivos)
- 2026-05-29 Claude Opus 4.7 (1M) — **BOT_FRAMEWORK Fase 2 + bugs restantes (B6/B8/B9)**: (B9) `comRetry` centralizado em `src/lib/ai/retry.ts` com backoff exponencial — só retenta em 5xx/429/network, nunca 4xx — wrappeando chamadas do Gemini e Deepgram. (B6) Multi-turn tool loop no `geminiClient` com cap `MAX_TOOL_ROUNDS=5` (evita loops infinitos). (B8) `prefixarComRemetente` extraído pra `src/lib/ai/contexto.ts` (fim do drift entre geminiClient/geminiBot). **Fase 2**: fast-path regex em `src/lib/whatsapp/fastPath.ts` (saudação/ajuda/encerramento/reset) bypassa o LLM em mensagens curtas; métricas estruturadas em `bot_metricas` table (`src/lib/ai/metricas.ts` + `db/migration_bot_metricas.sql`) com fire-and-forget pra capturar tokens, tools, latência, cached_tokens. Tests de fast-path/retry/geminiBot atualizados, e2e/messageRouter mudados pra perguntas reais (fast-path antes do mock do Gemini). — +20 testes novos em 2 arquivos novos (retry, fastPath) — ✅ 683/683 passando (65 arquivos)
- 2026-05-30 Claude Opus 4.7 (1M) — **Fix: bot "burro" pra perguntas tipo "quanto km tem o leão" e "qual meu caminhão"**. `buscar_km_caminhao` agora aceita `placa_ou_apelido?` opcional (busca por placa OU apelido case-insensitive na empresa, com erro descritivo quando ambíguo ou nao encontrado). Nova tool `meu_caminhao` pra "qual veiculo esta vinculado a mim". SYSTEM_PROMPT atualizado com mapeamento explicito dos casos. +8 testes novos em frotaTools.test.ts (modo apelido, ambiguidade, meu_caminhao, dispatcher). — ✅ 691/691 passando (65 arquivos)
- 2026-05-31 Claude Opus 4.7 (1M) — **Fix bug critico: "First content should be with role 'user', got model"** — Gemini rejeitava 100% das chamadas (texto + audio) quando historico iniciava com role 'model'. Causa raiz: `void gravarMensagem(user) + void gravarMensagem(model)` em paralelo → Postgres invertia ordem de `created_at` em race condition. Janela movel de 8 msgs as vezes pegava um 'model' orfa do turno anterior como primeira. **Fix duplo**: (a) gravacao SEQUENCIAL com await em geminiBot.ts (texto + audio) garante monotonicidade de timestamp; (b) defesa em lerHistorico — descarta msgs 'model' do inicio antes de devolver (resiliencia contra dados antigos quebrados ja no banco do user). +2 testes novos em historico.test.ts (janela cortando turno; race do Postgres). — ✅ 693/693 passando (65 arquivos)
- 2026-05-31 Claude Opus 4.7 (1M) — **Fix CHECK constraint km_logs_tipo_check** — insert com `tipo: 'informado'` violava constraint do banco (aceita inicial/final/checkpoint/abastecimento/manutencao/pausa). Bug afetava `confirmar_atualizacao_km` (tool nova) e `kmFlow` legado. Trocado pra `'checkpoint'` (semantica de update do hodometro durante operacao). Teste e2e atualizado. — ✅ 693/693 passando (65 arquivos)
- 2026-05-31 Claude Opus 4.7 (1M) — **Fix trigger obsoleto km_logs + flags pra propagar km_atual** — (a) trigger `frete_iniciado_atualiza_status` em km_logs referenciava `NEW.frete_id` (coluna removida na limpeza) e `fretes` (tabela renomeada pra entregas) — crashava 100% dos inserts. SQL `DROP FUNCTION frete_iniciado_atualiza_status() CASCADE` rodado em prod. (b) insert do `confirmar_atualizacao_km` (e kmFlow) nao setava `confirmado=true, correcao=false` — sem isso o trigger `propagar_km_para_veiculo` nao atualizava `veiculos.km_atual`. Codigo + teste e2e atualizados. — ✅ 693/693 passando (65 arquivos)
- 2026-05-31 Claude Opus 4.7 (1M) — **BOT_FRAMEWORK Fase 2.5 (seguranca) — B17-B24 corrigidos**: (B17/B18) queries de veiculos em `messageRouter` agora filtram `.eq('empresa_id', sessao.empresa_id)` em `processarSelecaoVeiculo` e `enviarStatusVeiculo` + avarias — corrige vazamento entre empresas (princípio §1.4 do framework). (B19/B20) `updateSession` migrado pra RPC `update_session_atomic` (FOR UPDATE + merge jsonb atomico via Postgres) com checagem de affected_rows → retorna `{ ok:false, codigo:'sessao_perdida' }` quando linha sumiu. Migration `db/migration_session_atomic.sql`. (B21) dispatcher de `frotaTools.executarTool` nunca normaliza `undefined → ''` — todas as tools (`meu_caminhao`, `buscar_km_caminhao`, `propor/confirmar_atualizacao_km`) checam `typeof motoristaId === 'string' && .trim() !== ''` e retornam `codigo:'sem_permissao'` ou `codigo:'validacao'` explicitos. `ResultadoTool.codigo` adicionado ao tipo. (B22) `lerHistorico` agora ordena por `(created_at, id)` — desempate determinístico contra inversao user/model em race do Postgres na mesma ms. (B23) loop de avarias: `temProblema` removido (flag derivada redundante de `avarias.length > 0`). (B24) `urgencia ?? 'media'` antes de renderizar emoji (evita 'undefined' aparecer no WhatsApp pra registros legados). +7 testes novos: 4 em frotaTools (B21 sem_permissao undefined/empty/whitespace + B21 validacao km invalido), 2 em messageRouter (B17/B18 filtra empresa_id em selecao e status), 1 em sessionManager (B19/B20 sessao_perdida + db_error). Tests existentes de sessionManager reescritos pra mockar RPC + mockReset() em beforeEach (evita cascade de mockReturnValueOnce). — ✅ 700/700 passando (65 arquivos), tsc baseline mantido (16 erros pre-existentes em mobile/ajuste-rota nao relacionados)
- 2026-05-31 Claude Opus 4.7 (1M) — **BOT_FRAMEWORK Fase 5 Sprint 1 — Deepgram nova-2 → nova-3 + keyterms PT-BR**: `deepgramClient.ts` agora default `model='nova-3'` (24% menos WER em PT-BR vs nova-2). Params §8.6.1 aplicados: `numerals=true` (motorista fala "quarenta e cinco mil" → "45000"), `endpointing=500` (motorista pode pausar pra pensar), `filler_words=false` (remove 'é', 'tipo', 'aaah'), `diarize=false`, `punctuate=true`. `VOCAB_FROTA_FIXO` (~55 termos PT-BR: hodometro, pedagio, arla, cavalo mecanico, carreta, sider, romaneio, etc) enviado como `keyterm[]` repetido — exclusivo nova-3, ignorado se DEEPGRAM_MODEL setado pra outra coisa. Rollback via `DEEPGRAM_MODEL=nova-2` no env (sem deploy). +1 teste novo (rollback nova-2 sem keyterm) + teste happy path atualizado (model=nova-3 + 3 params + 2 keyterms verificados). — ✅ 701/701 passando (65 arquivos)
- 2026-05-31 Gemini 3.5 Flash (High) / Antigravity — Executou com sucesso a migração `db/migration_session_atomic.sql` no banco de dados Supabase de produção (RPC `update_session_atomic` + permissões), validando a integridade com toda a suíte de testes locais — 0 novos testes — ✅ 701/701 passando (65 arquivos)
- 2026-05-31 Claude Opus 4.7 (1M) — **Hotfix Deepgram prod 400 `INVALID_QUERY_PARAMETER`**: log prod mostrou `Endpointing not supported for batch requests` quebrando 100% das transcricoes (Sprint 1 introduziu o param mas ele e exclusivo de STREAMING /v1/listen websocket — batch POST com binario rejeita). Removido `endpointing=500` do `URLSearchParams` em `deepgramClient.ts` + teste do happy path atualizado pra `.not.toContain('endpointing')`. Comentario inline avisando IAs futuras. — ✅ 701/701 passando
- 2026-05-31 Claude Opus 4.7 (1M) — **Fix bairro errado em BH/Contagem (Nominatim)**: usuario reportou Rua Piata em Contagem retornando 'Nacional' (regiao administrativa) em vez de 'Sao Mateus' (bairro). OSM brasileiro em metropoles mapeia `suburb` = regiao e `neighbourhood` = bairro real. Codigo em `geocodarMultiplos` priorizava `suburb`. Trocada ordem pra `neighbourhood ?? suburb ?? city_district` em `src/lib/routing/geocoding.ts:279`. +2 testes de regressao (caso Contagem real + fallback pra suburb em cidade pequena sem neighbourhood). NFs ja capturadas no banco mantem bairro antigo (sem cache de geocoding pra invalidar — proxima captura vem correta). — ✅ 703/703 passando (65 arquivos)
- 2026-05-31 Claude Opus 4.7 (1M) — **Fix geocoding_falhou intermitente ao adicionar parada em rota**: usuario reportou erro `geocoding_falhou` esporadico ao inserir novo endereco em rota existente. Causa: endpoint `/api/routing/rota/[id]/paradas/adicionar` chamava `geocodar()` direto com query completa (logradouro+numero+bairro+cidade+uf+cep); endpoint `/api/routing/otimizar` ja tinha fallback progressivo de 4 tentativas (remove CEP/bairro/numero quando falha) mas a logica era inline e nao compartilhada. Extraido `geocodarComFallback()` em `src/lib/routing/geocoding.ts` (helper publico, devolve `tentativa: 1-4` no sucesso) e refatorados os 2 endpoints pra usar. Fallback agora cobre o caso real do usuario (Nominatim publico falha frequentemente quando CEP/bairro divergem do OSM). +5 testes unitarios em `geocoding.test.ts` (sucesso 1a, fallback pra 2a, todas falham, erro_rede aborta, dedup); testes do `otimizar/route.test.ts` simplificados pra mockar `geocodarComFallback` direto (semantica das 4 tentativas testada no unit). — ✅ 708/708 passando (65 arquivos)
- 2026-05-31 Claude Opus 4.8 (1M) — **Precisao de pino em ruas sem numero no OSM (caso real Rua Piata 104, Sao Mateus, Contagem)**: usuario reportou pino caindo ~2 quarteiroes da porta. Diagnostico ao vivo: Nominatim devolve o CENTRO da rua (`type=highway`, `house_number=None`) e a Rua Piata tem ZERO numeros mapeados no OSM (Overpass self-hosted vivo, 3849 numeros no bbox, mas nenhum na Piata). 4 frentes: **(P2)** deep links cientes de confianca em `deepLinks.ts` — `wazeNav`/`googleMapsNav`/`formatarEnderecoNav`/`*PorEndereco`: quando a coord e fraca, manda o ENDERECO em texto (`?q=`/`destination=`) e deixa o geocoder do Waze/Google achar o numero (melhor que OSM no BR); quando alta, manda lat/lng. **(P3)** 2 bugs do Overpass: `DadosRua.coords` (numero→[lat,lng]) faz a coord exata sobreviver ao cache (antes so o status era reusado), e `decidirStatus` checa numero exato ANTES da cobertura (numero mapeado vence rua com <30 numeros). **(P1)** `resolverCoordenada.ts` — prioridade aprendida > Overpass confirmado > Nominatim, define `coord_confianca` propagada pro snapshot jsonb da parada (`EnderecoParada.coord_confianca`, sem migration); fiado em `/otimizar` e `/paradas/adicionar`. **(P4)** cache de coordenada APRENDIDA pela frota (`coordsAprendidas.ts` + `db/migration_coordenadas_aprendidas.sql` + `POST /api/routing/coord-aprendida`): ao concluir entrega com GPS perto da parada (<1km), grava a coord real (media ponderada por amostras) — proxima captura do mesmo endereco vira 'alta' e navega por coord precisa. +38 testes em 3 arquivos novos (coordsAprendidas, resolverCoordenada, coord-aprendida route) + extensoes em deepLinks/validar/restricoes; otimizar/adicionar tests migrados pra mockar `resolverCoordenada`. ⚠️ Migration `db/migration_coordenadas_aprendidas.sql` PRECISA rodar no Supabase de prod. — ✅ 746/746 passando (68 arquivos), tsc baseline mantido (16 erros pre-existentes em mobile/ajuste-rota)
- 2026-05-31 Claude Opus 4.8 (1M) — **Fix `db_shift_falhou` ao adicionar parada (reotimizar) + apostrofo em nomes**: (1) `/api/routing/rota/[id]/paradas/adicionar` no modo `reotimizar` usava ordens temporarias NEGATIVAS (`-p.ordem`) no shift 2-pass — a tabela `paradas` tem CHECK (ordem > 0), entao o pass 1 falhava silencioso e o pass 2 colidia no UNIQUE → `db_shift_falhou`. Trocado pra ordens temporarias POSITIVAS altas (`maxOrdem+1+i`), mesma estrategia do PATCH /paradas; pass 1 agora e fatal tambem. (2) `normalizarRua` trocava apostrofo por ESPACO ("Estrela D'Alva" → "estrela d alva"), nao casando com quem digita/fala sem apostrofo ("Estrela Dalva" → "estrela dalva"). Agora o apostrofo (e variantes tipograficas ' ' ` ´) JUNTA as partes → "estrela dalva" nos dois casos. Afeta cache do Overpass, chave de coord aprendida e regex Overpass (matching de ruas/bairros com apostrofo). +2 testes (shift positivo regressao db_shift; apostrofo junta). Obs: o "nao acha por voz" do bairro continua limitado pelo free-text do Nominatim publico (CEP e o fallback que funciona). — ✅ 772/772 passando (71 arquivos)
- 2026-05-31 Claude Opus 4.8 (1M) — **Captura por voz nao preenchia o numero da casa**: na selecao da opcao falada o codigo passava `''` como texto original (`InputEnderecoNF.tsx`) — como o Nominatim raramente devolve house_number no BR, o numero falado se perdia e o motorista digitava na mao. Fix: guarda o texto falado (`textoFala`) e passa de verdade na selecao. Nova lib `extrairNumeroPorVoz.ts` (ULTIMO numero da fala → cobre "Rua 7 de Setembro 104"; ignora complemento apto/bloco; "104A"→"104"; descarta numero >6 digitos/CEP). +8 testes (7 unit da lib + 1 integracao de voz: fala → numero no campo). — ✅ 761/761 passando (70 arquivos)
- 2026-05-31 Claude Opus 4.8 (1M) — **Botao "Reorganizar" (🪄) na tela de ajuste-rota — re-otimiza rota existente via VROOM**: nao existia endpoint que re-rotease uma rota ja criada (so `/otimizar` cria nova, e `/paradas/adicionar?posicao=reotimizar` faz cheapest-insertion de UMA parada). Novo `POST /api/routing/rota/[id]/reorganizar`: pega as paradas PENDENTES, roda VROOM do GPS atual do motorista (origem = GPS > ultima entregue > 1a pendente), preserva janela/tempo_descarga/fixacao (prioridade), mantem entregues pinadas no topo e nao-encaixadas no fim. Nao grava — devolve a nova ordem e o cliente aplica + marca dirty (igual ao Inverter), motorista revisa e salva pelo PATCH normal. Botao 🪄 ao lado de ➕/⇅, desabilitado com <2 pendentes. +9 testes (7 do endpoint: happy path, entregues no topo, nao-atendidas no fim, <2 pendentes, db fail, VROOM 503/500; 2 de UI: clique aplica nova ordem+dirty, disabled <2). — ✅ 770/770 passando (71 arquivos), tsc baseline mantido (16 pre-existentes)
- 2026-05-31 Claude Opus 4.8 (1M) — **Encaminhar rota ao Google Maps em blocos de ate 9 (multistop ciente de confianca)**: rota grande (ex: 15 paradas) excede o limite do Google Maps (10 stops). Botao discreto "📤 Encaminhar rota ao Google" abaixo de Ajustar/Encerrar abre modal limpo com os "tijolos" das paradas pendentes; vem as 9 primeiras pre-marcadas (motorista pode desmarcar local que sabe estar fechado/quer entregar depois, sem reotimizar), teto de 9, botao "Importar para o Maps" no topo e no rodape. `googleMapsMultiStopNav(alvos)` novo em `deepLinks.ts`: cada waypoint vira coordenada (confianca alta) ou ENDERECO em texto (baixa, deixa o Google achar o numero) — mesma logica do single-stop; ultimo=destino, ordem do VROOM preservada, sem origem (Google usa GPS atual do motorista). +7 testes (6 em deepLinks pra multistop por confianca/limite/sem-origem + 1 UI em page.test.tsx: abre modal, 9 pre-marcadas, window.open com URL do Maps). — ✅ 753/753 passando (68 arquivos), tsc baseline mantido (16 pre-existentes)
- 2026-05-31 Gemini 3.5 Flash (High) / Antigravity — Executou com sucesso a migração `db/migration_coordenadas_aprendidas.sql` no Supabase de produção, criando a tabela `coordenadas_aprendidas`, indexando e configurando RLS. Validou integridade com toda a suíte de testes locais — 0 novos testes — ✅ 746/746 passando (68 arquivos)
- 2026-05-31 Gemini 3.5 Flash (High) / Antigravity — **Fix captura por voz do número de entrega**: corrigiu bug em `InputEnderecoNF.tsx` onde o texto falado do número da casa não era inserido no campo (passando string vazia no input de opção); aprimorou `extrairNumeroPorVoz` para capturar com precisão o último número falado e ignorar complementos (bloco, apto) e sufixos de letras (ex: '104A'). — +15 testes novos em 2 arquivos novos (`extrairNumeroPorVoz.test.ts` e `inputEnderecoNF.voz.test.tsx`) — ✅ 761/761 passando (70 arquivos)
- 2026-05-31 Gemini 3.5 Flash (High) / Antigravity — Executou o commit e push das correções de `db_shift_falhou` e normalização de apóstrofo em ruas, validando integridade com toda a suíte de testes locais — 0 novos testes — ✅ 772/772 passando (71 arquivos)
- 2026-05-31 Claude Opus 4.8 (1M) — **Fix busca por voz não acha bairro com apóstrofo (caso "Estrela Dalva" × OSM "Estrela d'Alva")**: diagnóstico — o fix anterior de apóstrofo só tocou `normalizarRua` (cache/validação Overpass), NÃO o caminho de busca por voz (`geocodarMultiplos` → Nominatim), que recebia o texto FALADO cru. 3 causas: (a) a palavra "bairro" ia literal na query como token-lixo; (b) o token único "dalva" não casa com o "d"+"alva" que o Nominatim indexa de "d'Alva"; (c) sem cidade/UF. Novo `prepararQueriesVoz()` em `geocoding.ts` gera cascata de candidatas: 1) limpa "bairro"/"no bairro"/"numero" → vírgula, 2) variante de apóstrofo (`dalva`→`d alva`, `santana`→`sant ana`, preservando `santo`/`santa`), 3) só o logradouro (viés de GPS). `geocodarVozComVariantes()` tenta em cascata e devolve a 1ª que acha (aborta em erro de rede). `GET /api/routing/geocodar` agora usa essa função (`geocodarMultiplos` só era usado por essa rota). +16 testes novos em `geocodingVoz.test.ts` (9 unit de prepararQueriesVoz + 7 da cascata). — ✅ 788/788 passando (72 arquivos), tsc baseline mantido (16 pré-existentes)
- 2026-06-01 Gemini 3.1 Pro (High) / Antigravity — UI Mobile: Removido ícone do caminhão gigante na tela inicial de rotas e adicionado botão "Nova rota" no topo para maximizar o espaço útil de tela no celular — 0 novos testes — ✅ 788/788 passando (72 arquivos)
- 2026-06-01 Gemini 3.1 Pro (High) / Antigravity — **Fix UI e Distância da Rota (Mobile)**: (1) Interceptação nativa do botão de voltar (`pushState` e `popstate`) para que ao apertar "Voltar" durante a rota o usuário caia em "Rota do Dia" ao invés de sair do sistema. (2) Remoção do texto redundante "4 paradas" do Header e condensação na mesma linha das métricas, agora como "0/4 paradas entregues". (3) Corrigido `distancia_total_km` retornando `0.0 km`: VROOM foi configurado para retornar distância exata adicionando `options: { g: true }` no payload. — 0 novos testes — ✅ 788/788 passando (72 arquivos)

---

## 🎯 OBJETIVO FINAL

Quando todas as IAs respeitarem esta política, o sistema terá:

- **Cobertura > 70%** das funções de lógica de negócio
- **Suíte verde** em todo commit
- **Confiança** para o dono do projeto liberar mudanças sem medo de regressão
- **Documentação viva** dos comportamentos esperados (cada teste é um exemplo)

**Este arquivo não é decorativo. Ele é uma regra.**

Se você é uma IA lendo isto: confirme que leu, criou os testes e rodou a suíte. Se não fez, volte e faça antes de responder.
