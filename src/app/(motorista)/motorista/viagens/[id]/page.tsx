"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Viagem = {
  id: string;
  status: string;
  data_saida_prevista: string | null;
  data_chegada_prevista: string | null;
  data_saida_real: string | null;
  data_chegada_real: string | null;
  km_inicial: number | null;
  km_final: number | null;
  observacoes: string | null;
  veiculos: { placa: string; marca: string; modelo: string } | null;
  fretes: {
    id: string;
    origem: string | null;
    destino: string | null;
    valor_frete: number | null;
    comissao_motorista_valor: number | null;
    status: string;
    pago: boolean | null;
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

export default function MotoristaViagemDetalhePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [viagem, setViagem] = useState<Viagem | null>(null);
  const [loading, setLoading] = useState(true);
  const [atualizando, setAtualizando] = useState(false);

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { router.push("/login"); return; }
      const { data } = await (supabase as any).from("viagens")
        .select("id,status,data_saida_prevista,data_chegada_prevista,data_saida_real,data_chegada_real,km_inicial,km_final,observacoes,veiculos(placa,marca,modelo),fretes(id,origem,destino,valor_frete,comissao_motorista_valor,status,pago,tipo_carga,clientes(nome_fantasia))")
        .eq("id", id)
        .single();
      setViagem(data);
      setLoading(false);
    };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const mudarStatus = async (novoStatus: string) => {
    setAtualizando(true);
    const supabase = createClient();
    const extra: Record<string, string> = {};
    if (novoStatus === "em_andamento") extra.data_saida_real   = new Date().toISOString();
    if (novoStatus === "concluida")    extra.data_chegada_real = new Date().toISOString();
    await (supabase as any).from("viagens").update({ status: novoStatus, ...extra }).eq("id", id);
    setViagem(p => p ? { ...p, status: novoStatus, ...extra } : p);
    setAtualizando(false);
  };

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", color: "#64748b" }}>Carregando...</div>
  );
  if (!viagem) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", color: "#64748b" }}>Viagem não encontrada.</div>
  );

  const veiculo = Array.isArray(viagem.veiculos) ? viagem.veiculos[0] : viagem.veiculos;
  const fretes  = Array.isArray(viagem.fretes)  ? viagem.fretes       : [];
  const s = STATUS_COLOR[viagem.status] ?? { bg: "#f8fafc", color: "#64748b", border: "#e2e8f0" };
  const totalFrete    = fretes.reduce((acc, f) => acc + (f.valor_frete ?? 0), 0);
  const totalComissao = fretes.reduce((acc, f) => acc + (f.comissao_motorista_valor ?? 0), 0);
  const kmRodado = viagem.km_final != null && viagem.km_inicial != null ? viagem.km_final - viagem.km_inicial : null;

  return (
    <div style={{ maxWidth: "480px", margin: "0 auto", fontFamily: "system-ui, sans-serif", paddingBottom: "32px" }}>

      {/* Header */}
      <div style={{ background: "#313f50", padding: "16px" }}>
        <button onClick={() => router.back()}
          style={{ background: "none", border: "none", color: "rgba(147,197,253,0.8)", cursor: "pointer", fontSize: "14px", fontWeight: 600, padding: "0 0 10px 0", display: "block" }}>
          ← Voltar
        </button>
        <div style={{ fontSize: "11px", color: "rgba(147,197,253,0.6)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Detalhes da Viagem
        </div>
        {veiculo && (
          <h1 style={{ fontSize: "18px", fontWeight: 700, color: "#fff", margin: "4px 0 8px", lineHeight: 1.2 }}>
            {veiculo.placa} — {veiculo.marca} {veiculo.modelo}
          </h1>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <span style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}`, borderRadius: "6px", padding: "3px 10px", fontSize: "12px", fontWeight: 700 }}>
            {STATUS_LABEL[viagem.status] ?? viagem.status}
          </span>
          {viagem.status === "agendada" && (
            <button onClick={() => mudarStatus("em_andamento")} disabled={atualizando}
              style={{ background: "#2563eb", color: "#fff", border: "none", borderRadius: "8px", padding: "6px 14px", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}>
              {atualizando ? "..." : "Iniciar Viagem"}
            </button>
          )}
          {viagem.status === "em_andamento" && (
            <button onClick={() => mudarStatus("concluida")} disabled={atualizando}
              style={{ background: "#16a34a", color: "#fff", border: "none", borderRadius: "8px", padding: "6px 14px", fontSize: "13px", fontWeight: 700, cursor: "pointer" }}>
              {atualizando ? "..." : "Concluir Viagem"}
            </button>
          )}
          {(viagem.status === "em_andamento" || viagem.status === "agendada") && (
            <Link
              href={`/motorista/abastecimentos/novo?viagem_id=${id}`}
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
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0" }}>
            <Info label="Valor Total Fretes"  value={<span style={{ color: "#16a34a" }}>{fmtBRL(totalFrete)}</span>} big />
            <Info label="Sua Comissão Total"   value={<span style={{ color: "#7c3aed" }}>{fmtBRL(totalComissao)}</span>} big />
          </div>
        </div>

        {/* Datas */}
        <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", padding: "14px" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "8px" }}>Datas</div>
          <Info label="Saída Prevista"   value={fmtDate(viagem.data_saida_prevista)} />
          <Info label="Chegada Prevista" value={fmtDate(viagem.data_chegada_prevista)} />
          {viagem.data_saida_real   && <Info label="Saída Real"   value={fmtDT(viagem.data_saida_real)} />}
          {viagem.data_chegada_real && <Info label="Chegada Real" value={fmtDT(viagem.data_chegada_real)} />}
          <Info label="KM Inicial" value={viagem.km_inicial?.toLocaleString("pt-BR") ?? "—"} />
          <Info label="KM Final"   value={viagem.km_final?.toLocaleString("pt-BR") ?? "—"} />
          {kmRodado != null && <Info label="KM Rodados" value={<span style={{ color: "#2563eb", fontWeight: 700 }}>{kmRodado.toLocaleString("pt-BR")} km</span>} />}
        </div>

        {/* Fretes */}
        <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", padding: "14px" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "8px" }}>
            Fretes desta Viagem ({fretes.length})
          </div>
          {fretes.length === 0 ? (
            <p style={{ fontSize: "13px", color: "#94a3b8", margin: 0 }}>Nenhum frete vinculado.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {fretes.map(f => {
                const cliente = Array.isArray(f.clientes) ? f.clientes[0] : f.clientes;
                return (
                  <div key={f.id} style={{ background: "#f8fafc", borderRadius: "8px", padding: "10px 12px" }}>
                    <div style={{ fontWeight: 700, fontSize: "14px", color: "#1e293b", marginBottom: "4px" }}>
                      {f.origem ?? "—"} → {f.destino ?? "—"}
                    </div>
                    {cliente && <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "6px" }}>{cliente.nome_fantasia}</div>}
                    {f.tipo_carga && <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "6px" }}>{f.tipo_carga}</div>}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: "15px", fontWeight: 700, color: "#166534" }}>{fmtBRL(f.valor_frete)}</span>
                      {f.comissao_motorista_valor != null && (
                        <span style={{ fontSize: "13px", color: "#7c3aed", fontWeight: 600 }}>
                          Comissão: {fmtBRL(f.comissao_motorista_valor)}
                          {f.pago && <span style={{ marginLeft: "6px", fontSize: "10px", background: "#dcfce7", color: "#166534", padding: "1px 5px", borderRadius: "4px" }}>PAGO</span>}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {viagem.observacoes && (
          <div style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", padding: "14px" }}>
            <div style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "8px" }}>Observações</div>
            <p style={{ fontSize: "13px", color: "#475569", lineHeight: 1.6, margin: 0 }}>{viagem.observacoes}</p>
          </div>
        )}

      </div>
    </div>
  );
}
