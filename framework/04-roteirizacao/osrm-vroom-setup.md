# OSRM + VROOM — Setup Completo de Roteirização

> 📎 Voltar ao [INDEX de Roteirização](INDEX.md) | [INDEX principal](../INDEX.md)
>
> Referência complementar: [ORACLE_CLOUD_SETUP.md](../../ORACLE_CLOUD_SETUP.md) (IDs de recursos, script PowerShell)
> Plano original: [PLANO_EXECUCAO_OSRM_VM.md](../../PLANO_EXECUCAO_OSRM_VM.md) (16 passos com validação)

---

## O que é

- **OSRM** (Open Source Routing Machine) — calcula rotas de carro (distância + tempo)
- **VROOM** — otimiza múltiplas entregas (Vehicle Routing Problem)

Ambos rodam numa VM Oracle Cloud **gratuita permanente** (Always Free).

---

## Pré-requisitos

- Conta Oracle Cloud (cloud.oracle.com — pede cartão de crédito mas NÃO cobra, só verificação)
- OCI CLI instalado no computador local
- Chave SSH gerada (para acessar a VM)

---

## Passo 1 — Criar a VM Oracle Cloud

**Opção A: Script automático (recomendado)**

O script tenta criar a VM a cada 60s nos 3 Availability Domains de Ashburn até conseguir:

```powershell
Set-ExecutionPolicy Bypass -Scope Process -Force
& "C:\Users\ronal\criar_vm_osrm.ps1"
```

> O script completo está em [ORACLE_CLOUD_SETUP.md §7](../../ORACLE_CLOUD_SETUP.md).
> ⚠️ **NÃO feche o PowerShell enquanto roda.** Pode levar minutos ou horas.
> IP salvo automaticamente em `C:\Users\ronal\vm_ip.txt`.

**Opção B: Console web manual**
1. cloud.oracle.com → Compute → Instances → Create Instance
2. Shape: **VM.Standard.A1.Flex** (ARM)
3. OCPUs: **4**, RAM: **24 GB**
4. OS: **Ubuntu 22.04**
5. Região: **US East (Ashburn)** — libera mais rápido que São Paulo
6. Adicionar chave SSH pública

**Specs da VM:**

| Campo | Valor |
|---|---|
| Shape | VM.Standard.A1.Flex (ARM/Ampere) |
| OCPUs | 4 |
| RAM | 24 GB |
| Disco | 150 GB (Boot Volume — confirmado no console OCI em 04/06/2026) |
| OS | Ubuntu 22.04 |
| Custo | R$ 0 (Always Free permanente) |

---

## Passo 2 — Conectar via SSH

```bash
ssh -i C:\Users\ronal\.ssh\osrm-key.pem ubuntu@<IP-DA-VM>
```

---

## Passo 3 — Instalar Docker

```bash
# Na VM (via SSH)
curl -fsSL https://get.docker.com | sudo bash
sudo usermod -aG docker ubuntu && newgrp docker

# Verificar:
docker --version   # Esperado: Docker version 24.x+
```

---

## Passo 4 — Baixar o mapa do Brasil (~3.5 GB, 5-15 min)

```bash
mkdir -p ~/osrm-data && cd ~/osrm-data
wget https://download.geofabrik.de/south-america/brazil-latest.osm.pbf

# Verificar:
ls -lh brazil-latest.osm.pbf   # Esperado: ~3-4 GB
```

---

## Passo 5 — Processar o mapa (30-90 minutos, SÓ 1 VEZ)

> ⚠️ Usa ~20 GB de RAM. Demora. Não interrompa.

```bash
cd ~/osrm-data

# Passo 5a: Extract (20-40 min)
docker run --rm -t -v "${PWD}:/data" ghcr.io/project-osrm/osrm-backend \
  osrm-extract -p /opt/car.lua /data/brazil-latest.osm.pbf

# Passo 5b: Partition (5-10 min)
docker run --rm -t -v "${PWD}:/data" ghcr.io/project-osrm/osrm-backend \
  osrm-partition /data/brazil-latest.osrm

# Passo 5c: Customize (5-10 min)
docker run --rm -t -v "${PWD}:/data" ghcr.io/project-osrm/osrm-backend \
  osrm-customize /data/brazil-latest.osrm
```

**Verificar:** `ls -lh ~/osrm-data/` → vários arquivos `.osrm.*`

---

## Passo 6 — Subir OSRM + VROOM com Docker Compose

