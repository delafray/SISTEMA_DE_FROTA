"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Pedido = {
  id: string;
  status: string;
  data_inicio_prevista: string | null;
  data_fim_prevista: string | null;
  data_inicio_real: string | null;
  data_fim_real: string | null;
  km_inicial: number | null;
  km_final: number | null;
  observacoes: string | null;
  valor_pedido: number | null;
  pago: boolean | null;
  veiculos: { placa: string; marca: string; modelo: string } | null;
  entregas: {
    id: string;
    origem: string | null;
    destino: string | null;
    status: string;
    tipo_carga: string | null;
    clientes: { nome_fantasia: string } | null;
  }[];
};

const STATUS_COLOR: Record<string, { bg: string; color: string; border: string }> = {
  agendada:     { bg: "#fffbeb", color: "#92400e", border: "#fde68a" },
  em_andamento: { bg: "#eff6ff", color: "#1e40af", border: "#bfdbfe" },
  concluida:    { bg: "#f0fdf4", color: "#166534", border: "#bbf7d0" },
  cancelada:    { bg: "#fef2f2", color: "#991b1b", border: "#fecaca" },
};
const STATUS_LABEL: Record<string, string> = {
  agendada: "Agendada", em_andamento: "Em Andamento", concluida: "Concluída", cancelada: "Cancelada",
};

const fmtBRL  = (v: number | null) => v != null ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
const fmtDate = (d: string | null) => d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR") : "—";
const fmtDT   = (d: string | null) => d ? new Date(d).toLocaleString("pt-BR") : "—";

function Info({ label, value, big }: { label: string; value: React.ReactNode; big?: boolean }) {
  return (
    <div style={{ padding: "10px 0", borderBottom: "1px solid #f1f5f9" }}>
      <div style={{ fontSize: "10px", color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "2px" }}>{label}</div>
      <div style={{ fontSize: big ? "17px" : "14px", color: "#1e293b", fontWeight: big ? 700 : 500, lineHeight: 1.3 }}>{value}</div>
    </div>
  );
}

export default function MotoristaPedidoDetalhePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [loading, setLoading] = useState(true);
  const [atualizando, setAtualizando] = useState(false);

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { router.push("/login"); return; }
      const { data } = await supabase.from("pedidos")
        .select("id,status,data_inicio_prevista,data_fim_prevista,data_inicio_real,data_fim_real,km_inicial,km_final,observacoes,valor_pedido,pago,veiculos(placa,marca,modelo),entregas(id,origem,destino,status,tipo_carga,clientes(nome_fantasia))")
        .eq("id", id)
        .single();
      setPedido(data as unknown as Pedido | null);
      setLoading(false);
    };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const mudarStatus = async (novoStatus: string) => {
    setAtualizando(true);
    const supabase = createClient();
    const extra: Record<string, string> = {};
    if (novoStatus === "em_andamento") extra.data_inicio_real = new Date().toISOString();
    if (novoStatus === "concluida")    extra.data_fim_real    = new Date().toISOString();
    await supabase.from("pedidos").update({ status: novoStatus, ...extra }).eq("id", id);
    setPedido(p => p ? { ...p, status: novoStatus, ...extra } : p);
    setAtualizando(false);
  };

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", color: "#64748b" }}>Carregando...</div>
  );
  if (!pedido) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", color: "#64748b" }}>Pedido não encontrado.</div>
  );

  const veiculo = Array.isArray(pedido.veiculos) ? pedido.veiculos[0] : pedido.veiculos;
  const entregas  = Array.isArray(pedido.entregas)  ? pedido.entregas       : [];
  const s = STATUS_COLOR[pedido.status] ?? { bg: "#f8fafc", color: "#64748b", border: "#e2e8f0" };
  const kmRodado = pedido.km_final != null && pedido.km_inicial != null ? pedido.km_final - pedido.km_inicial : null;

  return (
    <div style={{ maxWidth: "480px", margin: "0 auto", fontFamily: "system-ui, sans-serif", paddingBottom: "32px" }}>

      {/* Header */}
      <div style={{ background: "#313f50", padding: "16px" }}>
        <button onClick={() => router.back()}
          style={{ background: "none", border: "none", color: "rgba(147,197,253,0.8)", cursor: "pointer", fontSize: "14px", fontWeight: 600, padding: "0 0 10px 0", display: "block" }}>
          ← Voltar
        </button>
        <div style={{ fontSize: "11px", color: "rgba(147,197,253,0.6)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Detalhes do Pedido
        </div>
        {veiculo && (
          <h1 style={{ fontSize: "18px", fontWeight: 700, color: "#fff", margin: "4px 0 8px", lineHeight: 1.2 }}>
            {veiculo.placa} — {veiculo.marca} {veiculo.modelo}
          </h1>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <span style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}`, borderRadius: "6px", padding: "3px 10px", fontSize: "12px", fontWeight: 700 }}>
            {STATUS_LABEL[pedido.status] ?? pedido.status}
          </span>
          {pedido.status === "agendada" && (
            <button onClick={() => mudarStatus("em_andamento")} disabled={atualizando}
              style={{ background: "#2563eb", color: "#fff", border: "none", borderRadius: "8px", padding: "6px 14px", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}>
              {atualizando ? "..." : "Iniciar Pedido"}
            </button>
          )}
          {pedido.status === "em_andamento" && (
            <button onClick={() => mudarStatus("concluida")} disabled={atualizando}
              style={{ background: "#16a34a", color: "#fff", border: "none", borderRadius: "8px", padding: "6px 14px", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}>
              {atualizando ? "..." : "Concluir Pedido"}
            </button>
          )}
          {(pedido.status === "em_andamento" || pedido.status === "agendada") && (
            <Link
              href={`/motorista/abastecimentos/novo?pedido_id=${id}`}
              style={{ background: "#f59e0b", color: "#fff", borderRadius: "8px", padding: "6px 14px", fontSize: "13px", fontWeight: 700, textDecoration: "none" }}
            >
              ⛽ Abastecer
            </Link>
          )}
        </div>
      </div>

      <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>

        {/* Resumo financeiro */}
        <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", padding: "14px" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "8px" }}>Resumo Financeiro</div>
          <Info label="Valor do Pedido"  value={<span style={{ color: "#16a34a" }}>{fmtBRL(pedido.valor_pedido)}</span>} big />
          <Info label="Pagamento" value={pedido.pago
            ? <span style={{ color: "#16a34a" }}>✓ Pago</span>
            : <span style={{ color: "#eab308" }}>Pendente</span>}
          />
        </div>

        {/* Datas */}
        <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", padding: "14px" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "8px" }}>Datas</div>
          <Info label="Início Previsto"   value={fmtDate(pedido.data_inicio_prevista)} />
          <Info label="Fim Previsto" value={fmtDate(pedido.data_fim_prevista)} />
          {pedido.data_inicio_real && <Info label="Início Real"   value={fmtDT(pedido.data_inicio_real)} />}
          {pedido.data_fim_real    && <Info label="Fim Real" value={fmtDT(pedido.data_fim_real)} />}
          <Info label="KM Inicial" value={pedido.km_inicial?.toLocaleString("pt-BR") ?? "—"} />
          <Info label="KM Final"   value={pedido.km_final?.toLocaleString("pt-BR") ?? "—"} />
          {kmRodado != null && <Info label="KM Rodados" value={<span style={{ color: "#2563eb", fontWeight: 700 }}>{kmRodado.toLocaleString("pt-BR")} km</span>} />}
        </div>

        {/* Entregas */}
        <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", padding: "14px" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "8px" }}>
            Entregas deste Pedido ({entregas.length})
          </div>
          {entregas.length === 0 ? (
            <p style={{ fontSize: "13px", color: "#94a3b8", margin: 0 }}>Nenhuma entrega vinculada.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {entregas.map(f => {
                const cliente = Array.isArray(f.clientes) ? f.clientes[0] : f.clientes;
                return (
                  <div key={f.id} style={{ background: "#f8fafc", borderRadius: "8px", padding: "10px 12px" }}>
                    <div style={{ fontWeight: 700, fontSize: "14px", color: "#1e293b", marginBottom: "4px" }}>
                      {f.origem ?? "—"} → {f.destino ?? "—"}
                    </div>
                    {cliente && <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "6px" }}>{cliente.nome_fantasia}</div>}
                    {f.tipo_carga && <div style={{ fontSize: "12px", color: "#64748b" }}>{f.tipo_carga}</div>}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {pedido.observacoes && (
          <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", padding: "14px" }}>
            <div style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "8px" }}>Observações</div>
            <p style={{ fontSize: "13px", color: "#475569", lineHeight: 1.6, margin: 0 }}>{pedido.observacoes}</p>
          </div>
        )}

      </div>
    </div>
  );
}
