"use client";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { PageHeader, Tabs, Alert } from "@/components/ui/ds";
import FluxoTab from "./_components/FluxoTab";
import AReceberTab from "./_components/AReceberTab";
import APagarTab from "./_components/APagarTab";
import AvulsasTab from "./_components/AvulsasTab";
import RecorrenciasTab from "./_components/RecorrenciasTab";

type TabId = "fluxo" | "receber" | "pagar" | "avulsas" | "recorrencias";

export default function FinanceiroPage() {
  const [tab, setTab] = useState<TabId>("fluxo");
  const [empresaId, setEmpresaId] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const { data: ue } = await supabase.from("usuario_empresas")
        .select("empresa_id").eq("usuario_id", auth.user.id).eq("is_padrao", true).single();
      if (!ue?.empresa_id) { setErr("Empresa não encontrada"); setLoading(false); return; }
      setEmpresaId(ue.empresa_id);
      setLoading(false);
    };
    load();
  }, []);

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#64748b" }}>
      Carregando...
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PageHeader title="Financeiro" subtitle="Fluxo de caixa, contas a pagar e receber" />

      <div style={{ padding: "0 16px", background: "#fff" }}>
        <Tabs
          active={tab}
          onChange={(id) => setTab(id as TabId)}
          tabs={[
            { id: "fluxo", label: "Fluxo Diário" },
            { id: "receber", label: "A Receber" },
            { id: "pagar", label: "A Pagar" },
            { id: "avulsas", label: "Despesas Avulsas" },
            { id: "recorrencias", label: "Recorrências" },
          ]}
        />
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "16px" }}>
        {err && <div style={{ marginBottom: "16px" }}><Alert variant="error">⚠ {err}</Alert></div>}
        {empresaId && (
          <>
            {tab === "fluxo" && <FluxoTab empresaId={empresaId} />}
            {tab === "receber" && <AReceberTab empresaId={empresaId} />}
            {tab === "pagar" && <APagarTab empresaId={empresaId} />}
            {tab === "avulsas" && <AvulsasTab empresaId={empresaId} />}
            {tab === "recorrencias" && <RecorrenciasTab empresaId={empresaId} />}
          </>
        )}
      </div>
    </div>
  );
}
