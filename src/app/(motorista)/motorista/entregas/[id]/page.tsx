"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Detalhe = {
  id: string; status: string;
  origem: string | null; destino: string | null;
  km_inicial: number | null; km_final: number | null;
  tipo_carga: string | null; peso_carga_kg: number | null;
  data_coleta_prevista: string | null; data_entrega_prevista: string | null;
  observacoes: string | null;
  pedido_id: string | null;
  veiculos: { placa: string; modelo: string; marca: string } | null;
  clientes: { nome_fantasia: string } | null;
};

type PedidoPai = {
  id: string;
  valor_pedido: number | null;
  forma_pagamento: string | null;
  pago: boolean | null;
  data_pagamento: string | null;
};

const STATUS_COLOR: Record<string, { bg: string; color: string; border: string }> = {
  agendado:     { bg: "#fffbeb", color: "#92400e", border: "#fde68a" },
  em_andamento: { bg: "#eff6ff", color: "#1e40af", border: "#bfdbfe" },
  concluido:    { bg: "#f0fdf4", color: "#166534", border: "#bbf7d0" },
  cancelado:    { bg: "#fef2f2", color: "#991b1b", border: "#fecaca" },
};
const STATUS_LABEL: Record<string, string> = {
  agendado: "Agendado", em_andamento: "Em Andamento", concluido: "Concluído", cancelado: "Cancelado",
};
const PGTO_LABEL: Record<string, string> = {
  a_vista: "À vista", "7d": "7 dias", "14d": "14 dias", "21d": "21 dias",
  "30d": "30 dias", "45d": "45 dias", "60d": "60 dias", outros: "Outros",
};

const fmtBRL  = (v: number | null) => v != null ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
const fmtDate = (d: string | null) => d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR") : "—";

function Info({ label, value, big }: { label: string; value: React.ReactNode; big?: boolean }) {
  return (
    <div style={{ padding: "10px 0", borderBottom: "1px solid #f1f5f9" }}>
      <div style={{ fontSize: "10px", color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "2px" }}>{label}</div>
      <div style={{ fontSize: big ? "17px" : "14px", color: "#1e293b", fontWeight: big ? 700 : 500, lineHeight: 1.3 }}>{value}</div>
    </div>
  );
}

export default function MotoristaEntregaDetalhePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [entrega, setEntrega] = useState<Detalhe | null>(null);
  const [pedido, setPedido] = useState<PedidoPai | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { router.push("/login"); return; }

      const { data } = await supabase
        .from("entregas")
        .select("id,status,origem,destino,km_inicial,km_final,tipo_carga,peso_carga_kg,data_coleta_prevista,data_entrega_prevista,observacoes,pedido_id,veiculos(placa,modelo,marca),clientes(nome_fantasia)")
        .eq("id", id)
        .single();
      setEntrega(data as unknown as Detalhe | null);

      if (data?.pedido_id) {
        const { data: ped } = await supabase
          .from("pedidos")
          .select("id,valor_pedido,forma_pagamento,pago,data_pagamento")
          .eq("id", data.pedido_id)
          .single();
        setPedido(ped as unknown as PedidoPai | null);
      }

      setLoading(false);
    };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", color: "#64748b" }}>
      Carregando...
    </div>
  );

  if (!entrega) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", color: "#64748b" }}>
      Entrega não encontrada.
    </div>
  );

  const veiculo = Array.isArray(entrega.veiculos) ? entrega.veiculos[0] : entrega.veiculos;
  const cliente = Array.isArray(entrega.clientes) ? entrega.clientes[0] : entrega.clientes;
  const kmRodado = entrega.km_final != null && entrega.km_inicial != null ? entrega.km_final - entrega.km_inicial : null;
  const s = STATUS_COLOR[entrega.status] ?? { bg: "#f8fafc", color: "#64748b", border: "#e2e8f0" };

  return (
    <div style={{ maxWidth: "480px", margin: "0 auto", fontFamily: "system-ui, sans-serif", paddingBottom: "32px" }}>

      {/* Header */}
      <div style={{ background: "#313f50", padding: "16px" }}>
        <button
          onClick={() => router.back()}
          style={{ background: "none", border: "none", color: "rgba(147,197,253,0.8)", cursor: "pointer", fontSize: "14px", fontWeight: 600, padding: "0 0 10px 0", display: "block" }}
        >
          ← Voltar
        </button>
        <div style={{ fontSize: "11px", color: "rgba(147,197,253,0.6)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Detalhes da Entrega
        </div>
        <h1 style={{ fontSize: "18px", fontWeight: 700, color: "#fff", margin: "4px 0 8px", lineHeight: 1.2 }}>
          {entrega.origem} → {entrega.destino}
        </h1>
        <span style={{
          background: s.bg, color: s.color, border: `1px solid ${s.border}`,
          borderRadius: "6px", padding: "3px 10px", fontSize: "12px", fontWeight: 700,
        }}>
          {STATUS_LABEL[entrega.status] ?? entrega.status}
        </span>
      </div>

      <div style={{ padding: "16px" }}>

        {/* Pedido (Faturamento) */}
        {pedido && (
          <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", padding: "14px", marginBottom: "12px" }}>
            <div style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "8px" }}>Pedido (Faturamento)</div>
            <Info label="Valor do Pedido" value={<span style={{ color: "#16a34a" }}>{fmtBRL(pedido.valor_pedido)}</span>} big />
            <Info label="Pagamento"
              value={pedido.pago
                ? <span style={{ color: "#16a34a" }}>✓ Pago {pedido.data_pagamento ? `em ${fmtDate(pedido.data_pagamento)}` : ""}</span>
                : <span style={{ color: "#eab308" }}>Pendente</span>}
            />
            {pedido.forma_pagamento && <Info label="Condição" value={PGTO_LABEL[pedido.forma_pagamento] ?? pedido.forma_pagamento} />}
          </div>
        )}

        {/* Rota */}
        <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", padding: "14px", marginBottom: "12px" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "8px" }}>Rota e Datas</div>
          <Info label="Coleta Prevista"  value={fmtDate(entrega.data_coleta_prevista)} />
          <Info label="Entrega Prevista" value={fmtDate(entrega.data_entrega_prevista)} />
          <Info label="KM Inicial"       value={entrega.km_inicial?.toLocaleString("pt-BR") ?? "—"} />
          <Info label="KM Final"         value={entrega.km_final?.toLocaleString("pt-BR") ?? "—"} />
          {kmRodado != null && <Info label="KM Rodados" value={<span style={{ color: "#2563eb", fontWeight: 700 }}>{kmRodado.toLocaleString("pt-BR")} km</span>} />}
        </div>

        {/* Carga e Veículo */}
        <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", padding: "14px", marginBottom: "12px" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "8px" }}>Carga e Veículo</div>
          {entrega.tipo_carga   && <Info label="Tipo de Carga" value={entrega.tipo_carga} />}
          {entrega.peso_carga_kg && <Info label="Peso" value={`${entrega.peso_carga_kg.toLocaleString("pt-BR")} kg`} />}
          {veiculo && <Info label="Veículo" value={`${veiculo.placa} — ${veiculo.marca} ${veiculo.modelo}`} />}
          {cliente && <Info label="Cliente" value={cliente.nome_fantasia} />}
        </div>

        {/* Observações */}
        {entrega.observacoes && (
          <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", padding: "14px" }}>
            <div style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "8px" }}>Observações</div>
            <p style={{ fontSize: "13px", color: "#475569", lineHeight: 1.6, margin: 0 }}>{entrega.observacoes}</p>
          </div>
        )}

      </div>
    </div>
  );
}
