# Política de Testes — Recomendada (não obrigatória)

> 📎 Voltar ao [INDEX de Testes](INDEX.md) | [INDEX principal](../INDEX.md)
>
> Fonte: [TESTING.md](../../TESTING.md) + [AGENTS.md](../../AGENTS.md)

---

## Regras (atualizadas 04/06/2026 — o dono relaxou a exigência)

1. Criar/atualizar teste é **recomendado**, não exigido pra concluir a tarefa.
2. Rodar `npm test` é **recomendado** antes de mudanças grandes — **NÃO** a cada microedição.
3. Se rodar, reporte o resultado. Se não rodar, tudo bem.
4. `npm test` é local + mockado → **custo de API zero**.

> Antes esta regra era "inviolável / sem teste = rejeitado". **Isso não vale mais.**

---

## Como rodar

```bash
npm test                  # roda todos os testes
npm test -- --watch       # modo watch
npm test -- MyTest        # roda teste específico
```

---

## Onde ficam os testes

```
src/__tests__/
├── whatsapp/             ← Testes do bot
├── compliance/           ← Testes de compliance (Fase 5)
└── ...
```

---

## Padrão de teste para tools

```typescript
import { describe, it, expect, vi } from 'vitest';
import { minhaTool } from '@/lib/ai/tools/frotaTools';

describe('minhaTool', () => {
  it('retorna dados quando empresa existe', async () => {
    const result = await minhaTool('empresa-123');
    expect(result.ok).toBe(true);
  });

  it('retorna erro sem empresa_id', async () => {
    const result = await minhaTool('');
    expect(result.ok).toBe(false);
  });
});
```

---

## Log de execuções

Cada IA anexa sua execução no final de [TESTING_LOG.md](../../TESTING_LOG.md).

---

## Veja também

- [TESTING.md](../../TESTING.md) — áreas sem cobertura
- [TESTING_LOG.md](../../TESTING_LOG.md) — histórico de execuções
- [../01-whatsapp-bot/como-consultar-tabela.md](../01-whatsapp-bot/como-consultar-tabela.md) — inclui exemplo de teste
