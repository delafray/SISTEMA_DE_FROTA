# Auditoria Mobile v4 (verificacao final) — madrugada 12/06/2026

> Quarta rodada cega, mesma receita (opus em financeiro + integridade). VEREDICTO: SECOU nos criterios que importam.

## Convergencia entre rodadas (criticos)

| Rodada | Criticos | Navegacao (veredicto cego) |
|---|---|---|
| v1 (tarde 11/06) | 11 | quebrada (voltar caia no login) |
| v2 (noite 11/06) | 13 (criterios novos) | fragil, majoritariamente corrigida |
| v3 (01:15) | 4 | fragil->boa (1 sobrevivente real) |
| v4 (07:00) | 6 (cauda longa, todos corrigidos na hora) | **SEGURO com ressalvas** |

- Financeiro (opus): ZERO criticos na v4 — fluxos de dinheiro endurecidos.
- Os 6 criticos da v4 eram cauda longa cirurgica e foram corrigidos pelo modelo principal na mesma hora: load() de pedidos sem try/catch (loading infinito em queda de rede); vinculo de entregas sem checagem no editar; erro de pagamento fora da viewport (virou toast fixo); plano de manutencao gravando a cada TECLA (virou blur); virgula->NaN no salario do motorista; confirmacao de REGISTRAR fire-and-forget (agora aguarda com loading). +1 alto: backdrop do Ciente nao descarta mais texto digitado.

## Veredicto da navegacao (integral)

SEGURO COM RESSALVAS para o cenÃ¡rio relatado (gestor no celular navegando por abas + botÃ£o voltar). O estado atual tem 4 camadas de defesa coerentes entre si: (1) todos os guards de pÃ¡gina do dashboard usam sessÃ£o LOCAL (cookie via getSession), tolerante a erro de rede, e SEMPRE router.replace â€” nunca push â€” entÃ£o o /login nÃ£o entra no histÃ³rico; (2) a pÃ¡gina /login tem guarda reversa: se uma entrada /login sobrar no histÃ³rico e a sessÃ£o for vÃ¡lida, devolve pro painel com replace; (3) o service worker Ã© rede-primeiro sem timeout para navegaÃ§Ã£o, NUNCA cacheia resposta redirecionada (que era o que gravava o HTML do login sob URL do dashboard) e o fallback offline Ã© POR ÃREA â€” dashboard offline cai numa pÃ¡gina 503 'Sem conexÃ£o', nunca no /login; (4) o proxy (middleware) sÃ³ renova cookies, jamais redireciona. O bug histÃ³rico (getUser() validando na rede a cada mount e chutando o gestor logado pro login em oscilaÃ§Ã£o de rede mÃ³vel) foi extirpado dos guards das telas de listagem/abas â€” restam apenas usos de getUser() que NÃƒO redirecionam (falham silenciosos) e dois pontos server-side residuais descritos nos riscos. NÃ£o estÃ¡ 'quebrado' em nenhum caminho que eu consiga reproduzir por leitura; chamo de 'com ressalvas' porque ainda existem janelas estreitas (abaixo) em que o login pode aparecer indevidamente.

## Backlog de polimento (nao bloqueante — para o dia a dia 'olha essa tela')

Restaram 163 achados, em maioria medios/baixos de polimento fino. Lista completa abaixo, por gravidade.

## CRITICO (6)

### [pedidos-listagem] [Listagem de Pedidos (page.tsx)] Estado de erro de carregamento â€” load() sem try/catch (linha 156-229)
- **Categoria:** guardrail · **Arquivo:** `src/app/(dashboard)/pedidos/page.tsx:156-229`
- **Problema:** A funÃ§Ã£o `load()` no useEffect (linha 156) nÃ£o tem try/catch. Se a query Supabase falhar por rede ou timeout, a Promise rejeita sem tratamento: `setLoading(false)` nunca Ã© chamado (estÃ¡ no `finally` de um bloco inexistente), entÃ£o a tela fica eternamente no estado de spinner/loading. O usuÃ¡rio leigo nÃ£o vÃª mensagem de erro e nÃ£o tem como saber o que aconteceu. EvidÃªncia: linha 229 `setLoading(false)` sÃ³ Ã© alcanÃ§ado no caminho feliz.
- **Sugestao:** Envolver o corpo de `load()` em try/catch/finally: mover `setLoading(false)` para um bloco `finally`, e exibir um estado de erro (`setErro`) com mensagem amigÃ¡vel ('NÃ£o foi possÃ­vel carregar os pedidos. Verifique sua conexÃ£o.') quando a query falhar.

### [pedidos-formularios] [Editar Pedido] Vincular novas entregas â€” sem feedback de erro quando `update` falha silenciosamente (linha 233-235)
- **Categoria:** guardrail · **Arquivo:** `src/app/(dashboard)/pedidos/[id]/editar/page.tsx`
- **Problema:** Na linha 234, ao vincular entregas selecionadas via `supabase.from('entregas').update(vinc).in(...)`, o cÃ³digo NÃƒO verifica o erro retornado (nÃ£o hÃ¡ `const { error } = await ...`; a linha faz `await supabase...` direto sem capturar o retorno). Se o vÃ­nculo falhar (RLS, rede, etc.), o usuÃ¡rio Ã© redirecionado para o despacho sem saber que as entregas nÃ£o foram vinculadas.
- **Sugestao:** Capturar o retorno: `const { error: errVinc } = await supabase.from('entregas').update(vinc).in('id', Array.from(selectedEntregas));` e verificar `if (errVinc) { setErr('Entregas nÃ£o vinculadas: ' + errVinc.message); setSaving(false); return; }` antes de redirecionar.

### [entregas] [Listagem de Pedidos (entregas/page.tsx)] Erro de gravaÃ§Ã£o de pagamento â€” erroPago sÃ³ aparece no topo da lista, fora da viewport apÃ³s scroll
- **Categoria:** guardrail · **Arquivo:** `src/app/(dashboard)/entregas/page.tsx`
- **Problema:** O estado erroPago Ã© exibido no topo do container de conteÃºdo (linha 467-472). No mobile, apÃ³s o usuÃ¡rio interagir com um card que estÃ¡ no meio/fim da lista (apÃ³s scroll), o erro aparece no topo da pÃ¡gina â€” fora da Ã¡rea visÃ­vel. O usuÃ¡rio clica em 'Receber', o modal some (pois setConfirmReceberPedido(null) Ã© chamado antes do await em linha 705), a operaÃ§Ã£o falha silenciosamente para o usuÃ¡rio que estÃ¡ scrollado para baixo e nÃ£o vÃª o banner de erro no topo.
- **Sugestao:** Exibir o erro de pagamento em um toast/snackbar fixo na parte inferior da tela (position: fixed; bottom: 72px) em vez de no topo do conteÃºdo scrollÃ¡vel, garantindo visibilidade independente da posiÃ§Ã£o de scroll.

### [veiculos-motoristas] [VeÃ­culos â€” Editar > Aba Plano de ManutenÃ§Ã£o (PlanoTab)] Campos 'Intervalo KM' e 'Intervalo Meses' editÃ¡veis inline na tabela/card (linhas 263-275 e 339-364)
- **Categoria:** guardrail · **Arquivo:** `src/app/(dashboard)/veiculos/[id]/editar/_components/PlanoTab.tsx`
- **Problema:** Os campos salvam automaticamente no banco via `onChange` sem debounce. Cada tecla digitada dispara `atualizarIntervalo` que faz um `.update()` imediato no Supabase. Um usuÃ¡rio que digita '50000' jÃ¡ salvou '5', '50', '500', '5000' antes de terminar, corrompendo o dado.
- **Sugestao:** Adicionar debounce de 800ms antes de disparar o update, ou usar `onBlur` ao invÃ©s de `onChange` para sÃ³ salvar quando o campo perder o foco.

### [veiculos-motoristas] [Motoristas â€” Editar (/motoristas/[id]/editar) > Aba RemuneraÃ§Ã£o] parseFloat sem tratamento de vÃ­rgula em salario_fixo e valor_diaria_por_pedido (linhas 132-133)
- **Categoria:** entrada-dado · **Arquivo:** `src/app/(dashboard)/motoristas/[id]/editar/page.tsx`
- **Problema:** `parseFloat(f.salario_fixo)` e `parseFloat(f.valor_diaria_por_pedido)` no handleSubmit do editar nÃ£o aplicam `.replace(',', '.')`. Se o usuÃ¡rio digitar '1.500,50', parseFloat retorna NaN e o banco salva NULL silenciosamente, sem nenhum erro exibido.
- **Sugestao:** Adicionar `.replace(',', '.')` antes de `parseFloat` nas linhas 132-133, igual ao tratamento jÃ¡ feito no cadastro de novo motorista (linhas 78-79 de novo/page.tsx).

### [regras-autorizacoes-relatorios] [Autorizacoes â€” modal confirmar REGISTRAR] Botao Confirmar (linha 418-420)
- **Categoria:** guardrail · **Arquivo:** `src/app/(dashboard)/autorizacoes/page.tsx`
- **Problema:** Ao conceder nivel REGISTRAR, o modal fecha ANTES do patch() terminar (setConfirmarRegistrar(null) e chamado antes do await na linha 419-420 â€” o patch e fire-and-forget aqui). Se o banco retornar erro, o modal ja fechou e o erro so aparece no banner erroOp que pode nao ser visto. Nao ha rollback visual imediato.
- **Sugestao:** Aguardar a resolucao do patch antes de fechar o modal: mover setConfirmarRegistrar(null) para dentro do callback de sucesso, e manter o modal aberto (com mensagem de erro) se o patch falhar.

## ALTO (35)

### [painel] [Painel â€” Modal CienteModal: botÃ£o 'Salvar e manter na tela'] BotÃ£o 'Salvar e manter na tela' desabilitado
- **Categoria:** affordance · **Arquivo:** `src/components/dashboard/LembretesWidget.tsx:167-179`
- **Problema:** Quando manterDesabilitado=true (lembrete pendente sem nota escrita), o botÃ£o fica com background:#fef3c7 e cor #b45309, cursor:default. Visualmente parece um badge colorido ou um estado de aviso, nÃ£o um botÃ£o desabilitado. A mensagem de por quÃª estÃ¡ desabilitado estÃ¡ apenas no title (tooltip), invisÃ­vel no mobile onde nÃ£o hÃ¡ hover.
- **Sugestao:** Exibir inline abaixo dos botÃµes uma dica textual quando o campo de nota estÃ¡ vazio ('Escreva a providÃªncia para poder manter na tela'), em vez de depender apenas do title tooltip. Usar opacity reduzida para indicar desabilitado mais claramente.

### [painel] [Painel â€” Modal CienteModal: duplo clique no backdrop fecha sem salvar] Overlay do CienteModal (onClick=onClose)
- **Categoria:** guardrail · **Arquivo:** `src/components/dashboard/LembretesWidget.tsx:101-107`
- **Problema:** O backdrop do CienteModal chama onClose diretamente (linha 101). Se o usuÃ¡rio digitou uma providÃªncia no textarea e toca acidentalmente fora do modal (comum no mobile ao rolar), o modal fecha e a nota digitada Ã© perdida sem nenhum aviso. NÃ£o hÃ¡ confirmaÃ§Ã£o de descarte.
- **Sugestao:** Verificar se nota.trim().length > 0 antes de fechar pelo backdrop. Se houver conteÃºdo, perguntar 'Tem certeza que quer sair? A providÃªncia escrita serÃ¡ perdida.' ou simplesmente bloquear o fechamento pelo backdrop quando hÃ¡ texto.

### [pedidos-listagem] [Listagem de Pedidos (page.tsx)] DeleteBtn â€” presente apenas na tabela desktop (linha 403), ausente no MobileCard
- **Categoria:** navegacao · **Arquivo:** `src/app/(dashboard)/pedidos/page.tsx:469-472`
- **Problema:** O botÃ£o Excluir (com confirmaÃ§Ã£o) estÃ¡ na coluna de aÃ§Ãµes da tabela desktop (linha 400-404), mas o MobileCard mobile (linhas 453-474) sÃ³ expÃµe 'Ver Despacho' como aÃ§Ã£o â€” nenhuma exclusÃ£o no mobile. Um usuÃ¡rio leigo usando apenas o celular nÃ£o consegue excluir um pedido pela listagem mobile; precisaria abrir a tela de ediÃ§Ã£o para isso (se disponÃ­vel lÃ¡). Isso cria assimetria funcional entre desktop e mobile.
- **Sugestao:** Adicionar o DeleteBtn nas actions do MobileCard, ou adicionar um segundo botÃ£o 'Excluir' que abre o mesmo modal de confirmaÃ§Ã£o. Como o MobileCard jÃ¡ tem onClick para ediÃ§Ã£o, usar e.stopPropagation() no botÃ£o excluir (padrÃ£o jÃ¡ adotado no 'Ver Despacho').

### [pedidos-listagem] [Listagem de Pedidos (page.tsx)] Prefetch de busca â€” 5 queries paralelas sem tratamento de erro (linhas 169-184)
- **Categoria:** integridade · **Arquivo:** `src/app/(dashboard)/pedidos/page.tsx:169-196`
- **Problema:** A lÃ³gica de busca no servidor dispara atÃ© 5 queries Supabase em paralelo (Promise.all, linha 169) sem try/catch. Se qualquer uma falhar, a Promise.all rejeita e o erro sobe para o `load()` externo â€” que tambÃ©m nÃ£o tem try/catch (problema anterior). AlÃ©m disso, se `cliIds` tiver 200 IDs e `pedidoIds` tiver 500, a string `id.in.(...)` enviada ao PostgREST pode ficar extremamente longa (>32KB), ultrapassando limites de URL e quebrando a query silenciosamente.
- **Sugestao:** Adicionar try/catch ao bloco de prefetch e limitar os arrays de IDs antes de montar o filtro `.or(id.in.(...))` (ex.: fatiar em chunks de 100 ou truncar com aviso). No mÃ­nimo, se a busca falhar, mostrar os resultados sem filtro de busca em vez de travar a tela.

### [pedidos-formularios] [Novo Pedido (simples)] Modal 'Salvar locais no cadastro' â€” botÃ£o 'NÃ£o salvar' (linha 769-776)
- **Categoria:** guardrail · **Arquivo:** `src/app/(dashboard)/pedidos/novo/page.tsx`
- **Problema:** O modal sÃ³ exibe o botÃ£o 'Salvar no cadastro' com loading, mas o botÃ£o 'NÃ£o salvar' nÃ£o tem `loading` nem `disabled` durante o `salvandoLocal`. Se o usuÃ¡rio clicar 'NÃ£o salvar' enquanto o salvamento jÃ¡ comeÃ§ou, a chamada `handleSalvarLocaisNoCadastro(false)` fecha o modal e navega embora, abandonando a operaÃ§Ã£o de gravaÃ§Ã£o em andamento sem que o usuÃ¡rio perceba o conflito.
- **Sugestao:** Enquanto `salvandoLocal === true`, desabilitar ambos os botÃµes do modal (jÃ¡ feito no 'Salvar', mas falta no 'NÃ£o salvar': adicionar `disabled={salvandoLocal}` ao botÃ£o 'NÃ£o salvar' â€” linha 773 jÃ¡ tem, conferir se o comportamento de navegar embora no meio do save Ã© intencional).

### [pedidos-formularios] [Importar Notas â€” EtapaUpload] Input file de XML / Planilha sem `disabled` durante `carregando` (linhas 148-159, 226-235)
- **Categoria:** guardrail · **Arquivo:** `src/app/(dashboard)/pedidos/importar/_components/EtapaUpload.tsx`
- **Problema:** Os inputs `type='file'` de XML e planilha nÃ£o ficam `disabled` durante o processamento (`carregando === true`). O usuÃ¡rio pode selecionar outro arquivo enquanto o parse do primeiro ainda estÃ¡ em curso, gerando dois processos concorrentes. O estado do relatÃ³rio (`relatorioLote`) pode ser sobrescrito pelo segundo arquivo antes do primeiro terminar.
- **Sugestao:** Adicionar `disabled={carregando}` aos inputs de file (linhas 148 e 229) para bloquear nova seleÃ§Ã£o enquanto o parse estÃ¡ em andamento. Alternativamente, cancelar o processo anterior antes de iniciar o novo.

### [despacho] [Despacho â€” detalhe (/despacho/[id]) â€” Aba Principal] FluxoStepper â€” botÃ£o da prÃ³xima aÃ§Ã£o sem texto de progresso
- **Categoria:** loading · **Arquivo:** `src/app/(dashboard)/despacho/[id]/_components/FluxoStepper.tsx:79`
- **Problema:** Em FluxoStepper.tsx linha 79, o Btn tem loading={acao.loading ?? acao.disabled}, mas o label passado Ã© estÃ¡tico (ex: 'â–¶ Iniciar Pedido'). Enquanto updatingStatus=true, o botÃ£o exibe spinner mas o rÃ³tulo nÃ£o muda â€” em tela pequena o spinner de 12px sozinho Ã© quase invisÃ­vel e o usuÃ¡rio nÃ£o sabe se algo estÃ¡ acontecendo.
- **Sugestao:** Passar label condicional na proximaAcao em AbaPrincipal.tsx: quando updatingStatus=true usar 'â–¶ Iniciando...' e 'âœ“ Concluindo...'. O FluxoStepper jÃ¡ expÃµe o prop label, basta o chamador passar o texto correto.

