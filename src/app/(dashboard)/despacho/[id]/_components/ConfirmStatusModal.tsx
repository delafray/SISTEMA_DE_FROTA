"use client";

/**
 * Confirmação de mudança de status (dono 11/06): Iniciar/Concluir/Cancelar não
 * mudam mais "na hora" — abre popup com contexto opcional (vai pras observações
 * do pedido, com carimbo de data/hora) e sempre dá pra voltar sem mexer em nada.
 */

import { useState } from "react";
import { Btn } from "@/components/ui/ds";

const ACAO: Record<string, { titulo: string; descricao: string; botao: string; cor: string }> = {
  em_andamento: {
    titulo: "▶ Iniciar Pedido",
    descricao: "O pedido entra EM ROTA e a data/hora de início real é gravada agora.",
    botao: "▶ Sim, iniciar",
    cor: "#2563eb",
  },
  concluida: {
    titulo: "✓ Concluir Pedido",
    descricao: "O pedido é marcado como CONCLUÍDO e a data/hora de fim real é gravada agora.",
    botao: "✓ Sim, concluir",
    cor: "#16a34a",
  },
  cancelada: {
    titulo: "🛑 Cancelar Pedido",
    descricao: "O pedido é marcado como CANCELADO.",
    botao: "🛑 Sim, cancelar",
    cor: "#dc2626",
  },
};

export function ConfirmStatusModal({
  status,
  saving,
  onConfirm,
  onClose,
}: {
  status: string;
  saving: boolean;
  onConfirm: (nota: string) => void;
  onClose: () => void;
}) {
  const [nota, setNota] = useState("");
  const acao = ACAO[status] ?? { titulo: "Mudar status", descricao: "", botao: "Confirmar", cor: "#2563eb" };

  return (
    <div
      onClick={() => { if (!saving) onClose(); }}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
        zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center",
        padding: "16px",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "#fff", borderRadius: "14px", width: "100%", maxWidth: 460,
          boxShadow: "0 20px 60px rgba(0,0,0,0.25)", padding: "20px",
          display: "flex", flexDirection: "column", gap: "12px",
        }}
      >
        <div style={{ fontWeight: 700, fontSize: "15px", color: "#1e293b" }}>{acao.titulo}</div>

        <p style={{ fontSize: "13px", color: "#475569", margin: 0, lineHeight: 1.5 }}>
          {acao.descricao}
        </p>

        <div>
          <label style={{ fontSize: "12px", fontWeight: 600, color: "#475569", display: "block", marginBottom: "4px" }}>
            Quer registrar um contexto? (opcional)
          </label>
          <textarea
            value={nota}
            onChange={e => setNota(e.target.value)}
            rows={3}
            placeholder="Ex.: cliente recebeu tudo / cancelado a pedido do cliente"
            style={{
              width: "100%", border: "1px solid #cbd5e1", borderRadius: "8px",
              padding: "8px 10px", fontSize: "13px", color: "#1e293b",
              resize: "vertical", fontFamily: "inherit", boxSizing: "border-box",
            }}
          />
          <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "4px" }}>
            Fica salvo nas observações do pedido, com data e hora. Se mudar errado,
            dá pra voltar o status em ✏️ Editar pedido.
          </div>
        </div>

        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
          <Btn
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={saving}
          >
            ← Voltar
          </Btn>
          <Btn
            type="button"
            variant={status === "cancelada" ? "danger" : "primary"}
            loading={saving}
            disabled={saving}
            onClick={() => onConfirm(nota.trim())}
          >
            {acao.botao}
          </Btn>
        </div>
      </div>
    </div>
  );
}
