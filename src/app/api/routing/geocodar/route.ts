/**
 * API Route — GET + POST /api/routing/geocodar
 *
 * GET  ?q=...&lat=...&lng=...&limite=...
 *   Busca múltiplos resultados. lat/lng são usados para ordenar por proximidade.
 *   Resposta: { resultados: ResultadoGeocoding[] }
 *
 * POST { endereco }  (legado — mantido para compatibilidade)
 *   Busca 1 resultado.
 *   Resposta: { ok, resultado }
 *
 * Status HTTP:
 * - 200 OK em sucesso
 * - 400 em endereco_invalido ou nao_encontrado
 * - 503 em erro_rede / timeout do Nominatim
 *
 * Referencia: PLANO_ROTEIRIZACAO.md passo 1.6.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { geocodar, geocodarVozComVariantes } from '@/lib/routing/geocoding';
import { geocodarGoogle, type ResultadoGoogle } from '@/lib/routing/googleGeocoding';
import { lerGeocodeCache, gravarGeocodeCache, consumirCota, montarQueryEstruturada } from '@/lib/routing/geocodeCache';
import { resolverCepDaRua } from '@/lib/cep/viacep';
import type { ResultadoGeocoding } from '@/lib/routing/types';
import { createLogger } from '@/lib/logger';
import {
  buscarEntregasDoPedido,
  geocodarEntregas,
} from '@/lib/routing/geocodarEntregasPedido';

const log = createLogger('api_routing_geocodar');

// Geocoding sequencial ~1.1s/endereço por rate-limit Nominatim; precisa de margem ampla.
export const maxDuration = 300;

interface GeocodarRequest {
  endereco: string;
}

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/** Converte resultado do Google pro formato dos cards (ResultadoGeocoding).
 *  O Google ja traz CEP validado + bairro/cidade/uf — sem cepMultiplos. */
function googleParaGeocoding(g: ResultadoGoogle): ResultadoGeocoding {
  return {
    lat: g.lat,
    lng: g.lng,
    endereco_normalizado: g.endereco_formatado,
    logradouro: g.logradouro,
    numero: g.numero,
    bairro: g.bairro,
    cidade: g.cidade,
    uf: g.uf,
    cep: g.cep,
    cepMultiplos: false,
  };
}

// ─── GET /api/routing/geocodar?q=...&lat=...&lng=...&limite=... ──────

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q');
  const lat = searchParams.get('lat');
  const lng = searchParams.get('lng');
  const limite = Math.min(Number(searchParams.get('limite') ?? '5'), 10);

  if (!q || q.trim().length < 3) {
    return NextResponse.json(
      { error: 'campo_obrigatorio', detail: 'q' },
      { status: 400 }
    );
  }

  const userLat = lat ? parseFloat(lat) : undefined;
  const userLng = lng ? parseFloat(lng) : undefined;
  const hasCoords =
    userLat !== undefined && userLng !== undefined &&
    !Number.isNaN(userLat) && !Number.isNaN(userLng);

  log.info('geocodar_multiplos_req', { q, hasCoords, limite });

  // ─── 0. CACHE primeiro (custo zero; nunca chama API se ja resolveu antes) ───
  const cacheHit = await lerGeocodeCache(q);
  if (cacheHit) {
    log.info('geocodar_cache_hit', { q });
    return NextResponse.json(
      { resultados: [googleParaGeocoding(cacheHit)], fonte: 'cache' },
      { status: 200 },
    );
  }

  // ─── 1. GOOGLE (se ha chave e ainda ha cota no mes) ───
  // Geocoder principal: CEP exato + pino rooftop + corrige digitacao. Atras de
  // cota mensal (GEOCODE_LIMITE_MENSAL) — estourou, degrada pro fluxo gratis.
  if (process.env.GOOGLE_MAPS_API_KEY) {
    const cota = await consumirCota();
    if (cota.permitido) {
      const g = await geocodarGoogle(q, hasCoords ? { lat: userLat!, lng: userLng! } : undefined);
      if (g.ok && g.resultados.length > 0) {
        const escolhidos = g.resultados.slice(0, limite);
        const resultados = escolhidos.map(googleParaGeocoding);
        // Cacheia: (a) sob a chave da consulta (repetir a mesma busca = hit) e
        // (b) cada opcao sob sua chave ESTRUTURADA — assim, ao otimizar, o
        // resolverCoordenada acha no cache a opcao escolhida e NAO gasta uma 2a
        // chamada ao Google. Tudo upsert (idempotente), sem custo de API.
        await gravarGeocodeCache(q, escolhidos[0]);
        await Promise.all(
          escolhidos.map((r) => gravarGeocodeCache(montarQueryEstruturada(r), r)),
        );
        log.info('geocodar_google_ok', { q, total: resultados.length });
        return NextResponse.json({ resultados, fonte: 'google' }, { status: 200 });
      }
      log.info('geocodar_google_sem_resultado', { q, motivo: g.ok ? 'vazio' : g.motivo });
      // cai no fallback gratis abaixo
    } else {
      log.info('geocodar_cota_estourada', { total: cota.total });
    }
  }

  // ─── 2. FALLBACK GRATIS: Nominatim (cascata voz) + ViaCEP reverso pro CEP ───
  // Cascata de variantes p/ texto FALADO: limpa "bairro"/"numero", gera variante
  // de apostrofo (d'Alva) e cai pra so o logradouro com vies de GPS. Cobre o caso
  // do motorista que fala "Rua X bairro Estrela Dalva" e o OSM tem "Estrela d'Alva".
  const resultado = await geocodarVozComVariantes(
    q,
    limite,
    hasCoords ? userLat : undefined,
    hasCoords ? userLng : undefined,
  );

  if (resultado.ok) {
    // O `postcode` do Nominatim NAO e confiavel (CEP especial/de area que nao
    // bate com a rua). Substitui pelo CEP REAL via busca reversa do ViaCEP por
    // logradouro — em paralelo, sem bloquear em falha. So fica preenchido quando
    // a rua tem 1 CEP unico (ou o bairro casou); senao vem cepMultiplos.
    const resultados: ResultadoGeocoding[] = await Promise.all(
      resultado.resultados.map(async (r) => {
        if (r.logradouro && r.cidade && r.uf) {
          const { cep, cepMultiplos } = await resolverCepDaRua({
            uf: r.uf,
            cidade: r.cidade,
            logradouro: r.logradouro,
            bairro: r.bairro,
          });
          return { ...r, cep, cepMultiplos };
        }
        // Sem rua/cidade/uf nao da pra validar — nao mostra o CEP cru do Nominatim.
        return { ...r, cep: undefined, cepMultiplos: false };
      }),
    );
    return NextResponse.json({ resultados }, { status: 200 });
  }

  const statusErro =
    resultado.motivo === 'endereco_invalido' || resultado.motivo === 'nao_encontrado'
      ? 400
      : 503;
  return NextResponse.json(resultado, { status: statusErro });
}

