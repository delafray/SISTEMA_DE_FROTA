/**
 * Cliente Nominatim — converte endereco em texto -> coordenadas geograficas.
 *
 * Nominatim e o servico de geocoding publico do OpenStreetMap. Limite oficial:
 * 1 req/segundo. Para o nosso caso (motorista capturando NFs a cada ~10s),
 * isso e mais que suficiente, mas implementamos rate limiter por seguranca.
 *
 * SERVER-ONLY: respeita User-Agent (Nominatim bloqueia anonimos). A API route
 * /api/routing/geocodar (passo 1.6) expoe ao browser.
 *
 * Referencia: PLANO_ROTEIRIZACAO.md passo 1.5 + 0.5 (tipos).
 */

import { createLogger } from '@/lib/logger';
import type { ResultadoGeocoding } from './types';

const log = createLogger('nominatim');

const NOMINATIM_URL_BASE = (
  process.env.NOMINATIM_URL ?? 'https://nominatim.openstreetmap.org'
).replace(/\/$/, '');
const TIMEOUT_MS = 5000;
const MIN_INTERVAL_MS = 1100; // 1 req/s + margem

// Estado de rate limiting (module-level, processo unico)
let _lastRequestAt = 0;

// ─── TIPOS ──────────────────────────────────────────────────────────

export type ResultadoGeocodar =
  | { ok: true; resultado: ResultadoGeocoding }
  | {
      ok: false;
      motivo: 'endereco_invalido' | 'nao_encontrado' | 'erro_rede' | 'timeout';
    };

export type ResultadoGeocodarMultiplos =
  | { ok: true; resultados: ResultadoGeocoding[] }
  | {
      ok: false;
      motivo: 'endereco_invalido' | 'nao_encontrado' | 'erro_rede' | 'timeout';
    };

interface NominatimItem {
  lat: string;
  lon: string;
  display_name: string;
  /** Presente quando passamos addressdetails=1 — campos estruturados. */
  address?: {
    road?: string;
    pedestrian?: string;
    house_number?: string;
    suburb?: string;
    neighbourhood?: string;
    city_district?: string;
    city?: string;
    town?: string;
    municipality?: string;
    state?: string;
    state_code?: string;
    /** Nominatim BR raramente manda state_code; manda `state` por extenso
     *  ("Minas Gerais") e o ISO "BR-MG". Usamos pra derivar a sigla. */
    'ISO3166-2-lvl4'?: string;
    postcode?: string;
  };
}

// ─── Estado por extenso → sigla (UF) ────────────────────────────────
// O Nominatim BR quase nunca devolve `state_code`; devolve `state` por extenso
// ("Minas Gerais"). Sem converter, a UF ficava "Minas Gerais" e quebrava a
// busca reversa do ViaCEP (que exige sigla de 2 letras) — o CEP nunca saia.
const ESTADO_PARA_UF: Record<string, string> = {
  'acre': 'AC', 'alagoas': 'AL', 'amapa': 'AP', 'amazonas': 'AM', 'bahia': 'BA',
  'ceara': 'CE', 'distrito federal': 'DF', 'espirito santo': 'ES', 'goias': 'GO',
  'maranhao': 'MA', 'mato grosso': 'MT', 'mato grosso do sul': 'MS', 'minas gerais': 'MG',
  'para': 'PA', 'paraiba': 'PB', 'parana': 'PR', 'pernambuco': 'PE', 'piaui': 'PI',
  'rio de janeiro': 'RJ', 'rio grande do norte': 'RN', 'rio grande do sul': 'RS',
  'rondonia': 'RO', 'roraima': 'RR', 'santa catarina': 'SC', 'sao paulo': 'SP',
  'sergipe': 'SE', 'tocantins': 'TO',
};

/** Resolve a sigla UF a partir do que o Nominatim manda: ISO "BR-MG", ou
 *  `state_code` (2 letras), ou `state` por extenso ("Minas Gerais"). */
export function siglaUF(input?: string, iso?: string): string | undefined {
  if (iso && /^BR-[A-Za-z]{2}$/.test(iso)) return iso.slice(3).toUpperCase();
  const v = (input ?? '').trim();
  if (/^[A-Za-z]{2}$/.test(v)) return v.toUpperCase();
  const norm = v
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return ESTADO_PARA_UF[norm];
}

// ─── HELPERS PUBLICOS ───────────────────────────────────────────────

/**
 * Monta string de busca pro Nominatim a partir de partes do endereco.
 * Filtra partes vazias e adiciona 'Brasil' ao final pra melhor precisao.
 */
