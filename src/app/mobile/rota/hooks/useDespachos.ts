/**
 * Despachos em aberto do motorista (cards da fase inicio) + abertura de rota
 * ancorada num pedido. Extraído de page.tsx SEM mudança de comportamento.
 *
 * Recarrega AUTOMATICAMENTE ao entrar na fase inicio e quando o app volta ao
 * foco — o card do despacho some sozinho quando o motorista cria a rota, SEM
 * F5 (regra do dono: usuário comum nunca atualiza página).
 */

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { adicionarNota, limparFila, listarTodas } from '@/lib/offline/fila';
import { sincronizarFila } from '@/lib/offline/sync';
import type { DespachoAberto } from '../components/DespachosAbertos';
import type { Fase } from '../types';
import type { NotaNaFila } from '@/lib/offline/types';
import type { RotaOtimizada } from '@/lib/routing/types';
import type { PedidoAncora } from './useAncora';

type Params = {
  motoristaId: string;
  empresaId: string;
  beta: boolean;
  fase: Fase;
  definirAncora: (a: PedidoAncora | null) => void;
  setNotas: (n: NotaNaFila[]) => void;
  setFase: (f: Fase) => void;
  setErro: (e: string | null) => void;
  setRotasHistorico: (r: RotaOtimizada[]) => void;
};

