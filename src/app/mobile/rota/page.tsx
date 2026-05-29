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

import { useCallback, useEffect, useMemo, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { InputEnderecoNF, type NotaCapturadaInput } from '@/components/mobile/InputEnderecoNF';
import { MapaRota } from '@/components/MapaRota';
import {
  adicionarNota,
  contarPorStatus,
  editarNota,
  listarTodas,
  remover,
} from '@/lib/offline/fila';
import { iniciarSyncWorker, sincronizarFila } from '@/lib/offline/sync';
import { iniciarOnlineDetector, estaOnline } from '@/lib/offline/onlineDetector';
import { waze, googleMaps } from '@/lib/routing/deepLinks';
import { statusDaParada } from '@/lib/routing/utils';
import type { NotaNaFila } from '@/lib/offline/types';
import type { Parada, RotaOtimizada } from '@/lib/routing/types';

const PERCENT_SYNC_MIN = 0.9; // 90% sincronizadas pra liberar Finalizar

function vibrar(p: number | number[]) {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    navigator.vibrate(p);
  }
}

// Trava orientacao em retrato quando possivel (Android Chrome suporta; iOS ignora silenciosamente).
function lockOrientacaoRetrato() {
  if (typeof window === 'undefined') return;
  type ScreenOrientationLock = ScreenOrientation & { lock?: (o: string) => Promise<void> };
  const so = screen.orientation as ScreenOrientationLock | undefined;
  if (so && typeof so.lock === 'function') {
    so.lock('portrait').catch(() => { /* iOS / browser sem permissao — ok */ });
  }
}

type Fase = 'carregando' | 'inicio' | 'captura' | 'otimizando' | 'em_rota';

interface RotaResponse {
  rota: RotaOtimizada;
  paradas: Parada[];
}

