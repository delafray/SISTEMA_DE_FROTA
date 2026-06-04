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
| 11 | **Latência ~10-13s: o gargalo é o transporte (~6s), não o código** (ver bugs B29). Decidir: (a) subir o plano da Railway se CPU/RAM estiverem no talo, ou (b) migrar pra WhatsApp Cloud API oficial (mais rápida/estável, custo por conversa). | Tempo de resposta do bot |

---

## 🟢 Validação final

| # | Teste | Quando |
|---|---|---|
| 5 | Smoke test E2E captura de notas | Após `npm test` verde |

---

## 🛠️ Implementação pendente

| # | Item | Detalhe |
|---|---|---|
| 12 | **Implementar upload de fotos pro R2** | R2 é o storage oficial (10GB grátis), chaves obrigatórias, e o SDK `@aws-sdk/client-s3` JÁ está instalado — mas **nenhum código importa/usa ainda**. Hoje as fotos (avaria/cupom) NÃO sobem pro R2. Falta: helper de upload (S3Client → R2) + integrar nos fluxos (avaria, abastecimento/cupom, despesa) + servir via `R2_PUBLIC_URL`. Vars: `R2_ACCOUNT_ID/ACCESS_KEY_ID/SECRET_ACCESS_KEY/BUCKET_NAME/PUBLIC_URL`. |

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
