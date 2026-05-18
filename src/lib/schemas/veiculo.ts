import { z } from "zod";

export const veiculoSchema = z.object({
  placa: z.string().regex(/^[A-Z]{3}-\d[A-Z0-9]\d{2}$/, "Placa no formato Mercosul (ABC-1D23) ou antigo (ABC-1234)"),
  marca: z.string().min(2, "Marca obrigatória").toUpperCase(),
  modelo: z.string().min(2, "Modelo obrigatório").toUpperCase(),
  ano: z.string().regex(/^\d{4}$/, "Ano inválido"),
  cor: z.string().min(2, "Cor obrigatória").toUpperCase(),
  renavam: z.string().min(9, "Renavam inválido"),
  capacidade_kg: z.number().positive("Capacidade deve ser maior que zero"),
  status: z.enum(["ATIVO", "MANUTENCAO", "INATIVO"]),
});

export type VeiculoData = z.infer<typeof veiculoSchema>;
