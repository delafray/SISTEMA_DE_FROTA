/**
 * Menu Helper — envia um menu como texto numerado E salva as opcoes na
 * sessao. O router (messageRouter.resolverRespostaNumerica) usa essas opcoes
 * salvas para traduzir respostas tipo "1", "2" de volta para o id original,
 * preservando os handlers que esperam msg.tipo === 'lista' ou 'botao'.
 *
 * Por que existe: WhatsApp pessoal + Baileys NAO renderiza listMessage e
 * buttonsMessage de forma confiavel. Texto numerado e o caminho universal.
 */

import { enviarMenuTexto, type OpcaoMenu } from '@/lib/whatsapp/messageSender';
import { updateSession } from '@/lib/whatsapp/sessionManager';

async function salvarMenuNaSessao(
  sessionId: string,
  tipo: 'lista' | 'botao',
  opcoes: OpcaoMenu[]
): Promise<void> {
  await updateSession(sessionId, {
    contexto: {
      menu_opcoes: {
        tipo_original: tipo,
        opcoes: opcoes.map((o) => ({ id: o.id, titulo: o.titulo })),
      },
    },
  });
}

/**
 * Envia menu cuja resposta o handler esperava como `msg.tipo === 'lista'`.
 * O router resolvera o numero respondido pelo usuario para `msg.listaId`.
 */
export async function enviarMenuLista(
  sessionId: string,
  para: string,
  corpo: string,
  opcoes: OpcaoMenu[],
  rodape?: string
): Promise<boolean> {
  const ok = await enviarMenuTexto(para, corpo, opcoes, rodape);
  await salvarMenuNaSessao(sessionId, 'lista', opcoes);
  return ok;
}

/**
 * Envia menu cuja resposta o handler esperava como `msg.tipo === 'botao'`.
 * O router resolvera o numero respondido para `msg.botaoId`.
 */
export async function enviarMenuBotoes(
  sessionId: string,
  para: string,
  corpo: string,
  opcoes: OpcaoMenu[],
  rodape?: string
): Promise<boolean> {
  const ok = await enviarMenuTexto(para, corpo, opcoes, rodape);
  await salvarMenuNaSessao(sessionId, 'botao', opcoes);
  return ok;
}
