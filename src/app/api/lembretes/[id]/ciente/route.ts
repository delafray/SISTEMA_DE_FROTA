import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// PATCH — registra a providência do gestor e/ou marca o lembrete como ciente.
// SEM TRAVA: sem auth, sem role. Usa service-role (ignora RLS). ciente_por fica
// null (não amarramos a um usuário pra não depender de cadastro).
//
// Body (opcional, JSON): { nota?: string, ocultar?: boolean }
//  - nota    → gravada em lembrete_notas (histórico de providências, nunca sobrescreve)
//  - ocultar → true (default) seta ciente_em e o lembrete sai do painel;
//              false ZERA ciente_em — mantém/VOLTA o lembrete pros pendentes
//              (dono 11/06: "dei ciência errada, quero voltar pra tela").
// Sem body = comportamento antigo: ciente e oculta.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createAdminClient();

  let nota = '';
  let ocultar = true;
  try {
    const body = await req.json();
    if (typeof body?.nota === 'string') nota = body.nota.trim();
    if (typeof body?.ocultar === 'boolean') ocultar = body.ocultar;
  } catch { /* sem body → defaults */ }

  if (nota) {
    const { error } = await supabase
      .from('lembrete_notas')
      .insert({ lembrete_id: id, nota });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { error } = await supabase
    .from('lembretes')
    .update({ ciente_em: ocultar ? new Date().toISOString() : null, ciente_por: null })
    .eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
