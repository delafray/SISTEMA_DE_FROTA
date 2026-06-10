# Redesign de Pedidos & Despacho — o que mudou (10/06/2026)

Oi! Aqui está, em português claro, tudo que mexi nas telas de **Pedidos** e **Despacho**.
A régua foi sempre a mesma: **uma secretária tem que conseguir usar sem ninguém ensinar.**
Cada decisão se apoia na pesquisa que já estava no projeto (`docs/PESQUISAS_CONSOLIDADO.md` e
`docs/PROPOSTA_PEDIDOS_DESPACHO.md`). Os nomes entre parênteses (Routific, Fleetbase, Bsoft…)
são os sistemas de referência que inspiraram cada escolha.

> ⚠️ **Tem 1 coisinha que depende de você rodar no banco** — está no fim, na seção "Banco".
> Mas mesmo SEM rodar, o erro do despacho já está corrigido no código.

---

## 1. Novo Pedido — agora aceita VÁRIOS locais de carregamento

**Antes:** para um cliente cadastrado, você só conseguia escolher **um** local de carregamento.
Se a carga saía de dois galpões, não dava.

**Agora:** o bloco "Locais de Carregamento" virou uma **lista**. Você pode:
- Tocar nos **botões (chips)** dos locais já cadastrados do cliente para adicioná-los — um, dois,
  quantos quiser. O que já está na lista aparece com **"✓ adicionado"** (verde), então você não
  adiciona o mesmo duas vezes por engano. Toca de novo para tirar.
- Clicar em **"+ Adicionar outro local"** para **digitar um local avulso** (que não está no cadastro),
  misturando com os cadastrados no mesmo pedido.
- O **local principal** do cliente já entra sozinho na lista (continua sendo o atalho de sempre).

**O modal "salvar local no cadastro" continua** — e ficou melhor: se você digitou um ou mais locais
avulsos para um cliente cadastrado, no fim o sistema pergunta se quer guardá-los no cadastro do
cliente, deixando você **dar um nome para cada um** (ou deixar em branco para ignorar).

**Por que assim:** Routific prega "**mínimo de campos, 3 cliques**" — a tela continua simples, só
que agora um clique adiciona um local em vez de travar você num só. A ideia de "chips que marcam o
que já foi usado" segue o padrão de seleção rápida dos apps de roteirização (Circuit/Routific).

**O que ficou de fora:** a indicação de "locais usados em pedidos ANTERIORES" (histórico do cliente).
Decidi mostrar claramente o que já está **neste** pedido (mais útil e instantâneo) em vez de
puxar histórico, que deixaria a tela mais lenta. Dá para acrescentar depois se você quiser.

---

## 2. Lista de Pedidos — agora dá para ACHAR um pedido

**Antes:** a lista mostrava motorista, placa, KM, datas previstas… e **nenhum nome de cliente**.
Para uma secretária procurar "o pedido do João de ontem", era impossível.

**Agora a lista mostra, em cada linha:**
- **Cliente** (em destaque) — vem das entregas, seja **cadastrado** ou **avulso** (nome digitado).
- **Cadastrado em** — a data em que o pedido foi lançado.
- **Destinos resumidos** — ex.: **"3 entregas · Centro / Jardim +1"** (mostra os dois primeiros
  bairros e "+N" para o resto).
- **Valor** e **Status**.
- Embaixo do cliente, em cinza pequeno, aparece o motorista/caminhão **se já foi despachado**
  (com o apelido do caminhão quando tiver).

**A busca agora encontra por CLIENTE e por DESTINO** (além de motorista/placa). Digita "João" e
acha os pedidos do João; digita "Centro" e acha os que entregam no Centro.

**Por que assim:** é exatamente como a secretária pensa ("o pedido do fulano", "o que vai pro tal
bairro"). Segue o conceito de lista orientada ao **pedido do cliente** (TMS BR "Pedido de Carga",
e o *Order* do Fleetbase/ERPNext) em vez de orientada ao veículo.

**Observação técnica (sem afetar o uso):** mantive o carregamento atual (`loadAll`) para ficar
**igual às outras listas** do sistema e não arriscar. Você tem uma regra (09/06) de paginar de
100 em 100 com busca no servidor quando passar de ~1.000 pedidos — quando chegar essa hora, é
trocar o `loadAll` por paginação no servidor **nesta lista e na fila do Despacho** (a busca por
cliente/destino já está pronta para virar `.ilike()` no servidor). Deixo isso anotado como próximo
passo; não era seguro reescrever agora junto com tudo o mais.

---

## 3. Editar Pedido — simplificada (e destravada)

**Antes:** a tela de editar era "toda doida": **exigia** escolher motorista E veículo para salvar.
Resultado: um pedido recém-lançado (que ainda **não** foi despachado, então não tem motorista) **não
podia ser editado** — a tela reclamava "Selecione um motorista". Também deixava editar o KM inicial
à mão, que é um número que vem **automático** do fluxo do motorista.

**Agora editar pedido é só o que é do pedido:**
- **Cliente** (cadastrado por busca, ou avulso digitando o nome),
- **Valor**, **datas previstas**, **status**, **observações**,
- e as **entregas** (vincular/desvincular), como antes.

