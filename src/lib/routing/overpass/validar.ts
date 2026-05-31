/**
 * Funcao de alto nivel: valida numero de uma rua usando Overpass+cache.
 *
 * Pipeline:
 *  1. Le cache (Supabase) — se hit, calcula status localmente e retorna
 *  2. Cache miss → consulta Overpass com bbox ao redor das coords do CEP
 *  3. Calcula confianca + status
 *  4. Grava no cache (TTL conforme confianca)
 *  5. Retorna ResultadoValidacao
 *
 * Estrategia "nunca bloqueia": qualquer erro/timeout devolve sem_dados.
 * Logistica nao pode travar por causa de validacao opcional.
 */

import { createLogger } from '@/lib/logger';
import { consultarEnderecos } from './client';
import { lerCache, gravarCache } from './cache';
import type { Confianca, DadosRua, ResultadoValidacao, StatusValidacao } from './types';

const log = createLogger('overpass-validar');

const MIN_PARA_VALIDAR = 30; // < isso = sem_dados (cobertura fraca)
const MIN_PARA_CONFIANCA_ALTA = 100;

/**
 * Decide confianca a partir da quantidade de enderecos mapeados.
 * Numeros baseados em padrao de cobertura OSM no Brasil.
 */
function calcularConfianca(qtd: number): Confianca {
  if (qtd === 0) return 'sem_dados';
  if (qtd < MIN_PARA_VALIDAR) return 'baixa';
  if (qtd < MIN_PARA_CONFIANCA_ALTA) return 'media';
  return 'alta';
}

/** Compoe DadosRua a partir do array bruto retornado pelo Overpass. */
function comporDados(
  enderecos: Array<{ numero: number; lat: number; lng: number }>
): DadosRua {
  const numeros = enderecos.map((e) => e.numero).sort((a, b) => a - b);
  const min = numeros[0] ?? null;
  const max = numeros[numeros.length - 1] ?? null;
  // Mapa numero->[lat,lng] (limitado a 200) pra cache hit reconstruir a coord
  // exata. Em numeros duplicados, o ultimo vence — irrelevante pro proposito.
  const coords: Record<string, [number, number]> = {};
  for (const e of enderecos.slice(0, 200)) {
    coords[String(e.numero)] = [e.lat, e.lng];
  }
  return {
    quantidade: numeros.length,
    min,
    max,
    numeros: numeros.slice(0, 200), // limita pra nao explodir cache
    confianca: calcularConfianca(numeros.length),
    coords,
  };
}

/**
 * Acha a coordenada exata do numero pedido, seja no array fresco do Overpass
 * (cache miss) ou no mapa `dados.coords` persistido no cache (cache hit).
 * Esse era o bug B do framework: no cache hit passava-se `[]` e a coord exata
 * se perdia — agora ela sobrevive via `dados.coords`.
 */
function acharCoordExata(
  numeroPedido: number,
  dados: DadosRua,
  enderecos: Array<{ numero: number; lat: number; lng: number }>
): { lat: number; lng: number } | null {
  const exato = enderecos.find((e) => e.numero === numeroPedido);
  if (exato) return { lat: exato.lat, lng: exato.lng };
  const c = dados.coords?.[String(numeroPedido)];
  if (c) return { lat: c[0], lng: c[1] };
  return null;
}

/** Calcula status visual + mensagem + coordenada (se exato). */
function decidirStatus(
  numeroPedido: number,
  dados: DadosRua,
  enderecos: Array<{ numero: number; lat: number; lng: number }>
): { status: StatusValidacao; coordenada: ResultadoValidacao['coordenada']; mensagem: string } {
  // Numero exato encontrado — confirmado. Checado ANTES da cobertura: um numero
  // mapeado e ouro mesmo numa rua com poucos numeros (a coord e precisa).
  const coordExata = acharCoordExata(numeroPedido, dados, enderecos);
  if (coordExata) {
    return {
      status: 'confirmado',
      coordenada: coordExata,
      mensagem: `Numero confirmado no mapa.`,
    };
  }

  // Sem cobertura — nao da pra opinar sobre faixa
  if (dados.confianca === 'sem_dados' || dados.confianca === 'baixa') {
    return {
      status: 'sem_dados',
      coordenada: null,
      mensagem: 'Rua sem cobertura suficiente no mapa pra validar o numero.',
    };
  }

  // Dentro do range conhecido — plausivel mesmo que nao mapeado
  if (dados.min !== null && dados.max !== null && numeroPedido >= dados.min && numeroPedido <= dados.max) {
    return {
      status: 'plausivel',
      coordenada: null,
      mensagem: `Numero ${numeroPedido} esta dentro da faixa conhecida da rua (${dados.min}-${dados.max}), mas nao foi confirmado.`,
    };
  }

  // Fora do range — suspeito
  return {
    status: 'suspeito',
    coordenada: null,
    mensagem: `A rua parece ir de ${dados.min} a ${dados.max}. O numero ${numeroPedido} esta fora dessa faixa — confirma?`,
  };
}

export interface ParamsValidacao {
  numero: string;
  logradouro: string;
  cidade: string;
  uf: string;
  /** Coords do CEP (ja resolvidas via Nominatim/cep_cache). */
  lat: number;
  lng: number;
}

export async function validarNumero(p: ParamsValidacao): Promise<ResultadoValidacao> {
  const numeroPedido = parseInt(p.numero.match(/\d+/)?.[0] ?? '', 10);

  // Numero nao-numerico (ex: "SN", "S/N") — nao da pra validar
  if (Number.isNaN(numeroPedido)) {
    return {
      status: 'sem_dados',
      coordenada: null,
      mensagem: 'Numero nao-numerico — sem validacao automatica.',
      dados: { quantidade: 0, min: null, max: null, numeros: [], confianca: 'sem_dados' },
      cacheado: false,
    };
  }

  // 1. Tenta cache
  const cached = await lerCache(p.logradouro, p.cidade, p.uf);
  if (cached) {
    log.info('cache_hit', { rua: p.logradouro, cidade: p.cidade, uf: p.uf });
    // Cache hit: passa [] como enderecos frescos, mas decidirStatus/acharCoordExata
    // recupera a coord exata de cached.dados.coords (entradas gravadas apos o fix).
    const decisao = decidirStatus(numeroPedido, cached.dados, []);
    return { ...decisao, dados: cached.dados, cacheado: true };
  }

  // 2. Cache miss → consulta Overpass
  log.info('cache_miss', { rua: p.logradouro, cidade: p.cidade, uf: p.uf });
  const consulta = await consultarEnderecos(p.lat, p.lng, p.logradouro);

  if (!consulta.ok) {
    // Falha — devolve sem_dados (nao bloqueia o fluxo)
    log.warn('overpass_falhou', { motivo: consulta.motivo, detalhe: consulta.detalhe });
    return {
      status: 'sem_dados',
      coordenada: null,
      mensagem: 'Nao consegui validar agora — segue com o numero informado.',
      dados: { quantidade: 0, min: null, max: null, numeros: [], confianca: 'sem_dados' },
      cacheado: false,
    };
  }

  // 3. Compor dados + status
  const dados = comporDados(consulta.enderecos);
  const decisao = decidirStatus(numeroPedido, dados, consulta.enderecos);

  // 4. Grava no cache (fire-and-forget — nao espera, nao bloqueia)
  void gravarCache(p.logradouro, p.cidade, p.uf, dados);

  return { ...decisao, dados, cacheado: false };
}
