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

---

## 🟢 Validação final

| # | Teste | Quando |
|---|---|---|
| 5 | Smoke test E2E captura de notas | Após `npm test` verde |

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
