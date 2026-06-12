# 🧭 Matriz de Implantação — Manual × Script × Em nome de quem

> 📎 Voltar ao [INDEX de Deploy](INDEX.md) | Par deste doc: [implantacao-cliente.md](implantacao-cliente.md)
>
> **A regra de ouro da implantação:** toda conta nasce **EM NOME DO CONTRATANTE**
> (e-mail dele, cartão dele, CNPJ dele). O implantador opera; o cliente é dono.
> Se um dia a parceria acabar, o sistema continua sendo dele — e as cobranças também.

---

## 📋 ANTES DE COMEÇAR — o que pedir ao cliente (1 dia antes)

| Item | Pra quê | Sem isso trava o quê |
|---|---|---|
| **E-mail corporativo** (ou Gmail novo da empresa) | Todas as contas | Tudo |
| **Cartão de crédito** do titular | Oracle (verificação), Google Cloud (billing), OpenAI (crédito), Cloudflare R2 | VM, geocoding, OCR, fotos |
| **Celular do titular presente** na implantação | SMS de verificação da Oracle + escanear QR do WhatsApp | VM e bot |
| **Chip novo SEM WhatsApp** (número do bot) | A conta do zap do bot | Bot inteiro |
| **CNPJ/endereço** | Cadastro Oracle/faturas | VM |
| Lista de motoristas (nome+celular) e veículos (placa+apelido) | Carga inicial | Operação no dia 1 |

---

## 🗺️ A matriz serviço a serviço (na ordem de execução)

**Legenda:** 👤 = mão humana obrigatória (console/celular) · 🤖 = script/IA executa · 💳 = exige cartão

| # | Serviço | Criação da conta | Configuração | Quem sofre |
|---|---|---|---|---|
| 1 | **GitHub** | 👤 conta do cliente (2 min) | 🤖 fork/transfer do repo + deploy key | nada |
| 2 | **Supabase** | 👤 login com GitHub (2 min) | 🤖 **KIT COMPLETO**: `schema_base_completo.sql` → `complemento` → seeds → migrations (SQL Editor/MCP) | nada — era a pior parte, virou script em 11/06 |
| 3 | **Oracle Cloud** | 👤👤👤 **A MAIS MANUAL**: cadastro com CNPJ + 💳 cartão real + SMS no celular do titular; aprovação pode levar horas | 👤 criar VM ARM (ou importar tua Custom Image) + Security List (portas 8080/5000/3000/12345) → **depois 100% 🤖** (16 passos via SSH, arquivão §12) | aqui mora o sofrimento — agendar com o titular PRESENTE |
| 4 | **OSRM/VROOM/Overpass** | — (moram na VM) | 🤖 script SSH completo (download mapa + docker compose) ~1h de máquina | nada (só espera) |
| 5 | **Evolution API** | — (mora na VM) | 🤖 docker via SSH + criar instância via API · 👤 **QR Code**: celular com o chip do bot escaneia NA HORA | 5 min com o celular na mão |
| 6 | **Cloudflare R2** | 👤 conta + 💳 método de pagamento (free 10GB) | 👤 criar bucket + API token (5 min, console) | pouco |
| 7 | **Google (Gemini)** | 👤 conta Google do cliente | 👤 aistudio.google.com → chave (2 cliques) | nada |
| 8 | **Google Maps** | (mesma conta Google) | 👤 console.cloud → projeto + **ATIVAR BILLING 💳** + ativar Geocoding API + restringir chave | chato (~10 min); sem billing a chave não funciona e o erro é confuso |
| 9 | **Deepgram** | 👤 signup (US$200 grátis, sem cartão) | 👤 criar API key (2 min) | nada |
| 10 | **OpenAI** | 👤 conta + 💳 crédito mínimo (US$5) | 👤 API key (3 min) | só o cartão |
| 11 | **Sentry** (opcional) | 👤 signup grátis | 👤 projeto Next.js → DSN + token (5 min) | nada |
| 12 | **Vercel** | 👤 login com GitHub do cliente | 👤 import do repo + região `iad1` · 🤖 env vars via `vercel env add` (CLI) ou 👤 colar do template | médio (~15 min) |
| 13 | **ViaCEP / Nominatim** | — sem cadastro | 🤖 já no template | nada |
| 14 | **Banco: regras+autorizações** | — | 🤖 seeds das 18 regras · 👤 cadastrar TELEFONES do gestor/esposa + marcar autorizações na tela (lição 11/06: regra sem autorização = "não entendi") | 10 min |
| 15 | **Monitoramento** (opcional, ex. Uptime Kuma na VM) | — (mora na VM do cliente) | 🤖 docker na VM · setar `NEXT_PUBLIC_MONITOR_URL` na Vercel (sem a var, o badge "Sistemas OK" fica sem link — nunca apontar pra VM de OUTRA implantação) | nada |

---

## ⏱️ Resumo executivo da implantação

- **Mão humana total:** ~1h30 de console/celular — concentrada em Oracle (a pior), Google Maps billing e QR Code.
- **Máquina/script:** ~1h30-2h (mapa do Brasil processando é o gargalo; roda sozinho).
- **Caminho feliz:** manhã = contas (cliente presente com cartão e celular); almoço = VM processando mapa; tarde = Vercel + QR + seeds + teste final ("motorista manda oi").
- **Alternativa rápida (cliente 1-3):** pular Oracle inteiro usando a **VM compartilhada** (Evolution multi-instância + OSRM/VROOM são stateless) → implantação cai pra ~2h e a VM própria vira upgrade futuro via Custom Image.

## 🚫 Erros que já sofremos (não repetir)

1. Conta criada no e-mail do implantador → cliente refém. **Sempre no e-mail do cliente.**
2. Chip com WhatsApp já ativo → QR não pareia. **Chip virgem de WhatsApp.**
3. Google Maps sem billing → geocoding falha com erro genérico. **Billing primeiro, chave depois.**
4. Esquecer autorizações de telefone → bot "não entendi" pra tudo. **Último passo SEMPRE.**
5. Registrar e-mail/cartão usado em cada serviço na página **`/uso-apis`** (cifrado) — pro cliente nunca perder a própria conta.
