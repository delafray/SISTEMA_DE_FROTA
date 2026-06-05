"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

type Aloc = { id: string; motorista_id: string | null; status: string; km_evento: number | null; inicio: string; fim: string | null };
type Mot = { id: string; nome: string; usuario_id: string | null; ativo: boolean };

const STATUS_LABEL: Record<string, string> = { operacional: "Operacional", parado: "Parado", manutencao: "Manutenção", inativo: "Inativo" };
const ACOES = [
  { v: "motorista", label: "Passar para outro motorista" },
  { v: "parado", label: "Deixar parado" },
  { v: "manutencao", label: "Mandar para manutenção" },
  { v: "inativo", label: "Inativar veículo" },
] as const;

const toLocal = (iso: string) => { const d = new Date(iso); const p = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
const fmt = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });

export default function VinculoResponsavel({ veiculoId, empresaId, kmAtual, onKm }: {
  veiculoId: string; empresaId: string; kmAtual: number | null; onKm: (km: number) => void;
}) {
  const supabase = createClient();
  const [alocs, setAlocs] = useState<Aloc[]>([]);
  const [mots, setMots] = useState<Mot[]>([]);
  const [popup, setPopup] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const load = useCallback(async () => {
    const [a, m] = await Promise.all([
      supabase.from("alocacoes").select("*").eq("veiculo_id", veiculoId).order("inicio", { ascending: false }),
      supabase.from("motoristas").select("id,nome,usuario_id,ativo").eq("empresa_id", empresaId).order("nome"),
    ]);
    setAlocs((a.data ?? []) as Aloc[]);
    setMots((m.data ?? []) as Mot[]);
  }, [veiculoId, empresaId, supabase]);

  useEffect(() => { load(); }, [load]);

  const atual = alocs.find((x) => x.fim === null) ?? null;
  const historico = alocs.filter((x) => x.fim !== null);
  const nomeMot = (idm: string | null) => mots.find((m) => m.id === idm)?.nome ?? "(motorista)";
  const motById = (idm: string | null) => mots.find((m) => m.id === idm);

  // popup form
  const [acao, setAcao] = useState<string>("motorista");
  const [motSel, setMotSel] = useState("");
  const [km, setKm] = useState("");
  const [dataEvento, setDataEvento] = useState("");
  const [erro, setErro] = useState("");

  const abrirPopup = () => {
    setAcao("motorista"); setMotSel(""); setErro("");
    setKm(kmAtual != null ? String(kmAtual) : "");
    setDataEvento(toLocal(new Date().toISOString()));
    setPopup(true);
  };

  const minData = atual ? toLocal(atual.inicio) : undefined;

  const confirmar = async () => {
    setErro("");
    if (acao === "motorista" && !motSel) { setErro("Escolha o motorista."); return; }
    const inicioISO = new Date(dataEvento).toISOString();
    if (atual && inicioISO < atual.inicio) { setErro("A data não pode ser anterior ao início do vínculo atual."); return; }
    const kmNum = km ? parseInt(km.replace(/\D/g, "")) : null;
    setSalvando(true);
    if (atual) await supabase.from("alocacoes").update({ fim: inicioISO }).eq("id", atual.id);
    await supabase.from("alocacoes").insert({
      veiculo_id: veiculoId,
      motorista_id: acao === "motorista" ? motSel : null,
      status: acao === "motorista" ? "operacional" : acao,
      km_evento: kmNum,
      inicio: inicioISO,
    });
    if (kmNum != null) { await supabase.from("veiculos").update({ km_atual: kmNum }).eq("id", veiculoId); onKm(kmNum); }
    setSalvando(false);
    setPopup(false);
    await load();
  };

  // ─── render ────────────────────────────────────────────────────────
  const Dot = ({ on }: { on: boolean }) => <span style={{ width: 9, height: 9, borderRadius: "50%", background: on ? "#16a34a" : "#f59e0b", display: "inline-block", flexShrink: 0 }} />;

  const atualMot = atual?.status === "operacional" ? motById(atual.motorista_id) : null;

  return (
    <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: 14, background: "#fff" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".06em" }}>Responsável atual</div>
            {atual ? (
              atual.status === "operacional" ? (
                <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 15, fontWeight: 700, color: "#1e293b" }}>
                  <Dot on={!!atualMot?.usuario_id} /> {nomeMot(atual.motorista_id)}
                  {!atualMot?.usuario_id && <span style={{ fontSize: 11, color: "#f59e0b", fontWeight: 600 }}>(sem usuário)</span>}
                </div>
              ) : (
                <div style={{ fontSize: 15, fontWeight: 700, color: "#b45309" }}>🔧 {STATUS_LABEL[atual.status] ?? atual.status}</div>
              )
            ) : <div style={{ fontSize: 14, color: "#94a3b8" }}>Sem vínculo</div>}
          </div>
          <div style={{ borderLeft: "1px solid #e2e8f0", paddingLeft: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".06em" }}>KM atual</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#1e293b" }}>{kmAtual != null ? kmAtual.toLocaleString("pt-BR") : "—"}</div>
          </div>
        </div>
        <button type="button" onClick={abrirPopup}
          style={{ padding: "8px 14px", background: "#1e40af", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
          {atual ? "Trocar / Retirar vínculo" : "Definir vínculo"}
        </button>
      </div>

      {/* Histórico compacto */}
      {historico.length > 0 && (
        <div style={{ marginTop: 12, borderTop: "1px solid #f1f5f9", paddingTop: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 4 }}>Histórico</div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {historico.map((h) => (
              <div key={h.id} style={{ display: "flex", gap: 10, fontSize: 12, color: "#475569", padding: "3px 0", borderBottom: "1px solid #f8fafc" }}>
                <span style={{ minWidth: 150, fontWeight: 600 }}>
                  {h.status === "operacional" ? nomeMot(h.motorista_id) : (STATUS_LABEL[h.status] ?? h.status)}
                </span>
                <span style={{ color: "#94a3b8" }}>{fmt(h.inicio)} → {h.fim ? fmt(h.fim) : "agora"}</span>
                <span style={{ marginLeft: "auto", color: "#64748b" }}>{h.km_evento != null ? `KM ${h.km_evento.toLocaleString("pt-BR")}` : ""}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Popup */}
      {popup && (
        <div onClick={() => setPopup(false)} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 460, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid #e2e8f0", fontWeight: 700, fontSize: 14 }}>Trocar vínculo do veículo</div>
            <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
              {erro && <div style={{ padding: "8px 12px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, color: "#b91c1c", fontSize: 12 }}>{erro}</div>}

              <div>
                <label style={lbl}>O que fazer com o caminhão?</label>
                <select value={acao} onChange={(e) => setAcao(e.target.value)} style={inp}>
                  {ACOES.map((a) => <option key={a.v} value={a.v}>{a.label}</option>)}
                </select>
              </div>

              {acao === "motorista" && (
                <div>
                  <label style={lbl}>Motorista (🟢 com usuário · 🟠 sem usuário)</label>
                  <select value={motSel} onChange={(e) => setMotSel(e.target.value)} style={inp}>
                    <option value="">— selecione —</option>
                    {mots.filter((m) => m.ativo).map((m) => <option key={m.id} value={m.id}>{m.usuario_id ? "🟢" : "🟠"} {m.nome}</option>)}
                  </select>
                </div>
              )}

              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={lbl}>KM no momento</label>
                  <input value={km} onChange={(e) => setKm(e.target.value)} inputMode="numeric" style={inp} />
                </div>
                <div style={{ flex: 1.4 }}>
                  <label style={lbl}>Data/hora do evento</label>
                  <input type="datetime-local" value={dataEvento} min={minData} onChange={(e) => setDataEvento(e.target.value)} style={inp} />
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" onClick={() => setDataEvento(toLocal(new Date().toISOString()))} style={chip}>Agora</button>
                {atual && <button type="button" onClick={() => setDataEvento(toLocal(atual.inicio))} style={chip}>Início do atual ({fmt(atual.inicio)})</button>}
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
                <button type="button" style={btnGhost} onClick={() => setPopup(false)}>Cancelar</button>
                <button type="button" style={btnPri} onClick={confirmar} disabled={salvando}>{salvando ? "Salvando..." : "Confirmar"}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const lbl: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 600, color: "#475569", marginBottom: 4 };
const inp: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "1px solid #cbd5e1", borderRadius: 8, fontSize: 13, boxSizing: "border-box" };
const chip: React.CSSProperties = { padding: "5px 10px", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 6, color: "#1d4ed8", fontSize: 11, fontWeight: 600, cursor: "pointer" };
const btnPri: React.CSSProperties = { padding: "8px 14px", background: "#1e40af", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 };
const btnGhost: React.CSSProperties = { padding: "8px 14px", background: "#fff", color: "#475569", border: "1px solid #cbd5e1", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 };
