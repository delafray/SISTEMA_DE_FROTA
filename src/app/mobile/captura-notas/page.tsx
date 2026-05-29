'use client';

/**
 * Tela mobile de Captura de Notas Fiscais.
 *
 * Onde o motorista digita CEP + numero de cada NF antes de sair com o
 * caminhao. Salva localmente (IndexedDB via fila offline) e sincroniza
 * em background com o Supabase via /api/notas/sync.
 *
 * Params obrigatorios na URL: ?motorista_id=...&empresa_id=...
 * Param opcional: &total=70 (default 70)
 *
 * Por que URL params (e nao auth/sessao): a integracao com o sistema
 * principal de usuarios fica pra "consolidacao" futura (decisao em
 * 2026-05-27). Por enquanto modulo totalmente isolado, parametrizado.
 *
 * Referencia: PLANO_ROTEIRIZACAO.md passo 1.4.
 */

import { useCallback, useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { InputEnderecoNF, type NotaCapturadaInput } from '@/components/mobile/InputEnderecoNF';
import { adicionarNota, listarTodas, remover } from '@/lib/offline/fila';
import { iniciarSyncWorker, sincronizarFila } from '@/lib/offline/sync';
import { iniciarOnlineDetector, estaOnline } from '@/lib/offline/onlineDetector';
import type { NotaNaFila } from '@/lib/offline/types';

const DEFAULT_TOTAL = 70;
const RELOAD_INTERVAL_MS = 3000;
const SYNC_INTERVAL_MS = 5000;

function CapturaNotasContent(): React.ReactElement {
  const searchParams = useSearchParams();
  const motoristaId = searchParams.get('motorista_id') ?? '';
  const empresaId = searchParams.get('empresa_id') ?? '';
  const totalEsperado = Number(searchParams.get('total')) || DEFAULT_TOTAL;

  const [notas, setNotas] = useState<NotaNaFila[]>([]);
  const [online, setOnline] = useState(true);
  const [finalizado, setFinalizado] = useState(false);

  const recarregar = useCallback(async () => {
    if (!motoristaId) return;
    const todas = await listarTodas(motoristaId);
    setNotas(todas);
  }, [motoristaId]);

  // Trava em retrato ao montar (Android Chrome suporta; iOS ignora silenciosamente)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    type SO = ScreenOrientation & { lock?: (o: string) => Promise<void> };
    const so = screen.orientation as SO | undefined;
    if (so?.lock) so.lock('portrait').catch(() => { /* ok */ });
  }, []);

  const handleDesfazerUltima = useCallback(async () => {
    if (notas.length === 0) return;
    const ordenadas = [...notas].sort((a, b) => b.capturado_em.localeCompare(a.capturado_em));
    await remover(ordenadas[0].id_local);
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate([30, 20, 30]);
    await recarregar();
  }, [notas, recarregar]);

  // Mount: workers + listeners + load inicial
  useEffect(() => {
    if (!motoristaId) return;

    void recarregar();
    const stopWorker = iniciarSyncWorker(SYNC_INTERVAL_MS);
    const stopDetector = iniciarOnlineDetector();
    setOnline(estaOnline());

    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Recarrega periodicamente pra refletir mudancas da fila (sync rodando)
    const intervalo = setInterval(() => void recarregar(), RELOAD_INTERVAL_MS);

    return () => {
      stopWorker();
      stopDetector();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(intervalo);
    };
  }, [motoristaId, recarregar]);

  const handleConfirmar = useCallback(
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
      await recarregar();
      void sincronizarFila();
    },
    [motoristaId, empresaId, recarregar]
  );

  const handleFinalizar = useCallback(() => {
    setFinalizado(true);
    // TODO passos 1.5+: chamar API de geocoding + otimizacao quando Oracle estiver pronta
  }, []);

  if (!motoristaId || !empresaId) {
    return (
      <div style={containerStyle}>
        <div role="alert" style={erroStyle}>
          ⚠️ <strong>Parametros faltando.</strong>
          <br />
          A URL precisa conter <code>?motorista_id=...&empresa_id=...</code>.
        </div>
      </div>
    );
  }

  const stats = {
    total: notas.length,
    sincronizadas: notas.filter((n) => n.status_sync === 'sincronizada').length,
    pendentes: notas.filter((n) => n.status_sync === 'pendente').length,
    erros: notas.filter((n) => n.status_sync === 'erro').length,
  };

  const numeroNF = stats.total + 1;

  return (
    <div style={containerStyle}>
      <header style={headerStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong style={{ fontSize: 18 }}>Captura de Notas</strong>
          <span style={{ fontSize: 13 }} aria-label={online ? 'online' : 'offline'}>
            {online ? '🟢 Online' : '🔴 Offline'}
          </span>
        </div>
        <div style={{ marginTop: 6, fontSize: 13, color: '#475569' }}>
          ✓ {stats.sincronizadas} sincronizadas &nbsp;·&nbsp; ⏳ {stats.pendentes} pendentes
          {stats.erros > 0 && <> &nbsp;·&nbsp; ❌ {stats.erros} erro(s)</>}
        </div>
      </header>

      {!finalizado && (
        <InputEnderecoNF
          numeroNF={numeroNF}
          totalNFs={totalEsperado}
          onConfirmar={handleConfirmar}
          onDesfazerUltima={notas.length > 0 ? handleDesfazerUltima : undefined}
        />
      )}

      {notas.length > 0 && (
        <section style={listaStyle} aria-label="Notas capturadas">
          <h2 style={{ fontSize: 14, fontWeight: 600, color: '#334155', margin: '16px 0 8px' }}>
            Capturadas ({notas.length})
          </h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {notas.slice(0, 10).map((n) => (
              <li key={n.id_local} style={itemStyle}>
                <span style={{ marginRight: 8 }} aria-label={`status ${n.status_sync}`}>
                  {n.status_sync === 'sincronizada' && '✓'}
                  {n.status_sync === 'pendente' && '⏳'}
                  {n.status_sync === 'erro' && '❌'}
                </span>
                <span>
                  {n.endereco.logradouro || '(sem rua)'}, {n.numero}{' '}
                  <span style={{ color: '#64748b', fontSize: 13 }}>
                    ({n.endereco.cidade}/{n.endereco.uf})
                  </span>
                </span>
              </li>
            ))}
            {notas.length > 10 && (
              <li style={{ color: '#64748b', fontSize: 13, padding: '8px 0' }}>
                …e mais {notas.length - 10}
              </li>
            )}
          </ul>
        </section>
      )}

      <div style={{ marginTop: 24 }}>
        <button
          type="button"
          onClick={handleFinalizar}
          disabled={stats.total === 0 || finalizado}
          style={{
            ...botaoFinalizarStyle,
            opacity: stats.total === 0 || finalizado ? 0.4 : 1,
          }}
        >
          🏁 Finalizar Rota ({stats.total})
        </button>
      </div>

      {finalizado && (
        <div role="status" style={finalizadoStyle}>
          ✅ <strong>Rota finalizada.</strong>
          <br />
          A otimizacao das paradas sera feita assim que a infraestrutura do
          servidor (Oracle + OSRM) estiver pronta (passos 1.7+ do plano).
          {stats.pendentes > 0 && (
            <div style={{ marginTop: 8, color: '#92400e' }}>
              ⚠️ Ainda ha {stats.pendentes} nota(s) pendente(s) — mantenha o app
              aberto ate sincronizar.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function CapturaNotasPage(): React.ReactElement {
  return (
    <Suspense fallback={<div style={containerStyle}>Carregando…</div>}>
      <CapturaNotasContent />
    </Suspense>
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
  marginBottom: 16,
};

const listaStyle: React.CSSProperties = {
  background: '#f8fafc',
  borderRadius: 8,
  padding: 12,
};

const itemStyle: React.CSSProperties = {
  padding: '8px 0',
  borderBottom: '1px solid #e2e8f0',
  fontSize: 14,
};

const botaoFinalizarStyle: React.CSSProperties = {
  width: '100%',
  padding: '14px',
  fontSize: 16,
  fontWeight: 600,
  background: '#16a34a',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  cursor: 'pointer',
};

const erroStyle: React.CSSProperties = {
  padding: 16,
  background: '#fef2f2',
  color: '#991b1b',
  borderRadius: 8,
  fontSize: 15,
};

const finalizadoStyle: React.CSSProperties = {
  marginTop: 16,
  padding: 16,
  background: '#f0fdf4',
  color: '#166534',
  borderRadius: 8,
  fontSize: 14,
};
