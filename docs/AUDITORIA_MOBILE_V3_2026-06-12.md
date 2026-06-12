# Auditoria Mobile v3 (cega) — madrugada 12/06/2026

> Rodada de verificacao agendada (01:10), autonoma. Agentes cegos; financeiro e integridade de gravacao em OPUS.
> 172 achados brutos -> 4 criticos (eram 13 na v2, 11 na v1). Convergencia clara: o grosso virou medio/baixo de polimento.

## Veredicto independente da navegacao

FRÃGIL (muito melhor do que jÃ¡ foi, mas nÃ£o 100% seguro). O grosso do bug histÃ³rico foi corrigido de forma consistente: (1) todos os 26 guards client-side do dashboard usam sessÃ£o LOCAL via temSessao()/usuarioSessao() (getSession, sem ida Ã  rede no caminho feliz) e sempre router.replace â€” nunca push â€” entÃ£o oscilaÃ§Ã£o de rede mÃ³vel nÃ£o derruba mais essas telas nem polui o histÃ³rico; (2) a pÃ¡gina /login tem guarda reversa que devolve pro painel com replace quando hÃ¡ sessÃ£o; (3) o Service Worker nunca cacheia resposta de navegaÃ§Ã£o redirecionada (nÃ£o grava o HTML do /login sob URL do dashboard) e o fallback offline Ã© POR ÃREA (dashboard sem cache â†’ 503, nunca /login). PORÃ‰M sobra exatamente UMA porta de entrada do sintoma no fluxo do gestor: a home "/" (aba "InÃ­cio" do MobileBottomNav, a mais clicada no celular) Ã© Server Component que valida por REDE (supabase.auth.getUser() no servidor) e faz redirect("/login") se user vier null â€” o mesmo padrÃ£o que motivou a criaÃ§Ã£o do temSessao no client. Como os Links do bottom nav fazem prefetch, um getUser que falhe na janela de refresh de token pode assar o redirect pro /login no payload prefetchado, e o toque em "InÃ­cio" (ou um back que re-busca "/") cai no login mesmo logado. A guarda reversa do /login mascara o problema devolvendo pro painel (flash de login + perda da posiÃ§Ã£o no histÃ³rico), mas nÃ£o o elimina â€” e se o Auth do Supabase estiver instÃ¡vel, vira pingue-pongue / â†” /login. HÃ¡ ainda uma assimetria: usuarioSessao() desiste apÃ³s 2 erros seguidos (800ms) e devolve null â†’ chute pro login, enquanto temSessao() trata erro como logado.

### Riscos apontados
- RISCO #1 (o que ainda reproduz o bug): src/app/(dashboard)/page.tsx:54-55 â€” aba 'InÃ­cio' guardada por auth.getUser() DE REDE no servidor + redirect('/login'). Prefetch do bottom nav ou re-fetch do back podem capturar uma janela de refresh de token e mandar o gestor logado pro login. CorreÃ§Ã£o sugerida: no servidor, checar apenas a EXISTÃŠNCIA da sessÃ£o no cookie (getSession/claims) para UX de redirect, deixando identidade real para o RLS â€” mesmo racional jÃ¡ documentado em temSessao.ts.
- RISCO #2: pingue-pongue / â†” /login se o Auth do Supabase ficar instÃ¡vel: o servidor redireciona pro /login (getUser falhou), a guarda reversa do login vÃª sessÃ£o local e replace('/'), o servidor redireciona de novo â€” loop enquanto durar a instabilidade.
- RISCO #3: usuarioSessao() (temSessao.ts:35-40) devolve null se DUAS leituras consecutivas de getSession() errarem (janela de 800ms) â€” em rede mÃ³vel muito ruim durante refresh, as ~18 telas que dependem de user.id ainda chutam pro login. AssimÃ©trico com temSessao(), que trata erro como logado.
- RISCO #4: a guarda reversa do /login (page.tsx:50-52) nÃ£o diferencia 'sem sessÃ£o' de 'getSession errou' â€” se o refresh falhar no exato momento do bounce, o gestor fica preso na tela de login com refresh token ainda vÃ¡lido; e o bounce sempre leva pra '/', perdendo a pÃ¡gina em que ele estava (o replace do guard sobrescreveu a entrada original do histÃ³rico).
- RISCO #5 (menor): login/actions.ts:51 â€” redirect('/') pÃ³s-login Ã© PUSH, entÃ£o /login fica no histÃ³rico; o back depende 100% da guarda reversa (com flash visÃ­vel da tela de login). RedirectType.replace eliminaria a entrada.
- RISCO #6 (menor): sw.js prÃ©-cacheia '/login' no install com credentials same-origin (l.30, 41) â€” se o usuÃ¡rio estiver LOGADO no momento do install, o fetch de '/login' devolve o HTML do login normalmente (pÃ¡gina client) e ok; mas se algum dia /login passar a redirecionar logado no servidor, res.redirected nÃ£o Ã© checado nesse caminho de PRECACHE (sÃ³ no networkFirstNav), e a shell errada entraria no cache.
- ObservaÃ§Ã£o (nÃ£o Ã© chute pro login, mas relacionado): despacho/[id]/page.tsx nÃ£o tem guard nenhum â€” deslogado de verdade, a tela abre vazia em vez de redirecionar; depende de RLS, e o histÃ³rico do projeto registra 'RLS silencioso' como fonte de confusÃ£o.

### Tratados NA HORA pelo modelo principal (madrugada)
- Guard server-side da aba Inicio: getUser (rede) -> getSession (cookie) — ultima tela que chutava logado pro login em rede ruim.
- Guarda reversa do /login agora usa usuarioSessao() (retry em oscilacao).
- despacho/[id] ganhou guard (era a unica tela sem).
- 4 CRITICOS: pedido criado sem entregas ficava invisivel (novo e novo-avancado — agora fica na tela com aviso claro); delete+insert de contatos/locais do cliente com janela de perda (agora aborta no delete com erro e avisa a verdade se o insert falhar); aprovar adiantamento sem confirmacao (agora confirma quando o status muda).
- Integridade (opus): gerarParcelas aborta se o delete falhar; Promise.all de parcelas checa cada update e recarrega do banco em falha; sincronizarPagoPedido nunca mais silencioso; lote de despacho avisa quantos JA foram quando falha no meio; trava de submissao dupla nos locais de carregamento.
- Pendente de DECISAO DO DONO (nao corrigido de proposito): adiantamento criado direto como prestado/aprovado sem data_pagamento — exige regra de negocio (data obrigatoria? status inicial restrito?).

## CRITICO (4)

### [pedidos-formularios] [novo/page.tsx â€” Novo Pedido (Simples)] Erro parcial: pedido criado mas entregas falharam (linhas 256-261)
- **Categoria:** guardrail · **Arquivo:** `src/app/(dashboard)/pedidos/novo/page.tsx`
- **Problema:** Quando o insert de entregas falha, a mensagem de erro Ã© exibida (`setErr`) mas a tela jÃ¡ faz `router.push` para a pÃ¡gina do pedido em seguida â€” o usuÃ¡rio vÃª o alerta por fraÃ§Ãµes de segundo e Ã© redirecionado antes de ler. O pedido fica Ã³rfÃ£o sem entregas sem que o leigo perceba.
- **Sugestao:** Remover o `router.push` do bloco de erro de entregas e manter o usuÃ¡rio na tela com a mensagem de erro visÃ­vel, oferecendo botÃ£o manual para ir ao pedido ou tentar novamente.

### [abastecimentos-adiantamentos] [Adiantamentos â€” Editar] Mudanca de status para 'aprovado' sem confirmacao
- **Categoria:** guardrail · **Arquivo:** `src/app/(dashboard)/adiantamentos/[id]/editar/page.tsx`
- **Problema:** O modal de confirmacao so dispara para status 'recusado' e 'prestado' (editar/page.tsx linha 101). Mudar um adiantamento para 'aprovado' (que libera pagamento e afeta o acerto do motorista) passa direto para o banco sem nenhuma confirmacao. O dono pediu: 'nada pode ser registrado sem alertar o usuario'.
- **Sugestao:** Incluir 'aprovado' na condicao do guard-rail (linha 101): `if (['recusado', 'prestado', 'aprovado'].includes(f.status)) { setConfirmModal({ status: f.status }); return; }`. O modal ja existe e funciona, basta ampliar a condicao.

### [cadastros] [Clientes â€” Editar] Delete de contatos via delete+insert (linha 167-183)
- **Categoria:** guardrail · **Arquivo:** `src/app/(dashboard)/clientes/[id]/editar/page.tsx`
- **Problema:** Ao salvar, o cÃ³digo faz DELETE de TODOS os contatos do cliente (linha 167) e depois INSERT dos contatos atuais. Se o INSERT falhar, os contatos originais jÃ¡ foram apagados e o cliente fica sem nenhum contato â€” dado perdido silenciosamente, com apenas um setErr parcial. NÃ£o hÃ¡ rollback ou transaÃ§Ã£o.
- **Sugestao:** Usar upsert por id para contatos jÃ¡ existentes e insert apenas para novos, ou fazer o delete somente apÃ³s o insert ter sucesso. Alternativamente, usar uma RPC/funÃ§Ã£o Supabase para garantir atomicidade.

### [cadastros] [Clientes â€” Editar] Delete de locais de carregamento via delete+insert (linha 187-200)
- **Categoria:** guardrail · **Arquivo:** `src/app/(dashboard)/clientes/[id]/editar/page.tsx`
- **Problema:** Mesmo padrÃ£o: DELETE de todos os locais (linha 187) antes do INSERT. Se o INSERT falhar, os locais originais sÃ£o perdidos sem aviso adequado ao usuÃ¡rio (sÃ³ um setErr no final â€” sem descrever que os dados foram perdidos).
- **Sugestao:** Fazer o insert/upsert primeiro e sÃ³ deletar registros removidos individualmente, ou usar RPC atÃ´mica.

## ALTO (51)

### [painel] [Painel â€” Pedidos Recentes (mobile)] Container da lista mobile com classe `m-show`
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/page.tsx`
- **Problema:** A `div` com `className="m-show"` usa `display:flex` injetado pelo CSS, mas o estilo inline declara apenas `flexDirection` e `gap` â€” nÃ£o declara `display`. No desktop o CSS global forÃ§a `display:none` nessa classe. Em alguns browsers que respeitam a precedÃªncia inline primeiro, o bloco pode ficar oculto mesmo no mobile porque falta o `display:flex` inline para complementar o que a classe define. O risco real Ã© que o usuÃ¡rio mobile nÃ£o veja a lista de pedidos recentes.
- **Sugestao:** Adicionar `display: 'flex'` no objeto de estilo inline do elemento: `style={{ display: 'flex', flexDirection: 'column', gap: '0' }}`. O padrÃ£o `m-show-block` existe exatamente para casos onde se quer `display:block` â€” aqui falta o equivalente flex declarado inline.

### [painel] [Painel â€” DeleteBtn (usado em tabelas do sistema)] BotÃ£o trigger 'Excluir' com `padding: '4px 6px'` e classe `m-touch`
- **Categoria:** affordance · **Arquivo:** `src/components/ui/DeleteBtn.tsx`
- **Problema:** O botÃ£o 'Excluir' (linha 43-57 de DeleteBtn.tsx) tem `padding: '4px 6px'` e usa a classe `m-touch`. Em mobile.css, `m-touch` aplica `min-height: 44px` e `min-width: 44px`. PorÃ©m, a aparÃªncia visual (`background:none, border:none, color:#ef4444`) torna o botÃ£o visualmente indistinguÃ­vel de um link de texto puro â€” affordance zero para um leigo. O texto 'Excluir' em vermelho sem borda nem fundo parece rÃ³tulo, nÃ£o botÃ£o.
- **Sugestao:** Adicionar borda (`border: '1px solid #fca5a5'`) e fundo leve (`background: '#fef2f2'`) ao botÃ£o trigger, ou usar o componente `Btn` com `variant='danger'` para que a aparÃªncia seja claramente a de um botÃ£o destrutivo.

### [painel] [Painel â€” RemoverUsuarioBtn] BotÃ£o trigger 'Remover' com `padding: '4px 6px'`
- **Categoria:** affordance · **Arquivo:** `src/components/ui/RemoverUsuarioBtn.tsx`
- **Problema:** Mesmo problema do DeleteBtn: o botÃ£o 'Remover' (linha 33-42 de RemoverUsuarioBtn.tsx) tem `background:none, border:none` â€” visualmente parece texto vermelho, nÃ£o botÃ£o. Pessoa leiga pode nÃ£o perceber que Ã© clicÃ¡vel.
- **Sugestao:** Igual ao DeleteBtn: adicionar borda e fundo leve para diferenciar visualmente de texto puro, ou migrar para o componente `Btn` com `variant='danger'`.

### [pedidos-listagem] [Listagem de Pedidos (mobile)] MobileCard â€” area clicavel do card
- **Categoria:** affordance · **Arquivo:** `src/app/(dashboard)/pedidos/page.tsx`
- **Problema:** O card inteiro (onClick) navega para /despacho/[id], mas o botao 'Editar' dentro do card (linha 454) chama e.stopPropagation() e navega para /pedidos/[id]/editar. O card NAO tem indicacao visual de que e clicavel para o despacho, e o leigo nao tem como saber que tocar no card abre o despacho enquanto o botao Editar abre outra tela. Dois destinos diferentes no mesmo card confundem totalmente um usuario leigo.
- **Sugestao:** Unificar o destino do card: se o fluxo principal do mobile e editar o pedido, o onClick do card deve ir para /pedidos/[id]/editar (igual ao botao interno), ou remover o botao Editar e deixar o card inteiro como entrada para o despacho â€” mas nunca dois destinos diferentes sem aviso.

### [pedidos-formularios] [novo/page.tsx â€” Novo Pedido (Simples)] BotÃ£o 'Criar Pedido' (submit)
- **Categoria:** loading · **Arquivo:** `src/app/(dashboard)/pedidos/novo/page.tsx`
- **Problema:** O `Btn` com `disabled={saving}` nÃ£o recebe a prop `loading`, entÃ£o o spinner nunca aparece durante o salvamento. O botÃ£o apenas fica desabilitado e troca o texto para 'Criando pedido...', mas sem indicador visual giratÃ³rio â€” leigo clica de novo achando que travou.
- **Sugestao:** Adicionar a prop `loading={saving}` ao `<Btn type="submit" ...>`, assim o spinner do BtnSpinner (jÃ¡ implementado no ds.tsx) aparece e o botÃ£o fica em cursor:wait automaticamente.

### [pedidos-formularios] [novo/page.tsx â€” Novo Pedido (Simples)] Modal 'Salvar locais' â€” prop `loading` ausente (linha 759)
- **Categoria:** loading · **Arquivo:** `src/app/(dashboard)/pedidos/novo/page.tsx`
- **Problema:** O botÃ£o 'Salvar no cadastro' usa `disabled={salvandoLocal}` mas nÃ£o tem `loading={salvandoLocal}`. Durante o save o usuÃ¡rio vÃª o botÃ£o desabilitado sem spinner, podendo clicar mÃºltiplas vezes antes de a UI reagir.
- **Sugestao:** Adicionar `loading={salvandoLocal}` ao Btn do modal.

### [pedidos-formularios] [novo-avancado/page.tsx â€” Novo Pedido AvanÃ§ado] BotÃ£o 'Confirmar e Criar Pedido' (linha 636-643)
- **Categoria:** loading · **Arquivo:** `src/app/(dashboard)/pedidos/novo-avancado/page.tsx`
- **Problema:** O botÃ£o usa `disabled={saving || !!veiculoEmManutencao}` mas nÃ£o tem `loading={saving}`. Sem a prop `loading`, o spinner do BtnSpinner nÃ£o aparece durante o salvamento assÃ­ncrono (empresaDoVeiculo + empresaDoMotorista + insert). O leigo nÃ£o sabe se estÃ¡ processando.
- **Sugestao:** Adicionar `loading={saving}` ao Btn de submit.

### [pedidos-formularios] [[id]/editar/page.tsx â€” Editar Pedido] BotÃ£o 'Atualizar Pedido' â€” versÃ£o mobile (linha 290-294)
- **Categoria:** loading · **Arquivo:** `src/app/(dashboard)/pedidos/[id]/editar/page.tsx`
- **Problema:** No mobile, o botÃ£o 'Atualizar Pedido' Ã© renderizado dentro de `.m-show` (flex), porÃ©m `.m-show` por padrÃ£o usa `display: none` no desktop e `display: flex` no mobile. O problema Ã© que o container em `.m-show` nÃ£o define `gap`, entÃ£o os dois botÃµes (Cancelar + Atualizar Pedido) ficam colados sem espaÃ§amento â€” a linha 290 usa `gap: '8px'` inline no style, mas `.m-show` sobrescreve o display para flex. Verificando: o style Ã© `{ padding: '8px 16px', gap: '8px', justifyContent: 'flex-end', borderTop: '1px solid #f1f5f9' }` â€” o gap estÃ¡ definido inline, entÃ£o nÃ£o hÃ¡ colisÃ£o de fato. PorÃ©m o botÃ£o 'Atualizar Pedido' nÃ£o tem prop `loading={saving}`, apenas `disabled={saving}` â€” sem spinner.
- **Sugestao:** Adicionar `loading={saving}` ao Btn 'Atualizar Pedido' nas duas ocorrÃªncias (desktop linha 284 e mobile linha 292).

### [despacho] [Despacho â€” Lista / CardDespachoMobile] BotÃµes 'ðŸ—ºï¸ Rota' e 'Trocar' propagam clique para navegaÃ§Ã£o do card
- **Categoria:** navegacao · **Arquivo:** `src/app/(dashboard)/despacho/_components/CardDespachoMobile.tsx:91-104`
- **Problema:** CardDespachoMobile.tsx linhas 91-104: no bloco 'despachado', o div dos botÃµes nÃ£o para a propagaÃ§Ã£o do clique (sem stopPropagation), diferente do bloco 'nÃ£o despachado' (linha 65). Clicar em 'Rota' ou 'Trocar' dispara tambÃ©m o router.push() do MobileCard, navegando para a pÃ¡gina de detalhe ao mesmo tempo.
- **Sugestao:** Envolver o div dos botÃµes no bloco 'despachado' com onClick={e => e.stopPropagation()}, igual ao bloco 'nÃ£o despachado' na linha 65.

### [despacho] [Despacho â€” Lista / ModalDespacho] Modal em tela cheia no mobile sem botÃ£o X no topo
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/despacho/_components/ModalDespacho.tsx:79-180`
- **Problema:** ModalDespacho.tsx linhas 79-180: no mobile, via classe 'm-modal-content', o modal expande para full-screen (mobile.css linhas 99-116). O Ãºnico caminho de fecho Ã© o botÃ£o 'Cancelar' no rodapÃ© (linha 164). Ao rolar o conteÃºdo, o rodapÃ© sai da viewport inicial e o leigo nÃ£o encontra como fechar.
- **Sugestao:** Adicionar botÃ£o X no cabeÃ§alho do modal (topo direito), igual ao padrÃ£o do ModalRota linha 59.

### [despacho] [Despacho â€” Detalhe [id]/page.tsx] abrirDespacho() â€” sem loading nos botÃµes enquanto carrega caminhÃµes/motoristas
- **Categoria:** loading · **Arquivo:** `src/app/(dashboard)/despacho/[id]/page.tsx:105-119`
- **Problema:** page.tsx linhas 105-119: abrirDespacho() faz dois SELECTs antes de abrir o modal. Durante esse await, o botÃ£o que o disparou (ex.: 'Despachar agora' no Bloco) nÃ£o recebe estado loading nem fica disabled. O leigo clica vÃ¡rias vezes achando que nÃ£o funcionou.
- **Sugestao:** Adicionar estado 'abrindoDespacho' (boolean), setar true antes dos awaits e passar como loading e disabled nos Btn que chamam onAbrirDespacho.

### [despacho] [Despacho â€” Detalhe / ConfirmStatusModal] textarea com autoFocus empurra botÃµes para fora da tela no mobile
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/despacho/[id]/_components/ConfirmStatusModal.tsx:74-109`
- **Problema:** ConfirmStatusModal.tsx linha 74: o textarea tem autoFocus. Em mobile, isso abre o teclado virtual imediatamente, comprimindo a viewport e escondendo os botÃµes 'Voltar' e 'Confirmar' (linhas 92-109) abaixo do teclado. O modal usa padding:16px fixo sem accommodate para o teclado.
- **Sugestao:** Remover autoFocus do textarea. Se quiser foco, aplicar via useEffect sÃ³ em desktop (window.innerWidth > 768).

### [entregas] [Listagem de Pedidos (entregas/page.tsx)] Filtros desktop (toolbar) â€” duplicados mas sem acesso no mobile ao filtro de perÃ­odo
- **Categoria:** navegacao · **Arquivo:** `src/app/(dashboard)/entregas/page.tsx`
- **Problema:** A toolbar desktop (linha 411-449) tem o seletor de 'PerÃ­odo Pago' com inputs de data personalizada. O bloco mobile (m-show-block, linha 484-508) replica o select de status e o botÃ£o Pagos, mas omite completamente o seletor de perÃ­odo (mes_atual/ano_atual/personalizado) no modo mostrarPagos. O leigo mobile que ativa 'Ver Pagos' nunca consegue filtrar por perÃ­odo.
- **Sugestao:** Adicionar o select de filtroPeriodo (e os inputs de data personalizada) ao bloco mobile (m-show-block) quando mostrarPagos for true, assim como jÃ¡ Ã© feito no desktop.

