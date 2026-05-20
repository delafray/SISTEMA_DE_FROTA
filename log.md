# 🔍 Análise das Análises — Plano de Ação Consolidado

> ## ⚠️ LEIA ANTES DE TUDO — REGRA DE TESTES OBRIGATÓRIA
>
> **Este projeto exige testes em TODA alteração.** Política completa em **`TESTING.md`**.
>
> Para qualquer IA lendo este plano e propondo/executando mudanças:
>
> 1. Crie testes (vitest) para cada item do plano antes de declará-lo "concluído".
> 2. Rode `npm test` ao fim de cada ciclo. **Todos os testes devem passar.**
> 3. Reporte ao usuário: testes passando, novos testes criados, cobertura.
> 4. Anexe sua execução no "Log de Execução" no final de `TESTING.md`.
>
> **Sem testes = trabalho não concluído.** O dono do projeto rejeita entregas sem testes — está cansado de IAs que prometem e não testam. Não seja mais uma.

---

**Modelo coordenador:** Claude Opus 4.7 (1M context)
**Data:** 2026-05-20
**Método:** 5 agentes independentes (Auditor Técnico, Mapeador de Consenso, Crítico de Soluções, Detector de Pontos Cegos, Advogado do Gestor Leigo) revisaram em paralelo o conteúdo de `logistica.md` (8 análises de IAs diferentes).

**Para as outras IAs que vão ler isto:** este arquivo é **debate aberto**. Contestem, corrijam, refinem. O objetivo é o melhor sistema, não o melhor relatório.

---

## 📊 Resumo Executivo

| Item | Conclusão |
|---|---|
| **IAs avaliadas** | 8 (Antigravity/Gemini 3.5 Flash, Opus 4.6 Thinking, Sonnet 4.6 Thinking, Opus 4.7, Gemini 3.1 Pro, Haiku 4.5, Sonnet 4.6 curta, Gemini 3.5 Flash) |
| **Afirmações factuais verificadas** | 11/12 confirmadas no código (92%) |
| **Consensos fortes** | 14 pontos onde 6+ IAs concordam |
| **Divergências identificadas** | 6 (algumas relevantes, outras de framing) |
| **Pontos cegos coletivos** | 5 omissões críticas que NENHUMA IA viu |
| **Nota consolidada honesta** | **6.5 a 7.0 / 10** — sistema usável hoje, faltam 3 travas |

---

## ⚖️ Parte 1 — CONTESTAÇÕES (onde as outras IAs erraram ou divergem)

### Contestação 1: "Status do veículo: derivado é bom ou ruim?"

**Posição A** (Antigravity, Opus 4.6 Thinking, Sonnet 4.6 Thinking, Gemini 3.1 Pro): Status derivado é **excelente arquitetura**, evita inconsistência.

**Posição B** (Opus 4.7, Haiku 4.5, Sonnet 4.6, Gemini 3.5 Flash): Falta enum estático, sistema "não sabe" estado do caminhão.

**Veredito:** **Ambas estão parcialmente certas, mas falando de coisas diferentes.**

- O **banco** não tem coluna `veiculos.status` — confirmado em `database.types.ts` (só `ativo: boolean`). Status real é derivado de `viagens.status` e `manutencoes.status`. **Isso É bom design** (impede dessincronização).
- **MAS** o código de validação (`checkVeiculoOcupado` em `viagens/novo/page.tsx:115-130`) NÃO consulta `manutencoes`. **Esse é o problema real**, não a ausência do enum.

**Conclusão:** A solução correta NÃO é adicionar `veiculos.status` enum (introduz risco de dessincronização). A solução é **ensinar o código a consultar o status derivado completo** + criar **trigger PostgreSQL** que bloqueia INSERT em viagens quando há manutenção ativa.

→ **Eu (Opus 4.7) recuo da minha proposta original** de enum estático. Aceito a posição A com a ressalva de B (falta trigger).

---

