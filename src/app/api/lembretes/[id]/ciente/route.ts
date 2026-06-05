import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// PATCH — marca lembrete como ciente. SEM TRAVA: sem auth, sem role. Qualquer
// um pode dar ciente. Usa service-role (ignora RLS). ciente_por fica null
// (não amarramos a um usuário pra não depender de cadastro).
export async function PATCH(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createAdminClient();

  const { error } = await supabase
    .from('lembretes')
    .update({ ciente_em: new Date().toISOString(), ciente_por: null })
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
