# Scripts de provisionamento da Oracle VM (OSRM + VROOM)

Scripts pra automatizar ETAPA 2.3-2.9 do `PLANO_ROTEIRIZACAO.md`.

## `setup_osrm.sh`

Faz tudo de uma vez: instala Docker, baixa mapa do Brasil, processa OSRM (3 etapas), sobe containers OSRM+VROOM, configura keep-alive cron.

**Quando rodar:** assim que o `criar_vm_osrm.ps1` conseguir provisionar a VM e você tiver o IP público.

**Como rodar:**

```bash
# 1. Conectar na VM (substitua <IP>):
ssh -i ~/.ssh/osrm-key.pem ubuntu@<IP>

# 2. Copiar o script pra VM (do seu PC, num PowerShell separado):
scp -i C:\Users\ronal\.ssh\osrm-key.pem `
    C:\Users\ronal\Documents\Antigravity\SISTEMA_DE_FROTA\scripts\oracle-vm\setup_osrm.sh `
    ubuntu@<IP>:~/

# 3. Na VM (via SSH), rodar:
chmod +x setup_osrm.sh
./setup_osrm.sh
```

**Duracao:** ~30-90 minutos (a maior parte e o processamento OSRM, usa ate 24GB RAM).

**Ao terminar:** script mostra o IP publico e as URLs pra colocar no `.env.local`:

```env
OSRM_URL=http://<IP>:5000
VROOM_URL=http://<IP>:3000
```

## Antes de rodar o setup

Verifique no painel Oracle Cloud que **portas 5000 e 3000 estao liberadas** na Security List da VCN (ETAPA 2.2 do plano):

1. Console Oracle → Networking → Virtual Cloud Networks
2. Sua VCN → Security Lists → Default Security List
3. Add Ingress Rules:
   - Porta 5000 TCP, Source 0.0.0.0/0
   - Porta 3000 TCP, Source 0.0.0.0/0

Sem isso, OSRM/VROOM ficam rodando na VM mas inacessiveis de fora.

## Conferir status depois do setup

Na VM via SSH:

```bash
# Containers rodando?
sudo docker compose -f ~/routing/docker-compose.yml ps

# Logs em tempo real:
sudo docker logs -f osrm
sudo docker logs -f vroom

# Keep-alive funcionando?
tail /var/log/osrm-keepalive.log
```

Do seu PC:

```bash
curl "http://<IP-DA-VM>:5000/route/v1/driving/-46.6333,-23.5505;-47.0608,-22.9056?overview=false"
```

Deve retornar JSON com a rota.

## Atualizar o mapa (recomendado 1x/mes)

O Geofabrik atualiza o mapa do Brasil diariamente. Pra ter ruas novas:

```bash
cd ~/osrm-data
mv brazil-latest.osm.pbf brazil-old.osm.pbf
wget https://download.geofabrik.de/south-america/brazil-latest.osm.pbf
# Re-processar (delete .osrm files pra forcar):
rm brazil-latest.osrm*
# Rodar setup_osrm.sh de novo (ele detecta e so re-processa)
```

Durante o re-processamento (~30-90min), o OSRM continua rodando com o mapa antigo. **Zero downtime.**
