"use client";

import { useState, useEffect, useMemo, useDeferredValue } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { usuarioSessao } from "@/lib/auth/temSessao";
import { normalizar } from "@/lib/utils/normalizar";
import { PageHeader, DataTable, Th, Td, Tr, Badge, Btn, EmptyState, SearchInput, selectStyle, useTableSort } from "@/components/ui/ds";
import { RemoverUsuarioBtn } from "@/components/ui/RemoverUsuarioBtn";
import { MobileCard, MobileList, MobileFAB } from "@/components/mobile";

type Usuario = {
  usuario_id: string;
  role: string;
  is_padrao: boolean | null;
  empresa_id: string;
  perfis: { nome: string; login: string | null } | { nome: string; login: string | null }[] | null;
};

const ROLE_LABEL: Record<string, string> = { master: "Master", admin: "Admin", gestor: "Gestor", motorista: "Motorista" };
const ROLE_VAR: Record<string, "purple" | "info" | "success" | "default"> = {
  master: "purple", admin: "purple", gestor: "info", motorista: "success",
};

export default function UsuariosPage() {
  const router = useRouter();
  const [todos, setTodos]       = useState<Usuario[]>([]);
  const [meId, setMeId]         = useState("");
  const [empresaId, setEmpresaId] = useState("");
  const [loading, setLoading]   = useState(true);
  const [busca, setBusca]       = useState("");
  const [filtroRole, setFiltroRole] = useState("");
  const buscaDeferred = useDeferredValue(busca);

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const user = await usuarioSessao();
      if (!user) { router.replace("/login"); return; }
      setMeId(user.id);

      const { data: ue } = await supabase.from("usuario_empresas").select("empresa_id")
        .eq("usuario_id", user.id).eq("is_padrao", true).single();
      if (!ue?.empresa_id) return;
      setEmpresaId(ue.empresa_id);

      const { data } = await supabase
        .from("usuario_empresas")
        .select("role, is_padrao, usuario_id, perfis(nome, login), empresa_id")
        .eq("empresa_id", ue.empresa_id)
        .order("role");

      setTodos(data ?? []);
      setLoading(false);
    };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getNome = (u: Usuario) => {
    const p = Array.isArray(u.perfis) ? u.perfis[0] : u.perfis;
    return p?.nome ?? "";
  };

  const getLogin = (u: Usuario) => {
    const p = Array.isArray(u.perfis) ? u.perfis[0] : u.perfis;
    return p?.login ?? "";
  };

  const haystack = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of todos) {
      const nome = getNome(u);
      m.set(u.usuario_id, normalizar([nome, getLogin(u), u.role].join(" ")));
    }
    return m;
  }, [todos]);

  const filtrados = useMemo(() => {
    const termo = normalizar(buscaDeferred);
    const palavras = termo.split(/\s+/).filter(Boolean);
    return todos.filter(u => {
      if (filtroRole && u.role !== filtroRole) return false;
      if (palavras.length === 0) return true;
      const h = haystack.get(u.usuario_id) ?? "";
      return palavras.every(p => h.includes(p));
    });
  }, [todos, haystack, buscaDeferred, filtroRole]);

  // Ordenação client-side (cadastro pequeno — carrega tudo de uma vez).
  // "perfis.nome" funciona via dot-notation no useTableSort. Sem padrão: abre
  // na ordem do servidor; reordena só ao clicar no cabeçalho.
  const { sortedData: ordenados, sortKey, sortDirection, handleSort } = useTableSort(filtrados, "", "asc");

  const toolbar = (
    <div style={{ display: "flex", gap: "8px", alignItems: "center", flex: 1 }}>
      <SearchInput
        placeholder="Buscar por nome ou login..."
        value={busca}
        onChange={e => setBusca(e.target.value)}
      />
      <select value={filtroRole} onChange={e => setFiltroRole(e.target.value)}
        style={{ ...selectStyle, width: "150px" }}>
        <option value="">Todos os perfis</option>
        <option value="master">Master</option>
        <option value="gestor">Gestor</option>
        <option value="motorista">Motorista</option>
      </select>
      <span style={{ fontSize: "11px", color: "#94a3b8", marginLeft: "auto", whiteSpace: "nowrap" }}>
        {filtrados.length} de {todos.length} usuários
      </span>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PageHeader title="Usuários" count={loading ? undefined : todos.length}>
        <Btn href="/usuarios/novo" size="sm">+ Novo Usuário</Btn>
      </PageHeader>

      <div style={{ flex: 1, overflow: "auto", padding: "16px" }}>
        {/* Toolbar mobile — visível só no mobile, acima das cards */}
        <div className="m-show-block" style={{ marginBottom: "12px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <SearchInput
              placeholder="Buscar por nome ou login..."
              value={busca}
              onChange={e => setBusca(e.target.value)}
            />
            <select value={filtroRole} onChange={e => setFiltroRole(e.target.value)}
              style={{ ...selectStyle, width: "100%" }}>
              <option value="">Todos os perfis</option>
              <option value="master">Master</option>
              <option value="gestor">Gestor</option>
              <option value="motorista">Motorista</option>
            </select>
          </div>
        </div>

        <div className="m-hide">
        <DataTable count={filtrados.length} label="usuários" toolbar={toolbar}>
          <thead>
            <tr>
              <Th sortKey="perfis.nome" activeSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort}>Nome</Th>
              <Th sortKey="perfis.login" activeSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort}>Usuário (Login)</Th>
              <Th sortKey="role" activeSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort}>Role</Th>
              <Th>Padrão</Th>
              <Th style={{ textAlign: "right" }}>Ações</Th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{ textAlign: "center", padding: "32px", color: "#94a3b8", fontSize: "13px" }}>Carregando...</td></tr>
            ) : filtrados.length === 0 ? (
              <tr>
                <td colSpan={5}>
                  {todos.length === 0
                    ? <EmptyState message="Nenhum usuário cadastrado." icon="👥" action={<Btn href="/usuarios/novo">+ Cadastrar primeiro usuário</Btn>} />
                    : <EmptyState message="Nenhum usuário encontrado para esta busca." icon="🔍" />
                  }
                </td>
              </tr>
            ) : (
              ordenados.map(u => {
                const nome  = getNome(u);
                const isMe  = u.usuario_id === meId;
                return (
                  // O próprio usuário não tem tela de edição acessível — clique só para outros
                  <Tr key={u.usuario_id} onClick={isMe ? undefined : () => router.push(`/usuarios/${u.usuario_id}/editar`)}>
                    <Td>
                      {nome || "—"}
                      {isMe && <Badge variant="default"> VOCÊ</Badge>}
                    </Td>
                    <Td>{getLogin(u) || "—"}</Td>
                    <Td>
                      <Badge variant={ROLE_VAR[u.role] ?? "default"}>
                        {ROLE_LABEL[u.role] ?? u.role}
                      </Badge>
                    </Td>
                    <Td>
                      {u.is_padrao
                        ? <span style={{ color: "#16a34a", fontWeight: 600 }}>✓</span>
                        : <span style={{ color: "#cbd5e1" }}>—</span>}
                    </Td>
                    <Td style={{ textAlign: "right" }}>
                      {!isMe && (
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px" }}>
                          <Btn href={`/usuarios/${u.usuario_id}/editar`} variant="outline" size="xs">Editar</Btn>
                          <RemoverUsuarioBtn usuarioId={u.usuario_id} empresaId={empresaId} />
                        </div>
                      )}
                    </Td>
                  </Tr>
                );
              })
            )}
          </tbody>
        </DataTable>
        </div>

        <MobileList count={filtrados.length} label="usuários">
          {loading ? (
            <div style={{ textAlign: "center", padding: "32px", color: "#94a3b8", fontSize: "13px" }}>Carregando...</div>
          ) : ordenados.map(u => {
            const nome = getNome(u);
            const isMe = u.usuario_id === meId;
            return (
              <MobileCard
                key={u.usuario_id}
                // onClick (não href): card com botão dentro viraria <a> aninhado
                onClick={isMe ? undefined : () => router.push(`/usuarios/${u.usuario_id}/editar`)}
                title={nome || "—"}
                subtitle={getLogin(u)}
                badge={
                  <Badge variant={ROLE_VAR[u.role] ?? "default"}>
                    {ROLE_LABEL[u.role] ?? u.role}
                  </Badge>
                }
                highlight={isMe ? "#2563eb" : undefined}
                actions={!isMe ? (
                  <div onClick={e => e.stopPropagation()}>
                    <RemoverUsuarioBtn usuarioId={u.usuario_id} empresaId={empresaId} />
                  </div>
                ) : undefined}
              />
            );
          })}
        </MobileList>

        <MobileFAB href="/usuarios/novo" label="Novo Usuário" />
      </div>
    </div>
  );
}
