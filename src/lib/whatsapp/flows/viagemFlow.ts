/**
 * Pedido Flow — Iniciar e Encerrar Pedido (antigo "viagem").
 *
 * 1. Motorista informa origem → destino
 * 2. Seleciona cliente (lista) ou pedido avulso
 * 3. Informa valor do pedido (ou pula)
 * 4. Tira foto do painel para KM inicial
 * 5. Pedido criado no Supabase
 */

import type { ParsedMessage } from '@/lib/whatsapp/messageParser';
import { enviarTexto, enviarBotoes, enviarLista } from '@/lib/whatsapp/messageSender';
import { updateSession, type Sessao } from '@/lib/whatsapp/sessionManager';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function processarViagemFlow(msg: ParsedMessage, sessao: Sessao): Promise<void> {
  switch (sessao.estado) {
    case 'aguardando_origem_destino':
      await processarOrigemDestino(msg, sessao);
      return;

    case 'aguardando_cliente':
      await processarCliente(msg, sessao);
      return;

    case 'aguardando_valor_pedido':
      await processarValorPedido(msg, sessao);
      return;
  }
}

// ─── ETAPA 1: Origem e Destino ───────────────────────────────────────

async function processarOrigemDestino(msg: ParsedMessage, sessao: Sessao): Promise<void> {
  if (msg.tipo !== 'texto' || !msg.texto) {
    await enviarTexto(msg.from, 'Digite a *origem* e o *destino* (ex: São Paulo → Campinas):');
    return;
  }

  const texto = msg.texto.trim();

  // Tentar separar origem/destino
  const separadores = ['→', '->', '=>', '>', ' para ', ' pra ', ' - ', ' a '];
  let origem = '';
  let destino = '';

  for (const sep of separadores) {
    if (texto.toLowerCase().includes(sep.toLowerCase())) {
      const partes = texto.split(new RegExp(sep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
      origem = partes[0]?.trim() ?? '';
      destino = partes[1]?.trim() ?? '';
      break;
    }
  }

  // Se não conseguiu separar, usar texto inteiro como rota
  if (!origem && !destino) {
    origem = texto;
    destino = '';
  }

  // Salvar no contexto
  await updateSession(sessao.id, {
    contexto: {
      pedido_dados: {
        ...(sessao.contexto.pedido_dados as Record<string, unknown> ?? {}),
        origem,
        destino,
      },
    },
  });

  // Buscar clientes da empresa
  const supabase = getSupabase();
  const { data: clientes } = await supabase
    .from('clientes')
    .select('id, nome_fantasia')
    .eq('empresa_id', sessao.empresa_id)
    .eq('ativo', true)
    .order('nome_fantasia')
    .limit(10);

  if (clientes && clientes.length > 0) {
    const itens = clientes.map((c) => ({
      id: `cliente_${c.id}`,
      titulo: (c.nome_fantasia ?? 'Sem nome').slice(0, 24),
    }));

    // Adicionar opção avulso
    itens.push({ id: 'cliente_avulso', titulo: '➕ Pedido avulso' });

    await enviarLista(
      msg.from,
      `Rota: *${origem}${destino ? ' → ' + destino : ''}*\n\nPara qual cliente?`,
      '📋 Selecionar',
      [{ titulo: 'Clientes', itens }]
    );
  } else {
    // Sem clientes → pedido avulso direto
    await updateSession(sessao.id, {
      contexto: {
        pedido_dados: {
          ...(sessao.contexto.pedido_dados as Record<string, unknown> ?? {}),
          origem,
          destino,
          cliente_id: null,
        },
      },
    });

    await enviarBotoes(
      msg.from,
      `Rota: *${origem}${destino ? ' → ' + destino : ''}*\n\nQual o valor do pedido? (R$)`,
      [
        { id: 'pedido_pular', titulo: '⏭️ Pular' },
      ]
    );

    await updateSession(sessao.id, { estado: 'aguardando_valor_pedido' });
    return;
  }

  await updateSession(sessao.id, { estado: 'aguardando_cliente' });
}

// ─── ETAPA 2: Selecionar Cliente ─────────────────────────────────────

async function processarCliente(msg: ParsedMessage, sessao: Sessao): Promise<void> {
  let clienteId: string | null = null;

  if (msg.tipo === 'lista' && msg.listaId) {
    if (msg.listaId === 'cliente_avulso') {
      clienteId = null;
    } else if (msg.listaId.startsWith('cliente_')) {
      clienteId = msg.listaId.replace('cliente_', '');
    }
  } else {
    await enviarTexto(msg.from, 'Selecione um cliente da lista, por favor. 📋');
    return;
  }

  await updateSession(sessao.id, {
    estado: 'aguardando_valor_pedido',
    contexto: {
      pedido_dados: {
        ...(sessao.contexto.pedido_dados as Record<string, unknown> ?? {}),
        cliente_id: clienteId,
      },
    },
  });

  await enviarTexto(msg.from, 'Qual o *valor do pedido*? (R$)\nDigite o valor ou clique em Pular:');
  await enviarBotoes(msg.from, 'Pode informar agora ou depois:', [
    { id: 'pedido_pular', titulo: '⏭️ Pular' },
  ]);
}

// ─── ETAPA 3: Valor do Pedido ────────────────────────────────────────

async function processarValorPedido(msg: ParsedMessage, sessao: Sessao): Promise<void> {
  let valorPedido: number | null = null;

  if (msg.tipo === 'botao' && (msg.botaoId === 'pedido_pular' || msg.botaoId === 'frete_pular')) {
    valorPedido = null;
  } else if (msg.tipo === 'texto' && msg.texto) {
    valorPedido = parseValor(msg.texto);
    if (valorPedido === null) {
      await enviarTexto(msg.from, 'Não entendi o valor. Digite apenas números (ex: 1500 ou 1500,00):');
      return;
    }
  } else {
    await enviarTexto(msg.from, 'Digite o *valor do pedido* ou clique em Pular:');
    return;
  }

  // Agora pede foto do painel para KM inicial
  await enviarTexto(msg.from, '📸 Agora tire a foto do painel para registrar o *KM inicial*.');

  await updateSession(sessao.id, {
    estado: 'aguardando_foto_km',
    contexto: {
      pedido_dados: {
        ...(sessao.contexto.pedido_dados as Record<string, unknown> ?? {}),
        valor_pedido: valorPedido,
        criar_pedido: true, // Flag para o kmFlow saber que deve criar pedido
      },
    },
  });

  // Quando o KM for registrado pelo kmFlow, o pedido será criado
  // TODO: integrar com kmFlow para criar o pedido após confirmação do KM
}

// ─── HELPERS ─────────────────────────────────────────────────────────

function parseValor(texto: string): number | null {
  // Remove R$, espaços, pontos de milhar
  let limpo = texto.replace(/R\$\s*/gi, '').replace(/\s/g, '');

  // Converter formato brasileiro (1.500,00 → 1500.00)
  if (limpo.includes(',')) {
    limpo = limpo.replace(/\./g, '').replace(',', '.');
  }

  const num = parseFloat(limpo);
  if (isNaN(num) || num < 0 || num > 999_999) return null;
  return Math.round(num * 100) / 100;
}