### Contestação 2: "Notas finais variam de 4/10 a 7.3/10 — quem está mais perto?"

| Modelo | Nota | Veredito do consolidado |
|---|---|---|
| Sonnet 4.6 (curta, minha) | 4/10 | ❌ **Severa demais** — sistema é usável no dia 1 |
| Opus 4.7 (minha 1ª) | 5.0/10 (lógica) | ⚠️ **Pessimista** — boa identificação do "elástico solto" mas descontou demais |
| Haiku 4.5 (minha) | 6.5/10 | ✅ **Pragmática** |
| Sonnet 4.6 Thinking | 7.3/10 | ✅ **Equilibrada** |
| Opus 4.6 Thinking | 7.2/10 | ✅ **Equilibrada** |
| Antigravity, Gemini Pro, Gemini Flash | Sem nota | — |

**Nota honesta consolidada: 6.5–7.0 / 10.** As IAs com "thinking" (mais reflexivas) deram notas mais altas porque consideraram a robustez do banco. As IAs mais curtas focaram nos gaps. Verdade: **base 8.5/10, lógica de negócio 5/10**, média ponderada 7.0.

→ **Eu (Opus 4.7) corrijo minha nota inicial** de 5.0/10 para 6.8/10. O peso do que JÁ funciona (banco + WhatsApp + acerto mensal) é maior do que o peso dos gaps operacionais.

---

### Contestação 3: "Número de flows WhatsApp"

- **Opus 4.7 e Haiku 4.5** (minhas) disseram: 8 flows.
- **Opus 4.6 Thinking, Sonnet 4.6 Thinking, Sonnet 4.6, Gemini Pro, Gemini Flash**: 9 flows.

**Veredito:** **9 flows.** Confirmado em `src/lib/whatsapp/flows/`: abastecimento, adiantamento, avaria, checklist, despesa, gestor, imprevisto, km, viagem.

→ **Eu (Opus 4.7) admito o erro**: esqueci de contar o `gestorFlow.ts`.

---

### Contestação 4: "27 triggers, 5 views, 63 FKs" (Opus 4.6 Thinking)

**Verificação contra o código:**
- ✅ **5 views** confirmadas (`fretes_com_resultado`, `kpi_mensal_empresa`, `kpi_mensal_motorista`, `kpi_mensal_veiculo`, `proxima_manutencao_veiculo`).
- ⚠️ **98 FKs** (não 63) — Opus 4.6 Thinking subestimou.
- ❌ **27 triggers**: não verificável apenas pelo `database.types.ts`. Triggers existem (confirmado por menções a `trigger_propagar_km`, `trigger_frete_iniciado`, `trigger_alerta_avaria_critica`, etc.), mas a contagem exata depende de acesso ao Supabase Studio.

→ Opus 4.6 Thinking acertou a ordem de grandeza. Confiabilidade da análise dele: **alta**.

---

### Contestação 5: "Tabela `motorista_veiculo` está vazia — é crítico?"

**Opus 4.6 Thinking e Sonnet 4.6 Thinking** apontam que a tabela tem 0 registros ativos, portanto o vínculo "veículo fixo do motorista" nunca é exercido nos testes.

**Outras IAs** mencionaram a tabela mas sem perceber que está vazia.

**Veredito:** **Crítico para QA, não para produção.** Em produção o usuário vai cadastrar os vínculos. Mas para validação do fluxo de pré-seleção automática, faltam dados de seed.

→ Adicionar à pendência. **Não é P1**, mas precisa estar no plano.

---

### Contestação 6: "Soluções propostas para troca de motorista mid-trip"

**Proposta minha (Opus 4.7):** Modal com motivo + audit log.

**Proposta de 5 IAs (Antigravity, Opus 4.6, Sonnet 4.6 Thinking, Gemini Pro, Gemini Flash):** Tabela `viagem_motoristas` com snapshot de km por motorista + rateio de comissão.

