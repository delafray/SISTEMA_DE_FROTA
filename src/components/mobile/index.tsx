"use client";

/**
 * SISTEMA DE FROTA — Mobile Components Framework
 * ───────────────────────────────────────────────
 * Componentes dedicados para experiência mobile iPhone-first.
 * Usam classes CSS de ./mobile.css para responsividade.
 * Nunca alteram o desktop.
 */

import React from "react";
import Link from "next/link";

// ─── MOBILE CARD ──────────────────────────────────────────────────────────────
// Card para listagens mobile — substitui linhas de tabela

type DetailItem = { label: string; value: React.ReactNode };

export const MobileCard: React.FC<{
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  details?: DetailItem[];
  onClick?: () => void;
  href?: string;
  actions?: React.ReactNode;
  highlight?: string; // cor da borda left
}> = ({ title, subtitle, badge, details, onClick, href, actions, highlight }) => {
  const content = (
    <div
      className={`m-card ${onClick || href ? "m-card-clickable" : ""}`}
      onClick={onClick}
      style={{
        borderLeft: highlight ? `4px solid ${highlight}` : undefined,
      }}
    >
      {/* Header: título + badge */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: "8px",
      }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{
            fontSize: "14px",
            fontWeight: 600,
            color: "#1e293b",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}>
            {title}
          </div>
          {subtitle && (
            <div style={{
              fontSize: "12px",
              color: "#64748b",
              marginTop: "2px",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}>
              {subtitle}
            </div>
          )}
        </div>
        {badge && <div style={{ flexShrink: 0 }}>{badge}</div>}
      </div>

      {/* Details: grid 2 colunas */}
      {details && details.length > 0 && (
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "6px 12px",
          marginTop: "10px",
          paddingTop: "10px",
          borderTop: "1px solid #f1f5f9",
        }}>
          {details.map((d, i) => (
            <div key={i}>
              <div style={{
                fontSize: "10px",
                fontWeight: 600,
                color: "#94a3b8",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}>
                {d.label}
              </div>
              <div style={{
                fontSize: "13px",
                fontWeight: 500,
                color: "#334155",
                marginTop: "1px",
              }}>
                {d.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      {actions && (
        <div style={{
          marginTop: "10px",
          paddingTop: "10px",
          borderTop: "1px solid #f1f5f9",
          display: "flex",
          gap: "8px",
        }}>
          {actions}
        </div>
      )}
    </div>
  );

  if (href) {
    return (
      <Link href={href} style={{ textDecoration: "none", color: "inherit" }}>
        {content}
      </Link>
    );
  }

  return content;
};


// ─── MOBILE LIST ──────────────────────────────────────────────────────────────
// Wrapper para lista de MobileCards

export const MobileList: React.FC<{
  children: React.ReactNode;
  count?: number;
  label?: string;
  emptyMessage?: string;
  emptyIcon?: string;
  className?: string;
}> = ({
  children,
  count,
  label = "resultados",
  emptyMessage = "Nenhum registro encontrado.",
  emptyIcon = "📭",
  className = "",
}) => {
  const items = React.Children.toArray(children);

  return (
    <div
      className={`m-show ${className}`}
      style={{
        flexDirection: "column",
        gap: "8px",
        display: "none", // CSS override via m-show
      }}
    >
      {/* Contador */}
      {count !== undefined && (
        <div style={{
          fontSize: "12px",
          color: "#94a3b8",
          fontWeight: 500,
          paddingBottom: "4px",
        }}>
          {count} {label}
        </div>
      )}

      {/* Lista ou empty */}
      {items.length === 0 ? (
        <div style={{ padding: "32px 0", textAlign: "center" }}>
          <div style={{ fontSize: "28px", marginBottom: "8px" }}>{emptyIcon}</div>
          <div style={{ fontSize: "14px", color: "#94a3b8" }}>{emptyMessage}</div>
        </div>
      ) : (
        items
      )}
    </div>
  );
};


// ─── MOBILE FAB ───────────────────────────────────────────────────────────────
// Floating Action Button — aparece só no mobile

export const MobileFAB: React.FC<{
  href?: string;
  onClick?: () => void;
  icon?: string;
  label?: string;
}> = ({ href, onClick, icon = "+", label = "Criar novo" }) => {
  if (href) {
    return (
      <Link
        href={href}
        className="m-fab mobile-only"
        title={label}
        aria-label={label}
      >
        {icon}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="m-fab mobile-only"
      title={label}
      aria-label={label}
    >
      {icon}
    </button>
  );
};


// ─── MOBILE FORM GRID ─────────────────────────────────────────────────────────
// Wrapper que adiciona classe m-grid aos grids de formulário

export const MobileFormGrid: React.FC<{
  children: React.ReactNode;
  cols?: 1 | 2;
  style?: React.CSSProperties;
  className?: string;
}> = ({ children, cols = 1, style, className = "" }) => (
  <div
    className={`${cols === 2 ? "m-grid-2" : "m-grid"} ${className}`}
    style={style}
  >
    {children}
  </div>
);


// ─── MOBILE SEARCH ────────────────────────────────────────────────────────────
// Search input que ocupa 100% no mobile

export const MobileSearchWrap: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => (
  <div className="m-search-full">
    {children}
  </div>
);
