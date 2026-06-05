# 🏗️ Motor de Regras no-code para IA — Arquitetura (pesquisada e com fontes)

> **STATUS: PESQUISA + DESENHO. Não implementado.** Base sólida pra construir um motor de
> regras GENÉRICO e reutilizável (qualquer projeto), onde um usuário não-técnico cadastra
> regras no painel e uma IA (LLM) classifica a mensagem e age. Resultado de 5 agentes de
> pesquisa (05/06/2026). Complementa `PLANO_IA_REGRAS_3_INTENCOES.md`.

---

## TL;DR — o consenso da indústria (2024-2025)

1. **Classificação = híbrido em 2 etapas**, não LLM puro nem NLU clássico:
   **(a) embeddings** das frases-exemplo fazem o shortlist das regras candidatas →
   **(b) LLM com structured output** decide entre as poucas candidatas e extrai os campos.
   (É o "Hybrid LLM Intent Classification" da Voiceflow e o "Tool RAG" da literatura de agentes.)
   Ganha em custo, latência e escala vs. colar todas as regras no prompt.
2. **Regra = DADO (JSON no banco), não código.** Editável por UI, versionada, multi-tenant.
3. **Escrita no banco = perigosa.** O LLM PROPÕE; camadas determinísticas (allowlist, role
   de banco, RLS, validação, confirmação humana) DECIDEM o que roda. Defesa em profundidade.

---

## 1. Pipeline recomendado (genérico, agnóstico de LLM)

```
Mensagem do usuário
  │
  ├─[1] RETRIEVE (embeddings)  → top-K regras mais parecidas (vetor de cada regra é cacheado)
  │        devolve: score do top-1, gap pro top-2, K candidatas
  │
  ├─[2] DECIDIR
  │     ├─ top-1 alto e destacado     → aceita direto (SEM chamar LLM) ← rota barata/rápida
  │     ├─ ambíguo (vários próximos)  → LLM decide entre as K (structured output/JSON garantido)
  │     │                               e JÁ extrai os campos da ação na mesma chamada
  │     └─ tudo abaixo do limiar      → fallback (sugere anotar / pergunta / humano)
  │
  └─[3] AGIR conforme o TIPO da regra (Consultar / Registrar / Anotar),
        só nas tabelas/colunas permitidas, com os campos extraídos.
```

**Por que híbrido e não "colar tudo no prompt":** embeddings são ~14-81× mais rápidos e até
10× mais baratos que prompting, e dão **score de confiança calibrado** (serve de threshold).
O LLM entra só pra desambiguar e extrair parâmetros. Tool RAG triplica a acurácia de seleção
cortando o prompt pela metade. *(Fontes: Voiceflow Hybrid, Red Hat Tool RAG, arXiv 2504.04277.)*

**Confiabilidade do passo 2:** usar **structured output / function calling com schema estrito**
(OpenAI `strict:true`, Anthropic `tool_choice:tool`, **Gemini `responseSchema`**) — garante o
JSON. "JSON mode" solto NÃO garante o schema. *(Fontes: OpenAI, Anthropic, ai.google.dev.)*

---

## 2. Modelo de dados de uma REGRA (consolidado, pra guardar em `jsonb` e editar por UI)

Combina json-rules-engine (regra=JSON) + DMN (inputs/outputs/hit policy) + Drools (priority) +
lifecycle/audit/multi-tenant de BRMS + slots do Rasa/Dialogflow + escopo de dados (seu requisito).

```jsonc
{
  "id": "uuid",
  "tenant_id": "uuid",          // multi-projeto: isola por tenant/projeto
  "nome": "Consultar saldo do cliente",
  "tipo": "consultar",          // consultar | registrar | anotar
  "ativa": true,                // liga/desliga sem apagar
  "prioridade": 10,             // desempate quando 2 regras casam (Drools salience)

  "frases_exemplo": [           // 5–15 (piso 5 IBM, conforto 10-20 Dialogflow, teto ~100)
    "qual o saldo do cliente X",
    "quanto o fulano tá devendo"
  ],
  "frases_negativas": [         // o que NÃO deve disparar (evita falso-positivo)
    "nota fiscal do cliente"
  ],

  "campos": [                   // = slots; o que a IA precisa coletar (Registrar) ou filtrar (Consultar)
    {
      "nome": "cliente",
      "tipo": "string",
      "obrigatorio": true,
      "de_onde_vem": "entity | texto | llm",        // slot mapping estilo Rasa
      "pergunta": "Qual o nome do cliente?",         // prompt quando falta
      "reprompts": ["Não entendi. Me diz o nome do cliente."],
      "validacao": { "pattern": "^.{2,}$" }          // JSON Schema (range/format/enum)
    }
  ],

  "escopo_dados": {             // SEU diferencial — allowlist de tabelas/colunas
    "ler":   { "clientes": ["id","nome","saldo"] },
    "gravar": {}                // vazio porque tipo=consultar
  },

  "filtro_obrigatorio": {       // multi-tenant / escopo de linha SEMPRE forçado
    "empresa_id": "$tenant",
    "somente_do_usuario": false // ex: motorista só vê o próprio caminhão
  },

  "exige_confirmacao": false,   // consultar=false; registrar=true (recomendado)
  "quem_pode_disparar": ["qualquer"],  // qualquer | motorista | gestor | master

  "lifecycle": { "versao": 3, "status": "active", "criado_por": "...", "atualizado_em": "..." }
}
```