**Veredito:** **As outras 5 IAs estão mais corretas.** Meu modal sozinho não resolve o rateio de comissão. Solução completa = **combinar**:

1. **UI**: botão "Trocar motorista" com modal (Opus 4.7)
2. **DB**: tabela `viagem_motoristas` com `km_inicio`, `km_fim`, `motivo`, `ativo` (Antigravity + outras)
3. **Lógica de comissão**: rateio proporcional ao km rodado de cada motorista

→ **Eu (Opus 4.7) revogo minha proposta isolada** e adoto a versão combinada.

---

## ✅ Parte 2 — CONSENSOS FORTES (validados no código)

| # | Ponto | IAs concordam | Validado? |
|---|---|---|---|
| 1 | `checkVeiculoOcupado` não consulta `manutencoes` | 8/8 | ✅ Confirmado em `viagens/novo/page.tsx:115-130` |
| 2 | Sem trigger/constraint no banco impedindo viagem com veículo em manutenção | 7/8 | ✅ Confirmado |
| 3 | `viagens/[id]/page.tsx` mostra só receita bruta, não consome `fretes_com_resultado` | 8/8 | ✅ Confirmado em linhas 187-190 |
| 4 | Custos indiretos (pneu, depreciação, IPVA, seguro rateado) não modelados | 8/8 | ✅ `veiculos` tem `valor_aquisicao` mas sem cálculo |
| 5 | `fretes.cliente_id IS NULLABLE` — frete avulso funciona | 8/8 | ✅ Confirmado |
| 6 | WhatsApp + IA Vision excelente (OCR cupom + KM + avaria) | 8/8 | ✅ 9 flows funcionais |
| 7 | Função `extrairPedidoFrete` existe mas nenhum flow a chama | 8/8 | ✅ Confirmado em `aiService.ts:329-349` |
| 8 | Troca de motorista mid-trip sem snapshot/audit | 8/8 | ✅ Apenas dropdown no edit form |
| 9 | Avaria não bloqueia/avisa seleção de veículo para nova viagem | 7/8 | ✅ Confirmado |
| 10 | Acerto mensal do motorista é o módulo mais maduro | 8/8 | ✅ |
| 11 | View `fretes_com_resultado` calcula receita, combustível, despesas, comissão, lucro, margem por frete | 8/8 | ✅ Confirmado |
| 12 | Status do frete é string livre (não enum) | — | ✅ `status: string` em `database.types.ts` |
| 13 | Falta dashboard visual "Status da Frota Agora" | 4/8 | ✅ Confirmado |
| 14 | Falta campo `cliente_avulso_nome` em fretes | 6/8 | ✅ Hoje vai pra observações |

---

## 🚨 Parte 3 — PONTOS CEGOS (que NENHUMA das 8 IAs identificou)

Esse foi o achado mais importante do Agente 4. As 8 IAs focaram em "fluxo bonito e validações lógicas" e **deixaram passar conformidade legal brasileira obrigatória**. Para um sistema TMS em 2026 operar no Brasil, esses itens NÃO são opcionais.

### 🔴 Omissão crítica 1: Conformidade fiscal e regulatória brasileira

| Item | Obrigatoriedade | Estado no sistema | Risco |
|---|---|---|---|
| **MDF-e** (Manifesto Eletrônico) | Obrigatório para transporte interestadual | ❌ Não existe | Multa ANTT + impossibilidade de circular |
| **CT-e** (Conhecimento de Transporte) | Obrigatório para frete de carga | ❌ Não existe | Receita Federal autua |
| **CIOT** (Código Identificador da Operação de Transporte) | Obrigatório para transportador autônomo | ❌ Não existe | Multa por autônomo sem CIOT |
| **RNTRC** (Registro Nacional de Transportador) | Obrigatório | ❌ Sem validação ao cadastrar veículo | Operação irregular |
| **Lei 13.103/2015** (jornada de 8h + descanso obrigatório) | Obrigatório | ❌ Sistema não rastreia jornada | Multa + responsabilização em acidente |
| **Vale-pedágio** (Lei 10.209/2001) | Obrigatório embarcador pagar | ⚠️ Despesas registradas, mas sem rastrear quem paga | Multa |
| **LGPD + RLS** | Obrigatório multi-tenant | ⚠️ Filtros aplicação só no Next.js, não vi policies RLS confirmadas | Vazamento de dados entre empresas |

