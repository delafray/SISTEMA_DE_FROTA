"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function Sidebar() {
  const pathname = usePathname();

  const links = [
    { href: "/", label: "Início" },
    { href: "/fretes", label: "Fretes" },
    { href: "/veiculos", label: "Veículos" },
    { href: "/motoristas", label: "Motoristas" },
    { href: "/clientes", label: "Clientes" },
  ];

  return (
    <aside className="w-56 bg-[#313f50] flex flex-col p-4 border-r border-slate-700 shrink-0">
      <h2 className="text-xl font-bold mb-8 text-blue-400">FROTA</h2>
      <nav className="space-y-2">
        {links.map((link) => {
          const isActive = pathname === link.href || (link.href !== "/" && pathname.startsWith(link.href));
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`block p-2 rounded-none transition-colors ${
                isActive ? "bg-blue-600 text-white" : "text-slate-300 hover:bg-[#1e293b]"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