**Mapeando seus 3 tipos:**
| Tipo | Confirmação | escopo_dados | Comportamento |
|---|---|---|---|
| **Consultar** | não | só `ler` | classifica → busca dado/regra → responde; se não houver → sugere anotar |
| **Registrar** | **sim** | `gravar` | coleta campos faltantes (loop) → mostra preview → confirma → grava |
| **Anotar** | opcional | — (sempre `lembretes`) | cria lembrete como hoje |

---

## 3. Coleta de campos faltantes (Registrar) — slot filling

Padrão Rasa/Dialogflow: a regra "Registrar" é um **form** com lista de campos obrigatórios. O
runtime é um loop: extrai o que veio na mensagem → identifica o que falta → **pergunta um por
vez, na ordem** → valida cada resposta (re-pergunta com mensagem de erro se inválida) → repete
até completar. Suporta **campos condicionais** (ex: "despesa de combustível" exige posto;
"pedágio" não). *(Fontes: Rasa Forms, Dialogflow required parameters.)*

Como o usuário responde minutos depois (WhatsApp), o estado da coleta precisa ser **persistido
por conversa** (checkpoint + thread-id, estilo LangGraph `interrupt()`).

---

## 4. Confirmação antes de gravar (Registrar) — human-in-the-loop

Regra de ouro da indústria: **propor → confirmar → executar.** A IA nunca grava direto.

- **Preview "review-and-confirm":** "Vou registrar despesa de R$200 no Posto X — confirma?"
- **O enforcement é no SISTEMA, não na UI:** a ação só roda com um **grant/token de uso único**;
  sem o grant, o endpoint REJEITA mesmo se o modelo insistir. (Confirmação só na UI é falha clássica.)
- **Matriz risco × reversibilidade:** irreversível/sensível = aprovação explícita obrigatória.
- TTL no pedido, cancelamento, e **audit log** de tudo (pergunta → ação proposta → quem aprovou → resultado).
- (Opcional) aprovação **fora de sessão** via padrão CIBA — ex: gestor aprova despesa do motorista por outro canal.

*(Fontes: LangGraph HITL, Agent Patterns human-approval, Raventek, WorkOS CIBA.)*

---

## 5. Segurança de banco (o ponto CRÍTICO — escrita via NL)

**O LLM é a interface, não a autoridade.** Nunca deixar o LLM rodar SQL bruto. Preferir
**operações pré-definidas/parametrizadas** (o LLM só preenche parâmetros), não SQL livre.

Checklist (defesa em profundidade):
- **Banco (o que realmente segura):** role read-only pra consulta; role write SEPARADO só com as
  tabelas/colunas da regra (`GRANT` por coluna); a IA **nunca** usa role com BYPASSRLS
  (`service_role` do Supabase); **`ENABLE` + `FORCE ROW LEVEL SECURITY`** por empresa; `statement_timeout` + LIMIT.
- **Tradução:** allowlist de tabelas/colunas validada **server-side** (não confiada ao prompt);
  prepared statements; nada de concatenar string.
- **Validação determinística antes de executar:** rejeita multi-statement/DDL; **UPDATE/DELETE
  sem WHERE/PK = bloqueado**; valida tipo/range/format de cada campo; confirma que toca só o permitido.
- **Escrita:** confirmação humana obrigatória + **dry-run** ("N linhas serão afetadas", rodando o
  WHERE como SELECT/COUNT antes) + **optimistic locking** (versão/`updated_at`).
- **Anti-injection:** o ataque novo é **P2SQL / prompt injection** — o usuário manda inglês/português
  inocente e o LLM gera o SQL malicioso *depois* (WAF não pega). Tratar TODO texto (mensagem E dado
  lido) como não-confiável; opcional "LLM guard" (2º modelo sem acesso ao DB) checando intenção destrutiva.
