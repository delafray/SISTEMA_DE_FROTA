# Deploy Vercel

> 📎 Voltar ao [INDEX de Deploy](INDEX.md) | [INDEX principal](../INDEX.md)

---

## Configuração de região (CRÍTICO para latência)

```json
// vercel.json
{
  "framework": "nextjs",
  "regions": ["iad1"]
}
```

```typescript
// src/app/api/whatsapp/webhook/route.ts
export const preferredRegion = 'iad1';
```

> ⚠️ **NÃO usar `gru1` (São Paulo)** mesmo o sistema sendo brasileiro!
> Evolution API, Deepgram e Gemini ficam nos EUA. Pinar em SP = viagem transoceânica em cada chamada.
> Bug B26 — custou horas descobrir.

---

## Variáveis de ambiente

1. Settings → Environment Variables
2. Adicionar TODAS as variáveis (ver [env-template.md](../02-apis-e-chaves/env-template.md))
3. **Após mudar qualquer variável:** Deployments → último → ⋯ → **Redeploy**

> ⚠️ Sem redeploy a variável NÃO pega! Bug B12.

---

## Deploy automático

- Conectar repo GitHub ao Vercel
- Cada push em `main` → deploy automático
- URL do sistema: `https://frota-XXXX.vercel.app`

---

## Veja também

- [../02-apis-e-chaves/env-template.md](../02-apis-e-chaves/env-template.md) — todas as variáveis
- [../01-whatsapp-bot/bugs-conhecidos.md](../01-whatsapp-bot/bugs-conhecidos.md) — B12, B13, B26
