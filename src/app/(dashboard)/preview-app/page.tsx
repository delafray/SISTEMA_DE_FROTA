"use client";

import { useState, useEffect, useRef } from "react";
import { PageHeader, Btn } from "@/components/ui/ds";

const PAGES = [
  { label: "Início / Viagens",  path: "/motorista" },
  { label: "Detalhe da Viagem", path: "/motorista" },
  { label: "Registrar Abastecimento", path: "/motorista/abastecimentos/novo" },
];

// Dimensões reais da tela (sem bezel)
const PHONE_W = 390;
const PHONE_H = 844;
const BEZEL   = 14;

export default function PreviewAppPage() {
  const [page,    setPage]    = useState(PAGES[0].path);
  const [scale,   setScale]   = useState(1);
  const [menuOpen, setMenuOpen] = useState(false);
  const areaRef               = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const calc = () => {
      if (!areaRef.current) return;
      const { width, height } = areaRef.current.getBoundingClientRect();
      const availH = height - 48;
      const availW = width  - 48;
      const totalW = PHONE_W + BEZEL * 2;
      const totalH = PHONE_H + BEZEL * 2;
      setScale(Math.min(1, availW / totalW, availH / totalH));
    };
    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PageHeader
        title="Preview — App Motorista"
        subtitle="Simulador do app no navegador"
      />

      <div style={{ flex: 1, display: "flex", overflow: "hidden", position: "relative" }}>

        {/* Overlay para fechar o menu */}
        {menuOpen && (
          <div
            onClick={() => setMenuOpen(false)}
            style={{ position: "absolute", inset: 0, zIndex: 10 }}
          />
        )}

        {/* Drawer de navegação */}
        <div style={{
          position: "absolute", top: 0, left: 0, bottom: 0,
          width: 220,
          background: "#fff",
          borderRight: "1px solid #e2e8f0",
          padding: "20px 12px",
          display: "flex", flexDirection: "column", gap: 4,
          transform: menuOpen ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 220ms ease",
          zIndex: 20,
          boxShadow: menuOpen ? "4px 0 24px rgba(0,0,0,0.12)" : "none",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", margin: 0 }}>
              Páginas
            </p>
            <button onClick={() => setMenuOpen(false)}
              style={{ background: "none", border: "none", fontSize: 18, color: "#94a3b8", cursor: "pointer", lineHeight: 1, padding: "0 2px" }}>
              ×
            </button>
          </div>
          {PAGES.map(p => (
            <button
              key={p.label}
              onClick={() => { setPage(p.path + "?t=" + Date.now()); setMenuOpen(false); }}
              style={{
                padding: "9px 12px", borderRadius: 8, border: "none",
                background: page.startsWith(p.path) ? "#eff6ff" : "transparent",
                color: page.startsWith(p.path) ? "#2563eb" : "#64748b",
                fontWeight: page.startsWith(p.path) ? 700 : 500,
                fontSize: 13, textAlign: "left", cursor: "pointer",
              }}
            >
              {p.label}
            </button>
          ))}
          <div style={{ marginTop: "auto", paddingTop: 20, borderTop: "1px solid #f1f5f9" }}>
            <p style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.6, margin: 0 }}>
              O app carrega com sua sessão atual. Para ver dados reais, acesse com um login de motorista.
            </p>
          </div>
        </div>

        {/* Área do celular */}
        <div
          ref={areaRef}
          style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: "#cbd5e1", overflow: "hidden", flexDirection: "column", gap: 16 }}
        >
          {/* Botão flutuante de páginas */}
          <button
            onClick={() => setMenuOpen(true)}
            style={{
              position: "absolute", top: 12, left: 12,
              background: "#fff", border: "1px solid #e2e8f0",
              borderRadius: 8, padding: "6px 12px",
              fontSize: 12, fontWeight: 600, color: "#475569",
              cursor: "pointer", zIndex: 5,
              boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            ☰ Páginas
          </button>
          {/* Wrapper com transform scale */}
          <div style={{ transform: `scale(${scale})`, transformOrigin: "center center" }}>

            {/* Corpo do celular */}
            <div style={{
              width:  PHONE_W + BEZEL * 2,
              height: PHONE_H + BEZEL * 2,
              background: "linear-gradient(160deg, #2a2a2a, #111)",
              borderRadius: 56,
              padding: BEZEL,
              boxShadow: [
                "0 0 0 1px #000",
                "0 0 0 2px #3a3a3a",
                "0 40px 100px rgba(0,0,0,0.6)",
                "inset 0 1px 0 rgba(255,255,255,0.08)",
              ].join(", "),
              position: "relative",
            }}>

              {/* Botão direito (power) */}
              <div style={{ position: "absolute", right: -3, top: 160, width: 3, height: 72, background: "#3a3a3a", borderRadius: "0 2px 2px 0" }} />
              {/* Botões esquerda */}
              <div style={{ position: "absolute", left: -3, top: 112, width: 3, height: 36, background: "#3a3a3a", borderRadius: "2px 0 0 2px" }} />
              <div style={{ position: "absolute", left: -3, top: 160, width: 3, height: 64, background: "#3a3a3a", borderRadius: "2px 0 0 2px" }} />
              <div style={{ position: "absolute", left: -3, top: 234, width: 3, height: 64, background: "#3a3a3a", borderRadius: "2px 0 0 2px" }} />

              {/* Tela */}
              <div style={{
                width: PHONE_W, height: PHONE_H,
                borderRadius: 44,
                overflow: "hidden",
                background: "#fff",
                position: "relative",
              }}>
                {/* Dynamic Island */}
                <div style={{
                  position: "absolute", top: 12, left: "50%",
                  transform: "translateX(-50%)",
                  width: 120, height: 34,
                  background: "#000",
                  borderRadius: 20,
                  zIndex: 20,
                  pointerEvents: "none",
                }} />

                {/* iframe */}
                <iframe
                  key={page}
                  src={page}
                  style={{ width: "100%", height: "100%", border: "none", display: "block" }}
                  title="App Motorista"
                />
              </div>

              {/* Barra home */}
              <div style={{
                position: "absolute",
                bottom: 8, left: "50%",
                transform: "translateX(-50%)",
                width: 130, height: 5,
                background: "rgba(255,255,255,0.25)",
                borderRadius: 3,
              }} />
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
