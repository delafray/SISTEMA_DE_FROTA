/**
 * Polyline decoder — formato encoded do Google/OSRM (precisão 5 casas).
 *
 * OSRM devolve a geometria da rota como string codificada (compacta).
 * Para desenhar no Leaflet, precisamos converter pra array de [lat, lng].
 *
 * Algoritmo: https://developers.google.com/maps/documentation/utilities/polylinealgorithm
 *
 * Referencia: PLANO_ROTEIRIZACAO.md passo 1.11.
 */

export function decodePolyline(encoded: string): Array<[number, number]> {
  const pontos: Array<[number, number]> = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let b: number;
    let shift = 0;
    let result = 0;

    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    pontos.push([lat * 1e-5, lng * 1e-5]);
  }

  return pontos;
}
