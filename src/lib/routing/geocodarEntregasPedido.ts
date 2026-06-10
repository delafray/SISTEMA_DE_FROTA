/**
 * geocodarEntregasPedido — extração do ramo de pedido do otimizar/route.ts.
 *
 * Concentra:
 *  - EntregaRoteavel: subset de `entregas` usado na roteirização.
 *  - buscarEntregasDoPedido: busca + filtra não-finalizadas.
 *  - geocodarEntregas: geocoda com a CASCATA COMPLETA (item 3 da fila, 10/06):
 *      destino estruturável → resolverCoordenada (aprendida→Google→Nominatim→Overpass)
 *      destino texto-livre  → cache→Google(cota)→Nominatim
 *    Antes era só Nominatim texto-livre.
 *
 * Server-only. Recebe o client Supabase como parâmetro (igual ao padrão do
 * otimizar/route.ts) para não instanciar um segundo client.
 */

import { createLogger } from '@/lib/logger';
import { geocodar } from '@/lib/routing/geocoding';
import { resolverCoordenada } from '@/lib/routing/resolverCoordenada';
import { geocodarGoogle } from '@/lib/routing/googleGeocoding';
import { lerGeocodeCache, gravarGeocodeCache, consumirCota, montarQueryEstruturada } from '@/lib/routing/geocodeCache';

const log = createLogger('geocodar-entregas-pedido');

// ─── TIPOS ──────────────────────────────────────────────────────────