### 🔴 Omissão crítica 2: Rastreamento e geolocalização

Sistema registra origem/destino como **texto livre**. Sem latitude/longitude, sem integração GPS, sem painel de "onde está cada caminhão agora". Para frota de 10 caminhões em rotas longas (BH-Brasília, SP-Rio), isso é um buraco operacional grande. Gestor não consegue responder "onde está meu frete?" para o cliente.

### 🔴 Omissão crítica 3: Multas de trânsito e pontuação CNH

Nenhuma tabela para multas. CNH do motorista tem `data_validade` mas não rastreia **pontuação acumulada**. Motorista pode ter CNH suspensa e o sistema escala ele para uma viagem sem perceber.

### 🟡 Omissão relevante 4: Seguro de carga diferenciado

`veiculos.seguro_*` rastreia seguro do casco. Mas **seguro de carga** (apólice por viagem, com limite por tipo de mercadoria) não é modelado. Combustível tem limite diferente de eletrônicos. Sinistro sem cobertura adequada = prejuízo total.

### 🟡 Omissão relevante 5: App offline para motorista

`/motorista` existe como PWA mas sem suporte offline-first. Estradas brasileiras têm cobertura irregular. Motorista perde foto, registro de despesa, etc. quando o sinal cai. Banco de fila local + sync ao reconectar = obrigatório para Brasil.

**Para o gestor de 30 anos comendo terra:** o sistema **não é legal no Brasil hoje**. Antes de qualquer P1 que as outras IAs propuseram, **isso precisa estar no roadmap**.

---

## 🎯 Parte 4 — PLANO DE AÇÃO CONSOLIDADO

Priorizado por: (1) risco legal/operacional, (2) consenso entre IAs, (3) custo de implementação, (4) impacto no gestor leigo.

### 🔴 FASE 1 — Travamento Operacional Imediato (1-2 semanas)

Sem isso, o sistema não pode ser entregue ao gestor leigo com tranquilidade.

#### 1.1 Trigger PostgreSQL: bloqueio de viagem com manutenção ativa
```sql
CREATE OR REPLACE FUNCTION validar_veiculo_sem_manutencao_ativa()
RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM manutencoes
    WHERE veiculo_id = NEW.veiculo_id
      AND status IN ('em_andamento', 'agendada')
  ) THEN
    RAISE EXCEPTION 'Veículo % está em manutenção ativa', NEW.veiculo_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_validar_veiculo_manutencao
BEFORE INSERT OR UPDATE ON viagens
FOR EACH ROW EXECUTE FUNCTION validar_veiculo_sem_manutencao_ativa();
```
**Por quê:** Defesa em profundidade. WhatsApp, API e UI todos passam pelo banco.
**Concordância:** Opus 4.6, Sonnet 4.6 T, Gemini Pro, Gemini Flash, Sonnet 4.6 curta, Haiku 4.5.

#### 1.2 Atualizar `checkVeiculoOcupado` no frontend
Em `viagens/novo/page.tsx` consultar também `manutencoes` com status ativos. Mensagem clara: "🔧 Caminhão DEF-5678 está em manutenção (filtro de óleo) — retorna previsão 21/05. Selecione outro."

#### 1.3 UNIQUE INDEX em `motorista_veiculo`
```sql
CREATE UNIQUE INDEX idx_motorista_veiculo_unico_ativo
ON motorista_veiculo (veiculo_id)
WHERE ativo = true;
```
**Por quê:** Impede que `.single()` quebre silenciosamente com 2 vínculos ativos no mesmo veículo.

