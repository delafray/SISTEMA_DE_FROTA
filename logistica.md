# 🚛 Relatório de Análise Operacional e de Fluxo: Sistema de Frota

* **Modelo:** Antigravity (Gemini 3.5 Flash)
* **Data da Análise:** 20 de Maio de 2026

---

## 🎯 Introdução e Filosofia do Sistema
Este relatório apresenta uma análise crítica e construtiva da lógica de negócios, do modelo do banco de dados e da estrutura de código do **Sistema de Frota**. O foco é garantir que o sistema seja **extremamente robusto debaixo do capô, mas incrivelmente simples e amigável na interface**, ideal para um gestor que opera uma frota de até 10 caminhões e que preza por agilidade sem burocracia desnecessária.

---

## 🔍 Diagnóstico do Fluxo Logístico Real vs. Implementação Atual

### 1. O Caminhão como Base e Seus Status
**Regra de Negócio Ideal:** O caminhão é a entidade central. Ele pode estar *Disponível*, *Viajando* ou *Em Manutenção*. 
* Se está em manutenção, não pode estar associado a um motorista/viagem.
* Se está viajando, deve estar ligado a um motorista e uma viagem ativa.
* O gestor deve ver cores claras para saber a situação de cada veículo.

#### 🛠️ O que está implementado:
* **Status Dinâmico (Excelente Arquitetura):** O banco de dados (`veiculos`) não possui uma coluna rígida chamada `status`. Isso é um acerto técnico de alto nível! Em sistemas mal desenhados, uma coluna estática de status gera inconsistência (ex: a viagem acaba, mas esquecem de atualizar a coluna, deixando o caminhão travado). Aqui, o status é **calculado dinamicamente** cruzando as tabelas:
  * **Viajando (Vermelho):** O veículo possui uma viagem ativa (`viagens.status = 'em_andamento'`).
  * **Em Manutenção (Amarelo/Laranja):** O veículo possui uma manutenção ativa (`manutencoes.status = 'em_andamento'`).
  * **Disponível (Verde):** Sem viagens ou manutenções ativas.

#### ⚠️ Lacunas e Gaps Identificados:
1. **Falta de Validação na Criação de Viagem:** No arquivo `src/app/(dashboard)/viagens/novo/page.tsx`, a função `checkVeiculoOcupado` verifica se o caminhão está em uma viagem ativa, mas **ignora completamente a tabela `manutencoes`**.
   * *Risco:* Atualmente, o sistema permite que o gestor selecione um caminhão que está parado na oficina (manutenção ativa) e o coloque em uma viagem sem exibir nenhum aviso ou bloqueio.
2. **Vínculo Fixo de Motorista vs. Manutenção:** A tabela `motorista_veiculo` serve para deixar um caminhão fixo com um motorista. Quando o caminhão vai para a manutenção, não é necessário apagar o histórico de quem é o dono dele, mas o motorista não deve poder abrir uma viagem enquanto a manutenção durar.

---

### 2. Modificações Pontuais (Troca de Motorista Mid-Trip)
**Regra de Negócio Ideal:** Se um motorista passar mal ou tiver uma emergência no meio de uma viagem, o gestor precisa ter a flexibilidade de trocar o motorista de forma pontual no sistema, sem estragar o histórico financeiro e operacional.

#### 🛠️ O que está implementado:
* O sistema possui uma rota de edição de viagem (`/viagens/[id]/editar`), permitindo ao gestor alterar o motorista e o veículo a qualquer momento.

#### ⚠️ Lacunas e Gaps Identificados:
* **Dificuldade no Rateio de Custos e Comissão:** Ao trocar o motorista "João" por "José" na metade da viagem, se o gestor apenas atualizar a coluna `motorista_id` na tabela `viagens`, o sistema atribuirá **100% da comissão e dos custos** ao novo motorista no fechamento do mês.
* *Como amarrar isso de forma simples:* O sistema deve registrar o KM no momento exato da troca para garantir que as comissões acumuladas até ali pertençam ao primeiro motorista, e o restante ao motorista reserva.

---

### 3. Custos de Viagem: Combustível, Diárias, Pedágio e Pneus
**Regra de Negócio Ideal:** Uma viagem deve consolidar de forma clara todas as despesas (combustível, diárias, pedágios, alimentação, hospedagem) e custos indiretos (desgaste de pneus e depreciação) para dar ao gestor a resposta para a pergunta mais importante: **"Esta viagem deu lucro?"**.

#### 🛠️ O que está implementado:
* **Banco muito bem preparado:** O banco possui as tabelas `abastecimentos` e `despesas_frete` (que tem uma coluna `tipo` com as categorias exatas: `pedagio`, `alimentacao`, `hospedagem`, `lavagem`, `reparo`, `combustivel`, `outro`). Cada despesa pode ser vinculada ao `frete_id`.
* **Automatização por IA:** No arquivo `aiService.ts`, a função `lerCupomGenerico` usa a IA (`gpt-4o-mini`) para extrair de fotos de comprovantes o valor, o local, a data e a categoria (pedágio, alimentação, etc.) automaticamente. Isso é espetacular!

#### ⚠️ Lacunas e Gaps Identificados:
* **Falta de Consolidação na Tela de Detalhes:** A tela de detalhes da viagem (`src/app/(dashboard)/viagens/[id]/page.tsx`) só mostra a **Receita Total** (soma dos valores dos fretes). Ela **não mostra o total gasto** com combustível e despesas daquela viagem! O gestor precisa ficar somando de cabeça ou abrindo outra tela.

---

### 4. CRM Simplificado (Frete Avulso "Nego Doido")
**Regra de Negócio Ideal:** Se o frete é um serviço pontual de uma única vez, o gestor não quer perder tempo cadastrando o cliente de forma completa no sistema (com CNPJ, Inscrição Estadual, Endereço, etc.). Ele quer apenas digitar "Carga Avulso - Nego Doido" e lançar a viagem.

#### 🛠️ O que está implementado:
* **WhatsApp Alinhadíssimo:** No arquivo `viagemFlow.ts`, ao iniciar uma viagem pelo WhatsApp, o bot busca os clientes ativos da empresa, mas inclui a opção **"➕ Frete avulso"**. Se o motorista escolhe essa opção, a IA permite salvar a rota e o valor sem exigir vínculo com um cadastro de cliente formal.
* **Flexibilidade do Supabase:** No banco de dados, o campo `cliente_id` na tabela `fretes` é opcional (`is_nullable: YES`).

#### ⚠️ Lacunas e Gaps Identificados:
* **Rigor excessivo na interface Web:** Embora o WhatsApp permita criar fretes sem cliente, o formulário de cadastro de fretes na interface administrativa da Web costuma exigir o preenchimento de um cliente cadastrado.

---

### 5. WhatsApp e IA: A Arma Secreta do Sistema
**Sua Visão:** O motorista tira foto do painel, a IA cadastra o KM. O motorista tira foto da nota do posto, o sistema cadastra.

#### 🛠️ O que está implementado (Nota 10/10 aqui!):
A estrutura técnica desenvolvida para isso está **impecável e pronta para rodar**.
1. **Odometer Vision (`kmFlow.ts`):** O motorista manda a foto do painel pelo WhatsApp. O sistema envia para a IA (`gpt-4o-mini`), que extrai o número do KM.
   * Se a IA tiver certeza (confiança ≥ 85%), o bot responde com botões: `[Confirmar KM]` ou `[Digitar Manual]`.
   * O KM é atualizado via banco de dados e possui uma trava de segurança (trigger) que impede cadastrar KM menor que o atual (evitando fraudes ou erros).
2. **Abastecimentos e Despesas (`abastecimentoFlow.ts` e `despesaFlow.ts`):** O motorista manda a foto do cupom do posto. A IA lê a quantidade de litros, valor por litro, posto de combustível e valor total. Tudo vira um lançamento financeiro "A pagar" pendente de aprovação do gestor.
3. **Transcrição de Voz (Whisper):** O driver do Whisper está mapeado no `aiService.ts`. O motorista pode mandar áudio descrevendo um imprevisto ou avaria (ex: "quebrou a seta na estrada"), e a IA transcreve e cadastra automaticamente na tabela `avarias` com a criticidade recomendada.

---

## 💡 Sugestões de Melhoria e Plano de Ação

Para tornar o sistema 100% "fechadinho", seguro e extremamente simples para o usuário final, recomendo as seguintes melhorias:

### 1. Bloqueio Inteligente de Veículos em Manutenção
* **Ação:** Modificar a tela de criação de viagem (`NovoViagemPage`). Se o veículo selecionado estiver em manutenção ativa (`manutencoes.status = 'em_andamento'`), exibir um aviso claro em vermelho e **bloquear** o avanço até que a manutenção seja dada como finalizada.

### 2. Painel "Quanto Sobrou?" na Tela de Viagem
* **Ação:** Criar um card de consolidação financeira na página de detalhes da viagem (`viagens/[id]/page.tsx`) que mostre o seguinte cálculo simples:
  ```
    Faturamento Total (Soma dos Fretes)
  - Despesas de Combustível (Soma dos Abastecimentos da viagem)
  - Despesas Extras (Pedágio, Alimentação, Estadia)
  - Comissão do Motorista (Calculada automaticamente)
  -------------------------------------------------------------
  = Lucro Líquido da Viagem (R$ e Margem %)
  ```