/** Subset de `entregas` usado na roteirização por pedido. */
export interface EntregaRoteavel {
  id: string;
  empresa_id: string | null;
  motorista_id: string | null;
  destino: string | null;
  latitude: number | null;
  longitude: number | null;
  status: string | null;
  service_time_seg: number | null;
  observacoes: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

// ─── STATUS FINALIZADOS ──────────────────────────────────────────────

const FINALIZADAS = new Set([
  'concluido', 'cancelado', 'ocorrencia',
  'concluida', 'cancelada', 'entregue',
]);

// ─── FUNÇÕES ────────────────────────────────────────────────────────

/**
 * Busca todas as entregas não-finalizadas de um pedido.
 * Lança em caso de erro de DB (o chamador decide como tratar).
 */
export async function buscarEntregasDoPedido(
  supabase: SupabaseClient,
  pedidoId: string
): Promise<EntregaRoteavel[]> {
  const { data, error } = await supabase
    .from('entregas')
    .select('id, empresa_id, motorista_id, destino, latitude, longitude, status, service_time_seg, observacoes')
    .eq('pedido_id', pedidoId);

  if (error) throw new Error(`buscar_entregas_failed: ${error.message}`);
  return ((data ?? []) as EntregaRoteavel[]).filter(
    (e) => !FINALIZADAS.has((e.status ?? '').toLowerCase())
  );
}

// ─── CASCATA DE GEOCODING ────────────────────────────────────────────

export interface DestinoEstruturado {
  logradouro: string;
  numero?: string;
  bairro?: string;
  cidade: string;
  uf: string;
  cep?: string;
}

/**
 * Tenta estruturar um destino-texto que segue o formato do PRÓPRIO sistema
 * ("Logradouro, 123, Bairro, Cidade - UF, CEP 13010-000") — é o formato que a
 * captura por voz e a importação de NFe geram. Endereço fora do padrão → null
 * (cai no caminho texto-livre).
 *
 * Conservador de propósito: exige "Cidade - UF" para não estruturar errado.
 */
export function parseDestinoEstruturado(texto: string): DestinoEstruturado | null {
  const partes = texto.split(',').map((p) => p.trim()).filter(Boolean);
  if (partes.length < 2) return null;

  // CEP: parte "CEP 13010-000" (ou só o número) — remove da lista
  let cep: string | undefined;
  const idxCep = partes.findIndex((p) => /^(cep\s*:?\s*)?\d{5}-?\d{3}$/i.test(p));
  if (idxCep >= 0) {
    cep = partes[idxCep].replace(/\D/g, '');
    partes.splice(idxCep, 1);
  }

  // "Cidade - UF": obrigatório pra confiar na estruturação
  const idxCidade = partes.findIndex((p) => /^.{2,}\s-\s?[A-Z]{2}$/.test(p));
  if (idxCidade < 1) return null; // precisa existir e NÃO ser a primeira parte (logradouro)
  const m = partes[idxCidade].match(/^(.{2,}?)\s-\s?([A-Z]{2})$/);
  if (!m) return null;
  const cidade = m[1].trim();
  const uf = m[2];

  const logradouro = partes[0];
  // número: 2ª parte se for numérica ("123", "123A", "123 A")
  let numero: string | undefined;
  let inicioBairro = 1;
  if (idxCidade >= 2 && /^\d+\s?[a-zA-Z]?$/.test(partes[1])) {
    numero = partes[1].replace(/\s/g, '');
    inicioBairro = 2;
  }
  const bairro = partes.slice(inicioBairro, idxCidade).join(', ') || undefined;

  return { logradouro, numero, bairro, cidade, uf, cep };
}

type CoordResolvida = { lat: number; lng: number; fonte: string };

/**
 * Resolve a coordenada de um destino com a cascata completa:
 *  A. Texto estruturável → resolverCoordenada (aprendida → Google estruturado
 *     → Nominatim estruturado → refino Overpass) — a melhor peça do sistema.
 *  B. Cache de geocoding por texto-livre (custo zero).
 *  C. Google texto-livre (atrás da cota mensal) + grava no cache.
 *  D. Nominatim texto-livre (comportamento antigo, último recurso).
 * Nunca lança — null = nem o Nominatim achou.
 */
export async function geocodarDestino(
  empresaId: string,
  texto: string
): Promise<CoordResolvida | null> {
  // A. estruturado → cascata completa (única com coordenadas APRENDIDAS + Overpass)
  const est = parseDestinoEstruturado(texto);
  if (est) {
    try {
      const r = await resolverCoordenada({ empresa_id: empresaId, ...est });
      if (r) return { lat: r.lat, lng: r.lng, fonte: r.fonte };
    } catch (err) {
      log.warn('resolver_coordenada_falhou', { message: (err as Error).message });
    }
  }

  // B. cache por texto-livre
  try {
    const cache = await lerGeocodeCache(texto);
    if (cache) return { lat: cache.lat, lng: cache.lng, fonte: 'google_cache' };
  } catch (err) {
    log.warn('geocode_cache_falhou', { message: (err as Error).message });
  }

  // C. Google texto-livre (atrás da cota — estourou, degrada pro Nominatim)
  if (process.env.GOOGLE_MAPS_API_KEY) {
    try {
      const cota = await consumirCota();
      if (cota.permitido) {
        const g = await geocodarGoogle(texto);
        if (g.ok && g.resultados.length > 0) {
          const top = g.resultados[0];
          // cacheia pela chave do texto E pela chave estruturada (compartilhada
          // com o resolverCoordenada do otimizar — 2ª resolução = hit, sem custo)
          await gravarGeocodeCache(texto, top);
          await gravarGeocodeCache(montarQueryEstruturada(top), top);
          return { lat: top.lat, lng: top.lng, fonte: 'google_api' };
        }
      }
    } catch (err) {
      log.warn('google_texto_livre_falhou', { message: (err as Error).message });
    }
  }

  // D. último recurso: Nominatim texto-livre (como era antes do item 3)
  const geo = await geocodar(texto);
  return geo.ok ? { lat: geo.resultado.lat, lng: geo.resultado.lng, fonte: 'nominatim' } : null;
}

/**
 * Geocoda as entregas sem coordenada usando a cascata (geocodarDestino).
 * Para cada entrega:
 *  - Se já tem lat/lng: passa direto.
 *  - Se não: resolve pela cascata, grava latitude/longitude/geocode_status.
 * Nunca lança — falhas vão para sem_geocoding.
 */
export async function geocodarEntregas(
  supabase: SupabaseClient,
  entregas: EntregaRoteavel[]
): Promise<{ geocodificadas: EntregaRoteavel[]; sem_geocoding: string[] }> {
  const geocodificadas: EntregaRoteavel[] = [];
  const sem_geocoding: string[] = [];

  for (const ent of entregas) {
    if (ent.latitude !== null && ent.longitude !== null) {
      geocodificadas.push(ent);
      continue;
    }
    const texto = (ent.destino ?? '').trim();
    const geo = texto ? await geocodarDestino(ent.empresa_id ?? '', texto) : null;
    if (!geo) {
      await supabase.from('entregas').update({ geocode_status: 'falhou' }).eq('id', ent.id);
      sem_geocoding.push(ent.id);
      continue;
    }
    log.info('entrega_geocodificada', { entrega_id: ent.id, fonte: geo.fonte });
    const { error: errUp } = await supabase
      .from('entregas')
      .update({
        latitude: geo.lat,
        longitude: geo.lng,
        geocode_status: 'geocodificado',
      })
      .eq('id', ent.id);
    if (errUp) {
      log.warn('update_entrega_coord_falhou', { entrega_id: ent.id, message: errUp.message });
      sem_geocoding.push(ent.id);
      continue;
    }
    geocodificadas.push({ ...ent, latitude: geo.lat, longitude: geo.lng });
  }

  return { geocodificadas, sem_geocoding };
}
