'use client';

/**
 * MapaRotaInner — renderizacao real do mapa Leaflet.
 *
 * Carregado dinamicamente (ssr: false) pelo wrapper MapaRota.
 * Renderiza tiles do OpenStreetMap + pinos numerados com DivIcon + polyline
 * da rota se fornecida.
 *
 * Referencia: PLANO_ROTEIRIZACAO.md passo 1.11.
 */

import { useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Tooltip } from 'react-leaflet';
import { divIcon, type LatLngBoundsExpression, type LatLngExpression } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { decodePolyline } from '@/lib/routing/polyline';
import type { MapaRotaProps } from './MapaRota';

function pinoNumeradoIcon(numero: number, fixada: boolean) {
  const cor = fixada ? '#dc2626' : '#2563eb';
  return divIcon({
    className: 'pino-numerado',
    html: `<div style="
      width:32px;height:32px;
      background:${cor};
      color:#fff;
      border:2px solid #fff;
      border-radius:50% 50% 50% 0;
      transform:rotate(-45deg);
      display:flex;align-items:center;justify-content:center;
      box-shadow:0 2px 4px rgba(0,0,0,0.3);
    ">
      <span style="transform:rotate(45deg);font-weight:700;font-size:14px;">${numero}</span>
    </div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32],
  });
}

export default function MapaRotaInner({
  paradas,
  polylineEncoded,
  altura = 360,
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
    <div data-testid="mapa-container" style={{ width: '100%', height: altura, borderRadius: 8, overflow: 'hidden' }}>
      <MapContainer bounds={bounds} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; OpenStreetMap contributors'
        />
        {polylineCoords.length > 0 && (
          <Polyline positions={polylineCoords} pathOptions={{ color: '#2563eb', weight: 4, opacity: 0.7 }} />
        )}
        {paradas.map((p) => (
          <Marker
            key={`${p.ordem}-${p.latitude}-${p.longitude}`}
            position={[p.latitude, p.longitude]}
            icon={pinoNumeradoIcon(p.ordem, p.fixada)}
          >
            <Tooltip>
              {p.ordem}. {p.endereco.logradouro || '(sem nome)'} — {p.endereco.cidade}/{p.endereco.uf}
            </Tooltip>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
