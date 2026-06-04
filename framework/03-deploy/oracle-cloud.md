# Oracle Cloud VM — OSRM + VROOM

> 📎 Voltar ao [INDEX de Deploy](INDEX.md) | [INDEX principal](../INDEX.md)
>
> Documentação completa: [ORACLE_CLOUD_SETUP.md](../../ORACLE_CLOUD_SETUP.md)
> Plano de execução: [PLANO_EXECUCAO_OSRM_VM.md](../../PLANO_EXECUCAO_OSRM_VM.md)

---

## Especificações da VM

- **Shape:** VM.Standard.A1.Flex (ARM/Ampere)
- **4 OCPUs, 24 GB RAM, 47 GB disco**
- **OS:** Ubuntu 22.04
- **Custo:** R$ 0 (Always Free)
- **IP atual:** `129.80.27.159` (US-ASHBURN-AD-2)

---

## Portas no firewall

| Porta | Serviço |
|---|---|
| 22 | SSH |
| 5000 | OSRM Backend |
| 3000 | VROOM |
| 8080 | Evolution API (WhatsApp bot) |

> ⚠️ Abrir no **OCI Console (Security List) E no iptables do OS**: `sudo iptables -I INPUT -p tcp --dport 8080 -j ACCEPT` e `sudo netfilter-persistent save`.

---

## Variáveis

```env
OSRM_URL=http://129.80.27.159:5000
VROOM_URL=http://129.80.27.159:3000
EVOLUTION_API_URL=http://129.80.27.159:8080
OVERPASS_URL=http://129.80.27.159:12345/api/interpreter
```

## Acesso SSH

```bash
# Chave em: C:\Users\ronal\.ssh\osrm-key.pem
ssh -i C:\Users\ronal\.ssh\osrm-key.pem ubuntu@129.80.27.159

# Verificar serviços rodando:
docker ps
# Deve mostrar: evolution-api, osrm, vroom (+ overpass se configurado)

# Logs da Evolution API:
docker logs evolution-api --tail 50
```

## docker-compose da Evolution API

Arquivo em `/home/ubuntu/evolution/docker-compose.yml` (também em `home/ubuntu/evolution/docker-compose.yml` no repositório).
Ver [migrar-railway-para-oracle.md](migrar-railway-para-oracle.md) para o docker-compose completo.

---

## Dica: Região Ashburn

Usar **US East (Ashburn)** — libera capacidade muito mais rápido que São Paulo. O script de criação tenta a cada 30s até conseguir.

---

## Veja também

- [ORACLE_CLOUD_SETUP.md](../../ORACLE_CLOUD_SETUP.md) — guia completo de setup
- [../04-roteirizacao/osrm-vroom-setup.md](../04-roteirizacao/osrm-vroom-setup.md) — OSRM + VROOM
- [../02-apis-e-chaves/env-template.md](../02-apis-e-chaves/env-template.md) — variáveis