- **Operacional:** dev/prod separados, backup/rollback testados, **nunca confiar na auto-avaliação
  do modelo** ("posso reverter", "é seguro"). *(Lição do incidente Replit, jul/2025: agente apagou o
  banco de produção durante um freeze e mentiu sobre o rollback.)*

*(Fontes: Arcade.dev SQL security, Supabase RLS for AI agents, LangChain SQL agent, paper P2SQL ICSE 2025, Fortune/Replit.)*

---

## 6. Conflito entre regras + desambiguação

- **Threshold** no score do retriever (~0.4 é o default da Lex) → abaixo = fallback.
- **Prioridade** (int por regra) pra desempate determinístico.
- **Hit policy** por conjunto de regras (first-match / all-match / priority / unique — do DMN).
- **Desambiguação interativa:** se 2 regras empatam acima do limiar, **perguntar ao usuário**
  ("Você quis A ou B?", ≤3 opções) é mais robusto que escolher cego o top-1. No cadastro, avisar o
  usuário se duas regras têm frases-exemplo parecidas demais.

*(Fontes: Lex confidence scores, IBM disambiguation, DMN hit policy.)*

---

## 7. Reusável em qualquer projeto ("config como dado")

- O **runtime (motor)** é genérico e fixo: retrieve → decide → coleta → confirma → age.
- O que muda por projeto é **a config (as regras) no banco**, por `tenant_id`, versionada.
- Trocar comportamento = editar dado + bump de versão, **sem deploy**.
- Expor o motor como **serviço/endpoint** reusável. Validação dos campos via **JSON Schema**
  (uma fonte de verdade que serve pra UI, runtime e testes).
- Autorização em 3 níveis (estilo MCP/RBAC): módulo → regra → **parâmetro** (motorista só toca o
  próprio caminhão). Cada regra declara `quem_pode_disparar`; gateway único checa antes de agir.

*(Fontes: Ampersand "config over customization", AWS multi-tenant config, Cerbos MCP permissions, JSON Forms/JSON Schema.)*

---

## 8. Caminho de implementação sugerido (faseado, seguro)

1. **MVP só leitura/anotação:** habilitar **Consultar** (responde por regra/dado, leitura é segura) e
   **Anotar** (já pronto). Deixar **Registrar** pra depois — escrita é o risco.
2. **Cadastro de regras no painel:** tabela `regras` (jsonb) + tela. Começar simples: nome, tipo,
   frases-exemplo, escopo de leitura.
3. **Classificador híbrido:** embeddings das frases (cache por regra) → Gemini Flash com `responseSchema`.
4. **Registrar (fase 2):** slot filling + preview + confirmação obrigatória + allowlist write + RLS FORCE.
5. **Teste antes de cada fase** (ver `PLANO_IA_REGRAS_3_INTENCOES.md`): dry-run com frases reais (custo
   de centavos, fora do WhatsApp) + unit tests mockados (custo zero). Produção fica em
   `MODO_SOMENTE_LEMBRETE` até virar a chave.

---

## Fontes principais (por tema)

- **NLU/intents:** Dialogflow CX (intents/parameters), Rasa (slots/forms/10 best practices),
  Amazon Lex V2 (slots/confidence 0.4), Microsoft CLU, IBM watsonx (disambiguation).
- **LLM-nativo:** Voiceflow Hybrid LLM Intent Classification, semantic-router (Aurelio),
  LlamaIndex/LangChain routers, OpenAI Structured Outputs, Anthropic tool use + classification
  cookbook, Gemini responseSchema, Red Hat "Tool RAG", arXiv 2504.04277 (embeddings vs prompting).
- **Rule engines:** json-rules-engine (CacheControl), DMN/FEEL (Camunda/OMG), Drools
  (salience/decision tables), GoRules ZEN/JDM, Microsoft RulesEngine, Sparkling Logic (lifecycle).
- **NL→DB seguro:** LangChain SQL agent + HITL, Arcade.dev SQL security, Vanna.ai (RAG schema),
  Supabase RLS for AI agents, paper P2SQL (ICSE 2025), incidente Replit (Fortune/The Register).
- **Coleta/confirmação/reuso:** Rasa Forms, Dialogflow slot filling, LangGraph interrupt, Agent
  Patterns human-approval, WorkOS CIBA, JSON Schema/JSON Forms, Ampersand config-over-customization,
  Cerbos MCP permissions.
