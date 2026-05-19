@AGENTS.md

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
