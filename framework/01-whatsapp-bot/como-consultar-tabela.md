# Como Consultar uma Nova Tabela via WhatsApp

> 📎 Voltar ao [INDEX do Bot](INDEX.md) | [INDEX principal](../INDEX.md)

Guia passo a passo para adicionar uma nova consulta ao bot de WhatsApp.
Exemplo usado: "consultar entregas do dia".

---

## Pré-requisitos

- Saber qual tabela do Supabase será consultada (ex: `entregas`)
- Saber quais colunas retornar (ex: `destino, status, motorista_id`)
- Ter acesso ao código em `src/lib/ai/tools/frotaTools.ts`

---

## Passo 1 — Adicionar a FunctionDeclaration

Em `src/lib/ai/tools/frotaTools.ts`, adicione um novo item no array `declarations`:

```typescript
// No array declarations[], adicione:
{
  name: 'listar_entregas_hoje',
  description:
    'Lista as entregas ATIVAS do dia (status em_rota ou agendada) da empresa. ' +
    'Use quando perguntarem: "quais entregas tenho hoje", "o que tem pra entregar", ' +
    '"tem algum frete hoje". Devolve quantidade e detalhes.',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {},    // sem parâmetros → consulta simples
    required: [],
  },
},
```

### Regras para a description (IMPORTANTE):
- **2-3 exemplos reais** do que o motorista perguntaria
- **30-50 palavras** no máximo (mais = waste de token)
- Diga **quando NÃO usar** se houver ambiguidade com outra tool
- O Gemini decide QUANDO chamar baseado NESTA descrição

---

## Passo 2 — Implementar a função

Logo abaixo das outras funções no mesmo arquivo:

```typescript
export async function listarEntregasHoje(empresaId: string): Promise<ResultadoTool> {
  if (!empresaId) return { ok: false, erro: 'sem empresa identificada' };

  const supabase = getSupabase();

  // Pegar início e fim do dia
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const amanha = new Date(hoje);
  amanha.setDate(amanha.getDate() + 1);

  const { data, error } = await supabase
    .from('entregas')
    .select('id, destino, status, motorista_id')
    .eq('empresa_id', empresaId)           // ⚠️ SEMPRE filtrar por empresa!
    .gte('data_prevista', hoje.toISOString())
    .lt('data_prevista', amanha.toISOString())
    .in('status', ['agendada', 'em_rota'])
    .order('data_prevista');

  if (error) {
    log.error('listar_entregas_hoje_erro', { empresaId, message: error.message });
    return { ok: false, erro: error.message, codigo: 'db' };
  }

  return {
    ok: true,
    dados: {
      quantidade: (data ?? []).length,
      entregas: (data ?? []).map(e => ({
        destino: e.destino,
        status: e.status,
      })),
    },
  };
}
```

### Checklist obrigatório:
- [ ] Filtrar por `empresa_id` (NUNCA esquecer — vaza dados entre empresas!)
- [ ] Verificar `error` separado de `data` (não fazer `if (!data)`)
- [ ] Retornar `ResultadoTool` com `ok: true/false`
- [ ] Logar erros com `log.error()`

---

## Passo 3 — Registrar no dispatcher

Na função `executarTool()` no final do arquivo, adicione o `case`:

```typescript
export async function executarTool(
  nome: string,
  empresaId: string,
  motoristaId?: string,
  args?: Record<string, unknown>
): Promise<ResultadoTool> {
  const motId = typeof motoristaId === 'string' && motoristaId.trim() !== '' ? motoristaId : undefined;
  switch (nome) {
    // ... cases existentes ...
    case 'listar_entregas_hoje':                    // ← ADICIONAR
      return listarEntregasHoje(empresaId);          // ← ADICIONAR
    default:
      return { ok: false, erro: `tool desconhecida: ${nome}` };
  }
}
```

---

## Passo 4 — Atualizar o system prompt (opcional mas recomendado)

Em `src/lib/ai/prompts.ts`, adicione um gatilho na seção GATILHOS:

```
- "Quais entregas hoje" / "tem frete hoje" → listar_entregas_hoje
```

> Isso ajuda o Gemini a escolher a tool certa, mas não é obrigatório — a `description` da FunctionDeclaration já faz esse papel.

---

## Passo 5 — Escrever teste

Em `src/__tests__/whatsapp/`, crie `listarEntregasHoje.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { listarEntregasHoje } from '@/lib/ai/tools/frotaTools';

// Mock do Supabase
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          gte: () => ({
            lt: () => ({
              in: () => ({
                order: () => Promise.resolve({
                  data: [
                    { id: '1', destino: 'São Paulo', status: 'agendada', motorista_id: 'x' }
                  ],
                  error: null,
                }),
              }),
            }),
          }),
        }),
      }),
    }),
  }),
}));

describe('listarEntregasHoje', () => {
  it('retorna entregas quando existem', async () => {
    const result = await listarEntregasHoje('empresa-123');
    expect(result.ok).toBe(true);
    expect(result.dados).toHaveProperty('quantidade', 1);
  });

  it('retorna erro sem empresa_id', async () => {
    const result = await listarEntregasHoje('');
    expect(result.ok).toBe(false);
  });
});
```

Rode: `npm test`

---

## Passo 6 — Deploy

```bash
git add .
git commit -m "feat(bot): add tool listar_entregas_hoje"
git push
```

O Vercel faz deploy automático. Teste enviando mensagem pro bot: "tem alguma entrega hoje?"

---

## Resumo do fluxo completo

```
1. FunctionDeclaration (nome + description + params)  → Gemini sabe QUANDO chamar
2. Função implementação (query Supabase)               → Gemini recebe os DADOS
3. Case no dispatcher                                  → Conecta 1 com 2
4. System prompt (opcional)                             → Reforça gatilho
5. Teste vitest                                         → Garante que funciona
6. Deploy                                               → Bot responde
```

---

## Consulta com parâmetro (ex: buscar por placa)

Se a consulta precisa de um parâmetro do motorista, adicione em `properties`:

```typescript
{
  name: 'buscar_entrega',
  description: 'Busca uma entrega específica por destino ou número. Use quando...',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      destino: {
        type: SchemaType.STRING,
        description: 'Nome da cidade ou endereço de destino (ex: "São Paulo", "Campinas")',
      },
    },
    required: [],  // se for OPCIONAL, não inclua no required
  },
},
```

E na implementação, receba via `args`:
```typescript
export async function buscarEntrega(
  empresaId: string,
  args?: Record<string, unknown>
): Promise<ResultadoTool> {
  const destino = typeof args?.destino === 'string' ? args.destino : undefined;
  // ... query com .ilike('destino', `%${destino}%`) se informado
}
```

---

## Veja também

- [como-adicionar-tool.md](como-adicionar-tool.md) — para tools que ESCREVEM no banco (propor/confirmar)
- [arquitetura.md](arquitetura.md) — entender o fluxo completo
- [bugs-conhecidos.md](bugs-conhecidos.md) — armadilhas de CHECK constraints e triggers
- [../06-testes/politica.md](../06-testes/politica.md) — regras obrigatórias de testes
