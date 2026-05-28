/**
 * Utilitario "estimar rota A→B" pra integracao futura com Frete/Entrega.
 *
 * Hoje a tabela `entregas` (existente no projeto) NAO tem campo `km_estimado`
 * nem coordenadas pra origem/destino — adicionar isso e tarefa de
 * **consolidacao** entre o sistema novo (modulo isolado) e o sistema atual.
 *
 * Esta funcao fica documentada e testada, pronta pra ser chamada quando a
 * consolidacao acontecer. Ela faz o pipeline completo:
 *   1. ViaCEP (consulta endereco) — pulando se ja for fornecido
 *   2. Nominatim (geocoding) — converte string em lat/lng
 *   3. OSRM (rota A→B) — devolve km e polyline pra desenhar no mapa
 *
 * Referencia: PLANO_ROTEIRIZACAO.md passo 1.14 (integracao com Frete).
 */

import { consultarCEP } from '@/lib/cep/viacep';
import { geocodar, formatarEnderecoParaGeocoding } from './geocoding';
import { calcularRotaSimples } from './osrm';
import type { Coordenada } from './types';

export interface EstimarRotaInput {
  origem: { cep: string; numero: string };
  destino: { cep: string; numero: string };
}

export type ResultadoEstimarRota =
  | {
      ok: true;
      km_estimado: number;
      tempo_min: number;
      polyline?: string;
      origem: Coordenada;
      destino: Coordenada;
      origem_endereco_normalizado: string;
      destino_endereco_normalizado: string;
    }
  | {
      ok: false;
      motivo:
        | 'cep_origem_invalido'
        | 'cep_destino_invalido'
        | 'geocoding_origem_falhou'
        | 'geocoding_destino_falhou'
        | 'rota_falhou'
        | 'config_faltando';
    };

/**
 * Pipeline completo: cep+numero → endereco → coord → rota → km estimado.
 * Falha rapida em qualquer etapa, devolvendo o motivo especifico pra
 * o caller decidir o que mostrar pro usuario.
 */
export async function estimarRota(input: EstimarRotaInput): Promise<ResultadoEstimarRota> {
  // 1. CEP → endereco (ambos)
  const [cepOrigem, cepDestino] = await Promise.all([
    consultarCEP(input.origem.cep),
    consultarCEP(input.destino.cep),
  ]);

  if (!cepOrigem.ok) return { ok: false, motivo: 'cep_origem_invalido' };
  if (!cepDestino.ok) return { ok: false, motivo: 'cep_destino_invalido' };

  // 2. Endereco → coord (Nominatim)
  const enderecoOrigemStr = formatarEnderecoParaGeocoding({
    logradouro: cepOrigem.endereco.logradouro,
    numero: input.origem.numero,
    bairro: cepOrigem.endereco.bairro,
    cidade: cepOrigem.endereco.cidade,
    uf: cepOrigem.endereco.uf,
    cep: cepOrigem.cep,
  });

  const enderecoDestinoStr = formatarEnderecoParaGeocoding({
    logradouro: cepDestino.endereco.logradouro,
    numero: input.destino.numero,
    bairro: cepDestino.endereco.bairro,
    cidade: cepDestino.endereco.cidade,
    uf: cepDestino.endereco.uf,
    cep: cepDestino.cep,
  });

  // Nominatim e rate-limited (1 req/s) — calls em sequencia (nao paralelo)
  const geoOrigem = await geocodar(enderecoOrigemStr);
  if (!geoOrigem.ok) return { ok: false, motivo: 'geocoding_origem_falhou' };

  const geoDestino = await geocodar(enderecoDestinoStr);
  if (!geoDestino.ok) return { ok: false, motivo: 'geocoding_destino_falhou' };

  // 3. Coord → rota OSRM
  const rota = await calcularRotaSimples(
    { lat: geoOrigem.resultado.lat, lng: geoOrigem.resultado.lng },
    { lat: geoDestino.resultado.lat, lng: geoDestino.resultado.lng }
  );

  if (!rota.ok) {
    if (rota.motivo === 'config_faltando') return { ok: false, motivo: 'config_faltando' };
    return { ok: false, motivo: 'rota_falhou' };
  }

  return {
    ok: true,
    km_estimado: rota.rota.distanciaKm,
    tempo_min: rota.rota.tempoMin,
    polyline: rota.rota.polyline,
    origem: { lat: geoOrigem.resultado.lat, lng: geoOrigem.resultado.lng },
    destino: { lat: geoDestino.resultado.lat, lng: geoDestino.resultado.lng },
    origem_endereco_normalizado: geoOrigem.resultado.endereco_normalizado,
    destino_endereco_normalizado: geoDestino.resultado.endereco_normalizado,
  };
}