function RotaContent(): React.ReactElement {
  const searchParams = useSearchParams();
  const motoristaId = searchParams.get('motorista_id') ?? '';
  const empresaId = searchParams.get('empresa_id') ?? '';
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
  // Historico de rotas para mostrar na tela de inicio
  const [rotasHistorico, setRotasHistorico] = useState<RotaOtimizada[]>([]);

  // Trava em retrato ao montar
  useEffect(() => {
    lockOrientacaoRetrato();
  }, []);

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
      setFase('inicio');
      return;
    }
    (async () => {
      try {
        // 1. Busca ultimas rotas (historico para tela de inicio)
        const res = await fetch(
          `/api/routing/rotas?empresa_id=${empresaId}&motorista_id=${motoristaId}&limite=5`
        );
        const data = await res.json();
        const todasRotas: RotaOtimizada[] = data.rotas ?? [];
        setRotasHistorico(todasRotas);

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
        setErro(`Falha ao carregar: ${(err as Error).message}`);
        setFase('inicio');
      }
    })();
  }, [motoristaId, empresaId]);

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
        const res = await fetch(`/api/routing/rota/${rotaId}`);
        if (!res.ok) return;
        const data = (await res.json()) as RotaResponse;
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

  // ─── Handlers ──────────────────────────────────────────────────────

  const iniciarCaptura = useCallback(() => {
    setErro(null);
    setFase('captura');
  }, []);

  // Carrega uma rota existente do historico e vai direto pra fase em_rota
  const handleCarregarRota = useCallback(async (rotaId: string) => {
    setErro(null);
    try {
      const rotaRes = await fetch(`/api/routing/rota/${rotaId}`);
      if (!rotaRes.ok) throw new Error(`HTTP ${rotaRes.status}`);
      const rotaData = (await rotaRes.json()) as RotaResponse;
      setRota(rotaData.rota);
      setParadas(rotaData.paradas);
      setFase('em_rota');
    } catch (err) {
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

      // Carrega rota recém criada
      const rotaRes = await fetch(`/api/routing/rota/${data.rota_id}`);
      const rotaData = (await rotaRes.json()) as RotaResponse;
      setRota(rotaData.rota);
      setParadas(rotaData.paradas);
      setFase('em_rota');
    } catch (err) {
      setErro(`Erro: ${(err as Error).message}`);
      setFase('captura');
    } finally {
      setProgressoOtim('');
    }
  }, [motoristaId, empresaId]);

  const handleConcluirParada = useCallback(
    async (paradaId: string) => {
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
        }
      } catch (err) {
        setParadas((arr) =>
          arr.map((p) => (p.id === paradaId ? { ...p, concluida_em: null } : p))
        );
        setErro(`Erro de rede: ${(err as Error).message}`);
        setTimeout(() => setErro(null), 5000);
      }
    },
    [rota]
  );

  const handleEncerrarRota = useCallback(async () => {
    if (rota) {
      try {
        await fetch(`/api/routing/rota/${rota.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'concluida' }),
        });
      } catch (err) {
        console.error('Falha ao encerrar rota no backend:', err);
      }
    }
    setRota(null);
    setParadas([]);
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
  }, [empresaId, motoristaId, rota]);

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
      <Header fase={fase} online={online} numCapturadas={notas.length} numParadas={paradas.length} />

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

      {fase === 'carregando' && <div style={{ padding: 24, textAlign: 'center' }}>Carregando…</div>}

      {fase === 'inicio' && (
        <FaseInicio
          onIniciar={iniciarCaptura}
          onCarregarRota={handleCarregarRota}
          rotasHistorico={rotasHistorico}
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
        <FaseEmRota
          rota={rota}
          paradas={paradas}
          paradaSelecionada={paradaSelecionada}
          onSelectParada={setParadaSelecionada}
          onConcluirParada={handleConcluirParada}
          onEncerrar={handleEncerrarRota}
          posicaoAtual={posicaoAtual}
        />
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

function Header({
  fase,
  online,
  numCapturadas,
  numParadas,
}: {
  fase: Fase;
  online: boolean;
  numCapturadas: number;
  numParadas: number;
}) {
  const labelFase: Record<Fase, string> = {
    carregando: 'Carregando',
    inicio: 'Início',
    captura: 'Capturando NFs',
    otimizando: 'Otimizando',
    em_rota: 'Em rota',
  };

  const buildSha = process.env.NEXT_PUBLIC_BUILD_SHA ?? 'dev';
  return (
    <header style={headerStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong style={{ fontSize: 18 }}>🚛 Rota — {labelFase[fase]}</strong>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            data-testid="build-sha"
            title="versao do build"
            style={{ fontSize: 10, color: '#94a3b8', fontFamily: 'ui-monospace, monospace' }}
          >
            v:{buildSha}
          </span>
          <span style={{ fontSize: 12 }} aria-label={online ? 'online' : 'offline'}>
            {online ? '🟢' : '🔴'}
          </span>
        </div>
      </div>
      {fase === 'captura' && (
        <div style={{ fontSize: 13, color: '#475569', marginTop: 4 }}>
          {numCapturadas} NF{numCapturadas !== 1 ? 's' : ''} capturada{numCapturadas !== 1 ? 's' : ''}
        </div>
      )}
      {fase === 'em_rota' && (
        <div style={{ fontSize: 13, color: '#475569', marginTop: 4 }}>
          {numParadas} parada{numParadas !== 1 ? 's' : ''}
        </div>
      )}
    </header>
  );
}

// ─── FASE INICIO ───────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  otimizada:   'Em aberto',
  em_andamento: 'Em andamento',
  concluida:   'Concluída',
  cancelada:   'Cancelada',
};

function FaseInicio({
  onIniciar,
  onCarregarRota,
  rotasHistorico,
}: {
  onIniciar: () => void;
  onCarregarRota: (rotaId: string) => Promise<void>;
  rotasHistorico: RotaOtimizada[];
}) {
  const [carregando, setCarregando] = useState<string | null>(null);

  const aberta = (status: string) => ['otimizada', 'em_andamento'].includes(status);

  async function handleClick(rotaId: string) {
    setCarregando(rotaId);
    await onCarregarRota(rotaId);
    setCarregando(null);
  }

  return (
    <div style={{ padding: 16 }}>
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>🚛</div>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px' }}>Rota do Dia</h2>
        <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>
          Retome uma rota existente ou comece uma nova.
        </p>
      </div>

      {rotasHistorico.length > 0 && (
        <section aria-label="Histórico de rotas" style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: '#475569', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Rotas recentes
          </h3>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {rotasHistorico.map((r) => {
              const estaAberta = aberta(r.status);
              const isLoading = carregando === r.id;
              const dataFormatada = r.criada_em
                ? new Date(r.criada_em).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
                : '';
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    data-testid={`rota-historico-${r.id}`}
                    onClick={() => handleClick(r.id)}
                    disabled={isLoading}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '12px 14px',
                      borderRadius: 10,
                      border: estaAberta ? '2px solid #fca5a5' : '1px solid #e2e8f0',
                      background: estaAberta ? '#fff1f2' : '#f8fafc',
                      cursor: isLoading ? 'wait' : 'pointer',
                      opacity: isLoading ? 0.6 : 1,
                      transition: 'all 0.15s',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {estaAberta && <span style={{ fontSize: 16 }}>🔴</span>}
                        {!estaAberta && r.status === 'concluida' && <span style={{ fontSize: 16 }}>✅</span>}
                        {!estaAberta && r.status === 'cancelada' && <span style={{ fontSize: 16 }}>❌</span>}
                        <span style={{ fontWeight: 700, fontSize: 14 }}>
                          {dataFormatada}
                        </span>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            padding: '2px 8px',
                            borderRadius: 999,
                            background: estaAberta ? '#fecaca' : '#e2e8f0',
                            color: estaAberta ? '#991b1b' : '#475569',
                          }}
                        >
                          {STATUS_LABEL[r.status] ?? r.status}
                        </span>
                      </div>
                      <span style={{ fontSize: 12, color: '#94a3b8' }}>
                        {(r as unknown as Record<string, unknown>).qtd_paradas as number ?? '?'} paradas
                      </span>
                    </div>
                    {estaAberta && (
                      <p style={{ margin: '6px 0 0', fontSize: 12, color: '#b91c1c' }}>
                        Rota em aberto — toque para retomar ou inicie uma nova abaixo.
                      </p>
                    )}
                    {isLoading && (
                      <p style={{ margin: '6px 0 0', fontSize: 12, color: '#64748b' }}>Carregando…</p>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <button
        type="button"
        onClick={onIniciar}
        style={botaoPrimarioStyle}
        data-testid="btn-iniciar"
      >
        🆕 Nova rota
      </button>
    </div>
  );
}

// ─── FASE CAPTURA ──────────────────────────────────────────────────

function FaseCaptura({
  notas,
  totalEsperado,
  onCapturar,
  onOtimizar,
  onDesfazerUltima,
  onEditar,
}: {
  notas: NotaNaFila[];
  totalEsperado?: number;
  onCapturar: (n: NotaCapturadaInput) => Promise<void>;
  onOtimizar: () => void | Promise<void>;
  onDesfazerUltima: () => void | Promise<void>;
  onEditar: (idLocal: string, dados: NotaCapturadaInput) => Promise<void>;
}) {
  const [notaEmEdicao, setNotaEmEdicao] = useState<string | null>(null);

  const stats = {
    total: notas.length,
    sincronizadas: notas.filter((n) => n.status_sync === 'sincronizada').length,
    pendentes: notas.filter((n) => n.status_sync === 'pendente').length,
    erros: notas.filter((n) => n.status_sync === 'erro').length,
  };
  const pctSync = stats.total === 0 ? 0 : stats.sincronizadas / stats.total;
  const podeFinalizar = stats.total > 0 && pctSync >= PERCENT_SYNC_MIN;
  const numeroNF = stats.total + 1;

  // Quando em modo edição, mostra o formulario preenchido com dados da nota
  if (notaEmEdicao) {
    const nota = notas.find((n) => n.id_local === notaEmEdicao);
    if (nota) {
      return (
        <div>
          <div style={{ padding: '8px 16px', background: '#fef3c7', color: '#92400e', fontSize: 13, fontWeight: 600 }}>
            ✏️ Editando nota: {nota.endereco.logradouro || '(sem rua)'}, {nota.numero}
          </div>
          <InputEnderecoNF
            numeroNF={notas.findIndex((n) => n.id_local === notaEmEdicao) + 1}
            totalNFs={notas.length}
            initialData={{ cep: nota.cep, numero: nota.numero, endereco: nota.endereco }}
            onConfirmar={async (dados) => {
              await onEditar(notaEmEdicao, dados);
              setNotaEmEdicao(null);
            }}
            onCancelar={() => setNotaEmEdicao(null)}
          />
        </div>
      );
    }
  }

  return (
    <div>
      <InputEnderecoNF
        numeroNF={numeroNF}
        totalNFs={totalEsperado}
        onConfirmar={onCapturar}
        onDesfazerUltima={stats.total > 0 ? onDesfazerUltima : undefined}
      />

      {notas.length > 0 && (
        <section style={listaStyle} aria-label="Notas capturadas">
          <h2 style={{ fontSize: 14, fontWeight: 600, margin: '16px 0 8px' }}>
            ✓ {stats.sincronizadas} sincronizadas · ⏳ {stats.pendentes} pendentes
            {stats.erros > 0 && <> · ❌ {stats.erros} erros</>}
          </h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: 13 }}>
            {notas.slice(0, 10).map((n) => (
              <li key={n.id_local} style={{ ...itemListaStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div>
                    {n.status_sync === 'sincronizada' && '✓ '}
                    {n.status_sync === 'pendente' && '⏳ '}
                    {n.status_sync === 'erro' && '❌ '}
                    {n.endereco.logradouro || '(sem rua)'}, {n.numero}
                  </div>
                  {n.status_sync === 'erro' && n.ultimo_erro && (
                    <div
                      data-testid={`erro-${n.id_local}`}
                      style={{
                        marginTop: 4,
                        padding: '6px 8px',
                        background: '#fef2f2',
                        color: '#991b1b',
                        borderRadius: 4,
                        fontSize: 11,
                        fontFamily: 'ui-monospace, monospace',
                        wordBreak: 'break-word',
                      }}
                    >
                      {n.ultimo_erro}
                      {n.tentativas > 0 && (
                        <span style={{ marginLeft: 6, opacity: 0.7 }}>
                          (tentativa {n.tentativas})
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  data-testid={`btn-editar-${n.id_local}`}
                  onClick={() => setNotaEmEdicao(n.id_local)}
                  title="Editar endereço"
                  style={{
                    flexShrink: 0,
                    padding: '4px 8px',
                    fontSize: 14,
                    background: 'transparent',
                    border: '1px solid #cbd5e1',
                    borderRadius: 6,
                    cursor: 'pointer',
                    color: '#475569',
                    marginTop: 2,
                  }}
                >
                  ✏️
                </button>
              </li>
            ))}
            {notas.length > 10 && (
              <li style={{ color: '#64748b', padding: '4px 0' }}>…e mais {notas.length - 10}</li>
            )}
          </ul>
        </section>
      )}

      {stats.total > 0 && !podeFinalizar && (
        <div role="status" style={{ marginTop: 12, padding: 10, background: '#fef3c7', color: '#92400e', borderRadius: 6, fontSize: 13 }}>
          ⏳ Aguarde sincronização — só {Math.round(pctSync * 100)}% das notas estão no servidor. Mínimo: {Math.round(PERCENT_SYNC_MIN * 100)}%.
        </div>
      )}

      <button
        type="button"
        onClick={onOtimizar}
        disabled={!podeFinalizar}
        style={{
          ...botaoPrimarioStyle,
          background: podeFinalizar ? '#16a34a' : '#94a3b8',
          marginTop: 12,
          opacity: podeFinalizar ? 1 : 0.6,
        }}
        data-testid="btn-otimizar"
      >
        🎯 Finalizar e otimizar rota ({stats.total})
      </button>
    </div>
  );
}

// ─── FASE EM ROTA ──────────────────────────────────────────────────

function FaseEmRota({
  rota,
  paradas,
  paradaSelecionada,
  onSelectParada,
  onConcluirParada,
  onEncerrar,
  posicaoAtual,
}: {
  rota: RotaOtimizada;
  paradas: Parada[];
  paradaSelecionada: string | null;
  onSelectParada: (id: string | null) => void;
  onConcluirParada: (id: string) => void | Promise<void>;
  onEncerrar: () => void;
  posicaoAtual: { lat: number; lng: number } | null;
}) {
  const concluidas = paradas.filter((p) => p.concluida_em).length;
  const total = paradas.length;
  const pct = total === 0 ? 0 : (concluidas / total) * 100;
  const totaisStr = `${rota.distancia_total_km?.toFixed(1) ?? '?'} km · ≈${Math.round(rota.tempo_total_min ?? 0)} min`;

  // Proxima parada = primeira nao concluida
  const proximaParada = paradas.find((p) => !p.concluida_em) ?? null;

  // Parada exibida no bottom sheet (so se motorista tocou no pino)
  const paradaSheet = useMemo(
    () => (paradaSelecionada ? paradas.find((p) => p.id === paradaSelecionada) ?? null : null),
    [paradaSelecionada, paradas]
  );

  // Confirmacao antes de marcar entregue — motorista pode apertar sem querer
  // (botao "Entreguei" fica visivel o tempo todo). Modal nao bloqueia muito,
  // 1 tap pra confirmar, 1 pra cancelar.
  const [paradaConfirmando, setParadaConfirmando] = useState<string | null>(null);
  const paradaPraConfirmar = useMemo(
    () => (paradaConfirmando ? paradas.find((p) => p.id === paradaConfirmando) ?? null : null),
    [paradaConfirmando, paradas]
  );
  const solicitarConcluir = useCallback((id: string) => {
    vibrar(20);
    setParadaConfirmando(id);
  }, []);
  const confirmarConcluir = useCallback(async () => {
    if (!paradaConfirmando) return;
    const id = paradaConfirmando;
    setParadaConfirmando(null);
    await onConcluirParada(id);
  }, [paradaConfirmando, onConcluirParada]);

  return (
    <div>
      {/* Progress bar visual */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#475569', marginBottom: 4 }}>
          <span>{concluidas}/{total} entregue{total !== 1 ? 's' : ''}</span>
          <span>{totaisStr}</span>
        </div>
        <div
          role="progressbar"
          aria-valuenow={concluidas}
          aria-valuemax={total}
          aria-valuemin={0}
          style={{ width: '100%', height: 8, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}
        >
          <div
            data-testid="progress-bar"
            style={{
              width: `${pct}%`,
              height: '100%',
              background: 'linear-gradient(90deg, #16a34a, #22c55e)',
              transition: 'width 300ms',
            }}
          />
        </div>
      </div>

      {/* Mapa interativo — tap pino abre bottom sheet */}
      <MapaRota
        paradas={paradas}
        altura={240}
        paradaSelecionada={paradaSelecionada}
        posicaoAtual={posicaoAtual}
        onParadaClick={(id) => {
          onSelectParada(id === paradaSelecionada ? null : id);
          vibrar(30);
        }}
      />

      <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
        <a href={`/mobile/ajuste-rota?rota_id=${rota.id}`} style={btnLinkStyle} data-testid="link-ajustar">
          ⚙️ Ajustar ordem
        </a>
        <button type="button" onClick={onEncerrar} style={btnEncerrarStyle} data-testid="btn-encerrar">
          🏁 Encerrar rota
        </button>
      </div>

      {/* Card destacado: PROXIMA parada (padrao mercado: motorista sabe pra onde ir) */}
      {proximaParada && !paradaSheet && (
        <section style={proximaCardStyle} data-testid="proxima-parada">
          <div style={{ fontSize: 11, fontWeight: 700, color: '#92400e', marginBottom: 4, letterSpacing: 0.5 }}>
            ⭐ PRÓXIMA PARADA
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ ...numeroStyle(false), background: '#f97316', width: 44, height: 44, fontSize: 18 }}>
              {proximaParada.ordem}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>
                {proximaParada.endereco.logradouro || '(sem rua)'}
                {proximaParada.endereco.numero ? `, ${proximaParada.endereco.numero}` : ''}
              </div>
              <div style={{ fontSize: 13, color: '#64748b' }}>
                {proximaParada.endereco.cidade}/{proximaParada.endereco.uf}
              </div>
              {proximaParada.janela_horario && proximaParada.janela_horario.length > 0 && (
                <div style={{ fontSize: 12, color: '#92400e', marginTop: 4, fontWeight: 600 }}>
                  ⏰ {proximaParada.janela_horario.map((j) => `${j[0]}–${j[1]}`).join(' / ')}
                </div>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
            <a href={waze(proximaParada.latitude, proximaParada.longitude)} target="_blank" rel="noreferrer" style={btnNavStyle('#2563eb')}>
              🗺️ Waze
            </a>
            <a href={googleMaps(proximaParada.latitude, proximaParada.longitude)} target="_blank" rel="noreferrer" style={btnNavStyle('#16a34a')}>
              🌍 Maps
            </a>
            <button
              type="button"
              onClick={() => solicitarConcluir(proximaParada.id)}
              style={btnNavStyle('#f97316')}
              data-testid={`btn-concluir-proxima`}
            >
              ✓ Entreguei
            </button>
          </div>
        </section>
      )}

      <ol style={{ listStyle: 'none', padding: 0, margin: '16px 0 0' }}>
        {paradas.map((p, i) => {
          const status = statusDaParada(p, i, paradas);
          const concluida = status === 'concluida';
          const ehProxima = status === 'proxima';
          const ehSelecionada = paradaSelecionada === p.id;
          return (
            <li
              key={p.id}
              style={paradaItemStyle(concluida, ehSelecionada)}
              data-testid={`parada-${p.ordem}`}
              onClick={() => onSelectParada(ehSelecionada ? null : p.id)}
            >
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={numeroStyle(concluida, ehProxima)}>{concluida ? '✓' : p.ordem}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>
                    {p.endereco.logradouro || '(sem rua)'}
                    {p.endereco.numero ? `, ${p.endereco.numero}` : ''}{' '}
                    ({p.endereco.cidade}/{p.endereco.uf})
                  </div>
                  {p.observacao && (
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>💬 {p.observacao}</div>
                  )}
                  {p.janela_horario && p.janela_horario.length > 0 && (
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                      ⏰ {p.janela_horario.map((j) => `${j[0]}–${j[1]}`).join(' / ')}
                    </div>
                  )}
                </div>
              </div>
              {!concluida && (
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }} onClick={(e) => e.stopPropagation()}>
                  <a href={waze(p.latitude, p.longitude)} target="_blank" rel="noreferrer" style={btnNavStyle('#2563eb')}>
                    🗺️ Waze
                  </a>
                  <a href={googleMaps(p.latitude, p.longitude)} target="_blank" rel="noreferrer" style={btnNavStyle('#16a34a')}>
                    🌍 Maps
                  </a>
                  <button
                    type="button"
                    onClick={() => solicitarConcluir(p.id)}
                    style={btnNavStyle('#64748b')}
                    data-testid={`btn-concluir-${p.ordem}`}
                  >
                    ✓ Concluí
                  </button>
                </div>
              )}
              {concluida && (
                <div style={{ marginTop: 8, fontSize: 12, color: '#16a34a', fontWeight: 600 }}>✓ Concluída</div>
              )}
            </li>
          );
        })}
      </ol>

      {/* Bottom sheet: aparece quando motorista toca num pino do mapa */}
      {paradaSheet && (
        <BottomSheet
          parada={paradaSheet}
          onFechar={() => onSelectParada(null)}
          onConcluir={() => solicitarConcluir(paradaSheet.id)}
        />
      )}

      {/* Confirmacao "entreguei?" — evita tap sem querer + da feedback claro */}
      {paradaPraConfirmar && (
        <div
          role="dialog"
          aria-label="confirmar entrega"
          data-testid="modal-confirmar-entrega"
          onClick={() => setParadaConfirmando(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 70,
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff',
              borderRadius: 14,
              padding: 18,
              width: '100%',
              maxWidth: 360,
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: '#0f172a' }}>
              Entrega concluída?
            </div>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>
              📍 {paradaPraConfirmar.endereco.logradouro}
              {paradaPraConfirmar.endereco.numero ? `, ${paradaPraConfirmar.endereco.numero}` : ''}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={() => setParadaConfirmando(null)}
                data-testid="btn-cancelar-entrega"
                style={{
                  flex: 1,
                  padding: '12px',
                  background: '#f1f5f9',
                  color: '#475569',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Não
              </button>
              <button
                type="button"
                onClick={confirmarConcluir}
                data-testid="btn-confirmar-entrega"
                style={{
                  flex: 1,
                  padding: '12px',
                  background: '#16a34a',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                ✓ Sim, entreguei
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── BOTTOM SHEET ──────────────────────────────────────────────────

function BottomSheet({
  parada,
  onFechar,
  onConcluir,
}: {
  parada: Parada;
  onFechar: () => void;
  onConcluir: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-label={`Parada ${parada.ordem}`}
      data-testid="bottom-sheet"
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        background: '#fff',
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        boxShadow: '0 -4px 16px rgba(0,0,0,0.15)',
        padding: 16,
        zIndex: 40,
        maxWidth: 480,
        margin: '0 auto',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 12 }}>
        <div style={{ display: 'flex', gap: 10, flex: 1, minWidth: 0 }}>
          <div style={{ ...numeroStyle(Boolean(parada.concluida_em), false), width: 44, height: 44, fontSize: 18 }}>
            {parada.concluida_em ? '✓' : parada.ordem}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>
              {parada.endereco.logradouro || '(sem rua)'}
              {parada.endereco.numero ? `, ${parada.endereco.numero}` : ''}
            </div>
            <div style={{ fontSize: 13, color: '#64748b' }}>
              {parada.endereco.cidade}/{parada.endereco.uf}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onFechar}
          aria-label="fechar"
          style={{ background: 'transparent', border: 'none', fontSize: 20, color: '#94a3b8', cursor: 'pointer' }}
        >
          ✕
        </button>
      </div>
      {parada.janela_horario && parada.janela_horario.length > 0 && (
        <div style={{ fontSize: 13, color: '#475569', marginTop: 8 }}>
          ⏰ {parada.janela_horario.map((j) => `${j[0]}–${j[1]}`).join(' / ')}
        </div>
      )}
      {parada.observacao && (
        <div style={{ fontSize: 13, color: '#475569', marginTop: 8 }}>💬 {parada.observacao}</div>
      )}
      {!parada.concluida_em && (
        <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
          <a href={waze(parada.latitude, parada.longitude)} target="_blank" rel="noreferrer" style={btnNavStyle('#2563eb')}>
            🗺️ Waze
          </a>
          <a href={googleMaps(parada.latitude, parada.longitude)} target="_blank" rel="noreferrer" style={btnNavStyle('#16a34a')}>
            🌍 Maps
          </a>
          <button type="button" onClick={onConcluir} style={btnNavStyle('#f97316')}>
            ✓ Entreguei
          </button>
        </div>
      )}
    </div>
  );
}

// ─── ESTILOS ────────────────────────────────────────────────────────

const containerStyle: React.CSSProperties = {
  maxWidth: 480,
  margin: '0 auto',
  padding: 16,
};

const headerStyle: React.CSSProperties = {
  padding: 12,
  background: '#fff',
  borderRadius: 8,
  border: '1px solid #e2e8f0',
  marginBottom: 12,
};

const listaStyle: React.CSSProperties = {
  background: '#f8fafc',
  borderRadius: 8,
  padding: 12,
};

const itemListaStyle: React.CSSProperties = {
  padding: '6px 0',
  borderBottom: '1px solid #e2e8f0',
};

const botaoPrimarioStyle: React.CSSProperties = {
  width: '100%',
  padding: '14px',
  fontSize: 16,
  fontWeight: 600,
  background: '#2563eb',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  cursor: 'pointer',
};

const erroStyle: React.CSSProperties = {
  padding: 12,
  background: '#fef2f2',
  color: '#991b1b',
  borderRadius: 8,
  fontSize: 14,
  marginBottom: 12,
};

const btnLinkStyle: React.CSSProperties = {
  flex: 1,
  padding: '10px',
  background: '#f1f5f9',
  color: '#475569',
  textAlign: 'center',
  borderRadius: 6,
  textDecoration: 'none',
  fontSize: 13,
  fontWeight: 600,
};

const btnEncerrarStyle: React.CSSProperties = {
  flex: 1,
  padding: '10px',
  background: '#fef2f2',
  color: '#991b1b',
  border: 'none',
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
};

function paradaItemStyle(concluida: boolean, destacada = false): React.CSSProperties {
  return {
    padding: 12,
    background: concluida ? '#f0fdf4' : '#fff',
    border: destacada ? '2px solid #f97316' : '1px solid #e2e8f0',
    borderRadius: 8,
    marginBottom: 8,
    opacity: concluida ? 0.7 : 1,
    boxShadow: destacada ? '0 0 0 3px rgba(249,115,22,0.2)' : undefined,
    cursor: 'pointer',
  };
}

function numeroStyle(concluida: boolean, ehProxima = false): React.CSSProperties {
  return {
    width: 36,
    height: 36,
    flexShrink: 0,
    background: concluida ? '#16a34a' : ehProxima ? '#f97316' : '#2563eb',
    color: '#fff',
    borderRadius: 8,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    fontSize: 16,
  };
}

const proximaCardStyle: React.CSSProperties = {
  marginTop: 16,
  padding: 16,
  background: '#fffbeb',
  border: '2px solid #f97316',
  borderRadius: 12,
  boxShadow: '0 4px 12px rgba(249,115,22,0.2)',
};

function btnNavStyle(bg: string): React.CSSProperties {
  return {
    flex: 1,
    padding: '8px',
    background: bg,
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 600,
    textAlign: 'center',
    textDecoration: 'none',
    cursor: 'pointer',
  };
}
