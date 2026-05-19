import { z } from "zod";

// Enums espelhando exatamente as constraints do banco
export const MOTORISTA_CNH_CATEGORIAS = ["A", "B", "C", "D", "E", "AB", "AC", "AD", "AE"] as const;
export const MOTORISTA_TIPO_COMISSAO = [
  "salario_fixo", "percentual_frete", "valor_fixo_viagem", "valor_por_km",
  "salario_mais_percentual", "salario_mais_km"
] as const;

export const motoristaSchema = z.object({
  nome: z.string().min(3, "O nome deve ter no mínimo 3 caracteres").toUpperCase(),
  cpf: z.string().min(11, "CPF inválido"),
  whatsapp: z.string().min(12, "WhatsApp inválido (incluir DDI 55)"), // banco: ^\d{12,13}$
  cnh_numero: z.string().min(11, "CNH deve ter 11 dígitos"),
  cnh_categoria: z.enum(MOTORISTA_CNH_CATEGORIAS),
  cnh_validade: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida (YYYY-MM-DD)"),
  tipo_comissao: z.enum(MOTORISTA_TIPO_COMISSAO),
  // Opcionais
  rg: z.string().optional(),
  data_nascimento: z.string().optional(),
  email: z.string().email("E-mail inválido").optional().or(z.literal("")),
  data_admissao: z.string().optional(),
  cargo: z.string().optional(),
  cnh_primeira_habilitacao: z.string().optional(),
  cnh_ear: z.boolean().optional(),
  salario_fixo: z.number().min(0).optional(),
  percentual_frete: z.number().min(0).max(100).optional(),
  valor_fixo_por_viagem: z.number().min(0).optional(),
  valor_por_km: z.number().min(0).optional(),
  cep: z.string().optional(),
  logradouro: z.string().optional(),
  numero: z.string().optional(),
  complemento: z.string().optional(),
  bairro: z.string().optional(),
  cidade: z.string().optional(),
  uf: z.string().length(2).optional(),
});

export type MotoristaInput = z.infer<typeof motoristaSchema>;
