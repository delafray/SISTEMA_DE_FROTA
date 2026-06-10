# 🔍 Auditoria Completa do Sistema — 2026-06-10

> **Quem fez:** Claude Opus 4.8 (modo /goal), rodando na nuvem, só com o código do
> repositório (sem acesso ao banco de produção nem às env vars).
> **Branch:** `audit/2026-06-10` — cada correção foi commitada e enviada (push) na hora.
> **Foco:** Empresa 1 (transportadora) — fluxo Pedido → Despacho → Roteirização (VROOM)
> → POD → app do motorista — mais o bot do WhatsApp e o financeiro.
> **Exclusão respeitada:** NÃO editei as telas de Pedidos (`src/app/(dashboard)/pedidos/**`)
> nem Despacho (`src/app/(dashboard)/despacho/**`) — outra rotina reescreve essas telas
> às 05:00 UTC. Achados dessas telas estão só RELATADOS abaixo.

---

## 0. Resumo de saúde (antes/depois)

| Verificação | Antes | Depois |
|---|---|---|
| `npx tsc --noEmit` (erros de tipo) | 0 | 0 |
| `npm test -- --run` | 1190/1190 ✅ | 1190/1190 ✅ |

Nenhuma correção quebrou nada. A suíte é mockada (custo de API = zero).

---

## 1. ✅ CORRIGIDO NESTA EXECUÇÃO

Todas as correções abaixo são "simples e seguras" (sem mudar comportamento de
negócio), e cada uma manteve `tsc` e os testes 100% verdes.

### 1.1 `maxDuration` faltando em rotas que fazem trabalho lento

**O que era:** No Next.js/Vercel, uma rota de API sem `export const maxDuration`
é morta pelo servidor depois de poucos segundos (10s no plano Hobby). Várias
rotas que fazem trabalho lento (roteirização VROOM, geocoding de endereço) não
tinham esse ajuste — em rotas grandes ou endereços difíceis, elas podiam morrer
no meio e o usuário via "erro" sem motivo claro.

**O que ficou:** adicionei `export const maxDuration` (com comentário explicando)
nas rotas:

| Arquivo | Valor | Por quê |
|---|---|---|
| `src/app/api/routing/rota/[id]/reorganizar/route.ts` | 60 | roda o VROOM (timeout interno 30s) |
| `src/app/api/routing/rota/[id]/paradas/adicionar/route.ts` | 60 | geocoding (Nominatim ~1,1s/req) |
| `src/app/api/routing/rota/[id]/paradas/route.ts` | 30 | reordenação faz vários UPDATE em sequência |
| `src/app/api/routing/validar-endereco/route.ts` | 30 | geocoding em cascata |
| `src/app/api/whatsapp/reconectar/route.ts` | 30 | vários chamados à Evolution + espera |

> Referência: o endpoint principal `/api/routing/otimizar` já usava `maxDuration=300`
> e o webhook do WhatsApp já usava `120` — agora as rotas "irmãs" estão alinhadas.

**Commits:** `audit: maxDuration em rotas lentas de routing...` e
`audit: maxDuration em validar-endereco (geocoding) e reconectar...`.

### 1.2 Chamadas à Evolution API sem timeout (podiam pendurar a função)

**O que era:** as funções que baixam mídia do WhatsApp
(`getMediaAsBase64DataUrl` e `getMediaUrl` em `src/lib/whatsapp/messageParser.ts`)
e o helper `evoFetch` em `reconectar/route.ts` faziam `fetch()` na Evolution API
**sem AbortController/timeout**. Se a Evolution travasse, a chamada ficava pendurada
até o servidor matar a função inteira — e isso roda no caminho quente do webhook
(que tem só 120s de orçamento total). O resto do código (envio de mensagem em
`messageSender.ts`) já usava timeout; essas três eram a exceção.

**O que ficou:** envolvi cada `fetch` num `AbortController` com timeout
(15s para mídia, 12s para o reconectar) e um `finally { clearTimeout }`, no mesmo
padrão que já existia em `messageSender.ts`. Em caso de timeout, loga e retorna
`null`/erro tratado em vez de pendurar.

