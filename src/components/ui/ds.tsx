"use client";

/**
 * SISTEMA DE FROTA — Design System
 * ─────────────────────────────────
 * Visual IDÊNTICO ao RBARROS.
 * Todos os espaçamentos em inline styles para garantir renderização.
 */

import React from "react";
import Link from "next/link";
import { UserProfile } from "@/components/ui/UserProfile";

// ─── BTN ───────────────────────────────────────────────────────────────────────
type BtnVariant = "primary" | "danger" | "ghost" | "outline";

export const Btn = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: BtnVariant;
    size?: "xs" | "sm" | "md";
    href?: string;
    icon?: React.ReactNode;
  }
>(({ children, variant = "primary", size = "sm", href, icon, className = "", ...props }, ref) => {
  const colors: Record<BtnVariant, React.CSSProperties> = {
    primary: { background: "#2563eb", color: "#fff" },
    danger:  { background: "#ef4444", color: "#fff" },
    ghost:   { background: "transparent", color: "#64748b" },
    outline: { background: "#fff", color: "#475569", border: "1px solid #cbd5e1" },
  };
  const sizes = {
    xs: { padding: "2px 6px",  fontSize: "10px" },
    sm: { padding: "4px 12px", fontSize: "11px" },
    md: { padding: "6px 16px", fontSize: "12px" },
  };

  const style: React.CSSProperties = {
    ...colors[variant],
    ...sizes[size],
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    fontWeight: 600,
    borderRadius: "8px",
    border: colors[variant].border as string || "none",
    cursor: "pointer",
    transition: "all 150ms",
    textDecoration: "none",
    whiteSpace: "nowrap",
  };

  if (href) return <Link href={href} style={style} className={className}>{icon}{children}</Link>;
  return <button ref={ref} style={style} className={className} {...props}>{icon}{children}</button>;
});
Btn.displayName = "Btn";

// ─── BADGE ─────────────────────────────────────────────────────────────────────
type BadgeVariant = "default" | "success" | "warning" | "danger" | "info" | "purple";

export const Badge: React.FC<{
  children: React.ReactNode;
  variant?: BadgeVariant;
}> = ({ children, variant = "default" }) => {
  const colors: Record<BadgeVariant, React.CSSProperties> = {
    default: { background: "#f1f5f9", color: "#475569" },
    success: { background: "#dcfce7", color: "#166534" },
    warning: { background: "#fef9c3", color: "#854d0e" },
    danger:  { background: "#fee2e2", color: "#991b1b" },
    info:    { background: "#dbeafe", color: "#1e40af" },
    purple:  { background: "#f3e8ff", color: "#6b21a8" },
  };
  return (
    <span style={{
      ...colors[variant],
      display: "inline-block",
      padding: "2px 8px",
      borderRadius: "9999px",
      fontSize: "11px",
      fontWeight: 600,
    }}>
      {children}
    </span>
  );
};

// ─── PAGE HEADER ───────────────────────────────────────────────────────────────
export const PageHeader: React.FC<{
  title: string;
  subtitle?: string;
  count?: number;
  children?: React.ReactNode;
  actions?: React.ReactNode;
}> = ({ title, subtitle, count, children, actions }) => (
  <div
    className="page-header"
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "6px 16px",
      borderBottom: "1px solid #e2e8f0",
      background: "#ffffff",
      flexShrink: 0,
      gap: "8px",
    }}
  >
    <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
      <div>
        <div style={{ display: "flex", alignItems: "baseline", gap: "8px", flexWrap: "wrap" }}>
          <h1 style={{ fontSize: "16px", fontWeight: 700, color: "#1e293b", margin: 0 }}>{title}</h1>
          {count !== undefined && (
            <span style={{ fontSize: "11px", color: "#94a3b8", fontWeight: 400 }}>{count} registros</span>
          )}
        </div>
        {subtitle && <p style={{ fontSize: "11px", color: "#64748b", margin: "0" }}>{subtitle}</p>}
      </div>
    </div>
    <div className="page-header-actions" style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
      {children}
      {actions}
      <UserProfile />
    </div>
  </div>
);

