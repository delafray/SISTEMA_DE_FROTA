'use client';

/**
 * Tela unificada de Roteirização — mobile.
 *
 * Hub do motorista. Orquestra todas as fases num lugar so:
 *   inicio → captura → otimizando → em_rota
 *
 * Substitui ter que navegar entre /mobile/captura-notas, /mobile/ajuste-rota
 * separadamente. Tudo numa tela com state machine.
 *
 * Params URL:
 *   ?motorista_id=<UUID>&empresa_id=<UUID>
 *
 * Referencia: PLANO_ROTEIRIZACAO.md (consolidado dos passos 1.4 + 1.10 + 1.12 + 1.13).
 */

import { useCallback, useEffect, useMemo, useRef, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { type NotaCapturadaInput } from '@/components/mobile/InputEnderecoNF';
import {
  adicionarNota,
  contarPorStatus,
  editarNota,
  limparFila,
  listarTodas,
  remover,
} from '@/lib/offline/fila';
import { sincronizarFila } from '@/lib/offline/sync';
import { salvarRotaAtiva, lerRotaAtiva } from '@/lib/offline/rotaCache';
import { enfileirarConcluirParada, enfileirarEncerrarRota } from '@/lib/offline/acoesRota';
import { sincronizarAcoes } from '@/lib/offline/syncAcoes';
import { vibrar, lockOrientacaoRetrato } from '@/lib/mobile/dispositivo';
import { carregarVeiculoAtivo, type VeiculoAtivo } from '@/lib/mobile/veiculoAtivo';
import { createClient } from '@/lib/supabase/client';
import { rotuloPedido } from '@/lib/utils/numeroPedido';
import { DespachosAbertos } from './components/DespachosAbertos';
import { fetchRota } from '@/lib/routing/api';
import { containerStyle, erroStyle } from './styles';
import { useAncora } from './hooks/useAncora';
import { useDespachos } from './hooks/useDespachos';
import { useCarregamentoInicial } from './hooks/useCarregamentoInicial';
import { useFaseEmRotaSync } from './hooks/useFaseEmRotaSync';
import { useCapturaWorkers } from './hooks/useCapturaWorkers';
import { useVoltarHardware } from './hooks/useVoltarHardware';
import { calcularStatsRota } from '@/lib/routing/statsRota';
import type { Fase } from './types';
import { Header } from './components/Header';
import { FaseInicio } from './components/FaseInicio';
import { FaseCaptura } from './components/FaseCaptura';
import { FaseEmRota } from './components/FaseEmRota';
import { ModalSairCaptura } from './components/ModalSairCaptura';
import type { NotaNaFila } from '@/lib/offline/types';
import type { Parada, RotaOtimizada } from '@/lib/routing/types';

function RotaContent(): React.ReactElement {
  const searchParams = useSearchParams();
  const motoristaId = searchParams.get('motorista_id') ?? '';
  const empresaId = searchParams.get('empresa_id') ?? '';
  // 🧪 Beta teste rota: testador externo — comportamento STANDALONE (como era
  // antes do vínculo com despacho): sem lista de despachos, sem âncora de
  // pedido, sem caminhão no header. motorista_id aqui é o usuario_id dele.
  const beta = searchParams.get('beta') === '1';
  // Deep-link opcional: ?abrir=<rotaId> abre direto essa rota (veio da lista de
  // rotas na tela do motorista), pulando a tela de historico.
  const abrirId = searchParams.get('abrir') ?? '';
  // ?continuar=<rotaId> (vem do ➕ do Ajuste de Rota): puxa as paradas em aberto
  // da rota pra lista EDITÁVEL e reabre a captura em lote — pro motorista que
  // parou na 25ª de 70 notas seguir lançando no fluxo normal.
  const continuarId = searchParams.get('continuar') ?? '';
  // Total opcional via ?total=N. Se nao vier, header mostra so "NF X" (motorista
  // nao precisa saber/declarar o total — pode ser 5 ou 70).
  const totalParam = Number(searchParams.get('total'));
  const totalEsperado: number | undefined = totalParam > 0 ? totalParam : undefined;

  const [fase, setFase] = useState<Fase>('carregando');
  const [notas, setNotas] = useState<NotaNaFila[]>([]);
  const [rota, setRota] = useState<RotaOtimizada | null>(null);
  const [paradas, setParadas] = useState<Parada[]>([]);
  const [online, setOnline] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [progressoOtim, setProgressoOtim] = useState<string>('');
  const [paradaSelecionada, setParadaSelecionada] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [posicaoAtual, setPosicaoAtual] = useState<{ lat: number; lng: number } | null>(null);
  // NFs que a otimizacao nao conseguiu incluir (geocoding falhou ou VROOM
  // nao encaixou) — antes eram dropadas silenciosamente, motorista capturava
  // 10 e via 5 no mapa. Agora avisamos no topo da fase em_rota.
  const [naoAtendidas, setNaoAtendidas] = useState<
    Array<{ id: string; motivo: string; endereco: { logradouro?: string; cidade?: string; uf?: string } | null; numero: string | null; cep: string | null }>
  >([]);
  // Historico de rotas para mostrar na tela de inicio
  const [rotasHistorico, setRotasHistorico] = useState<RotaOtimizada[]>([]);
  // Caminhao da alocacao ativa do motorista (apelido/modelo/placa/km) — mostrado
  // no header em todas as fases. Offline cai pro snapshot salvo no aparelho.
  const [veiculo, setVeiculo] = useState<VeiculoAtivo | null>(null);
  // Modal de confirmacao ao apertar Voltar no meio da captura (evita descartar
  // 5-10 NFs sem querer). Ver useVoltarHardware.
  const [confirmandoSaida, setConfirmandoSaida] = useState(false);
  const notasRef = useRef<NotaNaFila[]>(notas);

  // Âncora do despacho + despachos em aberto + decisão da fase inicial +
  // efeitos de sync por fase — extraídos pra hooks/ (comportamento idêntico).
  const { pedidoAncora, definirAncora } = useAncora(motoristaId, beta);
  const { despachos, abrindoDespacho, abrirRotaPedido } = useDespachos({
    motoristaId, empresaId, beta, fase,
    definirAncora, setNotas, setFase, setErro, setRotasHistorico,
  });
  useCarregamentoInicial({
    motoristaId, empresaId, abrirId, continuarId, definirAncora,
    setFase, setNotas, setRota, setParadas, setOnline, setToast, setErro, setRotasHistorico,
  });
  useFaseEmRotaSync({ fase, rota, paradas, setRota, setParadas, setOnline });
  const { usoGoogle } = useCapturaWorkers({ fase, motoristaId, numNotas: notas.length, setNotas, setOnline });
  useVoltarHardware({ fase, notasRef, setFase, setConfirmandoSaida });

  useEffect(() => {
    notasRef.current = notas;
  }, [notas]);

  // Trava em retrato ao montar
  useEffect(() => {
    lockOrientacaoRetrato();
  }, []);

  // Carrega o caminhao do motorista (best-effort, nao bloqueia a tela).
  // Beta nao tem caminhao — nem tenta.
  useEffect(() => {
    if (!motoristaId || beta) return;
    let cancelado = false;
    carregarVeiculoAtivo(motoristaId)
      .then((v) => { if (!cancelado) setVeiculo(v); })
      .catch(() => {});
    return () => {
      cancelado = true;
    };
  }, [motoristaId, beta]);

  // Persiste a fase no localStorage pra restaurar apos refresh/crash.
  // As NFs ficam seguras no IndexedDB (Dexie), mas o estado React se perde.
  // Este flag permite restaurar instantaneamente pra 'captura' sem API call.
  useEffect(() => {
    if (fase !== 'carregando') {
      try { localStorage.setItem('frota_fase', fase); } catch { /* ignore */ }
    }
  }, [fase]);

  // Watch posicao do motorista durante "em_rota" — atualiza marcador no mapa
  // conforme ele se desloca. Para o watch ao sair da fase pra economizar
  // bateria e GPS.
  useEffect(() => {
    if (fase !== 'em_rota') return;
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => setPosicaoAtual({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => { /* GPS off ou negado — ignora silenciosamente */ },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [fase]);

  // ─── Handlers ──────────────────────────────────────────────────────

  const iniciarCaptura = useCallback(async () => {
    setErro(null);
    definirAncora(null); // "Nova rota" livre — sem vínculo com despacho
    if (motoristaId) {
      try {
        // 1. Limpa a fila offline local
        await limparFila(motoristaId);
        setNotas([]);

        // 2. Limpa as notas no banco de dados para evitar acumular lixo
        await fetch('/api/routing/notas/limpar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ motorista_id: motoristaId, empresa_id: empresaId }),
        });
      } catch (err) {
        console.error('Falha ao limpar notas antigas:', err);
      }
    }
    setFase('captura');
  }, [motoristaId, empresaId, definirAncora]);

  // ─── Saida da captura via Voltar (modal salvar/descartar/continuar) ──

  // Continua capturando — fecha o modal e fica na captura (caso comum: Voltar
  // foi sem querer).
  const continuarCapturando = useCallback(() => {
    setConfirmandoSaida(false);
  }, []);

  // Salva e volta depois — mantem as NFs na fila (Dexie + sync ja persistem) e
  // so vai pra tela inicial. La aparece "Continuar captura (N)" pra retomar.
  const salvarESair = useCallback(() => {
    setConfirmandoSaida(false);
    setFase('inicio');
  }, []);

  // Descarta tudo — apaga a fila local e as notas no banco (mesma limpeza do
  // "Nova rota"), depois volta pra tela inicial.
  const descartarESair = useCallback(async () => {
    setConfirmandoSaida(false);
    definirAncora(null);
    if (motoristaId) {
      try {
        await limparFila(motoristaId);
        await fetch('/api/routing/notas/limpar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ motorista_id: motoristaId, empresa_id: empresaId }),
        });
      } catch (err) {
        console.error('Falha ao descartar notas:', err);
      }
    }
    setNotas([]);
    setFase('inicio');
  }, [motoristaId, empresaId, definirAncora]);

  // Retoma a captura a partir da tela inicial SEM limpar a fila (diferente do
  // "Nova rota", que zera tudo). Usado pelo botao "Continuar captura (N)".
  const retomarCaptura = useCallback(() => {
    setFase('captura');
  }, []);

  // Carrega uma rota existente do historico e vai direto pra fase em_rota
  const handleCarregarRota = useCallback(async (rotaId: string) => {
    setErro(null);
    try {
      const rotaData = await fetchRota(rotaId);
      setRota(rotaData.rota);
      setParadas(rotaData.paradas);
      setFase('em_rota');
    } catch (err) {
      // Sem internet: tenta o snapshot local desta rota.
      const cache = await lerRotaAtiva(rotaId);
      if (cache) {
        setRota(cache.rota);
        setParadas(cache.paradas);
        setOnline(false);
        setToast('📴 Sem internet — usando a rota salva no aparelho.');
        setTimeout(() => setToast(null), 5000);
        setFase('em_rota');
        return;
      }
      setErro(`Erro ao carregar rota: ${(err as Error).message}`);
    }
  }, []);

  /** Remove uma nota específica da lista (decisão do dono: ao puxar rota
   *  pré-cadastrada, o motorista pode EXCLUIR itens antes de re-roteirizar). */
  const handleRemoverNota = useCallback(async (idLocal: string) => {
    const nota = notas.find((n) => n.id_local === idLocal);
    await remover(idLocal);
    // se já sincronizou, apaga também no servidor (senão o otimizar a incluiria)
    if (nota?.id_servidor) {
      try {
        await createClient().from('notas_capturadas').delete().eq('id', nota.id_servidor);
      } catch { /* best-effort — limpar do servidor falhou, segue */ }
    }
    vibrar([30]);
    setNotas(await listarTodas(motoristaId));
  }, [notas, motoristaId]);

  const handleDesfazerUltima = useCallback(async () => {
    // Pega a ultima nota capturada (mais recente) e remove da fila local
    if (notas.length === 0) return;
    const ordenadas = [...notas].sort((a, b) => b.capturado_em.localeCompare(a.capturado_em));
    const ultima = ordenadas[0];
    await remover(ultima.id_local);
    vibrar([30, 20, 30]);
    const todas = await listarTodas(motoristaId);
    setNotas(todas);
  }, [notas, motoristaId]);

  const handleCapturar = useCallback(
    async (input: NotaCapturadaInput) => {
      const nota: NotaNaFila = {
        id_local: crypto.randomUUID(),
        motorista_id: motoristaId,
        empresa_id: empresaId,
        // cada destino capturado numa rota ancorada já nasce apontando pro pedido
        pedido_id: pedidoAncora?.id ?? null,
        cep: input.cep,
        numero: input.numero,
        endereco: input.endereco,
        latitude: null,
        longitude: null,
        observacao: input.observacao ?? null,
        status: 'capturada',
        capturado_em: new Date().toISOString(),
        status_sync: 'pendente',
        tentativas: 0,
      };
      await adicionarNota(nota);
      void sincronizarFila();
      const todas = await listarTodas(motoristaId);
      setNotas(todas);
    },
    [motoristaId, empresaId, pedidoAncora]
  );

  const handleEditar = useCallback(
    async (idLocal: string, input: NotaCapturadaInput) => {
      await editarNota(idLocal, {
        cep: input.cep,
        numero: input.numero,
        endereco: input.endereco,
        observacao: input.observacao,
      });
      void sincronizarFila();
      if (motoristaId) {
        const todas = await listarTodas(motoristaId);
        setNotas(todas);
      }
    },
    [motoristaId]
  );

  const handleOtimizar = useCallback(async () => {
    setErro(null);
    setProgressoOtim('Aguardando sincronização das notas pendentes...');

    // Espera 3s pra sync rolar (ou pula se ja tudo sincronizado)
    const counts = await contarPorStatus();
    if (counts.pendente > 0) {
      void sincronizarFila();
      await new Promise((r) => setTimeout(r, 3000));
    }

    // Pega geolocalização pra origem
    setProgressoOtim('Pegando sua localização atual...');
    let origem: { lat: number; lng: number } | null = null;
    if (navigator.geolocation) {
      origem = await new Promise<{ lat: number; lng: number } | null>((resolve) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
          () => resolve(null),
          { timeout: 8000, enableHighAccuracy: false }
        );
      });
    }
    if (!origem) {
      setErro('Não consegui pegar sua localização. Ative o GPS e tente de novo.');
      setProgressoOtim('');
      return;
    }

    setFase('otimizando');
    setProgressoOtim('Geocodificando endereços e otimizando rota (pode demorar)…');

    try {
      const res = await fetch('/api/routing/otimizar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          motorista_id: motoristaId,
          empresa_id: empresaId,
          origem,
          // âncora do despacho: a rota nasce vinculada ao pedido escolhido
          // (beta é standalone — nunca ancora)
          ancorar_pedido_id: beta ? undefined : pedidoAncora?.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErro(`Otimização falhou: ${data.error ?? res.status}`);
        setFase('captura');
        return;
      }

      // Guarda lista de NFs nao incluidas (geocoding fail OU vroom excluiu)
      // pra exibir aviso destacado na fase em_rota.
      setNaoAtendidas(data.nao_atendidas_detalhe ?? []);

      // Carrega rota recém criada
      const rotaData = await fetchRota(data.rota_id);
      setRota(rotaData.rota);
      setParadas(rotaData.paradas);
      // Limpa notas capturadas da fila local — foram consumidas pela otimização.
      // Sem isso, um refresh posterior restauraria falsamente a fase 'captura'.
      if (motoristaId) await limparFila(motoristaId);
      setNotas([]);
      setFase('em_rota');
    } catch (err) {
      setErro(`Erro: ${(err as Error).message}`);
      setFase('captura');
    } finally {
      setProgressoOtim('');
    }
  }, [motoristaId, empresaId, pedidoAncora, beta]);

  const handleConcluirParada = useCallback(
    async (paradaId: string, aprenderPonto = false) => {
      const agora = new Date().toISOString();
      // Optimistic update — UI marca instantaneamente
      setParadas((arr) => arr.map((p) => (p.id === paradaId ? { ...p, concluida_em: agora } : p)));

      if (!rota) return;
      try {
        const res = await fetch(`/api/routing/rota/${rota.id}/paradas`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            paradas: [{ id: paradaId, concluida_em: agora }],
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.ok === false) {
          // Reverte UI — backend nao salvou. Motorista precisa saber.
          setParadas((arr) =>
            arr.map((p) => (p.id === paradaId ? { ...p, concluida_em: null } : p))
          );
          setErro(`Nao consegui salvar entrega: ${data.erros?.[0]?.message ?? res.status}`);
          setTimeout(() => setErro(null), 5000);
        } else if (aprenderPonto) {
          // Aprendizado DELIBERADO: so quando o motorista toca "marcar este
          // ponto como endereco correto" no modal de baixa. Grava o GPS atual
          // como coord aprendida — prioridade maxima no resolverCoordenada,
          // sobrepoe Google/ViaCEP. SEM checar distancia: e acao consciente.
          // (O aprendizado AUTOMATICO por proximidade foi removido porque o
          // motorista costuma dar baixa ja dirigindo, gravando ponto errado.)
          const parada = paradas.find((p) => p.id === paradaId);
          if (posicaoAtual && parada && empresaId) {
            void fetch('/api/routing/coord-aprendida', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                empresa_id: empresaId,
                endereco: {
                  logradouro: parada.endereco.logradouro,
                  numero: parada.endereco.numero,
                  cidade: parada.endereco.cidade,
                  uf: parada.endereco.uf,
                },
                lat: posicaoAtual.lat,
                lng: posicaoAtual.lng,
              }),
            }).catch(() => {
              /* aprender e best-effort */
            });
          }
        }
      } catch (err) {
        // Erro de REDE (offline) — NAO reverte. Enfileira a baixa pra reenviar
        // quando a internet voltar; a UI segue marcada e o snapshot local ja
        // guarda o concluida_em (effect salvarRotaAtiva). Antes isso era perdido.
        await enfileirarConcluirParada({ rota_id: rota.id, parada_id: paradaId, concluida_em: agora });
        void sincronizarAcoes(); // best-effort: talvez tenha sido so um blip
        setOnline(false);
        setToast('📴 Sem internet — baixa salva no aparelho, sincroniza quando voltar.');
        setTimeout(() => setToast(null), 5000);
        void err; // erro de rede esperado offline — nao mostra alerta vermelho
      }
    },
    [rota, paradas, posicaoAtual, empresaId]
  );

  const handleEncerrarRota = useCallback(async (motivo?: string) => {
    // Encerrou com entregas pendentes → avisa o gestor no painel (lembrete com
    // Realtime), com o nº do pedido quando a rota está ancorada. Best-effort.
    if (motivo && rota) {
      try {
        const pendentes = paradas.filter((p) => !p.concluida_em).length;
        const ref = pedidoAncora
          ? `do pedido ${rotuloPedido(pedidoAncora.numero, pedidoAncora.id)}`
          : 'de rota avulsa';
        await createClient().from('lembretes').insert({
          texto: `🏁 Motorista encerrou a rota ${ref} com ${pendentes} entrega${pendentes > 1 ? 's' : ''} pendente${pendentes > 1 ? 's' : ''} — motivo: ${motivo}`,
          origem: 'app_motorista',
          empresa_id: empresaId || null,
        });
      } catch { /* sem rede — o encerramento segue; aviso é best-effort */ }
    }
    if (rota) {
      // fetch() NAO rejeita em HTTP 500/404 — so em erro de rede. Antes
      // o catch ignorava silenciosamente erros do servidor: motorista
      // clicava "Encerrar", frontend resetava o estado, mas a rota
      // continuava 'otimizada' no banco — voltava vermelha na lista.
      try {
        const res = await fetch(`/api/routing/rota/${rota.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'concluida' }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setErro(
            `Nao foi possivel marcar rota como concluida (HTTP ${res.status}). ${data.error ?? ''} ${data.details ?? ''}`
          );
          // NAO reseta estado — motorista fica na fase em_rota e pode tentar de novo
          return;
        }
      } catch (err) {
        // Erro de REDE (offline) — enfileira o encerramento e segue otimista:
        // vai pra tela inicial e ressincroniza quando a internet voltar. Antes
        // ficava travado em em_rota e a rota nunca era marcada como concluida.
        await enfileirarEncerrarRota({ rota_id: rota.id });
        void sincronizarAcoes();
        // Atualiza o snapshot local pra a lista offline ja mostrar "concluida".
        await salvarRotaAtiva({ rota: { ...rota, status: 'concluida' }, paradas });
        setToast('📴 Sem internet — rota encerrada no aparelho, sincroniza quando voltar.');
        setTimeout(() => setToast(null), 5000);
        void err; // erro de rede esperado offline — segue pro cleanup abaixo
      }
    }
    setRota(null);
    setParadas([]);
    definirAncora(null); // rota encerrada — solta o vínculo com o despacho
    // Limpa notas da fila local pra nao restaurar falsamente 'captura' no proximo refresh.
    if (motoristaId) await limparFila(motoristaId);
    setNotas([]);
    // Atualiza o historico ao encerrar pra refletir mudancas de status
    try {
      const res = await fetch(
        `/api/routing/rotas?empresa_id=${empresaId}&motorista_id=${motoristaId}&limite=5`
      );
      const data = await res.json();
      setRotasHistorico(data.rotas ?? []);
    } catch {
      // Ignora erro — historico vai estar levemente desatualizado mas nao critico
    }
    setFase('inicio');
  }, [empresaId, motoristaId, rota, paradas, definirAncora, pedidoAncora]);

  // ─── Calculo dinamico de distancias (função pura em lib/routing/statsRota) ──
  const statsDinamicos = useMemo(
    () => (fase === 'em_rota' ? calcularStatsRota(posicaoAtual, paradas) : null),
    [fase, posicaoAtual, paradas]
  );

  // ─── Validacao de params ──────────────────────────────────────────
  if (!motoristaId || !empresaId) {
    return (
      <div style={containerStyle}>
        <div role="alert" style={erroStyle}>
          ⚠️ <strong>Parametros faltando.</strong>
          <br />
          URL precisa ter <code>?motorista_id=...&empresa_id=...</code>.
        </div>
      </div>
    );
  }

  // ─── Renderizacao por fase ─────────────────────────────────────────

  return (
    <div style={containerStyle}>
      <Header fase={fase} online={online} numCapturadas={notas.length} numParadas={paradas.length} numConcluidas={paradas.filter(p => p.concluida_em).length} statsDinamicos={statsDinamicos} usoGoogle={usoGoogle} veiculo={veiculo} />


      {toast && (
        <div
          role="status"
          data-testid="toast"
          style={{
            position: 'fixed',
            top: 16,
            left: 16,
            right: 16,
            maxWidth: 448,
            margin: '0 auto',
            padding: 12,
            background: '#fef3c7',
            color: '#92400e',
            border: '1px solid #fcd34d',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            zIndex: 50,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            animation: 'slideDown 250ms ease',
          }}
        >
          {toast}
        </div>
      )}

      {erro && (
        <div role="alert" style={erroStyle}>
          {erro}
        </div>
      )}

      {confirmandoSaida && (
        <ModalSairCaptura
          quantidade={notas.length}
          onContinuar={continuarCapturando}
          onSalvar={salvarESair}
          onDescartar={descartarESair}
        />
      )}

      {fase === 'carregando' && <div style={{ padding: 24, textAlign: 'center' }}>Carregando…</div>}

      {fase === 'inicio' && (
        <>
        {!beta && (
          <DespachosAbertos
            despachos={despachos}
            abrindo={abrindoDespacho}
            onAbrirRota={abrirRotaPedido}
          />
        )}
        <FaseInicio
          onIniciar={iniciarCaptura}
          onCarregarRota={handleCarregarRota}
          rotasHistorico={rotasHistorico}
          notasPendentes={notas.length}
          onContinuarCaptura={retomarCaptura}
          onRefetchHistorico={async () => {
            try {
              const res = await fetch(
                `/api/routing/rotas?empresa_id=${empresaId}&motorista_id=${motoristaId}&limite=5`
              );
              const data = await res.json();
              setRotasHistorico(data.rotas ?? []);
            } catch {
              /* ignora */
            }
          }}
        />
        </>
      )}

      {fase === 'captura' && (
        <>
        {pedidoAncora && (
          <div
            data-testid="banner-ancora"
            style={{ margin: '8px 0', padding: '8px 12px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, fontSize: 13, fontWeight: 700, color: '#1e40af' }}
          >
            📦 Rota do pedido {rotuloPedido(pedidoAncora.numero, pedidoAncora.id)} — ajuste a lista e finalize.
          </div>
        )}
        <FaseCaptura
          notas={notas}
          totalEsperado={totalEsperado}
          onCapturar={handleCapturar}
          onOtimizar={handleOtimizar}
          onDesfazerUltima={handleDesfazerUltima}
          onEditar={handleEditar}
          onRemover={handleRemoverNota}
        />
        </>
      )}

      {fase === 'otimizando' && (
        <div role="status" style={{ padding: 32, textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
          <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 8 }}>Otimizando rota…</div>
          <div style={{ fontSize: 13, color: '#64748b' }}>{progressoOtim}</div>
        </div>
      )}

      {fase === 'em_rota' && rota && (
        <>
          {naoAtendidas.length > 0 && (
            <section
              data-testid="aviso-nao-atendidas"
              role="alert"
              style={{
                marginBottom: 12,
                padding: 12,
                background: '#fef3c7',
                border: '2px solid #f59e0b',
                borderRadius: 8,
              }}
            >
              <div style={{ fontWeight: 700, color: '#92400e', marginBottom: 6, fontSize: 14 }}>
                ⚠️ {naoAtendidas.length} NF{naoAtendidas.length > 1 ? 's' : ''} NÃO incluída{naoAtendidas.length > 1 ? 's' : ''} na rota
              </div>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: 12, color: '#78350f' }}>
                {naoAtendidas.map((n) => (
                  <li key={n.id} style={{ padding: '4px 0', borderTop: '1px solid #fcd34d' }}>
                    <div style={{ fontWeight: 600 }}>
                      📍 {n.endereco?.logradouro ?? '(sem rua)'}
                      {n.numero ? `, ${n.numero}` : ''}
                      {n.cep ? ` — CEP ${n.cep}` : ''}
                    </div>
                    <div style={{ fontSize: 11, opacity: 0.85 }}>
                      Motivo: {n.motivo === 'geocoding_falhou'
                        ? 'endereço não encontrado pelo GPS — confira logradouro/CEP'
                        : 'algoritmo não conseguiu encaixar na rota — horário/distância'}
                    </div>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => setNaoAtendidas([])}
                style={{
                  marginTop: 8,
                  padding: '6px 12px',
                  background: '#f59e0b',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Entendi, dispensar
              </button>
            </section>
          )}
          <FaseEmRota
            rota={rota}
            paradas={paradas}
            paradaSelecionada={paradaSelecionada}
            onSelectParada={setParadaSelecionada}
            onConcluirParada={handleConcluirParada}
            onEncerrar={handleEncerrarRota}
            posicaoAtual={posicaoAtual}
          />
        </>
      )}
    </div>
  );
}

export default function RotaPage(): React.ReactElement {
  return (
    <Suspense fallback={<div style={containerStyle}>Carregando…</div>}>
      <RotaContent />
    </Suspense>
  );
}

// ─── HEADER ────────────────────────────────────────────────────────