### [despacho] [Despacho â€” detalhe (/despacho/[id]) â€” ConfirmStatusModal] Modal â€” sem classes m-modal-content / m-modal-body
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/despacho/[id]/_components/ConfirmStatusModal.tsx:54-62`
- **Problema:** ConfirmStatusModal.tsx linha 54-62 usa position:fixed com padding:16px mas NÃƒO usa as classes m-modal-content e m-modal-body. No mobile.css linhas 99-116, essas classes forÃ§am padding-top da safe-area. Sem elas, em iPhones com Dynamic Island/notch, o topo do modal fica atrÃ¡s da ilha. Adicionalmente, a div do modal nÃ£o tem overflow-y:auto â€” com o teclado virtual aberto (textarea), os botÃµes podem sumir abaixo da tela.
- **Sugestao:** Adicionar className='m-modal-overlay' no overlay e 'm-modal-content m-modal-body' no container interno, igual ao ModalDespacho (ModalDespacho.tsx linhas 82-99). Isso resolve safe-area e overflow.

### [despacho] [Despacho â€” detalhe (/despacho/[id]) â€” pÃ¡gina principal] Estado erroGravacao compartilhado entre operaÃ§Ã£o manual e polling automÃ¡tico
- **Categoria:** integridade · **Arquivo:** `src/app/(dashboard)/despacho/[id]/page.tsx:281-287`
- **Problema:** O estado erroGravacao Ã© compartilhado entre operaÃ§Ãµes manuais (changeStatus, salvarLocais) e o polling de 10s das abas Rota/Mapa (page.tsx linhas 281-287). Se o polling falhar enquanto o usuÃ¡rio estÃ¡ lendo um erro de status crÃ­tico, o setErroGravacao sobrescreve com 'Falha ao atualizar dados da rota...' apagando o erro original â€” o usuÃ¡rio nÃ£o sabe mais o que deu errado na aÃ§Ã£o que tentou.
- **Sugestao:** Usar estados separados: erroGravacao para operaÃ§Ãµes manuais e erroPolling para o polling automÃ¡tico. Exibir erroPolling de forma menos intrusiva (ex.: Ã­cone de aviso no canto) para nÃ£o sobrescrever erros crÃ­ticos.

### [despacho] [Despacho â€” detalhe (/despacho/[id]) â€” pÃ¡gina principal] changeStatus â€” sem feedback de sucesso apÃ³s confirmar no modal
- **Categoria:** guardrail · **Arquivo:** `src/app/(dashboard)/despacho/[id]/page.tsx:195-206`
- **Problema:** ApÃ³s o usuÃ¡rio confirmar Iniciar/Concluir/Cancelar no ConfirmStatusModal e a gravaÃ§Ã£o ter sucesso (page.tsx linha 200), nenhum feedback positivo Ã© exibido â€” apenas o modal fecha e o Badge muda de cor. Em tela pequena, o usuÃ¡rio pode nÃ£o notar a mudanÃ§a do badge e ficar em dÃºvida se a aÃ§Ã£o funcionou. O despacho da lista jÃ¡ exibe 'Pedido despachado com sucesso!' por 4s.
- **Sugestao:** Adicionar estado sucesso temporÃ¡rio apÃ³s changeStatus bem-sucedido, exibindo ex.: 'Status atualizado para Em Andamento!' por 3 segundos, usando o mesmo padrÃ£o do Alert variant='success' jÃ¡ existente na tela.

### [despacho] [Despacho â€” lista (/despacho)] BotÃ£o 'Despachar N selecionados' no PageHeader â€” sem loading
- **Categoria:** loading · **Arquivo:** `src/app/(dashboard)/despacho/page.tsx:72-79`
- **Problema:** O Btn no PageHeader (page.tsx linhas 72-79) tem disabled={saving || modalAberto} mas NÃƒO tem loading={saving}. Ao clicar, o botÃ£o fica apenas desabilitado (aparÃªncia acinzentada) sem spinner â€” o usuÃ¡rio nÃ£o sabe se o sistema estÃ¡ processando. O FAB mobile equivalente (linha 221) jÃ¡ tem loading={saving} correto; o botÃ£o do header estÃ¡ incompleto.
- **Sugestao:** Adicionar loading={saving} ao Btn do PageHeader, igual ao FAB mobile da linha 221.

### [entregas] [Listagem de Pedidos (entregas/page.tsx)] BotÃ£o Salvar ausente no cabeÃ§alho mobile â€” apenas botÃ£o de Submit no rodapÃ© existe, mas a listagem nÃ£o tem formulÃ¡rio; o botÃ£o 'Atualizar' do editar estÃ¡ com classe m-hide
- **Categoria:** affordance · **Arquivo:** `src/app/(dashboard)/entregas/[id]/editar/page.tsx`
- **Problema:** Na tela de ediÃ§Ã£o (entregas/[id]/editar/page.tsx linha 162) o botÃ£o primÃ¡rio 'Atualizar' do PageHeader tem className='m-hide', ou seja, fica INVISÃVEL no mobile. O Ãºnico botÃ£o de submit visÃ­vel no mobile Ã© o que fica no rodapÃ© do scroll (linha 327). Se o usuÃ¡rio rolar o formulÃ¡rio e tentar salvar, pode nÃ£o encontrar o botÃ£o facilmente, mas o crÃ­tico Ã©: o botÃ£o primÃ¡rio de aÃ§Ã£o fica escondido no mobile pelo m-hide.
- **Sugestao:** Remover className='m-hide' do Btn type='submit' no PageHeader, ou garantir que o botÃ£o fixo do rodapÃ© seja sticky (position: sticky; bottom: 0) para ficar sempre visÃ­vel sem precisar rolar.

### [entregas] [Novo Pedido (entregas/novo/page.tsx)] Campo 'Valor do Pedido' com IMaskInput â€” inputMode ausente
- **Categoria:** entrada-dado · **Arquivo:** `src/app/(dashboard)/entregas/novo/page.tsx`
- **Problema:** O IMaskInput do campo Valor do Pedido (linha 242) nÃ£o define inputMode='decimal'. Em dispositivos iOS/Android, sem inputMode o teclado padrÃ£o (QWERTY) abre em vez do teclado numÃ©rico/decimal, forÃ§ando o usuÃ¡rio leigo a trocar de teclado para digitar o valor monetÃ¡rio.
- **Sugestao:** Adicionar inputMode='decimal' no IMaskInput de Valor do Pedido para abrir o teclado numÃ©rico no mobile automaticamente.

### [entregas] [Editar Pedido (entregas/[id]/editar/page.tsx)] Campo 'Valor do Pedido' com IMaskInput â€” inputMode ausente
- **Categoria:** entrada-dado · **Arquivo:** `src/app/(dashboard)/entregas/[id]/editar/page.tsx`
- **Problema:** Mesmo problema: o IMaskInput do Valor do Pedido na tela de ediÃ§Ã£o (linha 287) nÃ£o define inputMode='decimal'. O usuÃ¡rio leigo no mobile recebe o teclado QWERTY ao tocar no campo.
- **Sugestao:** Adicionar inputMode='decimal' no IMaskInput de Valor do Pedido (linha 287).

### [entregas] [Novo Pedido (entregas/novo/page.tsx)] BotÃ£o 'Criar Pedido' â€” sem botÃ£o no cabeÃ§alho mobile
- **Categoria:** affordance · **Arquivo:** `src/app/(dashboard)/entregas/novo/page.tsx`
- **Problema:** O PageHeader do Novo Pedido (linha 130-138) contÃ©m apenas os botÃµes 'Voltar' e 'Cancelar', sem botÃ£o de submit. O Ãºnico botÃ£o 'Criar Pedido' fica no rodapÃ© do scroll (linha 265). Em telas mobile com muitos campos e/ou teclado aberto, o botÃ£o de submit pode ficar oculto fora da Ã¡rea visÃ­vel. O usuÃ¡rio leigo, apÃ³s preencher campos e fechar o teclado, pode nÃ£o saber onde estÃ¡ o botÃ£o para confirmar.
- **Sugestao:** Adicionar o botÃ£o 'Criar Pedido' (type='submit') com position: sticky; bottom: 0; ao container de conteÃºdo, ou incluir um Btn type='submit' variant='primary' no PageHeader sem m-hide.

### [entregas] [Listagem de Pedidos (entregas/page.tsx)] ConfirmaÃ§Ã£o de recebimento â€” modal fecha antes do save concluir
- **Categoria:** loading · **Arquivo:** `src/app/(dashboard)/entregas/page.tsx`
- **Problema:** No onClick do botÃ£o 'Confirmar' do modal de recebimento (linha 703-707), o cÃ³digo executa setConfirmReceberPedido(null) para fechar o modal e em seguida chama await handleMarcarPago(pedidoId). O modal some imediatamente e nÃ£o hÃ¡ indicador de loading visÃ­vel na tela principal durante a operaÃ§Ã£o async. O loading={loadingPago.has(confirmReceberPedido)} no botÃ£o (linha 702) nunca Ã© visto porque o modal fecha antes do loading ser ativado em handleMarcarPago.
- **Sugestao:** Manter o modal aberto com o botÃ£o em estado loading enquanto handleMarcarPago executa (fechar somente no then/finally), ou exibir um spinner overlay na tela principal durante a operaÃ§Ã£o.

### [financeiro] [Financeiro > Despesas Avulsas (lista mobile)] MobileCard com onClick de editar + botoes de acao (Pagar / Desfazer / Excluir) dentro
- **Categoria:** affordance · **Arquivo:** `src/app/(dashboard)/financeiro/_components/AvulsasTab.tsx:304-328 (onClick do MobileCard) + src/components/mobile/index.tsx:30-31 (card propaga onClick) + src/components/ui/ds.tsx:83-88 (Btn sem stopPropagation)`
- **Problema:** No card mobile a despesa inteira tem onClick={() => abrirEditar(d)} e os botoes de acao ficam DENTRO desse card. O Btn nao chama stopPropagation (ds.tsx so repassa props no <button>), entao tocar em 'Pagar', 'Desfazer' ou 'Excluir' dispara TAMBEM o onClick do card e abre o modal de edicao por cima da acao. Para uma pessoa leiga isso e desconcertante: ela toca em 'Pagar' e abre uma tela de edicao; pior, o toque de 'Excluir' abre a confirmacao E o modal de editar ao mesmo tempo.
- **Sugestao:** Envolver o conteudo de 'actions' num <div onClick={e => e.stopPropagation()}> (ou repassar onClick com stopPropagation em cada Btn). Assim tocar nos botoes NAO abre o editar.

### [financeiro] [Financeiro > Recorrencias (lista mobile)] MobileCard com onClick de editar + botoes Ativar/Desativar e Excluir dentro
- **Categoria:** affordance · **Arquivo:** `src/app/(dashboard)/financeiro/_components/RecorrenciasTab.tsx:289-318 (onClick do card + actions sem stopPropagation)`
- **Problema:** Mesmo defeito da aba Avulsas: o card tem onClick={() => abrirEditar(r)} e os botoes de Ativar/Desativar e Excluir ficam dentro. Tocar em 'Desativar' ou 'Excluir' tambem abre o modal de editar a recorrencia porque o clique sobe pro card. Risco de o gestor leigo desativar/excluir uma despesa fixa (seguro, IPVA) achando que so abriu a edicao.
- **Sugestao:** Mesma correcao: bloquear a propagacao do clique nos botoes de acao do card (wrapper com onClick stopPropagation).

### [abastecimentos-adiantamentos] [Abastecimentos / Novo e Editar] Botoes Salvar/Atualizar no PageHeader (actions)
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/abastecimentos/novo/page.tsx:95-103 e src/app/(dashboard)/abastecimentos/[id]/editar/page.tsx:119-128`
- **Problema:** Os botoes de acao no PageHeader (Voltar, Cancelar, Salvar/Atualizar) estao envolvidos em <span className="m-hide">, ou seja, ficam completamente ocultos no mobile. O formulario nao tem nenhum outro botao de submissao visivel no topo para o usuario mobile â€” somente o rodape fixo sticky existe.
- **Sugestao:** Remover o m-hide do span de acoes do PageHeader, ou duplicar o botao Salvar fora do span para o mobile. O rodape sticky ja existe mas nao e visivel no header â€” o leigo nao sabe que pode rolar para baixo para salvar.

### [abastecimentos-adiantamentos] [Adiantamentos / Novo e Editar] Botoes Salvar/Atualizar no PageHeader (actions)
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/adiantamentos/novo/page.tsx:86-93 e src/app/(dashboard)/adiantamentos/[id]/editar/page.tsx:130-137`
- **Problema:** Identico ao abastecimentos: os botoes do PageHeader estao em <span className="m-hide"> e ficam invisiveis no mobile. Apenas o rodape sticky tem botao de salvar.
- **Sugestao:** Remover o m-hide do span de acoes, ou adicionar um botao Salvar visivel no header mobile.

### [veiculos-motoristas] [VeÃ­culos â€” Cadastrar Novo (/veiculos/novo)] BotÃ£o 'Salvar VeÃ­culo' no rodapÃ© do formulÃ¡rio (linha 222)
- **Categoria:** loading · **Arquivo:** `src/app/(dashboard)/veiculos/novo/page.tsx`
- **Problema:** Existe um segundo botÃ£o 'Salvar VeÃ­culo' no rodapÃ© (linha 222) com `disabled={saving}` sem a prop `loading`, enquanto o botÃ£o do PageHeader (linha 83) usa `loading={saving}`. O botÃ£o do rodapÃ© nÃ£o exibe spinner durante o salvamento, criando inconsistÃªncia: um botÃ£o anima, outro sÃ³ fica cinza.
- **Sugestao:** Substituir `disabled={saving}` por `loading={saving}` no Btn do rodapÃ© (linha 222) para exibir spinner e texto 'Salvando...' de forma consistente com o botÃ£o do header.

### [veiculos-motoristas] [Motoristas â€” Cadastrar Novo (/motoristas/novo)] BotÃ£o 'Salvar Motorista' no PageHeader e no rodapÃ© do formulÃ¡rio (linhas 99 e 255)
- **Categoria:** loading · **Arquivo:** `src/app/(dashboard)/motoristas/novo/page.tsx`
- **Problema:** Nenhum dos dois botÃµes de salvar usa a prop `loading` do Btn (ambos usam apenas `disabled={saving}`). O usuÃ¡rio leigo nÃ£o vÃª nenhum indicador visual de progresso alÃ©m do botÃ£o ficar cinza, podendo clicar vÃ¡rias vezes.
- **Sugestao:** Usar `loading={saving}` nos dois botÃµes de salvar (PageHeader linha 99 e rodapÃ© linha 255) para exibir spinner e bloquear clique duplo de forma visÃ­vel.

### [veiculos-motoristas] [VeÃ­culos â€” Editar (/veiculos/[id]/editar) > Aba ManutenÃ§Ãµes] BotÃ£o 'Salvar manutenÃ§Ã£o' no formulÃ¡rio inline (linha 452)
- **Categoria:** loading · **Arquivo:** `src/app/(dashboard)/veiculos/[id]/editar/_components/ManutencoesTab.tsx`
- **Problema:** `<Btn type='button' onClick={lancar} disabled={salvando || kmIndisponivel}>` â€” o botÃ£o nÃ£o usa `loading={salvando}`, portanto apenas fica desabilitado sem spinner quando o usuÃ¡rio clica para salvar.
- **Sugestao:** Mudar para `loading={salvando}` no Btn (linha 452) para exibir spinner durante o salvamento.

### [veiculos-motoristas] [VeÃ­culos â€” Editar (/veiculos/[id]/editar) > Aba Avarias] BotÃ£o 'Salvar avaria' no formulÃ¡rio inline (linha 136)
- **Categoria:** loading · **Arquivo:** `src/app/(dashboard)/veiculos/[id]/editar/_components/AvariasTab.tsx`
- **Problema:** `disabled={salvando}` sem `loading={salvando}`. NÃ£o hÃ¡ spinner durante o salvamento da avaria, o leigo nÃ£o sabe se o sistema recebeu o clique.
- **Sugestao:** Substituir `disabled={salvando}` por `loading={salvando}` no botÃ£o 'Salvar avaria' (linha 136).

### [veiculos-motoristas] [Motoristas â€” Acerto Mensal (AcertoMensalTab)] Resumo lateral (coluna direita, linha 539) com `order: 1` no mobile via m-stack
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/motoristas/[id]/editar/_components/AcertoMensalTab.tsx`
- **Problema:** No mobile a coluna do resumo escuro (#0f172a) aparece no TOPO da tela antes dos pedidos e ajustes. O botÃ£o 'Fechar Acerto' fica logo acima do fold, e toda a seÃ§Ã£o de ajustes fica abaixo. O leigo pode fechar o acerto sem ver os ajustes cadastrados.
- **Sugestao:** No mobile, mover o resumo para o final da pÃ¡gina (remover order:1 no mobile ou mudar para order:99) e exibir apenas o total compacto no topo.

### [veiculos-motoristas] [Motoristas â€” Acerto Mensal (AcertoMensalTab)] BotÃµes 'Confirmar que jÃ¡ paguei' e 'Apenas Agendar' no modal Step 2 (linhas 652-699)
- **Categoria:** loading · **Arquivo:** `src/app/(dashboard)/motoristas/[id]/editar/_components/AcertoMensalTab.tsx`
- **Problema:** Ambos os botÃµes usam `<button>` com `disabled={saving}` sem spinner. O botÃ£o 'Confirmar' muda de cor e texto para 'Processando...' mas sem animaÃ§Ã£o. O leigo que viu 'Processando...' sem feedback visual pode clicar novamente.
- **Sugestao:** Refatorar os dois botÃµes para usar o componente Btn com `loading={saving}` para exibir spinner consistente durante o processamento.

### [veiculos-motoristas] [VeÃ­culos â€” Editar > Bloco VinculoResponsavel] Popup 'Trocar vÃ­nculo' â€” botÃµes 'Cancelar'/'Confirmar' podem ficar fora da tela (linhas 261-264)
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/veiculos/[id]/editar/_components/VinculoResponsavel.tsx`
- **Problema:** O popup usa `m-modal-content` que no mobile vira tela cheia (100vh). Com muitos motoristas na lista (maxHeight: 200 com scroll), mais campos de KM, data e chips, o rodapÃ© com botÃµes 'Cancelar'/'Confirmar' pode ficar inacessÃ­vel sem o usuÃ¡rio perceber que precisa rolar.
- **Sugestao:** Adicionar `paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)'` no rodapÃ© do popup e garantir que o scroll do modal cobre atÃ© os botÃµes. Considerar fixar os botÃµes no fundo via `position: sticky; bottom: 0`.

### [veiculos-motoristas] [Motoristas â€” Editar (/motoristas/[id]/editar)] BotÃ£o 'Atualizar Motorista' no rodapÃ© (linha 384)
- **Categoria:** loading · **Arquivo:** `src/app/(dashboard)/motoristas/[id]/editar/page.tsx`
- **Problema:** O botÃ£o do rodapÃ© usa `disabled={saving}` sem `loading`, enquanto o botÃ£o no PageHeader (linha 165) usa `loading={saving}`. HÃ¡ inconsistÃªncia: o header tem spinner, o rodapÃ© nÃ£o.
- **Sugestao:** Trocar `disabled={saving}` por `loading={saving}` no Btn do rodapÃ© (linha 384).

### [veiculos-motoristas] [VeÃ­culos â€” Listagem e Motoristas â€” Listagem] Uso de `loadAll` nas queries principais (veiculos/page.tsx linha 40, motoristas/page.tsx linha 41)
- **Categoria:** integridade · **Arquivo:** `src/app/(dashboard)/veiculos/page.tsx`
- **Problema:** Ambas as listagens usam `loadAll` (que varre o banco inteiro) em vez de paginaÃ§Ã£o incremental com `.range()`. Viola a REGRA DO DONO documentada no CLAUDE.md: listagens que crescem nÃ£o podem usar loadAll.
- **Sugestao:** Substituir `loadAll` por paginaÃ§Ã£o incremental de 100 em 100 com `.range()` e busca/filtros no servidor via `.ilike()`, em ambas as pÃ¡ginas de listagem.

### [cadastros] [Clientes / Novo â€” rodapÃ© do formulÃ¡rio] BotÃ£o 'Salvar Cliente' no rodapÃ©
- **Categoria:** loading · **Arquivo:** `src/app/(dashboard)/clientes/novo/page.tsx:341`
- **Problema:** O botÃ£o do rodapÃ© usa '<Btn type="submit" disabled={isSubmitting}>' sem a prop 'loading={isSubmitting}' (linha 341). Quando o formulÃ¡rio Ã© submetido, esse botÃ£o fica desabilitado mas NÃƒO exibe o spinner â€” o BtnSpinner sÃ³ renderiza quando loading=true (ds.tsx:86). O usuÃ¡rio no mobile nÃ£o vÃª nenhum indicador visual de carregamento neste botÃ£o.
- **Sugestao:** Alterar para '<Btn type="submit" loading={isSubmitting} disabled={isSubmitting}>'. O botÃ£o do PageHeader (linha 147) jÃ¡ estÃ¡ correto e serve de referÃªncia.

### [cadastros] [Clientes / Editar â€” aba Locais de Carregamento] BotÃ£o de excluir local (Trash2)
- **Categoria:** guardrail · **Arquivo:** `src/app/(dashboard)/clientes/[id]/editar/page.tsx:459`
- **Problema:** O botÃ£o Trash2 (linha 459) remove o local IMEDIATAMENTE ao clicar, sem nenhuma confirmaÃ§Ã£o. Ã‰ diferente do botÃ£o de excluir contatos da mesma tela, que tem confirmaÃ§Ã£o inline. Um toque acidental no mobile apaga o local sem possibilidade de recuperaÃ§Ã£o.
- **Sugestao:** Adotar o mesmo padrÃ£o de confirmaÃ§Ã£o inline jÃ¡ existente para contatos (estado confirmRemoveIdx), mostrando 'Remover?' com botÃµes 'Sim'/'NÃ£o' antes de chamar setLocais(prev => prev.filter(...)).

