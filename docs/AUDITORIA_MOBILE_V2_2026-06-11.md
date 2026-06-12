# Auditoria Mobile v2 (cega) — 11/06/2026, noite

> Rodada independente APOS as correcoes da rodada 1 (commit 83e8b09). Agentes sem conhecimento do trabalho anterior.
> Criterios novos: affordance, guard-rails (confirmacao + erro nunca silencioso), tabelas com texto longo, entrada amigavel x dado conciso, clareza pro leigo.
> 166 achados acionaveis (6 ecos de decisoes ja acordadas foram filtrados).

## Veredicto independente da navegacao (voltar/login)

FRÃGIL, mas majoritariamente corrigido. As trÃªs causas clÃ¡ssicas do "voltar â†’ tela de login mesmo logado" foram tratadas no cÃ³digo atual: (1) os guards de dashboard leem a sessÃ£o LOCAL (getSession, sem rede) e usam router.replace â€” o back que remonta a pÃ¡gina nÃ£o chuta mais por oscilaÃ§Ã£o de rede nem polui o histÃ³rico; (2) a pÃ¡gina /login tem guarda reversa que, com sessÃ£o vÃ¡lida, devolve para "/" via replace; (3) o service worker nÃ£o cacheia mais respostas redirecionadas e o fallback offline Ã© por Ã¡rea (dashboard offline sem cache mostra 503, NUNCA a shell de /login). PorÃ©m o fluxo NÃƒO estÃ¡ 100% seguro: sobrou pelo menos uma pÃ¡gina do dashboard (roteirizaÃ§Ã£o) que ainda valida sessÃ£o por REDE (auth.getUser) e usa router.push('/login') â€” exatamente o padrÃ£o antigo que cria a entrada /login no histÃ³rico e chuta o gestor logado em rede mÃ³vel ruim. AlÃ©m disso, usuarioSessao() (usado por 17 telas) nÃ£o tem a tolerÃ¢ncia a erro transitÃ³rio que temSessao() tem, e o middleware/proxy nÃ£o protege rota nenhuma (sÃ³ renova cookie), deixando toda a proteÃ§Ã£o no cliente.

