import { z } from "zod";

// Enums espelhando as constraints reais do banco
export const CLIENTE_TIPO_PESSOA = ["fisica", "juridica"] as const;
export const CLIENTE_FORMA_PAGAMENTO = ["a_vista", "7d", "14d", "21d", "30d", "45d", "60d", "outros"] as const;

export const clienteSchema = z.object({
  nome_fantasia: z.string().min(2, "Nome fantasia obrigatório").toUpperCase(),
  documento: z.string().min(11, "CPF ou CNPJ obrigatório"), // campo correto no banco (não cnpj_cpf)
  tipo_pessoa: z.enum(CLIENTE_TIPO_PESSOA),
  // Opcionais
  razao_social: z.string().optional(),
  inscricao_estadual: z.string().optional(),
  contato_nome: z.string().optional(),
  telefone: z.string().optional(),
  email: z.string().email("E-mail inválido").optional().or(z.literal("")),
  cep: z.string().optional(),
  logradouro: z.string().optional(),
  numero: z.string().optional(),
  complemento: z.string().optional(),
  bairro: z.string().optional(),
  cidade: z.string().optional(),
  uf: z.string().length(2).optional(),
  forma_pagamento_padrao: z.enum(CLIENTE_FORMA_PAGAMENTO).optional(),
  observacoes: z.string().optional(),
});

export type ClienteInput = z.infer<typeof clienteSchema>;