### [regras-autorizacoes-relatorios] [Autorizacoes â€” modal Novo/Editar telefone] Botoes Cancelar e Salvar/Inserir (constantes btnPri e btnGhost)
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/autorizacoes/page.tsx`
- **Problema:** Os botoes do modal usam padding '8px 14px' e fontSize 13, sem minHeight definido (linha 466-467). No mobile esses botoes ficam abaixo de 44px de altura, tornando-os dificeis de tocar para um leigo.
- **Sugestao:** Adicionar minHeight: 44 nas constantes btnPri e btnGhost (linhas 466-467): btnPri: { padding: '8px 14px', minHeight: 44, ... }, btnGhost: { padding: '8px 14px', minHeight: 44, ... }.

### [regras-autorizacoes-relatorios] [Autorizacoes â€” modal confirmar REGISTRAR] Botao Confirmar (linha 418)
- **Categoria:** loading · **Arquivo:** `src/app/(dashboard)/autorizacoes/page.tsx`
- **Problema:** O botao Confirmar que concede acesso critico de REGISTRAR (escreve dados via bot) usa o estilo btnPri sem minHeight â€” mesmo problema de alvo de toque. Alem disso, ao confirmar o botao nao exibe nenhum estado de carregamento: o patch() e async mas o botao fecha o modal imediatamente (linha 419-420), deixando o usuario sem feedback de que a operacao foi salva.
- **Sugestao:** Adicionar estado 'salvandoConfirm' (como existe salvandoTel) ao confirmar acesso REGISTRAR, desabilitar o botao durante o patch e exibir 'Confirmando...' ate concluir. Tambem adicionar minHeight: 44 ao botao.

### [regras-autorizacoes-relatorios] [Autorizacoes â€” Empresas x Gestor] Funcao toggle â€” remocao de vinculo sem confirmacao (linha 48-65)
- **Categoria:** guardrail · **Arquivo:** `src/app/(dashboard)/autorizacoes/empresas/page.tsx`
- **Problema:** Desmarcar uma empresa (remover vinculo usuario_empresas) e uma acao que pode impedir o usuario de ver dados inteiros do sistema. A remocao e imediata ao clicar no toggle sem nenhuma confirmacao. Um leigo pode desmarcar por acidente e nao perceber as consequencias (usuario deixa de ver pedidos/entregas daquela empresa).
- **Sugestao:** Adicionar confirmacao ao remover o ultimo vinculo de um usuario (quando tinha so uma empresa marcada) ou ao clicar 'desmarcar todas', alertando que o usuario perdera acesso aos dados daquela empresa.

### [integridade-gravacao] [Editar Pedido (dentro do Despacho)] handleSubmit â€” vÃ­nculo de novas entregas ao pedido
- **Categoria:** integridade · **Arquivo:** `src/app/(dashboard)/pedidos/[id]/editar/page.tsx:230-236`
- **Problema:** A terceira gravaÃ§Ã£o do submit â€” supabase.from('entregas').update({ pedido_id: id, ... }).in('id', selectedEntregas) â€” Ã© feita SEM capturar erro e SEM checar o retorno. Se essa atualizaÃ§Ã£o falhar (RLS, conexÃ£o, constraint), o cÃ³digo segue direto para router.push(`/despacho/${id}`) + refresh. O gestor selecionou N entregas na aba 'Adicionar Entregas', clicou em 'Confirmar +N entregas', a tela navega para o despacho com sucesso aparente, mas as entregas NÃƒO foram vinculadas ao pedido. Perda silenciosa: o pedido fica sem as entregas que o gestor acha que adicionou, sem nenhum aviso. As duas gravaÃ§Ãµes anteriores (pedido e cliente das entregas) checam erro; sÃ³ esta â€” a que Ã© o objetivo da aba â€” nÃ£o checa.
- **Sugestao:** Capturar o erro: const { error: errVinc } = await supabase.from('entregas').update(vinc).in('id', Array.from(selectedEntregas)); if (errVinc) { setErr(`Pedido salvo, mas erro ao vincular as entregas selecionadas: ${errVinc.message}`); setSaving(false); return; } â€” abortando o redirect quando o vÃ­nculo falha, igual jÃ¡ Ã© feito nas duas gravaÃ§Ãµes anteriores.

## MEDIO (85)

### [painel] [Painel â€” Pedidos Recentes (tabela desktop)] Tabela de pedidos recentes â€” coluna motorista/placa
- **Categoria:** tabela · **Arquivo:** `src/app/(dashboard)/page.tsx:351-366`
- **Problema:** A tabela desktop (classe m-hide) nÃ£o aplica truncate nas colunas de texto livre: nome do motorista (td sem max-width nem overflow:hidden nem textOverflow:ellipsis) e placa aparecem sem limitaÃ§Ã£o. Nomes longos quebram a linha e desalinham a linha inteira. Coluna de valor tem textAlign:right mas as colunas adjacentes de texto nÃ£o tÃªm largura mÃ­nima/mÃ¡xima definida.
- **Sugestao:** Adicionar maxWidth (ex. 120px) com overflow:hidden e textOverflow:ellipsis nas cÃ©lulas de nome do motorista e placa. Usar whiteSpace:nowrap nas cÃ©lulas de data e valor para evitar quebra.

### [painel] [Painel â€” SeÃ§Ã£o 'Em Rota Agora'] Grid de cards de pedidos em andamento
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/page.tsx:304`
- **Problema:** O grid usa gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' sem classe responsiva nem override mobile. Em 390px cabem exatamente 1,5 coluna (390 - 32px de padding = 358px; minmax(240px) forÃ§a 1 coluna, mas auto-fill pode tentar encaixar 2 e truncar). O cartÃ£o interno tem flexWrap:wrap nos metadados, o que Ã© bom, mas o grid pode criar scroll horizontal lateral se o minmax nÃ£o colapsar corretamente em alguns browsers mÃ³veis.
- **Sugestao:** Trocar por gridTemplateColumns: '1fr' no mobile via classe m-grid ou adicionar uma media query inline com @media. Ou usar minmax(min(240px, 100%), 1fr) para garantir colapso em tela pequena.

### [painel] [Painel â€” SeÃ§Ã£o 'Status da Frota Agora'] Grid de cartÃµes de status da frota
- **Categoria:** tabela · **Arquivo:** `src/app/(dashboard)/page.tsx:238-260`
- **Problema:** O grid usa gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' inline sem classe responsiva. Em 390px com 16px de padding em cada lado, a Ã¡rea Ãºtil Ã© ~358px. Com minmax(150px), o browser tenta encaixar 2 colunas (2Ã—150 = 300px), o que funciona. Mas se tiver muitos veÃ­culos, os textos internos (modelo do veÃ­culo) tÃªm fontSize:11px sem truncate â€” textos como 'VOLKSWAGEN CONSTELLATION 24.280' quebram em vÃ¡rias linhas dentro do cartÃ£o de 150px, desalinhando a grid.
- **Sugestao:** Adicionar overflow:hidden e textOverflow:ellipsis com whiteSpace:nowrap na div do modelo (linha 255). Considerar minmax(140px, 1fr) com maxWidth total nos cartÃµes.

### [painel] [Painel â€” KPI grid de 3 e 4 cards] Grids kpi-grid-3 e kpi-grid-4
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/page.tsx:268-294`
- **Problema:** Os grids de KPI usam a classe m-kpi-grid que forÃ§a 2 colunas no mobile (globals.css:111 e 114). kpi-grid-3 com 3 itens em 2 colunas resulta em um card sozinho na segunda linha ocupando metade da largura, quebrando o alinhamento visual. kpi-grid-4 tambÃ©m cria linha de 2+2, o que Ã© aceitÃ¡vel, mas o card 'Adiantamentos Pendentes' â€” que Ã© um Link envolvendo o KpiCard â€” nÃ£o tem minHeight:44px no elemento Link, apenas no KpiCard interno, podendo reduzir o alvo de toque.
- **Sugestao:** Para kpi-grid-3: usar grid-template-columns: repeat(3, 1fr) no mobile (3 cards pequenos) ou forÃ§ar layout 1Ã—3 empilhado. Para o Link do adiantamento: adicionar display:block e minHeight:44px ao Link.

### [painel] [Painel â€” Lembretes Widget: botÃ£o 'Ciente' no estado sem pendentes] BotÃ£o 'HistÃ³rico de lembretes' (sem lembretes pendentes)
- **Categoria:** affordance · **Arquivo:** `src/components/dashboard/LembretesWidget.tsx:537-548`
- **Problema:** Quando nÃ£o hÃ¡ lembretes pendentes, o botÃ£o 'HistÃ³rico de lembretes' Ã© renderizado com background:none e border:1px solid #e2e8f0 com cor #94a3b8 â€” cinza claro sobre branco. Para um gestor leigo no celular, esse botÃ£o parece texto puro desabilitado, nÃ£o uma aÃ§Ã£o clicÃ¡vel. NÃ£o hÃ¡ nenhuma pista visual de que Ã© um botÃ£o funcional.
- **Sugestao:** Usar uma cor de borda e texto mais distintos (ex.: #64748b para texto, border #cbd5e1) ou adicionar um Ã­cone de seta. Considerar manter algum indicador mesmo sem pendentes, como 'Nenhum lembrete pendente â€” ver histÃ³rico' com uma cor que deixe claro que Ã© aÃ§Ã£o.

### [painel] [Painel â€” Modal HistoricoModal: carregamento sem feedback de erro de rede] HistoricoModal â€” estado de loading
- **Categoria:** loading · **Arquivo:** `src/components/dashboard/LembretesWidget.tsx:273-283`
- **Problema:** No HistoricoModal, o loading inicial mostra 'Carregando...' (linha 274), mas nÃ£o hÃ¡ indicador de progresso nem timeout. Se a rede estiver lenta (comum no mobile), o usuÃ¡rio vÃª o texto estÃ¡tico 'Carregando...' sem spinner e sem botÃ£o de 'Tentar novamente' â€” o widget principal tem esse botÃ£o mas o modal nÃ£o o expÃµe de forma acessÃ­vel.
- **Sugestao:** Adicionar um spinner SVG ao texto 'Carregando...' no HistoricoModal. Expor um botÃ£o 'Tentar novamente' no estado de erro dentro do modal (o erro jÃ¡ Ã© mostrado, mas falta o botÃ£o de retry).

### [painel] [Painel â€” Alertas: links de alerta com texto truncado] Link de alerta â€” span com textOverflow:ellipsis
- **Categoria:** tabela · **Arquivo:** `src/app/(dashboard)/page.tsx:222`
- **Problema:** Os links de alerta tÃªm whiteSpace:nowrap com textOverflow:ellipsis (linha 222), o que trunca a mensagem de alerta em telas pequenas. Uma mensagem como 'IPVA vencido: VOLKSWAGEN CONSTELLATION (01/01/2025)' pode ser cortada para 'IPVA vencido: VOLKS...' perdendo a informaÃ§Ã£o do veÃ­culo. O leigo nÃ£o sabe o que foi truncado sem tocar para editar.
- **Sugestao:** Permitir quebra de linha nos alertas mobile (remover whiteSpace:nowrap) e adicionar padding adequado. O title jÃ¡ estÃ¡ presente, mas Ã© inÃºtil no mobile. Alternativamente usar display:block com 2 linhas via -webkit-line-clamp:2 para exibir mais contexto.

### [painel] [Painel â€” Sidebar desktop: botÃ£o 'Sair'] BotÃ£o de logout na Sidebar
- **Categoria:** guardrail · **Arquivo:** `src/components/layout/Sidebar.tsx:252-278`
- **Problema:** O botÃ£o 'Sair' (linha 252 do Sidebar.tsx) tem estado saindo com texto 'Saindo...' e cursor:wait, mas nÃ£o desabilita visualmente de forma clara â€” opacity:0.6 Ã© sutil. Mais importante: nÃ£o hÃ¡ nenhuma confirmaÃ§Ã£o de logout. No mobile, o usuÃ¡rio pode tocar 'Sair' por acidente no drawer e ser deslogado imediatamente sem aviso.
- **Sugestao:** Adicionar um window.confirm ou modal simples 'Tem certeza que quer sair?' antes de executar o signOut. No mobile, saÃ­das acidentais sÃ£o frequentes.

### [painel] [Painel â€” Drawer mobile: sem safe-area-inset-top no conteÃºdo scrollÃ¡vel] MobileDrawer â€” Ã¡rea de conteÃºdo da SidebarContent
- **Categoria:** layout · **Arquivo:** `src/components/layout/Sidebar.tsx:176`
- **Problema:** O drawer mobile renderiza SidebarContent com overflowY:auto mas nÃ£o aplica paddingTop com safe-area-inset-top no scroll container interno (linha 176 de Sidebar.tsx). Em iPhones com notch/Dynamic Island, os primeiros itens de navegaÃ§Ã£o ficam parcialmente atrÃ¡s da barra de status quando o drawer estÃ¡ aberto, tornando o primeiro item difÃ­cil de tocar.
- **Sugestao:** Adicionar paddingTop: 'env(safe-area-inset-top, 0px)' no container de navegaÃ§Ã£o interno do drawer, ou no header do drawer que jÃ¡ tem padding:12px (linha 376), garantindo que o conteÃºdo comece abaixo da Dynamic Island.

### [pedidos-listagem] [Listagem de Pedidos (page.tsx)] MobileCard â€” actions: botÃ£o 'Ver Despacho' (linha 470)
- **Categoria:** affordance · **Arquivo:** `src/app/(dashboard)/pedidos/page.tsx:453-473`
- **Problema:** O botÃ£o 'Ver Despacho' usa `variant='ghost'` e `size='sm'` (padding 4px 12px, fontSize 11px). A classe `m-touch` garante min-height 44px no mobile (mobile.css:131) â€” ok. PorÃ©m o `MobileCard` inteiro jÃ¡ Ã© clicÃ¡vel (`onClick={() => router.push('/pedidos/${p.id}/editar')}`). Ao tocar no botÃ£o 'Ver Despacho' dentro do card, o `e.stopPropagation()` (linha 470) impede a navegaÃ§Ã£o para /editar, mas o card visual inteiro muda de aparÃªncia (m-card:active â€” transform scale) ao toque no botÃ£o, pois o `:active` CSS sobe pela cadeia de DOM. Isso dÃ¡ feedback enganoso: parece que o card inteiro foi ativado, quando sÃ³ o botÃ£o foi clicado.
- **Sugestao:** Adicionar `pointer-events: none` ao container do card quando o toque for sobre um action button, ou mudar a lÃ³gica para que o card nÃ£o aplique :active quando o alvo for um filho interativo. Alternativamente, remover o onClick do MobileCard e tornar o tÃ­tulo/Ã¡rea principal um link explÃ­cito, deixando os botÃµes como Ãºnicos alvos.

### [pedidos-listagem] [Listagem de Pedidos (page.tsx)] MobileCard â€” detalhe 'VeÃ­culo' com placa+modelo (linha 451)
- **Categoria:** tabela · **Arquivo:** `src/app/(dashboard)/pedidos/page.tsx:451 e src/components/mobile/index.tsx:96`
- **Problema:** Quando nÃ£o hÃ¡ `apelido`, o valor exibido Ã© `'${veiculo.placa} â€¢ ${veiculo.modelo}'` (ex.: 'ABC-1234 â€¢ Volvo FH 460'). No grid de detalhes do MobileCard cada cÃ©lula tem largura ~1fr (~155px em 390px). O valor nÃ£o tem truncate/overflow no MobileCard.details (index.tsx:96-99 â€” apenas `fontSize:13px`, sem whiteSpace/overflow), entÃ£o uma string longa quebra em duas linhas e desalinha o grid do item vizinho.
- **Sugestao:** Adicionar `overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'` no estilo do `<div>` de valor em MobileCard.details (index.tsx:96). Ou truncar o veicLabel para no mÃ¡ximo ~20 chars antes de passar ao details.

### [pedidos-listagem] [Listagem de Pedidos (page.tsx)] PaginaÃ§Ã£o mobile â€” Btn 'â† Anterior' e 'PrÃ³xima â†’' (Paginacao.tsx:34-50)
- **Categoria:** outro · **Arquivo:** `src/app/(dashboard)/pedidos/page.tsx:436 e src/components/mobile/index.tsx:140`
- **Problema:** O componente Paginacao retorna `null` quando `totalPaginas <= 1` (linha 22). Quando hÃ¡ dados mas ainda estÃ¡ carregando a primeira pÃ¡gina (`loading=true`, `totalPaginas=0`), os botÃµes nÃ£o aparecem â€” ok. PorÃ©m quando a busca retorna 0 resultados, `total=0` e `totalPaginas=0`, e o componente desaparece silenciosamente, sem indicar ao usuÃ¡rio que a busca nÃ£o teve resultado. Quem exibe o estado vazio Ã© o MobileList â€” mas ele conta os itens filhos via `React.Children.toArray(children)` (index.tsx:150). Quando loading=false e filtradas.length=0, o map retorna zero elementos, entÃ£o o MobileList exibe o emptyMessage corretamente ('Nenhum registro encontrado.'). NÃ£o Ã© bug crÃ­tico, mas a mensagem padrÃ£o de empty ('Nenhum registro encontrado.') nÃ£o menciona que o filtro ativo pode estar escondendo pedidos, deixando o leigo sem contexto.
- **Sugestao:** Passar `emptyMessage` ao MobileList contextualizado com o filtro ativo: ex. `filtro === 'abertos' ? 'Nenhum pedido em aberto. Use o filtro para ver todos.' : 'Nenhum pedido encontrado para este filtro.'`

### [pedidos-listagem] [Redirect /pedidos/[id] (page.tsx)] PÃ¡gina de redirect â€” timeout de 3s com estado de erro (linha 27)
- **Categoria:** outro · **Arquivo:** `src/app/(dashboard)/pedidos/[id]/page.tsx:27`
- **Problema:** A lÃ³gica usa `setTimeout(() => setErro(true), id ? 3000 : 0)` (linha 27). Quando `id` existe, o redirect ocorre imediatamente via `router.replace`. O timeout de 3s serve como fallback se o redirect nÃ£o disparar. PorÃ©m, apÃ³s o `router.replace` ser chamado, o componente ainda estÃ¡ montado durante a transiÃ§Ã£o de rota. Se a navegaÃ§Ã£o demorar (conexÃ£o lenta), o timeout de 3s expira ANTES da desmontagem e exibe a tela de erro ('NÃ£o foi possÃ­vel abrir o pedido') mesmo quando o redirect vai funcionar. O usuÃ¡rio leigo vÃª uma mensagem de erro desnecessÃ¡ria.
- **Sugestao:** Aumentar o timeout para pelo menos 5-6s, ou melhor: cancelar o timeout quando a navegaÃ§Ã£o tiver sido iniciada com sucesso, usando uma ref de controle. O fallback de erro deveria ser o Ãºltimo recurso, nÃ£o interferir em redirecionamentos lentos.

