import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET — lista lembretes pendentes da empresa (master/gestor)
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const { data: ue } = await supabase
    .from('usuario_empresas').select('empresa_id, role')
    .eq('usuario_id', user.id).eq('is_padrao', true).single();
  if (!ue || !['master', 'gestor'].includes(ue.role ?? ''))
    return NextResponse.json({ lembretes: [] });

  const { data } = await supabase
    .from('lembretes')
    .select('id, texto, origem, criado_em, usuario_id, perfis!lembretes_usuario_id_fkey(nome)')
    .eq('empresa_id', ue.empresa_id)
    .is('ciente_em', null)
    .order('criado_em', { ascending: false });

  return NextResponse.json({ lembretes: data ?? [] });
}
