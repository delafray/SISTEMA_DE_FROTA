import { z } from "zod";

// Enums espelhando exatamente as constraints do banco
export const VEICULO_TIPOS = ["caminhao", "van", "carro", "utilitario"] as const;
export const VEICULO_CATEGORIAS = ["toco", "truck", "bitruck", "carreta", "cavalo", "3_4"] as const;
export const VEICULO_COMBUSTIVEIS = ["diesel", "diesel_s10", "gasolina", "etanol", "flex"] as const;

export const veiculoSchema = z.object({
  placa: z.string().regex(/^[A-Z]{3}-?\d[A-Z0-9]\d{2}$/, "Placa inválida (ex: ABC-1234 ou ABC1D23)"),
  marca: z.string().min(2, "Marca obrigatória").toUpperCase(),
  modelo: z.string().min(2, "Modelo obrigatório").toUpperCase(),
  ano: z.number({ error: "Ano obrigatório" })
    .int()
    .min(1990, "Ano deve ser 1990 ou posterior")
    .max(new Date().getFullYear() + 1, "Ano inválido"),
  chassi: z.string().length(17, "Chassi deve ter 17 caracteres").toUpperCase(),
  renavam: z.string().min(9, "Renavam inválido").max(11, "Renavam inválido"),
  combustivel: z.enum(VEICULO_COMBUSTIVEIS),
  tipo: z.enum(VEICULO_TIPOS),
  // Opcionais
  categoria: z.enum(VEICULO_CATEGORIAS).optional(),
  apelido: z.string().optional(),
  cor: z.string().optional(),
  eixos: z.number().int().positive().optional(),
  capacidade_carga_kg: z.number().positive().optional(),
  pbt_kg: z.number().positive().optional(),
  capacidade_tanque: z.number().positive().optional(),
  km_atual: z.number().min(0).optional(),
  ipva_vencimento: z.string().optional(),
  licenciamento_vencimento: z.string().optional(),
  seguro_vencimento: z.string().optional(),
  seguradora: z.string().optional(),
  apolice_numero: z.string().optional(),
  data_aquisicao: z.string().optional(),
  valor_aquisicao: z.number().positive().optional(),
});

export type VeiculoInput = z.infer<typeof veiculoSchema>;
