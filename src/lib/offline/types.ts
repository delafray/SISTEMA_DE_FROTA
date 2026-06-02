/**
 * Tipos da fila offline (Dexie/IndexedDB) — Fase 1 simplificada.
 * Veja PLANO_ROTEIRIZACAO.md secao 0.5.
 *
 * A fila guarda capturas de NF feitas pelo motorista localmente antes de
 * sincronizar com o Supabase. Quando o app esta online e a fila tem itens
 * pendentes, o worker (src/lib/offline/sync.ts) envia em lotes.
 */

import type { NotaCapturada, RotaOtimizada, Parada } from '@/lib/routing/types';

/** Estado da sincronizacao da nota com o servidor. */
export type StatusSync = 'pendente' | 'sincronizada' | 'erro';

/**
 * Sessao do usuario guardada localmente (IndexedDB) pra permitir operar OFFLINE
 * por alguns dias sem precisar revalidar o token no Supabase.
 *
 * Por que existe: sem internet, `supabase.auth.getUser()` falha e o motorista
 * cairia no /login (que tambem precisa de rede). Guardamos o perfil minimo aqui
 * com um carimbo de data (`salvo_em`); enquanto estiver dentro do TTL
 * (ver SESSAO_TTL_MS em sessao.ts), o motorista entra offline.
 *
 * Seguranca: e so um cache LOCAL no dispositivo do proprio motorista. Offline ele
 * nao le dado de outra empresa (nao ha rede) e toda ESCRITA ressincroniza pelo
 * servidor com RLS. Adulterar o IndexedDB so afeta a UI local dele.
 *
 * So existe UMA sessao local por dispositivo — PK fixa `id: 'atual'`.
 */
export interface SessaoLocal {
  id: string;                  // chave fixa 'atual' (so uma sessao por device)
  usuario_id: string;
  empresa_id: string;
  motorista_id: string | null;
  role: string;
  nome: string | null;
  salvo_em: string;            // ISO timestamp — base do TTL de validade offline
}

/**
 * Snapshot da rota ativa guardado localmente pra o motorista ver as paradas,
 * o mapa e exportar pro Google Maps mesmo SEM internet.
 *
 * Salvo sempre que a rota entra/atualiza na fase em_rota; lido quando o fetch
 * de `/api/routing/rota/:id` falha (offline). PK = id da rota.
 */
export interface RotaCacheada {
  id: string;                  // = rota_id (PK)
  empresa_id: string;
  motorista_id: string;
  rota: RotaOtimizada;         // snapshot do cabecalho da rota
  paradas: Parada[];           // snapshot das paradas (endereco + coords + status)
  salvo_em: string;            // ISO timestamp
}

/**
 * Item da fila local. Estende `NotaCapturada` (forma que vai virar no banco)
 * mas com campos adicionais pra controle local: id_local (criado no celular),
 * id_servidor (preenchido apos sucesso) e metadata de retry.
 */
export interface NotaNaFila extends Omit<NotaCapturada, 'id' | 'sincronizado_em'> {
  id_local: string;                  // uuid gerado no celular
  id_servidor?: string;              // uuid devolvido pelo Supabase apos insert
  status_sync: StatusSync;
  tentativas: number;
  ultimo_erro?: string;
  proxima_tentativa?: string;        // ISO timestamp — backoff exponencial
}
