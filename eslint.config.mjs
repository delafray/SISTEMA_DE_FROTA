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
  ]),
]);

export default eslintConfig;