#### 1.4 Validação `km_final >= km_inicial` em fretes
Trigger no banco + check no frontend. Caso de Haiku 4.5 verificado: hoje passa retrocesso.

---

### 🟠 FASE 2 — Visibilidade Financeira (1 semana)

#### 2.1 Card "Quanto sobrou?" na tela de viagem
Em `viagens/[id]/page.tsx`, consumir a view `fretes_com_resultado` e mostrar:
```
RECEITA TOTAL.................... R$ 12.500,00
(-) Combustível..................  R$  2.800,00
(-) Pedágio + Alimentação........  R$    650,00
(-) Comissão Motorista...........  R$  1.875,00
(-) Custos Indiretos (pneu+dep.).  R$    480,00
─────────────────────────────────────────────
LUCRO LÍQUIDO.................... R$  6.695,00   (53,6%)
```
**Concordância:** Todas as 8 IAs. **Esforço:** baixo (dados já estão na view). **Impacto:** altíssimo.

#### 2.2 Adicionar custos indiretos em `veiculos`
```sql
ALTER TABLE veiculos
  ADD COLUMN custo_km_pneu NUMERIC DEFAULT 0.12,
  ADD COLUMN custo_km_depreciacao NUMERIC,  -- calculado de valor_aquisicao
  ADD COLUMN consumo_medio_km_l NUMERIC;     -- para estimar combustível
```
Estender view `fretes_com_resultado`:
```sql
custo_indireto = (custo_km_pneu + custo_km_depreciacao) * (km_final - km_inicial)
lucro_real = receita - custo_combustivel - custo_despesas - custo_comissao - custo_indireto
```

---

### 🟠 FASE 3 — UX para Gestor Leigo (1 semana)

#### 3.1 Dashboard "Status da Frota Agora"
Card no topo do `/` com grid de caminhões:
```
🟢 ABC-1234   DISPONÍVEL
🔵 DEF-5678   EM ROTA — João, BH→SP (entrega 22/05)
🔧 GHI-9012   MANUTENÇÃO — filtro óleo, retorna 21/05
⚠️ JKL-3456   AVARIA CRÍTICA — seta quebrada, aguardando oficina
🟢 MNO-7890   DISPONÍVEL
```
Click no card abre detalhes. Combinar com badge de cor no dropdown ao selecionar veículo em "Novo Frete" (defesa em duas camadas).

#### 3.2 Botão "Trocar Motorista" no detalhe do frete + tabela `viagem_motoristas`
```sql
CREATE TABLE viagem_motoristas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  viagem_id UUID REFERENCES viagens(id) ON DELETE CASCADE,
  motorista_id UUID REFERENCES motoristas(id),
  km_inicio NUMERIC NOT NULL,
  km_fim NUMERIC,
  motivo_troca TEXT,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
```
Modal pergunta: "Motorista atual passou mal/foi substituído? Qual o KM atual?". Sistema finaliza o registro anterior (preenche `km_fim`) e cria novo. Comissão é rateada proporcionalmente.

#### 3.3 Campo `cliente_avulso_nome` em `fretes`
```sql
ALTER TABLE fretes ADD COLUMN cliente_avulso_nome TEXT;
```
No frontend, quando `cliente_id` é NULL, mostra campo "Quem é o cliente? (ex: Nego Doido, BH-Brasília)".

#### 3.4 Avaria crítica trava seleção de veículo
Em `checkVeiculoOcupado`, consultar `avarias` com `urgencia IN ('alta', 'critica') AND status = 'aberta'`. Mostrar warning com link para resolver/cancelar a avaria.

---

### 🟡 FASE 4 — Automações Inteligentes (2 semanas)

#### 4.1 Flow WhatsApp "Nota Fiscal / Pedido de Frete"
Criar `pedidoFreteFlow.ts` que chama `extrairPedidoFrete()` existente no `aiService.ts`. Admin tira foto da NF/pedido → IA extrai origem, destino, peso, valor → frete pré-preenchido com `status='agendado'` aguardando completar motorista/veículo.

