import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function Topbar() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return null;

  return (
    <header className="flex justify-end items-center mb-8 border-b border-slate-700 pb-4">
      <div className="flex items-center gap-4">
        <span className="text-sm text-slate-400">{user.email}</span>
        <form
          action={async () => {
            "use server";
            const supabase = await createClient();
            await supabase.auth.signOut();
            redirect("/login");
          }}
        >
          <button className="text-sm text-red-400 hover:text-red-300 transition-colors">
            Sair
          </button>
        </form>
      </div>
    </header>
  );
}
