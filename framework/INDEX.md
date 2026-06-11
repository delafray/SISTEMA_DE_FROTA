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
| Migrar Evolution API do Railway → Oracle Cloud (custo zero) | [migrar-railway-para-oracle.md](03-deploy/migrar-railway-para-oracle.md) |
| Configurações atuais da VM Oracle (portas, SSH, docker-compose) | [oracle-cloud.md](03-deploy/oracle-cloud.md) |

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

> Faxina de 10/06/2026: os documentos grandes da raiz (PLANO_DE_PROJETO, logistica, log, planos executados) foram **deletados** — o que prestava foi garimpado para [docs/arquivo/ARQUIVAO_PARA_REFATORAR.md](../docs/arquivo/ARQUIVAO_PARA_REFATORAR.md). Só [PLANO_ROTEIRIZACAO.md](../PLANO_ROTEIRIZACAO.md) segue na raiz (referenciado em comentários do código).

---

### 🧪 Testes → [06-testes/](06-testes/INDEX.md)

| Quero... | Vá para |
|---|---|
| Entender a política de testes obrigatória | [politica.md](06-testes/politica.md) |

---

### 🎨 Arquitetura e UI → [07-arquitetura-e-ui/](07-arquitetura-e-ui/canvas-interativo.md)

| Quero... | Vá para |
|---|---------|
| Implementar um Canvas visual de Arquitetura no Painel (React Flow) | [canvas-interativo.md](07-arquitetura-e-ui/canvas-interativo.md) |
| Ver como funciona o Uptime Kuma, badge de status e portas abertas | [monitoramento-uptime-kuma.md](07-arquitetura-e-ui/monitoramento-uptime-kuma.md) |

---

### 📌 Decisões de produto (fora do framework)

| Quero... | Vá para |
|---|---|
| Entender por que o bot anota lembrete de **qualquer número sem trava** + Realtime instantâneo | [docs/LEMBRETES_SEM_TRAVA.md](../docs/LEMBRETES_SEM_TRAVA.md) |
| Plano (NÃO implementado) da IA com 3 intenções: Pergunta / Registro / Anotar | [docs/PLANO_IA_REGRAS_3_INTENCOES.md](../docs/PLANO_IA_REGRAS_3_INTENCOES.md) |
| Arquitetura pesquisada (com fontes) do motor de regras no-code genérico | [docs/MOTOR_REGRAS_ARQUITETURA.md](../docs/MOTOR_REGRAS_ARQUITETURA.md) |
| **Motor do bot: classificador Gemini ligado ao WhatsApp** (flag `MODO_CLASSIFICADOR`, consulta/altera-KM/desambiguação, segurança) | [docs/BOT_CLASSIFICADOR_INTEGRACAO.md](../docs/BOT_CLASSIFICADOR_INTEGRACAO.md) |
| **TODA a pesquisa de logística consolidada** (nomenclatura Pedido/Despacho, importação de notas, benchmarks TMS/SaaS, 4 empresas, decisões já tomadas) | [docs/PESQUISAS_CONSOLIDADO.md](../docs/PESQUISAS_CONSOLIDADO.md) |
| **Garimpo da faxina 10/06** — planos futuros não implementados (crons, LGPD, importação XML/XLS, empresas 01–04, broker, motor de regras, setup VM) ⚠️ precisa refatoração | [docs/arquivo/ARQUIVAO_PARA_REFATORAR.md](../docs/arquivo/ARQUIVAO_PARA_REFATORAR.md) |

> ⚠️ Decisão do dono (05/06/2026): lembretes **sem nenhuma regra** (empresa, usuário, role, RLS). **Não recolocar travas sem ordem explícita.**
> 🤖 Motor do bot (classificador) implantado 05/06/2026 atrás de `MODO_CLASSIFICADOR` (default OFF). Ligar exige `db/migration_bot_classificador.sql`. Detalhes: [docs/BOT_CLASSIFICADOR_INTEGRACAO.md](../docs/BOT_CLASSIFICADOR_INTEGRACAO.md).

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
│   └── bugs-conhecidos.md           ← B1-B29, armadilhas, lições
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
├── 06-testes/
│   ├── INDEX.md
│   └── politica.md
└── 07-arquitetura-e-ui/
    ├── canvas-interativo.md
    └── monitoramento-uptime-kuma.md  ← Uptime Kuma, badge sidebar, portas Oracle
```

---

## Documentos legados

Faxinas anteriores deletaram .md obsoletos da raiz/docs (conteúdo migrado para cá ou garimpado). Na faxina de **10/06/2026** saíram: PLANO_DE_PROJETO, logistica, log, documentacao, PLANO_LIMPEZA_MODELO, PLANO_EXECUCAO_OSRM_VM, RESEARCH_OPEN_SOURCE_TMS, ACOES_PENDENTES_USUARIO, docs/empresa01–04, PLANO_LOGISTICA_4_EMPRESAS, RESEARCH/PROPOSTA/REDESIGN/PROGRESSO_PEDIDOS_DESPACHO, docs/pesquisas-brutas/. O que prestava está em [docs/arquivo/ARQUIVAO_PARA_REFATORAR.md](../docs/arquivo/ARQUIVAO_PARA_REFATORAR.md).

Documentos de referência vivos fora do framework:

| Arquivo | Referenciado por |
|---|---|
| [docs/BOT_FRAMEWORK.md](../docs/BOT_FRAMEWORK.md) | `01-whatsapp-bot/arquitetura.md` |
| [docs/GUIA_APIS_SETUP.md](../docs/GUIA_APIS_SETUP.md) | `02-apis-e-chaves/todas-as-apis.md` |
| [docs/LEMBRETES_SEM_TRAVA.md](../docs/LEMBRETES_SEM_TRAVA.md) | Decisões de produto (índice acima) |
| [ORACLE_CLOUD_SETUP.md](../ORACLE_CLOUD_SETUP.md) | `03-deploy/oracle-cloud.md` |
| [PLANO_ROTEIRIZACAO.md](../PLANO_ROTEIRIZACAO.md) | Comentários no código (`Referencia: passo X`) |

---

*Última atualização: 10/06/2026 — Faxina dos .md: ~20 arquivos obsoletos deletados; conteúdo útil garimpado em docs/arquivo/ARQUIVAO_PARA_REFATORAR.md.*