// ─── POST /api/routing/geocodar ─────────────────────────────────────
//
// Dois modos discriminados pelo body:
//
//   { pedido_id }   → geocoda as entregas não-finalizadas do pedido (novo).
//                     Responde { total, geocodificadas, falharam }.
//                     Disparado fire-and-forget ao criar pedido.
//
//   { endereco }    → legado: geocoda 1 endereço-texto. Mantido para
//                     compatibilidade com chamadas antigas.

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: Partial<GeocodarRequest & { pedido_id: string }>;
  try {
    body = (await request.json()) as Partial<GeocodarRequest & { pedido_id: string }>;
  } catch {
    log.warn('json_invalido');
    return NextResponse.json({ error: 'json_invalido' }, { status: 400 });
  }

  // ── NOVO: geocoda entregas de um pedido ──────────────────────────
  if ('pedido_id' in body) {
    if (!body.pedido_id || typeof body.pedido_id !== 'string') {
      return NextResponse.json(
        { error: 'campo_obrigatorio', detail: 'pedido_id' },
        { status: 400 }
      );
    }

    const supabase = getSupabase();

    let entregas;
    try {
      entregas = await buscarEntregasDoPedido(supabase, body.pedido_id);
    } catch (err) {
      log.error('buscar_entregas_erro', { pedido_id: body.pedido_id, message: (err as Error).message });
      return NextResponse.json({ error: 'db_query_failed' }, { status: 500 });
    }

    const total = entregas.length;
    const { geocodificadas, sem_geocoding } = await geocodarEntregas(supabase, entregas);

    log.info('geocodar_pedido_concluido', {
      pedido_id: body.pedido_id,
      total,
      geocodificadas: geocodificadas.length,
      falharam: sem_geocoding.length,
    });

    return NextResponse.json(
      {
        total,
        geocodificadas: geocodificadas.length,
        falharam: sem_geocoding.length,
      },
      { status: 200 }
    );
  }

  // ── LEGADO: geocoda 1 endereço-texto ────────────────────────────
  if (!body.endereco || typeof body.endereco !== 'string') {
    return NextResponse.json(
      { error: 'campo_obrigatorio', detail: 'endereco' },
      { status: 400 }
    );
  }

  const resultado = await geocodar(body.endereco);

  if (resultado.ok) {
    return NextResponse.json(resultado, { status: 200 });
  }

  const statusErro =
    resultado.motivo === 'endereco_invalido' || resultado.motivo === 'nao_encontrado'
      ? 400
      : 503;
  return NextResponse.json(resultado, { status: statusErro });
}

