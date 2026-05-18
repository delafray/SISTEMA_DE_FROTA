import { z } from "zod";

export const motoristaSchema = z.object({
  nome: z.string().min(3, "O nome deve ter no mínimo 3 caracteres").toUpperCase(),
  cpf: z.string().regex(/^\d{3}\.\d{3}\.\d{3}-\d{2}$/, "CPF inválido"),
  cnh: z.string().min(5, "CNH inválida"),
  cnh_categoria: z.string().min(1, "Categoria obrigatória").toUpperCase(),
  cnh_vencimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
  telefone: z.string().min(10, "Telefone inválido"),
  status: z.enum(["ATIVO", "INATIVO"]),
});

export type MotoristaData = z.infer<typeof motoristaSchema>;