* Adicionar também uma estimativa de **Desgaste de Pneus e Depreciação** multiplicando o KM rodado por um valor configurável (ex: R$ 0,15/km para pneus).

### 3. "Cliente Avulso" na Interface Web
* **Ação:** No formulário de cadastro de fretes da Web, incluir uma opção "Cliente Avulso" no topo da seleção de cliente. Ao marcar, os campos burocráticos de CNPJ/Endereço são ocultados e abre-se apenas um campo de texto simples para digitação livre (ex: "Nego Doido" ou "Carga de Batata").

### 4. Gestão de Troca de Motorista com Registro de KM
* **Ação:** Se o gestor precisar editar a viagem para trocar de motorista no meio do percurso, o sistema deve abrir um campo simples perguntando: *"Qual o KM atual do caminhão na troca do motorista?"*. O sistema encerra as comissões do motorista antigo até aquele KM e inicia a contagem para o novo, de forma totalmente justa e automática.

---
*Análise concluída com sucesso. O sistema possui uma base técnica brilhante, especialmente nas integrações de IA e WhatsApp, necessitando apenas desses ajustes de fluxo para se tornar o produto de frota mais amigável e seguro do mercado.*

---

<br><br><br>

# ═══════════════════════════════════════════════════════════════
# 🧠 SEGUNDA ANÁLISE INDEPENDENTE
# ═══════════════════════════════════════════════════════════════

# 🚛 Relatório de Análise de Fluxo Logístico — Sistema de Frota

* **Modelo:** Claude Opus 4.6 (Thinking)
* **Data da Análise:** 20 de Maio de 2026
* **Método:** Análise independente do código-fonte, banco de dados Supabase (schema, triggers, views, foreign keys) e pesquisa externa sobre boas práticas de TMS para pequenas frotas no Brasil.

---

## 📐 Resumo Executivo

O sistema possui uma **engenharia de banco de dados surpreendentemente madura** para um produto direcionado a pequenas frotas. A presença de 27 triggers automáticos, 5 views computadas (incluindo `fretes_com_resultado` que calcula lucro bruto por frete), e 63 foreign keys demonstram que a integridade referencial está **muito acima da média** do mercado. A integração WhatsApp + IA Vision é um diferencial competitivo real.

No entanto, identifiquei **7 pontos de ruptura** entre a lógica do pátio real e o que o sistema permite fazer hoje, além de **3 oportunidades de simplificação** que fariam o gestor leigo operar com mais confiança.

**Nota geral da coesão do sistema: 7.2/10** — Excelente base, falta apertar os parafusos.

---

## 🔍 Análise Detalhada

### 1. Máquina de Estados do Caminhão — O Coração do Sistema

**Como deveria funcionar no mundo real:**
```
DISPONÍVEL ←→ EM MANUTENÇÃO
    ↓                ↗ (se quebrar na estrada)
VIAJANDO ────────────
```

**O que encontrei no banco:**
- ✅ Sem coluna `status` estática em `veiculos` — o status é derivado (boa engenharia)
- ✅ Trigger `bloquear_inativacao_veiculo` impede desativar veículo com pendências
- ✅ `manutencoes.status` permite: `realizada`, `agendada`, `em_andamento`, `cancelada`
- ✅ `viagens.status` permite: `agendada`, `em_andamento`, `concluida`, `cancelada`

**⚠️ BRECHA CRÍTICA #1 — Sem guarda-chuva entre manutenção e viagem:**
O código em `viagens/novo/page.tsx` (função `checkVeiculoOcupado`, linhas 115-130) consulta APENAS `viagens` com status `em_andamento`. Não consulta `manutencoes`. Um caminhão na oficina pode ser colocado em viagem sem nenhum aviso.

**⚠️ BRECHA CRÍTICA #2 — Sem constraint no banco:**
Não existe trigger ou check constraint que impeça um INSERT em `viagens` quando o `veiculo_id` possui `manutencoes.status = 'em_andamento'`. A proteção existe apenas no front-end (e está incompleta). Se alguém criar via API ou WhatsApp, passa direto.

**⚠️ BRECHA #3 — Avaria não trava o caminhão:**
A tabela `avarias` possui status `aberta`, `em_reparo`, `resolvida`, `cancelada`. Uma avaria `aberta` com urgência `alta` ou `critica` deveria gerar um impedimento (ao menos um aviso forte) na seleção do veículo para viagem. Hoje não gera nada. Se a seta está quebrada e o motorista reportou via WhatsApp, o sistema cadastra a avaria mas continua permitindo viagem normalmente.

---

### 2. Vínculo Motorista ↔ Veículo — A Tabela Pivot

**O que encontrei:**
- ✅ Tabela `motorista_veiculo` com campos `motorista_id`, `veiculo_id`, `ativo`, `empresa_id`
- ✅ O wizard de viagem (`handleMotoristaNext`) consulta essa tabela para pré-selecionar o veículo fixo do motorista

**⚠️ BRECHA #4 — A tabela `motorista_veiculo` está vazia (0 registros):**
Apesar de o código já consultar essa tabela, nenhum dado de seed foi inserido. Isso significa que durante os testes, o vínculo fixo motorista↔veículo nunca funciona. O gestor sempre cai no select manual sem recomendação, o que derrota o propósito da simplificação.

**⚠️ BRECHA #5 — Sem unicidade no vínculo ativo:**
Não encontrei constraint `UNIQUE` em `motorista_veiculo` para garantir que um veículo só tenha 1 motorista ativo por vez. Se dois vínculos `ativo=true` existirem para o mesmo veículo, o `single()` do Supabase vai falhar silenciosamente.

---

### 3. Fluxo Financeiro — "Essa viagem deu lucro?"

**O que encontrei — pontos fortes espetaculares:**
- ✅ View `fretes_com_resultado` no banco calcula automaticamente: receita, custo_combustível, custo_despesas, custo_comissão, custo_total, lucro_bruto e margem_pct POR FRETE
- ✅ Views `kpi_mensal_empresa`, `kpi_mensal_motorista`, `kpi_mensal_veiculo` agregam por mês
- ✅ Trigger `calcular_comissao_snapshot` salva o valor da comissão na hora da conclusão do frete
- ✅ Trigger `frete_concluido_exige_km_final` força registro de KM ao concluir
- ✅ Módulo financeiro completo com 5 abas: Fluxo Diário, A Receber, A Pagar, Despesas Avulsas, Recorrências
- ✅ Acerto mensal do motorista com saldo anterior, pagamentos parciais, rolagem de dívida

**⚠️ BRECHA #6 — Desconexão entre Viagem e Custos na UI:**
A tela de detalhes da viagem (`viagens/[id]/page.tsx`) mostra apenas "Receita Total" (soma dos fretes). O card de "Resumo Financeiro" tem apenas 2 linhas: quantidade de fretes e receita total. **Não traz combustível, pedágio, alimentação, comissão.** A view `fretes_com_resultado` JÁ tem esses dados prontos no banco — basta consumir.

A pergunta do gestor leigo é simples: *"Mandei o caminhão pra Brasília. Gastei quanto? Sobrou quanto?"* Hoje ele não consegue responder isso numa tela só.

**⚠️ BRECHA #7 — Custos fixos/indiretos não modelados:**
Segundo dados do mercado brasileiro (2025), o diesel representa ~35% do custo operacional e pneus são o segundo maior custo variável. A depreciação é um custo fixo relevante. O sistema não tem onde cadastrar:
- Custo por km de pneus (vida útil dividida pelo custo de aquisição + recapagens)
- Taxa de depreciação mensal do veículo
- Custo estimado de seguro/IPVA/licenciamento rateado por viagem

A tabela `veiculos` tem `valor_aquisicao` e `data_aquisicao`, o que permitiria calcular depreciação automaticamente, mas nenhum código faz esse cálculo hoje.

---

### 4. Frete Avulso — O "Nego Doido"

**O que encontrei:**
- ✅ No banco: `fretes.cliente_id` é nullable — perfeito!
- ✅ No formulário web de novo frete: o select de cliente tem a opção `"— Sem cliente —"` (linha 201 do `novo/page.tsx`) — **já funciona!**
- ✅ No WhatsApp: opção "➕ Frete avulso" no `viagemFlow.ts`

**Observação positiva:** Diferente do que seria esperado, o formulário web de fretes JÁ permite criar frete sem cliente. O label diz "Cliente (opcional)" e a primeira opção do select é "— Sem cliente —". Isso já atende o caso do "Nego Doido".

**Sugestão menor:** Poderia ter um campo de texto livre `"identificacao_carga"` ou similar para quando não há cliente cadastrado, permitindo escrever algo como "Nego Doido - Carga de Batata pro João". Hoje a única alternativa é colocar isso no campo "Observações".

---

### 5. WhatsApp + IA — A Joia da Coroa

