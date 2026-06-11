/**
 * Efeitos da fase captura — extraídos de page.tsx SEM mudança de comportamento:
 *   1. workers de sync da fila + detector online/offline + refresh da lista a 3s;
 *   2. contador de uso do Google (cache vs API) — refeito a cada NF capturada.
 */

import { useEffect, useState } from 'react';
import { listarTodas } from '@/lib/offline/fila';
import { iniciarSyncWorker } from '@/lib/offline/sync';
import { iniciarOnlineDetector, estaOnline } from '@/lib/offline/onlineDetector';
import type { Fase } from '../types';
import type { NotaNaFila } from '@/lib/offline/types';

type Params = {
  fase: Fase;
  motoristaId: string;
  numNotas: number;
  setNotas: (n: NotaNaFila[]) => void;
  setOnline: (o: boolean) => void;
};

export function useCapturaWorkers({ fase, motoristaId, numNotas, setNotas, setOnline }: Params) {
  // Uso do Google no mes (pra mostrar na captura: cache vs API + quanto falta
  // pro ViaCEP). Atualiza ao entrar na captura e a cada NF capturada.
  const [usoGoogle, setUsoGoogle] = useState<{ total: number; limite: number } | null>(null);

  useEffect(() => {
    if (fase !== 'captura') return;
    let cancelado = false;
    fetch('/api/routing/geocode-uso')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { total?: number; limite?: number } | null) => {
        if (!cancelado && d && typeof d.total === 'number' && typeof d.limite === 'number') {
          setUsoGoogle({ total: d.total, limite: d.limite });
        }
      })
      .catch(() => {});
    return () => {
      cancelado = true;
    };
  }, [fase, numNotas]);

  // ─── Workers de sync + online detector na fase captura ────────────
  useEffect(() => {
    if (fase !== 'captura' || !motoristaId) return;

    const stopWorker = iniciarSyncWorker(5000);
    const stopDetector = iniciarOnlineDetector();
    setOnline(estaOnline());

    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const intervalo = setInterval(async () => {
      const todas = await listarTodas(motoristaId);
      setNotas(todas);
    }, 3000);

    return () => {
      stopWorker();
      stopDetector();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(intervalo);
    };
  }, [fase, motoristaId, setNotas, setOnline]);

  return { usoGoogle };
}
