/**
 * Checklist Flow — Checklist diário pré-viagem.
 *
 * Seção 6.7 do plano:
 * 6 itens fixos (MVP), cada um com botões OK / Problema.
 * Se algum ❌ → cria avaria automática + alerta ao gestor.
 * NÃO bloqueia viagem (filosofia: avisa, não impõe).
 */

import type { ParsedMessage } from '@/lib/whatsapp/messageParser';
import { enviarTexto } from '@/lib/whatsapp/messageSender';
import { enviarMenuBotoes } from '@/lib/whatsapp/menuHelper';
import { updateSession, resetToMenu, type Sessao } from '@/lib/whatsapp/sessionManager';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// Itens fixos do checklist (MVP)
const ITENS_CHECKLIST = [
  { id: 'pneus', label: '🔧 PNEUS', pergunta: 'Calibragem e desgaste estão ok?' },
  { id: 'freios', label: '🔧 FREIOS', pergunta: 'Freios estão respondendo bem?' },
  { id: 'farois', label: '💡 FARÓIS/LANTERNAS', pergunta: 'Todos os faróis e lanternas funcionando?' },
  { id: 'oleo_agua', label: '🛢️ ÓLEO/ÁGUA', pergunta: 'Nível de óleo e água ok?' },
  { id: 'triangulo_estepe', label: '⚠️ TRIÂNGULO/ESTEPE', pergunta: 'Triângulo e estepe em condições?' },
  { id: 'documentos', label: '📄 DOCUMENTOS', pergunta: 'CRLV e documentos dentro do caminhão?' },
];

export async function processarChecklistFlow(
  msg: ParsedMessage,
  sessao: Sessao,
  iniciar?: boolean
): Promise<void> {
  if (iniciar) {
    await iniciarChecklist(msg.from, sessao);
    return;
  }

  await processarRespostaChecklist(msg, sessao);
}

// ─── INICIAR CHECKLIST ───────────────────────────────────────────────

async function iniciarChecklist(para: string, sessao: Sessao): Promise<void> {
  const placa = sessao.contexto.veiculo_placa ?? '---';

  await updateSession(sessao.id, {
    estado: 'aguardando_checklist',
    contexto: {
      checklist_index: 0,
      checklist_respostas: {},
    },
  });

  await enviarTexto(para, `Bom dia! 🌅\nVamos conferir o caminhão *${placa}*?`);
  await enviarPerguntaChecklist(sessao.id, para, 0);
}

async function enviarPerguntaChecklist(sessionId: string, para: string, index: number): Promise<void> {
  if (index >= ITENS_CHECKLIST.length) return;

  const item = ITENS_CHECKLIST[index];
  await enviarMenuBotoes(
    sessionId,
    para,
    `*${index + 1}/${ITENS_CHECKLIST.length}  ${item.label}*\n${item.pergunta}`,
    [
      { id: `check_ok_${index}`, titulo: '✅ OK' },
      { id: `check_nok_${index}`, titulo: '❌ Problema' },
    ]
  );
}

// ─── PROCESSAR RESPOSTA ──────────────────────────────────────────────

async function processarRespostaChecklist(msg: ParsedMessage, sessao: Sessao): Promise<void> {
  if (msg.tipo !== 'botao' || !msg.botaoId) {
    const index = (sessao.contexto.checklist_index as number) ?? 0;
    await enviarPerguntaChecklist(sessao.id, msg.from, index);
    return;
  }

  const isOk = msg.botaoId.startsWith('check_ok_');
  const isNok = msg.botaoId.startsWith('check_nok_');

  if (!isOk && !isNok) {
    const index = (sessao.contexto.checklist_index as number) ?? 0;
    await enviarPerguntaChecklist(sessao.id, msg.from, index);
    return;
  }

  const currentIndex = (sessao.contexto.checklist_index as number) ?? 0;
  const respostas = (sessao.contexto.checklist_respostas as Record<string, boolean>) ?? {};
  const item = ITENS_CHECKLIST[currentIndex];

  if (item) {
    respostas[item.id] = isOk;
  }

  const nextIndex = currentIndex + 1;

  // Ainda tem perguntas
  if (nextIndex < ITENS_CHECKLIST.length) {
    await updateSession(sessao.id, {
      contexto: {
        checklist_index: nextIndex,
        checklist_respostas: respostas,
      },
    });
    await enviarPerguntaChecklist(sessao.id, msg.from, nextIndex);
    return;
  }

  // Checklist completo
  await finalizarChecklist(msg.from, sessao, respostas);
}

// ─── FINALIZAR CHECKLIST ─────────────────────────────────────────────

async function finalizarChecklist(
  para: string,
  sessao: Sessao,
  respostas: Record<string, boolean>
): Promise<void> {
  const supabase = getSupabase();

  // Salvar checklist no banco
  const { error } = await supabase.from('checklists_diarios').insert({
    veiculo_id: sessao.contexto.veiculo_id,
    motorista_id: sessao.motorista_id,
    empresa_id: sessao.empresa_id,
    respostas: respostas,
    data: new Date().toISOString().split('T')[0],
  });

  if (error) {
    // Se já existe checklist do dia (UNIQUE constraint) → avisar
    if (error.code === '23505') {
      await enviarTexto(para, '📋 Checklist já foi feito hoje! Bom trabalho 👍');
    } else {
      console.error('[checklistFlow] Erro ao salvar:', error);
      await enviarTexto(para, '❌ Erro ao salvar checklist. Tente novamente.');
    }
    await resetToMenu(sessao.id);
    return;
  }

  // Verificar se houve problemas
  const problemas = Object.entries(respostas)
    .filter(([, ok]) => !ok)
    .map(([id]) => {
      const item = ITENS_CHECKLIST.find((i) => i.id === id);
      return item?.label ?? id;
    });

  if (problemas.length === 0) {
    await enviarTexto(para, '✅ Checklist completo! Tudo certo! 🛣️\nBoa viagem!');
  } else {
    const listaProblemas = problemas.join(', ');
    await enviarTexto(
      para,
      `⚠️ Checklist completo com *${problemas.length} problema(s)*:\n${listaProblemas}\n\nO gestor já foi notificado. Aguarde instruções.`
    );
    // O trigger no banco já cria avaria + alerta ao gestor automaticamente
  }

  await resetToMenu(sessao.id);
}
