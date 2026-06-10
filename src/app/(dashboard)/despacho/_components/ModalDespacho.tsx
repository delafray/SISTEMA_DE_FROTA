"use client";

/**
 * Modal de Despacho / Troca de caminhão+motorista.
 * Extraído de despacho/page.tsx para ser reusado no DETALHE do pedido
 * (decisão do dono 10/06: despachar sem trocar de tela — fluxo visível).
 *
 * O modal só cuida da SELEÇÃO (caminhão → pré-carrega motorista padrão via
 * alocacoes → confirmar). A gravação (update pedido + propagação às entregas
 * + normalização de status) é responsabilidade do caller via onConfirm.
 */

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Btn, Alert, FormField, selectStyle } from "@/components/ui/ds";

export type VeiculoOpcao = {
  id: string;
  placa: string;
  apelido: string | null;
  marca: string;
  modelo: string;
};

export type MotoristaOpcao = { id: string; nome: string };

const veiculoLabel = (v: VeiculoOpcao) =>
  v.apelido?.trim() ? `${v.apelido} (${v.placa})` : `${v.placa} — ${v.marca} ${v.modelo}`;

type ModalProps = {
  pedidosIds: string[];
  veiculos: VeiculoOpcao[];
  motoristas: MotoristaOpcao[];
  onConfirm: (veiculoId: string, motoristaId: string) => Promise<void>;
  onClose: () => void;
  saving: boolean;
  err: string;
  /** Quando true: título e botão trocam para "Trocar caminhão/motorista" */
  modoTroca?: boolean;
};

export function ModalDespacho({ pedidosIds, veiculos, motoristas, onConfirm, onClose, saving, err, modoTroca }: ModalProps) {
  const supabase = createClient();
  const [veiculoId, setVeiculoId] = useState("");
  const [motoristaId, setMotoristaId] = useState("");
  const [loadingMotorista, setLoadingMotorista] = useState(false);

  const handleVeiculoChange = async (vId: string) => {
    setVeiculoId(vId);
    setMotoristaId("");
    if (!vId) return;

    setLoadingMotorista(true);
    const { data } = await supabase
      .from("alocacoes")
      .select("motorista_id")
      .eq("veiculo_id", vId)
      .eq("status", "operacional")
      .is("fim", null)
      .maybeSingle();
    if (data?.motorista_id) {
      setMotoristaId(data.motorista_id as string);
    }
    setLoadingMotorista(false);
  };

  const titulo = modoTroca
    ? "Trocar Caminhão / Motorista"
    : `Despachar Pedido${pedidosIds.length > 1 ? `s (${pedidosIds.length})` : ""}`;

  const descricao = modoTroca
    ? "Selecione o novo caminhão e motorista. O status do pedido não será alterado."
    : `Selecione o caminhão e o motorista para este despacho.${pedidosIds.length > 1 ? " Todos os pedidos selecionados receberão o mesmo caminhão/motorista." : ""}`;

  const labelBtn = modoTroca
    ? (saving ? "Salvando..." : "Confirmar Troca")
    : (saving ? "Despachando..." : "Confirmar Despacho");

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "16px",
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "#fff",
        borderRadius: "12px",
        padding: "28px",
        width: "100%",
        maxWidth: "480px",
        boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
      }}>
        <h2 style={{ fontSize: "18px", fontWeight: 700, color: "#1e293b", margin: "0 0 4px" }}>
          {titulo}
        </h2>
        <p style={{ fontSize: "13px", color: "#64748b", margin: "0 0 20px" }}>
          {descricao}
        </p>

        {err && (
          <div style={{ marginBottom: "16px" }}>
            <Alert variant="error">{err}</Alert>
          </div>
        )}

        <FormField label="Caminhão">
          <select
            value={veiculoId}
            onChange={e => handleVeiculoChange(e.target.value)}
            style={selectStyle}
          >
            <option value="">Selecione um caminhão...</option>
            {veiculos.map(v => (
              <option key={v.id} value={v.id}>
                {veiculoLabel(v)}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label={`Motorista${loadingMotorista ? " (buscando padrão...)" : ""}`}>
          <select
            value={motoristaId}
            onChange={e => setMotoristaId(e.target.value)}
            style={selectStyle}
            disabled={loadingMotorista}
          >
            <option value="">
              {loadingMotorista
                ? "Carregando motorista padrão..."
                : "Selecione um motorista..."}
            </option>
            {motoristas.map(m => (
              <option key={m.id} value={m.id}>{m.nome}</option>
            ))}
          </select>
        </FormField>

        {veiculoId && !loadingMotorista && !motoristaId && (
          <p style={{ fontSize: "12px", color: "#f59e0b", margin: "0 0 12px" }}>
            Nenhum motorista padrão encontrado para este caminhão. Selecione manualmente.
          </p>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "24px" }}>
          <Btn type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Btn>
          <Btn
            type="button"
            variant="primary"
            disabled={saving || !veiculoId || !motoristaId}
            onClick={() => onConfirm(veiculoId, motoristaId)}
          >
            {labelBtn}
          </Btn>
        </div>
      </div>
    </div>
  );
}
