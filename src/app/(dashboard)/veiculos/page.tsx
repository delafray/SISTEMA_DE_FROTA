"use client";

import { useState, useEffect, useMemo, useDeferredValue } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { loadAll } from "@/lib/utils/loadAll";
import { normalizar } from "@/lib/utils/normalizar";
import { PageHeader, DataTable, Th, Td, Tr, Badge, Btn, KpiCard, EmptyState, SearchInput, selectStyle } from "@/components/ui/ds";
import { DeleteBtn } from "@/components/ui/DeleteBtn";

type Veiculo = {
  id: string; placa: string; marca: string; modelo: string; tipo: string;
  categoria: string | null; combustivel: string | null; ano: number | null;
  km_atual: number | null; apelido: string | null; ativo: boolean | null;
  ipva_vencimento: string | null;
};

export default function VeiculosPage() {
  const router = useRouter();
  const [todos, setTodos]       = useState<Veiculo[]>([]);
  const [loading, setLoading]   = useState(true);
  const [busca, setBusca]       = useState("");
  const [filtroAtivo, setFiltroAtivo] = useState("");
  const buscaDeferred = useDeferredValue(busca);

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { router.push("/login"); return; }
      const { data: ue } = await supabase.from("usuario_empresas").select("empresa_id")
        .eq("usuario_id", auth.user.id).eq("is_padrao", true).single();
      if (!ue?.empresa_id) return;

      const data = await loadAll<Veiculo>((from, to) =>
        supabase.from("veiculos").select("id,placa,marca,modelo,tipo,categoria,combustivel,ano,km_atual,apelido,ativo,ipva_vencimento")
          .eq("empresa_id", ue.empresa_id).order("placa").range(from, to)
      );
      setTodos(data);
      setLoading(false);
    };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const haystack = useMemo(() => {
    const m = new Map<string, string>();
    for (const v of todos) {
      m.set(v.id, normalizar([v.placa, v.marca, v.modelo, v.apelido, v.tipo, v.categoria].join(" ")));
    }
    return m;
  }, [todos]);

  const filtrados = useMemo(() => {
    const termo = normalizar(buscaDeferred);
    const palavras = termo.split(/\s+/).filter(Boolean);
    return todos.filter(v => {
      if (filtroAtivo === "true"  && !v.ativo) return false;
      if (filtroAtivo === "false" && v.ativo)  return false;
      if (palavras.length === 0) return true;
      const h = haystack.get(v.id) ?? "";
      return palavras.every(p => h.includes(p));
    });
  }, [todos, haystack, buscaDeferred, filtroAtivo]);

  const ativos   = todos.filter(v => v.ativo).length;
  const inativos = todos.filter(v => !v.ativo).length;
  const hoje     = new Date();

  const toolbar = (
    <div style={{ display: "flex", gap: "8px", alignItems: "center", flex: 1 }}>
      <SearchInput
        placeholder="Buscar por placa, marca, modelo, apelido..."
        value={busca}
        onChange={e => setBusca(e.target.value)}
      />
      <select value={filtroAtivo} onChange={e => setFiltroAtivo(e.target.value)}
        style={{ ...selectStyle, width: "130px" }}>
        <option value="">Todos</option>
        <option value="true">Ativos</option>
        <option value="false">Inativos</option>
      </select>
      <span style={{ fontSize: "11px", color: "#94a3b8", marginLeft: "auto", whiteSpace: "nowrap" }}>
        {filtrados.length} de {todos.length} veículos
      </span>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PageHeader title="Veículos" count={loading ? undefined : todos.length}>
        <Btn href="/veiculos/novo" size="sm">+ Cadastrar Veículo</Btn>
      </PageHeader>

      <div style={{ flex: 1, overflow: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px" }}>
          <KpiCard label="Total"     value={loading ? "..." : todos.length}  />
          <KpiCard label="Ativos"    value={loading ? "..." : ativos}   color="success" />
          <KpiCard label="Inativos"  value={loading ? "..." : inativos} color="danger" />
          <KpiCard label="Em viagem" value={0}                          color="info" />
        </div>

        <DataTable count={filtrados.length} label="veículos" toolbar={toolbar}>
          <thead>
            <tr>
              <Th>Placa</Th>
              <Th>Apelido</Th>
              <Th>Marca / Modelo</Th>
              <Th>Tipo</Th>
              <Th>Combustível</Th>
              <Th>Ano</Th>
              <Th style={{ textAlign: "right" }}>KM Atual</Th>
              <Th>Venc. IPVA</Th>
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
                    ? <EmptyState message="Nenhum veículo cadastrado." icon="🚛" action={<Btn href="/veiculos/novo">+ Cadastrar primeiro veículo</Btn>} />
                    : <EmptyState message="Nenhum veículo encontrado para esta busca." icon="🔍" />
                  }
                </td>
              </tr>
            ) : (
              filtrados.map(v => {
                const ipvaDate = v.ipva_vencimento ? new Date(v.ipva_vencimento + "T00:00:00") : null;
                const diasIpva = ipvaDate ? Math.ceil((ipvaDate.getTime() - hoje.getTime()) / 86400000) : null;
                const ipvaVar  = diasIpva === null ? "default" : diasIpva < 0 ? "danger" : diasIpva < 30 ? "warning" : "success";

                return (
                  <Tr key={v.id} muted={!v.ativo}>
                    <Td>{v.placa}</Td>
                    <Td>{v.apelido ?? "—"}</Td>
                    <Td>{v.marca} {v.modelo}</Td>
                    <Td style={{ textTransform: "capitalize" }}>
                      {v.tipo}{v.categoria ? ` / ${v.categoria}` : ""}
                    </Td>
                    <Td style={{ textTransform: "capitalize" }}>{v.combustivel?.replace("_", " ") ?? "—"}</Td>
                    <Td>{v.ano}</Td>
                    <Td style={{ textAlign: "right" }}>{v.km_atual?.toLocaleString("pt-BR") ?? "—"}</Td>
                    <Td>
                      {ipvaDate
                        ? <Badge variant={ipvaVar}>{ipvaDate.toLocaleDateString("pt-BR")}</Badge>
                        : <span style={{ color: "#cbd5e1" }}>—</span>}
                    </Td>
                    <Td><Badge variant={v.ativo ? "success" : "default"}>{v.ativo ? "Ativo" : "Inativo"}</Badge></Td>
                    <Td style={{ textAlign: "right" }}>
                      <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
                        <a href={`/veiculos/${v.id}/editar`} style={{ color: "#2563eb", textDecoration: "none", fontWeight: 600, fontSize: "inherit" }}>Editar</a>
                        <DeleteBtn id={v.id} table="veiculos" label="veículo" />
                      </div>
                    </Td>
                  </Tr>
                );
              })
            )}
          </tbody>
        </DataTable>
      </div>
    </div>
  );
}
