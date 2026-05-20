<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:mandatory-testing-rule -->
# ⚠️ REGRA OBRIGATÓRIA — TESTES AO FIM DE CADA CICLO

**LEIA `TESTING.md` ANTES DE QUALQUER ALTERAÇÃO.**

Esta regra vale para **TODAS as IAs** (Claude, Gemini, GPT, Cursor, Windsurf, Antigravity, Cline, Cody, qualquer outra):

1. Toda mudança de código exige **teste novo ou atualizado**.
2. Antes de finalizar a tarefa, rodar `npm test` e ver **todos passarem**.
3. Reportar ao usuário o resultado da suíte (X passaram, Y falharam).
4. **Sem testes = trabalho não concluído.** O dono do projeto rejeita entregas sem testes.

Áreas com cobertura faltando estão listadas em `TESTING.md`. Comece por elas se for trabalhar nessas funcionalidades.

Anexe sua execução no "Log de Execução" no final de `TESTING.md`.
<!-- END:mandatory-testing-rule -->
