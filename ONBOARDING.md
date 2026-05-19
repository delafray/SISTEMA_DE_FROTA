# Onboarding de uma nova empresa

Guia operacional para conectar uma empresa-cliente ao sistema de frota. Cobre o que **a empresa** precisa providenciar, o que **você (dev/admin)** configura, e os bugs mais comuns no caminho.

> **Estado atual da arquitetura:** o sistema é multi-tenant no banco (toda tabela tem `empresa_id`), mas o webhook do WhatsApp ainda lê a config da Meta de **uma única conta** via env vars globais. Para escalar de verdade, ver [§5 — Modelos de escala](#5--modelos-de-escala).

---

## 1. Visão geral em uma frase

Cada empresa-cliente precisa de **três coisas conectadas**: uma linha em `empresas` no Supabase, um número WhatsApp ligado a uma WABA verificada na Meta, e os motoristas/veículos cadastrados via dashboard web.

---

## 2. O que a empresa-cliente precisa providenciar

Antes de você começar a configurar qualquer coisa, peça à empresa:

| Item | Para que serve | Onde usar |
|---|---|---|
| **CNPJ + comprovante de endereço + contrato social** | Verificação business na Meta | business.facebook.com |
| **Conta de Facebook do dono / responsável** | Admin do Business Manager dela | business.facebook.com |
| **Número de telefone real, com chip, sem WhatsApp ativo** | O número do bot da empresa | WhatsApp Manager |
| **Nome de exibição** (até 25 caracteres) | Aparece no chat dos motoristas | WhatsApp Manager → Display Name |
| **Lista inicial de motoristas e veículos** | Cadastro no sistema | Dashboard `/motoristas`, `/veiculos` |

> ⚠️ O número **não pode ter conta de WhatsApp já existente**. Se tem, a empresa precisa apagar a conta atual antes (Configurações → Conta → Excluir conta).

---

## 3. Passo-a-passo: configurando a empresa

### 3.1 Cadastrar a empresa no sistema

1. Logue como `master` no dashboard
2. Vá em `/empresas/novo`
3. Preencha CNPJ, razão social, endereço, etc.
4. **Anote o `empresa_id`** (UUID gerado) — vai precisar adiante

### 3.2 Configurar o lado Meta

#### a) Verificação business (a mais longa — leva 1-7 dias)

1. Acesse [business.facebook.com](https://business.facebook.com) com a conta do dono da empresa
2. **Configurações do Negócio → Centro de Segurança → Verificação da empresa**
3. Clique **"Iniciar verificação"**
4. Suba CNPJ, comprovante de endereço comercial, contrato social
5. Aguarde aprovação (acompanhe nessa mesma tela)

> Sem essa etapa, qualquer envio para o Brasil retorna erro **`130497 — Business account is restricted from messaging users in this country`**.

#### b) Criar a WhatsApp Business Account (WABA)

1. Em [developers.facebook.com](https://developers.facebook.com) → **Meus Apps → Criar App**
2. Tipo: **Business** → vincule ao Business Manager da empresa
3. Adicione o produto **WhatsApp**
4. Em **WhatsApp → Configuração da API**, conecte uma WABA (ou crie uma nova)

#### c) Adicionar o número

1. **WhatsApp → Configuração da API → "Etapa 5: Adicionar um número de telefone"**
2. Digite o número da empresa (formato internacional: `+55 31 99999-9999`)
3. Receba o código por SMS ou ligação e confirme
4. O número fica com status **"Conectado"**

#### d) Configurar display name (precisa ser aprovado)

1. **WhatsApp Manager → Visão geral → Editar perfil do telefone → Nome para exibição**
2. Digite o nome aprovável (segue as [regras da Meta](https://www.facebook.com/business/help/757569725593362))
3. Aguarde aprovação (alguns minutos a algumas horas)

#### e) Gerar o System User Token permanente

1. **business.facebook.com → Configurações do Negócio → Usuários → Usuários do sistema**
2. **Adicionar** → nome: `bot-frota-<empresa>` → função: **Admin**
3. Selecione o usuário criado → **Adicionar ativos** → escolha o **app** dessa empresa → marca "Gerenciar app" e "Desenvolver app"
4. **Gerar novo token**:
   - App: o app dessa empresa
   - Expiração: **Nunca**
   - Permissões: `whatsapp_business_messaging` + `whatsapp_business_management`
5. **Copia e guarda** (a Meta só mostra uma vez)

#### f) Pegar o App Secret

1. **developers.facebook.com → seu app → Settings → Basic**
2. Em **App Secret**, clique em **Mostrar** (digita sua senha do Facebook)
3. **Copia e guarda**

#### g) Anotar os IDs

Da tela **WhatsApp → Configuração da API**, anote:
- `META_PHONE_NUMBER_ID` — está como **"ID do número de telefone"**
- `META_BUSINESS_ACCOUNT_ID` — está como **"ID da conta do WhatsApp Business"**

### 3.3 Configurar o webhook na Meta

1. **developers.facebook.com → app → WhatsApp → Configuração → Webhook**
2. **URL de retorno**: `https://<seu-deploy>.vercel.app/api/whatsapp/webhook`
3. **Token de verificação**: o mesmo valor de `META_WEBHOOK_VERIFY_TOKEN` do `.env.local`
4. Clique **Verificar e salvar** (a Meta vai bater no GET; o webhook responde com o challenge)
5. Em **Webhook fields → Gerenciar**, marque o campo **`messages`** (sem isso, mensagens recebidas não disparam o webhook)

### 3.4 Cadastrar primeiro motorista e veículo

No dashboard:

1. `/motoristas/novo` — cadastre o motorista. ⚠️ **Atenção ao campo `whatsapp`**: a Meta entrega o `from` sem o nono dígito do celular brasileiro. O sistema já normaliza com `gerarVariacoesBrasileiras` (testa com e sem o 9), então pode salvar com ou sem o 9. Padrão sugerido: salvar **com** o 9.
2. `/veiculos/novo` — cadastre pelo menos 1 veículo ativo (sem isso, ao mandar "oi" o bot responde "Nenhum caminhão cadastrado")

### 3.5 Vincular motorista a usuário (opcional, mas recomendado)

Pra o motorista também acessar o app web em `/motorista`:

1. `/usuarios/novo` — crie um usuário com role `motorista` e a empresa
2. No Supabase Studio, edite a linha em `perfis` desse usuário e preencha `motorista_id` com o UUID do motorista

---

## 4. Variáveis de ambiente

### Modo atual (uma única empresa por deploy)

No `.env.local` (dev) e no Vercel (Production + Preview):

```env
NEXT_PUBLIC_SUPABASE_URL=https://<seu-projeto>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...

META_WHATSAPP_TOKEN=EAA...          # System User Token (3.2.e)
META_PHONE_NUMBER_ID=10787...       # ID do número (3.2.g)
META_BUSINESS_ACCOUNT_ID=13135...   # ID da WABA (3.2.g)
META_WEBHOOK_VERIFY_TOKEN=algo-aleatorio-secreto
META_APP_SECRET=abc123...           # App Secret (3.2.f) — habilita validação HMAC

OPENAI_API_KEY=sk-...               # Pra OCR de odômetro, cupons, análise de avaria

# Opcional
SENTRY_DSN=https://...
NEXT_PUBLIC_SENTRY_DSN=https://...
```

> Toda vez que você muda uma env no Vercel: **Deployments → último → ⋯ → Redeploy**. Env nova não vale sem redeploy.

---

## 5. Modelos de escala

Quando aparecer a segunda, terceira, décima empresa, você escolhe entre estas 3 arquiteturas:

### Modelo A — Multi-tenant na sua WABA (1-25 empresas)

**Como funciona:** você mantém **1 só** Meta App e **1 só** WABA. Cada empresa-cliente é só um número adicional dentro da sua WABA (limite de 25 números).

**Mudanças no código necessárias:**
- Webhook hoje lê `META_*` de env. Migrar para ler de `empresas.meta_*` (novas colunas no DB), resolvendo a empresa pelo `phone_number_id` que vem no payload (`metadata.phone_number_id`).
- Criptografar tokens em repouso (use [pgsodium](https://github.com/michelp/pgsodium) ou armazene fora do DB, ex: Vercel Edge Config).

**Trade-offs:**
- ✅ Onboarding rápido (você adiciona o número no seu painel Meta)
- ❌ Todas as conversas aparecem como "sua marca" no zap dos motoristas, não a marca da empresa-cliente
- ❌ Verificação business é a **sua**; uma rejeição derruba todas as empresas
- ❌ Teto de 25 números por WABA

### Modelo B — Deploy isolado por empresa (2-10 empresas)

**Como funciona:** você duplica o deploy do Vercel para cada cliente (`empresa1.vercel.app`, `empresa2.vercel.app`...) com env vars diferentes apontando para WABAs distintas. Mesmo repo, branches diferentes ou só env diferentes via Vercel CLI.

**Trade-offs:**
- ✅ Cada empresa fica com a marca dela
- ✅ Isolamento total — se uma conta cair, as outras seguem
- ❌ Você mantém N deploys (atualizar todos a cada release)
- ❌ Custo Vercel multiplicado

### Modelo C — Tech Provider / BSP (10+ empresas, modelo SaaS)

**Como funciona:** sua empresa se cadastra como **Tech Provider** na Meta. Cliente final usa **Embedded Signup** pelo seu produto (botão "Conectar WhatsApp" → fluxo Meta → autoriza seu app → conecta o número dele). A WABA é da empresa-cliente, mas você opera ela via Graph API.

**Mudanças no código necessárias:**
- Implementar fluxo Embedded Signup (OAuth Meta + endpoints)
- Webhook resolve empresa pelo `phone_number_id` (igual modelo A)
- Storage seguro dos tokens por empresa
- Painel de "Conectar/Desconectar WhatsApp" no dashboard

**Trade-offs:**
- ✅ Onboarding self-service em 5 minutos (cliente faz sozinho)
- ✅ Sua empresa fica como integradora, não responsável pelas mensagens
- ✅ Modelo dos SaaS sérios (Twilio, Zenvia, 360dialog, Take Blip)
- ❌ Sua empresa precisa virar **Tech Provider verificado** na Meta (passa por revisão)
- ❌ Implementação inicial mais densa (~1-2 semanas de trabalho)

**Recomendação:** comece com a empresa atual no modo Modelo A pareado com env vars (jeito atual). Quando aparecer a 2ª empresa, migre para Modelo A "de verdade" (resolvendo empresa pelo `phone_number_id`). Quando passar de 5-10 empresas, parta para o Modelo C.

---

## 6. Troubleshooting

### `401 / OAuthException code 190 — Session has expired`

Token expirado. Causa: você está usando token temporário de 24h em vez de System User Token. Solução: gerar System User Token permanente (3.2.e) e atualizar `META_WHATSAPP_TOKEN` no Vercel + redeploy.

### `131030 — Recipient phone number not in allowed list`

Aparece com número de teste da Meta. O destinatário precisa estar verificado no painel: **WhatsApp → Configuração da API → "Para" → + Adicionar número**. Confirma via SMS o código.

Em produção (com número próprio e WABA verificada), esse erro não aparece para conversas dentro da janela de 24h.

### `130497 — Business account is restricted from messaging users in this country`

A WABA não tem permissão de enviar para o país do destinatário. Causas comuns:
- **Verificação business incompleta** → completar em business.facebook.com → Centro de Segurança
- **Display name não aprovado** → WhatsApp Manager → Editar perfil → Nome para exibição
- **Tier 0** sem qualidade suficiente → conversas precisam ser iniciadas pelo usuário (responder em até 24h)

### `42703 — column X does not exist`

Schema do Supabase divergente do código. Conferir `src/types/database.types.ts` vs. tabela real. Regenerar via `npx supabase gen types typescript ...` se a estrutura mudou.

### Mensagens recebidas mas bot não responde

1. Filtra logs por `from=<numero>` no Vercel
2. Procura na ordem:
   - `motorista_query_failed` → erro na query (schema, RLS, key errada)
   - `remetente_desconhecido` → número não cadastrado em `motoristas.whatsapp` **com ou sem o 9 brasileiro**
   - `insert_failed` (sessionManager) → coluna inexistente em `sessoes_whatsapp`
   - `messageSender 4xx/5xx` → problema na Graph API (ver o `code` retornado)
3. Sem nenhum log com seu número → Meta não está entregando o webhook. Conferir em **WhatsApp → Configuração → Webhook**: status "Verificado" + campo `messages` marcado em "Gerenciar".

### Bot envia (Meta retorna `wamid`) mas mensagem não chega no celular

- Procurar no log: `status_update status=failed errors=[{code: ...}]`
- `code: 131026` — destinatário não tem WhatsApp ou número incorreto
- `code: 130497` — restrição de país (3.6 acima)
- `code: 131056` — par (sender, recipient) bloqueado por política Meta

Se `status=delivered` e ainda assim você não vê: procurar o thread em **Conversas arquivadas** no celular, ou pelo número exato (`+15556458410` por padrão para o número de teste da Meta).

---

## 7. Checklist final para validar onboarding

Marque cada item antes de entregar o sistema pra empresa:

- [ ] Empresa criada em `/empresas/novo`
- [ ] WABA criada e número verificado na Meta
- [ ] Verificação business **aprovada** (Centro de Segurança)
- [ ] Display name **aprovado**
- [ ] System User Token gerado (não temporário)
- [ ] App Secret copiado e configurado no Vercel
- [ ] Webhook URL configurada e **verificada** no painel Meta
- [ ] Campo `messages` marcado em "Gerenciar" no webhook
- [ ] Env vars no Vercel + redeploy feito
- [ ] Pelo menos 1 motorista cadastrado com `whatsapp` correto + `ativo=true`
- [ ] Pelo menos 1 veículo cadastrado com `ativo=true`
- [ ] Motorista manda "oi" → recebe lista de caminhões ✅
- [ ] Motorista seleciona caminhão → recebe menu ✅
- [ ] Motorista escolhe "Informar KM" → manda foto → IA lê o odômetro ✅

Se todos os 13 marcados, a empresa está em produção.
