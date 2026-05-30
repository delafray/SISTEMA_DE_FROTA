#!/bin/bash
# ─────────────────────────────────────────────────────────────────────
# SETUP Overpass API (self-hosted) na VM Oracle.
#
# Estratégia ULTRA-SEGURA:
# - NUNCA toca em OSRM ou VROOM (services separados)
# - Roda em /home/ubuntu/overpass/ isolado
# - Porta 12345 (não conflita com nada existente)
# - Cada etapa valida antes de seguir
# - Pode re-rodar do zero sem problema (idempotente)
# - Em qualquer erro: para imediatamente
#
# Tempo total estimado: ~60-90 min
# - Compilar Overpass: ~15 min
# - Download Brazil extract (~2GB): ~5 min
# - Importar extract no DB Overpass: ~45-60 min (intensivo)
#
# Como rodar (no Windows local):
#   scp -i C:\Users\ronal\.ssh\osrm-key.pem ^
#       C:\Users\ronal\Documents\Antigravity\SISTEMA_DE_FROTA\scripts\oracle-vm\setup_overpass.sh ^
#       ubuntu@129.80.27.159:~/
#   ssh -i C:\Users\ronal\.ssh\osrm-key.pem ubuntu@129.80.27.159
#   chmod +x setup_overpass.sh && ./setup_overpass.sh
#
# Se algo der errado durante o setup:
#   ssh -i C:\Users\ronal\.ssh\osrm-key.pem ubuntu@129.80.27.159 \
#       'sudo bash' < scripts/oracle-vm/backup_pre_overpass/restore.sh
# ─────────────────────────────────────────────────────────────────────

set -euo pipefail

OVERPASS_DIR=/home/ubuntu/overpass
OVERPASS_DB=$OVERPASS_DIR/db
OVERPASS_PORT=12345
EXTRACT_URL=https://download.geofabrik.de/south-america/brazil-latest.osm.bz2
EXTRACT_FILE=$OVERPASS_DIR/brazil-latest.osm.bz2

# ─── HELPERS ─────────────────────────────────────────────────────────

log() { echo -e "\n▶ $1"; }
ok()  { echo "  ✅ $1"; }
fail() { echo "  ❌ $1" >&2; exit 1; }

verificar_osrm_vroom() {
  log "Confirmando que OSRM + VROOM continuam intactos"
  systemctl is-active --quiet osrm.service  || fail "OSRM caiu! Abortar e investigar."
  systemctl is-active --quiet vroom.service || fail "VROOM caiu! Abortar e investigar."
  ok "OSRM ainda rodando"
  ok "VROOM ainda rodando"
}

# ─── 0. PRE-CHECKS ───────────────────────────────────────────────────

log "0. Pre-checks do ambiente"
[ "$(id -u)" -eq 0 ] && fail "NÃO rode como root. Roda como ubuntu, ele chama sudo quando precisar."
[ -d /home/ubuntu/osrm-data ]   || fail "OSRM não encontrado — script é só pra VM que já tem OSRM."
[ -d /home/ubuntu/vroom-express ] || fail "VROOM não encontrado — script é só pra VM que já tem VROOM."
verificar_osrm_vroom

# Disco: precisa de ~30G livre
DISCO_FREE_GB=$(df -BG / | awk 'NR==2 {gsub("G","",$4); print $4}')
[ "$DISCO_FREE_GB" -lt 30 ] && fail "Disco insuficiente. Precisa 30G, tem ${DISCO_FREE_GB}G."
ok "Disco OK (${DISCO_FREE_GB}G livre)"

# RAM: precisa de ~8G livre
RAM_FREE_GB=$(free -g | awk 'NR==2 {print $7}')
[ "$RAM_FREE_GB" -lt 6 ] && fail "RAM disponível baixa (${RAM_FREE_GB}G). Precisa ~8G."
ok "RAM OK (${RAM_FREE_GB}G disponível)"

# ─── 1. INSTALL DEPENDENCIES ─────────────────────────────────────────

log "1. Instalando dependências (apt)"
sudo apt-get update -qq
sudo apt-get install -y -qq \
  build-essential \
  expat \
  libexpat1-dev \
  zlib1g-dev \
  liblz4-dev \
  pyosmium \
  osmium-tool \
  curl
ok "Dependências instaladas"
verificar_osrm_vroom

# ─── 2. CLONE + COMPILE OVERPASS ─────────────────────────────────────

mkdir -p $OVERPASS_DIR
cd $OVERPASS_DIR

if [ ! -f $OVERPASS_DIR/bin/osm3s_query ]; then
  log "2. Baixando + compilando Overpass API (~15min)"
  curl -fLs https://dev.overpass-api.de/releases/osm-3s_v0.7.62.1.tar.gz -o overpass.tar.gz
  tar xzf overpass.tar.gz
  cd osm-3s_v0.7.62.1
  ./configure --prefix=$OVERPASS_DIR --enable-lz4
  # Limita paralelismo pra nao matar OSRM/VROOM rodando
  nice -n 19 make -j2
  make install
  cd $OVERPASS_DIR
  rm -rf osm-3s_v0.7.62.1 overpass.tar.gz
  ok "Overpass compilado e instalado em $OVERPASS_DIR/bin/"
