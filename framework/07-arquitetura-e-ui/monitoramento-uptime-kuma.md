# 📡 Monitoramento — Uptime Kuma + Badge de Status

## O que é

**Uptime Kuma** é um dashboard de monitoramento open-source (auto-hospedado em Docker).
Ele verifica a cada 60 segundos se cada serviço está respondendo e exibe semáforos verde/vermelho.

Instalado na **Oracle Cloud VM** (mesma que roda Evolution API e OSRM/VROOM).

---

## Acesso

| Recurso | URL |
|---|---|
| Dashboard Uptime Kuma | `http://129.80.27.159:3001` |
| Badge na Sidebar do sistema | Sidebar → rodapé (acima do "Sair") |

---

## Serviços monitorados

| Monitor | Tipo | Host/URL | Intervalo |
|---|---|---|---|
| 🤖 Evolution API (WhatsApp) | HTTP | `http://129.80.27.159:8080/` | 60s |
| 🌐 Sistema de Frota (Vercel) | HTTP | `https://sistema-de-frota.vercel.app` | 120s |
| 🗺️ OSRM (Roteirização) | HTTP | `http://host.docker.internal:5000/` | 120s |
| 🔢 VROOM (Otimizador) | HTTP | `http://host.docker.internal:3000/` | 120s |
| 🗄️ Postgres (Banco Evolution) | TCP | `evolution-db:5432` | 60s |
| ⚡ Redis (Cache) | TCP | `evolution-redis:6379` | 60s |

> **Por que OSRM e VROOM aceitam status 400/404?**
> Esses serviços não têm rota GET / — retornam 400 ou 404 para requisições sem body válido.
> O importante é que **respondem** (= estão vivos). Uptime Kuma foi configurado para aceitar esses códigos como "OK".

> **Por que Postgres e Redis usam nome de container e não IP externo?**
> Essas portas (5432, 6379) não são expostas publicamente. O Uptime Kuma está na mesma rede Docker e acessa via nome de container.

---

## Infraestrutura (docker-compose)

Arquivo: `/home/ubuntu/evolution/docker-compose.yml`

O Uptime Kuma foi adicionado como serviço extra no mesmo docker-compose da Evolution API:

```yaml
uptime-kuma:
  image: louislam/uptime-kuma:1
  container_name: uptime-kuma
  restart: always
  ports:
    - '3001:3001'
  volumes:
    - uptime_kuma_data:/app/data
  extra_hosts:
    - "host.docker.internal:host-gateway"   # permite acessar OSRM/VROOM no host
```

O `extra_hosts` é necessário porque OSRM e VROOM rodam **no host** (não em Docker), então precisam de `host.docker.internal` para serem acessíveis de dentro do container.

---

## Badge de Status na Sidebar

### Como funciona

Um pequeno ponto colorido no rodapé da sidebar (acima do "Sair"):
- 🟢 **Sistemas OK** — Evolution API e Vercel respondendo
- 🔴 **Verificar serviços** — algum serviço com problema
- Passando o mouse: tooltip mostra quais serviços estão OK/não OK
- Clicando: abre o Uptime Kuma no dashboard completo

### Arquivos envolvidos

| Arquivo | Função |
|---|---|
| `src/components/layout/Sidebar.tsx` | Componente `SystemStatusBadge` + integração no rodapé |
| `src/app/api/monitoring/status/route.ts` | API route que pinga Evolution API e Vercel |

### API Route (`/api/monitoring/status`)

```typescript
// Pinga dois serviços externos e retorna { ok: boolean, services: [] }
// Chamada: GET /api/monitoring/status
// Cache: force-dynamic (sem cache)
// Timeout: 5 segundos por serviço
// Atualização: a cada 60 segundos (cliente faz polling)
```

Retorna:
```json
{
  "ok": true,
  "services": [
    { "name": "WhatsApp (Evolution API)", "ok": true },
    { "name": "Backend (Vercel)", "ok": true }
  ]
}
```

---

## Porta 3001 no Oracle Cloud

A porta 3001 foi aberta na **Security List** da subnet da VM:
- Source CIDR: `0.0.0.0/0`
- Protocol: TCP
- Destination Port: `3001`

Para encontrar a Security List certa:
1. Oracle Cloud → Compute → Instances → `osrm-routing`
2. Aba **Networking** → clica em **subnet-20260527-2227**
3. Security Lists → Default Security List → Ingress Rules

---

## Como atualizar o Uptime Kuma (quando aparecer "Nova Atualização")

**Não clique no botão da interface.** Em Docker, a atualização correta é:

```bash
ssh -i ~/.ssh/osrm-key.pem ubuntu@129.80.27.159
cd /home/ubuntu/evolution
docker compose pull uptime-kuma
docker compose up -d uptime-kuma
```

---

## Scripts utilitários (na VM)

| Script | Função |
|---|---|
| `/home/ubuntu/evolution/add-kuma.py` | Instalação inicial (não usar de novo) |
| `/home/ubuntu/evolution/patch-kuma.py` | Adiciona extra_hosts ao compose |
| `/home/ubuntu/evolution/setup-kuma.py` | Tentativa de configurar monitores via API (não funciona — Kuma usa Socket.IO) |

---

*Criado em 04/06/2026*