export function formatarEnderecoParaGeocoding(parts: {
  logradouro?: string;
  numero?: string;
  bairro?: string;
  cidade: string;
  uf: string;
  cep?: string;
}): string {
  const partes = [
    parts.logradouro,
    parts.numero,
    parts.bairro,
    parts.cidade,
    parts.uf,
    parts.cep,
    'Brasil',
  ].filter((p): p is string => Boolean(p && p.trim()));
  return partes.join(', ');
}

/** Reset do rate limiter — uso EXCLUSIVO de testes. */
export function _resetRateLimit(): void {
  _lastRequestAt = 0;
}

// ─── HELPERS PÚBLICOS ───────────────────────────────────────────────

/**
 * Calcula distância em km entre dois pontos (fórmula Haversine simples).
 * Precisão suficiente para ordenar resultados — não use para navegação.
 */
export function calcularDistanciaKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371; // raio da Terra em km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── INTERNO ────────────────────────────────────────────────────────

async function respeitarRateLimit(): Promise<void> {
  const agora = Date.now();
  const desdeUltima = agora - _lastRequestAt;
  if (desdeUltima < MIN_INTERVAL_MS) {
    const espera = MIN_INTERVAL_MS - desdeUltima;
    await new Promise((r) => setTimeout(r, espera));
  }
  _lastRequestAt = Date.now();
}

// ─── FUNCAO PRINCIPAL ───────────────────────────────────────────────

/**
 * Converte endereço em texto -> { lat, lng, endereco_normalizado }.
 * Sempre devolve resultado tipado — nunca lança exceção.
 */
