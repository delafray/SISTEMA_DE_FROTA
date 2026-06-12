"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/* ─── SVG Icons ──────────────────────────────────── */
type SvgP = React.SVGProps<SVGSVGElement>;
const IcoHome  = (p: SvgP) => <svg {...p} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1" /></svg>;
const IcoRoute = (p: SvgP) => <svg {...p} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>;
const IcoFrete = (p: SvgP) => <svg {...p} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>;
const IcoTruck = (p: SvgP) => <svg {...p} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10l2 2h2m6-2h4l2-2V9a1 1 0 00-1-1h-2l-3 3" /><circle cx="7" cy="18" r="2" /><circle cx="17" cy="18" r="2" /></svg>;
const IcoMenu  = (p: SvgP) => <svg {...p} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>;

const NAV_ITEMS = [
  { href: "/",         label: "Início",   icon: IcoHome },
  { href: "/pedidos",  label: "Pedidos",  icon: IcoRoute },
  { href: "/despacho", label: "Despacho", icon: IcoFrete },
  { href: "/veiculos", label: "Veículos", icon: IcoTruck },
] as const;

export function MobileBottomNav({ onMenuPress }: { onMenuPress: () => void }) {
  const pathname = usePathname();

  return (
    <nav
      className="mobile-only mobile-bottom-nav safe-bottom"
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 30,
        display: "flex",
        alignItems: "stretch",
        justifyContent: "space-around",
        // altura + safe area vêm da classe .mobile-bottom-nav (mobile.css);
        // duplicar aqui inline criava dependência frágil do !important do CSS
        background: "#313f50",
        borderTop: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "0 -2px 12px rgba(0,0,0,0.15)",
      }}
    >
      {/* Navegação direta — cada ícone vai para a página */}
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || (href !== "/" && pathname.startsWith(href));
        return (
          <Link
            key={href}
            href={href}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              flex: 1,
              gap: "2px",
              color: active ? "#60a5fa" : "rgba(168,172,192,0.7)",
              background: "transparent",
              textDecoration: "none",
              fontSize: "10px",
              fontWeight: active ? 700 : 500,
              transition: "color 150ms",
              position: "relative",
              minHeight: "44px",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            {active && (
              <span style={{
                position: "absolute",
                top: 0,
                left: "50%",
                transform: "translateX(-50%)",
                width: "24px",
                height: "3px",
                borderRadius: "0 0 4px 4px",
                background: "#60a5fa",
              }} />
            )}
            <Icon style={{ width: "22px", height: "22px" }} />
            <span>{label}</span>
          </Link>
        );
      })}

      {/* Menu — abre drawer para acessar tudo */}
      <button
        type="button"
        onClick={onMenuPress}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          flex: 1,
          gap: "2px",
          color: "rgba(168,172,192,0.7)",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          fontSize: "10px",
          fontWeight: 500,
          transition: "color 150ms",
          minHeight: "44px",
          WebkitTapHighlightColor: "transparent",
        }}
      >
        <IcoMenu style={{ width: "22px", height: "22px" }} />
        <span>Menu</span>
      </button>
    </nav>
  );
}
