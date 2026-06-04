# Implantação para Novo Cliente

> 📎 Voltar ao [INDEX de Deploy](INDEX.md) | [INDEX principal](../INDEX.md)
>
> Este arquivo consolida o conteúdo do antigo GUIA_IMPLANTACAO_CLIENTE.md (deletado).

---

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

## Migrations Supabase (passo 1 — rodar todas no SQL Editor)

| Arquivo | O que faz | Obrigatório |
|---|---|---|
| Schema principal | Tabelas base (gerado pelo Supabase) | ✅ |
| `db/migration_whatsapp_historico.sql` | Histórico de conversas do bot | ✅ |
| `db/migration_session_atomic.sql` | RPC de sessão atômica | ✅ |
| `db/migration_bot_metricas.sql` | Métricas do bot | ✅ |
| `db/migration_geocode_google.sql` | Cache e cota do Google Geocoding | ✅ |
| `db/migration_coordenadas_aprendidas.sql` | Coordenadas aprendidas pela frota | ✅ |
| `db/migration_fix_permissions_e_cep.sql` | GRANTs de permissão + CEP opcional | ✅ |
| `db/migration_fix_cota_ambiguo.sql` | Fix da RPC de cota (coluna ambígua) | ✅ |
| `db/migration_limpeza_modelo.sql` | Rename de tabelas (viagens→pedidos, fretes→entregas) | ✅ |
| `db/migration_whatsapp_empresa.sql` | Colunas `whatsapp_instance` e `whatsapp_numero` em `empresas` | ✅ |
| `db/migration_lembretes.sql` | Tabela de lembretes do painel | ✅ |
| `db/migration_fix_lembretes_fk.sql` | Corrige FK de lembretes → perfis (necessário para o join de nome funcionar) | ✅ |

> Após rodar as migrations, popular `empresas.whatsapp_instance` com o nome da instância Evolution (`frota-bot-novo` ou equivalente).

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
