"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function RemoverUsuarioBtn({ usuarioId, empresaId }: { usuarioId: string; empresaId: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleRemover = async () => {
    if (!confirm("Confirma remover este usuário da empresa? O acesso será revogado.")) return;
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("usuario_empresas").delete()
      .eq("usuario_id", usuarioId).eq("empresa_id", empresaId);
    setLoading(false);
    if (error) { alert("Erro ao remover: " + error.message); return; }
    router.refresh();
  };

  return (
    <button
      onClick={handleRemover}
      disabled={loading}
      style={{
        background: "none", border: "none",
        color: loading ? "#94a3b8" : "#ef4444",
        cursor: loading ? "default" : "pointer",
        fontSize: "inherit", padding: 0, fontWeight: 600,
      }}
    >
      {loading ? "..." : "Remover"}
    </button>
  );
}
