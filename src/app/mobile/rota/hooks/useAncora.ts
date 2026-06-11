/**
 * Âncora do despacho — a rota em criação pertence a um pedido.
 * Persistida no aparelho (localStorage) pra sobreviver a refresh;
 * limpa em "Nova rota" e ao encerrar. Beta não tem âncora.
 */

import { useCallback, useEffect, useState } from 'react';

const ANCORA_KEY = 'frota_pedido_ancora';

export type PedidoAncora = { id: string; numero: string | null };

function lerAncora(): PedidoAncora | null {
  try {
    const raw = localStorage.getItem(ANCORA_KEY);
    return raw ? (JSON.parse(raw) as PedidoAncora) : null;
  } catch { return null; }
}

export function useAncora(motoristaId: string, beta: boolean) {
  const [pedidoAncora, setPedidoAncora] = useState<PedidoAncora | null>(null);

  // Restaura a âncora do despacho (sobrevive a refresh). Beta não tem âncora.
  useEffect(() => {
    if (!motoristaId || beta) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPedidoAncora(lerAncora());
  }, [motoristaId, beta]);

  /** Grava/limpa a âncora (estado + aparelho). */
  const definirAncora = useCallback((a: PedidoAncora | null) => {
    setPedidoAncora(a);
    try {
      if (a) localStorage.setItem(ANCORA_KEY, JSON.stringify(a));
      else localStorage.removeItem(ANCORA_KEY);
    } catch { /* localStorage indisponível */ }
  }, []);

  return { pedidoAncora, definirAncora };
}
