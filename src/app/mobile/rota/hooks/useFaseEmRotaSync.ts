/**
 * Efeitos da fase em_rota — extraídos de page.tsx SEM mudança de comportamento:
 *   1. snapshot da rota ativa no IndexedDB (navegar/exportar offline);
 *   2. worker de sync das AÇÕES offline (baixas/encerramentos) + evento online;
 *   3. re-busca da rota ao voltar de outra tela (visibilitychange + bfcache).
 */

import { useEffect } from 'react';
import { salvarRotaAtiva } from '@/lib/offline/rotaCache';
import { iniciarSyncAcoesWorker, sincronizarAcoes } from '@/lib/offline/syncAcoes';
import { fetchRota } from '@/lib/routing/api';
import type { Fase } from '../types';
import type { Parada, RotaOtimizada } from '@/lib/routing/types';

type Params = {
  fase: Fase;
  rota: RotaOtimizada | null;
  paradas: Parada[];
  setRota: (r: RotaOtimizada) => void;
  setParadas: (p: Parada[]) => void;
  setOnline: (o: boolean) => void;
};

export function useFaseEmRotaSync({ fase, rota, paradas, setRota, setParadas, setOnline }: Params) {
  // ─── Persiste a rota ativa localmente (IndexedDB) ──────────────────
  // Sempre que a rota entra/atualiza na fase em_rota, guarda um snapshot pra o
  // motorista ver paradas + mapa + exportar pro Google Maps mesmo offline. Roda
  // tambem a cada baixa de parada (paradas muda), mantendo o progresso salvo.
  useEffect(() => {
    if (fase !== 'em_rota' || !rota) return;
    void salvarRotaAtiva({ rota, paradas });
  }, [fase, rota, paradas]);

  // ─── Sync das ACOES offline (concluir/encerrar) na fase em_rota ────
  // Enquanto o motorista esta na rota, mantemos um worker tentando reenviar as
  // baixas/encerramentos feitos offline. O evento `online` dispara na hora em
  // que a internet volta; o interval cobre sinal intermitente que nao dispara
  // o evento. Ao sair da fase, para tudo.
  useEffect(() => {
    if (fase !== 'em_rota') return;
    const parar = iniciarSyncAcoesWorker(8000);
    const aoVoltarOnline = () => {
      setOnline(true);
      void sincronizarAcoes();
    };
    window.addEventListener('online', aoVoltarOnline);
    return () => {
      parar();
      window.removeEventListener('online', aoVoltarOnline);
    };
  }, [fase, setOnline]);

  // ─── Auto-refresh ao voltar de outra tela (ex: ajuste-rota) ────────
  // Quando o motorista navega pra /mobile/ajuste-rota e volta (botao voltar
  // do browser ou troca de aba), a pagina restaura do cache com dados stale.
  // visibilitychange detecta o retorno e re-busca a rota do banco.
  useEffect(() => {
    if (fase !== 'em_rota' || !rota) return;
    const rotaId = rota.id;

    const handleVisibility = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const data = await fetchRota(rotaId);
        setRota(data.rota);
        setParadas(data.paradas);
      } catch {
        // Offline ou erro — ignora silenciosamente, dados stale melhor que nada
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    // pageshow com persisted=true cobre bfcache (Safari/iOS armazena a pagina
    // inteira e nao dispara visibilitychange ao voltar com swipe)
    const handlePageShow = (e: PageTransitionEvent) => {
      if (e.persisted) void handleVisibility();
    };
    window.addEventListener('pageshow', handlePageShow);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pageshow', handlePageShow as EventListener);
    };
  }, [fase, rota, setRota, setParadas]);
}
