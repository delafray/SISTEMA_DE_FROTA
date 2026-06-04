import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createLogger } from '@/lib/logger';

const log = createLogger('whatsapp-reconectar');

function getEvoBase() {
  return process.env.EVOLUTION_API_URL ?? 'http://129.80.27.159:8080';
}
function getEvoKey() {
  return process.env.EVOLUTION_API_KEY ?? '';
}

async function evoFetch(path: string, opts: RequestInit = {}) {
  const res = await fetch(`${getEvoBase()}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', apikey: getEvoKey(), ...(opts.headers ?? {}) },
  });
  return res;
}

// GET — retorna estado atual da conexão
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const { data: ue } = await supabase
    .from('usuario_empresas').select('role, empresa_id')
    .eq('usuario_id', user.id).eq('is_padrao', true).single();
  if (ue?.role !== 'master') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

  const admin = createAdminClient();
  const { data: empresa } = await admin
    .from('empresas').select('whatsapp_instance, whatsapp_numero').eq('id', ue.empresa_id).single();

  const instanceName = empresa?.whatsapp_instance ?? process.env.EVOLUTION_INSTANCE_NAME ?? '';

  if (!instanceName) return NextResponse.json({ estado: 'sem_instancia', numero: null });

  try {
    const res = await evoFetch(`/instance/connectionState/${instanceName}`);
    if (!res.ok) return NextResponse.json({ estado: 'desconhecido', numero: empresa?.whatsapp_numero ?? null });
    const json = await res.json();
    return NextResponse.json({
      estado: json.instance?.state ?? json.state ?? 'desconhecido',
      numero: empresa?.whatsapp_numero ?? null,
      instance: instanceName,
    });
  } catch {
    return NextResponse.json({ estado: 'erro_conexao', numero: empresa?.whatsapp_numero ?? null });
  }
}

// POST — inicia reconexão e retorna QR code
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const { data: ue } = await supabase
    .from('usuario_empresas').select('role, empresa_id')
    .eq('usuario_id', user.id).eq('is_padrao', true).single();
  if (ue?.role !== 'master') return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const novoNumero: string | undefined = body.numero;

  const admin = createAdminClient();
  const { data: empresa } = await admin
    .from('empresas').select('whatsapp_instance, whatsapp_numero').eq('id', ue.empresa_id).single();

  const instanceName = empresa?.whatsapp_instance ?? process.env.EVOLUTION_INSTANCE_NAME ?? '';
  if (!instanceName) return NextResponse.json({ error: 'Instância não configurada' }, { status: 400 });

  log.info('reconectar_iniciado', { instanceName, novoNumero, empresa_id: ue.empresa_id });

  // 1. Logout da sessão atual (se existir)
  try {
    await evoFetch(`/instance/logout/${instanceName}`, { method: 'DELETE' });
  } catch {
    // ignora — se não estava conectada, tudo bem
  }

  // 2. Deleta instância atual para limpar sessão Signal corrompida
  try {
    await evoFetch(`/instance/delete/${instanceName}`, { method: 'DELETE' });
  } catch { /* ignora */ }

  // 3. Aguarda a Evolution processar (150ms)
  await new Promise(r => setTimeout(r, 150));

  // 4. Recria instância com webhook embutido + pede QR
  // APP_URL = URL pública do Vercel (ex: https://sistema-de-frota.vercel.app)
  const appUrl = process.env.APP_URL
    ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);
  if (!appUrl) {
    return NextResponse.json({ error: 'APP_URL não configurada nas variáveis de ambiente' }, { status: 500 });
  }
  const webhookUrl = `${appUrl}/api/whatsapp/webhook`;

  const webhookSecret = process.env.EVOLUTION_WEBHOOK_SECRET ?? '';

  const createRes = await evoFetch('/instance/create', {
    method: 'POST',
    body: JSON.stringify({
      instanceName,
      integration: 'WHATSAPP-BAILEYS',
      qrcode: true,
      webhook: {
        url: webhookUrl,
        byEvents: false,
        base64: false,
        events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE', 'QRCODE_UPDATED'],
        headers: { apikey: webhookSecret },
      },
    }),
  });

  if (!createRes.ok) {
    const txt = await createRes.text();
    log.error('reconectar_create_falhou', { status: createRes.status, body: txt });
    return NextResponse.json({ error: 'Erro ao criar instância' }, { status: 500 });
  }

  const createJson = await createRes.json();
  const qrBase64: string | undefined =
    createJson.qrcode?.base64 ??
    createJson.hash?.qrcode ??
    createJson.qrcode;

  // 5. Se informou número novo, salva no banco
  if (novoNumero) {
    await admin.from('empresas')
      .update({ whatsapp_numero: novoNumero.replace(/\D/g, '') })
      .eq('id', ue.empresa_id);
  }

  log.info('reconectar_qr_gerado', { instanceName, temQr: !!qrBase64 });

  return NextResponse.json({
    ok: true,
    qr: qrBase64 ?? null,
    instance: instanceName,
  });
}
