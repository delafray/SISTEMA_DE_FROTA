# 📋 Padrão das telas de LISTAGEM (regra do dono — 11/06/2026)

> **Toda listagem do painel se comporta igual.** Tela nova de lista? Siga esta receita.
> Exemplos canônicos no código: `pedidos/page.tsx` (paginada) e `despacho/` (paginada com hook próprio).

## O que TODA listagem tem

1. **Linha inteira clicável** → abre a ação principal da linha (detalhe ou edição).
   ```tsx
   <Tr key={x.id} onClick={() => router.push(`/tela/${x.id}/editar`)}>
   ```
   O `Tr` do ds já ignora cliques em `button/a/input/select` (os botões da linha
   continuam funcionando) e já dá cursor/hover. **Não** envolva células em `<Link>`.

2. **Cabeçalho ordenável com setinha** (▲▼, clique alterna asc/desc) nas colunas
   que fazem sentido agrupar (cliente, caminhão, status, datas, valores).

3. **Paginação de 100 em 100 + busca no servidor** (regra do CLAUDE.md) nas telas
   que crescem com a operação. Cadastros pequenos (clientes, motoristas, veículos,
   usuários, empresas, regras) podem carregar tudo.

## Ordenação — qual das duas?

| Tipo de tela | Como ordenar | Ferramenta |
|---|---|---|
| **Paginada** (pedidos, despacho, entregas, abastecimentos, adiantamentos…) | No **SERVIDOR** — ordenar só os 100 visíveis mentiria | `useOrdenacao` do ds |
| **Cadastro pequeno** (carrega tudo de uma vez) | No cliente | `useTableSort` do ds |

### Receita — lista PAGINADA (`useOrdenacao`)

```tsx
import { useOrdenacao } from "@/components/ui/ds";

const { ordem, thSort } = useOrdenacao(() => setPagina(0)); // volta pra pág. 1 ao reordenar

// no useEffect de load (ANTES do .range; incluir `ordem` nas deps!):
const asc = ordem?.asc ?? true;
switch (ordem?.col) {
  case "status":   q = q.order("status", { ascending: asc }); break;
  case "previsto": q = q.order("data_inicio_prevista", { ascending: asc, nullsFirst: false }); break;
  case "caminhao": q = q.order("veiculos(apelido)", { ascending: asc, nullsFirst: false }); break; // join to-ONE: ordena pelo embed
  default:         q = q.order("created_at", { ascending: false }); // ordem padrão da tela
}
q = q.order("id", { ascending: true }).range(from, to); // desempate estável

// no thead:
<Th {...thSort("status")}>Status</Th>
<Th>Coluna sem ordenação</Th>
```

**Armadilhas:**
- Coluna `nullable` → sempre `nullsFirst: false` (nulls no fim).
- Join **to-one** (FK na própria tabela, ex.: `pedidos.veiculo_id`) → `q.order("veiculos(apelido)")` funciona.
- Join **to-many** (ex.: cliente do pedido mora nas ENTREGAS) → o PostgREST **não ordena o pai**;
  ordene o array da página no cliente (`localeCompare`) com comentário explicando.
- Não esquecer `ordem` nas dependências do `useEffect` que carrega a página.

### Receita — cadastro pequeno (`useTableSort`)

```tsx
const { sortedData, sortKey, sortDirection, handleSort } = useTableSort(linhas, "nome");
<Th sortKey="nome" activeSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort}>Nome</Th>
```

## Checklist ao criar/mexer em listagem

- [ ] Linha clicável (`Tr onClick`) pro destino da ação principal
- [ ] Colunas relevantes ordenáveis (servidor se paginada)
- [ ] Paginação `.range()` + contagem `{ count: "exact" }` se a tabela cresce
- [ ] Busca/filtros no servidor (`.ilike`/`.or`), nunca filtrar array gigante
- [ ] Mobile: `MobileCard` com `href` (linha já é clicável lá)
