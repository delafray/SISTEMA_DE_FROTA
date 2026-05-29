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

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { InputEnderecoNF, type NotaCapturadaInput } from '@/components/mobile/InputEnderecoNF';
import { MapaRota } from '@/components/MapaRota';
import { adicionarNota, contarPorStatus, listarTodas } from '@/lib/offline/fila';
import { iniciarSyncWorker, sincronizarFila } from '@/lib/offline/sync';
import { iniciarOnlineDetector, estaOnline } from '@/lib/offline/onlineDetector';
import { waze, googleMaps } from '@/lib/routing/deepLinks';
import type { NotaNaFila } from '@/lib/offline/types';
import type { Parada, RotaOtimizada } from '@/lib/routing/types';

type Fase = 'carregando' | 'inicio' | 'captura' | 'otimizando' | 'em_rota';

interface RotaResponse {
  rota: RotaOtimizada;
  paradas: Parada[];
}

export default function RotaPage(): React.ReactElement {
  const searchParams = useSearchParams();
  const motoristaId = searchParams.get('motorista_id') ?? '';
  const empresaId = searchParams.get('empresa_id') ?? '';
  const totalEsperado = Number(searchParams.get('total')) || 70;

  const [fase, setFase] = useState<Fase>('carregando');
  const [notas, setNotas] = useState<NotaNaFila[]>([]);
  const [rota, setRota] = useState<RotaOtimizada | null>(null);
  const [paradas, setParadas] = useState<Parada[]>([]);
  const [online, setOnline] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [progressoOtim, setProgressoOtim] = useState<string>('');

  // ─── Carregamento inicial: decide fase baseado no estado ──────────

  useEffect(() => {
    if (!motoristaId || !empresaId) {
      setFase('inicio');
      return;
    }
    (async () => {
      try {
        // 1. Existe rota em andamento? (status='otimizada' ou 'em_andamento')
        const res = await fetch(
          `/api/routing/rotas?empresa_id=${empresaId}&motorista_id=${motoristaId}&limite=1`
        );
        const data = await res.json();
        const rotaRecente = data.rotas?.[0];

        if (rotaRecente && ['otimizada', 'em_andamento'].includes(rotaRecente.status)) {
          // Carrega rota completa com paradas
          const rotaRes = await fetch(`/api/routing/rota/${rotaRecente.id}`);
          const rotaData = (await rotaRes.json()) as RotaResponse;
          setRota(rotaData.rota);
          setParadas(rotaData.paradas);
          setFase('em_rota');
          return;
        }

        // 2. Existem notas pendentes na fila local?
        const notasLocais = await listarTodas(motoristaId);
        setNotas(notasLocais);
        if (notasLocais.length > 0) {
          setFase('captura');
          return;
        }

        // 3. Nada pendente — fase inicial
        setFase('inicio');
      } catch (err) {
        setErro(`Falha ao carregar: ${(err as Error).message}`);
        setFase('inicio');
      }
    })();
  }, [motoristaId, empresaId]);

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
      // Otimismo otimista: atualiza UI antes de pesquisar
      setParadas((arr) => arr.map((p) => (p.id === paradaId ? { ...p, concluida_em: agora } : p)));

      if (!rota) return;
      try {
        await fetch(`/api/routing/rota/${rota.id}/paradas`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paradas: [{ id: paradaId }] }),
        });
        // Nao tem campo concluida_em no PATCH ainda — TODO: adicionar endpoint
        // Por ora, persistencia local apenas. O motorista ve a marcacao.
      } catch {
        // Silencioso — UI ja atualizou
      }
    },
    [rota]
  );

  const handleEncerrarRota = useCallback(() => {
    setRota(null);
    setParadas([]);
    setNotas([]);
    setFase('inicio');
  }, []);

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

      {erro && (
        <div role="alert" style={erroStyle}>
          {erro}
        </div>
      )}

      {fase === 'carregando' && <div style={{ padding: 24, textAlign: 'center' }}>Carregando…</div>}

      {fase === 'inicio' && <FaseInicio onIniciar={iniciarCaptura} />}

      {fase === 'captura' && (
        <FaseCaptura
          notas={notas}
          totalEsperado={totalEsperado}
          onCapturar={handleCapturar}
          onOtimizar={handleOtimizar}
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
          onConcluirParada={handleConcluirParada}
          onEncerrar={handleEncerrarRota}
        />
      )}
    </div>
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

  return (
    <header style={headerStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong style={{ fontSize: 18 }}>🚛 Rota — {labelFase[fase]}</strong>
        <span style={{ fontSize: 12 }} aria-label={online ? 'online' : 'offline'}>
          {online ? '🟢' : '🔴'}
        </span>
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

function FaseInicio({ onIniciar }: { onIniciar: () => void }) {
  return (
    <div style={{ padding: 24, textAlign: 'center' }}>
      <div style={{ fontSize: 64, marginBottom: 16 }}>🚀</div>
      <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Pronto pra rodar?</h2>
      <p style={{ fontSize: 14, color: '#64748b', marginBottom: 24 }}>
        Comece capturando as notas fiscais que vai entregar hoje.
      </p>
      <button type="button" onClick={onIniciar} style={botaoPrimarioStyle} data-testid="btn-iniciar">
        🆕 Começar nova rota
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
}: {
  notas: NotaNaFila[];
  totalEsperado: number;
  onCapturar: (n: NotaCapturadaInput) => Promise<void>;
  onOtimizar: () => void | Promise<void>;
}) {
  const stats = {
    sincronizadas: notas.filter((n) => n.status_sync === 'sincronizada').length,
    pendentes: notas.filter((n) => n.status_sync === 'pendente').length,
    erros: notas.filter((n) => n.status_sync === 'erro').length,
  };

  return (
    <div>
      <InputEnderecoNF
        numeroNF={notas.length + 1}
        totalNFs={totalEsperado}
        onConfirmar={onCapturar}
      />

      {notas.length > 0 && (
        <section style={listaStyle} aria-label="Notas capturadas">
          <h2 style={{ fontSize: 14, fontWeight: 600, margin: '16px 0 8px' }}>
            ✓ {stats.sincronizadas} sincronizadas · ⏳ {stats.pendentes} pendentes
            {stats.erros > 0 && <> · ❌ {stats.erros} erros</>}
          </h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: 13 }}>
            {notas.slice(0, 10).map((n) => (
              <li key={n.id_local} style={itemListaStyle}>
                {n.status_sync === 'sincronizada' && '✓ '}
                {n.status_sync === 'pendente' && '⏳ '}
                {n.status_sync === 'erro' && '❌ '}
                {n.endereco.logradouro || '(sem rua)'}, {n.numero}
              </li>
            ))}
            {notas.length > 10 && (
              <li style={{ color: '#64748b', padding: '4px 0' }}>…e mais {notas.length - 10}</li>
            )}
          </ul>
        </section>
      )}

      <button
        type="button"
        onClick={onOtimizar}
        disabled={notas.length === 0}
        style={{
          ...botaoPrimarioStyle,
          background: '#16a34a',
          marginTop: 20,
          opacity: notas.length === 0 ? 0.4 : 1,
        }}
        data-testid="btn-otimizar"
      >
        🎯 Finalizar e otimizar rota ({notas.length})
      </button>
    </div>
  );
}

