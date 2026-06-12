# Auditoria Mobile do Gestor — 11/06/2026

> Gerado por workflow de 14 agentes (10 auditores de tela, 1 investigador de navegacao, 3 pesquisadores web).
> Total: 153 problemas — critico=11 alto=54 medio=67 baixo=21

## Bug do voltar cair no login — causa raiz

CAUSA NÂº1 (mais provÃ¡vel): guard de auth frÃ¡gil e duplicado em cada pÃ¡gina do dashboard. Quase todas as telas (pedidos, veÃ­culos, despacho, entregas, etc.) rodam num useEffect de mount: `const { data: auth } = await supabase.auth.getUser(); if (!auth.user) { router.push("/login"); return; }`. Dois problemas combinados: (a) `getUser()` Ã© uma CHAMADA DE REDE ao endpoint /auth/v1/user do Supabase â€” em rede mÃ³vel instÃ¡vel, ou quando o access token expirou enquanto o app estava em background e o refresh ainda estÃ¡ em andamento/falha transitoriamente, o supabase-js devolve `{ data: { user: null }, error: AuthRetryableFetchError }` â€” ou seja, user = null MESMO COM SESSÃƒO VÃLIDA; o guard nÃ£o distingue "erro de rede" de "deslogado". (b) No App Router, apertar VOLTAR remonta o componente da pÃ¡gina anterior e RE-EXECUTA o useEffect â€” entÃ£o o guard roda de novo exatamente no momento do back. No celular isso casa com o cenÃ¡rio clÃ¡ssico: gestor usa o app, celular dorme/troca de aba (token expira), ele volta, clica numa aba (essa pÃ¡gina atÃ© carrega porque o token foi renovado no meio), aperta voltar â†’ a pÃ¡gina anterior remonta â†’ getUser() pega a janela ruim (refresh em corrida ou rede oscilando) â†’ null â†’ `router.push("/login")`. E como Ã© `push` (nÃ£o `replace`), o /login ainda entra NO HISTÃ“RICO, contaminando os prÃ³ximos backs. CAUSA NÂº2 (agravante de histÃ³rico): a pÃ¡gina /login NÃƒO tem guarda reversa ("jÃ¡ logado â†’ manda pra /"). Depois do login (server action faz redirect('/')), o /login fica como entrada anterior do histÃ³rico; e cada chute indevido dos guards adiciona mais entradas /login no meio da pilha. Resultado: qualquer back que caia numa dessas entradas mostra o formulÃ¡rio de login mesmo com sessÃ£o vÃ¡lida â€” pro usuÃ¡rio, "voltei e caÃ­ no login". CAUSA NÂº3 (cenÃ¡rio offline/aba descartada): o Chrome mÃ³vel descarta a aba sob pressÃ£o de memÃ³ria; nesse caso o back vira um carregamento COMPLETO do documento, que passa pelo service worker. O sw.js usa rede-primeiro e, falhando a rede, cai num fallback que serve qualquer shell prÃ©-cacheada â€” a lista inclui '/login' (PRECACHE_SHELLS = ['/motorista','/mobile/rota','/login']). AlÃ©m disso, `cache.put(req, res.clone())` no networkFirstNav grava respostas REDIRECIONADAS: se alguma vez o servidor redirecionou uma URL do dashboard pra /login (ex.: page.tsx de "/" faz redirect("/login") quando getUser server-side falha), o HTML do login fica cacheado SOB a URL do dashboard, e o back offline serve login. O proxy/middleware (src/proxy.ts) sÃ³ renova sessÃ£o, nÃ£o redireciona â€” entÃ£o toda a expulsÃ£o pro login Ã© client-side via esses guards.

### Evidencias
- **C:\Users\ronal\Documents\Antigravity\SISTEMA_DE_FROTA\src\app\(dashboard)\veiculos\page.tsx:33** — PadrÃ£o do guard repetido em ~25 pÃ¡ginas do dashboard (pedidos/page.tsx:142-143, despacho/_components/useDespacho.ts:144-145, entregas/page.tsx:91, clientes/page.tsx:30, etc.). getUser() Ã© chamada de rede: em falha de rede ou refresh de token em corrida, devolve user=null com AuthRetryableFetchError â€” e o guard chuta pro /login sem checar o error. Como o useEffect roda em TODO mount, o botÃ£o voltar (que remonta a pÃ¡gina anterior) re-dispara essa checagem. E usa router.push, nÃ£o replace â€” o /login entra no histÃ³rico.
- **C:\Users\ronal\Documents\Antigravity\SISTEMA_DE_FROTA\src\app\(dashboard)\despacho\_components\useDespacho.ts:144** — Mesmo guard na aba Despacho â€” uma das 4 abas da MobileBottomNav. Confirma que o problema atinge exatamente as telas que o gestor navega pelo bottom nav.
- **C:\Users\ronal\Documents\Antigravity\SISTEMA_DE_FROTA\src\app\login\page.tsx:101** — A pÃ¡gina de login NÃƒO verifica se jÃ¡ existe sessÃ£o. Se /login ficou no histÃ³rico (apÃ³s o login ou apÃ³s um chute indevido de guard), apertar voltar renderiza o formulÃ¡rio de login mesmo com o usuÃ¡rio autenticado â€” nÃ£o se 'auto-cura' redirecionando de volta pro dashboard.
- **C:\Users\ronal\Documents\Antigravity\SISTEMA_DE_FROTA\src\app\login\actions.ts:51** — ApÃ³s logar, o redirect server-side leva pra '/', mas a entrada /login permanece como item anterior do histÃ³rico do navegador (o POST do form + 303 nÃ£o removem a entrada GET /login). Ã‰ a semente da pilha de histÃ³rico com /login no meio.
- **C:\Users\ronal\Documents\Antigravity\SISTEMA_DE_FROTA\src\app\(dashboard)\page.tsx:54** — A aba 'InÃ­cio' (/) Ã© server component e tambÃ©m chuta pro /login se getUser server-side falhar (ex.: corrida de rotaÃ§Ã£o de refresh token entre requisiÃ§Ãµes paralelas). Um back pra '/' depois que o Router Cache expirou (~30s) refaz o fetch RSC e pode cair nesse redirect.
- **C:\Users\ronal\Documents\Antigravity\SISTEMA_DE_FROTA\src\proxy.ts:6** — O middleware (convenÃ§Ã£o proxy do Next 16) SÃ“ renova a sessÃ£o (updateSession chama supabase.auth.getUser() e segue adiante) â€” nÃ£o hÃ¡ redirect centralizado pro login. Toda a proteÃ§Ã£o Ã© client-side nos guards frÃ¡geis acima. Isso descarta o middleware como culpado e confirma que o chute vem do cliente.
- **C:\Users\ronal\Documents\Antigravity\SISTEMA_DE_FROTA\public\sw.js:30** — Fallback de navegaÃ§Ã£o offline (sw.js:117-122) varre essas shells em ordem e serve a primeira que achar â€” '/login' estÃ¡ na lista. Se o celular descartou a aba e o back vira carregamento completo sem rede, uma rota do dashboard nunca cacheada pode renderizar a shell do /login (ou /motorista).
- **C:\Users\ronal\Documents\Antigravity\SISTEMA_DE_FROTA\public\sw.js:109** — networkFirstNav cacheia a resposta SEM checar res.redirected. Se o servidor alguma vez respondeu uma URL do dashboard com redirect 303â†’/login (caso do page.tsx:55 acima), o HTML do login Ã© gravado no cache SOB a URL do dashboard â€” back offline futuro pra essa URL serve a tela de login.
- **C:\Users\ronal\Documents\Antigravity\SISTEMA_DE_FROTA\src\components\layout\MobileBottomNav.tsx:47** — A MobileBottomNav estÃ¡ CORRETA: usa <Link> do next/link (navegaÃ§Ã£o client-side, sem window.location, sem reload). Ela nÃ£o Ã© a culpada â€” o clique na aba sÃ³ dispara o mount da pÃ¡gina destino, cujo guard Ã© o problema.
- **C:\Users\ronal\Documents\Antigravity\SISTEMA_DE_FROTA\src\lib\supabase\client.ts:5** — Cliente browser do @supabase/ssr (sessÃ£o em cookies). getUser() desse cliente sempre valida no servidor do Supabase (rede); nÃ£o hÃ¡ uso de getSession() (leitura local, sem rede) nos guards â€” por isso qualquer oscilaÃ§Ã£o de rede mÃ³vel vira 'user null'.