**Commit:** `audit: ... + timeouts nos fetch da Evolution`.

---

## 2. 🧭 DECISÕES PARA O DONO (não mexi — precisam da sua palavra)

> Aqui estão as coisas que **mudam comportamento, banco ou produto** — por regra,
> eu não toco nisso sozinho. Cada item tem: o que é (em linguagem simples), as
> opções, e minha recomendação.

### D1. Os "tipos do banco" (`database.types.ts`) estão desatualizados

**O que é (simples):** existe um arquivo que descreve, em código, como são as
tabelas do banco — ele serve para o editor avisar erros antes de rodar. Esse
arquivo está **velho**: faltam 4 tabelas inteiras (`pod`, `rotas`,
`rotas_otimizadas`, `notas_capturadas`) e várias colunas novas de `pedidos` e
`entregas` (modo, tamanho, cliente_id, latitude, longitude, sequencia,
geocode_status, origem_demanda, executor_tipo, pedido_pai_id, etc.).

**Isso causa bug hoje?** Não. O código que mexe nessas tabelas já contorna isso
usando um "cliente sem tipos" (e tem comentário explicando). Funciona, mas o
editor não te protege de erros de digitação de coluna nessas tabelas.

**Por que não corrigi:** regenerar esse arquivo exige uma **credencial do banco**
que eu não tenho na nuvem (`npx supabase gen types ... --project-id ...`).

**Opções:**
- (a) Você (ou outra IA com a credencial) roda o comando de regenerar — 1 minuto.
- (b) Deixar como está (funciona, só perde a proteção do editor).

**Recomendação:** (a), quando puder. É barato e devolve a rede de segurança do
editor. Comando: `npx supabase gen types typescript --project-id <ID> > src/types/database.types.ts`.

### D2. Status gravados em dois gêneros no banco (agendado/agendada, concluido/concluida)

**O que é (simples):** o sistema às vezes grava o status de um pedido/entrega no
masculino (`agendado`, `concluido`, `cancelado`) e às vezes no feminino
(`agendada`, `concluida`, `cancelada`). O código hoje "se defende" disso checando
os dois gêneros em vários lugares — então **não quebra**, mas é uma bomba-relógio:
qualquer lugar novo que esquecer de checar os dois vai mostrar status errado ou
filtrar errado. Exemplos do espalhamento:
- `src/app/api/pod/route.ts` grava `concluido` (masculino) na entrega.
- `src/app/(motorista)/motorista/entregas/[id]/page.tsx` só conhece o masculino.
- `src/app/(motorista)/motorista/pedidos/[id]/page.tsx` só conhece o feminino.
- `src/lib/routing/geocodarEntregasPedido.ts` e `src/app/(dashboard)/entregas/page.tsx`
  checam os DOIS por segurança.

**Por que não corrigi:** a correção certa é uma **migração de dados** (padronizar
o banco num gênero só) + ajustar o código — isso mexe em produção e muda dados,
o que é nível-de-decisão e não posso rodar contra o banco daqui.

**Opções:**
- (a) Padronizar tudo num gênero (recomendo o **feminino** para `pedidos`/`entregas`
  porque a constraint `viagens_status_check` já foi corrigida para `agendada` no
  commit `2d5d130`, e a tela de pedidos do motorista já usa feminino) — via migração
  `UPDATE` + ajuste do código. Eu posso preparar o `.sql` e o diff sem rodar.
- (b) Manter a checagem dupla por enquanto e padronizar quando sobrar tempo.

**Recomendação:** (a), mas **só depois** que a rotina das 05:00 reescrever
Pedidos/Despacho (para não conflitar). Posso entregar a migração `.sql` + o diff
prontos numa próxima sessão. Risco de continuar como está: médio (bug silencioso
de status conforme a operação cresce).

### D3. Dois mecanismos de dedupe (anti-duplicata) por wamid

