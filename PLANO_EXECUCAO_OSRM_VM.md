# Plano de Execução — Instalação OSRM + VROOM na VM Oracle Cloud

## Dados da VM
- **IP Público:** 129.80.27.159
- **Chave SSH:** C:\Users\ronal\.ssh\osrm-key.pem
- **Usuário:** ubuntu
- **SO:** Ubuntu 22.04 ARM
- **Specs:** 4 OCPU, 24GB RAM, 200GB disco

## ⚠️ Instrução para a IA que executar este plano

Execute CADA passo abaixo em ordem. Antes de avançar para o próximo:
1. Confirme que o comando anterior retornou sucesso
2. Se houver erro, PARE e reporte imediatamente
3. Não pule etapas, não assuma que funcionou sem validar
4. Ao final, gere o relatório no formato especificado no fim deste arquivo

---

## PASSO 1 — Conectar via SSH e validar acesso

```bash
ssh -i C:\Users\ronal\.ssh\osrm-key.pem ubuntu@129.80.27.159 -o StrictHostKeyChecking=no "echo 'SSH OK' && uname -a && df -h / && free -h"
```

**Validação esperada:**
- `SSH OK`
- Kernel ARM (aarch64)
- Disco com ~200GB disponível
- ~24GB de RAM

---

## PASSO 2 — Atualizar o sistema

```bash
ssh -i C:\Users\ronal\.ssh\osrm-key.pem ubuntu@129.80.27.159 "sudo apt update && sudo apt upgrade -y && echo 'UPDATE OK'"
```

**Validação esperada:** `UPDATE OK` no final

---

## PASSO 3 — Instalar Docker

```bash
ssh -i C:\Users\ronal\.ssh\osrm-key.pem ubuntu@129.80.27.159 "curl -fsSL https://get.docker.com | sudo bash && sudo usermod -aG docker ubuntu && echo 'DOCKER INSTALADO'"
```

**Validação:**
```bash
ssh -i C:\Users\ronal\.ssh\osrm-key.pem ubuntu@129.80.27.159 "docker --version && echo 'DOCKER OK'"
```

---

## PASSO 4 — Instalar Docker Compose

```bash
ssh -i C:\Users\ronal\.ssh\osrm-key.pem ubuntu@129.80.27.159 "sudo apt install -y docker-compose-plugin && docker compose version && echo 'COMPOSE OK'"
```

---

## PASSO 5 — Criar estrutura de diretórios

```bash
ssh -i C:\Users\ronal\.ssh\osrm-key.pem ubuntu@129.80.27.159 "mkdir -p ~/osrm-data ~/routing && echo 'DIRS OK'"
```

---

## PASSO 6 — Baixar mapa do Brasil (~3.5GB)

> ⚠️ Este passo pode demorar 5-15 minutos dependendo da velocidade da VM.
> Use `nohup` para não perder o download se a conexão cair.

```bash
ssh -i C:\Users\ronal\.ssh\osrm-key.pem ubuntu@129.80.27.159 "cd ~/osrm-data && wget -c https://download.geofabrik.de/south-america/brazil-latest.osm.pbf -O brazil-latest.osm.pbf && ls -lh brazil-latest.osm.pbf && echo 'DOWNLOAD OK'"
```

**Validação esperada:** arquivo `brazil-latest.osm.pbf` com ~3-4GB

---

## PASSO 7 — Processar mapa (OSRM Extract)

> ⚠️ Este passo usa muita RAM (~20GB) e leva 20-60 minutos.
> Use `nohup` e aguarde.

```bash
ssh -i C:\Users\ronal\.ssh\osrm-key.pem ubuntu@129.80.27.159 "cd ~/osrm-data && docker run --rm -t -v \"\${PWD}:/data\" ghcr.io/project-osrm/osrm-backend osrm-extract -p /opt/car.lua /data/brazil-latest.osm.pbf && echo 'EXTRACT OK'"
```

---

## PASSO 8 — Processar mapa (OSRM Partition)

```bash
ssh -i C:\Users\ronal\.ssh\osrm-key.pem ubuntu@129.80.27.159 "cd ~/osrm-data && docker run --rm -t -v \"\${PWD}:/data\" ghcr.io/project-osrm/osrm-backend osrm-partition /data/brazil-latest.osrm && echo 'PARTITION OK'"
```

---

## PASSO 9 — Processar mapa (OSRM Customize)

```bash
ssh -i C:\Users\ronal\.ssh\osrm-key.pem ubuntu@129.80.27.159 "cd ~/osrm-data && docker run --rm -t -v \"\${PWD}:/data\" ghcr.io/project-osrm/osrm-backend osrm-customize /data/brazil-latest.osrm && echo 'CUSTOMIZE OK'"
```

**Validação após os 3 passos:**
```bash
ssh -i C:\Users\ronal\.ssh\osrm-key.pem ubuntu@129.80.27.159 "ls -lh ~/osrm-data/ && df -h /"
```
Deve ter vários arquivos `.osrm.*` e disco com pelo menos 20GB livres.

---

## PASSO 10 — Criar docker-compose.yml

