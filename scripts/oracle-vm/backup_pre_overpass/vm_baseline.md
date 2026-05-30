# VM Baseline — antes do setup do Overpass

Snapshot tirado em 2026-05-30 às 01:27 UTC, VM `129.80.27.159`.

## Estado salvo
- `osrm.service` — systemd unit do OSRM (porta 5000)
- `vroom.service` — systemd unit do VROOM (porta 3000)
- `restore.sh` — script de restauração (rollback completo)

## Recursos disponíveis
- **Disco:** 28G usado de 146G — **118G livre**
- **RAM:** 23G total, 8.7G usado (OSRM ~8.3G) — **14G disponível**
- **Swap:** 8G total, 47M usado (folga total)

## Serviços rodando (TEM QUE CONTINUAR RODANDO!)
- `osrm.service` — porta 5000, PID 24327
- `vroom.service` — porta 3000, PID 32085

## Portas abertas no iptables
- 22 SSH
- 80 HTTP
- 3000 VROOM
- 5000 OSRM
- Vamos **abrir 12345** pro Overpass

## Diretórios em /home/ubuntu/
- `osrm-backend/` — código fonte (já compilado)
- `osrm-data/` — dados processados (brazil-latest.osrm)
- `vroom/` — código VROOM compilado
- `vroom-express/` — API wrapper
- Vamos criar `overpass/` ao lado

## Como rollback se algo der errado
```bash
ssh -i ~/.ssh/osrm-key.pem ubuntu@129.80.27.159 'sudo bash' < restore.sh
```

Script:
- Para o overpass.service
- Remove o unit file
- Apaga /home/ubuntu/overpass/
- Fecha porta 12345 no iptables
- Confirma que OSRM + VROOM continuam rodando
