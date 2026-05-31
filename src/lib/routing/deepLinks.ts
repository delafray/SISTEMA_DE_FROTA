/**
 * Deep links para Waze e Google Maps.
 *
 * Esses links sao **publicos** — nao exigem API key. Funcionam em iPhone
 * (Safari) e Android (Chrome) abrindo o app nativo se instalado, ou web
 * fallback se nao.
 *
 * Referencia: PLANO_ROTEIRIZACAO.md passo 1.13 + secao 3.6.
 */

import type { Coordenada } from './types';

/**
 * Waze — abre navegacao pra um destino.
 * Doc: https://developers.google.com/waze/deeplinks
 */
export function waze(lat: number, lng: number): string {
  return `https://waze.com/ul?ll=${encodeURIComponent(lat.toString())},${encodeURIComponent(lng.toString())}&navigate=yes`;
}

/**
 * Google Maps — abre navegacao pra um destino unico (driving mode).
 */
export function googleMaps(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(lat.toString())},${encodeURIComponent(lng.toString())}&travelmode=driving`;
}

// ─── NAVEGACAO POR ENDERECO (texto) ─────────────────────────────────
//
// Por que existe: o Nominatim/Overpass (OSM) NAO tem numero de casa mapeado
// pra maioria das ruas pequenas do Brasil — devolve o centro da rua, que cai
// ate ~2 quarteiroes longe da porta. O Waze e o Google tem geocoders proprios
// muito melhores pra numero de casa no BR. Entao, quando NOSSA coordenada e
// fraca (confianca 'baixa'), mandamos o ENDERECO em texto e deixamos o app de
// navegacao achar o numero — em vez de cravar o motorista no centro errado.
//
// Quando a coordenada e 'alta' (aprendida pela frota numa visita anterior, ou
// confirmada no Overpass), a coordenada e mais precisa e SEM ambiguidade —
// nesse caso mandamos lat/lng direto.

/** Partes minimas de endereco pra montar a query de navegacao. */
export interface EnderecoNav {
  logradouro?: string;
  numero?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
  cep?: string;
}

/**
 * Monta a string de endereco pra busca no Waze/Google.
 * Formato: "Logradouro, Numero, Bairro, Cidade - UF, CEP, Brasil".
 * Inclui CEP quando disponivel (o que mais desambigua no BR).
 */
export function formatarEnderecoNav(e: EnderecoNav): string {
  const ruaNum = [e.logradouro, e.numero]
    .map((s) => (s ?? '').trim())
    .filter(Boolean)
    .join(', ');
  const cidadeUf =
    e.cidade && e.uf ? `${e.cidade.trim()} - ${e.uf.trim()}` : (e.cidade ?? e.uf ?? '').trim();
  return [ruaNum, (e.bairro ?? '').trim(), cidadeUf, (e.cep ?? '').trim(), 'Brasil']
    .map((s) => s.trim())
    .filter(Boolean)
    .join(', ');
}

/** True quando ha logradouro + cidade suficientes pra busca textual valer. */
function temEnderecoUtil(e?: EnderecoNav): e is EnderecoNav {
  return Boolean(e && e.logradouro && e.logradouro.trim() && e.cidade && e.cidade.trim());
}

/** Waze por endereco em texto (geocoder do proprio Waze acha o numero). */
export function wazePorEndereco(e: EnderecoNav): string {
  return `https://waze.com/ul?q=${encodeURIComponent(formatarEnderecoNav(e))}&navigate=yes`;
}