### Riscos apontados e destino
- roteirizacao/page.tsx:114-116 â€” Ãºnico resquÃ­cio do padrÃ£o antigo: auth.getUser() (validaÃ§Ã£o por REDE a cada mount) + router.push('/login'). Em 4G oscilante o gestor logado Ã© chutado pro login E /login entra no histÃ³rico (o push anula a limpeza que o resto do app faz). CorreÃ§Ã£o de 2 linhas: trocar por temSessao()/usuarioSessao() + router.replace.
- usuarioSessao() (temSessao.ts:26-29) nÃ£o repete a tolerÃ¢ncia a erro de temSessao(): se getSession() retornar erro com sessÃ£o nula (token expirado + refresh falhando por rede), retorna null e as ~17 telas que a usam fazem replace('/login'). A guarda reversa do /login tambÃ©m falha nesse cenÃ¡rio (getSession falha de novo) â†’ gestor vÃª o formulÃ¡rio de login mesmo logado. Janela rara, mas Ã© exatamente o sintoma relatado.
- A guarda reversa do /login depende de JS + getSession resolver: se o usuÃ¡rio cair no /login OFFLINE (shell prÃ©-cacheada pelo SW) com sessÃ£o vÃ¡lida, getSession pode falhar e o formulÃ¡rio fica na tela â€” submeter offline nÃ£o funciona. Melhor que a tela errada, mas ainda confunde.
- ProteÃ§Ã£o 100% client-side: o proxy.ts nÃ£o bloqueia nenhuma rota do dashboard sem sessÃ£o (sÃ³ renova cookie). Os dados ficam atrÃ¡s do RLS, mas qualquer rota renderiza o shell para visitante deslogado atÃ© o guard do useEffect rodar. NÃ£o causa o bug do voltar, porÃ©m Ã© uma decisÃ£o de seguranÃ§a a registrar.
- O fluxo pÃ³s-login (actions.ts:51, redirect('/')) deixa a entrada /login no histÃ³rico (server action redirect = push). Hoje a guarda reversa do login mascara isso (back â†’ /login â†’ replace pra '/'), mas gera um 'flash' do login e uma pisada extra no back â€” funciona, nÃ£o Ã© elegante.
- PÃ¡ginas modificadas no working tree ainda sem commit (despacho/*, entregas/*, pedidos/*) â€” o estado analisado Ã© o da Ã¡rvore atual; se essas mudanÃ§as nÃ£o forem commitadas/deployadas, produÃ§Ã£o pode ainda ter o comportamento antigo.

> Tratados na mesma noite: guard antigo da /roteirizacao (getUser+push -> usuarioSessao+replace) e tolerancia a erro transitorio no usuarioSessao() (retry unico).

## CRITICO (13)

### [/adiantamentos/novo] Campo 'Valor (R$)' â€” type='number' sem mÃ¡scara de moeda
- **Categoria:** entrada-dado · **Arquivo:** `src/app/(dashboard)/adiantamentos/novo/page.tsx:59`
- **Problema:** O campo valor usa `type='number'` com `inputMode='decimal'` (page.tsx:115-120). No iOS Safari o teclado decimal exibido para `type='number'` nÃ£o mostra o ponto/vÃ­rgula em todos os layouts de teclado numÃ©rico regional. AlÃ©m disso o placeholder '0,00' usa vÃ­rgula mas o browser interpreta decimais com ponto â€” o leigo que digitar '150,00' receberÃ¡ NaN no parseFloat. EvidÃªncia: page.tsx:59 `parseFloat(f.valor)`.
- **Sugestao:** Usar `type='text'` com `inputMode='decimal'` e no handleSubmit normalizar: `parseFloat(f.valor.replace(',', '.'))`. Ou adicionar mÃ¡scara de moeda (ex.: formatar para BRL enquanto digita e gravar o float normalizado).

### [/adiantamentos/[id]/editar] Campo 'Valor (R$)' â€” mesmo problema type='number' + parseFloat sem tratamento de vÃ­rgula
- **Categoria:** entrada-dado · **Arquivo:** `src/app/(dashboard)/adiantamentos/[id]/editar/page.tsx:75`
- **Problema:** IdÃªntico ao /novo: page.tsx:144-154, handleSubmit linha 75 `parseFloat(f.valor)`. Se o leigo digitar com vÃ­rgula (padrÃ£o BR), o valor vai a NaN e Ã© salvo como NaN no banco (o Supabase pode rejeitar ou salvar NULL dependendo da coluna).
- **Sugestao:** Normalizar `f.valor.replace(',', '.')` antes de `parseFloat`, ou usar `type='text'` com `inputMode='decimal'`.

### [/adiantamentos/[id]/editar] Campo 'Valor Prestado em Contas' â€” mesmo problema de vÃ­rgula/NaN
- **Categoria:** entrada-dado · **Arquivo:** `src/app/(dashboard)/adiantamentos/[id]/editar/page.tsx:82`
- **Problema:** page.tsx:82-83: `parseFloat(f.valor_prestado_contas)` sem normalizaÃ§Ã£o de vÃ­rgula. Mesma vulnerabilidade do campo valor.
- **Sugestao:** Aplicar `f.valor_prestado_contas.replace(',', '.')` antes do parseFloat.

### [/clientes/novo] Erro ao salvar contatos (contatosError)
- **Categoria:** guardrail · **Arquivo:** `src/app/(dashboard)/clientes/novo/page.tsx:128`
- **Problema:** Se o insert de contatos falhar (linha 128), o erro e apenas logado com console.warn e o usuario e redirecionado para /clientes normalmente. O usuario leigo nao tem como saber que os contatos nao foram salvos â€” perde dados silenciosamente.
- **Sugestao:** Trocar o console.warn por um alert ou setErr visivel na tela. O fluxo deve parar e avisar: 'Cliente salvo, mas houve erro ao salvar os contatos. Por favor, edite o cliente e tente novamente.'

### [/clientes/[id]/editar] Erros ao salvar contatos e locais de carregamento
- **Categoria:** guardrail · **Arquivo:** `src/app/(dashboard)/clientes/[id]/editar/page.tsx:176`
- **Problema:** Em onSubmit (linhas 176 e 190), erros no insert de contatos e de locais de carregamento sao tratados com console.warn e o usuario e redirecionado para /clientes sem aviso. Dados gravados no banco de forma incompleta e o usuario nao sabe.
- **Sugestao:** Exibir mensagem de erro visivel ao usuario (via setErr) quando o insert de contatos ou locais falhar, em vez de console.warn. Nao redirecionar se houve erro parcial.

### [/entregas] Card mobile â€” ausÃªncia do botÃ£o 'Receber' para pedidos concluÃ­dos nÃ£o pagos
- **Categoria:** affordance · **Arquivo:** `src/app/(dashboard)/entregas/page.tsx:588`
- **Problema:** O MobileCard do pedido (page.tsx linhas 588-613) nÃ£o expÃµe nenhuma aÃ§Ã£o de 'Receber' para pedidos concluÃ­dos e nÃ£o pagos. A funÃ§Ã£o sÃ³ existe na tabela desktop que fica oculta em 390px com classe `m-hide`. Dado crÃ­tico de negÃ³cio (marcar pagamento) completamente bloqueado no celular.
- **Sugestao:** Adicionar no `actions` do MobileCard, condicionalmente para `!pedido.pago && concluido`, um botÃ£o 'Receber' com confirmaÃ§Ã£o e indicador de loading, igual ao que existe na versÃ£o desktop.

### [/entregas/[id]/editar] Pago = 'true' sem data de pagamento â€” banco recebe dado inconsistente
- **Categoria:** guardrail · **Arquivo:** `src/app/(dashboard)/entregas/[id]/editar/page.tsx:89`
- **Problema:** O usuÃ¡rio pode selecionar 'Pago' no select (linha 277) e salvar sem preencher a data de pagamento (o campo sÃ³ aparece condicionalmente na linha 282, mas nÃ£o Ã© validado no handleSubmit, linha 89). O banco recebe `pago: true, data_pagamento: null`, criando inconsistÃªncia sem alertar o usuÃ¡rio.
- **Sugestao:** No `handleSubmit`, adicionar validaÃ§Ã£o: se `f.pago === 'true'` e `!f.data_pagamento`, exibir erro 'Preencha a data do pagamento' e trocar para aba financeiro antes de gravar.

### [/faturamento] BotÃ£o 'Baixar' de baixa rÃ¡pida do pedido
- **Categoria:** guardrail · **Arquivo:** `src/app/(dashboard)/faturamento/page.tsx:194-203`
- **Problema:** `baixarPedido` (linha 194) grava `pago: true` e `data_pagamento` diretamente no banco SEM pedir confirmaÃ§Ã£o. O gestor leigo pode clicar por acidente â€” o pedido Ã© marcado como pago sem reversÃ£o fÃ¡cil visÃ­vel na tela. NÃ£o hÃ¡ guard-rail nem aviso pÃ³s-aÃ§Ã£o de sucesso.
- **Sugestao:** Exibir modal de confirmaÃ§Ã£o ('Confirmar recebimento de R$ X para [cliente]?') antes de gravar. ApÃ³s a baixa, mostrar toast ou badge temporÃ¡rio de confirmaÃ§Ã£o.

### [/faturamento] Input de data de vencimento da parcela â€” salva no onChange
- **Categoria:** guardrail · **Arquivo:** `src/app/(dashboard)/faturamento/_components/FinanceiroPedido.tsx:379-385`
- **Problema:** A data Ã© gravada no banco a cada `onChange` do input type=date. No mobile, o date picker nativo gera mÃºltiplos onChange durante a seleÃ§Ã£o â€” sem debounce, podem ocorrer N gravaÃ§Ãµes Supabase consecutivas para uma Ãºnica seleÃ§Ã£o de data.
- **Sugestao:** Mudar para estado local com commit no onBlur (mesmo padrÃ£o do campo valor), ou adicionar debounce de 800ms antes de chamar atualizarParcela.

### [/financeiro] confirmarBaixa no APagarTab â€” tabela nÃ£o reconhecida passa sem aviso
- **Categoria:** guardrail · **Arquivo:** `src/app/(dashboard)/financeiro/_components/APagarTab.tsx:87-105`
- **Problema:** Se a tabela de origem nÃ£o for 'abastecimentos', 'manutencoes' ou 'despesas_avulsas', `confirmarBaixa` termina sem gravar e sem informar o usuÃ¡rio (nenhum else final nas linhas 94-100). O modal fecha se nÃ£o houver erro, mas nada foi gravado â€” o gestor acha que pagou quando nÃ£o pagou.
- **Sugestao:** Adicionar else final que exibe mensagem de erro clara ('Este tipo de lanÃ§amento nÃ£o pode ser baixado por aqui') e nÃ£o fecha o modal sem confirmaÃ§Ã£o real de gravaÃ§Ã£o.

### [/pedidos/novo] handleSalvarLocaisNoCadastro â€” insert de locais avulsos
- **Categoria:** guardrail · **Arquivo:** `src/app/(dashboard)/pedidos/novo/page.tsx:295`
- **Problema:** O insert em locais_carregamento (linha 295) nÃ£o captura o retorno de erro: const { error } nÃ£o Ã© desestruturado e nenhum setErr Ã© chamado. Se o banco rejeitar, o usuÃ¡rio Ã© redirecionado normalmente sem saber que os locais nÃ£o foram salvos.
- **Sugestao:** Capturar o retorno do insert (const { error } = await supabase.from('locais_carregamento').insert(...)) e exibir Alert de erro antes de redirecionar se error existir.

### [/pedidos/[id]/editar] BotÃ£o 'Desvincular' entrega
- **Categoria:** guardrail · **Arquivo:** `src/app/(dashboard)/pedidos/[id]/editar/page.tsx:455`
- **Problema:** O botÃ£o 'Desvincular' (linha 455) executa imediatamente ao toque: faz update no banco (pedido_id: null) e altera o estado local sem nenhuma confirmaÃ§Ã£o prÃ©via nem feedback de loading. No mobile o usuÃ¡rio leigo pode desvincular uma entrega por acidente e o banco Ã© alterado antes de ele perceber.
- **Sugestao:** Adicionar window.confirm ou modal de confirmaÃ§Ã£o ('Deseja desvincular esta entrega do pedido?') antes do await supabase.update, e um estado de loading por entrega para desabilitar o botÃ£o durante a operaÃ§Ã£o.

### [/autorizacoes] funcao patch() â€” erro silencioso na matriz desktop
- **Categoria:** guardrail · **Arquivo:** `src/app/(dashboard)/autorizacoes/page.tsx:70`
- **Problema:** A funcao patch() (linha 70-72) faz update otimista: atualiza o estado local ANTES de confirmar com o banco e nao exibe nenhum feedback de erro ao usuario caso a operacao falhe. Se o Supabase retornar erro (RLS, rede), o estado visual ja mudou mas o banco nao gravou â€” e o usuario nao e avisado.
- **Sugestao:** Verificar o retorno do `supabase.update()` dentro de patch() e, em caso de erro, reverter o estado local e exibir um alert/toast com a mensagem de falha. O padrao de reverter ja existe em toggle() (linhas 53-63) mas patch() nao tem essa protecao.

## ALTO (55)

### [/abastecimentos] MobileList â€” estado de loading nÃ£o exibe nenhuma indicaÃ§Ã£o ao usuÃ¡rio
- **Categoria:** loading · **Arquivo:** `src/app/(dashboard)/abastecimentos/page.tsx:321`
- **Problema:** Quando `loading=true`, o bloco `MobileList` renderiza `null` para os cards (page.tsx:321: `loading ? null : linhas.map(...)`), sem spinner ou texto 'Carregando...'. O usuÃ¡rio leigo vÃª a tela vazia sem entender o que estÃ¡ acontecendo.
- **Sugestao:** Dentro do MobileList, quando loading=true, renderizar um card esqueleto ou texto 'Carregando abastecimentos...' centralizado, idÃªntico ao que a tabela desktop jÃ¡ faz (linha 269).

### [/abastecimentos/novo] BotÃµes 'Cancelar' e 'Salvar' duplicados na PageHeader e no rodapÃ© do formulÃ¡rio
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/abastecimentos/novo/page.tsx:86`
- **Problema:** HÃ¡ dois conjuntos de botÃµes de aÃ§Ã£o: um no PageHeader (linhas 89-94) e outro no rodapÃ© do formulÃ¡rio (linhas 148-150). No mobile o PageHeader tem espaÃ§o reduzido e com 3 botÃµes ('â† Voltar', 'Cancelar', 'Salvar') + UserProfile, o header vai transbordar ou comprimir os botÃµes abaixo do alvo mÃ­nimo. NÃ£o hÃ¡ height mÃ­nimo explÃ­cito no PageHeader para mobile.
- **Sugestao:** No mobile, ocultar os botÃµes do PageHeader (usando m-hide no actions) e manter apenas o rodapÃ©. Ou remover a duplicaÃ§Ã£o e deixar sÃ³ o rodapÃ© fixo/sticky. O botÃ£o 'Voltar' no header pode ser mantido isolado.

### [/abastecimentos/[id]/editar] BotÃµes duplicados no PageHeader e rodapÃ© â€” mesmo problema do /novo
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/abastecimentos/[id]/editar/page.tsx:113`
- **Problema:** Mesmo padrÃ£o de page.tsx novo: 3 botÃµes no header (linhas 114-119) e 2 botÃµes no rodapÃ© (linhas 184-187). No mobile o header com tÃ­tulo + 3 botÃµes + UserProfile estoura os 390px.
- **Sugestao:** Mesma soluÃ§Ã£o: ocultar actions do PageHeader no mobile (m-hide) e depender apenas do rodapÃ© do formulÃ¡rio.

### [/adiantamentos] MobileList â€” estado de loading sem indicaÃ§Ã£o ao usuÃ¡rio
- **Categoria:** loading · **Arquivo:** `src/app/(dashboard)/adiantamentos/page.tsx:415`
- **Problema:** page.tsx:415: `loading ? null : linhas.map(...)`. Igual ao problema de abastecimentos â€” tela vazia sem feedback durante o carregamento.
- **Sugestao:** Mostrar skeleton cards ou mensagem 'Carregando adiantamentos...' quando loading=true dentro do MobileList.

### [/adiantamentos/novo] BotÃµes duplicados no PageHeader e rodapÃ©
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/adiantamentos/novo/page.tsx:75`
- **Problema:** TrÃªs botÃµes no header actions (page.tsx:76-82: Voltar, Cancelar, Salvar) e dois no rodapÃ© (157-159: Cancelar, Salvar Adiantamento). No mobile 390px com tÃ­tulo 'Novo Adiantamento' + 3 botÃµes + UserProfile o header comprime ou transborda.
- **Sugestao:** Ocultar o bloco actions do PageHeader no mobile (m-hide) e manter somente o rodapÃ© fixo do formulÃ¡rio.

### [/adiantamentos/[id]/editar] MudanÃ§a de status para 'recusado' ou 'prestado' sem confirmaÃ§Ã£o
- **Categoria:** guardrail · **Arquivo:** `src/app/(dashboard)/adiantamentos/[id]/editar/page.tsx:67`
- **Problema:** Alterar o status de um adiantamento para 'recusado' ou 'prestado' Ã© uma aÃ§Ã£o financeira relevante â€” o motorista perde o direito ao valor ou encerra a prestaÃ§Ã£o de contas. O handleSubmit (page.tsx:67-90) nÃ£o solicita nenhuma confirmaÃ§Ã£o antes de gravar. O leigo pode mudar o status por engano e confirmar sem saber o que fez.
- **Sugestao:** Antes do `setSaving(true)`, verificar se o status mudou para 'recusado' ou 'prestado' e exibir um `confirm()` ou modal: 'VocÃª estÃ¡ marcando este adiantamento como [status]. Esta aÃ§Ã£o afeta o acerto do motorista. Confirmar?'

### [/adiantamentos/[id]/editar] BotÃµes duplicados no PageHeader e rodapÃ©
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/adiantamentos/[id]/editar/page.tsx:107`
- **Problema:** Mesmo padrÃ£o: 3 botÃµes no header (page.tsx:108-115) e 2 no rodapÃ© (220-223). No mobile o header transborda.
- **Sugestao:** Ocultar actions do PageHeader no mobile com m-hide, manter apenas o rodapÃ©.

### [/clientes/novo] Botao Salvar Cliente no PageHeader
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/clientes/novo/page.tsx:141`
- **Problema:** O botao Salvar no PageHeader usa o componente Btn com size='sm', que tem padding '4px 12px' e font-size '11px'. No mobile o m-touch garante min-height 44px, mas a classe m-touch so e aplicada ao componente Btn via className automatico. Porem o Btn do PageHeader vive dentro de page-header-actions em um flex com gap 8px e o header nao tem classe m-page-header, entao no mobile ele fica comprimido horizontalmente ao lado do UserProfile sem espaco suficiente â€” alvo real de toque e menor que 44px de largura.
- **Sugestao:** Usar size='md' para botoes de acao no PageHeader em formularios, ou aplicar minWidth:'44px' no wrapper de acoes do PageHeader para garantir alvo de toque adequado.

### [/usuarios/novo] Botao Salvar fora do form (form='user-form') no PageHeader ausente
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/usuarios/novo/page.tsx:37`
- **Problema:** O PageHeader (linha 37) nao tem botao de Salvar â€” so tem o botao Cancelar. O unico botao de salvar fica no rodape do formulario (linha 142). Em mobile, o rodape pode ficar fora da viewport se o usuario estiver com o teclado virtual aberto ou em tela pequena, tornando impossivel salvar sem fechar o teclado e rolar.
- **Sugestao:** Adicionar o botao 'Salvar Usuario' tambem no PageHeader (actions prop), espelhando o padrao das outras telas de formulario do projeto.

### [/usuarios/[id]/editar] Botao Salvar fora do form no PageHeader ausente
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/usuarios/[id]/editar/page.tsx:68`
- **Problema:** O PageHeader (linha 68) so tem o botao Cancelar. O botao de salvar esta apenas no rodape (linha 181). Em mobile, o rodape fica soterrado pelo teclado virtual ou fora da viewport apos preencher campos, obrigando o usuario a fechar o teclado e rolar para baixo para salvar.
- **Sugestao:** Adicionar o botao 'Atualizar Usuario' tambem no PageHeader (actions prop), igual ao padrao dos formularios de clientes e empresas.

### [/empresas] MobileList sem barra de busca mobile
- **Categoria:** navegacao · **Arquivo:** `src/app/(dashboard)/empresas/page.tsx:92`
- **Problema:** A pagina /empresas nao tem a div com classe m-show-block para exibir a SearchInput no mobile (presente em /clientes e /usuarios). A busca da toolbar desktop fica oculta no mobile (dentro de m-hide) e nenhuma outra busca aparece. O usuario mobile nao tem como filtrar empresas.
- **Sugestao:** Adicionar bloco de toolbar mobile (m-show-block) com SearchInput antes do MobileList, igual ao padrao de /clientes (linhas 98-112) e /usuarios (linhas 122-138).

### [/perfil] Campo 'Senha Atual' declarado mas nunca usado
- **Categoria:** guardrail · **Arquivo:** `src/app/(dashboard)/perfil/page.tsx:9`
- **Problema:** A variavel _senhaAtual (linha 9) e o setter setSenhaAtual (linha 54 â€” limpa o campo no reset) existem, mas nao ha campo visivel de 'Senha Atual' no formulario. A troca de senha via supabase.auth.updateUser() nao verifica a senha atual â€” qualquer um que abra a tela de perfil pode trocar a senha sem confirmar a identidade. Para usuario leigo isso e risco real (acesso nao autorizado se alguem pega o celular desbloqueado).
- **Sugestao:** Adicionar campo visivel de 'Senha Atual' (type='password') e validar via supabase.auth.signInWithPassword antes de chamar updateUser, garantindo que apenas quem conhece a senha atual pode troca-la.

### [/despacho] MobileList â€” estado de loading ausente
- **Categoria:** loading · **Arquivo:** `src/app/(dashboard)/despacho/page.tsx:196`
- **Problema:** Quando `loading === true`, a MobileList (page.tsx linha 196) renderiza `null` como children. O MobileList (mobile/index.tsx linha 174) detecta `items.length === 0` e exibe 'Nenhum pedido lancado ainda.' mesmo durante o carregamento. O usuario leigo ve o estado vazio desde o primeiro render, sem nenhum indicador de que dados estao sendo buscados.
- **Sugestao:** Renderizar um indicador explicito quando loading: `loading ? <div style={{textAlign:'center', padding:'40px', color:'#94a3b8'}}>Carregando...</div> : filtrados.map(...)` dentro do MobileList, ou passar a prop loading ao MobileList e tratar la.

### [/despacho] ModalDespacho â€” botao Confirmar sem spinner visual (prop loading ausente)
- **Categoria:** loading · **Arquivo:** `src/app/(dashboard)/despacho/_components/ModalDespacho.tsx:157`
- **Problema:** Em ModalDespacho.tsx linha 157, o botao de confirmar usa o componente Btn com `disabled={saving}` e texto condicional 'Despachando...', mas NAO passa `loading={saving}`. O Btn so exibe o BtnSpinner quando a prop `loading` e `true` (ds.tsx linha 84). O usuario ve o botao desabilitado com texto diferente mas sem o spinner â€” feedback insuficiente para o leigo saber que a acao esta em andamento.
- **Sugestao:** Adicionar `loading={saving}` ao Btn: `<Btn ... loading={saving} disabled={saving || !veiculoId || !motoristaId}>`. O BtnSpinner aparecera automaticamente.

### [/despacho/[id]] Botoes das abas 'Principal / Rota / Mapa' â€” alvo de toque abaixo de 44px
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/despacho/[id]/page.tsx:333`
- **Problema:** Em page.tsx linha 333-351, as abas sao `<button>` com `padding: '6px 16px'` e `fontSize: '13px'`. Nao ha classe m-touch nem minHeight 44px. A altura efetiva e ~26-30px. Alvos abaixo de 44px em mobile causam cliques errados, especialmente para o usuario leigo que pode ativar a aba errada ou nao ativar nada.
- **Sugestao:** Adicionar `minHeight: '44px'` ao style de cada botao de aba, ou substituir pelo componente `Tabs` do ds.tsx (ds.tsx linha 483) que ja aplica `minHeight: '44px'`.

### [/despacho/[id]] FluxoStepper â€” botao de acao primaria sem spinner durante updatingStatus
- **Categoria:** loading · **Arquivo:** `src/app/(dashboard)/despacho/[id]/_components/FluxoStepper.tsx:79`
- **Problema:** Em FluxoStepper.tsx linha 79, o Btn recebe `disabled={acao.disabled}` (que mapeia `updatingStatus === true`) mas NAO recebe `loading={acao.disabled}`. O usuario clica 'Iniciar Pedido' ou 'Concluir Pedido' e o botao fica desabilitado sem spinner â€” o leigo nao sabe se o sistema esta processando, podendo recarregar a pagina e disparar o status errado.
- **Sugestao:** Adicionar campo `loading?: boolean` ao tipo da prop `acao` e passar `loading={acao.loading ?? acao.disabled}` ao Btn. Em AbaPrincipal.tsx, incluir `loading: updatingStatus` na definicao de `proximaAcao`.

### [/despacho/[id]] Botao 'x' de remover local de carregamento â€” alvo de toque de ~12px
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/despacho/[id]/_components/AbaPrincipal.tsx:125`
- **Problema:** Em AbaPrincipal.tsx linha 125-130, o botao de remover local e um `<button>` cru com `style={{ padding: 0, fontSize: '12px' }}`. O alvo de toque efetivo e o tamanho do caractere 'x' (~12x12px). Em um celular, esse botao e praticamente impossivel de acertar precisamente, causando cliques errados nos elementos vizinhos.
- **Sugestao:** Adicionar `style={{ padding: '8px', minHeight: '44px', minWidth: '44px' }}` ao botao de remover, ou substituir pelo componente ActionBtn do ds.tsx (que ja tem a classe m-touch-grow para expandir ate 44px no mobile).

### [/entregas] Links 'Ver' e 'Editar' na coluna de AÃ§Ãµes da tabela desktop
- **Categoria:** affordance · **Arquivo:** `src/app/(dashboard)/entregas/page.tsx:560`
- **Problema:** Os links 'Ver' e 'Editar' sÃ£o renderizados como `<a>` com `style={{ color: ..., textDecoration: 'none', fontWeight: 600 }}` sem fundo, sem borda, sem nenhum indicador visual de botÃ£o. Para um leigo, parece texto destacado em azul/cinza, nÃ£o um controle clicÃ¡vel. EvidÃªncia: page.tsx linhas 560-561.
- **Sugestao:** Substituir pelos componentes `<Btn>` ou `<ActionBtn>` do design system, que tÃªm fundo, borda e alvo de toque garantido via classe m-touch.

### [/entregas] BotÃ£o 'Receber' na coluna de AÃ§Ãµes da tabela desktop
- **Categoria:** affordance · **Arquivo:** `src/app/(dashboard)/entregas/page.tsx:563`
- **Problema:** O botÃ£o 'Receber' usa `background: 'none', border: 'none'` â€” aparÃªncia de texto verde, sem indicador visual de botÃ£o (page.tsx linha 571). AlÃ©m disso, durante o loading mostra apenas '...' sem spinner nem texto descritivo, fazendo o leigo nÃ£o entender o que estÃ¡ acontecendo.
- **Sugestao:** Usar `<Btn variant='outline'>` com cor de sucesso e exibir 'Recebendo...' com spinner quando `loadingPago.has(pedido.id)` for verdadeiro.

### [/entregas] MobileList â€” loading state ausente durante carga inicial
- **Categoria:** loading · **Arquivo:** `src/app/(dashboard)/entregas/page.tsx:588`
- **Problema:** Enquanto `loading === true`, a MobileList simplesmente nÃ£o renderiza nada (page.tsx linha 588: `loading ? null : linhas.map(...)`). O usuÃ¡rio vÃª a tela vazia sem spinner nem texto 'Carregando...', podendo achar que nÃ£o hÃ¡ dados. Diferente da tabela desktop que exibe a mensagem de loading na cÃ©lula.
- **Sugestao:** Substituir `loading ? null` por um placeholder de loading (ex: 3 cards esqueleto ou `<div>Carregando pedidos...</div>`) dentro da MobileList.

### [/entregas] Toolbar mobile â€” filtros de perÃ­odo ausentes
- **Categoria:** navegacao · **Arquivo:** `src/app/(dashboard)/entregas/page.tsx:475`
- **Problema:** A toolbar desktop (classe `m-hide`) contÃ©m seletores de perÃ­odo e datas personalizadas (page.tsx linhas 422-440). A toolbar mobile (classe `m-show-block`, linhas 475-491) nÃ£o oferece nenhum filtro de perÃ­odo â€” o usuÃ¡rio mobile nÃ£o tem como filtrar por mÃªs/ano ao visualizar pagamentos.
- **Sugestao:** Adicionar Ã  toolbar mobile o seletor de perÃ­odo (ao menos 'MÃªs Atual'/'Ano Atual') quando `mostrarPagos` estÃ¡ ativo, para paridade de funcionalidade com desktop.

### [/entregas/[id]] Tabela de Entregas â€” colunas Origem e Destino sem truncate
- **Categoria:** tabela · **Arquivo:** `src/app/(dashboard)/entregas/[id]/page.tsx:234`
- **Problema:** As colunas 'Origem' e 'Destino' (page.tsx linhas 234-235) sÃ£o endereÃ§os completos. Sem `maxWidth`, `overflow: hidden` ou `textOverflow: ellipsis`, cada cÃ©lula expande e quebra o layout, criando linhas de mÃºltiplas alturas e desalinhamento horizontal.
- **Sugestao:** Limitar as colunas Origem/Destino com `maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'` e usar `title={e.origem}` para mostrar o valor completo no hover.

### [/entregas/[id]/editar] Select 'Status' â€” mudanÃ§a para 'Cancelado' sem confirmaÃ§Ã£o
- **Categoria:** guardrail · **Arquivo:** `src/app/(dashboard)/entregas/[id]/editar/page.tsx:166`
- **Problema:** O select de status (editar/page.tsx linha 166) permite mudar para 'Cancelado' diretamente. Um clique acidental em mobile pode cancelar um pedido em andamento silenciosamente, pois a mudanÃ§a Ã© gravada no submit sem diÃ¡logo intermediÃ¡rio.
- **Sugestao:** No `handleSubmit`, verificar se `f.status === 'cancelado'` e o status original era diferente, exibindo confirm() antes de prosseguir.

### [/entregas/[id]/editar] KM Final menor que KM Inicial â€” sem bloqueio no submit
- **Categoria:** guardrail · **Arquivo:** `src/app/(dashboard)/entregas/[id]/editar/page.tsx:99`
- **Problema:** O campo KM Final exibe feedback visual quando km_final > km_inicial (linha 219-222), mas nÃ£o valida o caso inverso: o usuÃ¡rio pode informar km_final menor que km_inicial e o dado Ã© gravado no banco sem erro. O handleSubmit (linha 101) nÃ£o verifica essa relaÃ§Ã£o.
- **Sugestao:** No `handleSubmit`, verificar se `f.km_final && parseFloat(f.km_final) < parseFloat(f.km_inicial)` e exibir erro: 'KM Final nÃ£o pode ser menor que KM Inicial'.

### [/faturamento] Grid de 4 KPIs (Valor Total, Recebido, Em Aberto, Em Atraso)
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/faturamento/page.tsx:256`
- **Problema:** O grid usa `gridTemplateColumns: 'repeat(4, 1fr)'` fixo via inline style. A classe `m-kpi-grid` colapsa para 2x2 no mobile via CSS, mas o inline style tem especificidade maior e sobrescreve a regra da classe â€” em 390px os 4 cards ficam espremidos numa Ãºnica linha com valores monetÃ¡rios quebrando em mÃºltiplas linhas dentro de cada cÃ©lula de ~90px.
- **Sugestao:** Remover o `gridTemplateColumns` do inline style e deixar apenas a classe `m-kpi-grid` controlar o grid. O CSS da classe jÃ¡ trata 2x2 no mobile.

### [/faturamento] BotÃ£o 'Baixar' â€” janela de duplo clique antes do setBaixando
- **Categoria:** loading · **Arquivo:** `src/app/(dashboard)/faturamento/page.tsx:194-203`
- **Problema:** Entre o click e o `setBaixando(pedidoId)` hÃ¡ a resoluÃ§Ã£o de Promises assÃ­ncronas; nesse intervalo o disabled ainda nÃ£o estÃ¡ ativo, permitindo duplo clique que dispara duas gravaÃ§Ãµes no banco.
- **Sugestao:** Usar useRef com flag sÃ­ncrona antes do primeiro await para bloquear re-entrada imediata; ou o modal de confirmaÃ§Ã£o jÃ¡ resolve, pois fecha antes de reabrir.

### [/faturamento] BotÃ£o 'estornar' de parcela paga no FinanceiroPedido
- **Categoria:** affordance · **Arquivo:** `src/app/(dashboard)/faturamento/_components/FinanceiroPedido.tsx:391-396`
- **Problema:** Ã‰ um `<button>` com `background: none, border: none, color: #64748b` sem indicaÃ§Ã£o visual de que Ã© clicÃ¡vel â€” parece legenda de texto. NÃ£o hÃ¡ confirmaÃ§Ã£o antes do estorno (aÃ§Ã£o financeira sem guard-rail).
- **Sugestao:** Substituir por Btn variant='outline' size='xs' com rÃ³tulo 'Estornar' separado e adicionar modal de confirmaÃ§Ã£o antes de chamar atualizarParcela com pago:false.

### [/faturamento] Input de valor da parcela â€” salva no onBlur sem indicador de loading
- **Categoria:** loading · **Arquivo:** `src/app/(dashboard)/faturamento/_components/FinanceiroPedido.tsx:373-377`
- **Problema:** O valor Ã© salvo automaticamente ao perder foco (`onBlur`). No mobile, fechar o teclado numÃ©rico dispara onBlur silenciosamente. NÃ£o hÃ¡ indicador de loading durante o salvamento â€” `salvando` fica true mas nenhum spinner ou texto Ã© exibido no campo ou prÃ³ximo a ele.
- **Sugestao:** Exibir borda azul + 'Salvando...' prÃ³ximo ao campo enquanto salvando=true; ou adicionar botÃ£o explÃ­cito 'Salvar' ao lado do input em vez de depender de onBlur silencioso.

### [/financeiro] MobileCard do FluxoTab â€” eventos individuais do dia ocultos
- **Categoria:** tabela · **Arquivo:** `src/app/(dashboard)/financeiro/_components/FluxoTab.tsx:291-311`
- **Problema:** No mobile, cada dia vira um Ãºnico MobileCard com apenas 4 totais (Entradas, SaÃ­das, Saldo Dia, Acumulado). Os lanÃ§amentos individuais (descriÃ§Ã£o, categoria, se estÃ¡ pago ou atrasado) ficam completamente ocultos â€” o gestor nÃ£o consegue ver qual conta estÃ¡ atrasada ou o que compÃµe o dia.
- **Sugestao:** Expandir o MobileCard para listar os eventos individuais como sub-itens abaixo dos totais, ou adicionar botÃ£o 'Ver lanÃ§amentos' que expande a lista de EventoFinanceiro do dia.

### [/financeiro] toggleAtivo em RecorrenciasTab â€” sem loading e sem confirmaÃ§Ã£o
- **Categoria:** loading · **Arquivo:** `src/app/(dashboard)/financeiro/_components/RecorrenciasTab.tsx:168-172`
- **Problema:** `toggleAtivo` grava diretamente no banco sem estado de loading, sem disabled durante a gravaÃ§Ã£o e sem confirmaÃ§Ã£o. O gestor pode clicar 'Desativar' duas vezes em sequÃªncia â€” a segunda chamada inverte de volta para ativo. NÃ£o hÃ¡ spinner nem mensagem de sucesso apÃ³s a aÃ§Ã£o.
- **Sugestao:** Adicionar estado de loading por id (como salvandoId em AvulsasTab) e desabilitar o botÃ£o durante a chamada. Exibir mensagem de sucesso pÃ³s-aÃ§Ã£o.

### [/] LembretesWidget â€” botao 'Ciente' no widget principal
- **Categoria:** affordance · **Arquivo:** `src/components/dashboard/LembretesWidget.tsx:469`
- **Problema:** O botao 'Ciente' no widget principal (linha 469-481 de LembretesWidget.tsx) nao tem minHeight 44px definido â€” usa apenas padding: '6px 12px', resultando em ~32px de altura. A classe m-touch nao esta aplicada nesse botao; a classe m-touch-grow tambem nao esta. Leigo no celular erra o toque facilmente.
- **Sugestao:** Adicionar minHeight: '44px' ao style do botao Ciente do widget principal, igualando ao botao equivalente no HistoricoModal (linha 297) que ja tem minHeight: '44px'.

### [/] Link 'Ver todos' na secao Pedidos Recentes
- **Categoria:** affordance · **Arquivo:** `src/app/(dashboard)/page.tsx:322`
- **Problema:** O link 'Ver todos â†’' (linha 322 de page.tsx) tem fontSize '11px' e nenhum padding/minHeight explicito â€” o alvo de toque resultante e de aproximadamente 16px de altura, muito abaixo dos 44px recomendados pelo Apple HIG. Nao usa classe m-touch nem minHeight:44px.
- **Sugestao:** Envolver o Link em um elemento com padding vertical suficiente ou adicionar style={{ minHeight:'44px', display:'inline-flex', alignItems:'center' }} para garantir alvo de toque adequado no celular.

### [/] Botao 'Fechar' (X) do HistoricoModal â€” alvo de toque pequeno
- **Categoria:** affordance · **Arquivo:** `src/components/dashboard/LembretesWidget.tsx:255`
- **Problema:** O botao de fechar no HistoricoModal (LembretesWidget.tsx linha 255-259) tem fontSize '20px' mas nenhum width, height, padding ou minHeight explicitosfora do lineHeight. O alvo de toque resultante e ~24px â€” abaixo dos 44px minimos para mobile.
- **Sugestao:** Adicionar width: '44px', height: '44px' e display: 'flex', alignItems: 'center', justifyContent: 'center' ao botao X do HistoricoModal, garantindo alvo de toque adequado.

### [/pedidos] DeleteBtn â€” feedback de loading durante exclusao
- **Categoria:** loading · **Arquivo:** `src/components/ui/DeleteBtn.tsx:43`
- **Problema:** Durante a exclusao o botao exibe apenas '...' (tres pontos). Nao ha spinner nem texto descritivo. O usuario leigo pode nao perceber que algo esta acontecendo e tentar clicar novamente. O botao fica `disabled` mas a mudanca visual e minima.
- **Sugestao:** Substituir '...' por 'Excluindo...' ou usar o BtnSpinner do design system para feedback visual claro durante a operacao async.

### [/pedidos/novo] BotÃ£o "Criar Pedido" (submit)
- **Categoria:** loading · **Arquivo:** `src/app/(dashboard)/pedidos/novo/page.tsx:284`
- **Problema:** saving fica true para sempre no caminho sem locais avulsos: router.push Ã© chamado (linha 284) sem setSaving(false) antes. Se o redirect demorar ou falhar, o botÃ£o permanece travado em 'Criando pedido...' sem nenhum recovery para o usuÃ¡rio.
- **Sugestao:** Adicionar setSaving(false) antes do router.push no bloco else da linha 283, ou usar try/finally { setSaving(false) } cobrindo todo o handleSubmit.

### [/pedidos/novo-avancado] BotÃ£o 'AvanÃ§ar para Entregas' â€” step 1
- **Categoria:** loading · **Arquivo:** `src/app/(dashboard)/pedidos/novo-avancado/page.tsx:372`
- **Problema:** Durante handleMotoristaNext (consulta async Ã  tabela alocacoes), o botÃ£o recebe disabled={checkingVeiculo} mas NÃƒO recebe loading={true} nem muda o rÃ³tulo. O usuÃ¡rio leigo vÃª o botÃ£o desabilitar sem nenhum spinner ou texto de espera durante a consulta.
- **Sugestao:** Passar loading={checkingVeiculo} no Btn e alterar o rÃ³tulo para {checkingVeiculo ? 'Verificando...' : 'AvanÃ§ar para Entregas â†’'} para que o spinner apareÃ§a durante a busca de alocaÃ§Ã£o.

### [/pedidos/novo-avancado] handleSubmit â€” setSaving nunca volta para false no caminho de sucesso
- **Categoria:** loading · **Arquivo:** `src/app/(dashboard)/pedidos/novo-avancado/page.tsx:305`
- **Problema:** ApÃ³s o insert do pedido e o update das entregas, o fluxo termina com router.push (linha 305) sem nenhum setSaving(false). Se o redirect falhar ou demorar, o botÃ£o 'Gerando Pedido...' fica travado indefinidamente sem possibilidade de retry.
- **Sugestao:** Envolver o bloco de submit em try/finally com finally { setSaving(false) } para garantir reset mesmo em caso de falha no redirect.

### [/pedidos/[id]/editar] handleSubmit â€” setSaving nunca volta para false no caminho de sucesso
- **Categoria:** loading · **Arquivo:** `src/app/(dashboard)/pedidos/[id]/editar/page.tsx:225`
- **Problema:** ApÃ³s todas as operaÃ§Ãµes de update, o fluxo termina com router.push (linha 225) sem setSaving(false). Se o redirect falhar, o botÃ£o 'Atualizar Pedido' fica permanentemente desabilitado.
- **Sugestao:** Adicionar finally { setSaving(false) } ao bloco de submit ou chamar setSaving(false) antes do router.push.

### [/pedidos/importar] EtapaSelecionarPedido â€” confirming nunca volta para false
- **Categoria:** loading · **Arquivo:** `src/app/(dashboard)/pedidos/importar/_components/EtapaSelecionarPedido.tsx:36`
- **Problema:** Em EtapaSelecionarPedido (linha 36), handleConfirmar seta confirming=true e chama onConfirmar() que Ã© sÃ­ncrona (apenas seta estado e muda etapa). O confirming fica true para sempre, desabilitando o botÃ£o e exibindo 'Carregando...' mesmo apÃ³s a etapa mudar. Se o usuÃ¡rio quiser voltar, o botÃ£o de confirmar estarÃ¡ sempre desabilitado.
- **Sugestao:** Como confirmarSelecaoPedido Ã© sÃ­ncrona, remover o estado confirming local ou chamar setConfirming(false) apÃ³s onConfirmar(). Alternativamente, usar o carregandoPedido do hook pai para mostrar o estado de loading real.

### [/autorizacoes/empresas] toggle() â€” update do banco sem feedback de erro para o usuario
- **Categoria:** guardrail · **Arquivo:** `src/app/(dashboard)/autorizacoes/empresas/page.tsx:47`
- **Problema:** A funcao toggle (linha 47) reverte o estado local em caso de erro do banco, mas nao exibe nenhuma mensagem visivel para o usuario. O checkbox volta para o estado anterior silenciosamente â€” o usuario leigo nao entende por que o toggle 'nao funcionou' e vai clicar varias vezes.
- **Sugestao:** Apos o revert do estado local (setVinc), exibir um toast ou alert com a mensagem de erro do banco, para que o usuario saiba que a operacao falhou.

### [/autorizacoes] Botoes Ativo/Anotar/permissao na variante desktop (funcao flag())
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/autorizacoes/page.tsx:395`
- **Problema:** A funcao flag() em autorizacoes/page.tsx:395-397 renderiza botoes de 22x22px no desktop. No mobile a variante e substituida por cards, mas nao existe protecao CSS m-touch-grow nesses botoes â€” eles sao renderizados somente no m-hide. O problema real e que a tabela desktop (m-hide) ainda e renderizada no DOM para todos os viewports; em telas intermediarias (768-900px), os botoes de 22px dao toque abaixo do minimo de 44px e nao tem nenhuma classe m-touch.
- **Sugestao:** Substituir a funcao flag() por botoes com minWidth/minHeight 44px ou aplicar a classe m-touch. Exemplo: adicionar `className="m-touch"` e ajustar o estilo para nao restringir os 22x22px absolutos.

### [/regras/[id]/dados] Botao remover campo (x) na tabela de escrita
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/regras/[id]/dados/page.tsx:492`
- **Problema:** O botao de remover campo na tabela de escrita (linha 495-498) tem `padding: '0 4px'` e sem minHeight/minWidth â€” resultando em aproximadamente 15x24px, muito abaixo dos 44px de alvo. Nao ha classe m-touch. Numa tela small esse botao e essencialmente impossivel de acertar sem zoom.
- **Sugestao:** Adicionar `minWidth: 44, minHeight: 44` ao estilo do botao, ou envolver em um container com esse tamanho minimo e centralizar o icone x dentro dele.

### [/regras/[id]/dados] Tabela de escrita (colunas Rotulo, Pergunta com width fixo 160/240px)
- **Categoria:** tabela · **Arquivo:** `src/app/(dashboard)/regras/[id]/dados/page.tsx:390`
- **Problema:** Os inputs de 'Rotulo amigavel' (width:160) e 'Pergunta do bot' (width:240) dentro da tabela de escrita (linhas 438, 481) forcam a tabela a ter largura minima de ~700px. No mobile (390px) a secao 'Escrita â€” campos esperados' nao tem variante em cards nem overflow-x:auto â€” a tabela vai estourar a largura ou ser cortada de forma inutilizavel.
- **Sugestao:** Envolver a tabela de escrita em um container com `overflowX:'auto'` ou â€” melhor â€” criar uma variante mobile em lista vertical (um campo por linha em vez de colunas), ja que a tela e tipicamente usada por admins no desktop mas pode ser acessada em tablet.

### [/regras/[id]/dados] Logica 'salvar mesmo assim' sem indicacao clara pro usuario
- **Categoria:** guardrail · **Arquivo:** `src/app/(dashboard)/regras/[id]/dados/page.tsx:179`
- **Problema:** O mecanismo de duplo-clique (avisoValidacaoTs + SALVAR_MESMO_ASSIM_MS=10s) para ignorar avisos de validacao (linhas 162-188) e completamente invisivel para o usuario: ele ve 'âš ï¸ Problemas: ...' mas o texto 'Clique Salvar novamente para gravar mesmo assim' aparece embutido no mesmo span, sem instrucao separada. Um leigo nao entende que precisa clicar de novo dentro de 10 segundos para forcar o save.
- **Sugestao:** Quando houver aviso de validacao pendente, mostrar um segundo botao explicitamente rotulado 'Salvar mesmo assim' visivel e separado, em vez de depender de um segundo clique no mesmo botao em janela de 10s.

### [/roteirizacao] Inputs de Latitude e Longitude â€” entrada de coordenadas brutas
- **Categoria:** entrada-dado · **Arquivo:** `src/app/(dashboard)/roteirizacao/page.tsx:251`
- **Problema:** O formulario pede 'Origem â€” Latitude *' e 'Origem â€” Longitude *' como inputs numericos (linhas 253-275). Um usuario leigo (gestor nao tecnico) nao sabe o que e latitude/longitude nem como obter esses valores. Embora exista o botao 'Usar minha localizacao', ele falha silenciosamente em ambientes sem HTTPS ou quando a permissao e negada â€” e o erro exibido e tecnico ('Falha ao pegar localizacao: ...'). Nao ha instrucao de como preencher manualmente.
- **Sugestao:** Para o usuario leigo, o fluxo ideal seria apenas o botao 'Usar minha localizacao' como caminho primario e ocultar os campos lat/lng atras de um 'avancado'. Quando a geolocalizacao falha, exibir mensagem amigavel como 'Nao foi possivel pegar sua localizacao. Verifique as permissoes do navegador.' em vez de repassar o erro tecnico.

### [/motoristas] MobileCard de motoristas sem aÃ§Ã£o de excluir
- **Categoria:** navegacao · **Arquivo:** `src/app/(dashboard)/motoristas/page.tsx:198`
- **Problema:** O DeleteBtn de excluir motorista fica dentro de .m-hide (tabela desktop apenas). O MobileCard de motoristas nÃ£o tem prop actions, entÃ£o no celular o usuÃ¡rio nÃ£o consegue excluir um motorista de jeito nenhum.
- **Sugestao:** Adicionar actions={<DeleteBtn id={m.id} table='motoristas' label='motorista'/>} ao MobileCard de motoristas.

### [/veiculos] MobileCard de veÃ­culos sem aÃ§Ã£o de excluir
- **Categoria:** navegacao · **Arquivo:** `src/app/(dashboard)/veiculos/page.tsx:387`
- **Problema:** Igual ao de motoristas: exclusÃ£o de veÃ­culo sÃ³ existe na tabela desktop (.m-hide). O MobileCard de veÃ­culos nÃ£o tem nenhuma aÃ§Ã£o de exclusÃ£o.
- **Sugestao:** Adicionar actions={<DeleteBtn id={v.id} table='veiculos' label='veÃ­culo'/>} ao MobileCard de veÃ­culos.

### [/veiculos/[id]/editar] botÃ£o 'Atualizar' no PageHeader e botÃ£o submit no rodapÃ© da aba dados
- **Categoria:** guardrail · **Arquivo:** `src/app/(dashboard)/veiculos/[id]/editar/page.tsx:153`
- **Problema:** Existem dois disparadores de submit simultÃ¢neos: o botÃ£o type='button' com onClick={handleSubmit} no header (linha 153) e o <Btn type='submit'> no rodapÃ© do form (linha 376). Clicar no header enquanto o foco estÃ¡ no formulÃ¡rio pode disparar ambos sem proteÃ§Ã£o, potencialmente enviando duas requisiÃ§Ãµes ao Supabase.
- **Sugestao:** Unificar em um Ãºnico ponto de submit via formRef.current.requestSubmit(), ou remover o botÃ£o duplicado do rodapÃ© dentro da aba dados.

### [/veiculos/[id]/editar] AvariasTab â€” tabela sem variante mobile
- **Categoria:** tabela · **Arquivo:** `src/app/(dashboard)/veiculos/[id]/editar/_components/AvariasTab.tsx:131`
- **Problema:** AvariasTab exibe DataTable sem envolver em .m-hide e sem MobileList/MobileCard. Em 390px a tabela com colunas Data/DescriÃ§Ã£o/Motorista/UrgÃªncia/Status/Resolvida vai estourar ou ficar ilegÃ­vel. A coluna DescriÃ§Ã£o tem maxWidth:320px e whiteSpace:normal quebrando linhas e desalinhando as demais.
- **Sugestao:** Envolver a DataTable em <div className='m-hide'> e adicionar MobileList com MobileCard para cada avaria, como jÃ¡ feito em ManutencoesTab e LogsTab.

### [/veiculos/[id]/editar] AvariasTab â€” botÃ£o excluir avaria com alvo de toque insuficiente
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/veiculos/[id]/editar/_components/AvariasTab.tsx:171`
- **Problema:** O botÃ£o de exclusÃ£o (ðŸ—‘) na tabela tem padding:0, background:transparent, sem classe m-touch. Alvo de toque estimado ~20px, abaixo dos 44px. A tabela aparece no mobile por nÃ£o estar em .m-hide.
- **Sugestao:** Adicionar style={{ minHeight:'44px', minWidth:'44px', padding:'0 8px' }} ao botÃ£o de excluir avaria.

### [/veiculos/[id]/editar] PlanoTab â€” checkbox de ativaÃ§Ã£o com alvo de toque insuficiente no mobile card
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/veiculos/[id]/editar/_components/PlanoTab.tsx:239`
- **Problema:** No MobileCard do PlanoTab, o campo 'Ativo' Ã© um <input type='checkbox'> com width:18px, height:18px. Alvo de toque Ã© apenas 18x18px, bem abaixo de 44px.
- **Sugestao:** Envolver o checkbox em um <label> com padding suficiente (minHeight:44px, display:flex, alignItems:center) ou usar um toggle switch com alvo maior.

### [/motoristas/[id]/editar] botÃ£o 'Atualizar' no PageHeader visÃ­vel nas abas Acerto e VeÃ­culo
- **Categoria:** guardrail · **Arquivo:** `src/app/(dashboard)/motoristas/[id]/editar/page.tsx:157`
- **Problema:** O botÃ£o type='submit' no PageHeader Ã© sempre visÃ­vel em qualquer aba. Na aba 'acerto', clicar 'Atualizar' dispara o handleSubmit e salva dados do motorista enquanto o usuÃ¡rio estÃ¡ trabalhando no fechamento financeiro do mÃªs, o que Ã© inesperado e confuso.
- **Sugestao:** Condicionar a renderizaÃ§Ã£o do botÃ£o Atualizar no header: {tab !== 'veiculo' && tab !== 'acerto' && <Btn type='submit'...>}.

### [/motoristas/[id]/editar] AcertoMensalTab â€” botÃ£o 'Excluir' de ajuste sem alvo de toque e sem confirmaÃ§Ã£o
- **Categoria:** guardrail · **Arquivo:** `src/app/(dashboard)/motoristas/[id]/editar/_components/AcertoMensalTab.tsx:445`
- **Problema:** BotÃ£o 'Excluir' ajuste (linha 445) tem fontSize:12px e sem padding/tamanho mÃ­nimo â€” alvo ~16px de altura. AlÃ©m disso, remover um ajuste do acerto financeiro nÃ£o exige confirmaÃ§Ã£o â€” clique acidental impacta o cÃ¡lculo salarial do motorista.
- **Sugestao:** Adicionar minHeight:'44px', padding:'0 8px' ao botÃ£o e adicionar confirm() antes de remover o ajuste.

### [/motoristas/novo] validaÃ§Ã£o de campos obrigatÃ³rios em abas ocultas
- **Categoria:** guardrail · **Arquivo:** `src/app/(dashboard)/motoristas/novo/page.tsx:40`
- **Problema:** O handleSubmit (linha 40) exige CNH nÃºmero e Validade CNH, que ficam na aba 'cnh' oculta (display:none). Se o usuÃ¡rio tenta salvar na aba 'dados', o erro aparece ('Preencha CNH e Validade') mas os campos problemÃ¡ticos nÃ£o estÃ£o visÃ­veis. O leigo nÃ£o sabe onde ir.
- **Sugestao:** Ao detectar erro em campo da aba 'cnh', chamar setTab('cnh') automaticamente antes de exibir o erro. Adicionar badge vermelho na aba com campos invÃ¡lidos.

### [/motoristas/[id]/editar] validaÃ§Ã£o de campos obrigatÃ³rios em abas ocultas
- **Categoria:** guardrail · **Arquivo:** `src/app/(dashboard)/motoristas/[id]/editar/page.tsx:109`
- **Problema:** Mesmo problema do /motoristas/novo: handleSubmit (linha 109) valida cnh_numero e cnh_validade que estÃ£o na aba 'cnh'. Se o usuÃ¡rio estÃ¡ em outra aba e clica 'Atualizar' no header, o erro aparece mas a aba nÃ£o muda.
- **Sugestao:** Navegar automaticamente para a aba 'cnh' ao detectar erro em cnh_numero ou cnh_validade, e para 'dados' ao detectar erro em nome/cpf/whatsapp.

## MEDIO (77)

### [/abastecimentos] Link 'Editar' na coluna AÃ§Ãµes da tabela desktop
- **Categoria:** affordance · **Arquivo:** `src/app/(dashboard)/abastecimentos/page.tsx:307`
- **Problema:** O link de ediÃ§Ã£o Ã© renderizado como <a> com estilo de texto puro (color:#2563eb, sem fundo, sem borda, sem padding de botÃ£o). Para um leigo parece texto clicÃ¡vel, nÃ£o uma aÃ§Ã£o. EvidÃªncia: abastecimentos/page.tsx:307 â€” `<a href={...} style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 600, fontSize: 'inherit' }}>Editar</a>`.
- **Sugestao:** Substituir o <a> bruto por <Btn href={...} variant='outline' size='xs'>Editar</Btn>, que jÃ¡ tem fundo/borda visÃ­veis e respeita o alvo de toque m-touch.

### [/abastecimentos/novo] Grid de 4 colunas na seÃ§Ã£o 'Dados do Abastecimento'
- **Categoria:** entrada-dado · **Arquivo:** `src/app/(dashboard)/abastecimentos/novo/page.tsx:134`
- **Problema:** O grid usa `gridTemplateColumns: 'repeat(4, 1fr)'` (page.tsx:126). A classe m-grid colapsa para 1 coluna no mobile. O item 'Posto' usa `gridColumn: 'span 2'` (linha 139), mas mobile.css:60-65 reseta todo span para 1 no .m-grid, portanto ocupa 1 coluna â€” comportamento correto. PorÃ©m o campo KM (`type='number'`) e Litros/Valor nÃ£o tÃªm `inputMode` diferenciado para o tipo certo no iOS: KM deveria ser `inputMode='numeric'` (jÃ¡ estÃ¡), mas Valor Total e Valor por Litro tÃªm `inputMode='decimal'` com `type='number'` que no iOS Safari exibe teclado numÃ©rico sem vÃ­rgula de forma inconsistente.
- **Sugestao:** Para campos monetÃ¡rios (valor_litro, valor_total) usar `type='text'` com `inputMode='decimal'` e pattern='[0-9]*[.,]?[0-9]*' para garantir o teclado decimal correto no iOS. Ou adicionar mÃ¡scara de moeda para facilitar entrada do leigo.

### [/abastecimentos/[id]/editar] Checkbox 'Confirmado' â€” alvo de toque 16Ã—16px
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/abastecimentos/[id]/editar/page.tsx:175`
- **Problema:** O checkbox nativo usa `style={{ width: '16px', height: '16px' }}` (editar/page.tsx:175). Embora o label wrapper tenha `minHeight: '44px'`, o elemento interativo registrado pelo browser Ã© o checkbox de 16Ã—16px, que Ã© o real alvo de toque no iOS. Um usuÃ¡rio leigo com dedo grande pode errar facilmente.
- **Sugestao:** Aumentar o checkbox para `width: '20px', height: '20px'` ou substituir por um toggle visual customizado maior. O label wrapper jÃ¡ estÃ¡ correto com minHeight 44px â€” verificar se o padding estÃ¡ distribuÃ­do para que o toque em toda a Ã¡rea acione o checkbox.

### [/adiantamentos] Link 'Editar' na coluna AÃ§Ãµes da tabela desktop
- **Categoria:** affordance · **Arquivo:** `src/app/(dashboard)/adiantamentos/page.tsx:388`
- **Problema:** Mesmo padrÃ£o da tela de abastecimentos: <a> estilo texto puro (page.tsx:388 â€” `style={{ color: '#2563eb', textDecoration: 'none', fontWeight: 600 }}`). Sem fundo ou borda, parece texto para o leigo.
- **Sugestao:** Substituir por <Btn href={...} variant='outline' size='xs'>Editar</Btn>.

### [/adiantamentos] BotÃ£o 'Carregar mais' no mobile â€” dentro de m-show-block mas sem debounce/proteÃ§Ã£o contra duplo toque
- **Categoria:** loading · **Arquivo:** `src/app/(dashboard)/adiantamentos/page.tsx:282`
- **Problema:** O handler `handleCarregarMais` (page.tsx:282-285) verifica `!loadingMais` antes de chamar buscarPagina, o que Ã© correto. Mas o Btn com `disabled={loadingMais}` usa classe m-touch que garante 44px â€” esse detalhe estÃ¡ OK. O problema Ã© que o botÃ£o exibe 'Carregando...' mas o texto anterior '(X de Y)' some, e no mobile um toque rÃ¡pido enquanto o estado ainda nÃ£o atualizou pode disparar duas chamadas. loadingMais Ã© setado de forma assÃ­ncrona dentro de buscarPagina (linha 176: `if (append) setLoadingMais(true)`), havendo uma janela de race condition antes do re-render desabilitar o botÃ£o.
- **Sugestao:** Usar uma ref booleana de bloqueio sÃ­ncrono (`const carregandoRef = useRef(false)`) verificada antes do setState, eliminando a janela de race entre dois toques rÃ¡pidos. O mesmo padrÃ£o vale para abastecimentos/page.tsx:349.

### [/adiantamentos/novo] Status inicial 'pendente' editÃ¡vel no formulÃ¡rio de novo adiantamento
- **Categoria:** guardrail · **Arquivo:** `src/app/(dashboard)/adiantamentos/novo/page.tsx:124`
- **Problema:** O formulÃ¡rio permite criar um adiantamento jÃ¡ como 'aprovado', 'recusado' ou 'prestado' (page.tsx:125-130). Criar direto como 'recusado' ou 'prestado' sem que o adiantamento tenha existido como 'pendente' pode poluir o histÃ³rico. NÃ£o hÃ¡ guard-rail nem confirmaÃ§Ã£o quando o status selecionado nÃ£o Ã© 'pendente'. O usuÃ¡rio leigo pode selecionar o status errado sem perceber.
- **Sugestao:** Exibir aviso inline (Alert info) quando o usuÃ¡rio selecionar status diferente de 'pendente' ao criar: 'VocÃª estÃ¡ criando um adiantamento jÃ¡ como [status]. Tem certeza?' Ou simplificar o novo para aceitar apenas 'pendente'/'aprovado', deixando 'recusado'/'prestado' sÃ³ na ediÃ§Ã£o.

### [/adiantamentos/[id]/editar] Campo condicional 'Motivo da Recusa' â€” textarea sem validaÃ§Ã£o obrigatÃ³ria quando status=recusado
- **Categoria:** guardrail · **Arquivo:** `src/app/(dashboard)/adiantamentos/[id]/editar/page.tsx:81`
- **Problema:** Quando `f.status === 'recusado'` aparece o campo 'Motivo da Recusa' (page.tsx:187-199), mas ele nÃ£o Ã© obrigatÃ³rio â€” o handleSubmit salva `recusa_motivo: f.recusa_motivo || null` sem exigir preenchimento. Um adiantamento recusado sem motivo nÃ£o explica ao motorista o porquÃª.
- **Sugestao:** Quando status='recusado', exigir recusa_motivo nÃ£o vazio: `if (f.status === 'recusado' && !f.recusa_motivo.trim()) { setErr('Informe o motivo da recusa'); return; }`

### [/clientes/[id]/editar] IMaskInput para CNPJ/CPF na aba de edicao
- **Categoria:** entrada-dado · **Arquivo:** `src/app/(dashboard)/clientes/[id]/editar/page.tsx:248`
- **Problema:** O campo IMaskInput de CNPJ/CPF (linha 248) nao exibe o valor pre-carregado do banco ao abrir a tela. O value e undefined (linhas 249-251 mostram um hack com value={undefined}) â€” o usuario ve o campo vazio ao editar o documento, mas o valor real esta no estado interno do react-hook-form. Se ele salvar sem re-digitar o campo, o documento continua correto pois o register nao e afetado; porem visualmente parece em branco, o que confunde o leigo.
- **Sugestao:** Usar um estado local para o valor exibido do CNPJ/CPF e inicializa-lo no reset, assim o IMaskInput recebe o value correto e exibe o documento formatado ao abrir a tela.

### [/clientes/[id]/editar] Botao remover contato (Trash2)
- **Categoria:** guardrail · **Arquivo:** `src/app/(dashboard)/clientes/[id]/editar/page.tsx:350`
- **Problema:** O botao de remover contato (linha 350) nao tem confirmacao. Um clique acidental apaga um contato sem aviso â€” nao e uma operacao gravada no banco imediatamente (so ao submeter), mas o usuario leigo pode nao perceber que perdeu um contato da lista.
- **Sugestao:** Adicionar um confirm() antes de chamar remove(index), ou exibir um badge 'a ser removido' com opcao de desfazer.

### [/empresas/novo] Header com tres botoes: Voltar, Cancelar e Salvar
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/empresas/novo/page.tsx:80`
- **Problema:** O PageHeader tem tres botoes (linha 80-88): 'Voltar para Lista' (ghost), 'Cancelar' (outline) e 'Salvar' (primary). Em mobile, os tres botoes ficam empilhados na area de acoes e apertam o titulo, podendo estouro de largura em 390px. Alem disso 'Voltar para Lista' e 'Cancelar' fazem a mesma coisa, duplicando opcoes e confundindo o usuario leigo.
- **Sugestao:** Remover o botao 'Voltar para Lista' (redundante com Cancelar). Manter apenas Cancelar e Salvar no header, igual ao padrao de /clientes/novo.

### [/empresas/[id]/editar] Header com tres botoes: Voltar, Cancelar e Salvar
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/empresas/[id]/editar/page.tsx:263`
- **Problema:** O PageHeader tem tres botoes (linhas 263-269): 'Voltar para Lista' (ghost), 'Cancelar' (outline) e 'Atualizar' (primary). Mesma redundancia e problema de layout mobile do /empresas/novo.
- **Sugestao:** Remover o botao 'Voltar para Lista' e manter apenas Cancelar e Atualizar Empresa.

### [/empresas/[id]/editar] Secao WhatsApp â€” botao Reconectar sem protecao de clique duplo
- **Categoria:** loading · **Arquivo:** `src/app/(dashboard)/empresas/[id]/editar/page.tsx:65`
- **Problema:** O botao 'Reconectar WhatsApp' (linha 143) usa loading={loading} para desabilitar durante o fetch, o que e correto. Porem ao clicar, o estado qr nao e limpo imediatamente antes do fetch comecar (setQr(null) na linha 68 esta correto). O problema real e que ao expirar o QR (60s), o botao volta para 'Reconectar WhatsApp' porem o loading ainda e false â€” um segundo clique durante o countdown pode disparar dois requests simultaneos se o usuario clicar enquanto loading e falso mas o polling ainda esta ativo.
- **Sugestao:** Desabilitar o botao tambem enquanto countdown > 0 e qr !== null, evitando novo request enquanto o QR atual ainda esta na tela.

### [/uso-apis] Pagina sem variante mobile (nao usa MobileCard/MobileList, layout fixo maxWidth 860px)
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/uso-apis/page.tsx:47`
- **Problema:** A pagina /uso-apis e um Server Component com layout de cards desktop (maxWidth:860, padding:24). Em mobile 390px o conteudo de cada card â€” o bloco de 72px de percentual ao lado do texto â€” pode ficar apertado, especialmente nos cards com nomes longos de API e dois links na mesma linha (flexWrap:wrap em linha 107 mitiga mas nao resolve completamente). Nao ha classe m-hide/m-show para variar o layout.
- **Sugestao:** Usar flexDirection:'column' no card quando em mobile (via m-stack ou media query inline), e reducao do bloco de percentual para ficar em linha separada do conteudo em telas pequenas.

### [/uso-apis] CadastroApiEditor â€” botao de edicao/cadastro sem minHeight para toque mobile
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/uso-apis/CadastroApiEditor.tsx:58`
- **Problema:** O botao 'Editar' / '+ Cadastrar' em CadastroApiEditor.tsx (linha 58) tem minHeight:36 e padding:'8px 12px'. No mobile o alvo minimo e 44px â€” esse botao nao atinge o requisito de toque seguro (36px < 44px) e nao usa a classe m-touch.
- **Sugestao:** Alterar minHeight para 44px ou adicionar a classe m-touch ao botao para garantir alvo de toque adequado no mobile.

### [/despacho] Botao FAB mobile 'Despachar N selecionado(s)'
- **Categoria:** affordance · **Arquivo:** `src/app/(dashboard)/despacho/page.tsx:214`
- **Problema:** O FAB em page.tsx linha 214 usa `<button>` cru com `className='m-fab mobile-only'`. A classe `m-fab` fixa `width: 56px; height: 56px` (mobile.css:74), mas o style inline sobrescreve com `width: 'auto'`, o que pode truncar o texto 'Despachar N' em 390px. Alem disso, o FAB nao tem `disabled` nem verifica o estado `saving` do modal, permitindo clicar de novo enquanto o modal de despacho ja esta aberto.
- **Sugestao:** Adicionar `disabled={modalAberto}` ao FAB para evitar re-abertura enquanto ja esta processando. Testar o texto em 390px com 3+ pedidos selecionados para garantir que nao transborda.

### [/despacho] Coluna 'Destinos' na tabela desktop â€” sem truncate
- **Categoria:** tabela · **Arquivo:** `src/app/(dashboard)/despacho/_components/LinhaDespacho.tsx:75`
- **Problema:** Em LinhaDespacho.tsx linha 75, a coluna Destinos tem `maxWidth: '240px'` no Td mas o `<span>` interno nao tem `overflow: hidden`, `textOverflow: 'ellipsis'` nem `whiteSpace: 'nowrap'`. O helper `resumoDestinos` pode gerar strings longas ('5 entregas Â· Jardim Botanico / Bela Vista +3') que quebram em multiplas linhas, desalinhando o restante da tabela.
- **Sugestao:** Adicionar ao `<span>` interno: `style={{ display:'block', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}`.

### [/despacho] Coluna 'Cliente' na tabela desktop â€” nome sem limite de largura
- **Categoria:** tabela · **Arquivo:** `src/app/(dashboard)/despacho/_components/LinhaDespacho.tsx:64`
- **Problema:** Em LinhaDespacho.tsx linha 64, o div do nome do cliente nao tem maxWidth, overflow nem textOverflow. Nomes longos como 'Distribuidora Agricola Sao Francisco Ltda' expandem a coluna e comprimem as demais, desalinhando toda a tabela.
- **Sugestao:** Adicionar ao Td da coluna Cliente `style={{ maxWidth: '180px' }}` e ao div do nome: `overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', title: cliente`.

### [/despacho] ModalDespacho â€” campo Motorista sem indicador visivel durante busca automatica
- **Categoria:** loading · **Arquivo:** `src/app/(dashboard)/despacho/_components/ModalDespacho.tsx:129`
- **Problema:** Em ModalDespacho.tsx linha 129, enquanto busca o motorista padrao, apenas o label muda para texto pequeno '(buscando padrao...)'. No mobile (modal fullscreen via m-modal-content), o select simplesmente trava sem spinner ou aviso proeminente. O usuario leigo pode entender que o sistema travou e fechar o modal.
- **Sugestao:** Adicionar abaixo do select de caminhao um indicador visivel quando `loadingMotorista === true`, ex.: linha com spinner SVG + texto 'Buscando motorista padrao...' em 13px.

### [/despacho/[id]] ConfirmStatusModal â€” botao de confirmacao com feedback '...' ilegivel
- **Categoria:** loading · **Arquivo:** `src/app/(dashboard)/despacho/[id]/_components/ConfirmStatusModal.tsx:103`
- **Problema:** Em ConfirmStatusModal.tsx linha 103-115, o botao de confirmar e um `<button>` cru. Quando `saving === true`, apenas muda cor para '#d1d5db' e texto para '...'. O ponto-ponto-ponto nao e um indicador inteligivel de processamento para o usuario leigo â€” e confuso e pode parecer que o sistema travou.
- **Sugestao:** Substituir o `<button>` cru pelo componente `Btn` com `loading={saving}` para exibir o BtnSpinner, ou adicionar um spinner SVG inline ao lado do texto durante o saving.

### [/despacho/[id]] LinhaCampos cols=4 â€” colapsa para 1 coluna no mobile perdendo agrupamento
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/despacho/[id]/_components/AbaPrincipal.tsx:98`
- **Problema:** Em AbaPrincipal.tsx linha 98, `<LinhaCampos cols={4}>` usa a classe `m-grid` (shared.tsx linha 28, cols>=3). O m-grid colapsa para `grid-template-columns: 1fr` no mobile (mobile.css linha 52), empilhando Cliente, NÂº do Pedido e Entregas em linhas separadas. Alem disso, mobile.css linha 60-64 reseta todos os spans para `span 1`, ignorando o `span={2}` do campo Cliente.
- **Sugestao:** Usar `<LinhaCampos cols={2}>` para que no mobile colapse para `m-grid-2` (2 colunas), preservando o par Cliente+Numero e o par Entregas visivel. Ou separar em dois LinhaCampos de cols=2.

### [/despacho/[id]] PageHeader â€” botoes 'Voltar' e 'Cancelar' lado a lado em mobile com titulo longo
- **Categoria:** guardrail · **Arquivo:** `src/app/(dashboard)/despacho/[id]/page.tsx:298`
- **Problema:** Em page.tsx linha 298-308, o PageHeader exibe titulo 'Pedido AAAA.SSSS â€” Nome do Cliente' com dois botoes na actions area (gap: 8px). Em 390px com um nome de cliente longo, o titulo sera truncado ou os botoes comprimidos. O botao 'Cancelar' (variant danger) fica adjacente ao 'Voltar', aumentando o risco de toque errado em um ato irreversivel (cancelar o pedido).
- **Sugestao:** Mover o botao 'Cancelar' para dentro da aba Principal junto com as acoes do FluxoStepper, mantendo o header apenas com o botao 'Voltar'. Isso separa visualmente a acao destrutiva das acoes de navegacao.

### [/entregas] KPI grid â€” valor de receita pode estorar a largura em 390px
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/entregas/page.tsx:464`
- **Problema:** O grid de KPIs usa `gridTemplateColumns: 'repeat(4, 1fr)'` com classe `m-kpi-grid` que colapsa para 2x2 no mobile (mobile.css linha 192). O KpiCard 'Receita Pendente' com valor 'R$ 12.340,00' em `fontSize: 16px` e sub-label 'Total Geral: R$ ...' em `10px` pode estorar os ~185px disponÃ­veis por coluna com valores de 6+ dÃ­gitos.
- **Sugestao:** No KpiCard, aplicar `wordBreak: 'break-all'` ou reduzir `fontSize` do valor para `13px` em mobile via classe. Alternativamente reordenar os KPIs para que receita ocupe coluna inteira.

### [/entregas] Tabela desktop â€” coluna 'VeÃ­culo' sem truncate
- **Categoria:** tabela · **Arquivo:** `src/app/(dashboard)/entregas/page.tsx:532`
- **Problema:** A cÃ©lula de veÃ­culo exibe `{veiculo?.placa}` seguido de `({veiculo.modelo})` em `<span>` sem nenhum `maxWidth`, `overflow: hidden` ou `textOverflow: ellipsis` (page.tsx linhas 532-534). Para modelos longos como 'Volkswagen Constellation 19.360' a cÃ©lula expande quebrando o alinhamento da tabela.
- **Sugestao:** Adicionar `maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'` no `<Td>` ou mover o modelo para um atributo `title` no elemento.

### [/entregas] Tabela desktop â€” coluna 'Motorista' sem truncate
- **Categoria:** tabela · **Arquivo:** `src/app/(dashboard)/entregas/page.tsx:535`
- **Problema:** A cÃ©lula do motorista (page.tsx linha 535) renderiza `{motorista?.nome ?? 'â€”'}` sem limitaÃ§Ã£o de largura. Nomes longos expandem a coluna desalinhando a tabela inteira.
- **Sugestao:** Adicionar `style={{ maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}` no `<Td>` do motorista.

### [/entregas/[id]] Tabela de Abastecimentos (7 colunas) â€” sem variante mobile
- **Categoria:** tabela · **Arquivo:** `src/app/(dashboard)/entregas/[id]/page.tsx:251`
- **Problema:** A tabela de abastecimentos (page.tsx linhas 251-287) tem 7 colunas. Envolve `overflowX: 'auto'`, mas em 390px o leigo nÃ£o percebe que hÃ¡ scroll horizontal e pode perder colunas importantes como Total ou Status.
- **Sugestao:** Criar variante em cards mobile para abastecimentos (classe m-hide na tabela, MobileCard com as informaÃ§Ãµes essenciais: data, total, litros, status) ou ao menos exibir um indicador visual de scroll.

### [/entregas/[id]] PageHeader com 3 botÃµes em 390px
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/entregas/[id]/page.tsx:154`
- **Problema:** O PageHeader da tela de detalhe (page.tsx linhas 154-158) empilha 3 botÃµes ('â† Voltar', 'Imprimir', 'Editar') mais o UserProfile. Em 390px com `flexShrink: 0` nos actions (ds.tsx linha 153), os botÃµes comprimem o tÃ­tulo ou sÃ£o cortados, pois `page-header-actions` nÃ£o tem `flexWrap`.
- **Sugestao:** Ocultar o botÃ£o 'â† Voltar' no mobile com classe `m-hide` e garantir `flexWrap: 'wrap'` nos actions do PageHeader.

### [/entregas/[id]] Abastecimentos â€” sem filtro de perÃ­odo do pedido, mistura dados de outros pedidos
- **Categoria:** guardrail · **Arquivo:** `src/app/(dashboard)/entregas/[id]/page.tsx:88`
- **Problema:** Os abastecimentos carregados (page.tsx linhas 88-94) buscam TODOS os abastecimentos do veÃ­culo sem filtro por perÃ­odo do pedido, apenas com `.limit(50)`. O leigo vÃª abastecimentos de pedidos anteriores misturados sem aviso, podendo tomar decisÃµes erradas sobre custos.
- **Sugestao:** Filtrar abastecimentos pelo intervalo de datas do pedido e/ou adicionar nota explicativa: 'Abastecimentos do veÃ­culo (todos os registros)'.

### [/entregas/novo] ValidaÃ§Ã£o de campos obrigatÃ³rios â€” redireciona para aba sem destacar o campo
- **Categoria:** guardrail · **Arquivo:** `src/app/(dashboard)/entregas/novo/page.tsx:73`
- **Problema:** Ao tentar salvar sem veÃ­culo/motorista, o cÃ³digo troca a aba e exibe Alert genÃ©rico 'Preencha: VeÃ­culo e Motorista' (page.tsx linha 75), mas o campo em si nÃ£o recebe destaque visual (borda vermelha, foco). O leigo vÃª a mensagem mas nÃ£o sabe onde exatamente estÃ¡ o problema.
- **Sugestao:** AlÃ©m do Alert, aplicar `border: '2px solid #ef4444'` nos selects invÃ¡lidos e usar `.focus()` no primeiro campo problemÃ¡tico.

### [/entregas/[id]/editar] BotÃµes 'Cancelar' no cabeÃ§alho e rodapÃ© â€” descartam alteraÃ§Ãµes sem aviso
- **Categoria:** guardrail · **Arquivo:** `src/app/(dashboard)/entregas/[id]/editar/page.tsx:138`
- **Problema:** Os botÃµes 'Cancelar' no PageHeader (linha 138) e no rodapÃ© (linha 298) sÃ£o `<Btn href='/entregas'>` que navegam imediatamente sem confirmaÃ§Ã£o. O leigo pode perder ediÃ§Ãµes ao tocar acidentalmente no mobile.
- **Sugestao:** Substituir `href` por `onClick` com `if (confirm('Descartar alteraÃ§Ãµes?')) router.push('/entregas')` para proteger o usuÃ¡rio de navegaÃ§Ã£o acidental.

### [/faturamento] Linha de pedido dentro do grupo de cliente expandido
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/faturamento/page.tsx:322-338`
- **Problema:** O container usa `flexWrap: 'wrap'` sem `width: 100%` forÃ§ado. Em mobile (390px) nÃºmero do pedido, data, valor, badges e botÃµes de aÃ§Ã£o ficam num flex-row que quebra em mÃºltiplas linhas sem alinhamento definido â€” o `marginLeft: 'auto'` dos botÃµes nÃ£o funciona quando o flex-wrap empurra para linhas distintas, fazendo os botÃµes flutuar Ã  esquerda misturados com os badges.
- **Sugestao:** Separar a linha de aÃ§Ãµes num bloco `width: 100%` abaixo dos metadados do pedido no mobile â€” usar m-stack ou breakpoint explÃ­cito para quebrar os botÃµes numa segunda linha com `justifyContent: flex-end`.

### [/faturamento] Campo 'Forma de pagamento' no FinanceiroPedido â€” texto livre
- **Categoria:** entrada-dado · **Arquivo:** `src/app/(dashboard)/faturamento/_components/FinanceiroPedido.tsx:285-287`
- **Problema:** Input `type='text'` livre com placeholder 'PIX, boleto, 30/60/90â€¦'. Permite variaÃ§Ãµes como 'pix', 'Pix', 'PIX', 'pix transferencia' sem normalizaÃ§Ã£o alÃ©m de trim â€” alimenta campo que deveria ser padronizado.
- **Sugestao:** Substituir por `<select>` com as mesmas opÃ§Ãµes de AvulsasTab (PIX, Dinheiro, CartÃ£o DÃ©bito, CartÃ£o CrÃ©dito, Boleto, TransferÃªncia) para garantir valor padronizado no banco.

### [/faturamento] BotÃ£o 'Remover parcelamento' â€” aparÃªncia de texto vermelho
- **Categoria:** affordance · **Arquivo:** `src/app/(dashboard)/faturamento/_components/FinanceiroPedido.tsx:347-349`
- **Problema:** `<button>` com `background: none, border: none, color: '#ef4444'` parece texto colorido, nÃ£o aÃ§Ã£o. Usa window.confirm() como guard-rail, que pode ser bloqueado silenciosamente em WebViews iOS.
- **Sugestao:** Substituir por Btn variant='danger' size='xs' e substituir window.confirm() por modal React inline para garantir funcionamento em todos os contextos mobile.

### [/financeiro] BotÃ£o 'editar' do saldo bancÃ¡rio no FluxoTab
- **Categoria:** affordance · **Arquivo:** `src/app/(dashboard)/financeiro/_components/FluxoTab.tsx:140-141`
- **Problema:** `<button>` com `background: transparent, border: none, textDecoration: 'underline', color: '#2563eb'` â€” parece link de texto. O alvo de toque tem apenas a dimensÃ£o do texto 'editar' (6 chars), provavelmente abaixo de 44px de altura no mobile.
- **Sugestao:** Substituir por Btn variant='outline' size='xs' com rÃ³tulo 'Editar saldo' para aparÃªncia de aÃ§Ã£o e atingir alvo de 44px via classe m-touch.

### [/financeiro] ActionBtn excluir em AvulsasTab e RecorrenciasTab â€” window.confirm()
- **Categoria:** guardrail · **Arquivo:** `src/app/(dashboard)/financeiro/_components/AvulsasTab.tsx:168`
- **Problema:** Ambos usam `window.confirm()` nativo (AvulsasTab linha 168, RecorrenciasTab linha 159). Em PWA/WebView no iOS o confirm() pode ser bloqueado ou retornar false silenciosamente, fazendo a exclusÃ£o nÃ£o funcionar sem qualquer mensagem de erro para o usuÃ¡rio.
- **Sugestao:** Substituir window.confirm() por modal React de confirmaÃ§Ã£o com mensagem descritiva do item que serÃ¡ excluÃ­do.

### [/financeiro] Campo 'Valor (R$)' nos modais de Despesas Avulsas e RecorrÃªncias â€” type=number sem inputMode
- **Categoria:** entrada-dado · **Arquivo:** `src/app/(dashboard)/financeiro/_components/AvulsasTab.tsx:353`
- **Problema:** Input `type='number'` sem `inputMode='decimal'`. No iOS exibe teclado numÃ©rico padrÃ£o em vez do teclado com vÃ­rgula decimal. O placeholder '0,00' usa vÃ­rgula mas o input espera ponto decimal â€” o leigo que digita '1.500,00' obtÃ©m parseFloat retornando NaN com mensagem genÃ©rica 'Preencha descriÃ§Ã£o e valor' sem indicar o formato correto.
- **Sugestao:** Adicionar `inputMode='decimal'` e corrigir placeholder para '0.00' ou implementar mÃ¡scara de moeda que converte vÃ­rgula para ponto antes do parseFloat.

### [/financeiro] Modal CRUD de AvulsasTab e RecorrenciasTab â€” sem classe m-modal-content
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/financeiro/_components/AvulsasTab.tsx:327-333`
- **Problema:** Os modais usam `className='m-modal-overlay'` no overlay mas o div interno nÃ£o tem `className='m-modal-content'`. O mobile.css define `.m-modal-content` para ocupar 100vw/100vh no mobile com safe-area. Sem a classe, o modal aparece como card centralizado de maxWidth 480px em tela de 390px sem as margens de safe-area e sem comportamento de bottom-sheet esperado no iPhone.
- **Sugestao:** Adicionar `className='m-modal-content'` ao div interno do modal em AvulsasTab (linha 333) e RecorrenciasTab (linha 318) para herdar o comportamento full-screen e safe-area.

### [/financeiro] Modal 'Confirmar Pagamento' no APagarTab â€” sem classe m-modal-content
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/financeiro/_components/APagarTab.tsx:259-263`
- **Problema:** O modal de baixa usa `className='m-modal-overlay'` no overlay mas o div interno nÃ£o tem `className='m-modal-content'`. No mobile o card pode esticar sem safe-area e sem comportamento de bottom-sheet.
- **Sugestao:** Adicionar `className='m-modal-content'` ao div interno (linha 263).

### [/] LembretesWidget â€” carregar() silencioso ao montar
- **Categoria:** loading · **Arquivo:** `src/components/dashboard/LembretesWidget.tsx:383`
- **Problema:** A funcao carregar() (linha 379-385) ignora silenciosamente erros de rede com '/* ignora */' no catch. Se a API /api/lembretes falhar, o widget exibe estado vazio sem nenhuma mensagem ao usuario â€” o leigo nao sabe se nao ha lembretes ou se houve falha. Nao ha estado de loading visivel enquanto os lembretes sao buscados na montagem inicial.
- **Sugestao:** Adicionar estado de loading (ex.: useState<boolean>(true)) e exibir 'Carregando lembretes...' durante o fetch inicial. No catch, exibir mensagem de erro em vez de ignorar silenciosamente.

### [/] HistoricoModal â€” fetch de historico sem tratamento de erro visivel
- **Categoria:** loading · **Arquivo:** `src/components/dashboard/LembretesWidget.tsx:207`
- **Problema:** No HistoricoModal (linha 205-209), o fetch de /api/lembretes?historico=true trata o erro apenas com setLoading(false) no catch â€” sem setar nenhuma mensagem de erro. Se a API falhar, o usuario ve uma lista vazia sem saber que houve falha de conexao.
- **Sugestao:** Adicionar estado de erro (useState<string>('')) e exibir mensagem explicativa no catch do HistoricoModal, como 'Nao foi possivel carregar o historico. Verifique sua conexao.'

### [/] CienteModal â€” sem padding-bottom seguro no mobile (safe-area-inset)
- **Categoria:** layout · **Arquivo:** `src/components/dashboard/LembretesWidget.tsx:154`
- **Problema:** O CienteModal (LembretesWidget.tsx linha 98-196) usa position:fixed com padding: '16px' fixo. Em iPhones com home bar (safe-area-inset-bottom), os botoes de acao na parte inferior do modal (linha 154) podem ficar parcialmente cobertos pela home bar do iOS, pois o modal nao aplica paddingBottom de env(safe-area-inset-bottom). O HistoricoModal (linha 242) aplica maxHeight com calc incluindo safe-area, mas o CienteModal nao tem essa preocupacao.
- **Sugestao:** Adicionar paddingBottom: 'max(20px, env(safe-area-inset-bottom))' ao container de botoes do CienteModal, ou ao proprio modal quando este for posicionado na parte inferior da tela.

### [/] Drawer do menu mobile â€” botao 'Sair' sem feedback de loading
- **Categoria:** loading · **Arquivo:** `src/components/layout/Sidebar.tsx:164`
- **Problema:** O botao 'Sair' no SidebarContent (Sidebar.tsx linha 248-271) chama handleSignOut() que e async (faz supabase.auth.signOut() + router.replace). Nao ha estado de loading nem desabilitacao do botao durante o processo â€” o leigo pode clicar varias vezes e disparar multiplos signOuts.
- **Sugestao:** Adicionar useState para loading no handleSignOut: desabilitar o botao e mudar o rotulo para 'Saindo...' enquanto a operacao esta em curso.

### [/] Secao 'Pedidos Recentes' mobile â€” nomes de motoristas longos sem truncate
- **Categoria:** tabela · **Arquivo:** `src/app/(dashboard)/page.tsx:374`
- **Problema:** Na variante mobile da tabela de pedidos recentes (page.tsx linha 360-385), os spans com nome do motorista ('{m.nome}') e placa nao tem maxWidth, overflow:hidden ou textOverflow:ellipsis. Com nomes como 'Francisco das Chagas Rodrigues', o span pode ocupar toda a largura disponivel, empurrando o valor monetario (alinhado a direita com flexShrink:0) para fora da linha.
- **Sugestao:** Adicionar overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' ao div que contem os spans de motorista e placa, ou aplicar maxWidth com truncate nos spans individuais.

### [/pedidos] DeleteBtn â€” botao Excluir na tabela desktop
- **Categoria:** affordance · **Arquivo:** `src/components/ui/DeleteBtn.tsx:31-46`
- **Problema:** O botao Excluir tem `background: none; border: none; padding: 0` â€” visualmente e texto vermelho puro sem borda ou fundo, identico a um hiperlink colorido. Nao parece um botao de acao. Pessoa leiga pode nao reconhecer que e clicavel e que dispara uma exclusao.
- **Sugestao:** Usar Btn variant='danger' size='xs' ou ao menos adicionar padding/borda/fundo para distinguir de texto puro.

### [/entregas] BotÃ£o 'Excluir' (DeleteBtn) na tabela desktop
- **Categoria:** affordance · **Arquivo:** `src/components/ui/DeleteBtn.tsx:31`
- **Problema:** DeleteBtn (DeleteBtn.tsx linha 31) renderiza `<button>` com `background: none, border: none, padding: 0` â€” aparÃªncia de texto vermelho simples, sem borda nem fundo. Durante loading mostra '...' apenas, sem texto ou spinner descritivo.
- **Sugestao:** Adicionar borda ou background ao estado normal e mostrar texto 'Excluindo...' no loading, ou usar `<ActionBtn variant='danger'>` do design system.

### [/abastecimentos] BotÃ£o 'Excluir' no DeleteBtn (coluna AÃ§Ãµes da tabela desktop)
- **Categoria:** affordance · **Arquivo:** `src/components/ui/DeleteBtn.tsx:31`
- **Problema:** O DeleteBtn (DeleteBtn.tsx:31-46) renderiza um <button> com background:'none', border:'none', padding:0 â€” visualmente idÃªntico a texto. Em estado loading mostra apenas '...', sem spinner nem texto descritivo. No mobile a tabela estÃ¡ oculta via m-hide, mas o botÃ£o ficaria com padding:0, abaixo do alvo mÃ­nimo de 44px caso a tabela apareÃ§a.
- **Sugestao:** Aplicar estilo de botÃ£o destrutivo (fundo vermelho leve ou borda vermelha). No estado loading trocar '...' por 'Excluindo...' com cursor wait. Em mobile o componente jÃ¡ fica coberto pelo m-hide da tabela, mas a correÃ§Ã£o visual beneficia o desktop.

### [/clientes] Botao 'Excluir' do DeleteBtn â€” sem indicador de loading visivel
- **Categoria:** loading · **Arquivo:** `src/components/ui/DeleteBtn.tsx:44`
- **Problema:** Durante a exclusao, o DeleteBtn exibe '...' no lugar de 'Excluir' (linha 44 de DeleteBtn.tsx), mas e um texto minusculo sem estilo de loading â€” parece que o botao travou. O usuario leigo pode clicar novamente por nao perceber que a acao esta em curso.
- **Sugestao:** Trocar o '...' por 'Excluindo...' e manter o botao disabled com cursor:wait, ou usar o spinner do Btn para sinalizar progresso de forma clara.

### [/usuarios] Botao 'Remover' do RemoverUsuarioBtn â€” sem indicador de loading visivel
- **Categoria:** loading · **Arquivo:** `src/components/ui/RemoverUsuarioBtn.tsx:32`
- **Problema:** Durante a remocao de usuario, o botao exibe '...' (RemoverUsuarioBtn.tsx linha 32) â€” texto minusculo sem feedback visual. O usuario leigo nao percebe que a acao esta em curso e pode clicar de novo.
- **Sugestao:** Trocar '...' por 'Removendo...' e manter disabled + cursor:wait durante o processamento.

### [/pedidos/novo] BotÃ£o 'Ã— Limpar seleÃ§Ã£o' de cliente (dentro do input)
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/pedidos/novo/page.tsx:381`
- **Problema:** BotÃ£o de limpar cliente Ã© um <button> com background:none, border:none sem width/height explÃ­citos â€” mede apenas o tamanho do caracter 'Ã—' em fontSize:18px, muito abaixo de 44px de alvo. No mobile dificulta muito o toque preciso.
- **Sugestao:** Aplicar width:44px e height:44px (ou classe m-touch) neste botÃ£o de limpeza interno para garantir alvo de toque adequado.

### [/pedidos/novo] Checkbox 'Cliente sem cadastro (avulso)'
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/pedidos/novo/page.tsx:344`
- **Problema:** O checkbox tem width:16px height:16px (linha 344), alvo de toque de 16px, muito abaixo de 44px. O label em volta tem cursor:pointer mas nÃ£o tem padding suficiente para compensar o alvo pequeno no mobile.
- **Sugestao:** Adicionar min-height:44px no elemento label que envolve o checkbox para ampliar a Ã¡rea clicÃ¡vel no mobile.

### [/pedidos/novo-avancado] BotÃ£o 'Trocar' veÃ­culo â€” step 3
- **Categoria:** affordance · **Arquivo:** `src/app/(dashboard)/pedidos/novo-avancado/page.tsx:492`
- **Problema:** O botÃ£o 'Trocar' (linha 492) usa background:none, border:none e textDecoration:underline â€” parece texto sublinhado comum, nÃ£o um botÃ£o. Para o leigo parece nota de rodapÃ©, nÃ£o aÃ§Ã£o clicÃ¡vel.
- **Sugestao:** Substituir pelo componente Btn variant='outline' size='xs' ou adicionar padding:8px 12px e borda visÃ­vel para que o elemento tenha aparÃªncia de botÃ£o, especialmente no mobile.

### [/pedidos/novo-avancado] Tabela de entregas disponÃ­veis â€” step 2, mobile
- **Categoria:** tabela · **Arquivo:** `src/app/(dashboard)/pedidos/novo-avancado/page.tsx:394`
- **Problema:** As colunas 'Cliente' e 'Coleta (Data)' ficam completamente ocultas no mobile via m-hide (linhas 394-395). No mobile o usuÃ¡rio vÃª sÃ³ a rota truncada sem o cliente nem a data â€” informaÃ§Ã£o crÃ­tica para selecionar as entregas corretas.
- **Sugestao:** No mobile, exibir o nome do cliente como segunda linha dentro da cÃ©lula 'Rota' (layout em coluna dentro do Td), em vez de esconder completamente com m-hide.

### [/pedidos/importar] BotÃµes 'Ver falhas' / 'Ocultar falhas' em EtapaUpload e EtapaPreview
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/pedidos/importar/_components/EtapaUpload.tsx:177`
- **Problema:** Os botÃµes de toggle de falhas (EtapaUpload linhas 177 e 281, EtapaPreview linha 122) usam background:none, border:none, font-size:12px sem padding â€” alvo de toque de aproximadamente 12px de altura, muito abaixo de 44px. No mobile o leigo nÃ£o consegue tocÃ¡-los com precisÃ£o.
- **Sugestao:** Adicionar padding:10px 8px a esses botÃµes ou usar o componente Btn variant='ghost' para garantir alvo de toque mÃ­nimo de 44px via classe m-touch.

### [/pedidos/importar] EtapaPreview â€” tabela com 4 colunas visÃ­veis no mobile pode causar scroll horizontal
- **Categoria:** tabela · **Arquivo:** `src/app/(dashboard)/pedidos/importar/_components/EtapaPreview.tsx:59`
- **Problema:** A DataTable de preview (linha 59) exibe checkbox, DestinatÃ¡rio, EndereÃ§o (maxWidth:280px) e Status em 390px. O endereÃ§o truncado e as outras colunas competem pela largura, podendo causar scroll horizontal indesejado nÃ£o sinalizado ao usuÃ¡rio.
- **Sugestao:** No mobile, empilhar DestinatÃ¡rio e EndereÃ§o em uma Ãºnica cÃ©lula em duas linhas para liberar espaÃ§o e evitar overflow horizontal na tabela.

### [/pedidos] KPI grid â€” label 'Em Andamento' em 390px
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/pedidos/page.tsx:308-313`
- **Problema:** O grid de KPIs usa `gridTemplateColumns: 'repeat(4, 1fr)'` inline e a classe m-kpi-grid colapsa para 2x2 no mobile, o que e correto. Porem em 390px cada card fica com aprox. 85px de largura (descontando padding e gap). O label 'Em Andamento' (11 chars em uppercase com letter-spacing) e o valor numerico em 16px podem quebrar para segunda linha no card mais estreito.
- **Sugestao:** Verificar no dispositivo real. Se necessario, encurtar o label para 'Andamento' ou reduzir o font-size do label dos KPIs no mobile.

### [/pedidos] Coluna 'Destinos' na tabela desktop â€” sem truncate CSS no texto
- **Categoria:** tabela · **Arquivo:** `src/app/(dashboard)/pedidos/page.tsx:372-374`
- **Problema:** A celula Td de Destinos usa `maxWidth: '240px'` mas o span interno nao tem `overflow: hidden`, `textOverflow: 'ellipsis'` nem `whiteSpace: 'nowrap'`. Textos longos de destino ainda podem quebrar em multiplas linhas e desalinhar as colunas da tabela.
- **Sugestao:** Adicionar `overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'` ao span interno da celula de Destinos.

### [/autorizacoes] Celulas de permissao na tabela desktop â€” botao COL=30px, ROW_H=26px
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/autorizacoes/page.tsx:32`
- **Problema:** As constantes COL=30 e ROW_H=26 (linha 32) determinam exatamente 30x26px para cada botao de ciclar permissao na tabela desktop. Nenhuma classe m-touch e aplicada. Em tablets com viewport 768-1024px a variante desktop (m-hide) some, mas em desktops pequenos esse alvo e inutilizavel com toque (trackpad touch, Surface). Abaixo do minimo de 44px.
- **Sugestao:** Aumentar ROW_H para pelo menos 44 ou usar padding vertical em vez de height fixo nas celulas, para que o botao se expanda ao alvo correto.

### [/autorizacoes] Link 'Empresas x Gestor' no cabecalho
- **Categoria:** affordance · **Arquivo:** `src/app/(dashboard)/autorizacoes/page.tsx:126`
- **Problema:** O elemento de navegacao para /autorizacoes/empresas e renderizado como uma tag `<a>` estilizada manualmente (linha 126) em vez de usar o componente Btn. O visual (borda, fundo azul-claro) funciona, mas em mobile o padding de '4px 10px' resulta em altura muito inferior a 44px â€” sem a classe m-touch.
- **Sugestao:** Substituir o `<a>` manual por `<Btn href="/autorizacoes/empresas" size="sm" variant="outline">` que ja carrega a classe m-touch automaticamente.

### [/autorizacoes] Modal de telefone â€” botao Cancelar nao tem protecao de loading
- **Categoria:** loading · **Arquivo:** `src/app/(dashboard)/autorizacoes/page.tsx:95`
- **Problema:** O botao Cancelar no modal de telefone (linha 369) usa `disabled={salvandoTel}` e impede fechar durante o save, mas se o save falhar com alert(), o modal fecha automaticamente via `setTelModal(null)` na linha 95 apenas no fluxo de novo. Em caso de erro, o modal nao limpa o campo e o usuario pode re-submeter; nao ha mensagem clara de 'tente novamente'.
- **Sugestao:** Ao falhar o insert, manter o modal aberto (nao chamar setSalvandoTel(false) + setTelModal(null)), mostrar o erro dentro do modal em vez de alert(), e nao fechar o modal automaticamente.

### [/regras] Link 'Editar' na coluna de acoes da tabela desktop
- **Categoria:** affordance · **Arquivo:** `src/app/(dashboard)/regras/page.tsx:143`
- **Problema:** O link 'Editar' na tabela desktop de regras (linha 143) e renderizado como `<a>` puro com `color: '#2563eb', fontWeight: 600` sem borda, fundo ou padding â€” parece texto colorido. Para um usuario leigo no celular (e mesmo no desktop) nao ha indicacao visual de que e um botao clicavel. A variante mobile usa MobileCard com href, o que esta correto, mas a tabela desktop permanece no DOM no range 768px+.
- **Sugestao:** Substituir o `<a>` manual por `<Btn href={...} size="xs" variant="outline">Editar</Btn>` para manter consistencia visual com o design system.

### [/regras/novo e /regras/[id]/editar] Checkboxes nativos do browser (Ativo, Exige confirmacao, Gatilho inicio, Quem pode usar)
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/regras/novo/page.tsx:80`
- **Problema:** Os checkboxes sao renderizados como `<input type="checkbox">` nativo sem nenhuma classe m-touch e sem padding extra no label. Em mobile iOS/Android o alvo de toque do checkbox nativo e tipicamente 16-20px. O label tem `display:flex, alignItems:center, gap:8px` â€” o que aumenta a area clicavel do label em si, mas o checkbox em si permanece pequeno. O criterio de 44px nao e satisfeito de forma garantida.
- **Sugestao:** Adicionar `style={{ width: 20, height: 20 }}` nos inputs checkbox e garantir que o label pai tenha `minHeight: 44px` para satisfazer o alvo de toque.

### [/regras/[id]/dados] Mensagem de validacao embutida no texto da instrucao (nao destacada)
- **Categoria:** guardrail · **Arquivo:** `src/app/(dashboard)/regras/[id]/dados/page.tsx:229`
- **Problema:** A mensagem de validacao/erro (estado msg) e exibida inline dentro do paragrafo de instrucoes no topo da pagina (linha 229), com apenas mudanca de cor e negrito. O usuario leigo nao percebe que ha uma advertencia importante (ex: 'âš ï¸ Problemas: tabela.coluna...'), pois nao ha destaque visual separado (box de alerta, borda colorida, posicionamento prominente).
- **Sugestao:** Extrair o `msg` para um componente Alert separado abaixo do cabecalho (usando o `<Alert variant='warning'>` ja existente no ds.tsx), independente do paragrafo de instrucoes.

### [/relatorios] KPI grid com 6 colunas â€” m-kpi-grid colapsa para 2x2 mas sao 6 cards
- **Categoria:** tabela · **Arquivo:** `src/app/(dashboard)/relatorios/page.tsx:317`
- **Problema:** O grid de KPIs usa `gridTemplateColumns: 'repeat(6, 1fr)'` (linha 317) e a classe m-kpi-grid que no mobile colapsa para `repeat(2, 1fr)`. Com 6 cards, no mobile ficam 3 linhas de 2 cards. Os KpiCard tem `fontSize: '16px'` para o valor e `fontSize: '10px'` para o label. Em 390px com 2 colunas e padding de 16px, cada card tera ~175px. O valor de 'Receita Total' formatado como BRL ('R$ 12.345,67') em 16px pode quebrar para 2 linhas dentro do card, desalinhando a grade.
- **Sugestao:** Reduzir o fontSize do valor do KpiCard para 14px ou usar `font-size: clamp(12px, 3vw, 16px)` para valores monetarios longos, ou adicionar `overflow:hidden; text-overflow:ellipsis; white-space:nowrap` no valor.

### [/relatorios] Filtro de periodo â€” modo 'Range livre' com dois inputs date em linha
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/relatorios/page.tsx:303`
- **Problema:** No modo 'range', dois inputs de data ficam em linha com `flex:1, minWidth:130px` (linhas 305-309). Em 390px com padding de 16px e a seta 'â†’' entre eles, o espaco disponivel e ~358px. Cada input com minWidth:130px + 'â†’' ocupa ~275px minimo + gaps, o que deve caber, mas o conjunto nao tem a classe m-stack, entao se o browser/sistema formatar o input de data com mais espaco, pode quebrar para linha unica. O texto 'Periodo:' e os botoes de modo ficam em `m-stack` (linha 267) sem classe m-grid, podendo empilhar erraticamente.
- **Sugestao:** Envolver os dois inputs de data em um div com `display:'flex', gap:8, flexWrap:'wrap'` e garantir que cada um tenha `minWidth:0, flex:1` para nao forcar overflow.

### [/roteirizacao] Campos de Latitude/Longitude preenchidos e validacao de '0,0'
- **Categoria:** guardrail · **Arquivo:** `src/app/(dashboard)/roteirizacao/page.tsx:177`
- **Problema:** A validacao (linha 177) rejeita lat/lng quando `lat === 0 || lng === 0`. Coordenada 0,0 e valida geograficamente (Golfo da Guine), mas o problema real e que este check nao valida ranges (-90/90, -180/180). A mensagem de erro tecnica 'Informe origem (lat e lng validos)' nao orienta o leigo.
- **Sugestao:** Validar faixas corretas (lat entre -90 e 90, lng entre -180 e 180) e exibir mensagem amigavel como 'Clique em Usar minha localizacao para preencher a origem automaticamente'.

### [/roteirizacao] Botao 'Otimizar agora' â€” sem protecao contra empresa_id vazio
- **Categoria:** guardrail · **Arquivo:** `src/app/(dashboard)/roteirizacao/page.tsx:280`
- **Problema:** Se o useEffect falhar ao buscar empresa_id (ex: usuario sem empresa vinculada), o estado `empresaId` fica vazio e o erro ja e exibido (linha 129). Mas o botao 'Otimizar agora' permanece habilitado â€” o usuario pode clicar e vai disparar o POST /api/routing/otimizar com `empresa_id: ''`, retornando um erro de API que sera exibido de forma tecnica.
- **Sugestao:** Desabilitar o botao 'Otimizar agora' quando `!empresaId`, e exibir um estado vazio explicativo ('Configure sua empresa primeiro em Configuracoes') em vez de deixar a tela parcialmente funcional.

### [/autorizacoes/empresas] Funcao toggle() â€” update otimista sem rollback em caso de erro de delete
- **Categoria:** guardrail · **Arquivo:** `src/app/(dashboard)/autorizacoes/empresas/page.tsx:52`
- **Problema:** Em toggle() (linhas 47-65), o delete do vinculo (quando `tinha === true`) ja remove do estado local antes do banco confirmar. Se o `supabase.delete()` retornar erro, o estado e revertido (linhas 53-55) â€” isso esta correto. Porem nao ha nenhum toast ou alerta informando o usuario que a operacao falhou. O visual volta ao estado anterior sem explicacao, o que para um leigo parece bug ou mal-funcionamento do botao.
- **Sugestao:** Apos o rollback, exibir uma mensagem de erro (alert ou toast) informando 'Nao foi possivel salvar. Tente novamente.' para que o usuario saiba que a acao nao foi gravada.

### [/veiculos] link 'Editar' na coluna AÃ§Ãµes da tabela desktop
- **Categoria:** affordance · **Arquivo:** `src/app/(dashboard)/veiculos/page.tsx:386`
- **Problema:** O link 'Editar' Ã© uma tag <a> com estilo de texto puro (color:#2563eb, textDecoration:none, sem fundo, sem borda, sem padding de botÃ£o). Para o leigo nÃ£o hÃ¡ diferenÃ§a visual entre texto e aÃ§Ã£o clicÃ¡vel.
- **Sugestao:** Substituir o <a> por <Btn href={...} size='xs' variant='outline'>Editar</Btn>, mantendo consistÃªncia com o rest do sistema.

### [/motoristas] link 'Editar' na coluna AÃ§Ãµes da tabela desktop
- **Categoria:** affordance · **Arquivo:** `src/app/(dashboard)/motoristas/page.tsx:197`
- **Problema:** Mesma situaÃ§Ã£o de /veiculos: o link 'Editar' Ã© um <a> com color:#2563eb e sem visual de botÃ£o (sem padding, borda ou fundo), parecendo texto comum.
- **Sugestao:** Substituir por <Btn href={...} size='xs' variant='outline'>Editar</Btn>.

### [/veiculos/novo] campo 'Ano' IMaskInput sem inputMode
- **Categoria:** entrada-dado · **Arquivo:** `src/app/(dashboard)/veiculos/novo/page.tsx:127`
- **Problema:** O IMaskInput do campo Ano usa mask='0000' mas nÃ£o declara inputMode='numeric'. No iOS isso abre teclado alfanumÃ©rico em vez de numÃ©rico, dificultando a entrada do leigo.
- **Sugestao:** Adicionar inputMode='numeric' ao IMaskInput do campo Ano.

### [/veiculos/[id]/editar] AvariasTab â€” mudanÃ§a de status de avaria sem confirmaÃ§Ã£o
- **Categoria:** guardrail · **Arquivo:** `src/app/(dashboard)/veiculos/[id]/editar/_components/AvariasTab.tsx:161`
- **Problema:** O select de mudanÃ§a de status da avaria (linha 161) nÃ£o exige nenhuma confirmaÃ§Ã£o. Mudar para 'resolvida' ou 'cancelada' sÃ£o estados terminais â€” o usuÃ¡rio leigo pode trocar acidentalmente sem perceber.
- **Sugestao:** Adicionar confirm() ao mudar para estados terminais 'resolvida' ou 'cancelada'.

### [/veiculos/[id]/editar] VinculoResponsavel â€” popup de troca de vÃ­nculo sem classes m-modal
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/veiculos/[id]/editar/_components/VinculoResponsavel.tsx:208`
- **Problema:** O popup usa position:fixed com maxHeight:'80vh' mas nÃ£o usa as classes m-modal-overlay/m-modal-content do mobile.css. No mobile com teclado aberto o maxHeight:80vh pode cortar o formulÃ¡rio. O CSS do sistema jÃ¡ tem classes que expandem modais para tela cheia no mobile.
- **Sugestao:** Adicionar className='m-modal-overlay' ao overlay e className='m-modal-content' ao conteÃºdo do popup, para aproveitar o mobile.css jÃ¡ existente.

### [/veiculos/[id]/editar] VinculoResponsavel â€” histÃ³rico de alocaÃ§Ãµes em flexbox horizontal
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/veiculos/[id]/editar/_components/VinculoResponsavel.tsx:192`
- **Problema:** O histÃ³rico de alocaÃ§Ãµes (linha 192) exibe cada registro em flexbox com vÃ¡rios spans (nome, KMs, datas, duraÃ§Ã£o) e flexWrap:wrap. Em 390px com fontSize:12 os spans colapsam de forma irregular, tornando o histÃ³rico difÃ­cil de ler.
- **Sugestao:** Reestruturar o histÃ³rico em layout de cards ou linhas com flexDirection:column no mobile para separar nome, KMs e datas em linhas distintas.

### [/veiculos/[id]/editar] PlanoTab â€” inputs de intervalo KM/Meses sem feedback de salvamento
- **Categoria:** loading · **Arquivo:** `src/app/(dashboard)/veiculos/[id]/editar/_components/PlanoTab.tsx:251`
- **Problema:** Quando o tipo estÃ¡ ativo, os inputs de intervalo no MobileCard atualizam o banco via onBlur/onChange (atualizarIntervalo). NÃ£o hÃ¡ nenhum indicador de 'Salvando...' ou 'Salvo' â€” o usuÃ¡rio leigo vai reeditar por achar que nÃ£o salvou.
- **Sugestao:** Adicionar indicador visual de salvamento apÃ³s atualizarIntervalo concluir (ex: borda verde por 1s ou texto 'Salvo' temporÃ¡rio).

### [/veiculos/[id]/editar] LogsTab â€” alert() nativo apÃ³s reatribuiÃ§Ã£o de log
- **Categoria:** outro · **Arquivo:** `src/app/(dashboard)/veiculos/[id]/editar/_components/LogsTab.tsx:134`
- **Problema:** ApÃ³s concluir a reatribuiÃ§Ã£o de log de KM, o cÃ³digo chama alert() nativo (linha 134) com texto tÃ©cnico ('trigger do banco nÃ£o tiver recalculado'). alert() nativo bloqueia a thread, Ã© hostil no mobile e o texto nÃ£o Ã© adequado para um usuÃ¡rio leigo.
- **Sugestao:** Substituir o alert() por um Alert component do ds.tsx dentro da interface. Simplificar o texto: 'Log movido com sucesso. Verifique o KM atual dos dois veÃ­culos.'

### [/motoristas/[id]/editar] AcertoMensalTab â€” tabelas de adiantamentos e ajustes sem variante mobile
- **Categoria:** tabela · **Arquivo:** `src/app/(dashboard)/motoristas/[id]/editar/_components/AcertoMensalTab.tsx:401`
- **Problema:** As tabelas <table> de 'Adiantamentos do MÃªs' (linha 401) e 'Ajustes' (linha 424) nÃ£o estÃ£o dentro de .m-hide nem tÃªm variante em cards. Em 390px as colunas vÃ£o comprimir ou estourar, especialmente a coluna DescriÃ§Ã£o com texto longo.
- **Sugestao:** Envolver as tabelas em <div className='m-hide'> e adicionar versÃ£o em lista/cards para mobile, ou ao menos adicionar overflow-x:auto no container.

### [/motoristas/[id]/editar] AcertoMensalTab â€” botÃ£o 'Fechar Acerto' invisÃ­vel no mobile por rolagem excessiva
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/motoristas/[id]/editar/_components/AcertoMensalTab.tsx:488`
- **Problema:** O resumo do mÃªs com o botÃ£o 'Fechar Acerto' fica na coluna direita do grid 2fr/1fr. Com .m-stack o grid colapsa para 1 coluna e o resumo fica apÃ³s toda a lista de pedidos e ajustes. O usuÃ¡rio leigo no celular precisa scrollar muito para encontrar e apertar 'Fechar Acerto'.
- **Sugestao:** No mobile, reposicionar o resumo acima dos detalhes (via CSS order ou flex-direction:column-reverse) ou adicionar um botÃ£o fixo 'Fechar Acerto' na parte inferior da tela.

### [/veiculos/[id]/editar] ManutencoesTab â€” exclusÃ£o de manutenÃ§Ã£o sem feedback de sucesso
- **Categoria:** guardrail · **Arquivo:** `src/app/(dashboard)/veiculos/[id]/editar/_components/ManutencoesTab.tsx:258`
- **Problema:** ApÃ³s excluir a ÃºLTIMA manutenÃ§Ã£o de um tipo, o sistema desativa o plano automaticamente (linha 258) mas nÃ£o exibe nenhuma mensagem de sucesso. A tela simplesmente remove o card silenciosamente, sem informar o usuÃ¡rio da consequÃªncia (plano desativado).
- **Sugestao:** Exibir Alert temporÃ¡rio apÃ³s exclusÃ£o informando 'ManutenÃ§Ã£o excluÃ­da. O plano do tipo X foi desativado automaticamente.'

## BAIXO (21)

### [/abastecimentos] Grid de KPI cards â€” 4 colunas no mobile
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/abastecimentos/page.tsx:229`
- **Problema:** O grid usa `gridTemplateColumns: 'repeat(4, 1fr)'` inline. A classe m-kpi-grid colapsa para 2Ã—2 no mobile via CSS (mobile.css:192), o que estÃ¡ correto. PorÃ©m os labels dos KPIs sÃ£o longos ('Total Abastecimentos', 'Custo Total', 'Ticket MÃ©dio') e em 2 colunas com 390px cada card terÃ¡ ~183px â€” o label 'Total Abastecimentos' (18 chars em 10px uppercase) pode quebrar linha e comprimir o valor. EvidÃªncia: page.tsx:228-232.
- **Sugestao:** Encurtar os labels para mobile: 'Abastecimentos', 'Litros', 'Custo', 'Ticket MÃ©dio'. Ou adicionar `overflow:hidden; text-overflow:ellipsis; white-space:nowrap` no label do KpiCard.

### [/abastecimentos/novo] Campo 'Posto' â€” texto livre sem normalizaÃ§Ã£o garantida no banco
- **Categoria:** entrada-dado · **Arquivo:** `src/app/(dashboard)/abastecimentos/novo/page.tsx:75`
- **Problema:** O campo 'Posto' tem `textTransform: 'uppercase'` no CSS (page.tsx:141), que aplica apenas efeito visual. O valor gravado no banco Ã© o que o usuÃ¡rio digitou, sem `.toUpperCase()` no handleSubmit. Se o usuÃ¡rio copiar/colar texto em minÃºsculas, vai ao banco sem a normalizaÃ§Ã£o. EvidÃªncia: handleSubmit linha 75: `posto: f.posto || null` â€” sem trim() nem toUpperCase().
- **Sugestao:** No handleSubmit aplicar `posto: f.posto ? f.posto.trim().toUpperCase() : null`. O mesmo vale para editar/page.tsx linha 93.

### [/abastecimentos/[id]/editar] Campo 'Posto' â€” mesma falta de normalizaÃ§Ã£o do /novo
- **Categoria:** entrada-dado · **Arquivo:** `src/app/(dashboard)/abastecimentos/[id]/editar/page.tsx:93`
- **Problema:** handleSubmit linha 93: `posto: f.posto || null` sem trim/toUpperCase. IdÃªntico ao problema do /novo.
- **Sugestao:** Aplicar `posto: f.posto ? f.posto.trim().toUpperCase() : null` no handleSubmit.

### [/clientes] Link 'Editar' na coluna Acoes da tabela desktop
- **Categoria:** affordance · **Arquivo:** `src/app/(dashboard)/clientes/page.tsx:151`
- **Problema:** O link 'Editar' (linha 151) e um elemento <a> com apenas cor azul e fontWeight:600, sem fundo, borda ou padding â€” parece texto puro. No contexto desktop o padrao e reconhecivel, mas o criterio de affordance exige que acoes tenham cara de botao para usuarios leigos.
- **Sugestao:** Substituir o <a> por um componente Btn variant='outline' size='xs', que ja tem borda e padding, deixando claro que e uma acao clicavel.

### [/usuarios] Link 'Editar' na coluna Acoes da tabela desktop
- **Categoria:** affordance · **Arquivo:** `src/app/(dashboard)/usuarios/page.tsx:188`
- **Problema:** O link 'Editar' (linha 188) e um <a> com apenas cor azul e fontWeight:600, sem fundo ou borda â€” parece texto puro, sem affordance de botao para usuario leigo.
- **Sugestao:** Substituir por Btn variant='outline' size='xs' para deixar explicito que e uma acao clicavel.

### [/empresas] Link 'Editar' na coluna Acoes da tabela desktop
- **Categoria:** affordance · **Arquivo:** `src/app/(dashboard)/empresas/page.tsx:129`
- **Problema:** O link 'Editar' (linha 129) e um <a> com apenas cor azul e fontWeight:600 â€” parece texto puro, sem affordance de botao.
- **Sugestao:** Substituir por Btn variant='outline' size='xs' para deixar claro que e uma acao.

### [/uso-apis] Links 'Cobranca' e 'Uso / console' sem estilo de botao â€” parecem texto puro
- **Categoria:** affordance · **Arquivo:** `src/app/(dashboard)/uso-apis/page.tsx:109`
- **Problema:** Os links de cobranca (linha 109) e uso/console (linha 119) usam <a> com cor vermelha/azul e fontWeight:600 mas sem borda ou fundo â€” para o usuario leigo parecem texto destacado, nao links clicaveis. Em mobile o alvo de toque e apenas a largura do texto (~80px), sem padding adicional.
- **Sugestao:** Adicionar padding '6px 10px', borda '1px solid' da cor correspondente e borderRadius:6px aos links, tornando-os visivelmente clicaveis com alvo de toque adequado.

### [/despacho/[id]] Input de novo local de carregamento â€” sem inputMode e trim inconsistente
- **Categoria:** entrada-dado · **Arquivo:** `src/app/(dashboard)/despacho/[id]/_components/AbaPrincipal.tsx:136`
- **Problema:** Em AbaPrincipal.tsx linha 136, o `<input>` de novo local nao tem `inputMode` definido. Ao confirmar com Enter ou clicar no botao, `novoLocal` e passado sem trim explicito para `onSalvarLocais([...locais, novoLocal])`. O trim acontece apenas dentro de `salvarLocais` em page.tsx linha 200, mas a concatenacao ja incluiu o valor bruto. Isso e inconsistente e pode gerar locais com espacos extras no array temporario.
- **Sugestao:** Adicionar `inputMode='text'` ao input. Normalizar antes de passar: `onSalvarLocais([...locais, novoLocal.trim()])` tanto no Enter quanto no clique do botao.

### [/entregas/novo] BotÃ£o 'Salvar' duplicado â€” cabeÃ§alho e rodapÃ©
- **Categoria:** outro · **Arquivo:** `src/app/(dashboard)/entregas/novo/page.tsx:251`
- **Problema:** O formulÃ¡rio tem dois botÃµes de submit: um no PageHeader (linha 123: `<Btn type='submit' variant='primary'>`) e outro no rodapÃ© (linha 253: `<Btn type='submit'>`). Dois botÃµes de salvar na mesma tela geram dÃºvida para o leigo sobre qual usar.
- **Sugestao:** Manter apenas o botÃ£o do rodapÃ© (mais acessÃ­vel no mobile, onde o cabeÃ§alho some com o scroll) e remover o botÃ£o de submit do PageHeader.

### [/] Alertas pendentes â€” Links de alerta sem alvo de toque minimo
- **Categoria:** affordance · **Arquivo:** `src/app/(dashboard)/page.tsx:209`
- **Problema:** Cada alerta na secao 'Alertas pendentes' (linha 209-220 de page.tsx) e um Link com padding '10px 14px' â€” altura de aproximadamente 38-40px dependendo do line-height. Com fontSize 13px e fontWeight 600, o conteudo pode ser maior que 1 linha em nomes longos, o que aumenta a altura. Porem quando o texto e curto (1 linha) a altura pode ficar abaixo de 44px.
- **Sugestao:** Adicionar minHeight: '44px' ao style do Link de alerta para garantir alvo de toque conforme Apple HIG, independente do tamanho do texto.

### [/pedidos] Paginacao mobile â€” botoes sem indicador visual de loading
- **Categoria:** loading · **Arquivo:** `src/components/ui/Paginacao.tsx:34-51`
- **Problema:** Os botoes de paginacao ficam `disabled` quando `loading=true`, o que previne clique duplo. Porem nao ha indicador visual de que a proxima pagina esta sendo carregada. O usuario leigo pode nao entender por que os botoes nao respondem enquanto a lista fica em branco.
- **Sugestao:** Adicionar spinner ou texto '...' nos botoes de paginacao quando `loading=true`, mantendo o `disabled`.

### [/pedidos] SearchInput mobile â€” dependencia de !important no CSS para largura total
- **Categoria:** layout · **Arquivo:** `src/components/ui/ds.tsx:549-556`
- **Problema:** O componente SearchInput define internamente `maxWidth: '280px'` via inline style. No mobile a classe `m-search-full` sobrescreve com `max-width: 100% !important`. Isso cria dependencia fragil: se a classe for renomeada ou removida, o campo de busca fica com 280px em mobile.
- **Sugestao:** Passar explicitamente `style={{ maxWidth: '100%' }}` no uso do SearchInput dentro do bloco mobile-only, eliminando a dependencia do !important.

### [/pedidos/[id]/editar] InstruÃ§Ã£o da aba 'Adicionar Entregas' referencia botÃ£o no lugar errado no mobile
- **Categoria:** outro · **Arquivo:** `src/app/(dashboard)/pedidos/[id]/editar/page.tsx:474`
- **Problema:** O texto na linha 474 diz 'clique em Atualizar no topo pra confirmar'. No mobile, o botÃ£o 'Atualizar Pedido' aparece abaixo das abas via m-show (linha 277), nÃ£o no topo. A instruÃ§Ã£o induz o leigo a procurar o botÃ£o no lugar errado.
- **Sugestao:** Ajustar o texto para 'clique em Atualizar Pedido (abaixo das abas no celular) pra confirmar' ou adicionar um botÃ£o de confirmaÃ§Ã£o dentro da prÃ³pria aba.

### [/pedidos] MobileList â€” contador exibe '0 pedidos' durante loading
- **Categoria:** loading · **Arquivo:** `src/app/(dashboard)/pedidos/page.tsx:428-429`
- **Problema:** O MobileList recebe `count={filtradas.length}` que e 0 no inicio ou durante recarregamento de pagina. Enquanto `loading=true` o contador ja exibe '0 pedidos' ao mesmo tempo que o texto 'Carregando...' aparece na lista â€” informacao contraditoria para o usuario leigo.
- **Sugestao:** Passar `count={loading ? undefined : filtradas.length}` para o MobileList para que o contador nao apareca durante o carregamento.

### [/pedidos/[id]] Tela de redirect â€” sem tratamento de id invalido
- **Categoria:** guardrail · **Arquivo:** `src/app/(dashboard)/pedidos/[id]/page.tsx:21-29`
- **Problema:** Se o `id` da rota for invalido ou nulo, o `useEffect` nao dispara o replace e o usuario fica preso na tela branca com 'Abrindo no Despacho...' sem mensagem de erro, sem botao de volta e sem timeout.
- **Sugestao:** Adicionar fallback de timeout (ex: 3s): se o redirect nao ocorreu, exibir mensagem de erro com link para /pedidos.

### [/relatorios] Ausencia de feedback apos exportar CSV
- **Categoria:** loading · **Arquivo:** `src/app/(dashboard)/relatorios/page.tsx:259`
- **Problema:** O botao 'Exportar CSV' (linha 259-261) chama exportCSV() que usa saveAs() diretamente, sem nenhum estado de loading ou confirmacao de sucesso. Se o browser bloquear o download ou a geracao falhar silenciosamente, o usuario leigo nao sabe o que aconteceu.
- **Sugestao:** Envolver exportCSV em try/catch e exibir um toast ou badge 'Download iniciado!' apos o saveAs(), ou um alerta de erro se falhar.

### [/regras/contexto] Botoes 'Montar contexto' e 'Classificar (IA)' â€” sem feedback de erro
- **Categoria:** guardrail · **Arquivo:** `src/app/(dashboard)/regras/contexto/page.tsx:51`
- **Problema:** O botao 'Classificar (IA)' (linha 77) em caso de excecao de rede define `clf = { autorizado: false, resposta: 'Erro ao classificar.' }` (linha 51). A mensagem 'Erro ao classificar.' aparece no mesmo bloco de resultado da IA (linha 101), com visual de resposta normal â€” nao ha diferenciacao visual entre 'IA respondeu' e 'houve um erro de rede'. O usuario leigo nao sabe se deve tentar novamente.
- **Sugestao:** Usar estado separado para erro de rede (`erroClassificacao`) e renderizar um Alert de error em vez de colocar a mensagem no bloco de resultado da IA.

### [/veiculos/novo] campo 'Valor AquisiÃ§Ã£o (R$)' sem mÃ¡scara de moeda
- **Categoria:** entrada-dado · **Arquivo:** `src/app/(dashboard)/veiculos/novo/page.tsx:194`
- **Problema:** Campo usa type='number' sem mÃ¡scara de moeda. O usuÃ¡rio leigo precisa digitar '150000.00' em vez do formato visual 'R$ 150.000,00', o que Ã© hostil no mobile.
- **Sugestao:** Usar IMaskInput com mask numÃ©rico e scale:2 para exibir como moeda mas gravar o nÃºmero puro no banco.

### [/motoristas/[id]/editar] link 'Abrir veÃ­culo â†’' na aba VeÃ­culo PadrÃ£o
- **Categoria:** affordance · **Arquivo:** `src/app/(dashboard)/motoristas/[id]/editar/page.tsx:357`
- **Problema:** O link 'Abrir veÃ­culo â†’' (linha 357) usa tag <a> com color:#2563eb e fontWeight:600 sem visual de botÃ£o. Em um conteÃºdo de aba quase vazio, o leigo pode nÃ£o perceber que Ã© clicÃ¡vel.
- **Sugestao:** Substituir por <Btn href={...} size='sm' variant='outline'>Abrir veÃ­culo â†’</Btn>.

### [/motoristas/[id]/editar] AcertoMensalTab â€” seletores de ano/mÃªs como <span> em vez de <button>
- **Categoria:** affordance · **Arquivo:** `src/app/(dashboard)/motoristas/[id]/editar/_components/AcertoMensalTab.tsx:325`
- **Problema:** Os chips de seleÃ§Ã£o de ano e mÃªs sÃ£o <span> com onClick. Spans nÃ£o sÃ£o interativos nativamente: sem role='button', sem tabIndex, sem navegaÃ§Ã£o por teclado. No mobile podem ser ativados acidentalmente durante o scroll.
- **Sugestao:** Substituir <span> por <button type='button'> com o mesmo estilo visual para semÃ¢ntica correta.

### [/veiculos/[id]/editar] ManutencoesTab â€” campos de custo sem mÃ¡scara de moeda
- **Categoria:** entrada-dado · **Arquivo:** `src/app/(dashboard)/veiculos/[id]/editar/_components/ManutencoesTab.tsx:370`
- **Problema:** Os campos 'Custo peÃ§as (R$)' e 'Custo mÃ£o de obra (R$)' (linhas 370-372) usam type='number' step='0.01' sem mÃ¡scara de moeda. O usuÃ¡rio leigo digita sem referÃªncia visual do formato esperado.
- **Sugestao:** Adicionar IMaskInput com formataÃ§Ã£o monetÃ¡ria nos campos de custo do formulÃ¡rio de manutenÃ§Ã£o.

## Boas praticas (pesquisa web, sonnet)

### Boas praticas de feedback e affordance em web apps mobile para usuarios leigos (React/Next.js, 2024-2026)
- **Botoes com aparencia de botao: use fundo solido, bordas arredondadas e sombra â€” nunca dependa apenas de texto sublinhado para acoes primarias** — Usuarios leigos identificam elementos acionaveis por pistas visuais fisicas (forma, cor, elevacao). Texto puro sem estilo de botao nao comunica tappability. O alvo minimo de toque deve ser 44pt (Apple) ou 48dp (Google Material) â€” equivalente a ~9mm nos cantos da tela. O padding interno do elemento pode ser menor, mas a area clicavel deve atingir esse minimo via padding CSS ou pseudo-elemento. Separe acoes destrutivas (Excluir) de acoes seguras (Salvar) com espaco generoso para evitar toque acidental. _(IxDF Tappability Affordances (https://ixdf.org/literature/article/how-to-use-tappability-affordances) | UXPin Affordances Guide (https://www.uxpin.com/studio/blog/affordances-user-interaction/))_
- **Estado de loading em botoes: desabilite imediatamente apos o clique e mostre spinner inline â€” nunca deixe o botao interativo durante uma operacao em curso** — Usuarios leigos clicam de novo se nao recebem feedback imediato. A combinacao disabled={isPending} + texto mutavel ('Salvando...') + spinner inline cobre os tres canais de feedback: visual, textual e interativo. No React 19, useTransition entrega isPending nativamente sem useState extra. Para Next.js Server Actions, o hook useFormStatus tambem expoe pending. Use aria-busy='true' no botao para leitores de tela. _(React 19 useTransition docs (https://react.dev/reference/react/useTransition) | AppSignal Async Transitions React 19 (https://blog.appsignal.com/2025/08/27/smooth-async-transitions-in-react-19.html))_
- **Protecao contra duplo toque: desabilite o botao no primeiro clique (disabled={isPending}) e combine com touch-action: manipulation no CSS** — Dois mecanismos em camadas: (1) disabled={isPending} bloqueia o segundo clique a nivel de React/DOM; (2) touch-action: manipulation elimina o delay de 300ms do browser para deteccao de double-tap-to-zoom, removendo a janela onde dois toques rapidos geram dois eventos. Suporte do touch-action: manipulation e Chrome 36+, Firefox 52+, Safari iOS 13.4+ â€” cobertura pratica de 98%+ dos dispositivos ativos em 2025. Nunca use user-scalable=no pois quebra acessibilidade para usuarios com baixa visao. _(MDN touch-action (https://developer.mozilla.org/en-US/docs/Web/CSS/touch-action) | Raul Melo TIL (https://raulmelo.me/en/til/disable-double-tap-zoom-css-touch-action) | Good Enough Blog (https://goodenough.us/posts/til-use-touch-action-manipulation-to-avoid-double-tap-to-zoom))_
- **Skeleton screen para carregamento de listas, cards e dashboards; spinner apenas para acoes curtas e imprevisveis (submit, autenticacao, pagamento)** — Pesquisa do Nielsen Norman Group mostra que skeletons sao percebidos como 20-30% mais rapidos que spinners porque mostram progresso de layout em vez de espera cega. Regra pratica: se voce sabe o formato do conteudo que vai aparecer (lista de pedidos, cards de entrega) â€” use skeleton com animate-pulse (Tailwind). Se a operacao e curtissima (<1s) ou o resultado e imprevisivel â€” use spinner. Em Next.js App Router, o arquivo loading.tsx na pasta da rota entrega skeleton automaticamente via React Suspense sem useState manual. _(NN/G Skeleton Screens 101 (https://www.nngroup.com/articles/skeleton-screens/) | FlyonUI Spinners vs Skeletons Next.js (https://flyonui.com/blog/next-js-app-router-tailwind-spinner-loading-page/) | Fishtank Next.js Loading Best Practices (https://www.getfishtank.com/insights/best-practices-for-loading-states-in-nextjs))_
- **Nao mostre o indicador de loading se a operacao completar em menos de 100ms â€” adicione debounce de 150-200ms antes de exibir skeleton ou spinner** — Mostrar e esconder um spinner em menos de 100ms causa flicker que piora a percepcao de qualidade. O padrao correto e: inicia a operacao, aguarda 150ms, se ainda estiver pendente entao mostra o loading state. Em React, isso pode ser feito com setTimeout + cleanup no useEffect, ou com bibliotecas como SWR/React Query que tem opcao de loadingDelay. O Next.js loading.tsx nao tem esse debounce por padrao â€” para rotas rapidas considere um wrapper com delay. _(Next.js Loading UI and Streaming docs (https://nextjs.org/docs/app/building-your-application/routing/loading-ui-and-streaming) | LogRocket React Loading Skeleton (https://blog.logrocket.com/handling-react-loading-states-react-loading-skeleton/))_
- **Toasts de sucesso: posicione no topo-centro ou fundo-centro em mobile (nunca em canto), duracao de 3-5 segundos, com pauseOnHover ativo** — Em viewports mobile (<768px), notificacoes em cantos (bottom-right, top-right) ficam fora do campo visual central do usuario e sao facilmente perdidas. O centro garante percepcao. Para React-Toastify v11+ use position='top-center' em mobile e position='bottom-right' em desktop via breakpoint. autoClose de 3000ms e suficiente para mensagens curtas ('Salvo com sucesso'). pauseOnHover evita que o usuario perca a mensagem ao tentar ler. Adicione ariaLabel ao ToastContainer para compatibilidade com leitores de tela. _(React-Toastify 2025 Guide â€” LogRocket (https://blog.logrocket.com/react-toastify-guide/) | Mobbin Toast UX Glossary (https://mobbin.com/glossary/toast))_
- **Erros criticos (formulario invalido, falha de pagamento, erro de rede) nao devem usar toast â€” use banner persistente inline ou mensagem contextual que nao some automaticamente** — Toasts auto-dismissiveis violam WCAG 2.2.1 (Timing Adjustable) quando o usuario nao tem tempo de ler ou agir. Para erros que exigem acao do usuario (campo obrigatorio, cartao recusado), o feedback deve ser persistente e posicionado proximo ao elemento que gerou o erro. Use role='alert' ou aria-live='assertive' para que leitores de tela anunciem imediatamente. Toast so e adequado para confirmacoes passivas que o usuario nao precisa agir ('Pedido enviado', 'Senha copiada'). _(WCAG 2.2.1 Timing Adjustable (https://www.w3.org/WAI/WCAG22/Understanding/timing-adjustable.html) | Accessible Web: Are toast messages accessible? (https://accessibleweb.com/question-answer/are-toast-messages-accessible/) | LogRocket Toast UX Best Practices (https://blog.logrocket.com/ux-design/toast-notifications/))_
- **Active state de toque: implemente :active com mudanca visivel de cor/escala, e adicione o listener de touchstart vazio no iOS para ativar o pseudo-seletor** — iOS Safari nao dispara :active CSS sem um listener de touchstart registrado no elemento ou em um ancestral. Sem esse hack, botoes em iPhone nao dao feedback visual de pressao â€” o usuario nao sabe se tocou. Padrao minimo: cor de fundo 15-20% mais escura no :active + transform: scale(0.97) para sensacao tatica. Remova o highlight padrao do webkit com -webkit-tap-highlight-color: transparent e substitua pelo seu proprio :active. Use touch-action: manipulation no mesmo elemento para eliminar o delay de 300ms junto. _(web.dev Add Touch to Your Site (https://web.dev/articles/add-touch-to-your-site) | GitHub active-touch (https://github.com/dmitrizzle/active-touch))_
- **Feedback otimista com useOptimistic (React 19): mostre o resultado antes da resposta do servidor e reverta automaticamente em caso de erro** — Para usuarios leigos, a sensacao de 'o app nao respondeu' e a principal causa de duplos cliques e frustacao. useOptimistic atualiza a UI instantaneamente (ex: item ja aparece na lista com opacity 0.6 e texto '(enviando...)') enquanto a requisicao de rede acontece em background. Se o servidor retornar erro, o React desfaz o estado otimista automaticamente. Combinado com disabled={isPending} no botao, elimina tanto o duplo-clique quanto a percepcao de lentidao. Disponivel nativamente no React 19 (dezembro 2024) sem biblioteca extra. _(React 19 useOptimistic docs (https://react.dev/reference/react/useOptimistic) | DEV.to React 19 useOptimistic Deep Dive (https://dev.to/a1guy/react-19-useoptimistic-deep-dive-building-instant-resilient-and-user-friendly-uis-49fp) | React v19 Release Notes (https://react.dev/blog/2024/12/05/react-19))_
- **Respeite prefers-reduced-motion: desative animacoes de skeleton e transicoes de toast para usuarios com sensibilidade a movimento** — animate-pulse e animate-spin do Tailwind, e as animacoes de entrada/saida dos toasts, podem causar desconforto ou nausea em usuarios com vestibular disorders. A media query prefers-reduced-motion: reduce deve desativar essas animacoes. No Tailwind use motion-reduce:animate-none. No React-Toastify defina transition={false} ou uma transicao sem movimento lateral. Este e um requisito WCAG 2.3.3 (AAA) e boa pratica geral para qualidade percebida em todos os usuarios. _(LogRocket UX Toast Notifications (https://blog.logrocket.com/ux-design/toast-notifications/) | React-Toastify Guide 2025 (https://blog.logrocket.com/react-toastify-guide/) | MDN prefers-reduced-motion)_

### Guard-rails de UX para usuÃ¡rios leigos em apps de gestÃ£o mobile â€” melhores prÃ¡ticas atuais (2024-2026)
- **Reserve diÃ¡logos de confirmaÃ§Ã£o para aÃ§Ãµes VERDADEIRAMENTE irreversÃ­veis** — Usar 'Tem certeza?' para toda aÃ§Ã£o cria 'dialog fatigue': o usuÃ¡rio para de ler e clica OK automaticamente, tornando o aviso inÃºtil. NNG (fev/2024) estabelece que a eficÃ¡cia do dialog depende diretamente da sua raridade. A regra prÃ¡tica: use confirmaÃ§Ã£o apenas quando a aÃ§Ã£o destrÃ³i trabalho do usuÃ¡rio, custa dinheiro significativo ou nÃ£o pode ser desfeita de nenhuma forma. Para todo o resto, prefira undo. _(Nielsen Norman Group â€” https://www.nngroup.com/articles/confirmation-dialog/ (fev/2024); UX Planet â€” https://uxplanet.org/confirmation-dialogs-how-to-design-dialogues-without-irritation-7b4cf2599956 (set/2025))_
- **Prefira o padrÃ£o Undo (desfazer via toast) ao invÃ©s de dialog de confirmaÃ§Ã£o para aÃ§Ãµes cotidianas** — Undo executa a aÃ§Ã£o imediatamente e exibe um toast com botÃ£o 'Desfazer' por 5-8 segundos. Isso assume competÃªncia do usuÃ¡rio, nÃ£o interrompe o fluxo de trabalho e convida Ã  exploraÃ§Ã£o. DiÃ¡logos de confirmaÃ§Ã£o interrompem o raciocÃ­nio, exploram o hÃ¡bito de fechar janelas sem ler, e sÃ£o ignorados mesmo quando lidos. Toda a literatura UX recente converge: undo Ã© a defesa primÃ¡ria; dialog Ã© o Ãºltimo recurso. _(Josh Wayne / Fountn.design â€” https://fountn.design/resource/confirm-or-undo-which-is-the-better-option/; LogRocket â€” https://blog.logrocket.com/ux-design/double-check-user-actions-confirmation-dialog/; UX Psychology â€” https://uxpsychology.substack.com/p/how-to-design-better-destructive)_
- **Em diÃ¡logos de aÃ§Ãµes destrutivas: use rÃ³tulos de botÃ£o descritivos (verbo + objeto), coloque a aÃ§Ã£o perigosa em vermelho e sem default selecionado** — BotÃµes 'Sim/NÃ£o' ou 'OK/Cancelar' sÃ£o vagos demais â€” o usuÃ¡rio que lÃª rapidamente nÃ£o entende a consequÃªncia. 'Excluir pedido' Ã© autoexplicativo; 'Confirmar' nÃ£o Ã©. Vermelho sinaliza perigo preattentivamente (antes do processamento consciente), mas nÃ£o deve ser o Ãºnico sinal por causa de daltÃ´nicos (~4,5% da populaÃ§Ã£o). Nenhum botÃ£o selecionado por padrÃ£o previne que o Enter/envio acidental dispare a aÃ§Ã£o. _(NNG â€” https://www.nngroup.com/articles/confirmation-dialog/; UX Psychology â€” https://uxpsychology.substack.com/p/how-to-design-better-destructive; Medium/Bootcamp â€” https://medium.com/design-bootcamp/a-ux-guide-to-destructive-actions-their-use-cases-and-best-practices-f1d8a9478d03)_
- **Para exclusÃµes permanentes de alto impacto (ex: encerrar conta, apagar mÃªs inteiro de dados), adicione fricÃ§Ã£o fÃ­sica: campo de digitaÃ§Ã£o de confirmaÃ§Ã£o ('Digite EXCLUIR para confirmar')** — A fricÃ§Ã£o forÃ§ada quebra o piloto automÃ¡tico. O usuÃ¡rio precisa fazer uma aÃ§Ã£o manual e consciente, o que reduz drasticamente cliques acidentais. Deve ser usado com parcimÃ´nia â€” apenas nas aÃ§Ãµes de maior consequÃªncia â€” senÃ£o vira obstÃ¡culo irritante. O exemplo clÃ¡ssico citado pela NNG Ã© o MailChimp exigindo 'DELETE'. _(NNG â€” https://www.nngroup.com/articles/confirmation-dialog/; Medium/Bootcamp â€” https://medium.com/design-bootcamp/a-ux-guide-to-destructive-actions-their-use-cases-and-best-practices-f1d8a9478d03)_
- **Separe fisicamente botÃµes destrutivos de botÃµes rotineiros â€” nunca os coloque adjacentes** — UsuÃ¡rios em tarefas repetitivas operam no 'Sistema 1' (automÃ¡tico, rÃ¡pido, sem anÃ¡lise consciente). Colocar 'Excluir' ao lado de 'Editar' em uma lista Ã© uma das 10 maiores falhas de design de aplicaÃ§Ã£o segundo a NNG. A soluÃ§Ã£o vem da ergonomia aeronÃ¡utica de 1940: shape-coding e espaÃ§o fÃ­sico diferente forÃ§am atenÃ§Ã£o antes do clique. Use cor, Ã­cone, espaÃ§amento e alinhamento diferentes â€” sempre mÃºltiplos sinais redundantes. _(NNG â€” https://www.nngroup.com/articles/proximity-consequential-options/; UX Bootcamp â€” https://medium.com/design-bootcamp/a-ux-guide-to-destructive-actions-their-use-cases-and-best-practices-f1d8a9478d03)_
- **Mensagens de erro: uma frase curta em voz ativa, sem jargÃ£o, sem culpar o usuÃ¡rio, dizendo o que fazer** — A fÃ³rmula validada Ã©: (1) o que deu errado em linguagem simples, (2) como corrigir com aÃ§Ã£o especÃ­fica. 'Erro 422' ou 'Campo invÃ¡lido' sÃ£o inÃºteis para leigos. 'Digite um telefone com 11 nÃºmeros, incluindo DDD' Ã© acionÃ¡vel. Frases que culpam ('VocÃª digitou errado') aumentam a frustraÃ§Ã£o. Frases neutras ou passivas ('NÃ£o conseguimos encontrar esse CPF') preservam a confianÃ§a. Nunca use caixa alta excessiva ou ponto de exclamaÃ§Ã£o â€” amplificam a tensÃ£o. _(NNG â€” https://www.nngroup.com/articles/error-message-guidelines/; UX Content Collective â€” https://uxcontent.com/how-to-write-error-messages/)_
- **Use validaÃ§Ã£o inline posicionada junto ao campo com erro â€” nÃ£o no topo do formulÃ¡rio** — Mensagem de erro longe do campo que causou o problema exige que o usuÃ¡rio faÃ§a uma busca visual, aumentando a carga cognitiva. A validaÃ§Ã£o inline reduz 22% dos erros e 42% do tempo de conclusÃ£o comparada Ã  validaÃ§Ã£o pÃ³s-envio, segundo estudo da Interaction Design Foundation citado em mÃºltiplas fontes. Em mobile, espaÃ§o Ã© escasso: a mensagem de erro deve estar imediatamente abaixo do campo e persistir visÃ­vel sem que o usuÃ¡rio precise agir para vÃª-la. _(LogRocket â€” https://blog.logrocket.com/ux-design/ux-form-validation-inline-after-submission/; DEV Community â€” https://dev.to/137foundry/how-inline-validation-reduces-form-abandonment-and-errors-5258; NNG â€” https://www.nngroup.com/articles/error-message-guidelines/)_
- **Valide no evento blur (saÃ­da do campo), nÃ£o no evento keyup (digitaÃ§Ã£o em tempo real) â€” exceto para campos jÃ¡ em erro e verificaÃ§Ãµes Ãºnicas como nome de usuÃ¡rio** — Mostrar erro vermelho enquanto o usuÃ¡rio ainda estÃ¡ digitando o email parece que o sistema estÃ¡ 'gritando' com ele. O momento certo Ã© logo apÃ³s ele sair do campo (blur). A exceÃ§Ã£o sÃ£o medidores de forÃ§a de senha e verificaÃ§Ã£o de disponibilidade de nome de usuÃ¡rio, onde o feedback em tempo real Ã© esperado e Ãºtil. Para campos jÃ¡ sinalizados como errados, mude para validaÃ§Ã£o on-change para dar confirmaÃ§Ã£o positiva imediata quando o usuÃ¡rio corrija. _(Smashing Magazine â€” https://www.smashingmagazine.com/2022/09/inline-validation-web-forms-ux/; Sarvaya â€” https://sarvaya.in/blog/form-validation-ux-patterns-real-time-2026; Ivy Forms â€” https://ivyforms.com/blog/form-validation-best-practices/)_
- **Previna double submit: desabilite o botÃ£o apÃ³s o primeiro clique e mostre indicador de progresso (spinner ou barra) no prÃ³prio botÃ£o** — UsuÃ¡rios reenviam formulÃ¡rios quando estÃ£o incertos se a aÃ§Ã£o foi registrada â€” especialmente em conexÃµes lentas de mobile. Pesquisa mostra que usuÃ¡rios com 50+ anos tÃªm o hÃ¡bito de dar duplo clique, gerando pedidos duplicados. O padrÃ£o 'progress button' (botÃ£o vira estado de loading visÃ­vel) elimina a incerteza sem bloquear a tela. Sempre combine com idempotÃªncia no servidor como defesa definitiva contra duplicatas que passem pelo cliente. _(UX Movement â€” https://uxmovement.com/buttons/prevent-duplicate-orders-with-progress-buttons/; OpenReplay â€” https://blog.openreplay.com/prevent-double-form-submissions/; Inkbot Design â€” https://inkbotdesign.com/mobile-ux/)_
- **Tamanho mÃ­nimo de Ã¡rea de toque: 44Ã—44pt (Apple HIG) ou 48Ã—48dp (Material Design) â€” nunca menor em telas mÃ³veis** — O tamanho mÃ©dio da polpa do dedo Ã© ~10mm. Alvos menores que o mÃ­nimo recomendado causam cliques acidentais em elementos adjacentes ('fat finger error'), especialmente em apps de gestÃ£o onde listas densas com botÃµes de aÃ§Ã£o por linha sÃ£o comuns. Apple e Google convergem no mesmo range apesar das unidades diferentes. Esse mÃ­nimo previne nÃ£o apenas erros acidentais, mas tambÃ©m abandono por frustraÃ§Ã£o com a interface. _(Apple HIG â€” https://developer.apple.com/design/human-interface-guidelines/; Inkbot Design â€” https://inkbotdesign.com/mobile-ux/; LogRocket â€” https://blog.logrocket.com/ux-design/human-interface-guidelines/)_
- **Explique a consequÃªncia da aÃ§Ã£o no diÃ¡logo de confirmaÃ§Ã£o, nÃ£o apenas peÃ§a confirmaÃ§Ã£o genÃ©rica** — 'Deseja excluir?' nÃ£o comunica nada. 'Excluir este pedido removerÃ¡ tambÃ©m as 3 entregas vinculadas. Essa aÃ§Ã£o nÃ£o pode ser desfeita.' dÃ¡ ao usuÃ¡rio informaÃ§Ã£o real para decidir. A NNG chama isso de 'progressive disclosure' â€” deixar o usuÃ¡rio entender o que acontecerÃ¡ antes de confirmar. O tÃ­tulo do dialog deve reafirmar a aÃ§Ã£o; o corpo deve explicar consequÃªncias concretas; os botÃµes devem nomear o que fazem. _(NNG â€” https://www.nngroup.com/articles/confirmation-dialog/; UX Psychology â€” https://uxpsychology.substack.com/p/how-to-design-better-destructive; UX Design/Microcopy â€” https://uxdesign.cc/are-you-sure-you-want-to-do-this-microcopy-for-confirmation-dialogues-1d94a0f73ac6)_
- **Use sinais visuais redundantes para erros: cor + Ã­cone + texto â€” nunca cor sozinha** — Cerca de 4,5% da populaÃ§Ã£o tem algum grau de daltonismo. Campos com borda vermelha sozinha sÃ£o invisÃ­veis para parte dos usuÃ¡rios. A combinaÃ§Ã£o cor (vermelho) + Ã­cone (âš  ou âœ•) + texto explicativo garante que o sinal chegue independente de limitaÃ§Ã£o visual. AlÃ©m disso, o Ã­cone funciona como Ã¢ncora visual em interfaces densas, ajudando o usuÃ¡rio a localizar o erro rapidamente em formulÃ¡rios com muitos campos. _(NNG â€” https://www.nngroup.com/articles/error-message-guidelines/; UX Psychology â€” https://uxpsychology.substack.com/p/how-to-design-better-destructive; UX Content Collective â€” https://uxcontent.com/how-to-write-error-messages/)_

### Melhores prÃ¡ticas atuais: tabelas em telas pequenas + formulÃ¡rios mobile com extraÃ§Ã£o de dado amigÃ¡vel
- **TABELAS â€” Transformar linha em card no mobile via CSS puro (padrÃ£o data-label + ::before)** — Em telas < 640 px cada <td> vira um bloco empilhado. O rÃ³tulo da coluna fica embutido no HTML como data-label='Nome da coluna' e o CSS injeta esse valor antes do dado via content: attr(data-label). Zero JavaScript. Cada linha vira um card autocontido e legÃ­vel sem scroll horizontal. ImplementaÃ§Ã£o: no breakpoint mobile, setar display:block em table, thead, tbody, tr, th, td; esconder o <thead>; e adicionar td::before { content: attr(data-label); font-weight:bold; display:inline-block; width:50% }. _(https://css-tricks.com/responsive-data-tables/ | https://dev.to/phpcontrols/transform-html-table-into-card-view-using-nothing-but-css-17dc)_
- **TABELAS â€” Truncar com ellipsis sÃ³ em colunas que tÃªm largura mÃ¡xima definida; nunca truncar valores numÃ©ricos** — Truncar funciona bem para textos como nomes ou endereÃ§os (onde o usuÃ¡rio entende que hÃ¡ mais), mas nunca deve ser aplicado a nÃºmeros (CPF, valor, km), pois o dado cortado fica errado. A trÃ­ade CSS necessÃ¡ria Ã©: white-space:nowrap; overflow:hidden; text-overflow:ellipsis aplicada com um max-width fixo (ex.: 200 px). Colunas numÃ©ricas devem usar white-space:nowrap sem truncar. _(https://blog.logrocket.com/creating-responsive-data-tables-css/ | https://uxdworld.com/data-table-design-best-practices/)_
- **TABELAS â€” Revelar texto truncado via tooltip em tap (nÃ£o hover) no mobile** — O evento hover nÃ£o existe em touch. Em mobile, o tooltip deve aparecer no tap no elemento truncado e fechar ao tocar fora. Para acessibilidade, deve tambÃ©m aparecer via focus (teclado). Implementar com aria-label ou title mais um handler de click/focus explÃ­cito â€” nÃ£o depender do title nativo do browser, que nÃ£o funciona em touch. _(https://www.setproduct.com/blog/tooltip-ui-design | https://uxdworld.com/data-table-design-best-practices/)_
- **TABELAS â€” Priorizar colunas: esconder as menos crÃ­ticas no mobile, manter as essenciais visÃ­veis** — Nem toda coluna cabe nem precisa aparecer em tela pequena. A estratÃ©gia correta Ã© definir uma hierarquia (coluna primÃ¡ria sempre visÃ­vel, secundÃ¡rias visÃ­veis no tablet, terciÃ¡rias sÃ³ no desktop) e usar classes CSS com breakpoints para esconder. Dados de status podem ser substituÃ­dos por Ã­cones para economizar espaÃ§o. _(https://www.uxmatters.com/mt/archives/2020/07/designing-mobile-tables.php | https://medium.com/design-bootcamp/designing-user-friendly-data-tables-for-mobile-devices-c470c82403ad)_
- **TABELAS â€” Alinhar texto Ã  esquerda, nÃºmeros Ã  direita, nunca centralizar colunas de dados** — Centralizar dificulta a leitura em varredura vertical (o olho perde o eixo). Texto longo sempre Ã  esquerda. Valores numÃ©ricos (moeda, km, quantidade) Ã  direita para que casas decimais se alinhem na mesma coluna vertical. Nunca quebrar linha em nÃºmero: white-space:nowrap. _(https://www.mobilespoon.net/2019/11/design-ui-tables-20-rules-guide.html | https://uxdworld.com/data-table-design-best-practices/)_
- **TABELAS â€” Encurtar rÃ³tulos de data e status para telas pequenas** — 'Janeiro 15 de 2025' vira 'Jan 15'. '3:30 PM' vira '3:30p'. 'Aguardando confirmaÃ§Ã£o' vira Ã­cone de relÃ³gio com tooltip. Reduce caracteres sem perder semÃ¢ntica. No card mobile o rÃ³tulo jÃ¡ aparece ao lado do valor, entÃ£o a cÃ©lula nÃ£o precisa ser autodescritiva. _(https://www.uxmatters.com/mt/archives/2020/07/designing-mobile-tables.php)_
- **FORMULÃRIOS â€” Usar type='text' + inputMode='decimal' para moeda, NÃƒO type='number'** — type='number' rejeita vÃ­rgulas (separador brasileiro), exibe setas de incremento imprÃ³prias para dinheiro e tem comportamento inconsistente entre browsers. type='text' com inputMode='decimal' abre teclado numÃ©rico com vÃ­rgula/ponto no mobile sem nenhum desses problemas. Formatar (R$ 1.234,56) sÃ³ no blur â€” formatar enquanto digita desloca o cursor de forma imprevisÃ­vel. _(https://uxpatterns.dev/patterns/forms/currency-input | https://css-tricks.com/better-form-inputs-for-better-mobile-user-experiences/)_
- **FORMULÃRIOS â€” Usar inputMode='tel' para telefone, NÃƒO type='tel'** — type='tel' obriga validaÃ§Ã£o de formato de telefone nativa do browser, que falha com DDD brasileiro. inputMode='tel' abre apenas o teclado numÃ©rico sem impor validaÃ§Ã£o. Normalizar antes de salvar: remover tudo que nÃ£o Ã© dÃ­gito (replace(/\D/g, '')), entÃ£o gravar sÃ³ os dÃ­gitos puros (ex.: '11987654321'). Exibir formatado ao usuÃ¡rio via mÃ¡scara visual, mas nunca persistir a mÃ¡scara. _(https://uxplanet.org/phone-number-field-design-best-practices-23957cbd86d5 | https://www.codebridge.tech/articles/phone-number-field-best-practices-5-essential-tips)_
- **FORMULÃRIOS â€” Aplicar mÃ¡scara visual enquanto o usuÃ¡rio digita, mas gravar sempre o dado limpo (normalizado)** — A mÃ¡scara orienta o usuÃ¡rio sobre o formato esperado ('(11) 98765-4321', 'R$ 1.234,56', 'ABC-1D23') mas o banco de dados deve receber o dado sem formataÃ§Ã£o ('11987654321', '123456', 'ABC1D23'). Bibliotecas como IMask e react-number-format fazem isso via propriedade onAccept/onChange que entrega o valor sem mÃ¡scara. Nunca salvar a string com parÃªnteses, traÃ§os ou sÃ­mbolo de moeda â€” esses caracteres quebram cÃ¡lculos e filtros. _(https://arthurpedroti.com.br/integracao-de-um-input-de-moeda-ou-qualquer-input-com-mascara-com-react-hook-form-e-zod/ | https://www.zuko.io/blog/8-tips-to-optimize-your-mobile-form-ux)_
- **FORMULÃRIOS â€” MÃ¡scara de placa brasileira: suportar padrÃ£o antigo (ABC-1234) e Mercosul (ABC-1D23), normalizar para maiÃºsculas sem hÃ­fen antes de salvar** — Placa Mercosul tem letra na quarta posiÃ§Ã£o. A mÃ¡scara deve aceitar os dois formatos dinamicamente (detectar no quarto caractere). Antes de salvar: .toUpperCase().replace(/[^A-Z0-9]/g, '') â€” grava 'ABC1D23' ou 'ABC1234'. A exibiÃ§Ã£o formata com hÃ­fen. Isso evita duplicatas no banco por diferenÃ§a de formato. _(https://coodesh.com/blog/carreiras/saiba-como-adicionar-mascara-em-react-na-criacao-de-formularios/ | https://www.npmjs.com/package/@react-br-forms/cpf-cnpj-mask)_
- **FORMULÃRIOS â€” Aceitar colagem de dado sujo e parsear automaticamente** — UsuÃ¡rios colam nÃºmeros de telefone com espaÃ§os, traÃ§os, parÃªnteses ou cÃ³digo de paÃ­s; colam valores com 'R$' e pontos. O sistema deve tratar o onPaste/onChange normalizando na entrada: replace(/\D/g, '') para telefone, parseFloat(value.replace(/[^0-9,]/g,'').replace(',','.')) para moeda. NÃ£o rejeitar â€” parsear. Isso reduz abandono de formulÃ¡rio. _(https://www.freshconsulting.com/insights/blog/autocomplete-benefits-ux-best-practices/ | https://digitalthriveai.com/en-us/resources/web-design/best-practices-for-mobile-form-design/)_
- **FORMULÃRIOS â€” Substituir <select> com mais de 15 opÃ§Ãµes por autocomplete/combobox** — Dropdowns nativos no mobile mostram poucos itens por vez e nÃ£o tÃªm busca por teclado (o recurso de digitar a inicial nÃ£o funciona bem em touch). Para listas longas (cidades, clientes, produtos), um campo de texto com sugestÃµes filtradas em tempo real (autocomplete/combobox) Ã© mais rÃ¡pido e com menos erros. <select> nativo Ã© aceitÃ¡vel atÃ© ~10 opÃ§Ãµes fixas e curtas. _(https://uxmovement.com/forms/stop-using-select-menus-for-known-user-input/ | https://smart-interface-design-patterns.com/articles/autocomplete-ux/)_
- **FORMULÃRIOS â€” Configurar autocomplete correto no atributo HTML para ativar o preenchimento automÃ¡tico do browser/OS** — O browser sabe preencher nome, telefone, endereÃ§o automaticamente se o campo tiver autocomplete='tel', autocomplete='street-address', etc. Em mobile isso poupa digitaÃ§Ã£o. Campos que NÃƒO devem ser autopreenchidos (placa, cÃ³digo de pedido, CPF de terceiro) devem ter autocomplete='off'. Usar o atributo correto Ã© gratuito e melhora materialmente a taxa de conclusÃ£o de formulÃ¡rios. _(https://css-tricks.com/better-form-inputs-for-better-mobile-user-experiences/ | https://www.uxpin.com/studio/blog/form-input-design-best-practices/)_
- **FORMULÃRIOS â€” Validar no schema (Zod) o dado limpo, nunca o dado mascarado** — Se o schema valida '(11) 98765-4321' com regex de mÃ¡scara, o campo falha para quem nÃ£o usou a mÃ¡scara exatamente. O correto Ã©: a mÃ¡scara entrega '11987654321' â†’ Zod valida /^\d{10,11}$/ (ou refine customizado). Isso desacopla a UI do modelo de dados e permite trocar a mÃ¡scara sem mudar a validaÃ§Ã£o. _(https://arthurpedroti.com.br/integracao-de-um-input-de-moeda-ou-qualquer-input-com-mascara-com-react-hook-form-e-zod/)_