**O que é (simples):** quando o WhatsApp reenvia a mesma mensagem (acontece
quando o webhook demora), o sistema evita processar duas vezes guardando o "id da
mensagem" (`wamid`). Hoje existem **duas implementações quase idênticas** disso:
`src/lib/whatsapp/dedupe.ts` (caminho clássico) e uma cópia dentro de
`src/lib/whatsapp/classificadorBot.ts` (caminho novo, do classificador Gemini).
Elas usam a mesma tabela (`bot_msgs_processadas`) e a mesma janela de 2 minutos.

**Isso causa bug hoje?** Não — as duas **nunca rodam ao mesmo tempo** (uma é
escolhida pela flag `MODO_CLASSIFICADOR`). O próprio `dedupe.ts` já tem um
comentário dizendo "consolidar as duas é item da auditoria". É código duplicado,
risco de manutenção (mexer numa e esquecer a outra), não um bug ativo.

**Opções:**
- (a) Consolidar numa função única compartilhada (refatoração média).
- (b) Deixar como está (funciona).

**Recomendação:** (a) numa sessão dedicada, com testes antes/depois. Não fiz agora
porque é refatoração de caminho crítico (idempotência do bot) e, sob pressão de
cota, prefiro não arriscar o caminho que protege contra registro duplicado de
abastecimento/lembrete. Baixa urgência.

### D4. Modo B (frete por voz/texto/foto) ainda não está ligado

**O que é (simples):** existe uma função pronta e testada,
`extrairPedidoFrete()` em `src/services/aiService.ts` (linha ~329), que lê uma
foto de documento de frete e extrai cliente/valor/origem/destino. Mas **nenhum
código de produção a chama ainda**. Os dois pontos onde ela entraria só mostram
um texto "em breve":
- `src/lib/whatsapp/flows/gestorFlow.ts`, caso `'cadastrar_pedido'` (~linha 121).
- `src/lib/whatsapp/messageRouter.ts`, tipo `'documento_pedido_frete'` (~linha 745).

**Isso é bug?** Não — é o **Passo 5** do plano `docs/empresa01.md`, ainda não
implementado. Está corretamente como placeholder.

**Recomendação:** implementar quando você priorizar o Modo B, seguindo o padrão
**propor → confirmar** (o bot mostra o que extraiu e pede "confirma?") já descrito
no plano. É trabalho de feature, não de auditoria.

### D5. Funções de roteirização "órfãs" — são andaime do futuro, NÃO lixo

**O que é (simples):** três funções em `src/lib/routing/` não são usadas pelo
fluxo de produção hoje, mas **têm testes** e claramente preparam recursos futuros
(janelas de horário/VRPTW e divisão multi-caminhão das empresas 2-4):
`aplicarPreferenciaCliente` e `aplicarFixacao` (em `restricoes.ts`) e
`dividirParaMultiStop` (em `deepLinks.ts`).

