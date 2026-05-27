/**
 * Menu Helper — envia um menu como texto numerado E salva as opcoes na
 * sessao. O router (messageRouter.resolverRespostaNumerica) usa essas opcoes
 * salvas para traduzir respostas tipo "1", "2" de volta para o id original,
 * preservando os handlers que esperam msg.tipo === 'lista' ou 'botao'.
 *
 * Por padrao, anexa duas opcoes universais ao final de todo menu:
 *   🔙 Voltar (id __voltar__) e 🚪 Sair (id __sair__).
 * O messageRouter intercepta esses IDs ANTES de delegar ao flow:
 *   - Voltar: do menu principal volta para selecao de caminhao; de qualquer
 *     sub-flow volta para o menu principal (resetToMenu).
 *   - Sair: encerra a sessao (estado='novo', contexto limpo) — proxima
 *     mensagem comeca do zero pela selecao de caminhao.
 * Use `opts.incluirVoltar=false` / `opts.incluirSair=false` para omitir nos
 * pontos de entrada (selecao de caminhao) onde nao ha destino para voltar.
 *
 * Por que existe: WhatsApp pessoal + Baileys NAO renderiza listMessage e
 * buttonsMessage de forma confiavel. Texto numerado e o caminho universal.
 */

import { enviarMenuTexto, RESERVED_MENU_IDS, type OpcaoMenu } from '@/lib/whatsapp/messageSender';
import { updateSession } from '@/lib/whatsapp/sessionManager';

export type MenuOpts = {
  /** Default: true. Anexa "🔙 Voltar" ao final do menu. */
  incluirVoltar?: boolean;
  /** Default: true. Anexa "🚪 Sair" ao final do menu. */
  incluirSair?: boolean;
};

function appendOpcoesReservadas(opcoes: OpcaoMenu[], opts: MenuOpts): OpcaoMenu[] {
  const finais: OpcaoMenu[] = [];
  if (opts.incluirVoltar !== false) {
    finais.push({ id: RESERVED_MENU_IDS.VOLTAR, titulo: '🔙 Voltar' });
  }
  if (opts.incluirSair !== false) {
    finais.push({ id: RESERVED_MENU_IDS.SAIR, titulo: '🚪 Sair' });
  }
  return finais.length === 0 ? opcoes : [...opcoes, ...finais];
}

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
  rodape?: string,
  opts: MenuOpts = {}
): Promise<boolean> {
  const todas = appendOpcoesReservadas(opcoes, opts);
  const ok = await enviarMenuTexto(para, corpo, todas, rodape);
  await salvarMenuNaSessao(sessionId, 'lista', todas);
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
  rodape?: string,
  opts: MenuOpts = {}
): Promise<boolean> {
  const todas = appendOpcoesReservadas(opcoes, opts);
  const ok = await enviarMenuTexto(para, corpo, todas, rodape);
  await salvarMenuNaSessao(sessionId, 'botao', todas);
  return ok;
}
