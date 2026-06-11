/**
 * Carregamento inicial da tela de rota — decide a FASE baseado no estado.
 * Extraído de page.tsx SEM mudança de comportamento. Ordem de prioridade:
 *   1. ?continuar=<rotaId> (➕ do Ajuste): puxa paradas em aberto pra captura em lote;
 *   2. FAST PATH offline: restaura 'captura' se havia notas em progresso;
 *   3. histórico + deep-link ?abrir=<rotaId> + rota em andamento → inicio;
 *   4. offline: restaura captura local ou snapshot da rota ativa.
 */

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { adicionarNota, limparFila, listarTodas } from '@/lib/offline/fila';
import { sincronizarFila } from '@/lib/offline/sync';
import { lerRotaAtiva, lerUltimaRotaAtiva } from '@/lib/offline/rotaCache';
import { fetchRota } from '@/lib/routing/api';
import type { Fase } from '../types';
import type { NotaNaFila } from '@/lib/offline/types';
import type { Parada, RotaOtimizada } from '@/lib/routing/types';
import type { PedidoAncora } from './useAncora';

type Params = {
  motoristaId: string;
  empresaId: string;
  abrirId: string;
  continuarId: string;
  definirAncora: (a: PedidoAncora | null) => void;
  setFase: (f: Fase) => void;
  setNotas: (n: NotaNaFila[]) => void;
  setRota: (r: RotaOtimizada | null) => void;
  setParadas: (p: Parada[]) => void;
  setOnline: (o: boolean) => void;
  setToast: (t: string | null) => void;
  setErro: (e: string | null) => void;
  setRotasHistorico: (r: RotaOtimizada[]) => void;
};

