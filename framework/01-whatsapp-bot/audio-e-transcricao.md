# Áudio e Transcrição (Deepgram)

> 📎 Voltar ao [INDEX do Bot](INDEX.md) | [INDEX principal](../INDEX.md)

---

## Como funciona

```
Motorista grava áudio → WhatsApp encripta → Evolution API descriptografa → Deepgram transcreve → texto pro Gemini
```

## Regra #1: SEMPRE usar getBase64FromMediaMessage

O WhatsApp **encripta** a mídia no CDN. A URL direta (`getMediaUrl`) retorna bytes inúteis.

✅ **Certo:**
```typescript
// Em deepgramClient.ts
const base64 = await getMediaAsBase64DataUrl(messageId);
// Envia o base64 pro Deepgram
```

❌ **Errado:**
```typescript
const url = await getMediaUrl(messageId);
// Deepgram recebe lixo encriptado → transcrição vazia
```

---

## Configuração do Deepgram

- **Modelo:** `nova-2` (melhor para português BR)
- **Formato:** base64 data URL (não URL direta)
- **Bônus:** US$ 200 de crédito inicial para novas contas

### Obter chave
1. deepgram.com → Sign Up
2. Dashboard → API Keys → Create Key
3. Copiar chave

```env
DEEPGRAM_API_KEY=sua-chave-aqui
```

---

## Fluxo detalhado no código

```
1. messageParser.ts detecta mensagem tipo "audioMessage"
2. geminiBot.ts chama getMediaAsBase64DataUrl(messageId)
   → POST /chat/getBase64FromMediaMessage na Evolution API
   → retorna base64 descriptografado
3. deepgramClient.ts envia base64 pro Deepgram
   → modelo nova-2, language pt-BR
   → retorna texto transcrito + confiança
4. geminiBot.ts envia texto transcrito pro Gemini como mensagem do usuário
```

---

## Armadilha: `;codecs=opus` no data URL

O data URL pode vir com MIME type `audio/ogg;codecs=opus`. Deepgram aceita, mas o parser pode engasgar. O bug já foi corrigido em `deepgramClient.ts` — não regredir.

---

## Veja também

- [bugs-conhecidos.md](bugs-conhecidos.md) — B8 (áudio encriptado), B25 (latência)
- [arquitetura.md](arquitetura.md) — fluxo completo
- [../02-apis-e-chaves/todas-as-apis.md](../02-apis-e-chaves/todas-as-apis.md) — chave Deepgram
