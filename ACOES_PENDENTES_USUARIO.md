# Ações Pendentes do Usuário — Roteirização MVP

> Lista das coisas que **eu (IA) não consigo fazer sozinho** e que precisam da sua mão.
> Anotadas conforme apareceram durante a execução do `PLANO_ROTEIRIZACAO.md`.
> Atualize com `✅` quando fizer.

## 🔴 Débito Técnico Crítico (Refatoração Urgente)

### 1. ⬜ Quebrar os Arquivos Monolíticos (30KB+)
**Por quê:** Arquivos gigantes atingiram um nível de acoplamento perigoso. Se continuarem crescendo, qualquer nova feature vai quebrar o código existente por excesso de re-renderização e mistura de regras.
**O que fazer:**
- **Frontend (Telas Mobile):** A tela `src/app/mobile/rota/page.tsx` (36KB) precisa ter o GPS e State Machine extraídos para Custom Hooks. O arquivo `InputEnderecoNF.tsx` (31KB) deve ter o OCR e Voz separados em pequenos componentes.
- **Frontend (Dashboard Web):** As tabelas `AcertoMensalTab.tsx` e `ManutencoesTab.tsx` (~29KB) precisam ter os forms/modais e chamadas Supabase separados da interface visual da tabela.
- **Backend:** Dividir o "God Object" `messageRouter.ts` em roteadores de domínio (ex: `entregasRouter.ts`, `avariasRouter.ts`) para manter o princípio de Responsabilidade Única.
**Impacto:** Facilidade extrema de manutenção, fim dos travamentos de interface, testes mais rápidos e prevenção do "efeito dominó".

### 2. ⬜ Cobrir os "Flows" do Bot com Testes (Pré-requisito do item 1)
**Por quê:** O arquivo `TESTING.md` mostra que quase todos os fluxos de negócios do WhatsApp (`AbastecimentoFlow`, `DespesaFlow`, `ViagemFlow`, etc.) estão com cobertura **ZERO**. Se você tentar refatorar o `messageRouter.ts` sem ter testes cobrindo os fluxos, a chance de quebrar as conversas do bot é de 100%.
**O que fazer:** Escrever testes unitários em `src/__tests__/whatsapp/flows/` simulando as mensagens do usuário e garantindo as transições de estado, conforme manda a política de testes do projeto.
**Impacto:** Segurança absoluta para mexer no código do bot. Você poderá refatorar sem medo, pois se algo quebrar, o `npm test` vai gritar na hora.

---

## 🟡 Configurações de Ambiente Pendentes

### 2. ⬜ Adicionar env vars ao `.env.local`
**Por quê:** `.env*` está no `.gitignore` (correto pra segurança), então eu não consigo editar.

**Adicione no seu `.env.local`:**
```env
# Fase 1 — sempre necessárias
VIACEP_URL=https://viacep.com.br/ws
NOMINATIM_URL=https://nominatim.openstreetmap.org

# Roteirização OSRM/VROOM
OSRM_URL=http://129.80.27.159:5000
VROOM_URL=http://129.80.27.159:3000
```



### 3c. ⬜ Rotacionar chave SSH `osrm-key.pem` (você expôs no chat — fazer quando puder)
**Por quê:** a chave privada foi colada num chat — tecnicamente está "comprometida". Pra teste/MVP tudo bem, mas antes de produção real:

```powershell
# Gerar nova
ssh-keygen -t rsa -b 4096 -f C:\Users\ronal\.ssh\osrm-key-novo -N '""'
# Adicionar a nova na VM
Get-Content C:\Users\ronal\.ssh\osrm-key-novo.pub | ssh -i C:\Users\ronal\.ssh\osrm-key.pem ubuntu@129.80.27.159 "cat >> ~/.ssh/authorized_keys"
# Testar nova chave funciona:
ssh -i C:\Users\ronal\.ssh\osrm-key-novo ubuntu@129.80.27.159 "echo OK"
# Remover a antiga da VM:
ssh -i C:\Users\ronal\.ssh\osrm-key-novo ubuntu@129.80.27.159 "grep -v '$(cat C:\Users\ronal\.ssh\osrm-key.pub)' ~/.ssh/authorized_keys > ~/.ssh/tmp && mv ~/.ssh/tmp ~/.ssh/authorized_keys"
# Apagar chave antiga local:
Remove-Item C:\Users\ronal\.ssh\osrm-key.pem, C:\Users\ronal\.ssh\osrm-key.pub
```

**Quando a VM subir, o setup é AUTOMATICO:**
1. O script PowerShell vai mostrar banner verde + IP público da VM (e salva em `C:\Users\ronal\vm_ip.txt`)
2. **Liberar portas 5000 e 3000** no painel Oracle (Networking → VCN → Security List — único passo manual que sobra)
3. Copiar o setup script pra VM:
   ```powershell
   scp -i C:\Users\ronal\.ssh\osrm-key.pem `
       C:\Users\ronal\Documents\Antigravity\SISTEMA_DE_FROTA\scripts\oracle-vm\setup_osrm.sh `
       ubuntu@<IP-DA-VM>:~/
   ```
