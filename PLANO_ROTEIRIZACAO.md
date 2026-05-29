# Plano de Implementação — Roteirização de Frota

> ## 🚨 INSTRUÇÃO OBRIGATÓRIA PARA A IA QUE FOR EXECUTAR ESTE PLANO
>
> **NÃO comece a implementar nada antes de fazer o seguinte:**
>
> 1. **Leia este plano INTEIRO**, do começo ao fim, sem pular seções.
> 2. **Tique mentalmente cada item** das três etapas (Cadastros, Instalação, Programação) e de cada subseção.
> 3. **Faça uma checklist em voz alta** com o usuário ANTES de começar, no formato:
>    ```
>    Vou confirmar com você cada ponto do plano antes de tocar em código.
>    Por favor responda SIM / NÃO / MUDAR para cada um:
>
>    ETAPA 1 — Cadastros:
>    [ ] 1.1. Criar conta Oracle Cloud (SP, VM ARM 4OCPU+24GB) — confirma?
>    [ ] 1.2. Baixar mapa Brasil do Geofabrik — confirma?
>    [ ] 1.3. Usar Nominatim público para geocoding inicial — confirma?
>    [ ] 1.4. Deep link Waze + Google Maps no celular do motorista — confirma?
>    [ ] 1.5. Começar com MeuDanfe (grátis) para consulta NFe — confirma?
>    ...e assim por diante para CADA subseção.
>    ```
> 4. **Para cada item, espere a confirmação do usuário** antes de marcar como aprovado.
> 5. **Se o usuário pedir mudança em algum ponto**, atualize ESTE arquivo (`PLANO_ROTEIRIZACAO.md`) com a nova decisão antes de codar.
> 6. **NUNCA assuma** que um ponto está OK porque "faz sentido tecnicamente" — pergunte. O usuário já teve problema antes com IA que decidiu sozinha e implementou coisas que não estavam combinadas.
> 7. **Só comece a etapa 2 (instalação no servidor) e etapa 3 (programação) depois que a checklist inteira tiver SIM em todos os pontos.**
> 8. **Ao codar, marque progresso item a item neste arquivo** (trocando `[ ]` por `[x]` com data).
> 9. **Ao fim de cada subseção implementada**, rodar `npm test` conforme `TESTING.md` e reportar resultado ao usuário antes de seguir.
> 10. **Se descobrir durante a execução** que algo no plano está incompleto, errado ou conflitante com a realidade do código, **PARE e pergunte** — não improvise.
>
> ---
>
> ## 🔁 REGRA DE CONTINUIDADE ENTRE IAs (LEIA SE ESTÁ RETOMANDO ESTE PLANO)
>
> Se você é uma IA chegando AGORA pra continuar este plano (não foi você que começou):
>
> **A) Marcar item como concluído (obrigatório quando terminar um passo):**
> - No arquivo, troque `⬜` por `✅` no início da linha do passo.
> - Adicione `(✅ feito YYYY-MM-DD por <modelo>)` no fim do título do passo.
> - Exemplo: `1.1 ⬜ Cliente ViaCEP + cache` vira `1.1 ✅ Cliente ViaCEP + cache (✅ feito 2026-05-28 por Claude Opus 4.7)`.
> - Esse marcador é o sinal pra próxima IA: **item concluído, pode pular pro próximo, NÃO precisa refazer**.
>
> **B) Encontrou um item `✅`? IGNORA e vai pro próximo `⬜`.**
> - Não revisa, não "melhora", não reescreve. Confia no que foi feito. Se quiser melhorar, isso é OUTRA tarefa — só com autorização explícita do usuário.
>
> **C) NUNCA pular item `⬜` sem antes concluir.**
> - Se o passo 1.5 está `⬜` e você acha que 1.7 já pode rodar, **PARE**. A ordem foi pensada com dependências explícitas. Pular gera quebra silenciosa depois.
>
> **D) Se você ACHA que algo lá embaixo precisa ser feito antes (mudança de ordem):**
> - **NÃO faça.** Não execute fora de ordem.
> - **REESTRUTURE o plano:** edite este arquivo movendo o item pra posição correta, atualize as tabelas de dependências (`Pre-req`), atualize a ordem numérica, adicione uma nota na seção "Revisões Importantes" explicando a mudança e o motivo.
> - **DEPOIS** peça confirmação do usuário antes de codar.
> - **Por quê:** se você implementa fora de ordem sem atualizar o plano, a próxima IA lê o plano e acha que algo não foi feito quando foi. Plano sempre tem que refletir a realidade do código.
>
> **E) Se descobrir incoerência no plano:**
> - Não improvise. Pare, documente a incoerência no arquivo (seção "Revisões Importantes"), pergunte ao usuário.
>
> **F) Toda alteração no plano deve ser commitada antes de codar.**
> - Plano e código andam juntos. Plano desatualizado = caos pra próxima IA.
>
> **Resumo da regra de continuidade em uma linha:** _itens marcados `✅` estão prontos (ignore), itens `⬜` fazem em ordem (nunca pule), mudança de ordem exige reestruturação do plano antes de codar._
>
> **Motivo desta regra:** o usuário relatou que, em planejamentos anteriores, a IA não confirmou pontos importantes do plano e implementou coisas que ele não tinha aprovado. Esta regra existe para impedir que isso aconteça de novo.

---

## 📋 Revisões Importantes — 2026-05-27

Após discussão sobre custo/volume de APIs de consulta NFe e risco operacional, o plano foi dividido em duas fases.

### 1. ✅ Captura de paradas — passa a ser por DIGITAÇÃO MANUAL (CEP + Nº + ViaCEP)

**Por que a mudança:**
- Volume real estimado: 10 caminhões × 70 NFs × 7 dias = **~4.900 consultas/semana** (~700/dia).
- **MeuDanfe (tier free)** limita a ~100 consultas/dia → o plano original estoura em 14% de um único dia útil.
- Certificado A1 da SEFAZ (~R$200/ano) resolveria volume ilimitado, mas adiciona custo + complexidade no MVP.
- **ViaCEP é grátis, ilimitado, e adiciona apenas ~2-3 segundos por NF** vs QR Code + API.
- Risco operacional: API caindo trava o motorista no carregamento. Digitação manual sempre funciona.

**Decisão (Fase 1 — MVP):** captura passa a ser por formulário:
1. Motorista digita o **CEP** (8 dígitos)
2. **ViaCEP** autocompleta logradouro, bairro, cidade, UF
3. Motorista digita o **número** da casa
4. **Confirma visualmente** → salva → próxima NF

Tempo estimado: ~10 segundos por NF, ~12 minutos para 70 NFs. Sem dependência externa além de ViaCEP.

### 2. ✅ QR Code + Consulta SEFAZ — REBAIXADO para Fase 2 (opcional)

Toda a infraestrutura originalmente prevista (LeitorQRCode, validação módulo 11, consulta MeuDanfe/SEFAZ, fila offline com retry exponencial) **continua documentada nas seções 1.6 e 3.7-Fase2**, mas marcada como **FASE 2 — OPCIONAL**.

Vale implementar quando uma destas acontecer:
- Volume crescer (>1000 NFs/dia, motoristas reclamarem do tempo de digitação)
- Empresa comprar certificado A1 da SEFAZ
- Surgir cliente Premium pagando pela automação total

### 3. ✅ Módulo isolado em `src/app/mobile/captura-notas/`

O fluxo de captura é **separado** do bot WhatsApp e do dashboard do gestor:
- `src/app/mobile/captura-notas/page.tsx` — tela do motorista
- `src/components/mobile/InputEnderecoNF.tsx` — componente de captura (Fase 1)
- `src/lib/cep/viacep.ts` — cliente ViaCEP (Fase 1)
- `src/lib/nfe/` — toda lógica de NFe (Fase 2 — adiada)
- `src/components/mobile/LeitorQRCode.tsx` — Fase 2 (adiado)

Compartilha apenas o sistema de auth/sessão e o framework mobile iPhone-first já existente.

### 4. ✅ Nova ETAPA 0 — Setup Completo do MVP (estrutura coerente)

Plano reestruturado para garantir que **TUDO de setup acontece de uma vez antes de codar feature**, evitando loops "implementa X → falta tabela Y → para → cria tabela Y → volta a codar":

- **0.1.** Schema Supabase (5 tabelas) — ✅ **APLICADO em 2026-05-27** pelo usuário direto no painel.
- **0.2.** Dependências npm — um único `npm install` com tudo da Fase 1.
- **0.3.** Variáveis de ambiente — `.env.local` com todas as URLs (OSRM/VROOM ficam vazias até Oracle subir).
- **0.4.** Estrutura de pastas — criar todas vazias com `.gitkeep`.
- **0.5.** Tipos compartilhados em `types.ts` — replicar o schema do banco em TypeScript antes de qualquer lógica.

A **Ordem Recomendada de Execução** foi reescrita com tabela de dependências explícitas: cada passo lista seu pré-requisito e o(s) teste(s) que precisa escrever junto.

**Decisão arquitetural reforçada:** módulo de captura é **totalmente isolado** (sem FKs pras tabelas existentes `motoristas`/`empresas`/`clientes`). Consolidação com sistema principal vira migration posterior, fora do escopo do MVP.

---

## 📋 Revisões Importantes — 2026-05-21

Após avaliação cruzada com outra IA + discussão com o dono, três pontos do plano original foram revisados:

### 1. ✅ Servidor — Oracle Cloud Free Tier (CONFIRMADO)
- Mapa do Brasil inteiro exige 24 GB RAM → Oracle Free é a única opção gratuita viável.
- Alternativa paga (Contabo VPS XL ~R$ 100/mês) descartada — Oracle Free vale a paciência.
- **Adicionado:** script de automação para conseguir a VM (loop a cada 30s, ver seção 1.1).
- **Adicionado:** cron de keep-alive (seção 2.9) — pinga OSRM a cada 6h pra evitar Oracle recuperar a VM por baixa atividade.

