# ✅ RESOLVIDO em 04/06/2026

**Causa raiz (diagnóstico correto da outra IA):** o `Map` em memória quebrava em serverless — a mensagem "lembrete: X" e o "sim" caíam em instâncias diferentes da Vercel, perdendo o estado.

**Correção aplicada:** lembrete agora salva **imediatamente** (sem passo de "responda sim"), eliminando todo estado em memória. Regex corrigida (`+`→`*`). +5 testes. Suíte 1165/1165, tsc 0. Falta só o deploy.

O conteúdo abaixo é o histórico do diagnóstico.

---

# Documentação para a IA resolver o Bug de Lembretes

## Contexto
O usuário relatou um problema onde o gestor tenta enviar um lembrete e o bot (Gemini) responde "Não é possível criar lembretes". Foi solicitada a verificação de 3 arquivos cruciais na arquitetura de fluxo do WhatsApp para identificar o problema.

Fiz a análise com múltiplos agentes de pesquisa de código e pesquisa web, e aqui está o status atual do código, para que você possa corrigir o que falta:

## 1. `src/lib/ai/geminiClient.ts`
- **Status:** OK. 
- O parágrafo de `LEMBRETES (exclusivo para gestor/master):` já está presente no `SYSTEM_PROMPT`.

## 2. `src/lib/whatsapp/messageRouter.ts`
- **Status:** OK.
- As interceptações no fluxo `rotearComGemini` já existem tanto para o ramo de ÁUDIO (`LEMBRETE_AUDIO`) quanto para TEXTO (`LEMBRETE_TEXTO`). A expressão regular está usando `*` (asterisco), o que está correto.

## 3. `src/lib/whatsapp/flows/gestorFlow.ts`
- **Status:** PRECISA DE DUAS CORREÇÕES CRÍTICAS!

**Problema 1: A Regex (Bug Visualizado Inicialmente)**
- A constante `LEMBRETE_REGEX` (linha 23) está configurada como:
  `const LEMBRETE_REGEX = /^(lembrete|registro|anote|anotar|anota|guarda|guarde|salva|salve|nota)\b[:\s,.\-!]+(.*)/i;`
- **Erro:** O uso do `+` em `[:\s,.\-!]+` exige que haja pelo menos um caractere de espaço ou pontuação. Se o usuário digitar apenas "lembrete", a regex falha.
- **Solução:** Trocar o `+` por `*`.

**Problema 2: Arquitetura Serverless (Identificado pela Pesquisa Web)**
- O fluxo de confirmação utiliza um `Map` em memória global na linha 132:
  `const lembretesPendentes = new Map<string, string>();`
- **Erro Crítico:** Como o sistema é Next.js (frequentemente hospedado em ambientes Serverless como Vercel), requisições consecutivas (a mensagem do lembrete e o "sim" da confirmação) podem cair em instâncias (lambdas) diferentes. Se isso acontecer, o `Map` estará vazio na segunda requisição, e o lembrete será perdido para sempre, exibindo erro de contexto.
- **Solução:** O estado temporário do lembrete pendente NÃO PODE ficar na memória RAM (`Map`). Ele precisa ser guardado no banco de dados Supabase (ex: na tabela de sessão do gestor) ou Redis, antes de pedir a confirmação. 

## Instruções de Ação (O que você deve fazer)
1. Modifique o arquivo `src/lib/whatsapp/flows/gestorFlow.ts` na linha 23:
   - De: `const LEMBRETE_REGEX = /^(lembrete|registro|anote|anotar|anota|guarda|guarde|salva|salve|nota)\b[:\s,.\-!]+(.*)/i;`
   - Para: `const LEMBRETE_REGEX = /^(lembrete|registro|anote|anotar|anota|guarda|guarde|salva|salve|nota)\b[:\s,.\-!]*(.*)/i;`
2. Modifique a lógica do `processarLembrete` e `confirmarLembretePendente` no mesmo arquivo para remover o `lembretesPendentes = new Map()` e usar um armazenamento persistente (como a sessão do usuário via Supabase) ao invés da memória RAM.
3. Após a correção, execute os testes com o comando: `npm test` para garantir que `src/__tests__/whatsapp/flows/gestorFlow.test.ts` passe. (Obrigatório segundo `TESTING.md`).
4. Execute a verificação de tipos: `npx tsc --noEmit`. Deve retornar 0 erros.
5. Anexe a sua execução no `TESTING_LOG.md`.
6. Faça o commit da alteração e o push para o repositório.
