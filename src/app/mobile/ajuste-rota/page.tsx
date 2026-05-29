'use client';

/**
 * Tela Ajuste de Rota — duas abas (Ordenar | Detalhes), mapa Leaflet,
 * drag-and-drop pra reordenar paradas, modal pra editar janela_horario.
 *
 * Params via URL: ?rota_id=<UUID>
 *
 * Fluxo:
 * 1. GET /api/routing/rota/[id] → rota + paradas
 * 2. Usuario reordena (drag) ou edita (tap parada na aba Detalhes)
 * 3. PATCH /api/routing/rota/[id]/paradas salva mudancas
 * 4. Visualizar no mapa
 *
 * Referencia: PLANO_ROTEIRIZACAO.md secao 3.10 + passo 1.12.
 */

import { useCallback, useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { MapaRota } from '@/components/MapaRota';
import { Tijolinho } from './components/Tijolinho';
import { ModalHorario, type ParadaEditavel } from './components/ModalHorario';
import { InputEnderecoNF, type NotaCapturadaInput } from '@/components/mobile/InputEnderecoNF';
import { distanciasEntreParadas, estimarKmTotal } from '@/lib/routing/utils';
import type { Parada, RotaOtimizada } from '@/lib/routing/types';

function vibrar(pattern: number | number[]) {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    navigator.vibrate(pattern);
  }
}

/**
 * Reordena paradas pondo as ja entregues (concluida_em != null) no topo,
 * por timestamp de conclusao ASC. Pendentes vem depois na ordem original.
 * Motorista nao quer ficar olhando pra paradas terminadas no meio da lista.
 */
function ordenarConcluidasPrimeiro(paradas: Parada[]): Parada[] {
  const concluidas = paradas
    .filter((p) => p.concluida_em)
    .sort((a, b) => (a.concluida_em ?? '').localeCompare(b.concluida_em ?? ''));
  const pendentes = paradas.filter((p) => !p.concluida_em).sort((a, b) => a.ordem - b.ordem);
  return [...concluidas, ...pendentes];
}

// Bipe curto sintetizado via Web Audio API (sem precisar de arquivo .mp3).
// Cria/destroi o contexto sob demanda — leve. Falha silenciosamente em
// browsers sem suporte (ou autoplay-blocked).
function bipeCurto() {
  try {
    type WindowAudio = typeof window & { webkitAudioContext?: typeof AudioContext };
    const w = window as WindowAudio;
    const AC = window.AudioContext ?? w.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 660; // E5 (audivel mas nao agressivo)
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
    osc.onended = () => ctx.close();
  } catch { /* sem permissao de audio — ok */ }
}

type Aba = 'ordenar' | 'detalhes';

interface RotaResponse {
  rota: RotaOtimizada;
  paradas: Parada[];
}

