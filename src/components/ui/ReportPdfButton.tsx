"use client";

import React, { useState } from "react";
import jsPDF from "jspdf";
import { Btn } from "@/components/ui/ds";

/** Subconjunto da Web Share API (nem sempre presente no `lib.dom`). */
interface NavigatorWithShare {
  share?: (data: { title?: string; text?: string; url?: string; files?: File[] }) => Promise<void>;
  canShare?: (data: { files?: File[] }) => boolean;
}

interface ReportPdfButtonProps {
  title: string;
  fileName: string;
  buildPdf: (doc: jsPDF) => Promise<void> | void;
  variant?: "primary" | "danger" | "ghost" | "outline";
  size?: "xs" | "sm" | "md";
  className?: string;
  icon?: React.ReactNode;
  children?: React.ReactNode;
  orientation?: "portrait" | "landscape";
}

export function ReportPdfButton({
  title,
  fileName,
  buildPdf,
  variant = "outline",
  size = "sm",
  className = "",
  icon = "📊",
  children = "Relatório",
  orientation = "portrait",
}: ReportPdfButtonProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);

  const handleGenerate = async () => {
    try {
      setIsGenerating(true);
      // Wait a tiny bit so the UI has time to render the loading state
      await new Promise((resolve) => setTimeout(resolve, 300));

      const doc = new jsPDF({
        orientation: orientation,
        unit: "mm",
        format: "a4",
        compress: true,
      });

      // Call the page-specific PDF builder
      await buildPdf(doc);

      // Get the Blob representation of the PDF
      const blob = doc.output("blob");
      setPdfBlob(blob);
      setShowModal(true);
    } catch (error) {
      console.error("Erro ao gerar PDF:", error);
      alert("Ocorreu um erro ao tentar gerar o PDF do relatório.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleView = () => {
    if (!pdfBlob) return;
    const url = URL.createObjectURL(pdfBlob);
    window.open(url, "_blank", "noopener");
    // Deferred memory cleanup to give time for the new tab to read/render
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  const handleDownload = () => {
    if (!pdfBlob) return;
    const url = URL.createObjectURL(pdfBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Revoke URL to free memory
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const handleShare = async () => {
    if (!pdfBlob) return;
    
    const nav = typeof navigator !== "undefined" ? (navigator as unknown as NavigatorWithShare) : null;
    const pdfFile = new File([pdfBlob], fileName, { type: "application/pdf" });

    if (nav && nav.share && nav.canShare && nav.canShare({ files: [pdfFile] })) {
      try {
        await nav.share({
          title: title,
          text: `Seguem as informações contidas no relatório: ${title}.`,
          files: [pdfFile],
        });
        return;
      } catch (e) {
        console.log("Compartilhamento nativo cancelado ou falhou:", e);
        if ((e as Error).name === "AbortError") {
          return;
        }
      }
    }
    
    // Fallback para navegadores de desktop que não suportam compartilhamento de arquivo
    handleDownload();
    alert("O relatório foi baixado com sucesso! Agora você pode compartilhá-lo manualmente.");
  };

  return (
    <>
      <Btn
        variant={variant}
        size={size}
        className={className}
        icon={icon}
        onClick={handleGenerate}
        disabled={isGenerating}
      >
        {isGenerating ? "Gerando..." : children}
      </Btn>

      {/* ─── LOADING OVERLAY ─── */}
      {isGenerating && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(15, 23, 42, 0.6)",
            backdropFilter: "blur(4px)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
            gap: "16px",
            color: "#ffffff",
          }}
        >
          <div
            style={{
              width: "48px",
              height: "48px",
              border: "4px solid rgba(255, 255, 255, 0.1)",
              borderTop: "4px solid #3b82f6",
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
            }}
          />
          <style>{`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}</style>
          <p style={{ fontSize: "14px", fontWeight: 600, margin: 0, letterSpacing: "0.05em" }}>
            MONTANDO RELATÓRIO...
          </p>
        </div>
      )}

      {/* ─── OPTIONS POPUP MODAL ─── */}
      {showModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(15, 23, 42, 0.75)",
            backdropFilter: "blur(5px)",
            zIndex: 9998,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
          }}
          onClick={() => setShowModal(false)}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: "16px",
              width: "100%",
              maxWidth: "420px",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.3)",
              display: "flex",
              flexDirection: "column",
              position: "relative",
              animation: "scaleUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
              overflow: "hidden",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <style>{`
              @keyframes scaleUp {
                from { opacity: 0; transform: scale(0.95) translateY(10px); }
                to { opacity: 1; transform: scale(1) translateY(0); }
              }
            `}</style>

            {/* Orange Premium Header Banner */}
            <div
              style={{
                background: "linear-gradient(135deg, #e05200 0%, #a63200 100%)",
                padding: "18px 20px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                color: "#ffffff",
                width: "100%",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", flexGrow: 1, gap: "14px" }}>
                {/* Custom White PDF Document Icon */}
                <svg
                  width="28"
                  height="28"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ flexShrink: 0 }}
                >
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" fill="rgba(255, 255, 255, 0.15)" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
                {/* Text Block */}
                <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                  <span style={{ fontWeight: 700, fontSize: "15px", letterSpacing: "-0.01em", wordBreak: "break-all", lineHeight: 1.2 }}>
                    {fileName}
                  </span>
                  <span style={{ fontSize: "11px", opacity: 0.9, fontWeight: 500 }}>
                    PDF gerado com sucesso
                  </span>
                </div>
              </div>

              {/* Close Icon Button */}
              <button
                onClick={() => setShowModal(false)}
                style={{
                  background: "none",
                  border: "none",
                  color: "#ffffff",
                  fontSize: "18px",
                  cursor: "pointer",
                  padding: "4px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginLeft: "12px",
                  opacity: 0.8,
                  transition: "opacity 150ms",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.8")}
              >
                ✕
              </button>
            </div>

            {/* Modal Body with Action Buttons Stack */}
            <div
              style={{
                padding: "24px",
                display: "flex",
                flexDirection: "column",
                gap: "12px",
                width: "100%",
              }}
            >
              
              {/* Option 1: View in New Tab (Blue Style) */}
              <button
                onClick={handleView}
                style={{
                  width: "100%",
                  height: "48px",
                  borderRadius: "10px",
                  background: "#eff6ff",
                  color: "#2563eb",
                  border: "none",
                  fontWeight: 600,
                  fontSize: "14px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "10px",
                  transition: "background 150ms, transform 100ms",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#dbeafe")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "#eff6ff")}
                onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.98)")}
                onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                Visualizar no navegador
              </button>

              {/* Option 2: Download PDF (Orange Style) */}
              <button
                onClick={handleDownload}
                style={{
                  width: "100%",
                  height: "48px",
                  borderRadius: "10px",
                  background: "#fff7ed",
                  color: "#ea580c",
                  border: "none",
                  fontWeight: 600,
                  fontSize: "14px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "10px",
                  transition: "background 150ms, transform 100ms",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#ffedd5")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "#fff7ed")}
                onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.98)")}
                onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Baixar PDF
              </button>

              {/* Option 3: Share (Green Style) */}
              <button
                onClick={handleShare}
                style={{
                  width: "100%",
                  height: "48px",
                  borderRadius: "10px",
                  background: "#f0fdf4",
                  color: "#16a34a",
                  border: "none",
                  fontWeight: 600,
                  fontSize: "14px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "10px",
                  transition: "background 150ms, transform 100ms",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#dcfce7")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "#f0fdf4")}
                onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.98)")}
                onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: "rotate(-30deg)", flexShrink: 0 }}>
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
                Compartilhar
              </button>

              {/* Close Text Link Button */}
              <button
                onClick={() => setShowModal(false)}
                style={{
                  background: "none",
                  border: "none",
                  color: "#64748b",
                  fontWeight: 600,
                  fontSize: "14px",
                  cursor: "pointer",
                  marginTop: "8px",
                  padding: "8px 16px",
                  alignSelf: "center",
                  transition: "color 150ms, text-decoration 150ms",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = "#334155";
                  e.currentTarget.style.textDecoration = "underline";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = "#64748b";
                  e.currentTarget.style.textDecoration = "none";
                }}
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
