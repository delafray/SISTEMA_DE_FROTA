# REGRAS OBRIGATÓRIAS — SISTEMA DE GESTÃO DE FROTA

> **Leia este arquivo ANTES de qualquer ação. Estas regras são invioláveis.**

---

## 🔴 REGRA Nº 1 — SEGURANÇA DE ESCOPO (CRÍTICA)

**NUNCA, JAMAIS, DE JEITO NENHUM**, você pode ler, editar, criar, mover, copiar ou manipular qualquer arquivo que esteja **FORA** da pasta raiz deste projeto:

```
C:\Users\ronal\Documents\Antigravity\SISTEMA_DE_FROTA\
```

Seu escopo de atuação é **estritamente limitado** a este diretório e suas subpastas.

### O que é PROIBIDO:
- ❌ Acessar arquivos em `RBARROS-Galeria-Repositorio-SISTEMARB` (mesmo que esteja dentro desta pasta, é apenas referência — **nunca editar**)
- ❌ Acessar arquivos em qualquer outra pasta fora de `SISTEMA_DE_FROTA`
- ❌ Ler `.env` ou arquivos de credenciais de outros projetos
- ❌ Usar as chaves do Supabase conectadas a outros projetos

### O que é PERMITIDO:
- ✅ Ler arquivos de `RBARROS-Galeria-Repositorio-SISTEMARB` **apenas para consulta de padrões de código** (referência visual/técnica), nunca para editar
- ✅ Criar, editar e excluir arquivos dentro de `SISTEMA_DE_FROTA`
- ✅ Usar o MCP do Supabase **apenas** com o projeto ID do SISTEMA DE FROTA

### Se você perceber que está prestes a acessar algo fora do escopo:
1. **PARE imediatamente**
2. Informe o usuário
3. Aguarde instrução antes de continuar

---

## 🔴 REGRA Nº 2 — SUPABASE MCP

O MCP do Supabase está conectado. Antes de qualquer operação no banco:

- **Verifique** o `project_id` — ele deve ser o do **SISTEMA DE FROTA**, não de outros projetos
- **NUNCA** execute DDL destrutivo (DROP TABLE, TRUNCATE) sem confirmação explícita do usuário
- **SEMPRE** use `apply_migration` para DDL e `execute_sql` apenas para consultas

---

## 🔴 REGRA Nº 3 — CLOUDFLARE R2

As credenciais do R2 do Sistema de Frota são **exclusivas deste projeto**.

- Bucket do Sistema de Frota: definido em `.env.local` (variável `R2_BUCKET_NAME`)
- **NUNCA** usar credenciais de outros projetos

---

## 🟡 REGRA Nº 4 — PADRÕES DE DESENVOLVIMENTO

Todo o código desenvolvido neste projeto **DEVE** seguir os padrões documentados em:

```
PLANO_DE_PROJETO.md → Seção 8 (Identidade Visual e Padrões de Frontend)
```

### Resumo dos padrões obrigatórios:
- **Framework:** Next.js 14+ (App Router) + React + TailwindCSS
- **Sidebar:** cor `#313f50`, largura `w-56`
- **Labels:** `text-[10px] font-black uppercase tracking-widest`
- **Inputs:** `rounded-none`, `border-2`, `focus:border-blue-600`
- **Botão primário:** sombra neobrutalist `shadow-[4px_4px_0px_#1e3a8a]`
- **Botão de destaque/backup:** `bg-amber-500`
- **Listagens:** tabelas densas no desktop, cards empilhados no mobile
- **Busca:** hook customizado `useFilters`, filtragem reativa no frontend
- **Backup:** `jszip` + `file-saver`, 40 downloads paralelos, modal de progresso

---

## 🟡 REGRA Nº 5 — FLUXO DE TRABALHO

1. **Sempre leia o `PLANO_DE_PROJETO.md`** antes de iniciar uma nova fase
2. **Nunca pule etapas** — siga a ordem: GitHub → Supabase → Vercel → Sentry → código
3. **Documente decisões** atualizando o `PLANO_DE_PROJETO.md`
4. **Confirme com o usuário** antes de qualquer ação destrutiva ou irreversível
5. **Não inicie uma fase nova** sem aprovação explícita do usuário

---

## 🟡 REGRA Nº 6 — ARQUIVOS SENSÍVEIS

- `.env.local` **nunca** vai para o Git (já no `.gitignore`)
- Chaves de API **nunca** aparecem em logs, comentários ou respostas
- `SUPABASE_SERVICE_ROLE_KEY` **nunca** é exposta no lado cliente

---

## 📋 REFERÊNCIA RÁPIDA — ESTRUTURA DO PROJETO

```
SISTEMA_DE_FROTA/               ← RAIZ — ÚNICO ESCOPO PERMITIDO
├── CLAUDE.md                   ← Este arquivo (regras)
├── PLANO_DE_PROJETO.md         ← Guia completo do projeto
├── .env.local                  ← Credenciais (não vai ao Git)
├── app/                        ← Next.js App Router
│   ├── (auth)/login/
│   ├── (dashboard)/
│   └── api/whatsapp/webhook/
├── components/
├── lib/
│   ├── supabase/
│   ├── r2/
│   └── whatsapp/flows/
├── services/
│   ├── aiService.ts
│   ├── backupService.ts
│   └── alertService.ts
├── types/
└── supabase/migrations/

RBARROS-Galeria-Repositorio-SISTEMARB/   ← REFERÊNCIA APENAS — NÃO EDITAR
```

---

## ✅ CHECKLIST ANTES DE CADA AÇÃO

Antes de ler ou editar qualquer arquivo, verifique:

- [ ] O arquivo está dentro de `C:\Users\ronal\Documents\Antigravity\SISTEMA_DE_FROTA\`?
- [ ] Se for operação no Supabase, o `project_id` é o correto do Sistema de Frota?
- [ ] Se for ação destrutiva, o usuário confirmou explicitamente?

Se alguma resposta for **NÃO** → **PARE e informe o usuário.**

---

*Criado em 2026-05-18. Este arquivo é a primeira lei deste projeto.*
