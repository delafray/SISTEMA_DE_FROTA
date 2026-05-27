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
> **Motivo desta regra:** o usuário relatou que, em planejamentos anteriores, a IA não confirmou pontos importantes do plano e implementou coisas que ele não tinha aprovado. Esta regra existe para impedir que isso aconteça de novo.

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

**Stack final (revisada 2026-05-21):**
- **OSRM** (motor de cálculo de rota) — auto-hospedado no **Oracle Free Tier**
- **VROOM** (otimização VRP — ordem das paradas) — auto-hospedado
- **Leitor de QR Code nativo no app mobile** (captura das notas fiscais pelo motorista — abordagem principal de entrada de paradas)
- **Foreground Queue (IndexedDB via Dexie)** — fila local iOS-compatível, sem Background Sync API
- **Leaflet + OpenStreetMap** (mapa visual no sistema)
- **Nominatim** (busca endereço → coordenadas, fallback se a chave SEFAZ falhar)
- **Waze / Google Maps deep link** (navegação ao vivo no celular do motorista — funciona em qualquer celular)

**Como as paradas entram no sistema:**
O gestor da empresa **não tem as notas fiscais antes** do caminhão sair — o motorista recebe as notas em papel na hora. Por isso, a captura é feita **pelo próprio motorista escaneando o QR Code de cada NFe** direto na tela mobile do sistema (estilo leitor de supermercado, com bipe a cada leitura). A partir da chave de acesso de 44 dígitos, o sistema consulta o destinatário e monta automaticamente a lista de paradas para o VROOM otimizar.

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

### 1.5. Consulta de NFe pela chave de acesso (escolher 1)

Para transformar os 44 dígitos da chave (lidos do QR Code) em endereço completo do destinatário:

