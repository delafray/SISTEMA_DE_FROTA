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

### 3. ⬜ Provisionar Oracle Cloud VM + subir OSRM + VROOM
**Por quê:** o cálculo de rota (OSRM) e otimização (VROOM) precisam da VM Oracle rodando. Sem isso, os passos 1.7+ funcionam em testes (mocks) mas não em produção.

**Quanto tempo demora:** 1-3 dias (Oracle "Out of Capacity" em SP é problema real).

**Como fazer:** seguir `ORACLE_CLOUD_SETUP.md` + `PLANO_ROTEIRIZACAO.md` Etapa 2 (1.1 → 2.9). Roda em paralelo enquanto eu codo Fase 1.

**Quando terminar:** preencher `OSRM_URL` e `VROOM_URL` no `.env.local` (item 2).

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
