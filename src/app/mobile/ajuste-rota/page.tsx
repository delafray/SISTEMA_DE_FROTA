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

import { useCallback, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { MapaRota } from '@/components/MapaRota';
import { Tijolinho } from './components/Tijolinho';
import { ModalHorario, type ParadaEditavel } from './components/ModalHorario';
import { InputEnderecoNF, type NotaCapturadaInput } from '@/components/mobile/InputEnderecoNF';
import { distanciasEntreParadas, estimarKmTotal } from '@/lib/routing/utils';
import { vibrar } from '@/lib/mobile/dispositivo';
import { cores } from '@/lib/mobile/ui';
import { fetchRota } from '@/lib/routing/api';
import type { Parada } from '@/lib/routing/types';

// Componentes e estilos extraidos
import { useAjusteRota } from './_components/useAjusteRota';
import { bipeCurto } from './_components/utils';
import { HeaderAjusteRota } from './_components/HeaderAjusteRota';
import { PopupAdicao } from './_components/PopupAdicao';
import { AbaOrdenar } from './_components/AbaOrdenar';
import { OverlayEscolherPosicao } from './_components/OverlayEscolherPosicao';
import {
  containerStyle,
  tabsStyle,
  tabStyle,
  tabAtivoStyle,
  botaoSalvarStyle,
  erroStyle,
  overlayStyle,
  overlayModalStyle,
} from './_components/estilos';

type Aba = 'ordenar' | 'detalhes';

function AjusteRotaContent(): React.ReactElement {
  const searchParams = useSearchParams();
  const rotaId = searchParams.get('rota_id') ?? '';

  // ─── Estado carregado pelo hook ──────────────────────────────────
  const {
    paradas,
    setParadas,
    rotaInfo,
    setRotaInfo,
    carregando,
    erro,
    setErro,
    dirty,
    setDirty,
    posicaoAtual,
  } = useAjusteRota(rotaId);

  // ─── Estado local da tela ────────────────────────────────────────
  const [aba, setAba] = useState<Aba>('ordenar');
  const [salvando, setSalvando] = useState(false);
  const [paradaEditando, setParadaEditando] = useState<Parada | null>(null);
  const [paradaSelecionada, setParadaSelecionada] = useState<string | null>(null);
  const [avisoLock, setAvisoLock] = useState<string | null>(null);
  // Fluxo de adicionar nova parada via header:
  //   fechado → capturando (CEP) → escolhendo (posicao) → adicionando (POST) → fechado
  const [modoAdicao, setModoAdicao] = useState<'fechado' | 'capturando' | 'escolhendo' | 'adicionando'>('fechado');
  const [dadosNovaParada, setDadosNovaParada] = useState<NotaCapturadaInput | null>(null);
  const [erroAdicionar, setErroAdicionar] = useState<string | null>(null);
  // Popup do ➕ (decisao do dono 10/06): rota ainda NAO iniciada → perguntar se
  // quer CONTINUAR a roteirizacao em lote (ex.: parou na 25a de 70 notas) ou so
  // adicionar UM endereco. Rota ja iniciada (tem baixa) → vai direto no unico.
  const [escolhendoAdicao, setEscolhendoAdicao] = useState(false);
  const [reorganizando, setReorganizando] = useState(false);

  // Pointer p/ mouse + Touch p/ dedo. Ambos com long-press de 200ms — assim
  // tap curto continua selecionando a parada no mapa, mas segurar 200ms ativa
  // o drag (sem conflito com o scroll vertical da pagina).
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  );

  // ─── Drag handlers ──────────────────────────────────────────────
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
    [setDirty, setParadas]
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

  // ─── Edicao de parada (ModalHorario) ────────────────────────────
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
    [paradaEditando, setParadas, setDirty]
  );

  // ─── Inverter ordem completa ─────────────────────────────────────
  const handleInverter = useCallback(() => {
    setParadas((arr) => {
      const invertido = [...arr].reverse();
      return invertido.map((p, i) => ({ ...p, ordem: i + 1 }));
    });
    vibrar([40, 20, 40]);
    setDirty(true);
  }, [setParadas, setDirty]);

  // ─── Reorganizar: roteiriza tudo de novo (VROOM) ─────────────────
  // Pega as paradas pendentes e pede pro VROOM reordenar do zero a partir do
  // GPS do motorista. Igual ao Inverter, so altera a ordem local + marca dirty
  // — o motorista revisa e salva. Entregues ficam pinadas no topo.
  const handleReorganizar = useCallback(async () => {
    if (!rotaId) return;
    if (paradas.filter((p) => !p.concluida_em).length < 2) return;
    setReorganizando(true);
    setAvisoLock(null);
    try {
      const res = await fetch(`/api/routing/rota/${rotaId}/reorganizar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ origem: posicaoAtual ?? undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) {
        vibrar([100, 50, 100]);
        setAvisoLock('Nao consegui reorganizar agora — tente de novo.');
        setTimeout(() => setAvisoLock(null), 3500);
        return;
      }
      const novaOrdem: { id: string; ordem: number }[] = data.paradas ?? [];
      if (novaOrdem.length === 0) return;
      const ordemMap = new Map(novaOrdem.map((o) => [o.id, o.ordem]));
      setParadas((arr) =>
        [...arr]
          .sort((a, b) => (ordemMap.get(a.id) ?? a.ordem) - (ordemMap.get(b.id) ?? b.ordem))
          .map((p, i) => ({ ...p, ordem: i + 1 }))
      );
      vibrar([30, 20, 30, 20, 60]);
      setDirty(true);
      const naoAtendidas: string[] = data.nao_atendidas ?? [];
      if (naoAtendidas.length > 0) {
        setAvisoLock(`${naoAtendidas.length} parada(s) o sistema nao encaixou — ficaram no fim.`);
        setTimeout(() => setAvisoLock(null), 4000);
      }
    } catch {
      vibrar([100, 50, 100]);
      setAvisoLock('Erro de rede ao reorganizar.');
      setTimeout(() => setAvisoLock(null), 3500);
    } finally {
      setReorganizando(false);
    }
  }, [rotaId, paradas, posicaoAtual, setParadas, setDirty]);

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
        const rotaData = await fetchRota(rotaInfo.id);
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
    [dadosNovaParada, rotaInfo, dirty, paradas, setParadas, setRotaInfo, setDirty]
  );

  const handleCancelarAdicao = useCallback(() => {
    setDadosNovaParada(null);
    setErroAdicionar(null);
    setModoAdicao('fechado');
  }, []);

  // ─── Salvar ──────────────────────────────────────────────────────
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
      try {
        const rotaData = await fetchRota(rotaId);
        setParadas(rotaData.paradas);
        setRotaInfo(rotaData.rota);
      } catch {
        // Refetch falhou (offline/erro) — mantem o estado local salvo.
      }

      setDirty(false);
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setSalvando(false);
    }
  }, [rotaId, dirty, paradas, setParadas, setRotaInfo, setDirty, setErro]);

  // ─── Guards de carregamento ──────────────────────────────────────
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

  // ─── Calculos visuais dinamicos (atualizam ao reordenar) ─────────
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

  return (
    <div style={containerStyle}>
      {/* Popup do ➕: continuar o lote OU adicionar um endereco */}
      {escolhendoAdicao && rotaInfo && (
        <PopupAdicao
          paradasLength={paradas.length}
          urlContinuarLote={`/mobile/rota?motorista_id=${rotaInfo.motorista_id}&empresa_id=${rotaInfo.empresa_id}&continuar=${rotaInfo.id}`}
          onAdicionarUm={() => { setEscolhendoAdicao(false); setModoAdicao('capturando'); }}
          onFechar={() => setEscolhendoAdicao(false)}
        />
      )}

      <HeaderAjusteRota
        paradas={paradas}
        dirty={dirty}
        kmExibido={kmExibido}
        minExibido={minExibido}
        diffKm={diffKm}
        diffMin={diffMin}
        reorganizando={reorganizando}
        onAdicionar={() => {
          // rota ja iniciada (alguma baixa)? adicionar unico direto.
          if (paradas.some((p) => p.concluida_em)) setModoAdicao('capturando');
          else setEscolhendoAdicao(true);
        }}
        onInverter={handleInverter}
        onReorganizar={handleReorganizar}
      />

      {avisoLock && (
        <div role="alert" style={{ ...erroStyle, background: cores.fundoAmbarClaro, color: cores.textoAmbar }}>
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
        <AbaOrdenar
          paradas={paradas}
          sensors={sensors}
          distancias={distancias}
          paradaSelecionada={paradaSelecionada}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onParadaClick={(id) => setParadaSelecionada(id === paradaSelecionada ? null : id)}
        />
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
        <OverlayEscolherPosicao
          dadosNovaParada={dadosNovaParada}
          modoAdicao={modoAdicao}
          erroAdicionar={erroAdicionar}
          onConfirmar={handleConfirmarAdicao}
          onCancelar={handleCancelarAdicao}
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

