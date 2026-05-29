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
import { distanciasEntreParadas, estimarKmTotal } from '@/lib/routing/utils';
import type { Parada, RotaOtimizada } from '@/lib/routing/types';

function vibrar(pattern: number | number[]) {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    navigator.vibrate(pattern);
  }
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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  );

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
        setParadas(data.paradas);
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
        // Nao move se a parada destino for fixada (mantem posicao)
        if (items[newIndex].fixada) {
          vibrar([100, 50, 100]);
          setAvisoLock(`Parada ${items[newIndex].ordem} está 🔒 fixada — vá em Detalhes pra liberar.`);
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

  // Drag start: vibracao curta (sinal tatil de "ergueu"). Bloqueia se fixada.
  const handleDragStart = useCallback(
    (event: { active: { id: string | number } }) => {
      const p = paradas.find((p) => p.id === event.active.id);
      if (p?.fixada) {
        vibrar([100, 50, 100]);
        setAvisoLock(`Parada ${p.ordem} está 🔒 fixada — vá em Detalhes pra liberar.`);
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
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
        <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Ajuste de Rota</h1>
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
              gap: 12,
              alignItems: 'center',
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
        altura={280}
        paradaSelecionada={paradaSelecionada}
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
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: parada.id,
    disabled: parada.fixada,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <Tijolinho
        parada={parada}
        modo="ordenar"
        distanciaAnteriorKm={distanciaAnteriorKm}
        destacado={destacado}
        draggableHandle={
          <span
            {...listeners}
            data-testid={`handle-${parada.ordem}`}
            style={{ padding: 8, cursor: 'grab', fontSize: 18, color: '#94a3b8' }}
            aria-label="arrastar"
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
  padding: 16,
};

const headerStyle: React.CSSProperties = {
  marginBottom: 12,
};

const tabsStyle: React.CSSProperties = {
  display: 'flex',
  gap: 4,
  marginTop: 16,
  marginBottom: 12,
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
