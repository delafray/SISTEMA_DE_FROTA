import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET — lista lembretes da empresa (master/gestor)
// ?historico=true → todos (incluindo cientes) | padrão → só pendentes
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const { data: ue } = await supabase
    .from('usuario_empresas').select('empresa_id, role')
    .eq('usuario_id', user.id).eq('is_padrao', true).single();
  if (!ue || !['master', 'gestor'].includes(ue.role ?? ''))
    return NextResponse.json({ lembretes: [] });

  const historico = req.nextUrl.searchParams.get('historico') === 'true';

  let query = supabase
    .from('lembretes')
    .select('id, texto, origem, criado_em, ciente_em, usuario_id, perfis!lembretes_usuario_id_fkey(nome)')
    .eq('empresa_id', ue.empresa_id)
    .order('criado_em', { ascending: false });

  if (!historico) query = query.is('ciente_em', null);
  else query = query.limit(100);

  const { data } = await query;
  return NextResponse.json({ lembretes: data ?? [] });
}
