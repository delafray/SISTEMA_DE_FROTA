"use client";

/**
 * Empresas × Gestor — quem gerencia qual empresa (popula usuario_empresas).
 * Marque as empresas que cada usuário comanda. Quem gerencia várias vê o fluxo
 * de caixa SOMADO delas. A secretária deve ter TODAS marcadas (vê tudo).
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PageHeader, Btn } from "@/components/ui/ds";

type Perfil = { id: string; nome: string };
type Empresa = { id: string; nome: string };

export default function EmpresasGestorPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [perfis, setPerfis] = useState<Perfil[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [vinc, setVinc] = useState<Set<string>>(new Set()); // "usuario_id|empresa_id"
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { router.push("/login"); return; }
      const [pf, emp, ue] = await Promise.all([
        supabase.from("perfis").select("id,nome").eq("ativo", true).order("nome"),
        supabase.from("empresas").select("id,nome_fantasia,razao_social").order("nome_fantasia"),
        supabase.from("usuario_empresas").select("usuario_id,empresa_id"),
      ]);
      setPerfis((pf.data ?? []).map((p) => ({ id: p.id, nome: p.nome ?? "(sem nome)" })));
      setEmpresas((emp.data ?? []).map((e) => ({ id: e.id, nome: e.nome_fantasia || e.razao_social || "(sem nome)" })));
      setVinc(new Set((ue.data ?? []).map((x) => `${x.usuario_id}|${x.empresa_id}`)));
      setLoading(false);
    };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tem = (uid: string, eid: string) => vinc.has(`${uid}|${eid}`);

  const toggle = async (uid: string, eid: string) => {
    const key = `${uid}|${eid}`;
    const tinha = vinc.has(key);
    setVinc((prev) => { const n = new Set(prev); if (tinha) n.delete(key); else n.add(key); return n; });
    if (tinha) {
      await supabase.from("usuario_empresas").delete().eq("usuario_id", uid).eq("empresa_id", eid);
    } else {
      const primeira = ![...vinc].some((k) => k.startsWith(uid + "|")); // 1ª empresa do user = padrão
      await supabase.from("usuario_empresas").insert({ usuario_id: uid, empresa_id: eid, is_padrao: primeira });
    }
  };

  const marcarTodas = async (uid: string, marcar: boolean) => {
    for (const e of empresas) {
      if (tem(uid, e.id) !== marcar) await toggle(uid, e.id);
    }
  };

  if (loading) return <div style={{ padding: 32, color: "#94a3b8" }}>Carregando…</div>;

  const th: React.CSSProperties = { padding: "8px 10px", fontSize: 12, fontWeight: 700, color: "#fff", background: "#1e293b", textAlign: "center", borderRight: "1px solid #334155" };
  const td: React.CSSProperties = { padding: "8px 10px", textAlign: "center", borderBottom: "1px solid #eef2f7", borderRight: "1px solid #f1f5f9" };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PageHeader title="Empresas × Gestor" actions={<Btn href="/autorizacoes" variant="ghost">← Autorizações</Btn>} />

      <div style={{ padding: "10px 16px", fontSize: 13, color: "#475569", background: "#f0f9ff", borderBottom: "1px solid #bae6fd" }}>
        Marque quais <b>empresas</b> cada <b>usuário</b> gerencia. Quem gerencia várias vê o <b>fluxo de caixa somado</b> delas e ignora o resto.
        A <b>secretária</b> deve ter <b>todas</b> marcadas (vê tudo). {empresas.length === 0 && <b style={{ color: "#b45309" }}>Cadastre as empresas primeiro em /empresas.</b>}
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: 16 }}>
        <table style={{ borderCollapse: "separate", borderSpacing: 0, background: "#fff", borderRadius: 8, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,.08)" }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: "left", minWidth: 200 }}>Usuário (gestor)</th>
              {empresas.map((e) => <th key={e.id} style={{ ...th, minWidth: 90 }}>{e.nome}</th>)}
              <th style={{ ...th, minWidth: 90 }}>Todas</th>
            </tr>
          </thead>
          <tbody>
            {perfis.map((p) => {
              const todas = empresas.length > 0 && empresas.every((e) => tem(p.id, e.id));
              return (
                <tr key={p.id}>
                  <td style={{ ...td, textAlign: "left", fontWeight: 600, color: "#1e293b" }}>{p.nome}</td>
                  {empresas.map((e) => (
                    <td key={e.id} style={td}>
                      <input type="checkbox" checked={tem(p.id, e.id)} onChange={() => toggle(p.id, e.id)} style={{ width: 18, height: 18, cursor: "pointer" }} />
                    </td>
                  ))}
                  <td style={td}>
                    <button type="button" onClick={() => marcarTodas(p.id, !todas)}
                      style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, border: "1px solid #cbd5e1", background: todas ? "#dcfce7" : "#fff", color: todas ? "#15803d" : "#475569", cursor: "pointer" }}>
                      {todas ? "✓ todas" : "marcar"}
                    </button>
                  </td>
                </tr>
              );
            })}
            {perfis.length === 0 && <tr><td style={td} colSpan={empresas.length + 2}>Nenhum usuário ativo.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
