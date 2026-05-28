#!/usr/bin/env bash
# =============================================================
# SETUP COMPLETO OSRM + VROOM na Oracle Cloud VM (Ubuntu 22 ARM)
# Automatiza ETAPA 2.3 a 2.9 do PLANO_ROTEIRIZACAO.md.
#
# COMO USAR:
#   1. SSH na VM:   ssh -i osrm-key.pem ubuntu@<IP-DA-VM>
#   2. Copie este arquivo: scp -i osrm-key.pem setup_osrm.sh ubuntu@<IP>:~/
#      OU cole o conteudo num arquivo na VM via: nano setup_osrm.sh
#   3. chmod +x setup_osrm.sh && ./setup_osrm.sh
#
# DURACAO TOTAL: ~30 a 90 minutos (a maior parte e o processamento do mapa)
# =============================================================

set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log()    { echo -e "${GREEN}[$(date +'%H:%M:%S')] $*${NC}"; }
warn()   { echo -e "${YELLOW}[$(date +'%H:%M:%S')] $*${NC}"; }
errEx()  { echo -e "${RED}[$(date +'%H:%M:%S')] $*${NC}"; exit 1; }

# -----------------------------------------------------------------
# ETAPA 2.3 — Atualizar pacotes e instalar Docker
# -----------------------------------------------------------------
log "[2.3] Atualizando apt packages..."
sudo apt update -qq
sudo DEBIAN_FRONTEND=noninteractive apt upgrade -y -qq

if ! command -v docker >/dev/null 2>&1; then
    log "[2.3] Instalando Docker..."
    curl -fsSL https://get.docker.com | sudo bash
    sudo usermod -aG docker "$USER"
    # Garantir que o grupo docker funcione nesta sessao
    sudo systemctl enable --now docker
else
    log "[2.3] Docker ja instalado: $(docker --version)"
fi

if ! docker compose version >/dev/null 2>&1; then
    log "[2.3] Instalando Docker Compose plugin..."
    sudo apt install -y -qq docker-compose-plugin
else
    log "[2.3] Docker Compose ja instalado: $(docker compose version)"
fi

# Firewall interno (opcional — Oracle Security List ja controla portas)
log "[2.3] Configurando UFW (apenas as portas necessarias)..."
if ! sudo ufw status | grep -q "Status: active"; then
    sudo ufw --force allow 22/tcp
    sudo ufw --force allow 5000/tcp
    sudo ufw --force allow 3000/tcp
    sudo ufw --force enable
fi

# -----------------------------------------------------------------
# ETAPA 2.4 — Baixar e pre-processar o mapa do Brasil
# -----------------------------------------------------------------
log "[2.4] Preparando diretorio ~/osrm-data ..."
mkdir -p ~/osrm-data
cd ~/osrm-data

if [ ! -f "brazil-latest.osm.pbf" ]; then
    log "[2.4] Baixando mapa do Brasil (~3 GB, demora ~5-10min)..."
    wget --progress=dot:giga https://download.geofabrik.de/south-america/brazil-latest.osm.pbf
else
    log "[2.4] Mapa brazil-latest.osm.pbf ja existe — pulando download."
fi

# Pre-processamento OSRM (3 etapas: extract, partition, customize)
# Total ~30-90min em VM ARM 4OCPU/24GB
OSRM_FILE="brazil-latest.osrm"
NEEDS_PROCESS=true
if [ -f "${OSRM_FILE}.cell_metrics" ]; then
    NEEDS_PROCESS=false
    log "[2.4] Mapa ja processado (${OSRM_FILE}.cell_metrics existe) — pulando."
fi

if [ "$NEEDS_PROCESS" = true ]; then
    log "[2.4.1] osrm-extract (10-30 min — usa muita RAM)..."
    sudo docker run --rm -t -v "${PWD}:/data" ghcr.io/project-osrm/osrm-backend \
        osrm-extract -p /opt/car.lua /data/brazil-latest.osm.pbf

    log "[2.4.2] osrm-partition (5-15 min)..."
    sudo docker run --rm -t -v "${PWD}:/data" ghcr.io/project-osrm/osrm-backend \
        osrm-partition /data/brazil-latest.osrm

    log "[2.4.3] osrm-customize (5-15 min)..."
    sudo docker run --rm -t -v "${PWD}:/data" ghcr.io/project-osrm/osrm-backend \
        osrm-customize /data/brazil-latest.osrm

    log "[2.4] Processamento OSRM concluido."
fi

# -----------------------------------------------------------------
# ETAPA 2.5 — Criar docker-compose.yml
# -----------------------------------------------------------------
log "[2.5] Criando ~/routing/docker-compose.yml ..."
mkdir -p ~/routing
cat > ~/routing/docker-compose.yml <<'YAML'
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
YAML

