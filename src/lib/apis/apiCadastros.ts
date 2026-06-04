/**
 * Camada de dados dos cadastros de conta por API (email + final do cartão).
 * Persistidos na tabela `api_cadastros` (ver migration_api_cadastros.sql), com
 * email e cartão CIFRADOS em repouso (ver cripto.ts).
 *
 * SERVER-ONLY: usa SUPABASE_SERVICE_ROLE_KEY (a tabela tem RLS ligada sem policy,
 * então só a service role acessa). O gate de quem PODE ver/editar (role admin/master)
 * é feito na página e na server action — esta camada só persiste.
 */

import { createClient } from '@supabase/supabase-js';
import { createLogger } from '@/lib/logger';
import { CATALOGO_APIS } from './catalogoApis';
import { cifrar, decifrar } from './cripto';

const log = createLogger('api-cadastros');

/** IDs válidos = os do catálogo (evita gravar lixo / id arbitrário). */
const IDS_VALIDOS = new Set(CATALOGO_APIS.map((a) => a.id));

export interface CadastroApi {
  apiId: string;
  email: string | null;
  cartaoFinal: string | null; // só os 4 últimos dígitos
  observacao: string | null;
}

export interface EntradaCadastro {
  apiId: string;
  email: string | null;
  cartaoFinal: string | null;
  observacao: string | null;
}

export type ResultadoSalvar = { ok: true } | { ok: false; erro: string };

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

/** Valida o final do cartão: vazio (null) é ok, senão exatamente 4 dígitos. */
export function cartaoFinalValido(v: string | null): boolean {
  if (v === null || v === '') return true;
  return /^\d{4}$/.test(v);
}

/** Normaliza string vinda do form: trim e vazio → null. */
function limpar(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = v.trim();
  return t === '' ? null : t;
}

/**
 * Lê todos os cadastros e devolve um mapa apiId → CadastroApi (já DECIFRADO).
 * Tolerante: se um campo não decifra (ex.: chave trocada), devolve null nele e
 * loga — nunca derruba a página inteira. Em erro de banco, devolve mapa vazio.
 */
export async function lerCadastros(): Promise<Record<string, CadastroApi>> {
  const mapa: Record<string, CadastroApi> = {};
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('api_cadastros')
      .select('api_id, email_cifrado, cartao_cifrado, observacao');

    if (error) {
      log.warn('ler_cadastros_falhou', { message: error.message });
      return mapa;
    }

    for (const row of data ?? []) {
      const r = row as {
        api_id: string;
        email_cifrado: string | null;
        cartao_cifrado: string | null;
        observacao: string | null;
      };
      mapa[r.api_id] = {
        apiId: r.api_id,
        email: decifrarTolerante(r.email_cifrado, r.api_id, 'email'),
        cartaoFinal: decifrarTolerante(r.cartao_cifrado, r.api_id, 'cartao'),
        observacao: r.observacao ?? null,
      };
    }
  } catch (err) {
    log.warn('ler_cadastros_excecao', { error: (err as Error).message });
  }
  return mapa;
}

function decifrarTolerante(blob: string | null, apiId: string, campo: string): string | null {
  if (!blob) return null;
  try {
    return decifrar(blob);
  } catch (err) {
    log.warn('decifrar_falhou', { apiId, campo, error: (err as Error).message });
    return null;
  }
}

/**
 * Salva (upsert) o cadastro de uma API. Valida o apiId (deve existir no catálogo)
 * e o final do cartão (4 dígitos). Cifra email e cartão antes de gravar.
 */
export async function salvarCadastro(entrada: EntradaCadastro): Promise<ResultadoSalvar> {
  if (!IDS_VALIDOS.has(entrada.apiId)) {
    return { ok: false, erro: 'Serviço inválido.' };
  }

  const email = limpar(entrada.email);
  const cartao = limpar(entrada.cartaoFinal);
  const observacao = limpar(entrada.observacao);

  if (!cartaoFinalValido(cartao)) {
    return { ok: false, erro: 'O final do cartão deve ter exatamente 4 dígitos.' };
  }

  try {
    const supabase = getSupabase();
    const { error } = await supabase.from('api_cadastros').upsert(
      {
        api_id: entrada.apiId,
        email_cifrado: email ? cifrar(email) : null,
        cartao_cifrado: cartao ? cifrar(cartao) : null,
        observacao,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'api_id' }
    );

    if (error) {
      log.error('salvar_cadastro_falhou', { apiId: entrada.apiId, message: error.message });
      return { ok: false, erro: 'Erro ao salvar. Tente novamente.' };
    }
    return { ok: true };
  } catch (err) {
    log.error('salvar_cadastro_excecao', { apiId: entrada.apiId, error: (err as Error).message });
    return { ok: false, erro: 'Erro ao salvar. Tente novamente.' };
  }
}