export function useCarregamentoInicial({
  motoristaId, empresaId, abrirId, continuarId, definirAncora,
  setFase, setNotas, setRota, setParadas, setOnline, setToast, setErro, setRotasHistorico,
}: Params) {
  useEffect(() => {
    if (!motoristaId || !empresaId) {
      setFase('inicio');
      return;
    }
    (async () => {
      // CONTINUAR EM LOTE (?continuar=<rotaId>, vindo do ➕ do Ajuste): puxa as
      // paradas em aberto da rota pra fila editável e reabre a captura. Tem
      // prioridade sobre tudo — foi uma escolha explícita do motorista.
      if (continuarId) {
        try {
          await limparFila(motoristaId);
          await fetch('/api/routing/notas/limpar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ motorista_id: motoristaId, empresa_id: empresaId }),
          }).catch(() => {});

          const supabase = createClient();
          const { data: rotaCont } = await supabase.from('rotas_otimizadas')
            .select('id,pedido_id').eq('id', continuarId).maybeSingle();
          const pedidoIdCont = (rotaCont as { pedido_id?: string | null } | null)?.pedido_id ?? null;

          let numeroCont: string | null = null;
          if (pedidoIdCont) {
            const { data: ped } = await supabase.from('pedidos')
              .select('numero' as never).eq('id', pedidoIdCont).maybeSingle();
            numeroCont = (ped as { numero?: string | null } | null)?.numero ?? null;
          }

          const { data: parsCont } = await supabase.from('paradas')
            .select('endereco,latitude,longitude,observacao,concluida_em')
            .eq('rota_id', continuarId)
            .order('ordem', { ascending: true });
          for (const par of ((parsCont ?? []) as Array<{ endereco: unknown; latitude: number | null; longitude: number | null; observacao: string | null; concluida_em: string | null }>).filter(p => !p.concluida_em)) {
            const end = (par.endereco ?? {}) as NotaNaFila['endereco'] & { cep?: string | null; numero?: string | null };
            await adicionarNota({
              id_local: crypto.randomUUID(),
              motorista_id: motoristaId,
              empresa_id: empresaId,
              pedido_id: pedidoIdCont,
              cep: end?.cep ?? '',
              numero: end?.numero ?? '',
              endereco: end,
              latitude: par.latitude ?? null,
              longitude: par.longitude ?? null,
              observacao: par.observacao ?? null,
              status: 'capturada',
              capturado_em: new Date().toISOString(),
              status_sync: 'pendente',
              tentativas: 0,
            });
          }
          void sincronizarFila();
          setNotas(await listarTodas(motoristaId));
          definirAncora(pedidoIdCont ? { id: pedidoIdCont, numero: numeroCont } : null);
          // tira o ?continuar da URL: um refresh depois daqui NÃO pode re-puxar
          // (re-puxar limparia a fila e mataria as notas novas capturadas)
          try {
            const u = new URL(window.location.href);
            u.searchParams.delete('continuar');
            window.history.replaceState(null, '', u.toString());
          } catch { /* ignore */ }
          setFase('captura');
          return;
        } catch {
          // sem rede/erro — cai pro fluxo normal abaixo
        }
      }

      // FAST PATH: restaura captura se havia notas em progresso.
      // Roda ANTES de qualquer fetch — funciona offline e é instantâneo.
      // Garante que refresh, crash, ou troca de versão não perde o trabalho.
      // Exceção: deep-link ?abrir=<id> tem prioridade (veio do dashboard).
      if (!abrirId) {
        try {
          const faseSalva = localStorage.getItem('frota_fase');
          if (faseSalva === 'captura') {
            const notasLocais = await listarTodas(motoristaId);
            if (notasLocais.length > 0) {
              setNotas(notasLocais);
              const pendentes = notasLocais.filter((n) => n.status_sync === 'pendente').length;
              if (pendentes > 0) {
                void sincronizarFila();
              }
              setFase('captura');
              return;
            }
          }
        } catch { /* localStorage indisponível */ }
      }

      try {
        // 1. Busca ultimas rotas (historico para tela de inicio)
        const res = await fetch(
          `/api/routing/rotas?empresa_id=${empresaId}&motorista_id=${motoristaId}&limite=5`
        );
        const data = await res.json();
        const todasRotas: RotaOtimizada[] = data.rotas ?? [];
        setRotasHistorico(todasRotas);

        // Deep-link ?abrir=<rotaId>: abre direto essa rota (veio da lista da
        // tela do motorista). Se nao achar (404), cai pro fluxo normal abaixo.
        if (abrirId) {
          try {
            const rotaData = await fetchRota(abrirId);
            setRota(rotaData.rota);
            setParadas(rotaData.paradas);
            setFase('em_rota');
            return;
          } catch {
            // 404/erro da rota pedida — cai pro fluxo normal abaixo.
          }
        }

        // Verifica se ha rota em andamento automaticamente carregavel
        const rotaEmAndamento = todasRotas.find((r) =>
          ['otimizada', 'em_andamento'].includes(r.status)
        );

        if (rotaEmAndamento) {
          // Tem rota aberta — mas agora mostramos a tela de inicio com historico
          // para o motorista decidir se quer continuar ou criar nova.
          // (Antes carregava automaticamente — agora deixa o motorista escolher.)
          setFase('inicio');
          return;
        }

        // 2. Existem notas pendentes na fila local?
        const notasLocais = await listarTodas(motoristaId);
        setNotas(notasLocais);
        if (notasLocais.length > 0) {
          const pendentes = notasLocais.filter((n) => n.status_sync === 'pendente').length;
          if (pendentes > 0) {
            setToast(`⏳ ${pendentes} nota${pendentes > 1 ? 's' : ''} pendente${pendentes > 1 ? 's' : ''} — sincronizando…`);
            setTimeout(() => setToast(null), 5000);
            void sincronizarFila();
          }
          setFase('captura');
          return;
        }

        // 3. Nada pendente — fase inicial com historico
        setFase('inicio');
      } catch (err) {
        // Offline: tenta restaurar captura local antes de buscar cache de rota.
        // Se o motorista estava capturando e atualizou sem internet, as NFs
        // estao no IndexedDB — restaura direto pra 'captura'.
        try {
          const notasLocaisOffline = await listarTodas(motoristaId);
          if (notasLocaisOffline.length > 0) {
            setNotas(notasLocaisOffline);
            setToast('📴 Sem internet — suas notas estão seguras no aparelho.');
            setTimeout(() => setToast(null), 5000);
            setFase('captura');
            return;
          }
        } catch { /* Dexie error — segue pro fallback */ }

        // Offline / erro de rede: tenta retomar a rota guardada localmente pra o
        // motorista seguir navegando e exportando pro Google Maps sem internet.
        // Com deep-link, prioriza a rota pedida; senao, a ultima salva.
        const cache =
          (abrirId ? await lerRotaAtiva(abrirId) : null) ??
          (await lerUltimaRotaAtiva(motoristaId));
        if (cache) {
          setRota(cache.rota);
          setParadas(cache.paradas);
          setOnline(false);
          setToast('📴 Sem internet — usando a rota salva no aparelho.');
          setTimeout(() => setToast(null), 5000);
          setFase('em_rota');
          return;
        }
        setErro(`Falha ao carregar: ${(err as Error).message}`);
        setFase('inicio');
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [motoristaId, empresaId, abrirId, continuarId]);
}
