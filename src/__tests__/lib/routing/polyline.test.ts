/**
 * Testes do decoder de polyline.
 * Fixture: exemplo classico do Google Polyline Algorithm.
 */

import { describe, it, expect } from 'vitest';
import { decodePolyline } from '@/lib/routing/polyline';

describe('decodePolyline', () => {
  it('decodifica polyline vazia', () => {
    expect(decodePolyline('')).toEqual([]);
  });

  it('decodifica fixture classico do Google (3 pontos)', () => {
    // Fixture conhecido: pontos (38.5, -120.2), (40.7, -120.95), (43.252, -126.453)
    const encoded = '_p~iF~ps|U_ulLnnqC_mqNvxq`@';
    const decoded = decodePolyline(encoded);

    expect(decoded).toHaveLength(3);
    // Tolerancia de 1e-5 por causa de precisao do encoding
    expect(decoded[0][0]).toBeCloseTo(38.5, 4);
    expect(decoded[0][1]).toBeCloseTo(-120.2, 4);
    expect(decoded[1][0]).toBeCloseTo(40.7, 4);
    expect(decoded[1][1]).toBeCloseTo(-120.95, 4);
    expect(decoded[2][0]).toBeCloseTo(43.252, 3);
    expect(decoded[2][1]).toBeCloseTo(-126.453, 3);
  });

  it('cada ponto tem [lat, lng] (nao [lng, lat])', () => {
    // Outro fixture, 1 ponto: (38.5, -120.2)
    const decoded = decodePolyline('_p~iF~ps|U');
    expect(decoded).toHaveLength(1);
    expect(decoded[0][0]).toBeGreaterThan(0);  // lat positivo
    expect(decoded[0][1]).toBeLessThan(0);     // lng negativo
  });
});