### [pedidos-formularios] [Novo Pedido (simples)] Grid 2 colunas 'Valor do Pedido / Data Prevista' (linha 597)
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/pedidos/novo/page.tsx`
- **Problema:** O grid usa classe `m-grid` que colapsa para 1 coluna no mobile, mas o campo de valor usa IMaskInput sem `value` controlado e sem `boxSizing`. Em 390px, `width: 100%` dentro de um flex container sem `box-sizing: border-box` pode ultrapassar a borda do cartÃ£o dependendo do padding acumulado (24px Ã— 2 = 48px de padding no card). O campo de data tambÃ©m nÃ£o tem `boxSizing`.
- **Sugestao:** Adicionar `boxSizing: 'border-box'` ao `inputStyle` global em ds.tsx (ou no IMaskInput especificamente), garantindo que o campo nÃ£o estoure o container com padding.

### [pedidos-formularios] [Novo Pedido (simples)] BotÃ£o 'desvincular local' (Ã­cone âˆ’) para locais avulsos (linha 510-523)
- **Categoria:** affordance · **Arquivo:** `src/app/(dashboard)/pedidos/novo/page.tsx`
- **Problema:** O botÃ£o de remoÃ§Ã£o de local avulso usa o caractere 'âˆ’' (menos) sem texto descritivo e sem `aria-label`. Para um usuÃ¡rio leigo num celular, o sÃ­mbolo 'âˆ’' sozinho dentro de um botÃ£o pequeno nÃ£o Ã© imediatamente reconhecÃ­vel como 'remover'. O `title` funciona sÃ³ no desktop (hover). No mobile touch nÃ£o aparece.
- **Sugestao:** Substituir 'âˆ’' por 'Remover' ou 'âœ• Remover', ou adicionar `aria-label='Remover local'`. Garantir tamanho de toque mÃ­nimo de 44px (jÃ¡ estÃ¡: width/height 44px, ok).

### [pedidos-formularios] [Novo Pedido (simples)] Aviso de valor zero (warnValorZero) â€” fluxo de re-submit (linhas 192-194)
- **Categoria:** guardrail · **Arquivo:** `src/app/(dashboard)/pedidos/novo/page.tsx`
- **Problema:** Quando o usuÃ¡rio informa R$0,00, o formulÃ¡rio retorna um `Alert` de warning pedindo para clicar novamente em 'Criar Pedido'. Para um leigo, o botÃ£o visualmente parece igual â€” nÃ£o hÃ¡ indicaÃ§Ã£o de que o prÃ³ximo clique vai confirmar o zero. O alerta diz 'clique em Criar Pedido novamente para confirmar' mas o botÃ£o nÃ£o muda de rÃ³tulo nem de cor para indicar que Ã© uma confirmaÃ§Ã£o de algo incomum.
- **Sugestao:** Quando `warnValorZero === true`, alterar o rÃ³tulo do botÃ£o para 'Confirmar Valor Zero e Criar' e a variante para `danger` ou `warning`, deixando claro que o prÃ³ximo clique Ã© uma confirmaÃ§Ã£o explÃ­cita do valor zero.

### [pedidos-formularios] [Novo Pedido AvanÃ§ado (modo avanÃ§ado)] Step 2 â€” tabela de entregas disponÃ­veis sem coluna 'Rota' nÃ£o truncada no mobile (linhas 427-429)
- **Categoria:** tabela · **Arquivo:** `src/app/(dashboard)/pedidos/novo-avancado/page.tsx`
- **Problema:** A coluna 'Rota' na tabela do Step 2 exibe `fr.origem?.split('-')[0] + ' â†’ ' + fr.destino?.split('-')[0]`. Apesar do `overflow: hidden / textOverflow: ellipsis / whiteSpace: nowrap`, a cÃ©lula nÃ£o tem `maxWidth` definida. Em mobile, sem largura mÃ¡xima, a cÃ©lula pode expandir e quebrar o layout horizontal da tabela, pois `DataTable` usa `overflowX: auto` â€” o leigo verÃ¡ a tabela com scroll horizontal nÃ£o-Ã³bvio.
- **Sugestao:** Adicionar `maxWidth: '180px'` (ou similar) ao `Td` da coluna Rota no Step 2, garantindo truncamento sem forÃ§ar scroll horizontal em 390px.

### [pedidos-formularios] [Novo Pedido AvanÃ§ado (modo avanÃ§ado)] Step 3 â€” grid 2 colunas 'VeÃ­culo e Roteiro / Dados do Pedido' com `.m-stack` (linha 470)
- **Categoria:** entrada-dado · **Arquivo:** `src/app/(dashboard)/pedidos/novo-avancado/page.tsx`
- **Problema:** O grid usa `m-stack` que colapsa para 1 coluna no mobile (correto). PorÃ©m, o bloco 'Dados do Pedido' (segundo filho) contÃ©m o campo KM Inicial com `type='number'` sem `min={0}`. Um usuÃ¡rio leigo pode digitar KM negativo sem aviso. O banco provavelmente aceita, gerando dado inconsistente silenciosamente.
- **Sugestao:** Adicionar `min={0}` ao input de KM Inicial (linha 613) e validaÃ§Ã£o no `handleSubmit` rejeitando valores negativos com mensagem clara.

### [pedidos-formularios] [Novo Pedido AvanÃ§ado (modo avanÃ§ado)] Step 2 â€” botÃ£o 'AvanÃ§ar para VeÃ­culo e Resumo â†’' sem loading (linha 449)
- **Categoria:** loading · **Arquivo:** `src/app/(dashboard)/pedidos/novo-avancado/page.tsx`
- **Problema:** O botÃ£o avanÃ§a para o step 3 instantaneamente (sem chamada async), porÃ©m o Step 1 tem `handleMotoristaNext` que faz uma query async e exibe `loading={checkingVeiculo}`. Se o usuÃ¡rio jÃ¡ estÃ¡ no Step 2, o botÃ£o 'AvanÃ§ar para VeÃ­culo e Resumo' nÃ£o tem nenhum estado de loading, o que Ã© correto pois nÃ£o hÃ¡ operaÃ§Ã£o async. Mas: o `confirmarPedidoVazio` modal que aparece quando sem entregas tem o botÃ£o 'Criar pedido vazio' sem `disabled` durante o `saving` posterior (linha 689). Se o usuÃ¡rio clicar nele e depois clicar imediatamente em 'Confirmar e Criar Pedido' (Step 3), pode haver duplo submit.
- **Sugestao:** No modal `confirmarPedidoVazio`, fechar o modal e ir para o Step 3 em vez de apenas `setStep(3)` â€” jÃ¡ estÃ¡ correto. PorÃ©m, verificar se o botÃ£o final de submit no Step 3 desabilita corretamente durante `saving` (jÃ¡ usa `disabled={saving || !!veiculoEmManutencao}` â€” ok). Adicionar `disabled={saving}` ao botÃ£o 'Criar pedido vazio' no modal para evitar duplo avanÃ§o.

### [pedidos-formularios] [Editar Pedido] Aba 'Entregas Vinculadas' â€” botÃ£o desvincular com Ã­cone ðŸ—‘ sem texto (linha 469-472)
- **Categoria:** affordance · **Arquivo:** `src/app/(dashboard)/pedidos/[id]/editar/page.tsx`
- **Problema:** O botÃ£o de desvincular entrega exibe apenas o emoji ðŸ—‘ sem texto descritivo. Para um leigo no mobile, o emoji de lixeira pode nÃ£o ser imediatamente associado a 'desvincular' (nÃ£o Ã© excluir, Ã© sÃ³ remover do pedido). NÃ£o hÃ¡ `aria-label`. O `title` sÃ³ funciona no hover em desktop.
- **Sugestao:** Substituir o conteÃºdo do botÃ£o por 'ðŸ—‘ Remover' ou apenas 'Remover' para deixar a aÃ§Ã£o clara ao leigo. Adicionar `aria-label='Desvincular esta entrega'`.

### [pedidos-formularios] [Editar Pedido] Aba 'Entregas Vinculadas' â€” coluna 'Rota' sem maxWidth (linha 464)
- **Categoria:** tabela · **Arquivo:** `src/app/(dashboard)/pedidos/[id]/editar/page.tsx`
- **Problema:** A cÃ©lula 'Rota' exibe `fr.origem + ' â†’ ' + fr.destino` com `whiteSpace: nowrap / overflow: hidden / textOverflow: ellipsis`, mas sem `maxWidth`. Em mobile 390px, com as colunas Status e botÃ£o de remoÃ§Ã£o ao lado, o truncamento pode nÃ£o ocorrer corretamente, causando overflow horizontal na tabela ou empurrando as outras colunas.
- **Sugestao:** Adicionar `maxWidth: '160px'` ao Td da coluna Rota na aba 'Entregas Vinculadas' (linha 464), igual ao padrÃ£o usado na aba 'Adicionar Entregas' (linha 519 jÃ¡ tem `maxWidth: '160px'`).

### [pedidos-formularios] [Editar Pedido] BotÃ£o flutuante 'sticky' na aba Adicionar Entregas (linha 491-495)
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/pedidos/[id]/editar/page.tsx`
- **Problema:** O botÃ£o de confirmaÃ§Ã£o usa `position: sticky; bottom: 8px` dentro de uma div scrollÃ¡vel. No mobile, o CSS tem `.m-hide-sticky { position: static !important }` mas este botÃ£o nÃ£o tem essa classe. Em mobile com scroll interno, `position: sticky` pode nÃ£o funcionar corretamente em todos os containers â€” o botÃ£o pode ficar sobrepostas Ã  Ãºltima linha da tabela ou desaparecer atrÃ¡s do `MobileBottomNav`.
- **Sugestao:** Adicionar `paddingBottom` ao container da aba para compensar o `MobileBottomNav` (56px + safe-area). Ou trocar o sticky por um botÃ£o fixo no rodapÃ© da tela (`position: fixed`) com z-index adequado, garantindo que nÃ£o sobreponha o nav.

### [pedidos-formularios] [Importar Notas â€” EtapaPreview] Tabela de preview â€” coluna 'EndereÃ§o' visÃ­vel no mobile via m-show-block (linha 102-104)
- **Categoria:** tabela · **Arquivo:** `src/app/(dashboard)/pedidos/importar/_components/EtapaPreview.tsx`
- **Problema:** Na cÃ©lula da coluna 'DestinatÃ¡rio / Cliente', o endereÃ§o aparece no mobile via `m-show-block` com `-webkit-line-clamp: 2` e `WebkitBoxOrient: 'vertical'`. Isso Ã© adequado para mostrar 2 linhas, mas endereÃ§os longos (rua + bairro + cidade + CEP) vÃ£o ocupar 2 linhas por item, fazendo a tabela ficar muito longa verticalmente em mobile com muitas notas (ex.: 50 linhas â†’ 100 linhas de texto). NÃ£o hÃ¡ paginaÃ§Ã£o ou virtualizaÃ§Ã£o na tabela de preview.
- **Sugestao:** Considerar limitar a exibiÃ§Ã£o no mobile a 1 linha de endereÃ§o com `WebkitLineClamp: 1` e mostrar o endereÃ§o completo apenas no `title` da cÃ©lula. Para importaÃ§Ãµes grandes, adicionar um aviso de contagem ('Mostrando 50 entregas â€” role para ver todas').

### [pedidos-formularios] [Importar Notas â€” EtapaSelecionarPedido] Select de pedido com label longo gerado por `labelPedido()` (linha 22-24)
- **Categoria:** entrada-dado · **Arquivo:** `src/app/(dashboard)/pedidos/importar/_components/EtapaSelecionarPedido.tsx`
- **Problema:** O rÃ³tulo de cada opÃ§Ã£o do select inclui nÃºmero do pedido + destino da primeira entrega + quantidade de entregas. Em mobile, o `<select>` nativo trunca as opÃ§Ãµes automaticamente, mas o texto composto pode ficar ilegÃ­vel â€” especialmente o destino que pode ser um endereÃ§o completo. O leigo nÃ£o consegue identificar o pedido correto quando hÃ¡ mÃºltiplos pedidos com destinos longos truncados.
- **Sugestao:** Encurtar o rÃ³tulo para exibir apenas o nÃºmero do pedido + nome do cliente (se disponÃ­vel) + quantidade de entregas, omitindo o endereÃ§o no select. O endereÃ§o pode aparecer como hint abaixo do select apÃ³s a seleÃ§Ã£o.

### [despacho] [Despacho â€” lista (/despacho)] CardDespachoMobile â€” botÃ£o 'Marcar' / 'Tirar' (seleÃ§Ã£o)
- **Categoria:** affordance · **Arquivo:** `src/app/(dashboard)/despacho/_components/CardDespachoMobile.tsx:86-88`
- **Problema:** O rÃ³tulo 'Marcar' e 'Tirar' nÃ£o indica para o leigo que serve para depois despachar em lote. Nenhum texto ou tooltip explica a finalidade. ApÃ³s marcar, o FAB aparece com 'Despachar 1', mas sem contexto prÃ©vio o usuÃ¡rio nÃ£o percebe a ligaÃ§Ã£o.
- **Sugestao:** Renomear para '+ Selecionar' / 'âœ• Remover da seleÃ§Ã£o'. Adicionar texto sutil no card selecionado: 'Selecionado para despacho em lote'.

### [despacho] [Despacho â€” lista (/despacho)] MobileList â€” empty state com busca ativa
- **Categoria:** outro · **Arquivo:** `src/app/(dashboard)/despacho/page.tsx:191-196`
- **Problema:** Quando o usuÃ¡rio pesquisa algo inexistente, o MobileList exibe somente 'Nenhum pedido lanÃ§ado ainda.' (emptyMessage fixo na linha 194 de page.tsx). O texto ignora que hÃ¡ busca ativa e nÃ£o sugere limpar o filtro â€” confunde o leigo que pode pensar que o banco estÃ¡ vazio.
- **Sugestao:** Passar emptyMessage condicional: quando busca ativa, exibir 'Nenhum pedido encontrado para "{busca}".' e um botÃ£o 'Limpar busca'. A lista desktop jÃ¡ faz isso (linha 163), mas a MobileList recebe mensagem fixa.

### [despacho] [Despacho â€” lista (/despacho)] FAB 'Despachar N' â€” conflito de estilos com m-fab
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/despacho/page.tsx:217-227`
- **Problema:** O FAB usa className='m-fab mobile-only' com style width:'auto', mas a classe m-fab define width: 56px no CSS global (mobile.css:76) e fontSize:28px (mobile.css:84). Os inline styles fontSize:'12px' e borderRadius:'24px' criam uma forma hÃ­brida que nÃ£o Ã© botÃ£o circular padrÃ£o nem botÃ£o retangular consistente â€” visual inconsistente no mobile.
- **Sugestao:** NÃ£o misturar a classe m-fab (projetada para Ã­cone circular) com texto longo. Usar um Btn normal com position:fixed prÃ³prio, ou criar variante m-fab-pill no CSS para FABs com texto.

### [despacho] [Despacho â€” detalhe (/despacho/[id]) â€” Aba Principal] BotÃµes size='xs' no cabeÃ§alho do Bloco 'Despacho e ExecuÃ§Ã£o'
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/despacho/[id]/_components/AbaPrincipal.tsx:196-197`
- **Problema:** Os botÃµes 'ðŸ” Trocar caminhÃ£o/motorista' e 'ðŸšš Despachar agora' usam size='xs' (padding:2px 6px, fontSize:10px â€” AbaPrincipal.tsx linhas 196-197). O cabeÃ§alho do Bloco (shared.tsx linha 68-75) Ã© display:flex com justify-content:space-between. Em 390px, o tÃ­tulo 'DESPACHO E EXECUÃ‡ÃƒO' em uppercase ocupa ~160px, deixando pouco espaÃ§o â€” o texto longo do botÃ£o pode ser espremido ou o layout vazar.
- **Sugestao:** No mobile, encurtar para 'ðŸ” Trocar' e 'ðŸšš Despachar', ou mover os botÃµes de aÃ§Ã£o para fora do cabeÃ§alho (logo abaixo do bloco), usando classe m-show para versÃ£o mobile.

### [despacho] [Despacho â€” detalhe (/despacho/[id]) â€” Aba Rota] Row 'DistÃ¢ncia / tempo previsto' â€” label longo sem truncate no value
- **Categoria:** tabela · **Arquivo:** `src/app/(dashboard)/despacho/[id]/_components/shared.tsx:11-18`
- **Problema:** O componente Row (shared.tsx linhas 11-18) usa whiteSpace:'nowrap' no label mas nÃ£o limita o value. O label 'DistÃ¢ncia / tempo previsto' tem 28 caracteres. Em pedidos com valores longos (ex.: '1234.5 km Â· â‰ˆ1200 min'), o value pode empurrar o layout ou quebrar para nova linha, pois o span do value nÃ£o tem overflow:hidden nem textOverflow.
- **Sugestao:** Adicionar overflow:'hidden', textOverflow:'ellipsis' e whiteSpace:'nowrap' no span do value do Row, com title={value} para tooltip no hover.

### [despacho] [Despacho â€” detalhe (/despacho/[id]) â€” Aba Mapa] MapaRota â€” overflow:'hidden' bloqueia eventos de toque
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/despacho/[id]/_components/AbaMapa.tsx:28-30`
- **Problema:** AbaMapa.tsx linha 28-30 envolve o MapaRota em div com overflow:'hidden'. No mobile, overflow:hidden em elementos pai cria contexto de scroll que interfere com eventos de toque do mapa Leaflet â€” gestos de pan e pinch-zoom podem ser capturados pelo pai antes de chegar ao mapa. Em modo paisagem (60vh â‰ˆ 234px), o mapa fica muito curto e cortado sem indicaÃ§Ã£o visual.
- **Sugestao:** Substituir overflow:'hidden' por overflow:'clip' (nÃ£o cria contexto de scroll) ou usar height fixo sem overflow para nÃ£o interceptar os eventos de toque do Leaflet.

### [despacho] [Despacho â€” lista (/despacho) e detalhe (/despacho/[id])] ModalDespacho â€” select de Motorista desabilitado sem indicaÃ§Ã£o clara no mobile
- **Categoria:** loading · **Arquivo:** `src/app/(dashboard)/despacho/_components/ModalDespacho.tsx:139-160`
- **Problema:** Quando o select de Motorista estÃ¡ disabled={loadingMotorista} (ModalDespacho.tsx linha 139), o select fica cinza. Logo abaixo aparece spinner + texto 'Buscando motorista padrÃ£o...' (linhas 152-160). No mobile com modal full-screen, o select desabilitado + spinner abaixo causam duplicaÃ§Ã£o de sinal â€” o usuÃ¡rio pode tentar clicar repetidamente no select achando que travou, nÃ£o associando o spinner abaixo Ã  causa.
- **Sugestao:** Unificar o feedback: mostrar o spinner inline dentro do select (como placeholder animado) ou colocar o spinner Ã  direita do label do FormField, removendo o bloco duplicado abaixo do select.

### [entregas] [Modal de confirmaÃ§Ã£o de recebimento (entregas/page.tsx)] Modal .m-modal-content no mobile
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/entregas/page.tsx`
- **Problema:** O modal de confirmaÃ§Ã£o 'Confirmar recebimento' (linha 691) usa a classe m-modal-content. Conforme mobile.css linhas 100-116, essa classe no mobile aplica min-height: 100vh e width: 100vw, tornando o modal full-screen. Para uma simples confirmaÃ§Ã£o com dois botÃµes, isso ocupa toda a tela sem necessidade e pode confundir o usuÃ¡rio leigo, que perde contexto de onde estava. AlÃ©m disso, o conteÃºdo nÃ£o usa a classe m-modal-body, entÃ£o nÃ£o hÃ¡ padding-top para safe-area (Dynamic Island/notch) â€” o texto pode ficar oculto atrÃ¡s da notch em iPhones.
- **Sugestao:** Adicionar a classe m-modal-body ao div interno de conteÃºdo para garantir padding com safe-area. Avaliar usar bottom sheet fixo no mobile em vez de full-screen para confirmaÃ§Ãµes simples.

