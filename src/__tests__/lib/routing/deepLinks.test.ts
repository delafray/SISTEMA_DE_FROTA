/**
 * Testes dos deep links Waze e Google Maps.
 */

import { describe, it, expect } from 'vitest';
import {
  waze,
  googleMaps,
  googleMapsMultiStop,
  dividirParaMultiStop,
  formatarEnderecoNav,
  wazePorEndereco,
  googleMapsPorEndereco,
  wazeNav,
  googleMapsNav,
  googleMapsMultiStopNav,
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

// ─── Navegacao por endereco (texto) ─────────────────────────────────

const PIATA = {
  logradouro: 'Rua Piatã',
  numero: '104',
  bairro: 'São Mateus',
  cidade: 'Contagem',
  uf: 'MG',
};

describe('formatarEnderecoNav', () => {
  it('monta "Logradouro, Numero, Bairro, Cidade - UF, Brasil"', () => {
    expect(formatarEnderecoNav(PIATA)).toBe(
      'Rua Piatã, 104, São Mateus, Contagem - MG, Brasil'
    );
  });

  it('inclui CEP quando presente', () => {
    expect(formatarEnderecoNav({ ...PIATA, cep: '32180-300' })).toBe(
      'Rua Piatã, 104, São Mateus, Contagem - MG, 32180-300, Brasil'
    );
  });

  it('ignora partes vazias (sem numero, sem bairro)', () => {
    expect(formatarEnderecoNav({ logradouro: 'Rua X', cidade: 'SP', uf: 'SP' })).toBe(
      'Rua X, SP - SP, Brasil'
    );
  });
});

describe('wazePorEndereco / googleMapsPorEndereco', () => {
  it('waze usa ?q= com o endereco encodado e navigate=yes', () => {
    const url = wazePorEndereco(PIATA);
    expect(url.startsWith('https://waze.com/ul?q=')).toBe(true);
    expect(url).toContain('navigate=yes');
    expect(decodeURIComponent(url)).toContain('Rua Piatã, 104, São Mateus, Contagem - MG');
  });

  it('google usa destination= com o endereco encodado', () => {
    const url = googleMapsPorEndereco(PIATA);
    expect(url).toContain('api=1');
    expect(url).toContain('travelmode=driving');
    expect(decodeURIComponent(url)).toContain('destination=Rua Piatã, 104, São Mateus');
  });
});

describe('wazeNav / googleMapsNav — coord vs endereco por confianca', () => {
  it('confianca baixa + endereco util → usa ENDERECO em texto', () => {
    const alvo = { lat: -19.86, lng: -44.02, endereco: PIATA, confianca: 'baixa' as const };
    expect(wazeNav(alvo)).toContain('?q=');
    expect(googleMapsNav(alvo)).toContain(encodeURIComponent('Rua Piatã'));
  });

  it('confianca alta → usa COORDENADA (precisa, sem ambiguidade)', () => {
    const alvo = { lat: -19.861, lng: -44.029, endereco: PIATA, confianca: 'alta' as const };
    expect(wazeNav(alvo)).toBe('https://waze.com/ul?ll=-19.861,-44.029&navigate=yes');
    expect(googleMapsNav(alvo)).toContain('destination=-19.861,-44.029');
  });

  it('confianca ausente é tratada como fraca → usa endereco', () => {
    const alvo = { lat: -19.86, lng: -44.02, endereco: PIATA };
    expect(wazeNav(alvo)).toContain('?q=');
  });

  it('sem endereco util (so cidade) → cai pra coordenada mesmo em baixa', () => {
    const alvo = { lat: -19.86, lng: -44.02, endereco: { cidade: 'Contagem', uf: 'MG' }, confianca: 'baixa' as const };
    expect(wazeNav(alvo)).toContain('?ll=-19.86,-44.02');
    expect(googleMapsNav(alvo)).toContain('destination=-19.86,-44.02');
  });

  it('sem endereco nenhum → coordenada', () => {
    const alvo = { lat: -19.86, lng: -44.02, confianca: 'baixa' as const };
    expect(wazeNav(alvo)).toContain('?ll=');
  });
});

describe('googleMapsMultiStopNav — bloco por confianca', () => {
  const altaSP = { lat: -23.5505, lng: -46.6333, confianca: 'alta' as const };
  const baixaPiata = {
    lat: -19.86,
    lng: -44.02,
    endereco: { logradouro: 'Rua Piatã', numero: '104', cidade: 'Contagem', uf: 'MG' },
    confianca: 'baixa' as const,
  };

  it('vazio → URL base do Maps', () => {
    expect(googleMapsMultiStopNav([])).toBe('https://www.google.com/maps');
  });

  it('1 alvo alta → destination = coordenada, sem waypoints', () => {
    const url = googleMapsMultiStopNav([altaSP]);
    expect(url).toContain('destination=-23.5505%2C-46.6333');
    expect(url).not.toContain('waypoints=');
  });

  it('1 alvo baixa → destination = ENDERECO em texto', () => {
    const url = googleMapsMultiStopNav([baixaPiata]);
    expect(decodeURIComponent(url)).toContain('destination=Rua Piatã, 104, Contagem - MG');
    expect(url).not.toContain('waypoints=');
  });

  it('mistura: waypoints e destino respeitam a confianca de cada um', () => {
    // ordem: baixa (waypoint, texto) → alta (destino, coord)
    const url = googleMapsMultiStopNav([baixaPiata, altaSP]);
    expect(url).toContain('destination=-23.5505%2C-46.6333'); // ultimo = coord
    const wp = decodeURIComponent(url.split('waypoints=')[1]);
    expect(wp).toContain('Rua Piatã, 104'); // waypoint = endereco em texto
  });

  it('nao passa origem (Google usa GPS atual do motorista)', () => {
    expect(googleMapsMultiStopNav([altaSP, baixaPiata])).not.toContain('origin=');
  });

  it('limita a 10 alvos (9 waypoints + 1 destino)', () => {
    const muitos = Array.from({ length: 14 }, (_, i) => ({
      lat: -23 - i,
      lng: -46,
      confianca: 'alta' as const,
    }));
    const url = googleMapsMultiStopNav(muitos);
    const wp = decodeURIComponent(url.split('waypoints=')[1]);
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
