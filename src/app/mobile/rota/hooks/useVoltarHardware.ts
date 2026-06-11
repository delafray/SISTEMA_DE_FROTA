/**
 * Botão Voltar do celular (Hardware Back) — extraído de page.tsx SEM mudança
 * de comportamento. Durante a captura com notas, o Voltar NÃO descarta direto:
 * re-empilha #captura e abre o modal de confirmação. Sem isso, um toque sem
 * querer jogava o motorista pra tela inicial e perdia as 5-10 NFs capturadas.
 */

import { useEffect, type MutableRefObject } from 'react';
import type { Fase } from '../types';
import type { NotaNaFila } from '@/lib/offline/types';

type Params = {
  fase: Fase;
  notasRef: MutableRefObject<NotaNaFila[]>;
  setFase: (f: Fase) => void;
  setConfirmandoSaida: (v: boolean) => void;
};

export function useVoltarHardware({ fase, notasRef, setFase, setConfirmandoSaida }: Params) {
  useEffect(() => {
    const handlePopState = () => {
      if (fase === 'captura' && notasRef.current.length > 0) {
        window.history.pushState(null, '', '#captura');
        setConfirmandoSaida(true);
        return;
      }
      const hash = window.location.hash.replace('#', '');
      if (!hash) {
        setFase('inicio');
      } else if (['captura', 'otimizando', 'em_rota'].includes(hash)) {
        setFase(hash as Fase);
      }
    };

    if (fase !== 'carregando') {
      const currentHash = window.location.hash.replace('#', '');
      if (fase === 'inicio' && currentHash) {
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      } else if (fase !== 'inicio' && currentHash !== fase) {
        if (currentHash) {
          window.history.replaceState(null, '', `#${fase}`);
        } else {
          window.history.pushState(null, '', `#${fase}`);
        }
      }
    }

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [fase, notasRef, setFase, setConfirmandoSaida]);
}
