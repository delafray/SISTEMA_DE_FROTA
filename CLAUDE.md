@AGENTS.md
@TESTING.md

# 📚 Documentação centralizada: `framework/INDEX.md`

Antes de pesquisar o projeto, **leia [`framework/INDEX.md`](framework/INDEX.md)**. Arquitetura do bot, como adicionar tools/consultas, APIs, deploy, testes, bugs — tudo organizado lá.

---

Política de testes do projeto (RECOMENDADO, não obrigatório):
- Testes são **bem-vindos** mas **não exigidos** para concluir uma tarefa.
- Rodar `npm test` é **recomendado** antes de mudanças grandes ou de risco — não a cada microalteração.
- NÃO rodar a suíte a cada pequena edição (o dono não quer isso).
- `npm test` roda local + mockado (custo de API = zero).

---

# 📜 Listagens — REGRA DO DONO (09/06/2026)

Telas de listagem que crescem com a operação (pedidos, entregas, despacho, históricos) NÃO podem baixar tudo de uma vez:

1. **Paginação incremental de 100 em 100** via `.range()`, carregando mais conforme o scroll desce (infinite scroll) ou botão "carregar mais".
2. **Busca e filtros no SERVIDOR** (`.ilike()`/`.or()` no Supabase), não filtrando um array gigante no cliente.
3. **NÃO usar `loadAll`** nessas telas (ele varre o banco inteiro — só serve para tabelas pequenas tipo cadastros).
4. Mostrar contagem total (`{ count: 'exact', head: true }`) sem baixar as linhas.

Motivo: o Supabase corta em ~1000 linhas por chamada e o dono projeta 10.000+ pedidos. Resolver ANTES de acontecer.

---

# 🤖 Política de delegação a subagentes (Claude Code) — REGRA DO DONO

Ao delegar trabalho a subagentes (Agent/Workflow), escolher o modelo pela natureza da tarefa:

| Tarefa | Quem faz |
|---|---|
| **Pesquisa em massa** (web, fóruns, GitHub, fan-out de buscas) | Subagentes **haiku** (`model: 'haiku'`) — sempre baratos |
| **Código simples e bem especificado** (telas CRUD seguindo padrão existente, renomes, formulários) | Subagentes **sonnet** |
| **Coisas difíceis** (arquitetura, migrations, lógica de cálculo/dinheiro, refactors amplos, debugging cabeludo) | **Opus** ou o **modelo principal da sessão** — nunca sonnet/haiku |
| **Validação/revisão** do que os subagentes produziram | **Modelo principal da sessão** (não delegar a revisão) |
| **Coisa IMPORTANTE** (qualquer mudança crítica pro negócio, dados financeiros, auth, banco de produção) | **Modelo principal ou Opus** — proibido delegar a sonnet/haiku |

Regras de bolso:
- Em dúvida se é "simples" ou "importante" → trate como importante (faça você mesmo ou pergunte ao dono).
- Todo código entregue por subagente passa por revisão do modelo principal (typecheck + leitura do diff) antes de reportar ao dono.
- O dono faz commit/push/testes manuais — entregar com os comandos prontos, nunca commitar por conta.

---

# Como Chamar os Agentes do Antigravity

## Modos de Acesso

### 1. Chat (Interface Visual)
- Abra o painel lateral do **Antigravity** na IDE
- Digite sua solicitação diretamente no chat
- Ideal para tarefas complexas, planejamento e visualização de artifacts

### 2. CLI (Terminal)
- Abra o terminal integrado da IDE
- Digite `agy` para iniciar uma sessão com o agente
- Ideal para tarefas rápidas sem sair do fluxo do terminal

```bash
agy
```

---

## Tipos de Agentes Disponíveis

| Agente | Descrição |
|---|---|
| **Agente Principal (Chat)** | Agente completo com suporte a subagentes, MCP servers e artifacts visuais |
| **CLI Agent** | Agente de terminal para tarefas pontuais no projeto |
| **Research Subagent** | Pesquisa e leitura de arquivos em paralelo (somente leitura) |
| **Self Subagent** | Executa tarefas em contexto separado com as mesmas capacidades do agente principal |

---

## Dicas de Uso

- **Tarefas simples** → Use o CLI ou chat direto
- **Tarefas complexas** → Use o Chat com subagentes paralelos
- **Pesquisa de codebase** → Delegue ao Research Subagent
- **Integrações (ex: Supabase)** → Use o Chat com MCP servers configurados

---

## Slash Commands Úteis

| Comando | Quando usar |
|---|---|
| `/goal` | Tarefas longas que o agente deve executar até o fim sem parar |
| `/schedule` | Agendar tarefas recorrentes ou com timer |
| `/grill-me` | Alinhar um plano via entrevista interativa |
| `/teamwork-preview` | Projetos grandes com múltiplos agentes em paralelo |

---

> **Nota:** O agente do Chat e o CLI compartilham a mesma conta e workspace, mas o Chat oferece recursos mais avançados como subagentes, artifacts e MCP servers.
