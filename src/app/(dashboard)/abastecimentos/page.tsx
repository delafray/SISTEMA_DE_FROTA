"use client";

import { useState, useEffect, useMemo, useDeferredValue } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { loadAll } from "@/lib/utils/loadAll";
import { normalizar } from "@/lib/utils/normalizar";
import { PageHeader, DataTable, Th, Td, Tr, Badge, Btn, KpiCard, EmptyState, SearchInput, selectStyle } from "@/components/ui/ds";
import { DeleteBtn } from "@/components/ui/DeleteBtn";
import { MobileCard, MobileList, MobileFAB } from "@/components/mobile";

type Abastecimento = {
  id: string;
  km_no_abast: number | null;
  litros: number;
  valor_litro: number | null;
  valor_total: number;
  posto: string | null;
  confirmado: boolean | null;
  created_at: string | null;
  veiculo_id: string;
  motorista_id: string;
  veiculos: { placa: string; modelo: string } | null;
  motoristas: { nome: string } | null;
};

export default function AbastecimentosPage() {
  const router = useRouter();
  const [todos, setTodos]     = useState<Abastecimento[]>([]);
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

      const data = await loadAll<Abastecimento>((from, to) =>
        supabase.from("abastecimentos")
          .select("id,km_no_abast,litros,valor_litro,valor_total,posto,confirmado,created_at,veiculo_id,motorista_id,veiculos(placa,modelo),motoristas(nome)")
          .eq("empresa_id", ue.empresa_id)
          .order("created_at", { ascending: false })
          .range(from, to)
      );
      setTodos(data);
      setLoading(false);
    };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const haystack = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of todos) {
      m.set(a.id, normalizar([
        a.veiculos?.placa ?? "",
        a.veiculos?.modelo ?? "",
        a.motoristas?.nome ?? "",
        a.posto ?? "",
      ].join(" ")));
    }
    return m;
  }, [todos]);

  const filtrados = useMemo(() => {
    const termo = normalizar(buscaDeferred);
    const palavras = termo.split(/\s+/).filter(Boolean);
    return todos.filter(a => {
      if (filtro === "confirmado" && !a.confirmado) return false;
      if (filtro === "pendente"   &&  a.confirmado) return false;
      if (palavras.length === 0) return true;
      const h = haystack.get(a.id) ?? "";
      return palavras.every(p => h.includes(p));
    });
  }, [todos, haystack, buscaDeferred, filtro]);

  const totalLitros  = todos.reduce((s, a) => s + a.litros, 0);
  const custoTotal   = todos.reduce((s, a) => s + a.valor_total, 0);
  const ticketMedio  = todos.length > 0 ? custoTotal / todos.length : 0;

  const toolbar = (
    <div style={{ display: "flex", gap: "8px", alignItems: "center", flex: 1 }}>
      <SearchInput
        placeholder="Buscar por veículo, motorista, posto..."
        value={busca}
        onChange={e => setBusca(e.target.value)}
      />
      <select value={filtro} onChange={e => setFiltro(e.target.value)}
        style={{ ...selectStyle, width: "140px" }}>
        <option value="">Todos</option>
        <option value="confirmado">Confirmados</option>
        <option value="pendente">Pendentes</option>
      </select>
      <span style={{ fontSize: "11px", color: "#94a3b8", marginLeft: "auto", whiteSpace: "nowrap" }}>
        {filtrados.length} de {todos.length} registros
      </span>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PageHeader title="Abastecimentos" count={loading ? undefined : todos.length}>
        <Btn href="/abastecimentos/novo" size="sm">+ Registrar Abastecimento</Btn>
      </PageHeader>

      <div style={{ flex: 1, overflow: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
        <div className="m-kpi-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px" }}>
          <KpiCard label="Total Abastecimentos" value={loading ? "..." : todos.length} />
          <KpiCard label="Total Litros"         value={loading ? "..." : totalLitros.toLocaleString("pt-BR", { maximumFractionDigits: 0 }) + " L"} color="info" />
          <KpiCard label="Custo Total"          value={loading ? "..." : custoTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} color="warning" />
          <KpiCard label="Ticket Médio"         value={loading ? "..." : ticketMedio.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} color="success" />
        </div>

        {/* Desktop: tabela */}
        <div className="m-hide">
        <DataTable count={filtrados.length} label="abastecimentos" toolbar={toolbar}>
          <thead>
            <tr>
              <Th>Data</Th>
              <Th>Veículo</Th>
              <Th>Motorista</Th>
              <Th>Posto</Th>
              <Th style={{ textAlign: "right" }}>KM</Th>
              <Th style={{ textAlign: "right" }}>Litros</Th>
              <Th style={{ textAlign: "right" }}>Valor/L</Th>
              <Th style={{ textAlign: "right" }}>Total</Th>
              <Th>Status</Th>
              <Th style={{ textAlign: "right" }}>Ações</Th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} style={{ textAlign: "center", padding: "32px", color: "#94a3b8", fontSize: "13px" }}>Carregando...</td></tr>
            ) : filtrados.length === 0 ? (
              <tr>
                <td colSpan={10}>
                  {todos.length === 0
                    ? <EmptyState message="Nenhum abastecimento registrado." icon="⛽" action={<Btn href="/abastecimentos/novo">+ Registrar primeiro abastecimento</Btn>} />
                    : <EmptyState message="Nenhum abastecimento encontrado para esta busca." icon="🔍" />
                  }
                </td>
              </tr>
            ) : (
              filtrados.map(a => {
                const data = a.created_at ? new Date(a.created_at).toLocaleDateString("pt-BR") : "—";
                return (
                  <Tr key={a.id}>
                    <Td>{data}</Td>
                    <Td>{a.veiculos ? `${a.veiculos.placa} — ${a.veiculos.modelo}` : "—"}</Td>
                    <Td>{a.motoristas?.nome ?? "—"}</Td>
                    <Td>{a.posto ?? "—"}</Td>
                    <Td style={{ textAlign: "right" }}>{a.km_no_abast?.toLocaleString("pt-BR") ?? "—"}</Td>
                    <Td style={{ textAlign: "right" }}>{a.litros.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Td>
                    <Td style={{ textAlign: "right" }}>
                      {a.valor_litro != null
                        ? a.valor_litro.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 3 })
                        : "—"}
                    </Td>
                    <Td style={{ textAlign: "right" }}>
                      {a.valor_total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                    </Td>
                    <Td>
                      <Badge variant={a.confirmado ? "success" : "warning"}>
                        {a.confirmado ? "Confirmado" : "Pendente"}
                      </Badge>
                    </Td>
                    <Td style={{ textAlign: "right" }}>
                      <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
                        <a href={`/abastecimentos/${a.id}/editar`} style={{ color: "#2563eb", textDecoration: "none", fontWeight: 600, fontSize: "inherit" }}>Editar</a>
                        <DeleteBtn id={a.id} table="abastecimentos" label="abastecimento" />
                      </div>
                    </Td>
                  </Tr>
                );
              })
            )}
          </tbody>
        </DataTable>
        </div>

        {/* Mobile: cards */}
        <MobileList count={filtrados.length} label="abastecimentos">
          {loading ? null : filtrados.map(a => {
            const data = a.created_at ? new Date(a.created_at).toLocaleDateString("pt-BR") : "—";
            return (
              <MobileCard
                key={a.id}
                href={`/abastecimentos/${a.id}/editar`}
                title={a.veiculos ? `${a.veiculos.placa}` : "Sem veículo"}
                subtitle={`${data} • ${a.motoristas?.nome ?? "Sem motorista"}`}
                badge={
                  <Badge variant={a.confirmado ? "success" : "warning"}>
                    {a.confirmado ? "✓" : "Pend."}
                  </Badge>
                }
                details={[
                  { label: "Litros", value: `${a.litros.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} L` },
                  { label: "Total", value: a.valor_total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) },
                ]}
              />
            );
          })}
        </MobileList>

        <MobileFAB href="/abastecimentos/novo" label="Registrar Abastecimento" />
      </div>
    </div>
  );
}
