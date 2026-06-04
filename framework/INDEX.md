# 🗂️ Framework — Sistema de Frota

> **Ponto central de documentação.** Qualquer IA ou desenvolvedor começa aqui.
> Não procure .md espalhados pelo projeto — tudo está organizado aqui.

---

## O que você quer fazer?

### 🤖 WhatsApp Bot → [01-whatsapp-bot/](01-whatsapp-bot/INDEX.md)

| Quero... | Vá para |
|---|---|
| **Adicionar nova consulta via WhatsApp** (ex: consultar entregas, despesas) | [como-consultar-tabela.md](01-whatsapp-bot/como-consultar-tabela.md) |
| **Criar nova tool** pro Gemini (function calling) | [como-adicionar-tool.md](01-whatsapp-bot/como-adicionar-tool.md) |
| Entender como o bot funciona (arquitetura, camadas, fluxo) | [arquitetura.md](01-whatsapp-bot/arquitetura.md) |
| Configurar Evolution API / Railway / QR Code | [setup-evolution.md](01-whatsapp-bot/setup-evolution.md) |
| Configurar áudio / Deepgram / transcrição | [audio-e-transcricao.md](01-whatsapp-bot/audio-e-transcricao.md) |
| Ver bugs conhecidos e armadilhas | [bugs-conhecidos.md](01-whatsapp-bot/bugs-conhecidos.md) |

---

### 🔑 APIs e Chaves → [02-apis-e-chaves/](02-apis-e-chaves/INDEX.md)

| Quero... | Vá para |
|---|---|
| Ver TODAS as APIs e como obter cada chave | [todas-as-apis.md](02-apis-e-chaves/todas-as-apis.md) |
| Copiar template do `.env.local` completo | [env-template.md](02-apis-e-chaves/env-template.md) |

---

### 🚀 Deploy e Infraestrutura → [03-deploy/](03-deploy/INDEX.md)

| Quero... | Vá para |
|---|---|
| Fazer deploy na Vercel (região, env vars, redeploy) | [vercel.md](03-deploy/vercel.md) |
| Configurar Railway (Evolution API Docker) | [railway.md](03-deploy/railway.md) |
| Configurar Oracle Cloud VM (OSRM + VROOM) | [oracle-cloud.md](03-deploy/oracle-cloud.md) |
| Implantar sistema para novo cliente (do zero) | [implantacao-cliente.md](03-deploy/implantacao-cliente.md) |
| Cadastrar nova empresa no sistema | [onboarding-empresa.md](03-deploy/onboarding-empresa.md) |

---

### 🗺️ Roteirização → [04-roteirizacao/](04-roteirizacao/INDEX.md)

| Quero... | Vá para |
|---|---|
| Entender OSRM + VROOM + como rotas funcionam | [osrm-vroom-setup.md](04-roteirizacao/osrm-vroom-setup.md) |

---

### 📋 Planos e Decisões → [05-planos-e-decisoes/](05-planos-e-decisoes/INDEX.md)

| Quero... | Vá para |
|---|---|
| Ver o que falta fazer / ações pendentes | [acoes-pendentes.md](05-planos-e-decisoes/acoes-pendentes.md) |

> Documentos grandes de referência (PLANO_DE_PROJETO 177KB, logistica 68KB, PLANO_ROTEIRIZACAO 68KB) continuam na raiz do projeto. Links em [05-planos-e-decisoes/INDEX.md](05-planos-e-decisoes/INDEX.md).

---

### 🧪 Testes → [06-testes/](06-testes/INDEX.md)

| Quero... | Vá para |
|---|---|
| Entender a política de testes obrigatória | [politica.md](06-testes/politica.md) |

---

## Mapa rápido de arquivos

```
framework/
├── INDEX.md                         ← VOCÊ ESTÁ AQUI
├── 01-whatsapp-bot/
│   ├── INDEX.md
│   ├── arquitetura.md               ← Camadas, módulos, fluxo de mensagem
│   ├── como-adicionar-tool.md       ← Passo a passo: nova tool no Gemini
│   ├── como-consultar-tabela.md     ← Passo a passo: nova consulta via WhatsApp
│   ├── setup-evolution.md           ← Railway, Docker, QR Code, webhook
│   ├── audio-e-transcricao.md       ← Deepgram, download encriptado
│   └── bugs-conhecidos.md           ← B1-B27, armadilhas, lições
├── 02-apis-e-chaves/
│   ├── INDEX.md
│   ├── todas-as-apis.md             ← 16 serviços, como obter cada chave
│   └── env-template.md              ← .env.local completo
├── 03-deploy/
│   ├── INDEX.md
│   ├── vercel.md
│   ├── railway.md
│   ├── oracle-cloud.md
│   ├── implantacao-cliente.md
│   └── onboarding-empresa.md
├── 04-roteirizacao/
│   ├── INDEX.md
│   └── osrm-vroom-setup.md
├── 05-planos-e-decisoes/
│   ├── INDEX.md
│   └── acoes-pendentes.md
└── 06-testes/
    ├── INDEX.md
    └── politica.md
```

---

## Documentos legados (raiz do projeto)

Os seguintes arquivos foram **deletados** da raiz (conteúdo migrado para cá):
- ~~WHATSAPP_BOT_SETUP.md~~ → `01-whatsapp-bot/setup-evolution.md`
- ~~MAPA_APIS.md~~ → `02-apis-e-chaves/todas-as-apis.md`
- ~~GUIA_IMPLANTACAO_CLIENTE.md~~ → `03-deploy/implantacao-cliente.md`
- ~~ONBOARDING.md~~ → `03-deploy/onboarding-empresa.md`
- ~~PLANO_IA_WHATSAPP.md~~ → `01-whatsapp-bot/arquitetura.md`

Estes **permanecem** na raiz (documentos de referência grandes):

| Arquivo | Referenciado por |
|---|---|
| [docs/BOT_FRAMEWORK.md](../docs/BOT_FRAMEWORK.md) | `01-whatsapp-bot/arquitetura.md` |
| [docs/GUIA_APIS_SETUP.md](../docs/GUIA_APIS_SETUP.md) | `02-apis-e-chaves/todas-as-apis.md` |
| [ORACLE_CLOUD_SETUP.md](../ORACLE_CLOUD_SETUP.md) | `03-deploy/oracle-cloud.md` |

---

*Última atualização: 04/06/2026*
