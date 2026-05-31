/**
 * Coordenadas aprendidas pela frota.
 *
 * Problema que resolve: ruas pequenas do Brasil quase nunca tem numero de casa
 * mapeado no OSM — Nominatim/Overpass devolvem o centro da rua (ate ~2
 * quarteiroes longe da porta). Mas a operacao REVISITA os mesmos enderecos todo
 * dia. Entao, na primeira entrega, capturamos o GPS real do motorista no ponto
 * e guardamos por endereco. Toda entrega futura naquele endereco usa ESSA
 * coordenada (precisa, confianca 'alta') em vez do OSM. Com o tempo, a frota
 * vira a melhor fonte de geocoding pra propria regiao de atuacao.
 *
 * Chave: (empresa_id, chave) onde chave = "ruaNorm|numero|cidade|uf".
 * Tabela: coordenadas_aprendidas (db/migration_coordenadas_aprendidas.sql).
 */

import { createClient } from '@supabase/supabase-js';
import { createLogger } from '@/lib/logger';
import { normalizarRua } from './overpass/normalizar';

const log = createLogger('coords-aprendidas');

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export interface EnderecoChave {
  logradouro?: string;
  numero?: string;
  cidade?: string;
  uf?: string;
}

export interface CoordAprendida {
  lat: number;
  lng: number;
  amostras: number;
}

/**
 * Monta a chave normalizada do endereco. Retorna null se faltar logradouro,
 * numero, cidade ou uf — sem esses 4 nao da pra identificar a casa com seguranca
 * (evita aprender coordenada errada pra "rua X sem numero").
 */
export function chaveEndereco(e: EnderecoChave): string | null {
  const rua = normalizarRua(e.logradouro ?? '');
  const num = (e.numero ?? '').match(/\d+/)?.[0] ?? '';
  const cidade = (e.cidade ?? '').trim().toLowerCase();
  const uf = (e.uf ?? '').trim().toUpperCase();
  if (!rua || !num || !cidade || !uf) return null;
  return `${rua}|${num}|${cidade}|${uf}`;
}

/** Le a coordenada aprendida pra um endereco. Null se nao existe ou chave invalida. */
export async function lerCoordAprendida(
  empresaId: string,
  endereco: EnderecoChave
): Promise<CoordAprendida | null> {
  const chave = chaveEndereco(endereco);
  if (!chave || !empresaId) return null;

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('coordenadas_aprendidas')
    .select('lat, lng, amostras')
    .eq('empresa_id', empresaId)
    .eq('chave', chave)
    .maybeSingle();

  if (error) {
    log.warn('leitura_erro', { chave, message: error.message });
    return null;
  }
  if (!data) return null;

  return {
    lat: Number(data.lat),
    lng: Number(data.lng),
    amostras: Number(data.amostras ?? 1),
  };
}

/**
 * Grava (ou refina) a coordenada aprendida pra um endereco.
 *
 * Se ja existe, faz media ponderada com as amostras anteriores — suaviza ruido
 * de GPS entre visitas e converge pra porta real. Limita o peso historico a 20
 * amostras pra continuar acompanhando mudancas (ex: cliente mudou de lugar).
 */
export async function gravarCoordAprendida(
  empresaId: string,
  endereco: EnderecoChave,
  lat: number,
  lng: number
): Promise<void> {
  const chave = chaveEndereco(endereco);
  if (!chave || !empresaId) return;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

  const supabase = getSupabase();

  const atual = await lerCoordAprendida(empresaId, endereco);
  let novaLat = lat;
  let novaLng = lng;
  let novasAmostras = 1;

  if (atual) {
    const peso = Math.min(atual.amostras, 20); // teto pra nao "congelar"
    novaLat = (atual.lat * peso + lat) / (peso + 1);
    novaLng = (atual.lng * peso + lng) / (peso + 1);
    novasAmostras = atual.amostras + 1;
  }

  const { error } = await supabase.from('coordenadas_aprendidas').upsert(
    {
      empresa_id: empresaId,
      chave,
      lat: novaLat,
      lng: novaLng,
      amostras: novasAmostras,
      atualizado_em: new Date().toISOString(),
    },
    { onConflict: 'empresa_id,chave' }
  );

  if (error) {
    log.warn('gravacao_erro', { chave, message: error.message });
  }
}
