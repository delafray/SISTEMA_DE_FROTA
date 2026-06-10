/**
 * geocodarEntregasPedido — extração do ramo de pedido do otimizar/route.ts.
 *
 * Concentra:
 *  - EntregaRoteavel: subset de `entregas` usado na roteirização.
 *  - buscarEntregasDoPedido: busca + filtra não-finalizadas.
 *  - geocodarEntregas: geocoda via texto livre (geocodar), grava lat/lng/geocode_status.
 *
 * Server-only. Recebe o client Supabase como parâmetro (igual ao padrão do
 * otimizar/route.ts) para não instanciar um segundo client.
 */

import { createLogger } from '@/lib/logger';
import { geocodar } from '@/lib/routing/geocoding';

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

/**
 * Geocoda as entregas sem coordenada via texto livre (Nominatim).
 * Para cada entrega:
 *  - Se já tem lat/lng: passa direto.
 *  - Se não: chama geocodar(destino), grava latitude/longitude/geocode_status.
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
    const geo = texto ? await geocodar(texto) : ({ ok: false } as const);
    if (!geo.ok) {
      await supabase.from('entregas').update({ geocode_status: 'falhou' }).eq('id', ent.id);
      sem_geocoding.push(ent.id);
      continue;
    }
    const { error: errUp } = await supabase
      .from('entregas')
      .update({
        latitude: geo.resultado.lat,
        longitude: geo.resultado.lng,
        geocode_status: 'geocodificado',
      })
      .eq('id', ent.id);
    if (errUp) {
      log.warn('update_entrega_coord_falhou', { entrega_id: ent.id, message: errUp.message });
      sem_geocoding.push(ent.id);
      continue;
    }
    geocodificadas.push({ ...ent, latitude: geo.resultado.lat, longitude: geo.resultado.lng });
  }

  return { geocodificadas, sem_geocoding };
}
