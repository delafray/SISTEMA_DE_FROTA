"use client";

import React, { useState, useEffect } from "react";
import jsPDF from "jspdf";
import { Btn } from "@/components/ui/ds";

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
  const [canShare, setCanShare] = useState(false);

  // Check if browser/device supports Web Share API for PDF files
  useEffect(() => {
    const nav = typeof navigator !== "undefined" ? (navigator as any) : null;
    if (nav && nav.share && nav.canShare) {
      try {
        const dummyFile = new File([new Blob([])], "test.pdf", { type: "application/pdf" });
        if (nav.canShare({ files: [dummyFile] })) {
          setCanShare(true);
        }
      } catch (e) {
        console.warn("Navegador não suporta compartilhamento de arquivos PDF:", e);
      }
    }
  }, []);

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
    
    // Blob to File transmutation for Web Share API Nível 2
    const pdfFile = new File([pdfBlob], fileName, { type: "application/pdf" });

    try {
      await navigator.share({
        title: title,
        text: `Seguem as informações contidas no relatório: ${title}.`,
        files: [pdfFile],
      });
    } catch (e) {
      console.log("Compartilhamento cancelado ou indisponível:", e);
    }
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
              maxWidth: "400px",
              padding: "24px",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              position: "relative",
              animation: "scaleUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <style>{`
              @keyframes scaleUp {
                from { opacity: 0; transform: scale(0.9) translateY(10px); }
                to { opacity: 1; transform: scale(1) translateY(0); }
              }
            `}</style>

            {/* Close Button */}
            <button
              onClick={() => setShowModal(false)}
              style={{
                position: "absolute",
                top: "16px",
                right: "16px",
                background: "rgba(0, 0, 0, 0.05)",
                border: "none",
                borderRadius: "50%",
                width: "28px",
                height: "28px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                color: "#64748b",
                fontWeight: "bold",
                fontSize: "14px",
                transition: "background 150ms",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(0, 0, 0, 0.1)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(0, 0, 0, 0.05)")}
            >
              ✕
            </button>

            {/* Document Red Accent Icon */}
            <div
              style={{
                width: "56px",
                height: "56px",
                borderRadius: "12px",
                background: "linear-gradient(135deg, #ef4444, #b91c1c)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "28px",
                color: "#ffffff",
                marginBottom: "16px",
                boxShadow: "0 10px 15px -3px rgba(239, 68, 68, 0.3)",
              }}
            >
              📄
            </div>

            {/* Text Title & Subtitle */}
            <h3
              style={{
                fontSize: "16px",
                fontWeight: 700,
                color: "#0f172a",
                margin: "0 0 6px 0",
                textAlign: "center",
              }}
            >
              Relatório Pronto!
            </h3>
            <p
              style={{
                fontSize: "12px",
                color: "#64748b",
                margin: "0 0 20px 0",
                textAlign: "center",
                wordBreak: "break-all",
                padding: "0 12px",
              }}
            >
              {fileName}
            </p>

            {/* Action Buttons Stack */}
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", width: "100%" }}>
              
              {/* Gold Option: Share via WhatsApp (if Web Share API supported) */}
              {canShare ? (
                <button
                  onClick={handleShare}
                  style={{
                    width: "100%",
                    padding: "12px",
                    borderRadius: "8px",
                    background: "linear-gradient(135deg, #22c55e, #15803d)",
                    color: "#ffffff",
                    border: "none",
                    fontWeight: 600,
                    fontSize: "13px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                    boxShadow: "0 4px 12px rgba(34, 197, 94, 0.2)",
                    transition: "transform 150ms",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.02)")}
                  onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
                >
                  🟢 Encaminhar via Zap / Compartilhar
                </button>
              ) : (
                <div
                  style={{
                    fontSize: "10px",
                    color: "#94a3b8",
                    textAlign: "center",
                    margin: "0 0 4px 0",
                  }}
                >
                  (Opção de WhatsApp nativo indisponível neste navegador)
                </div>
              )}

              {/* View Button */}
              <button
                onClick={handleView}
                style={{
                  width: "100%",
                  padding: "11px",
                  borderRadius: "8px",
                  background: "#ffffff",
                  color: "#334155",
                  border: "1px solid #cbd5e1",
                  fontWeight: 600,
                  fontSize: "13px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                  transition: "background 150ms",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#f8fafc")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "#ffffff")}
              >
                🔍 Visualizar em Nova Aba
              </button>

              {/* Download Button */}
              <button
                onClick={handleDownload}
                style={{
                  width: "100%",
                  padding: "11px",
                  borderRadius: "8px",
                  background: "#ffffff",
                  color: "#334155",
                  border: "1px solid #cbd5e1",
                  fontWeight: 600,
                  fontSize: "13px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                  transition: "background 150ms",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#f8fafc")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "#ffffff")}
              >
                💾 Baixar para o Dispositivo
              </button>

            </div>
          </div>
        </div>
      )}
    </>
  );
}