/** Google Maps por endereco em texto (geocoder do proprio Google). */
export function googleMapsPorEndereco(e: EnderecoNav): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
    formatarEnderecoNav(e)
  )}&travelmode=driving`;
}

/** Alvo de navegacao: coordenada + endereco + nivel de confianca da coordenada. */
export interface AlvoNavegacao {
  lat: number;
  lng: number;
  endereco?: EnderecoNav;
  /** 'alta' = coord precisa (aprendida/Overpass) → usa lat/lng.
   *  'baixa'/ausente = coord fraca (centro da rua) → usa endereco em texto. */
  confianca?: 'alta' | 'baixa';
}

/** Decide entre coordenada (precisa) e endereco em texto (geocoder do app). */
function preferirEndereco(alvo: AlvoNavegacao): boolean {
  if (alvo.confianca === 'alta') return false;
  return temEnderecoUtil(alvo.endereco);
}

/**
 * Waze ciente de confianca: coord quando 'alta', endereco em texto quando fraca.
 * Caia pra lat/lng se nao houver endereco util.
 */
export function wazeNav(alvo: AlvoNavegacao): string {
  return preferirEndereco(alvo) ? wazePorEndereco(alvo.endereco!) : waze(alvo.lat, alvo.lng);
}

/**
 * Google Maps ciente de confianca: coord quando 'alta', endereco em texto
 * quando fraca. Caia pra lat/lng se nao houver endereco util.
 */
export function googleMapsNav(alvo: AlvoNavegacao): string {
  return preferirEndereco(alvo)
    ? googleMapsPorEndereco(alvo.endereco!)
    : googleMaps(alvo.lat, alvo.lng);
}

/**
 * Google Maps multistop — abre rota com varios destinos (max 9 waypoints
 * + 1 destino final = 10 paradas total, restricao da plataforma).
 *
 * Se passar mais que 10 pontos, pega os 10 primeiros e marca o ultimo
 * como destination, os demais como waypoints. Caller deve dividir em
 * sub-rotas se quiser cobrir todas as 70 NFs.
 */
export function googleMapsMultiStop(pontos: Coordenada[]): string {
  if (pontos.length === 0) return 'https://www.google.com/maps';

  const limitados = pontos.slice(0, 10);
  const destino = limitados[limitados.length - 1];
  const waypoints = limitados.slice(0, -1);

  let url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${destino.lat},${destino.lng}`)}&travelmode=driving`;

  if (waypoints.length > 0) {
    const wp = waypoints.map((p) => `${p.lat},${p.lng}`).join('|');
    url += `&waypoints=${encodeURIComponent(wp)}`;
  }

  return url;
}

/** String de um ponto do multistop: coordenada (alta) ou endereco em texto (baixa). */
function pontoNav(alvo: AlvoNavegacao): string {
  return preferirEndereco(alvo) ? formatarEnderecoNav(alvo.endereco!) : `${alvo.lat},${alvo.lng}`;
}

/**
 * Google Maps multistop CIENTE DE CONFIANCA — mesma logica do single-stop por
 * parada: coordenada quando a coord e precisa (alta), endereco em texto quando
 * e fraca (baixa, deixa o Google achar o numero). O ultimo alvo vira destino,
 * os demais waypoints (na ordem dada — o VROOM ja otimizou).
 *
 * NAO passa origem: o Google usa a localizacao atual do motorista como ponto
 * de partida. Limita a 10 paradas (origem GPS + 9 = limite da plataforma).
 */
export function googleMapsMultiStopNav(alvos: AlvoNavegacao[]): string {
  if (alvos.length === 0) return 'https://www.google.com/maps';

  const limitados = alvos.slice(0, 10);
  const destino = pontoNav(limitados[limitados.length - 1]);
  const waypoints = limitados.slice(0, -1).map(pontoNav);

  let url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
    destino
  )}&travelmode=driving`;

  if (waypoints.length > 0) {
    url += `&waypoints=${encodeURIComponent(waypoints.join('|'))}`;
  }

  return url;
}

/**
 * Divide N pontos em chunks de 10 pra contornar o limite do Google Maps
 * (util pra dividir rota de 70 NFs em 7 sub-rotas).
 */
export function dividirParaMultiStop(pontos: Coordenada[], chunkSize = 10): Coordenada[][] {
  const chunks: Coordenada[][] = [];
  for (let i = 0; i < pontos.length; i += chunkSize) {
    chunks.push(pontos.slice(i, i + chunkSize));
  }
  return chunks;
}
