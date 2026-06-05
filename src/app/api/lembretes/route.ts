import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// GET — lista TODOS os lembretes. SEM TRAVA: sem auth, sem role, sem filtro de
// empresa. Usa service-role (ignora RLS) e devolve tudo. "Depois a gente filtra."
// ?historico=true → todos (incluindo cientes) | padrão → só pendentes.
export async function GET(req: NextRequest) {
  const supabase = createAdminClient();
  const historico = req.nextUrl.searchParams.get('historico') === 'true';

  // Embed DESAMBIGUADO: `lembretes` tem DUAS FKs pra `perfis` (usuario_id / ciente_por).
  // Sem o `!lembretes_usuario_id_fkey` o PostgREST devolve PGRST201. Se a migration
  // `migration_lembretes_sem_trava.sql` derrubar a FK, o embed simplesmente vem null.
  let query = supabase
    .from('lembretes')
    .select('id, texto, origem, criado_em, ciente_em, usuario_id, criado_por_nome, criado_por_telefone, perfis!lembretes_usuario_id_fkey(nome)')
    .order('criado_em', { ascending: false });

  if (!historico) query = query.is('ciente_em', null);
  else query = query.limit(100);

  const primary = await query;
  let rows = primary.data as Record<string, unknown>[] | null;
  let errMsg = primary.error?.message ?? null;

  // Se o embed quebrar (FK removida pela migration), refaz sem o join.
  if (primary.error) {
    const fallback = supabase
      .from('lembretes')
      .select('id, texto, origem, criado_em, ciente_em, usuario_id, criado_por_nome, criado_por_telefone')
      .order('criado_em', { ascending: false });
    const q2 = historico ? fallback.limit(100) : fallback.is('ciente_em', null);
    const r2 = await q2;
    rows = r2.data as Record<string, unknown>[] | null;
    errMsg = r2.error?.message ?? null;
  }

  if (errMsg) return NextResponse.json({ lembretes: [], erro: errMsg }, { status: 200 });
  return NextResponse.json({ lembretes: rows ?? [] });
}
