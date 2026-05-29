'use client';

/**
 * MapaRotaInner — renderizacao real do mapa Leaflet.
 *
 * Carregado dinamicamente (ssr: false) pelo wrapper MapaRota.
 */

import { useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Tooltip } from 'react-leaflet';
import { divIcon, type LatLngBoundsExpression, type LatLngExpression } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { decodePolyline } from '@/lib/routing/polyline';
import { corDoStatus, statusDaParada } from '@/lib/routing/utils';
import type { MapaRotaProps } from './MapaRota';

function pinoNumeradoIcon(numero: number, cor: string, destaque: boolean, concluida: boolean) {
  const tamanho = destaque ? 40 : 32;
  const ring = destaque ? `box-shadow:0 0 0 4px rgba(249,115,22,0.35), 0 2px 6px rgba(0,0,0,0.4);` : `box-shadow:0 2px 4px rgba(0,0,0,0.3);`;
  const conteudoCentro = concluida
    ? `<span style="transform:rotate(45deg);font-size:18px;color:#fff;">✓</span>`
    : `<span style="transform:rotate(45deg);font-weight:700;font-size:${destaque ? 16 : 14}px;color:#fff;">${numero}</span>`;
  return divIcon({
    className: 'pino-numerado',
    html: `<div style="
      width:${tamanho}px;height:${tamanho}px;
      background:${cor};
      border:2px solid #fff;
      border-radius:50% 50% 50% 0;
      transform:rotate(-45deg);
      display:flex;align-items:center;justify-content:center;
      ${ring}
      transition: box-shadow 250ms ease, background-color 250ms ease, width 200ms ease, height 200ms ease;
    ">${conteudoCentro}</div>`,
    iconSize: [tamanho, tamanho],
    iconAnchor: [tamanho / 2, tamanho],
    popupAnchor: [0, -tamanho],
  });
}

export default function MapaRotaInner({
  paradas,
  polylineEncoded,
  altura = 360,
  paradaSelecionada,
  onParadaClick,
}: MapaRotaProps): React.ReactElement {
  const polylineCoords: LatLngExpression[] = useMemo(() => {
    if (!polylineEncoded) return [];
    return decodePolyline(polylineEncoded);
  }, [polylineEncoded]);

  const bounds: LatLngBoundsExpression = useMemo(() => {
    const coords: [number, number][] = paradas.map((p) => [p.latitude, p.longitude]);
    if (polylineCoords.length > 0) {
      coords.push(...(polylineCoords as Array<[number, number]>));
    }
    return coords;
  }, [paradas, polylineCoords]);

  return (
    <div
      data-testid="mapa-container"
      style={{ width: '100%', height: altura, borderRadius: 8, overflow: 'hidden' }}
    >
      <MapContainer bounds={bounds} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; OpenStreetMap contributors'
        />
        {polylineCoords.length > 0 && (
          <Polyline
            positions={polylineCoords}
            pathOptions={{ color: '#2563eb', weight: 5, opacity: 0.75, lineCap: 'round' }}
          />
        )}
        {paradas.map((p, idx) => {
          const status = statusDaParada(p, idx, paradas);
          const cor = corDoStatus(status);
          const destaque = paradaSelecionada === p.id || status === 'proxima';
          const concluida = status === 'concluida';
          // Key estavel = so id. Mudancas de status/destaque reaplicam icon
          // mas mantem o mesmo Marker. A CSS transition no HTML do DivIcon
          // suaviza mudancas de tamanho/box-shadow.
          return (
            <Marker
              key={p.id}
              position={[p.latitude, p.longitude]}
              icon={pinoNumeradoIcon(p.ordem, cor, destaque, concluida)}
              eventHandlers={
                onParadaClick
                  ? {
                      click: () => onParadaClick(p.id),
                    }
                  : undefined
              }
            >
              <Tooltip>
                {p.ordem}. {p.endereco.logradouro || '(sem nome)'} — {p.endereco.cidade}/{p.endereco.uf}
              </Tooltip>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}
