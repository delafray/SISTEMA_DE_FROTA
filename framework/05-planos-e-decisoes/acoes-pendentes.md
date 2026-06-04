# Ações Pendentes

> 📎 Voltar ao [INDEX de Planos](INDEX.md) | [INDEX principal](../INDEX.md)
>
> Fonte: [ACOES_PENDENTES_USUARIO.md](../../ACOES_PENDENTES_USUARIO.md)

---

## 🔴 Bloqueadores

| # | Ação | Status |
|---|---|---|
| 1 | Resolver credenciais Git (conta errada cacheada) | ⬜ |
| 2 | Adicionar env vars VIACEP/NOMINATIM no .env.local | ⬜ |
| 3 | VM Oracle provisionada | ✅ |
| 3b | Adicionar OSRM_URL e VROOM_URL no .env.local | ⬜ |
| 3c | Rotacionar chave SSH (exposta em chat) | ⬜ |

---

## 🟡 Decisões pendentes

| # | Decisão | Impacto |
|---|---|---|
| 4 | Aquecimento do chip WhatsApp + alertas proativos | Risco de banimento |
| 11 | **Latência ~10-13s: o gargalo é o transporte (~6s), não o código**. Migração pra Oracle não elimina esse lag (Baileys não-oficial). Decidir: migrar pra **WhatsApp Cloud API oficial** (mais rápida/estável, custo por conversa). | Tempo de resposta do bot |

---

## 🟢 Validação final

| # | Teste | Quando |
|---|---|---|
| 5 | Smoke test E2E captura de notas | Após `npm test` verde |

---

## ✅ Implementado recentemente

| # | Item | Status |
|---|---|---|
| 12 | **Upload de fotos pro R2** | ✅ **Feito** (`src/lib/storage/r2.ts`, integrado em km/avaria/abastecimento/despesa). Guarda no Postgres só a URL curta do R2; passthrough se R2 não configurado. **Falta só você:** criar bucket+chaves no Cloudflare, setar `R2_*` na Vercel/.env.local e deployar. Sem as chaves, foto vira base64 no banco (incha). |
| 13 | **Migração Railway → Oracle Cloud** | ✅ **Feito** (04/06/2026). Evolution API rodando em `http://129.80.27.159:8080` (Docker, co-locada com OSRM/VROOM). Railway cancelado. Env var `EVOLUTION_API_URL` atualizada na Vercel + redeploy feito. Bot funcionando (200 `message_processed` confirmado nos logs). |
| 14 | **Fix GEMINI_MODE sequestrava fluxos ativos (B30)** | ✅ **Feito** (04/06/2026). Bot respondia "em breve" ao digitar dados do cupom porque a IA interceptava texto em qualquer estado. Fix: gate `motoristaOcioso` no `messageRouter.ts`. |
| 15 | **Fix System Prompt (B31)** | ✅ **Feito** (04/06/2026). Prompt instruiía a IA a dizer "operações em breve" (mentira). Trocado por orientação correta de enviar foto. |

---

## 🚫 Bloqueados (precisam de mudança de schema)

| # | Item | Bloqueio |
|---|---|---|
| 7 | Telefone do cliente no card de parada | Falta `cliente_id` em `notas_capturadas` |
| 8 | "Salvar como padrão" no ModalHorario | Mesma raiz do #7 |
| 9 | km_estimado em `entregas/novo` | Falta colunas em `entregas` |
| 10 | Alertas WhatsApp ao gestor | Decisão de aquecimento do chip |

---

## Veja também

- [ACOES_PENDENTES_USUARIO.md](../../ACOES_PENDENTES_USUARIO.md) — detalhes completos com comandos
- [log.md](../../log.md) — plano de ação em 6 fases
