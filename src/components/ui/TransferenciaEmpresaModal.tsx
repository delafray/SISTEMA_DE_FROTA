"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Modal de transferência de ATIVO (caminhão/motorista) entre empresas.
 * Manutenções (do caminhão) vão SEMPRE junto; o resto do histórico financeiro
 * vai conforme a escolha. Chama a RPC transacional (tudo-ou-nada).
 */
export function TransferenciaEmpresaModal({
  tipo, alvoId, novaEmpresa, onDone, onCancel,
}: {
  tipo: "veiculo" | "motorista";
  alvoId: string;
  novaEmpresa: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const exec = async (moverTudo: boolean) => {
    setSalvando(true); setErro("");
    const sb = createClient();
    const { data: auth } = await sb.auth.getUser();
    const fn = tipo === "veiculo" ? "transferir_veiculo_empresa" : "transferir_motorista_empresa";
    const alvoArg = tipo === "veiculo" ? "p_veiculo" : "p_motorista";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (sb.rpc as any)(fn, { [alvoArg]: alvoId, p_nova: novaEmpresa, p_mover_tudo: moverTudo, p_por: auth.user?.id ?? null });
    setSalvando(false);
    if (error) { setErro(error.message); return; }
    onDone();
  };

  const overlay: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(15,23,42,.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 };
  const box: React.CSSProperties = { background: "#fff", borderRadius: 12, maxWidth: 460, width: "100%", padding: 24, boxShadow: "0 10px 40px rgba(0,0,0,.25)" };
  const opt: React.CSSProperties = { width: "100%", textAlign: "left", padding: "12px 14px", borderRadius: 8, border: "1px solid #cbd5e1", background: "#fff", cursor: "pointer", marginBottom: 10, fontSize: 14 };

  const oQue = tipo === "veiculo" ? "fretes, abastecimentos, avarias e km" : "os adiantamentos/pagamentos";

  return (
    <div style={overlay} onClick={onCancel}>
      <div style={box} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 6 }}>🔄 Mudou a empresa deste {tipo === "veiculo" ? "caminhão" : "motorista"}</div>
        <p style={{ fontSize: 13, color: "#475569", lineHeight: 1.6, marginBottom: 16 }}>
          {tipo === "veiculo" && <>As <b>manutenções</b> (feitas e a fazer) vão junto automaticamente.<br /></>}
          E o histórico ({oQue}), o que fazer?
        </p>
        {erro && <div style={{ background: "#fef2f2", color: "#b91c1c", padding: "8px 12px", borderRadius: 8, fontSize: 13, marginBottom: 12 }}>⚠ {erro}</div>}

        <button style={{ ...opt, borderColor: "#93c5fd", background: "#eff6ff" }} onClick={() => exec(true)} disabled={salvando}>
          🔵 <b>Mover TUDO</b> pra nova empresa <span style={{ color: "#64748b" }}>— retroativo (mexe no fluxo de caixa passado)</span>
        </button>
        <button style={{ ...opt, borderColor: "#86efac", background: "#f0fdf4" }} onClick={() => exec(false)} disabled={salvando}>
          🟢 <b>Só daqui pra frente</b> <span style={{ color: "#64748b" }}>— histórico fica na empresa antiga; novos já nascem na nova</span>
        </button>
        <button style={{ ...opt, textAlign: "center", color: "#64748b", marginTop: 4 }} onClick={onCancel} disabled={salvando}>
          {salvando ? "Transferindo…" : "Cancelar"}
        </button>
      </div>
    </div>
  );
}