### 2. ✅ Mapa — Brasil inteiro (NÃO só Sudeste)
- Frota opera em mais regiões além do Sudeste — manter Brasil completo.
- Processamento OSRM (30-90 min) é **1x apenas** (no setup), depois o servidor roda 24/7 e responde em ~50ms cada cálculo. Esclarecido na seção 2.4.

### 3. ✅ Offline iPhone — Foreground Queue (CORREÇÃO TÉCNICA)
- Plano original usava **Background Sync API**, que **NÃO funciona no iOS Safari** (só Chrome/Android).
- Como framework mobile do projeto é iPhone-first, trocado para **Foreground Queue**: fila local (IndexedDB) + worker em foreground que sincroniza enquanto app está aberto.
- Funciona iPhone E Android, sem perda funcional pro caso real (motorista mantém app aberto enquanto escaneia 70 notas).
- Detalhes completos na seção 3.8.

### 4. ✅ Waze — sem mudança
- Deep link `https://waze.com/ul?ll=...` funciona em iPhone E Android. Não depende de Background Sync nem de internet local. Independente da fila offline.

---

> **Objetivo:** Integrar cálculo e otimização de rotas no sistema de frota (10 caminhões × ~70 entregas/dia), custo zero, com navegação ao vivo delegada ao Waze/Google Maps via deep link.

**Stack final (revisada 2026-05-27):**
- **OSRM** (motor de cálculo de rota) — auto-hospedado no **Oracle Free Tier**
- **VROOM** (otimização VRP — ordem das paradas) — auto-hospedado
- **ViaCEP** (autocompletar endereço a partir do CEP) — captura principal Fase 1
- **Formulário mobile** (motorista digita CEP + número) — captura principal Fase 1
- **Foreground Queue (IndexedDB via Dexie)** — fila local iOS-compatível para sincronizar capturas mesmo offline
- **Leaflet + OpenStreetMap** (mapa visual no sistema)
- **Nominatim** (busca endereço completo → coordenadas para VROOM)
- **Waze / Google Maps deep link** (navegação ao vivo no celular do motorista)
- **(Fase 2)** Leitor de QR Code + consulta SEFAZ/MeuDanfe — atalho opcional futuro

**Como as paradas entram no sistema (Fase 1 — MVP):**
O gestor da empresa **não tem as notas fiscais antes** do caminhão sair — o motorista recebe as notas em papel na hora. A captura é feita **pelo próprio motorista pelo celular**, em um fluxo de 3 passos por NF:

1. **Digita o CEP** (8 dígitos) → ViaCEP autocompleta logradouro, bairro, cidade, UF (~300ms)
2. **Digita o número** da casa
3. **Confere e confirma** → salva no banco → próxima NF

Após capturar todas as NFs, o sistema dispara o VROOM com os endereços completos (geocodificados via Nominatim) para otimizar a ordem das paradas.

**Como as paradas entrarão no sistema (Fase 2 — futuro opcional):**
QR Code como atalho — se ler com sucesso, pula a digitação; se a chave for inválida ou API SEFAZ/MeuDanfe estiver fora, cai no fluxo manual da Fase 1. Detalhes na seção 3.7-Fase2.

---

## ETAPA 0 — Setup Completo do MVP (FAZER TUDO ANTES DE CODAR FEATURE)

> **Principio:** o terreno tem que estar 100% pronto antes de comecar a implementar features. Cada item desta etapa elimina uma dependencia futura.

### 0.1. Schema Supabase — 5 tabelas novas (✅ APLICADO 2026-05-27)

**Status:** SQL ja aplicado pelo usuario direto no painel Supabase em 2026-05-27.

Tabelas criadas (todas com RLS habilitada, sem policies de user — operacoes via API Next.js com `SUPABASE_SERVICE_ROLE_KEY`):

| Tabela | Proposito |
|---|---|
| `notas_capturadas` | Cada NF que o motorista digita (CEP, numero, endereco do ViaCEP). |
| `rotas_otimizadas` | Uma "viagem do dia" — agrupa varias paradas. |
| `paradas` | Cada parada individual da rota (com ordem, fixada, janela_horario). |
| `cep_cache` | Cache de consultas ao ViaCEP (evita request duplicado). |
| `cliente_preferencias` | Preferencias por cliente (ex: "sempre por ultimo"). |

**Decisao arquitetural:** modulo totalmente isolado — **sem FKs** pras tabelas existentes (`motoristas`, `empresas`, `clientes`). Os campos `motorista_id`/`empresa_id`/`cliente_id` sao `uuid` puros, validacao logica no app. A consolidacao com o sistema atual sera feita em migration posterior.

**Snapshot do SQL:** salvo no historico do chat (sessao 2026-05-27). Pode ser regerado consultando o schema das tabelas no Supabase.

### 0.2. Dependencias npm — instalar TUDO de uma vez

```bash
npm install dexie leaflet react-leaflet @dnd-kit/core @dnd-kit/sortable
npm install -D @types/leaflet
```

| Lib | Pra que |
|---|---|
| `dexie` | Wrapper IndexedDB pra fila offline (passo 1.2 da Fase 1) |
| `leaflet` + `react-leaflet` | Mapa visual (passo 1.8) |
| `@types/leaflet` | Types TypeScript do Leaflet |
| `@dnd-kit/core` + `/sortable` | Drag-and-drop da tela "Ajuste de Rota" (passo 1.9) |

Nada de Tesseract, html5-qrcode, zxing — esses sao Fase 2 (opcional, futuro).

### 0.3. Variaveis de ambiente — adicionar TODAS no `.env.local`

```env
# ─── Routing MVP — Fase 1 ───
NOMINATIM_URL=https://nominatim.openstreetmap.org
VIACEP_URL=https://viacep.com.br/ws

# ─── Routing MVP — preenchidas DEPOIS de provisionar Oracle (ETAPA 2) ───
OSRM_URL=
VROOM_URL=
```

E em `src/lib/env.ts` (ou onde o projeto valida env vars com Zod):

```ts
OSRM_URL: z.string().url().optional(),     // optional ate Oracle estar de pe
VROOM_URL: z.string().url().optional(),
NOMINATIM_URL: z.string().url(),
VIACEP_URL: z.string().url(),
```

Adicionar tambem no `.env.example` pra documentar pros proximos devs.

### 0.4. Estrutura de pastas — criar TODAS vazias com `.gitkeep`

```
src/lib/cep/                      # FASE 1
src/lib/offline/                  # FASE 1
src/lib/routing/                  # FASE 1
src/app/mobile/captura-notas/     # FASE 1
src/app/api/routing/              # FASE 1

src/lib/nfe/                      # FASE 2 (placeholder vazio agora)
```

`src/components/mobile/` ja existe (commit `7123f80`).

### 0.5. Tipos compartilhados — definir TODOS antes de codar logica

Arquivo a criar: `src/lib/routing/types.ts`

```ts
// Replica em TS do schema do banco (sem decimal — usar number).
export interface NotaCapturada {
  id: string;
  motorista_id: string;
  empresa_id: string;
  cep: string;           // 8 digitos sem hifen
  numero: string;
  endereco: EnderecoCEP;
  latitude: number | null;
  longitude: number | null;
  observacao: string | null;
  status: 'capturada' | 'geocodificada' | 'em_rota' | 'concluida' | 'cancelada';
  capturado_em: string;  // ISO timestamp
  sincronizado_em: string | null;
}

export interface RotaOtimizada {
  id: string;
  motorista_id: string;
  empresa_id: string;
  data: string;          // YYYY-MM-DD
  distancia_total_km: number | null;
  tempo_total_min: number | null;
  status: 'rascunho' | 'otimizada' | 'em_andamento' | 'concluida' | 'cancelada';
  otimizada_em: string | null;
  criada_em: string;
}

export interface Parada {
  id: string;
  rota_id: string;
  nota_id: string | null;
  ordem: number;
  endereco: EnderecoCEP;
  latitude: number;
  longitude: number;
  fixada: boolean;
  janela_horario: [string, string][] | null;
  tempo_descarga_min: number;
  observacao: string | null;
  concluida_em: string | null;
}

export interface Coordenada {
  lat: number;
  lng: number;
}
```

Arquivo a criar: `src/lib/cep/types.ts`

```ts
export interface EnderecoCEP {
  logradouro: string;
  bairro: string;
  cidade: string;
  uf: string;
}
```

Arquivo a criar: `src/lib/offline/types.ts`

```ts
import type { NotaCapturada } from '@/lib/routing/types';

// Estado local da NF na fila (antes de sincronizar com o banco)
export interface NotaNaFila extends Omit<NotaCapturada, 'id' | 'sincronizado_em'> {
  id_local: string;                          // gerado no celular (uuid local)
  id_servidor?: string;                      // preenchido apos sincronizar
  status_sync: 'pendente' | 'sincronizada' | 'erro';
  tentativas: number;
  ultimo_erro?: string;
  proxima_tentativa?: string;                // ISO timestamp
}
```

### 0.6. Checklist de conclusao da ETAPA 0

Antes de comecar a ETAPA 1 (Cadastros externos) ou ETAPA 3 (Programacao), verificar:

- [x] 0.1. ✅ Tabelas no Supabase (5 tabelas, RLS on) — feito 2026-05-27
- [x] 0.2. ✅ Deps npm instaladas — feito 2026-05-27 (Claude Opus 4.7)
- [x] 0.3. ✅ Env vars adicionadas ao `.env.example` (usuário copia pro `.env.local`) — feito 2026-05-27 (Claude Opus 4.7)
- [x] 0.4. ✅ Pastas criadas (5 novas) — feito 2026-05-27 (Claude Opus 4.7)
- [x] 0.5. ✅ 3 arquivos `types.ts` criados (tsc 0 erros, 206/206 testes verdes) — feito 2026-05-27 (Claude Opus 4.7)

