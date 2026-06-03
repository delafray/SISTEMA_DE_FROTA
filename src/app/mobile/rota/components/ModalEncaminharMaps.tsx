'use client';

/**
 * Modal "Encaminhar rota ao Google Maps": o motorista escolhe até 9 paradas
 * pendentes (limite da plataforma) e abre um link multistop. Usa link <a> real
 * (não window.open) pra não sofrer bloqueio de popup no mobile.
 */

import { useCallback, useMemo, useState } from 'react';
import { googleMapsMultiStopNav, type AlvoNavegacao } from '@/lib/routing/deepLinks';
import { formatarRua } from '@/lib/routing/formatParada';
import type { Parada } from '@/lib/routing/types';
import { vibrar } from '@/lib/mobile/dispositivo';
import { alvoDe } from '../alvoDe';

const MAX_BLOCO_MAPS = 9; // origem (GPS) + 9 = limite do Google Maps

export function ModalEncaminharMaps({
  paradas,
  onFechar,
}: {
  paradas: Parada[];
  onFechar: () => void;
}) {
  // So paradas pendentes (concluidas ja foram). Ordem = ordem da rota.
  const pendentes = useMemo(() => paradas.filter((p) => !p.concluida_em), [paradas]);

  // Default: as 9 primeiras pendentes ja vem marcadas. Motorista pode
  // desmarcar (ex: sabe que o local vai estar fechado) sem reotimizar.
  const [selecionados, setSelecionados] = useState<Set<string>>(
    () => new Set(pendentes.slice(0, MAX_BLOCO_MAPS).map((p) => p.id))
  );

  const toggle = useCallback((id: string) => {
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < MAX_BLOCO_MAPS) {
        next.add(id);
        vibrar(10);
      } else {
        vibrar([10, 40, 10]); // teto atingido — buzz negativo
      }
      return next;
    });
  }, []);

  const qtd = selecionados.size;

  // URL do Maps montada REATIVAMENTE (na ordem da rota), usada como href de um
  // link <a> de verdade. Por que: `window.open(...)` via script era barrado pelo
  // bloqueador de popup do mobile na 1a vez — o motorista precisava clicar duas
  // vezes. Navegacao por <a target="_blank"> e gesto direto do usuario e NAO
  // sofre esse bloqueio (abre de primeira).
  const urlMaps = useMemo(() => {
    const alvos: AlvoNavegacao[] = pendentes
      .filter((p) => selecionados.has(p.id))
      .map((p) => alvoDe(p));
    return alvos.length > 0 ? googleMapsMultiStopNav(alvos) : null;
  }, [pendentes, selecionados]);

  const aoImportar = useCallback(() => {
    // Nao previne o default: o proprio <a> faz a navegacao pro Google Maps.
    vibrar(30);
    onFechar();
  }, [onFechar]);

  const estiloBotaoImportar = {
    display: 'block',
    width: '100%',
    boxSizing: 'border-box' as const,
    padding: '13px',
    color: '#fff',
    border: 'none',
    borderRadius: 10,
    fontSize: 15,
    fontWeight: 700,
    textAlign: 'center' as const,
    textDecoration: 'none',
  };

  const botaoImportar = urlMaps ? (
    <a
      href={urlMaps}
      target="_blank"
      rel="noopener noreferrer"
      onClick={aoImportar}
      data-testid="btn-importar-maps"
      style={{ ...estiloBotaoImportar, background: '#16a34a', cursor: 'pointer' }}
    >
      🌍 Importar para o Maps{qtd > 0 ? ` (${qtd})` : ''}
    </a>
  ) : (
    <button
      type="button"
      disabled
      data-testid="btn-importar-maps"
      style={{ ...estiloBotaoImportar, background: '#cbd5e1', cursor: 'default' }}
    >
      🌍 Importar para o Maps
    </button>
  );

  return (
    <div
      role="dialog"
      aria-label="encaminhar rota ao google maps"
      data-testid="modal-encaminhar-maps"
      onClick={onFechar}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 80,
        padding: 12,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: 16,
          width: '100%',
          maxWidth: 460,
          maxHeight: '88vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Cabecalho */}
        <div style={{ padding: '16px 16px 10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#0f172a' }}>Encaminhar ao Google Maps</div>
            <button
              type="button"
              onClick={onFechar}
              aria-label="fechar"
              style={{ background: 'transparent', border: 'none', fontSize: 22, color: '#94a3b8', cursor: 'pointer', lineHeight: 1 }}
            >
              ×
            </button>
          </div>
          <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
            Escolha até {MAX_BLOCO_MAPS} paradas deste bloco · {qtd}/{MAX_BLOCO_MAPS} selecionadas
          </div>
        </div>

        {/* Botao topo */}
        <div style={{ padding: '0 16px 10px' }}>{botaoImportar}</div>

        {/* Lista de tijolos */}
        <div style={{ overflowY: 'auto', padding: '0 16px', flex: 1 }}>
          {pendentes.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', color: '#64748b', fontSize: 14 }}>
              Nenhuma parada pendente.
            </div>
          )}
          {pendentes.map((p) => {
            const marcada = selecionados.has(p.id);
            const bloqueada = !marcada && qtd >= MAX_BLOCO_MAPS;
            return (
              <button
                type="button"
                key={p.id}
                onClick={() => toggle(p.id)}
                data-testid={`tijolo-encaminhar-${p.ordem}`}
                aria-pressed={marcada}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  width: '100%',
                  textAlign: 'left',
                  marginBottom: 8,
                  padding: '12px',
                  borderRadius: 12,
                  border: marcada ? '2px solid #16a34a' : '1px solid #e2e8f0',
                  background: marcada ? '#f0fdf4' : '#fff',
                  opacity: bloqueada ? 0.45 : 1,
                  cursor: 'pointer',
                }}
              >
                <div
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 6,
                    flexShrink: 0,
                    border: marcada ? 'none' : '2px solid #cbd5e1',
                    background: marcada ? '#16a34a' : 'transparent',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 15,
                    fontWeight: 700,
                  }}
                >
                  {marcada ? '✓' : ''}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: '#0f172a' }}>
                    {p.ordem}. {formatarRua(p.endereco)}
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>
                    {p.endereco.bairro ? `${p.endereco.bairro} · ` : ''}
                    {p.endereco.cidade}/{p.endereco.uf}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Botao rodape */}
        <div style={{ padding: '10px 16px 16px', borderTop: '1px solid #f1f5f9' }}>{botaoImportar}</div>
      </div>
    </div>
  );
}