**Recomendação:** **manter**. Apesar de "não usadas", são andaime intencional do
roadmap (o próprio objetivo secundário da auditoria é "deixar pronto para as
empresas 2-4 sem retrabalho"). Apagá-las seria contra esse objetivo. Não mexi.

---

## 3. 📋 ACHADOS NAS TELAS DE PEDIDOS/DESPACHO (somente relato — não editei)

> Estas telas serão reescritas pela rotina das 05:00. Registro aqui para que o
> redesign não perca esses pontos.

- **`src/app/(dashboard)/pedidos/[id]/page.tsx`** usa as colunas novas `sequencia`
  e `geocode_status` de `entregas` (linhas ~102-103, 184-185) — confirmam que a
  integração Pedido⇄Rota (Passo 2/3) já está parcialmente fiada nessa tela. O
  redesign precisa preservar isso.
- **Status com dois gêneros** (ver D2) aparece nestas telas também — o redesign é
  a oportunidade perfeita para padronizar num gênero só.
- Cast duplo `as unknown as Tipo` aparece nas páginas do motorista
  (`motorista/entregas/[id]` e `motorista/pedidos/[id]`) — é defensivo contra os
  tipos desatualizados (D1); some sozinho quando o D1 for resolvido. Não é bug.

---

## 4. 🗄️ BANCO vs CÓDIGO (meta: implantar do zero num cliente novo)

**Boa notícia:** não encontrei nenhuma coluna/tabela usada no código que não
exista em algum `db/*.sql`. Para um deploy do zero, rodar os dois arquivos cobre
o módulo de logística:
- `db/schema_routing_completo.sql` → cria `notas_capturadas`, `rotas_otimizadas`,
  `paradas`, `locais_carregamento`.
- `db/migration_empresa01_logistica.sql` → cria `rotas`, `pod` e adiciona todas as
  colunas novas de `pedidos`/`entregas` + `pedido_id`/`entrega_id` nas tabelas de rota.

**Ressalva (não-bug):** o único descompasso é o `database.types.ts` (item D1), que
é só o "espelho em TypeScript" — não afeta o deploy do banco, só a experiência do
editor. Recomendo, para a meta de implantação, manter um doc curto listando a
**ordem** de execução dos `.sql` (hoje há `db/PROMPT_outra_ia_rodar_migration.md`
e `framework/03-deploy/implantacao-cliente.md`; vale conferir se ambos `.sql` de
logística estão citados lá).

---

## 5. 🧪 TESTES E COBERTURA

- Suíte atual: **1190 testes, 110 arquivos, todos verdes**, ~47s, custo zero.
- `TESTING.md` lista flows do WhatsApp ainda **sem cobertura** (Abastecimento, Km,
  Despesa, Viagem/Pedido, Gestor, Adiantamento, Checklist, Imprevisto) e cálculos
  (status veículo, km_final ≥ km_inicial, diária do motorista, views
  `pedidos_com_resultado` / `veiculos_resultado_periodo`). Política do dono: testes
  **recomendados, não obrigatórios** — não criei testes novos nesta auditoria
  porque as correções foram aditivas (só `maxDuration` e `AbortController`) e não
  alteram lógica testável de negócio.

---

## 6. 🚦 SAÚDE GERAL — riscos remanescentes por prioridade

| # | Risco | Gravidade | Ação recomendada |
|---|---|---|---|
| 1 | Status em dois gêneros no banco (D2) | Média (bug silencioso futuro) | Migração de padronização + ajuste de código, **após** o redesign das 05:00 |
| 2 | `database.types.ts` desatualizado (D1) | Baixa (perde proteção do editor) | Regenerar com a credencial (1 min) |
| 3 | Dedupe duplicado (D3) | Baixa (dívida de manutenção) | Consolidar numa sessão dedicada com testes |
| 4 | Modo B não ligado (D4) | Nenhuma (feature pendente) | Implementar Passo 5 quando priorizar |

Nenhum risco **crítico/ativo** encontrado no fluxo Empresa 1 nem no bot. O que era
"simples e seguro" (timeouts e `maxDuration`) já foi corrigido e enviado.

---

## 📝 Resumo em 10 linhas (para leitura de manhã)

1. Fiz uma varredura do sistema todo com foco na Empresa 1 (transportadora) e no bot do WhatsApp.
2. O sistema está **saudável**: 1190 testes passam e a checagem de tipos está limpa, antes e depois.
3. Corrigi coisas pequenas e seguras: rotas lentas que podiam "morrer" antes da hora ganharam mais tempo (`maxDuration`).
4. Corrigi três chamadas ao WhatsApp que não tinham "tempo-limite" e podiam travar a função inteira.
5. Cada correção foi testada e enviada na hora para o branch `audit/2026-06-10` (nada acumulado).
6. NÃO mexi nas telas de Pedidos e Despacho, porque outra rotina vai reescrevê-las hoje às 05:00.
7. Achei 1 ponto que merece atenção: o status às vezes é gravado no masculino, às vezes no feminino — hoje não quebra, mas vale padronizar.
8. Os "tipos do banco" estão velhos (faltam tabelas novas); não dá para atualizar daqui (precisa de senha do banco) — é rápido quando você puder.
9. O Modo B (criar frete por foto/voz no WhatsApp) está pronto na cozinha mas ainda não ligado ao salão — é uma feature futura, não um defeito.
10. O banco cobre uma instalação do zero (todos os `.sql` existem); nada usado no código está faltando no schema.
