"use client";

/**
 * Aba "Principal" do detalhe do despacho.
 * Exibe o stepper de fluxo + bloco do Pedido (locais de carregamento,
 * observações) + bloco de Despacho e Execução (caminhão, motorista, KMs).
 */

import { Btn, Badge } from "@/components/ui/ds";
import { FluxoStepper } from "./FluxoStepper";
import { Bloco, LinhaCampos, Campo } from "./shared";
import {
  COR_PEDIDO, COR_DESPACHO,
  fmtDate, fmtDT,
  veiculoLabel,
  type Pedido,
  type EntregaPedido,
} from "./types";
import { rotuloPedido } from "@/lib/utils/numeroPedido";

export type AbaPrincipalProps = {
  pedidoId: string;
  pedido: Pedido;
  entregas: EntregaPedido[];
  /** Locais de carregamento já parseados (split por " | ") */
  locais: string[];
  cliente: string;
  veiculo: { id: string; placa: string; apelido: string | null; marca: string; modelo: string } | null;
  motorista: { id: string; nome: string } | null;
  despachado: boolean;
  finalizado: boolean;
  kmRodado: number | null;
  updatingStatus: boolean;
  salvandoLocal: boolean;
  novoLocal: string;
  onNovoLocalChange: (v: string) => void;
  onSalvarLocais: (lista: string[]) => void;
  onAbrirDespacho: () => void;
  onChangeStatus: (status: string) => void;
};

