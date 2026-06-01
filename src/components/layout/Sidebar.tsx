"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/* ─── Ícones SVG inline (mesmo padrão do RBARROS) ─────────────────────────── */
type SvgProps = React.SVGProps<SVGSVGElement>;
const HomeIcon     = (p: SvgProps) => <svg {...p} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1" /></svg>;
const TruckIcon    = (p: SvgProps) => <svg {...p} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10l2 2h2m6-2h4l2-2V9a1 1 0 00-1-1h-2l-3 3" /><circle cx="7" cy="18" r="2" /><circle cx="17" cy="18" r="2" /></svg>;
const FreteIcon    = (p: SvgProps) => <svg {...p} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>;
const UsersIcon    = (p: SvgProps) => <svg {...p} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>;
const DriverIcon   = (p: SvgProps) => <svg {...p} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>;
const ClientIcon   = (p: SvgProps) => <svg {...p} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>;
const BuildingIcon = (p: SvgProps) => <svg {...p} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" /></svg>;
const LogOutIcon   = (p: SvgProps) => <svg {...p} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>;
const MoneyIcon    = (p: SvgProps) => <svg {...p} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>;
const RouteIcon    = (p: SvgProps) => <svg {...p} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>;
const PhoneIcon    = (p: SvgProps) => <svg {...p} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>;
const FuelIcon     = (p: SvgProps) => <svg {...p} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 6a2 2 0 012-2h8a2 2 0 012 2v12H3V6z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 10h2a2 2 0 012 2v3a1 1 0 001 1 1 1 0 001-1V9l-3-3" /></svg>;
const ChartIcon    = (p: SvgProps) => <svg {...p} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>;
const CloseIcon    = (p: SvgProps) => <svg {...p} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>;
const GaugeIcon    = (p: SvgProps) => <svg {...p} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 14l3-3m6 1a9 9 0 11-18 0 9 9 0 0118 0z" /><circle cx="12" cy="14" r="1" /></svg>;

/* ─── NavItem ────────────────────────────────────────────────── */
function NavItem({ href, label, icon: Icon, onNavigate }: {
  href: string;
  label: string;
  icon: React.ComponentType<SvgProps>;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const isActive = pathname === href || (href !== "/" && pathname.startsWith(href));

  return (
    <Link
      href={href}
      onClick={onNavigate}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "10px 12px",
        borderRadius: "8px",
        color: isActive ? "#ffffff" : "#A8ACC0",
        backgroundColor: isActive ? "#3d4f63" : "transparent",
        fontWeight: isActive ? 600 : 500,
        fontSize: "15px",
        lineHeight: "1.4",
        transition: "all 150ms",
        textDecoration: "none",
        whiteSpace: "nowrap",
      }}
      onMouseEnter={e => { if (!isActive) e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.08)"; }}
      onMouseLeave={e => { if (!isActive) e.currentTarget.style.backgroundColor = "transparent"; }}
    >
      <Icon style={{ width: "18px", height: "18px", flexShrink: 0 }} />
      <span>{label}</span>
    </Link>
  );
}

/* ─── Section Label ───────────────────────────────────────────── */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      padding: "14px 12px 4px 12px",
      fontSize: "10px",
      fontWeight: 700,
      color: "rgba(147, 197, 253, 0.45)",
      textTransform: "uppercase",
      letterSpacing: "0.1em",
    }}>
      {children}
    </div>
  );
}

