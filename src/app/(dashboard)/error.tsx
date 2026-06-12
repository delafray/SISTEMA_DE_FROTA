"use client";

export default function DashboardError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      height: "100%", padding: "32px 16px", gap: "16px", textAlign: "center",
    }}>
      <div style={{ fontSize: "32px" }}>⚠️</div>
      <div style={{ fontSize: "16px", fontWeight: 700, color: "#991b1b" }}>
        Não foi possível carregar o painel
      </div>
      <div style={{ fontSize: "14px", color: "#475569", maxWidth: "320px" }}>
        Verifique sua conexão e tente atualizar a página.
      </div>
      <button
        onClick={reset}
        style={{
          padding: "12px 24px", minHeight: "44px",
          background: "#2563eb", color: "#fff",
          border: "none", borderRadius: "8px",
          fontSize: "14px", fontWeight: 600, cursor: "pointer",
        }}
      >
        Tentar novamente
      </button>
    </div>
  );
}
