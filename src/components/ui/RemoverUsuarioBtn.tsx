"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { removerUsuarioAction } from "@/app/(dashboard)/usuarios/novo/actions";

export function RemoverUsuarioBtn({ usuarioId, empresaId }: { usuarioId: string; empresaId: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleRemover = async () => {
    if (!confirm("Confirma remover este usuário da empresa? O acesso será revogado.")) return;
    setLoading(true);
    
    const res = await removerUsuarioAction(usuarioId, empresaId);
    setLoading(false);
    
    if (res?.error) {
      alert("Erro ao remover: " + res.error);
      return;
    }
    router.refresh();
    // Força recarregar a página caso router.refresh() não atualize o client component state local de uma vez
    window.location.reload();
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
