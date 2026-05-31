/**
 * Tipos pra validacao de enderecos via Overpass.
 */

/** Confianca da validacao baseada em quantos numeros existem mapeados no OSM. */
export type Confianca = 'alta' | 'media' | 'baixa' | 'sem_dados';

/** Status visual pro motorista. */
export type StatusValidacao =
  | 'confirmado'    // numero exato existe no OSM
  | 'plausivel'     // dentro da faixa min-max mapeada
  | 'suspeito'      // FORA da faixa conhecida — avisar com destaque
  | 'sem_dados';    // rua sem cobertura suficiente — nao da pra validar

export interface DadosRua {
  /** Quantidade de numeros mapeados encontrados */
  quantidade: number;
  /** Menor numero mapeado (null se nao houver) */
  min: number | null;
  /** Maior numero mapeado (null se nao houver) */
  max: number | null;
  /** Numeros mapeados em ordem ASC (limitado a 200 pra nao explodir cache) */
  numeros: number[];
  /** Confianca calculada a partir da quantidade */
  confianca: Confianca;
  /** Mapa numero->[lat,lng] dos numeros mapeados (limitado a 200). Permite que
   *  um cache hit reconstrua a coordenada EXATA do numero sem reconsultar o
   *  Overpass — antes a coord exata se perdia no cache (so status era reusado). */
  coords?: Record<string, [number, number]>;
}

export interface ResultadoValidacao {
  status: StatusValidacao;
  /** Se confirmado, lat/lng do ponto exato; senao null */
  coordenada: { lat: number; lng: number } | null;
  /** Mensagem amigavel pro motorista — pronta pra exibir */
  mensagem: string;
  /** Dados subjacentes pra debug/UI avancada */
  dados: DadosRua;
  /** Foi cache hit? (pra metricas) */
  cacheado: boolean;
}
