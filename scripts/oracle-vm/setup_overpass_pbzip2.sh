#!/bin/bash
# Reinicia conversao usando pbzip2 (paralelo) em vez de bzip2 (lento single-thread).

set -euo pipefail

OVERPASS_DIR=/home/ubuntu/overpass
OVERPASS_DB=$OVERPASS_DIR/db
OVERPASS_PORT=12345
PBF=$OVERPASS_DIR/brazil-latest.osm.pbf
OSM_BZ2=$OVERPASS_DIR/brazil-latest.osm.bz2
EXTRACT_URL=https://download.geofabrik.de/south-america/brazil-latest.osm.pbf

log() { echo -e "\n▶ $1"; }
ok()  { echo "  ✅ $1"; }
fail() { echo "  ❌ $1" >&2; exit 1; }

verificar_osrm_vroom() {
  systemctl is-active --quiet osrm.service  || fail "OSRM caiu!"
  systemctl is-active --quiet vroom.service || fail "VROOM caiu!"
  ok "OSRM + VROOM intactos"
}

# ─── PRE: instala pbzip2 ────────────────────────────────────────────

log "0. Instalando pbzip2 (paralelo)"
if ! command -v pbzip2 > /dev/null; then
  sudo apt-get install -y -qq pbzip2
fi
ok "pbzip2 disponivel"
verificar_osrm_vroom

# ─── 4a. RECRIAR .osm.bz2 COM PBZIP2 ────────────────────────────────

if [ ! -f $OVERPASS_DB/nodes.bin ]; then
  # Re-download do pbf se foi apagado pelo script anterior
  if [ ! -f $PBF ]; then
    log "1. Re-baixando pbf (foi apagado no run anterior)"
    curl -fL --progress-bar -o $PBF $EXTRACT_URL
    ok "Pbf: $(du -h $PBF | cut -f1)"
  else
    ok "Pbf ja existe"
  fi

  # Apaga bz2 parcial
  rm -f $OSM_BZ2

  log "4a. Convertendo .pbf -> .osm.bz2 com PBZIP2 (4 cores, ~15min)"
  log "    pbzip2 -p4: usa 4 threads. Output 100% compativel com bzip2."
  nice -n 19 ionice -c3 bash -c \
    "osmium cat $PBF -f osm -o - | pbzip2 -p4 -c > $OSM_BZ2"
  ok "Conversao OK: $(du -h $OSM_BZ2 | cut -f1)"
  rm -f $PBF
fi
verificar_osrm_vroom

# ─── 4b. IMPORT ─────────────────────────────────────────────────────

if [ ! -f $OVERPASS_DB/nodes.bin ]; then
  log "4b. Importando .osm.bz2 -> DB Overpass (~45-60min)"
  mkdir -p $OVERPASS_DB
  nice -n 19 ionice -c3 \
    $OVERPASS_DIR/bin/init_osm3s.sh $OSM_BZ2 $OVERPASS_DB $OVERPASS_DIR \
    > $OVERPASS_DIR/import.log 2>&1
  ok "Import OK: $(du -sh $OVERPASS_DB | cut -f1)"
  rm -f $OSM_BZ2
else
  ok "DB ja importado"
fi
verificar_osrm_vroom

# ─── 5. SYSTEMD ──────────────────────────────────────────────────────

log "5. Systemd"
sudo tee /etc/systemd/system/overpass.service > /dev/null <<EOF
[Unit]
Description=Overpass API (self-hosted, Brazil)
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=$OVERPASS_DIR
ExecStart=$OVERPASS_DIR/bin/dispatcher --osm-base --db-dir=$OVERPASS_DB
Restart=always
RestartSec=10
Nice=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable overpass.service
sudo systemctl start overpass.service
sleep 3
systemctl is-active --quiet overpass.service && ok "overpass ATIVO" || fail "Nao subiu: journalctl -u overpass -n 50"
verificar_osrm_vroom

# ─── 6. IPTABLES ─────────────────────────────────────────────────────

log "6. Porta $OVERPASS_PORT"
if ! sudo iptables -C INPUT -p tcp --dport $OVERPASS_PORT -j ACCEPT 2>/dev/null; then
  sudo iptables -I INPUT 4 -p tcp --dport $OVERPASS_PORT -j ACCEPT
  sudo netfilter-persistent save 2>/dev/null || sudo iptables-save | sudo tee /etc/iptables/rules.v4 > /dev/null 2>&1 || true
  ok "Aberta"
else
  ok "Ja aberta"
fi

# ─── 7. TEST ─────────────────────────────────────────────────────────

log "7. Teste"
sleep 2
RESP=$(curl -s -X POST "http://localhost:$OVERPASS_PORT/api/interpreter" \
  --data-urlencode 'data=[out:json][timeout:10];node[name="Belo Horizonte"][place=city];out 1;' \
  --max-time 15)
echo "$RESP" | grep -q '"name":"Belo Horizonte"' && ok "FUNCIONANDO" || fail "Sem resposta: $RESP"

verificar_osrm_vroom

echo ""
echo "════════════════════════════════════════════════════════════════"
echo " ✅ OVERPASS PRONTO"
echo "════════════════════════════════════════════════════════════════"
echo "  http://129.80.27.159:$OVERPASS_PORT/api/interpreter"
echo "════════════════════════════════════════════════════════════════"
