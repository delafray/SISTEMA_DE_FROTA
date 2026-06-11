"use client";

import { useState, useEffect, useMemo, useDeferredValue } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { loadAll } from "@/lib/utils/loadAll";
import { normalizar } from "@/lib/utils/normalizar";
import { PageHeader, DataTable, Th, Td, Tr, Badge, Btn, EmptyState, SearchInput, selectStyle, useTableSort } from "@/components/ui/ds";
import { DeleteBtn } from "@/components/ui/DeleteBtn";
import { MobileCard, MobileList, MobileFAB } from "@/components/mobile";

type Cliente = {
  id: string; nome_fantasia: string | null; razao_social: string | null;
  documento: string | null; cidade: string | null; uf: string | null;
  ativo: boolean | null;
};

export default function ClientesPage() {
  const router = useRouter();
  const [todos, setTodos]     = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca]     = useState("");
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

      const data = await loadAll<Cliente>((from, to) =>
        supabase.from("clientes").select("id,nome_fantasia,razao_social,documento,cidade,uf,ativo")
          .eq("empresa_id", ue.empresa_id).order("nome_fantasia").range(from, to)
      );
      setTodos(data);
      setLoading(false);
    };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const haystack = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of todos) {
      m.set(c.id, normalizar([c.nome_fantasia, c.razao_social, c.documento, c.cidade, c.uf].join(" ")));
    }
    return m;
  }, [todos]);

  const filtrados = useMemo(() => {
    const termo = normalizar(buscaDeferred);
    const palavras = termo.split(/\s+/).filter(Boolean);
    return todos.filter(c => {
      if (filtroAtivo === "true"  && c.ativo === false) return false;
      if (filtroAtivo === "false" && c.ativo !== false) return false;
      if (palavras.length === 0) return true;
      const h = haystack.get(c.id) ?? "";
      return palavras.every(p => h.includes(p));
    });
  }, [todos, haystack, buscaDeferred, filtroAtivo]);

  // Ordenação client-side (cadastro pequeno — carrega tudo de uma vez).
  // Sem padrão: abre na ordem do servidor; reordena só ao clicar no cabeçalho.
  const { sortedData: ordenados, sortKey, sortDirection, handleSort } = useTableSort(filtrados, "", "asc");

  const toolbar = (
    <div style={{ display: "flex", gap: "8px", alignItems: "center", flex: 1 }}>
      <SearchInput
        placeholder="Buscar por nome, CNPJ/CPF, cidade..."
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
        {filtrados.length} de {todos.length} clientes
      </span>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PageHeader title="Clientes" subtitle="Gerencie seus clientes e embarcadores" count={loading ? undefined : todos.length}>
        <Btn href="/clientes/novo" size="sm">+ Cadastrar Cliente</Btn>
      </PageHeader>

      <div style={{ flex: 1, overflow: "auto", padding: "16px" }}>
        {/* Desktop: tabela */}
        <div className="m-hide">
        <DataTable count={filtrados.length} label="clientes" toolbar={toolbar}>
          <thead>
            <tr>
              <Th sortKey="nome_fantasia" activeSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort}>Nome Fantasia</Th>
              <Th sortKey="razao_social" activeSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort}>Razão Social</Th>
              <Th sortKey="documento" activeSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort}>CNPJ/CPF</Th>
              <Th sortKey="cidade" activeSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort}>Cidade</Th>
              <Th sortKey="uf" activeSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort}>UF</Th>
              <Th sortKey="ativo" activeSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort}>Status</Th>
              <Th style={{ textAlign: "right" }}>Ações</Th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ textAlign: "center", padding: "32px", color: "#94a3b8", fontSize: "13px" }}>Carregando...</td></tr>
            ) : filtrados.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  {todos.length === 0
                    ? <EmptyState message="Nenhum cliente cadastrado." icon="🏭" action={<Btn href="/clientes/novo">+ Cadastrar primeiro cliente</Btn>} />
                    : <EmptyState message="Nenhum cliente encontrado para esta busca." icon="🔍" />
                  }
                </td>
              </tr>
            ) : (
              ordenados.map(c => (
                <Tr key={c.id} onClick={() => router.push(`/clientes/${c.id}/editar`)}>
                  <Td>{c.nome_fantasia}</Td>
                  <Td>{c.razao_social ?? "—"}</Td>
                  <Td>{c.documento ?? "—"}</Td>
                  <Td>{c.cidade ?? "—"}</Td>
                  <Td>{c.uf ?? "—"}</Td>
                  <Td><Badge variant={c.ativo !== false ? "success" : "default"}>{c.ativo !== false ? "Ativo" : "Inativo"}</Badge></Td>
                  <Td style={{ textAlign: "right" }}>
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
                      <a href={`/clientes/${c.id}/editar`} style={{ color: "#2563eb", textDecoration: "none", fontWeight: 600, fontSize: "inherit" }}>Editar</a>
                      <DeleteBtn id={c.id} table="clientes" label="cliente" />
                    </div>
                  </Td>
                </Tr>
              ))
            )}
          </tbody>
        </DataTable>
        </div>

        {/* Mobile: cards */}
        <MobileList count={filtrados.length} label="clientes">
          {loading ? null : ordenados.map(c => (
            <MobileCard
              key={c.id}
              href={`/clientes/${c.id}/editar`}
              title={c.nome_fantasia ?? c.razao_social ?? "Sem nome"}
              subtitle={c.documento ?? "Sem documento"}
              badge={<Badge variant={c.ativo !== false ? "success" : "default"}>{c.ativo !== false ? "Ativo" : "Inativo"}</Badge>}
              details={[
                { label: "Cidade", value: c.cidade ?? "—" },
                { label: "UF", value: c.uf ?? "—" },
              ]}
            />
          ))}
        </MobileList>

        <MobileFAB href="/clientes/novo" label="Cadastrar Cliente" />
      </div>
    </div>
  );
}