/* ─── Sidebar Content (shared between desktop + drawer) ──────── */
function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const router = useRouter();

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <>
      {/* Nav */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        <nav style={{ padding: "0 12px" }}>

          <SectionLabel>Operação</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            <NavItem href="/"               label="Início"         icon={HomeIcon}  onNavigate={onNavigate} />
            <NavItem href="/pedidos"        label="Viagens"        icon={RouteIcon} onNavigate={onNavigate} />
            <NavItem href="/entregas"         label="Fretes"         icon={FreteIcon} onNavigate={onNavigate} />
            <NavItem href="/roteirizacao"   label="Roteirização"   icon={RouteIcon} onNavigate={onNavigate} />
            <NavItem href="/abastecimentos" label="Abastecimentos" icon={FuelIcon}  onNavigate={onNavigate} />
          </div>

          <SectionLabel>Financeiro</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            <NavItem href="/financeiro"    label="Fluxo de Caixa" icon={MoneyIcon} onNavigate={onNavigate} />
            <NavItem href="/adiantamentos" label="Adiantamentos" icon={MoneyIcon} onNavigate={onNavigate} />
            <NavItem href="/relatorios"    label="Relatórios"    icon={ChartIcon} onNavigate={onNavigate} />
          </div>

          <SectionLabel>Cadastros</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            <NavItem href="/veiculos"    label="Veículos"    icon={TruckIcon}  onNavigate={onNavigate} />
            <NavItem href="/motoristas"  label="Motoristas"  icon={DriverIcon} onNavigate={onNavigate} />
            <NavItem href="/clientes"    label="Clientes"    icon={ClientIcon} onNavigate={onNavigate} />
          </div>

          <SectionLabel>Administração</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            <NavItem href="/empresas"     label="Empresas"    icon={BuildingIcon} onNavigate={onNavigate} />
            <NavItem href="/usuarios"     label="Usuários"    icon={UsersIcon}    onNavigate={onNavigate} />
            <NavItem href="/uso-apis"     label="Uso de APIs" icon={GaugeIcon}    onNavigate={onNavigate} />
            <NavItem href="/preview-app"  label="Preview App" icon={PhoneIcon}    onNavigate={onNavigate} />
          </div>

        </nav>
      </div>

      {/* Rodapé */}
      <div style={{
        padding: "8px",
        borderTop: "1px solid rgba(255,255,255,0.1)",
        display: "flex",
        flexDirection: "column",
        gap: "4px",
      }}>
        <button
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "6px 8px",
            width: "100%",
            textAlign: "left",
            borderRadius: "8px",
            color: "rgba(191, 219, 254, 0.5)",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            transition: "all 150ms",
            fontSize: "14px",
            fontWeight: 500,
          }}
          onClick={handleSignOut}
          onMouseEnter={e => { e.currentTarget.style.backgroundColor = "rgba(239,68,68,0.15)"; e.currentTarget.style.color = "rgba(252,165,165,0.8)"; }}
          onMouseLeave={e => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = "rgba(191,219,254,0.5)"; }}
        >
          <LogOutIcon style={{ width: "16px", height: "16px" }} />
          <span>Sair</span>
        </button>
        <div style={{ padding: "0 8px 4px" }}>
          <p style={{ fontSize: "9px", color: "rgba(191,219,254,0.5)", fontWeight: 500, lineHeight: "1.6" }}>
            Direitos autorais © Ronaldo Borba
          </p>
          <p style={{ fontSize: "9px", color: "rgba(191,219,254,0.5)", fontWeight: 500 }}>
            ronaldo@ronaldoborba.com.br
          </p>
        </div>
      </div>
    </>
  );
}

/* ─── Desktop Sidebar (hidden on mobile) ──────────────────────── */
export function Sidebar() {
  return (
    <aside
      className="hide-mobile"
      style={{
        width: "224px",
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        background: "#313f50",
        height: "100%",
      }}
    >
      {/* Header */}
      <div style={{
        padding: "16px 12px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}>
        <h1 style={{
          fontSize: "18px",
          fontWeight: 700,
          color: "#ffffff",
          letterSpacing: "-0.02em",
          lineHeight: 1,
          textAlign: "center",
        }}>
          FROTA
        </h1>
        <span style={{
          fontSize: "13px",
          color: "#ffffff",
          fontWeight: 500,
          letterSpacing: "0.04em",
          textAlign: "center",
          marginTop: "2px",
        }}>
          gestão inteligente
        </span>
        <span style={{
          fontSize: "12px",
          color: "rgba(147, 197, 253, 0.5)",
          fontFamily: "monospace",
          marginTop: "4px",
        }}>
          v0.1.0
        </span>
      </div>

      <SidebarContent />
    </aside>
  );
}

/* ─── Mobile Drawer (only rendered on mobile) ─────────────────── */
export function MobileDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <>
      {/* Overlay */}
      <div
        className={`drawer-overlay ${open ? "open" : ""}`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        className={`drawer-panel ${open ? "open" : ""}`}
        style={{
          display: "flex",
          flexDirection: "column",
          background: "#313f50",
        }}
        role="dialog"
        aria-modal="true"
        aria-label="Menu de navegação"
      >
        {/* Drawer header */}
        <div style={{
          padding: "12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}>
          <div>
            <h1 style={{
              fontSize: "18px",
              fontWeight: 700,
              color: "#ffffff",
              letterSpacing: "-0.02em",
              lineHeight: 1,
            }}>
              FROTA
            </h1>
            <span style={{
              fontSize: "11px",
              color: "rgba(147, 197, 253, 0.5)",
              fontWeight: 500,
            }}>
              gestão inteligente
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar menu"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "36px",
              height: "36px",
              borderRadius: "8px",
              background: "rgba(255,255,255,0.08)",
              border: "none",
              color: "#A8ACC0",
              cursor: "pointer",
              transition: "all 150ms",
            }}
          >
            <CloseIcon style={{ width: "20px", height: "20px" }} />
          </button>
        </div>

        <SidebarContent onNavigate={onClose} />
      </div>
    </>
  );
}