export function useDespachos({
  motoristaId, empresaId, beta, fase,
  definirAncora, setNotas, setFase, setErro, setRotasHistorico,
}: Params) {
  const [despachos, setDespachos] = useState<DespachoAberto[]>([]);
  const [abrindoDespacho, setAbrindoDespacho] = useState<string | null>(null);

  // Carrega os despachos em aberto (best-effort; offline fica vazio).
  const carregarDespachos = useCallback(async () => {
    if (!motoristaId || beta) return;
    try {
        const supabase = createClient();
        const { data: peds } = await supabase.from('pedidos')
          .select('id,numero,status,data_inicio_prevista,local_carregamento,entregas(id,destino,nome_cliente_avulso,clientes(nome_fantasia))')
          .eq('motorista_id', motoristaId)
          .not('status', 'in', '(concluida,concluido,cancelada,cancelado)')
          .order('data_inicio_prevista', { ascending: true })
          .limit(30);
        const lista = (peds ?? []) as Array<{
          id: string; numero: string | null; status: string;
          data_inicio_prevista: string | null; local_carregamento: string | null;
          entregas: Array<{ id: string; destino: string | null; nome_cliente_avulso: string | null; clientes: { nome_fantasia: string } | { nome_fantasia: string }[] | null }>;
        }>;
        const ids = lista.map((p) => p.id);
        // Pedido SAI da lista de cima quando o motorista JÁ COMEÇOU a rota dele:
        // (a) existe rota montada por ele (paradas vindas de notas), OU
        // (b) existem notas EM MONTAGEM vinculadas (capturou e saiu sem otimizar
        //     — o progresso fica guardado e vinculado; retoma por "Continuar
        //     captura", nunca pelo card, que zeraria a fila).
        // Rota PRÉ-CADASTRADA no painel (paradas de entregas) mantém o card com
        // o selo "rota pronta" pra ele puxar e ajustar. (decisão do dono 10/06)
        const comRotaPainel = new Set<string>();
        const iniciadoPeloMotorista = new Set<string>();
        if (ids.length > 0) {
          const [{ data: rts }, { data: notasVinc }] = await Promise.all([
            supabase.from('rotas_otimizadas')
              .select('id,pedido_id').in('pedido_id', ids).in('status', ['otimizada', 'em_andamento']),
            supabase.from('notas_capturadas')
              .select('pedido_id').in('pedido_id', ids).in('status', ['capturada', 'geocodificada']),
          ]);
          for (const n of (notasVinc ?? []) as Array<{ pedido_id: string | null }>) {
            if (n.pedido_id) iniciadoPeloMotorista.add(n.pedido_id);
          }
          const rotas = (rts ?? []) as Array<{ id: string; pedido_id: string | null }>;
          if (rotas.length > 0) {
            const { data: pars } = await supabase.from('paradas')
              .select('rota_id,nota_id').in('rota_id', rotas.map((r) => r.id));
            const rotasComNota = new Set(
              ((pars ?? []) as Array<{ rota_id: string; nota_id: string | null }>)
                .filter((p) => p.nota_id).map((p) => p.rota_id)
            );
            for (const r of rotas) {
              if (!r.pedido_id) continue;
              if (rotasComNota.has(r.id)) iniciadoPeloMotorista.add(r.pedido_id);
              else comRotaPainel.add(r.pedido_id);
            }
          }
        }
        const montados: DespachoAberto[] = lista
          .filter((p) => !iniciadoPeloMotorista.has(p.id))
          .map((p) => {
          const ents = Array.isArray(p.entregas) ? p.entregas : [];
          let cliente = 'Cliente não informado';
          for (const e of ents) {
            const cli = Array.isArray(e.clientes) ? e.clientes[0] : e.clientes;
            if (cli?.nome_fantasia) { cliente = cli.nome_fantasia; break; }
            if (e.nome_cliente_avulso?.trim()) cliente = e.nome_cliente_avulso.trim();
          }
          const dests = ents.map((e) => e.destino?.trim()).filter(Boolean);
          const destinos = `${ents.length} entrega${ents.length !== 1 ? 's' : ''}${dests.length > 0 ? ` · ${String(dests[0]).slice(0, 28)}${dests.length > 1 ? ` +${dests.length - 1}` : ''}` : ''}`;
          return {
            id: p.id,
            numero: p.numero ?? null,
            cliente,
            status: p.status,
            data_inicio_prevista: p.data_inicio_prevista,
            local_carregamento: p.local_carregamento,
            qtd_entregas: ents.length,
            destinos,
            tem_rota: comRotaPainel.has(p.id),
          };
        });
        setDespachos(montados);
      } catch { /* offline ou erro — lista de despachos fica vazia */ }
  }, [motoristaId, beta]);

  // Recarrega os despachos AUTOMATICAMENTE: ao entrar na fase inicio (inclusive
  // voltando de em_rota/captura) e quando o app volta ao foco nessa fase.
  useEffect(() => {
    if (fase !== 'inicio') return;
    const atualizarInicio = () => {
      void carregarDespachos();
      // histórico também — pra rota recém-criada já aparecer com o selo 📦
      if (motoristaId && empresaId) {
        fetch(`/api/routing/rotas?empresa_id=${empresaId}&motorista_id=${motoristaId}&limite=5`)
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => { if (d) setRotasHistorico(d.rotas ?? []); })
          .catch(() => {});
      }
    };
    atualizarInicio();
    const aoVoltarFoco = () => {
      if (document.visibilityState === 'visible') atualizarInicio();
    };
    document.addEventListener('visibilitychange', aoVoltarFoco);
    window.addEventListener('focus', aoVoltarFoco);
    return () => {
      document.removeEventListener('visibilitychange', aoVoltarFoco);
      window.removeEventListener('focus', aoVoltarFoco);
    };
  }, [fase, carregarDespachos, motoristaId, empresaId, setRotasHistorico]);

  /** "Abrir Rota Para Este Pedido": rota pré-cadastrada vira lista editável;
   *  sem rota, captura do zero — sempre ancorado no pedido. */
  const abrirRotaPedido = useCallback(async (d: DespachoAberto) => {
    setAbrindoDespacho(d.id);
    setErro(null);
    try {
      // mesma limpeza do "Nova rota": zera a fila local e as notas soltas no servidor
      await limparFila(motoristaId);
      await fetch('/api/routing/notas/limpar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motorista_id: motoristaId, empresa_id: empresaId }),
      }).catch(() => {});

      // Rota pré-cadastrada? Puxa as paradas EM ABERTO pra lista editável.
      try {
        const supabase = createClient();
        const { data: rotas } = await supabase.from('rotas_otimizadas')
          .select('id')
          .eq('pedido_id', d.id)
          .in('status', ['otimizada', 'em_andamento'])
          .order('criada_em', { ascending: false })
          .limit(1);
        const rotaPrev = (rotas ?? [])[0] as { id: string } | undefined;
        if (rotaPrev) {
          const { data: pars } = await supabase.from('paradas')
            .select('endereco,latitude,longitude,observacao,concluida_em')
            .eq('rota_id', rotaPrev.id)
            .order('ordem', { ascending: true });
          for (const par of ((pars ?? []) as Array<{ endereco: unknown; latitude: number | null; longitude: number | null; observacao: string | null; concluida_em: string | null }>).filter(p => !p.concluida_em)) {
            const end = (par.endereco ?? {}) as NotaNaFila['endereco'] & { cep?: string | null; numero?: string | null };
            await adicionarNota({
              id_local: crypto.randomUUID(),
              motorista_id: motoristaId,
              empresa_id: empresaId,
              pedido_id: d.id, // paradas puxadas da rota pré-cadastrada: vínculo gravado
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
        }
      } catch { /* sem rede ou sem rota — segue captura vazia */ }

      setNotas(await listarTodas(motoristaId));
      definirAncora({ id: d.id, numero: d.numero });
      setFase('captura');
    } finally {
      setAbrindoDespacho(null);
    }
  }, [motoristaId, empresaId, definirAncora, setNotas, setFase, setErro]);

  return { despachos, abrindoDespacho, abrirRotaPedido };
}
