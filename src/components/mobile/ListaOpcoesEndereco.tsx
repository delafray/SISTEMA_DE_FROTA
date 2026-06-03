'use client';

import type { ResultadoGeocoding } from '@/lib/routing/types';
import { cores } from '@/lib/mobile/ui';

interface ListaOpcoesEnderecoProps {
  opcoes: (ResultadoGeocoding & { distanciaKm?: number })[];
  onSelecionar: (opcao: ResultadoGeocoding) => void;
  onNenhumDesses: () => void;
  /** Numero da casa extraido da fala (ex: "Afonso Pena 341" → "341"). Usado
   *  como fallback no card quando o Nominatim nao devolve house_number, pra o
   *  motorista ja ver "Afonso Pena, 341" e confirmar de uma vez. */
  numeroFala?: string;
}

/** Formata distância de forma legível: "2,3 km" ou "510 km" */
function formatarDistancia(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1).replace('.', ',')} km`;
  return `${Math.round(km)} km`;
}

/** Formata CEP "30130110" → "30130-110". Devolve null se nao for 8 digitos. */
function formatarCep(cep?: string): string | null {
  const d = (cep ?? '').replace(/\D/g, '');
  if (d.length !== 8) return null;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
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
  numeroFala,
}: ListaOpcoesEnderecoProps): React.ReactElement {
  return (
    <div style={{ padding: '0 0 8px' }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: cores.azulTexto, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>🎤</span>
        <span>Qual endereço é o certo?</span>
      </div>

      <ul
        style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}
        aria-label="Opções de endereço"
        data-testid="lista-opcoes-endereco"
      >
        {opcoes.map((opcao, idx) => {
          // Numero a exibir: o do Nominatim (raro no BR) ou o que o motorista
          // falou. Assim o card ja mostra "Afonso Pena, 341" e ele confirma de
          // uma vez, sem a tela separada de digitar o numero.
          const numeroExibido = opcao.numero ?? numeroFala;
          const cepFmt = formatarCep(opcao.cep);
          // CEP validado (1 unico) → mostra. Varios CEPs → avisa sem chutar.
          // Nenhum → nao mostra nada (nunca o postcode cru do Nominatim).
          const cepSegmento = cepFmt
            ? `CEP ${cepFmt}`
            : opcao.cepMultiplos
              ? 'vários CEPs nesta rua'
              : null;
          return (
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
                border: `1px solid ${cores.bordaAzul}`,
                background: cores.fundoAzul,
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* Linha 1: logradouro + numero (numero falado como fallback) */}
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#1e3a8a', wordBreak: 'break-word' }}>
                    {opcao.logradouro
                      ? `${opcao.logradouro}${numeroExibido ? `, ${numeroExibido}` : ''}`
                      : extrairLabelCurto(opcao.endereco_normalizado)}
                  </div>
                  {/* Linha 2: CEP · bairro · cidade/UF (info pra desambiguar) */}
                  {(cepSegmento || opcao.bairro || opcao.cidade) ? (
                    <div style={{ fontSize: 12, color: cores.textoMedio, marginTop: 2, wordBreak: 'break-word' }}>
                      {cepSegmento && (
                        <span style={cepFmt ? undefined : { fontStyle: 'italic', color: cores.textoSuave }}>
                          {cepSegmento}
                        </span>
                      )}
                      {cepSegmento && (opcao.bairro || opcao.cidade || opcao.uf) ? ' · ' : ''}
                      {opcao.bairro && <strong>{opcao.bairro}</strong>}
                      {opcao.bairro && (opcao.cidade || opcao.uf) ? ' · ' : ''}
                      {opcao.cidade}
                      {opcao.cidade && opcao.uf ? `/${opcao.uf}` : opcao.uf ?? ''}
                    </div>
                  ) : extrairSublabel(opcao.endereco_normalizado) && (
                    <div style={{ fontSize: 12, color: cores.textoMedio, marginTop: 2, wordBreak: 'break-word' }}>
                      {extrairSublabel(opcao.endereco_normalizado)}
                    </div>
                  )}
                </div>
                {opcao.distanciaKm !== undefined && (
                  <div style={{ fontSize: 12, color: cores.textoFraco, whiteSpace: 'nowrap', flexShrink: 0, marginTop: 2 }}>
                    📍 {formatarDistancia(opcao.distanciaKm)}
                  </div>
                )}
              </div>
            </button>
          </li>
          );
        })}
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
          color: cores.textoFraco,
          border: `1px dashed ${cores.bordaForte}`,
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
