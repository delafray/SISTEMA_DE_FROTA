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
import { iniciarSyncWorker, sincronizarFila } from '@/lib/offline/sync';
import { iniciarOnlineDetector, estaOnline } from '@/lib/offline/onlineDetector';
import { salvarRotaAtiva, lerRotaAtiva, lerUltimaRotaAtiva } from '@/lib/offline/rotaCache';
import { enfileirarConcluirParada, enfileirarEncerrarRota } from '@/lib/offline/acoesRota';
import { iniciarSyncAcoesWorker, sincronizarAcoes } from '@/lib/offline/syncAcoes';
import { vibrar, lockOrientacaoRetrato } from '@/lib/mobile/dispositivo';
import { fetchRota } from '@/lib/routing/api';
import { containerStyle, erroStyle } from './styles';
import type { Fase } from './types';
import { Header } from './components/Header';
import { FaseInicio } from './components/FaseInicio';
import { FaseCaptura } from './components/FaseCaptura';
import { FaseEmRota } from './components/FaseEmRota';
import { ModalSairCaptura } from './components/ModalSairCaptura';
import { calcularDistanciaKm } from '@/lib/routing/geocoding';
import type { NotaNaFila } from '@/lib/offline/types';
import type { Parada, RotaOtimizada } from '@/lib/routing/types';

function RotaContent(): React.ReactElement {
  const searchParams = useSearchParams();
  const motoristaId = searchParams.get('motorista_id') ?? '';
  const empresaId = searchParams.get('empresa_id') ?? '';
  // Deep-link opcional: ?abrir=<rotaId> abre direto essa rota (veio da lista de
  // rotas na tela do motorista), pulando a tela de historico.
  const abrirId = searchParams.get('abrir') ?? '';
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
  // Uso do Google no mes (pra mostrar na captura: cache vs API + quanto falta
  // pro ViaCEP). Atualiza ao entrar na captura e a cada NF capturada.
  const [usoGoogle, setUsoGoogle] = useState<{ total: number; limite: number } | null>(null);
  // Modal de confirmacao ao apertar Voltar no meio da captura (evita descartar
  // 5-10 NFs sem querer). Ver handlePopState abaixo.
  const [confirmandoSaida, setConfirmandoSaida] = useState(false);
  const notasRef = useRef<NotaNaFila[]>(notas);

  useEffect(() => {
    notasRef.current = notas;
  }, [notas]);

  // Trava em retrato ao montar
  useEffect(() => {
    lockOrientacaoRetrato();
  }, []);

  // Persiste a fase no localStorage pra restaurar apos refresh/crash.
  // As NFs ficam seguras no IndexedDB (Dexie), mas o estado React se perde.
  // Este flag permite restaurar instantaneamente pra 'captura' sem API call.
  useEffect(() => {
    if (fase !== 'carregando') {
      try { localStorage.setItem('frota_fase', fase); } catch { /* ignore */ }
    }
  }, [fase]);

  // Contador de uso do Google — refaz a leitura a cada NF capturada, pro
  // motorista ver se a busca subiu o contador (API) ou nao (cache).
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
  }, [fase, notas.length]);

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

  // ─── Carregamento inicial: decide fase baseado no estado ──────────

  useEffect(() => {
    if (!motoristaId || !empresaId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFase('inicio');
      return;
    }
    (async () => {
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
  }, [motoristaId, empresaId, abrirId]);

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
  }, [fase]);

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
  }, [fase, rota]);

  // ─── Workers de sync + online detector na fase captura ────────────

  useEffect(() => {
    if (fase !== 'captura' || !motoristaId) return;

    const stopWorker = iniciarSyncWorker(5000);
    const stopDetector = iniciarOnlineDetector();
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
  }, [fase, motoristaId]);

  // ─── Interceptar botão Voltar do celular (Hardware Back Button) ────
  useEffect(() => {
    const handlePopState = () => {
      // Durante a captura com notas, o Voltar NAO descarta direto: re-empilha
      // #captura (pra a pagina nao sair de fato) e abre o modal de confirmacao.
      // Sem isso, um toque sem querer no Voltar jogava o motorista pra tela
      // inicial e perdia as 5-10 NFs ja capturadas.
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
  }, [fase]);

  // ─── Handlers ──────────────────────────────────────────────────────

  const iniciarCaptura = useCallback(async () => {
    setErro(null);
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
  }, [motoristaId, empresaId]);

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
  }, [motoristaId, empresaId]);

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
    [motoristaId, empresaId]
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
  }, [motoristaId, empresaId]);

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

  const handleEncerrarRota = useCallback(async () => {
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
  }, [empresaId, motoristaId, rota, paradas]);

  // ─── Calculo dinamico de distancias ────────────────────────────────
  const statsDinamicos = useMemo(() => {
    if (fase !== 'em_rota' || !posicaoAtual || paradas.length === 0) return null;
    const pendentes = paradas.filter(p => !p.concluida_em).sort((a,b) => a.ordem - b.ordem);
    if (pendentes.length === 0) return null; // tudo entregue

    const fator = 1.35; // Fator para estimar ruas reais a partir de linha reta
    const minPerKm = 3; // ~20km/h media urbana

    const proxima = pendentes[0];
    const distProxima = calcularDistanciaKm(posicaoAtual.lat, posicaoAtual.lng, proxima.latitude, proxima.longitude) * fator;

    let distFaltam = distProxima;
    for (let i = 0; i < pendentes.length - 1; i++) {
      distFaltam += calcularDistanciaKm(
        pendentes[i].latitude, pendentes[i].longitude,
        pendentes[i+1].latitude, pendentes[i+1].longitude
      ) * fator;
    }

    return {
      proxKm: distProxima,
      proxMin: Math.round(distProxima * minPerKm),
      faltamKm: distFaltam,
      faltamMin: Math.round(distFaltam * minPerKm),
    };
  }, [fase, posicaoAtual, paradas]);

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
      <Header fase={fase} online={online} numCapturadas={notas.length} numParadas={paradas.length} numConcluidas={paradas.filter(p => p.concluida_em).length} statsDinamicos={statsDinamicos} usoGoogle={usoGoogle} />


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
      )}

      {fase === 'captura' && (
        <FaseCaptura
          notas={notas}
          totalEsperado={totalEsperado}
          onCapturar={handleCapturar}
          onOtimizar={handleOtimizar}
          onDesfazerUltima={handleDesfazerUltima}
          onEditar={handleEditar}
        />
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





