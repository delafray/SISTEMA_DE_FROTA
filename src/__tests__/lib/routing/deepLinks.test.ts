/**
 * Testes dos deep links Waze e Google Maps.
 */

import { describe, it, expect } from 'vitest';
import {
  waze,
  googleMaps,
  googleMapsMultiStop,
  dividirParaMultiStop,
} from '@/lib/routing/deepLinks';

const SP = { lat: -23.5505, lng: -46.6333 };
const CAMPINAS = { lat: -22.9056, lng: -47.0608 };

describe('waze', () => {
  it('monta URL waze com lat,lng e navigate=yes', () => {
    expect(waze(-23.5505, -46.6333)).toBe(
      'https://waze.com/ul?ll=-23.5505,-46.6333&navigate=yes'
    );
  });
});

describe('googleMaps', () => {
  it('monta URL Google Maps direções com travelmode=driving', () => {
    const url = googleMaps(-23.5505, -46.6333);
    expect(url).toContain('destination=-23.5505,-46.6333');
    expect(url).toContain('travelmode=driving');
  });
});

describe('googleMapsMultiStop', () => {
  it('vazio → URL base do Maps', () => {
    expect(googleMapsMultiStop([])).toBe('https://www.google.com/maps');
  });

  it('1 ponto → so destination, sem waypoints', () => {
    const url = googleMapsMultiStop([SP]);
    expect(url).toContain('destination=');
    expect(url).not.toContain('waypoints=');
  });

  it('3 pontos → 2 waypoints + 1 destination (ultimo)', () => {
    const url = googleMapsMultiStop([SP, CAMPINAS, { lat: -23.0, lng: -47.0 }]);
    expect(url).toContain('destination=-23%2C-47');
    expect(url).toContain('waypoints=');
    expect(decodeURIComponent(url)).toContain('-23.5505,-46.6333|-22.9056,-47.0608');
  });

  it('limita a 10 pontos (descarta o resto)', () => {
    const muitos = Array.from({ length: 15 }, (_, i) => ({ lat: -23 - i, lng: -46 }));
    const url = googleMapsMultiStop(muitos);
    // destino = 10º ponto (index 9)
    expect(url).toContain('destination=-32%2C-46');
    // waypoints = 9 primeiros pontos
    const wpEncoded = url.split('waypoints=')[1];
    const wp = decodeURIComponent(wpEncoded);
    expect(wp.split('|').length).toBe(9);
  });
});

describe('dividirParaMultiStop', () => {
  it('chunks de 10 por default', () => {
    const pontos = Array.from({ length: 23 }, (_, i) => ({ lat: i, lng: i }));
    const chunks = dividirParaMultiStop(pontos);
    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toHaveLength(10);
    expect(chunks[1]).toHaveLength(10);
    expect(chunks[2]).toHaveLength(3);
  });

  it('chunkSize custom', () => {
    const pontos = Array.from({ length: 7 }, (_, i) => ({ lat: i, lng: i }));
    const chunks = dividirParaMultiStop(pontos, 3);
    expect(chunks.map((c) => c.length)).toEqual([3, 3, 1]);
  });

  it('vazio → array vazio', () => {
    expect(dividirParaMultiStop([])).toEqual([]);
  });
});