### [entregas] [Listagem de Pedidos (entregas/page.tsx)] KPI Grid â€” 4 cards em repeat(4, 1fr) sem classe m-kpi-grid
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/entregas/page.tsx`
- **Problema:** O grid de KPIs na linha 473 usa gridTemplateColumns: 'repeat(4, 1fr)' com a classe m-kpi-grid. O mobile.css (linha 192) define .m-kpi-grid como repeat(2, 1fr) no mobile â€” correto. PorÃ©m, os labels dos KpiCards usam fontSize: '10px' e os valores principais usam fontSize: '16px'. Com 2 colunas em 390px, cada card fica com ~183px. O sub-texto do KpiCard 'ConcluÃ­dos' (linha 477) exibe '3 pendentes / 5 pagos' e no KpiCard de receita (linha 479) exibe 'Total: R$ 12.345,67' â€” ambos com fontSize: '10px' (ds.tsx linha 184 e 186). Esses textos podem ficar ilegÃ­veis em tela pequena por tamanho de fonte abaixo do mÃ­nimo recomendado (11px).
- **Sugestao:** Aumentar fontSize do sub-texto dos KpiCards para pelo menos 11px. Verificar se '3 pendentes / 5 pagos' nÃ£o trunca no card mobile (sem overflow: hidden, pode quebrar linha e desalinhar o grid).

### [entregas] [Listagem de Pedidos (entregas/page.tsx)] Filtros mobile â€” toolbar desktop duplicada vs. bloco mobile
- **Categoria:** entrada-dado · **Arquivo:** `src/app/(dashboard)/entregas/page.tsx`
- **Problema:** HÃ¡ dois blocos de filtros: o toolbar (linha 410-449) dentro do DataTable com m-hide, e um bloco mobile (linha 484-520) com m-show-block. O bloco mobile nÃ£o inclui os filtros de data personalizada ('dataInicio'/'dataFim') quando filtroPeriodo === 'personalizado' â€” a condiÃ§Ã£o existe na linha 508, mas os inputs de data ficam dentro de um div sem width definido usando flex:1 em um container de width: '100%'. Esses inputs de data type='date' com fontSize: '13px' num flex:1 podem ficar muito estreitos lado a lado em 390px (2 inputs + span 'atÃ©' = ~170px cada), forÃ§ando o teclado de datas a abrir em tamanho inadequado.
- **Sugestao:** Empilhar os inputs de data em coluna no mobile (flex-direction: column) em vez de linha, usando labels explicativos 'De:' e 'AtÃ©:' separados.

### [entregas] [Detalhe do Pedido (entregas/[id]/page.tsx)] BotÃ£o 'Editar' â€” Ãºnico action visÃ­vel no mobile
- **Categoria:** affordance · **Arquivo:** `src/app/(dashboard)/entregas/[id]/page.tsx`
- **Problema:** O PageHeader da tela de detalhe (linha 153-165) exibe trÃªs botÃµes: 'â† Voltar' (ghost), 'ðŸ–¨ï¸ Imprimir' (outline, m-hide), 'Editar' (outline). No mobile, o botÃ£o 'Imprimir' some com m-hide (correto), restando apenas 'Voltar' e 'Editar'. O botÃ£o 'Editar' usa variant='outline' com background branco e border cinza claro (#cbd5e1). Para um leigo no mobile, um botÃ£o outline com fonte pequena (11px â€” tamanho sm de ds.tsx linha 47) pode parecer texto estÃ¡tico, nÃ£o um botÃ£o clicÃ¡vel. NÃ£o tem variant='primary' para diferenciar visualmente a aÃ§Ã£o principal.
- **Sugestao:** Trocar o botÃ£o 'Editar' para variant='primary' na tela de detalhe, sinalizando claramente que Ã© a aÃ§Ã£o principal para o leigo no mobile.

### [entregas] [Detalhe do Pedido (entregas/[id]/page.tsx)] SeÃ§Ã£o de Abastecimentos â€” grid 1fr 1fr no mobile sem overflow
- **Categoria:** tabela · **Arquivo:** `src/app/(dashboard)/entregas/[id]/page.tsx`
- **Problema:** No card mobile de abastecimentos (linha 318-323), o detalhe usa display: grid, gridTemplateColumns: '1fr 1fr', gap: '4px 8px' com fontSize: '12px'. O campo 'Posto' pode conter textos longos (ex.: 'Posto Ipiranga Centro') que, em 1fr de ~170px, podem truncar sem textOverflow: ellipsis â€” nÃ£o hÃ¡ overflow: hidden no span (linha 319). O texto simplesmente quebrarÃ¡ em mÃºltiplas linhas desalinhando o grid.
- **Sugestao:** Adicionar overflow: hidden e textOverflow: ellipsis nos spans do grid de abastecimentos mobile (linhas 319-322), ou exibir o posto em linha separada com largura completa.

### [entregas] [Detalhe do Pedido (entregas/[id]/page.tsx)] SeÃ§Ã£o 'VeÃ­culo, Motorista e Cliente' â€” valor concatenado longo
- **Categoria:** tabela · **Arquivo:** `src/app/(dashboard)/entregas/[id]/page.tsx`
- **Problema:** O campo 'VeÃ­culo' (linha 193) exibe a string composta '{veiculo.placa} â€” {veiculo.marca} {veiculo.modelo}' sem truncate. Em mobile (m-stack colapsa para 1 coluna), a Row renderiza dois spans lado a lado em justifyContent: 'space-between'. Uma string como 'ABC-1234 â€” VOLKSWAGEN CONSTELLATION 17.180' pode ter 45+ caracteres e causar overflow ou quebra de linha, desalinhando o layout do Row. A Row (linha 54-61) nÃ£o tem overflow: hidden nem textOverflow nos spans.
- **Sugestao:** No span de valor da Row, adicionar maxWidth, overflow: hidden e textOverflow: ellipsis, especialmente para campos veÃ­culo e observaÃ§Ãµes.

### [entregas] [Editar Pedido (entregas/[id]/editar/page.tsx)] SeÃ§Ã£o financeira â€” grid repeat(4, 1fr) com classe m-grid
- **Categoria:** guardrail · **Arquivo:** `src/app/(dashboard)/entregas/[id]/editar/page.tsx`
- **Problema:** A seÃ§Ã£o 'Valor e Pagamento' (linha 283) usa gridTemplateColumns: 'repeat(4, 1fr)' com className='m-grid'. O m-grid colapsa para 1fr (1 coluna) no mobile â€” correto. PorÃ©m, quando f.pago === 'true', o campo 'Data do Pagamento' Ã© renderizado condicionalmente como 4Âº filho do grid (linha 310-313). ApÃ³s o colapso mobile para 1 coluna, os 4 campos ficam empilhados corretamente. O problema Ã© que a validaÃ§Ã£o exige data_pagamento quando pago === 'true' (linha 134-137 da editar), mas o campo 'Data do Pagamento' sÃ³ aparece se o usuÃ¡rio JÃ tiver selecionado 'Pago' no select â€” se o usuÃ¡rio mudar para 'Pago' e imediatamente tentar salvar sem ver o novo campo que apareceu, receberÃ¡ um erro. O campo aparece dinamicamente mas nÃ£o hÃ¡ scroll automÃ¡tico ou foco no campo novo.
- **Sugestao:** Ao renderizar o campo 'Data do Pagamento' condicionalmente, fazer auto-focus ou scroll suave atÃ© ele. Alternativamente, mostrar o campo sempre (desabilitado quando nÃ£o pago) para o usuÃ¡rio ver que existe antes de selecionar 'Pago'.

### [entregas] [Editar Pedido (entregas/[id]/editar/page.tsx)] ConfirmaÃ§Ã£o de cancelamento â€” botÃ£o 'Confirmar Cancelamento' com loading mas modal fecha antes do saving completar
- **Categoria:** loading · **Arquivo:** `src/app/(dashboard)/entregas/[id]/editar/page.tsx`
- **Problema:** No modal de confirmaÃ§Ã£o de cancelamento (linha 355), o onClick faz: setConfirmStatus(false) antes de chamar executarSalvar(). O loading={saving} Ã© passado ao botÃ£o, mas como setConfirmStatus(false) fecha o modal imediatamente, o usuÃ¡rio nunca vÃª o estado de loading do botÃ£o de confirmaÃ§Ã£o. O modal some instantaneamente e nÃ£o hÃ¡ indicador visÃ­vel de que a operaÃ§Ã£o de salvar estÃ¡ em andamento enquanto a tela 'Editar Pedido' estÃ¡ visÃ­vel mas sem spinner explÃ­cito (sÃ³ o botÃ£o do rodapÃ© mostra loading, mas pode estar fora da viewport em tela mobile com teclado aberto).
- **Sugestao:** Fechar o modal somente apÃ³s executarSalvar() completar, ou exibir um overlay de loading na tela principal enquanto saving === true, garantindo feedback visÃ­vel ao leigo.

### [entregas] [Detalhe do Pedido (entregas/[id]/page.tsx)] Nenhuma aÃ§Ã£o de 'Marcar como Pago' disponÃ­vel na tela de detalhe
- **Categoria:** navegacao · **Arquivo:** `src/app/(dashboard)/entregas/[id]/page.tsx`
- **Problema:** A tela de detalhe do pedido exibe o status de pagamento (linha 201-207) mas nÃ£o oferece a aÃ§Ã£o de 'Receber/Marcar como Pago' quando pedido.pago === false e status === 'concluido'. O usuÃ¡rio leigo que abre o detalhe diretamente (via link compartilhado ou notificaÃ§Ã£o) nÃ£o consegue marcar o pagamento sem voltar Ã  listagem. Isso forÃ§a uma navegaÃ§Ã£o extra desnecessÃ¡ria.
- **Sugestao:** Adicionar botÃ£o 'Marcar como Pago' na tela de detalhe quando pedido.pago === false e status Ã© concluido/concluida, com o mesmo modal de confirmaÃ§Ã£o da listagem.

### [entregas] [Novo Pedido (entregas/novo/page.tsx)] Valor do Pedido â€” parseFloat sem normalizaÃ§Ã£o de vÃ­rgula
- **Categoria:** integridade · **Arquivo:** `src/app/(dashboard)/entregas/novo/page.tsx`
- **Problema:** No handleSubmit (linha 100), o valor Ã© salvo como parseFloat(f.valor_pedido). O IMaskInput com radix: ',' retorna unmaskedValue sem formataÃ§Ã£o (apenas dÃ­gitos e ponto decimal como separador), o que Ã© correto. PorÃ©m, se por algum motivo o usuÃ¡rio conseguir digitar algo com vÃ­rgula (ex.: copiar/colar '1.500,00'), o parseFloat retornarÃ¡ apenas 1.5 em vez de 1500.00. NÃ£o hÃ¡ sanitizaÃ§Ã£o explÃ­cita de vÃ­rgula antes do parseFloat.
- **Sugestao:** Antes do parseFloat, normalizar o valor: value.replace(',', '.').replace(/\.(?=.*\.)/g, '') para garantir que vÃ­rgulas sejam tratadas corretamente caso a mÃ¡scara falhe.

### [financeiro] [Financeiro > Fluxo Diario] Card KPI 'Saldo Final Previsto' alimentado pelo 'Saldo Banco' guardado em localStorage
- **Categoria:** integridade · **Arquivo:** `src/app/(dashboard)/financeiro/_components/FluxoTab.tsx:36-46,78-89,100,122`
- **Problema:** O saldo de abertura do banco e gravado SO em localStorage do aparelho (lsKey por empresa) e todo o 'Saldo Final Previsto' e o 'Acumulado' da tabela partem dele. Se o gestor abrir no celular (onde nunca digitou) o saldo inicia em R$ 0,00 e o saldo previsto fica errado, sem aviso de que o numero esta incompleto. Para um leigo, um 'Saldo Final Previsto' negativo/zerado pode levar a decisao errada. A label 'Salvo neste aparelho (nao sincroniza)' existe, mas e fina e nao alerta que o calculo abaixo depende disso.
- **Sugestao:** Quando saldoBanco for 0 e nunca foi definido neste aparelho, mostrar um aviso claro no card de Saldo Final ('inclui saldo de abertura R$ 0 â€” informe o saldo do banco') ou persistir o saldo no Supabase por empresa para nao divergir entre celular e PC.

### [financeiro] [Financeiro por Cliente (faturamento) > painel Financeiro do pedido] Inputs de valor da parcela com salvamento em onBlur
- **Categoria:** entrada-dado · **Arquivo:** `src/app/(dashboard)/faturamento/_components/FinanceiroPedido.tsx:431-448 (input valor onBlur) + 255-295 (salvarValorParcela)`
- **Problema:** O valor da parcela so e gravado no onBlur do input (salvarValorParcela). No mobile, se o usuario digita o valor e toca direto no botao 'Baixar'/'Gerar' (ou fecha o teclado tocando fora) o blur pode nao disparar de forma confiavel antes da proxima acao, e ha o estado visivel 'Nao salvo'. Para um leigo nao fica obvio que precisa 'sair do campo' pra gravar â€” ele ve 'Nao salvo' em laranja e nao tem um botao explicito de salvar a parcela.
- **Sugestao:** Adicionar um botao explicito de confirmar a edicao da parcela (ou commitar no Enter/onChange com debounce), e quando houver 'Nao salvo' pendente bloquear/avisar antes de Baixar para nao perder o valor digitado.

### [financeiro] [Financeiro > A Pagar] Coluna 'Descricao' da DataTable (desktop) â€” div sem truncate, mais subtitulo 'contexto'
- **Categoria:** tabela · **Arquivo:** `src/app/(dashboard)/financeiro/_components/APagarTab.tsx:190-193`
- **Problema:** Na tabela desktop a coluna Descricao renderiza ev.descricao e ev.contexto sem ellipsis/largura maxima. Descricao de despesa/manutencao costuma ser longa (ex.: 'Manutencao preventiva troca de oleo e filtros caminhao placa XXX') e quebra em varias linhas, desalinhando a altura das linhas vizinhas (Vencimento/Valor) â€” exatamente a queixa do dono de 'campo com informacao grande que quebra a coluna criando varias linhas'.
- **Sugestao:** Aplicar maxWidth + overflow hidden + textOverflow ellipsis + whiteSpace nowrap (com title={ev.descricao} pra ver completo no hover) na celula de descricao, como ja e feito no card mobile do FluxoTab.

### [abastecimentos-adiantamentos] [Abastecimentos / Novo e Editar] Grid de 4 colunas em Dados do Abastecimento
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/abastecimentos/novo/page.tsx:149-153 e src/app/(dashboard)/abastecimentos/[id]/editar/page.tsx:174-177`
- **Problema:** O grid de campos numericos usa gridTemplateColumns repeat(4,1fr) com classe m-grid. O CSS de m-grid colapsa para 1fr no mobile â€” OK para os campos. Porem o campo Posto tem gridColumn: span 2 inline, e a regra CSS de m-grid reseta grid-column para span 1. O campo Posto fica em coluna unica no mobile (aceitavel), mas o reset do CSS so atua sobre filhos DIRETOS do m-grid com style contendo 'gridColumn' ou 'grid-column'. O wrapper <div style={{ gridColumn: 'span 2' }}> nao tem classe m-grid, entao o reset pode nao funcionar em todos os browsers â€” risco de quebra de layout.
- **Sugestao:** Substituir o wrapper <div style={{ gridColumn: 'span 2' }}> por um filho direto do m-grid com gridColumn definido, ou envolver o campo em MobileFormGrid para garantir o colapso correto no mobile.

### [abastecimentos-adiantamentos] [Adiantamentos / Listagem] Botao Carregar mais â€” ausente no mobile
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/adiantamentos/page.tsx:457-467 e src/components/mobile/mobile.css:69-91`
- **Problema:** O botao 'Carregar mais' da listagem de adiantamentos esta dentro de <div className="m-hide"> para a versao desktop, e ha um segundo botao em <div className="m-show-block"> para o mobile. No entanto o botao mobile esta posicionado APOS o MobileList, mas antes do MobileFAB. O MobileFAB usa position:fixed e o FAB sobrepoe o botao se houver poucos itens â€” o FAB cobre o botao 'Carregar mais' em telas com lista curta.
- **Sugestao:** Adicionar padding-bottom no container da lista para afastar o botao 'Carregar mais' do FAB, ou posicionar o botao acima do FAB com margem bottom de pelo menos 72px.

### [abastecimentos-adiantamentos] [Abastecimentos / Listagem] Botao Carregar mais â€” pode ser coberto pelo FAB
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/abastecimentos/page.tsx:357-368`
- **Problema:** O botao 'Carregar mais' em abastecimentos/page.tsx esta fora de qualquer m-hide/m-show, aparecendo tanto no desktop quanto no mobile. O MobileFAB esta posicionado fixo (bottom: 72px aprox.) e o botao 'Carregar mais' ao final da lista pode ficar sobreposto pelo FAB no mobile.
- **Sugestao:** Adicionar padding-bottom de pelo menos 80px no container ou posicionar o botao acima do FAB com margem equivalente.

### [abastecimentos-adiantamentos] [Adiantamentos / Novo] Modal de confirmacao de status â€” tela cheia no mobile sem cabecalho claro
- **Categoria:** guardrail · **Arquivo:** `src/app/(dashboard)/adiantamentos/novo/page.tsx:175-189 e src/components/mobile/mobile.css:98-116`
- **Problema:** O modal de confirmacao (.m-modal-content) no mobile expande para 100vw/100vh via CSS. O botao 'Voltar' e 'Confirmar' ficam no flex-end do modal â€” no mobile fullscreen eles podem ficar no topo da tela (align-items:flex-end no overlay faz o conteudo grudar na parte inferior) porem o m-modal-body recebe padding-top:safe-area. O titulo 'Confirmar status' aparece dentro do m-modal-body, mas nao ha botao de fechar (X) visivel, o leigo pode nao saber que pode voltar.
- **Sugestao:** Adicionar um icone X de fechar no canto superior direito do modal, com area de toque de 44px, ou garantir que o botao 'Voltar' seja o primeiro elemento visivel no modal fullscreen mobile.

### [abastecimentos-adiantamentos] [Adiantamentos / Editar] Modal de confirmacao de status â€” identico
- **Categoria:** guardrail · **Arquivo:** `src/app/(dashboard)/adiantamentos/[id]/editar/page.tsx:251-266`
- **Problema:** O mesmo problema do modal em novo/page.tsx se repete em editar/page.tsx: modal fullscreen no mobile sem botao X de fechar explicito.
- **Sugestao:** Adicionar botao X de fechar no topo do modal com min 44px de area de toque.

### [abastecimentos-adiantamentos] [Abastecimentos / Novo] Nenhuma confirmacao antes de salvar abastecimento
- **Categoria:** guardrail · **Arquivo:** `src/app/(dashboard)/abastecimentos/novo/page.tsx:58-88`
- **Problema:** O formulario de novo abastecimento grava diretamente no banco sem qualquer modal de confirmacao. Um abastecimento incorreto afeta custo de veiculo e KPIs financeiros. Nao ha guard-rail para o leigo que clicou no botao por engano.
- **Sugestao:** Adicionar modal de confirmacao antes do insert, exibindo resumo (veiculo, litros, valor total) e pedindo confirmacao â€” padrao ja usado nos adiantamentos.

### [abastecimentos-adiantamentos] [Abastecimentos / Editar] Nenhuma confirmacao ao marcar como Confirmado
- **Categoria:** guardrail · **Arquivo:** `src/app/(dashboard)/abastecimentos/[id]/editar/page.tsx:80-106`
- **Problema:** Marcar um abastecimento como 'confirmado' (checkbox) e salvar grava imediatamente sem confirmacao. Confirmar um abastecimento e acao irreversivel do ponto de vista contabil â€” o leigo pode marcar sem querer.
- **Sugestao:** Detectar quando confirmado muda de false para true no handleSubmit e exibir modal de confirmacao antes de gravar, semelhante ao fluxo de adiantamentos.

### [abastecimentos-adiantamentos] [Adiantamentos / Novo] Status inicial editavel pelo usuario â€” sem aviso de impacto
- **Categoria:** guardrail · **Arquivo:** `src/app/(dashboard)/adiantamentos/novo/page.tsx:174-189`
- **Problema:** O select de Status em novo adiantamento permite criar ja como 'aprovado', 'recusado' ou 'prestado'. Ha modal de confirmacao quando status != pendente, o que e correto. Porem a mensagem do modal diz 'Confirmar status' sem nomear o motorista nem o valor â€” o leigo pode confirmar sem ter certeza de qual registro esta aprovando.
- **Sugestao:** Incluir no corpo do modal o nome do motorista e o valor formatado (ex: 'Voce esta aprovando R$ 500,00 para Joao Silva'). Isso torna a confirmacao significativa para o leigo.

### [abastecimentos-adiantamentos] [Adiantamentos / Editar] Modal de confirmacao de status â€” mensagem sem nome do motorista
- **Categoria:** guardrail · **Arquivo:** `src/app/(dashboard)/adiantamentos/[id]/editar/page.tsx:255-258`
- **Problema:** O modal de confirmacao de mudanca de status mostra apenas o novo status em negrito, sem identificar o motorista nem o valor do adiantamento. O leigo que abriu varios registros pode confirmar o status errado.
- **Sugestao:** Adicionar nome do motorista e valor no corpo da mensagem do modal de confirmacao.

