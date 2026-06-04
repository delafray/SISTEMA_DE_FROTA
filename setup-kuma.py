#!/usr/bin/env python3
"""
Configura monitores no Uptime Kuma via API REST.
Roda APÓS criar a conta admin na interface web.

Uso: python3 setup-kuma.py <usuario> <senha>
Exemplo: python3 setup-kuma.py admin MinhaS3nha!
"""
import sys, json, urllib.request, urllib.parse, time

BASE = "http://localhost:3001"

if len(sys.argv) < 3:
    print("Uso: python3 setup-kuma.py <usuario> <senha>")
    sys.exit(1)

USERNAME = sys.argv[1]
PASSWORD = sys.argv[2]

def req(method, path, data=None, cookies=None):
    url = BASE + path
    body = json.dumps(data).encode() if data else None
    headers = {"Content-Type": "application/json"}
    if cookies:
        headers["Cookie"] = "; ".join(f"{k}={v}" for k, v in cookies.items())
    r = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        resp = urllib.request.urlopen(r, timeout=10)
        raw = resp.read().decode()
        return resp.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        return e.code, json.loads(raw) if raw else {}

# ── 1. Login ──────────────────────────────────────────────────────────────────
print("[...] Fazendo login...")
status, body = req("POST", "/api/login", {"username": USERNAME, "password": PASSWORD})
if status != 200:
    print(f"[ERRO] Login falhou ({status}): {body}")
    sys.exit(1)

token = body.get("token", "")
print(f"[OK] Login feito. Token: {token[:20]}...")
cookies = {"token": token}

# ── 2. Monitores a criar ──────────────────────────────────────────────────────
monitors = [
    {
        "name": "🤖 Evolution API (WhatsApp)",
        "type": "http",
        "url": "http://localhost:8080/",
        "interval": 60,
        "retryInterval": 60,
        "maxretries": 3,
        "description": "Gateway WhatsApp. Se cair, motoristas param de receber respostas.",
    },
    {
        "name": "🌐 Sistema de Frota (Vercel)",
        "type": "http",
        "url": "https://sistema-de-frota.vercel.app/api/whatsapp/webhook",
        "interval": 120,
        "retryInterval": 60,
        "maxretries": 3,
        "description": "Backend na Vercel. Webhook do WhatsApp.",
    },
    {
        "name": "🗺️ OSRM (Roteirização)",
        "type": "http",
        "url": "http://localhost:5000/",
        "interval": 120,
        "retryInterval": 60,
        "maxretries": 3,
        "description": "Motor de rotas. Se cair, otimização de entregas para de funcionar.",
    },
    {
        "name": "🔢 VROOM (Otimizador)",
        "type": "http",
        "url": "http://localhost:3000/",
        "interval": 120,
        "retryInterval": 60,
        "maxretries": 3,
        "description": "Calculador de rotas ótimas. Funciona junto com o OSRM.",
    },
    {
        "name": "🗄️ Postgres (Banco Evolution)",
        "type": "tcp",
        "hostname": "localhost",
        "port": 5432,
        "interval": 60,
        "retryInterval": 30,
        "maxretries": 3,
        "description": "Banco de dados da Evolution API. Se cair, bot fica sem memória de sessão.",
    },
    {
        "name": "⚡ Redis (Cache)",
        "type": "tcp",
        "hostname": "localhost",
        "port": 6379,
        "interval": 60,
        "retryInterval": 30,
        "maxretries": 3,
        "description": "Cache de sessões do WhatsApp. Se cair, bot pode perder contexto.",
    },
]

# ── 3. Criar monitores ────────────────────────────────────────────────────────
print()
print(f"[...] Criando {len(monitors)} monitores...")
for m in monitors:
    # Uptime Kuma API de monitores
    payload = {
        "name": m["name"],
        "type": m["type"],
        "interval": m.get("interval", 60),
        "retryInterval": m.get("retryInterval", 60),
        "maxretries": m.get("maxretries", 3),
        "active": True,
        "notificationIDList": [],
    }
    if m["type"] == "http":
        payload["url"] = m["url"]
        payload["method"] = "GET"
        payload["maxredirects"] = 3
        payload["accepted_statecodes"] = ["200-299", "404"]  # Vercel webhook retorna 405 em GET - aceitamos qualquer coisa
    elif m["type"] == "tcp":
        payload["hostname"] = m.get("hostname", "localhost")
        payload["port"] = m.get("port")

    status, resp = req("POST", "/api/monitors", payload, cookies)
    if status in (200, 201):
        print(f"  [OK] {m['name']}")
    else:
        print(f"  [AVISO] {m['name']} — {status}: {resp}")
    time.sleep(0.5)

print()
print("=" * 60)
print("CONFIGURAÇÃO CONCLUÍDA!")
print()
print("Acesse: http://129.80.27.159:3001")
print()
print("O que cada monitor significa:")
print("  VERDE  = serviço funcionando ✅")
print("  AMARELO = instável / verificando ⚠️")
print("  VERMELHO = serviço fora do ar ❌")
print("=" * 60)
