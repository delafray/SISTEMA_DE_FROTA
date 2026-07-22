# 🧪 POLÍTICA DE TESTES — RECOMENDADO (não obrigatório)

> **Atualização (04/06/2026):** o dono do projeto **relaxou** a exigência. Testes deixaram de ser obrigatórios. Antes era "sem teste = trabalho rejeitado"; **isso não vale mais**.

**Regra atual para qualquer IA:**

1. Criar/atualizar testes é **recomendado**, especialmente em lógica de negócio (cálculos, flows, schemas) — mas **não bloqueia** concluir a tarefa.
2. Rodar `npm test` é **recomendado** antes de mudanças grandes ou de risco. **NÃO** rode a cada microedição — o dono achou isso chato e improdutivo.
3. Se rodar, reporte o resultado. Se não rodar, sem problema.

`npm test` roda **local + mockado** → custo de API zero. O resto deste arquivo (o que testar, como rodar, áreas sem cobertura) continua válido como **guia** pra quando você QUISER testar.

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

> Atualizado em 22/07/2026 — a tabela estava defasada: TODOS os 10 flows já têm teste.

| Área | Cobertura atual | Onde |
|---|---|---|
| Schemas (cliente, motorista, veículo) | ✅ Coberto | `src/__tests__/schemas/` |
| WhatsApp parser/sender/router/auth | ✅ Coberto | `src/__tests__/whatsapp/` |
| TODOS os 10 flows (Avaria, Abastecimento, Km, Despesa, Viagem, Gestor, Adiantamento, Checklist, Imprevisto, ApagarUltimo) | ✅ Coberto (138 testes) | `src/__tests__/whatsapp/flows/` |
| Status do veículo via bot (parseStatusVeiculo) | ✅ Coberto (11/06) | `src/__tests__/whatsapp/` |
| Validação de KM no bot (KmFlow, 18 testes) | ✅ Coberto | `src/__tests__/whatsapp/flows/kmFlow.test.ts` |
| Cálculo do acerto mensal (salário + diária × pedidos + ajustes − adiantamentos) | ✅ Coberto (22/07) | `src/__tests__/lib/acertoMensal.test.ts` (lógica em `src/lib/financeiro/acertoMensal.ts`) |
| KPIs financeiros com RPC + fallback | ✅ Coberto (22/07) | `src/__tests__/lib/financeiro/` |
| Pedido: km_final >= km_inicial nas TELAS (entregas/editar, despacho) | ❌ FALTA (validação hoje só no bot; se centralizar em lib, testar) | `src/__tests__/lib/pedidoValidation.test.ts` |
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

📄 **O log foi movido para [TESTING_LOG.md](./TESTING_LOG.md)** para não inflar o contexto carregado pelas IAs (o CLAUDE.md importa este arquivo inteiro toda sessão).

**Anexe sua linha no FINAL de TESTING_LOG.md** após cada tarefa — NÃO aqui.

---

## 🎯 OBJETIVO FINAL

Quando todas as IAs respeitarem esta política, o sistema terá:

- **Cobertura > 70%** das funções de lógica de negócio
- **Suíte verde** em todo commit
- **Confiança** para o dono do projeto liberar mudanças sem medo de regressão
- **Documentação viva** dos comportamentos esperados (cada teste é um exemplo)

**Este arquivo não é decorativo. Ele é uma regra.**

Se você é uma IA lendo isto: confirme que leu, criou os testes e rodou a suíte. Se não fez, volte e faça antes de responder.