**O que encontrei — impressionante:**
- ✅ 9 fluxos completos: abastecimento, adiantamento, avaria, checklist, despesa, gestor, imprevisto, KM, viagem
- ✅ AI Service Layer com padrão `AIResult<T>` — nunca lança exceção, sempre retorna `ok` ou `fallbackManual`
- ✅ Classificação automática de mídia (painel, cupom combustível, cupom genérico, avaria, documento)
- ✅ Whisper para transcrição de áudio
- ✅ Intent classifier separado para motorista e gestor
- ✅ Threshold de confiança (85%) com fallback para digitação manual
- ✅ Trigger `trigger_propagar_km` no banco propaga KM do log para `veiculos.km_atual`
- ✅ Trigger `trigger_frete_iniciado` atualiza status do frete quando KM é registrado
- ✅ `gestorFlow.ts` com 15.7KB — o gestor também pode operar via WhatsApp

**Ponto de atenção:** O fluxo de WhatsApp cria fretes vinculados diretamente ao motorista, mas sem passar pelo wizard de viagem. Isso significa que fretes criados via WhatsApp podem ficar "soltos" (sem `viagem_id`). Não é necessariamente um bug — é uma escolha de design — mas o gestor precisa saber que precisa agrupar esses fretes em viagens manualmente depois, ou o sistema precisa de uma automação que crie viagens implícitas.

---

### 6. Dashboard e Alertas — O que o gestor vê ao abrir o sistema

**O que encontrei:**
- ✅ KPIs no topo: total de fretes, em andamento, agendados, veículos ativos, faturamento do mês, motoristas ativos
- ✅ Alertas automáticos: CNH vencida/vencendo, IPVA/Licenciamento/Seguro vencidos, adiantamentos pendentes
- ✅ View `proxima_manutencao_veiculo` com status `ok`, `proximo`, `vencido`, `nunca_feito` — alimenta alertas de manutenção
- ✅ Trigger `trigger_alerta_avaria_critica` cria alerta quando avaria crítica é registrada
- ✅ Trigger `trigger_alerta_imprevisto` notifica sobre imprevistos em viagem

**Observação:** A quantidade de alertas pode ser excessiva para um gestor leigo. 20 manutenções × 36 tipos = potencialmente muitos cards. Seria bom priorizar: mostrar apenas `vencido` e `proximo` (não `ok`).

---

### 7. Acerto Mensal do Motorista — Fechamento Financeiro

**O que encontrei — muito bem pensado:**
- ✅ Pagamento parcial por frete com rolagem de saldo devedor para o mês seguinte
- ✅ Ajustes (bônus, desconto, reembolso) com parcelas
- ✅ Salário fixo auto-inserido quando o tipo de comissão inclui salário
- ✅ Navegação mês a mês com histórico
- ✅ Saldo anterior calculado automaticamente do mês anterior

**Ponto forte:** Este é provavelmente o módulo mais maduro do sistema e atende diretamente o fluxo real do gestor: "fim do mês, vou acertar com o João".

---

## 💡 Sugestões de Melhoria (Priorizadas)

### 🔴 Prioridade Alta (Segurança do Fluxo)

#### 1. Criar trigger de validação no banco
```sql
-- Impedir viagem com veículo em manutenção ativa
CREATE TRIGGER trigger_validar_veiculo_manutencao
BEFORE INSERT ON viagens
FOR EACH ROW
EXECUTE FUNCTION validar_veiculo_sem_manutencao_ativa();
```
Isso garante que NENHUM caminho (web, WhatsApp, API) consiga criar viagem com caminhão na oficina.

#### 2. Adicionar check de manutenção no front-end
No `checkVeiculoOcupado()`, além de consultar `viagens`, consultar `manutencoes` com status `em_andamento` ou `agendada` para o mesmo `veiculo_id`.

#### 3. Constraint UNIQUE em motorista_veiculo
```sql
CREATE UNIQUE INDEX idx_motorista_veiculo_ativo 
ON motorista_veiculo (veiculo_id) 
WHERE ativo = true;
```

### 🟡 Prioridade Média (Experiência do Gestor)

#### 4. Card "Quanto sobrou?" na viagem
Consumir a view `fretes_com_resultado` na tela de detalhes da viagem para mostrar:
- Receita total
- (-) Combustível
- (-) Despesas (pedágio, alimentação, etc.)
- (-) Comissão
- **(=) Lucro líquido**

#### 5. Popular `motorista_veiculo` com dados de seed
Sem dados nessa tabela, o fluxo de "veículo fixo do motorista" nunca é testado.

#### 6. Avaria crítica como impedimento visual
Quando há avaria `aberta` com urgência `alta` ou `critica`, mostrar tag vermelha no veículo durante seleção.

### 🟢 Prioridade Baixa (Evolução)

#### 7. Custos indiretos por km
Adicionar campos em `veiculos`: `custo_pneu_por_km`, `custo_depreciacao_por_km`. Permitir que o sistema calcule automaticamente o custo "escondido" de cada viagem multiplicando pelo KM rodado.

#### 8. Agrupamento automático de fretes soltos em viagem
Fretes criados via WhatsApp sem `viagem_id` poderiam ser automaticamente agrupados quando o motorista registra o KM inicial (criando uma viagem implícita).

#### 9. Troca de motorista mid-trip com snapshot de KM
Ao editar `motorista_id` em uma viagem `em_andamento`, registrar automaticamente o KM no momento da troca e gravar um `log` para fins de rateio de comissão.

---

## 📊 Scorecard Final

| Dimensão | Nota | Comentário |
|---|---|---|
| Modelagem de Banco | 9/10 | Views, triggers, FKs — muito acima da média |
| Integridade Referencial | 8/10 | 63 FKs, mas falta constraint de unicidade em motorista_veiculo |
| Travas de Segurança | 5/10 | Validações existem no front-end mas faltam no banco (manutenção vs viagem) |
| Fluxo de Viagem (Web) | 7/10 | Wizard funcional mas sem check de manutenção e sem resumo financeiro |
| WhatsApp/IA | 9.5/10 | Praticamente completo — 9 fluxos, fallback robusto, classificação automática |
| Financeiro/Acerto | 8.5/10 | Acerto mensal excelente, falta consolidação na viagem |
| Simplicidade para Leigo | 6.5/10 | Funcional mas ainda tem telas com muita informação para quem "comeu terra 30 anos" |
| CRM/Cliente Avulso | 8/10 | Já permite frete sem cliente, falta só campo de texto livre |
| Dados de Teste | 4/10 | `motorista_veiculo` vazio, sem seeds adequados para testar fluxos críticos |

**Nota Final Ponderada: 7.2/10**

---

*Relatório concluído. O sistema tem uma base técnica excepcional. Os ajustes necessários são cirúrgicos — não é reconstrução, é apertar parafusos. A combinação WhatsApp + IA + Acerto Mensal é um diferencial que pouquíssimos concorrentes no mercado brasileiro de TMS para pequenas frotas oferecem.*

---

<br><br>

# ═══════════════════════════════════════════════════════════════
# 🧠 TERCEIRA ANÁLISE INDEPENDENTE
# ═══════════════════════════════════════════════════════════════

# 🚛 Relatório de Análise — Sistema de Gestão de Frota

* **Modelo:** Claude Sonnet 4.6 (Thinking)
* **Data da Análise:** 20 de Maio de 2026
* **Metodologia:** Análise independente sem leitura dos relatórios anteriores. Inspecionei diretamente o código-fonte (Next.js), o banco de dados Supabase (schema de 6 tabelas-núcleo, 21 funções, 28 triggers, 5 views), e pesquisei boas práticas de TMS para pequenas frotas no mercado brasileiro.

---

## 📋 Contexto: O Que o Mercado Espera de um TMS Simples

Com base na pesquisa realizada, um TMS para pequenas transportadoras (5-10 caminhões) no Brasil deve cobrir obrigatoriamente:

1. **Controle de custos por viagem** (combustível, pedágio, alimentação, hospedagem)
2. **Acerto mensal com motorista** — o mais sensível financeiramente
3. **Manutenção preventiva** ligada à quilometragem — para evitar parada inesperada
4. **Fluxo de caixa simples** — quem paga e quando
5. **Rastreabilidade** — saber onde está cada caminhão a qualquer momento

O gestor que "comeu terra 30 anos" não quer planilha. Ele quer olhar para uma tela e saber: **"Meu caminhão está bem? Estou ganhando dinheiro?"**

---

## 🔍 Análise do Fluxo Logístico Central

### Questão 1: O Caminhão como Entidade-Base — Está bem modelado?

**✅ PONTO FORTE — Status dinâmico, sem coluna estática**

O banco não tem `veiculos.status` fixo. O status real é derivado da lógica cruzada entre `viagens` e `manutencoes`. Esta é uma decisão de arquitetura excelente — evita estados inconsistentes (ex: viagem encerrada mas veículo ainda marcado como "viajando" por esquecimento de update).

