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
  // URLs por env (cada implantação tem sua VM/app) — sem hard-code de IP.
  const evoUrl = process.env.EVOLUTION_API_URL;
  const appUrl = process.env.APP_URL
    ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : null);

  const checks = await Promise.all([
    evoUrl ? ping('WhatsApp (Evolution API)', `${evoUrl}/`) : Promise.resolve({ name: 'WhatsApp (Evolution API)', ok: false }),
    appUrl ? ping('Backend (Vercel)', appUrl) : Promise.resolve({ name: 'Backend (Vercel)', ok: true }),
  ]);

  const services = checks;
  const allOk = services.every(s => s.ok);

  return Response.json({ ok: allOk, services });
}
