/**
 * API Route — POST /api/motorista/trocar-caminhao
 *
 * Troca de caminhão pelo app do motorista (tela inicial → "Trocar de caminhão").
 *
 * O motorista PODE trocar pra qualquer caminhão cadastrado, inclusive um que
 * está alocado a outro motorista — decisão do dono: NÃO travar a operação aqui
 * (o caminhão saiu da garagem com ele, o sistema tem que refletir a realidade).
 * Em vez de travar, o gestor é AVISADO na tela principal do painel via tabela
 * `lembretes` (widget com Realtime).
 *
 * O que faz, na ordem (mesmo padrão do VinculoResponsavel do painel):
 *  1. Encerra a alocação ativa do motorista (fim = agora).
 *  2. Encerra a alocação ativa do caminhão novo, se estava com outro motorista.
 *  3. Cria a alocação nova (status operacional, inicio = agora).
 *  4. Grava o lembrete/alerta pro gestor.
 *
 * Sem auth de usuario (padrao do projeto: usa SUPABASE_SERVICE_ROLE_KEY,
 * mesmo padrao de /api/pod).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createLogger } from '@/lib/logger';
import { requireSessao } from '@/lib/auth/requireSessao';

const log = createLogger('api_motorista_troca');

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

interface TrocarCaminhaoRequest {
  motorista_id: string;
  empresa_id: string;
  veiculo_id_novo: string;
}

type VeiculoRow = { id: string; apelido: string | null; modelo: string; placa: string; km_atual: number | null };

/** "Leão (ABC1D23)" ou "VW 24.280 (ABC1D23)" — como o caminhão aparece no aviso. */
function rotulo(v: Pick<VeiculoRow, 'apelido' | 'modelo' | 'placa'> | null): string {
  if (!v) return 'nenhum caminhão';
  return `${v.apelido ?? v.modelo} (${v.placa})`;
}

export async function POST(req: NextRequest) {
  const { erro: erroSessao } = await requireSessao();
  if (erroSessao) return erroSessao;
  let body: TrocarCaminhaoRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: 'json_invalido' }, { status: 400 });
  }

  const { motorista_id, empresa_id, veiculo_id_novo } = body;
  const faltando = (['motorista_id', 'empresa_id', 'veiculo_id_novo'] as const).filter((c) => !body[c]);
  if (faltando.length > 0) {
    return NextResponse.json({ erro: 'campos_obrigatorios', faltando }, { status: 400 });
  }

  const supabase = getSupabase();
  const agora = new Date().toISOString();

  // Caminhão novo precisa existir.
  const { data: veiculoNovo, error: errVeiculo } = await supabase
    .from('veiculos')
    .select('id, apelido, modelo, placa, km_atual')
    .eq('id', veiculo_id_novo)
    .maybeSingle();
  if (errVeiculo || !veiculoNovo) {
    return NextResponse.json({ erro: 'veiculo_nao_encontrado' }, { status: 404 });
  }
  const novo = veiculoNovo as VeiculoRow;

  // Nome do motorista pro aviso ao gestor.
  const { data: motorista } = await supabase
    .from('motoristas')
    .select('nome')
    .eq('id', motorista_id)
    .maybeSingle();
  const nomeMotorista = (motorista as { nome?: string } | null)?.nome ?? 'Motorista';

  // Alocação ativa atual do motorista (pode não existir). `alocacoes` não tem
  // FK declarada no banco — nada de join embutido; busca o veículo à parte.
  const { data: alocMotorista } = await supabase
    .from('alocacoes')
    .select('id, veiculo_id')
    .eq('motorista_id', motorista_id)
    .eq('status', 'operacional')
    .is('fim', null)
    .maybeSingle();
  const atual = alocMotorista as { id: string; veiculo_id: string } | null;

  if (atual?.veiculo_id === veiculo_id_novo) {
    return NextResponse.json({ erro: 'mesmo_veiculo', detalhe: 'Você já está com esse caminhão.' }, { status: 409 });
  }

  let veiculoAnterior: Pick<VeiculoRow, 'apelido' | 'modelo' | 'placa'> | null = null;
  if (atual) {
    const { data } = await supabase
      .from('veiculos')
      .select('apelido, modelo, placa')
      .eq('id', atual.veiculo_id)
      .maybeSingle();
    veiculoAnterior = data as typeof veiculoAnterior;
  }

  // Alocação ativa do caminhão novo (estava com outro motorista?).
  const { data: alocOutro } = await supabase
    .from('alocacoes')
    .select('id, motorista_id')
    .eq('veiculo_id', veiculo_id_novo)
    .eq('status', 'operacional')
    .is('fim', null)
    .neq('motorista_id', motorista_id)
    .maybeSingle();
  const ocupadaPor = alocOutro as { id: string; motorista_id: string | null } | null;

  let nomeOutroMotorista: string | null = null;
  if (ocupadaPor?.motorista_id) {
    const { data } = await supabase
      .from('motoristas')
      .select('nome')
      .eq('id', ocupadaPor.motorista_id)
      .maybeSingle();
    nomeOutroMotorista = (data as { nome?: string } | null)?.nome ?? null;
  }

  // 1. Encerra a alocação atual do motorista.
  if (atual) {
    const { error } = await supabase.from('alocacoes').update({ fim: agora }).eq('id', atual.id);
    if (error) {
      log.error('troca_encerrar_atual_falhou', { motorista_id, error: error.message });
      return NextResponse.json({ erro: 'db_encerrar_alocacao', detalhe: error.message }, { status: 500 });
    }
  }

  // 2. Encerra a alocação do outro motorista no caminhão novo (se houver) —
  //    sem isso o caminhão ficaria com duas alocações ativas.
  if (ocupadaPor) {
    const { error } = await supabase.from('alocacoes').update({ fim: agora }).eq('id', ocupadaPor.id);
    if (error) {
      log.error('troca_encerrar_outro_falhou', { veiculo_id_novo, error: error.message });
    }
  }

  // 3. Cria a alocação nova.
  const { error: errNova } = await supabase.from('alocacoes').insert({
    veiculo_id: veiculo_id_novo,
    motorista_id,
    status: 'operacional',
    inicio: agora,
    observacao: 'Troca feita pelo motorista no app',
  });
  if (errNova) {
    log.error('troca_insert_falhou', { motorista_id, veiculo_id_novo, error: errNova.message });
    return NextResponse.json({ erro: 'db_nova_alocacao', detalhe: errNova.message }, { status: 500 });
  }

  // 4. Avisa o gestor na tela principal (widget de lembretes, Realtime).
  const aviso =
    `🔁 ${nomeMotorista} trocou de caminhão pelo app: ${rotulo(veiculoAnterior)} → ${rotulo(novo)}.` +
    (nomeOutroMotorista ? ` Atenção: ${rotulo(novo)} estava com ${nomeOutroMotorista}.` : '');
  const { error: errLembrete } = await supabase.from('lembretes').insert({
    texto: aviso,
    origem: 'app_motorista',
    empresa_id,
    criado_por_nome: nomeMotorista,
  });
  if (errLembrete) {
    // A troca já está feita — não desfaz por causa do aviso, mas registra.
    log.error('troca_lembrete_falhou', { motorista_id, error: errLembrete.message });
  }

  log.info('troca_caminhao_ok', {
    motorista_id,
    de: atual?.veiculo_id ?? null,
    para: veiculo_id_novo,
    estava_com_outro: !!ocupadaPor,
  });
  return NextResponse.json(
    { ok: true, veiculo: novo, aviso_gestor: !errLembrete },
    { status: 201 }
  );
}
