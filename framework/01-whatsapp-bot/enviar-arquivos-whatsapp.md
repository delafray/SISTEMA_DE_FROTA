# Enviar Arquivos via WhatsApp (sem compressão)

> 📎 Voltar ao [INDEX do Bot](INDEX.md) | [INDEX principal](../INDEX.md)

---

## O problema

O WhatsApp **comprime imagens** enviadas como foto (`mediatype: "image"`).
Para preservar qualidade original (logos, documentos, imagens de alta resolução),
é obrigatório enviar como **documento** (`mediatype: "document"`).

O destinatário recebe como attachment (ícone de arquivo), baixa e abre em full resolution.

---

## Como enviar como arquivo (Evolution API)

```typescript
// messageSender.ts — função a adicionar
async function enviarArquivo(
  para: string,
  url: string,         // URL pública (ex: Cloudflare R2 pub-xxx.r2.dev)
  nomeArquivo: string  // ex: "logo-rbarros.png"
): Promise<boolean> {
  const res = await fetch(`${EVOLUTION_URL}/message/sendMedia/${INSTANCE}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: EVOLUTION_KEY },
    body: JSON.stringify({
      number: para,
      mediatype: 'document',   // ← chave: document, não image
      media: url,
      fileName: nomeArquivo,
      caption: '',
    }),
  });
  return res.ok;
}
```

> ⚠️ A URL precisa ser **pública e acessível** pela Evolution API (a VM vai baixar o arquivo).
> URLs do Cloudflare R2 no formato `pub-xxx.r2.dev` funcionam perfeitamente.
> URLs assinadas/privadas dependem do tempo de expiração — evitar.

---

## Implementação completa: catálogo de arquivos pelo bot

Para o gestor pedir arquivos via WhatsApp ("me mande a logo da rbarros"):

### 1. Tabela no banco

```sql
CREATE TABLE arquivos_empresa (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     UUID NOT NULL REFERENCES empresas(id),
  nome           TEXT NOT NULL,          -- "Logo RBARROS"
  palavras_chave TEXT[],                 -- ARRAY['logo', 'rbarros', 'marca']
  url            TEXT NOT NULL,          -- URL pública R2
  nome_arquivo   TEXT NOT NULL,          -- "logo-rbarros.png"
  criado_em      TIMESTAMPTZ DEFAULT now()
);
```

### 2. Tool do Gemini

```typescript
// src/lib/ai/tools/frotaTools.ts — adicionar
{
  name: 'buscar_arquivo',
  description: 'Busca um arquivo cadastrado pelo nome ou palavras-chave',
  parameters: {
    type: 'object',
    properties: {
      nome: { type: 'string', description: 'Nome ou descrição do arquivo' },
    },
    required: ['nome'],
  },
}

// handler:
case 'buscar_arquivo': {
  const { data } = await supabase
    .from('arquivos_empresa')
    .select('nome, url, nome_arquivo')
    .eq('empresa_id', empresaId)
    .or(`nome.ilike.%${args.nome}%,palavras_chave.cs.{${args.nome}}`)
    .limit(1)
    .single();

  if (!data) return { ok: false, motivo: 'Arquivo não encontrado' };
  return { ok: true, url: data.url, nome_arquivo: data.nome_arquivo, nome: data.nome };
}
```

### 3. No gestorFlow — enviar o arquivo

```typescript
// Depois que o Gemini retorna o resultado da tool buscar_arquivo:
if (resultado.ok) {
  await enviarArquivo(msg.from, resultado.url, resultado.nome_arquivo);
} else {
  await enviarTexto(msg.from, `Não encontrei nenhum arquivo com esse nome.`);
}
```

### 4. Upload no painel (admin)

- Tela `/arquivos` com formulário: nome + upload de arquivo → R2 → salva URL no banco
- Usar `persistirMidiaNoR2` já existente em `src/lib/storage/r2.ts`

---

## Tipos de arquivo suportados

| Tipo | `mediatype` | Observação |
|---|---|---|
| Imagem sem compressão | `document` | Envia como arquivo, preserva resolução |
| PDF | `document` | Abre direto no WhatsApp |
| Imagem com compressão (ok) | `image` | WhatsApp redimensiona/comprime |
| Vídeo | `video` | Suportado pela Evolution |
| Áudio | `audio` | Suportado pela Evolution |

> **Regra geral:** sempre que qualidade importar → `document`. Para thumbnails e previews → `image`.

---

## Veja também

- [como-adicionar-tool.md](como-adicionar-tool.md) — passo a passo para nova tool Gemini
- [audio-e-transcricao.md](audio-e-transcricao.md) — envio/recebimento de mídia
- `src/lib/storage/r2.ts` — upload para Cloudflare R2
