#!/bin/bash
# Fix: init_osm3s.sh nao aceita /dev/stdin. Materializa .osm.bz2 em disco.

set -euo pipefail

OVERPASS_DIR=/home/ubuntu/overpass
OVERPASS_DB=$OVERPASS_DIR/db
OVERPASS_PORT=12345
PBF=$OVERPASS_DIR/brazil-latest.osm.pbf
OSM_BZ2=$OVERPASS_DIR/brazil-latest.osm.bz2

log() { echo -e "\n▶ $1"; }
ok()  { echo "  ✅ $1"; }
fail() { echo "  ❌ $1" >&2; exit 1; }

verificar_osrm_vroom() {
  systemctl is-active --quiet osrm.service  || fail "OSRM caiu!"
  systemctl is-active --quiet vroom.service || fail "VROOM caiu!"
  ok "OSRM + VROOM intactos"
}

# ─── 4a. CONVERTER .pbf → .osm.bz2 ──────────────────────────────────

if [ ! -f $OSM_BZ2 ] && [ ! -f $OVERPASS_DB/nodes.bin ]; then
  log "4a. Convertendo .pbf → .osm.bz2 (osmium | bzip2, ~10-15min)"
  log "    Cria arquivo bz2 (~1GB) — disco temporario."
  nice -n 19 ionice -c3 bash -c \
    "osmium cat $PBF -f osm -o - | bzip2 -c > $OSM_BZ2"
  ok "Conversao OK: $(du -h $OSM_BZ2 | cut -f1)"
  rm -f $PBF
else
  ok ".osm.bz2 ja existe ou DB ja importado"
fi
verificar_osrm_vroom

# ─── 4b. IMPORTAR ───────────────────────────────────────────────────

if [ ! -f $OVERPASS_DB/nodes.bin ]; then
  log "4b. Importando .osm.bz2 → DB Overpass (~45-60min, intensivo)"
  log "    Acompanhe: tail -f $OVERPASS_DIR/import.log"
  mkdir -p $OVERPASS_DB
  nice -n 19 ionice -c3 \
    $OVERPASS_DIR/bin/init_osm3s.sh $OSM_BZ2 $OVERPASS_DB $OVERPASS_DIR \
    > $OVERPASS_DIR/import.log 2>&1
  ok "Import concluido. DB: $(du -sh $OVERPASS_DB | cut -f1)"
  rm -f $OSM_BZ2
else
  ok "DB ja importado"
fi
verificar_osrm_vroom

# ─── 5. SYSTEMD ──────────────────────────────────────────────────────

log "5. Configurando systemd"
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
systemctl is-active --quiet overpass.service && ok "overpass.service ATIVO" || fail "Nao subiu. journalctl -u overpass -n 50"
verificar_osrm_vroom

# ─── 6. IPTABLES ─────────────────────────────────────────────────────

log "6. Abrindo porta $OVERPASS_PORT"
if ! sudo iptables -C INPUT -p tcp --dport $OVERPASS_PORT -j ACCEPT 2>/dev/null; then
  sudo iptables -I INPUT 4 -p tcp --dport $OVERPASS_PORT -j ACCEPT
  sudo netfilter-persistent save 2>/dev/null || sudo iptables-save | sudo tee /etc/iptables/rules.v4 > /dev/null 2>&1 || true
  ok "Porta aberta"
else
  ok "Porta ja aberta"
fi

# ─── 7. TEST ─────────────────────────────────────────────────────────

log "7. Testando query"
sleep 2
RESP=$(curl -s -X POST "http://localhost:$OVERPASS_PORT/api/interpreter" \
  --data-urlencode 'data=[out:json][timeout:10];node[name="Belo Horizonte"][place=city];out 1;' \
  --max-time 15)

if echo "$RESP" | grep -q '"name":"Belo Horizonte"'; then
  ok "Overpass funcionando + dados do Brasil OK"
else
  fail "Sem resposta. Resp: $RESP"
fi

verificar_osrm_vroom

echo ""
echo "════════════════════════════════════════════════════════════════"
echo " ✅ SETUP COMPLETO"
echo "════════════════════════════════════════════════════════════════"
echo "  Overpass: http://129.80.27.159:$OVERPASS_PORT/api/interpreter"
echo "  ⚠️  Abrir porta $OVERPASS_PORT no Security List Oracle VCN!"
echo "════════════════════════════════════════════════════════════════"