else
  ok "Overpass já compilado (pulando)"
fi
verificar_osrm_vroom

# ─── 3. DOWNLOAD BRAZIL EXTRACT ──────────────────────────────────────

if [ ! -f $EXTRACT_FILE ] && [ ! -d $OVERPASS_DB ]; then
  log "3. Baixando extract do Brasil (~2GB, ~5min)"
  curl -fL --progress-bar -o $EXTRACT_FILE $EXTRACT_URL
  ok "Extract baixado: $(du -h $EXTRACT_FILE | cut -f1)"
else
  ok "Extract já baixado (ou DB já importado)"
fi

# ─── 4. IMPORTAR EXTRACT PRO DB OVERPASS ─────────────────────────────

if [ ! -f $OVERPASS_DB/nodes.bin ]; then
  log "4. Importando extract pro DB Overpass (~45-60min, intensivo)"
  log "   Durante este passo OSRM/VROOM podem ficar levemente mais lentos."
  log "   Pode acompanhar em outro terminal:  tail -f $OVERPASS_DIR/import.log"
  mkdir -p $OVERPASS_DB
  bzcat $EXTRACT_FILE | nice -n 19 ionice -c3 \
    $OVERPASS_DIR/bin/init_osm3s.sh /dev/stdin $OVERPASS_DB $OVERPASS_DIR \
    2>&1 | tee $OVERPASS_DIR/import.log | tail -5
  rm -f $EXTRACT_FILE
  ok "Import concluído. DB ocupa: $(du -sh $OVERPASS_DB | cut -f1)"
else
  ok "DB Overpass já importado (pulando)"
fi
verificar_osrm_vroom

# ─── 5. SYSTEMD SERVICE ──────────────────────────────────────────────

log "5. Configurando systemd service (porta $OVERPASS_PORT)"

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
# Nice +5 pra OSRM/VROOM terem prioridade
Nice=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable overpass.service
sudo systemctl start overpass.service
sleep 3
systemctl is-active --quiet overpass.service && ok "overpass.service ATIVO" || fail "overpass.service não subiu — veja: sudo journalctl -u overpass -n 50"
verificar_osrm_vroom

# ─── 6. ABRIR PORTA NO IPTABLES ──────────────────────────────────────

log "6. Abrindo porta $OVERPASS_PORT no iptables"
if ! sudo iptables -C INPUT -p tcp --dport $OVERPASS_PORT -j ACCEPT 2>/dev/null; then
  # Insere ANTES da regra REJECT (linha 7 ou 8)
  sudo iptables -I INPUT 4 -p tcp --dport $OVERPASS_PORT -j ACCEPT
  sudo netfilter-persistent save 2>/dev/null || sudo iptables-save | sudo tee /etc/iptables/rules.v4 > /dev/null 2>&1 || true
  ok "Porta $OVERPASS_PORT aberta"
else
  ok "Porta $OVERPASS_PORT já estava aberta"
fi

# Lembre Oracle Console: precisa abrir tambem na Security List da VCN!
echo ""
echo "⚠️  IMPORTANTE: Abrir porta $OVERPASS_PORT na Security List do Oracle Cloud:"
echo "   Networking → VCN → Security Lists → Add Ingress Rule"
echo "   Source 0.0.0.0/0, TCP, Port $OVERPASS_PORT"

# ─── 7. TESTE DE QUERY ───────────────────────────────────────────────

log "7. Testando query no Overpass"
sleep 2
RESP=$(curl -s -X POST "http://localhost:$OVERPASS_PORT/api/interpreter" \
  --data-urlencode 'data=[out:json][timeout:10];node[name="Belo Horizonte"][place=city];out 1;' \
  --max-time 15)

if echo "$RESP" | grep -q '"name":"Belo Horizonte"'; then
  ok "Overpass respondendo + DB tem dados (achou Belo Horizonte)"
else
  fail "Overpass respondeu mas sem dados esperados. Verifique: sudo journalctl -u overpass -n 50. Resposta: $RESP"
fi

# ─── 8. FINAL ────────────────────────────────────────────────────────

verificar_osrm_vroom

echo ""
echo "════════════════════════════════════════════════════════════════"
echo " ✅ SETUP COMPLETO"
echo "════════════════════════════════════════════════════════════════"
echo "  Overpass API: http://129.80.27.159:$OVERPASS_PORT/api/interpreter"
echo "  OSRM:         http://129.80.27.159:5000 (intacto)"
echo "  VROOM:        http://129.80.27.159:3000 (intacto)"
echo ""
echo "  PRÓXIMO PASSO no app:"
echo "  Adicionar no .env.local:"
echo "    OVERPASS_URL=http://129.80.27.159:$OVERPASS_PORT/api/interpreter"
echo ""
echo "  Pra rollback completo (se quiser desfazer):"
echo "    sudo bash < scripts/oracle-vm/backup_pre_overpass/restore.sh"
echo "════════════════════════════════════════════════════════════════"
