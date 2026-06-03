import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Há ~30 ocorrências de `any` no projeto, principalmente em queries
      // do Supabase tipadas só parcialmente. Manter como aviso até refatorar.
      "@typescript-eslint/no-explicit-any": "warn",
      // Convenção do projeto: prefixo `_` = "intencionalmente não usado"
      // (args de callback exigidos pela assinatura, erros de catch ignorados, etc.).
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Sub-repositório aninhado — projeto separado, com lint próprio.
    "RBARROS-Galeria-Repositorio-SISTEMARB/**",
    // Worktrees de agentes Claude.
    ".claude/**",
    // Arquivos minificados de terceiros (Tesseract WASM) — não lintados.
    "public/tesseract/**",
  ]),
]);

export default eslintConfig;
