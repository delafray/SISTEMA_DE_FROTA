"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/types/database.types";

type TableName = keyof Database["public"]["Tables"];

export function DeleteBtn({ id, table, label = "registro" }: {
  id: string;
  table: TableName;
  label?: string;
}) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleDelete = async () => {
    if (!confirm(`Confirma exclusão deste ${label}? Esta ação não pode ser desfeita.`)) return;
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.from(table).delete().eq("id", id);
    setLoading(false);
    if (error) { alert("Erro ao excluir: " + error.message); return; }
    router.refresh();
  };

  return (
    <button
      onClick={handleDelete}
      disabled={loading}
      style={{
        background: "none",
        border: "none",
        color: loading ? "#94a3b8" : "#ef4444",
        cursor: loading ? "default" : "pointer",
        fontSize: "inherit",
        padding: 0,
        fontWeight: 600,
      }}
    >
      {loading ? "..." : "Excluir"}
    </button>
  );
}
