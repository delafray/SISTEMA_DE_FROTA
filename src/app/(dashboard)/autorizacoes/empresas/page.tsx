"use client";

/**
 * Empresas × Gestor — quem gerencia qual empresa (popula usuario_empresas).
 * Marque as empresas que cada usuário comanda. Quem gerencia várias vê o fluxo
 * de caixa SOMADO delas. A secretária deve ter TODAS marcadas (vê tudo).
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { temSessao } from "@/lib/auth/temSessao";
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
  const [erroToggle, setErroToggle] = useState<string | null>(null);
  // Estado de loading por usuário durante marcarTodas
  const [marcarLoading, setMarcarLoading] = useState<Record<string, string | null>>({}); // uid → mensagem progresso ou null

  useEffect(() => {
    const load = async () => {
      if (!(await temSessao())) { router.replace("/login"); return; }
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
      const { error } = await supabase.from("usuario_empresas").delete().eq("usuario_id", uid).eq("empresa_id", eid);
      if (error) {
        setVinc((prev) => { const n = new Set(prev); n.add(key); return n; });
        setErroToggle("Não foi possível remover o vínculo. Tente novamente.");
      }
    } else {
      const primeira = ![...vinc].some((k) => k.startsWith(uid + "|")); // 1ª empresa do user = padrão
      const { error } = await supabase.from("usuario_empresas").insert({ usuario_id: uid, empresa_id: eid, is_padrao: primeira });
      if (error) {
        setVinc((prev) => { const n = new Set(prev); n.delete(key); return n; });
        setErroToggle("Não foi possível salvar o vínculo. Tente novamente.");
      }
    }
  };

  const marcarTodas = async (uid: string, marcar: boolean) => {
    if (marcarLoading[uid]) return; // proteção contra clique duplo
    const pendentes = empresas.filter((e) => tem(uid, e.id) !== marcar);
    if (pendentes.length === 0) return;
    let feitos = 0;
    setMarcarLoading((prev) => ({ ...prev, [uid]: `Salvando 0/${pendentes.length}…` }));
    for (const e of pendentes) {
      await toggle(uid, e.id);
      feitos++;
      setMarcarLoading((prev) => ({ ...prev, [uid]: `Salvando ${feitos}/${pendentes.length}…` }));
    }
    setMarcarLoading((prev) => ({ ...prev, [uid]: null }));
  };

  if (loading) return <div style={{ padding: 32, color: "#94a3b8" }}>Carregando…</div>;

  const th: React.CSSProperties = { padding: "8px 10px", fontSize: 12, fontWeight: 700, color: "#fff", background: "#1e293b", textAlign: "center", borderRight: "1px solid #334155" };
  const td: React.CSSProperties = { padding: "8px 10px", textAlign: "center", borderBottom: "1px solid #eef2f7", borderRight: "1px solid #f1f5f9" };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PageHeader title="Empresas × Gestor" actions={<Btn href="/autorizacoes" variant="ghost">← Autorizações</Btn>} />

      {erroToggle && (
        <div role="alert" style={{ padding: "10px 16px", background: "#fef2f2", borderBottom: "1px solid #fecaca", color: "#b91c1c", fontSize: 13, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>{erroToggle}</span>
          <button onClick={() => setErroToggle(null)} style={{ border: "none", background: "none", cursor: "pointer", color: "#b91c1c", fontWeight: 700, fontSize: 16, lineHeight: 1 }}>✕</button>
        </div>
      )}

      <div style={{ padding: "10px 16px", fontSize: 13, color: "#475569", background: "#f0f9ff", borderBottom: "1px solid #bae6fd" }}>
        Marque quais <b>empresas</b> cada <b>usuário</b> gerencia. Quem gerencia várias vê o <b>fluxo de caixa somado</b> delas e ignora o resto.
        A <b>secretária</b> deve ter <b>todas</b> marcadas (vê tudo). {empresas.length === 0 && <b style={{ color: "#b45309" }}>Cadastre as empresas primeiro em /empresas.</b>}
      </div>

      {/* ── Variante Desktop: tabela completa ─────────────────────────────── */}
      <div className="m-hide" style={{ flex: 1, overflow: "auto", padding: 16 }}>
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
              const progresso = marcarLoading[p.id];
              return (
                <tr key={p.id}>
                  <td style={{ ...td, textAlign: "left", fontWeight: 600, color: "#1e293b" }}>{p.nome}</td>
                  {empresas.map((e) => (
                    <td key={e.id} style={td}>
                      <label style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 44, minHeight: 44, cursor: "pointer" }}>
                        <input type="checkbox" checked={tem(p.id, e.id)} onChange={() => toggle(p.id, e.id)} style={{ width: 18, height: 18, cursor: "pointer" }} />
                      </label>
                    </td>
                  ))}
                  <td style={td}>
                    <button type="button" onClick={() => marcarTodas(p.id, !todas)}
                      disabled={!!progresso}
                      style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, border: "1px solid #cbd5e1", background: todas ? "#dcfce7" : "#fff", color: todas ? "#15803d" : "#475569", cursor: progresso ? "not-allowed" : "pointer", opacity: progresso ? 0.65 : 1, whiteSpace: "nowrap" }}>
                      {progresso ?? (todas ? "✓ todas" : "marcar")}
                    </button>
                  </td>
                </tr>
              );
            })}
            {perfis.length === 0 && <tr><td style={td} colSpan={empresas.length + 2}>Nenhum usuário ativo.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* ── Variante Mobile: cards por usuário com toggles de empresa ──────── */}
      <div className="m-show-block" style={{ flex: 1, overflow: "auto", padding: "12px" }}>
        {perfis.length === 0 && (
          <div style={{ textAlign: "center", padding: "32px 0", color: "#94a3b8", fontSize: 14 }}>
            Nenhum usuário ativo.
          </div>
        )}

        {perfis.map((p) => {
          const todas = empresas.length > 0 && empresas.every((e) => tem(p.id, e.id));
          const progresso = marcarLoading[p.id];
          const qtdAtivas = empresas.filter((e) => tem(p.id, e.id)).length;
          return (
            <div key={p.id} style={{ background: "#fff", borderRadius: 10, marginBottom: 10, boxShadow: "0 1px 4px rgba(0,0,0,.07)", border: "1px solid #e2e8f0", overflow: "hidden" }}>
              {/* Cabeçalho do card */}
              <div style={{ padding: "12px 14px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: "#1e293b" }}>{p.nome}</div>
                  <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                    {qtdAtivas} de {empresas.length} empresa{empresas.length !== 1 ? "s" : ""}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => marcarTodas(p.id, !todas)}
                  disabled={!!progresso || empresas.length === 0}
                  style={{ minHeight: 44, padding: "0 14px", borderRadius: 8, border: `1px solid ${todas ? "#86efac" : "#cbd5e1"}`, background: todas ? "#dcfce7" : "#f8fafc", color: todas ? "#15803d" : "#475569", fontWeight: 700, fontSize: 13, cursor: (progresso || empresas.length === 0) ? "not-allowed" : "pointer", opacity: progresso ? 0.65 : 1, whiteSpace: "nowrap" }}>
                  {progresso ?? (todas ? "✓ Todas" : "Marcar todas")}
                </button>
              </div>

              {/* Lista de empresas como toggles */}
              {empresas.length === 0 ? (
                <div style={{ padding: "12px 14px", fontSize: 12, color: "#94a3b8", fontStyle: "italic" }}>
                  Nenhuma empresa cadastrada.
                </div>
              ) : (
                empresas.map((e, idx) => {
                  const ativa = tem(p.id, e.id);
                  return (
                    <div key={e.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: 48, padding: "8px 14px", borderBottom: idx < empresas.length - 1 ? "1px solid #f8fafc" : "none" }}>
                      <div style={{ fontWeight: 500, fontSize: 14, color: "#1e293b" }}>{e.nome}</div>
                      <button
                        type="button"
                        onClick={() => toggle(p.id, e.id)}
                        disabled={!!progresso}
                        style={{ minWidth: 56, minHeight: 44, padding: "0 12px", borderRadius: 8, border: `2px solid ${ativa ? "#2563eb" : "#cbd5e1"}`, background: ativa ? "#2563eb" : "#fff", color: ativa ? "#fff" : "#64748b", fontWeight: 700, fontSize: 13, cursor: progresso ? "not-allowed" : "pointer", opacity: progresso ? 0.65 : 1 }}>
                        {ativa ? "✓ Sim" : "Não"}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