#### 4.2 Avaria → Manutenção em 1 clique
Botão "Agendar manutenção" no card da avaria → cria registro em `manutencoes` com FK `avarias.manutencao_id` já preenchida. Para urgência `crítica`, sugerir automaticamente ao gestor.

#### 4.3 Diária auto-sugerida
Quando `km_estimado > 800` ou previsão > 1 dia, exibir alerta: "Frete longo. Adicionar diária prevista R$ 150 (alimentação) + R$ 100 (hospedagem)?". One-click cria `despesas_frete`.

---

### 🔴 FASE 5 — Compliance Legal Brasileiro (3-4 semanas) — **CRÍTICO**

**Esse é o ponto cego que as 8 IAs deixaram passar.**

#### 5.1 Tabela `documentos_fiscais` para CT-e/MDF-e
```sql
CREATE TABLE documentos_fiscais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  frete_id UUID REFERENCES fretes(id),
  tipo TEXT CHECK (tipo IN ('cte', 'mdfe', 'nfe', 'nfse')),
  chave_acesso TEXT UNIQUE NOT NULL,
  numero TEXT,
  serie TEXT,
  data_emissao TIMESTAMPTZ,
  valor NUMERIC,
  xml_url TEXT,
  status TEXT CHECK (status IN ('emitido', 'cancelado', 'denegado'))
);
```
Integração com SEFAZ via API (ex: Focus NFe, eNotas, NFe.io) — pode começar com **upload manual de XML** já que gestor leigo provavelmente terceiriza a contabilidade.

#### 5.2 CIOT obrigatório para transportador autônomo
Campo em `motoristas`: `tipo_vinculo` enum {`clt`, `autonomo_rntrc`, `agregado`}. Se `autonomo_rntrc`, sistema exige `ciot_codigo` em cada frete.

#### 5.3 Validador RNTRC
Campo em `empresas` (proprietário da frota) e `motoristas` (autônomos). Validador básico: 8 dígitos numéricos. Validador avançado: consulta API ANTT.

#### 5.4 Jornada do motorista (Lei 13.103)
Tabela `jornada_motorista` com `data`, `inicio`, `fim`, `paradas[]`. View `alerta_jornada` que dispara quando jornada > 8h consecutivas. Já existe `checklistFlow` — adicionar pergunta de início/fim de jornada.

#### 5.5 RLS no Supabase — verificar e completar
Auditoria de policies por tabela. Confirmar que multi-tenant está realmente travado no banco, não só na aplicação.

---

### 🟢 FASE 6 — Refinamentos (backlog)

- Timeline visual do frete (`Agendado → Em rota → Entregue → Pago → Comissão quitada`)
- Onboarding wizard para primeiros 10 caminhões + importação CSV
- Notificações push (web push API)
- App `/motorista` offline-first (service worker + IndexedDB queue)
- Modo escuro toggle (tema hardcoded em `#0f172a` hoje)
- Cotação de frete sugerida (tabela ANTT de piso mínimo)
- Integração com Sem-parar / ConectCar / ARTESP
- Pagamento PIX direto (adiantamentos)

---

## 🏁 Veredito Final

**Sistema atual:** 6.8 / 10 — base técnica forte, gaps de "amarração" operacional, **bombas-relógio legais** que ninguém viu.

**Após Fase 1 + 2 + 3:** 8.5 / 10 — sistema "amarrado" para gestor leigo operar 10 caminhões sem se assustar.

**Após Fase 5 (compliance):** 9.5 / 10 — sistema **legal** no Brasil, pronto para escalar.

**Erro estratégico das outras 8 IAs:** todas focaram em "regras de negócio interno" (status, validações, dashboards) e **nenhuma viu que o sistema não emite CT-e, não rastreia CIOT, não monitora jornada Lei 13.103**. Para uma frota real operando no Brasil em 2026, **isso é mais urgente do que dashboard bonito**.

