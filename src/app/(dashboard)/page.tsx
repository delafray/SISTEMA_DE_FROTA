import { PageHeader, KpiCard } from "@/components/ui/ds";

export default function DashboardPage() {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PageHeader title="Painel de Controle" subtitle="Visão geral do sistema" />
      <div style={{ padding: "16px", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px" }}>
        <KpiCard label="Total de Fretes" value={0} color="info" />
        <KpiCard label="Veículos Ativos" value={0} color="success" />
        <KpiCard label="Lucro do Mês" value="R$ 0,00" color="success" />
      </div>
    </div>
  );
}
