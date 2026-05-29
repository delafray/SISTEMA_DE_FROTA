# Ações Pendentes do Usuário — Roteirização MVP

> Lista das coisas que **eu (IA) não consigo fazer sozinho** e que precisam da sua mão.
> Anotadas conforme apareceram durante a execução do `PLANO_ROTEIRIZACAO.md`.
> Atualize com `✅` quando fizer.

## 🔴 Bloqueadores futuros (precisará antes do MVP rodar em produção)

### 1. ⬜ Resolver credenciais Git no Windows
**Por quê:** o Git Credential Manager está com a conta errada (`SistemaDeFotosRbarros`) cacheada. Pushes pra `delafray/SISTEMA_DE_FROTA` estão falhando com 403.

**Como:**
1. Abra **Painel de Controle → Gerenciador de Credenciais** (ou `control /name Microsoft.CredentialManager`)
2. Em **Credenciais do Windows**, procure `git:https://github.com`
3. **Remova** essa entrada
4. Próximo `git push` vai prompt fresh — escolha conta `delafray`

**Impacto enquanto não resolver:** commits locais funcionam, mas o remote não recebe o trabalho — outra IA continuando sem o repo atualizado ficaria perdida.

### 2. ⬜ Adicionar env vars ao `.env.local`
**Por quê:** `.env*` está no `.gitignore` (correto pra segurança), então eu não consigo editar.

**Adicione no seu `.env.local`:**
```env
# Fase 1 — sempre necessárias
VIACEP_URL=https://viacep.com.br/ws
NOMINATIM_URL=https://nominatim.openstreetmap.org

# Preencher DEPOIS de provisionar Oracle (item 3 abaixo)
OSRM_URL=
VROOM_URL=
```

### 3. ✅ Provisionar Oracle Cloud VM + subir OSRM + VROOM **(✅ feito 2026-05-29)**
**Status:** VM em produção (`129.80.27.159`, US-ASHBURN-AD-2, 4 OCPU/24GB/146GB ARM). OSRM + VROOM via systemd, iptables aberto, keep-alive cron 4h. Auditado (HTTP 200, latência <500ms, SP→Campinas 93.2km). Detalhes: `relatorio_status.md` na VM e Etapa 2 do plano.

---

### 3b. ⬜ Adicionar OSRM_URL e VROOM_URL no `.env.local` **(novo passo — 30 segundos)**
Adicione ao seu `C:\Users\ronal\Documents\Antigravity\SISTEMA_DE_FROTA\.env.local`:
```env
OSRM_URL=http://129.80.27.159:5000
VROOM_URL=http://129.80.27.159:3000
```

Aí o passo 6 do MVP (`/api/routing/otimizar`) começa a funcionar em produção.

---

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

## ✅ Concluídas
_(Nada ainda — atualize aqui quando fizer cada item acima.)_
