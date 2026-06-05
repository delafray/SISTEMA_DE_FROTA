"use client";

/**
 * Autorizações — matriz telefone × permissões (REAL, persiste no Supabase).
 * Por enquanto: Ativo + Anotar. As regras (níveis Consultar/Modificar/Criar)
 * aparecem como colunas conforme você cria regras em /regras.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { telefoneCanonico, telefoneExibicao } from "@/lib/utils/telefone";
import { ordenarAcoes } from "@/lib/schemas/regra";

type Nivel = string;
const META: Record<string, { label: string; short: string; bg: string; color: string; border: string }> = {
  "":        { label: "—",         short: "",  bg: "transparent", color: "#cbd5e1", border: "#e2e8f0" },
  consultar: { label: "Consultar", short: "C", bg: "#dbeafe",     color: "#1d4ed8", border: "#93c5fd" },
  alterar:   { label: "Alterar",   short: "A", bg: "#fef3c7",     color: "#b45309", border: "#fcd34d" },
  registrar: { label: "Registrar", short: "R", bg: "#dcfce7",     color: "#15803d", border: "#86efac" },
};

type Regra = { id: string; nome: string; tipo: string; acoes: string[] };
type Perfil = { id: string; nome: string | null };
type Tel = {
  id: string; telefone: string; telefone_exibicao: string | null;
  usuario_id: string | null; usuario_nome: string | null;
  ativo: boolean; anotar: boolean; permissoes: Record<string, string>;
};

const COL_TEL = 132, COL_USR = 150, COL = 30, ROW_H = 26, HEAD_H = 140;
const headBg = "#1e293b";

export default function AutorizacoesPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [regras, setRegras]   = useState<Regra[]>([]);
  const [perfis, setPerfis]   = useState<Perfil[]>([]);
  const [tels, setTels]       = useState<Tel[]>([]);
  const [loading, setLoading] = useState(true);
  const [tip, setTip] = useState<{ x: number; y: number; i: number } | null>(null);
  const [telModal, setTelModal] = useState<{ mode: "edit" | "novo"; id?: string; valor: string } | null>(null);
  const [usrModal, setUsrModal] = useState<{ id: string } | null>(null);

  const mapRow = (r: Tel): Tel => ({ ...r, permissoes: (r.permissoes as Record<string, string>) ?? {} });

  useEffect(() => {
    const load = async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { router.push("/login"); return; }
      const [rg, tl, pf] = await Promise.all([
        supabase.from("regras").select("id,nome,tipo,acoes").eq("ativa", true).order("prioridade", { ascending: false }).order("nome"),
        supabase.from("telefones").select("*").order("criado_em"),
        supabase.from("perfis").select("id,nome").order("nome"),
      ]);
      // regras tipo 'anotar' são o flag Anotar (coluna fixa) — não viram coluna que cicla.
      setRegras(((rg.data ?? []) as Regra[]).filter((r) => r.tipo !== "anotar"));
      setTels(((tl.data ?? []) as Tel[]).map(mapRow));
      setPerfis((pf.data ?? []) as Perfil[]);
      setLoading(false);
    };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const patch = async (id: string, fields: Partial<Tel>) => {
    setTels((p) => p.map((t) => (t.id === id ? { ...t, ...fields } : t)));
    await supabase.from("telefones").update({ ...fields, atualizado_em: new Date().toISOString() }).eq("id", id);
  };

  const ciclar = (tel: Tel, regra: Regra) => {
    if (!tel.ativo) return;
    const ciclo = ["", ...ordenarAcoes(regra.acoes ?? [])];   // cicla só pelas ações da regra
    const atual = ciclo.indexOf(tel.permissoes[regra.id] ?? "");
    const prox = ciclo[(atual + 1) % ciclo.length] ?? "";
    const novo = { ...tel.permissoes };
    if (prox === "") delete novo[regra.id]; else novo[regra.id] = prox;
    patch(tel.id, { permissoes: novo });
  };

  const salvarTel = async () => {
    if (!telModal) return;
    const canon = telefoneCanonico(telModal.valor);
    if (!canon) return;
    const exib = telefoneExibicao(canon);
    if (telModal.mode === "novo") {
      const { data, error } = await supabase.from("telefones")
        .insert({ telefone: canon, telefone_exibicao: exib, ativo: true, anotar: true, permissoes: {} })
        .select().single();
      if (error) { alert(error.message); return; }
      if (data) setTels((p) => [...p, mapRow(data as Tel)]);
    } else if (telModal.id) {
      await patch(telModal.id, { telefone: canon, telefone_exibicao: exib });
    }
    setTelModal(null);
  };

  const escolherUsr = async (u: Perfil | null) => {
    if (!usrModal) return;
    await patch(usrModal.id, { usuario_id: u?.id ?? null, usuario_nome: u?.nome ?? null });
    setUsrModal(null);
  };

  const contagem = useMemo(() => {
    const ativos = tels.filter((t) => t.ativo);
    return {
      ativo: ativos.length,
      anotar: ativos.filter((t) => t.anotar).length,
      regras: regras.map((rg) => ativos.filter((t) => (t.permissoes[rg.id] ?? "") !== "").length),
    };
  }, [tels, regras]);

  const cell: React.CSSProperties = { borderBottom: "1px solid #eef2f7", borderRight: "1px solid #f1f5f9", padding: 0, textAlign: "center", height: ROW_H };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "#f8fafc", fontSize: 11 }}>
      <div style={{ padding: "8px 14px", borderBottom: "1px solid #e2e8f0", background: "#fff" }}>
        <div style={{ fontSize: 15, fontWeight: 800 }}>🛡️ Autorizações — Telefones × Permissões</div>
        <div style={{ display: "flex", gap: 12, marginTop: 6, flexWrap: "wrap", alignItems: "center", color: "#64748b" }}>
          {(["consultar", "alterar", "registrar"] as Nivel[]).map((n) => (
            <span key={n} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 16, height: 16, borderRadius: 4, background: META[n].bg, border: `1px solid ${META[n].border}`, color: META[n].color, fontWeight: 800, fontSize: 10, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{META[n].short}</span>
              {META[n].label}
            </span>
          ))}
          <span>• <b>Ativo</b> destrava o número • clique no telefone p/ editar • no usuário p/ vincular • {regras.length === 0 ? "crie regras em /regras p/ ganhar colunas" : "passe o mouse na regra p/ detalhe"}</span>
        </div>
      </div>

      <div style={{ flex: 1, overflow: "auto" }}>
        {loading ? (
          <div style={{ padding: 32, color: "#94a3b8" }}>Carregando…</div>
        ) : (
        <table style={{ borderCollapse: "separate", borderSpacing: 0, width: "max-content" }}>
          <thead>
            <tr>
              <th style={{ position: "sticky", left: 0, top: 0, zIndex: 6, width: COL_TEL, minWidth: COL_TEL, background: headBg, color: "#fff", textAlign: "left", padding: "6px 8px", borderRight: "1px solid #334155" }}>Telefone</th>
              <th style={{ position: "sticky", left: COL_TEL, top: 0, zIndex: 6, width: COL_USR, minWidth: COL_USR, background: headBg, color: "#fff", textAlign: "left", padding: "6px 8px", borderRight: "2px solid #475569" }}>Usuário</th>
              {[{ n: "Ativo", bg: headBg }, { n: "Anotar", bg: "#0f766e" }].map((h, i) => (
                <th key={i} style={{ position: "sticky", top: 0, zIndex: 4, background: h.bg, color: "#fff", width: COL, minWidth: COL, height: HEAD_H, padding: 0, borderRight: i === 1 ? "2px solid #475569" : "1px solid #334155" }}>
                  <div style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", whiteSpace: "nowrap", margin: "0 auto", fontSize: 11, fontWeight: 700, padding: "6px 0" }}>{h.n}</div>
                </th>
              ))}
              {regras.map((rg, c) => (
                <th key={rg.id}
                  onMouseEnter={(e) => setTip({ x: e.clientX, y: e.clientY, i: c })}
                  onMouseMove={(e) => setTip({ x: e.clientX, y: e.clientY, i: c })}
                  onMouseLeave={() => setTip(null)}
                  style={{ position: "sticky", top: 0, zIndex: 4, background: headBg, color: "#e2e8f0", width: COL, minWidth: COL, height: HEAD_H, padding: 0, borderRight: "1px solid #334155", cursor: "help" }}>
                  <div style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", whiteSpace: "nowrap", margin: "0 auto", fontSize: 11, fontWeight: 600, padding: "6px 0" }}>{rg.nome}</div>
                </th>
              ))}
            </tr>
            <tr>
              <th style={{ position: "sticky", left: 0, top: HEAD_H, zIndex: 6, background: "#334155", color: "#cbd5e1", textAlign: "right", padding: "2px 8px", fontSize: 10, borderRight: "1px solid #475569" }}>RESUMO →</th>
              <th style={{ position: "sticky", left: COL_TEL, top: HEAD_H, zIndex: 6, background: "#334155", color: "#cbd5e1", padding: "2px 8px", fontSize: 10, borderRight: "2px solid #475569", textAlign: "left" }}>{tels.length} tel.</th>
              <th style={{ position: "sticky", top: HEAD_H, zIndex: 4, background: "#334155", color: "#7dd3fc", fontSize: 11, fontWeight: 800 }}>{contagem.ativo}</th>
              <th style={{ position: "sticky", top: HEAD_H, zIndex: 4, background: "#334155", color: "#5eead4", fontSize: 11, fontWeight: 800, borderRight: "2px solid #475569" }}>{contagem.anotar}</th>
              {contagem.regras.map((n, c) => (
                <th key={c} style={{ position: "sticky", top: HEAD_H, zIndex: 4, background: "#334155", color: "#cbd5e1", fontSize: 10, fontWeight: 700, borderRight: "1px solid #475569" }}>{n}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tels.map((t, i) => {
              const off = !t.ativo;
              const rowBg = off ? "#eef1f5" : (i % 2 === 1 ? "#eef3f9" : "#ffffff");
              const sticky: React.CSSProperties = { position: "sticky", zIndex: 3, background: rowBg };
              return (
                <tr key={t.id}>
                  <td onClick={() => setTelModal({ mode: "edit", id: t.id, valor: t.telefone_exibicao ?? t.telefone })}
                    style={{ ...cell, ...sticky, left: 0, textAlign: "left", padding: "2px 8px", fontWeight: 600, borderRight: "1px solid #e2e8f0", cursor: "pointer", opacity: off ? 0.6 : 1 }} title="Editar telefone">
                    {t.telefone_exibicao ?? t.telefone}
                  </td>
                  <td onClick={() => setUsrModal({ id: t.id })}
                    style={{ ...cell, ...sticky, left: COL_TEL, textAlign: "left", padding: "2px 8px", borderRight: "2px solid #cbd5e1", cursor: "pointer", opacity: off ? 0.6 : 1 }} title="Vincular/trocar usuário">
                    <div style={{ color: t.usuario_nome ? "#1e293b" : "#cbd5e1" }}>{t.usuario_nome ?? "— vincular —"}</div>
                  </td>
                  <td style={{ ...cell, background: rowBg }}>
                    <button onClick={() => patch(t.id, { ativo: !t.ativo })} title="Pode usar o sistema?" style={flag(t.ativo, "#16a34a")}>{t.ativo ? "✓" : ""}</button>
                  </td>
                  <td style={{ ...cell, background: rowBg, borderRight: "2px solid #cbd5e1" }}>
                    <button onClick={() => !off && patch(t.id, { anotar: !t.anotar })} disabled={off} title="Pode anotar?" style={flag(t.anotar && !off, "#0d9488", off)}>{t.anotar && !off ? "✓" : ""}</button>
                  </td>
                  {regras.map((rg) => {
                    const nv = (t.permissoes[rg.id] ?? "") as Nivel;
                    const m = META[nv];
                    return (
                      <td key={rg.id} style={{ ...cell, background: rowBg }}>
                        <button onClick={() => ciclar(t, rg)} disabled={off} title={off ? "Telefone inativo" : `${rg.nome}: ${m.label}`}
                          style={{ width: "100%", height: ROW_H, border: "none", cursor: off ? "not-allowed" : "pointer", background: off ? "transparent" : m.bg, color: m.color, fontWeight: 800, fontSize: 12 }}>
                          {off ? "" : m.short}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {/* Inserir telefone */}
            <tr>
              <td onClick={() => setTelModal({ mode: "novo", valor: "" })}
                style={{ ...cell, position: "sticky", left: 0, zIndex: 3, background: "#f0fdf4", textAlign: "left", padding: "2px 8px", color: "#16a34a", fontWeight: 700, cursor: "pointer", borderRight: "1px solid #e2e8f0" }} title="Inserir novo telefone">
                + telefone
              </td>
              <td style={{ ...cell, position: "sticky", left: COL_TEL, zIndex: 3, background: "#f0fdf4", color: "#94a3b8", padding: "2px 8px", borderRight: "2px solid #cbd5e1" }}>—</td>
              <td style={{ ...cell, background: "#f0fdf4" }} />
              <td style={{ ...cell, background: "#f0fdf4", borderRight: "2px solid #cbd5e1" }} />
              {regras.map((rg) => <td key={rg.id} style={{ ...cell, background: "#f0fdf4" }} />)}
            </tr>
          </tbody>
        </table>
        )}
      </div>

      {tip && regras[tip.i] && (
        <div style={{ position: "fixed", left: Math.min(tip.x + 14, (typeof window !== "undefined" ? window.innerWidth : 1200) - 280), top: tip.y + 14, width: 260, background: "#0f172a", color: "#e2e8f0", borderRadius: 8, padding: "10px 12px", zIndex: 50, boxShadow: "0 10px 30px rgba(0,0,0,0.35)", pointerEvents: "none" }}>
          <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 4 }}>{regras[tip.i].nome}</div>
          <div style={{ fontSize: 12, color: "#7dd3fc" }}>Ações: <b>{ordenarAcoes(regras[tip.i].acoes ?? []).map((a) => META[a].label).join(" → ") || "—"}</b></div>
        </div>
      )}

      {telModal && (
        <Modal onClose={() => setTelModal(null)} title={telModal.mode === "novo" ? "Novo telefone" : "Editar telefone"}>
          <label style={lbl}>Número (digite como quiser, eu normalizo)</label>
          <input autoFocus value={telModal.valor} onChange={(e) => setTelModal({ ...telModal, valor: e.target.value })} placeholder="31 98979-1317" style={inp} onKeyDown={(e) => e.key === "Enter" && salvarTel()} />
          {telModal.valor && <div style={{ fontSize: 11, color: "#64748b", marginTop: 6 }}>Vai salvar como: <b>{telefoneCanonico(telModal.valor)}</b> ({telefoneExibicao(telefoneCanonico(telModal.valor))})</div>}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
            <button style={btnGhost} onClick={() => setTelModal(null)}>Cancelar</button>
            <button style={btnPri} onClick={salvarTel}>{telModal.mode === "novo" ? "Inserir" : "Salvar"}</button>
          </div>
        </Modal>
      )}

      {usrModal && (
        <Modal onClose={() => setUsrModal(null)} title="Vincular usuário">
          <div style={{ maxHeight: 280, overflow: "auto", border: "1px solid #e2e8f0", borderRadius: 8 }}>
            <button style={{ ...usrItem, color: "#64748b" }} onClick={() => escolherUsr(null)}>— sem usuário (número solto) —</button>
            {perfis.length === 0 && <div style={{ padding: 12, color: "#94a3b8", fontSize: 12 }}>Nenhum usuário visível. Cadastre em <b>Usuários</b>.</div>}
            {perfis.map((u) => (
              <button key={u.id} style={usrItem} onClick={() => escolherUsr(u)}>
                <span style={{ fontWeight: 600 }}>{u.nome ?? "(sem nome)"}</span>
              </button>
            ))}
          </div>
          <div style={{ marginTop: 10, fontSize: 11, color: "#94a3b8" }}>Pra criar um usuário novo, use a tela <b>Usuários</b>.</div>
        </Modal>
      )}
    </div>
  );
}

function flag(on: boolean, cor: string, off = false): React.CSSProperties {
  return { width: 22, height: 22, borderRadius: 5, border: `2px solid ${on ? cor : "#cbd5e1"}`, background: on ? cor : "#fff", color: "#fff", fontWeight: 900, fontSize: 12, cursor: off ? "not-allowed" : "pointer", opacity: off ? 0.4 : 1 };
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 420, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontWeight: 700, fontSize: 14 }}>{title}</span>
          <button onClick={onClose} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 18, color: "#94a3b8" }}>✕</button>
        </div>
        <div style={{ padding: 16 }}>{children}</div>
      </div>
    </div>
  );
}

const lbl: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 600, color: "#475569", marginBottom: 4 };
const inp: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "1px solid #cbd5e1", borderRadius: 8, fontSize: 13, boxSizing: "border-box" };
const btnPri: React.CSSProperties = { padding: "8px 14px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 };
const btnGhost: React.CSSProperties = { padding: "8px 14px", background: "#fff", color: "#475569", border: "1px solid #cbd5e1", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 };
const usrItem: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", padding: "9px 12px", border: "none", borderBottom: "1px solid #f1f5f9", background: "#fff", cursor: "pointer", textAlign: "left", fontSize: 13 };