### Correcoes sugeridas
- 1) CORREÃ‡ÃƒO PRINCIPAL â€” endurecer o guard contra falha de rede: nos guards de mount, trocar a lÃ³gica por algo que distinga 'sem sessÃ£o' de 'erro de rede'. Ex.: `const { data, error } = await supabase.auth.getUser(); if (!data.user) { if (error && error.name === 'AuthRetryableFetchError') return; /* rede caiu: nÃ£o chutar */ router.replace('/login'); }` â€” ou, mais simples e sem rede: usar `supabase.auth.getSession()` (lÃª do cookie/local, nÃ£o falha por rede) para o guard de tela e deixar a validaÃ§Ã£o real pro servidor/RLS.
- 2) Trocar `router.push('/login')` por `router.replace('/login')` em TODOS os guards (sÃ£o ~25 ocorrÃªncias em src/app/(dashboard)/** e (motorista)/**) â€” o /login nunca deve virar entrada de histÃ³rico no meio da navegaÃ§Ã£o. O grep `router.push("/login")` lista todos os pontos.
- 3) Centralizar a proteÃ§Ã£o em UM lugar em vez de 25 cÃ³pias: ou (a) no proxy (src/proxy.ts / updateSession): se `!user` e o pathname nÃ£o for pÃºblico (/login, /politica..., /api/...), retornar `NextResponse.redirect(new URL('/login', request.url))` â€” redirect server-side no documento nÃ£o polui o histÃ³rico do SPA; ou (b) um hook/componente Ãºnico `<AuthGuard>` no layout do dashboard. Depois, remover os guards por pÃ¡gina (ou mantÃª-los sÃ³ como fallback com replace).
- 4) Guarda reversa no /login: no topo da pÃ¡gina (ou num useEffect), checar `getSession()`; se jÃ¡ houver sessÃ£o, `router.replace('/')`. Assim, mesmo que uma entrada /login sobre no histÃ³rico, o back nela se auto-corrige e volta pro dashboard em vez de mostrar o formulÃ¡rio.
- 5) Service worker (public/sw.js, espelhando src/lib/offline/swCache.ts): (a) em networkFirstNav, NÃƒO cachear resposta redirecionada: `if (res && res.ok && !res.redirected) cache.put(req, res.clone())` â€” evita gravar o HTML do login sob URL do dashboard; (b) no fallback offline, nÃ£o servir '/login' (nem '/motorista') para rotas do dashboard do gestor â€” restringir o fallback de shell por Ã¡rea (ex.: sÃ³ usar '/login' como fallback se a prÃ³pria requisiÃ§Ã£o era /login) ou mostrar a pÃ¡gina 503 'Sem conexÃ£o' para rotas de dashboard nÃ£o cacheadas. Lembrar a regra do projeto: mudar a estratÃ©gia primeiro em src/lib/offline/swCache.ts (que tem os testes) e espelhar no sw.js.
- 6) (Opcional, qualidade de vida) Assinar `supabase.auth.onAuthStateChange` num provider Ãºnico do dashboard e sÃ³ redirecionar pro login no evento `SIGNED_OUT` explÃ­cito â€” elimina de vez a corrida 'primeiro paint sem sessÃ£o'.

## Problemas — CRITICO (11)

### [/] CienteModal â€” sem tratamento de erro na chamada fetch
- **Arquivo:** `src/components/dashboard/LembretesWidget.tsx:73-81`
- **Problema:** A funÃ§Ã£o `salvar` em CienteModal (linha 73-81) faz um `await fetch(...)` mas nÃ£o tem try/catch nem checa `response.ok`. Se a requisiÃ§Ã£o falhar (rede, 500, timeout), o modal fecha (`onClose()`) e o lembrete desaparece da tela (quando `ocultar=true`) sem que o banco tenha sido atualizado. O usuÃ¡rio perde o feedback e pensa que deu ciente quando nÃ£o deu.
- **Sugestao:** Envolver em try/catch, checar `res.ok`. Em caso de erro, manter o modal aberto e exibir mensagem de erro. Nunca chamar `onDone/onClose` se a requisiÃ§Ã£o falhou.

### [/] MobileBottomNav â€” altura sem safe area no iPhone
- **Arquivo:** `src/components/layout/MobileBottomNav.tsx:29-39`
- **Problema:** O nav tem `height: '56px'` fixo no inline style, mas a classe `mobile-bottom-nav` em mobile.css define `height: calc(var(--bottom-nav-h) + var(--safe-bottom))`. O inline style `height: '56px'` tem maior especificidade e sobrescreve a regra CSS, entÃ£o em iPhones com home indicator (safe-area-inset-bottom ~34px) o nav fica com apenas 56px â€” o conteÃºdo do nav fica atrÃ¡s da barra de gestos e os botÃµes de navegaÃ§Ã£o ficam cortados.
- **Sugestao:** Remover `height: '56px'` do inline style do `<nav>`, deixando apenas a classe CSS `mobile-bottom-nav` controlar a altura com safe area. Alternativamente, mudar o inline style para `height: 'calc(56px + env(safe-area-inset-bottom, 0px))'`.

### [/pedidos/[id]] Redirect de detalhe do pedido
- **Arquivo:** `src/app/(dashboard)/pedidos/[id]/page.tsx:22`
- **Problema:** A pagina usa `router.replace` para redirecionar para `/despacho/${id}`. O `replace` substitui a entrada no historico, entao ao clicar no botao Voltar do celular o usuario NAO retorna a listagem de pedidos â€” sai do fluxo. O comentario no codigo nao justifica o uso de `replace` aqui.
- **Sugestao:** Trocar `router.replace` por `router.push` para preservar o historico de navegacao e permitir o botao Voltar funcionar corretamente.

### [/pedidos/novo-avancado] Step 3 â€” Layout 2 colunas (grid 1fr 1fr)
- **Arquivo:** `src/app/(dashboard)/pedidos/novo-avancado/page.tsx:449`
- **Problema:** gridTemplateColumns: '1fr 1fr' hardcoded sem media query. Em 390px os dois paineis (Veiculo/Itinerario e Dados do Pedido) ficam lado a lado com ~165px cada, tornando todos os inputs, selects e o itinerario ilegivel.
- **Sugestao:** Adicionar className='m-stack' ao div do grid ou usar media query para colapsar para 1 coluna no mobile.

### [/pedidos/[id]/editar] Linha de abas + botoes Cancelar/Atualizar â€” posicao fixa no topo
- **Arquivo:** `src/app/(dashboard)/pedidos/[id]/editar/page.tsx:254-273`
- **Problema:** O div das abas usa display:flex justifyContent:space-between mas sem overflow nem wrap. Em 390px as 3 abas ('Dados do Pedido', 'Entregas Vinculadas(N)', 'Adicionar Entregas(+N)') + os 2 botoes (Cancelar, Atualizar) ficam todos na mesma linha. Os textos das abas vao truncar ou empurrar os botoes para fora da viewport â€” o botao 'Atualizar' pode ficar invisivel ou inacessivel.
- **Sugestao:** Separar os botoes de acao do componente Tabs. Os botoes devem ficar em uma linha fixa abaixo (ou usar FAB no mobile), e as abas em linha separada com overflow-x:auto (m-tabs-scroll ja esta no componente Tabs).

### [/despacho/[id]] changeStatus â€” ausÃªncia de feedback de erro para o usuÃ¡rio
- **Arquivo:** `src/app/(dashboard)/despacho/[id]/page.tsx:176`
- **Problema:** A funÃ§Ã£o changeStatus em page.tsx (linha 164) faz await supabase.from('pedidos').update(...) sem verificar o erro retornado. Se a gravaÃ§Ã£o falhar (RLS, constraint, rede), o estado local Ã© atualizado mesmo assim (setPedido na linha 177) e o usuÃ¡rio nÃ£o vÃª nenhuma mensagem de erro â€” acredita que o status mudou quando nÃ£o mudou.
- **Sugestao:** Capturar o error retornado pelo update e, se presente, exibir um Alert de erro ao usuÃ¡rio (setar um estado de erro visÃ­vel) sem atualizar o estado local do pedido.

### [/despacho/[id]] salvarLocais â€” ausÃªncia de feedback de erro para o usuÃ¡rio
- **Arquivo:** `src/app/(dashboard)/despacho/[id]/page.tsx:187`
- **Problema:** A funÃ§Ã£o salvarLocais (linha 182) faz dois awaits (update pedido + update entregas) sem verificar nenhum dos erros retornados. Falha silenciosa idÃªntica ao changeStatus.
- **Sugestao:** Verificar os erros do Supabase apÃ³s cada update e exibir mensagem de erro ao usuÃ¡rio caso a gravaÃ§Ã£o falhe.

### [/faturamento] Botao 'Baixar' pagamento unico
- **Arquivo:** `src/app/(dashboard)/faturamento/page.tsx:337-340`
- **Problema:** Nao ha estado de loading visivel no label do botao enquanto baixando === p.id â€” so exibe '...' sem disabled. O botao 'Baixar' nao usa disabled={baixando === p.id}, logo o usuario pode clicar multiplas vezes enquanto a requisicao esta em andamento.
- **Sugestao:** Adicionar disabled={!!baixando} (ou disabled={baixando === p.id} ja esta mas verificar) â€” o codigo ja tem disabled={baixando===p.id}, mas o texto '...' e indistinguivel de um botao vazio; usar 'Salvando...' e desabilitar todos os botoes de baixa enquanto qualquer baixa esta em curso.

### [/usuarios] MobileCard â€” botao Remover ausente
- **Arquivo:** `src/app/(dashboard)/usuarios/page.tsx:183-201`
- **Problema:** O botao RemoverUsuarioBtn aparece so dentro do DataTable (m-hide). No mobile, o MobileCard nao tem actions={} com esse botao. O usuario mobile nao tem como remover um usuario.
- **Sugestao:** Passar actions={!isMe && <RemoverUsuarioBtn .../>} para o MobileCard de cada usuario.

### [/regras/[id]/dados] Botao Salvar (PageHeader)
- **Arquivo:** `src/app/(dashboard)/regras/[id]/dados/page.tsx:149`
- **Problema:** A funcao `salvar` nao tem estado de loading/disabled. Durante o fetch de validacao (~1-2s) e o update do Supabase o botao permanece clicavel e sem feedback visual, permitindo cliques duplos que disparam multiplos updates concorrentes.
- **Sugestao:** Adicionar estado `const [salvando, setSalvando] = useState(false)`, setar true no inicio e false no finally, passar `disabled={salvando}` e texto 'Salvando...' ao Btn.

### [/autorizacoes] Tela inteira â€” matrix desktop-only
- **Arquivo:** `src/app/(dashboard)/autorizacoes/page.tsx:31`
- **Problema:** A pagina de autorizacoes e uma tabela de matrix com largura `width: max-content` e colunas de 22-30px, cabecalho vertical de 140px e sticky positioning sofisticado. Nao ha nenhuma variante mobile (sem classe m-hide/m-show, sem MobileCard). Em 390px a tela vira scroll horizontal inutilizavel â€” o gestor nao consegue tocar nas celulas de 22Ã—22px (abaixo do minimo de 44px).
- **Sugestao:** Criar variante mobile (m-show) com lista de telefones em cards, onde cada card expande para mostrar as permissoes por regra como toggles verticais com alvo de toque de 44px.

## Problemas — ALTO (54)

### [/] Grids KPI (kpi-grid-3 e kpi-grid-4)
- **Arquivo:** `src/app/(dashboard)/page.tsx:263-279`
- **Problema:** Os grids usam `style={{ gridTemplateColumns: 'repeat(3,1fr)' }}` e `repeat(4,1fr)` via inline style. O CSS de globals.css sobrescreve para 2 colunas em mobile com `.kpi-grid-3` e `.kpi-grid-4`, mas mobile.css tambÃ©m define `.m-kpi-grid` com 2 colunas. As classes `kpi-grid-3 m-kpi-grid` e `kpi-grid-4 m-kpi-grid` sÃ£o aplicadas juntas. Em mobile ambas as regras tentam sobrescrever o inline style. Inline style tem maior especificidade que classe CSS, portanto os overrides do media query podem NÃƒO funcionar dependendo do navegador/ordem. O resultado Ã© um grid de 3 ou 4 colunas espremidas em 390px â€” texto do KPI 'Receita do MÃªs' e 'Adiantamentos Pendentes' fica ilegÃ­vel.
- **Sugestao:** Remover o gridTemplateColumns do inline style nesses dois grids e deixar apenas as classes CSS controlarem as colunas. Ou usar apenas a classe sem o style inline conflitante.

### [/] BotÃ£o 'HistÃ³rico de lembretes' (LembretesWidget quando sem pendentes)
- **Arquivo:** `src/components/dashboard/LembretesWidget.tsx:465-473`
- **Problema:** O botÃ£o tem `padding: '4px 12px'` e `fontSize: '11px'` â€” altura resultante estimada ~28px, abaixo do mÃ­nimo Apple HIG de 44px para alvos de toque. NÃ£o tem classe `m-touch` nem `touch-target`. Em tela de gestor sem lembretes pendentes, esse Ã© o ÃšNICO elemento interativo do widget e fica minÃºsculo.
- **Sugestao:** Adicionar `minHeight: '44px'` ao estilo do botÃ£o, ou adicionar a classe `m-touch`.

### [/] BotÃ£o 'HistÃ³rico' (LembretesWidget quando hÃ¡ pendentes)
- **Arquivo:** `src/components/dashboard/LembretesWidget.tsx:415-424`
- **Problema:** O botÃ£o no cabeÃ§alho do widget tem `padding: '3px 10px'` â€” altura ~26px, muito abaixo de 44px. Em mobile Ã© difÃ­cil acertar o toque.
- **Sugestao:** Aumentar para `padding: '8px 14px'` ou adicionar `minHeight: '44px'`.

### [/] CienteModal â€” botÃµes 'Cancelar', 'Salvar e manter na tela', 'Ciente e ocultar'
- **Arquivo:** `src/components/dashboard/LembretesWidget.tsx:132-169`
- **Problema:** Todos os botÃµes tÃªm `padding: '8px 14px'` e `fontSize: '12px'`. Com fonte de 12px e padding 8px top+bottom, a altura estimada Ã© ~32px â€” abaixo dos 44px necessÃ¡rios. Em mobile com 3 botÃµes lado a lado em `flexWrap: wrap`, no iPhone SE (375px) eles ficam apertados. Adicionalmente, quando `salvando=true` o texto muda para `'...'` sem spinner visual claro â€” feedback de carregamento muito fraco.
- **Sugestao:** Aumentar padding para `'10px 16px'` nesses botÃµes. Substituir '...' por texto descritivo como 'Salvando...' para feedback mais claro.

### [/] HistoricoModal â€” botÃµes 'Ciente' e 'Reabrir' dentro do modal
- **Arquivo:** `src/components/dashboard/LembretesWidget.tsx:273-285 e 317-330`
- **Problema:** Os botÃµes tÃªm `padding: '5px 10px'` e `fontSize: '11px'` â€” altura estimada ~26px. Dentro do modal histÃ³rico em mobile (que usa `maxHeight: '80vh'` e rola verticalmente), esses pequenos botÃµes sÃ£o difÃ­ceis de acertar na lista de lembretes.
- **Sugestao:** Aumentar para `padding: '8px 12px'` e adicionar `minHeight: '44px'`.

### [/] SystemStatusBadge â€” link hard-coded para IP privado
- **Arquivo:** `src/components/layout/Sidebar.tsx:59`
- **Problema:** O badge de status dos sistemas linka para `http://129.80.27.159:3001` hard-coded em Sidebar.tsx linha 59. AlÃ©m de ser IP de uma VM especÃ­fica (proibido pela REGRA DO DONO), esse link aparece no drawer mobile â€” quando o gestor abre o menu e clica em 'Sistemas OK', vai para um IP que pode nÃ£o responder ou ser inseguro via HTTP em mobile.
- **Sugestao:** Mover para env var (ex: NEXT_PUBLIC_MONITORING_URL). Isso tambÃ©m viola a regra documentada no CLAUDE.md sobre IP hard-coded.

### [/] ActionBtn no design system â€” tamanho de toque insuficiente
- **Arquivo:** `src/components/ui/ds.tsx:537-551`
- **Problema:** O `ActionBtn` em ds.tsx tem `width: '28px', height: '28px'` fixos â€” muito abaixo dos 44px mÃ­nimos. Esse componente Ã© usado em tabelas de listagem em todo o sistema. Embora a tela do painel nÃ£o use ActionBtn diretamente, o problema afeta qualquer tela que use o DS em mobile.
- **Sugestao:** Em mobile, aumentar a Ã¡rea de toque via CSS: adicionar ao ActionBtn `minHeight: 44px` e `minWidth: 44px` usando media query, mantendo o visual de 28px mas com Ã¡rea de toque maior (padding extra transparente).

### [/pedidos] Lista de pedidos mobile (MobileList)
- **Arquivo:** `src/app/(dashboard)/pedidos/page.tsx:420`
- **Problema:** Quando `loading=true`, a MobileList recebe `null` como children e exibe vazio absoluto, sem nenhum indicador de carregamento. O usuÃ¡rio vÃª a tela em branco e nao sabe se algo esta acontecendo, levando a cliques repetidos e navegacao desnecessaria.
- **Sugestao:** Substituir `{loading ? null : filtradas.map(...)}` por `{loading ? <div style={{padding:'32px',textAlign:'center',color:'#94a3b8'}}>Carregando...</div> : filtradas.map(...)}` dentro do MobileList.

### [/pedidos] Filtro de status (select)
- **Arquivo:** `src/app/(dashboard)/pedidos/page.tsx:314-333`
- **Problema:** O `<select>` de filtro por status (Em aberto / Todos / Agendado / Em Andamento / Concluido / Cancelado) fica dentro do bloco `m-hide` (tabela desktop). No mobile o filtro nao existe em lugar nenhum. O usuario nao tem como ver apenas pedidos em andamento ou apenas os concluidos.
- **Sugestao:** Adicionar um `<select>` identico ao da versao desktop dentro do bloco `mobile-only` de busca (linhas 411-417), abaixo do SearchInput, com 100% de largura.

### [/pedidos] MobileCard â€” acao disponivel ao usuario
- **Arquivo:** `src/app/(dashboard)/pedidos/page.tsx:426-444`
- **Problema:** No mobile o card do pedido aponta para `/despacho/${p.id}` (linha 428) e nao oferece nenhuma acao de editar o pedido. A tabela desktop tem botoes 'Editar' e 'Excluir', mas no mobile o usuario nao tem acesso a nenhum dos dois â€” impossivel editar ou remover um pedido pelo celular.
- **Sugestao:** Passar prop `actions` no MobileCard com dois botoes: `<Btn href={'/pedidos/'+p.id+'/editar'} size='sm'>Editar</Btn>` e um `<DeleteBtn>` (ou ao menos o link de editar).

### [/pedidos/novo] Botoes de remover local (âˆ’) e remover endereco (âˆ’)
- **Arquivo:** `src/app/(dashboard)/pedidos/novo/page.tsx:491-503`
- **Problema:** width e height fixos em 32px. O alvo de toque minimo recomendado e 44px (Apple HIG). Em 390px o botao esta 25% menor que o minimo â€” dono vai errar o toque e acionar o campo de texto ao lado.
- **Sugestao:** Aumentar width/height para 44px nos botoes de remover (tanto locais quanto enderecos).

### [/pedidos/novo-avancado] Step 2 â€” Tabela de entregas disponiveis (DataTable)
- **Arquivo:** `src/app/(dashboard)/pedidos/novo-avancado/page.tsx:385-424`
- **Problema:** A tabela tem 4 colunas (checkbox, Rota, Cliente, Coleta) sem variante mobile. Em 390px a coluna Rota exibe texto como 'Sao Paulo â†’ Rio de Janeiro' sem wrap/truncate, causando overflow horizontal e scroll lateral involuntario. Nao ha card alternativo m-show.
- **Sugestao:** Ocultar colunas Cliente e Coleta no mobile (m-hide) ou substituir a tabela por cards m-card no mobile (m-show) com as informacoes principais empilhadas.

### [/pedidos/novo-avancado] Botao 'AvanÃ§ar para Entregas' â€” Step 1
- **Arquivo:** `src/app/(dashboard)/pedidos/novo-avancado/page.tsx:369`
- **Problema:** O botao usa Btn com size='sm' (padding: 4px 12px, fontSize: 11px â€” definido em ds.tsx:33-35). Altura resultante e aproximadamente 28-30px, muito abaixo dos 44px de alvo de toque. O botao e a unica acao da tela e fica pequeno demais.
- **Sugestao:** Usar size='md' ou adicionar style={{ minHeight: '44px', padding: '10px 20px' }} ao Btn de avanco de step.

### [/pedidos/[id]/editar] Tabela 'Entregas Vinculadas' â€” aba vinculados
- **Arquivo:** `src/app/(dashboard)/pedidos/[id]/editar/page.tsx:424-454`
- **Problema:** DataTable com 5 colunas (Rota, Cliente, Coleta, Status, Desvincular) sem variante mobile. A coluna Rota exibe 'origem â†’ destino' sem truncate (fontWeight:600), causando overflow horizontal em 390px. O botao 'Desvincular' (11px, padding 2px 6px) tem area de toque de ~20x15px â€” extremamente pequeno.
- **Sugestao:** Ocultar colunas Cliente e Coleta no mobile, truncar a coluna Rota com maxWidth+overflow:hidden, e aumentar o botao Desvincular para minHeight:44px ou substituir por icone de lixeira com area de toque adequada.

### [/pedidos/[id]/editar] Tabela 'Adicionar Entregas' â€” aba adicionar
- **Arquivo:** `src/app/(dashboard)/pedidos/[id]/editar/page.tsx:457-496`
- **Problema:** Mesmo problema: DataTable com 4 colunas sem variante mobile. A coluna Rota exibe textos longos sem truncar. O texto instrucional diz 'clique em Atualizar no topo' mas no mobile o botao pode estar oculto atras do overflow das abas (problema critico descrito acima).
- **Sugestao:** Ocultar colunas nao essenciais no mobile, truncar Rota, e corrigir o texto instrucional para refletir que o botao 'Atualizar' e acessivel.

### [/pedidos/importar] EtapaPreview â€” DataTable com 6 colunas
- **Arquivo:** `src/app/(dashboard)/pedidos/importar/_components/EtapaPreview.tsx:59-114`
- **Problema:** A tabela de preview tem 6 colunas (checkbox, Destinatario, Endereco, NÂº Nota, Valor, Status) sem variante mobile. A coluna Endereco tem maxWidth:280px whiteSpace:nowrap overflow:hidden â€” isso trunca o texto mas a tabela inteira ainda transborda em 390px causando scroll horizontal. O usuario nao consegue ver o endereco e o status ao mesmo tempo.
- **Sugestao:** Ocultar colunas 'NÂº Nota' e 'Valor da Nota' no mobile (m-hide nos Th e Td correspondentes), deixando apenas Destinatario, Endereco (truncado) e Status visiveis.

### [/pedidos/importar] EtapaPreview â€” botao 'Anexar N entregas ao pedido'
- **Arquivo:** `src/app/(dashboard)/pedidos/importar/_components/EtapaPreview.tsx:148-157`
- **Problema:** O botao usa Btn sem size explicito (padrao 'sm': padding 4px 12px, fontSize 11px). Com minWidth:200px a largura esta certa, mas a altura resultante (~28px) esta abaixo dos 44px. E o unico botao de confirmacao desta etapa.
- **Sugestao:** Adicionar style={{ minHeight: '44px', padding: '10px 20px', fontSize: '14px' }} ao Btn de importacao, ou usar size='md' se o DS for atualizado.

### [/despacho] BotÃ£o FAB 'Despachar N' (mobile)
- **Arquivo:** `src/app/(dashboard)/despacho/page.tsx:219`
- **Problema:** O FAB usa width: auto e padding: 0 16px, sobrescrevendo o tamanho fixo 56x56px definido em .m-fab no mobile.css. Isso quebra o alvo de toque mÃ­nimo de 44px de altura â€” a altura efetiva cai para o tamanho da linha de texto (~20px).
- **Sugestao:** Remover as propriedades width, padding e borderRadius inline do FAB ou substituir pelo componente MobileFAB do design system, que respeita as dimensÃµes corretas.

### [/despacho] Modal de rota (ModalRota)
- **Arquivo:** `src/app/(dashboard)/despacho/_components/ModalRota.tsx:52`
- **Problema:** Mesmo problema do ModalDespacho: nenhuma das classes m-modal-* Ã© usada. AlÃ©m disso, o mapa dentro do modal tem altura fixa de 420px â€” em telas de ~667px de altura (iPhone SE) + cabeÃ§alho do modal (~50px), o mapa ultrapassa a viewport e o botÃ£o 'Fechar' fica inacessÃ­vel sem scroll. O overflowY: auto estÃ¡ no container mas o scroll nÃ£o Ã© ativado corretamente porque o div pai nÃ£o tem height definida.
- **Sugestao:** Aplicar as classes m-modal-* e reduzir a altura do mapa para 60vh no mobile, ou usar calc(100vh - 120px) para garantir que o botÃ£o Fechar fique sempre visÃ­vel.

### [/despacho] CardDespachoMobile â€” ausÃªncia de navegaÃ§Ã£o ao detalhe por toque no card
- **Arquivo:** `src/app/(dashboard)/despacho/_components/CardDespachoMobile.tsx:44`
- **Problema:** Na lista desktop, a LinhaDespacho dispara onAbrir (router.push para /despacho/${id}) ao clicar em qualquer parte da linha. No CardDespachoMobile nÃ£o hÃ¡ onClick nem href no MobileCard â€” o Ãºnico jeito de ir ao detalhe Ã© o botÃ£o 'Ver', que Ã© pequeno (size='sm') e disputado com 3â€“4 outros botÃµes na mesma linha de aÃ§Ãµes. O card inteiro nÃ£o Ã© clicÃ¡vel, forÃ§ando o gestor a acertar um alvo pequeno.
- **Sugestao:** Passar href={`/despacho/${p.id}`} no MobileCard para tornar todo o card um link de navegaÃ§Ã£o (o design system jÃ¡ suporta via Link quando href estÃ¡ presente), ou adicionar onClick={() => router.push(`/despacho/${p.id}`)}.

### [/despacho/[id]] BotÃµes 'Cancelar' e 'Voltar' no PageHeader
- **Arquivo:** `src/app/(dashboard)/despacho/[id]/page.tsx:270`
- **Problema:** Os botÃµes no header (Btn size='sm' padrÃ£o) tÃªm padding: '4px 12px' e fontSize: '11px', resultando em altura efetiva ~23px â€” bem abaixo do mÃ­nimo de 44px recomendado pela Apple HIG. Em mobile, o dono pode errar o alvo e nÃ£o receber feedback algum, sem saber que o toque nÃ£o registrou.
- **Sugestao:** Para aÃ§Ãµes de header no mobile, usar size='md' (padding: '6px 16px') ou adicionar min-height: 44px nos botÃµes crÃ­ticos de aÃ§Ã£o. A classe m-touch do mobile.css pode ser passada via className.

### [/despacho/[id]] ConfirmStatusModal â€” botÃµes 'Voltar' e 'Confirmar'
- **Arquivo:** `src/app/(dashboard)/despacho/[id]/_components/ConfirmStatusModal.tsx:92`
- **Problema:** Os botÃµes de confirmaÃ§Ã£o tÃªm padding: '8px 14px' e fontSize: '12px', resultando em altura ~36px â€” abaixo do mÃ­nimo de 44px recomendado. O modal Ã© crÃ­tico (Iniciar/Concluir/Cancelar pedido), tornando o alvo de toque insuficiente exatamente onde mais importa acertar.
- **Sugestao:** Aumentar o padding dos botÃµes para '12px 18px' ou adicionar min-height: 44px para garantir alvo de toque adequado em ambos os botÃµes do modal.

### [/entregas] Botao Receber (tabela desktop)
- **Arquivo:** `src/app/(dashboard)/entregas/page.tsx:538-548`
- **Problema:** Sem estado de loading e sem disabled durante a chamada async handleMarcarPago. O usuario pode clicar multiplas vezes e disparar o update mais de uma vez. Padding 0 torna o alvo de toque praticamente zero px.
- **Sugestao:** Adicionar estado de loading por id (ex: loadingPago Set<string>), desabilitar o botao enquanto aguarda e dar padding minimo de 8px vertical para alvo de 44px.

### [/entregas] Barra de filtros (busca, status, periodo, datas)
- **Arquivo:** `src/app/(dashboard)/entregas/page.tsx:400-439 e 468`
- **Problema:** A toolbar inteira esta dentro do DataTable que por sua vez esta dentro de <div className='m-hide'>, portanto fica completamente invisivel no mobile. O MobileList nao tem nenhum controle de filtro. No celular o gestor nao consegue buscar por veiculo/motorista nem filtrar por status.
- **Sugestao:** Renderizar SearchInput e select de status fora da div m-hide (antes do DataTable/MobileList) para que aparecem em ambas as versoes, ou criar bloco equivalente visivel no mobile.

### [/entregas/[id]] Grid principal de secoes (2 colunas)
- **Arquivo:** `src/app/(dashboard)/entregas/[id]/page.tsx:178`
- **Problema:** O container usa gridTemplateColumns: '1fr 1fr' via inline style sem nenhuma classe responsiva (m-stack, m-grid). Em 390px as duas colunas ficam com ~187px cada, comprimindo labels e valores das secoes Datas/Quilometragem e Veiculo/Motorista de forma ilegivel.
- **Sugestao:** Adicionar className='m-stack' ao div do grid, ou substituir por gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' para que colapse para 1 coluna no mobile.

### [/faturamento] Botao de linha do cliente (expandir/colapsar)
- **Arquivo:** `src/app/(dashboard)/faturamento/page.tsx:293-311`
- **Problema:** O botao ocupa largura total mas contÃ©m 5 spans fixos com whiteSpace:nowrap e minWidth:110px/130px. Em 390px o conteudo transborda horizontalmente para fora do card â€” nome do cliente fica espremido, os valores monetarios 'Total' e 'Em aberto' ultrapassam a borda do dispositivo.
- **Sugestao:** Esconder os spans de valor (total e em-aberto) no mobile com 'm-hide' e mostrar somente nome+badge numa linha; ou usar flexWrap e remover minWidth fixo.

### [/faturamento] Linha de pedido expandida (numero, data, valor, badges, botoes)
- **Arquivo:** `src/app/(dashboard)/faturamento/page.tsx:321-349`
- **Problema:** A div usa flexWrap:wrap mas sem variante mobile dedicada. Com 5+ itens inline em 390px, os botoes 'Baixar' / 'Financeiro' / icone despacho ficam na segunda ou terceira linha junto com badges, sem garantia de alvo de toque >= 44px â€” os botoes Btn size='xs' tÃªm padding 2px 6px (altura efetiva ~18-22px).
- **Sugestao:** Isolar os botoes de acao numa linha propria no mobile (alignSelf:'flex-end', width:'100%') e usar size='sm' no minimo (padding 4px 12px) para alvo de toque aceitavel.

### [/faturamento] Painel FinanceiroPedido â€” botao 'Remover parcelamento'
- **Arquivo:** `src/app/(dashboard)/faturamento/_components/FinanceiroPedido.tsx:347-350`
- **Problema:** O botao e um <button> sem disabled durante salvando â€” o usuario pode clicar duas vezes seguidas enquanto a requisicao DELETE esta em curso, disparando dois deletes simultaneos.
- **Sugestao:** Adicionar disabled={salvando} ao botao 'Remover parcelamento'.

### [/financeiro (aba Despesas Avulsas)] Funcao marcarPago e toggleAtivo (Recorrencias)
- **Arquivo:** `src/app/(dashboard)/financeiro/_components/AvulsasTab.tsx:172-178`
- **Problema:** As funcoes marcarPago (AvulsasTab) e toggleAtivo (RecorrenciasTab) nao controlam nenhum estado de loading â€” o botao 'Marcar como pago' no desktop (ActionBtn) fica clicavel durante a requisicao async. Duplo clique dispara dois updates no banco.
- **Sugestao:** Adicionar estado local 'salvandoId' (string|null) e passar disabled={salvandoId===id} ao ActionBtn, igual ao padrao usado em APagarTab com 'salvando'.

### [/financeiro (aba Despesas Avulsas / Recorrencias)] Modal CRUD â€” botao Excluir dentro do modal
- **Arquivo:** `src/app/(dashboard)/financeiro/_components/AvulsasTab.tsx:387-388`
- **Problema:** O botao 'Excluir' chama excluir(editandoId).then(fecharModal) mas a funcao excluir ja chama fecharModal via await carregar() â€” na pratica fecharModal e chamado duas vezes. Alem disso, o botao Excluir fica habilitado enquanto salvando=true esta relacionado a salvar, nao a excluir â€” se o usuario clica Excluir enquanto o salvar esta rodando, os dois correm em paralelo.
- **Sugestao:** Usar um estado separado 'excluindo' para desabilitar o botao Excluir durante a operacao, e nao chamar fecharModal no .then() (a funcao excluir ja o faz quando bem-sucedida).

### [/abastecimentos] SearchInput na toolbar
- **Arquivo:** `src/app/(dashboard)/abastecimentos/page.tsx:235-301`
- **Problema:** O SearchInput dentro da `toolbar` tem `maxWidth: 280px` fixo (definido no ds.tsx linha 518). No mobile (390px), a toolbar Ã© renderizada dentro do `DataTable` que estÃ¡ dentro de `.m-hide`, portanto o SearchInput da toolbar fica INVISÃVEL no mobile â€” o usuÃ¡rio nÃ£o tem campo de busca nem filtro de status na visÃ£o mobile dos cards.
- **Sugestao:** Criar uma barra de busca/filtro fora do bloco `.m-hide` para que apareÃ§a tambÃ©m no mobile acima do MobileList, igual ao padrÃ£o de outras telas que tÃªm search visÃ­vel no mobile.

### [/abastecimentos] Select de filtro (Todos/Confirmados/Pendentes) na toolbar
- **Arquivo:** `src/app/(dashboard)/abastecimentos/page.tsx:208-218`
- **Problema:** O select de filtro estÃ¡ dentro do bloco `.m-hide` (sÃ³ desktop). No mobile o usuÃ¡rio nÃ£o consegue filtrar por status confirmado/pendente.
- **Sugestao:** Mover ou duplicar o select de filtro para fora do bloco `.m-hide`, num wrapper `m-show` acima do MobileList.

### [/abastecimentos/[id]/editar] Checkbox 'Confirmado'
- **Arquivo:** `src/app/(dashboard)/abastecimentos/[id]/editar/page.tsx:169-177`
- **Problema:** O checkbox tem `width: 16px, height: 16px` (linha 174) â€” alvo de toque de apenas 16Ã—16px, muito abaixo dos 44px recomendados. No celular Ã© muito fÃ¡cil errar o toque.
- **Sugestao:** Envolver o checkbox e label num elemento com `minHeight: 44px, padding: 12px 0` para ampliar a Ã¡rea de toque sem mudar o visual.

### [/adiantamentos] SearchInput e select de filtro na toolbar
- **Arquivo:** `src/app/(dashboard)/adiantamentos/page.tsx:326-380`
- **Problema:** Igual ao problema de abastecimentos: a toolbar (com SearchInput e select de status) estÃ¡ dentro do bloco `.m-hide`. No mobile o usuÃ¡rio nÃ£o tem como buscar motoristas nem filtrar por status â€” ele vÃª apenas os cards sem controles de filtragem.
- **Sugestao:** Criar barra de busca/filtro fora do bloco `.m-hide` para aparecer no mobile acima do MobileList.

### [/veiculos] Toolbar de busca (SearchInput + select + contador)
- **Arquivo:** `src/app/(dashboard)/veiculos/page.tsx:309-375`
- **Problema:** A toolbar estÃ¡ dentro do bloco `m-hide` (oculta no mobile) e nÃ£o existe equivalente visÃ­vel de busca/filtro no bloco mobile. No celular o usuÃ¡rio nÃ£o tem como filtrar a lista por status ou buscar por placa.
- **Sugestao:** Adicionar SearchInput e select de filtro fora do bloco `m-hide`, acima do `MobileList`, com classe `m-show` ou sem classe (visÃ­vel sempre).

### [/motoristas] Toolbar de busca (SearchInput + select + contador)
- **Arquivo:** `src/app/(dashboard)/motoristas/page.tsx:122-186`
- **Problema:** Mesma situaÃ§Ã£o: a toolbar de busca/filtro estÃ¡ dentro do bloco `m-hide`. No mobile, o gestor nÃ£o consegue buscar motorista por nome ou filtrar por ativo/inativo.
- **Sugestao:** Duplicar ou mover SearchInput + select para fora do `m-hide`, visÃ­vel no mobile, acima do MobileList.

### [/veiculos/novo] BotÃµes do PageHeader (â† Voltar / Cancelar / Salvar)
- **Arquivo:** `src/app/(dashboard)/veiculos/novo/page.tsx:69-76`
- **Problema:** O PageHeader renderiza trÃªs botÃµes enfileirados na mesma linha (Voltar + Cancelar + Salvar). Em 390px os trÃªs botÃµes com o UserProfile se sobrepÃµem ou saem da tela. NÃ£o hÃ¡ wrap e o PageHeader usa `flexShrink: 0` nas actions. O dono pode nÃ£o conseguir tocar em 'Salvar'.
- **Sugestao:** Remover o botÃ£o 'Cancelar' do header no mobile (jÃ¡ existe um no rodapÃ© do formulÃ¡rio linha 200) ou usar `flexWrap: wrap` nas actions do PageHeader.

### [/motoristas/novo] BotÃµes do PageHeader (â† Voltar / Cancelar / Salvar)
- **Arquivo:** `src/app/(dashboard)/motoristas/novo/page.tsx:82-88`
- **Problema:** Mesma situaÃ§Ã£o do cadastro de veÃ­culos: trÃªs botÃµes + UserProfile no header em 390px. Os botÃµes do header se empilham sobre o tÃ­tulo ou saem da viewport.
- **Sugestao:** Remover 'Cancelar' do header (jÃ¡ existe no rodapÃ©, linha 239) ou adicionar `flexWrap: wrap` nas actions do PageHeader.

### [/veiculos/[id]/editar] Sub-tabs (Principal / EspecificaÃ§Ãµes / Documentos e Seguros)
- **Arquivo:** `src/app/(dashboard)/veiculos/[id]/editar/page.tsx:196-219`
- **Problema:** As sub-tabs sÃ£o buttons com `padding: '8px 16px'` em linha horizontal. TrÃªs labels compridos em 390px transborda: o container nÃ£o tem `overflow-x: auto` nem classe `m-tabs-scroll`, entÃ£o os botÃµes sÃ£o cortados e o usuÃ¡rio nÃ£o consegue chegar em 'Documentos e Seguros'.
- **Sugestao:** Adicionar `overflow-x: auto` e `-webkit-overflow-scrolling: touch` no container das sub-tabs, ou adicionar a classe `m-tabs-scroll`.

### [/veiculos/[id]/editar] BotÃ£o 'Trocar / Retirar vÃ­nculo' (VinculoResponsavel)
- **Arquivo:** `src/app/(dashboard)/veiculos/[id]/editar/_components/VinculoResponsavel.tsx:179-182`
- **Problema:** O botÃ£o tem `padding: '8px 14px'` que renderiza com altura ~34px em mobile â€” abaixo do mÃ­nimo de 44px recomendado pelo Apple HIG e pelo prÃ³prio mobile.css (classe `m-touch`). Risco alto de clique perdido num campo crÃ­tico de operaÃ§Ã£o.
- **Sugestao:** Aumentar padding para `'12px 14px'` ou adicionar `minHeight: 44px` ao estilo do botÃ£o.

### [/veiculos/[id]/editar] Aba Plano de ManutenÃ§Ã£o â€” tabela com inputs inline de intervalo
- **Arquivo:** `src/app/(dashboard)/veiculos/[id]/editar/_components/PlanoTab.tsx:218-323`
- **Problema:** A tabela PlanoTab tem 8 colunas (Ativo, Tipo, Categoria, Criticidade, Intervalo KM, Intervalo Meses, Ãšltima, PrÃ³xima) com inputs de `width: 100px` e `width: 70px` embutidos nas cÃ©lulas. Em 390px Ã© inutilizÃ¡vel: os inputs ficam cortados e o checkbox 'Ativo' fica com alvo de toque de ~16x16px (nÃ£o atinge 44px).
- **Sugestao:** Adicionar classe `m-hide` Ã  tabela e criar uma lista mobile com cards por tipo de manutenÃ§Ã£o (toggle ativo, nome, intervalos editÃ¡veis em linha separada, prÃ³xima manutenÃ§Ã£o).

### [/veiculos/[id]/editar] Aba Avarias â€” tabela de avarias
- **Arquivo:** `src/app/(dashboard)/veiculos/[id]/editar/_components/AvariasTab.tsx:161-163`
- **Problema:** Tabela com 7 colunas (Data, DescriÃ§Ã£o, Motorista, UrgÃªncia, Status com select inline, Resolvida em, Excluir) visÃ­vel no mobile. O select de status com `padding: '2px 6px'` tem alvo de toque crÃ­tico de ~24px, impossibilitando mudanÃ§a de status no celular.
- **Sugestao:** Aumentar o select de status para `padding: '8px 6px'` e considerar card mobile com botÃ£o de aÃ§Ã£o para trocar status.

### [/motoristas/[id]/editar] BotÃµes do PageHeader (â† Voltar / Cancelar / Atualizar)
- **Arquivo:** `src/app/(dashboard)/motoristas/[id]/editar/page.tsx:155-162`
- **Problema:** TrÃªs botÃµes no header com o UserProfile em 390px â€” idÃªntico ao problema do cadastro de veÃ­culos. Os botÃµes se comprimem ou saem da viewport.
- **Sugestao:** Remover o botÃ£o 'Cancelar' do header (jÃ¡ hÃ¡ um no rodapÃ© em linha 371) ou adicionar `flexWrap: wrap` nas actions do PageHeader.

### [/motoristas/[id]/editar] Aba Acerto â€” formulÃ¡rio de novo ajuste (inline row)
- **Arquivo:** `src/app/(dashboard)/motoristas/[id]/editar/_components/AcertoMensalTab.tsx:452-476`
- **Problema:** O form de adicionar ajuste usa `display: flex` com 4 inputs + botÃ£o em linha: Tipo (select), DescriÃ§Ã£o (input), Valor (input), Parcelas (input), Btn. Em 390px esse flex row colapsa e os campos ficam minÃºsculos (especialmente o 'Valor' e 'Parcelas' com `flex: 1` ~70px cada). O campo nÃ£o tem `inputMode='decimal'` para o Valor.
- **Sugestao:** Usar `flexWrap: wrap` no container e `minWidth: 120px` nos inputs de valor/parcelas para evitar colapso; adicionar `inputMode='decimal'` no input de valor.

### [/veiculos/[id]/editar] FormulÃ¡rio de manutenÃ§Ã£o â€” grid de campos (ManutencoesTab showForm)
- **Arquivo:** `src/app/(dashboard)/veiculos/[id]/editar/_components/ManutencoesTab.tsx:344`
- **Problema:** O grid do formulÃ¡rio de lanÃ§ar manutenÃ§Ã£o usa `gridTemplateColumns: 'repeat(3, 1fr)'` com classe `m-grid` ausente. No mobile o grid nÃ£o colapsa para 1 coluna (sem a classe). Os campos 'Custo peÃ§as', 'Custo mÃ£o de obra' e 'Fornecedor' ficam em 3 colunas de ~110px em 390px.
- **Sugestao:** Adicionar classe `m-grid` ao div do grid do formulÃ¡rio de manutenÃ§Ã£o.

### [/clientes] Toolbar (SearchInput + select Ativos/Inativos + contador)
- **Arquivo:** `src/app/(dashboard)/clientes/page.tsx:71-87`
- **Problema:** A toolbar fica fora do bloco m-hide: no mobile ela aparece em linha com SearchInput (maxWidth:280px fixo), select (width:130px fixo) e contador (whiteSpace:nowrap). Somados num viewport de 390px com padding=16px, esses elementos transbordam ou se comprimem ilegÃ­veis. O usuario mobile nao consegue buscar nem filtrar por status.
- **Sugestao:** Mover a toolbar para dentro de um bloco separado com m-show, usando flexDirection:column e width:100%. SearchInput e select devem ter width:100% no mobile.

### [/usuarios] Toolbar (SearchInput + select Role + contador)
- **Arquivo:** `src/app/(dashboard)/usuarios/page.tsx:94-112`
- **Problema:** Mesma situacao de /clientes: toolbar fora do m-hide, SearchInput com maxWidth:280px e select com width:150px fixo aparecem no mobile fora do DataTable (que esta em m-hide), causando layout quebrado. Usuario mobile nao consegue buscar nem filtrar por role.
- **Sugestao:** Criar toolbar mobile separada dentro do bloco m-show com inputs em largura 100%.

### [/autorizacoes] Botao Salvar no modal de telefone (Inserir/Salvar)
- **Arquivo:** `src/app/(dashboard)/autorizacoes/page.tsx:81`
- **Problema:** A funcao `salvarTel` nao tem estado de loading/disabled. Em conexao lenta o usuario clica duas vezes e pode inserir o mesmo telefone duas vezes ou disparar dois updates simultaneos. Nao ha feedback de 'Salvando...' no botao.
- **Sugestao:** Adicionar `const [salvandoTel, setSalvandoTel] = useState(false)`, desabilitar o botao durante o save e mostrar 'Salvando...'.

### [/autorizacoes] Botoes de flag Ativo/Anotar e celulas de permissao
- **Arquivo:** `src/app/(dashboard)/autorizacoes/page.tsx:257`
- **Problema:** Os botoes de flag Ativo/Anotar tem `width: 22, height: 22` (funcao `flag` linha 257) e os botoes de celula de permissao tem `height: ROW_H = 26` â€” ambos muito abaixo de 44px minimo de toque. No celular o gestor erra o toque com frequencia.
- **Sugestao:** Na variante mobile aumentar todos os alvos de toque para min-height/min-width 44px, ou implementar a variante card sugerida acima.

### [/autorizacoes/empresas] Tabela de checkboxes Empresas x Gestor
- **Arquivo:** `src/app/(dashboard)/autorizacoes/empresas/page.tsx:78`
- **Problema:** Tabela sem variante mobile, com colunas de largura `minWidth: 90` para cada empresa. Com multiplas empresas a tabela estoura a largura de 390px e exige scroll horizontal. Os checkboxes tem `width: 18, height: 18` â€” abaixo de 44px de alvo de toque.
- **Sugestao:** Adicionar variante mobile com lista de usuarios onde cada um tem chips/toggles das empresas em vez de tabela com scroll horizontal. Minimo 44px para cada checkbox.

### [/autorizacoes/empresas] Botao marcarTodas
- **Arquivo:** `src/app/(dashboard)/autorizacoes/empresas/page.tsx:57`
- **Problema:** A funcao `marcarTodas` faz N awaits sequenciais (um por empresa) sem feedback de loading nem protecao contra clique duplo. Cada `toggle` faz um insert/delete no banco. Com muitas empresas o botao parece travado por varios segundos sem indicacao visual.
- **Sugestao:** Adicionar estado de loading por usuario, desabilitar o botao durante a operacao e mostrar 'Salvando...'.

### [/relatorios] Tela inteira â€” sem variante mobile
- **Arquivo:** `src/app/(dashboard)/relatorios/page.tsx:314`
- **Problema:** Tela sem classe m-hide/m-show e sem MobileCard/MobileList. O grid de 6 KPIs usa `gridTemplateColumns: repeat(6, 1fr)` sem classe m-kpi-grid (que quebraria para 2x2) â€” em 390px cada card fica com ~57px de largura, ilegivel. As tabelas DataTable transbordam horizontalmente. Os botoes de tab (Periodo/Motorista/Veiculo) sem wrap podem sangrar para fora.
- **Sugestao:** Trocar `repeat(6, 1fr)` por classe m-kpi-grid (ja definida no mobile.css como 2x2) ou usar `repeat(auto-fill, minmax(120px, 1fr))`. Adicionar m-tabs-scroll nas abas e variante card para as tabelas.

### [/roteirizacao] Tela inteira â€” sem variante mobile
- **Arquivo:** `src/app/(dashboard)/roteirizacao/page.tsx:233`
- **Problema:** Tela sem m-hide/m-show e sem MobileCard/MobileList. O formulario usa grid de 3 colunas (`gridTemplateColumns: '1fr 1fr 1fr'`) sem media query â€” em 390px cada campo fica com ~110px, labels e inputs ficam comprimidos e ilegÃ­veis. A tabela de rotas recentes transbordam horizontalmente.
- **Sugestao:** Trocar o grid fixo de 3 colunas pela classe m-grid (que colapsa para 1 coluna no mobile) ou usar `repeat(auto-fill, minmax(200px, 1fr))`. Adicionar variante card para a tabela de rotas.

### [/regras/[id]/dados] Tela inteira â€” matrix desktop-only
- **Arquivo:** `src/app/(dashboard)/regras/[id]/dados/page.tsx:57`
- **Problema:** A matrix de colunas x acoes usa tabela com `width: max-content`, colunas de 26px (COL=26) e cabecalho rotacionado de 150px (HEAD_H). Em 390px a matrix transborda horizontalmente com scroll. Os botoes de celula tem `height: 34` e `width: 100%` â€” na largura de 26px o alvo e muito pequeno para toque preciso no celular.
- **Sugestao:** Para mobile, substituir a matrix por uma lista de tabelas expansiveis com checkboxes verticais ou esconder a matrix com m-hide e criar um fluxo simplificado m-show para marcar permissoes.

## Problemas — MEDIO (67)

### [/] Tabela 'Pedidos Recentes' â€” variante desktop
- **Arquivo:** `src/app/(dashboard)/page.tsx:359`
- **Problema:** A tabela desktop estÃ¡ em `<div className='m-hide'>` â€” correto, some no mobile. A variante mobile `<div className='m-show' style={{ display: 'none', ... }}>` tem `display: none` no inline style. Em mobile, o CSS de mobile.css define `.m-show { display: flex !important }` que sobrescreve o inline `display: none`. Isso funciona, mas o `!important` Ã© necessÃ¡rio exatamente por causa do conflito com o inline style. O padrÃ£o Ã© frÃ¡gil: se alguÃ©m remover o inline style, a versÃ£o mobile aparecerÃ¡ no desktop tambÃ©m.
- **Sugestao:** Remover o `style={{ display: 'none' }}` do elemento m-show. O CSS jÃ¡ controla a visibilidade; o inline style Ã© redundante e cria dependÃªncia do !important.

### [/] HistoricoModal â€” maxHeight 80vh sem safe area
- **Arquivo:** `src/components/dashboard/LembretesWidget.tsx:219`
- **Problema:** O modal tem `maxHeight: '80vh'` mas Ã© centralizado com `alignItems: 'center'` sem considerar a safe area do iPhone (Dynamic Island/notch). Em iPhones com barra superior de ~59px, 80vh pode cortar o cabeÃ§alho do modal ou ficar atrÃ¡s da barra de status.
- **Sugestao:** Usar `maxHeight: 'calc(80vh - env(safe-area-inset-top) - env(safe-area-inset-bottom))'` ou aplicar a classe `m-modal-content` do mobile.css.

### [/] Layout â€” double padding em .has-bottom-nav
- **Arquivo:** `src/app/(dashboard)/layout.tsx:24 e src/app/(dashboard)/page.tsx:197`
- **Problema:** O layout define `<main className='flex-1 overflow-y-auto has-bottom-nav'>` e o conteÃºdo interno da pÃ¡gina tambÃ©m usa `<div ... className='has-bottom-nav'>` com `padding: '16px'`. HÃ¡ dois elementos com a classe `has-bottom-nav` aninhados. O globals.css adiciona `padding-bottom: 72px` a cada um, e mobile.css adiciona `padding-bottom: calc(var(--bottom-nav-h) + var(--safe-bottom) + 16px)` via `!important` ao mais interno. O resultado Ã© scroll excessivo no final da pÃ¡gina mobile â€” o conteÃºdo tem padding-bottom duplicado (o do main + o do div interno).
- **Sugestao:** Remover `has-bottom-nav` do elemento `<main>` no layout.tsx â€” apenas o container interno da pÃ¡gina precisa dessa classe.

### [/] MobileBottomNav â€” paddingBottom duplicado no iPhone
- **Arquivo:** `src/components/layout/MobileBottomNav.tsx:39 e src/app/globals.css:63-67`
- **Problema:** O nav tem `paddingBottom: 'env(safe-area-inset-bottom, 0px)'` no inline style E a classe `safe-bottom` no globals.css tambÃ©m adiciona `padding-bottom: env(safe-area-inset-bottom)`. O padding Ã© aplicado duas vezes, empurrando os Ã­cones para cima desnecessariamente.
- **Sugestao:** Remover o `paddingBottom` do inline style do nav e deixar apenas a classe `safe-bottom` (ou `mobile-bottom-nav`) controlar esse espaÃ§amento.

### [/] Topbar â€” componente definido mas nunca renderizado
- **Arquivo:** `src/components/layout/Topbar.tsx:1 e src/app/(dashboard)/layout.tsx:1`
- **Problema:** O arquivo src/components/layout/Topbar.tsx exporta o componente `Topbar`, mas ele nÃ£o Ã© importado nem usado em src/app/(dashboard)/layout.tsx. A barra superior com email do usuÃ¡rio e botÃ£o 'Sair' fica invisible para o gestor no painel. O botÃ£o 'Sair' existe apenas na sidebar/drawer. Em mobile, o gestor que nÃ£o abrir o drawer nunca encontra o botÃ£o de logout.
- **Sugestao:** Verificar com o dono se a Topbar foi intencionalmente removida. Se foi, deletar o arquivo. Se nÃ£o foi, reintroduzi-la no layout ou garantir que o botÃ£o 'Sair' seja visÃ­vel de outra forma no mobile.

### [/pedidos] SearchInput mobile
- **Arquivo:** `src/components/ui/ds.tsx:516`
- **Problema:** O `SearchInput` tem `maxWidth: '280px'` hardcoded no componente (ds.tsx:516). No mobile (390px viewport) o campo de busca fica limitado a 280px e nao preenche a largura disponivel, tornando dificil clicar no lado direito e parecendo partido.
- **Sugestao:** No wrapper `div.mobile-only` da busca (page.tsx:411) adicionar a classe `m-search-full`, ou sobrescrever o style inline no ponto de uso: `style={{ maxWidth: '100%' }}`.

### [/pedidos/novo] Grade Valor do pedido / Data prevista
- **Arquivo:** `src/app/(dashboard)/pedidos/novo/page.tsx:575`
- **Problema:** gridTemplateColumns: '1fr 1fr' hardcoded sem classe m-grid nem media query. Em 390px os dois campos ficam com ~165px cada, o input de data nativo fica apertado e o label pode truncar.
- **Sugestao:** Adicionar className='m-grid' ao div da grade para colapsar para 1 coluna no mobile, igual ao padrao do projeto.

### [/pedidos/novo] Campo 'Valor do pedido (R$)' â€” IMaskInput
- **Arquivo:** `src/app/(dashboard)/pedidos/novo/page.tsx:578-580`
- **Problema:** inputMode nao definido no IMaskInput de moeda. No iOS o teclado que abre e o alfabetico, nao o numerico, forÃ§ando o usuario a trocar manualmente.
- **Sugestao:** Adicionar inputMode='decimal' ao IMaskInput para abrir o teclado numerico com decimais no iOS.

### [/pedidos/novo] Modal 'Salvar locais no cadastro'
- **Arquivo:** `src/app/(dashboard)/pedidos/novo/page.tsx:693-753`
- **Problema:** O overlay usa position:fixed com padding:16px mas nao tem a classe m-modal-overlay nem m-modal-content. O CSS do projeto (mobile.css:98-116) define que no mobile modais devem ser full-screen (100vw/100vh, border-radius:0). Sem isso o modal flutua como caixa de 460px maxWidth, podendo ficar com margens laterais minimas e overflow oculto em telas pequenas.
- **Sugestao:** Adicionar className='m-modal-overlay' no div do overlay e className='m-modal-content m-modal-body' no div interno para aproveitar o comportamento full-screen mobile ja definido no mobile.css.

### [/pedidos/novo-avancado] Barra de progresso (steps 1/2/3)
- **Arquivo:** `src/app/(dashboard)/pedidos/novo-avancado/page.tsx:322-349`
- **Problema:** Os indicadores de passo usam padding: '0 16px' no container e position:absolute para a linha de fundo. Em 390px os tres rotulos ('1. Motorista', '2. Entregas', '3. Veiculo e Resumo') podem se sobrepor ou truncar porque o layout e flex com justifyContent:'space-between' sem quebra de linha.
- **Sugestao:** Reduzir o texto dos labels no mobile (ex: '1.', '2.', '3.') via m-hide nos textos longos, ou usar fontSize menor com overflow ellipsis.

### [/pedidos/novo-avancado] Step 3 â€” Campo 'Valor do Pedido (R$)' â€” IMaskInput
- **Arquivo:** `src/app/(dashboard)/pedidos/novo-avancado/page.tsx:583-586`
- **Problema:** Mesmo problema do /pedidos/novo: falta inputMode='decimal' no IMaskInput de moeda.
- **Sugestao:** Adicionar inputMode='decimal' ao IMaskInput.

### [/pedidos/[id]/editar] Grade Status / Valor / Datas (m-grid) â€” aba 'Dados'
- **Arquivo:** `src/app/(dashboard)/pedidos/[id]/editar/page.tsx:338-365`
- **Problema:** O div tem className='m-grid' correto, mas o inline style define gridTemplateColumns:'repeat(2, 1fr)'. A classe m-grid sobrescreve para 1fr no mobile (mobile.css:51-53) â€” isso funciona corretamente. Porem o campo 'Valor do Pedido' usa IMaskInput sem inputMode='decimal'.
- **Sugestao:** Adicionar inputMode='decimal' ao IMaskInput do campo Valor.

### [/pedidos/importar] EtapaSelecionarPedido â€” select de pedido
- **Arquivo:** `src/app/(dashboard)/pedidos/importar/_components/EtapaSelecionarPedido.tsx:54-79`
- **Problema:** O select lista pedidos com rotulo longo (ex: 'PED-0001 Â· Rua Fulano, 123 Â· 3 entregas'). Em 390px o texto trunca silenciosamente dentro do select nativo, sem tooltip nem alternativa. Nao ha indicador de loading apos clicar 'Continuar com este pedido' â€” se a busca do pedido demorar, o usuario pode clicar multiplas vezes.
- **Sugestao:** Adicionar estado de loading no botao 'Continuar' (disabled + texto 'Carregando...') enquanto carregandoPedido=true, e considerar mostrar o rotulo completo do pedido selecionado abaixo do select.

### [/pedidos/importar] EtapaUpload â€” grid de mapeamento de colunas (planilha)
- **Arquivo:** `src/app/(dashboard)/pedidos/importar/_components/EtapaUpload.tsx:230`
- **Problema:** gridTemplateColumns: '1fr 1fr' hardcoded sem media query nem classe m-grid. Em 390px os 5 selects de mapeamento ficam em pares de ~165px. Os labels como 'Cliente / Destinatario' e 'NÂº da Nota' podem truncar.
- **Sugestao:** Adicionar className='m-grid' ao div do grid de mapeamento para colapsar para 1 coluna no mobile.

### [/despacho] Modal de despacho/troca (ModalDespacho)
- **Arquivo:** `src/app/(dashboard)/despacho/_components/ModalDespacho.tsx:89`
- **Problema:** O overlay e o conteÃºdo do modal nÃ£o usam as classes m-modal-overlay / m-modal-content / m-modal-body definidas em mobile.css. No mobile (390px), o painel fica centralizado com padding 16px mas com altura livre â€” nÃ£o ocupa a tela toda, nÃ£o tem scroll seguro e nÃ£o respeita safe-area-inset. Em modais com conteÃºdo longo (mensagem de erro + 2 selects + botÃµes) parte da UI pode ficar cortada pela Home bar do iPhone.
- **Sugestao:** Adicionar className='m-modal-overlay' no div do overlay e className='m-modal-content m-modal-body' no div interno para herdar os estilos de full-screen mobile e safe-area do CSS.

### [/despacho/[id]] Abas Principal / Rota / Mapa (stepper de abas)
- **Arquivo:** `src/app/(dashboard)/despacho/[id]/page.tsx:290`
- **Problema:** As abas sÃ£o botÃµes com padding: '6px 16px' e fontSize: '13px'. Em 390px com 3 abas e gap: '8px', a largura total mÃ­nima Ã© ~3Ã—(16px+16px+label) â‰ˆ 280â€“310px, mas com flex: 'none' e sem overflow-x: auto (a div usa display: flex sem scroll), se os labels forem maiores eles transbordam o viewport ou ficam apertados demais. A classe m-tabs-scroll do mobile.css existe mas NÃƒO Ã© aplicada aqui â€” a div usa apenas inline style.
- **Sugestao:** Adicionar className='m-tabs-scroll' Ã  div de abas para habilitar scroll horizontal no mobile e evitar overflow.

### [/despacho/[id]] FluxoStepper â€” botÃ£o da prÃ³xima aÃ§Ã£o (Iniciar/Concluir/Despachar)
- **Arquivo:** `src/app/(dashboard)/despacho/[id]/_components/FluxoStepper.tsx:38`
- **Problema:** O FluxoStepper tem minWidth: '320px' na div interna do stepper. Em 390px de viewport com padding 16px (Ã¡rea Ãºtil = 358px), os 320px do stepper + o botÃ£o de aÃ§Ã£o ao lado precisam de pelo menos 320+80+16 (gap) = ~416px, excedendo a largura disponÃ­vel. A div usa flexWrap: 'wrap', entÃ£o o botÃ£o quebra para a linha de baixo, o que Ã© aceitÃ¡vel visualmente, mas o botÃ£o de aÃ§Ã£o some do contexto visual do stepper e fica desanexado.
- **Sugestao:** Reduzir o minWidth de 320px para 200px ou remover o minWidth â€” os 4 estÃ¡gios com rÃ³tulos curtos (LanÃ§ado/Despachado/Em rota/ConcluÃ­do) cabem bem em qualquer largura acima de 260px. O flexWrap jÃ¡ trata o botÃ£o de aÃ§Ã£o.

### [/despacho/[id]] LinhaCampos com cols=4 (bloco Pedido â€” linha Cliente+NÂº+Entregas)
- **Arquivo:** `src/app/(dashboard)/despacho/[id]/_components/shared.tsx:25`
- **Problema:** LinhaCampos usa grid com repeat(4, minmax(0, 1fr)). Em 390px de viewport, cada coluna fica com ~85px â€” insuficiente para o texto 'InÃ­cio Previsto' (rÃ³tulo) ou valores de data. O componente LinhaCampos nÃ£o tem media query, apenas .m-grid aplica colapso, mas essa div usa apenas inline style sem nenhuma classe CSS responsiva.
- **Sugestao:** Adicionar um className='m-grid' (para cols=1) ou 'm-grid-2' (para cols=2) ao LinhaCampos para que o grid colapse automaticamente no mobile. Ou aceitar cols como prop e selecionar a classe adequada.

### [/despacho/[id]] Input 'Adicionar local de carregamento' em AbaPrincipal
- **Arquivo:** `src/app/(dashboard)/despacho/[id]/_components/AbaPrincipal.tsx:143`
- **Problema:** O input inline (nÃ£o Ã© um componente FormField do DS) tem fontSize: '12px'. O mobile.css forÃ§a font-size: 16px !important em todos os inputs no mobile para prevenir o zoom automÃ¡tico do iOS Safari, entÃ£o o !important sobrescreve o estilo inline e o input mostra 16px. Isso Ã© correto, mas o botÃ£o '+ Adicionar' ao lado tem size='xs' (padding: '2px 6px', fontSize: '10px') â€” em 390px com o input flex: 1 e o botÃ£o shrinkado, o botÃ£o pode ficar com Ã¡rea de toque abaixo de 24px de altura.
- **Sugestao:** Trocar size='xs' por size='sm' no botÃ£o '+ Adicionar' para garantir alvo de toque adequado no mobile.

### [/despacho/[id]] AbaMapa â€” MapaRota com altura fixa 420px
- **Arquivo:** `src/app/(dashboard)/despacho/[id]/_components/AbaMapa.tsx:28`
- **Problema:** O mapa na AbaRota e na AbaMapa tem altura fixa de 420px. Em iPhone SE (viewport 667px) ou com a bottom nav (56px) + padding (16px) + header (~50px) + abas (~46px) + tÃ­tulos do Bloco (~42px), sobram ~437px. O mapa quase ocupa tudo sem deixar espaÃ§o para o texto de contexto acima dele, e em dispositivos menores ele ultrapassa e requer scroll para ver o conteÃºdo abaixo.
- **Sugestao:** Usar max-height: min(420px, 50vh) ou 60vw para o mapa no mobile. O componente MapaRota deve aceitar uma prop de altura responsiva.

### [/entregas] MobileCard da listagem
- **Arquivo:** `src/app/(dashboard)/entregas/page.tsx:568-583`
- **Problema:** O MobileCard aponta href diretamente para /entregas/[id]/editar, pulando a tela de detalhe /entregas/[id]. O usuario no celular nao tem como ver o resumo do pedido antes de editar.
- **Sugestao:** Alterar href do MobileCard para /entregas/${pedido.id} (detalhe) e oferecer botao Editar dentro do card via prop actions.

### [/entregas/[id]] Tabelas DataTable dentro do grid (Entregas e Abastecimentos)
- **Arquivo:** `src/app/(dashboard)/entregas/[id]/page.tsx:219-291`
- **Problema:** As duas DataTable com colspan 'span 2' estao dentro do mesmo grid inline sem classe mobile. As tabelas tem 4 e 7 colunas respectivamente e vao estourar 390px horizontalmente mesmo com overflow-x do DataTable, pois o container pai nao tem largura 100% garantida no mobile.
- **Sugestao:** Colocar as secoes de tabela fora do grid de 2 colunas (ou garantir que o grid colapse para 1 coluna) e adicionar overflow-x: auto no container das tabelas.

### [/entregas/[id]] Botoes do PageHeader (Voltar, Imprimir, Editar)
- **Arquivo:** `src/app/(dashboard)/entregas/[id]/page.tsx:155-158`
- **Problema:** Btn com size='sm' padrao resulta em padding 4px 12px e font-size 11px. A altura total fica em torno de 28-30px, abaixo do minimo recomendado de 44px pela Apple HIG para alvos de toque.
- **Sugestao:** Usar size='md' (padding 6px 16px) ou adicionar minHeight: 44px aos botoes via className m-touch, ou aplicar padding extra so no mobile via CSS.

### [/entregas/novo] Botoes do PageHeader (Voltar, Cancelar, Salvar)
- **Arquivo:** `src/app/(dashboard)/entregas/novo/page.tsx:116-121`
- **Problema:** Mesmo problema de Btn size='sm': altura ~28-30px. No celular os tres botoes ficam espremidos no canto superior direito do PageHeader com area de toque insuficiente. O botao Salvar e o principal da tela.
- **Sugestao:** Usar size='md' para os botoes do header, ou esconder Voltar/Cancelar do header no mobile (m-hide) deixando apenas o Salvar, ja que ha botoes identicos no rodape do formulario.

### [/entregas/novo] Validacao: veiculo e motorista obrigatorios so na aba Operacional
- **Arquivo:** `src/app/(dashboard)/entregas/novo/page.tsx:73-75`
- **Problema:** Se o usuario estiver nas abas Cronograma ou Financeiro e clicar Salvar, a mensagem de erro 'Preencha: Veiculo, Motorista e KM Inicial' aparece mas o campo com problema esta em outra aba invisivel. O usuario nao sabe onde ir corrigir.
- **Sugestao:** Ao detectar erro de validacao, trocar automaticamente para a aba que contem o campo invalido (setTab('operacional') para veiculo/motorista, 'cronograma' para km_inicial) antes de exibir o Alert.

### [/entregas/[id]/editar] Botoes do PageHeader (Voltar, Cancelar, Atualizar)
- **Arquivo:** `src/app/(dashboard)/entregas/[id]/editar/page.tsx:130-136`
- **Problema:** Mesmos Btn size='sm' com ~28-30px de altura. Critico pois Atualizar e a acao principal da tela de edicao e e acionada no celular.
- **Sugestao:** Usar size='md' ou aplicar minHeight: 44px aos botoes de acao principal no header.

### [/entregas/[id]/editar] Validacao multi-aba: campos em aba invisivel
- **Arquivo:** `src/app/(dashboard)/entregas/[id]/editar/page.tsx:90-91`
- **Problema:** Mesmo problema da tela novo: Veiculo e Motorista estao na aba Operacional, KM Inicial na aba Cronograma. Se o usuario salvar de outra aba, o Alert aparece mas o campo erro esta oculto em outra aba.
- **Sugestao:** Ao detectar campo invalido, chamar setTab('operacional') ou setTab('cronograma') conforme o campo antes de exibir o erro.

### [/faturamento] Painel FinanceiroPedido â€” grid de condicoes (empresa, forma, acrescimos, descontos)
- **Arquivo:** `src/app/(dashboard)/faturamento/_components/FinanceiroPedido.tsx:276-312`
- **Problema:** Grid usa gridTemplateColumns:'repeat(auto-fit, minmax(160px, 1fr))'. Em 390px o container tem ~358px uteis; 5 celulas de minimo 160px nao cabem em 2 colunas (320px + gaps > 390px). O grid forcara 1 coluna, mas o input de data 'primeira parcela' tem width:130px fixo e o input de quantidade tem width:52px fixo â€” em serie podem ultrapassar a largura disponivel.
- **Sugestao:** Trocar minmax(160px,1fr) por minmax(140px,1fr) ou usar m-grid para colapsar em 1 coluna no mobile; inputs de data e qtd dentro de um flex com flexWrap:wrap.

### [/faturamento] Painel FinanceiroPedido â€” linha de cada parcela
- **Arquivo:** `src/app/(dashboard)/faturamento/_components/FinanceiroPedido.tsx:363-408`
- **Problema:** Cada linha de parcela usa display:flex com input de valor (width:100px) + input de data (width:130px) + badge + botao. Total minimo ~280px de elementos fixos + gaps. Em 390px com padding do painel (14px x2) restam ~362px â€” pode caber, mas apenas se nao houver badge 'vencida' extra, caso contrario transborda. Alem disso, o onBlur para salvar valor da parcela nao tem nenhum indicador visual de 'salvando' no campo especifico.
- **Sugestao:** Adicionar flexWrap:wrap na linha da parcela; mostrar o estado salvando no botao 'Baixar' de cada parcela (salvando && 'Salvando...').

### [/financeiro (aba A Pagar)] Modal de confirmacao de pagamento
- **Arquivo:** `src/app/(dashboard)/financeiro/_components/APagarTab.tsx:258-288`
- **Problema:** O overlay usa position:fixed com div interna width:360px fixo sem classe m-modal-content. Em 390px o modal tem largura 360px + possivel padding lateral do scroll, podendo cortar nas bordas. A classe m-modal-content do mobile.css (que aplica width:100vw no mobile) esta presente no HTML mas o overlay nao tem a classe m-modal-overlay necessaria para ativar o align-items:flex-end no mobile.
- **Sugestao:** Adicionar classe 'm-modal-overlay' ao div de overlay e garantir que o div interno tenha apenas 'm-modal-content' (sem width:360px fixo) para ocupar tela cheia no mobile.

### [/financeiro (aba Despesas Avulsas)] MobileCard â€” acoes de marcar pago e excluir
- **Arquivo:** `src/app/(dashboard)/financeiro/_components/AvulsasTab.tsx:286-303`
- **Problema:** O MobileCard da lista mobile nao inclui o prop 'actions' â€” no mobile o usuario so pode abrir o modal de edicao (onClick), mas nao ve os botoes rapidos 'Marcar como pago / Desfazer / Excluir' que existem na tabela desktop. Para baixar ou excluir uma despesa no celular e preciso abrir o modal inteiro.
- **Sugestao:** Adicionar prop actions ao MobileCard com os botoes de marcar pago e excluir, igual ao que APagarTab ja faz na linha 243-249.

### [/financeiro (aba Fluxo Diario)] KPIs â€” grid de 4 colunas
- **Arquivo:** `src/app/(dashboard)/financeiro/_components/FluxoTab.tsx:124-157`
- **Problema:** O grid usa gridTemplateColumns:'repeat(auto-fit, minmax(180px, 1fr))'. Em 390px nao cabem 2 colunas de 180px (360px + gap > 390px util). O auto-fit colapsara para 1 coluna, mas o componente nao usa a classe m-kpi-grid (definida em mobile.css como 2x2) â€” resultado: 4 cards empilhados em coluna unica, ocupando muito espaco vertical.
- **Sugestao:** Adicionar className='m-kpi-grid' ao div do grid de KPIs (igual ao que faturamento/page.tsx ja faz na linha 255) para obter o layout 2x2 no mobile.

### [/financeiro (aba Recorrencias)] MobileCard â€” acoes ativar/desativar e excluir
- **Arquivo:** `src/app/(dashboard)/financeiro/_components/RecorrenciasTab.tsx:270-288`
- **Problema:** O MobileCard de recorrencias nao inclui prop 'actions' â€” os botoes de toggle ativo e excluir so existem na tabela desktop (m-hide). No mobile o usuario so pode abrir o modal de edicao; nao ha acao rapida para ativar/desativar uma recorrencia no celular.
- **Sugestao:** Adicionar prop actions ao MobileCard com botao de toggle ativo (igual ao ActionBtn da tabela) para que o gesto rapido seja acessivel no mobile.

### [/financeiro (todas as abas)] Botoes de filtro rapido (chips de texto)
- **Arquivo:** `src/app/(dashboard)/financeiro/_components/APagarTab.tsx:139-145`
- **Problema:** Os chips de filtro ('Pendentes', 'Atrasados', 'Todos', '7d', '30d' etc.) tem padding 4px 10-12px, resultando em altura efetiva de ~24-28px â€” abaixo do minimo de 44px recomendado para alvo de toque no iOS. Nao usam a classe m-touch.
- **Sugestao:** Adicionar className='m-touch' e ajustar padding para minimo de padding:10px 12px no mobile, ou usar minHeight:44px via CSS media query.

### [/abastecimentos] Grid de KPIs
- **Arquivo:** `src/app/(dashboard)/abastecimentos/page.tsx:227`
- **Problema:** O grid usa `gridTemplateColumns: repeat(4, 1fr)` em inline style. O CSS `.m-kpi-grid` sobrepoe para 2Ã—2 no mobile, isso funciona. Porem o container pai usa `padding: 16px` sem `box-sizing: border-box` e o grid pode vazar horizontalmente em 390px quando os KpiCards tÃªm conteÃºdo longo como valores monetÃ¡rios (ex: R$12.345,67).
- **Sugestao:** Adicionar `overflow: hidden` ou `minWidth: 0` nos KpiCards, ou usar `gap: 8px` menor para evitar overflow em viewport estreita.

### [/abastecimentos/novo] Inputs numÃ©ricos (litros, valor_litro, valor_total, km_no_abast)
- **Arquivo:** `src/app/(dashboard)/abastecimentos/novo/page.tsx:129-137`
- **Problema:** Nenhum dos inputs numÃ©ricos tem `inputMode='decimal'` ou `inputMode='numeric'`. Com `type='number'` o iOS Safari abre o teclado numÃ©rico padrÃ£o, mas sem o ponto decimal visÃ­vel diretamente (o iOS usa teclado numerico que mostra ponto apenas na versÃ£o `decimal`). Para campos de valor monetÃ¡rio como `valor_litro` (step 0.001), isso torna difÃ­cil digitar no celular.
- **Sugestao:** Adicionar `inputMode='decimal'` nos campos litros, valor_litro e valor_total para garantir teclado com ponto decimal no iOS.

### [/abastecimentos/novo] Botoes no PageHeader (Voltar, Cancelar, Salvar)
- **Arquivo:** `src/components/ui/ds.tsx:33-35`
- **Problema:** O PageHeader em mobile vira flex-wrap (globals.css linha 126-130), entÃ£o os 3 botoes ficam enfileirados. O botao `Salvar` (variant='primary', size='sm') tem padding '4px 12px' e fontSize '11px' â€” alvo de toque menor que 44px recomendado pelo Apple HIG. No celular o usuario pode errar o toque e clicar em 'Cancelar' sem querer.
- **Sugestao:** Aumentar o size padrÃ£o dos botoes do PageHeader para 'md' (padding 6px 16px) ou adicionar `minHeight: 44px` no estilo do Btn para formularios mobile.

### [/abastecimentos/[id]/editar] Inputs numÃ©ricos sem inputMode decimal
- **Arquivo:** `src/app/(dashboard)/abastecimentos/[id]/editar/page.tsx:152-161`
- **Problema:** Mesmo problema da tela novo: todos os inputs numÃ©ricos (km_no_abast, litros, valor_litro, valor_total) ausÃªncia de `inputMode='decimal'`.
- **Sugestao:** Adicionar `inputMode='decimal'` nos campos de valor monetÃ¡rio/litros.

### [/adiantamentos] MobileList â€” posicionamento em relaÃ§Ã£o ao botao 'Carregar mais'
- **Arquivo:** `src/app/(dashboard)/adiantamentos/page.tsx:383-417`
- **Problema:** O botao 'Carregar mais' (linha 383-391) estÃ¡ ANTES do MobileList (linha 394-417) no DOM. No desktop isso nao importa pois o MobileList fica oculto. No mobile o botao aparece entre os cards (por estar antes no DOM) e o MobileList vem depois. O usuario ao rolar vÃª o botao 'Carregar mais' antes dos novos cards â€” experiÃªncia confusa.
- **Sugestao:** Mover o bloco do botao 'Carregar mais' para APÃ“S o MobileList, ou envolver num `m-hide` separado e duplicar um equivalente apÃ³s o MobileList.

### [/adiantamentos/novo] Input 'Valor (R$)'
- **Arquivo:** `src/app/(dashboard)/adiantamentos/novo/page.tsx:112-120`
- **Problema:** Campo `type='number'` sem `inputMode='decimal'`. Em iOS Safari o teclado numÃ©rico sem vÃ­rgula/ponto decimal dificulta digitar valores como 150,50.
- **Sugestao:** Adicionar `inputMode='decimal'` no input de valor.

### [/adiantamentos/novo] Botoes no PageHeader (Voltar, Cancelar, Salvar)
- **Arquivo:** `src/app/(dashboard)/adiantamentos/novo/page.tsx:76-80`
- **Problema:** Mesmo problema de alvo de toque: botoes com padding '4px 12px' e fontSize '11px' (size='sm') ficam abaixo de 44px de altura no mobile, especialmente com tres botoes lado a lado envoltos em flex-wrap.
- **Sugestao:** Usar size='md' nos botoes de aÃ§Ã£o de formulÃ¡rio, ou adicionar `minHeight: 44px`.

### [/adiantamentos/[id]/editar] Campo 'Valor Prestado em Contas' â€” condicional ao status='prestado'
- **Arquivo:** `src/app/(dashboard)/adiantamentos/[id]/editar/page.tsx:199-211`
- **Problema:** Quando o usuÃ¡rio muda o status para 'prestado', o campo `valor_prestado_contas` aparece (linha 199-211). Sem `inputMode='decimal'`, o teclado iOS nÃ£o mostra ponto decimal. Adicionalmente, o campo condicional aparece no meio do grid de 2 colunas sem `gridColumn: span 2`, ficando em apenas uma coluna â€” em mobile (1 coluna via m-grid) isso Ã© ok, mas no desktop fica estreito para um campo monetÃ¡rio.
- **Sugestao:** Adicionar `inputMode='decimal'` e `gridColumn: 'span 2'` no wrapper do campo para consistÃªncia com os outros campos monetÃ¡rios.

### [/adiantamentos/[id]/editar] Botoes no PageHeader
- **Arquivo:** `src/app/(dashboard)/adiantamentos/[id]/editar/page.tsx:107-112`
- **Problema:** Mesmos tres botoes (Voltar, Cancelar, Salvar) com alvo de toque pequeno (size='sm') em flex-wrap no mobile.
- **Sugestao:** Usar size='md' ou `minHeight: 44px` nos botoes de aÃ§Ã£o de formulÃ¡rio.

### [/veiculos] KPI grid (Total / Ativos / Inativos / Em viagem)
- **Arquivo:** `src/app/(dashboard)/veiculos/page.tsx:302`
- **Problema:** O grid usa inline style `gridTemplateColumns: repeat(4, 1fr)` sem a classe `m-kpi-grid`. A classe `m-kpi-grid` do mobile.css colapsa para 2Ã—2 no mobile, mas o elemento usa apenas o inline style, que sobrescreve a regra CSS. No celular ficam 4 colunas de ~88px cada, com texto cortado.
- **Sugestao:** Adicionar a classe `m-kpi-grid` ao div do grid de KPIs (o div jÃ¡ tem a classe no cÃ³digo â€” verificar se o inline style estÃ¡ sobrescrevendo com `!important` ausente) ou remover o inline style `gridTemplateColumns` de dentro do div que jÃ¡ tem a classe.

### [/veiculos/novo] Campos numÃ©ricos (Eixos, KM Atual, Cap. Carga, PBT, Tanque, Valor AquisiÃ§Ã£o)
- **Arquivo:** `src/app/(dashboard)/veiculos/novo/page.tsx:163-195`
- **Problema:** Todos os campos numÃ©ricos usam `type='number'` mas sem `inputMode='numeric'`. No iOS, `type='number'` abre um teclado numÃ©rico com vÃ­rgula apenas em algumas versÃµes; `inputMode='decimal'` garante teclado numÃ©rico com vÃ­rgula em todos os browsers iOS/Android.
- **Sugestao:** Adicionar `inputMode='decimal'` nos inputs de valor monetÃ¡rio/decimal e `inputMode='numeric'` nos de nÃºmero inteiro (eixos, ano, km).

### [/motoristas/novo] Campos de SalÃ¡rio Fixo e Valor da DiÃ¡ria
- **Arquivo:** `src/app/(dashboard)/motoristas/novo/page.tsx:189-194`
- **Problema:** Campos `type='number' step='0.01'` sem `inputMode='decimal'`. No iOS Safari abre teclado numÃ©rico sem vÃ­rgula decimal, dificultando digitar centavos.
- **Sugestao:** Adicionar `inputMode='decimal'` nos dois campos de remuneraÃ§Ã£o.

### [/veiculos/[id]/editar] Popup de vÃ­nculo â€” lista de motoristas (VinculoResponsavel)
- **Arquivo:** `src/app/(dashboard)/veiculos/[id]/editar/_components/VinculoResponsavel.tsx:222-228`
- **Problema:** A lista de motoristas dentro do popup tem `maxHeight: 200` e cada item tem `padding: '8px 10px'` (altura ~36px). Em telas pequenas com muitos motoristas, os itens da lista ficam abaixo do toque mÃ­nimo de 44px. O popup inteiro usa `maxWidth: 460` sem `maxHeight` no container externo, podendo vazar fora da tela em celulares pequenos se houver muito conteÃºdo.
- **Sugestao:** Aumentar `padding` dos items para `'11px 10px'` (44px de alvo) e adicionar `maxHeight: '80vh'` com `overflow: auto` ao container do popup.

### [/veiculos/[id]/editar] HistÃ³rico â€” tabelas de abastecimentos e pedidos (aba HistÃ³rico)
- **Arquivo:** `src/app/(dashboard)/veiculos/[id]/editar/page.tsx:400-446`
- **Problema:** As tabelas de histÃ³rico usam `DataTable` sem a classe `m-hide`, portanto ficam visÃ­veis no mobile. `DataTable` tem `overflowX: auto` no container interno, mas as colunas (Data, KM Ini, KM Fin, Valor, Posto) em 6 colunas estouram em ~390px mesmo com scroll horizontal â€” scroll horizontal em tabela dentro de pÃ¡gina jÃ¡ com scroll vertical Ã© difÃ­cil de usar no touch.
- **Sugestao:** Criar card mobile para histÃ³rico de abastecimentos/pedidos com classe `m-show`, similar ao MobileCard das listagens, e ocultar a tabela com `m-hide`.

### [/veiculos/[id]/editar] Aba ManutenÃ§Ãµes â€” tabela de histÃ³rico de manutenÃ§Ãµes
- **Arquivo:** `src/app/(dashboard)/veiculos/[id]/editar/_components/ManutencoesTab.tsx:441-476`
- **Problema:** A tabela de manutenÃ§Ãµes (7 colunas: Data, Tipo, Categoria, KM, Custo, Fornecedor, Status + aÃ§Ã£o) fica visÃ­vel no mobile sem nenhuma adaptaÃ§Ã£o. O DataTable tem overflow-x auto mas 7 colunas em 390px exige scroll horizontal intenso e a coluna 'Excluir' pode sair do campo de visÃ£o.
- **Sugestao:** Adicionar classe `m-hide` Ã  DataTable e criar um bloco `m-show` com cards compactos por manutenÃ§Ã£o (tipo + data + custo + botÃ£o excluir).

### [/veiculos/[id]/editar] Aba ManutenÃ§Ãµes â€” modal 'Atualizar KM' (ManutencoesTab)
- **Arquivo:** `src/app/(dashboard)/veiculos/[id]/editar/_components/ManutencoesTab.tsx:481-488`
- **Problema:** O modal usa `maxWidth: 560px` mas nÃ£o tem a classe `m-modal-content`. No mobile.css a classe `m-modal-content` define `width: 100vw`, `min-height: 100vh`, border-radius 0 e padding de safe area. Sem ela, o modal com `padding: 16px` no overlay pode deixar bordas laterais visÃ­veis e nÃ£o respeita a Dynamic Island do iPhone.
- **Sugestao:** Adicionar as classes `m-modal-overlay` ao div externo e `m-modal-content` ao div interno do modal de KM.

### [/veiculos/[id]/editar] Aba Logs de KM â€” tabela de logs
- **Arquivo:** `src/app/(dashboard)/veiculos/[id]/editar/_components/LogsTab.tsx:189-228`
- **Problema:** Tabela com 6 colunas (Data/Hora, Fonte, Quem, KM, DescriÃ§Ã£o, AÃ§Ã£o) sem variante mobile. A coluna Data/Hora usa `whiteSpace: nowrap` e pode ter 16+ caracteres, deixando as outras colunas ilegÃ­veis num scroll horizontal forÃ§ado em 390px.
- **Sugestao:** Adicionar `m-hide` Ã  tabela e criar lista mobile mostrando data, quem, KM e botÃ£o Reatribuir em card compacto.

### [/motoristas/[id]/editar] Aba Acerto Mensal â€” seletor de ano/mÃªs (AcertoMensalTab)
- **Arquivo:** `src/app/(dashboard)/motoristas/[id]/editar/_components/AcertoMensalTab.tsx:293-365`
- **Problema:** O seletor de ano/mÃªs usa `<span>` com `onClick` sem nenhum atributo de acessibilidade e sem `cursor: pointer` aplicado de forma que cubra 44px de alvo. Os chips de mÃªs tÃªm `padding: '4px 10px'` (~32px de altura) â€” abaixo de 44px. Em 390px os dois blocos de anos (6 chips) + divisor + dois blocos de meses (12 chips) + label do mÃªs ficam encolhidos porque o container usa `flexWrap: wrap` mas cada bloco interno nÃ£o quebra.
- **Sugestao:** Aumentar padding dos chips para `'8px 10px'` (44px de alvo) e garantir que o container interno dos chips de meses use `flexWrap: wrap`.

### [/motoristas/[id]/editar] Aba Acerto Mensal â€” modal de fechamento (Step 2: Pagamento)
- **Arquivo:** `src/app/(dashboard)/motoristas/[id]/editar/_components/AcertoMensalTab.tsx:544-688`
- **Problema:** O modal usa `width: 500px, maxWidth: 90%` e nÃ£o tem as classes `m-modal-overlay`/`m-modal-content`. O Step 2 tem trÃªs botÃµes empilhados verticalmente (Confirmar + Agendar + Voltar) com padding generoso â€” isso estÃ¡ OK. PorÃ©m o modal inteiro pode ser cortado pela Dynamic Island ou pelo home indicator sem os paddings de safe area que sÃ³ existem na classe `m-modal-body`.
- **Sugestao:** Adicionar classe `m-modal-overlay` ao overlay e `m-modal-content m-modal-body` ao div interno do modal, ou adicionar `paddingTop: env(safe-area-inset-top)` e `paddingBottom: env(safe-area-inset-bottom)` manualmente.

### [/veiculos/[id]/editar] FormulÃ¡rio de avaria â€” grid de campos (AvariasTab showForm)
- **Arquivo:** `src/app/(dashboard)/veiculos/[id]/editar/_components/AvariasTab.tsx:97`
- **Problema:** O grid do formulÃ¡rio de avaria usa `gridTemplateColumns: 'repeat(3, 1fr)'` sem classe `m-grid`. Os selects de UrgÃªncia e Status ficam em 3 colunas de ~110px sem colapso no mobile.
- **Sugestao:** Adicionar classe `m-grid` ao div do grid do formulÃ¡rio de avaria.

### [/clientes/novo] Botoes de aba (Dados Basicos / Contatos)
- **Arquivo:** `src/app/(dashboard)/clientes/novo/page.tsx:156-176`
- **Problema:** Botoes de aba criados com padding:10px 20px e fontSize:13px sem classe m-touch nem minHeight:44px. Nao usam o componente Tabs do ds.tsx (que tem minHeight:44px). Alem disso, a barra de abas nao tem overflow-x:auto nem a classe m-tabs-scroll, entao num viewport 390px com 3 abas (editar tem 'Locais de Carregamento' tambem) o texto pode ser cortado.
- **Sugestao:** Substituir os botoes de aba pelo componente Tabs do ds.tsx (ja tem minHeight:44px e usa m-tabs-scroll).

### [/clientes/[id]/editar] Botoes de aba (3 abas: Dados / Contatos / Locais de Carregamento)
- **Arquivo:** `src/app/(dashboard)/clientes/[id]/editar/page.tsx:229-239`
- **Problema:** Tres abas em linha sem overflow-x scroll. No viewport 390px, 'Locais de Carregamento' ultrapassa a largura disponivel e pode ser cortado ou quebrar o layout. Padding e font-size dos botoes nao garantem 44px de altura de toque.
- **Sugestao:** Usar o componente Tabs do ds.tsx com m-tabs-scroll, ou adicionar overflowX:auto na barra de abas.

### [/clientes/novo] IMaskInput CNPJ/CPF, Telefone, CEP â€” teclado numerico
- **Arquivo:** `src/app/(dashboard)/clientes/novo/page.tsx:187-228`
- **Problema:** Campos numericos (CNPJ/CPF, Telefone, CEP) usam IMaskInput sem inputMode='numeric' ou inputMode='tel'. No iOS Safari o teclado padrao (QWERTY) abre em vez do numerico, dificultando o preenchimento no celular.
- **Sugestao:** Adicionar inputMode='numeric' nos IMaskInput de CEP e CNPJ, e inputMode='tel' nos de telefone.

### [/clientes/[id]/editar] IMaskInput CNPJ/CPF, Telefone, CEP â€” teclado numerico
- **Arquivo:** `src/app/(dashboard)/clientes/[id]/editar/page.tsx:248-291`
- **Problema:** Mesma ausencia de inputMode nos IMaskInputs de CNPJ, telefone e CEP da pagina de edicao.
- **Sugestao:** Adicionar inputMode='numeric' em CEP e CNPJ, inputMode='tel' em telefone.

### [/empresas/[id]/editar] WhatsAppSection â€” input 'Novo numero' com width:240px fixo
- **Arquivo:** `src/app/(dashboard)/empresas/[id]/editar/page.tsx:137`
- **Problema:** O campo de numero novo tem style={{...inputStyle, width:240}} em pixels absolutos. Num viewport 390px com padding de 16px em cada lado (restam 358px), o flexbox de 'gap:10' com o botao 'Reconectar WhatsApp' (estimado ~160px) deixa o input espremido ou o botao cai fora da area visivel quando flexWrap:wrap quebra.
- **Sugestao:** Substituir width:240 por width:'100%' ou usar maxWidth:240 somente em desktop. O container ja tem flexWrap:wrap â€” garantir que o input e botao ocupem 100% em mobile.

### [/empresas/novo] IMaskInput CNPJ, Telefone, CEP â€” teclado numerico ausente
- **Arquivo:** `src/app/(dashboard)/empresas/novo/page.tsx:98-147`
- **Problema:** Campos de CNPJ, telefone e CEP sem inputMode. No iOS Safari abre teclado QWERTY em vez do numerico.
- **Sugestao:** Adicionar inputMode='numeric' em CNPJ e CEP, inputMode='tel' em Telefone.

### [/empresas/[id]/editar] IMaskInput CNPJ, Telefone, CEP â€” teclado numerico ausente
- **Arquivo:** `src/app/(dashboard)/empresas/[id]/editar/page.tsx:280-319`
- **Problema:** Mesma ausencia na pagina de edicao de empresa.
- **Sugestao:** Adicionar inputMode='numeric' em CNPJ e CEP, inputMode='tel' em Telefone.

### [/relatorios] Filtros de periodo (selects e inputs de data)
- **Arquivo:** `src/app/(dashboard)/relatorios/page.tsx:265`
- **Problema:** Os selects de mes/ano e inputs de data usam `width: 150px` e `width: 90px` via `selectStyle` inline. Em 390px com varios filtros side-by-side o container usa flexWrap mas os widths fixos podem causar overflow ou compressao excessiva do texto.
- **Sugestao:** Trocar widths fixos por `minWidth` com `flex: 1` ou usar `max-width` ao inves de `width` para que os filtros se adaptem ao viewport.

### [/roteirizacao] Container principal da pagina
- **Arquivo:** `src/app/(dashboard)/roteirizacao/page.tsx:216`
- **Problema:** O container raiz usa `padding: '20px', maxWidth: 1200, margin: '0 auto'` como estilos inline. Isso faz o conteudo nao participar do modelo de altura do layout (sem `height: 100%` ou `flex: 1`), e em mobile o `padding: 20px` ocupa espaco valioso e nao respeita o safe area inset.
- **Sugestao:** Usar PageHeader como as outras telas e estruturar com `display:flex, flexDirection:column, height:100%` para herdar o modelo de scroll do layout.

### [/roteirizacao] Inputs Latitude e Longitude
- **Arquivo:** `src/app/(dashboard)/roteirizacao/page.tsx:255`
- **Problema:** Os campos de lat/lng sao do tipo `number` sem `inputMode`. No iOS o teclado numerico do tipo number nao mostra o ponto decimal de forma acessivel (teclado de telefone em vez de teclado numerico com decimais). O placeholder mostra '-23.5505' mas o usuario pode nao conseguir digitar o ponto.
- **Sugestao:** Adicionar `inputMode='decimal'` nos campos de latitude e longitude para abrir o teclado correto no iOS/Android.

### [/roteirizacao] Botoes de acao pos-otimizacao (Ajustar paradas, Google Maps, WhatsApp)
- **Arquivo:** `src/app/(dashboard)/roteirizacao/page.tsx:303`
- **Problema:** Os botoes de acao sao tags `<a>` com estilo `padding: '8px 14px'`. Altura estimada ~35px, abaixo de 44px. Em mobile aparecem em `flexWrap: 'wrap'` mas sem garantia de altura minima de toque.
- **Sugestao:** Adicionar `minHeight: 44px, display: 'inline-flex', alignItems: 'center'` ao `btnLinkStyle` para garantir o alvo de toque adequado.

### [/regras/novo] Grid de identificacao (Nome/Acesso/Prioridade)
- **Arquivo:** `src/app/(dashboard)/regras/novo/page.tsx:206`
- **Problema:** O grid usa `className='m-grid'` com `gridTemplateColumns: '2fr 1fr 1fr'`. A classe m-grid colapsa corretamente para 1 coluna no mobile, mas o container pai tem `maxWidth: 720` sem classe responsiva â€” em mobile o padding de 16px absorve, entao funciona. Porem o grid dos checkboxes 'Quem pode usar' usa `display: flex, gap: 20px` sem wrap â€” se houver muitos publicos os chips podem sangrar para fora dos 390px.
- **Sugestao:** Adicionar `flexWrap: 'wrap'` no container dos checkboxes de publico (ja presente no editar mas falta verificar se o gap de 20px nao causa overflow).

### [/uso-apis] Pagina inteira â€” sem padding responsivo
- **Arquivo:** `src/app/(dashboard)/uso-apis/CadastroApiEditor.tsx:58`
- **Problema:** O container usa `padding: 24, maxWidth: 860, margin: '0 auto'`. Em 390px o padding de 24px (12px cada lado) ainda funciona, mas o componente CadastroApiEditor tem botao '+ Cadastrar/Editar' com padding `2px 8px`, altura estimada ~22px â€” abaixo de 44px de alvo de toque.
- **Sugestao:** Aumentar o padding do botao de edicao para pelo menos `8px 12px` e adicionar `minHeight: 36px` para chegar mais perto do alvo minimo de toque.

## Problemas — BAIXO (21)

### [/] SeÃ§Ã£o 'Status da Frota Agora' â€” grid de veÃ­culos
- **Arquivo:** `src/app/(dashboard)/page.tsx:233`
- **Problema:** `gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))'` via inline style. Em 390px de viewport isso produz apenas 2 colunas de ~180px, mas sem padding lateral adequado cada card fica com ~175px de largura Ãºtil. O problema real Ã© que nenhuma classe CSS sobrescreve esse grid no mobile â€” se houver muitos veÃ­culos o layout funciona, mas se houver 1 ou 2 veÃ­culos cada card ocupa metade da tela, o que Ã© ok. Gravidade baixa, mas o `minmax(180px,1fr)` pode forÃ§ar overflow horizontal em telas menores que 380px (ex: iPhone SE com 375px de largura real).
- **Sugestao:** Adicionar classe `m-grid` ou usar `minmax(150px, 1fr)` para comportar telas de 375px sem overflow.

### [/] SeÃ§Ã£o 'Em Rota Agora' â€” grid de pedidos ativos
- **Arquivo:** `src/app/(dashboard)/page.tsx:289`
- **Problema:** `gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))'` via inline style. Em 390px de viewport com padding de 16px em cada lado, a largura disponÃ­vel Ã© ~358px. Um card de minimo 280px cabe, mas dois nÃ£o cabem (560px > 358px), entÃ£o colapsa para 1 coluna. Isso Ã© aceitÃ¡vel. PorÃ©m, em iPhones menores (375px viewport, padding 16px = 343px disponÃ­vel), o card ocupa 343px e o `minmax(280px,1fr)` forÃ§a o container a 280px mÃ­nimo â€” pode gerar overflow. AlÃ©m disso, nÃ£o hÃ¡ classe de override mobile explÃ­cita.
- **Sugestao:** Adicionar `m-grid` ao container ou reduzir para `minmax(240px, 1fr)`.

### [/pedidos] DeleteBtn â€” alvo de toque
- **Arquivo:** `src/components/ui/DeleteBtn.tsx:31`
- **Problema:** O `DeleteBtn` tem `padding: 0` e sem `min-height`/`min-width` definidos (DeleteBtn.tsx:31-45), resultando em alvo de toque menor que 44px. Embora fique na tabela `m-hide` (desktop), se a tela for acessada sem a media query correta (tablet estreito) o botao sera praticamente impossivel de tocar.
- **Sugestao:** Adicionar `minHeight: '44px', minWidth: '44px'` ou ao menos `padding: '8px 12px'` no estilo do botao.

### [/pedidos/novo] Chips de locais cadastrados do cliente
- **Arquivo:** `src/app/(dashboard)/pedidos/novo/page.tsx:519-545`
- **Problema:** Os chips de locais cadastrados (botao toggleLocalCadastrado) nao tem altura minima. O padding e 8px 14px, resultando em altura aproximada de ~36px com fonte de 13px â€” abaixo dos 44px recomendados.
- **Sugestao:** Adicionar minHeight: '44px' ao style dos chips de local cadastrado.

### [/pedidos/novo-avancado] Step 3 â€” Campo 'KM Inicial do Veiculo'
- **Arquivo:** `src/app/(dashboard)/pedidos/novo-avancado/page.tsx:590-597`
- **Problema:** type='number' abre teclado numerico correto no Android, mas no iOS abre teclado numerico sem virgula/ponto dependendo do locale. Nao ha inputMode definido explicitamente.
- **Sugestao:** Adicionar inputMode='numeric' ao input de KM para garantir o teclado numerico no iOS.

### [/pedidos/[id]/editar] Botao 'Ajuste manual (gestor)'
- **Arquivo:** `src/app/(dashboard)/pedidos/[id]/editar/page.tsx:409-413`
- **Problema:** O botao tem padding: '8px 12px' e fontSize: '12px' com whiteSpace:'nowrap'. A altura e aproximadamente 34px â€” abaixo dos 44px. Em mobile fica ao lado do Campo de KM em display:flex, podendo comprimir ambos.
- **Sugestao:** Adicionar minHeight: '44px' ao botao de ajuste manual.

### [/pedidos/importar] EtapaUpload â€” botoes seletores de modo (XML / Planilha)
- **Arquivo:** `src/app/(dashboard)/pedidos/importar/_components/EtapaUpload.tsx:101-125`
- **Problema:** Os dois botoes de modo usam flex:1 com padding:16px 20px e textAlign:'left'. Em 390px cada botao fica com ~175px e o texto descritivo ('Arquivos .xml individuais ou .zip com varios XMLs') pode estoura o botao em duas ou tres linhas, aumentando a altura de forma inconsistente. Nao ha minHeight definido.
- **Sugestao:** Adicionar minHeight: '80px' e overflow:hidden nos botoes de modo, ou usar display:flex com alignItems:center para manter altura consistente.

### [/entregas/novo] Input KM Inicial (aba Cronograma)
- **Arquivo:** `src/app/(dashboard)/entregas/novo/page.tsx:199`
- **Problema:** type='number' sem inputMode='decimal'. No iOS Safari type='number' abre teclado com virgula decimal mas sem acesso rapido a ponto. Para numeros grandes como odometro, o teclado numerico padrao seria mais adequado.
- **Sugestao:** Adicionar inputMode='decimal' ao input de km_inicial para abrir teclado numerico com decimal no iOS.

### [/entregas/[id]/editar] IMaskInput Valor do Pedido (aba Financeiro)
- **Arquivo:** `src/app/(dashboard)/entregas/[id]/editar/page.tsx:252-255`
- **Problema:** Usa defaultValue={f.valor_pedido} (nao controlado). Se o usuario navegar para outra aba e voltar, o campo exibe o valor correto na primeira renderizacao pois o form so monta apos o load, mas qualquer re-render causado por mudanca de estado pode perder o valor visivel da mascara enquanto o estado interno permanece correto â€” comportamento confuso no mobile onde re-renders sao frequentes.
- **Sugestao:** Usar key={f.valor_pedido} no IMaskInput para forcar remount quando o valor inicial muda, garantindo que a mascara exibe o valor correto apos qualquer re-render.

### [/financeiro (aba A Pagar)] Botoes de filtro de periodo (30d/60d/90d)
- **Arquivo:** `src/app/(dashboard)/financeiro/_components/APagarTab.tsx:136-158`
- **Problema:** Os botoes de periodo estao com marginLeft:'auto' num flex container com os botoes de filtro. Em telas pequenas eles sao empurrados para a direita mas os dois grupos de botoes no mesmo flex podem ficar sem espaco quando as palavras 'Pendentes/Atrasados/Todos' + os tres periodos nao cabem em uma linha â€” sem flexWrap nos grupos internos.
- **Sugestao:** Adicionar flexWrap:wrap ao container externo e remover marginLeft:'auto' dos periodos para que caiam para a segunda linha naturalmente.

### [/abastecimentos/novo] Grid de dados do abastecimento â€” 4 colunas
- **Arquivo:** `src/app/(dashboard)/abastecimentos/novo/page.tsx:126-145`
- **Problema:** O grid `repeat(4, 1fr)` (linha 126) usa a classe `m-grid` que colapsa para 1 coluna no mobile. Porem o elemento `posto` tem `gridColumn: span 2` explicitamente em inline style. A regra do `.m-grid > [style*='gridColumn']` no mobile.css forÃ§a `grid-column: span 1` via seletor de atributo, o que anula o span â€” comportamento correto. Mas o campo `Confirmado` (checkbox) na tela de ediÃ§Ã£o usa `gridColumn` implÃ­cito e fica em linha separada: ok. O risco real Ã© o campo `posto` ter `gridColumn: 'span 2'` no style inline e a regra CSS de reset usa o seletor `.m-grid > [style*='gridColumn']`. Caso o browser nÃ£o case o seletor de atributo exato, o span 2 num grid de 1 coluna nÃ£o quebra o layout (span 2 em 1-col grid simplesmente ocupa a coluna Ãºnica). Baixo risco real.
- **Sugestao:** Sem aÃ§Ã£o necessÃ¡ria â€” o colapso para 1 coluna jÃ¡ funciona mesmo se o span 2 persistir.

### [/abastecimentos/novo] Botao salvar duplicado no rodapÃ© do formulÃ¡rio
- **Arquivo:** `src/app/(dashboard)/abastecimentos/novo/page.tsx:88-95`
- **Problema:** HÃ¡ dois botoes de submit: um no PageHeader (linha 91) e um no rodapÃ© do formulÃ¡rio (linha 149). Ambos disparam `handleSubmit`. NÃ£o hÃ¡ risco de clique duplo pois `setSaving(true)` desabilita ambos, mas no mobile o rodapÃ© fica abaixo do scroll e pode nÃ£o ser visÃ­vel, enquanto o header pode ficar espremido com os trÃªs botoes (Voltar + Cancelar + Salvar) em sequÃªncia horizontal comprimida.
- **Sugestao:** Considerar remover o rodapÃ© de botoes ou o header de botoes no mobile, deixando apenas um ponto de aÃ§Ã£o visÃ­vel.

### [/motoristas/[id]/editar] Aba Acerto Mensal â€” coluna direita 'Resumo do MÃªs' (sticky)
- **Arquivo:** `src/app/(dashboard)/motoristas/[id]/editar/_components/AcertoMensalTab.tsx:484-538`
- **Problema:** A coluna direita do Resumo usa `position: sticky, top: 24px` dentro de um grid `2fr 1fr`. No mobile, a classe `m-stack` do mobile.css colapsa o grid para 1 coluna, entÃ£o o Resumo aparece abaixo dos ajustes â€” certo. PorÃ©m o painel tem `background: #0f172a` (fundo escuro) com texto branco e `padding: 24px` mais uma `textarea` com `background: #1e293b`. Em telas pequenas o textarea Ã© muito pequeno para digitar observaÃ§Ãµes mas isso Ã© menor. O problema real: o botÃ£o 'Fechar Acerto' pode sair da Ã¡rea visÃ­vel sem scroll pois a coluna sticky no mobile vira elemento normal no fluxo.
- **Sugestao:** Sem aÃ§Ã£o crÃ­tica; o grid jÃ¡ colapsa via `m-stack`. Confirmar visualmente que o botÃ£o 'Fechar Acerto' fica acessÃ­vel apÃ³s scroll.

### [/clientes/novo] PageHeader â€” botoes Voltar e Cancelar duplicados
- **Arquivo:** `src/app/(dashboard)/clientes/novo/page.tsx:139-146`
- **Problema:** O PageHeader tem tres botoes de acao: 'Voltar para Lista' (href=/clientes, variant=ghost) e 'Cancelar' (href=/clientes, variant=outline) fazem a mesma coisa. No mobile (flex-wrap) ficam dois botoes inuteis ocupando espaco e o botao 'Salvar Cliente' pode ser empurrado para uma segunda linha.
- **Sugestao:** Manter apenas um botao de retorno (ex: 'Cancelar') e o botao de submit. Remover 'Voltar para Lista' que e redundante.

### [/clientes/[id]/editar] PageHeader â€” botoes Voltar e Cancelar duplicados
- **Arquivo:** `src/app/(dashboard)/clientes/[id]/editar/page.tsx:213-221`
- **Problema:** Mesma duplicidade: 'Voltar para Lista' e 'Cancelar' ambos apontam para /clientes. No mobile os tres botoes (Voltar + Cancelar + Atualizar) quebram em duas linhas, afogando o header.
- **Sugestao:** Remover o botao 'Voltar para Lista' ou o 'Cancelar', manter apenas um.

### [/empresas/[id]/editar] WhatsAppSection â€” botao 'Reconectar WhatsApp' sem loading visivel no estado inicial
- **Arquivo:** `src/app/(dashboard)/empresas/[id]/editar/page.tsx:142-149`
- **Problema:** O botao usa disabled={loading} e troca o texto para 'Gerando QR...' â€” isso esta correto. Porem, ao clicar e ficar loading=true, o botao nao tem feedback visual alem do disabled (sem spinner, sem mudanca de cor). Em conexoes lentas no celular o usuario pode nao perceber que clicou.
- **Sugestao:** Adicionar opacity:0.7 ou cor alterada no variant quando disabled, ou um spinner SVG ao lado do texto 'Gerando QR...'.

### [/perfil] Container com maxWidth:520 sem width:100%
- **Arquivo:** `src/app/(dashboard)/perfil/page.tsx:65`
- **Problema:** O div wrapper tem style={{maxWidth:520}} mas nao tem width:'100%'. No mobile o elemento nao expande para a largura disponivel e pode ficar com largura auto (determinada pelo filho mais largo). Se o conteudo for mais estreito que o viewport, o formulario fica desalinhado. Nao e critico mas prejudica a apresentacao.
- **Sugestao:** Adicionar width:'100%' ao div: style={{maxWidth:520, width:'100%'}}.

### [/usuarios/novo] Botao 'Salvar' no PageHeader â€” submit externo ao form
- **Arquivo:** `src/app/(dashboard)/usuarios/novo/page.tsx:41-45 e 145-148`
- **Problema:** O botao de submit no PageHeader usa form='user-form' para referenciar o form abaixo. Isso e tecnicamente valido, mas se o formulario ainda nao foi montado no DOM (ex: renderizacao SSR/hidratacao parcial), o botao nao dispara o submit. Nao e um bug garantido mas e fragil. Alem disso, ha dois botoes de submit: um no header e outro no rodape do form â€” duplicidade confusa no mobile.
- **Sugestao:** Manter apenas o botao de submit dentro do form (no rodape). Remover o do PageHeader ou transformar em link de retorno.

### [/usuarios/[id]/editar] Botao 'Atualizar' no PageHeader â€” submit externo duplicado
- **Arquivo:** `src/app/(dashboard)/usuarios/[id]/editar/page.tsx:72-76 e 184-187`
- **Problema:** Mesma duplicidade de submit: botao no header com form='edit-user-form' e botao dentro do formulario no rodape.
- **Sugestao:** Remover o botao de submit do PageHeader e manter apenas o do rodape do form.

### [/clientes] Botao Excluir (DeleteBtn) â€” alvo de toque
- **Arquivo:** `src/components/ui/DeleteBtn.tsx:31-45`
- **Problema:** O DeleteBtn tem padding:0 e fontSize:inherit (herda ~12px da celula Td). A altura clicavel e aproximadamente 18-20px, muito abaixo do minimo de 44px recomendado. Embora fique dentro do m-hide (desktop), o proprio componente nao tem protecao contra uso indevido em mobile.
- **Sugestao:** Adicionar minHeight:44px e padding:8px ao DeleteBtn, ou usar classe m-touch condicional.

### [/regras/contexto] Grid Telefone x Mensagem
- **Arquivo:** `src/app/(dashboard)/regras/contexto/page.tsx:67`
- **Problema:** O grid de inputs usa `className='m-grid'` com `gridTemplateColumns: '1fr 2fr'`. A classe m-grid forca 1 coluna no mobile, o que esta correto. Porem o campo de telefone nao tem `inputMode='tel'` e o campo de mensagem nao tem `inputMode='text'` â€” ambos abrem o teclado QWERTY padrao, o que e aceitavel para mensagem mas subotimo para telefone no celular.
- **Sugestao:** Adicionar `inputMode='tel'` no campo de telefone para abrir o teclado numerico de telefone no iOS/Android.

## Boas praticas (pesquisa web)

### Melhores PrÃ¡ticas de Feedback de Carregamento e Toque em Web Apps Mobile (2024-2025)
- **Desabilitar botÃ£o + spinner durante carregamento (loading states)** — Previne cliques duplicados e oferece feedback visual imediato de que a aÃ§Ã£o foi registrada. Em mobile, o spinner Ã© crÃ­tico pois o usuÃ¡rio nÃ£o recebe feedback de hover. _(fonte: https://dev.to/sudiip__17/handling-loading-states-while-data-fetching-in-nextjs-with-and-without-suspense-10j8 e https://blog.openreplay.com/prevent-double-form-submissions/)_
- **Usar hook useActionState (React 19) ou useTransition para gerenciar estado de loading em forms** — Integra-se nativamente com Next.js Server Actions e fornece estado de pending automÃ¡tico, reduzindo boilerplate e garantindo sincronizaÃ§Ã£o entre UI e servidor. _(fonte: https://medium.com/@ryangan.dev/handling-form-loading-states-in-next-js-react-2024-33da2dae11ce e https://nextjs.org/docs/14/app/building-your-application/data-fetching/server-actions-and-mutations)_
- **Implementar idempotÃªncia no servidor (idempotency tokens) como defesa em profundidade** — Mesmo com desabilitaÃ§Ã£o de botÃ£o no cliente, conexÃµes perdidas ou reenvios podem ocorrer. O servidor gera token Ãºnico, verifica se jÃ¡ processou aquele token e retorna resposta anterior se duplicado. _(fonte: https://blog.openreplay.com/prevent-double-form-submissions/)_
- **Usar useOptimistic (React 19) para atualizar UI instantaneamente antes da resposta do servidor** — Melhora drasticamente a percepÃ§Ã£o de performance. UsuÃ¡rio vÃª mudanÃ§a imediatamente; se falhar, UI reverte automaticamente. CrÃ­tico em mobile onde latÃªncia Ã© maior. _(fonte: https://dev.to/whoffagents/optimistic-updates-in-nextjs-14-useoptimistic-server-actions-and-automatic-rollback-5hbl e https://medium.com/@mishal.s.suyog/optimistic-ui-with-server-actions-in-next-js-a-smoother-user-experience-6b779e4293a9)_
- **Implementar toast notifications para feedback de sucesso/erro (nÃ£o-bloqueante, auto-dismiss)** — PadrÃ£o UX moderno que confirma aÃ§Ã£o sem interromper fluxo. Em mobile, garantir Ã¡rea de toque grande (mÃ­nimo 44-48px) e tempo de exibiÃ§Ã£o adequado (3-5s). _(fonte: https://blog.logrocket.com/ux-design/toast-notifications/ e https://mobbin.com/glossary/toast)_
- **Usar transition timing de 150-300ms para active states (press/tap visual feedback)** — ConfirmaÃ§Ã£o tÃ¡til imediata de clique/tap sem ser instantÃ¢nea demais (causa UI jitter). PadrÃ£o validado em design de botÃµes modernos. _(fonte: https://www.sliderrevolution.com/design/button-states/)_
- **Implementar :active CSS state ou ripple effect visual em toque (nÃ£o depender de :hover)** — Dispositivos mobile nÃ£o suportam hover. Focus indicator (acessibilidade) Ã© crÃ­tico, mas active state fornece feedback tÃ¡til essencial durante pressionamento. _(fonte: https://github.com/dmitrizzle/active-touch e https://blog.openreplay.com/mastering-touch-and-gesture-interactions-in-react/)_
- **Usar pointer events (nÃ£o sÃ³ touch) para suportar mouse + touch unificado** — Pointer events oferecem modelo Ãºnico para mouse, touch e stylus. Mais robusto que tocar touch events separadamente em web apps que rodam desktop + mobile. _(fonte: https://blog.openreplay.com/mastering-touch-and-gesture-interactions-in-react/)_
- **Reabilitar form controls (botÃ£o) em erro para retry sem refresh** — Se submissÃ£o falha, usuÃ¡rio precisa poder tentar novamente. Deixar botÃ£o desabilitado indefinidamente Ã© UX ruim; re-habilitar + mostrar erro em toast/banner permite retry imediato. _(fonte: https://blog.openreplay.com/prevent-double-form-submissions/)_
- **Usar skeleton screens em vez de spinners para data loading (Suspense em Next.js)** — Skeleton screens oferecem preview de baixa fidelidade do conteÃºdo a vir, criando percepÃ§Ã£o de carregamento mais rÃ¡pido. Mais moderno que spinner genÃ©rico. _(fonte: https://medium.com/@ryangan.dev/handling-form-loading-states-in-next-js-react-2024-33da2dae11ce)_
- **Desabilitar evento de submissÃ£o durante promise pendente (guard contra keyboard/click redundante)** — AlÃ©m de visual (botÃ£o desabilitado), marcar internamente que requisiÃ§Ã£o estÃ¡ em voo previne execuÃ§Ã£o de handler mesmo se elemento aceitar eventos. Defense in depth. _(fonte: https://www.the-art-of-web.com/javascript/doublesubmit/)_
- **Incluir mensagem clara + especÃ­fica durante loading (nÃ£o apenas spinner vazio)** — Mensagens contextuais (ex: 'Enviando dados...', 'Processando pagamento...') aumentam confianÃ§a do usuÃ¡rio em SaaS/fintech. Spinner sem texto causa ansiedade. _(fonte: https://www.getfishtank.com/insights/best-practices-for-loading-states-in-nextjs)_
- **Considerar haptic feedback (vibraÃ§Ã£o) em mÃ³vel para confirmaÃ§Ã£o de toque (React Native ou Web Haptics API)** — Feedback tÃ¡til reforÃ§a confirmaÃ§Ã£o visual de aÃ§Ã£o em contexto mobile. Quando bem calibrado (curta, 10-20ms), melhora percepÃ§Ã£o de responsividade. _(fonte: https://instamobile.io/react-native-tutorials/haptic-feedback-react-native/)_

### BotÃ£o Voltar em Web Apps Next.js App Router: Melhores PrÃ¡ticas e SoluÃ§Ãµes para Bugs Comuns
- **Usar router.replace() para redirecionamentos de autenticaÃ§Ã£o (login/logout) e fluxos que nÃ£o devem aparecer no histÃ³rico** — router.replace() substitui a entrada atual do histÃ³rico do navegador em vez de criar uma nova. Evita que o botÃ£o voltar leve o usuÃ¡rio de volta para a tela de login (o famoso bug 'voltar cai na tela de login'). Aplicar em: sign-in/sign-out, conditional redirects, mudanÃ§as de idioma/tema que mudam a URL. _(fonte: Next.js Docs - Linking and Navigating | https://nextjs.org/docs/app/getting-started/linking-and-navigating)_
- **Usar router.push() para navegaÃ§Ã£o normal entre pÃ¡ginas onde o histÃ³rico faz sentido** — router.push() adiciona uma nova entrada ao histÃ³rico do navegador, permitindo que o usuÃ¡rio volte. Use para links internos normais, mudanÃ§as de filtros/pagination, navegaÃ§Ã£o em fluxos onde 'voltar' Ã© semanticamente correto. _(fonte: Next.js Docs - Linking and Navigating | https://nextjs.org/docs/app/getting-started/linking-and-navigating)_
- **Implementar middleware de autenticaÃ§Ã£o ANTES de redirecionar para login (evita poluÃ§Ã£o de histÃ³rico)** — Usar middleware (arquivo middleware.ts no root) para validar autenticaÃ§Ã£o ANTES da renderizaÃ§Ã£o da pÃ¡gina. Se desautenticado, redirecionar com router.replace() no middleware ou em um layout Server Component. Isso evita adicionar a pÃ¡gina protegida ao histÃ³rico antes de perceber que o usuÃ¡rio nÃ£o estÃ¡ logado. _(fonte: Next.js Middleware Authentication | https://blog.openreplay.com/how-to--authentication-middleware-in-nextjs/)_
- **Usar window.history.pushState() para atualizaÃ§Ãµes internas de estado sem navegar de pÃ¡gina (filtros, sorting)** — pushState() cria uma nova entrada no histÃ³rico sem fazer full page reload. Ideal para aplicaÃ§Ãµes tipo SPA onde o usuÃ¡rio muda filtros/sort de uma listagem e quer que voltar desfaÃ§a sÃ³ a mudanÃ§a de filtro, nÃ£o saia da pÃ¡gina. _(fonte: MDN - History API | https://developer.mozilla.org/en-US/docs/Web/API/History_API/Working_with_the_History_API)_
- **Usar window.history.replaceState() para atualizaÃ§Ãµes de URL que NÃƒO devem criar novo histÃ³rico (locale switcher, tema)** — replaceState() modifica o entry atual do histÃ³rico em vez de criar um novo. Use quando mudar idioma/tema gera uma URL nova (ex: /en/about -> /fr/about) mas vocÃª quer que 'voltar' leve para a pÃ¡gina antes da troca de idioma, nÃ£o para a mesma pÃ¡gina em outro idioma. _(fonte: MDN - History API | https://developer.mozilla.org/en-US/docs/Web/API/History_API/Working_with_the_History_API)_
- **Evitar NextAuth redirects em Server Components sem callback explÃ­cito (causa cookie race condition)** — Se vocÃª chamar signOut() em um Server Component sem especificar callbackUrl, pode haver race condition com cookies de autenticaÃ§Ã£o, causando redirect loop. SoluÃ§Ã£o: Envolver em um Client Component e controlar explicitamente o callbackUrl, ou usar middleware. _(fonte: NextAuth Issue #9496 | https://github.com/nextauthjs/next-auth/discussions/9496)_
- **Implementar pattern ?next=/dashboard em redirecionar login: salvar URL original antes de redirecionar** — Quando um usuÃ¡rio tenta acessar /dashboard mas nÃ£o estÃ¡ logado, redirecionar para /login?next=/dashboard. ApÃ³s login, redirecionar para a URL original usando router.push(). Evita que o botÃ£o voltar depois do login caia na pÃ¡gina de login. _(fonte: Medium - Auth Tips | https://medium.com/@sassenthusiast/next-js-auth-tips-how-to-redirect-users-back-to-their-initial-page-after-login-1128e7c003e8)_
- **Configurar scroll restoration manualmente em mobile com sessionStorage (next-scroll-restoration package)** — Next.js App Router nÃ£o restaura scroll position automaticamente em mobile quando usuÃ¡rio volta. Usar biblioteca como next-scroll-restoration ou implementar sessionStorage para guardar posiÃ§Ã£o de scroll e restaurar ao voltar. _(fonte: GitHub Issue #18997 | https://github.com/vercel/next.js/issues/18997)_
- **Usar scroll={false} na tag <Link> para manter posiÃ§Ã£o de scroll do usuÃ¡rio apÃ³s navegaÃ§Ã£o** — Por padrÃ£o Next.js faz scroll to top apÃ³s navegaÃ§Ã£o. Se vocÃª quer manter a posiÃ§Ã£o (ex: usuÃ¡rio scrollou lista, clicou num item, voltou), usar <Link scroll={false}>. _(fonte: Next.js Docs - Link Component | https://nextjs.org/docs/app/api-reference/components/link)_
- **Implementar listener popstate para sincronizar estado quando usuÃ¡rio clica back button** — window.addEventListener('popstate', ...) dispara quando usuÃ¡rio clica no botÃ£o back/forward do navegador. Use para sincronizar estado da aplicaÃ§Ã£o (ex: restaurar filtros, carregar dados corretos). CrÃ­tico em SPAs. _(fonte: MDN - History API | https://developer.mozilla.org/en-US/docs/Web/API/History_API/Working_with_the_History_API)_
- **Evitar usar back button para sair de fluxo crÃ­tico (pagamento, confirmaÃ§Ã£o) - oferecer botÃ£o explÃ­cito ao invÃ©s** — Em fluxos de mÃºltiplos passos (checkout, wizard), o back button pode causar perda de dados ou estados inconsistentes. Melhor oferecer um botÃ£o 'Cancelar' ou 'Voltar' no UI que vocÃª controla via router.push/replace, em vez de confiar no back button. _(fonte: UX Pattern - Medium | https://medium.com/@clementinejinhee/how-to-avoid-tapping-on-the-back-button-in-an-interface-design-c9c07e06bf01)_
- **Para mobile com bottom navigation, usar back button no topo (padrÃ£o iOS/Android) e bottom nav para navigaÃ§Ã£o principal** — UsuÃ¡rios mobile esperam back button no topo (title bar) e navigation principal na bottom nav. Misturar os dois no mesmo lugar confunde. Use back button sÃ³ para voltar 1 passo em stack, nÃ£o para mudar de seÃ§Ã£o. _(fonte: Ionic Framework - Back Button | https://ionicframework.com/docs/api/back-button)_
- **Usar usePathname() + middleware para validar autenticaÃ§Ã£o de forma centralizada antes de renderizar conteÃºdo** — Validar ANTES de renderizar evita piscadas (flash) da pÃ¡gina protegida antes de redirecionar. Middleware roda server-side antes da renderizaÃ§Ã£o, mais seguro e sem poluiÃ§Ã£o de histÃ³rico. _(fonte: Next.js Docs - useRouter | https://nextjs.org/docs/pages/api-reference/functions/use-router)_
- **Em URLs dinÃ¢micas com query params (filtros), usar pushState para manter back button funcional por filtro** — Se listar produtos filtrÃ¡vel, usar window.history.pushState ao mudar filtros (ex: /products?category=shoes). Cada mudanÃ§a de filtro = novo histÃ³rico. UsuÃ¡rio pode voltar passo a passo pelos filtros que aplicou. _(fonte: Next.js Docs - Native History API Examples | https://nextjs.org/docs/app/getting-started/linking-and-navigating)_
- **Desabilitar back button em telas especÃ­ficas (loading, payment) com window.history.pushState + listeners** — Em telas crÃ­ticas onde voltar Ã© perigoso, vocÃª pode usar uma combinaÃ§Ã£o de pushState e listeners de popstate para detectar tentativas de voltar e mostrar confirmaÃ§Ã£o. _(fonte: Medium - Prevent Navigation | https://medium.com/@deepak.v2701/next-js-prevent-navigation-handle-back-button-page-reload-with-userouter-fbead4d69051)_

### Melhores PrÃ¡ticas de Layout Mobile para Web Apps de GestÃ£o
- **Alvos de toque mÃ­nimo 44-48px (altura e largura)** — Reduz erros de toque e atende pessoas com mobilidade reduzida. W3C recomenda 44Ã—44px como mÃ­nimo; Apple/Google recomendam 48Ã—48px para conforto. _(fonte: Apple Human Interface Guidelines (iOS), Google Material Design 3, WCAG 2.1 Level AAA)_
- **Aplicar viewport meta tag com initial-scale=1.0 e user-scalable=yes** — Controla zoom inicial e permite que usuÃ¡rios faÃ§am zoom em inputs de 16px+ (iOS nÃ£o faz zoom automÃ¡tico se font-size >= 16px). Evita surprise zoom em inputs pequenos. _(fonte: MDN Web Docs, Apple iOS Safari Guidelines, CSS-Tricks viewport guide)_
- **Font-size mÃ­nimo 16px em <input> e <textarea>** — iOS Safari nÃ£o faz auto-zoom se input tem 16px+. Evita experiÃªncia frustante de zoom involuntÃ¡rio ao tocar o campo. Acessibilidade: usuÃ¡rios com baixa visÃ£o precisam ler o conteÃºdo. _(fonte: Apple iOS Guidelines, Webkit bug tracker, ADA Accessibility)_
- **Usar inputMode e type corretos: email, tel, number, url, search** — Mostra teclado nativo otimizado para o dado (teclado numÃ©rico para tel/number, @ para email). Reduz erros de entrada e acelera digitaÃ§Ã£o. _(fonte: HTML Living Standard (WHATWG), MDN inputMode)_
- **Converter tabelas em cards em tela <= 768px com media query @media (max-width: 768px)** — Tabelas sÃ£o ilegÃ­veis em celular (overflow horizontal, filas finas). Cards empilhados sÃ£o responsivos e legÃ­veis. PadrÃ£o adotado por Shopify, Stripe, AWS Console. _(fonte: Material Design responsive tables, Bootstrap grid, Responsive Web Design (Ethan Marcotte))_
- **Grid/Flexbox com breakpoints: mobile < 480px, tablet 480-768px, desktop > 768px** — Permite layouts diferentes por tamanho de tela. Mobile-first: escrever CSS para mobile primeiro, depois usar media queries para desktop. _(fonte: Google Material Design breakpoints, Tailwind CSS breakpoints, Bootstrap responsive grid)_
- **Bottom navigation para aÃ§Ãµes principais (mobile < 768px)** — Menu superior fica distante em celular. Bottom nav fica perto do polegar (zona de alcance natural). PadrÃ£o em iOS/Android nativos. _(fonte: Material Design bottom navigation, Apple HIG, Nielsen Mobile Usability)_
- **Modais fullscreen em mobile; modal centrado em desktop (dialog com max-width: 500px)** — Modal centrado fica pequeno em celular e forÃ§a zoom. Fullscreen aproveita a tela toda e torna aÃ§Ãµes visÃ­veis sem scroll. _(fonte: Material Design dialogs, iOS HIG modal presentation, Web.dev dialog patterns)_
- **Padding/margin: 16px minimum em mobile, 24px em desktop; elementos com gap: 12px** — EspaÃ§amento adequado evita toque acidental em botÃµes vizinhos. Melhora legibilidade em telas pequenas. _(fonte: Material Design spacing system, Apple HIG, Google Material Design 3)_
- **Limpar inputs de busca/filtro com <input type='search'> + ::-webkit-search-cancel-button** — type='search' oferece botÃ£o 'X' nativo em navegadores mobile. Reduz necessidade de backspace manual. _(fonte: MDN <input type='search'>, CSS-Tricks, Safari CSS reference)_
- **Usar max-width: 100%; height: auto para imagens; picture para resoluÃ§Ãµes diferentes** — Imagens responsivas nÃ£o transbordam. <picture> carrega imagem otimizada por DPI (1x, 2x, 3x em celulares) _(fonte: MDN <picture>, Google WebP/AVIF image format, Responsive Images Community Group)_
- **Touch target de 48Ã—48px com 8px padding ao redor de botÃµes/links** — Evita misclick. Mesmo botÃ£o visual de 32px pode ter 48px de Ã¡rea tÃ¡til com padding transparente. _(fonte: WCAG 2.5.5 Target Size, Material Design touch targets, Apple HIG)_
- **CSS scroll-behavior: smooth e scroll-padding-top: 60px (altura da navbar)** — NavegaÃ§Ã£o interna suave. Padding evita que conteÃºdo fique escondido atrÃ¡s da navbar fixa. _(fonte: MDN scroll-behavior, CSS Scroll Snap, Web.dev scroll experience)_
- **Usar em <form>: <label for='id'> vinculada a <input id='id'>; placeholder NÃƒO substitui label** — Acessibilidade. Screen readers e usuÃ¡rios de teclado precisam de labels. Placeholder desaparece ao digitar. _(fonte: WCAG 2.1 Labels, WebAIM form accessibility, Smashing Magazine label best practices)_
- **Meta tags: viewport, theme-color, apple-touch-icon para Ã­cone na home screen** — Viewport permite controle de zoom. theme-color coloriza barra do navegador em Android. apple-touch-icon melhora experiÃªncia PWA. _(fonte: MDN Meta tags, Google PWA guidelines, Apple App Clip guidelines)_
- **Debounce de scroll/resize com requestAnimationFrame; lazy load imagens com loading='lazy'** — Reduz overhead de layout recalc. Lazy load melhora performance inicial e economia de dados em celular. _(fonte: MDN requestAnimationFrame, Web.dev image optimization, CSS-Tricks debounce patterns)_
- **Usar CSS @supports para feature queries (ex: CSS Grid) com fallback flex** — CÃ³digo robusto em navegadores antigos. Grid oferece layout melhor em novo, flex funciona em tudo. _(fonte: MDN @supports, Can I Use CSS Grid, Progressive Enhancement)_
- **Contrast ratio mÃ­nimo 4.5:1 para texto normal, 3:1 para texto grande (18px+)** — UsuÃ¡rios com baixa visÃ£o conseguem ler. PadrÃ£o WCAG AA obrigatÃ³rio em acessibilidade. _(fonte: WCAG 2.1 Contrast (Minimum), WebAIM contrast checker, Stark plugin (Figma))_
- **Usar backdrop: blur(4px) e overlay darkness 60-80% em modais para destaque** — Reduz distraÃ§Ã£o do fundo. Deixa claro que foco mudou para modal. PadrÃ£o iOS/Android. _(fonte: Material Design elevation, iOS HIG modal presentation, CSS backdrop-filter)_
- **Indicador de loading: spinner + texto ou skeleton screen em dados async** — Celular tem conexÃ£o lenta. Feedback visual evita que usuÃ¡rio pense que travou. _(fonte: Material Design loaders, Nielsen NN/g loading feedback, Web.dev CLS metric)_