// ─── FASE EM ROTA ──────────────────────────────────────────────────

function FaseEmRota({
  rota,
  paradas,
  onConcluirParada,
  onEncerrar,
}: {
  rota: RotaOtimizada;
  paradas: Parada[];
  onConcluirParada: (id: string) => void | Promise<void>;
  onEncerrar: () => void;
}) {
  const totaisStr = `${rota.distancia_total_km?.toFixed(1) ?? '?'} km · ≈${Math.round(rota.tempo_total_min ?? 0)} min`;
  const concluidas = paradas.filter((p) => p.concluida_em).length;

  return (
    <div>
      <div style={{ fontSize: 13, color: '#475569', marginBottom: 8 }}>
        {totaisStr} · {concluidas}/{paradas.length} concluídas
      </div>

      <MapaRota paradas={paradas} altura={240} />

      <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
        <a
          href={`/mobile/ajuste-rota?rota_id=${rota.id}`}
          style={btnLinkStyle}
          data-testid="link-ajustar"
        >
          ⚙️ Ajustar ordem
        </a>
        <button type="button" onClick={onEncerrar} style={btnEncerrarStyle} data-testid="btn-encerrar">
          🏁 Encerrar rota
        </button>
      </div>

      <ol style={{ listStyle: 'none', padding: 0, margin: '16px 0 0' }}>
        {paradas.map((p) => (
          <li key={p.id} style={paradaItemStyle(Boolean(p.concluida_em))} data-testid={`parada-${p.ordem}`}>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={numeroStyle(Boolean(p.concluida_em))}>{p.ordem}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>
                  {p.endereco.logradouro || '(sem rua)'}, ({p.endereco.cidade}/{p.endereco.uf})
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
            {!p.concluida_em && (
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <a href={waze(p.latitude, p.longitude)} target="_blank" rel="noreferrer" style={btnNavStyle('#2563eb')}>
                  🗺️ Waze
                </a>
                <a
                  href={googleMaps(p.latitude, p.longitude)}
                  target="_blank"
                  rel="noreferrer"
                  style={btnNavStyle('#16a34a')}
                >
                  🌍 Maps
                </a>
                <button
                  type="button"
                  onClick={() => onConcluirParada(p.id)}
                  style={btnNavStyle('#64748b')}
                  data-testid={`btn-concluir-${p.ordem}`}
                >
                  ✓ Concluí
                </button>
              </div>
            )}
            {p.concluida_em && (
              <div style={{ marginTop: 8, fontSize: 12, color: '#16a34a', fontWeight: 600 }}>✓ Concluída</div>
            )}
          </li>
        ))}
      </ol>
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

function paradaItemStyle(concluida: boolean): React.CSSProperties {
  return {
    padding: 12,
    background: concluida ? '#f0fdf4' : '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: 8,
    marginBottom: 8,
    opacity: concluida ? 0.7 : 1,
  };
}

function numeroStyle(concluida: boolean): React.CSSProperties {
  return {
    width: 36,
    height: 36,
    flexShrink: 0,
    background: concluida ? '#16a34a' : '#2563eb',
    color: '#fff',
    borderRadius: 8,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    fontSize: 16,
  };
}

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