### [entregas] [Listagem de Pedidos (entregas/page.tsx)] BotÃ£o 'Receber' no MobileCard â€” aÃ§Ã£o sem identificaÃ§Ã£o do pedido no modal de confirmaÃ§Ã£o
- **Categoria:** guardrail · **Arquivo:** `src/app/(dashboard)/entregas/page.tsx`
- **Problema:** O modal de confirmaÃ§Ã£o de recebimento (linha 655-677) exibe a mensagem genÃ©rica 'Deseja marcar este pedido como pago?' sem mencionar nenhum identificador do pedido (nÃºmero, motorista, valor). Em uma lista com vÃ¡rios pedidos concluÃ­dos, o leigo pode confirmar o pedido errado sem perceber.
- **Sugestao:** No modal, exibir o nÃºmero/rÃ³tulo do pedido e o valor esperado: 'Confirmar recebimento do Pedido #123 â€” R$ 1.500,00?' para que o leigo confirme com certeza.

### [entregas] [Listagem de Pedidos (entregas/page.tsx)] loadAll() no cÃ¡lculo de receita (KPIs e receitaFiltrada)
- **Categoria:** integridade · **Arquivo:** `src/app/(dashboard)/entregas/page.tsx`
- **Problema:** As funÃ§Ãµes carregarKpis (linhas 232-241) e carregarPagina (linhas 330-335) usam loadAll() que percorre todas as linhas do banco para somar valor_pedido. A REGRA DO DONO proÃ­be isso em telas de listagem que crescem com a operaÃ§Ã£o. Com 10.000+ pedidos isso vai escalar para dezenas de chamadas de 1.000 linhas cada.
- **Sugestao:** Criar uma RPC no Supabase (SQL: SELECT SUM(valor_pedido) FROM pedidos WHERE ...) e substituir o loadAll pelo resultado da RPC. Isso reduz a carga a uma Ãºnica chamada leve.

### [entregas] [Novo Pedido (entregas/novo/page.tsx)] BotÃ£o 'Criar Pedido' sem prop loading â€” spinner ausente durante saving
- **Categoria:** loading · **Arquivo:** `src/app/(dashboard)/entregas/novo/page.tsx`
- **Problema:** Na linha 259, o Btn de submit tem disabled={saving || sem_recursos} mas nÃ£o tem loading={saving}. O Btn do design system exibe spinner e cursor de espera apenas quando loading=true. Sem esse prop, durante o saving o botÃ£o apenas fica desabilitado (opacidade normal, sem spinner) â€” o leigo nÃ£o recebe feedback visual de que algo estÃ¡ acontecendo.
- **Sugestao:** Adicionar loading={saving} ao Btn de submit na linha 259: <Btn type='submit' disabled={saving || sem_recursos} loading={saving}>.

### [financeiro] [Despesas Avulsas â€” modal Nova/Editar Despesa] Modal CRUD (div.m-modal-content) com FormSection + rodapÃ© Cancelar/Excluir/Salvar
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/financeiro/_components/AvulsasTab.tsx:344`
- **Problema:** No mobile o CSS forÃ§a .m-modal-content a min-height:100vh e max-height:100vh, mas o conteÃºdo NÃƒO estÃ¡ dentro de um wrapper .m-modal-body (que Ã© quem tem overflow-y:auto). O formulÃ¡rio Ã© longo (descriÃ§Ã£o, categoria, valor, vencimento, forma, fornecedor, observaÃ§Ãµes, checkbox 'jÃ¡ pago' + 3 botÃµes). Em ~390px o rodapÃ© com Salvar/Cancelar fica abaixo da dobra e SEM rolagem interna â€” o usuÃ¡rio leigo nÃ£o consegue salvar nem cancelar a despesa.
- **Sugestao:** Envolver o corpo do modal (FormSection) numa div className="m-modal-body" (jÃ¡ existe no mobile.css com overflow-y:auto e safe-area), mantendo o rodapÃ© de botÃµes fora dela ou fixo.

### [financeiro] [RecorrÃªncias â€” modal Nova/Editar RecorrÃªncia] Modal CRUD (div.m-modal-content) com FormSection (8 campos) + rodapÃ© de botÃµes
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/financeiro/_components/RecorrenciasTab.tsx:333`
- **Problema:** Mesmo defeito do modal de Avulsas: .m-modal-content vira fullscreen 100vh no mobile sem wrapper .m-modal-body com scroll. Com 8 campos (descriÃ§Ã£o, categoria, tipo, valor, dia venc., inÃ­cio, fim, checkbox ativo) o rodapÃ© Salvar/Cancelar/Excluir sai da tela e nÃ£o hÃ¡ rolagem interna â€” gestor leigo trava sem conseguir concluir.
- **Sugestao:** Aplicar o wrapper .m-modal-body em volta da FormSection para habilitar overflow-y:auto no mobile.

### [financeiro] [Financeiro por Cliente (/faturamento) â€” painel financeiro do pedido] Inputs de valor (R$) e data de cada parcela com gravaÃ§Ã£o no onBlur
- **Categoria:** guardrail · **Arquivo:** `src/app/(dashboard)/faturamento/_components/FinanceiroPedido.tsx:410`
- **Problema:** A gravaÃ§Ã£o do valor/data da parcela acontece SÃ“ no onBlur. No mobile, depois de digitar o valor o usuÃ¡rio toca direto no botÃ£o 'Baixar' ou fecha o painel â€” o blur pode nÃ£o disparar de forma confiÃ¡vel, ou o usuÃ¡rio acha que 'jÃ¡ salvou' porque o nÃºmero aparece. NÃ£o hÃ¡ botÃ£o explÃ­cito 'Salvar parcela' nem aviso de alteraÃ§Ã£o pendente: o gestor leigo edita o valor de uma parcela de dinheiro e pode sair achando que gravou quando nÃ£o gravou.
- **Sugestao:** Mostrar indicador de 'alteraÃ§Ã£o nÃ£o salva' quando valorEdit[p.id] difere do valor atual e oferecer um botÃ£o explÃ­cito de confirmar por parcela (ou salvar no Enter alÃ©m do blur).

### [financeiro] [Financeiro por Cliente (/faturamento) â€” botÃ£o Baixar por parcela] Btn 'ðŸ’° Baixar' de cada parcela (atualizarParcela com pago:true)
- **Categoria:** guardrail · **Arquivo:** `src/app/(dashboard)/faturamento/_components/FinanceiroPedido.tsx:434`
- **Problema:** A baixa do pagamento ÃšNICO tem modal de confirmaÃ§Ã£o (linha 352), mas a baixa POR PARCELA marca pago e grava data_pagamento direto no clique, SEM confirmaÃ§Ã£o (linha 435). Ã‰ dinheiro entrando: o dono pediu que nada financeiro seja registrado sem alertar/pedir confirmaÃ§Ã£o. Inconsistente e arriscado â€” toque acidental no mobile registra recebimento.
- **Sugestao:** Pedir confirmaÃ§Ã£o antes de baixar a parcela (reaproveitar um modal como o do estorno), exibindo nÃºmero, valor e data, igual Ã  baixa do pagamento Ãºnico.

### [abastecimentos-adiantamentos] [Abastecimentos â€” Novo / Editar (formularios)] Botao 'Salvar Abastecimento' / 'Atualizar Abastecimento' no rodape do formulario
- **Categoria:** loading · **Arquivo:** `src/app/(dashboard)/abastecimentos/novo/page.tsx`
- **Problema:** O botao recebe `disabled={saving}` mas nao recebe `loading={saving}`. Segundo ds.tsx linha 85, o spinner so aparece quando a prop `loading` e verdadeira. Sem ela, ao salvar o botao fica cinza/desabilitado mas sem nenhum spinner ou indicador de progresso â€” pessoa leiga clica, nao ve nada acontecendo, toca novamente.
- **Sugestao:** Trocar `<Btn type="submit" disabled={saving}>` por `<Btn type="submit" loading={saving}>` nas linhas 156 (novo) e 192 (editar). O componente Btn ja desabilita e exibe spinner automaticamente quando `loading=true`.

### [abastecimentos-adiantamentos] [Adiantamentos â€” Novo / Editar (formularios)] Botao 'Salvar Adiantamento' no rodape do formulario
- **Categoria:** loading · **Arquivo:** `src/app/(dashboard)/adiantamentos/novo/page.tsx`
- **Problema:** Mesmo problema dos abastecimentos: `disabled={saving}` sem `loading={saving}`. O spinner do Btn nao e exibido; o botao apenas desabilita sem feedback visual de atividade assincrona.
- **Sugestao:** Trocar `<Btn type="submit" disabled={saving}>` por `<Btn type="submit" loading={saving}>` na linha 165 (novo) e linha 236 (editar).

### [abastecimentos-adiantamentos] [Abastecimentos â€” Novo / Editar (formularios)] Botoes 'Voltar para Lista', 'Cancelar' e 'Salvar' no PageHeader
- **Categoria:** affordance · **Arquivo:** `src/app/(dashboard)/abastecimentos/novo/page.tsx`
- **Problema:** Todo o bloco de acoes do cabecalho esta envolto em `<span className="m-hide">` (novo/page.tsx linha 95, editar/page.tsx linha 120). No celular esses botoes ficam completamente invisiveis. O unico caminho para salvar ou cancelar fica no rodape do formulario, abaixo da dobra â€” usuario leigo que nao rola ate o fim fica preso sem acao visivel no topo.
- **Sugestao:** Adicionar fora do `m-hide` (ou em bloco `m-show`) um botao de salvar sticky no topo, ou tornar o rodape de acoes `position: sticky; bottom: 0` para que a acao principal fique sempre visivel no mobile sem precisar rolar.

### [abastecimentos-adiantamentos] [Adiantamentos â€” Novo / Editar (formularios)] Botoes 'Voltar para Lista', 'Cancelar' e 'Salvar' no PageHeader
- **Categoria:** affordance · **Arquivo:** `src/app/(dashboard)/adiantamentos/novo/page.tsx`
- **Problema:** Mesmo problema: bloco inteiro dentro de `<span className="m-hide">` (novo/page.tsx linha 78, editar/page.tsx linha 124). No celular o cabecalho exibe apenas o titulo sem nenhuma acao. O rodape de botoes fica abaixo da dobra quando o formulario e longo (textarea de justificativa expande).
- **Sugestao:** Incluir pelo menos o botao primario de salvar fora do bloco m-hide, ou tornar o rodape de acoes sticky (`position: sticky; bottom: 0`) para que fique sempre visivel acima do bottom nav.

### [abastecimentos-adiantamentos] [Abastecimentos â€” Listagem / Adiantamentos â€” Listagem] KPIs calculados via loadAll (soma de litros/custo em abastecimentos; soma por status em adiantamentos)
- **Categoria:** loading · **Arquivo:** `src/app/(dashboard)/abastecimentos/page.tsx`
- **Problema:** Ambas as paginas usam `loadAll` para calcular KPIs de soma, varrendo todas as linhas do banco em multiplas chamadas paginadas (abastecimentos/page.tsx linhas 183-193; adiantamentos/page.tsx linhas 142-162). Isso viola a REGRA DO DONO ('NAO usar loadAll nessas telas'). Com milhares de registros, o mobile fica travado exibindo '...' nos cards de KPI por tempo indeterminado, sem indicador de progresso.
- **Sugestao:** Criar RPCs de agregacao no Supabase (ex: `SELECT SUM(litros), SUM(valor_total) FROM abastecimentos WHERE empresa_id = $1`) e chamar via `.rpc()`. Enquanto a RPC nao existe, exibir um spinner nos KPIs e limitar o loadAll com um teto de paginas para nao travar o mobile indefinidamente.

### [abastecimentos-adiantamentos] [Adiantamentos â€” Novo] Aviso inline ao criar adiantamento com status nao-pendente
- **Categoria:** guardrail · **Arquivo:** `src/app/(dashboard)/adiantamentos/novo/page.tsx`
- **Problema:** O formulario de criacao exibe apenas um box amarelo de texto quando o status nao e 'pendente' (novo/page.tsx linhas 133-137), mas permite salvar normalmente sem confirmacao. Criar um adiantamento ja como 'aprovado' ou 'prestado' e acao de alto impacto financeiro que deveria exigir confirmacao, nao apenas aviso passivo que o leigo pode ignorar.
- **Sugestao:** Substituir o aviso passivo por um modal de confirmacao antes do insert quando `f.status !== 'pendente'`, seguindo o mesmo padrao do editar (confirmModal / doSave).

### [veiculos-motoristas] [Editar VeÃ­culo â€” aba Dados (sub-abas EspecificaÃ§Ãµes e Documentos)] BotÃ£o 'Atualizar' no PageHeader
- **Categoria:** guardrail · **Arquivo:** `src/app/(dashboard)/veiculos/[id]/editar/page.tsx`
- **Problema:** O botÃ£o 'Atualizar' sÃ³ aparece no PageHeader quando tab === 'dados' (linha 151). Mas as sub-abas 'EspecificaÃ§Ãµes' e 'Documentos' tambÃ©m pertencem Ã  aba 'dados' e tÃªm campos editÃ¡veis que sÃ£o salvos pelo mesmo handleSubmit. O usuÃ¡rio troca para a sub-aba Documentos, altera o IPVA, e o botÃ£o 'Atualizar' no header estÃ¡ visÃ­vel â€” porÃ©m ao clicar, a validaÃ§Ã£o verifica placa/marca/modelo (que estÃ£o na sub-aba Principal, fora da tela). Se algum campo obrigatÃ³rio estiver vazio, o erro aparece mas o usuÃ¡rio nÃ£o vÃª qual sub-aba tem o problema e nÃ£o hÃ¡ navegaÃ§Ã£o automÃ¡tica para ela (ao contrÃ¡rio do que acontece no formulÃ¡rio de motorista).
- **Sugestao:** Ao detectar erro de campo obrigatÃ³rio, trocar dadosSubTab para 'principal' automaticamente (igual ao setTab('cnh') do motorista). Adicionar mensagem indicando em qual sub-aba estÃ¡ o erro.

### [veiculos-motoristas] [Editar VeÃ­culo â€” aba ManutenÃ§Ãµes (ManutencoesTab)] Modal 'Atualizar KM do veÃ­culo' â€” botÃ£o 'Confirmar alteraÃ§Ã£o'
- **Categoria:** loading · **Arquivo:** `src/app/(dashboard)/veiculos/[id]/editar/_components/ManutencoesTab.tsx`
- **Problema:** O botÃ£o usa <Btn> com disabled={!podeSalvarKm || salvandoKmGestor} mas nÃ£o usa a prop loading. Quando salvandoKmGestor=true, o texto continua 'Confirmar alteraÃ§Ã£o' â€” nÃ£o hÃ¡ spinner nem texto de progresso no botÃ£o. O usuÃ¡rio nÃ£o tem feedback de que a operaÃ§Ã£o crÃ­tica (que pode excluir manutenÃ§Ãµes) estÃ¡ em andamento alÃ©m do botÃ£o ficar desabilitado. A linha 639 usa apenas disabled={!podeSalvarKm || salvandoKmGestor} sem loading.
- **Sugestao:** Adicionar loading={salvandoKmGestor} no <Btn> da linha 639 e atualizar o texto para 'Salvando...' via children condicionais ou deixar o spinner do Btn fazer o trabalho.

### [veiculos-motoristas] [Editar VeÃ­culo â€” aba Avarias (AvariasTab)] Select de status de avaria no mobile
- **Categoria:** affordance · **Arquivo:** `src/app/(dashboard)/veiculos/[id]/editar/_components/AvariasTab.tsx`
- **Problema:** Na visÃ£o mobile, o status da avaria Ã© exibido como texto simples no details do MobileCard (linha 213: { label: 'Status', value: av.status }). O usuÃ¡rio nÃ£o consegue alterar o status pelo mobile â€” sÃ³ existe o select de status na visÃ£o desktop (m-hide). A Ãºnica aÃ§Ã£o disponÃ­vel no mobile Ã© excluir. Um gestor usando o celular nÃ£o tem como marcar uma avaria como 'resolvida' sem acessar o desktop.
- **Sugestao:** Adicionar no actions do MobileCard um select de status (igual ao do desktop) ou um conjunto de botÃµes rÃ¡pidos ('Marcar resolvida' / 'Em reparo') que chamem mudarStatusPedirConfirm.

### [veiculos-motoristas] [Editar Motorista â€” aba Acerto Mensal (AcertoMensalTab)] BotÃ£o 'Adicionar' ajuste sem loading nem validaÃ§Ã£o visual
- **Categoria:** guardrail · **Arquivo:** `src/app/(dashboard)/motoristas/[id]/editar/_components/AcertoMensalTab.tsx`
- **Problema:** A funÃ§Ã£o addAjuste (linha 196) tem validaÃ§Ã£o silenciosa: se descriÃ§Ã£o ou valor estiverem vazios, simplesmente retorna sem nenhuma mensagem de erro ao usuÃ¡rio. O botÃ£o 'Adicionar' nÃ£o fornece feedback â€” o leigo clica, nada acontece, e nÃ£o sabe por quÃª.
- **Sugestao:** Exibir mensagem de erro inline (ex.: setErro ou um estado local de validaÃ§Ã£o) quando descriÃ§Ã£o ou valor estiverem faltando. Alternativa: desabilitar o botÃ£o com visual cinza + tooltip quando os campos obrigatÃ³rios estiverem vazios.

### [veiculos-motoristas] [Novo Motorista / Editar Motorista â€” aba RemuneraÃ§Ã£o] Campos 'SalÃ¡rio Fixo' e 'Valor da DiÃ¡ria por Pedido' (type=number)
- **Categoria:** entrada-dado · **Arquivo:** `src/app/(dashboard)/motoristas/novo/page.tsx`
- **Problema:** Os dois campos usam type='number' step='0.01' inputMode='decimal' com valor controlado diretamente. O usuÃ¡rio leigo no celular pode digitar '1200,00' (com vÃ­rgula) â€” no iOS Safari o teclado decimal gera vÃ­rgula. O parseFloat('1200,00') retorna NaN, que ao ser enviado para o banco salva NULL silenciosamente (a condiÃ§Ã£o Ã© f.salario_fixo ? parseFloat(...) : null â€” se parseFloat retorna NaN, a condiÃ§Ã£o Ã© truthy mas o valor salvo Ã© NaN, que o Supabase pode rejeitar ou salvar como null sem alertar o usuÃ¡rio).
- **Sugestao:** Usar IMaskInput com mask Number (igual ao campo 'Valor AquisiÃ§Ã£o' do veÃ­culo) nesses dois campos, ou fazer replace(',', '.') antes do parseFloat e validar isNaN antes de salvar.

### [cadastros] [Clientes â€” Novo] BotÃ£o de remover contato (Ã­cone Trash2 sem texto, sem classe m-touch)
- **Categoria:** affordance · **Arquivo:** `src/app/(dashboard)/clientes/novo/page.tsx`
- **Problema:** O botÃ£o de lixeira para remover contatos (linha 301) usa background:none, border:none, padding nÃ£o definido e SEM a classe m-touch. O alvo de toque Ã© o tamanho do Ã­cone Lucide (16px Ã— 16px), muito abaixo dos 44px recomendados. Para pessoa leiga no celular, Ã© muito difÃ­cil de acertar.
- **Sugestao:** Adicionar className='m-touch' e padding mÃ­nimo (ex: padding:'12px') ao botÃ£o de lixeira na linha 301, ou usar o componente ActionBtn que jÃ¡ tem m-touch-grow.

### [cadastros] [Clientes â€” Editar] BotÃ£o de remover contato (Ã­cone Trash2 sem texto, sem classe m-touch)
- **Categoria:** affordance · **Arquivo:** `src/app/(dashboard)/clientes/[id]/editar/page.tsx`
- **Problema:** Mesmo problema da tela Novo: o botÃ£o Trash2 de remover contatos (linha 366) nÃ£o tem classe m-touch e o alvo de toque Ã© 16px Ã— 16px.
- **Sugestao:** Adicionar className='m-touch' e padding adequado ao botÃ£o Trash2 na linha 366.

### [cadastros] [Clientes â€” Editar] BotÃ£o de remover local de carregamento (Ã­cone Trash2 sem texto, sem classe m-touch)
- **Categoria:** affordance · **Arquivo:** `src/app/(dashboard)/clientes/[id]/editar/page.tsx`
- **Problema:** O botÃ£o de lixeira para remover locais de carregamento (linha 439) tambÃ©m usa background:none, border:none sem classe m-touch, alvo de toque de 16px.
- **Sugestao:** Adicionar className='m-touch' e padding ao botÃ£o Trash2 na linha 439.

