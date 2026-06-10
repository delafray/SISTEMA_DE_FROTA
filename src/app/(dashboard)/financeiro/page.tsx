"use client";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { empresasDoUsuario } from "@/lib/utils/empresaDe";
import { PageHeader, Tabs, Alert } from "@/components/ui/ds";
import FluxoTab from "./_components/FluxoTab";
import APagarTab from "./_components/APagarTab";
import AvulsasTab from "./_components/AvulsasTab";
import RecorrenciasTab from "./_components/RecorrenciasTab";

// "A Receber" foi UNIFICADO no Financeiro por Cliente (/faturamento) —
// decisão do dono 10/06/2026: aquela é a tela principal de recebíveis.
type TabId = "fluxo" | "pagar" | "avulsas" | "recorrencias";

export default function FinanceiroPage() {
  const [tab, setTab] = useState<TabId>("fluxo");
  const [empresas, setEmpresas] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      // Empresas do gestor (de usuario_empresas). Vazio = TODAS (secretária/sem trava).
      const emps = await empresasDoUsuario(supabase);
      let lista = emps;
      if (!lista) {
        const { data } = await supabase.from("empresas").select("id");
        lista = (data ?? []).map((e) => e.id);
      }
      if (lista.length === 0) { setErr("Nenhuma empresa cadastrada."); setLoading(false); return; }
      setEmpresas(lista);
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
            { id: "pagar", label: "A Pagar" },
            { id: "avulsas", label: "Despesas Avulsas" },
            { id: "recorrencias", label: "Recorrências" },
          ]}
        />
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "16px" }}>
        {err && <div style={{ marginBottom: "16px" }}><Alert variant="error">⚠ {err}</Alert></div>}
        {empresas.length > 0 && (
          <>
            {tab === "fluxo" && <FluxoTab empresas={empresas} />}
            {tab === "pagar" && <APagarTab empresas={empresas} />}
            {tab === "avulsas" && <AvulsasTab empresas={empresas} />}
            {tab === "recorrencias" && <RecorrenciasTab empresas={empresas} />}
          </>
        )}
      </div>
    </div>
  );
}
