"use client";

import { useState, useEffect, useMemo, useDeferredValue } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { loadAll } from "@/lib/utils/loadAll";
import { normalizar } from "@/lib/utils/normalizar";
import { PageHeader, DataTable, Th, Td, Tr, Badge, Btn, KpiCard, EmptyState, SearchInput, selectStyle } from "@/components/ui/ds";
import { DeleteBtn } from "@/components/ui/DeleteBtn";

type Adiantamento = {
  id: string;
  valor: number;
  tipo: string;
  status: string;
  justificativa: string | null;
  data_pagamento: string | null;
  created_at: string | null;
  motorista_id: string;
  frete_id: string | null;
  motoristas: { nome: string } | null;
};

const TIPO_LABEL: Record<string, string> = {
  adiantamento: "Adiantamento",
  vale: "Vale",
  despesa_viagem: "Despesa de Viagem",
  outros: "Outros",
};

const STATUS_BADGE: Record<string, "warning" | "success" | "danger" | "info"> = {
  pendente: "warning",
  aprovado: "success",
  recusado: "danger",
  prestado: "info",
};

const fmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export default function AdiantamentosPage() {
  const router = useRouter();
  const [todos, setTodos] = useState<Adiantamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("");
  const buscaDeferred = useDeferredValue(busca);

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { router.push("/login"); return; }
      const { data: ue } = await supabase.from("usuario_empresas").select("empresa_id")
        .eq("usuario_id", auth.user.id).eq("is_padrao", true).single();
      if (!ue?.empresa_id) return;

      const data = await loadAll<Adiantamento>((from, to) =>
        supabase.from("adiantamentos")
          .select("id,valor,tipo,status,justificativa,data_pagamento,created_at,motorista_id,frete_id,motoristas(nome)")
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
      m.set(a.id, normalizar([a.motoristas?.nome, a.tipo, a.justificativa].join(" ")));
    }
    return m;
  }, [todos]);

  const filtrados = useMemo(() => {
    const termo = normalizar(buscaDeferred);
    const palavras = termo.split(/\s+/).filter(Boolean);
    return todos.filter(a => {
      if (filtroStatus && a.status !== filtroStatus) return false;
      if (palavras.length === 0) return true;
      const h = haystack.get(a.id) ?? "";
      return palavras.every(p => h.includes(p));
    });
  }, [todos, haystack, buscaDeferred, filtroStatus]);

  const totalSolicitado = todos.reduce((s, a) => s + (a.valor ?? 0), 0);
  const totalAprovado   = todos.filter(a => a.status === "aprovado").reduce((s, a) => s + (a.valor ?? 0), 0);
  const totalPendente   = todos.filter(a => a.status === "pendente").reduce((s, a) => s + (a.valor ?? 0), 0);
  const totalPrestado   = todos.filter(a => a.status === "prestado").reduce((s, a) => s + (a.valor ?? 0), 0);

  const toolbar = (
    <div style={{ display: "flex", gap: "8px", alignItems: "center", flex: 1 }}>
      <SearchInput
        placeholder="Buscar por motorista, tipo, justificativa..."
        value={busca}
        onChange={e => setBusca(e.target.value)}
      />
      <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}
        style={{ ...selectStyle, width: "150px" }}>
        <option value="">Todos os status</option>
        <option value="pendente">Pendente</option>
        <option value="aprovado">Aprovado</option>
        <option value="recusado">Recusado</option>
        <option value="prestado">Prestado</option>
      </select>
      <span style={{ fontSize: "11px", color: "#94a3b8", marginLeft: "auto", whiteSpace: "nowrap" }}>
        {filtrados.length} de {todos.length} adiantamentos
      </span>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PageHeader title="Adiantamentos" subtitle="Controle de adiantamentos e vales dos motoristas" count={loading ? undefined : todos.length}>
        <Btn href="/adiantamentos/novo" size="sm">+ Novo Adiantamento</Btn>
      </PageHeader>

      <div style={{ flex: 1, overflow: "auto", padding: "16px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginBottom: "16px" }}>
          <KpiCard label="Total Solicitado" value={fmt.format(totalSolicitado)} color="default" />
          <KpiCard label="Total Aprovado"   value={fmt.format(totalAprovado)}   color="success" />
          <KpiCard label="Total Pendente"   value={fmt.format(totalPendente)}   color="warning" />
          <KpiCard label="Total Prestado"   value={fmt.format(totalPrestado)}   color="info" />
        </div>

        <DataTable count={filtrados.length} label="adiantamentos" toolbar={toolbar}>
          <thead>
            <tr>
              <Th>Data</Th>
              <Th>Motorista</Th>
              <Th>Tipo</Th>
              <Th>Valor</Th>
              <Th>Status</Th>
              <Th style={{ textAlign: "right" }}>Ações</Th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ textAlign: "center", padding: "32px", color: "#94a3b8", fontSize: "13px" }}>Carregando...</td></tr>
            ) : filtrados.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  {todos.length === 0
                    ? <EmptyState message="Nenhum adiantamento cadastrado." icon="💸" action={<Btn href="/adiantamentos/novo">+ Novo Adiantamento</Btn>} />
                    : <EmptyState message="Nenhum adiantamento encontrado para esta busca." icon="🔍" />
                  }
                </td>
              </tr>
            ) : (
              filtrados.map(a => {
                const data = a.created_at
                  ? new Date(a.created_at).toLocaleDateString("pt-BR")
                  : "—";
                return (
                  <Tr key={a.id}>
                    <Td>{data}</Td>
                    <Td>{a.motoristas?.nome ?? "—"}</Td>
                    <Td>{TIPO_LABEL[a.tipo] ?? a.tipo}</Td>
                    <Td style={{ fontWeight: 600 }}>{fmt.format(a.valor)}</Td>
                    <Td>
                      <Badge variant={STATUS_BADGE[a.status] ?? "default"}>
                        {a.status.toUpperCase()}
                      </Badge>
                    </Td>
                    <Td style={{ textAlign: "right" }}>
                      <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
                        <a href={`/adiantamentos/${a.id}/editar`} style={{ color: "#2563eb", textDecoration: "none", fontWeight: 600, fontSize: "inherit" }}>Editar</a>
                        <DeleteBtn id={a.id} table="adiantamentos" label="adiantamento" />
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
