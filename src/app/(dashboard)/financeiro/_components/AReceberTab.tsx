"use client";
import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Btn, DataTable, Th, Td, Tr, Badge, EmptyState, Alert,
  useTableSort, inputStyle, ActionBtn,
} from "@/components/ui/ds";
import { MobileCard, MobileList } from "@/components/mobile";

const fmtBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (s: string | null) =>
  s ? new Date(s + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—";
const hoje = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

type Pedido = {
  id: string;
  valor_pedido: number | null;
  pago: boolean | null;
  data_pagamento: string | null;
  data_inicio_prevista: string | null;
  data_fim_prevista: string | null;
  forma_pagamento: string | null;
  status: string;
  motoristas: { nome: string } | { nome: string }[] | null;
  veiculos: { placa: string } | { placa: string }[] | null;
};

type ModalBaixa = {
  id: string;
  descricao: string;
  valor: number;
  dataPagamento: string;
};

export default function AReceberTab({ empresaId }: { empresaId: string }) {
  const supabase = createClient();
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [modalBaixa, setModalBaixa] = useState<ModalBaixa | null>(null);
  const [filtro, setFiltro] = useState<"todos" | "pendentes" | "atrasados">("pendentes");

  const carregar = async () => {
    setErro("");
    const { data, error } = await supabase
      .from("pedidos")
      .select("id,valor_pedido,pago,data_pagamento,data_inicio_prevista,data_fim_prevista,forma_pagamento,status,motoristas(nome),veiculos(placa)")
      .eq("empresa_id", empresaId)
      .not("valor_pedido", "is", null)
      .gt("valor_pedido", 0)
      .order("data_inicio_prevista", { ascending: false });

    if (error) { setErro(error.message); }
    else { setPedidos((data as Pedido[]) ?? []); }
    setLoading(false);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar();
  }, [empresaId]);

  const hoje_ = hoje();
  const filtrados = useMemo(() => {
    return pedidos.filter(p => {
      if (filtro === "pendentes") return !p.pago;
      if (filtro === "atrasados") {
        const data = p.data_fim_prevista ?? p.data_inicio_prevista;
        return !p.pago && data != null && data < hoje_;
      }
      return true;
    });
  }, [pedidos, filtro, hoje_]);

  const { sortedData, sortKey, sortDirection, handleSort } = useTableSort<Pedido>(filtrados, "data_inicio_prevista", "desc");

  const totalPendente = useMemo(() =>
    pedidos.filter(p => !p.pago).reduce((s, p) => s + (p.valor_pedido ?? 0), 0), [pedidos]);
  const totalRecebido = useMemo(() =>
    pedidos.filter(p => p.pago).reduce((s, p) => s + (p.valor_pedido ?? 0), 0), [pedidos]);
  const qtdAtrasados = useMemo(() =>
    pedidos.filter(p => {
      const data = p.data_fim_prevista ?? p.data_inicio_prevista;
      return !p.pago && data != null && data < hoje_;
    }).length, [pedidos, hoje_]);

  const abrirBaixa = (pedido: Pedido) => {
    const motorista = Array.isArray(pedido.motoristas) ? pedido.motoristas[0] : pedido.motoristas;
    setModalBaixa({
      id: pedido.id,
      descricao: `Pedido ${pedido.id.slice(0, 8)}${motorista ? ` (${motorista.nome})` : ""}`,
      valor: pedido.valor_pedido ?? 0,
      dataPagamento: hoje_,
    });
  };

  const confirmarBaixa = async () => {
    if (!modalBaixa) return;
    setSalvando(true);
    const { error } = await supabase.from("pedidos").update({
      pago: true,
      data_pagamento: modalBaixa.dataPagamento,
    }).eq("id", modalBaixa.id);
    if (error) { setErro(error.message); }
    else { setModalBaixa(null); await carregar(); }
    setSalvando(false);
  };

  const desfazerBaixa = async (id: string) => {
    setSalvando(true);
    const { error } = await supabase.from("pedidos").update({ pago: false, data_pagamento: null }).eq("id", id);
    if (error) setErro(error.message);
    else await carregar();
    setSalvando(false);
  };

  if (loading) return <p style={{ color: "#94a3b8", padding: "16px" }}>Carregando...</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {erro && <Alert variant="error">⚠ {erro}</Alert>}

      {/* KPIs */}
      <div style={{ display: "grid", gap: "10px", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
        <div style={{ background: "#fef9c3", border: "1px solid #fde68a", borderRadius: "8px", padding: "10px 12px" }}>
          <div style={{ fontSize: "10px", fontWeight: 700, color: "#854d0e", textTransform: "uppercase" }}>💰 A Receber</div>
          <div style={{ fontSize: "18px", fontWeight: 700, color: "#92400e" }}>{fmtBRL(totalPendente)}</div>
        </div>
        <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "8px", padding: "10px 12px" }}>
          <div style={{ fontSize: "10px", fontWeight: 700, color: "#16a34a", textTransform: "uppercase" }}>✅ Recebido</div>
          <div style={{ fontSize: "18px", fontWeight: 700, color: "#15803d" }}>{fmtBRL(totalRecebido)}</div>
        </div>
        {qtdAtrasados > 0 && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", padding: "10px 12px" }}>
            <div style={{ fontSize: "10px", fontWeight: 700, color: "#dc2626", textTransform: "uppercase" }}>⚠ Em Atraso</div>
            <div style={{ fontSize: "18px", fontWeight: 700, color: "#991b1b" }}>{qtdAtrasados} pedidos</div>
          </div>
        )}
      </div>

      {/* Filtros */}
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
        {([["pendentes", "Pendentes"], ["atrasados", "Atrasados"], ["todos", "Todos"]] as const).map(([v, l]) => (
          <button key={v} type="button" onClick={() => setFiltro(v)}
            style={{
              padding: "4px 12px", fontSize: "12px", fontWeight: 600, borderRadius: "6px",
              background: filtro === v ? "#2563eb" : "#fff",
              color: filtro === v ? "#fff" : "#475569",
              border: "1px solid #cbd5e1", cursor: "pointer",
            }}>{l}</button>
        ))}
      </div>

      {/* Tabela */}
      {sortedData.length === 0
        ? <EmptyState icon="💚" message="Nenhum pedido encontrado para este filtro." />
        : (
          <>
          <div className="m-hide">
          <DataTable count={sortedData.length} label="pedidos">
            <thead>
              <tr>
                <Th sortKey="data_inicio_prevista" activeSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort}>Data</Th>
                <Th sortKey="forma_pagamento" activeSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort}>Pedido</Th>
                <Th sortKey="status" activeSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort}>Status</Th>
                <Th sortKey="valor_pedido" activeSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} style={{ textAlign: "right" }}>Valor</Th>
                <Th>Situação</Th>
                <Th>Ação</Th>
              </tr>
            </thead>
            <tbody>
              {sortedData.map(pe => {
                const motorista = Array.isArray(pe.motoristas) ? pe.motoristas[0] : pe.motoristas;
                const veiculo = Array.isArray(pe.veiculos) ? pe.veiculos[0] : pe.veiculos;
                const dataRef = pe.data_fim_prevista ?? pe.data_inicio_prevista;
                const atrasado = !pe.pago && dataRef != null && dataRef < hoje_;
                return (
                  <Tr key={pe.id}>
                    <Td style={{ color: atrasado ? "#dc2626" : undefined }}>{fmtDate(dataRef)}</Td>
                    <Td>
                      <div style={{ fontWeight: 600, fontSize: "12px" }}>
                        Pedido #{pe.id.slice(0, 8)}
                        {pe.forma_pagamento && <span style={{ marginLeft: "8px", fontWeight: 400, color: "#64748b" }}>({pe.forma_pagamento})</span>}
                      </div>
                      {motorista && <div style={{ fontSize: "10px", color: "#94a3b8" }}>{motorista.nome}{veiculo ? ` · ${veiculo.placa}` : ""}</div>}
                    </Td>
                    <Td>
                      <Badge variant={pe.status === "concluido" ? "success" : pe.status === "em_andamento" ? "info" : "default"}>
                        {pe.status.replace(/_/g, " ")}
                      </Badge>
                    </Td>
                    <Td style={{ textAlign: "right", fontWeight: 700, color: pe.pago ? "#16a34a" : "#1e293b" }}>
                      {fmtBRL(pe.valor_pedido ?? 0)}
                    </Td>
                    <Td>
                      {pe.pago
                        ? <Badge variant="success">✓ Recebido {fmtDate(pe.data_pagamento)}</Badge>
                        : atrasado
                          ? <Badge variant="danger">⚠ Atrasado</Badge>
                          : <Badge variant="warning">Pendente</Badge>
                      }
                    </Td>
                    <Td>
                      {pe.pago
                        ? <ActionBtn title="Desfazer baixa" variant="default" onClick={() => desfazerBaixa(pe.id)}>↩</ActionBtn>
                        : <Btn size="xs" variant="primary" onClick={() => abrirBaixa(pe)}>Baixar</Btn>
                      }
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </DataTable>
          </div>

          {/* Mobile: cards */}
          <MobileList count={sortedData.length} label="pedidos">
            {sortedData.map(pe => {
              const motorista = Array.isArray(pe.motoristas) ? pe.motoristas[0] : pe.motoristas;
              const dataRef = pe.data_fim_prevista ?? pe.data_inicio_prevista;
              const atrasado = !pe.pago && dataRef != null && dataRef < hoje_;
              const statusBadge = pe.pago
                ? <Badge variant="success">✓ Recebido</Badge>
                : atrasado ? <Badge variant="danger">Atrasado</Badge>
                : <Badge variant="warning">Pendente</Badge>;
              return (
                <MobileCard
                  key={pe.id}
                  title={`Pedido #${pe.id.slice(0, 8)}`}
                  subtitle={motorista?.nome ?? ""}
                  badge={statusBadge}
                  highlight={atrasado ? "#dc2626" : pe.pago ? "#16a34a" : "#eab308"}
                  details={[
                    { label: "Data", value: fmtDate(dataRef) },
                    { label: "Valor", value: fmtBRL(pe.valor_pedido ?? 0) },
                  ]}
                  actions={
                    pe.pago
                      ? <ActionBtn title="Desfazer" variant="default" onClick={() => desfazerBaixa(pe.id)}>↩</ActionBtn>
                      : <Btn size="xs" variant="primary" onClick={() => abrirBaixa(pe)}>Baixar</Btn>
                  }
                />
              );
            })}
          </MobileList>
          </>
        )}

      {/* Modal Baixa */}
      {modalBaixa && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex",
          alignItems: "center", justifyContent: "center", zIndex: 1000,
        }}>
          <div className="m-modal-content" style={{ background: "#fff", borderRadius: "12px", padding: "24px", width: "360px", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
            <h2 style={{ fontSize: "16px", fontWeight: 700, color: "#1e293b", margin: "0 0 4px" }}>Confirmar Recebimento</h2>
            <p style={{ fontSize: "12px", color: "#64748b", margin: "0 0 16px" }}>{modalBaixa.descricao}</p>

            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div>
                <label style={{ fontSize: "12px", fontWeight: 600, color: "#475569", display: "block", marginBottom: "4px" }}>Valor Recebido</label>
                <div style={{ fontSize: "20px", fontWeight: 700, color: "#16a34a" }}>{fmtBRL(modalBaixa.valor)}</div>
              </div>
              <div>
                <label style={{ fontSize: "12px", fontWeight: 600, color: "#475569", display: "block", marginBottom: "4px" }}>Data do Recebimento</label>
                <input type="date" value={modalBaixa.dataPagamento}
                  onChange={e => setModalBaixa({ ...modalBaixa, dataPagamento: e.target.value })}
                  style={inputStyle} />
              </div>
            </div>

            <div style={{ display: "flex", gap: "8px", marginTop: "20px", justifyContent: "flex-end" }}>
              <Btn variant="outline" onClick={() => setModalBaixa(null)} disabled={salvando}>Cancelar</Btn>
              <Btn variant="primary" onClick={confirmarBaixa} disabled={salvando || !modalBaixa.dataPagamento}>
                {salvando ? "Salvando..." : "✓ Confirmar Recebimento"}
              </Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
