"use client";

import { useState } from "react";
import { Sidebar, MobileDrawer } from "@/components/layout/Sidebar";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Desktop sidebar — hidden on mobile via CSS */}
      <Sidebar />

      {/* Mobile drawer — rendered always, but hidden via CSS transform */}
      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <main className="flex-1 overflow-y-auto has-bottom-nav">
          {children}
        </main>
      </div>

      {/* Mobile bottom nav — hidden on desktop via CSS */}
      <MobileBottomNav onMenuPress={() => setDrawerOpen(true)} />
    </div>
  );
}
