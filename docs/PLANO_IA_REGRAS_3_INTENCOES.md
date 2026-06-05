# 🧠 PLANO — IA com 3 intenções (Pergunta / Registro / Anotar)

> **STATUS: PLANEJAMENTO. NÃO implementado.** Anotado por decisão do dono (05/06/2026).
> A IA hoje está VIRGEM (só `criar_lembrete` — ver `LEMBRETES_SEM_TRAVA.md`). Este doc
> descreve o PRÓXIMO passo: a IA passar a entender 3 intenções, todas guiadas por
> "regras" que o dono vai cadastrar. **Validar cada ponto com o dono antes de codar.**

---

## As 3 coisas que a IA tem de entender (palavras do dono)

### 1. PERGUNTA
> "busca as regras se tiver disponível atende ao usuário, se não vai sugerir mandar uma anotação"

- Usuário **quer uma informação**.
- Fluxo: classifica como pergunta → **busca nas regras**.
  - **Tem regra que responde** → responde o usuário com base na regra.
  - **Não tem regra** → **NÃO inventa**; sugere mandar uma anotação (ex: "Não tenho essa
    regra ainda. Quer que eu anote sua pergunta pra te responderem?").
- Exemplos: "qual o horário de entrega?", "posso sair mais cedo?", "quanto é a diária?".

### 2. REGISTRO
> "verifica se tem como fazer, propõe solução com base nas regras, não tem pergunta se quer anotar"

- Usuário **quer fazer / registrar algo**.
- Fluxo: classifica como registro → **verifica nas regras se tem como fazer** → **propõe a
  solução com base nas regras**. **NUNCA** pergunta "quer anotar?".
- Exemplos: "registra que o caminhão voltou", "registre a quilometragem 45000",
  "quero registrar uma despesa".

### 3. ANOTAR / LEMBRETE
> "só faça o lembrete como funciona hoje"

- Usuário **quer anotar / lembrar**.
- Fluxo: **cria o lembrete exatamente como hoje** (`criar_lembrete`). Sem mudança.
- Exemplos: "anota que preciso ligar pro cliente", "me lembra de pagar o fornecedor".

---

## Como classificar (gatilhos preliminares — a refinar)

| Intenção | Pistas |
|---|---|
| PERGUNTA | forma interrogativa, "qual/quanto/quando/quem/cadê/posso/pode", "?" |
| REGISTRO | "registra/registre", "atualiza", "quero registrar", verbo de ação sobre um dado |
| ANOTAR | "anota/anote", "lembra/me lembra/lembrete", "guarda essa nota" |

Default quando não bater em nada: tratar como ANOTAR (anota tudo — política atual sem-trava).

---

## O ponto central a decidir: ONDE ficam "as regras"?

Todo o plano gira em torno de um repositório de **regras** que a IA "busca". Hoje **não
existe**. Antes de codar, decidir:

1. **Onde**: tabela no Supabase (ex: `regras`, por empresa) é o caminho natural — o dono
   cadastra/edita pelo painel. (Alternativas: arquivo de config, mas perde edição fácil.)
2. **Formato de uma regra**: provável `{ intencao, tema/gatilho, conteudo/resposta_ou_acao }`.
3. **Como a IA "busca"**: (a) injeta as regras relevantes no prompt do Gemini a cada
   mensagem (simples, funciona pra dezenas de regras); (b) tool de busca de regra (escala
   melhor pra centenas). Começar por (a).
4. **REGISTRO — o que é "propor solução"**: por ora só TEXTO (a IA descreve o que fazer
   conforme a regra) ou já EXECUTA uma ação? MVP = só texto.

---

## É possível? SIM

- Gemini Flash classifica intenção e segue regras dadas no contexto sem problema.
- Arquitetura encaixa no que já existe: classificador de intenção (prompt) + leitura de
  regras (Supabase) + 3 ramos de comportamento. `criar_lembrete` já está pronto pro ramo 3.
- Risco principal: **confiabilidade da classificação** (separar Pergunta × Registro ×
  Anotar). Mitiga-se com prompt + exemplos claros e — principalmente — com o TESTE abaixo
  antes de ligar no bot.

---

## DÁ pra testar antes de seguir? SIM — proposta

Produção fica intacta (o bot segue em `MODO_SOMENTE_LEMBRETE`) até a gente virar a chave.

- **Fase 0 — dry-run com Gemini Flash real (custo de centavos, fora do WhatsApp):**
  script `scripts/testar_intencao.mjs` com ~20 frases variadas + 2-3 regras de exemplo.
  Imprime, por frase: intenção classificada + ramo escolhido + resposta. Serve pra VER, na
  prática, se o Flash separa as 3 intenções de forma confiável **antes** de mexer no bot.
- **Fase 1 — testes automatizados (custo zero, mockado):** unit tests do classificador e do
  matching de regras (3 ramos: pergunta-com-regra, pergunta-sem-regra, registro, anotar).
- Só depois de a classificação passar nos testes é que se liga no fluxo do WhatsApp
  (`MODO_SOMENTE_LEMBRETE=false`).

---

## Pendências pro dono decidir (o "algo mais?")

1. Onde/como cadastrar as regras (tabela no painel?).
2. Formato da regra.
3. No REGISTRO, "propor solução" = só texto (MVP) ou já executa ação?
4. Lista de frases-exemplo reais pra calibrar o classificador (quanto mais, melhor o teste).

---

## 7 buracos identificados (a decidir antes de construir)

### 🔴 Críticos (mudam o design)

**1. Permissão por intenção — "sem trava" briga com REGISTRO.**
Anotar pode ser qualquer um (já é). Mas REGISTRO **muda dados do sistema** — número
desconhecido ("mendigo do lixo") poderia alterar a frota. Isso reintroduz uma trava só pro
registro. *Sugestão: anotar = qualquer um; registro/pergunta = só número conhecido.*

**2. Pergunta sobre REGRA (estática) ≠ pergunta sobre DADO (ao vivo).**
"Qual o horário de entrega?" → resposta numa regra cadastrada. "Qual o km do leão?" → é
**dado ao vivo**, que vinha das tools REMOVIDAS (IA virgem). Hoje pergunta sobre dado da
frota **não tem resposta**. Decidir: pergunta busca só **regras (texto cadastrado)** ou
também **dados** (aí religar tools de forma controlada)?

**3. REGISTRO precisa de confirmação / é multi-etapa?**
Se o registro altera dado ("registra km 45000"), a IA executa direto ou mostra proposta e
espera "confirma"? E se faltar dado ("registra despesa" → de quanto? qual posto?), ela
conversa pra completar ou é tiro único? *Sugestão: muda dado = mostra proposta e confirma;
permitir multi-etapa.*

### 🟡 Importantes

**4. Como as regras crescem.** Pergunta sem regra → a IA sugere anotar. Essas perguntas sem
resposta deviam virar uma **fila no painel** pro dono criar a regra depois. É o motor de
evolução do sistema — sem isso a IA nunca melhora.

**5. O que NÃO é nenhuma das 3.** "Oi", "obrigado", emoji, áudio, **foto**. Áudio entra nas
3 (transcreve → classifica)? Foto de cupom = REGISTRO de despesa ou continua "manda texto"?
"Oi" cai no default (anota)? *Definir o comportamento-padrão.*

### 🟢 Menores (mas anotar)

**6. Quem cadastra/edita as regras** e se são **por empresa** (sistema é multi-empresa,
mesmo com 1 hoje). Provável: master/gestor edita pelo painel.

**7. Custo/cota.** Agora **toda mensagem** vira chamada ao Gemini (pra classificar). Já existe
sistema de cota — ligar um teto pra não estourar custo.