// ─── KPI CARD ──────────────────────────────────────────────────────────────────
export const KpiCard: React.FC<{
  label: string;
  value: React.ReactNode;
  color?: "default" | "success" | "warning" | "danger" | "info" | "purple";
  sub?: string;
}> = ({ label, value, color = "default", sub }) => {
  const colors: Record<string, string> = {
    default: "#1e293b",
    success: "#16a34a",
    warning: "#ca8a04",
    danger:  "#dc2626",
    info:    "#2563eb",
    purple:  "#9333ea",
  };
  return (
    <div style={{
      background: "#ffffff",
      border: "1px solid #e2e8f0",
      borderRadius: "6px",
      padding: "8px 12px",
      boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
    }}>
      <p style={{ fontSize: "10px", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600, margin: 0 }}>{label}</p>
      <p style={{ fontSize: "16px", fontWeight: 700, color: colors[color], lineHeight: 1.2, margin: "2px 0 0" }}>{value}</p>
      {sub && <p style={{ fontSize: "10px", color: "#94a3b8", margin: "2px 0 0" }}>{sub}</p>}
    </div>
  );
};

// ─── DATA TABLE ────────────────────────────────────────────────────────────────
export const DataTable: React.FC<{
  children: React.ReactNode;
  count?: number;
  label?: string;
  toolbar?: React.ReactNode;
}> = ({ children, count, label = "registros", toolbar }) => (
  <div style={{
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: "12px",
    overflow: "hidden",
    boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
  }}>
    {toolbar && (
      <div style={{ padding: "10px 16px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
        {toolbar}
      </div>
    )}
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>{children}</table>
    </div>
    {count !== undefined && (
      <div style={{ padding: "10px 16px", borderTop: "1px solid #f1f5f9", fontSize: "12px", color: "#94a3b8" }}>
        {count} {label}
      </div>
    )}
  </div>
);

export const Th: React.FC<
  React.ThHTMLAttributes<HTMLTableCellElement> & {
    sortKey?: string;
    activeSortKey?: string;
    sortDirection?: "asc" | "desc";
    onSort?: (key: string) => void;
  }
> = ({ children, sortKey, activeSortKey, sortDirection, onSort, style: userStyle, ...props }) => {
  const isSorted = sortKey && activeSortKey === sortKey;
  const isClickable = !!sortKey && !!onSort;

  return (
    <th
      style={{
        padding: "8px 12px",
        textAlign: "left",
        fontSize: "10px",
        fontWeight: 600,
        color: isSorted ? "#1e293b" : "#64748b",
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        background: "#f8fafc",
        borderBottom: "1px solid #e2e8f0",
        whiteSpace: "nowrap",
        cursor: isClickable ? "pointer" : "default",
        userSelect: "none",
        transition: "all 150ms",
        ...userStyle,
      }}
      onClick={() => isClickable && onSort(sortKey)}
      {...props}
    >
      <div style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
        {children}
        {isClickable && (
          <span style={{ 
            display: "inline-flex", 
            flexDirection: "column", 
            fontSize: "8px", 
            lineHeight: 1, 
            color: isSorted ? "#2563eb" : "#cbd5e1",
            marginLeft: "2px",
            transition: "color 150ms"
          }}>
            {isSorted ? (sortDirection === "asc" ? "▲" : "▼") : "▲▼"}
          </span>
        )}
      </div>
    </th>
  );
};

export function useTableSort<T>(
  data: T[],
  defaultKey: string = "",
  defaultDirection: "asc" | "desc" = "asc"
) {
  const [sortKey, setSortKey] = React.useState<string>(defaultKey);
  const [sortDirection, setSortDirection] = React.useState<"asc" | "desc">(defaultDirection);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
  };

  const sortedData = React.useMemo(() => {
    if (!sortKey) return data;

    return [...data].sort((a: any, b: any) => {
      const getValue = (obj: any, path: string) => {
        if (!obj) return "";
        return path.split(".").reduce((acc, part) => {
          if (acc && typeof acc === "object" && part in acc) {
            return acc[part];
          }
          return acc;
        }, obj);
      };

      let valA = getValue(a, sortKey);
      let valB = getValue(b, sortKey);

      if (valA && typeof valA === "object" && !Array.isArray(valA)) {
        valA = Object.values(valA)[0] || "";
      }
      if (valB && typeof valB === "object" && !Array.isArray(valB)) {
        valB = Object.values(valB)[0] || "";
      }

      const isNumA = typeof valA === "number" || (!isNaN(Number(valA)) && valA !== "" && valA !== null);
      const isNumB = typeof valB === "number" || (!isNaN(Number(valB)) && valB !== "" && valB !== null);

      if (isNumA && isNumB) {
        const numA = Number(valA);
        const numB = Number(valB);
        return sortDirection === "asc" ? numA - numB : numB - numA;
      }

      const strA = String(valA ?? "").toLowerCase().trim();
      const strB = String(valB ?? "").toLowerCase().trim();

      if (strA < strB) return sortDirection === "asc" ? -1 : 1;
      if (strA > strB) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
  }, [data, sortKey, sortDirection]);

  return {
    sortedData,
    sortKey,
    sortDirection,
    handleSort,
  };
}

export const Td: React.FC<React.TdHTMLAttributes<HTMLTableCellElement>> = ({ children, style: userStyle, ...props }) => (
  <td style={{ padding: "4px 8px", fontSize: "12px", color: "#334155", ...userStyle }} {...props}>
    {children}
  </td>
);

export const Tr: React.FC<React.HTMLAttributes<HTMLTableRowElement> & { muted?: boolean }> = ({ children, muted, style: userStyle, ...props }) => (
  <tr
    style={{
      borderBottom: "1px solid #f1f5f9",
      transition: "background 150ms",
      opacity: muted ? 0.5 : 1,
      ...userStyle,
    }}
    onMouseEnter={e => { e.currentTarget.style.background = "rgba(239,246,255,0.5)"; }}
    onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
    {...props}
  >
    {children}
  </tr>
);

// ─── EMPTY STATE ───────────────────────────────────────────────────────────────
export const EmptyState: React.FC<{
  message: string;
  action?: React.ReactNode;
  icon?: string;
}> = ({ message, action, icon = "📭" }) => (
  <div style={{ padding: "48px 0", textAlign: "center" }}>
    <p style={{ fontSize: "32px", marginBottom: "8px" }}>{icon}</p>
    <p style={{ fontSize: "14px", color: "#94a3b8" }}>{message}</p>
    {action && <div style={{ marginTop: "16px" }}>{action}</div>}
  </div>
);

// ─── FORM SECTION ──────────────────────────────────────────────────────────────
export const FormSection: React.FC<{
  title?: string;
  children: React.ReactNode;
}> = ({ title, children }) => (
  <div style={{ marginBottom: "16px" }}>
    {title && (
      <div style={{ marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
        <h3 style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", margin: 0 }}>{title}</h3>
      </div>
    )}
    <div>{children}</div>
  </div>
);

// ─── FORM FIELD ────────────────────────────────────────────────────────────────
export const FormField: React.FC<{
  label: string;
  children: React.ReactNode;
  hint?: string;
  error?: string;
}> = ({ label, children, hint, error }) => (
  <div style={{ marginBottom: "8px" }}>
    <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#475569", marginBottom: "4px" }}>{label}</label>
    {children}
    {hint && !error && <p style={{ fontSize: "11px", color: "#94a3b8", marginTop: "4px" }}>{hint}</p>}
    {error && <p style={{ fontSize: "11px", color: "#ef4444", marginTop: "4px" }}>{error}</p>}
  </div>
);

// ─── INPUT STYLE (para usar em <input style={inputStyle}>) ──────────────────
export const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  fontSize: "14px",
  color: "#1e293b",
  background: "#ffffff",
  border: "1px solid #cbd5e1",
  borderRadius: "8px",
  outline: "none",
  transition: "border-color 150ms",
};

export const selectStyle: React.CSSProperties = { ...inputStyle };

// ─── TABS ──────────────────────────────────────────────────────────────────────
export const Tabs: React.FC<{
  tabs: { id: string; label: string; badge?: string | number }[];
  active: string;
  onChange: (id: string) => void;
}> = ({ tabs, active, onChange }) => (
  <div style={{ display: "flex", borderBottom: "1px solid #e2e8f0", overflowX: "auto" }}>
    {tabs.map(t => (
      <button
        key={t.id}
        type="button"
        onClick={() => onChange(t.id)}
        style={{
          padding: "10px 16px",
          fontSize: "14px",
          fontWeight: 500,
          whiteSpace: "nowrap",
          borderBottom: `2px solid ${active === t.id ? "#2563eb" : "transparent"}`,
          marginBottom: "-1px",
          color: active === t.id ? "#2563eb" : "#64748b",
          background: "transparent",
          border: "none",
          borderBottomStyle: "solid",
          borderBottomWidth: "2px",
          borderBottomColor: active === t.id ? "#2563eb" : "transparent",
          cursor: "pointer",
          transition: "all 150ms",
        }}
      >
        {t.label}
        {t.badge !== undefined && <span style={{ fontSize: "10px", color: "#94a3b8", marginLeft: "6px" }}>({t.badge})</span>}
      </button>
    ))}
  </div>
);

// ─── ALERT ─────────────────────────────────────────────────────────────────────
export const Alert: React.FC<{
  children: React.ReactNode;
  variant?: "error" | "warning" | "success" | "info";
}> = ({ children, variant = "error" }) => {
  const v = {
    error:   { bg: "#fef2f2", border: "#fecaca", color: "#991b1b" },
    warning: { bg: "#fefce8", border: "#fde68a", color: "#854d0e" },
    success: { bg: "#f0fdf4", border: "#bbf7d0", color: "#166534" },
    info:    { bg: "#eff6ff", border: "#bfdbfe", color: "#1e40af" },
  };
  return (
    <div style={{
      padding: "12px 16px",
      borderRadius: "8px",
      border: `1px solid ${v[variant].border}`,
      background: v[variant].bg,
      color: v[variant].color,
      fontSize: "14px",
      display: "flex",
      alignItems: "flex-start",
      gap: "8px",
    }}>
      <span>{children}</span>
    </div>
  );
};

// ─── SEARCH INPUT ──────────────────────────────────────────────────────────────
export const SearchInput: React.FC<
  React.InputHTMLAttributes<HTMLInputElement>
> = (props) => (
  <input
    style={{
      ...inputStyle,
      width: "100%",
      maxWidth: "280px",
      paddingLeft: "12px",
    }}
    {...props}
  />
);

// ─── ACTION BTN ────────────────────────────────────────────────────────────────
export const ActionBtn = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: "default" | "danger" | "success" | "info";
    href?: string;
    title: string;
  }
>(({ children, variant = "default", href, ...props }, ref) => {
  const colors = {
    default: "#94a3b8",
    danger:  "#ef4444",
    success: "#16a34a",
    info:    "#2563eb",
  };
  const style: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "28px",
    height: "28px",
    borderRadius: "6px",
    fontSize: "13px",
    color: colors[variant],
    background: "transparent",
    border: "none",
    cursor: "pointer",
    transition: "all 150ms",
  };

  if (href) return <Link href={href} style={style} title={props.title}>{children}</Link>;
  return <button ref={ref} style={style} {...props}>{children}</button>;
});
ActionBtn.displayName = "ActionBtn";
