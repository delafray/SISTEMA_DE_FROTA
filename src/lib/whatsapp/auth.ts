/**
 * WhatsApp Auth — Identifica o remetente como motorista, gestor ou desconhecido.
 *
 * Lógica (conforme seção 6.14 do plano):
 * 1. Busca em motoristas.whatsapp → role = 'motorista'
 * 2. Busca em perfis.whatsapp_bot → role = 'gestor' ou 'master'
 * 3. Não encontrou → descarta (sem resposta)
 */

import { createClient } from '@supabase/supabase-js';

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

  // Normalizar número (remover +, espaços, etc)
  const numero = whatsappNumber.replace(/\D/g, '');

  // 1. Buscar como motorista
  const { data: motorista } = await supabase
    .from('motoristas')
    .select('id, nome, empresa_id, usuario_id')
    .eq('whatsapp', numero)
    .eq('ativo', true)
    .maybeSingle();

  if (motorista) {
    return {
      tipo: 'motorista',
      motorista_id: motorista.id,
      nome: motorista.nome,
      empresa_id: motorista.empresa_id,
      usuario_id: motorista.usuario_id,
    };
  }

  // 2. Buscar como gestor/master (pelo campo whatsapp_bot do perfil)
  const { data: perfil } = await supabase
    .from('perfis')
    .select(`
      id,
      nome_completo,
      usuario_empresas!inner (
        empresa_id,
        role
      )
    `)
    .eq('whatsapp_bot', numero)
    .maybeSingle();

  if (perfil && perfil.usuario_empresas && Array.isArray(perfil.usuario_empresas) && perfil.usuario_empresas.length > 0) {
    const ue = perfil.usuario_empresas[0] as { empresa_id: string; role: string };
    if (ue.role === 'master' || ue.role === 'gestor') {
      return {
        tipo: ue.role as 'gestor' | 'master',
        usuario_id: perfil.id,
        nome: perfil.nome_completo ?? 'Gestor',
        empresa_id: ue.empresa_id,
      };
    }
  }

  // 3. Não encontrou → desconhecido
  return { tipo: 'desconhecido' };
}