# -----------------------------------------------------------------
# ETAPA 2.6 — Subir os containers
# -----------------------------------------------------------------
log "[2.6] Subindo OSRM + VROOM com docker compose..."
cd ~/routing
sudo docker compose pull
sudo docker compose up -d

log "[2.6] Aguardando 30s pra containers iniciarem..."
sleep 30

# -----------------------------------------------------------------
# ETAPA 2.7 — Testar
# -----------------------------------------------------------------
log "[2.7] Testando OSRM (rota São Paulo → Campinas)..."
OSRM_RESP=$(curl -s -o /dev/null -w "%{http_code}" \
    "http://localhost:5000/route/v1/driving/-46.6333,-23.5505;-47.0608,-22.9056?overview=false" || echo "000")
if [ "$OSRM_RESP" = "200" ]; then
    log "[2.7] OSRM OK (HTTP 200)"
else
    warn "[2.7] OSRM nao respondeu OK (HTTP $OSRM_RESP). Veja: docker logs osrm"
fi

log "[2.7] Testando VROOM..."
VROOM_RESP=$(curl -s -o /dev/null -w "%{http_code}" -X POST "http://localhost:3000" \
    -H "Content-Type: application/json" \
    -d '{"vehicles":[{"id":1,"start":[-46.63,-23.55],"end":[-46.63,-23.55]}],"jobs":[{"id":1,"location":[-46.65,-23.56]}]}' || echo "000")
if [ "$VROOM_RESP" = "200" ]; then
    log "[2.7] VROOM OK (HTTP 200)"
else
    warn "[2.7] VROOM nao respondeu OK (HTTP $VROOM_RESP). Veja: docker logs vroom"
fi

# -----------------------------------------------------------------
# ETAPA 2.8 — Auto-restart ja configurado via restart:unless-stopped
# -----------------------------------------------------------------
log "[2.8] Auto-restart configurado (restart: unless-stopped no compose)."

# -----------------------------------------------------------------
# ETAPA 2.9 — Keep-alive cron
# -----------------------------------------------------------------
log "[2.9] Instalando keep-alive (pinga OSRM/VROOM a cada 6h)..."
sudo mkdir -p /opt/scripts
sudo tee /opt/scripts/osrm-keepalive.sh > /dev/null <<'EOF'
#!/bin/bash
# Pinga OSRM/VROOM pra manter CPU ativa (politica Oracle Free Tier:
# VMs idle por 7 dias sao recuperadas).

OSRM=$(curl -s -o /dev/null -w "%{http_code}" \
    "http://localhost:5000/route/v1/driving/-46.6333,-23.5505;-46.6500,-23.5610?overview=false" || echo 000)
VROOM=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "http://localhost:3000" \
    -H "Content-Type: application/json" \
    -d '{"vehicles":[{"id":1,"start":[-46.63,-23.55],"end":[-46.63,-23.55]}],"jobs":[{"id":1,"location":[-46.65,-23.56]}]}' || echo 000)

echo "$(date '+%Y-%m-%d %H:%M:%S') keepalive osrm=$OSRM vroom=$VROOM" \
    | sudo tee -a /var/log/osrm-keepalive.log > /dev/null
EOF

sudo chmod +x /opt/scripts/osrm-keepalive.sh

# Adiciona ao cron se ainda nao tiver
if ! sudo crontab -l 2>/dev/null | grep -q "osrm-keepalive"; then
    (sudo crontab -l 2>/dev/null; echo "0 */6 * * * /opt/scripts/osrm-keepalive.sh") | sudo crontab -
    log "[2.9] Cron instalado (roda a cada 6h)."
else
    log "[2.9] Cron ja existe — pulando."
fi

# Rotacao de log
sudo tee /etc/logrotate.d/osrm-keepalive > /dev/null <<'EOF'
/var/log/osrm-keepalive.log {
  monthly
  rotate 6
  compress
  missingok
  notifempty
}
EOF

# -----------------------------------------------------------------
# CONCLUIDO
# -----------------------------------------------------------------
IP=$(curl -s ifconfig.me || echo "<descobrir-na-oracle-console>")

echo ""
echo "========================================================"
echo "  SETUP COMPLETO!"
echo "========================================================"
echo "  IP publico desta VM: $IP"
echo ""
echo "  Adicione no .env.local do projeto Next.js:"
echo "    OSRM_URL=http://$IP:5000"
echo "    VROOM_URL=http://$IP:3000"
echo ""
echo "  Conferir status:"
echo "    sudo docker compose -f ~/routing/docker-compose.yml ps"
echo "    sudo docker logs osrm"
echo "    sudo docker logs vroom"
echo ""
echo "  Testar do seu PC:"
echo "    curl 'http://$IP:5000/route/v1/driving/-46.6333,-23.5505;-47.0608,-22.9056?overview=false'"
echo "========================================================"
