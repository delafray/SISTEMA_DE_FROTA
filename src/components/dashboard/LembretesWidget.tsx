"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

type Nota = { nota: string; criado_em: string };

type Lembrete = {
  id: string;
  texto: string;
  origem: string;
  criado_em: string;
  ciente_em: string | null;
  criado_por_nome: string | null;
  perfis: { nome: string } | { nome: string }[] | null;
  notas?: Nota[];
};

function fmtDataHora(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString("pt-BR")} às ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

function nomePerfil(l: Pick<Lembrete, "criado_por_nome" | "perfis">) {
  if (l.criado_por_nome) return l.criado_por_nome;
  const p = Array.isArray(l.perfis) ? l.perfis[0] : l.perfis;
  return p?.nome ?? "—";
}

// ─── Notas (providências) de um lembrete ─────────────────────────────
function NotasDoLembrete({ notas }: { notas?: Nota[] }) {
  if (!notas || notas.length === 0) return null;
  return (
    <div style={{ marginTop: "6px", display: "flex", flexDirection: "column", gap: "3px" }}>
      {notas.map((n, i) => (
        <div key={i} style={{
          fontSize: "12px", color: "#475569", background: "#fff",
          border: "1px solid #e2e8f0", borderRadius: "6px", padding: "5px 8px",
          wordBreak: "break-word",
        }}>
          📝 {n.nota}
          <span style={{ color: "#94a3b8", marginLeft: "6px", fontSize: "11px" }}>
            {fmtDataHora(n.criado_em)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Modal Ciente (providência → ocultar ou manter) ──────────────────
// Pedido do dono (11/06): ciente não pode só sumir — abre popup pra anotar a
// providência tomada (ou a tomar) e escolher ocultar ou manter na tela.
// Num lembrete JÁ ciente (aberto pelo Histórico), "manter na tela" desfaz a
// ciência e ele volta pros pendentes do painel ("dei ciência errada").
function CienteModal({
  lembrete,
  onClose,
  onDone,
}: {
  lembrete: Lembrete;
  onClose: () => void;
  // ocultar=true → some do painel; false → fica/volta pendente na tela
  onDone: (id: string, nota: string, ocultar: boolean) => void;
}) {
  const [nota, setNota]         = useState("");
  const [salvando, setSalvando] = useState(false);
  const jaCiente = !!lembrete.ciente_em;
  // Pendente + sem nota → "manter na tela" seria um clique vazio; já ciente,
  // o botão sempre faz algo (reabre), então libera mesmo sem nota.
  const manterDesabilitado = !jaCiente && nota.trim().length === 0;

  const salvar = async (ocultar: boolean) => {
    setSalvando(true);
    await fetch(`/api/lembretes/${lembrete.id}/ciente`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nota: nota.trim(), ocultar }),
    });
    onDone(lembrete.id, nota.trim(), ocultar);
    onClose();
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
        zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center",
        padding: "16px",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "#fff", borderRadius: "14px", width: "100%", maxWidth: 480,
          boxShadow: "0 20px 60px rgba(0,0,0,0.25)", padding: "20px",
          display: "flex", flexDirection: "column", gap: "12px",
        }}
      >
        <div style={{ fontWeight: 700, fontSize: "15px", color: "#1e293b" }}>
          {jaCiente ? "↩️ Reabrir lembrete" : "✅ Dar ciente"}
        </div>

        <div style={{
          fontSize: "13px", color: "#475569", background: "#fffbeb",
          border: "1px solid #fde68a", borderRadius: "8px", padding: "10px 12px",
          wordBreak: "break-word",
        }}>
          📌 {lembrete.texto}
        </div>

        <div>
          <label style={{ fontSize: "12px", fontWeight: 600, color: "#475569", display: "block", marginBottom: "4px" }}>
            Qual providência você tomou (ou vai tomar)?
          </label>
          <textarea
            value={nota}
            onChange={e => setNota(e.target.value)}
            rows={3}
            autoFocus
            placeholder="Ex.: já paguei o IPVA / vou levar no mecânico sexta-feira"
            style={{
              width: "100%", border: "1px solid #cbd5e1", borderRadius: "8px",
              padding: "8px 10px", fontSize: "13px", color: "#1e293b",
              resize: "vertical", fontFamily: "inherit", boxSizing: "border-box",
            }}
          />
        </div>

        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            disabled={salvando}
            style={{
              padding: "8px 14px", background: "none", border: "1px solid #e2e8f0",
              borderRadius: "8px", fontSize: "12px", fontWeight: 600,
              color: "#64748b", cursor: "pointer",
            }}
          >
            Cancelar
          </button>
          <button
            onClick={() => salvar(false)}
            disabled={salvando || manterDesabilitado}
            title={manterDesabilitado ? "Escreva a providência pra manter na tela" : undefined}
            style={{
              padding: "8px 14px",
              background: salvando || manterDesabilitado ? "#fef3c7" : "#f59e0b",
              color: salvando || manterDesabilitado ? "#b45309" : "#fff",
              border: "none", borderRadius: "8px", fontSize: "12px", fontWeight: 600,
              cursor: salvando || manterDesabilitado ? "default" : "pointer",
            }}
          >
            {salvando ? "..." : jaCiente ? "📌 Salvar e voltar pra tela" : "📌 Salvar e manter na tela"}
          </button>
          <button
            onClick={() => salvar(true)}
            disabled={salvando}
            style={{
              padding: "8px 14px",
              background: salvando ? "#d1d5db" : "#16a34a",
              color: "#fff", border: "none", borderRadius: "8px",
              fontSize: "12px", fontWeight: 600,
              cursor: salvando ? "default" : "pointer",
            }}
          >
            {salvando ? "..." : jaCiente ? "✅ Salvar e manter oculto" : "✅ Ciente e ocultar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal Histórico ─────────────────────────────────────────────────
function HistoricoModal({ onClose }: { onClose: () => void }) {
  const [todos, setTodos]           = useState<Lembrete[]>([]);
  const [loading, setLoading]       = useState(true);
  const [cienteAlvo, setCienteAlvo] = useState<Lembrete | null>(null);

  useEffect(() => {
    fetch('/api/lembretes?historico=true', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => { setTodos(d.lembretes ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const aoDarCiente = (id: string, nota: string, ocultar: boolean) => {
    setTodos(prev => prev.map(l => {
      if (l.id !== id) return l;
      return {
        ...l,
        // ocultar=false zera a ciência — o lembrete volta pros pendentes
        ciente_em: ocultar ? new Date().toISOString() : null,
        notas: nota ? [...(l.notas ?? []), { nota, criado_em: new Date().toISOString() }] : l.notas,
      };
    }));
  };

  const pendentes  = todos.filter(l => !l.ciente_em);
  const concluidos = todos.filter(l =>  l.ciente_em);

  return (
    // Backdrop
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
        zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center",
        padding: "16px",
      }}
    >
      {/* Modal */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "#fff", borderRadius: "14px", width: "100%", maxWidth: 560,
          maxHeight: "80vh", display: "flex", flexDirection: "column",
          boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
        }}
      >
        {/* Header */}
        <div style={{
          padding: "16px 20px", borderBottom: "1px solid #e2e8f0",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <span style={{ fontWeight: 700, fontSize: "15px", color: "#1e293b" }}>
            📋 Histórico de Lembretes
          </span>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: "20px", color: "#94a3b8", lineHeight: 1 }}
          >✕</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: "16px" }}>
          {loading && (
            <div style={{ textAlign: "center", color: "#94a3b8", padding: "24px" }}>Carregando...</div>
          )}

          {!loading && todos.length === 0 && (
            <div style={{ textAlign: "center", color: "#94a3b8", padding: "24px", fontSize: "13px" }}>
              Nenhum lembrete registrado ainda.
            </div>
          )}

          {/* Pendentes */}
          {pendentes.length > 0 && (
            <div>
              <div style={{ fontSize: "10px", fontWeight: 700, color: "#92400e", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "8px" }}>
                📌 Pendentes ({pendentes.length})
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {pendentes.map(l => (
                  <div key={l.id} style={{
                    display: "flex", alignItems: "flex-start", gap: "10px",
                    padding: "10px 12px", background: "#fffbeb",
                    border: "1px solid #fde68a", borderRadius: "8px",
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "13px", fontWeight: 600, color: "#1e293b", wordBreak: "break-word" }}>
                        {l.texto}
                      </div>
                      <div style={{ fontSize: "11px", color: "#92400e", marginTop: "3px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
                        <span>👤 {nomePerfil(l)}</span>
                        <span>{fmtDataHora(l.criado_em)}</span>
                        <span style={{ opacity: 0.7 }}>{l.origem === "whatsapp" ? "via WhatsApp" : l.origem === "app_motorista" ? "via app do motorista" : "via painel"}</span>
                      </div>
                      <NotasDoLembrete notas={l.notas} />
                    </div>
                    <button
                      onClick={() => setCienteAlvo(l)}
                      style={{
                        flexShrink: 0, padding: "5px 10px",
                        background: "#16a34a",
                        color: "#fff", border: "none", borderRadius: "6px",
                        fontSize: "11px", fontWeight: 600,
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                      }}
                    >
                      ✅ Ciente
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Concluídos */}
          {concluidos.length > 0 && (
            <div>
              <div style={{ fontSize: "10px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "8px" }}>
                ✅ Ciente ({concluidos.length})
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {concluidos.map(l => (
                  <div key={l.id} style={{
                    display: "flex", alignItems: "flex-start", gap: "10px",
                    padding: "10px 12px", background: "#f8fafc",
                    border: "1px solid #e2e8f0", borderRadius: "8px",
                    opacity: 0.75,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "13px", color: "#475569", wordBreak: "break-word" }}>
                        {l.texto}
                      </div>
                      <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "3px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
                        <span>👤 {nomePerfil(l)}</span>
                        <span>{fmtDataHora(l.criado_em)}</span>
                        {l.ciente_em && <span>✅ Ciente em {fmtDataHora(l.ciente_em)}</span>}
                      </div>
                      <NotasDoLembrete notas={l.notas} />
                    </div>
                    <button
                      onClick={() => setCienteAlvo(l)}
                      title="Anotar providência ou voltar pros pendentes"
                      style={{
                        flexShrink: 0, padding: "5px 10px",
                        background: "none", border: "1px solid #cbd5e1",
                        color: "#475569", borderRadius: "6px",
                        fontSize: "11px", fontWeight: 600,
                        cursor: "pointer", whiteSpace: "nowrap",
                      }}
                    >
                      ↩️ Reabrir
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {cienteAlvo && (
        <CienteModal
          lembrete={cienteAlvo}
          onClose={() => setCienteAlvo(null)}
          onDone={aoDarCiente}
        />
      )}
    </div>
  );
}

// ─── Widget principal ────────────────────────────────────────────────
export function LembretesWidget() {
  const [lembretes, setLembretes]   = useState<Lembrete[]>([]);
  const [cienteAlvo, setCienteAlvo] = useState<Lembrete | null>(null);
  const [modalAberto, setModal]     = useState(false);

  const carregar = useCallback(async () => {
    try {
      const res = await fetch('/api/lembretes', { cache: 'no-store' });
      const { lembretes: data } = await res.json();
      setLembretes(data ?? []);
    } catch { /* ignora */ }
  }, []);

  // Atualização INSTANTÂNEA via Supabase Realtime — SEM polling. O banco empurra
  // um evento a cada INSERT/UPDATE/DELETE em `lembretes` (o Vercel grava → o
  // Postgres dispara → esta página recarrega na hora). Requer a tabela na
  // publication `supabase_realtime` (ver migration_lembretes_sem_trava.sql).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar();

    const supabase = createClient();
    const canal = supabase
      .channel('lembretes-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'lembretes' },
        () => { carregar(); }
      )
      .subscribe();

    // Recarrega ao voltar pra aba (rede do realtime pode cair em segundo plano).
    const aoVoltar = () => { if (document.visibilityState === 'visible') carregar(); };
    document.addEventListener('visibilitychange', aoVoltar);
    window.addEventListener('focus', carregar);

    return () => {
      supabase.removeChannel(canal);
      document.removeEventListener('visibilitychange', aoVoltar);
      window.removeEventListener('focus', carregar);
    };
  }, [carregar]);

  const aoDarCiente = (id: string, nota: string, ocultar: boolean) => {
    if (ocultar) {
      setLembretes(prev => prev.filter(l => l.id !== id));
      return;
    }
    setLembretes(prev => prev.map(l =>
      l.id === id && nota
        ? { ...l, notas: [...(l.notas ?? []), { nota, criado_em: new Date().toISOString() }] }
        : l
    ));
  };

  return (
    <>
      {/* Widget só aparece se houver pendentes OU sempre (para mostrar o botão Histórico) */}
      {lembretes.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {/* Cabeçalho com botão Histórico */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: "11px", fontWeight: 700, color: "#92400e", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              📌 Lembretes pendentes ({lembretes.length})
            </div>
            <button
              onClick={() => setModal(true)}
              style={{
                background: "none", border: "1px solid #fde68a", borderRadius: "6px",
                padding: "3px 10px", fontSize: "11px", fontWeight: 600,
                color: "#92400e", cursor: "pointer",
              }}
            >
              📋 Histórico
            </button>
          </div>

          {lembretes.map(l => (
            <div key={l.id} style={{
              display: "flex", alignItems: "flex-start", gap: "12px",
              padding: "12px 14px", background: "#fffbeb",
              border: "1px solid #fde68a", borderRadius: "8px",
            }}>
              <span style={{ fontSize: "18px", lineHeight: 1, flexShrink: 0, marginTop: "1px" }}>📌</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "14px", fontWeight: 600, color: "#1e293b", lineHeight: "1.4", wordBreak: "break-word" }}>
                  {l.texto}
                </div>
                <div style={{ fontSize: "11px", color: "#92400e", marginTop: "4px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <span>👤 {nomePerfil(l)}</span>
                  <span>{fmtDataHora(l.criado_em)}</span>
                  <span style={{ opacity: 0.7 }}>{l.origem === "whatsapp" ? "via WhatsApp" : l.origem === "app_motorista" ? "via app do motorista" : "via painel"}</span>
                </div>
                <NotasDoLembrete notas={l.notas} />
              </div>
              <button
                onClick={() => setCienteAlvo(l)}
                style={{
                  flexShrink: 0, padding: "6px 12px",
                  background: "#16a34a",
                  color: "#fff", border: "none", borderRadius: "6px",
                  fontSize: "12px", fontWeight: 600,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                ✅ Ciente
              </button>
            </div>
          ))}
        </div>
      ) : (
        // Sem pendentes: mostra só o botão Histórico discreto
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            onClick={() => setModal(true)}
            style={{
              background: "none", border: "1px solid #e2e8f0", borderRadius: "6px",
              padding: "4px 12px", fontSize: "11px", fontWeight: 600,
              color: "#94a3b8", cursor: "pointer",
            }}
          >
            📋 Histórico de lembretes
          </button>
        </div>
      )}

      {cienteAlvo && (
        <CienteModal
          lembrete={cienteAlvo}
          onClose={() => setCienteAlvo(null)}
          onDone={aoDarCiente}
        />
      )}

      {modalAberto && <HistoricoModal onClose={() => { setModal(false); carregar(); }} />}
    </>
  );
}
