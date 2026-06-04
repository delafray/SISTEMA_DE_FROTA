# Como Adicionar Nova Tool (Escrita no Banco)

> 📎 Voltar ao [INDEX do Bot](INDEX.md) | [INDEX principal](../INDEX.md)

Guia para tools que **MODIFICAM dados** (atualizar KM, registrar despesa, etc.).
Diferente de consultas simples — aqui tem o **Permission Loop** (propor → confirmar).

> Para consultas que APENAS LEEM dados, veja [como-consultar-tabela.md](como-consultar-tabela.md).

---

## Padrão obrigatório: Permission Loop (propor/confirmar)

Toda tool que ESCREVE no banco segue o padrão de **duas tools**:

```
1. propor_* → READ-ONLY, retorna preview
2. confirmar_* → EXECUTA, exige confirmação explícita do motorista
```

**Fluxo:**
```
Motorista: "meu km é 45000"
    ↓
Gemini chama propor_atualizacao_km(45000)
    ↓
Tool devolve preview (km_atual: 40000, km_novo: 45000, delta: +5000)
    ↓
Gemini: "Vou registrar 45.000 km no leão (atual 40.000). Confirma?"
    ↓
Motorista: "sim"
    ↓
Gemini chama confirmar_atualizacao_km(45000)
    ↓
Tool valida + grava no banco
    ↓
Gemini: "Registrado: 45.000 km."
```

---

## Passo a passo: Exemplo "registrar despesa"

### Passo 1 — Duas FunctionDeclarations

```typescript
// Em frotaTools.ts → declarations[]

// TOOL 1: propor (READ-ONLY)
{
  name: 'propor_despesa',
  description:
    'PRIMEIRO passo pra registrar despesa. NAO grava nada — devolve preview. ' +
    'Use quando motorista informar gasto: "gastei 150 de pedágio", "almocei por 35 reais". ' +
    'Apresente preview e pergunte "confirma?".',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      tipo: {
        type: SchemaType.STRING,
        description: 'Tipo da despesa: "pedagio", "alimentacao", "hospedagem", "outros"',
      },
      valor: {
        type: SchemaType.NUMBER,
        description: 'Valor em reais (ex: 150.00)',
      },
      descricao: {
        type: SchemaType.STRING,
        description: 'Descrição breve (ex: "pedágio Fernão Dias")',
      },
    },
    required: ['tipo', 'valor'],
  },
},

// TOOL 2: confirmar (EXECUTA)
{
  name: 'confirmar_despesa',
  description:
    'SEGUNDO passo — grava a despesa no banco. Use APENAS depois que motorista ' +
    'confirmou EXPLICITAMENTE ("sim", "ok", "pode"). NUNCA chame sem confirmação.',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      tipo: { type: SchemaType.STRING },
      valor: { type: SchemaType.NUMBER },
      descricao: { type: SchemaType.STRING },
    },
    required: ['tipo', 'valor'],
  },
},
```

### Passo 2 — Implementar propor_ (READ-ONLY)

```typescript
async function proporDespesa(
  empresaId: string,
  motoristaId: string | undefined,
  args?: Record<string, unknown>
): Promise<ResultadoTool> {
  if (!motoristaId) {
    return { ok: false, erro: 'motorista não identificado', codigo: 'sem_permissao' };
  }

  const tipo = typeof args?.tipo === 'string' ? args.tipo : undefined;
  const valor = typeof args?.valor === 'number' ? args.valor : undefined;
  const descricao = typeof args?.descricao === 'string' ? args.descricao : '';

  if (!tipo || !valor || valor <= 0) {
    return { ok: false, erro: 'tipo e valor são obrigatórios', codigo: 'validacao' };
  }

  // NÃO grava nada — só retorna preview
  return {
    ok: true,
    dados: {
      preview: true,
      tipo,
      valor,
      descricao,
      mensagem_sugerida: `Registrar despesa: ${tipo} R$ ${valor.toFixed(2)}${descricao ? ` (${descricao})` : ''}. Confirma?`,
    },
  };
}
```

### Passo 3 — Implementar confirmar_ (GRAVA)

```typescript
async function confirmarDespesa(
  empresaId: string,
  motoristaId: string | undefined,
  args?: Record<string, unknown>
): Promise<ResultadoTool> {
  if (!motoristaId) {
    return { ok: false, erro: 'motorista não identificado', codigo: 'sem_permissao' };
  }

  const tipo = typeof args?.tipo === 'string' ? args.tipo : undefined;
  const valor = typeof args?.valor === 'number' ? args.valor : undefined;

  if (!tipo || !valor || valor <= 0) {
    return { ok: false, erro: 'tipo e valor são obrigatórios', codigo: 'validacao' };
  }

  // ⚠️ ANTES de inserir, verificar CHECK constraints da tabela!
  // SELECT pg_get_constraintdef(oid) FROM pg_constraint
  // WHERE conrelid = 'despesas'::regclass;

  const supabase = getSupabase();
  const { error } = await supabase.from('despesas').insert({
    empresa_id: empresaId,
    motorista_id: motoristaId,
    tipo,
    valor,
    descricao: typeof args?.descricao === 'string' ? args.descricao : null,
    // ⚠️ Setar flags que triggers exigem (ver B16 em bugs-conhecidos.md)
  });

  if (error) {
    log.error('confirmar_despesa_erro', { motoristaId, message: error.message });
    return { ok: false, erro: error.message, codigo: 'db' };
  }

  return {
    ok: true,
    dados: {
      tipo,
      valor,
      mensagem_sugerida: `Despesa registrada: ${tipo} R$ ${valor.toFixed(2)}.`,
    },
  };
}
```

### Passo 4 — Registrar no dispatcher

```typescript
case 'propor_despesa':
  return proporDespesa(empresaId, motId, args);
case 'confirmar_despesa':
  return confirmarDespesa(empresaId, motId, args);
```

### Passo 5 — System prompt

```
- Motorista informa gasto → propor_despesa (NÃO confirmar direto)
- Motorista confirma ("sim", "ok") → confirmar_despesa
```

### Passo 6 — Testes + Deploy

Mesmo padrão de [como-consultar-tabela.md](como-consultar-tabela.md) passos 5-6.

---

## ⚠️ Antes de inserir em QUALQUER tabela

1. **Verificar CHECK constraints:**
   ```sql
   SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'TABELA'::regclass;
   ```
2. **Verificar triggers:**
   ```sql
   SELECT proname, prosrc FROM pg_proc
   WHERE oid IN (SELECT tgfoid FROM pg_trigger WHERE tgrelid = 'TABELA'::regclass AND NOT tgisinternal);
   ```
3. **Setar flags explicitamente** — não confiar em DEFAULTs (ver Bug B16)

---

## Veja também

- [como-consultar-tabela.md](como-consultar-tabela.md) — para consultas READ-ONLY
- [bugs-conhecidos.md](bugs-conhecidos.md) — B14 (CHECK constraints), B15 (triggers obsoletos), B16 (flags)
- [arquitetura.md](arquitetura.md) — Permission Loop §6
