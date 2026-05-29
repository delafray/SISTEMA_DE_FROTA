'use client';

import type { ResultadoGeocoding } from '@/lib/routing/types';

interface ListaOpcoesEnderecoProps {
  opcoes: (ResultadoGeocoding & { distanciaKm?: number })[];
  onSelecionar: (opcao: ResultadoGeocoding) => void;
  onNenhumDesses: () => void;
}

/** Formata distância de forma legível: "2,3 km" ou "510 km" */
function formatarDistancia(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1).replace('.', ',')} km`;
  return `${Math.round(km)} km`;
}

/**
 * Extrai um label curto do endereço normalizado do Nominatim.
 * "Rua Augusta, 1500, Vila Buarque, São Paulo, SP, Brasil" → "Rua Augusta, 1500"
 * "Rua das Flores, 10, Centro, Campinas, SP, Brasil"       → "Rua das Flores, 10"
 */
function extrairLabelCurto(enderecoNormalizado: string): string {
  const partes = enderecoNormalizado.split(',').map((p) => p.trim());
  // Remove "Brasil" e UF do final
  const filtradas = partes.filter(
    (p) => p.toLowerCase() !== 'brasil' && !/^\d{5}-?\d{3}$/.test(p)
  );
  // Retorna as primeiras 2-3 partes como label e o restante como sublabel
  return filtradas.slice(0, 2).join(', ');
}

function extrairSublabel(enderecoNormalizado: string): string {
  const partes = enderecoNormalizado.split(',').map((p) => p.trim());
  const filtradas = partes.filter(
    (p) => p.toLowerCase() !== 'brasil' && !/^\d{5}-?\d{3}$/.test(p)
  );
  return filtradas.slice(2).join(', ');
}

export function ListaOpcoesEndereco({
  opcoes,
  onSelecionar,
  onNenhumDesses,
}: ListaOpcoesEnderecoProps): React.ReactElement {
  return (
    <div style={{ padding: '0 0 8px' }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: '#1e40af', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>🎤</span>
        <span>Qual endereço é o certo?</span>
      </div>

      <ul
        style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}
        aria-label="Opções de endereço"
        data-testid="lista-opcoes-endereco"
      >
        {opcoes.map((opcao, idx) => (
          <li key={`${opcao.lat}-${opcao.lng}-${idx}`}>
            <button
              type="button"
              data-testid={`opcao-endereco-${idx}`}
              onClick={() => onSelecionar(opcao)}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '12px 14px',
                borderRadius: 10,
                border: '1px solid #bfdbfe',
                background: '#eff6ff',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#1e3a8a' }}>
                    {extrairLabelCurto(opcao.endereco_normalizado)}
                  </div>
                  {extrairSublabel(opcao.endereco_normalizado) && (
                    <div style={{ fontSize: 12, color: '#475569', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {extrairSublabel(opcao.endereco_normalizado)}
                    </div>
                  )}
                </div>
                {opcao.distanciaKm !== undefined && (
                  <div style={{ fontSize: 12, color: '#64748b', whiteSpace: 'nowrap', flexShrink: 0, marginTop: 2 }}>
                    📍 {formatarDistancia(opcao.distanciaKm)}
                  </div>
                )}
              </div>
            </button>
          </li>
        ))}
      </ul>

      <button
        type="button"
        data-testid="btn-nenhum-desses"
        onClick={onNenhumDesses}
        style={{
          width: '100%',
          padding: '12px',
          fontSize: 14,
          background: 'transparent',
          color: '#64748b',
          border: '1px dashed #cbd5e1',
          borderRadius: 8,
          cursor: 'pointer',
          marginTop: 8,
        }}
      >
        Nenhum desses — digitar o CEP
      </button>
    </div>
  );
}
