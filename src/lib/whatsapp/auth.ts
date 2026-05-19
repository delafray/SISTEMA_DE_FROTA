/**
 * WhatsApp Auth — Identifica o remetente como motorista, gestor ou desconhecido.
 *
 * Lógica (conforme seção 6.14 do plano):
 * 1. Busca em motoristas.whatsapp → role = 'motorista'
 * 2. Busca em perfis.whatsapp_bot → role = 'gestor' ou 'master'
 * 3. Não encontrou → descarta (sem resposta)
 */

import { createClient } from '@supabase/supabase-js';
import { createLogger } from '@/lib/logger';

const log = createLogger('auth');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Client com service_role para operações do webhook (bypass RLS)
function getServiceClient() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

export type UserIdentity =
  | {
      tipo: 'motorista';
      motorista_id: string;
      nome: string;
      empresa_id: string;
      usuario_id: string | null;
    }
  | {
      tipo: 'gestor' | 'master';
      usuario_id: string;
      nome: string;
      empresa_id: string;
    }
  | {
      tipo: 'desconhecido';
    };

/**
 * Identifica quem está mandando mensagem pelo número do WhatsApp.
 */
export async function identificarRemetente(whatsappNumber: string): Promise<UserIdentity> {
  const supabase = getServiceClient();

  // Normaliza: tira tudo que não é dígito e remove o "9" do nono dígito
  // brasileiro quando aplicável (Meta entrega o número sem o 9).
  const apenasDigitos = whatsappNumber.replace(/\D/g, '');
  const variacoes = gerarVariacoesBrasileiras(apenasDigitos);

  log.info('identificando', { original: whatsappNumber, variacoes });

  // 1. Buscar como motorista (testando variações)
  const { data: motorista, error: errMot } = await supabase
    .from('motoristas')
    .select('id, nome, empresa_id, usuario_id, whatsapp')
    .in('whatsapp', variacoes)
    .eq('ativo', true)
    .maybeSingle();

  if (errMot) {
    log.error('motorista_query_failed', {
      code: errMot.code,
      message: errMot.message,
      details: errMot.details,
    });
  }

  if (motorista) {
    log.info('motorista_encontrado', { id: motorista.id, nome: motorista.nome, whatsapp_db: motorista.whatsapp });
    return {
      tipo: 'motorista',
      motorista_id: motorista.id,
      nome: motorista.nome,
      empresa_id: motorista.empresa_id,
      usuario_id: motorista.usuario_id,
    };
  }

  // 2. Buscar como gestor/master
  const { data: perfil, error: errPerfil } = await supabase
    .from('perfis')
    .select(`
      id,
      nome_completo,
      usuario_empresas!inner (
        empresa_id,
        role
      )
    `)
    .in('whatsapp_bot', variacoes)
    .maybeSingle();

  if (errPerfil) {
    log.error('perfil_query_failed', {
      code: errPerfil.code,
      message: errPerfil.message,
      details: errPerfil.details,
    });
  }

  if (perfil && perfil.usuario_empresas && Array.isArray(perfil.usuario_empresas) && perfil.usuario_empresas.length > 0) {
    const ue = perfil.usuario_empresas[0] as { empresa_id: string; role: string };
    if (ue.role === 'master' || ue.role === 'gestor') {
      log.info('gestor_encontrado', { id: perfil.id, role: ue.role });
      return {
        tipo: ue.role as 'gestor' | 'master',
        usuario_id: perfil.id,
        nome: perfil.nome_completo ?? 'Gestor',
        empresa_id: ue.empresa_id,
      };
    }
  }

  log.warn('remetente_desconhecido', { variacoes_tentadas: variacoes });
  return { tipo: 'desconhecido' };
}

/**
 * Gera variações com e sem o "9" do nono dígito brasileiro.
 * A Meta envia `553189791317` (sem 9) mas o cadastro pode ter `5531989791317`.
 */
export function gerarVariacoesBrasileiras(numero: string): string[] {
  const variacoes = new Set<string>([numero]);

  // Aplica só pra números BR de celular: 55 + DDD + 8 ou 9 dígitos
  if (numero.startsWith('55') && (numero.length === 12 || numero.length === 13)) {
    const ddd = numero.slice(2, 4);
    const resto = numero.slice(4);

    if (resto.length === 9 && resto.startsWith('9')) {
      // Cadastrado com 9: tenta também sem o 9
      variacoes.add(`55${ddd}${resto.slice(1)}`);
    } else if (resto.length === 8) {
      // Cadastrado sem 9: tenta também com o 9
      variacoes.add(`55${ddd}9${resto}`);
    }
  }

  return Array.from(variacoes);
}
