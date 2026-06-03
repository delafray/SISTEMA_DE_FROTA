'use client';

/**
 * Fase "em rota" da tela do motorista: barra de progresso, mapa interativo,
 * card destacado da próxima parada, lista das demais (com concluídas no fim),
 * bottom sheet ao tocar no pino, modal de confirmação de entrega (com
 * aprendizado deliberado do ponto) e modal de encaminhar pro Google Maps.
 */

import { useCallback, useMemo, useState } from 'react';
import { MapaRota } from '@/components/MapaRota';
import { wazeNav, googleMapsNav } from '@/lib/routing/deepLinks';
import { formatarRua, formatarBairroCidade, formatarJanelas } from '@/lib/routing/formatParada';
import { statusDaParada } from '@/lib/routing/utils';
import type { Parada, RotaOtimizada } from '@/lib/routing/types';
import { vibrar } from '@/lib/mobile/dispositivo';
import { alvoDe } from '../alvoDe';
import {
  proximaCardStyle, numeroStyle, btnLinkStyle, btnEncerrarStyle, paradaItemStyle, btnNavStyle,
} from '../styles';
import { BottomSheet } from './BottomSheet';
import { ModalEncaminharMaps } from './ModalEncaminharMaps';

export function FaseEmRota({
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
  onConcluirParada: (id: string, aprenderPonto?: boolean) => void | Promise<void>;
  onEncerrar: () => void;
  posicaoAtual: { lat: number; lng: number } | null;
}) {
  // Proxima parada = primeira nao concluida
  const proximaParada = paradas.find((p) => !p.concluida_em) ?? null;

  // Lista abaixo do card grande: NAO repete a proxima (ja esta destacada no
  // card) e empurra as entregas FEITAS pro fim da fila. Ordem: pendentes
  // restantes (na ordem da rota) → concluidas no rodape.
  const listaParadas = useMemo(() => {
    const pendentes = paradas.filter((p) => !p.concluida_em && p.id !== proximaParada?.id);
    const feitas = paradas.filter((p) => p.concluida_em);
    return [...pendentes, ...feitas];
  }, [paradas, proximaParada]);

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

  // Modal "Encaminhar rota ao Google" — motorista escolhe ate 9 paradas e
  // manda o bloco pro Google Maps (multistop).
  const [mostrarEncaminhar, setMostrarEncaminhar] = useState(false);
  const confirmarConcluir = useCallback(async () => {
    if (!paradaConfirmando) return;
    const id = paradaConfirmando;
    setParadaConfirmando(null);
    await onConcluirParada(id, false);
  }, [paradaConfirmando, onConcluirParada]);

  // Aprendizado DELIBERADO: conclui a entrega E grava o GPS atual como o
  // endereco correto (vira coord 'aprendida', azul, prioridade maxima).
  const confirmarConcluirEAprender = useCallback(async () => {
    if (!paradaConfirmando) return;
    const id = paradaConfirmando;
    setParadaConfirmando(null);
    await onConcluirParada(id, true);
  }, [paradaConfirmando, onConcluirParada]);

  return (
    <div>

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

      {/* Discreto: encaminhar um bloco de ate 9 paradas pro Google Maps */}
      <button
        type="button"
        onClick={() => setMostrarEncaminhar(true)}
        data-testid="btn-encaminhar-google"
        style={{
          marginTop: 8,
          width: '100%',
          padding: '8px',
          background: 'transparent',
          border: 'none',
          color: '#64748b',
          fontSize: 13,
          fontWeight: 600,
          cursor: 'pointer',
          textDecoration: 'underline',
        }}
      >
        📤 Encaminhar rota ao Google
      </button>

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
                {formatarRua(proximaParada.endereco, { cep: true })}
              </div>
              <div style={{ fontSize: 13, color: '#64748b' }}>
                {formatarBairroCidade(proximaParada.endereco)}
              </div>
              {formatarJanelas(proximaParada.janela_horario) && (
                <div style={{ fontSize: 12, color: '#92400e', marginTop: 4, fontWeight: 600 }}>
                  ⏰ {formatarJanelas(proximaParada.janela_horario)}
                </div>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
            <a href={wazeNav(alvoDe(proximaParada))} target="_blank" rel="noreferrer" style={btnNavStyle('#2563eb')}>
              🗺️ Waze
            </a>
            <a href={googleMapsNav(alvoDe(proximaParada))} target="_blank" rel="noreferrer" style={btnNavStyle('#16a34a')}>
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
        {listaParadas.map((p) => {
          // status calculado contra a ordem ORIGINAL (nao a posicao na lista
          // reordenada). A proxima nao aparece aqui (esta no card), entao os
          // itens sao 'pendente'/'fixada'/'concluida' — nunca 'proxima'.
          const status = statusDaParada(p, paradas.indexOf(p), paradas);
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
                    {formatarRua(p.endereco, { cep: true })}
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                    {formatarBairroCidade(p.endereco)}
                  </div>
                  {p.observacao && (
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>💬 {p.observacao}</div>
                  )}
                  {formatarJanelas(p.janela_horario) && (
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                      ⏰ {formatarJanelas(p.janela_horario)}
                    </div>
                  )}
                </div>
              </div>
              {!concluida && (
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }} onClick={(e) => e.stopPropagation()}>
                  <a href={wazeNav(alvoDe(p))} target="_blank" rel="noreferrer" style={btnNavStyle('#2563eb')}>
                    🗺️ Waze
                  </a>
                  <a href={googleMapsNav(alvoDe(p))} target="_blank" rel="noreferrer" style={btnNavStyle('#16a34a')}>
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

            {/* Aprendizado deliberado — bem separado, embaixo. So aparece com
                GPS. Marca o ponto ATUAL como o endereco correto (azul, vence
                Google/ViaCEP nas proximas rotas). E a UNICA forma de aprender. */}
            <div style={{ borderTop: '1px solid #e2e8f0', marginTop: 14, paddingTop: 12 }}>
              <button
                type="button"
                onClick={confirmarConcluirEAprender}
                disabled={!posicaoAtual}
                data-testid="btn-aprender-ponto"
                style={{
                  width: '100%',
                  padding: '10px',
                  background: posicaoAtual ? '#eff6ff' : '#f1f5f9',
                  color: posicaoAtual ? '#1d4ed8' : '#94a3b8',
                  border: `1px solid ${posicaoAtual ? '#bfdbfe' : '#e2e8f0'}`,
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: posicaoAtual ? 'pointer' : 'not-allowed',
                }}
              >
                📍 Estou na porta — marcar este ponto como o endereço correto
              </button>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6, textAlign: 'center' }}>
                {posicaoAtual
                  ? 'Use só quando estiver parado na porta da entrega.'
                  : 'Sem GPS no momento — não dá pra marcar o ponto.'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: encaminhar bloco de ate 9 paradas pro Google Maps */}
      {mostrarEncaminhar && (
        <ModalEncaminharMaps paradas={paradas} onFechar={() => setMostrarEncaminhar(false)} />
      )}
    </div>
  );
}