export async function geocodar(endereco: string): Promise<ResultadoGeocodar> {
  if (!endereco || endereco.trim().length < 3) {
    return { ok: false, motivo: 'endereco_invalido' };
  }

  await respeitarRateLimit();

  const url = new URL(`${NOMINATIM_URL_BASE}/search`);
  url.searchParams.set('q', endereco);
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '1');
  url.searchParams.set('countrycodes', 'br');
  url.searchParams.set('addressdetails', '0');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url.toString(), {
      headers: {
        // Nominatim exige UA distintivo — bloqueia clients anonimos.
        'User-Agent': 'SistemaDeFrota/1.0 (routing-mvp)',
      },
      signal: controller.signal,
    });

    if (!res.ok) {
      log.warn('nominatim_http_error', { status: res.status, endereco });
      return { ok: false, motivo: 'erro_rede' };
    }

    const data = (await res.json()) as NominatimItem[];

    if (!Array.isArray(data) || data.length === 0) {
      log.info('endereco_nao_encontrado', { endereco });
      return { ok: false, motivo: 'nao_encontrado' };
    }

    const item = data[0];
    const lat = parseFloat(item.lat);
    const lng = parseFloat(item.lon);

    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      log.warn('lat_lng_invalido_no_payload', { item });
      return { ok: false, motivo: 'nao_encontrado' };
    }

    log.info('endereco_geocodado', { endereco, lat, lng });
    return {
      ok: true,
      resultado: {
        lat,
        lng,
        endereco_normalizado: item.display_name,
      },
    };
  } catch (err) {
    const error = err as Error;
    if (error.name === 'AbortError') {
      log.warn('nominatim_timeout', { endereco, timeout_ms: TIMEOUT_MS });
      return { ok: false, motivo: 'timeout' };
    }
    log.error('nominatim_network_error', { endereco, error: error.message });
    return { ok: false, motivo: 'erro_rede' };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Geocoda com fallback progressivo — tenta até 4 variações removendo CEP/bairro/numero.
 *
 * Nominatim publico falha com frequencia em enderecos BR quando a query inclui
 * todas as partes (CEP errado/inexistente no OSM, bairro com nome divergente, etc).
 * Remover CEP e/ou bairro costuma resolver. Mesma estrategia usada pelo otimizar.
 *
 * Ordem das tentativas:
 *   1. logradouro + numero + bairro + cidade + uf + cep (mais especifico)
 *   2. logradouro + numero + cidade + uf (sem CEP nem bairro)
 *   3. logradouro + numero + cidade + uf + cep (sem bairro, com CEP)
 *   4. logradouro + cidade + uf (sem numero, sem CEP, sem bairro)
 *
 * Duplicatas (ex: se bairro/cep vazios, tentativa 1==2) sao deduplicadas.
 * Devolve resultado tipado — nunca lanca.
 */
export async function geocodarComFallback(parts: {
  logradouro?: string;
  numero?: string;
  bairro?: string;
  cidade: string;
  uf: string;
  cep?: string;
}): Promise<ResultadoGeocodar & { tentativa?: number }> {
  const tentativas = [
    formatarEnderecoParaGeocoding(parts),
    formatarEnderecoParaGeocoding({
      logradouro: parts.logradouro,
      numero: parts.numero,
      cidade: parts.cidade,
      uf: parts.uf,
    }),
    formatarEnderecoParaGeocoding({
      logradouro: parts.logradouro,
      numero: parts.numero,
      cidade: parts.cidade,
      uf: parts.uf,
      cep: parts.cep,
    }),
    formatarEnderecoParaGeocoding({
      logradouro: parts.logradouro,
      cidade: parts.cidade,
      uf: parts.uf,
    }),
  ];

  const tentativasUnicas = [...new Set(tentativas)];
  let ultimoErro: ResultadoGeocodar = { ok: false, motivo: 'nao_encontrado' };

  for (let i = 0; i < tentativasUnicas.length; i++) {
    const r = await geocodar(tentativasUnicas[i]);
    if (r.ok) {
      if (i > 0) {
        log.info('geocoding_fallback_ok', { tentativa: i + 1, query: tentativasUnicas[i] });
      }
      return { ...r, tentativa: i + 1 };
    }
    ultimoErro = r;
    // Se erro foi de rede/timeout/invalido nao adianta tentar variacoes
    if (r.motivo === 'erro_rede' || r.motivo === 'timeout' || r.motivo === 'endereco_invalido') {
      return r;
    }
  }

  log.warn('geocoding_falhou_todas_tentativas', { tentativas: tentativasUnicas.length });
  return ultimoErro;
}

/**
 * Prepara queries candidatas a partir de texto FALADO pro Nominatim.
 *
 * Voz e' hostil pro Nominatim publico, por 3 motivos que esta funcao trata:
 *  1. o reconhecimento de voz transcreve "bairro"/"numero" LITERALMENTE —
 *     viram tokens-lixo que o Nominatim nao entende como parte do endereco;
 *  2. contracoes com apostrofo (d'Alva, Sant'Ana) saem da fala como UMA palavra
 *     colada ("dalva"), mas o OSM indexa SEPARADO ("d alva") — o token unico
 *     "dalva" nao casa com "d"+"alva", entao a busca falha;
 *  3. quase nunca vem cidade/UF — so o vies de GPS (viewbox) segura a busca.
 *
 * Devolve uma lista ORDENADA do mais especifico pro mais amplo, pra tentar em
 * cascata (igual ao geocodarComFallback do CEP). Deduplicada; descarta queries
 * com < 3 chars. Lista vazia se o texto for vazio.
 *
 *   "Rua Buzios bairro Estrela Dalva"
 *     -> ["Rua Buzios, Estrela Dalva",      (1: limpa "bairro")
 *         "Rua Buzios, Estrela D Alva",     (2: variante de apostrofo)
 *         "Rua Buzios"]                     (3: so logradouro + vies de GPS)
 */
export function prepararQueriesVoz(texto: string): string[] {
  const base = (texto ?? '').trim();
  if (!base) return [];

  // 1. Limpa conectivos que o STT transcreve literalmente: "bairro" (com ou sem
  //    "no/do/da" antes) e "numero/número/nro" viram separador (virgula).
  const limpo = base
    .replace(/\b(?:no |do |da )?bairro\b/gi, ',')
    .replace(/\bn(?:[uú]mero|ro)\b/gi, ',')
    .replace(/n[º°]/gi, ',')
    .replace(/\s*,\s*/g, ', ')        // espaco unico ao redor das virgulas
    .replace(/(?:,\s*){2,}/g, ', ')   // colapsa virgulas repetidas
    .replace(/\s+/g, ' ')
    .replace(/^[\s,]+|[\s,]+$/g, '')  // tira virgula/espaco das pontas
    .trim();

  const queries: string[] = [];
  const add = (q: string) => {
    const v = q.replace(/^[\s,]+|[\s,]+$/g, '').trim();
    if (v.length >= 3 && !queries.includes(v)) queries.push(v);
  };

  add(limpo);

  // 2. Variante de apostrofo: separa as contracoes coladas na fala pra casar
  //    com o token do OSM. "dalva" -> "d alva"; "santana" -> "sant ana".
  //    So roda como fallback (query 2), entao um split errado ("dois"->"d ois")
  //    apenas nao acha nada — nunca atrapalha a query 1, que veio antes.
  const VOGAL = 'aeiouáàâãéêíóôõ';
  const LETRA = 'a-záàâãéêíóôõúüç';
  const rxD = new RegExp(`^([dD])([${VOGAL}][${LETRA}]{2,})$`);
  const rxSant = new RegExp(`^([sS]ant)([${VOGAL}][${LETRA}]+)$`);
  const comApostrofo = limpo
    .split(' ')
    .map((palavra) => {
      const temVirgula = palavra.endsWith(',');
      const nucleo = temVirgula ? palavra.slice(0, -1) : palavra;
      const sufixo = temVirgula ? ',' : '';
      const mD = rxD.exec(nucleo);
      if (mD) return `${mD[1]} ${mD[2]}${sufixo}`;
      const mS = rxSant.exec(nucleo);
      if (mS) return `${mS[1]} ${mS[2]}${sufixo}`;
      return palavra;
    })
    .join(' ');
  add(comApostrofo);

  // 3. So o logradouro (descarta tudo apos a 1a virgula = bairro/extra).
  //    Confia no vies de GPS pra desambiguar a rua quando o bairro atrapalha.
  add(limpo.split(',')[0]);

  return queries;
}

/**
 * Geocoda texto FALADO tentando as variantes de `prepararQueriesVoz` em cascata.
 * Devolve os resultados da PRIMEIRA variante que achar algo. Erros de
 * rede/timeout/invalido abortam imediatamente (variar a query nao ajuda nesses).
 *
 * `variante` (1-based) indica qual candidata casou — util pra log/debug.
 */
export async function geocodarVozComVariantes(
  texto: string,
  limite = 5,
  userLat?: number,
  userLng?: number,
): Promise<ResultadoGeocodarMultiplos & { variante?: number }> {
  const queries = prepararQueriesVoz(texto);
  if (queries.length === 0) {
    return { ok: false, motivo: 'endereco_invalido' };
  }

  let ultimoErro: ResultadoGeocodarMultiplos = { ok: false, motivo: 'nao_encontrado' };

  for (let i = 0; i < queries.length; i++) {
    const r = await geocodarMultiplos(queries[i], limite, userLat, userLng);
    if (r.ok && r.resultados.length > 0) {
      if (i > 0) log.info('voz_variante_ok', { variante: i + 1, query: queries[i] });
      return { ...r, variante: i + 1 };
    }
    if (!r.ok) {
      ultimoErro = r;
      if (r.motivo === 'erro_rede' || r.motivo === 'timeout' || r.motivo === 'endereco_invalido') {
        return r;
      }
    }
  }

  log.info('voz_nenhuma_variante_achou', { variantes: queries.length });
  return ultimoErro;
}

/** Normaliza texto pra chave de dedup: minusculo, sem acento, sem pontuacao,
 *  espacos colapsados. "São Mateus" e "sao mateus" viram a mesma coisa. */
function normalizarParaChave(s: string): string {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Dedup de resultados que sao a MESMA rua (logradouro+bairro+cidade+uf). O
 * Nominatim costuma devolver varios nos da mesma rua com distancias quase
 * iguais — o motorista via 2 cards identicos. Mantem o 1o (= mais perto, pois
 * a lista ja vem ordenada por distancia quando ha GPS) e herda numero/cep de
 * um duplicado quando o 1o nao tinha.
 */
export function dedupMesmaRua(resultados: ResultadoGeocoding[]): ResultadoGeocoding[] {
  const porChave = new Map<string, ResultadoGeocoding>();
  const ordem: string[] = [];
  for (const r of resultados) {
    // Com campos estruturados (o caso real — addressdetails=1), a chave e
    // rua+bairro+cidade+uf. Sem eles (resultado cru), usa o display_name
    // inteiro pra NAO fundir "Rua A, SP" com "Rua A, RJ" (cidades diferentes).
    const temEstruturado = !!(r.logradouro && r.cidade);
    const chave = temEstruturado
      ? [
          normalizarParaChave(r.logradouro ?? ''),
          normalizarParaChave(r.bairro ?? ''),
          normalizarParaChave(r.cidade ?? ''),
          (r.uf ?? '').toUpperCase(),
        ].join('|')
      : `raw:${normalizarParaChave(r.endereco_normalizado)}`;
    const existente = porChave.get(chave);
    if (!existente) {
      porChave.set(chave, { ...r });
      ordem.push(chave);
    } else {
      // Mesma rua repetida: herda numero/cep se o 1o (mais perto) nao tinha.
      if (!existente.numero && r.numero) existente.numero = r.numero;
      if (!existente.cep && r.cep) existente.cep = r.cep;
    }
  }
  return ordem.map((k) => porChave.get(k)!);
}

/**
 * Busca até `limite` resultados para um endereço.
 * Se `lat`/`lng` forem fornecidos, ordena os resultados por distância ao ponto.
 * Sempre devolve resultado tipado — nunca lança exceção.
 */
export async function geocodarMultiplos(
  endereco: string,
  limite = 5,
  userLat?: number,
  userLng?: number,
): Promise<ResultadoGeocodarMultiplos> {
  if (!endereco || endereco.trim().length < 3) {
    return { ok: false, motivo: 'endereco_invalido' };
  }

  await respeitarRateLimit();

  const url = new URL(`${NOMINATIM_URL_BASE}/search`);
  url.searchParams.set('q', endereco);
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', String(Math.min(limite, 10)));
  url.searchParams.set('countrycodes', 'br');
  // addressdetails=1: Nominatim devolve campos estruturados (rua, bairro,
  // cidade, uf) em vez de so o display_name como string. Frontend usa pra
  // mostrar pro motorista escolher entre "Rua X em Bairro A" vs "Rua X
  // em Bairro B" com clareza.
  url.searchParams.set('addressdetails', '1');

  // Viewbox: enviesa busca pra raio ~50km ao redor do motorista quando
  // disponivel. Nominatim ainda devolve resultados fora da box, mas prioriza
  // os de dentro — alinha com expectativa do motorista de ver primeiro o que
  // esta perto.
  if (userLat !== undefined && userLng !== undefined) {
    const delta = 0.5; // ~50km de lado
    const viewbox = [
      userLng - delta,
      userLat + delta,
      userLng + delta,
      userLat - delta,
    ].join(',');
    url.searchParams.set('viewbox', viewbox);
    url.searchParams.set('bounded', '0'); // permite resultados fora da box (com prioridade menor)
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url.toString(), {
      headers: { 'User-Agent': 'SistemaDeFrota/1.0 (routing-mvp)' },
      signal: controller.signal,
    });

    if (!res.ok) {
      log.warn('nominatim_multiplos_http_error', { status: res.status, endereco });
      return { ok: false, motivo: 'erro_rede' };
    }

    const data = (await res.json()) as NominatimItem[];

    if (!Array.isArray(data) || data.length === 0) {
      log.info('endereco_multiplos_nao_encontrado', { endereco });
      return { ok: false, motivo: 'nao_encontrado' };
    }

    // Converte, filtra invalidos
    const resultados: ResultadoGeocoding[] = data
      .map((item) => {
        const a = item.address ?? {};
        return {
          lat: parseFloat(item.lat),
          lng: parseFloat(item.lon),
          endereco_normalizado: item.display_name,
          logradouro: a.road ?? a.pedestrian ?? undefined,
          numero: a.house_number ?? undefined,
          // OSM em metropoles BR (BH, Contagem, RJ, SP) mapeia:
          //   suburb = REGIAO administrativa (ex: "Nacional", "Eldorado")
          //   neighbourhood = BAIRRO real (ex: "São Mateus", "Cidade Industrial")
          // Em cidades menores so vem suburb. Por isso: preferir neighbourhood
          // (mais especifico quando os dois existem); cair pra suburb senao.
          bairro: a.neighbourhood ?? a.suburb ?? a.city_district ?? undefined,
          cidade: a.city ?? a.town ?? a.municipality ?? undefined,
          uf: siglaUF(a.state_code ?? a.state, a['ISO3166-2-lvl4']),
          cep: a.postcode?.replace(/\D/g, '') ?? undefined,
        };
      })
      .filter((r) => !Number.isNaN(r.lat) && !Number.isNaN(r.lng));

    // Ordena por distancia ao usuario quando disponivel
    if (userLat !== undefined && userLng !== undefined) {
      resultados.sort(
        (a, b) =>
          calcularDistanciaKm(userLat, userLng, a.lat, a.lng) -
          calcularDistanciaKm(userLat, userLng, b.lat, b.lng)
      );
    }

    // Dedup: o Nominatim devolve varios NOS da mesma rua (distancias quase
    // iguais) — viram 1 card so. Mantem o 1o (= mais perto, ja ordenado).
    const unicos = dedupMesmaRua(resultados);

    log.info('endereco_multiplos_geocodado', {
      endereco,
      total: unicos.length,
      brutos: resultados.length,
    });
    return { ok: true, resultados: unicos };
  } catch (err) {
    const error = err as Error;
    if (error.name === 'AbortError') {
      log.warn('nominatim_multiplos_timeout', { endereco, timeout_ms: TIMEOUT_MS });
      return { ok: false, motivo: 'timeout' };
    }
    log.error('nominatim_multiplos_network_error', { endereco, error: error.message });
    return { ok: false, motivo: 'erro_rede' };
  } finally {
    clearTimeout(timeout);
  }
}
