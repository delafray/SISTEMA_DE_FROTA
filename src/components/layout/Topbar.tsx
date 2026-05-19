import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function Topbar() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return null;

  const initials = (user.email?.substring(0, 2) || "US").toUpperCase();

  return (
    <header style={{
      display: "flex",
      justifyContent: "flex-end",
      alignItems: "center",
      padding: "8px 24px",
      borderBottom: "1px solid #e2e8f0",
      background: "#ffffff",
      flexShrink: 0,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
        {/* Avatar + info */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "4px 12px",
          borderRadius: "12px",
          border: "1px solid #e2e8f0",
        }}>
          <div style={{
            width: "32px",
            height: "32px",
            borderRadius: "9999px",
            background: "#dbeafe",
            color: "#2563eb",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 700,
            fontSize: "13px",
          }}>
            {initials}
          </div>
          <div>
            <span style={{ fontSize: "13px", fontWeight: 600, color: "#334155" }}>
              {user.email}
            </span>
          </div>
        </div>
        {/* Sair */}
        <form
          action={async () => {
            "use server";
            const supabase = await createClient();
            await supabase.auth.signOut();
            redirect("/login");
          }}
        >
          <button style={{
            fontSize: "13px",
            color: "#ef4444",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            fontWeight: 500,
          }}>
            Sair
          </button>
        </form>
      </div>
    </header>
  );
}
