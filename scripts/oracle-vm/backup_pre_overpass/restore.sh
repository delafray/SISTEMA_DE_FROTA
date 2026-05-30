#!/bin/bash
# ─────────────────────────────────────────────────────────────────────
# ROLLBACK do setup do Overpass — restaura VM ao estado pré-Overpass.
#
# O que faz:
# 1. Para o overpass.service
# 2. Remove o systemd unit
# 3. Apaga o diretório /home/ubuntu/overpass/
# 4. Fecha porta 12345 no iptables
# 5. VERIFICA que OSRM + VROOM continuam rodando
#
# Como rodar (no Windows local):
#   ssh -i C:\Users\ronal\.ssh\osrm-key.pem ubuntu@129.80.27.159 'sudo bash' < restore.sh
# ─────────────────────────────────────────────────────────────────────

set -e

echo "▶ Parando overpass.service..."
sudo systemctl stop overpass.service 2>/dev/null || echo "  (já estava parado ou nunca existiu)"
sudo systemctl disable overpass.service 2>/dev/null || true

echo "▶ Removendo unit file..."
sudo rm -f /etc/systemd/system/overpass.service
sudo systemctl daemon-reload

echo "▶ Apagando dados do Overpass..."
sudo rm -rf /home/ubuntu/overpass

echo "▶ Fechando porta 12345 no iptables..."
# Remove regra se existir (sem erro se já foi removida)
sudo iptables -D INPUT -p tcp --dport 12345 -j ACCEPT 2>/dev/null || true
# Persiste mudança
sudo netfilter-persistent save 2>/dev/null || sudo iptables-save > /etc/iptables/rules.v4 2>/dev/null || true

echo ""
echo "▶ Verificando OSRM + VROOM (esses NUNCA devem ser afetados):"
if systemctl is-active --quiet osrm.service; then
  echo "  ✅ osrm.service ATIVO"
else
  echo "  ❌ osrm.service NÃO ESTÁ RODANDO — execute: sudo systemctl start osrm.service"
fi
if systemctl is-active --quiet vroom.service; then
  echo "  ✅ vroom.service ATIVO"
else
  echo "  ❌ vroom.service NÃO ESTÁ RODANDO — execute: sudo systemctl start vroom.service"
fi

echo ""
echo "▶ Testando endpoints (devem retornar HTTP 200):"
curl -s -o /dev/null -w "  OSRM:5000 → HTTP %{http_code}\n" "http://localhost:5000/route/v1/driving/13.388860,52.517037;13.397634,52.529407?steps=false" || echo "  OSRM: SEM RESPOSTA"
curl -s -o /dev/null -w "  VROOM:3000 → HTTP %{http_code}\n" -X POST "http://localhost:3000" -H "Content-Type: application/json" -d '{"vehicles":[{"id":1,"start":[2.349014,48.864716],"end":[2.349014,48.864716]}],"jobs":[{"id":1,"location":[2.349014,48.864716]}]}' || echo "  VROOM: SEM RESPOSTA"

echo ""
echo "✅ Rollback concluído. VM restaurada ao estado pré-Overpass."
