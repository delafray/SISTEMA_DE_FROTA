/**
 * API Route — POST /api/regras/validar
 *
 * Valida escopo_dados antes de salvar uma regra: checa identificadores,
 * existência de tabelas/colunas (service role) e acesso da tela (anon key).
 *
 * Body: { escopo_dados: { colunas?, escrita? } }
 * Resposta: { ok, problemas: Array<{ tabela, coluna, tipo, detalhe }> }
 *
 * Sem auth de usuário (padrão do projeto pra rotas internas).
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireSessao } from '@/lib/auth/requireSessao';

// Regex de identificador PostgreSQL simples (apenas a-z, 0-9, _).
const RE_IDENT = /^[a-z_][a-z0-9_]*$/;

type Problema = {
  tabela: string;
  coluna: string;
  tipo: "nao_existe" | "bloqueado" | "identificador_invalido";
  detalhe: string;
};

function sbService() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function sbAnon() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

/** Testa se o par tabela/coluna existe e se a anon key consegue acessar. */
async function validarPar(tabela: string, coluna: string): Promise<Problema[]> {
  const problemas: Problema[] = [];

  // 1. Validar identificadores
  if (!RE_IDENT.test(tabela)) {
    problemas.push({ tabela, coluna, tipo: "identificador_invalido", detalhe: `Tabela "${tabela}" é um identificador inválido.` });
  }
  if (!RE_IDENT.test(coluna)) {
    problemas.push({ tabela, coluna, tipo: "identificador_invalido", detalhe: `Coluna "${coluna}" é um identificador inválido.` });
  }
  if (problemas.length > 0) return problemas; // não adianta testar no banco

  // 2. Testar existência via service role
  const { error: errService } = await sbService()
    .from(tabela)
    .select(coluna)
    .limit(0);

  if (errService) {
    if (errService.code === "42P01" || errService.message?.includes("PGRST205") || errService.message?.includes("does not exist")) {
      problemas.push({ tabela, coluna, tipo: "nao_existe", detalhe: `Tabela "${tabela}" não existe no banco.` });
      return problemas; // coluna irrelevante se tabela não existe
    }
    if (errService.code === "42703") {
      problemas.push({ tabela, coluna, tipo: "nao_existe", detalhe: `Coluna "${coluna}" não existe em "${tabela}".` });
      return problemas;
    }
    // Outro erro de banco — reportar como nao_existe genérico
    problemas.push({ tabela, coluna, tipo: "nao_existe", detalhe: `Erro ao verificar ${tabela}.${coluna}: ${errService.message}` });
    return problemas;
  }

  // 3. Testar acesso via anon key
  const { error: errAnon } = await sbAnon()
    .from(tabela)
    .select(coluna)
    .limit(0);

  if (errAnon) {
    const msg = errAnon.message?.toLowerCase() ?? "";
    // status pode vir no hint ou na mensagem dependendo da versão do PostgREST
    const errAnonAny = errAnon as unknown as Record<string, unknown>;
    if (
      errAnon.code === "42501" ||
      msg.includes("permission denied") ||
      msg.includes("not authorized") ||
      errAnonAny.status === 401
    ) {
      problemas.push({ tabela, coluna, tipo: "bloqueado", detalhe: `Acesso bloqueado por RLS/GRANT em "${tabela}.${coluna}".` });
    }
    // Outros erros anon não bloqueiam (pode ser outra coisa; service role já passou)
  }

  return problemas;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { erro: erroSessao } = await requireSessao();
  if (erroSessao) return erroSessao;
  const body = await req.json().catch(() => ({})) as {
    escopo_dados?: Record<string, unknown>;
  };

  const escopo = body.escopo_dados ?? {};

  // Coletar pares (tabela, coluna) únicos de colunas + escrita
  const pares = new Map<string, Set<string>>(); // tabela → Set<coluna>

  const addPar = (tabela: string, coluna: string) => {
    if (!tabela || !coluna) return;
    if (!pares.has(tabela)) pares.set(tabela, new Set());
    pares.get(tabela)!.add(coluna);
  };

  // Fonte 1: escopo_dados.colunas { tabela: { coluna: acao[] } }
  const colunas = (escopo.colunas ?? {}) as Record<string, Record<string, unknown>>;
  for (const tabela of Object.keys(colunas)) {
    for (const coluna of Object.keys(colunas[tabela] ?? {})) {
      addPar(tabela, coluna);
    }
  }

  // Fonte 2: escopo_dados.escrita
  const escrita = (escopo.escrita ?? {}) as Record<string, unknown>;
  const tabelaEscrita = typeof escrita.tabela === "string" ? escrita.tabela : "";

  if (tabelaEscrita) {
    // campos[].campo
    const campos = Array.isArray(escrita.campos) ? escrita.campos as Record<string, unknown>[] : [];
    for (const c of campos) {
      if (typeof c.campo === "string" && c.campo) addPar(tabelaEscrita, c.campo);
    }
    // fixos (chaves)
    const fixos = (typeof escrita.fixos === "object" && escrita.fixos !== null)
      ? escrita.fixos as Record<string, unknown>
      : {};
    for (const col of Object.keys(fixos)) {
      addPar(tabelaEscrita, col);
    }
  }

  // Validar todos os pares em paralelo
  const promessas: Promise<Problema[]>[] = [];
  for (const [tabela, colunaSet] of pares.entries()) {
    for (const coluna of colunaSet) {
      promessas.push(validarPar(tabela, coluna));
    }
  }

  const resultados = await Promise.all(promessas);
  const problemas = resultados.flat();

  return NextResponse.json({ ok: problemas.length === 0, problemas });
}
