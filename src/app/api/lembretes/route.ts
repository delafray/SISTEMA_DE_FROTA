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

  // Anexa o histórico de providências (lembrete_notas). Se a tabela ainda não
  // existir (migration_lembrete_notas.sql não rodada), segue sem notas.
  if (rows && rows.length > 0) {
    const ids = rows.map(r => r.id as string);
    const { data: notas } = await supabase
      .from('lembrete_notas')
      .select('lembrete_id, nota, criado_em')
      .in('lembrete_id', ids)
      .order('criado_em', { ascending: true });

    const porLembrete = new Map<string, { nota: string; criado_em: string }[]>();
    for (const n of notas ?? []) {
      const lista = porLembrete.get(n.lembrete_id) ?? [];
      lista.push({ nota: n.nota, criado_em: n.criado_em });
      porLembrete.set(n.lembrete_id, lista);
    }
    rows = rows.map(r => ({ ...r, notas: porLembrete.get(r.id as string) ?? [] }));
  }

  return NextResponse.json({ lembretes: rows ?? [] });
}
