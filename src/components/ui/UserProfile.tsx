"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export function UserProfile() {
  const [email, setEmail] = useState("");
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) {
        setEmail(data.user.email);
      }
    });
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  if (!email) return null;

  const initials = (email.substring(0, 2) || "US").toUpperCase();

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "12px", marginLeft: "12px", paddingLeft: "12px", borderLeft: "1px solid #e2e8f0" }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "6px",
        padding: "2px 8px",
        borderRadius: "6px",
        border: "1px solid #e2e8f0",
      }}>
        <div style={{
          width: "24px",
          height: "24px",
          borderRadius: "9999px",
          background: "#dbeafe",
          color: "#2563eb",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 700,
          fontSize: "12px",
        }}>
          {initials}
        </div>
        <span style={{ fontSize: "11px", fontWeight: 600, color: "#334155" }}>
          {email}
        </span>
      </div>
      <button 
        onClick={handleLogout}
        style={{
          fontSize: "11px",
          color: "#ef4444",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          fontWeight: 500,
        }}>
        Sair
      </button>
    </div>
  );
}
