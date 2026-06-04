#!/usr/bin/env python3
"""
Escreve o docker-compose.yml completo e correto na VM:
- Evolution API v2.3.7
- Postgres + Redis
- Uptime Kuma na porta 3001
"""

COMPOSE_PATH = "/home/ubuntu/evolution/docker-compose.yml"

COMPOSE_CONTENT = """\
services:
  evolution-api:
    image: evoapicloud/evolution-api:v2.3.7
    container_name: evolution-api
    restart: always
    ports:
      - '8080:8080'
    environment:
      AUTHENTICATION_TYPE: apikey
      AUTHENTICATION_API_KEY: frota-evo-key-2026
      PORT: '8080'
      SERVER_PORT: '8080'
      DATABASE_ENABLED: 'true'
      DATABASE_PROVIDER: postgresql
      DATABASE_CONNECTION_URI: postgresql://evolution:evo_frota_2026@evolution-db:5432/evolution
      CACHE_REDIS_ENABLED: 'true'
      CACHE_REDIS_URI: redis://evolution-redis:6379
      CACHE_LOCAL_ENABLED: 'false'
      CONFIG_SESSION_PHONE_CLIENT: Evolution API
      CONFIG_SESSION_PHONE_NAME: Chrome
      QRCODE_LIMIT: '30'
      WEBSOCKET_ENABLED: 'true'
      DEL_INSTANCE: 'false'
      LOG_LEVEL: ERROR
    volumes:
      - evolution_instances:/evolution/instances
    depends_on:
      evolution-db:
        condition: service_healthy
      evolution-redis:
        condition: service_healthy

  evolution-db:
    image: postgres:16-alpine
    container_name: evolution-db
    restart: always
    environment:
      POSTGRES_USER: evolution
      POSTGRES_PASSWORD: evo_frota_2026
      POSTGRES_DB: evolution
    volumes:
      - evolution_pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U evolution']
      interval: 5s
      timeout: 5s
      retries: 5

  evolution-redis:
    image: redis:7-alpine
    container_name: evolution-redis
    restart: always
    volumes:
      - evolution_redis:/data
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 5s
      timeout: 5s
      retries: 5

  uptime-kuma:
    image: louislam/uptime-kuma:1
    container_name: uptime-kuma
    restart: always
    ports:
      - '3001:3001'
    volumes:
      - uptime_kuma_data:/app/data

volumes:
  evolution_instances:
  evolution_pgdata:
  evolution_redis:
  uptime_kuma_data:
"""

with open(COMPOSE_PATH, "w") as f:
    f.write(COMPOSE_CONTENT)

print("[OK] docker-compose.yml reescrito com v2.3.7 + Uptime Kuma")
print()
print("Validando YAML com docker compose config...")
import subprocess
r = subprocess.run(
    ["docker", "compose", "-f", COMPOSE_PATH, "config", "--quiet"],
    capture_output=True, text=True
)
if r.returncode == 0:
    print("[OK] YAML valido!")
else:
    print("[ERRO]", r.stderr)
    exit(1)

print()
print("Subindo apenas uptime-kuma (sem derrubar evolution)...")
r2 = subprocess.run(
    ["docker", "compose", "-f", COMPOSE_PATH, "up", "-d", "uptime-kuma"],
    capture_output=True, text=True
)
print(r2.stdout)
if r2.returncode != 0:
    print("[ERRO]", r2.stderr)
    exit(1)

print()
print("=" * 60)
print("Uptime Kuma INSTALADO!")
print("URL: http://129.80.27.159:3001")
print("(Se nao abrir, abra a porta 3001 no Oracle Cloud)")
print("=" * 60)
