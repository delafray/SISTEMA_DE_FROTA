export const dynamic = 'force-dynamic';

interface ServiceCheck {
  name: string;
  ok: boolean;
}

async function ping(name: string, url: string): Promise<ServiceCheck> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
    clearTimeout(timer);
    // 200-299, 400, 404 = serviço respondendo (pode não ter rota GET /)
    const ok = res.status < 500;
    return { name, ok };
  } catch {
    return { name, ok: false };
  }
}

export async function GET() {
  const [evo, vercel] = await Promise.all([
    ping('WhatsApp (Evolution API)', 'http://129.80.27.159:8080/'),
    ping('Backend (Vercel)', 'https://sistema-de-frota.vercel.app'),
  ]);

  const services = [evo, vercel];
  const allOk = services.every(s => s.ok);

  return Response.json({ ok: allOk, services });
}
