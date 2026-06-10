"use client";

import { useState, useEffect, useMemo, useDeferredValue } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { loadAll } from "@/lib/utils/loadAll";
import { normalizar } from "@/lib/utils/normalizar";
import {
  PageHeader, DataTable, Th, Td, Tr, Badge, Btn,
  KpiCard, EmptyState, SearchInput, selectStyle,
} from "@/components/ui/ds";
import { DeleteBtn } from "@/components/ui/DeleteBtn";
import { MobileCard, MobileList, MobileFAB } from "@/components/mobile";

type EntregaLite = {
  id: string;
  destino: string | null;
  nome_cliente_avulso: string | null;
  clientes: { nome_fantasia: string; apelido: string | null } | null;
};

type Pedido = {
  id: string;
  status: string;
  valor_pedido: number | null;
  created_at: string | null;
  data_inicio_prevista: string | null;
  motoristas: { nome: string } | null;
  veiculos: { placa: string; apelido: string | null; modelo: string } | null;
  entregas: EntregaLite[];
};

const STATUS_LABEL: Record<string, string> = {
  agendada: "Agendado", agendado: "Agendado",
  em_andamento: "Em Andamento",
  concluida: "Concluído", concluido: "Concluído",
  cancelada: "Cancelado", cancelado: "Cancelado",
};
const STATUS_VAR: Record<string, "warning" | "info" | "success" | "danger"> = {
  agendada: "warning", agendado: "warning",
  em_andamento: "info",
  concluida: "success", concluido: "success",
  cancelada: "danger", cancelado: "danger",
};

const fmtDataCadastro = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("pt-BR") : "—";

const fmtMoeda = (v: number | null) =>
  v != null ? v.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "—";

/** Normaliza embed que o PostgREST às vezes devolve como array. */
function one<T>(x: T | T[] | null | undefined): T | null {
  if (Array.isArray(x)) return x[0] ?? null;
  return x ?? null;
}

/** Nome do cliente do pedido — vem das entregas (cadastrado ou avulso). */
function clienteDoPedido(p: Pedido): string {
  const entregas = Array.isArray(p.entregas) ? p.entregas : [];
  for (const e of entregas) {
    const cli = one(e.clientes);
    if (cli?.nome_fantasia) return cli.nome_fantasia;
  }
  for (const e of entregas) {
    if (e.nome_cliente_avulso?.trim()) return e.nome_cliente_avulso.trim();
  }
  return "Cliente não informado";
}

/** Pega um rótulo curto e legível de um destino ("Rua X, 123 - Centro" → "Centro" ou começo). */
function rotuloDestino(destino: string): string {
  const txt = destino.trim();
  // Tenta o bairro/cidade no fim (depois da última vírgula); senão o começo.
  const partes = txt.split(",").map(s => s.trim()).filter(Boolean);
  const alvo = partes.length >= 2 ? partes[partes.length - 1] : partes[0] ?? txt;
  return alvo.length > 22 ? alvo.slice(0, 21) + "…" : alvo;
}

/** Resumo dos destinos: "3 entregas · Centro / Jardim +1". */
function resumoDestinos(entregas: EntregaLite[]): string {
  const dests = entregas.map(e => e.destino?.trim()).filter((d): d is string => !!d);
  const n = entregas.length;
  const palavra = n === 1 ? "entrega" : "entregas";
  if (dests.length === 0) return `${n} ${palavra}`;
  const rotulos = dests.slice(0, 2).map(rotuloDestino);
  const extra = dests.length > 2 ? ` +${dests.length - 2}` : "";
  return `${n} ${palavra} · ${rotulos.join(" / ")}${extra}`;
}

