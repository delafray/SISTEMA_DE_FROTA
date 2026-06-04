# Bugs Conhecidos e Armadilhas

> 📎 Voltar ao [INDEX do Bot](INDEX.md) | [INDEX principal](../INDEX.md)
>
> Cada bug aqui custou horas. Documentados para NÃO repetir.
> Fonte completa: [docs/BOT_FRAMEWORK.md §3](../../docs/BOT_FRAMEWORK.md)

---

## Evolution API (B1-B8)

| # | Erro | Causa | Solução | Horas |
|---|---|---|---|---|
| B1 | API oficial Meta: CNPJ travado | Burocracia da Meta | Migrou para Evolution API | ~4h |
| B2 | QR Code nunca aparecia (`count: 0`) | Bug da Evolution v2.2.3 | Atualizar para v2.3.0 | ~3h |
| B3 | Imagem Docker não encontrada | Repo `atendai/` descontinuado | Usar `evoapicloud/evolution-api` | ~1h |
| B4 | `400 Bad Request` no webhook | Formato v2.x exige `{ webhook: {} }` | Aninhar dados no wrapper | ~1h |
| B5 | Bot não respondia mensagens | JID com sufixo `1900` na v2.3.0 | Remover sufixo no parser | ~2h |
| B6 | `SSL error: unexpected eof` | PostgreSQL Railway + SSL | `DATABASE_ENABLED=false` | ~2h |
| B7 | Container crash `SIGTERM` | Volume com permissão quebrada | Recriar volume | ~1h |
| B8 | Áudio do Deepgram vazio | URL WhatsApp CDN é encriptada | Usar `getBase64FromMediaMessage` | ~2h |

---

## Gemini / Google AI Studio (B9-B11, B25-B27)

| # | Erro | Causa | Solução |
|---|---|---|---|
| B9 | 429 "créditos esgotados" | Google mudou billing pra pré-pagamento | Adicionar créditos no AI Studio |
| B10 | Latência 17s por áudio | `thinkingBudget` ligado por padrão | `thinkingBudget: 0` em geminiClient.ts |
| B11 | Região gru1 pior pra áudio | Serviços pesados nos EUA | `preferredRegion: 'iad1'` |
| B25 | **Latência 17→12s** | thinkingBudget + região errada | Combo: B10 + B11 juntos |
| B26 | **Região gru1 desperdiça 800ms** | Viagens transoceânicas | `iad1` (US East) pra tudo |
| B27 | **429 em produção** | Google mudou de pós pra pré-pagamento | R$60 crédito + monitorar |

---

## Vercel (B12-B13)

| # | Erro | Causa | Solução |
|---|---|---|---|
| B12 | Env var não pegou | Mudou no painel sem redeploy | **SEMPRE** redeploy após mudar env |
| B13 | Chave antiga na produção | .env.local ≠ Vercel | Sincronizar ambas |

---

## Latência — onde está o gargalo de verdade (B28-B29)

| # | Sintoma | Causa | Solução |
|---|---|---|---|
| B28 | `await marcarComoLida` somava até 3s | "Marcar como lida" (chamada ao Evolution) estava no caminho crítico, antes de processar | `void marcarComoLida(...)` (fire-and-forget) no `webhook/route.ts` — não bloqueia a resposta |
| B29 | **Resposta ~10-13s mesmo com o bot rápido** | O bot (Vercel) faz a parte dele em ~4s (texto) / ~6s (áudio); os outros **~6s são TRANSPORTE** (WhatsApp ↔ Evolution/Railway ↔ celular), constante p/ texto e áudio | **Não é código.** Checar CPU/RAM da Railway → subir plano se sufocado. Se folgada, é lag do Baileys/Meta (não-oficial) → só **Cloud API oficial** resolve |

> ⚠️ Lição do B29: antes de otimizar código, **meça** (logs `message_received`→`message_processed` = parte do bot; cronômetro no celular = total). Se a diferença for grande, o problema é transporte, não o bot. Ver [arquitetura.md §Anatomia da latência](arquitetura.md).

---

## Supabase / PostgreSQL (B14-B16)

| # | Erro | Causa | Solução |
|---|---|---|---|
| B14 | INSERT falha com CHECK violation | Tool não verifica constraints antes | Consultar `pg_constraint` antes |
| B15 | Trigger falha silencioso | Trigger depende de coluna que a tool não seta | Verificar triggers da tabela |
| B16 | DEFAULT não propagado em INSERT | PostgreSQL triggers exigem `NEW.coluna` explícito | Setar TODAS as colunas, não confiar em DEFAULT |

---

## Anti-patterns recorrentes

### ❌ Silent fail em Supabase
```typescript
// ERRADO: ignora error, motorista é culpado por bug de infra
const { data } = await supabase.from('veiculos').select('*').eq('id', id);
if (!data) return 'não encontrado';

// CERTO: verificar error separadamente
const { data, error } = await supabase.from('veiculos').select('*').eq('id', id);
if (error) { log.error(...); return { ok: false, codigo: 'db' }; }
if (!data?.length) return { ok: false, codigo: 'nao_encontrado' };
```

### ❌ Falta empresa_id em SELECT
```typescript
// ERRADO: vaza dados entre empresas
.from('veiculos').select('*').eq('id', veiculoId).single()

// CERTO: SEMPRE filtrar por empresa
.from('veiculos').select('*').eq('id', veiculoId).eq('empresa_id', empresaId).single()
```

### ❌ Type casts sem validação
```typescript
// ERRADO: dados de LLM/webhook não são confiáveis
const km = args.km as number;

// CERTO: validar com typeof ou Zod
const km = typeof args?.km === 'number' ? args.km : undefined;
if (!km || km <= 0) return { ok: false, codigo: 'validacao' };
```

---

## Bot / GEMINI_MODE (B30-B31)

| # | Erro | Causa | Solução |
|---|---|---|---|
| B30 | **Bot respondia "abastecimento em breve" ao digitar dados do cupom** | `GEMINI_MODE` interceptava TODO texto ANTES do roteamento por estado — a IA "roubava" a resposta que o `abastecimentoFlow` (estado `aguardando_confirmacao_abastecimento`) esperava. O fluxo nunca gravava o registro | `messageRouter.ts`: gate `motoristaOcioso = sessao.estado === 'novo' \|\| 'aguardando_acao'`. Gemini só intercepta se ocioso; fluxo ativo → text vai pro determinístico |
| B31 | **System prompt dizia "operações em breve"** | Prompt de `geminiClient.ts` instrui a IA informar que abastecimento/despesa/avaria "estavam sendo configuradas" — mentira (os flows funcionam) | Trocado por orientação correta: "mande a foto do comprovante/cupom" para abastecimento/despesa; "foto/áudio/texto" para avaria. **NÃO dizer que estão indisponíveis.** |

> ✅ Ambos corrigidos em 04/06/2026. Requer redeploy na Vercel.

---

## Veja também

- [como-consultar-tabela.md](como-consultar-tabela.md) — padrão correto de queries
- [como-adicionar-tool.md](como-adicionar-tool.md) — padrão correto de tools
- [../02-apis-e-chaves/todas-as-apis.md](../02-apis-e-chaves/todas-as-apis.md) — armadilhas de cada API
- [docs/BOT_FRAMEWORK.md §3](../../docs/BOT_FRAMEWORK.md) — lista completa com detalhes
