/**
 * Browser-side wrapper que consulta CEP via API route /api/cep/[cep].
 *
 * Por que existe: o `consultarCEP` de viacep.ts e SERVER-ONLY (usa
 * service_role do Supabase). Componentes React no browser precisam de uma
 * camada de fetch que chame a API route que envolve o consultarCEP.
 *
 * Sempre devolve `ResultadoCEP` tipado — nunca lanca excecao.
 *
 * Referencia: PLANO_ROTEIRIZACAO.md passo 1.3.
 */

import type { ResultadoCEP } from './types';

/** Normaliza CEP: remove tudo que nao for digito. */
function normalizar(cep: string): string {
  return cep.replace(/\D/g, '');
}

/**
 * Consulta CEP via API route do projeto.
 * Devolve `{ ok: true, endereco }` em sucesso ou `{ ok: false, motivo }` em falha.
 */
export async function consultarCEPBrowser(cep: string): Promise<ResultadoCEP> {
  const limpo = normalizar(cep);
  if (limpo.length !== 8) {
    return { ok: false, motivo: 'cep_invalido' };
  }

  try {
    const res = await fetch(`/api/cep/${limpo}`);
    // A API devolve 200 em sucesso, 400/503 em erro — mas o body sempre
    // tem o ResultadoCEP serializado.
    const data = (await res.json()) as ResultadoCEP;
    return data;
  } catch {
    return { ok: false, motivo: 'erro_rede' };
  }
}