### [cadastros] [Clientes â€” Editar] IMaskInput de Telefone (campos de contatos existentes)
- **Categoria:** entrada-dado · **Arquivo:** `src/app/(dashboard)/clientes/[id]/editar/page.tsx`
- **Problema:** O IMaskInput do telefone dos contatos na aba Contatos (linhas 385 e 388) nÃ£o recebe value={...}. Ao carregar o formulÃ¡rio de ediÃ§Ã£o, o campo de telefone e WhatsApp de contatos existentes aparece vazio visualmente, embora o valor esteja no react-hook-form. O usuÃ¡rio pode achar que estÃ¡ em branco e nÃ£o preencher, gravando null quando jÃ¡ havia um nÃºmero salvo.
- **Sugestao:** Passar value={field.telefone} (do useFieldArray) para o IMaskInput dos campos telefone e whatsapp dos contatos, assim como Ã© feito no IMaskInput do documento principal (linha 259).

### [cadastros] [Clientes â€” Novo] BotÃ£o 'Salvar Cliente' no PageHeader â€” sem loading prop
- **Categoria:** loading · **Arquivo:** `src/app/(dashboard)/clientes/novo/page.tsx`
- **Problema:** O Btn de submit no PageHeader (linha 148) usa disabled={isSubmitting} mas NÃƒO passa loading={isSubmitting}. O componente Btn exibe spinner apenas quando loading=true. O botÃ£o fica desabilitado mas sem indicador visual de carregamento (sem spinner), deixando o usuÃ¡rio sem saber se o sistema estÃ¡ processando.
- **Sugestao:** Mudar para <Btn type='submit' size='md' loading={isSubmitting} disabled={isSubmitting}> na linha 148 para exibir o spinner durante o salvamento.

### [cadastros] [Clientes â€” Editar] BotÃ£o 'Atualizar Cliente' no PageHeader â€” sem loading prop
- **Categoria:** loading · **Arquivo:** `src/app/(dashboard)/clientes/[id]/editar/page.tsx`
- **Problema:** Mesmo problema: o Btn no PageHeader (linha 229) usa disabled={isSubmitting} sem loading={isSubmitting}. Sem spinner visÃ­vel durante o salvamento.
- **Sugestao:** Adicionar loading={isSubmitting} ao Btn do PageHeader na linha 229.

### [cadastros] [Usuarios â€” Novo] Campo 'Vincular ao Motorista' â€” sem obrigatoriedade quando role=motorista
- **Categoria:** guardrail · **Arquivo:** `src/app/(dashboard)/usuarios/novo/page.tsx`
- **Problema:** Quando role='motorista', o campo 'Vincular ao Motorista' Ã© exibido (linha 110-117) mas nÃ£o tem required e nÃ£o Ã© validado no servidor. Um motorista pode ser criado sem vÃ­nculo com o registro de motorista, quebrando a lÃ³gica de negÃ³cio silenciosamente (o motorista ficaria sem telefone vinculado, sem perfil de motorista).
- **Sugestao:** Adicionar validaÃ§Ã£o no servidor (actions.ts linha 53-55): se role='motorista' e motorista_id estiver vazio, retornar erro 'Selecione o motorista para vincular a este usuÃ¡rio'.

### [cadastros] [Perfil â€” Trocar Senha] BotÃ£o 'Salvar' sem loading prop
- **Categoria:** loading · **Arquivo:** `src/app/(dashboard)/perfil/page.tsx`
- **Problema:** O Btn de submit da pÃ¡gina de perfil (linha 140) usa disabled={saving} mas nÃ£o passa loading={saving}. Durante a troca de senha (que faz duas chamadas: signInWithPassword + updateUser), o botÃ£o fica desabilitado mas sem spinner. UsuÃ¡rio leigo pode pensar que o clique nÃ£o foi registrado.
- **Sugestao:** Alterar para <Btn type='submit' variant='primary' loading={saving} disabled={saving}> na linha 140.

### [cadastros] [Empresas â€” Novo] BotÃ£o 'Salvar Empresa' no PageHeader â€” sem loading prop
- **Categoria:** loading · **Arquivo:** `src/app/(dashboard)/empresas/novo/page.tsx`
- **Problema:** O Btn no PageHeader (linha 83) usa disabled={saving} sem loading={saving}. Sem spinner visÃ­vel durante o salvamento.
- **Sugestao:** Adicionar loading={saving} ao Btn do PageHeader na linha 83.

### [cadastros] [Empresas â€” Editar] BotÃ£o 'Atualizar Empresa' no PageHeader â€” sem loading prop
- **Categoria:** loading · **Arquivo:** `src/app/(dashboard)/empresas/[id]/editar/page.tsx`
- **Problema:** O Btn no PageHeader (linha 267) usa disabled={saving} sem loading={saving}. Sem spinner visÃ­vel durante o salvamento.
- **Sugestao:** Adicionar loading={saving} ao Btn do PageHeader na linha 267.

### [cadastros] [Clientes â€” Editar] IMaskInput do Telefone principal (linha 282) nÃ£o recebe value
- **Categoria:** entrada-dado · **Arquivo:** `src/app/(dashboard)/clientes/[id]/editar/page.tsx`
- **Problema:** Na tela de ediÃ§Ã£o, o IMaskInput de Telefone do cliente (linha 282) nÃ£o tem prop value. O telefone Ã© carregado no formulÃ¡rio via reset() (linha 107 com telefone: cliente.telefone ?? ''), mas como IMaskInput nÃ£o Ã© controlado via value, o campo fica visualmente vazio ao abrir a tela de ediÃ§Ã£o, mesmo que o dado exista no banco. O usuÃ¡rio vÃª campo vazio e pode sobrescrever com nulo.
- **Sugestao:** Adicionar uma variÃ¡vel de estado para o valor do telefone (como foi feito para docValue na linha 65) e passar como value ao IMaskInput, ou usar a prop defaultValue com o valor formatado carregado do banco.

### [regras-autorizacoes-relatorios] [Regras â€” /regras/novo e /regras/[id]/editar] BotÃµes 'Voltar', 'Cancelar', 'Tabelas e campos' e 'Salvar' no PageHeader
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/regras/[id]/editar/page.tsx`
- **Problema:** O `PageHeader` renderiza `actions` como um flex-row sem quebra de linha (`flexShrink: 0`, sem `flexWrap`). No mobile a 390px, com 3â€“4 botÃµes em /regras/[id]/editar (Voltar + Tabelas e campos + Cancelar + Salvar), o conjunto transborda para fora da tela ou esmaga os botÃµes, tornando-os ilegÃ­veis e difÃ­ceis de tocar.
- **Sugestao:** Adicionar `flexWrap: 'wrap'` no div `page-header-actions` em ds.tsx ou reduzir o nÃºmero de botÃµes no PageHeader da tela editar (ex.: mover 'Tabelas e campos' para dentro do formulÃ¡rio, e deixar sÃ³ Voltar + Salvar no header).

### [regras-autorizacoes-relatorios] [AutorizaÃ§Ãµes â€” /autorizacoes] Modal de telefone novo/editar â€” sem classes de modal mobile do projeto
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/autorizacoes/page.tsx`
- **Problema:** O modal (linha 383â€“398) nÃ£o usa as classes `m-modal-overlay`/`m-modal-content` definidas em mobile.css. No mobile, o modal aparece como card flutuante com `padding: 16` e `maxWidth: 420`, podendo ser cortado pelo teclado virtual que sobe ao focar no input de telefone.
- **Sugestao:** Adicionar as classes `m-modal-overlay` e `m-modal-content` ao overlay e ao div interno do componente `Modal` (linha 423â€“435), para que no mobile o modal seja full-screen e o teclado nÃ£o corte o conteÃºdo.

### [regras-autorizacoes-relatorios] [AutorizaÃ§Ãµes â€” /autorizacoes] Ciclar permissÃ£o para nÃ­vel 'registrar' sem confirmaÃ§Ã£o
- **Categoria:** guardrail · **Arquivo:** `src/app/(dashboard)/autorizacoes/page.tsx`
- **Problema:** No mobile, o botÃ£o de ciclar permissÃ£o de uma regra para um telefone (linha 337â€“342) altera o nÃ­vel diretamente (nenhum â†’ consultar â†’ alterar â†’ registrar). Dar nÃ­vel 'registrar' a um nÃºmero errado permite que aquele nÃºmero crie registros no banco via bot. NÃ£o hÃ¡ aviso ao operador leigo sobre as consequÃªncias.
- **Sugestao:** Ao ciclar para o nÃ­vel 'registrar', mostrar modal de confirmaÃ§Ã£o: 'VocÃª estÃ¡ dando acesso de REGISTRAR (criar dados no sistema) para este nÃºmero. Confirma?' Os nÃ­veis consultar e alterar podem permanecer sem confirmaÃ§Ã£o.

### [regras-autorizacoes-relatorios] [RelatÃ³rios â€” /relatorios] Grade de KPIs com 6 colunas e valores monetÃ¡rios truncados no mobile
- **Categoria:** tabela · **Arquivo:** `src/app/(dashboard)/relatorios/page.tsx`
- **Problema:** No mobile, a classe `m-kpi-grid` colapsa para 2 colunas (mobile.css linhas 191â€“196). Os valores monetÃ¡rios (linhas 333â€“336) tÃªm `whiteSpace: 'nowrap'` e `textOverflow: 'ellipsis'` â€” em 2 colunas a 390px cada card tem ~180px e valores como 'R$ 1.234.567,89' sÃ£o truncados com ellipsis, tornando a informaÃ§Ã£o financeira ilegÃ­vel para o gestor.
- **Sugestao:** Remover `whiteSpace: 'nowrap'` nos KPIs monetÃ¡rios, deixar quebra de linha, ou reduzir os KPIs exibidos no mobile para os mais relevantes (Receita, Custo, Lucro, Margem) colapsando os outros.

### [regras-autorizacoes-relatorios] [RoteirizaÃ§Ã£o â€” /roteirizacao] Inputs de 'Origem â€” Latitude' e 'Origem â€” Longitude'
- **Categoria:** entrada-dado · **Arquivo:** `src/app/(dashboard)/roteirizacao/page.tsx`
- **Problema:** Os campos exigem que o usuÃ¡rio digite coordenadas geogrÃ¡ficas numÃ©ricas brutas (ex.: -23.550520, -46.633308). Para um gestor leigo isso Ã© incompreensÃ­vel. Embora exista o botÃ£o 'Usar minha localizaÃ§Ã£o', nÃ£o hÃ¡ fallback de preenchimento por endereÃ§o textual, e os campos ficam visÃ­veis e vazios confundindo o usuÃ¡rio.
- **Sugestao:** Tornar os campos de lat/lng somente leitura e ocultos, deixando apenas o botÃ£o 'Usar minha localizaÃ§Ã£o' como aÃ§Ã£o visÃ­vel. Exibir o endereÃ§o resolvido ao usuÃ¡rio (ex.: 'Rua X, SÃ£o Paulo') em vez das coordenadas brutas.

### [integridade-gravacao] [Novo Pedido (simples)] INSERT entregas apÃ³s INSERT pedido (handleSubmit)
- **Categoria:** integridade · **Arquivo:** `src/app/(dashboard)/pedidos/novo/page.tsx:256-262`
- **Problema:** GravaÃ§Ã£o multi-tabela com falha parcial INVISÃVEL ao usuÃ¡rio. O pedido Ã© criado (linha 223) e, se o insert das entregas falhar (linha 252-254), o cÃ³digo seta setErr(...) mas IMEDIATAMENTE executa router.push(`/pedidos/${pedido.id}`) (linha 260). A navegaÃ§Ã£o desmonta a tela e o setErr nunca chega a ser visto. Resultado concreto: fica um pedido SEM nenhuma entrega no banco e o gestor acredita que cadastrou tudo certo (a tela de detalhe abre como se estivesse ok). Os endereÃ§os digitados sÃ£o perdidos.
- **Sugestao:** NÃ£o navegar quando hÃ¡ erro: ao falhar o insert das entregas, NÃƒO chamar router.push â€” manter o usuÃ¡rio na tela com o Alert visÃ­vel e oferecer 'tentar novamente as entregas' (reaproveitando pedido.id jÃ¡ criado), ou rodar pedido+entregas dentro de uma RPC/transaÃ§Ã£o no Supabase para que a falha das entregas faÃ§a rollback do pedido.

### [integridade-gravacao] [Novo Pedido (modo avanÃ§ado)] UPDATE entregas (vÃ­nculo das entregas selecionadas ao pedido)
- **Categoria:** integridade · **Arquivo:** `src/app/(dashboard)/pedidos/novo-avancado/page.tsx:295-303`
- **Problema:** GravaÃ§Ã£o SILENCIOSA sem checagem de erro. ApÃ³s criar o pedido (linha 272), as entregas selecionadas sÃ£o vinculadas via supabase.from('entregas').update(...).in('id', ...) (linha 296-302) mas o retorno { error } Ã© totalmente ignorado. CenÃ¡rio concreto: o pedido Ã© criado e o redirect acontece (linha 306), mas se o update das entregas falhar (RLS, conflito, rede), as entregas NÃƒO ficam ligadas ao pedido â€” o gestor vÃª um pedido 'vazio' e as entregas continuam Ã³rfÃ£s na fila, sem qualquer aviso de que algo deu errado.
- **Sugestao:** Capturar { error } do update das entregas e, se falhar, exibir Alert ('Pedido criado, mas as entregas nÃ£o foram vinculadas: ...') SEM navegar, permitindo nova tentativa. Idealmente fazer pedido+vÃ­nculo em RPC transacional.

### [integridade-gravacao] [Financeiro do Pedido (faturamento) â€” Gerar parcelas] delete + insert de pedido_parcelas (gerarParcelas)
- **Categoria:** integridade · **Arquivo:** `src/app/(dashboard)/faturamento/_components/FinanceiroPedido.tsx:194-214`
- **Problema:** OperaÃ§Ã£o destrutiva NÃƒO atÃ´mica. gerarParcelas faz DELETE de TODAS as parcelas (linha 197) e logo em seguida INSERT das novas (linha 198), mas o resultado do delete nÃ£o Ã© verificado. Se o delete tiver sucesso e o insert falhar (linha 206 sÃ³ seta erro), o pedido fica SEM nenhuma parcela â€” o parcelamento anterior foi apagado e o novo nÃ£o entrou. NÃ£o hÃ¡ rollback. Como o botÃ£o 'Gerar parcelas' aparece quando parcelas.length===0, o caso mais comum Ã© ok, mas reexecuÃ§Ãµes do fluxo podem apagar parcelas existentes silenciosamente se o insert falhar.
- **Sugestao:** Checar o { error } do delete antes do insert e abortar se falhar; gerar via RPC transacional (delete+insert juntos) ou usar upsert por (pedido_id, numero). Se houver parcelamento existente, pedir confirmaÃ§Ã£o antes de regerar.

### [integridade-gravacao] [Financeiro do Pedido (faturamento) â€” Editar valor / Salvar condiÃ§Ãµes] Promise.all de UPDATEs em pedido_parcelas (salvarValorParcela e salvarCondicoes)
- **Categoria:** integridade · **Arquivo:** `src/app/(dashboard)/faturamento/_components/FinanceiroPedido.tsx:254-259`
- **Problema:** AtualizaÃ§Ã£o em cascata de vÃ¡rias parcelas via Promise.all SEM checar o erro de cada update individual. Em salvarValorParcela (linha 254-258) e salvarCondicoes (linha 173-177), os updates das parcelas reconciliadas rodam em paralelo e o estado local Ã© atualizado (setParcelas) como se TODOS tivessem gravado. CenÃ¡rio concreto: se um dos updates falhar (rede, RLS, conflito de updated_at), a UI mostra a soma reconciliada ('âœ“ consolidado') mas o banco fica com uma parcela no valor antigo â†’ a soma das parcelas no banco diverge do total a receber, e o gestor nÃ£o recebe nenhum aviso. Dinheiro a receber fica inconsistente de forma invisÃ­vel.
- **Sugestao:** Coletar os resultados do Promise.all e verificar se algum tem error; se houver, exibir erro e recarregar do banco (carregar()) em vez de confiar no estado local. Idealmente reconciliar todas as parcelas numa Ãºnica RPC transacional.

## MEDIO (81)

### [painel] [Painel â€” Status da Frota] Grid `repeat(auto-fill, minmax(150px, 1fr))` com cards de status
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/page.tsx`
- **Problema:** Em 390px o grid de `minmax(150px, 1fr)` gera 2 colunas de ~185px cada, sem nenhuma classe ou media query para colapsar para 1 coluna. O modelo e o label de status usam `font-size:10-11px` e `opacity:0.7-0.85`, tornando o texto difÃ­cil de ler. NÃ£o hÃ¡ `m-grid` nem `m-stack` aplicados â€” Ã© grid fixo sem adaptaÃ§Ã£o mobile.
- **Sugestao:** Adicionar a classe `m-grid` ao container ou trocar `minmax(150px, 1fr)` por `minmax(min(150px, 100%), 1fr)` e aumentar o font-size do modelo/label para pelo menos 12px sem opacidade reduzida.

### [painel] [Painel â€” Em Rota Agora] Grid `repeat(auto-fill, minmax(240px, 1fr))` com cards de pedidos em andamento
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/page.tsx`
- **Problema:** Em 390px, `minmax(240px, 1fr)` resulta em 1 coluna de 390px com overflow horizontal se o padding do pai for descontado (padding 16px em ambos os lados = 358px disponÃ­veis). O card usa `flexWrap:wrap` interno, mas sem `min-width:0` no container os itens de texto como `v.placa v.modelo` podem extrapolar o limite lateral sem truncar.
- **Sugestao:** Adicionar `minWidth: 0` ao container do card interno e limitar o grid com `grid-template-columns: '1fr'` no mobile via classe `m-grid`.

### [painel] [Painel â€” Alertas pendentes] Link de alerta com texto longo (nome do motorista, data, tipo de documento)
- **Categoria:** tabela · **Arquivo:** `src/app/(dashboard)/page.tsx`
- **Problema:** Cada alerta renderiza `a.msg` em `<span>` sem `overflow:hidden`, `textOverflow:'ellipsis'` ou `whiteSpace:'nowrap'`. Em mensagens longas como `'ManutenÃ§Ã£o vencida: Troca de Ã³leo â€” ABC-1234 (750 km atrasada)'` o texto quebra em mÃºltiplas linhas no card, empurrando o `'Editar â†’'` do `marginLeft:auto` para a segunda linha ou para fora do alinhamento flex.
- **Sugestao:** Adicionar `minWidth: 0` ao `<span>` do texto, `overflow:'hidden'`, `textOverflow:'ellipsis'` e `whiteSpace:'nowrap'`, ou manter quebra de linha mas fixar a altura mÃ¡xima e garantir que `'Editar â†’'` fique `alignSelf:'flex-start'` para nÃ£o perder referÃªncia visual.

### [painel] [Painel â€” LembretesWidget: modal CienteModal] BotÃ£o 'Salvando...' â€” dois botÃµes com texto idÃªntico durante o loading
- **Categoria:** loading · **Arquivo:** `src/components/dashboard/LembretesWidget.tsx`
- **Problema:** Quando `salvando=true`, tanto o botÃ£o 'Salvar e manter na tela' quanto o botÃ£o 'Ciente e ocultar' exibem o texto `'Salvando...'` (linhas 178 e 191 de LembretesWidget.tsx). Um usuÃ¡rio leigo que clicou em um dos dois nÃ£o sabe qual aÃ§Ã£o estÃ¡ em curso, nem qual botÃ£o estÃ¡ desabilitado com `manterDesabilitado`. A confusÃ£o pode levar a mÃºltiplos cliques no outro botÃ£o.
- **Sugestao:** Usar um estado `salvandoAcao: 'manter' | 'ocultar' | null` e exibir 'Salvando...' apenas no botÃ£o que foi clicado, deixando o outro completamente desabilitado mas com seu rÃ³tulo original.

### [painel] [Painel â€” LembretesWidget: modal HistoricoModal] Modal com `maxHeight: 'calc(80vh - env(safe-area-inset-top) - env(safe-area-inset-bottom))'`
- **Categoria:** layout · **Arquivo:** `src/components/dashboard/LembretesWidget.tsx`
- **Problema:** O modal do HistÃ³rico usa `maxHeight` calculado com safe areas, mas nÃ£o usa as classes `m-modal-overlay` / `m-modal-content` / `m-modal-body` definidas em mobile.css. No mobile (390px), o modal fica com `width:100%` limitado a `maxWidth:560px` â€” ocupa toda a tela horizontal corretamente â€” mas sem `border-radius:0` e sem padding-top com safe-area-inset-top, o conteÃºdo pode ficar coberto pelo Dynamic Island / notch em iPhones recentes.
- **Sugestao:** Adicionar `paddingTop: 'env(safe-area-inset-top, 0px)'` ao header do modal e/ou aplicar as classes `m-modal-overlay` e `m-modal-content` que jÃ¡ tratam isso em mobile.css (linha 98-116).

### [painel] [Painel â€” Drawer de navegaÃ§Ã£o mobile (MobileDrawer)] BotÃ£o fechar drawer: `width: 36px, height: 36px`
- **Categoria:** affordance · **Arquivo:** `src/components/layout/Sidebar.tsx`
- **Problema:** O botÃ£o de fechar o drawer lateral (CloseIcon) tem dimensÃµes inline fixas de 36Ã—36px â€” abaixo do mÃ­nimo de 44px exigido pelo Apple HIG. NÃ£o possui classe `m-touch` nem `m-touch-grow`, logo o CSS de mobile.css nÃ£o corrige o tamanho. Em telas de alta densidade (iPhone) o botÃ£o Ã© pequeno e difÃ­cil de acertar.
- **Sugestao:** Aumentar para `width: '44px', height: '44px'` ou adicionar a classe `m-touch` ao botÃ£o para que o mobile.css aplique o mÃ­nimo automaticamente.

