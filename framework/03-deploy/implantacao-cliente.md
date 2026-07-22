# Implantação para Novo Cliente

> 📎 Voltar ao [INDEX de Deploy](INDEX.md) | [INDEX principal](../INDEX.md)
>
> Este arquivo consolida o conteúdo do antigo GUIA_IMPLANTACAO_CLIENTE.md (deletado).

---

> 🧭 **Comece pela [matriz-implantacao-contas.md](matriz-implantacao-contas.md)**: o que é manual ×
> o que é script, o que exige cartão/celular do CONTRATANTE, e a regra de ouro (toda conta nasce
> em nome do cliente). Este arquivo aqui é a ordem técnica; a matriz é a logística humana.

## Pré-requisitos do cliente

| Item | Para que serve |
|---|---|
| Número de celular com chip, **SEM WhatsApp** | O número do bot |
| Lista de motoristas (nome + celular) | Cadastro no sistema |
| Lista de veículos (placa + modelo) | Cadastro no sistema |
| Logo e nome da empresa | Configuração visual |

> ⚠️ O número do bot **não pode ter WhatsApp já instalado**. Cliente precisa excluir a conta antes.

---

## Checklist de implantação (ordem exata)

1. **Supabase** → criar projeto, copiar 3 chaves, executar **todas** as migrations abaixo na ordem:
2. **Cloudflare R2** → criar bucket, criar API token, anotar 5 variáveis
3. **VM Oracle + Evolution API** → deploy `evoapicloud/evolution-api:v2.3.7` + Postgres + Redis (`DATABASE_ENABLED=true`), vars, volumes. Ver [oracle-cloud.md](oracle-cloud.md) + [../01-whatsapp-bot/setup-evolution.md](../01-whatsapp-bot/setup-evolution.md). *(Railway foi descontinuado.)*
4. **GitHub + Vercel** → fork repo, conectar Vercel, TODAS env vars, região `iad1`
5. **OpenAI** → criar conta, API key, adicionar crédito
6. **Gemini** → aistudio.google.com/app/apikey → criar chave
7. **Deepgram** → criar conta, API key (US$200 crédito grátis)
8. **Google Maps** → console.cloud.google.com → criar chave, ativar Geocoding API
9. **Sentry** → criar projeto Next.js, copiar DSN + auth token
10. **Instância + Webhook** → criar instância Evolution, configurar webhook
11. **QR Code** → gerar, escanear, verificar `state: "open"`
12. **Teste final** → motorista manda "oi" → bot responde

---

## Migrations Supabase (passo 1 — rodar todas no SQL Editor, NA ORDEM)

> **Atualizado em 11/06/2026.** A ordem abaixo segue a cronologia de criação dos arquivos. Quase
> todas são idempotentes (`IF NOT EXISTS`), então rodar de novo não quebra.
> **Pendência conhecida (a única que falta pro "sim" definitivo): ENSAIO GERAL** — criar um projeto
> Supabase rascunho, rodar passo 0 + seeds + blocos, apontar o app local e percorrer o checklist
> de 12 passos cronometrando. O que quebrar, corrigir aqui.

### Bloco 1 — Base
| # | Arquivo | O que faz |
|---|---|---|
| 0 | `db/schema_base_completo.sql` | Tabelas (53), constraints, FKs, índices e views — gerado do banco real em 11/06 |
| 0b | `db/schema_base_complemento.sql` | **Funções/RPCs + triggers + GRANTs** — OBRIGATÓRIO (sem ele: KM não propaga, bot quebra e o painel não lê nada). ⚠️ Se não existir: gerar com `db/gerar_schema_complemento.sql` na produção (instruções no topo) |
| 1 | `db/seed_tipos_manutencao.sql` | Seed de tipos de manutenção |
| 1b | `db/seeds/seed_regras_bot.sql` | **As 18 regras do bot do zap** (gatilhos, frases, matriz, leitores) — sem isso o bot nasce burro |
| 1c | `db/seeds/seed_contexto_ia.sql` | Contexto global do classificador |
| 2 | `db/migration_whatsapp_historico.sql` | Histórico de conversas do bot |
| 3 | `db/migration_session_atomic.sql` | RPC de sessão atômica |
| 4 | `db/migration_bot_metricas.sql` | Métricas do bot |

> 💡 Com o passo 0 completo, os blocos 2-6 abaixo viram REDUNDÂNCIA SEGURA (o schema gerado já
> contém tudo; as migrations são idempotentes). Mantidos como histórico/conferência.

> ⚠️ **PASSO QUE SEMPRE ESQUECE — autorizações do bot:** depois dos seeds, cadastrar os TELEFONES
> (gestor/esposa) na tabela `telefones` e marcar as permissões de CADA regra na tela
> **Autorizações** (`telefones.permissoes = { regra_id: nível }`). Regra sem autorização no
> telefone = bot responde "não entendi" (lição de 11/06/2026).

### Bloco 2 — Geocoding
| # | Arquivo | O que faz |
|---|---|---|
| 5 | `db/migration_geocode_google.sql` | Cache e cota do Google Geocoding |
| 6 | `db/migration_coordenadas_aprendidas.sql` | Coordenadas aprendidas pela frota |
| 7 | `db/migration_fix_permissions_e_cep.sql` | GRANTs de permissão + CEP opcional |
| 8 | `db/migration_fix_cota_ambiguo.sql` | Fix da RPC de cota (coluna ambígua) |