---

## ETAPA 1 — Cadastros Necessários

### 1.1. Oracle Cloud (OBRIGATÓRIO) — DECISÃO CONFIRMADA

- **Onde:** https://www.oracle.com/cloud/free/
- **O que cadastrar:** conta pessoal
- **Exige:** cartão de crédito (somente para verificação anti-fraude — não cobra)
- **Plano:** Always Free Tier
- **Região:** **São Paulo (sa-saopaulo-1)** — menor latência para o Brasil
- **Recurso a usar:** 1 VM ARM Ampere A1 (até 4 OCPU + 24 GB RAM grátis pra sempre)
- **Por quê Oracle (e não alternativas pagas):** mapa do Brasil inteiro precisa de ~24 GB de RAM. Servidores pagos com essa RAM custam R$ 100-300/mês. Oracle Free é o único que entrega 24 GB grátis.

**⚠️ Problema conhecido: "Out of Capacity" no SP**

A VM ARM gratuita é muito disputada. É comum receber:
> "Out of capacity for shape VM.Standard.A1.Flex in this availability domain."

**Solução: script de automação que tenta a cada 30s** (rodando no seu próprio computador, fora da Oracle):

```bash
# arquivo: oracle-vm-tryloop.sh
# Roda no seu PC/notebook. Tenta criar a VM a cada 30s até conseguir.
# Antes, configure OCI CLI: https://docs.oracle.com/iaas/Content/API/SDKDocs/cliinstall.htm

while true; do
  RESPONSE=$(oci compute instance launch \
    --availability-domain "<seu-AD>" \
    --compartment-id "<seu-compartment-ocid>" \
    --shape "VM.Standard.A1.Flex" \
    --shape-config '{"ocpus": 4, "memoryInGBs": 24}' \
    --image-id "<ocid-ubuntu-22-arm>" \
    --subnet-id "<ocid-da-subnet>" \
    --ssh-authorized-keys-file ~/.ssh/id_rsa.pub \
    --display-name "osrm-routing" 2>&1)

  if echo "$RESPONSE" | grep -q '"lifecycle-state"'; then
    echo "✅ VM criada com sucesso!"
    echo "$RESPONSE" | grep -E "id|public-ip"
    break
  else
    echo "$(date +'%H:%M:%S') — Sem capacidade, tentando de novo em 30s..."
    sleep 30
  fi
done
```

- Liga o script à noite, deixa rodando. De manhã geralmente já conseguiu.
- Demora típica em SP: **1-3 dias**. Em us-ashburn-1 (Virginia): minutos.
- Se preferir latência maior: us-ashburn-1 funciona (latência ~140ms vs ~30ms de SP).

**Alternativa paga (descartada — anotada só por completude):**
- Contabo VPS XL (32 GB RAM): R$ 100/mês — sobe em 5 minutos sem estresse
- Use somente se o Oracle ficar inviável após várias tentativas

### 1.2. Geofabrik (SEM cadastro)

- **Onde:** https://download.geofabrik.de/south-america/brazil.html
- **O que pegar:** arquivo `brazil-latest.osm.pbf` (~3 GB) — mapa do Brasil em formato OSM
- **Como:** download direto, sem login

### 1.3. Nominatim Público (SEM cadastro)

