/**
 * Testes do componente MapaRota.
 * Mocka next/dynamic pra evitar carregar Leaflet (que quebra em jsdom).
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock next/dynamic — devolve um componente simples que registra props recebidas
vi.mock('next/dynamic', () => ({
  default: (_loader: unknown) => {
    const StubInner = (props: Record<string, unknown>) => (
      <div data-testid="mapa-inner-mock" data-paradas={Array.isArray(props.paradas) ? props.paradas.length : 0}>
        {props.polylineEncoded ? 'tem-polyline' : 'sem-polyline'}
      </div>
    );
    return StubInner;
  },
}));

import { MapaRota } from '@/components/MapaRota';

describe('MapaRota', () => {
  it('mostra placeholder "sem paradas" quando paradas vazias', () => {
    render(<MapaRota paradas={[]} />);
    expect(screen.getByTestId('mapa-sem-paradas')).toBeDefined();
  });

  it('renderiza inner (mock) com paradas + polyline quando dados presentes', () => {
    const paradas = [
      {
        ordem: 1,
        latitude: -23.5,
        longitude: -46.6,
        endereco: { logradouro: 'X', bairro: 'B', cidade: 'SP', uf: 'SP' },
        fixada: false,
      },
      {
        ordem: 2,
        latitude: -23.6,
        longitude: -46.7,
        endereco: { logradouro: 'Y', bairro: 'B', cidade: 'SP', uf: 'SP' },
        fixada: true,
      },
    ];

    render(<MapaRota paradas={paradas} polylineEncoded="abc123" />);

    const inner = screen.getByTestId('mapa-inner-mock');
    expect(inner.getAttribute('data-paradas')).toBe('2');
    expect(inner.textContent).toBe('tem-polyline');
  });

  it('renderiza inner sem polyline quando nao tem traçado', () => {
    const paradas = [
      {
        ordem: 1,
        latitude: -23.5,
        longitude: -46.6,
        endereco: { logradouro: 'X', bairro: 'B', cidade: 'SP', uf: 'SP' },
        fixada: false,
      },
    ];
    render(<MapaRota paradas={paradas} />);
    expect(screen.getByTestId('mapa-inner-mock').textContent).toBe('sem-polyline');
  });
});