E o bloco de **Despacho virou somente leitura**: mostra motorista, caminhão (com apelido) e KM
apenas para conferência, com o aviso **"definido na tela de Despacho"** e um link direto para
**/despacho**. Nada de mexer em motorista/veículo aqui.

**O KM inicial** aparece só para leitura ("automático do fluxo do motorista"). **Se** você estiver
logado como **gestor (admin/master)**, aparece um botão **"Ajuste manual (gestor)"** que libera o
campo para corrigir à mão — exatamente o mesmo critério de permissão que já usamos na tela
**/uso-apis**. Quem não é gestor só vê o número.

**Por que assim:** Fleetbase e ERPNext separam claramente **o pedido** (o que o cliente quer) da
**atribuição/dispatch** (quem leva). Misturar os dois é o que deixava a tela confusa e travada.
Cada coisa no seu lugar = menos erro para a secretária.

---

## 4. Despacho — dá para achar o pedido E o erro de confirmar foi corrigido

### 4a. Agora dá para localizar o pedido na fila
A fila de despacho tinha o mesmo problema da lista: sem cliente, difícil achar. Agora a fila mostra
**Cliente, Data prevista, Destinos resumidos, Valor e Status**, e tem **busca por cliente e destino**
igual à lista de Pedidos.

### 4b. O modal mostra o APELIDO do caminhão
No momento de despachar, o seletor de caminhão mostra **"Apelido (PLACA)"** quando o caminhão tem
apelido cadastrado (ex.: "Branquinho (ABC1D23)"); se não tiver apelido, mostra "PLACA — marca modelo".
A tabela de veículos **já tinha** o campo `apelido`, então não precisou mexer no banco para isso.
(O motorista padrão do caminhão continua sendo pré-carregado automaticamente — padrão Fleetbase/ERPNext.)

### 4c. ⭐ O ERRO AO CONFIRMAR O DESPACHO — corrigido
**O que estava acontecendo:** ao confirmar o despacho de alguns pedidos, dava erro. A causa é
técnica, mas dá para explicar: a tabela de pedidos tem uma "regra de status" no banco
(`viagens_status_check`) que só aceita as palavras no **feminino**: *agendada, em_andamento,
concluida, cancelada*. Pedidos mais antigos ficaram gravados no **masculino** ("agendado"). E o
banco **reconfere essa regra toda vez que a linha é alterada** — mesmo quando a alteração é só
colocar o caminhão/motorista. Então, ao despachar um pedido "agendado" (masculino), o banco
**barrava** a operação inteira.

**O que fiz no código (já resolve, mesmo sem mexer no banco):** ao despachar, o sistema agora
**conserta o status para a forma feminina na mesma hora** em que grava o caminhão/motorista. Assim
a regra do banco fica satisfeita e o despacho passa.

**Mensagens de erro de verdade:** se qualquer coisa der errado dali em diante, a tela agora mostra
**a mensagem real do banco** (com detalhe, dica e código do erro) em vez de um "erro" genérico —
para a gente nunca mais ficar no escuro.

**Inspiração da fila:** um quadro de fila única com filtros, simples e óbvio (Bsoft = kanban de
status; Fleetbase = Order→Assign→Dispatch com fila clara). Preferi **fila única com busca** a um
kanban com colunas, porque para uma pessoa só operando é mais rápido achar e despachar do que
arrastar cartão entre colunas. Dá para evoluir para kanban depois se a operação crescer.

---

## 5. Banco — você precisa rodar 1 SQL (opcional, mas recomendado)

O erro do despacho **já está corrigido no código** — pode usar agora. Mas é bom **limpar os dados
antigos** e deixar a regra do banco "tolerante" para nunca mais quebrar. Para isso, rode no
**SQL editor do Supabase de produção** o arquivo:

```
db/migration_despacho_status_fix.sql
```

Ele faz 2 coisas, sem risco (é idempotente, pode rodar mais de uma vez):
1. Troca os status antigos masculinos por femininos (`agendado→agendada`, etc.).
2. Recria a regra de status aceitando **os dois gêneros**, para nada mais barrar.

> Não rodei nada no seu banco — eu não tenho acesso. O SQL está pronto e comentado.

Além desse, lembrando dos 2 scripts que **já existiam** e precisam estar aplicados em produção para
o fluxo Pedido→Despacho funcionar 100% (você provavelmente já rodou, já que o "Novo Pedido" está
funcionando):
- `db/migration_entregas_despacho_nullable.sql` — deixa a entrega nascer sem caminhão/motorista/KM.
- `db/migration_pedidos_empresa_motorista.sql` — coluna usada para marcar a empresa do motorista no despacho.

---

## 6. Resumo do que ficou para depois (de propósito)

- **Paginação no servidor (100 em 100)** na lista de Pedidos e na fila de Despacho — pela sua regra
  dos 10.000+ pedidos. Não fiz agora para não reescrever o padrão de todas as listas de uma vez; a
  busca por cliente/destino já está pronta para virar busca no servidor.
- **Importar notas (XML de NFe / planilha)** — está na proposta como próximo MVP, não fazia parte
  deste pedido.
- **Indicação de locais usados em pedidos anteriores** (histórico) no Novo Pedido.
- **Kanban de status** no Despacho (hoje é fila única com busca, que é mais rápida para 1 operador).

Qualquer um desses eu encaixo quando você quiser. 🚚
