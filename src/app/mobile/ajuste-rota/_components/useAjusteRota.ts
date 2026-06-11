'use client';

/**
 * useAjusteRota — hook de carregamento e GPS da tela Ajuste de Rota.
 *
 * Gerencia:
 * - Load inicial: fetchRota → ordena concluidas primeiro → renumera → dirty inicial
 * - Watch GPS: marcador "voce esta aqui" no mapa; para ao desmontar
 *
 * Retorna o estado derivado (paradas, rotaInfo, carregando, erro, posicaoAtual)
 * e setters para mutacoes feitas pela page (setParadas, setRotaInfo, setDirty,
 * setErro).
 */

import { useEffect, useState } from 'react';
import { fetchRota } from '@/lib/routing/api';
import type { Parada, RotaOtimizada } from '@/lib/routing/types';
import { ordenarConcluidasPrimeiro } from './utils';

export interface AjusteRotaEstado {
  paradas: Parada[];
  setParadas: React.Dispatch<React.SetStateAction<Parada[]>>;
  rotaInfo: RotaOtimizada | null;
  setRotaInfo: React.Dispatch<React.SetStateAction<RotaOtimizada | null>>;
  carregando: boolean;
  erro: string | null;
  setErro: React.Dispatch<React.SetStateAction<string | null>>;
  dirty: boolean;
  setDirty: React.Dispatch<React.SetStateAction<boolean>>;
  posicaoAtual: { lat: number; lng: number } | null;
}

export function useAjusteRota(rotaId: string): AjusteRotaEstado {
  const [paradas, setParadas] = useState<Parada[]>([]);
  const [rotaInfo, setRotaInfo] = useState<RotaOtimizada | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [posicaoAtual, setPosicaoAtual] = useState<{ lat: number; lng: number } | null>(null);

  // Watch GPS — marcador "voce esta aqui" no mapa. Para ao desmontar.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => setPosicaoAtual({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => { /* GPS off — ignora */ },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // Load inicial
  useEffect(() => {
    if (!rotaId) return;
    setCarregando(true);
    fetchRota(rotaId)
      .then((data) => {
        setRotaInfo(data.rota);
        // Entregues primeiro (por concluida_em ASC), pendentes depois (por ordem).
        // Motorista nao precisa mais ficar olhando pra paradas que ja terminou
        // no meio da lista. Renumera consecutivamente — se mudou a ordem original
        // marca dirty pra ele salvar.
        const ordenado = ordenarConcluidasPrimeiro(data.paradas);
        const renumerado = ordenado.map((p, i) => ({ ...p, ordem: i + 1 }));
        setParadas(renumerado);
        const ordemMudou = renumerado.some((p, i) => p.id !== data.paradas[i]?.id);
        setDirty(ordemMudou);
        setErro(null);
      })
      .catch((err: Error) => setErro(err.message))
      .finally(() => setCarregando(false));
  }, [rotaId]);

  return {
    paradas,
    setParadas,
    rotaInfo,
    setRotaInfo,
    carregando,
    erro,
    setErro,
    dirty,
    setDirty,
    posicaoAtual,
  };
}