```bash
mkdir -p ~/routing && cat > ~/routing/docker-compose.yml << 'EOF'
services:
  osrm:
    image: ghcr.io/project-osrm/osrm-backend
    container_name: osrm
    restart: unless-stopped
    ports:
      - "5000:5000"
    volumes:
      - /home/ubuntu/osrm-data:/data
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
EOF

cd ~/routing && docker compose up -d

# Verificar (espere 10s para subir):
docker compose ps   # Esperado: ambos containers "running"
```

---

## Passo 7 — Abrir firewall

### 7a. Firewall INTERNO da VM (iptables)
```bash
sudo iptables -I INPUT -p tcp --dport 5000 -j ACCEPT
sudo iptables -I INPUT -p tcp --dport 3000 -j ACCEPT
sudo apt install -y iptables-persistent
sudo netfilter-persistent save
```

### 7b. Firewall EXTERNO da Oracle (Security List)
1. Console Oracle → **Networking → Virtual Cloud Networks → sua VCN**
2. Clique na **Security List** (geralmente "Default Security List")
3. **Add Ingress Rules:**
   - Porta **5000**, TCP, Source: `0.0.0.0/0` (OSRM)
   - Porta **3000**, TCP, Source: `0.0.0.0/0` (VROOM)

> ⚠️ Sem este passo, o acesso externo fica BLOQUEADO mesmo com iptables liberado!

---

## Passo 8 — Testar

### Teste local (dentro da VM):
```bash
# OSRM — rota SP→Campinas
curl -s 'http://localhost:5000/route/v1/driving/-46.6333,-23.5505;-47.0608,-22.9056?overview=false'
# Esperado: JSON com "distance" e "duration"

# VROOM — otimização de 2 entregas
curl -s -X POST http://localhost:3000 \
  -H 'Content-Type: application/json' \
  -d '{"vehicles":[{"id":1,"start":[-46.63,-23.55],"end":[-46.63,-23.55]}],"jobs":[{"id":1,"location":[-46.65,-23.56]},{"id":2,"location":[-46.70,-23.58]}]}'
# Esperado: JSON com "routes"
```

### Teste externo (do seu computador):
```bash
curl "http://<IP-DA-VM>:5000/route/v1/driving/-46.6333,-23.5505;-47.0608,-22.9056?overview=false"
```

Se não responder → volte ao Passo 7b (firewall Oracle).

---

## Passo 9 — Keep-alive (evitar que Oracle recicle a VM)

```bash
sudo tee /opt/keepalive.sh > /dev/null << 'EOF'
#!/bin/bash
curl -s "http://localhost:5000/route/v1/driving/-46.6333,-23.5505;-46.6500,-23.5610?overview=false" > /dev/null
echo "$(date '+%Y-%m-%d %H:%M:%S') keepalive OK" >> /var/log/osrm-keepalive.log
EOF
sudo chmod +x /opt/keepalive.sh
(sudo crontab -l 2>/dev/null; echo "0 */6 * * * /opt/keepalive.sh") | sudo crontab -
```

---

## Passo 10 — Configurar variáveis no sistema

Adicione ao `.env.local` e à Vercel:
```env
OSRM_URL=http://<IP-DA-VM>:5000
VROOM_URL=http://<IP-DA-VM>:3000
```

→ Redeploy na Vercel!

---

## Como usar no código

```typescript
import { estimarRota } from '@/lib/routing/estimarRota';

const resultado = await estimarRota({
  origem: { lat: -23.55, lng: -46.63 },
  destino: { lat: -22.90, lng: -43.17 },
});
// resultado.km_estimado, resultado.tempo_estimado_min
```

---

## Tempos estimados

| Passo | Tempo |
|---|---|
| Criar VM (script) | Minutos a horas (depende da capacidade) |
| Baixar mapa | 5-15 min |
| Processar mapa | 30-90 min (SÓ 1 VEZ) |
| Subir containers | 1 min |
| **Total** | ~1 a 2 horas |

---

## Veja também

- [../03-deploy/oracle-cloud.md](../03-deploy/oracle-cloud.md) — specs da VM, IDs, comandos OCI
- [ORACLE_CLOUD_SETUP.md](../../ORACLE_CLOUD_SETUP.md) — script PowerShell completo
- [PLANO_EXECUCAO_OSRM_VM.md](../../PLANO_EXECUCAO_OSRM_VM.md) — 16 passos com validação detalhada
- [../02-apis-e-chaves/env-template.md](../02-apis-e-chaves/env-template.md) — OSRM_URL, VROOM_URL