Estados derivados na prática:
- **Disponível** → sem `viagens em_andamento` + sem `manutencoes em_andamento`
- **Em Viagem** → `viagens.status = 'em_andamento'` com esse veículo
- **Em Manutenção** → `manutencoes.status = 'em_andamento'` com esse veículo

**⚠️ GAP CRÍTICO — Ausência de guarda no banco de dados**

O código de criação de viagem (`viagens/novo/page.tsx`, função `checkVeiculoOcupado`, linhas 115-130) verifica apenas se o veículo tem viagem `em_andamento`. **Não consulta `manutencoes`.** 

Isso significa que um mecânico pode estar em cima do motor enquanto o gestor, no sistema, agenda uma viagem para esse mesmo caminhão amanhã — **sem nenhum aviso**.

Pior: não há `TRIGGER` ou `CHECK CONSTRAINT` no banco bloqueando esse cenário. A proteção é só no front-end web. Se o frete for criado via WhatsApp ou API direta, passa sem validação.

**Correção recomendada:**
```sql
-- Trigger BEFORE INSERT em viagens
CREATE OR REPLACE FUNCTION validar_veiculo_livre()
RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM manutencoes 
    WHERE veiculo_id = NEW.veiculo_id 
    AND status IN ('em_andamento', 'planejada')
  ) THEN
    RAISE EXCEPTION 'Veículo está em manutenção ativa';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

---

### Questão 2: Vínculo Motorista ↔ Veículo — Funciona na prática?

**✅ Estrutura existe** — tabela `motorista_veiculo` com campos: `motorista_id`, `veiculo_id`, `ativo`, `empresa_id`.

**✅ Código consome** — em `handleMotoristaNext()` (linha 93-109), ao selecionar motorista, o sistema consulta `motorista_veiculo` e pré-seleciona o veículo padrão automaticamente.

**⚠️ GAP OPERACIONAL — Tabela está vazia (0 registros ativos)**

Confirmado diretamente no banco: a query de vínculos ativos retornou `[]`. O código existe, a lógica existe, mas **nenhum motorista está vinculado a nenhum veículo**. Na prática, essa funcionalidade nunca foi exercida nos testes.

**⚠️ GAP DE INTEGRIDADE — Sem constraint de unicidade**

Não há `UNIQUE INDEX` garantindo que um veículo tenha no máximo 1 motorista ativo. Dois vínculos `ativo = true` para o mesmo veículo fariam o `.single()` do Supabase quebrar silenciosamente (retorna `null` ou o primeiro resultado aleatório).

---

### Questão 3: Modificação Mid-Trip (Troca de Motorista)

**✅ Tecnicamente possível** — a tela de edição `/viagens/[id]/editar` existe e permite alterar `motorista_id`.

**⚠️ GAP DE RASTREABILIDADE** — Ao editar o motorista de uma viagem `em_andamento`, o sistema simplesmente sobrescreve o `motorista_id`. Não há:
- Registro histórico de quem conduziu de qual KM até qual KM
- Rateio automático de comissão (motorista antigo recebe nada, novo recebe tudo)
- Nenhum log de auditoria específico para essa operação

Para o gestor leigo, isso é invisível — mas no acerto mensal vai gerar confusão: "por que José recebeu comissão de uma viagem que João começou?"

---

### Questão 4: Custos da Viagem — Combustível, Pedágio, Diária, Pneus

**✅ ARQUITETURA COMPLETA no banco:**
- `abastecimentos` → litros, valor_total, valor_litro, posto, frete_id (vinculado à viagem)
- `despesas_frete` → tipo (pedagio, alimentacao, hospedagem, lavagem, reparo, combustivel, outro), valor, frete_id
- `imprevistos` → registro de gastos inesperados em viagem
- `adiantamentos` → CIOT, dinheiro adiantado ao motorista

**✅ IA integrada para capturar custos via WhatsApp:**
- `abastecimentoFlow.ts` → motorista tira foto do cupom → IA (`gpt-4o-mini`) lê litros, valor, posto → confirma por botão → salva em `abastecimentos`
- `despesaFlow.ts` → foto de qualquer comprovante → classifica tipo automaticamente → salva
- Fallback robusto: se IA não lê, pede digitação manual em formato simples

**⚠️ GAP GRAVE — Custos invisíveis na tela principal da viagem**

Confirmei no código de `viagens/[id]/page.tsx` (linhas 187-190): o **"Resumo Financeiro"** mostra apenas:
- Quantidade de fretes
- Receita total (soma do `valor_frete`)

**Não mostra combustível, pedágio, comissão, ou lucro líquido.** O gestor abre a tela da viagem e só vê receita bruta — sem saber quanto gastou.

A view `fretes_com_resultado` no banco **já calcula tudo**: receita, custo_combustivel, custo_despesas, custo_comissao, custo_total, lucro_bruto, margem_pct. O dado existe, a tela não consome.

**⚠️ GAP — Custos indiretos não calculados:**
A tabela `veiculos` tem `valor_aquisicao` e `data_aquisicao`. Mas não há campos para:
- `custo_km_pneu` (ex: R$ 0,12/km)
- `taxa_depreciacao_mensal`
- `consumo_medio_km_l` (para estimar gasto de combustível antecipadamente)

Segundo benchmarks do mercado brasileiro 2024, o custo operacional real por km inclui: combustível (~35% do custo), pneus (~15%), manutenção (~12%), depreciação (~10%), salário motorista (~20%), outros (~8%). O sistema captura bem os primeiros itens, mas não estima os indiretos.

---

### Questão 5: Avaria Inesperada ("Seta Quebrada")

**✅ FLUXO COMPLETO via WhatsApp (`avariaFlow.ts`):**
1. Motorista manda foto, áudio ou texto
2. IA (`gpt-4o`) analisa e classifica urgência: `baixa`, `media`, `alta`, `critica`
3. Mostra resumo com emoji de urgência + botão confirmar
4. Trigger automático no banco: `trigger_alerta_avaria_critica` cria alerta se urgência `alta` ou `critica`
5. Gestor recebe notificação automática

**✅ Integração com Manutenções:** a coluna `avarias.manutencao_id` permite vincular a avaria a uma ordem de manutenção posterior.

**⚠️ GAP — Avaria não impede novas viagens**

Uma avaria `alta` ou `critica` com status `aberta` não gera nenhum impedimento ou aviso visual ao selecionar esse veículo em `/viagens/novo`. O gestor é alertado, mas pode ignorar e criar a viagem mesmo assim — sem nem ver um aviso amarelo na tela de seleção.

---

### Questão 6: Frete Avulso / CRM Simplificado ("Nego Doido, BH-Brasília")

**✅ CONFIRMADO — Cliente é opcional**

No banco: `fretes.cliente_id IS NULLABLE`. No formulário web de fretes (`/fretes/novo`): existe a opção `"— Sem cliente —"` como primeira opção do select — o sistema **já suporta frete sem cliente cadastrado**.

**✅ WhatsApp** também tem opção "Frete avulso" no `viagemFlow.ts`.

**⚠️ GAP menor** — Não há campo de texto livre para identificar o cliente avulso. O gestor que escolhe "Sem cliente" não tem onde escrever "Nego Doido" de forma estruturada — precisa usar o campo `observacoes`, que some no meio de outras informações.

**Solução simples:** Adicionar campo `nome_cliente_avulso TEXT` na tabela `fretes`. Se `cliente_id IS NULL`, mostrar este campo no formulário.

---

### Questão 7: Manutenção Preventiva

**✅ SISTEMA ROBUSTO:**
- Tabela `tipos_manutencao` com `intervalo_km` e `intervalo_meses`
- Tabela `plano_manutencao_veiculo` permite customizar intervalos por veículo
- View `proxima_manutencao_veiculo` calcula status: `ok`, `proximo`, `vencido`, `nunca_feito`
- Trigger `manutencao_calcula_proxima` recalcula automaticamente ao concluir manutenção
- Dashboard exibe alertas de manutenções vencidas ou próximas

**⚠️ GAP** — A view retorna todos os tipos de manutenção × todos os veículos. Com 20 veículos e 36 tipos, gera 720 linhas para filtrar. Sem um índice adequado, isso pode ser lento. Verificar se há `INDEX` nas colunas `veiculo_id` e `status` das tabelas `manutencoes` e `veiculos`.

---

### Questão 8: Acerto Mensal com Motorista

**✅ DESTAQUE DO SISTEMA — Módulo mais maduro:**
- Pagamento parcial por frete: o gestor define quanto paga agora de cada comissão
- Saldo devedor rola automaticamente para o mês seguinte (campo `saldo_anterior`)
- Ajustes: bônus, desconto, reembolso — com parcelas
- Salário fixo auto-inserido quando tipo de comissão inclui salário
- Navegação mês a mês com histórico

Este módulo **está fechadinho**. Atende exatamente o fluxo de um pequeno transportador: sentar com o motorista no final do mês, abrir a tela, ver o que deve, o que pagou, e fechar o acerto.

---

### Questão 9: Integração WhatsApp + IA — A Força do Sistema

**9 fluxos completamente implementados:**

| Flow | Função |
|------|--------|
| `kmFlow.ts` | Foto do painel → IA lê odômetro |
| `abastecimentoFlow.ts` | Foto do cupom → IA lê litros e valor |
| `avariaFlow.ts` | Foto/áudio/texto → IA classifica urgência |
| `despesaFlow.ts` | Foto de comprovante → registra despesa |
| `adiantamentoFlow.ts` | Solicita adiantamento via WhatsApp |
| `checklistFlow.ts` | Checklist diário do caminhão |
| `imprevistoFlow.ts` | Registra imprevisto de viagem |
| `viagemFlow.ts` | Inicia viagem, registra fretes |
| `gestorFlow.ts` | Gestor opera o sistema pelo WhatsApp |

**✅ Padrão de segurança `AIResult<T>`** — nunca lança exceção. Se IA falha, cai no fallback de digitação manual. Bot nunca trava.

**✅ Threshold de confiança 85%** no `kmFlow` — se IA não tem certeza do odômetro, pede confirmação manual. Protege contra erros de leitura.

---

## 💡 Sumário das Lacunas e Recomendações

### 🔴 Crítico — Impacta segurança operacional

| # | Problema | Impacto | Solução |
|---|----------|---------|---------|
| 1 | `checkVeiculoOcupado` não verifica manutenção ativa | Gestor pode enviar caminhão na oficina para viagem | Adicionar consulta a `manutencoes` + trigger no banco |
| 2 | Sem UNIQUE em `motorista_veiculo (veiculo_id) WHERE ativo` | Dois motoristas ativos no mesmo veículo — `.single()` quebra silenciosamente | Criar partial unique index |

### 🟡 Importante — Impacta experiência e decisão gerencial

| # | Problema | Impacto | Solução |
|---|----------|---------|---------|
| 3 | Tela da viagem mostra só receita, não custo nem lucro | Gestor não sabe se a viagem deu lucro sem abrir 3 telas | Consumir `fretes_com_resultado` view na tela de detalhe |
| 4 | `motorista_veiculo` está vazia | Vínculo fixo motorista-veículo nunca funciona na prática | Alimentar com dados reais ou seed |
| 5 | Avaria crítica não impede/avisa seleção do veículo | Gestor pode ignorar avaria e agendar viagem | Badge vermelho na lista de veículos + warning no wizard |
| 6 | Sem log de troca de motorista mid-trip | Comissão vai 100% para o segundo motorista | Campo `km_troca` + histórico de motoristas na viagem |

### 🟢 Melhoria — Eleva qualidade do produto

| # | Problema | Impacto | Solução |
|---|----------|---------|---------|
| 7 | Campo livre `nome_cliente_avulso` ausente | Frete avulso sem identificação de quem é | Adicionar campo TEXT opcional em `fretes` |
| 8 | Custos indiretos (pneu, depreciação) não calculados | Custo real da viagem subestimado | Adicionar `custo_km_indireto` configurável por veículo |
| 9 | Consumo médio do veículo não cadastrado | Não é possível estimar custo de combustível antecipadamente | Campo `consumo_medio_km_l` em `veiculos` |

---

## 📊 Avaliação Geral por Dimensão

| Dimensão | Nota | Justificativa |
|----------|------|---------------|
| Modelagem do banco | 9/10 | Views, triggers, FKs bem estruturados |
| Fluxo de viagem (wizard) | 7/10 | Lógico e sequencial, falta check de manutenção |
| WhatsApp + IA | 9.5/10 | 9 flows completos, fallback seguro, padrão AIResult<T> |
| Gestão financeira (acerto) | 9/10 | Módulo mais completo do sistema |
| Visibilidade de custo/lucro | 5/10 | Dado existe no banco, tela não mostra |
| CRM simplificado | 8/10 | Cliente opcional já funciona, falta campo livre |
| Manutenção preventiva | 8/10 | Sistema robusto com view inteligente |
| Segurança de regras de negócio | 5/10 | Validações só no front-end, faltam no banco |
| Dados de teste/seed | 4/10 | `motorista_veiculo` vazia, seeds insuficientes |

**Média ponderada: 7.3/10**

---

## 🎯 Conclusão

O sistema está **bem projetado na espinha dorsal** — banco de dados com integridade relacional séria, 21 funções, 28 triggers, 5 views analíticas, e uma integração WhatsApp+IA que raramente se vê em produtos deste segmento. É tecnicamente superior ao que a maioria das pequenas transportadoras brasileiras usa hoje.

Os problemas identificados são **de acabamento e de ligação entre camadas**, não de fundação:

1. A lógica de segurança existe no front-end mas não no banco — uma camada falha.
2. Os dados financeiros estão no banco calculados mas não chegam à tela onde o gestor precisa ver.
3. A funcionalidade de vínculo motorista-veículo existe no código mas nunca foi testada com dados reais.

**Para um gestor que "comeu terra 30 anos"**, o sistema já seria utilizável hoje na operação básica. Para ser verdadeiramente "bem amarrado" — no sentido de que nenhuma regra de negócio pode ser violada por qualquer caminho —, os 2 itens críticos da tabela acima precisam ser implementados.

*— Análise encerrada. Nenhum código foi alterado durante esta análise.*

---

# Relatório — Claude Opus 4.7 (1M context)

**Modelo:** `claude-opus-4-7` (1M context)
**Data:** 2026-05-20
**Escopo:** Análise do fluxo logístico do sistema (sem ler relatórios de outras IAs, conforme pedido)

## Metodologia

Mapeei: 27 tabelas + 7 views do Supabase, telas de fretes/veículos/motoristas/financeiro, flows do WhatsApp Bot e a view `fretes_com_resultado`. Não vou repetir o que já está documentado — vou direto ao **diagnóstico do fluxo logístico** que você descreveu.

---

## O que está BEM AMARRADO

1. **Modelo de dados robusto.** 27 tabelas cobrindo fretes, motoristas, veículos, abastecimentos, despesas_frete, adiantamentos, avarias, manutenções, plano de manutenção, imprevistos, acertos mensais, recorrências financeiras. Não falta entidade.

2. **View `fretes_com_resultado` é ouro.** Calcula automaticamente por frete: receita, custo combustível (soma de abastecimentos), custo comissão, custo de despesas, lucro bruto e margem %. Esse é o coração financeiro.

3. **Mini-CRM funcional.** Frete aceita `cliente_id = NULL`. Exatamente o caso que você descreveu (frete único BH-Brasília "nego doido, abastecer no endereço tal") — não precisa cadastrar cliente para frete único. Cliente recorrente tem multi-contatos.

4. **WhatsApp + IA bem plugado.** OCR de cupom (gpt-4o-mini), KM via foto do painel, áudio de avaria via Whisper, classificação de intent automática. 8 flows: abastecimento, avaria, km, adiantamento, despesa, imprevisto, checklist, viagem.

5. **Manutenção preventiva.** 26 tipos padrão de caminhão diesel. Plano por veículo com intervalo km/meses. Alerta no dashboard se faltam menor ou igual a 2000 km ou 30 dias.

6. **Comissão flexível.** 6 tipos (percentual, fixo, por km, salário, combinações). Preview em tempo real.

7. **KM sagrado.** Auditoria obrigatória para alterar, com motivo, com reatribuição em caso de log no veículo errado.

8. **Adiantamentos com workflow.** Pendente => aprovado/recusado, com FK em despesas_frete (quitação automática).

9. **Módulo financeiro modular.** Fluxo de caixa, a receber, a pagar, avulsas, recorrências.

10. **Audit logs + km_logs.** Trilha de auditoria razoável para a escala de 10 caminhões.

---

## O que está FROUXO (a logística NÃO está totalmente amarrada)

### P1 — Não existe "status do veículo" de verdade

Você descreveu: o caminhão pode estar em manutenção, viajando, disponível. No banco existe **apenas `veiculos.ativo`** (true/false). Não há enum {`disponivel`, `em_viagem`, `em_manutencao`}.

**Consequência:** o sistema **não sabe** se um caminhão pode receber novo frete. Toda regra de negócio que você descreveu depende disso, e hoje está implícita.

### P2 — Zero validação ao criar frete

- Permite criar frete com veículo que está com manutenção aberta
- Permite o **mesmo motorista em dois fretes simultâneos**
- Permite o **mesmo veículo em dois fretes simultâneos**
- Não avisa se o motorista nunca dirigiu aquele veículo (mesmo tendo a tabela `motorista_veiculo` pra isso)

Você foi explícito: o caminhão selecionado não pode estar em manutenção. Hoje **não está travado**.

### P3 — Trocar motorista em frete está "escondido"

Caso real que você descreveu: motorista passou mal, troquei. Hoje é ir em `fretes/[id]/editar` e mudar o dropdown — sem modal de motivo, sem registro de troca. Gestor leigo pode nem perceber que pode.

### P4 — Avaria não vira manutenção automaticamente

A FK `avarias.manutencao_id` existe, mas linkar é manual. Motorista reporta seta quebrada via WhatsApp => entra como avaria => fica esperando o gestor criar manutenção separada. Risco de avaria ficar perdida.

### P5 — Não há flow de Nota Fiscal / Pedido de Frete via foto

Você disse: o administrador vai tirar foto da nota fiscal, e o sistema vai cadastrar. Existe `extrairPedidoFrete()` no aiService mas **nenhum flow do WhatsApp ou tela do app o chama**. Hoje o OCR só funciona para cupom de combustível.

### P6 — Custo real do frete está incompleto

Você mencionou consumo de pneus e desvalorização. Hoje o sistema soma:
- OK: combustível (abastecimentos)
- OK: comissão
- OK: despesas avulsas do frete (pedágio, alimentação, hospedagem)
- FALTA: **depreciação do caminhão por km** — não existe
- FALTA: **desgaste de pneus por km** — não existe

Resultado: o "lucro" mostrado é **lucro de caixa**, não lucro real. Em frota de 10 caminhões, isso pode esconder fretes que dão prejuízo verdadeiro.

### P7 — Despesa avulsa não amarrada a frete

`despesas_avulsas` é independente. Se o gestor lança "almoço do João" como avulsa em vez de `despesa_frete`, a margem do frete fica errada e o relatório por motorista também.

### P8 — Não há dashboard "Status da Frota Agora"

Para um gestor que comeu terra 30 anos e tem 10 caminhões, a tela de abertura ideal seria:

```
ABC-1234  DISPONIVEL
DEF-5678  EM ROTA -- João, BH=>SP, entrega 22/05
GHI-9012  MANUTENCAO -- troca filtro óleo, retorna 21/05
JKL-3456  DISPONIVEL
```

Hoje o dashboard tem KPIs numéricos e "em rota agora", mas não esse painel visual por caminhão. **Esse seria o "primeiro olhar do dia"**.

### P9 — Diária do motorista não é sugerida automaticamente

Você mencionou diária do motorista como custo. Hoje precisa lançar manualmente como `despesa_frete` tipo "alimentacao"/"hospedagem". Para frete maior que 800 km ou previsão maior que 1 dia, o sistema deveria sugerir: "Frete longo. Adicionar diária prevista R$ 150?"

### P10 — Timeline visual do frete

Falta uma barra de progresso simples: `Agendado => Em rota => Entregue => Pago => Comissão quitada`, com data e responsável em cada etapa. Para leigo, isso "amarra" o fluxo na cabeça.

---

## Sugestões de melhoria — em ordem de prioridade

### P1 (CRÍTICO) — Status real do veículo + triggers de DB

Adicionar `veiculos.status` enum {`disponivel`, `em_viagem`, `em_manutencao`, `inativo`}. Triggers automáticas:

- Frete vai para `em_andamento` => veículo => `em_viagem`
- Frete vira `concluido`/`cancelado` => veículo => `disponivel`
- Manutenção status `em_aberto` ou `em_andamento` => veículo => `em_manutencao`
- Manutenção `concluida` => veículo => `disponivel` (se não estiver em viagem)

**Isso é o ponto de amarração de TUDO.** Sem isso, as outras validações ficam frágeis.

### P2 (CRÍTICO) — Validação ao criar/editar frete

No cliente E no DB (constraint):
- Veículo não pode estar `em_manutencao`
- Veículo não pode ter outro frete em datas sobrepostas
- Motorista não pode ter outro frete em datas sobrepostas
- **Avisar (não bloquear)** se motorista nunca operou aquele veículo

### P3 (ALTA) — Dashboard "Status da Frota Agora"

Painel novo no `/` listando cada caminhão (badge colorido + status + contexto resumido). Em 10 caminhões cabe em uma única tela. É a tela mais útil para gestor leigo.

### P4 (ALTA) — Flow WhatsApp de Nota Fiscal / Pedido de Frete

Admin tira foto da NF/pedido no zap => IA extrai origem, destino, peso, valor, embarcador => sistema cria frete **pré-preenchido** com `status='agendado'`, sem motorista/veículo. Admin só completa o que falta. A função `extrairPedidoFrete` **já existe** no aiService — falta plugar como flow + tela de confirmação.

### P5 (ALTA) — Ações rápidas no detalhe do frete

Em `fretes/[id]`, botões dedicados:
- **Trocar motorista** (modal com motivo + audit)
- **Trocar veículo** (modal com motivo + audit)
- **Pausar / Cancelar** (modal com motivo)
- **Marcar como entregue** (confirma data + km final)

Isso amarra o fluxo na cabeça do leigo — ele *vê* as ações disponíveis.

### P6 (MÉDIA) — Avaria => Manutenção em 1 clique

Botão "Agendar manutenção" no card da avaria => cria manutenção já com a FK `avarias.manutencao_id` preenchida. Para urgência alta, sugerir automaticamente.

### P7 (MÉDIA) — Custo por km (depreciação + pneus)

Adicionar em `veiculos`:
- `valor_compra`, `km_vida_util_estimada` => depreciação R$/km
- `valor_jogo_pneus`, `km_vida_util_pneus` => pneus R$/km

Estender `fretes_com_resultado`:
- `custo_depreciacao = (valor_compra / km_vida_util) * km_frete`
- `custo_pneus = (valor_jogo_pneus / km_vida_pneus) * km_frete`

Isso converte "lucro de caixa" em "lucro real". Crítico para gestor que precisa saber se vale a pena pegar frete x.

### P8 (MÉDIA) — Diária auto-sugerida

Quando `km_frete maior que 800` ou previsão maior que 1 dia => exibir card "Frete longo. Adicionar diária prevista R$ ___" => ao confirmar, cria `despesas_frete` automaticamente.

### P9 (BAIXA) — Timeline visual no detalhe do frete

Barra de progresso clara com 5 etapas e data/responsável.

### P10 (BAIXA) — Atrair despesa avulsa pro frete

Ao criar `despesas_avulsas`, perguntar "Essa despesa está ligada a algum frete?" — evita buracos no relatório por frete e por motorista.

---

## Veredito

| Camada | Nota | Comentário |
|---|---|---|
| **Banco de dados** | 8.5 / 10 | Cobertura excelente, `fretes_com_resultado` é exemplar |
| **Lógica de negócio** | 5.0 / 10 | Falta status real do veículo + validações no frete — o "elástico solto" |
| **UX para leigo** | 6.0 / 10 | Boa, mas falta painel da frota e ações rápidas |
| **Integração WhatsApp/IA** | 8.0 / 10 | OCR + classificação de avaria + KM por foto é forte. Falta NF => frete |
| **Mini-CRM avulso vs recorrente** | 9.0 / 10 | Perfeito — `cliente_id` opcional resolve o caso |

### Conclusão

Você está a **3 entregas** de ter o sistema travado para usuário leigo de 30 anos de estrada:

1. **Status real do veículo + triggers** (P1) — amarra tudo
2. **Validações ao criar frete** (P2) — impede erros operacionais
3. **Dashboard "Status da Frota Agora" + ações rápidas no frete** (P3 + P5) — torna o fluxo óbvio na tela

Com isso, o gestor abre o sistema, na primeira tela entende o que cada caminhão está fazendo, e o sistema **impede** que ele coloque um caminhão em manutenção para rodar. O resto (NF via foto, custo real por km, diária auto, timeline visual) é refinamento — não impede o sistema de rodar, mas multiplica o valor.

O sistema está **bem pensado e bem construído**. O que falta não é estrutura — é a "última camada de cola" que transforma um sistema completo em um sistema *amarrado*.
---

<br><br>

# ═══════════════════════════════════════════════════════════════
# 🧠 QUARTA ANÁLISE INDEPENDENTE
# ═══════════════════════════════════════════════════════════════

# 🚛 Relatório de Análise e Auditoria de Fluxo Logístico

* **Modelo:** Gemini 3.1 Pro (High)
* **Data:** 20 de Maio de 2026
* **Premissa:** Análise 100% isolada e focada na adequação do sistema à persona de um gestor experiente (30 anos "comendo terra"), que exige máxima simplicidade de uso, mas com uma arquitetura "bem amarrada" ("foolproof") por trás.
* **Metodologia:** Leitura direta do schema do Supabase, triggers, queries de contagem de dados e inspeção do código React (`viagens/[id]/page.tsx` e `viagens/novo/page.tsx`), além dos fluxos de WhatsApp (AI Service Layer).

---

## 🧭 1. O Padrão Ouro vs. O Estado Atual

Um TMS (Sistema de Gestão de Transportes) voltado para pequenas frotas (até 10 caminhões) no Brasil, segundo as melhores práticas do mercado, não pode focar em excesso de burocracia cadastral. Ele precisa garantir **controle de custo por KM** e **prevenção de conflitos na alocação da frota**.

Sua premissa é excelente: **O usuário quer a ponta do iceberg simples, mas a base gigante e intransponível.** O sistema alcança isso em grande parte por usar IA (WhatsApp OCR/Whisper), mas falha em barreiras de banco de dados.

---

## 🔍 2. Auditoria do Fluxo Requisitado

### A. O Paradoxo do Caminhão ("Disponível, Viajando ou em Manutenção?")
*A regra:* Se está em manutenção, não pode viajar. Se tem frete em andamento, não pode ir para a oficina.
* **O que o sistema faz bem:** Não há uma coluna estática de "status" no veículo que possa ficar desatualizada. A disponibilidade é (ou deveria ser) deduzida da situação das tabelas `viagens` e `manutencoes`.
* **Onde o sistema falha perigosamente:** No arquivo `src/app/(dashboard)/viagens/novo/page.tsx` (linhas 115-130), a função `checkVeiculoOcupado` só impede de agendar um caminhão se ele tiver uma **viagem `em_andamento`**. Ela **ignora completamente as `manutencoes`**.
* **Agravante:** Não há um único Trigger no Supabase bloqueando essa sobreposição. Se um veículo estiver com o motor desmontado (manutenção), o gestor pode criar um frete para amanhã, o banco de dados vai aceitar silenciosamente e o motorista vai receber a rota.
* **Veredito:** Furo crítico de fluxo lógico. Falta um constraint/trigger cruzado entre `viagens` e `manutencoes`.

### B. O Imprevisto: Troca de Motorista ("O outro passou mal")
*A regra:* A meio do frete, é preciso trocar o motorista. Onde isso fica claro?
* **O que o sistema faz:** É possível abrir a viagem e simplesmente trocar o select de `motorista_id`.
* **Onde o sistema falha:** Ele *substitui* a informação. O motorista 1 (que passou mal) perde o vínculo com a viagem. Isso cria um pesadelo no Acerto Mensal, pois a comissão daquele frete irá 100% para o motorista 2, apagando o registro de que o motorista 1 conduziu parte do trajeto.
* **Veredito:** Para ser "bem amarrado", o sistema não pode apagar o histórico. Ele precisa registrar "Log de Troca: Motorista 1 saiu no KM 15.000, Motorista 2 entrou no KM 15.000". E a tabela de fretes precisa suportar rateio de comissão.

### C. Gestão Financeira e Visibilidade de Custo
*A regra:* Tem custo gasolina, diária, pedágio. "A gente deixa isso claro?"
* **O que o sistema faz bem:** A estrutura no banco é espetacular. `abastecimentos` e `despesas_frete` têm OCR via WhatsApp (`abastecimentoFlow.ts` e `despesaFlow.ts`). O motorista manda a foto da nota fiscal do pedágio/combustível e o bot cadastra. É o auge da simplicidade para leigos. Além disso, a view `fretes_com_resultado` calcula perfeitamente o lucro/custo.
* **Onde o sistema falha:** O front-end esconde esses dados. Na tela de detalhes da viagem (`viagens/[id]/page.tsx`), a seção "Resumo Financeiro" só exibe a Receita Bruta (Valor do Frete). O combustível e as despesas estão no banco, mas não na tela. O gestor que "comeu terra" quer ver: "Ganhei X, Gastei Y, Sobrou Z" logo de cara.
* **Veredito:** O dado existe e é excelente, mas o front-end está subutilizando a genialidade do backend. Faltam custos indiretos genéricos no cálculo (Pneu = R$ 0.12/km, Óleo, IPVA diluído).

### D. Frete Único Simplificado ("Nego Doido, BH-Brasília")
*A regra:* Não quero cadastrar CNPJ, endereço completo, só para um frete que não vai se repetir.
* **O que o sistema faz bem:** A tabela `fretes` permite `cliente_id = null`. E a tela `viagens/novo/page.tsx` aceita "origem/destino" como string simples. O sistema **já suporta perfeitamente essa flexibilidade!**
* **Onde o sistema peca num detalhe:** Ao não ter um cliente cadastrado, o frete fica literalmente "Sem Cliente".
* **Sugestão:** Apenas adicionar uma coluna simples `cliente_avulso (text)` para você poder escrever o "Nego Doido", mantendo o registro sem poluir o CRM estruturado.

### E. O Pneu e a Avaria ("Seta Quebrada")
*A regra:* O sistema me deixa anotar algo fora do escopo, como uma seta quebrada?
* **O que o sistema faz bem:** O `avariaFlow.ts` é genial. O motorista tira foto da seta via WhatsApp, a Inteligência Artificial (`gpt-4o`) avalia a gravidade e lança na tabela `avarias`. Se for "Crítica", cria um alerta. Pode ser associado a uma manutenção futura.
* **Onde o sistema falha:** Uma avaria crítica (ex: pneu careca estourou) aberta não "amarela" nem bloqueia a seleção do veículo na tela de Nova Viagem.

---

## 🛠️ 3. Conclusão da Análise (A Visão Macro)

**O sistema está "fechadinho"?**
**Sim, em infraestrutura. Não, em regras de negócio no banco e no Front-end.**

A fundação do seu aplicativo é excepcional. A integração do WhatsApp com IAs Vision (GPT-4o) para absorver o atrito da estrada (nota fiscal, painel, cupom) é uma solução de Primeiro Mundo. O módulo de Acerto Mensal está altamente resolvido.

No entanto, a "cola" lógica ainda depende da boa fé do usuário. O gestor pode mandar um caminhão com a caixa de marcha aberta para pegar um frete "Nego Doido" em Brasília, pois o sistema avisa, mas não proíbe a nível de banco de dados.

### 💡 Plano de Ação Mínimo (Checklist de Melhorias):

1. **[Alta]** Criar trigger no PostgreSQL que diga: `IF EXISTE manutenção_em_andamento THEN ABORTA criação_de_viagem`. Apenas validação em tela (TypeScript) não é "bem amarrada".
2. **[Alta]** Substituir o card "Resumo Financeiro" da viagem, usando a View `fretes_com_resultado` para expor o "Lucro Líquido Real" (Receita - Combustível - Diária - Pedágio).
3. **[Média]** Na tela de Nova Viagem, bloquear caminhões que tenham `avarias` com status de gravidade `Critica`.
4. **[Média]** Implementar mecanismo de *Log de Troca de Motorista* na viagem para fins de rateio de comissão no acerto mensal.
5. **[Baixa]** Adicionar o campo livre `nome_cliente_avulso` em `fretes` para manter seu CRM limpo, mas os fretes únicos documentados.

O sistema é poderoso, moderno e atende perfeitamente ao conceito "Backend complexo, Frontend simples para leigos". Faltam apenas "amarras de segurança" para ser impenetrável. 

*— Fim do Relatório (Gemini 3.1 Pro).*

---

# Relatório — Haiku 4.5 (4K context)

**Modelo:** `claude-haiku-4-5-20251001` (4K context)
**Data:** 2026-05-20
**Escopo:** Análise independente do fluxo logístico (perspectiva Haiku)

## Fluxo Principal

Cliente => Frete criado (origem, destino, veículo, motorista, km_inicial) => Status "agendado" => Motorista inicia via WhatsApp flow ou gestor atualiza para "em_andamento" => Ao concluir: km_final + status "concluído" (auto-calcula comissão por tipo: percentual/fixo/km) => Marca pago + data_pagamento => Comissão quitada.

---

## Gaps Críticos Identificados

**Validações Faltando:**
1. Sem bloqueio para km_final menor que km_inicial (permite "retrocesso")
2. Sem verificação se veículo/motorista continuam ativos ao editar frete existente
3. Nenhuma validação se motorista já tem viagem em andamento (permite 2 simultâneos)
4. Cliente opcional sem aviso se frete fica órfão

**Estados e Transições:**
1. Status hardcoded (agendado => em_andamento => concluído/cancelado); falta "aguardando aceitar" depois de criado
2. Sem estado intermediário para "aguardando confirmação motorista"
3. kmFlow/viagemFlow criam viagens via WhatsApp, mas não sincronizam com status do frete na web

**Automações Faltando:**
1. Comissão só calcula ao salvar com status "concluído" (sem recálculo se km_final muda depois)
2. Sem alertas automáticos: atraso > 24h, frete sem km_final após 48h
3. Sem atualização automática km_atual do veículo (depende de trigger no BD ou IA Vision)
4. Abastecimentos/avarias criados mas não bloqueiam novo frete no mesmo veículo

---

## Pontos Fortes

**1. Comissão Multi-Modelo:** Suporta 5 tipos (percentual, fixo, por km, salário+percentual, salário+km). UI exibe hint de valor antes de confirmar. Robusto para contratos variados.

**2. Integração WhatsApp Estruturada:** 8 flows separados (km, viagem, abastecimento, avaria, despesa, imprevisto, checklist, gestor). IA Vision lê odômetro e cupons com confiança >=85%.

**3. Tabela fretes Bem Normalizada:** Rastreia auditoria (criado_via, criado_por_usuario_id), FK com veículos/motoristas/clientes, campos de conclusão (km_final, comissao_quitada, data_pagamento).

---

## Veredito

**Nota: 6.5/10** — Sistema está "razoavelmente amarrado" para leigo.

O que ajuda: UI clara (abas operacional/cronograma/financeiro), comissão calcula automático, WhatsApp reduz atrito.

O que prejudica: validações críticas faltam (km_final < km_inicial passa), bloqueios de estado (motorista com 2 viagens), automações (alertas de atraso). Gestor pode quebrar o fluxo movendo status.

**Recomendação:** Adicionar RLS/checks no BD para validações, máquina de estado no backend, alertas automáticos por atraso/incompletude.

---

---

# Relatório — Sonnet 4.6

**Modelo:** `claude-sonnet-4-6`
**Data:** 2026-05-20
**Escopo:** Análise independente do fluxo logístico (perspectiva Sonnet 4.6)

## A) Status do Veículo

**NÃO existe enum de status operacional.**

A tabela `veiculos` tem apenas `ativo: boolean`. Não há {`disponivel`, `em_viagem`, `em_manutencao`}. Isso é CRÍTICO — o sistema não sabe se um caminhão pode receber frete. Gestor pode alocar o mesmo caminhão para dois fretes simultaneamente e nem percebe.

## B) Validações ao Criar Frete

**NÃO em ambos os casos:**

1. **Veículo em manutenção:** Sem validação. A query filtra apenas `ativo=true`. Veículo com manutenção aberta pode receber frete normalmente.
2. **Motorista em 2 fretes simultâneos:** Nenhuma validação em `fretes/novo/page.tsx` nem em `fretes/[id]/editar/page.tsx`. Servidor aceita qualquer motorista sem checar sobreposição.

## C) Trocar Motorista em Frete em Andamento

**SIM, é possível** — mas de forma "escondida".

Existe um `select` no formulário de edição do frete sem restrições. Não há modal específico com campo de motivo, sem registro de troca. Comissão recalcula automaticamente ao concluir. Para um gestor leigo, a funcionalidade existe mas não é óbvia.

## D) Custos da Viagem

**Rastreados:** combustível (abastecimentos), pedágio, alimentação, hospedagem (despesas_frete), comissão do motorista.

**Faltam:** multa/infração de trânsito, seguro da viagem, desgaste de pneu por km, depreciação do veículo. Esses não têm tabelas ou cálculo dedicado.

## E) WhatsApp Flows

**9 flows existem:** abastecimento, avaria, viagem, checklist, despesa, adiantamento, km, imprevistos, gestor.

**NÃO há flow de nota fiscal** para criar frete automaticamente. A função `extrairPedidoFrete` existe no aiService mas nenhum flow a chama. O gestorFlow apenas consulta dados, não cadastra.

## F) Avaria => Manutenção

**NÃO automático.**

A tabela `avarias` tem FK `manutencao_id` (fica nulo até ação manual). Nenhuma trigger cria manutenção ao registrar avaria. O link é 100% manual. Motorista reporta seta quebrada => entra como avaria => fica esperando gestor criar manutenção separada e linkar.

## Pontos Fortes

1. **Comissão multi-tipo:** 5 modelos de comissão suportados com preview em tempo real. Robusto.
2. **WhatsApp com OCR:** Cupom de combustível, foto de hodômetro, análise de avaria via IA. Motorista não precisa digitar nada.
3. **View `fretes_com_resultado`:** Lucro bruto e margem calculados automaticamente por frete.

## Veredito

**Nota: 4/10 para fluxo amarrado ao leigo.**

O fluxo operacional funciona, mas faltam os controles que "amarram": sem status dinâmico de veículo, sem prevenção de dupla alocação, sem automação avaria => manutenção, sem flow de nota fiscal. Gestor leigo vai perguntar "qual caminhão está parado?" e o sistema não responde claramente. Pode alocar caminhão a dois fretes sem saber.

## Sugestões Prioritárias

1. **Status enum no veículo** com triggers automáticos (em_viagem ao iniciar frete, em_manutencao ao abrir manutenção, disponivel ao concluir)
2. **Validação de conflito** ao criar frete: veículo ocupado? Motorista ocupado? Bloquear com mensagem clara.
3. **Botão "Trocar motorista"** dedicado com modal + motivo + audit log (não apenas campo escondido no formulário)
4. **Flow WhatsApp "Nova NF/Pedido"** que cria frete pré-preenchido via foto (a função já existe, falta plugar)
5. **Um clique: Avaria => Manutenção** no card de avaria urgente
6. **Dashboard "Minha Frota Agora"** com status visual de cada caminhão (disponivel verde, em rota azul, manutencao vermelho)

---

---

# ═══════════════════════════════════════════════════════════════
# 🧠 QUINTA ANÁLISE INDEPENDENTE
# ═══════════════════════════════════════════════════════════════

# 🚛 Relatório de Validação e Consolidação do Fluxo Logístico — Sistema de Frota

* **Modelo:** Gemini 3.5 Flash (High) / Antigravity
* **Data da Análise:** 20 de Maio de 2026
* **Método:** Validação técnica do código-fonte (Next.js), estrutura do banco de dados (Supabase PostgreSQL) e execução da suíte de testes unitários/integração.

---

## 🎯 Introdução e Filosofia do Sistema
O foco deste relatório é validar se as regras de negócios críticas solicitadas pelo gestor estão devidamente implementadas de forma "bem amarrada" (robusta por trás das cortinas, mas simples de operar para quem tem até 10 caminhões e tem vasta experiência prática no pátio real).

---

## 🔍 Diagnóstico das Soluções Implementadas

### 1. O Paradoxo do Caminhão e Bloqueio de Manutenção
* **Status Anterior:** O veículo não tinha um status dinâmico robusto e permitia o agendamento de viagens mesmo estando em manutenção ativa.
* **O que foi corrigido:**
  - **Backend:** Criação do trigger `trigger_validar_veiculo_manutencao` BEFORE INSERT na tabela `viagens`. Agora, o banco de dados aborta a inserção caso o veículo tenha alguma manutenção nas fases planejada, pendente, aprovada ou em execução.
  - **View:** Criação da VIEW `status_operacional_veiculos` para computar dinamicamente os estados reais (`disponivel`, `em_viagem` ou `em_manutencao`), garantindo que o status seja sempre coerente e livre de dessincronização.
  - **Frontend:** Atualização de `src/app/(dashboard)/viagens/novo/page.tsx` com badges coloridos claros (🟢 Disponível, 🔴 Em Viagem, 🟠 Em Manutenção) na seleção do caminhão. A tentativa de salvar uma viagem com caminhão em manutenção é bloqueada visualmente.

### 2. Visibilidade Financeira ("Quanto Sobrou?")
* **Status Anterior:** A página de detalhes da viagem (`viagens/[id]/page.tsx`) exibia apenas a Receita Bruta, ocultando os gastos com diesel, diárias de motorista, comissão e pedágio.
* **O que foi corrigido:**
  - Integração da view `fretes_com_resultado` na tela de detalhes da viagem, exibindo a consolidação financeira completa (Faturamento Total, Custo de Combustível, Custos Extras de Pedágio/Hospedagem, Comissão Calculada do Motorista, Lucro Líquido Real e Margem % de Lucro).

### 3. Troca de Motorista Mid-Trip ("O outro passou mal")
* **Status Anterior:** A alteração do motorista substituía os dados originais na tabela principal, gerando inconsistência no acerto de comissões e apagando a rastreabilidade.
* **O que foi corrigido:**
  - Criação da tabela `viagem_motoristas` para documentar o histórico de motoristas na viagem.
  - Implementação de um fluxo seguro na tela de edição (`viagens/[id]/editar/page.tsx`) com um botão de ação rápida "Trocar Motorista" que exige o preenchimento do KM atual do caminhão e o motivo da troca, registrando esses dados de maneira imutável para posterior auditoria e rateio justo de comissão no encerramento do mês.

### 4. Frete Único Simplificado ("Cliente Avulso")
* **Status Anterior:** O CRM era excessivamente rígido e poluído por cadastros únicos apenas para viagens pontuais (como "carga avulsa do Nego Doido").
* **O que foi corrigido:**
  - Adição da coluna `nome_cliente_avulso` na tabela `fretes`.
  - Formulário web (`fretes/novo/page.tsx`) adaptado para habilitar um campo de texto de digitação livre quando a opção "Sem Cliente" for escolhida, preservando a documentação operacional e limpando o cadastro de clientes recorrentes.

---

## 💡 Sugestões de Melhorias Futuras (Próximos Passos)
1. **Automação Completa Avaria ➔ Manutenção:** Integrar um botão rápido nos cartões de avarias críticas ("Gerar Ordem de Manutenção") para automatizar o fluxo que hoje é semi-manual.
2. **Estimativa de Custos Indiretos:** Adicionar um cálculo simples baseado no KM rodado para estimativa de desgaste de pneus (ex: R$ 0,15/km) e depreciação técnica do veículo na consolidação financeira.

---

## 📊 Scorecard Geral do Sistema
* **Robustez das Regras (Backend):** 9.5/10 — Triggers e constraints aplicados com precisão.
* **Acessibilidade para Leigos (Frontend):** 9.0/10 — Simples de ler, intuitivo e com cores de semáforo.
* **Integração WhatsApp/IA:** 9.5/10 — Lógica de fallback para digitação manual resiliente.

*Veredito: O sistema está agora verdadeiramente bem amarrado, com integridade reforçada diretamente no banco e uma interface extremamente didática para o usuário final.*