### Bloco 3 — Modelo de negócio (Pedido→Entrega)
| # | Arquivo | O que faz |
|---|---|---|
| 9 | `db/migration_limpeza_modelo.sql` | Rename de tabelas (viagens→pedidos, fretes→entregas) |
| 10 | `migration_api_cadastros.sql` (raiz) | Página /uso-apis (cadastros de API cifrados — exige env `USO_APIS_ENC_KEY`) |
| 11 | `db/migration_whatsapp_empresa.sql` | Colunas `whatsapp_instance` e `whatsapp_numero` em `empresas` |

### Bloco 4 — Lembretes (sem trava)
| # | Arquivo | O que faz |
|---|---|---|
| 12 | `db/migration_lembretes.sql` | Tabela de lembretes do painel |
| 13 | `db/migration_fix_lembretes_fk.sql` | Corrige FK de lembretes → perfis |
| 14 | `db/migration_lembretes_qualquer_usuario.sql` | Qualquer usuário vê/grava lembrete |
| 15 | `db/migration_lembretes_sem_trava.sql` | Remove travas de empresa/usuário (decisão do dono) |
| 15b | `db/migration_lembrete_notas.sql` | Tabela `lembrete_notas` — providências anotadas ao dar ciente (popup ocultar/manter na tela) |

### Bloco 5 — Motor de regras + autorizações (no-code)
| # | Arquivo | O que faz |
|---|---|---|
| 16 | `db/migration_autorizacoes.sql` | Matriz de autorizações por telefone |
| 17 | `db/migration_regras.sql` | Tabela de regras do bot |
| 18 | `db/migration_regras_gatilhos.sql` | Gatilhos das regras |
| 19 | `db/migration_alocacoes.sql` | Alocações motorista↔veículo |
| 20 | `db/migration_motorista_usuario.sql` | Vínculo motorista↔usuário |
| 21 | `db/migration_migrar_vinculo_alocacoes.sql` | Migra vínculos antigos p/ alocações |
| 22 | `db/migration_alocacoes_km_fim.sql` | KM final nas alocações |
| 23 | `db/migration_regras_teto.sql` | Teto de valor nas regras |
| 24 | `db/migration_regras_acoes.sql` | Ações permitidas por regra |
| 25 | `db/migration_regras_gestor.sql` | Regras de gestor |
| 26 | `db/migration_bot_classificador.sql` | Tabelas do motor classificador (estado pendente, msgs processadas) |
| 27 | `db/migration_regras_gatilho_inicio.sql` | Flag "gatilho só no início da frase" |
| 28 | `db/migration_veiculos_updated_at.sql` | `updated_at` em veículos (optimistic lock do KM) |
| 29 | `db/migration_bot_msgs_status.sql` | Status na idempotência por wamid |
| 30 | `db/migration_bot_contexto_conversa.sql` | Contexto "caminhão atual" da conversa |
| 31 | `db/migration_ctx_incrementar_turns.sql` | RPC atômica de turns do contexto |

### Bloco 6 — Logística (Pedidos/Despacho/Roteirização)
| # | Arquivo | O que faz |
|---|---|---|
| 32 | `db/migration_pedidos_empresa_motorista.sql` | `empresa_motorista_id` em pedidos |
| 33 | `db/migration_transferencia_empresa.sql` | Transferência de registros entre empresas fiscais |
| 34 | `db/migration_empresa01_logistica.sql` | Cliente em pedidos, rotas, POD, locais de carregamento |
| 35 | `db/schema_routing_completo.sql` | Schema completo de roteirização (entregas, janelas, geocode) |
| 36 | `db/migration_entregas_despacho_nullable.sql` | Entregas com motorista/veículo nullable (fila do Despacho) |
| 37 | `db/migration_import_notas.sql` | Colunas NFe em entregas (importação em massa — Fase 4) |
| 38 | `db/migration_kpis_financeiro.sql` | RPCs de soma dos KPIs (abastecimentos, adiantamentos, receita de pedidos) — somas no servidor em vez de baixar a tabela |

> Após rodar as migrations: popular `empresas.whatsapp_instance` com o nome da instância Evolution
> (`frota-bot-novo` ou equivalente) e cadastrar a(s) empresa(s) — ver [onboarding-empresa.md](onboarding-empresa.md).

---

## VM Oracle — OSRM + VROOM (roteirização)

A roteirização precisa da VM com OSRM (rotas) + VROOM (otimização) — pode ser feita DEPOIS do
go-live do bot (fica em background). Passo a passo completo: [oracle-cloud.md](oracle-cloud.md) e
[../04-roteirizacao/osrm-vroom-setup.md](../04-roteirizacao/osrm-vroom-setup.md).

Envs correspondentes na Vercel: `OSRM_URL`, `VROOM_URL`, `OVERPASS_URL` (ver
[../02-apis-e-chaves/env-template.md](../02-apis-e-chaves/env-template.md) para a lista completa,
incluindo `USO_APIS_ENC_KEY` do passo 10).

---

## Tempo estimado: 1 tarde (~3-4 horas)

Oracle Cloud (roteirização) fica rodando em background e pode ser feito depois.

---

## Passo a passo detalhado

Para detalhes de cada API, veja [../02-apis-e-chaves/todas-as-apis.md](../02-apis-e-chaves/todas-as-apis.md). Para Evolution API, veja [../01-whatsapp-bot/setup-evolution.md](../01-whatsapp-bot/setup-evolution.md).

---

## Veja também

- [../02-apis-e-chaves/todas-as-apis.md](../02-apis-e-chaves/todas-as-apis.md) — como obter cada chave
- [../02-apis-e-chaves/env-template.md](../02-apis-e-chaves/env-template.md) — template .env.local
- [onboarding-empresa.md](onboarding-empresa.md) — cadastrar empresa no sistema
- [../01-whatsapp-bot/setup-evolution.md](../01-whatsapp-bot/setup-evolution.md) — Evolution API passo a passo