export default function PedidosListPage() {
  const router = useRouter();
  const [todas, setTodas]     = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca]     = useState("");
  const [filtro, setFiltro]   = useState("");
  const buscaDeferred = useDeferredValue(busca);

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { router.push("/login"); return; }
      const { data: ue } = await supabase.from("usuario_empresas").select("empresa_id")
        .eq("usuario_id", auth.user.id).eq("is_padrao", true).single();
      if (!ue?.empresa_id) return;

      const data = await loadAll<Pedido>((from, to) =>
        supabase.from("pedidos")
          .select("id,status,valor_pedido,created_at,data_inicio_prevista,motoristas(nome),veiculos(placa,apelido,modelo),entregas(id,destino,nome_cliente_avulso,clientes(nome_fantasia,apelido))")
          .eq("empresa_id", ue.empresa_id)
          .order("created_at", { ascending: false })
          .range(from, to) as unknown as PromiseLike<{ data: Pedido[] | null }>
      );
      setTodas(data);
      setLoading(false);
    };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Índice de busca por pedido: cliente + destinos + motorista + placa/apelido.
  const indexado = useMemo(() =>
    todas.map(p => {
      const entregas = Array.isArray(p.entregas) ? p.entregas : [];
      const motorista = one(p.motoristas);
      const veiculo = one(p.veiculos);
      const cliente = clienteDoPedido(p);
      const hay = normalizar([
        cliente,
        ...entregas.map(e => e.destino ?? ""),
        ...entregas.map(e => e.nome_cliente_avulso ?? ""),
        motorista?.nome ?? "",
        veiculo?.placa ?? "",
        veiculo?.apelido ?? "",
        veiculo?.modelo ?? "",
      ].join(" "));
      return { p, cliente, motorista, veiculo, entregas, hay };
    }),
  [todas]);

  const filtradas = useMemo(() => {
    const q = normalizar(buscaDeferred);
    return indexado.filter(row => {
      if (filtro && row.p.status !== filtro) return false;
      if (!q) return true;
      return row.hay.includes(q);
    });
  }, [indexado, buscaDeferred, filtro]);

  const kpis = useMemo(() => ({
    total:       todas.length,
    agendadas:   todas.filter(v => v.status === "agendada" || v.status === "agendado").length,
    andamento:   todas.filter(v => v.status === "em_andamento").length,
    concluidas:  todas.filter(v => v.status === "concluida" || v.status === "concluido").length,
  }), [todas]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PageHeader
        title="Pedidos"
        count={filtradas.length}
        actions={<Btn href="/pedidos/novo">+ Novo Pedido</Btn>}
      />

      <div style={{ flex: 1, overflow: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>

        <div className="m-kpi-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px" }}>
          <KpiCard label="Total"       value={kpis.total}      />
          <KpiCard label="Agendados"   value={kpis.agendadas}  color="warning" />
          <KpiCard label="Em Andamento" value={kpis.andamento} color="info" />
          <KpiCard label="Concluídos"  value={kpis.concluidas} color="success" />
        </div>

        <div className="m-hide">
        <DataTable
          toolbar={
            <>
              <SearchInput
                placeholder="Buscar por cliente ou destino..."
                value={busca}
                onChange={e => setBusca(e.target.value)}
              />
              <select value={filtro} onChange={e => setFiltro(e.target.value)} style={{ ...selectStyle, width: "160px" }}>
                <option value="">Todos os status</option>
                <option value="agendada">Agendado</option>
                <option value="em_andamento">Em Andamento</option>
                <option value="concluida">Concluído</option>
                <option value="cancelada">Cancelado</option>
              </select>
            </>
          }
        >
          <thead>
            <tr>
              <Th>Cliente</Th>
              <Th>Cadastrado em</Th>
              <Th>Destinos</Th>
              <Th>Valor (R$)</Th>
              <Th>Status</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><Td colSpan={6} style={{ textAlign: "center", padding: "32px", color: "#94a3b8" }}>Carregando...</Td></tr>
            ) : filtradas.length === 0 ? (
              <tr><td colSpan={6}><EmptyState message="Nenhum pedido encontrado" action={<Btn href="/pedidos/novo">Criar primeiro pedido</Btn>} /></td></tr>
            ) : filtradas.map(({ p, cliente, motorista, veiculo, entregas }) => {
              const veicLabel = veiculo ? (veiculo.apelido?.trim() || `${veiculo.placa} · ${veiculo.modelo}`) : null;
              return (
                <Tr key={p.id}>
                  <Td>
                    <div style={{ fontWeight: 600, color: "#1e293b" }}>{cliente}</div>
                    {(motorista || veicLabel) && (
                      <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "2px" }}>
                        {[motorista?.nome, veicLabel].filter(Boolean).join(" · ")}
                      </div>
                    )}
                  </Td>
                  <Td>{fmtDataCadastro(p.created_at)}</Td>
                  <Td style={{ maxWidth: "260px" }}>
                    <span style={{ color: "#475569" }}>{resumoDestinos(entregas)}</span>
                  </Td>
                  <Td style={{ textAlign: "right" }}>{fmtMoeda(p.valor_pedido)}</Td>
                  <Td><Badge variant={STATUS_VAR[p.status] ?? "default"}>{STATUS_LABEL[p.status] ?? p.status}</Badge></Td>
                  <Td>
                    <div style={{ display: "flex", gap: "4px", justifyContent: "flex-end" }}>
                      <Btn href={`/pedidos/${p.id}`}      variant="ghost" size="xs">Ver</Btn>
                      <Btn href={`/pedidos/${p.id}/editar`} variant="outline" size="xs">Editar</Btn>
                      <DeleteBtn id={p.id} table="pedidos" label="pedido" />
                    </div>
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </DataTable>
        </div>

        {/* Busca no mobile (a tabela fica oculta no celular) */}
        <div className="mobile-only" style={{ marginBottom: "4px" }}>
          <SearchInput
            placeholder="Buscar por cliente ou destino..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
          />
        </div>

        <MobileList count={filtradas.length} label="pedidos">
          {loading ? null : filtradas.map(({ p, cliente, motorista, veiculo, entregas }) => {
            const concluido = p.status === "concluida" || p.status === "concluido";
            const cancelado = p.status === "cancelada" || p.status === "cancelado";
            const statusColor = concluido ? "#16a34a" : p.status === "em_andamento" ? "#2563eb" : cancelado ? "#ef4444" : "#eab308";
            const veicLabel = veiculo ? (veiculo.apelido?.trim() || `${veiculo.placa} • ${veiculo.modelo}`) : "Sem veículo";
            return (
              <MobileCard
                key={p.id}
                href={`/pedidos/${p.id}`}
                title={cliente}
                subtitle={resumoDestinos(entregas)}
                badge={<Badge variant={STATUS_VAR[p.status] ?? "default"}>{STATUS_LABEL[p.status] ?? p.status}</Badge>}
                highlight={statusColor}
                details={[
                  { label: "Cadastrado", value: fmtDataCadastro(p.created_at) },
                  { label: "Valor", value: p.valor_pedido != null ? `R$ ${fmtMoeda(p.valor_pedido)}` : "—" },
                  { label: "Motorista", value: motorista?.nome ?? "—" },
                  { label: "Veículo", value: veicLabel },
                ]}
              />
            );
          })}
        </MobileList>

        <MobileFAB href="/pedidos/novo" label="Novo Pedido" />
      </div>
    </div>
  );
}
