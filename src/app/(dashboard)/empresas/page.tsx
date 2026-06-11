"use client";

import { useState, useEffect, useMemo, useDeferredValue } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { loadAll } from "@/lib/utils/loadAll";
import { normalizar } from "@/lib/utils/normalizar";
import { PageHeader, DataTable, Th, Td, Tr, Badge, Btn, EmptyState, SearchInput, useTableSort } from "@/components/ui/ds";
import { DeleteBtn } from "@/components/ui/DeleteBtn";
import { MobileCard, MobileList, MobileFAB } from "@/components/mobile";

type Empresa = {
  id: string; nome_fantasia: string | null; razao_social: string | null;
  cnpj: string | null; cidade: string | null; uf: string | null; telefone: string | null;
};

export default function EmpresasPage() {
  const router = useRouter();
  const [todas, setTodas]       = useState<Empresa[]>([]);
  const [empresaId, setEmpresaId] = useState<string>("");
  const [loading, setLoading]   = useState(true);
  const [busca, setBusca]       = useState("");
  const buscaDeferred = useDeferredValue(busca);

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { router.push("/login"); return; }
      const { data: ue } = await supabase.from("usuario_empresas").select("empresa_id")
        .eq("usuario_id", auth.user.id).eq("is_padrao", true).single();
      if (ue?.empresa_id) setEmpresaId(ue.empresa_id);

      const data = await loadAll<Empresa>((from, to) =>
        supabase.from("empresas")
          .select("id,nome_fantasia,razao_social,cnpj,cidade,uf,telefone")
          .order("nome_fantasia").range(from, to)
      );
      setTodas(data);
      setLoading(false);
    };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const haystack = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of todas) {
      m.set(e.id, normalizar([e.nome_fantasia, e.razao_social, e.cnpj, e.cidade, e.uf].join(" ")));
    }
    return m;
  }, [todas]);

  const filtradas = useMemo(() => {
    const termo = normalizar(buscaDeferred);
    const palavras = termo.split(/\s+/).filter(Boolean);
    if (palavras.length === 0) return todas;
    return todas.filter(e => {
      const h = haystack.get(e.id) ?? "";
      return palavras.every(p => h.includes(p));
    });
  }, [todas, haystack, buscaDeferred]);

  // Ordenação client-side (cadastro pequeno — carrega tudo de uma vez).
  // Sem padrão: abre na ordem do servidor; reordena só ao clicar no cabeçalho.
  const { sortedData: ordenadas, sortKey, sortDirection, handleSort } = useTableSort(filtradas, "", "asc");

  const fmtCnpj = (v: string) =>
    v.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");

  const toolbar = (
    <div style={{ display: "flex", gap: "8px", alignItems: "center", flex: 1 }}>
      <SearchInput
        placeholder="Buscar por nome, CNPJ, cidade..."
        value={busca}
        onChange={e => setBusca(e.target.value)}
      />
      <span style={{ fontSize: "11px", color: "#94a3b8", marginLeft: "auto", whiteSpace: "nowrap" }}>
        {filtradas.length} de {todas.length} empresas
      </span>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PageHeader title="Empresas" count={loading ? undefined : todas.length}>
        <Btn href="/empresas/novo" size="sm">+ Nova Empresa</Btn>
      </PageHeader>

      <div style={{ flex: 1, overflow: "auto", padding: "16px" }}>
        <div className="m-hide">
        <DataTable count={filtradas.length} label="empresas" toolbar={toolbar}>
          <thead>
            <tr>
              <Th sortKey="nome_fantasia" activeSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort}>Nome Fantasia</Th>
              <Th sortKey="cnpj" activeSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort}>CNPJ</Th>
              <Th sortKey="cidade" activeSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort}>Cidade</Th>
              <Th sortKey="uf" activeSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort}>UF</Th>
              <Th>Telefone</Th>
              <Th style={{ textAlign: "right" }}>Ações</Th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ textAlign: "center", padding: "32px", color: "#94a3b8", fontSize: "13px" }}>Carregando...</td></tr>
            ) : filtradas.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  {todas.length === 0
                    ? <EmptyState message="Nenhuma empresa cadastrada." icon="🏢" action={<Btn href="/empresas/novo">+ Cadastrar primeira empresa</Btn>} />
                    : <EmptyState message="Nenhuma empresa encontrada para esta busca." icon="🔍" />
                  }
                </td>
              </tr>
            ) : (
              ordenadas.map(e => (
                <Tr key={e.id} onClick={() => router.push(`/empresas/${e.id}/editar`)}>
                  <Td>
                    {e.nome_fantasia}
                    {e.id === empresaId && <Badge variant="info"> ATUAL</Badge>}
                  </Td>
                  <Td>{e.cnpj ? fmtCnpj(e.cnpj) : "—"}</Td>
                  <Td>{e.cidade ?? "—"}</Td>
                  <Td>{e.uf ?? "—"}</Td>
                  <Td>{e.telefone ?? "—"}</Td>
                  <Td style={{ textAlign: "right" }}>
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
                      <a href={`/empresas/${e.id}/editar`} style={{ color: "#2563eb", textDecoration: "none", fontWeight: 600, fontSize: "inherit" }}>Editar</a>
                      {e.id !== empresaId && (
                        <DeleteBtn id={e.id} table="empresas" label="empresa" />
                      )}
                    </div>
                  </Td>
                </Tr>
              ))
            )}
          </tbody>
        </DataTable>
        </div>

        <MobileList count={filtradas.length} label="empresas">
          {loading ? null : ordenadas.map(e => (
            <MobileCard
              key={e.id}
              href={`/empresas/${e.id}/editar`}
              title={e.nome_fantasia ?? "Sem nome"}
              subtitle={e.cnpj ? fmtCnpj(e.cnpj) : "Sem CNPJ"}
              badge={e.id === empresaId ? <Badge variant="info">ATUAL</Badge> : undefined}
              details={[
                { label: "Cidade", value: e.cidade ?? "—" },
                { label: "UF", value: e.uf ?? "—" },
              ]}
            />
          ))}
        </MobileList>

        <MobileFAB href="/empresas/novo" label="Nova Empresa" />
      </div>
    </div>
  );
}