```bash
ssh -i C:\Users\ronal\.ssh\osrm-key.pem ubuntu@129.80.27.159 "cat > ~/routing/docker-compose.yml << 'EOF'
services:
  osrm:
    image: ghcr.io/project-osrm/osrm-backend
    container_name: osrm
    restart: unless-stopped
    ports:
      - \"5000:5000\"
    volumes:
      - /home/ubuntu/osrm-data:/data
    command: osrm-routed --algorithm mld --max-table-size 10000 /data/brazil-latest.osrm

  vroom:
    image: vroomvrp/vroom-docker:latest
    container_name: vroom
    restart: unless-stopped
    ports:
      - \"3000:3000\"
    environment:
      - VROOM_ROUTER=osrm
      - VROOM_HOST_osrmCar=osrm
      - VROOM_PORT_osrmCar=5000
    depends_on:
      - osrm
EOF
echo 'COMPOSE FILE OK'"
```

---

## PASSO 11 — Subir OSRM + VROOM

```bash
ssh -i C:\Users\ronal\.ssh\osrm-key.pem ubuntu@129.80.27.159 "cd ~/routing && docker compose up -d && sleep 10 && docker compose ps && echo 'CONTAINERS OK'"
```

**Validação esperada:** ambos containers com status `running`

---

## PASSO 12 — Testar OSRM

```bash
ssh -i C:\Users\ronal\.ssh\osrm-key.pem ubuntu@129.80.27.159 "curl -s 'http://localhost:5000/route/v1/driving/-46.6333,-23.5505;-47.0608,-22.9056?overview=false' | python3 -c \"import sys,json; d=json.load(sys.stdin); print('OSRM OK - distancia:', d['routes'][0]['distance'], 'm')\""
```

**Validação esperada:** `OSRM OK - distancia: XXXXX m`

---

## PASSO 13 — Testar VROOM

```bash
ssh -i C:\Users\ronal\.ssh\osrm-key.pem ubuntu@129.80.27.159 "curl -s -X POST http://localhost:3000 -H 'Content-Type: application/json' -d '{\"vehicles\":[{\"id\":1,\"start\":[-46.63,-23.55],\"end\":[-46.63,-23.55]}],\"jobs\":[{\"id\":1,\"location\":[-46.65,-23.56]},{\"id\":2,\"location\":[-46.70,-23.58]}]}' | python3 -c \"import sys,json; d=json.load(sys.stdin); print('VROOM OK - rotas:', len(d.get('routes',[])))\" && echo 'VROOM FUNCIONANDO'"
```

---

## PASSO 14 — Configurar firewall interno da VM

```bash
ssh -i C:\Users\ronal\.ssh\osrm-key.pem ubuntu@129.80.27.159 "sudo iptables -I INPUT -p tcp --dport 5000 -j ACCEPT && sudo iptables -I INPUT -p tcp --dport 3000 -j ACCEPT && sudo apt install -y iptables-persistent && sudo netfilter-persistent save && echo 'FIREWALL OK'"
```

---

## PASSO 15 — Configurar keep-alive (evitar Oracle recuperar a VM)

```bash
ssh -i C:\Users\ronal\.ssh\osrm-key.pem ubuntu@129.80.27.159 "sudo tee /opt/keepalive.sh > /dev/null << 'EOF'
#!/bin/bash
curl -s \"http://localhost:5000/route/v1/driving/-46.6333,-23.5505;-46.6500,-23.5610?overview=false\" > /dev/null
echo \"\$(date '+%Y-%m-%d %H:%M:%S') keepalive OK\" >> /var/log/osrm-keepalive.log
EOF
sudo chmod +x /opt/keepalive.sh && (sudo crontab -l 2>/dev/null; echo '0 */6 * * * /opt/keepalive.sh') | sudo crontab - && echo 'KEEPALIVE OK'"
```

---

## PASSO 16 — Teste final externo (do computador local)

```bash
curl "http://129.80.27.159:5000/route/v1/driving/-46.6333,-23.5505;-47.0608,-22.9056?overview=false"
```

> ⚠️ Se não responder: as portas 5000 e 3000 precisam ser abertas no firewall da Oracle Cloud (Security List).
> Console Oracle → Networking → VCN → Security Lists → Add Ingress Rule → TCP 5000 e 3000, origem 0.0.0.0/0

---

## ✅ FORMATO DO RELATÓRIO FINAL

Ao terminar todos os passos, gere um relatório neste formato exato:

```
=== RELATÓRIO DE INSTALAÇÃO OSRM/VROOM ===
Data: [data/hora]

INFRAESTRUTURA:
- IP da VM: 129.80.27.159
- Disco usado: X GB de 200 GB
- RAM disponível: X GB

SERVIÇOS:
- OSRM: [OK / FALHOU] - [mensagem]
- VROOM: [OK / FALHOU] - [mensagem]
- Keep-alive: [OK / FALHOU]

TESTES:
- Rota SP→Campinas: [OK - Xkm em Ymin / FALHOU]
- Otimização VROOM: [OK - X rotas / FALHOU]
- Acesso externo porta 5000: [OK / BLOQUEADO - abrir Security List]
- Acesso externo porta 3000: [OK / BLOQUEADO - abrir Security List]

VARIÁVEIS PARA CONFIGURAR NA VERCEL:
OSRM_URL=http://129.80.27.159:5000
VROOM_URL=http://129.80.27.159:3000

STATUS FINAL: [COMPLETO / PARCIAL / FALHOU]
PRÓXIMOS PASSOS: [liste o que falta fazer]
===
```
