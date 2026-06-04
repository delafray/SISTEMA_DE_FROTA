# Railway — Evolution API

> 📎 Voltar ao [INDEX de Deploy](INDEX.md) | [INDEX principal](../INDEX.md)

Setup detalhado: [01-whatsapp-bot/setup-evolution.md](../01-whatsapp-bot/setup-evolution.md)

---

## Resumo rápido

1. railway.app → New Project → Deploy Docker Image
2. Imagem: `evoapicloud/evolution-api:v2.3.0`
3. Variáveis: `AUTHENTICATION_TYPE=apikey`, `PORT=8080`, etc.
4. Volume: `/evolution/instances` (persistir sessão)
5. Anotar URL pública

## ⚠️ Regras

- **NUNCA** usar `atendai/evolution-api` (descontinuado)
- **NUNCA** usar v2.2.3 (bugs graves de QR Code)
- **SEMPRE** criar volume (sem volume = QR Code a cada restart)
- `DATABASE_ENABLED=false` (evita SSL errors)

---

## Veja também

- [../01-whatsapp-bot/setup-evolution.md](../01-whatsapp-bot/setup-evolution.md) — passo a passo completo
- [../01-whatsapp-bot/bugs-conhecidos.md](../01-whatsapp-bot/bugs-conhecidos.md) — B1-B8
