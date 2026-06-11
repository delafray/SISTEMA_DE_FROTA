# 📱 PLANO — ZAP DO GESTOR LEIGO (regras de consulta)

> **Status: ANOTADO 11/06/2026 — aguardando validação do dono antes de codar.**
> Persona: dono de frota leigo em TI (não usa Uber). Ele PERGUNTA no zap (texto ou áudio,
> do jeito dele) e o sistema responde MASTIGADO — sem jargão, sem nome de tabela, sem menu.
> Regra de ouro: tudo aqui tem de funcionar por áudio. Conflito entre regras = proibido;
> ambiguidade real → o bot pergunta com opções numeradas (desambiguação nativa: "1️⃣ quem
> está com o caminhão · 2️⃣ já iniciou a rota · 3️⃣ onde ele está").

## O dia do gestor → as perguntas que o sistema TEM de responder

| Momento | Pergunta do gestor (como ele fala) | Regra |
|---|---|---|
| Manhã | "o que tem pra hoje?" / "tem pedido parado?" | R3 Pedidos em Aberto |
| Manhã | "todo mundo saiu?" / "o leão já saiu?" | R1 Andamento das Rotas |
| Dia | "como tá a rota do zé?" / "já fez entrega?" | R1 Andamento das Rotas |
| Dia | "onde tá o leão?" | R6 Onde Está |
| Dia | "quebrou alguma coisa?" | (já existe: Consultar Avarias) |
| Tarde | "entregou tudo?" / "o que falta entregar?" | R2 Entregas do Dia |
| Noite | "como foi o dia?" / "me dá o resumo" | R4 Resumo do Dia |
| Semana | "tem documento vencendo?" / "CNH do zé tá ok?" | R5 Vencimentos |
| Semana | "quanto gastei de diesel?" | (já existe: Consultar Abastecimentos — ganha soma/período no escritor genérico) |
| Sempre | "o que eu te falei pra anotar?" | R7 Meus Lembretes |
| Sempre | "quem tá com o touro?" / "caminhão parado?" | (já existe: Status da Frota ✅ corrigida 11/06) |

## As 7 regras novas

### R1 — Andamento das Rotas ⭐ (a que o dono pediu como exemplo)
- **Responde:** o caminhão/motorista saiu? A rota foi roteirizada? Iniciou (navegação aberta)? Quantas entregas feitas de quantas? Última entrega às HH:MM. Não fez a primeira mas está em rota → diz isso.
- **Gatilhos:** "já saiu", "começou a rota", "iniciou a rota", "como tá a rota", "andamento da rota", "já fez entrega"
- **Resposta-modelo:**
  `🚛 Leão (Zé) — EM ROTA desde 07:42`
  `Entregas: 4 de 11 feitas · última 10:15 (Mercadão)`
  `🚛 Touro (Carlos) — rota pronta, AINDA NÃO SAIU`
- **Fontes:** `rotas_otimizadas` + `paradas` (execução), `pedidos` + `entregas` (status), alocação aberta (motorista). Verificar na implementação os campos exatos de fase/início usados pela FaseEmRota do mobile.
- **Dedicada:** `consulta_dedicada: "andamento_rotas"`

### R2 — Entregas do Dia
- **Responde:** entregas de hoje por situação; o que falta, com cliente; atrasadas (se houver hora prevista).
- **Gatilhos:** "entregou tudo", "falta entregar", "entregas de hoje", "quantas entregas"
- **Resposta-modelo:** `📦 Hoje: 23 de 30 entregues · 7 faltando` + lista curta dos pendentes (cliente — caminhão).
- **Fontes:** `entregas` (+ `pedidos`, `clientes`).
- **Dedicada:** `"entregas_dia"`

### R3 — Pedidos em Aberto
- **Responde:** pedidos sem despacho / despachados não concluídos; novos de hoje.
- **Gatilhos:** "pedido parado", "pedidos em aberto", "o que tem pra despachar", "pedidos de hoje"
- **Resposta-modelo:** `📋 3 pedidos pra despachar: #128 Mercadão · #129 Atacadão · #130 avulso` 
- **Fontes:** `pedidos` (status), `clientes`.
- **Dedicada:** `"pedidos_abertos"`

### R4 — Resumo do Dia ⭐ (a mais valiosa pro leigo: UMA pergunta, foto inteira)
- **Responde:** caminhões que rodaram / parados, entregas X de Y, pedidos novos, avarias abertas, diesel do dia.
- **Gatilhos:** "resumo", "como foi o dia", "como estamos", "situação geral"
- **Resposta-modelo:**
  `📊 Hoje (11/06):`
  `🚛 4 rodando · 1 manutenção · 5 parados`
  `📦 Entregas: 23/30 · 📋 2 pedidos novos`
  `🔧 1 avaria aberta (Touro — urgente)`
  `⛽ Diesel: R$ 1.840 (3 abastecimentos)`
- **Fontes:** agregação de `alocacoes`, `entregas`, `pedidos`, `avarias`, `abastecimentos`.
- **Dedicada:** `"resumo_dia"`

### R5 — Vencimentos (documentos e revisões)
- **Responde:** o que vence nos próximos 30 dias: IPVA, licenciamento, seguro, revisão (data e km) por caminhão; CNH por motorista.
- **Gatilhos:** "documento vencendo", "ipva", "licenciamento", "seguro do", "cnh do", "o que vence"
- **Resposta-modelo:** `⚠️ Vencendo: IPVA do Leão (20/06) · CNH do Zé (02/07) · Revisão do Touro (faltam 800 km)` / `✅ Nada vencendo nos próximos 30 dias.`
- **Fontes:** `veiculos` (ipva_vencimento, licenciamento_vencimento, seguro_vencimento, data/km_proxima_revisao), `motoristas` (validade CNH — confirmar coluna).
- **Dedicada:** `"vencimentos"` — *é o gêmeo de consulta do cron de alertas (dívida #1): mesma lógica, o cron empurra pro painel, a regra responde quando ele pergunta.*

### R6 — Onde Está o Caminhão
- **Responde (fase 1, sem GPS):** última posição CONHECIDA = última entrega concluída (hora + cliente/bairro) + situação da rota. Sempre com a ressalva "posição da última entrega".
- **Resposta-modelo:** `📍 Leão: última entrega 14:32 no Mercadão (Centro). Em rota — 4 entregas pela frente.`
- **Gatilhos:** "onde está", "onde tá", "cadê o", "por onde anda"
- **Fase 2:** quando entrar o rastreador terceirizado via token (dívida #5), a MESMA regra passa a responder posição real. Regra não muda — muda a fonte.
- **Dedicada:** `"onde_esta"`

### R7 — Meus Lembretes
- **Responde:** os últimos lembretes anotados e não resolvidos ("o que eu te pedi pra anotar?").
- **Gatilhos:** "meus lembretes", "o que tem anotado", "o que anotei", "lê os lembretes"
- **Resposta-modelo:** `📝 5 anotações pendentes: 1. Fechei com o Mercadão... (ontem 18:40) · 2. ...`
- **Fontes:** `lembretes`.
- **Negativas críticas:** "anota", "me lembra" (isso é CRIAR lembrete, regra fixa). Gatilho_inicio talvez.
- **Dedicada:** `"meus_lembretes"`

## Arquitetura anti-conflito (obrigatória)

1. **Mapa de vizinhança**: cada regra nova nasce com `frases_negativas` apontando as vizinhas
   (ex: R1 nega "quem está com o leão" → Status da Frota; Status da Frota nega "já saiu" → R1;
   R7 nega "anota aí" → Lembrete). Tabela completa de colisões montada ANTES de gravar.
2. **Ambiguidade legítima** ("como tá o leão?" pode ser status, rota ou posição) → NÃO forçar:
   deixa a desambiguação nativa perguntar com números (1/2/3) — comportamento que o dono aprovou.
3. **Teste de mesa**: antes de entregar, rodar as frases-exemplo de TODAS as regras umas contra
   as outras (matriz de treino × regras) e eliminar roubo de mensagem.

## Execução técnica (padrão consultarStatusFrota, que já funciona)

- `escopo_dados.consulta_dedicada: "<chave>"` na regra → `switch` no botExecutor chama o leitor
  dedicado (join/agregação determinística, formatação leiga, filtro empresa, LIMIT).
- Leitores novos: `andamento_rotas`, `entregas_dia`, `pedidos_abertos`, `resumo_dia`,
  `vencimentos`, `onde_esta`, `meus_lembretes` (cada um ~40-80 linhas + testes).
- Regras gravadas via REST (como em 11/06) com gatilhos/frases/negativas/observação.
- Tudo atrás do fluxo atual: classificador → 1 regra executa · 2+ desambigua · 0 vira lembrete.

## Ordem de construção sugerida

1. R1 Andamento das Rotas (pedido explícito do dono) → 2. R4 Resumo do Dia → 3. R2 Entregas
do Dia → 4. R3 Pedidos em Aberto → 5. R5 Vencimentos → 6. R7 Meus Lembretes → 7. R6 Onde Está.
Depois de cada uma: matriz anti-conflito + suíte verde.
