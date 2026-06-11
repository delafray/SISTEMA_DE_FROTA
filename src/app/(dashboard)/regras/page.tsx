"use client";

import { useState, useEffect, useMemo, useDeferredValue } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { loadAll } from "@/lib/utils/loadAll";
import { normalizar } from "@/lib/utils/normalizar";
import { PageHeader, DataTable, Th, Td, Tr, Badge, Btn, EmptyState, SearchInput, useTableSort } from "@/components/ui/ds";
import { DeleteBtn } from "@/components/ui/DeleteBtn";
import { MobileCard, MobileList, MobileFAB } from "@/components/mobile";
import { REGRA_TIPO_LABEL, type RegraTipo } from "@/lib/schemas/regra";

type Regra = {
  id: string;
  nome: string;
  tipo: string;
  ativa: boolean;
  fixa: boolean;
  prioridade: number;
  frases_exemplo: string[] | null;
  quem_pode_disparar: string[] | null;
  empresas_alvo: string[] | null;
};

export default function RegrasPage() {
  const router = useRouter();
  const [todas, setTodas]     = useState<Regra[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca]     = useState("");
  const buscaDeferred = useDeferredValue(busca);

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { router.push("/login"); return; }

      const data = await loadAll<Regra>((from, to) =>
        supabase.from("regras")
          .select("id,nome,tipo,ativa,fixa,prioridade,frases_exemplo,quem_pode_disparar,empresas_alvo")
          .order("fixa", { ascending: false })
          .order("prioridade", { ascending: false })
          .order("nome")
          .range(from, to)
      );
      setTodas(data);
      setLoading(false);
    };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const haystack = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of todas) {
      m.set(r.id, normalizar([r.nome, r.tipo, ...(r.frases_exemplo ?? [])].join(" ")));
    }
    return m;
  }, [todas]);

  const filtradas = useMemo(() => {
    const termo = normalizar(buscaDeferred);
    const palavras = termo.split(/\s+/).filter(Boolean);
    if (palavras.length === 0) return todas;
    return todas.filter(r => {
      const h = haystack.get(r.id) ?? "";
      return palavras.every(p => h.includes(p));
    });
  }, [todas, haystack, buscaDeferred]);

  // Ordenação client-side (cadastro pequeno — carrega tudo de uma vez).
  // Sem padrão: a tela abre na ordem do servidor (fixa+prioridade+nome) e só
  // reordena quando o usuário clica num cabeçalho.
  const { sortedData: ordenadas, sortKey, sortDirection, handleSort } = useTableSort(filtradas, "", "asc");

  const tipoBadge = (t: string) => {
    const variant = t === "consultar" ? "info" : t === "registrar" ? "warning" : "success";
    return <Badge variant={variant}>{REGRA_TIPO_LABEL[t as RegraTipo] ?? t}</Badge>;
  };

  const alvo = (r: Regra) =>
    !r.empresas_alvo || r.empresas_alvo.length === 0
      ? "Todas"
      : `${r.empresas_alvo.length} empresa(s)`;

  const toolbar = (
    <div style={{ display: "flex", gap: "8px", alignItems: "center", flex: 1 }}>
      <SearchInput
        placeholder="Buscar por nome, tipo, frase..."
        value={busca}
        onChange={e => setBusca(e.target.value)}
      />
      <span style={{ fontSize: "11px", color: "#94a3b8", marginLeft: "auto", whiteSpace: "nowrap" }}>
        {filtradas.length} de {todas.length} regras
      </span>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PageHeader title="Regras (IA)" count={loading ? undefined : todas.length}>
        <Btn href="/regras/contexto" size="sm" variant="outline">🔎 Contexto IA</Btn>
        <Btn href="/regras/novo" size="sm">+ Nova Regra</Btn>
      </PageHeader>

      <div style={{ flex: 1, overflow: "auto", padding: "16px" }}>
        <div className="m-hide">
        <DataTable count={filtradas.length} label="regras" toolbar={toolbar}>
          <thead>
            <tr>
              <Th sortKey="nome" activeSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort}>Nome</Th>
              <Th sortKey="tipo" activeSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort}>Tipo</Th>
              <Th>Frases</Th>
              <Th>Empresas</Th>
              <Th sortKey="prioridade" activeSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort}>Prioridade</Th>
              <Th sortKey="ativa" activeSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort}>Status</Th>
              <Th style={{ textAlign: "right" }}>Ações</Th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ textAlign: "center", padding: "32px", color: "#94a3b8", fontSize: "13px" }}>Carregando...</td></tr>
            ) : filtradas.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  {todas.length === 0
                    ? <EmptyState message="Nenhuma regra cadastrada." icon="🧠" action={<Btn href="/regras/novo">+ Cadastrar primeira regra</Btn>} />
                    : <EmptyState message="Nenhuma regra encontrada para esta busca." icon="🔍" />
                  }
                </td>
              </tr>
            ) : (
              ordenadas.map(r => (
                <Tr key={r.id} onClick={() => router.push(`/regras/${r.id}/editar`)}>
                  <Td>{r.fixa && <span title="Regra fixa">🔒 </span>}{r.nome}</Td>
                  <Td>{tipoBadge(r.tipo)}</Td>
                  <Td>{r.frases_exemplo?.length ?? 0}</Td>
                  <Td>{alvo(r)}</Td>
                  <Td>{r.prioridade}</Td>
                  <Td>{r.ativa ? <Badge variant="success">Ativa</Badge> : <Badge variant="default">Inativa</Badge>}</Td>
                  <Td style={{ textAlign: "right" }}>
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
                      <a href={`/regras/${r.id}/editar`} style={{ color: "#2563eb", textDecoration: "none", fontWeight: 600, fontSize: "inherit" }}>Editar</a>
                      {!r.fixa && <DeleteBtn id={r.id} table="regras" label="regra" />}
                    </div>
                  </Td>
                </Tr>
              ))
            )}
          </tbody>
        </DataTable>
        </div>

        <MobileList count={filtradas.length} label="regras">
          {loading ? null : ordenadas.map(r => (
            <MobileCard
              key={r.id}
              href={`/regras/${r.id}/editar`}
              title={`${r.fixa ? "🔒 " : ""}${r.nome}`}
              subtitle={REGRA_TIPO_LABEL[r.tipo as RegraTipo] ?? r.tipo}
              badge={r.ativa ? <Badge variant="success">Ativa</Badge> : <Badge variant="default">Inativa</Badge>}
              details={[
                { label: "Frases", value: String(r.frases_exemplo?.length ?? 0) },
                { label: "Empresas", value: alvo(r) },
                { label: "Prioridade", value: String(r.prioridade) },
              ]}
            />
          ))}
        </MobileList>

        <MobileFAB href="/regras/novo" label="Nova Regra" />
      </div>
    </div>
  );
}
