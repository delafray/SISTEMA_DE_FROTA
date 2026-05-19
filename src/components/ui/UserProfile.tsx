"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export function UserProfile() {
  const [nome, setNome]       = useState("");
  const [empresa, setEmpresa] = useState("");
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const load = async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const [perfilRes, ueRes] = await Promise.all([
        supabase.from("perfis").select("nome").eq("id", auth.user.id).single(),
        supabase.from("usuario_empresas")
          .select("empresas(nome_fantasia)")
          .eq("usuario_id", auth.user.id).eq("is_padrao", true).single(),
      ]);
      if (perfilRes.data?.nome) setNome(perfilRes.data.nome);
      const emp = ueRes.data?.empresas;
      const empObj = Array.isArray(emp) ? emp[0] : emp;
      if (empObj?.nome_fantasia) setEmpresa(empObj.nome_fantasia);
    };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  if (!nome) return null;

  const initials = nome.split(" ").filter(Boolean).slice(0, 2).map(p => p[0]).join("").toUpperCase();

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "10px", marginLeft: "12px", paddingLeft: "12px", borderLeft: "1px solid #e2e8f0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        <div style={{
          width: "28px", height: "28px", borderRadius: "9999px",
          background: "#dbeafe", color: "#2563eb",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontWeight: 700, fontSize: "11px", flexShrink: 0,
        }}>
          {initials}
        </div>
        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.2 }}>
          <span style={{ fontSize: "12px", fontWeight: 700, color: "#1e293b" }}>{nome.split(" ")[0]}</span>
          {empresa && <span style={{ fontSize: "10px", color: "#94a3b8", fontWeight: 500 }}>{empresa}</span>}
        </div>
      </div>
    </div>
  );
}