### [painel] [Painel â€” Sidebar desktop: rodapÃ© 'Meu Perfil' e 'Sair'] Link 'Meu Perfil' e button 'Sair' com `padding: '6px 8px'`
- **Categoria:** affordance · **Arquivo:** `src/components/layout/Sidebar.tsx`
- **Problema:** No drawer mobile, os itens 'Meu Perfil' e 'Sair' (SidebarContent, linhas 230-276) tÃªm `padding: '6px 8px'` sem `minHeight` e sem classe `m-touch`. O alvo de toque resultante fica em torno de ~28-32px de altura â€” muito abaixo de 44px. O botÃ£o Sair Ã© especialmente crÃ­tico pois o gestor precisa sair do sistema com seguranÃ§a.
- **Sugestao:** Adicionar `minHeight: '44px'` ao estilo inline do Link 'Meu Perfil' e do button 'Sair', ou adicionar a classe `m-touch` a ambos.

### [painel] [Painel â€” pÃ¡gina inteira] Server Component sem estado de carregamento (page.tsx Ã© async/server)
- **Categoria:** loading · **Arquivo:** `src/app/(dashboard)/page.tsx`
- **Problema:** O painel executa 14 queries em paralelo no servidor antes de renderizar qualquer coisa. Se o Supabase demorar ou falhar, a tela fica em branco por tempo indeterminado sem nenhum indicador de progresso para o usuÃ¡rio. NÃ£o hÃ¡ tratamento de erro visÃ­vel: se uma das queries falhar com exceÃ§Ã£o, o Next.js mostra a tela de erro padrÃ£o, nÃ£o uma mensagem amigÃ¡vel.
- **Sugestao:** Extrair as seÃ§Ãµes de dados mais pesados (status frota, alertas) para componentes com `Suspense` + `loading.tsx` ou skeleton, e adicionar um `error.tsx` na pasta do dashboard com mensagem amigÃ¡vel para o leigo ('NÃ£o foi possÃ­vel carregar o painel. Tente atualizar a pÃ¡gina.').

### [pedidos-listagem] [Listagem de Pedidos (mobile)] MobileFAB â€” botao flutuante '+ Novo Pedido'
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/pedidos/page.tsx`
- **Problema:** O MobileFAB e posicionado fixed com bottom = calc(var(--bottom-nav-h) + var(--safe-bottom) + 16px) (mobile.css linha 72), ficando sobre o conteudo. O container scrollavel (div flex com overflow auto, page.tsx linha 306) nao tem padding-bottom extra para compensar a altura do FAB. O ultimo card da lista pode ficar parcialmente obstruido pelo FAB em telas com poucos itens ou no final do scroll.
- **Sugestao:** Adicionar padding-bottom de aprox. 80px ao container scrollavel no mobile para que o ultimo card nunca fique atras do FAB. Pode-se usar a classe has-bottom-nav com ajuste adicional para a altura do FAB.

### [pedidos-listagem] [Listagem de Pedidos (mobile)] Estado de carregamento da lista mobile (linha 429-430)
- **Categoria:** loading · **Arquivo:** `src/app/(dashboard)/pedidos/page.tsx`
- **Problema:** Durante loading, o MobileList recebe apenas um <div> com texto 'Carregando...' sem spinner ou animacao. Para o leigo parece que a tela travou. O componente MobileList so fica visivel via .m-show (display:flex no mobile), entao o texto aparece corretamente, mas sem feedback visual animado nao ha percepcao de progresso.
- **Sugestao:** Substituir o div de texto 'Carregando...' por um componente com animacao (spinner ou skeleton cards) para dar feedback visual claro de carregamento.

### [pedidos-listagem] [Pedido /[id] â€” pagina de redirect] Texto 'Abrindo no Despacho...' sem indicador de progresso (page.tsx linhas 44-48)
- **Categoria:** loading · **Arquivo:** `src/app/(dashboard)/pedidos/[id]/page.tsx`
- **Problema:** Enquanto o redirect processa, a tela exibe somente texto estatico 'Abrindo no Despacho...' sem spinner, barra de progresso ou qualquer animacao. Em conexao lenta o leigo ve tela parada por varios segundos sem saber se o sistema travou.
- **Sugestao:** Adicionar spinner ou animacao de pulso ao lado do texto de redirect para indicar que o sistema esta processando.

### [pedidos-formularios] [novo/page.tsx â€” Novo Pedido (Simples)] Grid 'Valor do pedido / Data prevista' (linha 585)
- **Categoria:** entrada-dado · **Arquivo:** `src/app/(dashboard)/pedidos/novo/page.tsx`
- **Problema:** O container usa `display: grid; gridTemplateColumns: 1fr 1fr` com a classe `m-grid`, entÃ£o colapsa para 1 coluna no mobile â€” isso Ã© correto. PorÃ©m o campo de valor usa `IMaskInput` sem `id` nem associaÃ§Ã£o ao `<label>` do `FormField` (FormField renderiza um `<label>` genÃ©rico sem `htmlFor`). No iOS o toque no label nÃ£o foca o input mascarado.
- **Sugestao:** Passar `id` ao IMaskInput e `htmlFor` correspondente via FormField, ou embrulhar IMaskInput dentro do label diretamente.

### [pedidos-formularios] [novo/page.tsx â€” Novo Pedido (Simples)] Modal 'Salvar locais no cadastro' â€” botÃ£o 'Salvar no cadastro' (linha 759)
- **Categoria:** affordance · **Arquivo:** `src/app/(dashboard)/pedidos/novo/page.tsx`
- **Problema:** O botÃ£o fica disabled enquanto `salvandoLocal` Ã© false E nenhum nome foi preenchido (`!avulsosParaSalvar.some(l => l.nome.trim())`). Para o leigo, o modal aparece com o botÃ£o primÃ¡rio cinza/desabilitado logo de inÃ­cio, sem nenhuma explicaÃ§Ã£o visual de por que nÃ£o pode clicar. Parece botÃ£o morto.
- **Sugestao:** Adicionar hint abaixo dos campos de nome explicando 'Preencha o nome acima para salvar' quando todos estiverem vazios, ou habilitar o botÃ£o e validar ao clicar com mensagem clara.

### [pedidos-formularios] [novo/page.tsx â€” Novo Pedido (Simples)] BotÃµes 'Adicionar local avulso' e 'Adicionar endereÃ§o' (linhas 561-574, 654-668)
- **Categoria:** affordance · **Arquivo:** `src/app/(dashboard)/pedidos/novo/page.tsx`
- **Problema:** Dois botÃµes com `border: '1px dashed'` e fundo quase branco (#f8fafc). No mobile, com borda tracejada e sem preenchimento colorido, parecem anotaÃ§Ãµes de texto ou divisores â€” nÃ£o parecem clicÃ¡veis para um leigo. A altura desses botÃµes nÃ£o Ã© garantida em 44px (sÃ³ tÃªm padding: 8px 16px, fontSize 13px, resultando em ~37px de altura).
- **Sugestao:** Definir `minHeight: '44px'` nesses botÃµes e trocar a aparÃªncia para algo mais claramente clicÃ¡vel (fundo levemente colorido ou borda sÃ³lida com Ã­cone de soma destacado).

### [pedidos-formularios] [novo-avancado/page.tsx â€” Novo Pedido AvanÃ§ado] BotÃ£o 'AvanÃ§ar para Entregas â†’' no Step 1 (linha 373)
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/pedidos/novo-avancado/page.tsx`
- **Problema:** O botÃ£o recebe `loading={checkingVeiculo}` e `disabled={checkingVeiculo}` corretamente, mas o texto dentro muda condicionalmente para 'Verificando...' fora da prop loading â€” o spinner aparece E o texto muda, ficando: spinner + 'Verificando...'. RedundÃ¢ncia que confunde, mas a principal Ã© que a classe `m-touch` (minHeight:44px) sÃ³ atua no mobile; o botÃ£o pode ter altura menor do que 44px no mobile dependendo do padding definido pela variante `sm` do Btn (padding: 4px 12px, fontSize: 11px â€” altura resultante ~27px no Btn default sm).
- **Sugestao:** A classe m-touch jÃ¡ garante minHeight:44px no mobile para os Btn. Confirmar que o size do Btn Ã© ao menos 'md' para que o padding natural chegue perto de 44px no desktop tambÃ©m.

### [pedidos-formularios] [novo-avancado/page.tsx â€” Novo Pedido AvanÃ§ado â€” Step 3] Grid de 2 colunas no Step 3 (linha 460): `m-stack` com `gridTemplateColumns: 1fr 1fr`
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/pedidos/novo-avancado/page.tsx`
- **Problema:** A classe `m-stack` colapsa para 1 coluna no mobile (mobile.css linha 162). O bloco esquerdo (veÃ­culo + itinerÃ¡rio) e o bloco direito (formulÃ¡rio dados) ficam empilhados verticalmente. O formulÃ¡rio de dados (status, valor, km, local, observaÃ§Ãµes) fica abaixo do itinerÃ¡rio â€” o usuÃ¡rio precisa rolar bastante antes de chegar ao botÃ£o 'Confirmar'. Em 390px o Step 3 pode ser muito longo.
- **Sugestao:** No mobile, reordenar o conteÃºdo para colocar o formulÃ¡rio de dados acima do itinerÃ¡rio, ou usar abas para separar 'VeÃ­culo' de 'Dados do Pedido'.

### [pedidos-formularios] [[id]/editar/page.tsx â€” Editar Pedido] Tabela 'Entregas Vinculadas' â€” coluna 'Rota' (linha 463)
- **Categoria:** tabela · **Arquivo:** `src/app/(dashboard)/pedidos/[id]/editar/page.tsx`
- **Problema:** A Td da rota usa `maxWidth: '160px'` com `overflow: hidden; textOverflow: ellipsis; whiteSpace: nowrap`. No mobile, as colunas 'Cliente', 'Coleta' sÃ£o ocultadas via `m-hide`, sobrando Rota + Status + botÃ£o Desvincular. Em 390px, com uma coluna de status e um botÃ£o 'Desvincular' (que tem `whiteSpace: nowrap`), a coluna 'Rota' fica espremida e pode truncar para poucos caracteres â€” origem e destino longos ficam totalmente ilegÃ­veis.
- **Sugestao:** Remover o maxWidth fixo da coluna Rota ou deixar que ela use o espaÃ§o restante dinamicamente (sem maxWidth, o overflow:hidden+ellipsis jÃ¡ trunca). Considerar tornar o botÃ£o Desvincular um Ã­cone de lixeira no mobile para liberar espaÃ§o.

### [pedidos-formularios] [[id]/editar/page.tsx â€” Editar Pedido] Aba 'Adicionar Entregas' â€” instruÃ§Ã£o de como confirmar (linha 487)
- **Categoria:** guardrail · **Arquivo:** `src/app/(dashboard)/pedidos/[id]/editar/page.tsx`
- **Problema:** O texto diz 'clique em Atualizar Pedido (no celular: abaixo das abas) pra confirmar'. No mobile, o botÃ£o 'Atualizar Pedido' fica abaixo das abas na barra fixa, mas essa barra fica no topo da pÃ¡gina (dentro do layout), nÃ£o necessariamente visÃ­vel se o usuÃ¡rio rolou para baixo. O leigo pode selecionar entregas, rolar para baixo vendo a tabela, e nÃ£o encontrar o botÃ£o de confirmaÃ§Ã£o.
- **Sugestao:** Adicionar um botÃ£o flutuante ou sticky no rodapÃ© da aba 'Adicionar Entregas' que sÃ³ aparece quando `selectedEntregas.size > 0`, com texto 'Confirmar +N entregas'.

### [pedidos-formularios] [[id]/editar/page.tsx â€” Editar Pedido] BotÃ£o 'Ajuste manual (gestor)' (linha 434)
- **Categoria:** guardrail · **Arquivo:** `src/app/(dashboard)/pedidos/[id]/editar/page.tsx`
- **Problema:** O botÃ£o de ajuste manual do KM tem `minHeight: '44px'` explÃ­cito â€” correto. PorÃ©m, no contexto do LinhaCampos ele fica dentro de um flex com `alignItems: 'stretch'`, o que pode fazer o botÃ£o crescer alÃ©m de 44px verticalmente dependendo do conteÃºdo do Campo ao lado. Isso Ã© aceitÃ¡vel. O problema real Ã© outro: ao clicar no botÃ£o, o campo km_inicial fica editÃ¡vel, mas nÃ£o hÃ¡ mensagem de confirmaÃ§Ã£o ou guard-rail antes de alterar um valor crÃ­tico (KM jÃ¡ registrado pelo motorista). O botÃ£o muda imediatamente o estado sem avisar consequÃªncias.
- **Sugestao:** Antes de abrir o campo editÃ¡vel, exibir um `window.confirm` ou um Alert inline explicando que alterar o KM inicial substitui o valor registrado pelo motorista, pedindo confirmaÃ§Ã£o.

### [pedidos-formularios] [importar/page.tsx + EtapaUpload] Input `type='file'` para XML e Planilha (linhas 135-144, 206-213)
- **Categoria:** loading · **Arquivo:** `src/app/(dashboard)/pedidos/importar/_components/EtapaUpload.tsx`
- **Problema:** Inputs do tipo file no mobile iOS/Android sÃ£o renderizados como botÃµes nativos do sistema, mas aqui recebem `style={inputStyle}` que inclui `width: '100%'`, `padding: '8px 12px'`, `border: '1px solid #cbd5e1'`. No iOS Safari, o input file estilizado pode ficar com aparÃªncia inconsistente. O mais importante: nÃ£o existe feedback visual de progresso apÃ³s seleÃ§Ã£o do arquivo â€” o usuÃ¡rio seleciona um XML grande, a tela nÃ£o mostra nada atÃ© o parse terminar (apenas quando `carregando` fica true, exibe texto 'Lendo arquivos...'). Se o parse demorar, o leigo pensa que o arquivo nÃ£o foi aceito e tenta de novo.
- **Sugestao:** Ao selecionar o arquivo (onChange), mostrar imediatamente um feedback de 'Arquivo selecionado: nome.xml, processando...' antes de chamar o parse, para que o leigo saiba que o upload foi recebido.

### [pedidos-formularios] [importar/page.tsx + EtapaPreview] BotÃ£o 'Anexar N entregas ao pedido' sem confirmaÃ§Ã£o de dados crÃ­ticos (linha 151-162)
- **Categoria:** guardrail · **Arquivo:** `src/app/(dashboard)/pedidos/importar/_components/EtapaPreview.tsx`
- **Problema:** A aÃ§Ã£o de importaÃ§Ã£o em massa (potencialmente dezenas de entregas) Ã© executada diretamente ao clicar 'Anexar X entregas ao pedido' sem um guard-rail de confirmaÃ§Ã£o. O usuÃ¡rio pode ter selecionado um pedido errado ou ter duplicatas nÃ£o marcadas. O botÃ£o fica com `loading={importando}` e `disabled` â€” o loading estÃ¡ correto. Mas falta uma confirmaÃ§Ã£o antes do insert em massa.
- **Sugestao:** Antes de chamar `onImportar`, exibir um modal de confirmaÃ§Ã£o resumindo: pedido de destino, quantidade de entregas e quaisquer entradas jÃ¡ importadas que serÃ£o puladas.

### [despacho] [Despacho â€” Lista (page.tsx)] FAB 'Despachar N selecionados' â€” sem spinner/loading durante operaÃ§Ã£o
- **Categoria:** loading · **Arquivo:** `src/app/(dashboard)/despacho/page.tsx:216-227`
- **Problema:** O FAB mobile (linhas 216-227) nÃ£o exibe nenhum indicador de carregamento enquanto o despacho estÃ¡ sendo processado. O botÃ£o sÃ³ fica com opacity 0.5 quando modalAberto=true, sem label alternativo nem spinner. O gestor leigo que clica e espera nÃ£o sabe se algo estÃ¡ acontecendo.
- **Sugestao:** Trocar o <button> raw pelo componente Btn com prop loading={saving} ou exibir texto 'Abrindo...' enquanto modalAberto, para herdar spinner e proteÃ§Ã£o contra clique duplo.

### [despacho] [Despacho â€” Lista (page.tsx)] Btn 'Despachar N selecionados' no PageHeader â€” sem guard de duplo clique
- **Categoria:** loading · **Arquivo:** `src/app/(dashboard)/despacho/page.tsx:72-78`
- **Problema:** O Btn de despacho em lote no PageHeader (linhas 72-78) nÃ£o recebe disabled nem loading. Se o modal jÃ¡ estiver aberto ou uma operaÃ§Ã£o em curso, clicar de novo chama abrirModal() uma segunda vez.
- **Sugestao:** Adicionar disabled={saving || modalAberto} ao Btn de despacho do PageHeader.

### [despacho] [Despacho â€” Lista / CardDespachoMobile] BotÃ£o 'Marcar'/'Tirar' variant='ghost' â€” sem affordance visÃ­vel
- **Categoria:** affordance · **Arquivo:** `src/app/(dashboard)/despacho/_components/CardDespachoMobile.tsx:83-88`
- **Problema:** CardDespachoMobile.tsx linhas 83-88: o botÃ£o de seleÃ§Ã£o usa variant='ghost' (fundo transparente, texto cinza), parecendo texto puro no mobile. Um gestor leigo nÃ£o identifica que Ã© clicavel para selecionar o pedido.
- **Sugestao:** Trocar para variant='outline' quando nÃ£o selecionado (borda visÃ­vel) e variant='primary' quando selecionado. Ou usar checkbox com label 'Selecionar'.

### [despacho] [Despacho â€” Lista / CardDespachoMobile] BotÃ£o 'ðŸ“¥' (Importar XML) sem label de texto
- **Categoria:** affordance · **Arquivo:** `src/app/(dashboard)/despacho/_components/CardDespachoMobile.tsx:76-81`
- **Problema:** CardDespachoMobile.tsx linhas 76-81: apenas o emoji 'ðŸ“¥' como conteÃºdo, com title='Importar notas (XML)'. Em mobile, title nÃ£o aparece ao toque. O leigo nÃ£o sabe o que o Ã­cone faz.
- **Sugestao:** Adicionar texto 'Notas' ou 'XML' ao lado do emoji dentro do botÃ£o.

### [despacho] [Despacho â€” Lista / ModalDespacho] ConfirmaÃ§Ã£o de despacho sem resumo do impacto
- **Categoria:** guardrail · **Arquivo:** `src/app/(dashboard)/despacho/_components/ModalDespacho.tsx:163-176`
- **Problema:** ModalDespacho.tsx linhas 163-176: o usuÃ¡rio confirma o despacho sem ver um resumo claro de 'Pedido X serÃ¡ despachado para CaminhÃ£o Y com Motorista Z'. Em despacho em lote, todos os pedidos recebem o mesmo caminhÃ£o sem confirmaÃ§Ã£o explÃ­cita do impacto.
- **Sugestao:** Adicionar antes do botÃ£o confirmar: 'VocÃª estÃ¡ despachando N pedido(s) para [CaminhÃ£o] com [Motorista].' para o gestor confirmar visualmente antes de gravar.

### [despacho] [Despacho â€” Detalhe [id]/page.tsx] Aba 'Mapa' desabilitada â€” razÃ£o nÃ£o alcanÃ§a usuÃ¡rio mobile (title nÃ£o aparece ao toque)
- **Categoria:** affordance · **Arquivo:** `src/app/(dashboard)/despacho/[id]/page.tsx:322-341`
- **Problema:** page.tsx linhas 322-341: a aba Mapa tem disabled e title explicativo, mas em mobile o title nÃ£o aparece ao toque. O botÃ£o fica cinza (opacity 0.45) sem explicaÃ§Ã£o acessÃ­vel sobre por que estÃ¡ bloqueado.
- **Sugestao:** Ao tocar na aba desabilitada no mobile, exibir um toast ou mensagem inline: 'O mapa fica disponÃ­vel quando o motorista montar a rota no celular'.

### [despacho] [Despacho â€” Detalhe / AbaPrincipal] Btn '...' quando salvandoLocal=true â€” nÃ£o usa prop loading do Btn
- **Categoria:** loading · **Arquivo:** `src/app/(dashboard)/despacho/[id]/_components/AbaPrincipal.tsx:156-159`
- **Problema:** AbaPrincipal.tsx linha 156-159: quando salvandoLocal=true, o Btn exibe '...' como texto condicional. NÃ£o usa a prop loading={salvandoLocal} que exibiria o spinner SVG animado e garantiria disabled automÃ¡tico. '...' nÃ£o Ã© intuitivo para o leigo.
- **Sugestao:** Trocar children condicional por: <Btn variant='outline' size='sm' disabled={salvandoLocal || !novoLocal.trim()} loading={salvandoLocal} onClick={...}>+ Adicionar</Btn>

### [despacho] [Despacho â€” Detalhe / AbaPrincipal] Input de local de carregamento sem minHeight de 44px
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/despacho/[id]/_components/AbaPrincipal.tsx:148-155`
- **Problema:** AbaPrincipal.tsx linhas 148-155: o input de local de carregamento tem padding:'6px 10px' e fontSize:'12px'. O CSS global forÃ§a font-size:16px no mobile (mobile.css linha 18), mas sem minHeight definido a altura pode ser inferior aos 44px recomendados pela Apple HIG como alvo mÃ­nimo de toque.
- **Sugestao:** Adicionar minHeight: '44px' ao style do input.

