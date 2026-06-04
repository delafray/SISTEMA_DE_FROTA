# Railway — Evolution API  ⚠️ OBSOLETO

> 📎 Voltar ao [INDEX de Deploy](INDEX.md) | [INDEX principal](../INDEX.md)

> 🚫 **O Railway foi CANCELADO (04/06/2026).** A Evolution API agora roda na **VM Oracle Cloud com v2.3.7 + Postgres + Redis**. Para deploy novo, use **[migrar-railway-para-oracle.md](migrar-railway-para-oracle.md)** e o compose canônico em **[../01-whatsapp-bot/setup-evolution.md](../01-whatsapp-bot/setup-evolution.md)**. Esta página fica só como histórico — a config abaixo (v2.3.0, `DATABASE_ENABLED=false`) **não vale mais**.

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
