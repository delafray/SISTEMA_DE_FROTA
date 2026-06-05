<!-- BEGIN:project-knowledge-base -->
# 📚 Documentação centralizada: `framework/INDEX.md`

Antes de pesquisar o projeto, **leia [`framework/INDEX.md`](framework/INDEX.md)**. Toda a documentação está organizada lá: arquitetura do bot, como adicionar tools, APIs, deploy, testes, bugs conhecidos.
<!-- END:project-knowledge-base -->

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:mandatory-testing-rule -->
# 🧪 TESTES — RECOMENDADO (não obrigatório)

O dono do projeto **relaxou** a exigência de testes (antes obrigatória). Regra atual:

1. Criar/atualizar testes é **recomendado**, não exigido pra concluir uma tarefa.
2. Rodar `npm test` é **recomendado** antes de mudanças grandes/de risco — **NÃO** a cada microalteração (o dono achou isso chato e improdutivo).
3. Se rodar, reportar o resultado. Se não rodar, tudo bem.

`npm test` roda local + mockado → custo de API zero. Áreas sem cobertura ainda estão em `TESTING.md` se quiser priorizar.
<!-- END:mandatory-testing-rule -->
