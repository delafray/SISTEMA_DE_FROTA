/**
 * API Route — GET /api/arquitetura/status
 *
 * Status VIVO do Canvas da Arquitetura (torre de controle técnica):
 * pinga cada serviço externo (Evolution, OSRM, VROOM, Gemini, Deepgram),
 * testa o Supabase com uma query real e conta a atividade de HOJE por bloco
 * (mensagens do bot, pedidos, entregas, rotas, notas, lembretes).
 *
 * A própria resposta chegando já prova que Vercel/Next (App, Dashboard,
 * API Otimização, Bot) estão de pé — esses ganham ok implícito no cliente.
 *
 * Sem auth de usuário (padrão do projeto: usa SUPABASE_SERVICE_ROLE_KEY).
 */

import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

type Ping = { ok: boolean; ms: number | null };

const OFFSET_BR_MS = 3 * 60 * 60 * 1000; // Brasil sem horário de verão desde 2019

function inicioDoDiaBR(): string {
  const ymd = new Date(Date.now() - OFFSET_BR_MS).toISOString().slice(0, 10);
  return new Date(new Date(`${ymd}T00:00:00.000Z`).getTime() + OFFSET_BR_MS).toISOString();
}

async function ping(url: string, init?: RequestInit): Promise<Ping> {
  const t0 = Date.now();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(url, { ...init, signal: ctrl.signal, cache: 'no-store' });
    clearTimeout(timer);
    // <500 = serviço respondendo (404/405 na raiz é normal)
    return { ok: res.status < 500, ms: Date.now() - t0 };
  } catch {
    return { ok: false, ms: null };
  }
}

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const inicio = inicioDoDiaBR();
  const t0 = Date.now();

  const count = (tabela: string, colData: string) =>
    supabase.from(tabela).select('*', { count: 'exact', head: true }).gte(colData, inicio);

  const geminiKey = process.env.GEMINI_API_KEY;
  const deepgramKey = process.env.DEEPGRAM_API_KEY;

  const [
    evo, osrm, vroom, gemini, deepgram,
    dbCheck, msgs, pedidos, entregas, rotas, notas, lembretes,
  ] = await Promise.all([
    ping('http://129.80.27.159:8080/'),
    ping('http://129.80.27.159:5000/route/v1/driving/-46.63,-23.55;-46.65,-23.56?overview=false'),
    ping('http://129.80.27.159:3000/health'),
    geminiKey
      ? ping(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=1&key=${geminiKey}`)
      : Promise.resolve(null),
    deepgramKey
      ? ping('https://api.deepgram.com/v1/projects', { headers: { Authorization: `Token ${deepgramKey}` } })
      : Promise.resolve(null),
    supabase.from('empresas').select('id', { count: 'exact', head: true }),
    count('bot_msgs_processadas', 'processado_em'),
    count('pedidos', 'created_at'),
    count('entregas', 'data_fim'),
    count('rotas_otimizadas', 'criada_em'),
    count('notas_capturadas', 'capturado_em'),
    count('lembretes', 'criado_em'),
  ]);

  return Response.json({
    verificado_em: new Date().toISOString(),
    servicos: {
      evo,
      osrm,
      vroom,
      db: { ok: !dbCheck.error, ms: Date.now() - t0 },
      gemini,    // null = chave não configurada neste ambiente
      deepgram,  // idem
    },
    hoje: {
      msgs_bot: msgs.count ?? 0,
      pedidos: pedidos.count ?? 0,
      entregas_concluidas: entregas.count ?? 0,
      rotas: rotas.count ?? 0,
      notas_capturadas: notas.count ?? 0,
      lembretes: lembretes.count ?? 0,
    },
  });
}
