import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

// Next 16: a convenção "middleware" virou "proxy" (mesma semântica).
// Migração: nextjs.org/docs/messages/middleware-to-proxy
export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * Feel free to modify this pattern to include more paths.
     */
    '/((?!_next/static|_next/image|favicon.ico|api/whatsapp|politica-de-privacidade|termos-de-servico|exclusao-de-dados|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
