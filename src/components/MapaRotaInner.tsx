'use client';

/**
 * MapaRotaInner — renderizacao real do mapa Leaflet.
 *
 * Carregado dinamicamente (ssr: false) pelo wrapper MapaRota.
 */

import { useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Tooltip } from 'react-leaflet';
import { divIcon, type LatLngBoundsExpression, type LatLngExpression } from 'leaflet';
// CSS do Leaflet vive em globals.css (carregado no bundle inicial) — importar
// aqui dentro do componente dinamico (ssr:false) carrega tarde e os tiles
// nao se posicionam (motorista ve so os pinos sem mapa de fundo).
import { decodePolyline } from '@/lib/routing/polyline';
import { corDoStatus, corDaFonteCoord, statusDaParada } from '@/lib/routing/utils';
import type { MapaRotaProps } from './MapaRota';

/**
 * Pino "you are here" — circulo turquesa (#14b8a6) com borda branca e
 * sombra leve. Estilo Google Maps. Pequeno (20px) pra nao competir com
 * os pinos numerados. Animacao de pulsacao continua via @keyframes.
 *
 * Cor escolhida (#14b8a6 / tailwind teal-500) pra contrastar com a
 * paleta de status das paradas (azul, laranja, verde, vermelho) sem
 * conflitar.
 */
function pinoPosicaoAtual() {
  return divIcon({
    className: 'pino-posicao-atual',
    html: `
      <style>
        @keyframes pulse-aqui {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.15); opacity: 0.85; }
        }
      </style>
      <div style="
        width: 20px; height: 20px;
        background: #14b8a6;
        border: 3px solid #fff;
        border-radius: 50%;
        box-shadow: 0 0 0 4px rgba(20,184,166,0.25), 0 2px 6px rgba(0,0,0,0.3);
        animation: pulse-aqui 2s ease-in-out infinite;
      "></div>
    `,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
}

function pinoNumeradoIcon(
  numero: number,
  cor: string,
  destaque: boolean,
  concluida: boolean,
  corFonte?: string | null,
) {
  const tamanho = destaque ? 40 : 32;
  const ring = destaque ? `box-shadow:0 0 0 4px rgba(249,115,22,0.35), 0 2px 6px rgba(0,0,0,0.4);` : `box-shadow:0 2px 4px rgba(0,0,0,0.3);`;
  const conteudoCentro = concluida
    ? `<span style="transform:rotate(45deg);font-size:18px;color:#fff;">✓</span>`
    : `<span style="transform:rotate(45deg);font-weight:700;font-size:${destaque ? 16 : 14}px;color:#fff;">${numero}</span>`;
  // Selo de origem da coordenada: bolinha no canto superior-direito, fora do
  // numero. So aparece quando ha fonte conhecida. Fica num wrapper NAO-rotacionado
  // (o pino e rotacionado -45deg; a bolinha precisa ficar de pe).
  const selo = corFonte
    ? `<div title="origem da coordenada" style="position:absolute;top:-3px;right:-3px;width:11px;height:11px;border-radius:50%;background:${corFonte};border:2px solid #fff;box-shadow:0 1px 2px rgba(0,0,0,0.4);z-index:2;"></div>`
    : '';
  return divIcon({
    className: 'pino-numerado',
    html: `<div style="position:relative;width:${tamanho}px;height:${tamanho}px;">
      <div style="
        width:${tamanho}px;height:${tamanho}px;
        background:${cor};
        border:2px solid #fff;
        border-radius:50% 50% 50% 0;
        transform:rotate(-45deg);
        display:flex;align-items:center;justify-content:center;
        ${ring}
        transition: box-shadow 250ms ease, background-color 250ms ease, width 200ms ease, height 200ms ease;
      ">${conteudoCentro}</div>
      ${selo}
    </div>`,
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
  posicaoAtual,
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
    // Inclui posicao atual no enquadramento — assim o motorista sempre
    // ve sua posicao + paradas no mesmo viewport.
    if (posicaoAtual) {
      coords.push([posicaoAtual.lat, posicaoAtual.lng]);
    }
    return coords;
  }, [paradas, polylineCoords, posicaoAtual]);

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
              icon={pinoNumeradoIcon(p.ordem, cor, destaque, concluida, corDaFonteCoord(p.endereco?.coord_fonte))}
              eventHandlers={
                onParadaClick
                  ? {
                      click: () => onParadaClick(p.id),
                    }
                  : undefined
              }
            >
              <Tooltip>
                {p.ordem}. {p.endereco.logradouro || '(sem nome)'}
                {('numero' in p.endereco && p.endereco.numero) ? `, ${p.endereco.numero}` : ''}
                {' '}— {p.endereco.cidade}/{p.endereco.uf}
              </Tooltip>
            </Marker>
          );
        })}
        {posicaoAtual && (
          <Marker
            position={[posicaoAtual.lat, posicaoAtual.lng]}
            icon={pinoPosicaoAtual()}
            keyboard={false}
            interactive={false}
          >
            <Tooltip permanent={false}>Você está aqui</Tooltip>
          </Marker>
        )}
      </MapContainer>
    </div>
  );
}