### [abastecimentos-adiantamentos] [Abastecimentos / Listagem] Coluna Posto na tabela desktop â€” sem truncate
- **Categoria:** tabela · **Arquivo:** `src/app/(dashboard)/abastecimentos/page.tsx:289`
- **Problema:** A celula Td do campo Posto nao tem maxWidth, overflow:hidden nem textOverflow:ellipsis. Nomes longos de posto (ex: 'POSTO BRASIL COMBUSTIVEIS LTDA BR-101 KM 342') quebram a coluna e desalinham a tabela.
- **Sugestao:** Adicionar style={{ maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} na celula Td do Posto, com title para exibir o valor completo no hover.

### [veiculos-motoristas] [VeÃ­culos â€” Editar (/veiculos/[id]/editar) > Sub-tabs da aba Dados] BotÃµes 'Principal / EspecificaÃ§Ãµes / Documentos' (linha 210-224)
- **Categoria:** affordance · **Arquivo:** `src/app/(dashboard)/veiculos/[id]/editar/page.tsx`
- **Problema:** Os sub-tabs tÃªm fundo `#f1f5f9` quase idÃªntico ao fundo da pÃ¡gina. No mobile, o leigo nÃ£o reconhece esses elementos como clicÃ¡veis antes de interagir.
- **Sugestao:** Adicionar borda visÃ­vel (ex.: `border: 1px solid #cbd5e1`) ou Ã­cone nos sub-tabs inativos; e garantir overflow-x: auto no container para telas muito estreitas.

### [veiculos-motoristas] [VeÃ­culos â€” Editar (/veiculos/[id]/editar) > Aba HistÃ³rico] Buttons 'Abastecimentos' e 'Pedidos' no sub-nav de histÃ³rico (linhas 396-402)
- **Categoria:** affordance · **Arquivo:** `src/app/(dashboard)/veiculos/[id]/editar/page.tsx`
- **Problema:** Esses botÃµes tÃªm `border: none; background: none` â€” sÃ£o texto puro com underline apenas quando ativo. Um usuÃ¡rio leigo no celular nÃ£o percebe que sÃ£o botÃµes clicÃ¡veis antes de estarem selecionados.
- **Sugestao:** Adicionar fundo sutil (ex.: #f1f5f9) e borda nos estados inativos para diferenciar visualmente de texto estÃ¡tico, ou usar o componente Tabs do design system.

### [veiculos-motoristas] [VeÃ­culos â€” Editar > Aba Avarias] Select de mudanÃ§a de status no card mobile (linha 217-227 do AvariasTab)
- **Categoria:** loading · **Arquivo:** `src/app/(dashboard)/veiculos/[id]/editar/_components/AvariasTab.tsx`
- **Problema:** Quando `salvandoStatus` Ã© true, o select fica `disabled` mas nÃ£o exibe nenhum texto ou spinner ao usuÃ¡rio. O leigo vÃª o select travado sem entender que estÃ¡ processando.
- **Sugestao:** Exibir texto 'Salvando...' ao lado do select quando `salvandoStatus === true`, ou overlay leve sobre o card.

### [veiculos-motoristas] [Motoristas â€” Acerto Mensal (AcertoMensalTab)] Date picker de ano/mÃªs â€” layout horizontal com divisores (linhas 316-373)
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/motoristas/[id]/editar/_components/AcertoMensalTab.tsx`
- **Problema:** O container usa `display: flex; flexWrap: wrap; gap: 20px`. Os divisores verticais (`width: 1px; height: 44px`) quebram linha no mobile junto com os blocos de anos/meses, podendo causar estouro horizontal em 390px.
- **Sugestao:** Esconder os divisores verticais no mobile com `className='m-hide'` e empilhar os blocos de ano/mÃªs em coluna com flexDirection column no mobile.

### [veiculos-motoristas] [Motoristas â€” Acerto Mensal (AcertoMensalTab)] FunÃ§Ã£o `fecharAcerto` â€” uso de `alert()` nativo para erro (linha 237)
- **Categoria:** guardrail · **Arquivo:** `src/app/(dashboard)/motoristas/[id]/editar/_components/AcertoMensalTab.tsx`
- **Problema:** `alert('Erro ao criar acerto: ...')` usa dialog nativo do browser. No iOS Safari o alert bloqueia a thread, tem aparÃªncia diferente e rompe a experiÃªncia visual do sistema.
- **Sugestao:** Substituir o `alert()` por `setErro(mensagem)` exibido via componente Alert do design system, igual ao padrÃ£o usado no resto do sistema.

### [veiculos-motoristas] [VeÃ­culos â€” Editar > Bloco VinculoResponsavel] Chips 'Agora' e 'InÃ­cio do atual' (linhas 258-259)
- **Categoria:** affordance · **Arquivo:** `src/app/(dashboard)/veiculos/[id]/editar/_components/VinculoResponsavel.tsx`
- **Problema:** Os chips tÃªm `padding: '5px 10px'` sem `minHeight: 44px` e sem a classe `m-touch`. SÃ£o elementos clicÃ¡veis customizados com Ã¡rea de toque abaixo de 44px no mobile.
- **Sugestao:** Adicionar `minHeight: '44px'` e `display: 'inline-flex'; alignItems: 'center'` aos chips de atalho de data, ou adicionar classe `m-touch`.

### [veiculos-motoristas] [VeÃ­culos â€” Editar > Bloco VinculoResponsavel] HistÃ³rico de alocaÃ§Ãµes â€” linha de KM (linhas 197-203)
- **Categoria:** tabela · **Arquivo:** `src/app/(dashboard)/veiculos/[id]/editar/_components/VinculoResponsavel.tsx`
- **Problema:** Textos como 'KM: Entregue 123.456 â†’ Devolvido 123.789 (1.333 km rodados)' sÃ£o renderizados numa Ãºnica linha com fontSize 12 sem `wordBreak` ou `overflowWrap`. Em 390px com nÃºmeros grandes isso pode exceder a largura do card.
- **Sugestao:** Adicionar `overflowWrap: 'break-word'` ou quebrar o KM de entrega e devoluÃ§Ã£o em linhas separadas.

### [veiculos-motoristas] [VeÃ­culos â€” Listagem (/veiculos)] KpiCard 'Em viagem' com valor fixo 0 (linha 308)
- **Categoria:** integridade · **Arquivo:** `src/app/(dashboard)/veiculos/page.tsx`
- **Problema:** O KpiCard 'Em viagem' sempre exibe 0 â€” nenhuma query calcula esse valor. Para o leigo, um KPI que nunca muda parece informacÃ£o quebrada.
- **Sugestao:** Calcular 'em viagem' a partir da contagem de alocaÃ§Ãµes com status 'operacional' e `fim` null (jÃ¡ buscadas na query de motPorVeic), ou remover o KpiCard atÃ© o cÃ¡lculo estar implementado.

### [veiculos-motoristas] [VeÃ­culos â€” Listagem (/veiculos)] MobileList â€” sem EmptyState no mobile (linhas 399-421)
- **Categoria:** outro · **Arquivo:** `src/app/(dashboard)/veiculos/page.tsx`
- **Problema:** Quando `loading=false` e `ordenados` estÃ¡ vazio, o MobileList exibe lista em branco sem mensagem. O leigo vÃª '0 de 0 veÃ­culos' sem saber se Ã© erro ou lista realmente vazia.
- **Sugestao:** Adicionar EmptyState dentro do MobileList quando `ordenados.length === 0 && !loading`, com mesma lÃ³gica do EmptyState da versÃ£o desktop.

### [veiculos-motoristas] [Motoristas â€” Listagem (/motoristas)] MobileList â€” sem EmptyState no mobile (linhas 210-237)
- **Categoria:** outro · **Arquivo:** `src/app/(dashboard)/motoristas/page.tsx`
- **Problema:** Mesmo problema da tela de veÃ­culos: lista mobile vazia sem mensagem explicativa quando `ordenados.length === 0`.
- **Sugestao:** Adicionar EmptyState dentro do MobileList quando a lista de ordenados estÃ¡ vazia.

### [veiculos-motoristas] [Motoristas â€” Editar (/motoristas/[id]/editar) > Aba RemuneraÃ§Ã£o] Campos 'SalÃ¡rio Fixo' e 'Valor da DiÃ¡ria' sem mÃ¡scara monetÃ¡ria (linhas 306-311 do editar e linhas 204-210 do novo)
- **Categoria:** entrada-dado · **Arquivo:** `src/app/(dashboard)/motoristas/[id]/editar/page.tsx`
- **Problema:** Campos monetÃ¡rios usam `type='number'` sem IMaskInput. No iOS, o teclado numÃ©rico pode usar vÃ­rgula como separador decimal, e o campo aceita entrada ambÃ­gua. AlÃ©m disso, o `placeholder='0,00'` sugere vÃ­rgula, mas `type=number` no browser desktop exige ponto.
- **Sugestao:** Substituir por IMaskInput com mÃ¡scara monetÃ¡ria (padrÃ£o jÃ¡ usado em 'Valor AquisiÃ§Ã£o' de veÃ­culos) para ambas as telas de motorista.

### [veiculos-motoristas] [VeÃ­culos â€” Editar > Aba ManutenÃ§Ãµes (ManutencoesTab)] Campo 'Novo KM' no modal de gestÃ£o de KM (linha 585)
- **Categoria:** entrada-dado · **Arquivo:** `src/app/(dashboard)/veiculos/[id]/editar/_components/ManutencoesTab.tsx`
- **Problema:** `type='number'` sem `inputMode='numeric'`. No iOS, o teclado numÃ©rico pode mostrar separador decimal. O valor Ã© processado com `parseFloat(kmNovo)` na linha 147 â€” se o usuÃ¡rio digitar '123.456' interpretado como float, o KM fica incorreto.
- **Sugestao:** Adicionar `inputMode='numeric'` e usar `parseInt(kmNovo)` ao invÃ©s de `parseFloat(kmNovo)` na linha 147, jÃ¡ que KM Ã© sempre inteiro.

### [veiculos-motoristas] [VeÃ­culos â€” Editar > Aba Logs de KM (LogsTab)] Modal 'Reatribuir KM' â€” scroll no mobile (linhas 265-319)
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/veiculos/[id]/editar/_components/LogsTab.tsx`
- **Problema:** O modal nÃ£o tem `maxHeight` nem `overflow: auto` explÃ­cito no container interno. No mobile (m-modal-content = 100vh), se o conteÃºdo for longo (alerta + resumo + campos), o botÃ£o 'Confirmar reatribuiÃ§Ã£o' pode ficar fora da Ã¡rea visÃ­vel.
- **Sugestao:** Adicionar `overflow: 'auto'` e `maxHeight: '90vh'` no div interno do modal, ou usar a classe `m-modal-body` para o conteÃºdo scrollÃ¡vel.

### [cadastros] [Clientes / Novo e Editar â€” formulÃ¡rio de contatos] BotÃ£o 'Adicionar Contato'
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/clientes/novo/page.tsx:273 e src/app/(dashboard)/clientes/[id]/editar/page.tsx:358`
- **Problema:** O botÃ£o tem padding '8px 16px' (cerca de 36px de altura) e nÃ£o possui a classe 'm-touch', ficando abaixo do alvo mÃ­nimo de 44px exigido pelo Apple HIG no mobile.
- **Sugestao:** Adicionar className='m-touch' ao botÃ£o ou aumentar o padding vertical para pelo menos 12px. O botÃ£o 'Adicionar Local' na aba de locais de carregamento tem o mesmo problema (editar/page.tsx:428).

### [cadastros] [Clientes / Editar â€” campos de Cidade e UF no endereÃ§o] Sub-grid interno da linha Cidade/UF
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/clientes/[id]/editar/page.tsx:341-349 e clientes/novo/page.tsx:255-263 e empresas/novo/page.tsx:167-175 e empresas/[id]/editar/page.tsx:340-348`
- **Problema:** Os campos Cidade e UF sÃ£o posicionados em um div com 'gridColumn: span 4' que contÃ©m um grid interno 'gridTemplateColumns: 3fr 1fr' sem a classe 'm-grid'. No mobile, o div pai colapsa para span 1 corretamente, mas o grid interno '3fr 1fr' persiste â€” o campo UF fica com cerca de 25% da largura disponÃ­vel, tornando-o muito estreito para digitar no celular. Mesmo padrÃ£o ocorre em empresas/novo/page.tsx e empresas/[id]/editar/page.tsx.
- **Sugestao:** Adicionar className='m-grid' ao div interno, ou substituir o input de UF por um select com as 27 UFs brasileiras, o que tambÃ©m garante dado conciso e vÃ¡lido no banco.

### [cadastros] [Clientes / Editar â€” abas de navegaÃ§Ã£o] Aba 'Locais de Carregamento'
- **Categoria:** navegacao · **Arquivo:** `src/app/(dashboard)/clientes/[id]/editar/page.tsx:258-268`
- **Problema:** Em 390px a linha de abas tem trÃªs botÃµes ('Dados BÃ¡sicos', 'Contatos', 'Locais de Carregamento'). O container tem overflowX: auto, entÃ£o rola horizontalmente, mas nÃ£o hÃ¡ nenhum indicador visual de scroll (sem seta, sem fade lateral). Um usuÃ¡rio leigo pode nunca descobrir que existe uma terceira aba.
- **Sugestao:** Adicionar um fade/shadow no lado direito do container de abas (via CSS mask-image ou ::after) para sinalizar que hÃ¡ mais conteÃºdo, ou usar o componente Tabs do design system que jÃ¡ tem a classe 'm-tabs-scroll'.

### [cadastros] [Perfil / Meu Perfil] Campo 'Nome' desabilitado e botÃ£o 'Salvar'
- **Categoria:** guardrail · **Arquivo:** `src/app/(dashboard)/perfil/page.tsx:96-99 e 45-78`
- **Problema:** O campo Nome estÃ¡ com 'disabled' e parece editÃ¡vel visualmente, mas nÃ£o hÃ¡ nenhum input hidden postando o nome no submit â€” somente a senha Ã© salva. AlÃ©m disso, ao submeter o formulÃ¡rio com os campos de senha em branco, a handleSubmit finaliza com sucesso e exibe 'Perfil atualizado com sucesso!' sem alterar nada no banco, enganando o usuÃ¡rio.
- **Sugestao:** Substituir o input desabilitado por texto puro (<p>) para deixar claro que nÃ£o Ã© editÃ¡vel. Verificar se algum campo de senha foi preenchido antes de submeter e mostrar mensagem contextual 'Nenhuma alteraÃ§Ã£o para salvar' se tudo estiver em branco. Renomear botÃ£o para 'Alterar Senha'.

### [cadastros] [Uso de APIs â€” CadastroApiEditor] BotÃ£o '+ Cadastrar' / 'âœï¸ Editar' conta da API
- **Categoria:** affordance · **Arquivo:** `src/app/(dashboard)/uso-apis/CadastroApiEditor.tsx:58-75`
- **Problema:** O botÃ£o tem fundo transparente com apenas uma borda fina azul e font-size 12px, embutido numa linha de texto informativo. No mobile o leigo pode nÃ£o perceber que Ã© clicÃ¡vel â€” parece parte do texto da linha, nÃ£o um controle interativo.
- **Sugestao:** Aumentar o peso visual do botÃ£o com background colorido leve (ex: background #eff6ff) e font-size 13px, ou usar o componente Btn do design system com variant='outline'. O minHeight: 44 jÃ¡ estÃ¡ correto.

### [cadastros] [Empresas / Editar â€” seÃ§Ã£o WhatsApp] Input 'Novo nÃºmero' + botÃ£o 'Reconectar WhatsApp'
- **Categoria:** entrada-dado · **Arquivo:** `src/app/(dashboard)/empresas/[id]/editar/page.tsx:132-153`
- **Problema:** O container usa 'display: flex, flexWrap: wrap' mas o input tem maxWidth: 240 e o botÃ£o tem texto longo. Em 390px eles podem quebrar em linhas sem alinhamento visual claro. O input nÃ£o tem placeholder que indique o formato correto e aceita qualquer nÃºmero sem validaÃ§Ã£o de comprimento mÃ­nimo antes de chamar a API.
- **Sugestao:** Usar flex-direction: column para empilhar label/input acima do botÃ£o no mobile. Adicionar validaÃ§Ã£o de comprimento mÃ­nimo (12 dÃ­gitos com DDI) antes de chamar handleReconectar.

### [cadastros] [Clientes / Novo â€” validaÃ§Ã£o do documento] Campo CNPJ/CPF (schema Zod)
- **Categoria:** entrada-dado · **Arquivo:** `src/app/(dashboard)/clientes/novo/page.tsx:25`
- **Problema:** O schema valida apenas o comprimento mÃ­nimo de 14 caracteres (linha 25), sem verificar os dÃ­gitos verificadores de CPF/CNPJ. Um leigo pode digitar '00000000000000' ou qualquer sequÃªncia repetida e salvar um documento matematicamente invÃ¡lido no banco.
- **Sugestao:** Adicionar refinamento Zod com validaÃ§Ã£o dos dÃ­gitos verificadores, ou usar biblioteca 'cpf-cnpj-validator' no onAccept do IMaskInput para bloquear documentos invÃ¡lidos antes do submit.

### [regras-autorizacoes-relatorios] [Autorizacoes â€” variante desktop, linha de telefone] Celula '+ telefone' (linha 239)
- **Categoria:** affordance · **Arquivo:** `src/app/(dashboard)/autorizacoes/page.tsx`
- **Problema:** A acao de inserir novo telefone esta em uma celula de tabela (<td onClick=...>) com texto '+ telefone' e padding de 2px 8px. Nao ha aparencia de botao â€” parece texto comum. Em mobile essa variante esta oculta, mas qualquer tela > 768px mostra essa celula como unico ponto de adicao, sem affordance clara.
- **Sugestao:** Substituir a celula <td onClick> por um botao visualmente distinto com background, borda e altura minima de 44px, para deixar claro ao leigo que e uma acao clicavel.

### [regras-autorizacoes-relatorios] [Autorizacoes â€” variante desktop, celulas de ativo/anotar/regra] Botoes de ciclar permissao nas celulas (linhas 216-228)
- **Categoria:** affordance · **Arquivo:** `src/app/(dashboard)/autorizacoes/page.tsx`
- **Problema:** Os botoes de permissao na tabela desktop tem width:'100%' e height: ROW_H (44px) â€” correto. Mas o titulo (tooltip) 'Pode usar o sistema?' / 'Pode anotar?' so aparece no hover, invisivel no celular. A semantica da acao de 'ciclar' (C â†’ A â†’ R â†’ vazio) nao e explicada em lugar nenhum visivel â€” apenas no bloco de legenda em texto pequeno (11px) no topo. Um leigo nao entende que clicar muda o nivel.
- **Sugestao:** Na legenda superior, tornar o texto de instrucao mais destacado (ex.: banner colorido 'Clique para ciclar: C â†’ A â†’ R â†’ sem permissao'). No mobile o card ja mostra o ciclo textualmente (linha 341), o que e correto.

### [regras-autorizacoes-relatorios] [Regras â€” listagem] MobileList (linha 165) + MobileCard sem variante de carregamento
- **Categoria:** loading · **Arquivo:** `src/app/(dashboard)/regras/page.tsx`
- **Problema:** Durante o carregamento inicial, a variante mobile renderiza um MobileList vazio sem qualquer indicador â€” a condicao 'loading ? null' (linha 166) deixa a tela em branco abaixo da barra de busca. O leigo ve uma tela vazia e nao sabe se esta carregando ou se nao ha regras.
- **Sugestao:** Dentro do bloco m-show-block, exibir um indicador de carregamento quando loading=true, similar ao que o DataTable desktop faz (linha 121-122: 'Carregando...' centralizado). Exemplo: {loading ? <div style={{textAlign:'center',padding:32,color:'#94a3b8'}}>Carregando...</div> : ordenadas.map(...)}

### [regras-autorizacoes-relatorios] [Regras â€” Tabelas e Campos (dados)] Matriz desktop (classe m-hide) â€” scroll horizontal sem variante mobile de fallback para tabela
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/regras/[id]/dados/page.tsx`
- **Problema:** A matriz de colunas x acoes no desktop e um <table> com width: 'max-content' dentro de m-hide, exibida corretamente apenas em desktop. A variante mobile (m-show-block, linha 307) substitui com cards verticais â€” adequado. Porem o botao 'Salvar' no PageHeader fica no topo fixo da pagina; apos rolar bastante (muitas tabelas), o usuario mobile nao ve o botao e pode nao saber como salvar.
- **Sugestao:** Adicionar um segundo botao 'Salvar' fixo ao rodape no mobile (position: fixed, bottom), ou um FAB de salvar, para que o usuario possa salvar sem rolar ate o topo.

### [regras-autorizacoes-relatorios] [Regras â€” Contexto IA] Resultado do contexto â€” bloco <pre> (linha 99)
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/regras/contexto/page.tsx`
- **Problema:** O contexto da IA e exibido em um <pre> com whiteSpace: 'pre-wrap' e overflow: 'auto'. No mobile a largura maxima e 760px (linha 67), mas a tela do gestor tem ~390px. O <pre> pode estourar a largura ou criar scroll horizontal interno dependendo do comprimento das linhas do contexto, tornando a leitura confusa.
- **Sugestao:** Adicionar maxWidth: '100%' e wordBreak: 'break-all' ou overflowWrap: 'break-word' ao <pre>, garantindo que o conteudo nao estoure a viewport de 390px.

### [regras-autorizacoes-relatorios] [Relatorios â€” KPIs] Grid de KPIs â€” 6 colunas fixas com classe m-kpi-grid (linha 331)
- **Categoria:** tabela · **Arquivo:** `src/app/(dashboard)/relatorios/page.tsx`
- **Problema:** O grid usa gridTemplateColumns: 'repeat(6, 1fr)' e a classe m-kpi-grid colapsa para 2 colunas no mobile (mobile.css linha 191-194). Com 6 KPIs em 2 colunas = 3 linhas, o KpiCard tem fontSize: 16px para o valor e wordBreak: 'break-all'. Valores monetarios como 'R$ 120.000,00' em colunas de ~180px (390px / 2 menos gaps) podem quebrar em 2 linhas dentro do card, desalinhando a grade visual. O clamp aplicado em alguns cards (linha 333-336) tenta mitigar mas nao e aplicado em todos.
- **Sugestao:** Aplicar o mesmo clamp de fontSize em TODOS os KpiCards de valor monetario, nao apenas em quatro deles. Verificar que o KpiCard de 'Pedidos no Periodo' e 'Margem' tambem usam o mesmo padrao para consistencia visual.

### [regras-autorizacoes-relatorios] [Relatorios â€” aba Veiculo, mobile] MobileCard com 7 campos de detalhe (linhas 535-549)
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/relatorios/page.tsx`
- **Problema:** O card de veiculo exibe 7 campos (Pedidos, Receita, Combustivel, Despesas, Custo Total, Lucro, Margem), o que e muito conteudo para um card mobile. Nao ha truncamento nem agrupamento â€” o card fica muito longo, tornando a leitura cansativa para um leigo.
- **Sugestao:** Reduzir os campos exibidos no card mobile para os mais importantes (ex.: Receita, Lucro, Margem), colocando os demais em uma secao expansivel ou em tela de detalhe ao tocar no card.

### [regras-autorizacoes-relatorios] [Roteirizacao â€” formulario] Campo Origem â€” inputs type='hidden' (linhas 271-272)
- **Categoria:** guardrail · **Arquivo:** `src/app/(dashboard)/roteirizacao/page.tsx`
- **Problema:** As coordenadas de latitude e longitude sao armazenadas em estados origemLat/origemLng e exibidas como texto informativo (linha 263-265), mas os inputs correspondentes sao type='hidden' e readonly (linhas 271-272). Isso significa que o usuario nao tem forma de corrigir manualmente uma coordenada errada. Se a geolocalizacao retornar um ponto incorreto (erro de GPS), o leigo nao tem saida a nao ser recarregar e tentar de novo.
- **Sugestao:** Tornar os campos de coordenada editaveis no caso de erro, ou adicionar um botao 'Limpar localizacao' que reseta origemLat e origemLng para permitir nova tentativa de geolocalizacao sem recarregar a pagina.

### [regras-autorizacoes-relatorios] [Autorizacoes â€” Empresas x Gestor, mobile] Botao 'Marcar todas' durante progresso (linha 164-170)
- **Categoria:** loading · **Arquivo:** `src/app/(dashboard)/autorizacoes/empresas/page.tsx`
- **Problema:** Durante a operacao marcarTodas, o botao mostra o texto de progresso (ex.: 'Salvando 2/5â€¦') mas nao ha indicador visual claro de que esta em andamento (sem spinner, sem disabled aparente â€” o opacity muda para 0.65 que e sutil). Para um leigo, parece que o sistema travou.
- **Sugestao:** Adicionar um spinner ao lado do texto de progresso no botao 'Marcar todas', para que o leigo perceba claramente que ha uma operacao em andamento.

### [integridade-gravacao] [Editar Pedido â€” aba Financeiro (lista de Entregas)] Select 'Pagamento Recebido' (pago) + executarSalvar
- **Categoria:** integridade · **Arquivo:** `src/app/(dashboard)/entregas/[id]/editar/page.tsx:97-117`
- **Problema:** Esta tela grava pedidos.pago e pedidos.data_pagamento DIRETO, sem olhar a tabela pedido_parcelas. O mÃ³dulo financeiro (FinanceiroPedido em /faturamento) Ã© a fonte de verdade do pagamento via parcelas e sincroniza pedidos.pago a partir das parcelas. CenÃ¡rio concreto: pedido tem 3 parcelas, 1 paga; gestor abre este Editar, muda 'Pagamento Recebido' para 'Pago' e salva â†’ pedidos.pago=true enquanto 2 parcelas seguem pago=false. A tela /faturamento, no carregamento, calcula 'quitado' pela soma das parcelas (estaQuitado usa pars.every(x=>x.pago)), entÃ£o mostrarÃ¡ o pedido como NÃƒO quitado, divergindo de pedidos.pago. Dado financeiro fica inconsistente entre as duas telas sem nenhum alerta. O inverso tambÃ©m vale (marcar Pendente com parcelas todas pagas).
- **Sugestao:** Ao salvar, verificar se o pedido tem parcelas (select count em pedido_parcelas). Se tiver, bloquear/avisar que o pagamento desse pedido Ã© gerido por parcela em Financeiro e nÃ£o gravar pago/data_pagamento por aqui; ou no mÃ­nimo exibir aviso de que isso vai desincronizar das parcelas.

### [integridade-gravacao] [Despacho â€” Detalhe do Pedido (Despachar/Trocar inline)] confirmarDespachoLocal â€” gravaÃ§Ã£o pedido + entregas
- **Categoria:** integridade · **Arquivo:** `src/app/(dashboard)/despacho/[id]/page.tsx:162-175`
- **Problema:** Na falha parcial, o aviso some quando o modal de despacho fecha e a tela principal nÃ£o reflete o estado real do banco. Fluxo: update em pedidos OK, depois update em entregas falha â†’ seta despachoErr 'Pedido despachado, mas houve erro ao atualizar as entregas'. Esse despachoErr sÃ³ Ã© renderizado DENTRO do ModalDespacho (prop err). O estado local do pedido (setPedido com veÃ­culo/motorista) sÃ³ Ã© aplicado no caminho de sucesso â€” entÃ£o no caminho de erro a tela principal continua mostrando o pedido como NÃƒO despachado, embora pedidos jÃ¡ tenha sido gravado com veÃ­culo/motorista. Ao fechar o modal, o gestor perde o aviso e vÃª a tela antiga, mascarando que o pedido jÃ¡ foi parcialmente despachado (pedido gravado, entregas nÃ£o). InconsistÃªncia telaÃ—banco sem rastro persistente.
- **Sugestao:** No ramo de erro das entregas, alÃ©m de despachoErr, propagar o aviso para o erroGravacao da pÃ¡gina (que tem banner persistente fora do modal) e atualizar setPedido com o veÃ­culo/motorista jÃ¡ gravados, para a tela refletir o estado real do banco mesmo apÃ³s fechar o modal.

## BAIXO (37)

### [painel] [Painel â€” DeleteBtn: botÃ£o de exclusÃ£o sem indicador de loading no botÃ£o de disparo] BotÃ£o 'Excluir' inicial (antes do modal de confirmaÃ§Ã£o)
- **Categoria:** layout · **Arquivo:** `src/components/ui/DeleteBtn.tsx:43-57`
- **Problema:** O botÃ£o que abre o modal de confirmaÃ§Ã£o (linha 43 de DeleteBtn.tsx) nÃ£o tem minHeight:44px declarado diretamente â€” depende da classe m-touch para atingir 44px no mobile. No entanto, o padding Ã© '4px 10px' e fontSize:'inherit', o que pode resultar em altura inferior a 44px se o font-size do contexto for pequeno (ex: 11px). O alvo de toque real pode ficar abaixo do mÃ­nimo.
- **Sugestao:** Adicionar minHeight:44px inline no botÃ£o ou confirmar que m-touch sempre vence o padding inline. Como o cÃ³digo jÃ¡ tem a classe m-touch, checar se mobile.css linha 131 com min-height:44px estÃ¡ aplicando corretamente sobre o padding declarado.

### [pedidos-listagem] [Listagem de Pedidos (page.tsx)] KPI grid â€” div.m-kpi-grid com 4 colunas
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/pedidos/page.tsx:308-315`
- **Problema:** O grid Ã© declarado inline com `gridTemplateColumns: 'repeat(4, 1fr)'` (linha 308) e o mobile.css sobrescreve para 2 colunas via `.m-kpi-grid` (correto). PorÃ©m, o KpiCard do primeiro item usa um label muito longo: `'Na lista Â· Em aberto (nÃ£o concluÃ­dos)'` â€” com 14px de fonte e padding 8px 12px, em 390px / 2 colunas cada card mede ~175px. O label em 10px/uppercase cabe, mas o `value` pode exibir nÃºmeros grandes (ex.: '3 456') sem `word-break`, quebrando o layout do card vizinho.
- **Sugestao:** Adicionar `overflow: hidden; text-overflow: ellipsis; whiteSpace: 'nowrap'` no `<p>` do label dentro de KpiCard (ds.tsx:184) ou reduzir o rÃ³tulo do primeiro KPI para algo mais curto ('Em aberto') quando em mobile.

### [pedidos-listagem] [Listagem de Pedidos (page.tsx)] Busca mobile â€” div.mobile-only (linha 415)
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/pedidos/page.tsx:415`
- **Problema:** O bloco de busca mobile usa a classe `mobile-only` (globals.css:49 â€” display:flex em â‰¤767px). O bloco de tabela desktop usa `m-hide` (mobile.css:40 â€” display:none em â‰¤767px). SÃ£o sistemas CSS paralelos com breakpoints diferentes? NÃ£o â€” ambos usam 767px, entÃ£o funciona. PorÃ©m `MobileList` usa `m-show` (mobile.css:41) enquanto o painel de busca mobile usa `mobile-only` (globals.css:49). Os dois exibem no mesmo breakpoint, mas misturar as classes cria inconsistÃªncia de manutenÃ§Ã£o. Em si nÃ£o Ã© bug visual, mas misturar os dois sistemas Ã© risco de regressÃ£o.
- **Sugestao:** Padronizar: substituir `mobile-only` por `m-show-block` (mobile.css) para consistÃªncia com o restante do sistema mobile (MobileList usa m-show, MobileFAB usa mobile-only â€” hÃ¡ trÃªs sistemas). Consolidar em um Ãºnico conjunto de classes.

### [pedidos-listagem] [Redirect /pedidos/[id] (page.tsx)] Spinner de redirect â€” sem mensagem explicativa para o leigo (linhas 43-52)
- **Categoria:** outro · **Arquivo:** `src/app/(dashboard)/pedidos/[id]/page.tsx:43-52`
- **Problema:** A tela de redirect exibe apenas 'Abrindo no Despachoâ€¦' com um spinner. Para um usuÃ¡rio leigo que clicou em um pedido na listagem, essa tela intermediÃ¡ria de redirect Ã© invisÃ­vel do ponto de vista UX mas pode aparecer por 1-2s em conexÃ£o lenta. NÃ£o hÃ¡ indicaÃ§Ã£o do que Ã© 'Despacho', nem confirmaÃ§Ã£o de que o pedido correto estÃ¡ sendo aberto.
- **Sugestao:** Acrescentar o nÃºmero ou identificador do pedido na mensagem de loading: 'Abrindo pedido no Despachoâ€¦'. Se a rota for muito transitÃ³ria (sub-1s na maioria dos casos), considerar usar redirect() server-side em um layout ou route handler, eliminando a tela de espera por completo.

### [pedidos-formularios] [Novo Pedido (simples)] BotÃ£o 'Criar Pedido' / botÃ£o 'Cancelar' (linhas 702-706)
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/pedidos/novo/page.tsx`
- **Problema:** Os botÃµes de aÃ§Ã£o ficam alinhados Ã  direita com `justifyContent: flex-end`. O `Btn` usa classe `m-touch` que no mobile garante `minHeight: 44px`, mas a div container nÃ£o tem `width: 100%` nem `flexWrap: wrap`. Em telas estreitas com dois botÃµes e `paddingBottom: 32px`, se o texto do botÃ£o for maior (ex.: 'Criando pedido...'), os dois botÃµes podem ficar espremidos ou cortados sem quebrar linha.
- **Sugestao:** Adicionar `flexWrap: 'wrap'` Ã  div de aÃ§Ãµes e garantir que ambos os botÃµes tenham `width: '100%'` no mobile via classe ou estilo responsivo.

### [pedidos-formularios] [Novo Pedido AvanÃ§ado (modo avanÃ§ado)] Step 3 â€” campo 'Valor do Pedido' com IMaskInput sem `loading` e sem `disabled` durante `saving` (linha 602-606)
- **Categoria:** loading · **Arquivo:** `src/app/(dashboard)/pedidos/novo-avancado/page.tsx`
- **Problema:** Durante o `saving === true`, o botÃ£o de submit fica desabilitado (correto), mas os campos do formulÃ¡rio (valor, km, datas, local, observaÃ§Ãµes) continuam editÃ¡veis. Isso permite que o usuÃ¡rio altere valores enquanto o pedido estÃ¡ sendo gravado â€” a Ãºltima tecla digitada nÃ£o serÃ¡ incluÃ­da porque o estado jÃ¡ foi capturado, mas o leigo pode ficar confuso ao ver os campos mudando enquanto 'Gerando Pedido...' aparece no botÃ£o.
- **Sugestao:** Adicionar `disabled={saving}` aos inputs do Step 3 durante o submit, ou envolver o formulÃ¡rio em um overlay de loading para deixar claro que a operaÃ§Ã£o estÃ¡ em curso.

### [pedidos-formularios] [Editar Pedido] BotÃ£o 'Atualizar Pedido' visÃ­vel apenas no desktop via `m-hide` (linha 283-288)
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/pedidos/[id]/editar/page.tsx`
- **Problema:** A div com `className='m-hide'` contÃ©m os botÃµes 'Cancelar' e 'Atualizar Pedido' para desktop. No mobile, esses botÃµes aparecem na div com `className='m-show'` (linha 291-296). O problema: `m-show` usa `display: flex` mas a div pai define `justifyContent: 'flex-end'` â€” no entanto o estilo inline na div `m-show` nÃ£o inclui `display: flex`, depende da classe CSS. Se o CSS nÃ£o carregar ou a classe nÃ£o funcionar, os botÃµes ficam invisÃ­veis no mobile. Verificando o CSS: `.m-show { display: flex !important }` estÃ¡ definido â€” correto. PorÃ©m o `gap: '8px'` estÃ¡ no estilo inline (linha 291) mas o `display` estÃ¡ na classe â€” o estilo inline nÃ£o inclui `display`, entÃ£o o elemento fica como `display: block` no desktop (correto, pois `m-show` some no desktop).
- **Sugestao:** Nenhuma aÃ§Ã£o urgente â€” o padrÃ£o m-show/m-hide estÃ¡ funcionando. Mas para seguranÃ§a, adicionar `display: 'flex'` no estilo inline da div de botÃµes mobile (linha 291) como fallback explÃ­cito.

### [pedidos-formularios] [Importar Notas â€” EtapaUpload] BotÃ£o 'Confirmar mapeamento' de planilha sem loading/disabled durante processamento (linha 327-335)
- **Categoria:** loading · **Arquivo:** `src/app/(dashboard)/pedidos/importar/_components/EtapaUpload.tsx`
- **Problema:** O botÃ£o 'Confirmar mapeamento' fica `disabled` apenas quando `mapColunas.endereco === undefined`, mas nÃ£o tem estado de loading. A funÃ§Ã£o `onConfirmarMapeamento` Ã© sÃ­ncrona (nÃ£o async), entÃ£o nÃ£o hÃ¡ risco de duplo clique nela. PorÃ©m o botÃ£o 'AvanÃ§ar' que aparece logo abaixo apÃ³s o mapeamento (`carregandoDedupe`) fica corretamente disabled. O problema Ã© cosmÃ©tico: o botÃ£o mapeamento nÃ£o comunica visualmente que algo foi processado apÃ³s o clique.
- **Sugestao:** ApÃ³s `onConfirmarMapeamento`, mostrar um feedback visual (ex.: mudar o rÃ³tulo para 'Mapeamento confirmado âœ“' por 2 segundos) para que o leigo saiba que a aÃ§Ã£o foi executada com sucesso.

### [pedidos-formularios] [Importar Notas â€” EtapaPreview] BotÃ£o 'Confirmar e importar' no modal sem `loading` e sem `disabled` (linha 199)
- **Categoria:** loading · **Arquivo:** `src/app/(dashboard)/pedidos/importar/_components/EtapaPreview.tsx`
- **Problema:** No modal de confirmaÃ§Ã£o de importaÃ§Ã£o em massa (linha 199), o botÃ£o 'Confirmar e importar' chama `onImportar()` mas nÃ£o tem `loading={importando}` nem `disabled={importando}`. ApÃ³s o clique, o modal fecha e o `importando` Ã© setado em `true`, mas o usuÃ¡rio poderia clicar no botÃ£o novamente antes do modal fechar (em redes lentas o fechamento Ã© sÃ­ncrono). O risco real Ã© baixo pois o modal fecha antes do await, mas o botÃ£o deveria ser defensivo.
- **Sugestao:** Adicionar `disabled={importando}` ao botÃ£o 'Confirmar e importar' no modal (linha 199) e um `loading={importando}` para cobrir o caso de clique duplo antes do modal fechar.

### [despacho] [Despacho â€” detalhe (/despacho/[id]) â€” Aba Principal] Input de 'Locais de carregamento' â€” fontSize conflitante com CSS global
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/despacho/[id]/_components/AbaPrincipal.tsx:164`
- **Problema:** O input de novo local (AbaPrincipal.tsx linha 164) tem style fontSize:'12px'. O mobile.css forÃ§a font-size:16px !important em todos os inputs abaixo de 768px (linha 18). O !important vence, tornando o input com fonte 16px mas com height mÃ­nima de 44px jÃ¡ correto â€” o problema Ã© que o fontSize do style inline Ã© ignorado silenciosamente, quebrando a intenÃ§Ã£o de fonte 12px no layout compacto.
- **Sugestao:** Remover o fontSize:'12px' inline do input â€” o mobile.css global jÃ¡ impÃµe 16px para evitar zoom no iOS. Ajustar padding do input se necessÃ¡rio para compensar a fonte maior.

### [despacho] [Despacho â€” detalhe (/despacho/[id]) â€” Aba Principal] LinhaCampos cols=3 para KMs â€” colapsa para 1 coluna no mobile
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/despacho/[id]/_components/shared.tsx:27-29`
- **Problema:** Quando kmRodado != null, LinhaCampos usa cols=3 (AbaPrincipal.tsx linha 213). Em shared.tsx linha 27-29, cols >= 3 usa a classe 'm-grid' que colapsa para 1 coluna no mobile. KM Inicial, KM Final e KM Rodados aparecem empilhados em 3 blocos separados, desperdiÃ§ando espaÃ§o vertical quando caberiam em 2 colunas (2+1).
- **Sugestao:** Para cols=3, usar 'm-grid-2' em vez de 'm-grid' no className, colapsando para 2 colunas (2+1) no mobile em vez de 1 coluna.

### [entregas] [Listagem de Pedidos (entregas/page.tsx)] BotÃ£o 'Receber' no MobileCard â€” clique duplo possÃ­vel durante loading
- **Categoria:** loading · **Arquivo:** `src/app/(dashboard)/entregas/page.tsx`
- **Problema:** Na linha 665 do MobileCard, o onClick do botÃ£o 'Receber' verifica loadingPago.has(id) e retorna sem fazer nada caso jÃ¡ esteja em loading. PorÃ©m, o botÃ£o nÃ£o estÃ¡ com a prop loading passada corretamente para desabilitar o elemento HTML (disabled nÃ£o Ã© passado). A prop loading={loadingPago.has(pedido.id)} estÃ¡ presente (linha 664), e o Btn com loading desabilita o botÃ£o via disabled={disabled || loading} (ds.tsx linha 84). Isso estÃ¡ correto, mas visualmente no MobileCard o spinner aparece muito pequeno (12px, ds.tsx linha 19) dentro de um botÃ£o sm de padding '4px 12px', o que para o leigo pode nÃ£o ser percebido como 'carregando'. NÃ£o Ã© crÃ­tico mas merece nota.
- **Sugestao:** Considerar trocar o texto do botÃ£o para 'Aguarde...' junto com o spinner no estado loading, tornando mais claro para o leigo que a aÃ§Ã£o estÃ¡ em processamento.

### [entregas] [Listagem de Pedidos (entregas/page.tsx)] Toolbar mobile â€” select 'Todos os status' com width inline de 160px
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/entregas/page.tsx`
- **Problema:** O bloco de filtros mobile (linha 487-495) usa ...selectStyle com flex: '1 1 120px'. PorÃ©m, o toolbar desktop (linha 413-421) usa um select com style={{ ...selectStyle, width: '160px' }} dentro do DataTable com m-hide â€” esse select NÃƒO fica visÃ­vel no mobile. O bloco mobile tem seu prÃ³prio select sem width fixo (flex: '1 1 120px'). Isso estÃ¡ correto. NÃ£o Ã© problema de quebra, mas o bloco mobile nÃ£o exibe o filtro de perÃ­odo quando mostrarPagos === false, diferentemente do desktop que sempre mostra o row de perÃ­odo. O usuÃ¡rio mobile nÃ£o tem acesso ao filtro de perÃ­odo nos pagos da mesma forma.
- **Sugestao:** Verificar se a paridade de filtros entre desktop e mobile estÃ¡ intencional. Se o filtro de perÃ­odo for Ãºtil, garantir que apareÃ§a no bloco mobile quando mostrarPagos === true (jÃ¡ existe na linha 499-517, parece correto â€” confirmar em teste real).

### [financeiro] [Financeiro > Despesas Avulsas] Coluna 'Descricao' (+ fornecedor) da DataTable desktop
- **Categoria:** tabela · **Arquivo:** `src/app/(dashboard)/financeiro/_components/AvulsasTab.tsx:265-268`
- **Problema:** Mesma falta de truncate: a celula Descricao mostra d.descricao e d.fornecedor sem limite de largura nem ellipsis; descricao longa quebra a linha e desalinha a tabela.
- **Sugestao:** Truncar com ellipsis e title no texto completo, mantendo a altura da linha consistente.

### [financeiro] [Financeiro > Fluxo Diario (tabela desktop)] Coluna 'Descricao' dos eventos do dia (ev.descricao + contexto)
- **Categoria:** tabela · **Arquivo:** `src/app/(dashboard)/financeiro/_components/FluxoTab.tsx:264-273`
- **Problema:** Na tabela desktop a descricao do evento nao tem truncate (so o card mobile tem ellipsis). Descricoes longas de frete/manutencao quebram em multiplas linhas e desalinham as colunas de valores a direita.
- **Sugestao:** Aplicar truncate/ellipsis com title na celula de descricao do desktop, igual ao card mobile (linha 347-351).

### [financeiro] [Financeiro > A Pagar] Botoes de filtro 'Pendentes/Atrasados/Todos' e '30d/60d/90d'
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/financeiro/_components/APagarTab.tsx:142-161`
- **Problema:** Os botoes de filtro tem minHeight:44px mas padding vertical de apenas 3-4px e fontSize 11-12px; o texto fica muito pequeno e os botoes de periodo (cor cinza claro #94a3b8 sobre branco) tem contraste baixo. Para um leigo no celular fica dificil ver qual filtro esta selecionado e acertar o toque (o alvo de 44px existe mas visualmente o botao parece menor).
- **Sugestao:** Aumentar fontSize p/ 13px, padding vertical e melhorar contraste do estado nao-selecionado (texto #475569 em vez de #94a3b8) para clareza.

### [financeiro] [Financeiro por Cliente (faturamento) > baixa rapida] Botao 'ðŸ’° Baixar' do pagamento unico + modal de confirmacao
- **Categoria:** loading · **Arquivo:** `src/app/(dashboard)/faturamento/page.tsx:356-360 (disabled={!!baixando})`
- **Problema:** O fluxo de baixa rapida esta bem feito (modal de confirmacao, baixandoRef anti-duplo-clique, erro exibido). Porem o botao 'Baixar' usa disabled={!!baixando} GLOBAL: enquanto uma baixa de QUALQUER pedido esta em curso, TODOS os botoes 'Baixar' da tela ficam desabilitados. Nao causa perda de dado, mas confunde o leigo (ele clica em outro pedido e nada acontece, sem explicacao).
- **Sugestao:** Desabilitar apenas o botao do pedido em baixa (baixando === p.id ja existe no loading); manter os outros clicaveis ou exibir um overlay 'Registrando pagamento...' claro.

### [financeiro] [Financeiro > Despesas Avulsas / Recorrencias (modais CRUD)] Botao 'Excluir' dentro do modal de edicao
- **Categoria:** guardrail · **Arquivo:** `src/app/(dashboard)/financeiro/_components/AvulsasTab.tsx:177-186,418-422 ; src/app/(dashboard)/financeiro/_components/RecorrenciasTab.tsx:166-175,399-403`
- **Problema:** Bom: a exclusao agora passa por modal de confirmacao (confirmExcluir). Porem ao confirmar a exclusao a partir do modal de EDICAO, o modal de edicao continua aberto por tras da confirmacao e so e fechado no fim (fecharModal dentro de confirmarExcluir). Em telas pequenas dois overlays empilhados (z-index 1000 e 1100) podem confundir; e se o delete falhar, setExcluindo(false) e return SEM fechar nada deixa o usuario com erro no modal-mae â€” o erro aparece na lista, nao no modal aberto.
- **Sugestao:** Ao abrir a confirmacao de exclusao a partir do modal de edicao, fechar o modal de edicao antes (ou exibir o erro de delete dentro do contexto correto) para nao deixar dois overlays/estado ambiguo.

### [financeiro] [Financeiro > Fluxo Diario] Entradas em atraso (line-through, cor cinza) na tabela e nos cards
- **Categoria:** outro · **Arquivo:** `src/app/(dashboard)/financeiro/_components/FluxoTab.tsx:104,260-291,352-356`
- **Problema:** Entradas vencidas e nao pagas aparecem riscadas e NAO entram no saldo acumulado (linha 104: e.pago || d >= dataAtual). Visualmente o valor riscado pode passar a impressao de 'cancelado/perdido' para um leigo, quando na verdade e um recebimento atrasado que ainda deve entrar. O title explica, mas no mobile nao ha title visivel ao toque.
- **Sugestao:** No mobile, em vez de so riscar, usar um rotulo curto tipo 'a receber (atrasado)' ou um badge, para o leigo entender que o dinheiro ainda e esperado e nao foi perdido.

### [financeiro] [Financeiro por Cliente (faturamento)] Acoes do pedido no mobile: botao ðŸšš (link Despacho) so com emoji
- **Categoria:** affordance · **Arquivo:** `src/app/(dashboard)/faturamento/page.tsx:355-369`
- **Problema:** Na expansao do cliente, cada pedido tem 'Baixar', 'Financeiro' e o link ðŸšš num flex-wrap. O botao ðŸšš (Btn ghost size sm, so emoji) tem affordance fraca â€” um leigo nao sabe que aquele caminhaozinho leva ao despacho. No mobile (~390px) com numero do pedido monospace + data + valor + forma + badges na linha de cima e 3 controles embaixo, o conjunto fica apertado.
- **Sugestao:** Dar rotulo de texto ao botao ðŸšš (ex.: 'ðŸšš Despacho') e garantir que os 3 controles nao colidam em 390px (empilhar ou usar largura total).

### [abastecimentos-adiantamentos] [Abastecimentos / Listagem] KPI cards â€” grid fixo de 4 colunas
- **Categoria:** tabela · **Arquivo:** `src/app/(dashboard)/abastecimentos/page.tsx:228-233 e src/components/ui/ds.tsx:185`
- **Problema:** O container dos KPI cards usa gridTemplateColumns: repeat(4,1fr) com classe m-kpi-grid. O CSS de m-kpi-grid colapsa para 2x2 no mobile â€” tecnicamente funciona. Porem os valores de KPI (ex.: 'R$ 12.345,67') em cards de ~174px podem truncar sem ellipsis, pois KpiCard usa fontSize 16px e a value nao tem overflow:hidden nem truncamento.
- **Sugestao:** Adicionar overflow:hidden e textOverflow:ellipsis ou fontSize menor no valor do KpiCard em viewports pequenas, ou reduzir casas decimais no mobile.

### [abastecimentos-adiantamentos] [Abastecimentos / Novo e Editar] Campo Posto â€” textTransform uppercase apenas visual
- **Categoria:** entrada-dado · **Arquivo:** `src/app/(dashboard)/abastecimentos/novo/page.tsx:151 e src/app/(dashboard)/abastecimentos/[id]/editar/page.tsx:176`
- **Problema:** O campo Posto usa style={{ textTransform: 'uppercase' }} no input, o que exibe o texto em maiusculas na tela, mas o valor de f.posto e salvo como digitado (sem .toUpperCase() no onChange). O .trim().toUpperCase() so e aplicado no handleSubmit. Nao e um bug de dado perdido, mas o leigo ve maiusculas e pode confundir se o banco armazena minusculas durante a sessao.
- **Sugestao:** Aplicar .toUpperCase() no onChange do campo posto para manter consistencia visual e de estado, ou remover o textTransform do input e deixar apenas a normalizacao no submit.

### [abastecimentos-adiantamentos] [Abastecimentos / Editar] Checkbox Confirmado â€” alvo de toque
- **Categoria:** affordance · **Arquivo:** `src/app/(dashboard)/abastecimentos/[id]/editar/page.tsx:179-189`
- **Problema:** O checkbox de confirmacao tem label com minHeight:44px e padding:12px 0, o que em teoria garante 44px de alvo. Porem o input type=checkbox tem width/height fixos de 20px sem classe m-touch, e a area clicavel do label depende do texto inline. Em alguns browsers iOS o alvo de toque pode ficar restrito ao checkbox + label text, nao ocupando os 44px completos.
- **Sugestao:** Garantir que o label tenha display:flex, width:100% e padding vertical suficiente, ou adicionar padding horizontal para expandir o alvo de toque ao minimo de 44px de largura tambem.

### [abastecimentos-adiantamentos] [Adiantamentos / Listagem] Cards mobile â€” campo Status duplicado nos details
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/adiantamentos/page.tsx:447-450`
- **Problema:** O MobileCard de adiantamentos exibe nos details: { label: 'Valor', value: ... } e { label: 'Status', value: ... }. O campo Status ja aparece como badge no topo direito do card. O leigo ve a informacao de status duplicada, ocupando espaco precioso no card mobile.
- **Sugestao:** Remover o detail de Status do MobileCard, mantendo apenas o badge. Substituir pelo dado de data_pagamento se disponivel, que e informacao mais util no contexto.

### [abastecimentos-adiantamentos] [Abastecimentos / Listagem] Coluna Motorista na tabela desktop â€” sem truncate
- **Categoria:** tabela · **Arquivo:** `src/app/(dashboard)/abastecimentos/page.tsx:288`
- **Problema:** A celula Td do motorista nao tem limite de largura nem truncamento, ao contrario da celula de Veiculo que ja tem maxWidth:180px. Nomes longos de motorista podem desalinhar as colunas.
- **Sugestao:** Adicionar maxWidth, overflow:hidden e textOverflow:ellipsis na celula de Motorista, similar ao tratamento da celula de Veiculo na linha 287.

### [abastecimentos-adiantamentos] [Adiantamentos / Novo e Editar] Campo Valor (R$) â€” sem prefixo R$ visivel
- **Categoria:** entrada-dado · **Arquivo:** `src/app/(dashboard)/adiantamentos/novo/page.tsx:122-131 e src/app/(dashboard)/adiantamentos/[id]/editar/page.tsx:167-176`
- **Problema:** O label diz 'Valor (R$) *' mas o campo de input nao tem prefixo visual 'R$' nem mascara monetaria. O leigo deve digitar '500' ou '500,00' sem guia visual. O placeholder '0,00' ajuda mas nao e suficiente para indicar que e moeda.
- **Sugestao:** Adicionar um prefixo 'R$' ao lado esquerdo do campo (wrapper com position:relative e span absoluto), ou usar inputMode='numeric' com mascara de moeda para guiar o leigo.

### [veiculos-motoristas] [VeÃ­culos â€” Editar > Aba Plano de ManutenÃ§Ã£o (PlanoTab)] BotÃ£o 'Cadastrar tipo' (linha 217)
- **Categoria:** loading · **Arquivo:** `src/app/(dashboard)/veiculos/[id]/editar/_components/PlanoTab.tsx`
- **Problema:** O botÃ£o usa `disabled={salvandoNovo}` com texto condicional 'Salvando...' mas sem `loading={salvandoNovo}` â€” nÃ£o aparece spinner, comportamento inconsistente com o resto do sistema.
- **Sugestao:** Trocar para `loading={salvandoNovo}` no Btn (linha 217).

### [cadastros] [Perfil / Meu Perfil] Mensagem de sucesso genÃ©rica
- **Categoria:** outro · **Arquivo:** `src/app/(dashboard)/perfil/page.tsx:77`
- **Problema:** ApÃ³s salvar, a mensagem Ã© sempre 'Perfil atualizado com sucesso!' inclusive quando nenhum campo foi alterado (todos em branco). O leigo nÃ£o sabe se a operaÃ§Ã£o teve algum efeito real.
- **Sugestao:** Diferenciar a mensagem: se senha foi alterada, dizer 'Senha atualizada com sucesso!'; se nenhum campo foi preenchido, nÃ£o submeter e exibir aviso 'Preencha a senha atual e a nova senha para alterar'.

### [cadastros] [UsuÃ¡rios / Lista mobile] MobileCard do prÃ³prio usuÃ¡rio logado
- **Categoria:** affordance · **Arquivo:** `src/app/(dashboard)/usuarios/page.tsx:208-226`
- **Problema:** O card do prÃ³prio usuÃ¡rio (isMe=true) nÃ£o tem href nem onClick, mas visualmente Ã© idÃªntico aos cards clicÃ¡veis dos outros usuÃ¡rios. O leigo clica e nada acontece, sem mensagem explicativa.
- **Sugestao:** Redirecionar o card do prÃ³prio usuÃ¡rio para '/perfil', ou adicionar um detalhe 'Edite em Meu Perfil' no card para orientar o leigo.

### [cadastros] [Clientes / Listagem mobile] Contador '0 clientes' durante carregamento
- **Categoria:** loading · **Arquivo:** `src/app/(dashboard)/clientes/page.tsx:111-115`
- **Problema:** A toolbar mobile exibe '{filtrados.length} de {todos.length} clientes' enquanto loading=true. Como todos=[] antes dos dados chegarem, o contador mostra '0 de 0 clientes', podendo fazer o usuÃ¡rio acreditar que nÃ£o hÃ¡ nenhum cliente cadastrado.
- **Sugestao:** Condicionar a exibiÃ§Ã£o do contador a 'loading ? null : <span>...clientes</span>', mesmo padrÃ£o jÃ¡ usado no PageHeader (count={loading ? undefined : todos.length}).

### [regras-autorizacoes-relatorios] [Regras â€” Nova Regra / Editar Regra] Grid 3 colunas 'Identificacao' (linha 124 em novo/page.tsx, linha 136 em editar/page.tsx)
- **Categoria:** entrada-dado · **Arquivo:** `src/app/(dashboard)/regras/[id]/editar/page.tsx`
- **Problema:** O grid usa gridTemplateColumns: '2fr 1fr 1fr' com classe m-grid, que colapsa corretamente para 1fr no mobile. Porem o campo 'Prioridade' (numero) nao tem inputMode='numeric' no formulario de edicao (editar/page.tsx linha 146), apenas no de criacao (novo/page.tsx linha 134). No mobile, o teclado numerico nao e aberto automaticamente ao editar a prioridade.
- **Sugestao:** Adicionar inputMode='numeric' no input de prioridade da tela de edicao (linha 146): <input type='number' inputMode='numeric' value={form.prioridade} .../>.

### [regras-autorizacoes-relatorios] [Regras â€” Tabelas e Campos (dados)] Variante mobile â€” secao Escrita, tabela de campos (linha 516-568)
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/regras/[id]/dados/page.tsx`
- **Problema:** Na secao Escrita (registro), os inputs inline dos campos (Rotulo, Pergunta do bot) tem style={{ ...inputSty, width: '100%' }} mas inputSty define fontSize: 12 (linha 213). No mobile o CSS global forca font-size: 16px em inputs para evitar zoom no iOS (mobile.css linha 17-19), o que vai sobrescrever os 12px via !important. O usuario vera o texto maior do que o esperado, podendo desalinhar os cards.
- **Sugestao:** Esse comportamento e na verdade correto para usabilidade (evita zoom), mas pode causar quebra de layout. Revisar o layout dos cards de campo no mobile para acomodar texto em 16px sem estouro visual.

### [regras-autorizacoes-relatorios] [Relatorios â€” filtro de periodo] Botoes de modo Mes/Ano/Range livre (linhas 285-297)
- **Categoria:** layout · **Arquivo:** `src/app/(dashboard)/relatorios/page.tsx`
- **Problema:** Os tres botoes de selecao de periodo sao renderizados inline com minHeight: 44px cada â€” correto. Porem o container usa overflow: 'hidden' (linha 284) e nao tem overflow-x: scroll. Em telas muito estreitas (<360px) os tres textos 'Mes', 'Ano' e 'Range livre' podem ser cortados. 'Range livre' em especial e longo para um botao de 14px.
- **Sugestao:** Trocar 'Range livre' por 'Periodo' ou 'Livre' para caber melhor em telas pequenas, ou adicionar overflow-x: auto no container dos botoes.

### [regras-autorizacoes-relatorios] [Relatorios â€” botao Exportar CSV] Btn 'Exportar CSV' no PageHeader (linha 267)
- **Categoria:** loading · **Arquivo:** `src/app/(dashboard)/relatorios/page.tsx`
- **Problema:** O botao nao tem estado de loading durante a geracao do arquivo. A exportacao e sincrona (nao async), mas em datasets grandes (muitos pedidos) o saveAs pode demorar e o botao nao da feedback. Alem disso, o Btn com variant='outline' no PageHeader tem size='sm' por padrao (padding 4px 12px), mas nao tem minHeight explicito â€” a classe m-touch do ds.tsx aplica minHeight 44px via CSS, o que e correto; porem convem confirmar.
- **Sugestao:** Embora a exportacao seja sincrona, considerar adicionar um breve estado 'Gerando...' (useState) para dar feedback ao leigo antes do download comecar, especialmente em mobile onde o inicio do download pode nao ser obvio.

### [regras-autorizacoes-relatorios] [Roteirizacao â€” formulario] Btn 'Otimizar agora' com prop loading (linha 275)
- **Categoria:** loading · **Arquivo:** `src/app/(dashboard)/roteirizacao/page.tsx`
- **Problema:** O Btn usa a prop loading={otimizando} corretamente â€” desabilita e mostra spinner. Porem o texto do botao e controlado manualmente com operador ternario (linha 276: '{otimizando ? Otimizando : Otimizar agora}'), enquanto o Btn ja mostra spinner interno quando loading=true. Isso resulta em dois indicadores simultaneos: o spinner do Btn E o texto 'Otimizandoâ€¦', que e redundante mas nao e critico.
- **Sugestao:** Remover a duplicidade: ou usar apenas o spinner interno do Btn (deixar texto fixo 'Otimizar agora') ou passar o texto via children e desabilitar o spinner (loading=false), mantendo apenas um indicador visual.

### [regras-autorizacoes-relatorios] [Roteirizacao â€” resultado da otimizacao] Links 'Ajustar paradas', 'Google Maps' e 'Enviar via WhatsApp' (linhas 300-337)
- **Categoria:** affordance · **Arquivo:** `src/app/(dashboard)/roteirizacao/page.tsx`
- **Problema:** Os tres links de acao apos otimizar sao elementos <a> estilizados com btnLinkStyle (minHeight: 44). Porem eles nao tem aparencia de botao para um leigo: fundo colorido sem borda, sem sombra, sem texto descritivo adicional. Em especial o link 'Ajustar paradas' abre /mobile/ajuste-rota em uma nova aba (target='_blank') sem nenhum aviso ao usuario de que vai abrir outra pagina.
- **Sugestao:** Adicionar um pequeno icone de 'abre em nova aba' ou texto explicativo perto dos links que abrem novas abas. Os links ja tem minHeight 44px o que e correto.

### [integridade-gravacao] [Editar Pedido â€” /entregas/[id]/editar] executarSalvar â€” status Ã— datas reais
- **Categoria:** integridade · **Arquivo:** `src/app/(dashboard)/entregas/[id]/editar/page.tsx:119-144`
- **Problema:** Ã‰ possÃ­vel gravar combinaÃ§Ã£o inconsistente de status Ã— datas reais sem nenhuma validaÃ§Ã£o. O formulÃ¡rio permite digitar data_inicio_real e data_fim_real livremente e escolher status independentemente: dÃ¡ para salvar status='agendado' com data_fim_real preenchida, status='concluido' sem nenhuma data real, ou data_fim_real anterior a data_inicio_real (hÃ¡ checagem entre km_inicial/km_final, mas nenhuma entre as duas datas reais nem entre status e datas). Isso gera registros que relatÃ³rios/KPIs de execuÃ§Ã£o leem como contraditÃ³rios (pedido 'agendado' com fim real registrado).
- **Sugestao:** Validar antes de gravar: se data_fim_real < data_inicio_real â†’ erro; se status='concluido' exigir data_fim_real (ou avisar); se status 'agendado'/'em_andamento' com data_fim_real preenchida â†’ avisar. Mesmo padrÃ£o de guardrail jÃ¡ usado para km_final < km_inicial.