4. SSH na VM e rodar:
   ```bash
   ssh -i ~/.ssh/osrm-key.pem ubuntu@<IP-DA-VM>
   chmod +x setup_osrm.sh && ./setup_osrm.sh
   ```
5. Esperar **~30-90 minutos** (processamento do mapa do Brasil). Script faz tudo: Docker, mapa, OSRM, VROOM, keep-alive.
6. Ao final, ele te imprime as URLs `OSRM_URL` e `VROOM_URL` — copia pro `.env.local` (item 2 acima).

**Detalhes técnicos:** veja `scripts/oracle-vm/README.md`.

## 🟡 Decisões pendentes (não bloqueia, mas você precisará revisar)

### 4. ⬜ Aquecimento do chip WhatsApp + decisão de alertas
**Por quê:** discutimos antes — chip WhatsApp novo + envio de alertas proativos = risco de banimento. Está em pausa até você decidir.

**O que decidir:** quando começar a aquecer o chip (~1-2 semanas usando como humano normal) e quando ativar alertas WhatsApp ao gestor (atualmente alertas só vão pro dashboard web).

## 🟢 Validação manual ao final do MVP

### 5. ⬜ Smoke test E2E manual da captura de notas
**Quando:** depois que o passo 1.16 (`npm test` final) estiver verde.

**Como testar:**
1. Subir o Next.js localmente: `npm run dev`
2. Abrir no celular (ou DevTools mobile view): `http://SEU-IP:3000/mobile/captura-notas?motorista_id=<UUID-de-motorista-real>&empresa_id=<UUID-de-empresa-real>&total=5`
3. Capturar 5 NFs com CEPs reais (ex: `01310100` Av Paulista)
4. Confirmar que aparecem na lista, status muda de ⏳ pra ✓
5. Verificar no Supabase Dashboard que as linhas chegaram em `notas_capturadas`

**Bloqueio se OSRM não estiver pronto:** finalizar rota vai mostrar mensagem placeholder (ok, não é erro).

---

## 🔵 Pos-MVP (Consolidacao com sistema existente)

### 6. ⬜ Integrar `estimarRota` com a página `entregas/novo`
**Status:** utilitario `src/lib/routing/estimarRota.ts` esta pronto + testado (passo 1.14).
A integracao visual com `src/app/(dashboard)/entregas/novo/page.tsx` foi **adiada**
porque:
- A tabela `entregas` existente nao tem campos `km_estimado`, `origem_lat/lng`, `destino_lat/lng`
- Mexer no schema dessa tabela quebra o principio "modulo isolado" estabelecido
- Sera feito junto com a consolidacao do banco (modulo novo + sistema atual)

**Quando consolidar:** adicionar colunas `km_estimado numeric`, `origem_coord jsonb`,
`destino_coord jsonb` em `entregas`. Chamar `estimarRota({origem, destino})` no
handler de submit da page e preencher esses campos antes do insert.

## 🚫 BLOQUEADOS — exigem decisão sua ou mudança de schema (não posso resolver sozinho)

### 7. ⬜ Telefone do cliente + botão "Ligar" no card de parada
**Bloqueio:** as tabelas `notas_capturadas` e `paradas` foram criadas SEM
campo `cliente_id` (decisão "módulo isolado" de 2026-05-27). Sem isso, não
há como associar uma parada ao registro do cliente na tabela `clientes`
(que tem telefone).

**Quando resolver:**
- Na consolidação, adicionar `cliente_id uuid REFERENCES clientes(id)` em
  `notas_capturadas`
- Captura inicial precisa identificar o cliente — pode ser por CEP+nome
  pesquisado, ou seleção manual antes de digitar

### 8. ⬜ "Salvar como padrão deste cliente" no ModalHorario (persiste em `cliente_preferencias`)
**Bloqueio:** mesma raiz do item 7. Sem `cliente_id` nas paradas, não dá
pra escrever em `cliente_preferencias` (que tem `cliente_id` como chave).

**Tabela já existe** (criada na migration de 2026-05-27) — só falta o vínculo.

### 9. ⬜ Integração visual com `entregas/novo` (km_estimado auto-preenchido)
**Bloqueio:** exige adicionar colunas em tabela existente:
- `entregas.km_estimado numeric`
- `entregas.origem_coord jsonb`
- `entregas.destino_coord jsonb`

**Utilitário pronto:** `src/lib/routing/estimarRota.ts` faz o pipeline
CEP+nº → endereço → coord → OSRM → km. Só falta o caller na página de
entregas chamar isso no submit e salvar nas novas colunas.

### 10. ⬜ Alertas WhatsApp ao gestor (Edge Function/cron + envio via bot)
**Bloqueio:** decisão sua sobre quando aquecer o chip e habilitar envio
proativo (risco de banimento — discutido em 2026-05-27).

**Hoje:** alertas vão pra tabela `alertas` via triggers — gestor vê só no
dashboard web. Pra disparar WhatsApp real ao gestor, precisa de:
1. Webhook ou cron que detecta alerta novo
2. Chamada ao `messageSender.enviarTexto(gestor_whatsapp, mensagem)`
3. Confiança que o chip está aquecido o suficiente

## ✅ Concluídas
_(Atualize aqui quando fizer cada item acima.)_