- **Onde usar:** https://nominatim.openstreetmap.org/search
- **Limite:** 1 requisição/segundo (Termo de Uso público)
- **Cadastro:** não exige
- **Atenção:** se o sistema ultrapassar 1 req/s, ou auto-hospedar Nominatim também (mesma VM Oracle), ou usar **Photon** (https://photon.komoot.io — sem rate limit oficial, mas use com moderação).

### 1.4. Waze e Google Maps (SEM cadastro)

- **Deep links públicos**, não exigem API key:
  - Waze: `https://waze.com/ul?ll=LAT,LNG&navigate=yes`
  - Google Maps: `https://www.google.com/maps/dir/?api=1&destination=LAT,LNG`
- Funcionam direto no navegador/celular do motorista.

### 1.5. ViaCEP — Autocompletar endereço a partir do CEP (FASE 1 — MVP)

- **Onde usar:** `https://viacep.com.br/ws/{CEP}/json/`
- **Cadastro:** não exige
- **Custo:** grátis
- **Limites:** não há rate limit oficial publicado (uso normal nunca foi bloqueado)
- **Retorna:** logradouro, bairro, localidade (cidade), uf, ddd
- **Performance:** ~100-300ms por consulta
- **Disponibilidade:** API pública mantida pelos Correios há mais de 10 anos, alta confiabilidade

**Por que essa é a captura principal da Fase 1:**
- Custo zero, sem rate limit prático
- Funciona em 100% dos CEPs brasileiros válidos
- Combinado com o número da casa (digitado pelo motorista) resulta em endereço completo pronto para Nominatim geocodificar
- Sem dependência de certificado, sem fila offline complexa (basta cache local pra resiliência)

**Cache local recomendado:**
- Tabela `cep_cache` no Supabase OU IndexedDB local
- Mesmo CEP consultado 2x → 2ª vez é instantânea
- TTL longo (Correios atualizam raramente)

### 1.6. (FASE 2 — OPCIONAL) Consulta de NFe pela chave de acesso

> ⚠️ **Não implementar no MVP.** Esta seção fica documentada para uso futuro quando o volume justificar (ver Revisão 2026-05-27).

Para transformar os 44 dígitos da chave (lidos do QR Code) em endereço completo do destinatário:

- **MeuDanfe** — API grátis com limite diário (~100 consultas/dia) (https://meudanfe.com.br)
- **NFe.io** — free tier ~100 consultas/mês
- **Webmania / Tecnospeed / Migrate** — pagas, robustas (R$ 50-200/mês), considerar quando escalar
- **SEFAZ direto** — exige **certificado digital A1 da empresa** (~R$ 200/ano), 100% grátis depois, ilimitado

**Estratégia em cascata recomendada (quando ativar Fase 2):**
1. Tenta SEFAZ direto (se tiver certificado A1) → ilimitado, oficial
2. Fallback MeuDanfe → 100/dia
3. Fallback NFe.io → 100/mês
4. Fallback definitivo: cai no fluxo manual da Fase 1 (motorista digita CEP+número)

### 1.7. (Opcional) Domínio + Cloudflare

- Só se quiser HTTPS no endpoint do OSRM (ex: `osrm.suaempresa.com`).
- Cloudflare grátis cobre SSL e proxy.
- Não é obrigatório para começar — pode chamar via IP da VM com HTTP interno.

---

## ETAPA 2 — Instalação no Servidor (Oracle VM)

> **✅ STATUS 2026-05-29:** Concluida. VM provisionada (IP `129.80.27.159`, AD `US-ASHBURN-AD-2`, 4 OCPU/24GB/146GB ARM) apos ~1500 tentativas em ~5h. OSRM + VROOM rodando via systemd (alternativa ao docker-compose original — funcional). Auditoria externa: OSRM e VROOM HTTP 200, latencia <500ms, rota SP→Campinas devolve 93.2km/76min, VROOM otimiza 3 paradas em 0 nao-atribuidos. iptables OK, keep-alive cron a cada 4h ativo.

### 2.1. ✅ Provisionar a VM **(✅ feito 2026-05-29 via `criar_vm_osrm.ps1` — IP 129.80.27.159)**

1. Console Oracle → **Compute → Instances → Create Instance**
2. Imagem: **Ubuntu 22.04 ARM**
3. Shape: **VM.Standard.A1.Flex** — 4 OCPU + 24 GB RAM
4. Rede: usar VCN default, **anotar IP público**
5. Chave SSH: gerar e baixar a chave privada (guardar)

### 2.2. ✅ Liberar portas no firewall Oracle (USUARIO faz no painel Oracle)

Console Oracle → **Networking → VCN → Security List → Add Ingress Rules:**

| Porta | Protocolo | Origem | Uso |
|---|---|---|---|
| 22 | TCP | seu IP | SSH |
| 5000 | TCP | 0.0.0.0/0 | OSRM API |
| 3000 | TCP | 0.0.0.0/0 | VROOM API |
| 443 | TCP | 0.0.0.0/0 | (opcional, HTTPS futuro) |

### 2.3. ✅ Conectar via SSH e preparar a máquina **(✅ feito 2026-05-29 — Docker instalado via systemd direto, NAO docker-compose)**

```bash
ssh -i sua-chave.key ubuntu@<IP-DA-VM>

# Atualizar
sudo apt update && sudo apt upgrade -y

# Instalar Docker
curl -fsSL https://get.docker.com | sudo bash
sudo usermod -aG docker ubuntu
newgrp docker

# Instalar Docker Compose
sudo apt install -y docker-compose-plugin

# Firewall interno (opcional, Oracle já controla por Security List)
sudo ufw allow 22,5000,3000/tcp
sudo ufw enable
```

### 2.4. ✅ Baixar e pré-processar o mapa do Brasil **(✅ feito 2026-05-29 — 15GB processado, extract+partition+customize)**

```bash
mkdir -p ~/osrm-data && cd ~/osrm-data

# Baixar mapa (~3 GB, demora ~5min)
wget https://download.geofabrik.de/south-america/brazil-latest.osm.pbf

# Pré-processar com OSRM (perfil 'car' — para caminhão use 'car' mesmo, é suficiente)
# Atenção: extract usa MUITA RAM. Os 24GB da Oracle aguentam o Brasil inteiro.
docker run --rm -t -v "${PWD}:/data" ghcr.io/project-osrm/osrm-backend \
  osrm-extract -p /opt/car.lua /data/brazil-latest.osm.pbf

docker run --rm -t -v "${PWD}:/data" ghcr.io/project-osrm/osrm-backend \
  osrm-partition /data/brazil-latest.osrm

docker run --rm -t -v "${PWD}:/data" ghcr.io/project-osrm/osrm-backend \
  osrm-customize /data/brazil-latest.osrm
```

> ⚠️ Esse processo demora **30 a 90 minutos**. Importante entender:
>
> - **Só roda 1 vez** (no setup inicial) — não é "toda vez que abre OSRM".
> - Após processado, o container OSRM sobe em **2-5 minutos** e fica rodando 24/7.
> - Cada cálculo de rota depois disso leva **~50ms** (instantâneo).
> - Atualizar o mapa do Brasil (recomendado 1x/mês) refaz esses 30-90 min, mas em background — o servidor antigo continua rodando enquanto isso. Zero downtime.

### 2.5. ✅ Criar `docker-compose.yml` para OSRM + VROOM **(⚠️ executor escolheu systemd direto em vez de docker-compose — funcional, mas use `journalctl -u osrm/vroom` em vez de `docker logs`)**

Arquivo: `~/routing/docker-compose.yml`

```yaml
services:
  osrm:
    image: ghcr.io/project-osrm/osrm-backend
    container_name: osrm
    restart: unless-stopped
    ports:
      - "5000:5000"
    volumes:
      - ~/osrm-data:/data
    command: osrm-routed --algorithm mld --max-table-size 10000 /data/brazil-latest.osrm

  vroom:
    image: vroomvrp/vroom-docker:latest
    container_name: vroom
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - VROOM_ROUTER=osrm
      - VROOM_HOST_osrmCar=osrm
      - VROOM_PORT_osrmCar=5000
    depends_on:
      - osrm
```

### 2.6. ✅ Subir os containers **(✅ feito 2026-05-29 — OSRM active desde 05:09 UTC, VROOM active desde 13:14 UTC)**

```bash
cd ~/routing
docker compose up -d

# Conferir logs
docker compose logs -f
```

### 2.7. ✅ Testar do seu computador **(✅ auditado 2026-05-29: OSRM HTTP 200 — SP→Campinas 93.2km/76min; VROOM HTTP 200 — code=0 otimizando 3 paradas)**

```bash
# OSRM (rota São Paulo → Campinas)
curl "http://<IP-DA-VM>:5000/route/v1/driving/-46.6333,-23.5505;-47.0608,-22.9056?overview=false"

# VROOM (otimização básica)
curl -X POST "http://<IP-DA-VM>:3000" \
  -H "Content-Type: application/json" \
  -d '{
    "vehicles":[{"id":1,"start":[-46.63,-23.55],"end":[-46.63,-23.55]}],
    "jobs":[
      {"id":1,"location":[-46.65,-23.56]},
      {"id":2,"location":[-46.70,-23.58]}
    ]
  }'
```

Se ambos retornarem JSON com rotas, **está pronto.**

### 2.8. ✅ (Opcional) Auto-restart e monitoramento **(✅ feito 2026-05-29 — via systemd `Restart=always`)**

- O `restart: unless-stopped` já garante que sobe sozinho após reboot.
- Para monitorar: `docker stats` mostra CPU/RAM em tempo real.
- Para logs persistentes: configurar `journald` driver ou enviar para Sentry/Grafana.

### 2.9. ✅ Keep-Alive — Evitar que Oracle recupere a VM (OBRIGATÓRIO) **(✅ feito 2026-05-29 — `/opt/keepalive.sh` em cron a cada 4h, log em `/var/log/osrm-keepalive.log`)**

**Política da Oracle Free Tier:** VMs com CPU muito baixa por **7 dias consecutivos** são recuperadas pela Oracle.

No fluxo normal (10 caminhões × 700 cálculos/dia) isso já não acontece, mas em feriados, férias ou domingos sem operação a VM pode cair pra perto de 0% CPU e ficar em risco.

**Solução: cron que pinga o OSRM a cada 6 horas.**

```bash
# 1. Criar o script
sudo mkdir -p /opt/scripts
sudo tee /opt/scripts/osrm-keepalive.sh > /dev/null <<'EOF'
#!/bin/bash
# Pinga OSRM com um cálculo trivial para manter CPU ativa
# (Política Oracle Free Tier: VMs idle por 7 dias podem ser recuperadas)

# Rota curta São Paulo (Praça da Sé → Av. Paulista)
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" \
  "http://localhost:5000/route/v1/driving/-46.6333,-23.5505;-46.6500,-23.5610?overview=false")

VROOM=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "http://localhost:3000" \
  -H "Content-Type: application/json" \
  -d '{"vehicles":[{"id":1,"start":[-46.63,-23.55],"end":[-46.63,-23.55]}],"jobs":[{"id":1,"location":[-46.65,-23.56]}]}')

echo "$(date '+%Y-%m-%d %H:%M:%S') keepalive osrm=$RESPONSE vroom=$VROOM" >> /var/log/osrm-keepalive.log
EOF

sudo chmod +x /opt/scripts/osrm-keepalive.sh

# 2. Agendar no cron (a cada 6 horas)
sudo crontab -e
# Adicionar essa linha:
0 */6 * * * /opt/scripts/osrm-keepalive.sh

# 3. Rotação de log (evitar disco encher)
sudo tee /etc/logrotate.d/osrm-keepalive > /dev/null <<'EOF'
/var/log/osrm-keepalive.log {
  monthly
  rotate 6
  compress
  missingok
  notifempty
}
EOF
```

**Verificação:** após 24h, conferir que o log está sendo escrito:
```bash
tail /var/log/osrm-keepalive.log
```

Deve mostrar 4 linhas por dia com `osrm=200 vroom=200`.

---

## ETAPA 3 — Programação no Sistema (Next.js)

### 3.1. Variáveis de ambiente

Adicionar em `.env.local`:

```env
OSRM_URL=http://<IP-DA-VM>:5000
VROOM_URL=http://<IP-DA-VM>:3000
NOMINATIM_URL=https://nominatim.openstreetmap.org
```

E em `src/lib/env.ts` (ou onde o projeto já valida env vars):

```ts
OSRM_URL: z.string().url(),
VROOM_URL: z.string().url(),
NOMINATIM_URL: z.string().url(),
```

### 3.2. Estrutura de arquivos a criar

```
# === FASE 1 — MVP ===

src/lib/routing/
├── osrm.ts              # Cliente HTTP do OSRM (rota A→B)
├── vroom.ts             # Cliente HTTP do VROOM (otimização VRP)
├── geocoding.ts         # Cliente Nominatim (endereço → lat/lng)
├── deepLinks.ts         # Gera URLs Waze e Google Maps
└── types.ts             # Tipos compartilhados (Coordenada, Rota, etc.)

src/lib/cep/                        # FASE 1
├── viacep.ts            # Cliente ViaCEP (CEP → logradouro/bairro/cidade/uf) com cache local
└── types.ts             # EnderecoCEP, NotaCapturada

src/lib/offline/                    # FASE 1 (simplificada — sem chave NFe)
├── fila.ts              # Dexie schema + CRUD da fila de notas capturadas
├── sync.ts              # Worker de sincronização (setInterval + retry)
└── onlineDetector.ts    # Detecta volta da internet e dispara sync imediato

src/components/mobile/              # FASE 1
├── InputEnderecoNF.tsx  # Form CEP → ViaCEP → número → confirma
├── ListaNotasCapturadas.tsx  # Lista as paradas conforme vai capturando
└── BotaoFinalizarRota.tsx    # Dispara VROOM e abre tela de roteirização

src/components/
├── MapaRota.tsx         # Componente Leaflet (mapa + traçado da rota)
└── BotoesNavegacao.tsx  # Botões "Abrir no Waze" / "Abrir no Google Maps"

src/app/api/routing/
├── otimizar/route.ts    # POST: recebe paradas, retorna ordem otimizada (chama VROOM)
└── geocodar/route.ts    # POST: recebe endereço, retorna lat/lng (chama Nominatim)

src/app/mobile/captura-notas/       # FASE 1 — módulo isolado do motorista
├── page.tsx                      # Tela principal — usa InputEnderecoNF
└── components/
    ├── ProgressoCaptura.tsx      # Barra "24 / 70 NFs"
    └── ConfirmarFinalizacao.tsx  # Modal antes de disparar VROOM

# === FASE 2 — OPCIONAL (futuro) ===

src/lib/nfe/                        # FASE 2
├── qrCode.ts            # Parser do conteúdo do QR Code da NFe → chave 44 dígitos
├── consulta.ts          # Consulta chave SEFAZ/MeuDanfe → dados do destinatário (cascata)
└── types.ts             # NFeDestinatario, EnderecoDestinatario

src/components/mobile/              # FASE 2 — atalho opcional
└── LeitorQRCode.tsx     # Câmera ao vivo + decoder (html5-qrcode ou @zxing/browser)

src/app/api/nfe/                    # FASE 2
└── consultar/route.ts   # POST: recebe chave de 44 dígitos, retorna destinatário+endereço

# === COMUM (Fase 1 + Fase 2) ===

src/app/mobile/ajuste-rota/
├── page.tsx                    # Container com Tabs (🎯 Ordenar | ⚙️ Detalhes)
└── components/
    ├── AbaOrdenar.tsx          # Lista drag-and-drop minimalista (jogo)
    ├── AbaDetalhes.tsx         # Lista tap-to-edit expandida
    ├── Tijolinho.tsx           # Tijolinho compartilhado (modo: "ordenar" | "detalhes")
    ├── NumeroOrdem.tsx         # Quadradinho grande com o número (visual de dado/jogo)
    ├── MapaComPinos.tsx        # Leaflet com DivIcon numerado (anima ao reordenar)
    ├── ModalHorario.tsx        # Editor de janela de horário (presets + custom)
    └── ModalConfirmar.tsx      # Confirma mudança + impacto em km/min
```

### 3.3. Cliente OSRM (`src/lib/routing/osrm.ts`)

Função `calcularRota(origem, destino)` → retorna `{ distanciaKm, tempoMin, polyline }`.

### 3.4. Cliente VROOM (`src/lib/routing/vroom.ts`)

Função `otimizarRota({ veiculo, paradas })` → retorna `{ ordem: Parada[], distanciaTotalKm, tempoTotalMin }`.

Aceitar restrições opcionais: janela de horário do cliente, capacidade do caminhão, pausa do motorista.

### 3.5. Cliente Nominatim (`src/lib/routing/geocoding.ts`)

Função `geocodar(endereco: string)` → retorna `{ lat, lng, enderecoCompleto }`.

> ⚠️ Respeitar rate limit de 1 req/s — incluir delay/queue ou cache local (Redis ou Supabase tabela `geocoding_cache`).

### 3.6. Deep links (`src/lib/routing/deepLinks.ts`)

```ts
export const waze = (lat: number, lng: number) =>
  `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;

export const googleMaps = (lat: number, lng: number) =>
  `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
```

### 3.7. Captura por Formulário (`src/components/mobile/InputEnderecoNF.tsx`) — FASE 1 — MVP

**Lib externa nova:** nenhuma. Usa só componentes nativos + fetch.

**Encaixa no framework mobile iPhone-first** já existente (commit `7123f80`).

**Tela e fluxo (3 passos por NF):**

```
┌──────────────────────────────────┐
│ NF 24 de 70                       │
│                                   │
│ CEP                               │
│ ┌────────────────────┐            │
│ │ 30130-_ _ _        │ ⌫          │
│ └────────────────────┘            │
│ teclado numérico abre automático  │
│                                   │
│ [ → Próximo ]                     │
└──────────────────────────────────┘
```

Após o CEP completo (8 dígitos) → ViaCEP é chamado automaticamente → endereço aparece:

```
┌──────────────────────────────────┐
│ NF 24 de 70                       │
│                                   │
│ ✓ Rua das Flores                 │
│   Centro — Belo Horizonte/MG      │
│                                   │
│ Número                            │
│ ┌────────────────────┐            │
│ │ ____               │ ⌫          │
│ └────────────────────┘            │
│ teclado numérico, foco automático │
│                                   │
│ [ → Confirmar ]                   │
└──────────────────────────────────┘
```

Ao tocar Confirmar → tela de validação visual:

```
┌──────────────────────────────────┐
│ NF 24 de 70 — Confirmar?         │
│                                   │
│ 📍 Rua das Flores, 123           │
│    Centro, Belo Horizonte/MG      │
│    CEP 30130-000                  │
│                                   │
│ [ ✅ Confirmar e próxima ]        │
│ [ ✏️ Editar ]                     │
│ [ ❌ Cancelar esta NF ]           │
└──────────────────────────────────┘
```

**Comportamento detalhado:**
- **Auto-formatar CEP** enquanto digita (00000-000)
- **Auto-chamar ViaCEP** quando CEP atingir 8 dígitos
- **Foco automático** no campo Número assim que ViaCEP retornar
- **Validação:** se ViaCEP retornar `erro: true`, mostrar "CEP não encontrado — digite o endereço manualmente" + form livre (logradouro, bairro, cidade, uf)
- **Vibração suave** ao confirmar (`navigator.vibrate(50)`)
- **Botão "Desfazer última"** para corrigir erros
- **Botão "Finalizar Rota"** no topo com contador ("Finalizar (24/70)")
- **Funciona offline** (cache de CEPs já consultados + fila local de NFs pendentes — ver seção 3.8)

**Requisitos técnicos:**
- **HTTPS obrigatório** em produção (Vercel já entrega)
- **Inputs com `inputMode="numeric"`** para forçar teclado numérico no iOS/Android
- **`autoFocus` controlado** para pular entre CEP → Número sem o motorista precisar tocar
- **Modo paisagem** desabilitado (lock em retrato — ergonômico para uma mão só)

**Lib cliente do ViaCEP:** `src/lib/cep/viacep.ts`

```ts
export async function consultarCEP(cep: string): Promise<EnderecoCEP | null> {
  const clean = cep.replace(/\D/g, '');
  if (clean.length !== 8) return null;
  const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
  const data = await res.json();
  if (data.erro) return null;
  return {
    cep: data.cep,
    logradouro: data.logradouro,
    bairro: data.bairro,
    cidade: data.localidade,
    uf: data.uf,
  };
}
```

**Cache de CEPs** (recomendado): wrappear `consultarCEP` com IndexedDB local — 2ª consulta do mesmo CEP é instantânea e offline.

---

### 3.7-Fase2. Leitor de QR Code mobile (`src/components/mobile/LeitorQRCode.tsx`) — FASE 2 — OPCIONAL

> ⚠️ **Não implementar no MVP.** Esta seção fica documentada para Fase 2 (ver Revisão 2026-05-27).

**Lib recomendada:** `html5-qrcode` (a mais madura, suporta iOS Safari + Android Chrome). Alternativa: `@zxing/browser`.

**Encaixa no framework mobile iPhone-first** já existente (commit `7123f80`).

**Comportamento (UX estilo leitor de supermercado):**
- Câmera traseira abre em tela cheia
- Crosshair central com instrução "Aponte no QR Code da nota"
- A cada QR Code válido lido:
  - **Bipe sonoro** + **vibração** (`navigator.vibrate(100)`)
  - **Flash verde** no overlay
  - Mostra brevemente o destinatário ("Nota 24/70 — Padaria Central, Rua X")
  - Adiciona à lista local em memória
  - Volta automaticamente para escanear a próxima
- Botão "Finalizar Rota" no rodapé com contador (ex: "Finalizar (24 notas)")
- Botão "Desfazer última" para erros
- Funciona offline (cache local em IndexedDB) — sincroniza quando voltar a internet

**Requisitos técnicos:**
- **HTTPS obrigatório** (browser só libera câmera em contexto seguro) — Vercel já entrega isso em produção
- **Permission prompt** de câmera tratado na UI (instrução clara se o motorista negar)
- **Modo paisagem** desabilitado (lock em retrato para QR funcionar melhor)

**Validação da chave de 44 dígitos:**
- QR Code da NFe contém URL tipo `https://www.sefaz.SP.gov.br/...?p=<44-digitos>|<protocolo>|...`
- `src/lib/nfe/qrCode.ts` deve extrair só os 44 dígitos numéricos via regex
- Validar dígito verificador (módulo 11) antes de consultar API
- Se a leitura falhar 3x, oferecer **input manual dos 44 dígitos** como fallback

### 3.8. Arquitetura Offline-First — Foreground Queue (iOS-Compatível)

> **Fase 1 (MVP):** fila guarda `{ cep, numero, endereco_completo }` por NF. Cache de CEPs já consultados (ViaCEP) também em IndexedDB. Sync ao banco quando online.
>
> **Fase 2 (futuro):** fila guarda `{ chave_nfe }` por NF, sync chama consulta SEFAZ/MeuDanfe. Resto da arquitetura idêntica.
>
> A estrutura abaixo é descrita assumindo Fase 2 (mais complexa). Para Fase 1, **simplificar removendo as menções a "chave SEFAZ" e validação módulo 11** — basta gravar CEP+número+endereço diretamente.

**⚠️ DECISÃO IMPORTANTE (revisada):** O plano original usava **Background Sync API**, que **NÃO funciona no iOS Safari** (só Chrome/Android). Como o framework mobile do projeto é iPhone-first (commit `7123f80`), trocamos para **Foreground Queue** — funciona iPhone E Android sem perder nada essencial.

**A diferença prática:**

| Cenário | Background Sync (só Android) | Foreground Queue (iPhone + Android) |
|---|---|---|
| App aberto, com internet | ✓ sincroniza | ✓ sincroniza |
| App aberto, sem internet | aguarda | aguarda |
| Internet volta com app aberto | ✓ sincroniza sozinho | ✓ sincroniza sozinho |
| App fechado, sem internet | ✓ sincroniza quando voltar internet | ❌ só ao reabrir o app |

No fluxo real do motorista, **ele mantém o app aberto enquanto escaneia as 70 notas** (1-5 minutos no máximo). Então o caso "app fechado" não acontece na prática.

---

**Fluxo:**

```
┌──────────────────────────────────────────────────┐
│ 1. BIP! Motorista escaneia QR                    │
│ 2. Sistema valida 44 dígitos (módulo 11)         │
│    → ~50ms, sem internet                         │
│ 3. Salva NO CELULAR (IndexedDB) status ⏳        │
│ 4. Pronto pra próxima IMEDIATAMENTE              │
└──────────────────────────────────────────────────┘
       ↓ (loop em foreground, a cada 5s)
┌──────────────────────────────────────────────────┐
│ Worker JS (rodando no próprio app):              │
│ - Pega itens ⏳ da fila local                    │
│ - Tem internet? → consulta API → ✓ + endereço    │
│ - Sem internet? → marca tentativa e espera       │
│ - Retry exponencial: 5s → 10s → 30s → 1min       │
│ - Servidor valida UNIQUE(chave_nfe)              │
└──────────────────────────────────────────────────┘
```

**O motorista vê na tela durante a captura:**

```
Notas escaneadas: 25
─────────────────────
✓ 23 sincronizadas
⏳ 2 pendentes (tentando enviar...)
❌ 0 conflitos

[ Finalizar Rota ]
```

---

**Tecnologia:**

- **`dexie`** (~10kb) — wrapper de IndexedDB para a fila local. Funciona iPhone, Android, desktop.
- **Worker em foreground** — `setInterval(syncFila, 5000)` enquanto o app estiver aberto. **Sem Service Worker, sem Background Sync API.** Mais simples.
- **PWA** — instala como app na home (iOS suporta, com algumas limitações). Não é obrigatório, pode rodar como página web.
- **Online detection** — `navigator.onLine` + listener `window.addEventListener('online', ...)` pra disparar sync imediato quando internet volta.

**Estrutura de dados na fila local (IndexedDB):**

```ts
interface NotaNaFila {
  chave: string;              // 44 dígitos
  status: "pendente" | "sincronizada" | "conflito" | "erro";
  destinatario?: {            // preenchido após consulta API
    nome: string;
    endereco: string;
    cidade: string;
    cep: string;
    lat?: number;
    lng?: number;
  };
  capturadoEm: Date;
  tentativas: number;
  ultimoErro?: string;
  proximaTentativa?: Date;    // pra retry exponencial
}
```

**Dedup em 3 camadas (mantida):**

1. **Local (celular):** antes de inserir na fila, comparar chave com itens já presentes. Se duplicado → vibração diferente (`navigator.vibrate([100,50,100])`) + alerta visual "Nota já escaneada".
2. **Servidor (ao sincronizar):** constraint `UNIQUE(chave_nfe)` no banco. Se outro motorista escaneou a mesma chave, servidor retorna 409 Conflict.
3. **Validação módulo 11:** chave que falha no dígito verificador nem entra na fila.

**Botão "Finalizar Rota":**

- Habilita só quando ≥ 90% das notas estão ✓ sincronizadas (ou após timeout do motorista).
- Mostra aviso se houver ⏳ pendente: "Ainda há 3 notas em sincronização. Aguardar ou finalizar mesmo assim?"
- Ao finalizar, dispara VROOM com as paradas que já têm endereço.

**Casos extremos a tratar:**

- **App fechado no meio do escaneamento:** ao reabrir, worker detecta itens `pendente`, dispara sync automático. Notifica motorista: "5 notas pendentes — sincronizando agora..."
- **Motorista esqueceu de finalizar antes de sair:** ao detectar `navigator.geolocation` longe do depósito + notas `pendente`, mostra notificação push (se autorizou).
- **Telefone descarregou:** dados ficam salvos no IndexedDB do celular. Ao ligar e abrir o app, sincroniza.

**Arquivos novos para esta arquitetura:**

```
src/lib/offline/
├── fila.ts              # Dexie schema + CRUD da fila local
├── sync.ts              # Worker de sincronização (setInterval + retry exponencial)
└── onlineDetector.ts    # Detecta volta da internet e dispara sync imediato
```

**O que NÃO usar:**

- ❌ `Background Sync API` (`registration.sync.register(...)`) — não funciona iOS Safari
- ❌ Service Worker complexo — desnecessário pro caso de uso

---

**Sobre Waze (deep link):** Não tem nada a ver com isso. O deep link `https://waze.com/ul?ll=LAT,LNG&navigate=yes` é só uma URL — funciona perfeito no iPhone E Android, com OU sem internet (o Waze decide o que fazer ao abrir). Não depende da fila offline.

### 3.9. Componente de mapa (`src/components/MapaRota.tsx`)

- Lib: `react-leaflet` + `leaflet`
- Tiles: OpenStreetMap padrão (grátis, sem chave)
- Desenha traçado da rota (decode polyline do OSRM)
- Marcadores nas paradas com número da ordem

### 3.10. Tela "Ajuste de Rota" — Tijolinhos Tipo Jogo (Dois Modos)

A tela tem **duas abas** que mostram **os mesmos tijolinhos**, mas com propósitos opostos:

| Aba | Propósito | Densidade | Interação |
|---|---|---|---|
| **🎯 Ordenar** | Definir a sequência de entrega como jogo | ⚡ Mínima — só o essencial | Arrastar (drag) |
| **⚙️ Detalhes** | Configurar horários, contatos, especiais | 📋 Expandida — mais info | Clicar (tap) |

**Princípio de unidade visual:**
- O **número grande** dentro do tijolinho = ordem da entrega
- Esse mesmo número aparece como **pino no mapa Leaflet**
- Quando o motorista arrasta o tijolinho ④ pra posição ②:
  - ② vira ③, ③ vira ④, ④ assume a posição ②
  - Pinos no mapa **renumeram automaticamente** com animação
  - Total de km/min no topo da tela atualiza

---

#### Aba 1 — "🎯 Ordenar" (drag, minimalista, tipo jogo)

**Layout do tijolinho (densidade mínima — legível em movimento):**

```
┌──────────────────────────────┐
│ 🗺️  Mapa com pinos: ① ② ③... │
│     Total: 142km • 4h20      │
└──────────────────────────────┘
┌──────────────────────────────┐
│ ┌──┐                          │
│ │①│ Padaria Central    2.3km │
│ └──┘                    ☰    │
├──────────────────────────────┤
│ ┌──┐                          │
│ │②│ Mercado Bom Dia    4.1km │
│ └──┘                    ☰    │
├──────────────────────────────┤
│ ┌──┐                          │
│ │③│ Açougue Premium 🔒 1.8km │
│ └──┘                          │
├──────────────────────────────┤
│ ┌──┐                          │
│ │④│ Lanchonete X    ⏰ 3.2km │
│ └──┘                    ☰    │
└──────────────────────────────┘
[ Salvar ordem ]  [ Resetar ]
```

**Elementos do tijolinho (na aba Ordenar):**
- **Número grande** (tipo dado de jogo) — ordem da entrega
- **Nome curto** do cliente (truncado em ~20 chars)
- **Distância até a parada anterior** (referência rápida)
- **Ícones de status:** 🔒 (fixa, não arrastável) / ⏰ (tem janela de horário)
- **☰** alça de arrasto à direita (só aparece se não estiver 🔒)
- **Cor de fundo** opcional por cluster/bairro (visual gamificado)

**Comportamento "tipo jogo":**
- Toque longo (~300ms) "ergue" o tijolinho com leve sombra + vibração
- Arrastar reordena em tempo real (outros tijolinhos abrem espaço)
- Soltar → bipe curto + animação suave + números renumeram
- Mapa redesenha pinos com animação de ~500ms
- Se o usuário tentar arrastar um 🔒, vibração diferente + tooltip "Esta parada está fixada. Vá na aba Detalhes para liberar."

---

#### Aba 2 — "⚙️ Detalhes" (tap, mais info, configuração)

Mesma lista de tijolinhos, mas **sem arrasto** e **com mais conteúdo**:

```
┌──────────────────────────────┐
│ ┌──┐ Padaria Central          │
│ │①│ 📍 Rua das Flores, 123   │
│ └──┘ ⏰ Aberto 08:00–18:00   │
│       📞 (31) 99999-9999      │
│       💬 "Entregar na lateral"│
│       [ Editar horário ]      │
├──────────────────────────────┤
│ ┌──┐ Mercado Bom Dia          │
│ │②│ 📍 Av. Brasil, 4500      │
│ └──┘ ⏰ Aberto 07:00–22:00   │
│       📞 (31) 88888-8888      │
│       💬 (sem observações)    │
│       [ Editar horário ]      │
├──────────────────────────────┤
│ ┌──┐ Açougue Premium  🔒      │
│ │③│ 📍 Rua A, 50             │
│ └──┘ ⏰ Aberto 09:00–17:00   │
│       💬 "Fixado por motorista│
│           — sempre por último"│
│       [ Liberar posição ]     │
└──────────────────────────────┘
```

**Ações ao clicar um tijolinho (abre modal/sheet):**
1. **⏰ Definir janela de horário** — presets (Manhã / Tarde / Noite / Custom) e botão "Salvar como padrão deste cliente" (vira `cliente_preferencias`)
2. **🔒 Fixar nesta posição** — congela o número, VROOM não vai mexer
3. **↩️ Liberar** — solta o lock, VROOM volta a otimizar
4. **📞 Ligar para o cliente** — abre `tel:` no celular
5. **📍 Abrir endereço no mapa** — preview do destino
6. **💬 Ver/editar observação** — texto livre (ex: "porta lateral", "subir escada")

**Densidade comparada:**

| Info | Aba Ordenar | Aba Detalhes |
|---|---|---|
| Número da ordem | ✅ (grande) | ✅ (menor) |
| Nome do cliente | ✅ (truncado) | ✅ (completo) |
| Distância parada anterior | ✅ | ❌ (não relevante p/ config) |
| Endereço completo | ❌ | ✅ |
| Telefone | ❌ | ✅ |
| Janela de horário | ⏰ (só ícone) | ✅ (texto completo) |
| Observação | ❌ | ✅ |
| Lock 🔒 | ✅ (ícone) | ✅ (botão de toggle) |

---

#### Restrições técnicas usadas (VROOM)

| Restrição | Campo VROOM | Onde se ajusta na UI |
|---|---|---|
| Fixar parada em posição | `priority` (0-100) + `skills` | Aba Detalhes → botão Fixar |
| Janela de horário | `time_windows: [[09:00,14:00], [16:00,18:00]]` | Aba Detalhes → Editar horário |
| Tempo de descarga estimado | `service: 600` (segundos) | (não exposto, default) |
| Agrupar por região / cluster | `skills: ["zona-sul"]` | (futuro — auto pela coordenada) |

---

#### Tecnologia

- **Drag-and-drop:** `dnd-kit` (`@dnd-kit/core` + `@dnd-kit/sortable`) — touch nativo iOS/Android, ~10kb
- **Mapa com pinos numerados:** Leaflet + `DivIcon` customizado (HTML pra renderizar o número grande dentro do pino)
- **Animação dos pinos:** `leaflet.animatedmarker` ou CSS transition em `divIcon`
- **Vibração tátil:** `navigator.vibrate(100)` ao iniciar arrasto, `navigator.vibrate([50,30,50])` ao soltar
- **Bipe sonoro:** `Audio` element pré-carregado, reuso

---

#### Arquivos novos

```
src/app/mobile/ajuste-rota/
├── page.tsx                    # Container com Tabs (Ordenar | Detalhes)
└── components/
    ├── AbaOrdenar.tsx          # Lista drag-and-drop minimalista (jogo)
    ├── AbaDetalhes.tsx         # Lista tap-to-edit expandida
    ├── Tijolinho.tsx           # Componente compartilhado (recebe modo: "ordenar" | "detalhes")
    ├── NumeroOrdem.tsx         # Quadradinho grande com o número (visual de dado/jogo)
    ├── MapaComPinos.tsx        # Leaflet com DivIcon numerado
    ├── ModalHorario.tsx        # Editor de janela de horário
    └── ModalConfirmar.tsx      # Confirma impacto em km/min após arrasto

src/lib/routing/
└── restricoes.ts               # Helpers pra montar payload VROOM
```

---

#### Persistência de preferências por cliente (segunda iteração)

Quando o motorista clica "Salvar como padrão deste cliente" na Aba Detalhes, salva no banco para que as próximas rotas já considerem essa preferência automaticamente:

```sql
-- nova tabela
CREATE TABLE cliente_preferencias (
  id uuid PRIMARY KEY,
  cliente_id uuid REFERENCES clientes(id),
  posicao_preferida text,  -- 'primeira' | 'ultima' | 'qualquer'
  janela_horario jsonb,     -- [["09:00","14:00"],["16:00","18:00"]]
  tempo_descarga_min int,   -- minutos típicos pra descarregar lá
  observacao text,
  created_at timestamptz DEFAULT now()
);
```

**Aprendizado opcional (terceira iteração):** se o motorista fixa 3+ vezes a mesma parada como última, sistema sugere automaticamente *"Quer salvar como padrão deste cliente?"*

### 3.11. Integração nas telas existentes

**Tela de Fretes (`src/app/fretes/`):**
- Ao cadastrar um frete com origem + destino, chamar OSRM e preencher `km_estimado` automaticamente.

**Nova tela mobile de Captura de Notas (`src/app/mobile/captura-notas/`) — FASE 1 — MVP:**
- Motorista abre no celular antes de sair com o caminhão
- Componente `InputEnderecoNF` ocupa tela inteira (form CEP → ViaCEP → número → confirma)
- Cada NF capturada vai pra fila local (IndexedDB) + sync ao banco quando online
- Lista inferior mostra notas já capturadas (com endereço resumido)
- Botão "Finalizar Rota" envia paradas → Nominatim (geocoding) → VROOM → tela de Roteirização

**(FASE 2 — futuro)** A mesma tela pode ganhar um botão "📷 Escanear QR" que, se ler com sucesso, pula a digitação e usa o endereço da consulta SEFAZ. Se falhar (chave inválida, API fora, sem internet), cai automaticamente no fluxo manual da Fase 1.

**Nova tela de Roteirização (`src/app/roteirizacao/`):**
- Pode ser aberta automaticamente após finalizar a captura, ou manualmente pelo gestor
- Selecionar data + caminhão (se entrada manual)
- Listar entregas/notas capturadas
- Botão "Otimizar Rota" → chama VROOM
- Mostrar ordem otimizada em lista + mapa Leaflet
- Por parada: botão "Abrir no Waze" e "Abrir no Google Maps"
- Botão "Enviar ordem para motorista via WhatsApp" (link com paradas pré-formatado)

**WhatsApp Flow (futuro — opcional):**
- Motorista pede `"minha rota hoje"` → bot retorna lista numerada de paradas + link único do Google Maps com até 10 destinos.

### 3.12. Testes (OBRIGATÓRIO — política do projeto)

Conforme `TESTING.md`, criar:

**Fase 1 — MVP (obrigatório):**
- `src/__tests__/lib/routing/osrm.test.ts` — mocks de resposta, sucesso, erro, timeout
- `src/__tests__/lib/routing/vroom.test.ts` — otimização com 5, 20 e 70 paradas (mock)
- `src/__tests__/lib/routing/geocoding.test.ts` — endereço válido, inválido, rate limit
- `src/__tests__/lib/routing/deepLinks.test.ts` — geração correta dos URLs
- `src/__tests__/lib/cep/viacep.test.ts` — CEP válido, inválido, formato, erro de rede, cache hit
- `src/__tests__/lib/offline/fila.test.ts` — adicionar, dedup local, status transitions, recuperar pendentes
- `src/__tests__/lib/offline/sync.test.ts` — retry exponencial, conflito 409, sucesso, offline → online
- `src/__tests__/lib/routing/restricoes.test.ts` — montagem do payload VROOM com `priority`, `time_windows`, `skills`
- `src/__tests__/components/mobile/inputEnderecoNF.test.tsx` — formato CEP, auto-call ViaCEP, fluxo confirma, cancelar NF
- `src/__tests__/app/mobile/captura-notas.test.tsx` — fluxo completo (5 NFs sequenciais, lista atualiza, finalizar dispara VROOM)
- `src/__tests__/app/mobile/ajuste-rota/abaOrdenar.test.tsx` — drag muda ordem, números renumeram, lock impede arrasto
- `src/__tests__/app/mobile/ajuste-rota/abaDetalhes.test.tsx` — tap abre modal de horário, salva preferência, libera lock
- `src/__tests__/app/mobile/ajuste-rota/tijolinho.test.tsx` — renderiza certo nos dois modos, número grande visível
- `src/__tests__/api/routing/otimizar.test.ts` — endpoint POST com payload válido/inválido

**Fase 2 — quando ativar QR Code (opcional):**
- `src/__tests__/lib/nfe/qrCode.test.ts` — parse de URL SEFAZ → 44 dígitos, validação módulo 11, chaves inválidas
- `src/__tests__/lib/nfe/consulta.test.ts` — consulta MeuDanfe/SEFAZ mock, sucesso, erro, chave inexistente, cascata de fallback
- `src/__tests__/api/nfe/consultar.test.ts` — endpoint POST chave 44 dígitos válida/inválida

Rodar `npm test` ao fim, ver verde, reportar no Log de Execução do `TESTING.md`.

---

## Ordem Recomendada de Execução

> **Regra de ouro:** cada passo so comeca quando seu(s) pre-requisito(s) esta(o) verde. **Testes vem JUNTO** com cada passo, nao no final (conforme `TESTING.md`).

### FASE 0 — Setup Completo (TUDO de uma vez antes de codar feature)

| # | Passo | Pre-requisito | Onde |
|---|---|---|---|
| 0.1 | ✅ Criar 5 tabelas no Supabase **(✅ feito 2026-05-27 — usuário aplicou SQL via painel)** | — | Supabase Dashboard |
| 0.2 | ✅ Instalar deps npm (dexie, leaflet, react-leaflet, @dnd-kit/core, @dnd-kit/sortable, @types/leaflet) **(✅ feito 2026-05-27 por Claude Opus 4.7)** | — | `package.json` |
| 0.3 | ✅ Adicionar env vars (NOMINATIM_URL, VIACEP_URL, OSRM_URL/VROOM_URL) ao `.env.example` (projeto não usa `src/lib/env.ts`, vars lidas via `process.env.X`) **(✅ feito 2026-05-27 por Claude Opus 4.7)** | — | `.env.example` |
| 0.4 | ✅ Criar 5 pastas vazias (3 com types.ts no próximo passo, 2 com `.gitkeep`) **(✅ feito 2026-05-27 por Claude Opus 4.7)** | — | `src/lib/cep/`, `src/lib/offline/`, `src/lib/routing/`, `src/app/mobile/captura-notas/`, `src/app/api/routing/` |
| 0.5 | ✅ Escrever 3 arquivos `types.ts` (sem logica) **(✅ feito 2026-05-27 por Claude Opus 4.7)** — `EnderecoCEP`, `Coordenada`, `NotaCapturada`, `RotaOtimizada`, `Parada`, `JanelaHorario`, `StatusNota`, `StatusRota`, `ResultadoOSRM`, `ResultadoVROOM`, `ResultadoGeocoding`, `NotaNaFila`, `StatusSync` | 0.4 | `src/lib/routing/types.ts`, `src/lib/cep/types.ts`, `src/lib/offline/types.ts` |
| 0.6 | ✅ Verificar checklist de conclusao da ETAPA 0 **(✅ feito 2026-05-27 por Claude Opus 4.7 — tsc 0 erros, 206/206 testes passando)** | 0.1-0.5 | — |

**Em paralelo** (nao bloqueia FASE 1 inicial):

| # | Passo | Onde |
|---|---|---|
| 0.A | Criar conta Oracle Cloud + iniciar loop de provisionamento da VM (demora 1-3 dias) | Etapa 1.1 + 2.1 |

### FASE 1 — Implementacao (cada passo destrava o proximo)

**Pre-requisito geral:** FASE 0 completa (0.1-0.6 todos ✅).

**Bloco A — Pode rodar SEM Oracle/OSRM pronto:**

| # | Passo | Arquivo principal | Pre-req | Testes |
|---|---|---|---|---|
| 1.1 | ✅ Cliente ViaCEP + cache local **(✅ feito 2026-05-27 por Claude Opus 4.7 — 23 testes verdes)** | `src/lib/cep/viacep.ts` | tipo `EnderecoCEP`, tabela `cep_cache` | `viacep.test.ts` |
| 1.2 | ✅ Fila offline (Dexie + sync ao Supabase via API route) **(✅ feito 2026-05-27 por Claude Opus 4.7 — 46 testes verdes)** | `src/lib/offline/fila.ts`, `sync.ts`, `onlineDetector.ts` + `src/app/api/notas/sync/route.ts` (endpoint POST que recebe nota e insere via service_role) + dev-dep `fake-indexeddb` (testes Dexie) | tipo `NotaNaFila`, tabela `notas_capturadas` | `fila.test.ts`, `sync.test.ts`, `onlineDetector.test.ts`, `route.test.ts` |
| 1.3 | ✅ Componente `InputEnderecoNF` + API route + browser client **(✅ feito 2026-05-27 por Claude Opus 4.7 — 24 testes verdes)** | `src/components/mobile/InputEnderecoNF.tsx`, `src/app/api/cep/[cep]/route.ts` (wrapper que expoe `consultarCEP` server-only ao browser), `src/lib/cep/client.ts` (fetch wrapper pro browser). `ResultadoCEP` movido de `viacep.ts` → `types.ts` (importável sem puxar Supabase). Dev-dep `@testing-library/user-event`. | 1.1 (ViaCEP) | `inputEnderecoNF.test.tsx`, `client.test.ts`, `route.test.ts` |
| 1.4 | ✅ Tela mobile captura-notas **(✅ feito 2026-05-28 por Claude Opus 4.7 — 16 testes verdes)** | `src/app/mobile/captura-notas/page.tsx` — usa `InputEnderecoNF`, `adicionarNota`, `iniciarSyncWorker`, `iniciarOnlineDetector`. Params via URL: `?motorista_id=...&empresa_id=...&total=70`. Mostra contador (sincronizadas/pendentes/erros), lista das 10 ultimas, botao Finalizar Rota (stub ate 1.7+). Auth/sessao do motorista vira na consolidacao futura. | 1.2 (fila) + 1.3 (componente) | `captura-notas.test.tsx` |
| 1.5 | ✅ Cliente Nominatim (geocoding) **(✅ feito 2026-05-28 por Claude Opus 4.7 — 15 testes verdes)** | `src/lib/routing/geocoding.ts` — `geocodar(endereco)` + `formatarEnderecoParaGeocoding(parts)`. Rate limiter 1100ms entre chamadas. User-Agent obrigatorio. `_resetRateLimit()` pra testes. | env `NOMINATIM_URL` | `geocoding.test.ts` |
| 1.6 | ✅ API `/api/routing/geocodar` (endpoint Next.js) **(✅ feito 2026-05-28 por Claude Opus 4.7 — 8 testes verdes)** | `src/app/api/routing/geocodar/route.ts` — POST recebe `{ endereco }`, retorna 200/400/503 conforme resultado do geocoder. | 1.5 | `geocodar.test.ts` |

**═══ CHECKPOINT 1: motorista ja captura NFs, dados sao geocodificados e salvos ═══**

**Bloco B — Precisa Oracle/OSRM de pe:**

| # | Passo | Arquivo principal | Pre-req | Testes |
|---|---|---|---|---|
| 1.7 | ✅ Cliente OSRM (HTTP wrapper) **(✅ feito 2026-05-28 por Claude Opus 4.7 — 12 testes verdes)** | `src/lib/routing/osrm.ts` — `calcularRota(pontos[])`, `calcularRotaSimples(o, d)`. Devolve `{distanciaKm, tempoMin, polyline}`. Aceita 2+ waypoints. `config_faltando` quando OSRM_URL vazio. | VM Oracle + container OSRM + `OSRM_URL` no env (produção). Mock no teste. | `osrm.test.ts` |
| 1.8 | ✅ Cliente VROOM (HTTP wrapper) **(✅ feito 2026-05-28 por Claude Opus 4.7 — 15 testes verdes)** | `src/lib/routing/vroom.ts` — `otimizarRota({ veiculos, jobs, dataBase })`, exports `Veiculo`, `Job`, `janelaParaUnixDoDia`. Suporta janelas de horario, prioridade, skills, capacidade, tempo_descarga. | container VROOM + `VROOM_URL` (produção) | `vroom.test.ts` |
| 1.9 | ✅ Helpers de restricoes VROOM (`priority`, `time_windows`, `skills`) **(✅ feito 2026-05-28 por Claude Opus 4.7 — 19 testes verdes)** | `src/lib/routing/restricoes.ts` — `indexarJobs`, `notaParaJob`, `montarVeiculo`, `aplicarFixacao`, `aplicarPreferenciaCliente`, `traduzirParadasComMapping`, `montarParadasPersistir`. Constants `PRIORIDADE.NORMAL/ALTA/FIXADA`. | 1.8 | `restricoes.test.ts` |
| 1.10 | ✅ API `/api/routing/otimizar` (endpoint Next.js) **(✅ feito 2026-05-28 por Claude Opus 4.7 — 9 testes verdes)** | `src/app/api/routing/otimizar/route.ts` — POST recebe `motorista_id`+`empresa_id`+`origem`. Pipeline: busca notas → geocodifica faltantes → VROOM → persiste rota+paradas → marca notas em_rota. | 1.8 + 1.9 | `otimizar/route.test.ts` |
| 1.11 | ✅ Componente `MapaRota` (Leaflet + traçado da rota) **(✅ feito 2026-05-28 por Claude Opus 4.7 — 6 testes verdes)** | `src/components/MapaRota.tsx` (wrapper SSR-safe), `src/components/MapaRotaInner.tsx` (real Leaflet com dynamic ssr:false), `src/lib/routing/polyline.ts` (decoder Google encoded). Pinos numerados via DivIcon. | paradas geocodificadas existem | `polyline.test.ts`, `mapaRota.test.tsx` |
| 1.12 | ✅ Tela "Ajuste de Rota" — page com tabs Ordenar/Detalhes, drag-drop (@dnd-kit), lock/unlock, edit janela horario via modal **(✅ feito 2026-05-28 por Claude Opus 4.7 — 37 testes verdes)**. Sub-endpoints: `GET /api/routing/rota/[id]` e `PATCH /api/routing/rota/[id]/paradas`. **Polish adiado** (Fase 1.5): animacao de pinos, modal de impacto km/min, salvar `cliente_preferencias`, vibracao tatil, multiplas janelas horario por parada. | `src/app/mobile/ajuste-rota/page.tsx`, `components/Tijolinho.tsx`, `components/ModalHorario.tsx`, `src/app/api/routing/rota/[id]/route.ts`, `src/app/api/routing/rota/[id]/paradas/route.ts` | 1.10 (otimizacao) + 1.11 (mapa) | `page.test.tsx`, `tijolinho.test.tsx`, `modalHorario.test.tsx`, `route.test.ts`, `paradas.test.ts` |
| 1.13 | ✅ Deep links Waze/Google Maps **(✅ feito 2026-05-28 por Claude Opus 4.7 — 9 testes verdes)** | `src/lib/routing/deepLinks.ts` — `waze(lat,lng)`, `googleMaps(lat,lng)`, `googleMapsMultiStop(pontos[])` (max 10 waypoints), `dividirParaMultiStop(pontos, chunkSize=10)` (pra 70 NFs vira 7 sub-rotas). | 1.12 | `deepLinks.test.ts` |
| 1.14 | ✅ Utilitario `estimarRota` (cep+nº → endereco → coord → km/polyline) **(✅ feito 2026-05-28 por Claude Opus 4.7 — 7 testes verdes)**. **Integracao visual com `entregas/novo` adiada** pra consolidacao (anotado em `ACOES_PENDENTES_USUARIO.md` item 6) — exige adicionar colunas `km_estimado`, `origem_coord`, `destino_coord` em `entregas`, fora do escopo isolado. | `src/lib/routing/estimarRota.ts` — pronto pra ser chamado quando consolidar. | 1.7 (OSRM) + 1.5 (Nominatim) + 1.1 (ViaCEP) | `estimarRota.test.ts` |

**═══ CHECKPOINT 2: rota completa, motorista navega via Waze, frete tem km automatico ═══**

| # | Passo | Pre-req |
|---|---|---|
| 1.15 | 🟡 Smoke test E2E manual: capturar 5 NFs → otimizar → ver no mapa → abrir Waze — **AGUARDA USUARIO** (anotado em `ACOES_PENDENTES_USUARIO.md` item 5). | tudo verde |
| 1.16 | ✅ Rodar `npm test` completo, ver tudo verde, anotar no `TESTING.md` **(✅ feito 2026-05-28 por Claude Opus 4.7 — 452 testes em 40 arquivos)**. | tudo verde |

### Fase 2 — Otimização (Opcional, ativar quando volume justificar)

13. ⬜ Decidir fonte da consulta NFe: certificado A1 (recomendado) ou MeuDanfe/NFe.io (Etapa 1.6)
14. ⬜ Implementar parser/consulta de NFe em cascata (`src/lib/nfe/`) — chave 44 dígitos → endereço destinatário
15. ⬜ Construir leitor de QR Code mobile (`src/components/mobile/LeitorQRCode.tsx`) com bipe + vibração (Etapa 3.7-Fase2)
16. ⬜ Adicionar botão "📷 Escanear QR" na tela de captura como atalho opcional (fallback para Fase 1 se falhar)
17. ⬜ Escrever testes Fase 2 e rodar suíte (Etapa 3.12 — bloco Fase 2)

---

## Custos Finais

| Item | Custo mensal |
|---|---|
| Oracle Cloud VM (4 OCPU + 24GB RAM) | **R$ 0,00** |
| OSRM (open source) | R$ 0,00 |
| VROOM (open source) | R$ 0,00 |
| Leaflet + OpenStreetMap | R$ 0,00 |
| Nominatim público | R$ 0,00 |
| Waze / Google Maps (deep link) | R$ 0,00 |
| **TOTAL** | **R$ 0,00** |
