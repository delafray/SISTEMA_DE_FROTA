#!/bin/bash
# Continuação do setup do Overpass após falha no download.
# Geofabrik agora só serve .pbf — convertemos pra .osm com osmium.

set -euo pipefail

OVERPASS_DIR=/home/ubuntu/overpass
OVERPASS_DB=$OVERPASS_DIR/db
OVERPASS_PORT=12345
EXTRACT_URL=https://download.geofabrik.de/south-america/brazil-latest.osm.pbf
EXTRACT_FILE=$OVERPASS_DIR/brazil-latest.osm.pbf

log() { echo -e "\n▶ $1"; }
ok()  { echo "  ✅ $1"; }
fail() { echo "  ❌ $1" >&2; exit 1; }

verificar_osrm_vroom() {
  systemctl is-active --quiet osrm.service  || fail "OSRM caiu! Abortar."
  systemctl is-active --quiet vroom.service || fail "VROOM caiu! Abortar."
  ok "OSRM + VROOM intactos"
}

# ─── 3. DOWNLOAD .PBF ───────────────────────────────────────────────

if [ ! -f $EXTRACT_FILE ] && [ ! -f $OVERPASS_DB/nodes.bin ]; then
  log "3. Baixando extract Brasil .pbf (~500MB, ~3min)"
  curl -fL --progress-bar -o $EXTRACT_FILE $EXTRACT_URL
  ok "Extract baixado: $(du -h $EXTRACT_FILE | cut -f1)"
else
  ok "Extract já baixado ou DB já importado"
fi
verificar_osrm_vroom

# ─── 4. IMPORT VIA PIPE OSMIUM → INIT_OSM3S ─────────────────────────

if [ ! -f $OVERPASS_DB/nodes.bin ]; then
  log "4. Importando .pbf → DB Overpass (~45-60min, intensivo)"
  log "   osmium converte .pbf pra .osm em streaming, init_osm3s consome direto"
  log "   Acompanhe em outro terminal: tail -f $OVERPASS_DIR/import.log"
  mkdir -p $OVERPASS_DB
  # Pipe direto: osmium → init_osm3s. Não materializa o .osm (5GB) em disco.
  nice -n 19 ionice -c3 bash -c "osmium cat $EXTRACT_FILE -f osm -o - | \
    $OVERPASS_DIR/bin/init_osm3s.sh /dev/stdin $OVERPASS_DB $OVERPASS_DIR" \
    > $OVERPASS_DIR/import.log 2>&1
  rm -f $EXTRACT_FILE
  ok "Import concluído. DB ocupa: $(du -sh $OVERPASS_DB | cut -f1)"
else
  ok "DB já importado"
fi
verificar_osrm_vroom

# ─── 5. SYSTEMD ──────────────────────────────────────────────────────

log "5. Configurando systemd service"

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
systemctl is-active --quiet overpass.service && ok "overpass.service ATIVO" || fail "overpass.service não subiu: sudo journalctl -u overpass -n 50"
verificar_osrm_vroom

# ─── 6. IPTABLES ─────────────────────────────────────────────────────

log "6. Abrindo porta $OVERPASS_PORT"
if ! sudo iptables -C INPUT -p tcp --dport $OVERPASS_PORT -j ACCEPT 2>/dev/null; then
  sudo iptables -I INPUT 4 -p tcp --dport $OVERPASS_PORT -j ACCEPT
  sudo netfilter-persistent save 2>/dev/null || sudo iptables-save | sudo tee /etc/iptables/rules.v4 > /dev/null 2>&1 || true
  ok "Porta $OVERPASS_PORT aberta"
else
  ok "Porta já aberta"
fi

# ─── 7. TEST ─────────────────────────────────────────────────────────

log "7. Testando query Overpass"
sleep 2
RESP=$(curl -s -X POST "http://localhost:$OVERPASS_PORT/api/interpreter" \
  --data-urlencode 'data=[out:json][timeout:10];node[name="Belo Horizonte"][place=city];out 1;' \
  --max-time 15)

if echo "$RESP" | grep -q '"name":"Belo Horizonte"'; then
  ok "Overpass funcionando + dados do Brasil carregados"
else
  fail "Sem resposta esperada. journalctl -u overpass. Resp: $RESP"
fi

verificar_osrm_vroom

echo ""
echo "════════════════════════════════════════════════════════════════"
echo " ✅ SETUP COMPLETO"
echo "════════════════════════════════════════════════════════════════"
echo "  Overpass: http://129.80.27.159:$OVERPASS_PORT/api/interpreter"
echo "  OSRM:     http://129.80.27.159:5000 (intacto)"
echo "  VROOM:    http://129.80.27.159:3000 (intacto)"
echo "  ⚠️  Abrir porta $OVERPASS_PORT no Security List Oracle VCN!"
echo "════════════════════════════════════════════════════════════════"