- **MeuDanfe** — API grátis com limite diário (https://meudanfe.com.br) — começar por aqui
- **NFe.io** — free tier ~100 consultas/mês
- **Webmania / Tecnospeed / Migrate** — pagas, robustas (R$ 50-200/mês), considerar quando escalar
- **SEFAZ direto** — exige **certificado digital A1 da empresa** (~R$ 200/ano), 100% grátis depois, ilimitado

**Recomendação:** começar com MeuDanfe (grátis) e, se passar do limite ou precisar mais confiabilidade, comprar certificado A1 da empresa e consultar SEFAZ direto.

### 1.6. (Opcional) Domínio + Cloudflare

- Só se quiser HTTPS no endpoint do OSRM (ex: `osrm.suaempresa.com`).
- Cloudflare grátis cobre SSL e proxy.
- Não é obrigatório para começar — pode chamar via IP da VM com HTTP interno.

---

## ETAPA 2 — Instalação no Servidor (Oracle VM)

### 2.1. Provisionar a VM

1. Console Oracle → **Compute → Instances → Create Instance**
2. Imagem: **Ubuntu 22.04 ARM**
3. Shape: **VM.Standard.A1.Flex** — 4 OCPU + 24 GB RAM
4. Rede: usar VCN default, **anotar IP público**
5. Chave SSH: gerar e baixar a chave privada (guardar)

### 2.2. Liberar portas no firewall Oracle

Console Oracle → **Networking → VCN → Security List → Add Ingress Rules:**

| Porta | Protocolo | Origem | Uso |
|---|---|---|---|
| 22 | TCP | seu IP | SSH |
| 5000 | TCP | 0.0.0.0/0 | OSRM API |
| 3000 | TCP | 0.0.0.0/0 | VROOM API |
| 443 | TCP | 0.0.0.0/0 | (opcional, HTTPS futuro) |

### 2.3. Conectar via SSH e preparar a máquina

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

### 2.4. Baixar e pré-processar o mapa do Brasil

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

### 2.5. Criar `docker-compose.yml` para OSRM + VROOM

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

### 2.6. Subir os containers

```bash
cd ~/routing
docker compose up -d

# Conferir logs
docker compose logs -f
```

### 2.7. Testar do seu computador

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

### 2.8. (Opcional) Auto-restart e monitoramento

- O `restart: unless-stopped` já garante que sobe sozinho após reboot.
- Para monitorar: `docker stats` mostra CPU/RAM em tempo real.
- Para logs persistentes: configurar `journald` driver ou enviar para Sentry/Grafana.

### 2.9. Keep-Alive — Evitar que Oracle recupere a VM (OBRIGATÓRIO)

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
src/lib/routing/
├── osrm.ts              # Cliente HTTP do OSRM (rota A→B)
├── vroom.ts             # Cliente HTTP do VROOM (otimização VRP)
├── geocoding.ts         # Cliente Nominatim (endereço → lat/lng)
├── deepLinks.ts         # Gera URLs Waze e Google Maps
└── types.ts             # Tipos compartilhados (Coordenada, Rota, etc.)

src/lib/nfe/
├── qrCode.ts            # Parser do conteúdo do QR Code da NFe → chave 44 dígitos
├── consulta.ts          # Consulta chave SEFAZ/MeuDanfe → dados do destinatário
└── types.ts             # NFeDestinatario, EnderecoDestinatario

src/components/mobile/
├── LeitorQRCode.tsx     # Câmera ao vivo + decoder (html5-qrcode ou @zxing/browser)
├── ListaNotasEscaneadas.tsx  # Lista as paradas conforme vai escaneando, com bipe + vibração
└── BotaoFinalizarRota.tsx    # Dispara VROOM e abre tela de roteirização

src/components/
├── MapaRota.tsx         # Componente Leaflet (mapa + traçado da rota)
└── BotoesNavegacao.tsx  # Botões "Abrir no Waze" / "Abrir no Google Maps"

src/app/api/routing/
├── otimizar/route.ts    # POST: recebe paradas, retorna ordem otimizada (chama VROOM)
└── geocodar/route.ts    # POST: recebe endereço, retorna lat/lng (chama Nominatim)

src/app/api/nfe/
└── consultar/route.ts   # POST: recebe chave de 44 dígitos, retorna destinatário+endereço

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

### 3.7. Leitor de QR Code mobile (`src/components/mobile/LeitorQRCode.tsx`)

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

**Nova tela mobile de Captura de Notas (`src/app/mobile/captura-notas/`):**
- Motorista abre no celular antes de sair com o caminhão
- Componente `LeitorQRCode` ocupa tela inteira
- Cada QR escaneado consulta a chave SEFAZ → endereço do destinatário
- Lista lateral/inferior mostra as notas já capturadas (com endereço resumido)
- Botão "Finalizar Rota" envia paradas → VROOM → tela de Roteirização

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

- `src/__tests__/lib/routing/osrm.test.ts` — mocks de resposta, sucesso, erro, timeout
- `src/__tests__/lib/routing/vroom.test.ts` — otimização com 5, 20 e 70 paradas (mock)
- `src/__tests__/lib/routing/geocoding.test.ts` — endereço válido, inválido, rate limit
- `src/__tests__/lib/routing/deepLinks.test.ts` — geração correta dos URLs
- `src/__tests__/lib/nfe/qrCode.test.ts` — parse de URL SEFAZ → 44 dígitos, validação módulo 11, chaves inválidas
- `src/__tests__/lib/nfe/consulta.test.ts` — consulta MeuDanfe/SEFAZ mock, sucesso, erro, chave inexistente
- `src/__tests__/lib/offline/fila.test.ts` — adicionar, dedup local, status transitions, recuperar pendentes
- `src/__tests__/lib/offline/sync.test.ts` — retry exponencial, conflito 409, sucesso, offline → online
- `src/__tests__/lib/routing/restricoes.test.ts` — montagem do payload VROOM com `priority`, `time_windows`, `skills`
- `src/__tests__/app/mobile/ajuste-rota/abaOrdenar.test.tsx` — drag muda ordem, números renumeram, lock impede arrasto
- `src/__tests__/app/mobile/ajuste-rota/abaDetalhes.test.tsx` — tap abre modal de horário, salva preferência, libera lock
- `src/__tests__/app/mobile/ajuste-rota/tijolinho.test.tsx` — renderiza certo nos dois modos, número grande visível
- `src/__tests__/api/routing/otimizar.test.ts` — endpoint POST com payload válido/inválido
- `src/__tests__/api/nfe/consultar.test.ts` — endpoint POST chave 44 dígitos válida/inválida

Rodar `npm test` ao fim, ver verde, reportar no Log de Execução do `TESTING.md`.

---

## Ordem Recomendada de Execução

1. ✅ Criar conta Oracle Cloud e provisionar VM (Etapa 1.1 + 2.1–2.3)
2. ✅ Subir OSRM + VROOM no Docker (Etapa 2.4–2.7)
3. ✅ Testar via curl que os endpoints respondem (Etapa 2.7)
4. ✅ Criar clientes HTTP em `src/lib/routing/` (Etapa 3.3–3.6)
5. ✅ Implementar parser/consulta de NFe (`src/lib/nfe/`) — chave 44 dígitos → endereço destinatário
6. ✅ Construir leitor de QR Code mobile (`src/components/mobile/LeitorQRCode.tsx`) com bipe + vibração
7. ✅ Implementar arquitetura offline-first (`src/lib/offline/` — Dexie + Service Worker + Background Sync)
8. ✅ Criar tela mobile de captura de notas (`src/app/mobile/captura-notas/`)
9. ✅ Construir tela de roteirização com mapa Leaflet (Etapa 3.9)
10. ✅ Construir tela "Ajuste de Rota" com drag-and-drop, fixar paradas e janelas de horário (Etapa 3.10)
11. ✅ Integrar com cadastro de frete e Waze/Google Maps deep links (Etapas 3.11)
12. ✅ Escrever testes e rodar suíte (Etapa 3.12)

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
