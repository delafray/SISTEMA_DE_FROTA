"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type VeiculoInfo = { id: string; placa: string; marca: string; modelo: string };

const inputMobile: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  fontSize: "16px",
  color: "#1e293b",
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: "10px",
  outline: "none",
  boxSizing: "border-box",
};

function NovoAbastecimentoForm() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  // aceita tanto pedido_id quanto viagem_id (legado) na URL
  const pedidoId     = searchParams.get("pedido_id") ?? searchParams.get("viagem_id");

  const [motoristaId, setMotoristaId] = useState("");
  const [empresaId,   setEmpresaId]   = useState("");
  const [veiculo,     setVeiculo]     = useState<VeiculoInfo | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [saving,      setSaving]      = useState(false);
  const [err,         setErr]         = useState("");
  const [ok,          setOk]          = useState(false);

  const [f, setF] = useState({
    km_no_abast: "",
    litros:      "",
    valor_litro: "",
    valor_total: "",
    posto:       "",
  });

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { router.push("/login"); return; }

      const { data: perfil } = await supabase
        .from("perfis").select("motorista_id").eq("id", auth.user.id).single();
      const mId = perfil?.motorista_id ?? null;
      setMotoristaId(mId ?? "");

      const { data: ue } = await supabase.from("usuario_empresas").select("empresa_id")
        .eq("usuario_id", auth.user.id).eq("is_padrao", true).single();
      if (!ue?.empresa_id) return;
      setEmpresaId(ue.empresa_id);

      if (pedidoId) {
        // busca pedido para pegar veículo
        const { data: pedido } = await supabase.from("pedidos")
          .select("veiculo_id,veiculos(id,placa,marca,modelo)")
          .eq("id", pedidoId)
          .single();
        const v = Array.isArray(pedido?.veiculos) ? pedido.veiculos[0] : pedido?.veiculos;
        if (v) setVeiculo(v as unknown as VeiculoInfo);
      } else if (mId) {
        // fallback: veículo da alocação ativa do motorista
        const { data: vinculo } = await supabase.from("alocacoes")
          .select("veiculo_id")
          .eq("motorista_id", mId)
          .eq("status", "operacional")
          .is("fim", null)
          .maybeSingle();
        if (vinculo?.veiculo_id) {
          const { data: v } = await supabase.from("veiculos")
            .select("id,placa,marca,modelo").eq("id", vinculo.veiculo_id).maybeSingle();
          if (v) setVeiculo(v as unknown as VeiculoInfo);
        }
      }

      setLoading(false);
    };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const val = e.target.value;
    setF(prev => {
      const next = { ...prev, [k]: val };
      if (k === "litros" || k === "valor_litro") {
        const l = parseFloat(k === "litros"      ? val : prev.litros);
        const v = parseFloat(k === "valor_litro" ? val : prev.valor_litro);
        if (!isNaN(l) && !isNaN(v) && l > 0 && v > 0)
          next.valor_total = (l * v).toFixed(2);
      }
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    if (!veiculo)   { setErr("Veículo não identificado. Verifique seu vínculo."); return; }
    if (!motoristaId) { setErr("Motorista não vinculado à sua conta."); return; }
    if (!f.litros || !f.valor_total) { setErr("Preencha Litros e Valor Total."); return; }
    setSaving(true);

    const supabase = createClient();
    const { error } = await supabase.from("abastecimentos").insert({
      empresa_id:   empresaId,
      veiculo_id:   veiculo.id,
      motorista_id: motoristaId,
      km_no_abast:  f.km_no_abast  ? parseFloat(f.km_no_abast)  : null,
      litros:       parseFloat(f.litros),
      valor_litro:  f.valor_litro  ? parseFloat(f.valor_litro)  : null,
      valor_total:  parseFloat(f.valor_total),
      posto:        f.posto.toUpperCase() || null,
      confirmado:   false,
    });

    setSaving(false);
    if (error) { setErr(error.message); return; }
    setOk(true);
    setTimeout(() => router.back(), 1500);
  };

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", color: "#64748b" }}>
      Carregando...
    </div>
  );

  if (ok) return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", gap: "12px", color: "#166534" }}>
      <div style={{ fontSize: "48px" }}>✓</div>
      <div style={{ fontSize: "18px", fontWeight: 700 }}>Abastecimento registrado!</div>
      <div style={{ fontSize: "13px", color: "#64748b" }}>Aguardando confirmação do gestor.</div>
    </div>
  );

  return (
    <div style={{ maxWidth: "480px", margin: "0 auto", fontFamily: "system-ui, sans-serif", paddingBottom: "32px" }}>

      {/* Header */}
      <div style={{ background: "#313f50", padding: "16px" }}>
        <button onClick={() => router.back()}
          style={{ background: "none", border: "none", color: "rgba(147,197,253,0.8)", cursor: "pointer", fontSize: "14px", fontWeight: 600, padding: "0 0 10px 0", display: "block" }}>
          ← Voltar
        </button>
        <div style={{ fontSize: "11px", color: "rgba(147,197,253,0.6)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Registrar Abastecimento
        </div>
        {veiculo && (
          <div style={{ fontSize: "16px", fontWeight: 700, color: "#fff", marginTop: "4px" }}>
            {veiculo.placa} — {veiculo.marca} {veiculo.modelo}
          </div>
        )}
        {!veiculo && (
          <div style={{ fontSize: "14px", color: "rgba(252,165,165,0.9)", marginTop: "4px" }}>
            ⚠ Sem veículo vinculado
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "16px" }}>

        {err && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "10px", padding: "12px 14px", color: "#991b1b", fontSize: "14px" }}>
            ⚠ {err}
          </div>
        )}

        {/* Posto */}
        <div>
          <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>
            Posto
          </label>
          <input
            value={f.posto}
            onChange={set("posto")}
            placeholder="Ex: POSTO IPIRANGA BR-101"
            style={{ ...inputMobile, textTransform: "uppercase" }}
          />
        </div>

        {/* KM */}
        <div>
          <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>
            KM no Abastecimento
          </label>
          <input
            type="number"
            inputMode="numeric"
            value={f.km_no_abast}
            onChange={set("km_no_abast")}
            placeholder="Ex: 185000"
            style={inputMobile}
          />
        </div>

        {/* Litros + R$/L */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <div>
            <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>
              Litros *
            </label>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              value={f.litros}
              onChange={set("litros")}
              placeholder="Ex: 120.50"
              style={inputMobile}
              required
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>
              R$ por Litro
            </label>
            <input
              type="number"
              inputMode="decimal"
              step="0.001"
              value={f.valor_litro}
              onChange={set("valor_litro")}
              placeholder="Ex: 6.490"
              style={inputMobile}
            />
          </div>
        </div>

        {/* Valor Total */}
        <div>
          <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#475569", marginBottom: "6px" }}>
            Valor Total (R$) *
          </label>
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            value={f.valor_total}
            onChange={set("valor_total")}
            placeholder="Auto-calculado ou informe manualmente"
            style={{ ...inputMobile, fontWeight: 700, fontSize: "18px", background: f.valor_total ? "#f0fdf4" : "#f8fafc", borderColor: f.valor_total ? "#86efac" : "#e2e8f0" }}
            required
          />
          {f.litros && f.valor_litro && f.valor_total && (
            <div style={{ fontSize: "11px", color: "#16a34a", marginTop: "4px", fontWeight: 600 }}>
              ✓ {f.litros} L × R$ {f.valor_litro}/L = R$ {f.valor_total}
            </div>
          )}
        </div>

        {/* Aviso */}
        <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: "10px", padding: "12px 14px", fontSize: "12px", color: "#92400e", lineHeight: 1.5 }}>
          O abastecimento ficará como <strong>pendente</strong> até o gestor confirmar.
        </div>

        {/* Botão */}
        <button
          type="submit"
          disabled={saving || !veiculo}
          style={{
            background: saving ? "#94a3b8" : "#2563eb",
            color: "#fff",
            border: "none",
            borderRadius: "12px",
            padding: "16px",
            fontSize: "16px",
            fontWeight: 700,
            cursor: saving || !veiculo ? "default" : "pointer",
            width: "100%",
          }}
        >
          {saving ? "Registrando..." : "Registrar Abastecimento"}
        </button>

      </form>
    </div>
  );
}

export default function NovoAbastecimentoPage() {
  return (
    <Suspense fallback={<div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", color: "#64748b" }}>Carregando...</div>}>
      <NovoAbastecimentoForm />
    </Suspense>
  );
}