### [despacho] [Despacho â€” Detalhe / FluxoStepper] Labels das etapas com fontSize:'10px' â€” ilegivel no mobile
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/despacho/[id]/_components/FluxoStepper.tsx:57`
- **Problema:** FluxoStepper.tsx linha 57: os labels 'LanÃ§ado', 'Despachado', 'Em rota', 'ConcluÃ­do' usam fontSize:'10px'. No mobile este Ã© o principal indicador de estado do pedido que o gestor leigo precisa ler.
- **Sugestao:** Aumentar fontSize para 11px ou 12px nos labels do stepper.

### [despacho] [Despacho â€” Detalhe [id]/page.tsx] Polling de 10s nas abas Rota/Mapa sem indicador de atualizaÃ§Ã£o ou captura de erro
- **Categoria:** loading · **Arquivo:** `src/app/(dashboard)/despacho/[id]/page.tsx:249-268`
- **Problema:** page.tsx linhas 249-268: o intervalo de 10s atualiza silenciosamente. Se a requisiÃ§Ã£o falhar, nenhum erro Ã© exibido (nÃ£o hÃ¡ try/catch nem setErroGravacao no polling). O gestor veria dados desatualizados sem saber.
- **Sugestao:** Adicionar try/catch no polling e chamar setErroGravacao em caso de falha. Adicionar texto discreto 'Atualizado Ã s HH:MM' na aba para o gestor saber que os dados sÃ£o recentes.

### [entregas] [Listagem de Pedidos (entregas/page.tsx)] MobileList â€” estado vazio quando hÃ¡ busca ativa
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/entregas/page.tsx`
- **Problema:** Quando a busca nÃ£o retorna resultados, o MobileList exibe o emptyMessage padrÃ£o 'Nenhum registro encontrado.' sem indicar ao leigo que o motivo Ã© o filtro/busca ativa. NÃ£o hÃ¡ botÃ£o para limpar a busca. O EmptyState da tabela desktop diferencia os dois casos (sem cadastro vs sem resultado de busca) mas o MobileList nÃ£o tem essa diferenciaÃ§Ã£o.
- **Sugestao:** No MobileList, verificar se hÃ¡ busca/filtro ativo e exibir mensagem diferenciada como 'Nenhum pedido encontrado para esta busca â€” toque aqui para limpar os filtros' com aÃ§Ã£o de reset.

