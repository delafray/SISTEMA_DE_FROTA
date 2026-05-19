import { createClient } from "@supabase/supabase-js";
import { Database } from "@/types/database.types";

// Cliente com SERVICE ROLE — usar APENAS em Server Actions/Route Handlers
// NUNCA expor no client-side
export function createAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
