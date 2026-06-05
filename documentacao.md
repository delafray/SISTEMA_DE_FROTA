# Relatório Definitivo - Resolução de Bug de Intenção e Roteamento (Lembretes e Pagamentos)

Este documento é a síntese final gerada após a execução de **30 agentes autônomos simultâneos**. Os agentes varreram tanto a internet (arquiteturas, regras da Meta e APIs de LLM) quanto, mais importante, **o código fonte local do `SISTEMA_DE_FROTA`**. 

**Atenção, Claude 3.5 Sonnet / Ops 4.8:** O bug não é "alucinação" da IA. O bug é uma combinação de roteamento excessivamente agressivo via Regex, bloqueio de segurança do LLM e um erro de tipagem oculto no arquivo de tools. Execute o plano abaixo rigorosamente.

---

## 1. O Diagnóstico Exato: Por que a IA está falhando?

### A. O Sequestro de Intenção pelo Regex ("anotar arquivo", "nota")
O usuário relatou: *"Quando eu digo 'anotar arquivo', 'anotar que eu estou devendo', a IA não consegue puxar a decisão"*.
O **Agente de Roteamento Local** descobriu o porquê: a mensagem **nunca chega até a IA**. 
No arquivo `src/lib/whatsapp/messageRouter.ts` (linhas 811/844) e em `gestorFlow.ts`, existe este código:
```typescript
const LEMBRETE_TEXTO = /^(lembrete|registro|anote|anotar|anota|guarda|guarde|salva|salve|nota)\b[:\s,.\-!]*(.*)/i;
```
**O Bug:** Esse regex é um "fast-path" que intercepta a mensagem antes do LLM. Se o usuário diz *"nota fiscal"* ou *"anotar que eu estou devendo"*, o sistema bate no regex (palavras *"nota"* ou *"anotar"*), rouba a mensagem do fluxo da IA, e salva um lembrete no banco com o texto *"fiscal"* ou *"que eu estou devendo"*. A IA não decide nada porque ela é **ignorada**.

### B. O Bug Silencioso no `frotaTools.ts` que quebra o Gemini
O **Agente Validador de Tools** descobriu que ferramentas sem parâmetros (`listar_motoristas`, `listar_veiculos`, `meu_caminhao`) estão declaradas assim:
```typescript
parameters: {
  type: SchemaType.OBJECT,
  properties: {},
  required: [],
}
```
A API do Gemini (Vercel AI SDK `@google/generative-ai`) não suporta `properties` vazio e lança erros de validação silenciosos (`Invalid JSON payload`), o que pode derrubar o array inteiro de tools para a chamada, incapacitando o bot.

### C. Ausência de Tabela de Pagamentos e Ferramenta de Texto
O **Agente de Banco de Dados** confirmou que não há uma tabela central `pagamentos` isolada no Supabase (os pagamentos são campos embutidos em `pedidos`, `despesas`, etc.). 
Além disso, o `SYSTEM_PROMPT` diz que despesas exigem *FOTO* e não expõe nenhuma Tool de texto chamada `registrar_pagamento` para a IA. Quando o usuário força a IA a registrar um pagamento só com texto, ela esbarra nas políticas de bloqueio financeiro da Meta/Google e responde *"Não é possível registrar pagamentos..."* para se proteger de "ações financeiras" para as quais ela não tem ferramental explícito.

---

## 2. O Plano de Ação (Para o Claude / Ops 4.8 executar)

### Passo 1: Ajustar o Regex Assassino em `messageRouter.ts` e `gestorFlow.ts`
O regex atual está muito frouxo e dando falsos positivos. Altere-o para exigir explicitamente os dois pontos (`:`) ou restrinja o gatilho, ou melhor ainda, **remova o fast-path e transforme "Criar Lembrete" em uma Tool real**.
* **Recomendação:** Deixe a IA cuidar da interpretação. Crie uma function tool `criar_lembrete(texto: string)`. No prompt, ensine a IA: *"Se o usuário pedir para anotar, lembrar ou guardar algo, chame a tool criar_lembrete"*.
* Se for manter o Regex, reescreva para: `/^(lembrete|anotar|nota)\s*:\s*(.*)/i` (exigindo o sinal de `:`).

### Passo 2: Corrigir o Schema Vazio em `frotaTools.ts`
Remova completamente a chave `parameters` de qualquer ferramenta que não exija argumentos.
**Incorreto:**
```typescript
parameters: { type: SchemaType.OBJECT, properties: {}, required: [] }
```
**Correto:** (Apenas omita)
```typescript
{
  name: 'listar_motoristas',
  description: 'Lista TODOS os motoristas ativos...',
}
```

### Passo 3: Implementar o Fluxo de "Despesa/Pagamento" via Texto (O Permission Loop)
Para a IA parar de dar a desculpa *"Não é possível registrar"*, implemente as ferramentas seguindo o modelo exigido no `INDEX.md` (Duas etapas obrigatórias):
1. **Crie a Tool:** `propor_registro_despesa(valor, descricao, categoria)`
2. A IA deve usar essa tool e perguntar ao usuário: *"Você quer registrar R$ X para Y?"*.
3. **Crie a Tool:** `confirmar_registro_despesa()` (que só é ativada após o "Sim").
4. **Altere o Prompt:** Remova a instrução que obriga o usuário a enviar *FOTO* para despesa. Diga à IA que ela agora possui ferramentas de texto para `propor` e `confirmar` lançamentos financeiros manuais.

### Passo 4: Atualizar `TESTING.md`
Certifique-se de que testes sejam adicionados garantindo que o envio de "anotar arquivo" não é mais interceptado erroneamente pelo Regex e chega à IA corretamente para avaliação.
