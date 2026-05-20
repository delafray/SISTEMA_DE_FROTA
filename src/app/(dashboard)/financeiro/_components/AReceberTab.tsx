"use client";
import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Btn, DataTable, Th, Td, Tr, Badge, EmptyState, Alert,
  useTableSort, inputStyle, ActionBtn,
} from "@/components/ui/ds";

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

type Frete = {
  id: string;
  origem: string;
  destino: string;
  valor_frete: number | null;
  pago: boolean | null;
  data_pagamento: string | null;
  data_entrega_prevista: string | null;
  data_coleta_prevista: string | null;
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
  const [fretes, setFretes] = useState<Frete[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [modalBaixa, setModalBaixa] = useState<ModalBaixa | null>(null);
  const [filtro, setFiltro] = useState<"todos" | "pendentes" | "atrasados">("pendentes");

  const carregar = async () => {
    setErro("");
    const { data, error } = await supabase
      .from("fretes")
      .select("id,origem,destino,valor_frete,pago,data_pagamento,data_entrega_prevista,data_coleta_prevista,status,motoristas(nome),veiculos(placa)")
      .eq("empresa_id", empresaId)
      .not("valor_frete", "is", null)
      .gt("valor_frete", 0)
      .order("data_coleta_prevista", { ascending: false });

    if (error) { setErro(error.message); }
    else { setFretes((data as Frete[]) ?? []); }
    setLoading(false);
  };

  useEffect(() => { carregar(); }, [empresaId]);

  const hoje_ = hoje();
  const filtrados = useMemo(() => {
    return fretes.filter(f => {
      if (filtro === "pendentes") return !f.pago;
      if (filtro === "atrasados") {
        const data = f.data_entrega_prevista ?? f.data_coleta_prevista;
        return !f.pago && data != null && data < hoje_;
      }
      return true;
    });
  }, [fretes, filtro, hoje_]);

  const { sortedData, sortKey, sortDirection, handleSort } = useTableSort<Frete>(filtrados, "data_coleta_prevista", "desc");

  const totalPendente = useMemo(() =>
    fretes.filter(f => !f.pago).reduce((s, f) => s + (f.valor_frete ?? 0), 0), [fretes]);
  const totalRecebido = useMemo(() =>
    fretes.filter(f => f.pago).reduce((s, f) => s + (f.valor_frete ?? 0), 0), [fretes]);
  const qtdAtrasados = useMemo(() =>
    fretes.filter(f => {
      const data = f.data_entrega_prevista ?? f.data_coleta_prevista;
      return !f.pago && data != null && data < hoje_;
    }).length, [fretes, hoje_]);

  const abrirBaixa = (frete: Frete) => {
    const motorista = Array.isArray(frete.motoristas) ? frete.motoristas[0] : frete.motoristas;
    setModalBaixa({
      id: frete.id,
      descricao: `Frete ${frete.origem} → ${frete.destino}${motorista ? ` (${motorista.nome})` : ""}`,
      valor: frete.valor_frete ?? 0,
      dataPagamento: hoje_,
    });
  };

  const confirmarBaixa = async () => {
    if (!modalBaixa) return;
    setSalvando(true);
    const { error } = await supabase.from("fretes").update({
      pago: true,
      data_pagamento: modalBaixa.dataPagamento,
    }).eq("id", modalBaixa.id);
    if (error) { setErro(error.message); }
    else { setModalBaixa(null); await carregar(); }
    setSalvando(false);
  };

  const desfazerBaixa = async (id: string) => {
    setSalvando(true);
    const { error } = await supabase.from("fretes").update({ pago: false, data_pagamento: null }).eq("id", id);
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
            <div style={{ fontSize: "18px", fontWeight: 700, color: "#991b1b" }}>{qtdAtrasados} fretes</div>
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
        ? <EmptyState icon="💚" message="Nenhum frete encontrado para este filtro." />
        : (
          <DataTable count={sortedData.length} label="fretes">
            <thead>
              <tr>
                <Th sortKey="data_coleta_prevista" activeSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort}>Data</Th>
                <Th sortKey="origem" activeSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort}>Frete</Th>
                <Th sortKey="status" activeSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort}>Status</Th>
                <Th sortKey="valor_frete" activeSortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} style={{ textAlign: "right" }}>Valor</Th>
                <Th>Situação</Th>
                <Th>Ação</Th>
              </tr>
            </thead>
            <tbody>
              {sortedData.map(fr => {
                const motorista = Array.isArray(fr.motoristas) ? fr.motoristas[0] : fr.motoristas;
                const dataRef = fr.data_entrega_prevista ?? fr.data_coleta_prevista;
                const atrasado = !fr.pago && dataRef != null && dataRef < hoje_;
                return (
                  <Tr key={fr.id}>
                    <Td style={{ color: atrasado ? "#dc2626" : undefined }}>{fmtDate(dataRef)}</Td>
                    <Td>
                      <div style={{ fontWeight: 600, fontSize: "12px" }}>{fr.origem} → {fr.destino}</div>
                      {motorista && <div style={{ fontSize: "10px", color: "#94a3b8" }}>{motorista.nome}</div>}
                    </Td>
                    <Td>
                      <Badge variant={fr.status === "concluido" ? "success" : fr.status === "em_andamento" ? "info" : "default"}>
                        {fr.status.replace(/_/g, " ")}
                      </Badge>
                    </Td>
                    <Td style={{ textAlign: "right", fontWeight: 700, color: fr.pago ? "#16a34a" : "#1e293b" }}>
                      {fmtBRL(fr.valor_frete ?? 0)}
                    </Td>
                    <Td>
                      {fr.pago
                        ? <Badge variant="success">✓ Recebido {fmtDate(fr.data_pagamento)}</Badge>
                        : atrasado
                          ? <Badge variant="danger">⚠ Atrasado</Badge>
                          : <Badge variant="warning">Pendente</Badge>
                      }
                    </Td>
                    <Td>
                      {fr.pago
                        ? <ActionBtn title="Desfazer baixa" variant="default" onClick={() => desfazerBaixa(fr.id)}>↩</ActionBtn>
                        : <Btn size="xs" variant="primary" onClick={() => abrirBaixa(fr)}>Baixar</Btn>
                      }
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </DataTable>
        )}

      {/* Modal Baixa */}
      {modalBaixa && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex",
          alignItems: "center", justifyContent: "center", zIndex: 1000,
        }}>
          <div style={{ background: "#fff", borderRadius: "12px", padding: "24px", width: "360px", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
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