function AjusteRotaContent(): React.ReactElement {
  const searchParams = useSearchParams();
  const rotaId = searchParams.get('rota_id') ?? '';

  const [paradas, setParadas] = useState<Parada[]>([]);
  const [rotaInfo, setRotaInfo] = useState<RotaOtimizada | null>(null);
  const [aba, setAba] = useState<Aba>('ordenar');
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [paradaEditando, setParadaEditando] = useState<Parada | null>(null);
  const [dirty, setDirty] = useState(false);
  const [paradaSelecionada, setParadaSelecionada] = useState<string | null>(null);
  const [avisoLock, setAvisoLock] = useState<string | null>(null);
  // Fluxo de adicionar nova parada via header:
  //   fechado → capturando (CEP) → escolhendo (posicao) → adicionando (POST) → fechado
  const [modoAdicao, setModoAdicao] = useState<'fechado' | 'capturando' | 'escolhendo' | 'adicionando'>('fechado');
  const [dadosNovaParada, setDadosNovaParada] = useState<NotaCapturadaInput | null>(null);
  const [erroAdicionar, setErroAdicionar] = useState<string | null>(null);
  const [posicaoAtual, setPosicaoAtual] = useState<{ lat: number; lng: number } | null>(null);

  // Pointer p/ mouse + Touch p/ dedo. Ambos com long-press de 200ms — assim
  // tap curto continua selecionando a parada no mapa, mas segurar 200ms ativa
  // o drag (sem conflito com o scroll vertical da pagina).
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  );

  // Watch GPS — marcador "voce esta aqui" no mapa. Para ao desmontar.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => setPosicaoAtual({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => { /* GPS off — ignora */ },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // Load inicial
  useEffect(() => {
    if (!rotaId) return;
    setCarregando(true);
    fetch(`/api/routing/rota/${rotaId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as RotaResponse;
      })
      .then((data) => {
        setRotaInfo(data.rota);
        // Entregues primeiro (por concluida_em ASC), pendentes depois (por ordem).
        // Motorista nao precisa mais ficar olhando pra paradas que ja terminou
        // no meio da lista. Renumera consecutivamente — se mudou a ordem original
        // marca dirty pra ele salvar.
        const ordenado = ordenarConcluidasPrimeiro(data.paradas);
        const renumerado = ordenado.map((p, i) => ({ ...p, ordem: i + 1 }));
        setParadas(renumerado);
        const ordemMudou = renumerado.some((p, i) => p.id !== data.paradas[i]?.id);
        setDirty(ordemMudou);
        setErro(null);
      })
      .catch((err: Error) => setErro(err.message))
      .finally(() => setCarregando(false));
  }, [rotaId]);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      setParadas((items) => {
        const oldIndex = items.findIndex((p) => p.id === active.id);
        const newIndex = items.findIndex((p) => p.id === over.id);
        if (oldIndex < 0 || newIndex < 0) return items;
        // Nao move se a parada destino for fixada ou concluida (entregues
        // ja ficam no topo + bloqueadas — nao pode jogar pendente entre elas)
        if (items[newIndex].fixada) {
          vibrar([100, 50, 100]);
          setAvisoLock(`Parada ${items[newIndex].ordem} está 🔒 fixada — vá em Detalhes pra liberar.`);
          setTimeout(() => setAvisoLock(null), 3000);
          return items;
        }
        if (items[newIndex].concluida_em) {
          vibrar([100, 50, 100]);
          setAvisoLock(`Parada ${items[newIndex].ordem} ja foi entregue — nao pode ser reordenada.`);
          setTimeout(() => setAvisoLock(null), 3000);
          return items;
        }
        const moved = arrayMove(items, oldIndex, newIndex);
        // Renumera ordens
        return moved.map((p, i) => ({ ...p, ordem: i + 1 }));
      });
      vibrar([50, 30, 50]);
      bipeCurto();
      setDirty(true);
    },
    []
  );

  // Drag start: vibracao curta (sinal tatil de "ergueu"). Bloqueia se fixada
  // ou concluida (entregues nao podem ser remexidas — ja foi feito).
  const handleDragStart = useCallback(
    (event: { active: { id: string | number } }) => {
      const p = paradas.find((p) => p.id === event.active.id);
      if (p?.fixada) {
        vibrar([100, 50, 100]);
        setAvisoLock(`Parada ${p.ordem} está 🔒 fixada — vá em Detalhes pra liberar.`);
        setTimeout(() => setAvisoLock(null), 3000);
        return;
      }
      if (p?.concluida_em) {
        vibrar([100, 50, 100]);
        setAvisoLock(`Parada ${p.ordem} ja foi entregue — nao pode reordenar.`);
        setTimeout(() => setAvisoLock(null), 3000);
        return;
      }
      vibrar(40); // feedback de "ergueu"
    },
    [paradas]
  );

  const handleSalvarEdicao = useCallback(
    (mudancas: ParadaEditavel) => {
      if (!paradaEditando) return;
      setParadas((items) =>
        items.map((p) =>
          p.id === paradaEditando.id
            ? {
                ...p,
                fixada: mudancas.fixada,
                janela_horario: mudancas.janela_horario,
                observacao: mudancas.observacao,
              }
            : p
        )
      );
      setParadaEditando(null);
      setDirty(true);
    },
    [paradaEditando]
  );

  // ─── Inverter ordem completa ─────────────────────────────────────
  const handleInverter = useCallback(() => {
    setParadas((arr) => {
      const invertido = [...arr].reverse();
      return invertido.map((p, i) => ({ ...p, ordem: i + 1 }));
    });
    vibrar([40, 20, 40]);
    setDirty(true);
  }, []);

  // ─── Adicionar parada — fluxo em 3 passos ────────────────────────
  const handleCapturarNova = useCallback((dados: NotaCapturadaInput) => {
    setDadosNovaParada(dados);
    setModoAdicao('escolhendo');
  }, []);

  const handleConfirmarAdicao = useCallback(
    async (posicao: 'final' | 'reotimizar') => {
      if (!dadosNovaParada || !rotaInfo) return;
      setErroAdicionar(null);
      setModoAdicao('adicionando');

      try {
        // Se ha mudancas manuais nao salvas, persiste primeiro pra nao perder
        // (o backend trabalha em cima do que esta no DB)
        if (dirty) {
          const payloadSalvar = {
            paradas: paradas.map((p) => ({
              id: p.id,
              ordem: p.ordem,
              fixada: p.fixada,
              janela_horario: p.janela_horario,
              observacao: p.observacao,
            })),
          };
          const resSalvar = await fetch(`/api/routing/rota/${rotaInfo.id}/paradas`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payloadSalvar),
          });
          if (!resSalvar.ok) throw new Error(`pre-save falhou: HTTP ${resSalvar.status}`);
          setDirty(false);
        }

        // Adicionar a nova parada
        const res = await fetch(`/api/routing/rota/${rotaInfo.id}/paradas/adicionar`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            motorista_id: rotaInfo.motorista_id,
            empresa_id: rotaInfo.empresa_id,
            cep: dadosNovaParada.cep,
            numero: dadosNovaParada.numero,
            endereco: dadosNovaParada.endereco,
            posicao,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error ?? `HTTP ${res.status}`);
        }

        // Refetch da rota+paradas pra refletir a nova ordem
        const rotaRes = await fetch(`/api/routing/rota/${rotaInfo.id}`);
        const rotaData = (await rotaRes.json()) as RotaResponse;
        setParadas(rotaData.paradas);
        setRotaInfo(rotaData.rota);

        vibrar([50, 30, 50]);
        bipeCurto();
        setDadosNovaParada(null);
        setModoAdicao('fechado');
      } catch (err) {
        setErroAdicionar(`${(err as Error).message}`);
        setModoAdicao('escolhendo'); // volta pra tela de escolha
      }
    },
    [dadosNovaParada, rotaInfo, dirty, paradas]
  );

  const handleCancelarAdicao = useCallback(() => {
    setDadosNovaParada(null);
    setErroAdicionar(null);
    setModoAdicao('fechado');
  }, []);

  const handleSalvar = useCallback(async () => {
    if (!rotaId || !dirty) return;
    setSalvando(true);
    setErro(null);
    try {
      const payload = {
        paradas: paradas.map((p) => ({
          id: p.id,
          ordem: p.ordem,
          fixada: p.fixada,
          janela_horario: p.janela_horario,
          observacao: p.observacao,
        })),
      };
      const res = await fetch(`/api/routing/rota/${rotaId}/paradas`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));

      // Trata erro total (500), parcial (207) ou retorno com ok=false
      if (!res.ok || data.ok === false) {
        const erros = Array.isArray(data.erros) ? data.erros : [];
        let detalhe: string;
        if (erros.length > 0) {
          detalhe = erros
            .map((e: { id: string; message: string }) => `${e.id.slice(0, 8)}: ${e.message}`)
            .join(' | ');
        } else if (data.error) {
          // Erros estruturados de pass 1/3 (sem array `erros`) tem `error` + `detail`
          detalhe = data.detail ? `${data.error} — ${data.detail}` : data.error;
        } else {
          detalhe = `HTTP ${res.status}`;
        }
        throw new Error(`Salvou ${data.sucessos?.length ?? 0}/${payload.paradas.length}. ${detalhe}`);
      }

      // Verifica que todas as paradas foram realmente atualizadas no DB
      if (data.atualizadas !== payload.paradas.length) {
        throw new Error(
          `Esperava atualizar ${payload.paradas.length} paradas, banco confirmou ${data.atualizadas}. Verifique permissoes (RLS) ou IDs.`
        );
      }

      // Refetch da rota apos salvar — garante que o que esta na tela e o
      // que esta no banco. Antes a UI confiava no estado local; se o PATCH
      // falhasse silenciosamente, motorista via "Sem mudancas" mas no
      // proximo load voltava o antigo.
      const refetch = await fetch(`/api/routing/rota/${rotaId}`);
      if (refetch.ok) {
        const rotaData = (await refetch.json()) as RotaResponse;
        setParadas(rotaData.paradas);
        setRotaInfo(rotaData.rota);
      }

      setDirty(false);
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }, [rotaId, dirty, paradas]);

  if (!rotaId) {
    return (
      <div style={containerStyle}>
        <div role="alert" style={erroStyle}>
          ⚠️ Param <code>rota_id</code> obrigatorio na URL.
        </div>
      </div>
    );
  }

  if (carregando) {
    return <div style={containerStyle}>Carregando rota…</div>;
  }

  if (erro && paradas.length === 0) {
    return (
      <div style={containerStyle}>
        <div role="alert" style={erroStyle}>
          Erro ao carregar rota: {erro}
        </div>
      </div>
    );
  }

  // Calculos visuais dinamicos (atualizam ao reordenar)
  const distancias = distanciasEntreParadas(paradas);
  const kmEstimado = estimarKmTotal(paradas);
  const kmOriginal = rotaInfo?.distancia_total_km ?? kmEstimado;
  const kmExibido = dirty ? kmEstimado : kmOriginal;
  const minExibido = rotaInfo?.tempo_total_min ?? null;

  // Item 9 — Diff explicito quando reordenado.
  // Tempo estimado: usa proporcao km_estimado/km_original sobre o tempo
  // original (~ velocidade media constante). Aproximacao boa pra feedback.
  const diffKm = dirty ? kmEstimado - kmOriginal : 0;
  const diffMin =
    dirty && minExibido !== null && kmOriginal > 0
      ? Math.round((kmEstimado / kmOriginal - 1) * minExibido)
      : 0;
  const diffSinal = (n: number) => (n > 0 ? `+${n}` : `${n}`);
  const diffCor = (n: number) => (n > 0 ? '#dc2626' : n < 0 ? '#16a34a' : '#64748b');

  return (
    <div style={containerStyle}>
      <header style={headerStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Ajuste de Rota</h1>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => setModoAdicao('capturando')}
              title="adicionar parada"
              aria-label="adicionar parada"
              data-testid="btn-adicionar-parada"
              style={iconBtnStyle}
            >
              ➕
            </button>
            <button
              type="button"
              onClick={handleInverter}
              title="inverter rota completa"
              aria-label="inverter rota"
              data-testid="btn-inverter"
              disabled={paradas.length < 2}
              style={{ ...iconBtnStyle, opacity: paradas.length < 2 ? 0.4 : 1 }}
            >
              ⇅
            </button>
          </div>
        </div>
        <div style={{ fontSize: 13, color: '#475569', marginTop: 4 }}>
          {paradas.length} paradas · {dirty && '≈ '}{kmExibido.toFixed(1)} km
          {minExibido !== null && !dirty && <> · ≈ {Math.round(minExibido)} min</>}
        </div>
        {dirty && (
          <div
            data-testid="diff-impacto"
            style={{
              marginTop: 6,
              padding: '6px 10px',
              background: '#fff7ed',
              border: '1px solid #fed7aa',
              borderRadius: 6,
              fontSize: 12,
              display: 'flex',
              gap: 10,
              alignItems: 'center',
              // flexWrap evita overflow horizontal em iPhone SE/Mini (320-375px)
              flexWrap: 'wrap',
            }}
          >
            <span style={{ fontWeight: 700, color: '#9a3412' }}>↻ Mudou:</span>
            <span style={{ color: diffCor(diffKm), fontWeight: 600 }}>
              {diffSinal(parseFloat(diffKm.toFixed(1)))} km
            </span>
            {diffMin !== 0 && (
              <span style={{ color: diffCor(diffMin), fontWeight: 600 }}>
                {diffSinal(diffMin)} min
              </span>
            )}
            <span style={{ color: '#9a3412', marginLeft: 'auto', fontSize: 11 }}>
              (estimativa em linha reta)
            </span>
          </div>
        )}
      </header>

      {avisoLock && (
        <div role="alert" style={{ ...erroStyle, background: '#fef3c7', color: '#92400e' }}>
          {avisoLock}
        </div>
      )}

      {/* Mapa interativo (tap pino destaca card) */}
      <MapaRota
        paradas={paradas}
        altura={220}
        paradaSelecionada={paradaSelecionada}
        posicaoAtual={posicaoAtual}
        onParadaClick={(id) => {
          setParadaSelecionada(id);
          vibrar(30);
        }}
      />

      {/* Tabs */}
      <div role="tablist" style={tabsStyle}>
        <button
          role="tab"
          aria-selected={aba === 'ordenar'}
          onClick={() => setAba('ordenar')}
          style={{ ...tabStyle, ...(aba === 'ordenar' ? tabAtivoStyle : {}) }}
        >
          🎯 Ordenar
        </button>
        <button
          role="tab"
          aria-selected={aba === 'detalhes'}
          onClick={() => setAba('detalhes')}
          style={{ ...tabStyle, ...(aba === 'detalhes' ? tabAtivoStyle : {}) }}
        >
          ⚙️ Detalhes
        </button>
      </div>

      {/* Conteudo da aba ativa */}
      {aba === 'ordenar' ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={paradas.map((p) => p.id)} strategy={verticalListSortingStrategy}>
            {paradas.map((p, i) => (
              <div
                key={p.id}
                onClick={() => setParadaSelecionada(p.id === paradaSelecionada ? null : p.id)}
              >
                <SortableTijolinho
                  parada={p}
                  distanciaAnteriorKm={distancias[i]}
                  destacado={paradaSelecionada === p.id}
                />
              </div>
            ))}
          </SortableContext>
        </DndContext>
      ) : (
        <div>
          {paradas.map((p) => (
            <Tijolinho
              key={p.id}
              parada={p}
              modo="detalhes"
              onClickDetalhes={() => setParadaEditando(p)}
              destacado={paradaSelecionada === p.id}
            />
          ))}
        </div>
      )}

      {/* Salvar */}
      <button
        type="button"
        onClick={handleSalvar}
        disabled={!dirty || salvando}
        style={{
          ...botaoSalvarStyle,
          opacity: dirty && !salvando ? 1 : 0.4,
        }}
      >
        {salvando ? 'Salvando…' : dirty ? '💾 Salvar mudancas' : 'Sem mudancas'}
      </button>

      {erro && (
        <div role="alert" style={{ ...erroStyle, marginTop: 12 }}>
          {erro}
        </div>
      )}

      {paradaEditando && (
        <ModalHorario
          parada={paradaEditando}
          onSalvar={handleSalvarEdicao}
          onFechar={() => setParadaEditando(null)}
        />
      )}

      {/* Overlay 1: captura de CEP+numero (modoAdicao=capturando) */}
      {modoAdicao === 'capturando' && (
        <div
          role="dialog"
          aria-label="adicionar parada"
          data-testid="overlay-capturar"
          style={overlayStyle}
          onClick={handleCancelarAdicao}
        >
          <div style={overlayModalStyle} onClick={(e) => e.stopPropagation()}>
            <InputEnderecoNF
              numeroNF={(paradas.length ?? 0) + 1}
              onConfirmar={handleCapturarNova}
              onCancelar={handleCancelarAdicao}
            />
          </div>
        </div>
      )}

      {/* Overlay 2: escolha de posicao (modoAdicao=escolhendo|adicionando) */}
      {(modoAdicao === 'escolhendo' || modoAdicao === 'adicionando') && dadosNovaParada && (
        <div
          role="dialog"
          aria-label="onde adicionar a parada"
          data-testid="overlay-escolher"
          style={overlayStyle}
          onClick={modoAdicao === 'escolhendo' ? handleCancelarAdicao : undefined}
        >
          <div style={overlayModalStyle} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>
              Onde adicionar?
            </div>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>
              📍 {dadosNovaParada.endereco.logradouro}, {dadosNovaParada.numero}
            </div>

            <button
              type="button"
              onClick={() => handleConfirmarAdicao('reotimizar')}
              disabled={modoAdicao === 'adicionando'}
              data-testid="btn-reotimizar"
              style={{
                ...overlayBotaoPrincipal,
                background: '#16a34a',
                opacity: modoAdicao === 'adicionando' ? 0.5 : 1,
              }}
            >
              🎯 Reotimizar — melhor posição
              <div style={{ fontSize: 11, fontWeight: 400, marginTop: 2, opacity: 0.85 }}>
                Mantém ordem atual e encaixa onde gerar menos KM extra
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleConfirmarAdicao('final')}
              disabled={modoAdicao === 'adicionando'}
              data-testid="btn-final"
              style={{
                ...overlayBotaoPrincipal,
                background: '#2563eb',
                opacity: modoAdicao === 'adicionando' ? 0.5 : 1,
              }}
            >
              📍 Última entrega
              <div style={{ fontSize: 11, fontWeight: 400, marginTop: 2, opacity: 0.85 }}>
                Vai pro final da fila — depois você reorganiza se quiser
              </div>
            </button>

            <button
              type="button"
              onClick={handleCancelarAdicao}
              disabled={modoAdicao === 'adicionando'}
              style={overlayBotaoSecundario}
            >
              Cancelar
            </button>

            {modoAdicao === 'adicionando' && (
              <div role="status" style={{ marginTop: 12, fontSize: 13, color: '#475569', textAlign: 'center' }}>
                ⏳ Geocodificando e adicionando…
              </div>
            )}

            {erroAdicionar && (
              <div role="alert" style={{ ...erroStyle, marginTop: 12 }}>
                {erroAdicionar}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function AjusteRotaPage(): React.ReactElement {
  return (
    <Suspense fallback={<div style={containerStyle}>Carregando rota…</div>}>
      <AjusteRotaContent />
    </Suspense>
  );
}

// ─── SortableTijolinho ──────────────────────────────────────────────

function SortableTijolinho({
  parada,
  distanciaAnteriorKm,
  destacado,
}: {
  parada: Parada;
  distanciaAnteriorKm?: number;
  destacado?: boolean;
}) {
  // Bloqueado pra reorder: fixada (motorista lockou) OU concluida (ja entregue)
  const bloqueado = parada.fixada || Boolean(parada.concluida_em);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: parada.id,
    disabled: bloqueado,
  });

  // Listeners no wrapper inteiro = motorista pode prender o dedo em qualquer
  // ponto do tijolinho. touchAction:'none' impede o browser de rolar a pagina
  // enquanto o dnd-kit detecta o long-press. Long-press de 200ms (sensor) ja
  // garante que tap curto = selecionar (passa pro onClick do pai).
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : parada.concluida_em ? 0.55 : 1,
    touchAction: bloqueado ? 'auto' : 'none',
    cursor: bloqueado ? 'default' : 'grab',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...(bloqueado ? {} : listeners)}
      data-testid={`sortable-${parada.ordem}`}
    >
      <Tijolinho
        parada={parada}
        modo="ordenar"
        distanciaAnteriorKm={distanciaAnteriorKm}
        destacado={destacado}
        draggableHandle={
          // Handle visual (so dica) — listeners ja estao no wrapper inteiro.
          <span
            data-testid={`handle-${parada.ordem}`}
            style={{ padding: 4, fontSize: 14, color: '#94a3b8', pointerEvents: 'none', flexShrink: 0 }}
            aria-hidden="true"
          >
            ☰
          </span>
        }
      />
    </div>
  );
}

// ─── ESTILOS ────────────────────────────────────────────────────────

const containerStyle: React.CSSProperties = {
  maxWidth: 480,
  margin: '0 auto',
  padding: 12,
  // Safety net pra qualquer elemento que ultrapasse o limite — em telefones de
  // 320-375px (iPhone SE/Mini), evita scroll horizontal indesejado.
  overflowX: 'hidden',
  // Espacamento pra status bar e botoes do sistema (iPhone com notch)
  paddingTop: 'max(12px, env(safe-area-inset-top))',
  paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
};

const headerStyle: React.CSSProperties = {
  marginBottom: 10,
};

const tabsStyle: React.CSSProperties = {
  display: 'flex',
  gap: 4,
  marginTop: 12,
  marginBottom: 10,
  borderBottom: '1px solid #e2e8f0',
};

const tabStyle: React.CSSProperties = {
  flex: 1,
  padding: '10px',
  background: 'transparent',
  border: 'none',
  borderBottom: '2px solid transparent',
  color: '#64748b',
  fontWeight: 500,
  cursor: 'pointer',
  fontSize: 14,
};

const tabAtivoStyle: React.CSSProperties = {
  color: '#2563eb',
  borderBottomColor: '#2563eb',
  fontWeight: 700,
};

const botaoSalvarStyle: React.CSSProperties = {
  width: '100%',
  padding: '14px',
  marginTop: 16,
  fontSize: 16,
  fontWeight: 600,
  background: '#16a34a',
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
};

const iconBtnStyle: React.CSSProperties = {
  width: 32,
  height: 32,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#f1f5f9',
  border: '1px solid #cbd5e1',
  borderRadius: 6,
  fontSize: 16,
  cursor: 'pointer',
  padding: 0,
  flexShrink: 0,
  lineHeight: 1,
};

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 60,
  padding: 12,
};

const overlayModalStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: 12,
  padding: 16,
  width: '100%',
  maxWidth: 420,
  maxHeight: '92vh',
  overflowY: 'auto',
};

const overlayBotaoPrincipal: React.CSSProperties = {
  width: '100%',
  padding: '14px 16px',
  marginBottom: 8,
  fontSize: 15,
  fontWeight: 700,
  color: '#fff',
  border: 'none',
  borderRadius: 10,
  cursor: 'pointer',
  textAlign: 'left',
};

const overlayBotaoSecundario: React.CSSProperties = {
  width: '100%',
  padding: '10px',
  background: 'transparent',
  color: '#64748b',
  border: 'none',
  fontSize: 14,
  cursor: 'pointer',
};
