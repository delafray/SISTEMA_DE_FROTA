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
