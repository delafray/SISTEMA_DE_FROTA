import { createClient } from "@/lib/supabase/client";

/**
 * Guard de tela do lado do cliente — lê a sessão LOCAL (cookie), sem ida à rede.
 *
 * Por que não getUser(): getUser() valida no servidor do Supabase a cada mount.
 * Em rede móvel oscilante (ou refresh de token em corrida ao voltar do
 * background), ele devolve user=null MESMO COM SESSÃO VÁLIDA — e o guard
 * chutava o gestor pro /login, inclusive no botão voltar do celular, que
 * remonta a página e re-dispara o guard. A validação real de identidade
 * continua no servidor (RLS); este guard é só UX de redirecionamento.
 *
 * Erro na leitura (rede/refresh em corrida) NÃO é tratado como deslogado.
 */
export async function temSessao(): Promise<boolean> {
  const { data, error } = await createClient().auth.getSession();
  if (data.session) return true;
  if (error) return true; // indisponibilidade transitória ≠ deslogado — não chutar pro login
  return false;
}

/**
 * Variante para telas que precisam do usuário (id/email) além do guard.
 * Mesma leitura local da sessão — sem ida à rede.
 */
export async function usuarioSessao() {
  const { data } = await createClient().auth.getSession();
  return data.session?.user ?? null;
}
