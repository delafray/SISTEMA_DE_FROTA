import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// PATCH — marca lembrete como ciente
export async function PATCH(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const { data: ue } = await supabase
    .from('usuario_empresas').select('empresa_id, role')
    .eq('usuario_id', user.id).eq('is_padrao', true).single();
  if (!ue || !['master', 'gestor'].includes(ue.role ?? ''))
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

  const { error } = await supabase
    .from('lembretes')
    .update({ ciente_em: new Date().toISOString(), ciente_por: user.id })
    .eq('id', id)
    .eq('empresa_id', ue.empresa_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