### [entregas] [Listagem de Pedidos (entregas/page.tsx)] Grid de KPIs â€” m-kpi-grid com 4 cards fixos
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/entregas/page.tsx`
- **Problema:** O grid de KPIs usa gridTemplateColumns: 'repeat(4, 1fr)' inline mas a classe m-kpi-grid colapsa para 2Ã—2 no mobile via CSS. O quarto card 'Receita Pendente / Receita Paga (PerÃ­odo)' pode exibir valores como 'R$ 12.345,67' em fonte 16px dentro de um card que mede metade de ~390px (~195px de largura). Valores acima de R$ 9.999,99 podem ficar cortados ou transbordar sem truncate.
- **Sugestao:** Usar fontSize menor (12â€“13px) para o valor monetÃ¡rio nos KpiCards quando o texto for longo, ou truncar com overflow:hidden + textOverflow:ellipsis no KpiCard.

### [entregas] [Detalhe do Pedido (entregas/[id]/page.tsx)] Tabela de Entregas â€” sem variante mobile
- **Categoria:** tabela · **Arquivo:** `src/app/(dashboard)/entregas/[id]/page.tsx`
- **Problema:** A seÃ§Ã£o 'Entregas do Pedido' (linhas 219-244) usa apenas um DataTable sem classe m-hide e sem contraparte mobile. Em 390px a tabela com 4 colunas (Origem, Destino, Carga, Status) sofrerÃ¡ scroll horizontal mas nenhum estilo garante isso (o overflowX:auto estÃ¡ no div pai, linha 220, mas a tabela em si nÃ£o tem min-width definido). Campos de Origem e Destino com endereÃ§os longos vÃ£o empurrar as colunas. O status do pedido aparece como valor bruto ('em_andamento') sem usar o mapa STATUS_LABEL.
- **Sugestao:** Adicionar m-hide na DataTable de entregas e criar um bloco m-show-block com cards (mesma abordagem da tabela de abastecimentos jÃ¡ implementada abaixo). TambÃ©m aplicar STATUS_LABEL[e.status] no <Td> de status.

### [entregas] [Detalhe do Pedido (entregas/[id]/page.tsx)] Status das entregas â€” valor bruto do banco exibido
- **Categoria:** outro · **Arquivo:** `src/app/(dashboard)/entregas/[id]/page.tsx`
- **Problema:** Na linha 239, o status da entrega Ã© exibido diretamente como e.status (podendo mostrar 'em_andamento', 'concluida', etc.) sem passar pelo mapa STATUS_LABEL. O leigo verÃ¡ texto tÃ©cnico com underscores.
- **Sugestao:** Substituir {e.status} por {STATUS_LABEL[e.status] ?? e.status} (ou criar um mapa local) e envolver em um Badge para consistÃªncia visual.

### [entregas] [Detalhe do Pedido (entregas/[id]/page.tsx)] BotÃµes 'Voltar' e 'Imprimir' â€” ocultos no mobile sem alternativa
- **Categoria:** navegacao · **Arquivo:** `src/app/(dashboard)/entregas/[id]/page.tsx`
- **Problema:** Os botÃµes 'â† Voltar' e 'ðŸ–¨ï¸ Imprimir' tÃªm className='m-hide' (linhas 155-156), ficando invisÃ­veis no mobile. O botÃ£o 'Voltar' some completamente: o leigo sÃ³ pode voltar via gesto do sistema operacional ou via BottomNav. NÃ£o hÃ¡ botÃ£o de voltar visÃ­vel na tela de detalhe no mobile.
- **Sugestao:** Manter o botÃ£o Voltar visÃ­vel no mobile (remover m-hide ou criar um botÃ£o menor dentro do header apenas no mobile). O Imprimir pode continuar oculto.

### [entregas] [Detalhe do Pedido (entregas/[id]/page.tsx)] Abastecimentos do veÃ­culo â€” nÃ£o filtrados pelo perÃ­odo do pedido
- **Categoria:** integridade · **Arquivo:** `src/app/(dashboard)/entregas/[id]/page.tsx`
- **Problema:** A seÃ§Ã£o de abastecimentos (linha 247) exibe os Ãºltimos 50 abastecimentos do veÃ­culo sem filtragem por pedido ou data, e hÃ¡ uma nota 'nÃ£o filtrados por pedido' (linha 249). O leigo verÃ¡ abastecimentos de outros pedidos misturados, sem entender que nÃ£o sÃ£o do pedido atual. Isso pode causar confusÃ£o sobre custo e responsabilidade.
- **Sugestao:** Filtrar abastecimentos pelo intervalo de datas do pedido (data_inicio_real/data_fim_real ou data_inicio_prevista/data_fim_prevista) ou exibir uma mensagem de aviso mais proeminente no card mobile sobre o contexto ampliado.

### [entregas] [Editar Pedido (entregas/[id]/editar/page.tsx)] ValidaÃ§Ã£o de km_final vs km_inicial â€” sem feedback em tempo real
- **Categoria:** entrada-dado · **Arquivo:** `src/app/(dashboard)/entregas/[id]/editar/page.tsx`
- **Problema:** A validaÃ§Ã£o km_final < km_inicial sÃ³ ocorre no submit (linha 130-133). No formulÃ¡rio de ediÃ§Ã£o nÃ£o hÃ¡ indicador visual em tempo real como existe no formulÃ¡rio de criaÃ§Ã£o (linha 242-245 do novo/page.tsx que mostra 'X km rodados'). O leigo pode preencher km_final errado e sÃ³ descobrir o erro ao clicar em Salvar, que redireciona para a aba 'cronograma' â€” mas sem rolagem automÃ¡tica ao campo invÃ¡lido.
- **Sugestao:** Adicionar validaÃ§Ã£o inline no campo km_final do editar (idÃªntica Ã  que existe no novo/page.tsx linha 242) mostrando km rodados quando vÃ¡lido e aviso quando km_final < km_inicial.

### [entregas] [Editar Pedido (entregas/[id]/editar/page.tsx)] BotÃ£o 'Cancelar' no PageHeader â€” leva de volta sem confirmar perda de dados
- **Categoria:** guardrail · **Arquivo:** `src/app/(dashboard)/entregas/[id]/editar/page.tsx`
- **Problema:** O botÃ£o 'Cancelar' no PageHeader (linha 161) chama setConfirmCancelar(true), correto. PorÃ©m o botÃ£o 'Voltar' (linha 160, m-hide) tambÃ©m chama setConfirmCancelar(true). No mobile o botÃ£o Voltar Ã© ocultado mas nÃ£o hÃ¡ nenhum botÃ£o Voltar mobile explÃ­cito â€” o Cancelar do rodapÃ© (linha 321) chama setConfirmCancelar(true) corretamente. Fluxo mobile: o leigo usa o Cancelar do rodapÃ© para sair. Isso estÃ¡ ok, mas como nÃ£o hÃ¡ botÃ£o Voltar visible no mobile, o leigo pode usar o gesto de swipe-back do iOS navegando direto sem ver o modal de confirmaÃ§Ã£o.
- **Sugestao:** Adicionar um interceptor de navegaÃ§Ã£o (useBeforeUnload ou bloqueio de router) para alertar sobre dados nÃ£o salvos quando o leigo usa gestos nativos de voltar.

### [entregas] [Novo Pedido (entregas/novo/page.tsx)] BotÃ£o 'Cancelar' do PageHeader â€” navega sem confirmar perda de dados
- **Categoria:** guardrail · **Arquivo:** `src/app/(dashboard)/entregas/novo/page.tsx`
- **Problema:** Os botÃµes 'Voltar' (linha 128) e 'Cancelar' (linha 129) no PageHeader sÃ£o Btn com href='/entregas', navegando diretamente para a lista sem confirmar se o usuÃ¡rio quer descartar o formulÃ¡rio parcialmente preenchido. O formulÃ¡rio de ediÃ§Ã£o tem um modal de confirmaÃ§Ã£o (confirmCancelar), mas o de criaÃ§Ã£o nÃ£o tem.
- **Sugestao:** Adicionar estado confirmCancelar e modal de confirmaÃ§Ã£o 'Descartar novo pedido?' quando houver campos preenchidos (veiculo_id, motorista_id ou km_inicial nÃ£o vazios), assim como o editar/page.tsx jÃ¡ faz.

### [entregas] [Novo Pedido (entregas/novo/page.tsx)] Campo KM Inicial â€” inputMode ausente no editar/page.tsx
- **Categoria:** entrada-dado · **Arquivo:** `src/app/(dashboard)/entregas/[id]/editar/page.tsx`
- **Problema:** No novo/page.tsx, o campo KM Inicial tem inputMode='decimal' (linha 210) exibindo teclado numÃ©rico no mobile. JÃ¡ no editar/page.tsx (linha 238), o mesmo campo usa type='number' sem inputMode='decimal'. No iOS Safari, type='number' sem inputMode pode mostrar teclado diferente (sem vÃ­rgula, sem ponto dependendo do locale). A inconsistÃªncia significa que a experiÃªncia de entrada de KM no mobile varia entre criar e editar.
- **Sugestao:** Adicionar inputMode='decimal' no campo KM Inicial e KM Final do editar/page.tsx (linhas 238 e 241) para consistÃªncia com o formulÃ¡rio de criaÃ§Ã£o.

### [entregas] [Novo Pedido (entregas/novo/page.tsx)] IMaskInput valor_pedido â€” onAccept salva string vazia como '0'
- **Categoria:** entrada-dado · **Arquivo:** `src/app/(dashboard)/entregas/novo/page.tsx`
- **Problema:** No IMaskInput (linha 236-238), quando o usuÃ¡rio apaga o valor ou nÃ£o digita nada, m.unmaskedValue Ã© '0' (comportamento padrÃ£o do IMask com normalizeZeros). O setF salva '0' em valor_pedido. Na gravaÃ§Ã£o (linha 99), parseFloat('0') resulta em 0.0 no banco â€” nÃ£o nulo. Um pedido sem valor definido vai aparecer com R$ 0,00 em vez de 'â€”' nas listagens.
- **Sugestao:** No onAccept, verificar se m.unmaskedValue === '0' ou '' e salvar string vazia: `setF(p => ({ ...p, valor_pedido: m.unmaskedValue === '0' ? '' : String(m.unmaskedValue) }))`. Na gravaÃ§Ã£o, o `f.valor_pedido ? parseFloat(f.valor_pedido) : null` jÃ¡ trata string vazia como null.

### [financeiro] [Financeiro por Cliente (/faturamento) â€” baixa rÃ¡pida de pagamento Ãºnico] alert() de erro em confirmarBaixaRapida
- **Categoria:** guardrail · **Arquivo:** `src/app/(dashboard)/faturamento/page.tsx:210`
- **Problema:** Quando a gravaÃ§Ã£o do pagamento falha, o erro Ã© mostrado via alert() nativo do browser (linha 210), fora do padrÃ£o visual do app. Pior: o modal de confirmaÃ§Ã£o jÃ¡ foi fechado (setConfirmBaixa(null), linha 206) ANTES de saber se deu erro â€” apÃ³s o alert o pedido continua aparecendo como nÃ£o pago sem nenhum estado de erro persistente na linha. Para dinheiro Ã© melhor feedback inline e nÃ£o destruir o contexto antes de confirmar sucesso.
- **Sugestao:** Trocar o alert() por um <Alert variant="error"> visÃ­vel na tela e sÃ³ fechar o modal de confirmaÃ§Ã£o apÃ³s sucesso (mover setConfirmBaixa(null) para depois do if (!error)).

### [financeiro] [A Pagar (/financeiro aba A Pagar) â€” confirmaÃ§Ã£o de pagamento] Btn 'Pagar' na tabela/cards (modalBaixa)
- **Categoria:** guardrail · **Arquivo:** `src/app/(dashboard)/financeiro/_components/APagarTab.tsx:106`
- **Problema:** O botÃ£o 'Pagar' abre modal de confirmaÃ§Ã£o, mas o erro de gravaÃ§Ã£o (setErro) sÃ³ aparece no <Alert> do topo da pÃ¡gina (linha 119), enquanto o modal continua aberto sem mostrar o erro. No mobile o Alert fica acima da dobra do modal fullscreen â€” o usuÃ¡rio clica 'Confirmar', nada aparece dentro do modal, e ele acha que nÃ£o funcionou e clica de novo. Falta feedback de erro DENTRO do modal.
- **Sugestao:** Exibir o erro tambÃ©m dentro do modal de confirmaÃ§Ã£o (ex.: <Alert> logo abaixo do tÃ­tulo quando houver erro).

### [financeiro] [Fluxo DiÃ¡rio (/financeiro aba Fluxo) â€” Saldo Banco editÃ¡vel] Card 'Saldo Banco (hoje)' com input e botÃ£o OK, persistido em localStorage
- **Categoria:** integridade · **Arquivo:** `src/app/(dashboard)/financeiro/_components/FluxoTab.tsx:80`
- **Problema:** O saldo do banco â€” base de TODO o saldo acumulado/previsto exibido â€” Ã© salvo sÃ³ em localStorage do dispositivo (linha 80), nÃ£o no banco. O gestor que edita no celular vÃª um saldo final diferente do que vÃª no PC; ao limpar dados/trocar de aparelho o saldo some silenciosamente voltando a 0, distorcendo o 'Saldo Final Previsto' sem o usuÃ¡rio perceber. Para um leigo Ã© um nÃºmero de dinheiro inconsistente entre telas.
- **Sugestao:** Persistir o saldo no banco (por empresa) ou, no mÃ­nimo, deixar explÃ­cito na UI que o saldo Ã© local deste aparelho e nÃ£o sincroniza.

### [financeiro] [Fluxo DiÃ¡rio (/financeiro aba Fluxo) â€” input de Saldo Banco] <input type=number> de ediÃ§Ã£o do saldo + botÃ£o OK
- **Categoria:** entrada-dado · **Arquivo:** `src/app/(dashboard)/financeiro/_components/FluxoTab.tsx:77`
- **Problema:** O input Ã© type=number (ponto, nÃ£o vÃ­rgula) e salvarSaldo faz parseFloat direto sem normalizar vÃ­rgula. No teclado numÃ©rico BR o usuÃ¡rio digita '1500,50'; parseFloat('1500,50') = 1500 (corta os centavos) silenciosamente. AlÃ©m disso, se der NaN o salvarSaldo faz return silencioso â€” o clique no OK 'nÃ£o faz nada' sem avisar. Dado financeiro entra errado sem aviso.
- **Sugestao:** Usar inputMode=decimal e normalizar vÃ­rgulaâ†’ponto antes do parseFloat, e avisar quando o resultado for NaN em vez do return silencioso.

### [abastecimentos-adiantamentos] [Abastecimentos â€” Novo / Editar] Campo 'Valor Total' recalculado silenciosamente ao editar litros ou valor/litro
- **Categoria:** guardrail · **Arquivo:** `src/app/(dashboard)/abastecimentos/novo/page.tsx`
- **Problema:** Ao digitar litros ou valor_litro, o campo valor_total e sobrescrito automaticamente (novo/page.tsx linhas 33-40) sem nenhum aviso. Se o usuario ja tinha informado um total manualmente, esse valor e perdido em silencio. No mobile os campos ficam empilhados e o usuario pode nao perceber a sobrescrita.
- **Sugestao:** Adicionar hint visual ao campo Valor Total quando calculado automaticamente (ex: texto cinza 'Calculado: litros x valor/litro'). Ou parar de sobrescrever se o usuario editou o campo manualmente (flag `totalEditadoManualmente`).

### [abastecimentos-adiantamentos] [Abastecimentos â€” Listagem (mobile)] Estado vazio no MobileList sem botao de acao
- **Categoria:** outro · **Arquivo:** `src/app/(dashboard)/abastecimentos/page.tsx`
- **Problema:** Quando a lista retorna zero resultados no mobile sem busca ativa, o MobileList exibe apenas 'Nenhum registro encontrado.' sem nenhum botao de acao. No desktop existe EmptyState com '+ Registrar primeiro abastecimento' (page.tsx linha 274). O leigo no mobile nao sabe como criar.
- **Sugestao:** Quando linhas.length === 0 e nao ha busca ativa, renderizar dentro do MobileList um filho com mensagem contextual e botao de acao (link para /abastecimentos/novo), espelhando o comportamento do desktop.

### [abastecimentos-adiantamentos] [Adiantamentos â€” Listagem (mobile)] Estado vazio no MobileList sem botao de acao
- **Categoria:** outro · **Arquivo:** `src/app/(dashboard)/adiantamentos/page.tsx`
- **Problema:** Mesmo problema: quando loading=false e linhas esta vazio sem busca, o MobileList cai no estado vazio padrao ('Nenhum registro encontrado.') sem o botao '+ Novo Adiantamento' que existe no desktop (adiantamentos/page.tsx linha 367). O MobileFAB existe mas pode nao ser obvio para usuario leigo.
- **Sugestao:** Renderizar explicitamente um filho no MobileList com mensagem e botao de acao quando a lista esta vazia e sem filtro ativo.

### [abastecimentos-adiantamentos] [Abastecimentos â€” Listagem (desktop, tabela)] Coluna 'Veiculo' na tabela desktop
- **Categoria:** tabela · **Arquivo:** `src/app/(dashboard)/abastecimentos/page.tsx`
- **Problema:** A celula exibe `${a.veiculos.placa} â€” ${a.veiculos.modelo}` (page.tsx linha 287) sem maxWidth, whiteSpace: nowrap ou textOverflow: ellipsis. Modelos com nome longo (ex: VOLKSWAGEN CONSTELLATION 24.280) forcam a celula a quebrar em multiplas linhas, desalinhando as demais colunas da tabela.
- **Sugestao:** Aplicar `style={{ maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}` no Td do veiculo e adicionar `title={...}` para exibir o texto completo no hover.

### [veiculos-motoristas] [Editar VeÃ­culo â€” aba Dados (todas as sub-abas)] BotÃ£o 'Atualizar' no PageHeader (type=button) + botÃ£o 'Atualizar VeÃ­culo' no rodapÃ© do formulÃ¡rio (type=submit) â€” ambos existem ao mesmo tempo na aba 'dados'
- **Categoria:** affordance · **Arquivo:** `src/app/(dashboard)/veiculos/[id]/editar/page.tsx`
- **Problema:** HÃ¡ dois caminhos de submissÃ£o independentes na mesma aba: o botÃ£o do PageHeader chama handleSubmit via onClick (type=button), enquanto o rodapÃ© do formulÃ¡rio tem um <Btn type='submit'>. Qualquer submit do formulÃ¡rio (ex.: pressionar Enter num input) tambÃ©m dispara handleSubmit. O usuÃ¡rio nÃ£o percebe que hÃ¡ dois botÃµes fazendo a mesma coisa, e se clicar no do header enquanto o do rodapÃ© jÃ¡ estÃ¡ salvando â€” ou vice-versa â€” a guarda `if (saving) return` no topo de handleSubmit impede clique duplo, mas a duplicaÃ§Ã£o confunde e pode ser acionada duas vezes em sequÃªncia antes que `saving` seja marcado.
- **Sugestao:** Manter apenas um ponto de submissÃ£o. No PageHeader usar <Btn type='submit' form='form-veiculo'> apontando para o id do formulÃ¡rio, e remover o onClick=handleSubmit. Ou inverter: manter sÃ³ o rodapÃ© e esconder o botÃ£o do header no mobile, que jÃ¡ acontece para 'Cancelar' mas nÃ£o para 'Atualizar'.

### [veiculos-motoristas] [Editar VeÃ­culo â€” aba ResponsÃ¡vel / VÃ­nculo (VinculoResponsavel)] BotÃ£o 'Confirmar' no popup de troca de vÃ­nculo
- **Categoria:** affordance · **Arquivo:** `src/app/(dashboard)/veiculos/[id]/editar/_components/VinculoResponsavel.tsx`
- **Problema:** O botÃ£o 'Confirmar' usa um <button> com estilo inline (btnPri) â€” nÃ£o Ã© um Btn do design system, portanto nÃ£o tem a classe m-touch. O estilo define padding '8px 14px' sem minHeight, entÃ£o no mobile tem apenas ~35px de altura, abaixo dos 44px exigidos pelo Apple HIG. AlÃ©m disso, o estado de carregamento mostra 'Salvando...' mas o botÃ£o nÃ£o usa disabled=true de forma visual diferenciada â€” sÃ³ o texto muda.
- **Sugestao:** Substituir os botÃµes inline (btnPri, btnGhost) por <Btn> do design system que jÃ¡ tem m-touch e loading prop. Isso resolve alvo de toque e spinner automÃ¡tico.

### [veiculos-motoristas] [Editar VeÃ­culo â€” aba ResponsÃ¡vel / VÃ­nculo (VinculoResponsavel)] Lista de motoristas no popup (botÃµes da lista)
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/veiculos/[id]/editar/_components/VinculoResponsavel.tsx`
- **Problema:** Cada motorista na lista Ã© um <button> com padding '11px 10px' e minHeight: '44px' â€” isso estÃ¡ correto. PorÃ©m a lista tem maxHeight:200px com overflow:auto. Em mobile, o container do modal tem maxHeight:'80vh' e overflow:auto, mas a lista interna tambÃ©m tem scroll. Num iPhone com teclado aberto, os dois nÃ­veis de scroll podem conflitar (scroll-dentro-de-scroll em iOS), fazendo o usuÃ¡rio rolar a pÃ¡gina inteira em vez da lista de motoristas.
- **Sugestao:** Usar -webkit-overflow-scrolling: touch na lista interna e adicionar overscroll-behavior: contain para isolar o scroll da lista do scroll do modal pai.

### [veiculos-motoristas] [Editar VeÃ­culo â€” aba Plano de ManutenÃ§Ã£o (PlanoTab)] AtivaÃ§Ã£o/desativaÃ§Ã£o de tipo via checkbox
- **Categoria:** guardrail · **Arquivo:** `src/app/(dashboard)/veiculos/[id]/editar/_components/PlanoTab.tsx`
- **Problema:** A funÃ§Ã£o toggleAtivo usa window.alert() nativo (linha 103) para avisar que o tipo nÃ£o pode ser desativado porque tem manutenÃ§Ãµes. No mobile, alert() nativo interrompe completamente a UI com diÃ¡logo do sistema, sem estilos, sem contexto visual da tela. O usuÃ¡rio leigo vÃª uma caixa genÃ©rica do browser sem identidade do sistema.
- **Sugestao:** Substituir window.alert() por setErro() que jÃ¡ existe no componente e exibe o <Alert> estilizado no topo da tela.

### [veiculos-motoristas] [Editar VeÃ­culo â€” aba Plano de ManutenÃ§Ã£o (PlanoTab)] Inputs de intervalo KM/Meses nos cards mobile
- **Categoria:** entrada-dado · **Arquivo:** `src/app/(dashboard)/veiculos/[id]/editar/_components/PlanoTab.tsx`
- **Problema:** Os campos de intervalo nos cards mobile (linhas 263 e 273) tÃªm width:'90px' e '70px' fixos com fontSize:'12px'. Como estÃ£o dentro de um MobileCard (14px padding de cada lado), num iPhone 390px esses inputs ficam muito estreitos para digitar nÃºmeros sem zoom. AlÃ©m disso, o feedback de save usa apenas um caractere 'â€¦' (10px, cor #94a3b8) e 'âœ“' (10px, cor #16a34a) â€” invisÃ­vel para leigo.
- **Sugestao:** Aumentar os inputs para minWidth:'100%' dentro do contexto do card, ou usar inputMode='numeric' com width relativo. Substituir 'â€¦' e 'âœ“' por texto legÃ­vel ('Salvando' / 'Salvo').

### [veiculos-motoristas] [Editar VeÃ­culo â€” aba Logs de KM (LogsTab)] BotÃ£o 'Confirmar reatribuiÃ§Ã£o' no modal
- **Categoria:** loading · **Arquivo:** `src/app/(dashboard)/veiculos/[id]/editar/_components/LogsTab.tsx`
- **Problema:** O botÃ£o usa <Btn> com disabled={salvandoReatr} mas sem prop loading (linha 314). Quando salvandoReatr=true, o botÃ£o fica desabilitado mas o texto continua 'Confirmar reatribuiÃ§Ã£o' sem spinner. A operaÃ§Ã£o envolve mÃºltiplas escritas no banco (km_logs + 2 audit_logs) e pode demorar â€” sem feedback visual o usuÃ¡rio leigo pode tentar clicar de novo.
- **Sugestao:** Adicionar loading={salvandoReatr} no <Btn> linha 314. O spinner do design system cuidarÃ¡ do feedback.

### [veiculos-motoristas] [Editar Motorista â€” aba Acerto Mensal (AcertoMensalTab)] Layout do resumo: coluna direita (position:sticky) sobre coluna esquerda
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/motoristas/[id]/editar/_components/AcertoMensalTab.tsx`
- **Problema:** O grid usa gridTemplateColumns:'2fr 1fr' com a coluna direita (Resumo do MÃªs) tendo order:1 e a esquerda order:2. A classe m-stack colapsa para 1 coluna no mobile. Como a coluna direita tem order:1, no mobile ela aparece ACIMA dos pedidos/ajustes â€” isso Ã© correto. Mas o card direito tem position:'sticky', top:'24px', que no mobile dentro de um scroll container (overflow:auto no parent) nÃ£o funciona como esperado â€” sticky exige que o ancestral nÃ£o tenha overflow definido. O card de Resumo pode sumir ou ficar estÃ¡tico no topo sem seguir o scroll.
- **Sugestao:** No mobile, o sticky nÃ£o Ã© necessÃ¡rio pois a coluna jÃ¡ estÃ¡ no topo. Adicionar media query ou classe condicional para desativar position:sticky em viewports < 768px.

### [veiculos-motoristas] [Editar Motorista â€” aba Acerto Mensal (AcertoMensalTab)] Modal de fechamento Step 2 â€” botÃµes 'Confirmar que jÃ¡ paguei' e 'Apenas Agendar'
- **Categoria:** affordance · **Arquivo:** `src/app/(dashboard)/motoristas/[id]/editar/_components/AcertoMensalTab.tsx`
- **Problema:** Ambos os botÃµes usam <button> com estilo inline sem a classe m-touch. O botÃ£o verde tem padding:'16px 24px' â€” altura ~50px, OK. O botÃ£o amarelo tem padding:'14px 24px' â€” altura ~46px, OK na maioria. O botÃ£o 'â† Voltar Ã  revisÃ£o' tem padding:'10px' â€” altura estimada ~37px, abaixo dos 44px mÃ­nimos. Todos sÃ£o botÃµes de aÃ§Ã£o crÃ­tica (fechamento financeiro) sem spinner quando saving=true exceto pelo text condicional.
- **Sugestao:** Corrigir o botÃ£o 'â† Voltar Ã  revisÃ£o' para minHeight:44px. Adicionar opacity ou cursor visual diferente durante saving=true em todos os trÃªs botÃµes.

### [veiculos-motoristas] [Novo VeÃ­culo / Editar VeÃ­culo â€” aba Dados] Campos numÃ©ricos: Eixos, KM Atual, Cap. Carga, PBT, Tanque
- **Categoria:** entrada-dado · **Arquivo:** `src/app/(dashboard)/veiculos/novo/page.tsx`
- **Problema:** Os campos type='number' nas sub-abas Dados TÃ©cnicos e EspecificaÃ§Ãµes usam onChange direto no estado como string, sem normalizaÃ§Ã£o de vÃ­rgula. No mobile, o teclado numÃ©rico do iOS pode inserir vÃ­rgula como separador decimal (dependendo do locale), gerando NaN no parseFloat/parseInt ao salvar. O campo KM Atual em novo veÃ­culo (linha 166) usa type='number' inputMode='numeric' mas sem mÃ¡scara IMask â€” no Android o input aceita letras em alguns casos.
- **Sugestao:** Aplicar .replace(',', '.') antes do parseFloat nos campos de custo/km ao salvar, ou usar IMaskInput com mask Number nesses campos, igual ao campo 'Valor AquisiÃ§Ã£o' que jÃ¡ usa IMask corretamente.

### [veiculos-motoristas] [Listagem de VeÃ­culos e Motoristas (page.tsx de ambos)] loadAll() nas telas de listagem
- **Categoria:** outro · **Arquivo:** `src/app/(dashboard)/veiculos/page.tsx`
- **Problema:** Ambas as telas de listagem (veÃ­culos e motoristas) usam loadAll() â€” que, conforme documentado no CLAUDE.md (Regra do Dono), varre o banco inteiro e nÃ£o deve ser usado em telas que crescem com a operaÃ§Ã£o. Mesmo que veÃ­culos/motoristas sejam cadastros menores que pedidos, a regra explÃ­cita Ã© aplicar paginaÃ§Ã£o incremental com infinite scroll nessas telas, e loadAll viola isso.
- **Sugestao:** Substituir loadAll() por paginaÃ§Ã£o incremental de 100 em 100 via .range() com scroll infinito ou botÃ£o 'Carregar mais', conforme a Regra do Dono no CLAUDE.md.

### [veiculos-motoristas] [Editar Motorista â€” aba Acerto Mensal (AcertoMensalTab)] Tabelas de adiantamentos e ajustes (HTML table nativo sem overflowX no pai)
- **Categoria:** tabela · **Arquivo:** `src/app/(dashboard)/motoristas/[id]/editar/_components/AcertoMensalTab.tsx`
- **Problema:** As tabelas de adiantamentos (linha 403) e ajustes (linha 428) usam <table> nativo com minWidth:'320px' dentro de um div com overflowX:'auto'. No mobile 390px isso funciona para as tabelas, mas a tabela de ajustes tem uma coluna 'AÃ§Ã£o' com botÃ£o 'Excluir' que no scroll horizontal fica fora da Ã¡rea visÃ­vel â€” o usuÃ¡rio nÃ£o percebe que existe um botÃ£o de exclusÃ£o sem rolar horizontalmente, e mesmo assim o alvo do botÃ£o Ã© apenas padding:'0 8px' com minHeight:'44px' fixado apenas no minHeight. A coluna DescriÃ§Ã£o tem maxWidth:'160px' com truncate mas sem title visÃ­vel no mobile (sÃ³ via hover no desktop).
- **Sugestao:** Converter essas duas tabelas para o padrÃ£o MobileList/MobileCard no mobile (igual ao padrÃ£o jÃ¡ adotado no resto do sistema), mostrando cada ajuste como um card com aÃ§Ã£o de excluir visÃ­vel.

### [cadastros] [Clientes â€” Novo e Editar] Grade de formulÃ¡rio (m-grid repeat(4,1fr) com gridColumn span)
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/clientes/novo/page.tsx`
- **Problema:** Os campos usam className='m-grid' que colapsa para 1 coluna no mobile â€” mas os filhos com gridColumn span (ex: 'span 3', 'span 2') sÃ£o resetados para 'span 1' pelo CSS. PorÃ©m, os prÃ³prios divs wrapper com gridColumn inline style ficam na coluna 1 corretamente. O problema real Ã© o grid de endereÃ§o: 'Logradouro' tem gridColumn 'span 3' e 'Cidade' tem 'span 3' â€” em desktop ficam ao lado do CEP/UF, mas no mobile o CSS reseta para span 1 e a ordem visual muda (CEP aparece antes, depois Logradouro sozinho, depois NÃºmero, Complemento, depois Bairro, depois Cidade e UF). O campo UF (2 letras) recebe largura 100% no mobile (1fr inteiro), ficando largo demais para o conteÃºdo esperado.
- **Sugestao:** Criar um wrapper separado para UF+Cidade usando m-grid-2 para manter 2 colunas no mobile, em vez de uma coluna Ãºnica. Alternativamente, agrupar os campos de endereÃ§o em sub-grids de 2 colunas compatÃ­veis com mobile.

### [cadastros] [Clientes â€” Novo] IMaskInput de Telefone dos contatos
- **Categoria:** entrada-dado · **Arquivo:** `src/app/(dashboard)/clientes/novo/page.tsx`
- **Problema:** Mesmo problema: IMaskInput do telefone e WhatsApp dos contatos (linhas 321 e 324) nÃ£o recebe value. Em novo cadastro Ã© menos grave (comeÃ§a vazio), mas apÃ³s adicionar e tentar editar dentro da mesma sessÃ£o, o valor digitado pode nÃ£o ser reexibido.
- **Sugestao:** Passar value em todos os IMaskInput ligados a campos de contatos dinÃ¢micos.

### [cadastros] [Clientes â€” Listagem] MobileList â€” estado de loading sem indicador
- **Categoria:** loading · **Arquivo:** `src/app/(dashboard)/clientes/page.tsx`
- **Problema:** No mobile, durante o carregamento dos dados, o MobileList renderiza {loading ? null : ...} (linha 164), mostrando lista vazia sem nenhuma mensagem de 'Carregando...' para o usuÃ¡rio. O desktop mostra 'Carregando...' na tabela (linha 130), mas o mobile fica com tela em branco.
- **Sugestao:** Substituir o ternÃ¡rio na linha 164 por um indicador de loading no mobile, ex: {loading ? <div style={{textAlign:'center',padding:'32px',color:'#94a3b8'}}>Carregando...</div> : ordenados.map(...)}.

### [cadastros] [Usuarios â€” Listagem] MobileList â€” estado de loading sem indicador
- **Categoria:** loading · **Arquivo:** `src/app/(dashboard)/usuarios/page.tsx`
- **Problema:** Mesmo problema: {loading ? null : ...} na linha 202 faz a lista mobile ficar em branco durante o carregamento.
- **Sugestao:** Mostrar texto 'Carregando...' no mobile durante o loading, igual ao desktop.

### [cadastros] [Empresas â€” Listagem] MobileList â€” estado de loading sem indicador
- **Categoria:** loading · **Arquivo:** `src/app/(dashboard)/empresas/page.tsx`
- **Problema:** Mesmo problema: {loading ? null : ...} na linha 153 faz a lista mobile ficar em branco durante o carregamento.
- **Sugestao:** Mostrar texto 'Carregando...' no mobile durante o loading.

### [cadastros] [Usuarios â€” Novo] ValidaÃ§Ã£o de login duplicado â€” apenas client-side com aviso nÃ£o-bloqueante
- **Categoria:** guardrail · **Arquivo:** `src/app/(dashboard)/usuarios/novo/page.tsx`
- **Problema:** A verificaÃ§Ã£o de login duplicado (funÃ§Ã£o checarLogin, linha 16-22) roda no blur do campo, exibe um aviso em texto laranja (linha 81), mas NÃƒO impede o submit. O usuÃ¡rio pode ignorar o aviso e clicar em 'Salvar UsuÃ¡rio'. O servidor retorna o erro correto (linha 100-101 de actions.ts), mas o Alert de erro sÃ³ aparece no topo da pÃ¡gina, e o botÃ£o continua clicÃ¡vel â€” risco de confusÃ£o para usuÃ¡rio leigo.
- **Sugestao:** AlÃ©m do aviso existente, desabilitar o botÃ£o de submit enquanto loginAviso !== null, ou exibir o aviso como um Alert component mais visÃ­vel ao invÃ©s de um simples parÃ¡grafo.

### [cadastros] [Empresas â€” Editar (seÃ§Ã£o WhatsApp)] BotÃ£o 'Reconectar WhatsApp' â€” loading correto, mas QR expirado nÃ£o reinicia countdown
- **Categoria:** loading · **Arquivo:** `src/app/(dashboard)/empresas/[id]/editar/page.tsx`
- **Problema:** Quando o QR expira (countdown chega a 0), a mensagem 'QR expirou. Clique em Reconectar...' aparece e o botÃ£o volta ao estado normal. PorÃ©m o setQr(null) e setMsg (linha 58) apenas limpam o estado local, mas se o usuÃ¡rio tentar re-clique imediato antes do loading=true aparecer, pode resultar em duplo clique. A proteÃ§Ã£o Ã©: disabled={loading || (!!qr && countdown > 0)}, mas quando qr=null e loading=false hÃ¡ uma janela em que mÃºltiplos cliques disparam mÃºltiplos fetch. Loading Ã© setado async dentro do try (linha 66) entÃ£o hÃ¡ race condition de milissegundos.
- **Sugestao:** Mover setSaving(true) para antes do try block para fechar a janela de race condition, ou usar useRef para um flag sÃ­ncrono de 'em andamento'.

### [cadastros] [Uso de APIs â€” CadastroApiEditor] BotÃ£o 'Salvar' no formulÃ¡rio inline â€” sem minHeight 44px no mobile
- **Categoria:** affordance · **Arquivo:** `src/app/(dashboard)/uso-apis/CadastroApiEditor.tsx`
- **Problema:** O botÃ£o de submit do formulÃ¡rio inline (linha 124, CadastroApiEditor.tsx) usa estilos inline sem minHeight. A funÃ§Ã£o btnSalvar() (linha 154-166) define padding:'8px 14px' e fontSize:13, mas sem minHeight:44px. No mobile, o alvo de toque fica abaixo dos 44px recomendados.
- **Sugestao:** Adicionar minHeight: 44 Ã  funÃ§Ã£o btnSalvar (linha 154) e tambÃ©m ao btnCancelar (linha 168).

### [cadastros] [Uso de APIs â€” CadastroApiEditor] BotÃ£o 'Cancelar' no formulÃ¡rio inline â€” sem minHeight 44px no mobile
- **Categoria:** affordance · **Arquivo:** `src/app/(dashboard)/uso-apis/CadastroApiEditor.tsx`
- **Problema:** O btnCancelar (linha 168-176) define padding:'8px 14px' sem minHeight:44px. Alvo de toque insuficiente no mobile.
- **Sugestao:** Adicionar minHeight: 44 ao objeto btnCancelar na linha 168.

### [regras-autorizacoes-relatorios] [Regras â€” /regras/novo e /regras/[id]/editar] Checkboxes de 'Ativa', 'Exige confirmaÃ§Ã£o', 'Quem pode usar' e 'Exigir gatilho como PRIMEIRA palavra'
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/regras/[id]/editar/page.tsx`
- **Problema:** Na pÃ¡gina /regras/[id]/editar (linha 109) a funÃ§Ã£o `checkbox` nÃ£o define `minHeight: 44` no `<label>`, ao contrÃ¡rio da versÃ£o em /regras/novo (linha 81 que define `minHeight: 44`). No editar, qualquer label de checkbox tem alvo de toque sem garantia de 44px, tornando clique difÃ­cil no celular do gestor.
- **Sugestao:** Adicionar `minHeight: 44` no estilo do `<label>` da funÃ§Ã£o `checkbox` em page.tsx linha 109, igualando ao padrÃ£o jÃ¡ usado na tela /regras/novo.

### [regras-autorizacoes-relatorios] [Regras â€” /regras/[id]/dados] BotÃ£o 'Salvar' no PageHeader e botÃ£o 'Salvar mesmo assim'
- **Categoria:** affordance · **Arquivo:** `src/app/(dashboard)/regras/[id]/dados/page.tsx`
- **Problema:** Ao ocorrer aviso de validaÃ§Ã£o, dois botÃµes de Salvar aparecem no header simultaneamente ('Salvar mesmo assim' + 'Salvar'), ambos chamam a mesma funÃ§Ã£o `salvar()`. No mobile, os dois botÃµes no header pressionam o espaÃ§o disponÃ­vel e podem se sobrepor, alÃ©m de confundir o leigo sobre qual apertar.
- **Sugestao:** Quando `temAvisoValidacao` for verdadeiro, ocultar o botÃ£o normal 'Salvar' e manter apenas o 'Salvar mesmo assim' (danger). Isso elimina a ambiguidade e o problema de espaÃ§o no mobile.

### [regras-autorizacoes-relatorios] [Regras â€” /regras/[id]/dados (seÃ§Ã£o Escrita)] Tabela de campos de escrita (`minWidth: 600`)
- **Categoria:** tabela · **Arquivo:** `src/app/(dashboard)/regras/[id]/dados/page.tsx`
- **Problema:** A tabela de configuraÃ§Ã£o de campos esperados pelo executor (linha 407) tem `minWidth: 600`, dentro de um `overflowX: 'auto'`. A seÃ§Ã£o de Escrita nÃ£o tem classe `m-hide` nem variante mobile â€” ela aparece abaixo da lista em ambas as versÃµes. No mobile a tabela com 600px de largura mÃ­nima requer scroll horizontal com inputs pequenos (fontSize: 12) extremamente difÃ­ceis de preencher pelo leigo.
- **Sugestao:** Criar variante mobile da seÃ§Ã£o de escrita: empilhar os campos verticalmente (um card por campo em vez de linha de tabela) em telas abaixo de 768px, usando classes `m-show-block`/`m-hide`.

### [regras-autorizacoes-relatorios] [Regras â€” /regras/[id]/dados (seÃ§Ã£o Escrita)] BotÃ£o '+ Adicionar campo' (linha 524)
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/regras/[id]/dados/page.tsx`
- **Problema:** O botÃ£o `+ Adicionar campo` tem `padding: '4px 10px'` e `fontSize: 12`. NÃ£o tem `minHeight: 44` nem classe `m-touch`. No mobile Ã© um alvo de toque abaixo do mÃ­nimo de 44px exigido pela Apple HIG e pelas prÃ³prias classes do projeto.
- **Sugestao:** Adicionar `minHeight: 44` ao estilo do botÃ£o ou substituir por `<Btn>` do design system que jÃ¡ aplica a classe `m-touch` automaticamente.

### [regras-autorizacoes-relatorios] [AutorizaÃ§Ãµes â€” /autorizacoes] CÃ©lulas de telefone e usuÃ¡rio na tabela desktop (linhas 200â€“205) sem indicaÃ§Ã£o de que sÃ£o clicÃ¡veis
- **Categoria:** affordance · **Arquivo:** `src/app/(dashboard)/autorizacoes/page.tsx`
- **Problema:** As cÃ©lulas de telefone e usuÃ¡rio tÃªm `cursor: pointer` e disparam modais ao clicar, mas visualmente sÃ£o texto simples sem sublinhado, cor diferenciada ou Ã­cone de ediÃ§Ã£o. O Ãºnico aviso estÃ¡ no cabeÃ§alho em texto miÃºdo. Um leigo que nÃ£o leia o cabeÃ§alho nÃ£o descobre que pode editar clicando.
- **Sugestao:** Adicionar um Ã­cone de lÃ¡pis ou underline ao hover nas cÃ©lulas de telefone e usuÃ¡rio para sinalizar que sÃ£o clicÃ¡veis. Alternativamente, adicionar um botÃ£o explÃ­cito 'Editar' visÃ­vel nos cards mobile.

### [regras-autorizacoes-relatorios] [AutorizaÃ§Ãµes â€” /autorizacoes] Banner de erro de patch sem indicaÃ§Ã£o do que falhou e sem opÃ§Ã£o de tentar de novo
- **Categoria:** guardrail · **Arquivo:** `src/app/(dashboard)/autorizacoes/page.tsx`
- **Problema:** O patch otimista (funÃ§Ã£o `patch`, linha 73â€“81) faz rollback visual quando hÃ¡ erro e exibe um banner genÃ©rico 'NÃ£o foi possÃ­vel salvar. Tente novamente.' (linha 79). O leigo fecha o banner sem notar que o estado voltou ao anterior. NÃ£o hÃ¡ indicaÃ§Ã£o de qual operaÃ§Ã£o falhou nem botÃ£o de retry.
- **Sugestao:** ApÃ³s o rollback, o banner de erro deve deixar claro qual operaÃ§Ã£o falhou (ex.: 'NÃ£o foi possÃ­vel alterar permissÃ£o de [telefone]. Tente novamente.') e incluir botÃ£o de tentativa direta.

### [regras-autorizacoes-relatorios] [RelatÃ³rios â€” /relatorios] BotÃ£o 'Exportar CSV' desabilitado quando `pedidos.length === 0` mas hÃ¡ dados em outras abas
- **Categoria:** affordance · **Arquivo:** `src/app/(dashboard)/relatorios/page.tsx`
- **Problema:** O botÃ£o de exportar (linha 267) Ã© desabilitado com `disabled={loading || pedidos.length === 0}`. Se o usuÃ¡rio estÃ¡ na aba 'Por VeÃ­culo', pode ter dados em `porVeiculo` mesmo com `pedidos` vazio. O botÃ£o aparece desabilitado mesmo havendo dados exportÃ¡veis na aba atual.
- **Sugestao:** Ajustar a condiÃ§Ã£o de disable para verificar o dado da aba ativa: `disabled={loading || (tab==='periodo' && pedidos.length===0) || (tab==='motorista' && porMotorista.length===0) || (tab==='veiculo' && porVeiculo.length===0)}`.

### [regras-autorizacoes-relatorios] [RoteirizaÃ§Ã£o â€” /roteirizacao] Link 'Ajustar â†’' na coluna AÃ§Ãµes da tabela de rotas recentes (linha 387â€“395)
- **Categoria:** affordance · **Arquivo:** `src/app/(dashboard)/roteirizacao/page.tsx`
- **Problema:** O link 'Ajustar â†’' Ã© um `<a>` com `fontSize: 13` sem `minHeight` definido, visualmente idÃªntico a texto simples (apenas cor azul). Na tabela desktop o alvo de toque nÃ£o Ã© garantido em 44px e a aÃ§Ã£o clicÃ¡vel nÃ£o Ã© Ã³bvia para o leigo.
- **Sugestao:** Converter 'Ajustar â†’' em `<Btn>` do design system ou adicionar `minHeight: 44, display: 'inline-flex', alignItems: 'center', padding: '0 12px', border: '1px solid #cbd5e1', borderRadius: 8` para dar aparÃªncia de botÃ£o e alvo adequado.

### [regras-autorizacoes-relatorios] [Regras â€” /regras (listagem)] MobileList sem campo de busca na variante mobile
- **Categoria:** navegacao · **Arquivo:** `src/app/(dashboard)/regras/page.tsx`
- **Problema:** A variante desktop tem SearchInput para filtrar regras por nome, tipo e frase (linhas 88â€“96). A variante mobile (`MobileList`, linhas 154â€“169) nÃ£o tem campo de busca â€” o gestor no celular, com muitas regras cadastradas, nÃ£o tem como filtrar a lista.
- **Sugestao:** Adicionar o `SearchInput` acima do `MobileList` (fora da div `m-hide`), aproveitando o mesmo estado `busca` e `setBusca` que jÃ¡ filtra `ordenadas` â€” o estado Ã© compartilhado, basta renderizar o input visÃ­vel no mobile tambÃ©m.

### [integridade-gravacao] [Financeiro do Pedido (faturamento) â€” Baixar/Estornar parcela] UPDATE pedidos.pago em sincronizarPagoPedido
- **Categoria:** integridade · **Arquivo:** `src/app/(dashboard)/faturamento/_components/FinanceiroPedido.tsx:135-142`
- **Problema:** SincronizaÃ§Ã£o de pedidos.pago/data_pagamento SEM checagem de erro. atualizarParcela grava a parcela (com checagem), atualiza o estado local e entÃ£o chama sincronizarPagoPedido (linha 287), que faz supabase.from('pedidos').update({ pago, data_pagamento }) (linha 138-141) ignorando o retorno. CenÃ¡rio concreto: o gestor dÃ¡ baixa na Ãºltima parcela (parcela vira paga no banco), mas o update que marca o PEDIDO como pago falha silenciosamente â†’ a parcela aparece paga mas o pedido continua como 'nÃ£o pago' nos agregados de recebÃ­veis por cliente, sem qualquer aviso. InconsistÃªncia financeira invisÃ­vel.
- **Sugestao:** Capturar e tratar o { error } do update de pedidos em sincronizarPagoPedido; em caso de falha, exibir aviso e realinhar o estado local da parcela, ou consolidar baixa+sync de pedido numa RPC transacional.

### [integridade-gravacao] [Despacho â€” lista (confirmarDespacho em lote, modo despacho normal)] Loop de UPDATEs por grupo de status + UPDATE de entregas
- **Categoria:** integridade · **Arquivo:** `src/app/(dashboard)/despacho/_components/useDespacho.ts:436-466`
- **Problema:** GravaÃ§Ã£o multi-etapa com falha parcial entre lotes. No modo despacho, os pedidos sÃ£o agrupados por status e atualizados num for...of (linha 436-453): se o primeiro grupo gravar e o segundo falhar, o erro Ã© exibido, mas os pedidos do primeiro grupo JÃ foram alterados no banco (veiculo/motorista/status) sem rollback. Em seguida o UPDATE de entregas (linha 457-460) nÃ£o roda porque houve return no erro do grupo. CenÃ¡rio: parte dos pedidos selecionados fica despachada e parte nÃ£o, com as entregas correspondentes ainda sem caminhÃ£o/motorista â€” estado parcial sem indicaÃ§Ã£o de QUAIS pedidos foram afetados.
- **Sugestao:** Mensagem de erro deve identificar quais pedidos jÃ¡ foram gravados; idealmente executar o despacho em lote via RPC transacional (pedidos+entregas) para que a falha de qualquer parte reverta tudo. ApÃ³s erro, recarregar a lista para refletir o estado real.

## BAIXO (36)

### [painel] [Painel â€” LembretesWidget: lista de pendentes] BotÃ£o 'Ciente' com padding `6px 12px` e `minHeight: 44px`
- **Categoria:** affordance · **Arquivo:** `src/components/dashboard/LembretesWidget.tsx`
- **Problema:** O botÃ£o de ciente no widget principal (linha 518-529 do LembretesWidget.tsx) usa `padding: '6px 12px'` e `minHeight: '44px'`. PorÃ©m, sem `minWidth` definido, em textos muito curtos o alvo de toque horizontal pode cair abaixo dos 44px exigidos pelo Apple HIG. O botÃ£o equivalente no HistoricoModal (linha 314-328) tem `padding: '8px 12px'` e `minHeight: 44px` mas igualmente sem `minWidth`.
- **Sugestao:** Adicionar `minWidth: '44px'` ou a classe `m-touch` em ambos os botÃµes 'Ciente' do widget e do HistoricoModal.

### [painel] [Painel â€” KpiCard 'Adiantamentos Pendentes'] KpiCard sem link/aÃ§Ã£o quando hÃ¡ adiantamentos pendentes
- **Categoria:** navegacao · **Arquivo:** `src/app/(dashboard)/page.tsx`
- **Problema:** Quando `adtPendentes > 0`, o card exibe aviso 'aguardando aprovaÃ§Ã£o' mas nÃ£o Ã© clicÃ¡vel â€” nÃ£o leva o gestor para a tela de adiantamentos. Um leigo vÃª o aviso mas nÃ£o sabe o que fazer. Os outros KpiCards tambÃ©m nÃ£o sÃ£o clicÃ¡veis. Para o card de adiantamentos pendentes, a ausÃªncia de aÃ§Ã£o Ã© especialmente problemÃ¡tica pois representa uma tarefa operacional urgente.
- **Sugestao:** Envolver o KpiCard de adiantamentos pendentes (quando > 0) em um `<Link href='/adiantamentos'>` ou adicionar `cursor:'pointer'` e `onClick` de navegaÃ§Ã£o para que o gestor chegue diretamente Ã  tela de aprovaÃ§Ã£o.

### [pedidos-listagem] [Listagem de Pedidos (mobile)] Filtro de status â€” select mobile sem label (linha 418)
- **Categoria:** outro · **Arquivo:** `src/app/(dashboard)/pedidos/page.tsx`
- **Problema:** O select de filtro fica empilhado abaixo do SearchInput sem label explicativo. Para o leigo, o select mostra 'Em aberto (nao concluidos)' como texto inicial, mas nao ha rotulo indicando o que esse campo controla. Se o leigo mudar sem querer o filtro, a lista muda silenciosamente.
- **Sugestao:** Adicionar label curto acima do select no bloco mobile (ex.: 'Filtrar por status:') para deixar claro o que o campo controla.

### [pedidos-listagem] [Listagem de Pedidos (mobile)] KPI 'Na lista' â€” valor depende do filtro ativo (linha 309)
- **Categoria:** integridade · **Arquivo:** `src/app/(dashboard)/pedidos/page.tsx`
- **Problema:** O KPI 'Na lista' exibe o total do filtro ATUAL (kpis.total), enquanto os outros KPIs (Agendados, Andamento, Concluidos) sao contagens GLOBAIS independentes do filtro. Quando o leigo muda o filtro para 'Todos os status', o KPI 'Na lista' muda de valor mas os demais permanecem iguais, criando inconsistencia silenciosa sem aviso.
- **Sugestao:** Adicionar nota dinamica no label do KPI 'Na lista' indicando o filtro ativo (ex.: 'Em aberto' ou 'Todos'), ou separar visualmente KPIs de filtro dos KPIs globais.

### [pedidos-listagem] [Listagem de Pedidos (mobile)] Paginacao mobile â€” sem feedback durante troca de pagina (Paginacao.tsx linhas 34-51)
- **Categoria:** loading · **Arquivo:** `src/components/ui/Paginacao.tsx`
- **Problema:** Durante troca de pagina (loading=true), os botoes 'Anterior' e 'Proxima' ficam disabled mas sem texto ou spinner indicando que uma busca esta em andamento. O leigo ve os botoes sumirem de acao e a lista desaparecer sem entender o que esta acontecendo.
- **Sugestao:** Adicionar texto 'Carregando...' ou spinner proximo aos botoes de paginacao quando loading=true.

### [pedidos-listagem] [Pedido /[id] â€” pagina de redirect] Botao 'Voltar para Pedidos' fora do design system (page.tsx linhas 35-39)
- **Categoria:** affordance · **Arquivo:** `src/app/(dashboard)/pedidos/[id]/page.tsx`
- **Problema:** O botao de fallback de erro e um <button> HTML nativo com estilo inline, sem usar o componente Btn do design system. Apesar de ter minHeight: 44px correto para mobile, nao tem classe m-touch e pode ter comportamento visual inconsistente.
- **Sugestao:** Substituir o <button> nativo pelo componente Btn do design system para manter consistencia visual e garantir comportamento padrao de touch target.

### [pedidos-listagem] [Listagem de Pedidos (desktop)] DeleteBtn â€” botao 'Excluir' parece texto vermelho (DeleteBtn.tsx linhas 43-57)
- **Categoria:** affordance · **Arquivo:** `src/components/ui/DeleteBtn.tsx`
- **Problema:** O botao 'Excluir' renderiza sem borda e sem background no estado normal, apenas com texto vermelho. Na tabela desktop o leigo pode nao perceber que e um botao clicavel. O guard-rail de confirmacao esta implementado corretamente (modal com loading e mensagem de erro), porem a affordance do gatilho e fraca.
- **Sugestao:** Adicionar borda ou background sutil ao botao Excluir no estado normal (ex.: border: 1px solid #fca5a5, background: #fef2f2) para que o leigo o reconheca como acao de perigo e nao como texto puro.

### [pedidos-formularios] [novo-avancado/page.tsx â€” Novo Pedido AvanÃ§ado â€” Step 2] Tabela de entregas disponÃ­veis (linhas 389-434)
- **Categoria:** affordance · **Arquivo:** `src/app/(dashboard)/pedidos/novo-avancado/page.tsx`
- **Problema:** A coluna 'Rota' tem `maxWidth: '180px'` com `overflow: hidden; textOverflow: ellipsis; whiteSpace: nowrap` â€” correto para desktop. Mas no mobile as colunas 'Cliente' e 'Coleta (Data)' ficam ocultas via `m-hide`, sobrando apenas a coluna de checkbox e 'Rota'. Com apenas 180px de maxWidth e a tela em 390px, parte do espaÃ§o disponÃ­vel fica desperdiÃ§ado. AlÃ©m disso, a linha inteira Ã© clicÃ¡vel via `onClick={() => toggleEntrega(fr.id)}` na `<Tr>`, mas nÃ£o hÃ¡ feedback visual de seleÃ§Ã£o alÃ©m do background azul na linha â€” o leigo pode nÃ£o perceber que clicou.
- **Sugestao:** Remover o maxWidth fixo da coluna Rota no mobile ou substituir pela classe m-grid para que ocupe o espaÃ§o disponÃ­vel. Adicionar Ã­cone de check visÃ­vel na linha selecionada alÃ©m do background.

### [pedidos-formularios] [importar/page.tsx + EtapaSelecionarPedido] Estado de carregamento das opÃ§Ãµes de pedido (EtapaSelecionarPedido linha 43)
- **Categoria:** loading · **Arquivo:** `src/app/(dashboard)/pedidos/importar/_components/EtapaSelecionarPedido.tsx`
- **Problema:** Enquanto `carregandoOpcoes` Ã© true, exibe apenas um parÃ¡grafo de texto 'Carregando pedidos...' (fontSize 13px, color blue). NÃ£o hÃ¡ skeleton, spinner ou indicador visual adequado. Para o leigo mobile, parece que a tela estÃ¡ em branco/travada.
- **Sugestao:** Substituir o parÃ¡grafo por um spinner ou skeleton loader condizente com o restante do sistema.

### [pedidos-formularios] [importar/page.tsx + EtapaUpload] BotÃµes de seleÃ§Ã£o de modo XML/Planilha (linhas 103-127)
- **Categoria:** affordance · **Arquivo:** `src/app/(dashboard)/pedidos/importar/_components/EtapaUpload.tsx`
- **Problema:** Os dois botÃµes de modo tÃªm `minHeight: '80px'` e sÃ£o bem visÃ­veis. No mobile em 390px, dois botÃµes lado a lado com `flex: 1` ficam com ~179px cada â€” suficiente. PorÃ©m, o botÃ£o ativo tem `border: '2px solid #2563eb'` e background azul claro, mas o botÃ£o inativo tem apenas `border: '1px solid #e2e8f0'` com fundo branco, sem nenhum indicador de que Ã© clicÃ¡vel (sem sombra ativa, sem transiÃ§Ã£o visÃ­vel no mobile). Para o leigo parece que sÃ³ existe uma opÃ§Ã£o.
- **Sugestao:** Adicionar um indicador explÃ­cito no botÃ£o inativo (ex: borda mais escura, Ã­cone de rÃ¡dio, ou texto 'Toque para selecionar') para deixar claro que ambos sÃ£o selecionÃ¡veis.

### [pedidos-formularios] [importar/page.tsx + EtapaPreview] Tabela de preview â€” coluna 'EndereÃ§o' oculta no mobile (linha 80-82)
- **Categoria:** tabela · **Arquivo:** `src/app/(dashboard)/pedidos/importar/_components/EtapaPreview.tsx`
- **Problema:** A coluna 'EndereÃ§o' Ã© marcada com `className='m-hide'` e fica invisÃ­vel no mobile. No mobile, a linha mostra DestinatÃ¡rio com o endereÃ§o em sub-linha via `.m-show-block` (linha 100-102). Isso Ã© correto. O problema Ã© que o endereÃ§o sub-linha nÃ£o tem `title` para exibir o texto completo ao segurar (tooltip), apenas um `title={l.endereco}` no div (linha 100), que no mobile nÃ£o funciona como tooltip. Para endereÃ§os longos, o leigo nÃ£o consegue ver o endereÃ§o completo antes de confirmar a importaÃ§Ã£o.
- **Sugestao:** Exibir os primeiros 60 caracteres do endereÃ§o no mobile com '...' e permitir expandir ao tocar, ou aumentar o nÃºmero de linhas do endereÃ§o para 2 linhas com `webkitLineClamp: 2`.

### [pedidos-formularios] [novo-avancado/page.tsx â€” Step 1 (Motorista)] Select de motorista sem estado de carregamento inicial (linhas 366-370)
- **Categoria:** loading · **Arquivo:** `src/app/(dashboard)/pedidos/novo-avancado/page.tsx`
- **Problema:** O select de motorista Ã© populado pelo `useEffect` que carrega motoristas, veÃ­culos e entregas em paralelo. Durante esse carregamento inicial nÃ£o hÃ¡ indicador de loading â€” o select aparece como `<option value=''>Selecione na lista...</option>` vazio. O leigo pode confundir com 'nÃ£o hÃ¡ motoristas cadastrados'.
- **Sugestao:** Adicionar um estado de carregamento inicial (ex: `loadingDados`) e enquanto estiver carregando exibir o select desabilitado com texto 'Carregando motoristas...'.

### [pedidos-formularios] [novo/page.tsx â€” Novo Pedido (Simples)] Campo 'Valor do Pedido' â€” validaÃ§Ã£o de valor zero (linha 188)
- **Categoria:** guardrail · **Arquivo:** `src/app/(dashboard)/pedidos/novo/page.tsx`
- **Problema:** A validaÃ§Ã£o permite valor zero (`parseFloat(valorPedido) < 0` â€” apenas negativo Ã© barrado). Um pedido com valor R$ 0,00 pode ser registrado sem alerta. Para o leigo que digitou errado e limpou o campo sem querer, o sistema aceita silenciosamente.
- **Sugestao:** Ao submeter com valor preenchido e igual a zero, mostrar um aviso (nÃ£o bloqueio) perguntando se o pedido realmente tem valor R$ 0,00.

### [despacho] [Despacho â€” Detalhe / AbaPrincipal] Btn 'Cancelar pedido' sem prop loading quando updatingStatus=true
- **Categoria:** loading · **Arquivo:** `src/app/(dashboard)/despacho/[id]/_components/AbaPrincipal.tsx:89-93`
- **Problema:** AbaPrincipal.tsx linhas 89-93: o botÃ£o 'Cancelar pedido' recebe disabled={updatingStatus} mas nÃ£o loading={updatingStatus}. Quando outra aÃ§Ã£o de status estÃ¡ em curso, o botÃ£o fica inativo sem spinner, sem feedback visual claro.
- **Sugestao:** Adicionar loading={updatingStatus} ao Btn de cancelar pedido.

### [despacho] [Despacho â€” Detalhe / AbaRota] DescriÃ§Ã£o de funcionalidade futura exibida para o leigo
- **Categoria:** outro · **Arquivo:** `src/app/(dashboard)/despacho/[id]/_components/AbaRota.tsx:47-51`
- **Problema:** AbaRota.tsx linhas 47-51: o texto exibido menciona 'por enquanto ficam sÃ³ anotados â€” depois o sistema vai propor a ordem de carregamento, quando o motorista finalizar a rota'. Expoe ao gestor uma funcionalidade incompleta, gerando confusÃ£o sobre o que o sistema faz hoje.
- **Sugestao:** Simplificar para: 'Importe as notas fiscais para registrar os endereÃ§os de entrega deste pedido.' â€” sem mencionar funcionalidades futuras.

### [despacho] [Despacho â€” Detalhe [id]/page.tsx] salvarLocais â€” propagaÃ§Ã£o parcial sem notificar o gestor sobre sucesso
- **Categoria:** guardrail · **Arquivo:** `src/app/(dashboard)/despacho/[id]/page.tsx:195-220`
- **Problema:** page.tsx linhas 195-220: apÃ³s salvar com sucesso, nÃ£o hÃ¡ mensagem de sucesso exibida. O usuÃ¡rio sÃ³ percebe que funcionou porque a lista de locais Ã© atualizada visualmente. Se estiver distraÃ­do, pode achar que o botÃ£o nÃ£o funcionou e clicar de novo.
- **Sugestao:** Adicionar um estado de sucesso temporÃ¡rio (ex.: 'Local salvo!') apÃ³s salvarLocais() completar com sucesso, similar ao pattern de sucesso do useDespacho.

### [entregas] [Listagem de Pedidos (entregas/page.tsx)] BotÃ£o 'Receber' â€” loading nÃ£o protege clique duplo no MobileCard
- **Categoria:** loading · **Arquivo:** `src/app/(dashboard)/entregas/page.tsx`
- **Problema:** No MobileCard (linha 636-642), o Btn com loading={loadingPago.has(pedido.id)} estÃ¡ correto, mas o onClick abre o modal (setConfirmReceberPedido) sem verificar se jÃ¡ estÃ¡ em loading. Se o usuÃ¡rio tocar duas vezes rapidamente no botÃ£o antes do modal abrir, dois setConfirmReceberPedido sÃ£o disparados. O modal fecha com o primeiro click de Confirmar e o estado confirmReceberPedido pode ser null para o segundo â€” nÃ£o causa dupla gravaÃ§Ã£o, mas pode confundir.
- **Sugestao:** Adicionar verificaÃ§Ã£o `if (loadingPago.has(pedido.id)) return;` no onClick do botÃ£o Receber antes de abrir o modal.

### [entregas] [Editar Pedido (entregas/[id]/editar/page.tsx)] Grid financeiro â€” repeat(4, 1fr) sem classe m-grid
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/entregas/[id]/editar/page.tsx`
- **Problema:** A seÃ§Ã£o 'Valor e Pagamento' (linha 278) usa gridTemplateColumns: 'repeat(4, 1fr)' com className='m-grid'. A classe m-grid colapsa para 1fr, o que Ã© correto. PorÃ©m o campo 'Data do Pagamento' (linha 305-309) Ã© renderizado condicionalmente como 4Âº filho do grid â€” quando pago === 'true'. Isso Ã© coerente, mas no mobile os 3 selects (Valor, Forma Pgto, Pago) ficarÃ£o empilhados em 1 coluna corretamente.
- **Sugestao:** Sem problema crÃ­tico neste ponto, mas verificar visualmente que o IMaskInput do valor (que usa defaultValue) nÃ£o quebra o layout empilhado no mobile.

### [entregas] [Editar Pedido (entregas/[id]/editar/page.tsx)] BotÃ£o 'Atualizar' duplicado â€” no PageHeader e no rodapÃ© do formulÃ¡rio
- **Categoria:** affordance · **Arquivo:** `src/app/(dashboard)/entregas/[id]/editar/page.tsx`
- **Problema:** Existem dois botÃµes de submit: um no PageHeader (linha 163-165, type='submit', loading=saving) e outro no rodapÃ© do conteÃºdo (linha 322-324, type='submit', loading=saving). No mobile o PageHeader fica no topo e o rodapÃ© fica apÃ³s scroll do conteÃºdo. O leigo pode tentar clicar no rodapÃ© sem perceber o botÃ£o do topo, ou tocar no topo sem perceber o do rodapÃ©. NÃ£o causa dupla gravaÃ§Ã£o (handleSubmit tem setSaving(true) que previne), mas gera confusÃ£o de affordance.
- **Sugestao:** Manter apenas o botÃ£o do rodapÃ© no mobile (adicionar m-hide no botÃ£o do PageHeader) para que o fluxo seja: preenche, rola atÃ© o fim, salva.

### [financeiro] [Despesas Avulsas â€” aÃ§Ãµes da tabela desktop] ActionBtn de marcar pago (âœ“) / desfazer (â†©) / excluir (âœ•) na linha
- **Categoria:** loading · **Arquivo:** `src/app/(dashboard)/financeiro/_components/AvulsasTab.tsx:286`
- **Problema:** Os ActionBtn da tabela nÃ£o mostram spinner prÃ³prio durante a operaÃ§Ã£o â€” apenas ficam disabled por salvandoId (marcarPago) ou nem isso (excluir, linha 289). No mobile o feedback de que 'estÃ¡ processando' Ã© fraco para o leigo, que pode reclicar.
- **Sugestao:** Dar feedback visual de processamento no prÃ³prio ActionBtn (spinner/desabilitar) durante marcarPago/excluir, como jÃ¡ Ã© feito nos botÃµes mobile (loading).

### [financeiro] [Fluxo DiÃ¡rio (/financeiro aba Fluxo) â€” tabela desktop] <> Fragment sem key dentro do linhas.map da DataTable
- **Categoria:** outro · **Arquivo:** `src/app/(dashboard)/financeiro/_components/FluxoTab.tsx:206`
- **Problema:** No map de linhas (linha 206) o retorno Ã© um Fragment <> sem key. Gera warning de key no React. NÃ£o afeta diretamente o leigo (sÃ³ console), mantido como baixo.
- **Sugestao:** Adicionar key ao Fragment (usar <React.Fragment key={l.data}>) para eliminar o warning.

### [financeiro] [Financeiro por Cliente (/faturamento) â€” linha do cliente (cabeÃ§alho expansÃ­vel)] Spans m-hide com 'X pedidos Â· Y pagos' e 'valor total'
- **Categoria:** outro · **Arquivo:** `src/app/(dashboard)/faturamento/page.tsx:313`
- **Problema:** No mobile as colunas 'X pedidos Â· Y pagos Â· faltam Z' e o 'valor total' tÃªm className m-hide e somem (linhas 313 e 316). Sobra sÃ³ o nome do cliente e o 'valor em aberto'. O gestor no celular perde a contagem de pedidos e o total do cliente â€” contexto que existe no desktop mas nÃ£o tem equivalente mobile, contrariando 'o mobile precisa ser um reflexo do desktop'.
- **Sugestao:** Em vez de esconder, mostrar uma segunda linha compacta no mobile com 'N pedidos Â· total R$' abaixo do nome do cliente.

### [financeiro] [Financeiro por Cliente (/faturamento) â€” painel financeiro: grid de condiÃ§Ãµes] BotÃ£o 'ðŸ’¾ Salvar' (size xs) ao fim do grid de condiÃ§Ãµes
- **Categoria:** affordance · **Arquivo:** `src/app/(dashboard)/faturamento/_components/FinanceiroPedido.tsx:339`
- **Problema:** O grid colapsa para 1 coluna no mobile (bom), mas o botÃ£o de salvar as condiÃ§Ãµes financeiras fica como Ãºltimo item isolado, com size xs (padding 2px 6px) â€” depende sÃ³ do m-touch para chegar a 44px e Ã© visualmente discreto. Um botÃ£o de salvar dinheiro tÃ£o pequeno num painel longo Ã© fÃ¡cil de nÃ£o perceber para um leigo.
- **Sugestao:** Aumentar o botÃ£o Salvar condiÃ§Ãµes (size sm/md, largura total no mobile) e destacÃ¡-lo apÃ³s o Total a receber.

### [financeiro] [Despesas Avulsas / RecorrÃªncias â€” campo Valor no editar] Input de Valor preenchido com String(d.valor) ao abrir ediÃ§Ã£o
- **Categoria:** entrada-dado · **Arquivo:** `src/app/(dashboard)/financeiro/_components/AvulsasTab.tsx:123`
- **Problema:** Ao abrir 'Editar', o campo Valor recebe String(d.valor), que renderiza com ponto decimal (ex.: '150.5'), enquanto o placeholder e a expectativa do usuÃ¡rio BR Ã© vÃ­rgula ('150,00'). InconsistÃªncia de formato entre exibiÃ§Ã£o e entrada para o leigo.
- **Sugestao:** Exibir o valor no formato brasileiro (vÃ­rgula) ao popular o form de ediÃ§Ã£o, mantendo a normalizaÃ§Ã£o vÃ­rgulaâ†’ponto no salvar.

### [abastecimentos-adiantamentos] [Adiantamentos â€” Editar (modal de confirmacao)] Modal de confirmacao em tela cheia no mobile sem scroll proprio no conteudo
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/adiantamentos/[id]/editar/page.tsx`
- **Problema:** O modal usa `.m-modal-content` que recebe `min-height: 100vh` no mobile (mobile.css linhas 103-108). Nao ha `.m-modal-body` nem `overflow-y: auto` no div interno, entao se o conteudo crescer (texto longo de status ou erro) o usuario nao consegue rolar dentro do modal.
- **Sugestao:** Adicionar `className="m-modal-body"` ao div interno do modal (linhas 246-256) para herdar `overflow-y: auto` e `-webkit-overflow-scrolling: touch` definidos no mobile.css.

### [veiculos-motoristas] [Editar VeÃ­culo â€” aba HistÃ³rico (abastecimentos e pedidos)] Abas 'Abastecimentos' / 'Pedidos' dentro do HistÃ³rico
- **Categoria:** affordance · **Arquivo:** `src/app/(dashboard)/veiculos/[id]/editar/page.tsx`
- **Problema:** As abas sÃ£o implementadas com <button> com style inline sem minHeight definido â€” padding '6px 16px' resulta em ~33px de altura, abaixo dos 44px. No mobile, o usuÃ¡rio toca nessas abas e pode errar o alvo ou acionar a aba errada. NÃ£o possuem a classe m-touch.
- **Sugestao:** Adicionar minHeight:'44px' nos estilos das abas de histÃ³rico (linhas 394-400) ou adicionar a classe m-touch.

### [veiculos-motoristas] [Editar Motorista â€” aba VeÃ­culo PadrÃ£o] BotÃ£o 'Abrir veÃ­culo â†’' embutido dentro de um parÃ¡grafo <p>
- **Categoria:** affordance · **Arquivo:** `src/app/(dashboard)/motoristas/[id]/editar/page.tsx`
- **Problema:** O botÃ£o <Btn href={...} size='sm' variant='outline'> estÃ¡ inserido dentro de um elemento <p> (linha 366). BotÃ£o interativo dentro de parÃ¡grafo Ã© HTML invÃ¡lido e pode causar comportamento imprevisÃ­vel em leitores de tela. Mais importante para o leigo: o botÃ£o size='sm' tem padding '4px 12px' e recebe a classe m-touch pelo Btn, o que aumenta o alvo no mobile â€” mas visualmente aparece minÃºsculo dentro do texto do parÃ¡grafo, parecendo texto azul e nÃ£o um botÃ£o.
- **Sugestao:** Mover o botÃ£o para fora do <p>, colocando-o em um div separado abaixo do texto explicativo, com tamanho size='md' para ser mais visÃ­vel.

### [cadastros] [Clientes â€” Listagem] Filtro e contador (toolbar desktop)
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/clientes/page.tsx`
- **Problema:** A toolbar desktop (SearchInput + select + contador) estÃ¡ dentro do bloco .m-hide (linha 115-160), portanto fica invisÃ­vel no mobile. A toolbar mobile alternativa (linhas 98-112) nÃ£o mostra o contador de '% de X clientes', deixando o usuÃ¡rio leigo sem saber quantos registros existem.
- **Sugestao:** Adicionar o contador (ex: '{filtrados.length} de {todos.length}') abaixo do select no bloco mobile (linhas 98-112).

### [cadastros] [Usuarios â€” Editar] Campo 'Nova Senha' â€” minLength nÃ£o bloqueia submit com 1-5 caracteres
- **Categoria:** guardrail · **Arquivo:** `src/app/(dashboard)/usuarios/[id]/editar/page.tsx`
- **Problema:** O campo senha (linha 128) tem minLength={6} no HTML e a validaÃ§Ã£o server-side (actions.ts linha 36-38) retorna erro se senha < 6. PorÃ©m o atributo HTML minLength nÃ£o impede o submit em React (controlled input) â€” o usuÃ¡rio pode digitar 3 caracteres, clicar em salvar, e sÃ³ recebe o erro depois do round-trip ao servidor.
- **Sugestao:** Adicionar validaÃ§Ã£o client-side: antes de submeter, verificar se senha.length > 0 && senha.length < 6 e exibir mensagem imediata sem precisar do round-trip.

### [cadastros] [Perfil â€” Trocar Senha] Campo 'Nome' editÃ¡vel mas sem efeito
- **Categoria:** outro · **Arquivo:** `src/app/(dashboard)/perfil/page.tsx`
- **Problema:** O campo Nome (linha 97) estÃ¡ disabled e com background cinza, indicando somente leitura. Mas o formulÃ¡rio onSubmit nÃ£o atualiza o nome em lugar nenhum â€” apenas troca a senha. NÃ£o hÃ¡ problema de dado, mas gera confusÃ£o: o leigo vÃª um campo 'Nome' num formulÃ¡rio de 'Salvar' e pode esperar que seja editÃ¡vel. NÃ£o hÃ¡ mensagem explicando que o nome nÃ£o pode ser alterado aqui.
- **Sugestao:** Adicionar um texto explicativo abaixo do campo como 'O nome sÃ³ pode ser alterado pelo administrador do sistema' ou mover o campo para fora do formulÃ¡rio.

### [cadastros] [Uso de APIs] PÃ¡gina com padding fixo 24px e maxWidth 860px
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/uso-apis/page.tsx`
- **Problema:** A pÃ¡gina /uso-apis (page.tsx linha 47) usa padding:24 e maxWidth:860px mas NÃƒO usa m-hide/m-show para adaptar ao mobile. Em 390px, o padding de 24px de cada lado consome ~12% da largura disponÃ­vel. Os cards de API tÃªm display:flex com gap:16 â€” no mobile o bloco de % (72px) fica Ã  esquerda com m-hide, mas o conteÃºdo usa minWidth:0 e deve funcionar. O tÃ­tulo e descriÃ§Ã£o da pÃ¡gina ficam corretos. O maior risco Ã© o input 'Novo nÃºmero' que tem maxWidth:240 inline (linha 139 de editar/page.tsx). Em 390px de viewport, apÃ³s paddings, esse campo ocupa cerca de 62% â€” aceitÃ¡vel mas estreito.
- **Sugestao:** Adicionar padding responsivo via media query ou reduzir para padding:16px no mobile para maximizar Ã¡rea Ãºtil dos cards.

### [regras-autorizacoes-relatorios] [Regras â€” /regras/[id]/dados] BotÃ£o fechar aviso de validaÃ§Ã£o ('âœ•', linha 235)
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/regras/[id]/dados/page.tsx`
- **Problema:** O botÃ£o de fechar o banner de aviso de validaÃ§Ã£o tem apenas `fontSize: 16` e `lineHeight: 1`, sem `minWidth`/`minHeight` de 44px. No mobile Ã© difÃ­cil de acertar com o polegar.
- **Sugestao:** Adicionar `minWidth: 44, minHeight: 44` ao estilo do botÃ£o âœ• de fechar o banner de aviso.

### [regras-autorizacoes-relatorios] [Regras â€” /regras/contexto] BotÃµes 'Montar contexto' e 'Classificar (IA)' desabilitados sem explicaÃ§Ã£o
- **Categoria:** guardrail · **Arquivo:** `src/app/(dashboard)/regras/contexto/page.tsx`
- **Problema:** Ambos os botÃµes (linha 83â€“84) sÃ£o desabilitados quando `!telefone.trim()`. Ao clicar, o botÃ£o simplesmente nÃ£o responde e nÃ£o hÃ¡ nenhuma mensagem informando ao leigo por que nÃ£o funciona â€” o estado `disabled` muda a opacidade mas o leigo nÃ£o entende a razÃ£o.
- **Sugestao:** Exibir um texto abaixo dos botÃµes explicando 'Digite um nÃºmero de telefone para habilitar os botÃµes', ou mostrar um aviso inline ao tentar clicar sem preencher.

### [regras-autorizacoes-relatorios] [AutorizaÃ§Ãµes â€” /autorizacoes/empresas] Checkboxes na tabela desktop com alvo abaixo de 44px
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/autorizacoes/empresas/page.tsx`
- **Problema:** Os `<input type='checkbox'>` na tabela desktop (linha 122) tÃªm `width: 18, height: 18` â€” bem abaixo do mÃ­nimo de 44px. Embora a variante mobile use botÃµes com `minHeight: 44`, a tabela desktop pode ser vista em tablets.
- **Sugestao:** Envolver o checkbox em um `<label>` com `minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center'` para ampliar o alvo de toque.

### [integridade-gravacao] [Novo Adiantamento] Campo Status do adiantamento (pode criar jÃ¡ como 'prestado'/'aprovado')
- **Categoria:** integridade · **Arquivo:** `src/app/(dashboard)/adiantamentos/novo/page.tsx:58-66`
- **Problema:** Permite gravar combinaÃ§Ã£o potencialmente inconsistente: status='prestado'/'aprovado'/'recusado' SEM data_pagamento preenchida (data_pagamento Ã© opcional, linha 64). Um adiantamento marcado como 'prestado' mas sem data de pagamento entra no banco e pode poluir relatÃ³rios financeiros/acerto mensal sem rastro de quando foi pago. HÃ¡ um aviso amarelo (linha 133-137) pedindo confirmaÃ§Ã£o visual, mas nÃ£o hÃ¡ validaÃ§Ã£o que exija data_pagamento quando o status implica pagamento efetuado.
- **Sugestao:** Validar no handleSubmit: se status indicar pagamento/prestaÃ§Ã£o (aprovado/prestado), exigir data_pagamento; ou amarrar o estado financeiro do adiantamento ao preenchimento da data para nÃ£o gerar lanÃ§amento sem data.

### [integridade-gravacao] [Despacho â€” Detalhe do pedido (Aba Principal)] BotÃ£o '+ Adicionar' / remover local de carregamento (onSalvarLocais)
- **Categoria:** integridade · **Arquivo:** `src/app/(dashboard)/despacho/[id]/_components/AbaPrincipal.tsx:146-160`
- **Problema:** SubmissÃµes concorrentes em salvarLocais. O input dispara onSalvarLocais no Enter (linha 153) e no clique do botÃ£o, e os botÃµes de remover local (linha 138) tambÃ©m chamam onSalvarLocais. salvarLocais grava pedido E propaga origem a TODAS as entregas (page.tsx linha 207). Dois disparos rÃ¡pidos (ex.: Enter + clique, ou remover dois locais em sequÃªncia antes do primeiro terminar) podem gravar com listas diferentes; o segundo grava por cima do primeiro. NÃ£o corrompe dado financeiro, mas o local salvo pode nÃ£o refletir o que o usuÃ¡rio viu por Ãºltimo, e a origem das entregas fica inconsistente.
- **Sugestao:** Desabilitar Enter e todos os botÃµes de remover enquanto salvandoLocal===true, e ignorar chamadas reentrantes em salvarLocais com um ref de 'em andamento' (como jÃ¡ Ã© feito para datas de parcela em FinanceiroPedido).

