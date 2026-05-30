#!/bin/bash
# Completa o setup: nginx + fcgiwrap pra expor Overpass CGI via HTTP porta 12345.

set -euo pipefail

OVERPASS_DIR=/home/ubuntu/overpass
OVERPASS_PORT=12345

log() { echo -e "\n▶ $1"; }
ok()  { echo "  ✅ $1"; }
fail() { echo "  ❌ $1" >&2; exit 1; }

verificar_osrm_vroom() {
  systemctl is-active --quiet osrm.service  || fail "OSRM caiu!"
  systemctl is-active --quiet vroom.service || fail "VROOM caiu!"
  ok "OSRM + VROOM intactos"
}

log "1. Instalando nginx + fcgiwrap"
sudo apt-get install -y -qq nginx fcgiwrap
ok "nginx + fcgiwrap instalados"
verificar_osrm_vroom

log "2. Garantindo que fcgiwrap esta rodando"
sudo systemctl enable --now fcgiwrap
ok "fcgiwrap ativo"

log "3. Configurando nginx pra porta $OVERPASS_PORT"

sudo tee /etc/nginx/sites-available/overpass > /dev/null <<EOF
server {
    listen $OVERPASS_PORT default_server;
    listen [::]:$OVERPASS_PORT default_server;
    server_name _;
    root $OVERPASS_DIR/html;

    # Variavel de ambiente que o CGI do Overpass precisa
    fastcgi_param OVERPASS_DB_DIR $OVERPASS_DIR/db/;

    # Rota da API
    location /api/ {
        # Remove /api/ do prefixo, manda pra cgi-bin
        rewrite ^/api/(.*) /\$1 break;
        fastcgi_pass unix:/var/run/fcgiwrap.socket;
        fastcgi_param SCRIPT_FILENAME $OVERPASS_DIR/cgi-bin/\$uri;
        include fastcgi_params;
        fastcgi_param OVERPASS_DB_DIR $OVERPASS_DIR/db/;
        # Aumenta timeout pra queries longas (default 60s)
        fastcgi_read_timeout 120s;
    }

    location / {
        return 200 "Overpass API self-hosted. Use /api/interpreter\n";
        add_header Content-Type text/plain;
    }
}
EOF

# Ativa o site, remove o default
sudo ln -sf /etc/nginx/sites-available/overpass /etc/nginx/sites-enabled/overpass
sudo rm -f /etc/nginx/sites-enabled/default

ok "nginx config criada"

log "4. Verificando + recarregando nginx"
sudo nginx -t
sudo systemctl reload nginx
sudo systemctl enable nginx
ok "nginx OK"
verificar_osrm_vroom

log "5. Garantindo que fcgiwrap pode ler db e cgi-bin"
sudo usermod -a -G ubuntu www-data 2>/dev/null || true
sudo chmod 755 /home/ubuntu
sudo chmod -R o+r $OVERPASS_DIR/db
sudo chmod -R o+r $OVERPASS_DIR/cgi-bin
sudo chmod o+x $OVERPASS_DIR/cgi-bin
ok "permissoes ajustadas"

log "6. Testando query (Belo Horizonte)"
sleep 2
RESP=$(curl -s -X POST "http://localhost:$OVERPASS_PORT/api/interpreter" \
  --data-urlencode 'data=[out:json][timeout:10];node[name="Belo Horizonte"][place=city];out 1;' \
  --max-time 30)

echo "RESPOSTA (primeiras 300 chars):"
echo "${RESP:0:300}"
echo ""

if echo "$RESP" | grep -q '"name":"Belo Horizonte"'; then
  ok "Overpass HTTP FUNCIONANDO + dados OK"
else
  fail "Sem resposta esperada — verificar logs: sudo journalctl -u nginx -u fcgiwrap -n 30"
fi

verificar_osrm_vroom

echo ""
echo "═══════════════════════════════════════════════"
echo " ✅ OVERPASS HTTP PRONTO"
echo "═══════════════════════════════════════════════"
echo "  http://129.80.27.159:$OVERPASS_PORT/api/interpreter"
echo "  ⚠️  Abrir porta $OVERPASS_PORT no Security List Oracle VCN!"
echo "═══════════════════════════════════════════════"