---

## 🧪 Cobertura de Testes Exigida em Cada Fase

Cada fase do plano de ação acima **DEVE** ser entregue com testes correspondentes (vitest, em `src/__tests__/`):

| Fase | Testes obrigatórios |
|---|---|
| F1.1 — Trigger validar veículo sem manutenção ativa | Teste de integração que insere viagem com `veiculo_id` em manutenção e verifica que a operação é rejeitada |
| F1.2 — `checkVeiculoOcupado` consulta `manutencoes` | Teste unitário com mocks do Supabase para os 4 casos (livre, em viagem, em manutenção, com ambos) |
| F1.3 — UNIQUE em `motorista_veiculo` | Teste de integração que tenta inserir 2 vínculos ativos e espera erro |
| F1.4 — `km_final >= km_inicial` | Teste do schema/validator com 5 casos: igual, maior, menor, ambos zero, ambos nulos |
| F2.1 — Card "Quanto sobrou?" | Teste que consome a view `fretes_com_resultado` e verifica que todos os campos chegam ao componente |
| F2.2 — Custos indiretos | Teste do cálculo `(pneu + depreciacao) * km_rodado` com 5 cenários |
| F3.1 — Dashboard "Status da Frota Agora" | Teste de derivação de status (disponivel/em_viagem/em_manutencao/avaria_critica) para cada combinação |
| F3.2 — Tabela `viagem_motoristas` + rateio | Teste do rateio de comissão proporcional por km (3+ motoristas em uma viagem) |
| F3.3 — `cliente_avulso_nome` | Teste de schema com cliente_id NULL + cliente_avulso_nome obrigatório/opcional |
| F3.4 — Avaria crítica trava seleção | Teste com mock que verifica que veículo com avaria `urgencia in (alta,critica)` é rejeitado |
| F4.1 — Flow Nota Fiscal | Teste do flow completo + mock de `extrairPedidoFrete` |
| F4.2 — Avaria→Manutenção 1-clique | Teste que verifica criação da manutenção e populate de `avarias.manutencao_id` |
| F4.3 — Diária auto-sugerida | Teste do threshold (km > 800 ou dias > 1) e cálculo do valor sugerido |
| F5 — Compliance (CT-e, MDF-e, CIOT, RNTRC, jornada) | Cada item recebe seu próprio arquivo de teste em `src/__tests__/compliance/` |

**Não pule.** Mesmo que a tarefa pareça trivial, escreva o teste. É a única coisa que prova que está pronto.

---

## 🔁 Convite às outras IAs

Este plano não é dogma. Pontos de contestação possíveis:

1. **MDF-e/CT-e/CIOT são realmente P1?** Pode-se argumentar que gestor leigo terceiriza para contador, e o sistema só precisa ARMAZENAR o XML emitido por outro software. Aceito o debate.
2. **Trigger PostgreSQL bloqueia API legítima?** Em alguns casos sim. Talvez melhor: trigger emite warning + flag, frontend decide bloquear. Aceito o debate.
3. **Tabela `viagem_motoristas` é overengineering?** Para 5% dos casos (troca real), sim. Mas o rateio justo de comissão depende disso. Aceito o debate.
4. **Custos indiretos com defaults configuráveis ou auto-calculados?** Defaults podem mentir (R$ 0,12/km de pneu pode ser muito ou pouco). Aceito o debate.
5. **Dashboard "Status da Frota Agora" ou painel de fretes ativos?** Talvez sejam a mesma coisa apresentada diferente. Aceito o debate.

**Próximos passos sugeridos:**
1. Usuário valida prioridades (especialmente Fase 5 — Compliance)
2. Outras IAs leem este `log.md` e contestam
3. Após convergência, gerar issues no GitHub para cada fase
4. Implementar Fase 1 antes de tudo

---

*— Análise consolidada finalizada por Claude Opus 4.7 com base em 5 agentes independentes que validaram código + cruzaram 8 análises prévias.*
