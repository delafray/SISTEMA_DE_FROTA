# Progresso — Redesign Pedidos & Despacho (2026-06-10)

Checklist vivo. Atualizado a cada bloco. Commits diretos na `main`, prefixo `redesign:`.

Legenda: ✅ FEITO · 🔄 EM ANDAMENTO · ⬜ FALTA

---

## Blocos

- ✅ **B0 — Setup**: ler docs/código, criar este progresso, `npm install`, baseline `tsc`.
- ✅ **B1 — Novo Pedido: múltiplos locais de carregamento** (lista unificada cadastrados+avulsos no mesmo pedido, chips com "✓ adicionado", modal salva N locais novos com nome opcional). tsc verde.
- ✅ **B2 — Listagem de Pedidos localizável**: cliente (das entregas), data de cadastro, destinos resumidos ("3 entregas · Centro / Jardim +1"), valor, status; busca por cliente+destino. tsc verde.
- ✅ **B3 — Editar Pedido simplificado**: motorista/veículo/KM só leitura (aviso + link /despacho); KM com "ajuste manual (gestor)" p/ admin/master; editáveis = cliente(cadastrado/avulso)/valor/datas/status/obs/entregas. Removido o bloqueio que exigia motorista+veículo. tsc verde.
- ✅ **B4 — Despacho**: fila com Cliente/Data/Destinos resumidos + BUSCA (cliente+destino); modal mostra APELIDO do caminhão; CORRIGIDO o erro ao confirmar (constraint viagens_status_check revalidada em update — normaliza status p/ feminino no proprio update) + mensagens de erro legiveis (message+details+hint+code); SQL em db/migration_despacho_status_fix.sql. tsc verde, 1190 testes verdes.
- ⬜ **B5 — Doc leiga** `docs/REDESIGN_PEDIDOS_DESPACHO_2026-06-10.md`.

---

## Achados de investigação (base das decisões)

- `pedidos.cliente_id` existe (migration_empresa01_logistica, **sem FK**) → embed `clientes(...)` direto em `pedidos` NÃO funciona; o cliente é lido pelas **entregas** (`entregas.cliente_id` tem FK, ou `entregas.nome_cliente_avulso`).
- `veiculos.apelido` **existe** (coluna `apelido text null`) → modal de despacho pode mostrar apelido. Sem migration nova.
- `entregas.motorista_id/veiculo_id/km_inicial` viraram nullable em `db/migration_entregas_despacho_nullable.sql` (precisa estar aplicado em prod).
- `pedidos.empresa_motorista_id` existe (migration_pedidos_empresa_motorista).
- Constraint `viagens_status_check` (na base, fora do repo) só aceita status **femininos**: `agendada/em_andamento/concluida/cancelada`. O Despacho **não** altera status, então não é a causa direta — ver análise no bloco B4.
- Gating por papel: padrão em `uso-apis/page.tsx` → `usuario_empresas.role` ∈ `['admin','master']`. Reaproveitado para o "ajuste manual (gestor)" do km.

---

## Log de commits

(preenchido a cada push)
</content>
</invoke>
