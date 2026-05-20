"use client";

import { useState, useEffect, useMemo, useDeferredValue } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { loadAll } from "@/lib/utils/loadAll";
import { normalizar } from "@/lib/utils/normalizar";
import { PageHeader, DataTable, Th, Td, Tr, Badge, Btn, EmptyState, SearchInput, selectStyle } from "@/components/ui/ds";
import { DeleteBtn } from "@/components/ui/DeleteBtn";
import { MobileCard, MobileList, MobileFAB } from "@/components/mobile";

type Motorista = {
  id: string; nome: string; cpf: string; cnh_numero: string | null;
  cnh_categoria: string | null; cnh_validade: string | null;
  cargo: string | null; ativo: boolean | null;
};

export default function MotoristasPage() {
  const router = useRouter();
  const [todos, setTodos]     = useState<Motorista[]>([]);
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

      const data = await loadAll<Motorista>((from, to) =>
        supabase.from("motoristas").select("id,nome,cpf,cnh_numero,cnh_categoria,cnh_validade,cargo,ativo")
          .eq("empresa_id", ue.empresa_id).order("nome").range(from, to)
      );
      setTodos(data);
      setLoading(false);
    };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const haystack = useMemo(() => {
    const m = new Map<string, string>();
    for (const mt of todos) {
      m.set(mt.id, normalizar([mt.nome, mt.cpf, mt.cnh_numero, mt.cargo, mt.cnh_categoria].join(" ")));
    }
    return m;
  }, [todos]);

  const filtrados = useMemo(() => {
    const termo = normalizar(buscaDeferred);
    const palavras = termo.split(/\s+/).filter(Boolean);
    return todos.filter(mt => {
      if (filtroAtivo === "true"  && !mt.ativo) return false;
      if (filtroAtivo === "false" && mt.ativo)  return false;
      if (palavras.length === 0) return true;
      const h = haystack.get(mt.id) ?? "";
      return palavras.every(p => h.includes(p));
    });
  }, [todos, haystack, buscaDeferred, filtroAtivo]);

  const toolbar = (
    <div style={{ display: "flex", gap: "8px", alignItems: "center", flex: 1 }}>
      <SearchInput
        placeholder="Buscar por nome, CPF, CNH, cargo..."
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
        {filtrados.length} de {todos.length} motoristas
      </span>
    </div>
  );

  // eslint-disable-next-line react-hooks/purity -- Date.now() é a fonte do "agora" para cálculo de dias até CNH vencer
  const agora = useMemo(() => Date.now(), [todos]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PageHeader title="Motoristas" subtitle="Gerencie os motoristas da frota" count={loading ? undefined : todos.length}>
        <Btn href="/motoristas/novo" size="sm">+ Cadastrar Motorista</Btn>
      </PageHeader>

      <div style={{ flex: 1, overflow: "auto", padding: "16px" }}>
        {/* Desktop: tabela */}
        <div className="m-hide">
        <DataTable count={filtrados.length} label="motoristas" toolbar={toolbar}>
          <thead>
            <tr>
              <Th>Nome</Th>
              <Th>CPF</Th>
              <Th>CNH</Th>
              <Th>Cat. CNH</Th>
              <Th>Vencimento CNH</Th>
              <Th>Status</Th>
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
                    ? <EmptyState message="Nenhum motorista cadastrado." icon="👤" action={<Btn href="/motoristas/novo">+ Cadastrar primeiro motorista</Btn>} />
                    : <EmptyState message="Nenhum motorista encontrado para esta busca." icon="🔍" />
                  }
                </td>
              </tr>
            ) : (
              filtrados.map(m => {
                const cnhDate = m.cnh_validade ? new Date(m.cnh_validade + "T00:00:00") : null;
                const diasCnh = cnhDate ? Math.ceil((cnhDate.getTime() - agora) / 86400000) : null;
                const cnhVar  = diasCnh === null ? "default" : diasCnh < 0 ? "danger" : diasCnh < 30 ? "warning" : "success";

                return (
                  <Tr key={m.id}>
                    <Td>{m.nome}</Td>
                    <Td>{m.cpf}</Td>
                    <Td>{m.cnh_numero ?? "—"}</Td>
                    <Td>{m.cnh_categoria ?? "—"}</Td>
                    <Td>
                      {cnhDate
                        ? <Badge variant={cnhVar}>{cnhDate.toLocaleDateString("pt-BR")}</Badge>
                        : <span style={{ color: "#cbd5e1" }}>—</span>}
                    </Td>
                    <Td><Badge variant={m.ativo ? "success" : "default"}>{m.ativo ? "ATIVO" : "INATIVO"}</Badge></Td>
                    <Td style={{ textAlign: "right" }}>
                      <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
                        <a href={`/motoristas/${m.id}/editar`} style={{ color: "#2563eb", textDecoration: "none", fontWeight: 600, fontSize: "inherit" }}>Editar</a>
                        <DeleteBtn id={m.id} table="motoristas" label="motorista" />
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
        <MobileList count={filtrados.length} label="motoristas">
          {loading ? null : filtrados.map(m => {
            const cnhDate = m.cnh_validade ? new Date(m.cnh_validade + "T00:00:00") : null;
            const diasCnh = cnhDate ? Math.ceil((cnhDate.getTime() - agora) / 86400000) : null;
            const cnhVar  = diasCnh === null ? "default" as const : diasCnh < 0 ? "danger" as const : diasCnh < 30 ? "warning" as const : "success" as const;
            return (
              <MobileCard
                key={m.id}
                href={`/motoristas/${m.id}/editar`}
                title={m.nome}
                subtitle={m.cargo ?? "Motorista"}
                badge={<Badge variant={m.ativo ? "success" : "default"}>{m.ativo ? "Ativo" : "Inativo"}</Badge>}
                highlight={!m.ativo ? "#cbd5e1" : undefined}
                details={[
                  { label: "CNH", value: m.cnh_categoria ?? "—" },
                  { label: "Venc. CNH", value: cnhDate ? <Badge variant={cnhVar}>{cnhDate.toLocaleDateString("pt-BR")}</Badge> : "—" },
                ]}
              />
            );
          })}
        </MobileList>

        <MobileFAB href="/motoristas/novo" label="Cadastrar Motorista" />
      </div>
    </div>
  );
}
