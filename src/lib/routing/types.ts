/**
 * Tipos do modulo de Routing — replica em TypeScript do schema das tabelas
 * `notas_capturadas`, `rotas_otimizadas`, `paradas` criadas no Supabase em
 * 2026-05-27 (PLANO_ROTEIRIZACAO.md secao 0.1).
 *
 * Convencoes:
 * - timestamps sao ISO strings (timestamptz no banco)
 * - decimais sao number (banco usa numeric — converter na borda)
 * - jsonb e tipado explicitamente
 */

import type { EnderecoCEP } from '@/lib/cep/types';

// ─── Coordenada geografica usada por OSRM/VROOM/Nominatim ───────────
export interface Coordenada {
  lat: number;
  lng: number;
}

// ─── notas_capturadas ───────────────────────────────────────────────
export type StatusNota =
  | 'capturada'
  | 'geocodificada'
  | 'em_rota'
  | 'concluida'
  | 'cancelada';

export interface NotaCapturada {
  id: string;
  motorista_id: string;
  empresa_id: string;
  cep: string;                       // 8 digitos sem hifen
  numero: string;
  endereco: EnderecoCEP;
  latitude: number | null;
  longitude: number | null;
  observacao: string | null;
  status: StatusNota;
  capturado_em: string;              // ISO timestamp
  sincronizado_em: string | null;
}

// ─── rotas_otimizadas ───────────────────────────────────────────────
export type StatusRota =
  | 'rascunho'
  | 'otimizada'
  | 'em_andamento'
  | 'concluida'
  | 'cancelada';

export interface RotaOtimizada {
  id: string;
  motorista_id: string;
  empresa_id: string;
  data: string;                      // YYYY-MM-DD
  distancia_total_km: number | null;
  tempo_total_min: number | null;
  status: StatusRota;
  otimizada_em: string | null;
  criada_em: string;
}

// ─── paradas ────────────────────────────────────────────────────────
/** Cada elemento e [inicio, fim] no formato "HH:MM". Multiplas janelas permitidas. */
export type JanelaHorario = [string, string][];

export interface Parada {
  id: string;
  rota_id: string;
  nota_id: string | null;
  ordem: number;                     // posicao na rota (1, 2, 3, ...)
  endereco: EnderecoCEP;             // snapshot — nao muda se a nota for editada
  latitude: number;
  longitude: number;
  fixada: boolean;
  janela_horario: JanelaHorario | null;
  tempo_descarga_min: number;
  observacao: string | null;
  concluida_em: string | null;
}

// ─── Resultados das APIs externas (OSRM / VROOM / Nominatim) ────────

export interface ResultadoOSRM {
  distanciaKm: number;
  tempoMin: number;
  polyline?: string;                 // encoded polyline pra desenhar no mapa
}

export interface ResultadoVROOM {
  paradas: Array<{ nota_id: string; ordem: number; chegada_estimada: string }>;
  distancia_total_km: number;
  tempo_total_min: number;
  paradas_nao_atendidas: string[];   // ids das notas que VROOM nao conseguiu encaixar
}

export interface ResultadoGeocoding {
  lat: number;
  lng: number;
  endereco_normalizado: string;      // como o Nominatim devolveu
}
