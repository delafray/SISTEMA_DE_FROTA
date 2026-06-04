# OSRM + VROOM — Setup e Funcionamento

> 📎 Voltar ao [INDEX de Roteirização](INDEX.md) | [INDEX principal](../INDEX.md)
>
> Setup detalhado da VM: [ORACLE_CLOUD_SETUP.md](../../ORACLE_CLOUD_SETUP.md)
> Plano completo: [PLANO_ROTEIRIZACAO.md](../../PLANO_ROTEIRIZACAO.md)

---

## O que é

- **OSRM** (Open Source Routing Machine) — calcula rotas de carro (distância + tempo)
- **VROOM** — otimiza múltiplas entregas (Vehicle Routing Problem)

Ambos rodam na VM Oracle (grátis) via Docker.

---

## Arquitetura

```
Sistema → VROOM (porta 3000) → OSRM (porta 5000) → Resposta com rota otimizada
```

---

## Como usar no código

```typescript
import { estimarRota } from '@/lib/routing/estimarRota';

const resultado = await estimarRota({
  origem: { lat: -23.55, lng: -46.63 },
  destino: { lat: -22.90, lng: -43.17 },
});
// resultado.km_estimado, resultado.tempo_estimado_min
```

---

## Docker Compose na VM

```yaml
services:
  osrm:
    image: ghcr.io/project-osrm/osrm-backend
    restart: unless-stopped
    ports: ["5000:5000"]
    volumes: [~/osrm-data:/data]
    command: osrm-routed --algorithm mld --max-table-size 10000 /data/brazil-latest.osrm

  vroom:
    image: vroomvrp/vroom-docker:latest
    restart: unless-stopped
    ports: ["3000:3000"]
    environment:
      VROOM_ROUTER: osrm
      VROOM_HOST_osrmCar: osrm
      VROOM_PORT_osrmCar: 5000
    depends_on: [osrm]
```

---

## Keep-alive (evitar que Oracle recicle a VM)

```bash
# Cron a cada 6 horas
0 */6 * * * curl -s "http://localhost:5000/route/v1/driving/-46.6333,-23.5505;-46.6500,-23.5610?overview=false" > /dev/null
```

---

## Veja também

- [../03-deploy/oracle-cloud.md](../03-deploy/oracle-cloud.md) — specs da VM e portas
- [../02-apis-e-chaves/env-template.md](../02-apis-e-chaves/env-template.md) — OSRM_URL, VROOM_URL
