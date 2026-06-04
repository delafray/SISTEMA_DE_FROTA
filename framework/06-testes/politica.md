# Política de Testes — Obrigatória

> 📎 Voltar ao [INDEX de Testes](INDEX.md) | [INDEX principal](../INDEX.md)
>
> Fonte: [TESTING.md](../../TESTING.md) + [AGENTS.md](../../AGENTS.md)

---

## Regras (invioláveis)

1. **Toda mudança de código exige teste novo ou atualizado** (vitest)
2. Antes de finalizar qualquer tarefa, rodar `npm test` e ver **todos passarem**
3. Reportar ao usuário: X passaram, Y falharam, novos testes adicionados
4. **Sem testes = trabalho NÃO concluído.** O dono rejeita entregas sem testes.

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