export function AbaPrincipal({
  pedidoId,
  pedido,
  entregas,
  locais,
  cliente,
  veiculo,
  motorista,
  despachado,
  finalizado,
  kmRodado,
  updatingStatus,
  salvandoLocal,
  novoLocal,
  onNovoLocalChange,
  onSalvarLocais,
  onAbrirDespacho,
  onChangeStatus,
}: AbaPrincipalProps) {
  const emRota    = pedido.status === "em_andamento" || pedido.status === "concluida" || pedido.status === "concluido";
  const concluido = pedido.status === "concluida" || pedido.status === "concluido";

  const etapasFluxo = [
    { label: "Lançado",    done: true },
    { label: "Despachado", done: despachado },
    { label: "Em rota",    done: emRota },
    { label: "Concluído",  done: concluido },
  ];

  const proximaAcao =
    !despachado ? { label: "🚚 Despachar agora", onClick: onAbrirDespacho } :
    !emRota     ? { label: "▶ Iniciar Pedido",   onClick: () => onChangeStatus("em_andamento"), disabled: updatingStatus } :
    !concluido  ? { label: "✓ Concluir Pedido",  onClick: () => onChangeStatus("concluida"),    disabled: updatingStatus } :
    null;

  return (
    <>
      {/* Fluxo visível: onde o pedido está e qual a próxima ação */}
      <div style={{ maxWidth: "900px", marginBottom: "16px" }}>
        <FluxoStepper
          etapas={etapasFluxo}
          cancelado={pedido.status === "cancelada" || pedido.status === "cancelado"}
          acao={proximaAcao}
        />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "16px", maxWidth: "900px" }}>

        {/* ══ TUDO QUE É DO PEDIDO ══════════════════════════════════════ */}
        <Bloco
          titulo="📦 Pedido"
          cor={COR_PEDIDO}
          acoes={<Btn href={`/pedidos/${pedidoId}/editar`} variant="outline" size="xs">✏️ Editar pedido</Btn>}
        >
          {/* Agrupado (dono 11/06): valor perto da legenda, em linhas compactas.
              Grid de 4 colunas nas duas linhas → bordas alinhadas entre elas. */}
          <LinhaCampos cols={4}>
            <Campo label="Cliente" value={cliente} span={2} />
            <Campo label="Nº do pedido" value={<span style={{ fontFamily: "ui-monospace, monospace" }}>{rotuloPedido(pedido.numero, pedido.id)}</span>} />
            <Campo label="Entregas" value={<Badge variant="info">{entregas.length}</Badge>} />
          </LinhaCampos>
          <LinhaCampos cols={4}>
            <Campo label="Início Previsto" value={fmtDate(pedido.data_inicio_prevista)} span={2} />
            <Campo label="Fim Previsto"    value={fmtDate(pedido.data_fim_prevista)} span={2} />
          </LinhaCampos>

          {/* Locais de carregamento — pode ter MAIS DE UM */}
          <div style={{ marginTop: "10px", paddingTop: "10px", borderTop: "1px solid #e2e8f0" }}>
            <div style={{ fontSize: "12px", color: "#64748b", fontWeight: 700, marginBottom: "6px" }}>
              📍 Locais de carregamento {locais.length > 0 && `(${locais.length})`}
            </div>
            {locais.length === 0 && (
              <p style={{ fontSize: "12px", color: "#94a3b8", margin: "0 0 6px" }}>Nenhum local informado.</p>
            )}
            {locais.map((l, i) => (
              <div key={`${l}-${i}`} style={{
                display: "flex", alignItems: "center", gap: "8px",
                padding: "6px 10px", marginBottom: "4px",
                background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px",
              }}>
                <span style={{ fontSize: "12px", fontWeight: 700, color: "#64748b", minWidth: "20px" }}>{i + 1}º</span>
                <span style={{ fontSize: "13px", color: "#1e293b", flex: 1 }}>{l}</span>
                {!finalizado && (
                  <button
                    onClick={() => onSalvarLocais(locais.filter((_, j) => j !== i))}
                    disabled={salvandoLocal}
                    style={{ background: "none", border: "none", cursor: "pointer", fontSize: "12px", color: "#ef4444", padding: 0 }}
                    title="Remover este local"
                  >✕</button>
                )}
              </div>
            ))}
            {!finalizado && (
              <div style={{ display: "flex", gap: "6px", marginTop: "6px" }}>
                <input
                  style={{ fontSize: "12px", padding: "6px 10px", border: "1px solid #cbd5e1", borderRadius: "8px", flex: 1 }}
                  value={novoLocal}
                  onChange={e => onNovoLocalChange(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && novoLocal.trim()) { e.preventDefault(); onSalvarLocais([...locais, novoLocal]); } }}
                  placeholder="Endereço de coleta (ex.: depósito, fornecedor...)"
                />
                <Btn variant="outline" size="xs" disabled={salvandoLocal || !novoLocal.trim()} onClick={() => onSalvarLocais([...locais, novoLocal])}>
                  {salvandoLocal ? "..." : "+ Adicionar"}
                </Btn>
              </div>
            )}
          </div>

          {pedido.observacoes && (
            <div style={{ marginTop: "10px", paddingTop: "10px", borderTop: "1px solid #e2e8f0" }}>
              <div style={{ fontSize: "12px", color: "#64748b", fontWeight: 700, marginBottom: "4px" }}>📝 Observações</div>
              <p style={{ fontSize: "13px", color: "#475569", lineHeight: 1.6, margin: 0 }}>{pedido.observacoes}</p>
            </div>
          )}

          <p style={{ fontSize: "10px", color: "#94a3b8", marginTop: "10px", marginBottom: 0 }}>
            Dados cadastrais (cliente, valor, entregas) são editados em Editar pedido. Financeiro é tratado na área financeira.
          </p>
        </Bloco>

        {/* ══ TUDO QUE É DO DESPACHO ════════════════════════════════════ */}
        <Bloco
          titulo="🚚 Despacho e Execução"
          cor={COR_DESPACHO}
          acoes={
            !finalizado ? (
              despachado
                ? <Btn variant="outline" size="xs" onClick={onAbrirDespacho}>🔁 Trocar caminhão/motorista</Btn>
                : <Btn variant="primary" size="xs" onClick={onAbrirDespacho}>🚚 Despachar agora</Btn>
            ) : undefined
          }
        >
          {!despachado ? (
            <p style={{ fontSize: "13px", color: "#64748b", margin: "6px 0" }}>
              Este pedido ainda <strong>não foi despachado</strong> — sem caminhão e motorista definidos.
            </p>
          ) : (
            <>
              {/* Agrupado (dono 11/06): caminhão+motorista · KMs · datas reais */}
              <LinhaCampos>
                <Campo label="Caminhão"  value={veiculo ? veiculoLabel(veiculo) : "—"} />
                <Campo label="Motorista" value={motorista?.nome ?? "—"} />
              </LinhaCampos>
              {/* Com KM Rodados a linha vira 3 colunas; sem, 2 (alinhada às demais) */}
              <LinhaCampos cols={kmRodado != null ? 3 : 2}>
                <Campo label="KM Inicial" value={pedido.km_inicial?.toLocaleString("pt-BR") ?? "—"} />
                <Campo label="KM Final"   value={pedido.km_final?.toLocaleString("pt-BR") ?? "—"} />
                {kmRodado != null && (
                  <Campo label="KM Rodados" value={<span style={{ color: "#2563eb" }}>{kmRodado.toLocaleString("pt-BR")} km</span>} />
                )}
              </LinhaCampos>
              <LinhaCampos>
                <Campo label="Início Real" value={fmtDT(pedido.data_inicio_real)} />
                <Campo label="Fim Real"    value={fmtDT(pedido.data_fim_real)} />
              </LinhaCampos>
            </>
          )}
        </Bloco>

      </div>
    </>
  );
}
