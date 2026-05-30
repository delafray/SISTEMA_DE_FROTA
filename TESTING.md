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

---

## 🎯 OBJETIVO FINAL

Quando todas as IAs respeitarem esta política, o sistema terá:

- **Cobertura > 70%** das funções de lógica de negócio
- **Suíte verde** em todo commit
- **Confiança** para o dono do projeto liberar mudanças sem medo de regressão
- **Documentação viva** dos comportamentos esperados (cada teste é um exemplo)

**Este arquivo não é decorativo. Ele é uma regra.**

Se você é uma IA lendo isto: confirme que leu, criou os testes e rodou a suíte. Se não fez, volte e faça antes de responder.
