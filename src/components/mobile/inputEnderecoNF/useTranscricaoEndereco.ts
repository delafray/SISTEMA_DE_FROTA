'use client';

/**
 * useTranscricaoEndereco — processa o texto falado pelo motorista.
 *
 * Dois caminhos:
 *   1. O texto contém um CEP (ex: "zero um três um zero cem") → extrai e seta.
 *   2. O texto é um endereço livre (ex: "Afonso Pena 341") → geocoda via
 *      /api/routing/geocodar, calcula distância GPS se disponível e devolve
 *      a lista de opções pro motorista escolher.
 *
 * O estado `buscandoEndereco` e a função `handleTranscricao` são expostos.
 * O callback `onOpcoesProntas` recebe as opções + o texto original (pra extrair
 * o número depois que o motorista escolher).
 * O callback `onCepExtraido` é chamado quando a transcrição continha um CEP direto.
 * Erros são reportados via `onErro`.
 */

import { useCallback, useState } from 'react';
import { extrairCepDeTranscricao } from '@/lib/cep/extrairCepPorVoz';
import { calcularDistanciaKm } from '@/lib/routing/geocoding';
import type { ResultadoGeocoding } from '@/lib/routing/types';

export type OpcaoFala = ResultadoGeocoding & { distanciaKm?: number };

interface UseTranscricaoEnderecoParams {
  /** Chamado quando a fala continha um CEP diretamente extraído. */
  onCepExtraido: (cep: string) => void;
  /** Chamado com a lista de opções de geocoding + o texto original. */
  onOpcoesProntas: (opcoes: OpcaoFala[], textoOriginal: string) => void;
  /** Chamado em caso de erro de busca. */
  onErro: (mensagem: string) => void;
}

interface UseTranscricaoEnderecoReturn {
  buscandoEndereco: boolean;
  handleTranscricao: (texto: string) => Promise<void>;
}

export function useTranscricaoEndereco({
  onCepExtraido,
  onOpcoesProntas,
  onErro,
}: UseTranscricaoEnderecoParams): UseTranscricaoEnderecoReturn {
  const [buscandoEndereco, setBuscandoEndereco] = useState(false);

  const handleTranscricao = useCallback(async (texto: string) => {
    // 1. Tenta extrair CEP direto da transcrição
    const cepExtraido = extrairCepDeTranscricao(texto);
    if (cepExtraido) {
      onCepExtraido(cepExtraido);
      return;
    }

    // 2. Texto muito curto pra ser um endereço
    if (texto.trim().length < 5) return;

    setBuscandoEndereco(true);

    try {
      // Tenta obter localização do usuário para ordenar por proximidade
      let userLat: number | undefined;
      let userLng: number | undefined;
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation?.getCurrentPosition(resolve, reject, {
            timeout: 3000,
            maximumAge: 60000,
          });
        });
        userLat = pos.coords.latitude;
        userLng = pos.coords.longitude;
      } catch {
        // Sem GPS ou sem permissão — geocoda sem coordenadas
      }

      // Monta URL com coordenadas se disponíveis
      const params = new URLSearchParams({ q: texto, limite: '5' });
      if (userLat !== undefined && userLng !== undefined) {
        params.set('lat', String(userLat));
        params.set('lng', String(userLng));
      }

      const res = await fetch(`/api/routing/geocodar?${params.toString()}`);
      const data = await res.json() as { resultados?: ResultadoGeocoding[] };

      if (res.ok && data.resultados && data.resultados.length > 0) {
        // Anota distância pra cada opção
        const comDistancia: OpcaoFala[] = data.resultados.map((r) => ({
          ...r,
          distanciaKm:
            userLat !== undefined && userLng !== undefined
              ? calcularDistanciaKm(userLat, userLng, r.lat, r.lng)
              : undefined,
        }));

        // SEMPRE mostra a lista (mesmo com 1 resultado) — motorista precisa
        // confirmar visualmente que é o endereço certo.
        onOpcoesProntas(comDistancia, texto);
      } else {
        onErro('Não encontrei esse endereço. Tente novamente ou use o CEP.');
      }
    } catch {
      onErro('Erro ao buscar endereço falado.');
    } finally {
      setBuscandoEndereco(false);
    }
  }, [onCepExtraido, onOpcoesProntas, onErro]);

  return { buscandoEndereco, handleTranscricao };
}
