import { z } from "zod";

export const clienteSchema = z.object({
  razao_social: z.string().min(3, "Razão Social/Nome obrigatório").toUpperCase(),
  nome_fantasia: z.string().optional(),
  cnpj_cpf: z.string().min(14, "Documento inválido"), // Pode ser refinado com regex de CPF/CNPJ
  email: z.string().email("E-mail inválido").toLowerCase(),
  telefone: z.string().min(10, "Telefone inválido"),
  cep: z.string().regex(/^\d{5}-\d{3}$/, "CEP inválido"),
  endereco: z.string().min(5, "Endereço obrigatório").toUpperCase(),
  numero: z.string().min(1, "Número obrigatório"),
  complemento: z.string().optional().toUpperCase(),
  bairro: z.string().min(2, "Bairro obrigatório").toUpperCase(),
  cidade: z.string().min(2, "Cidade obrigatória").toUpperCase(),
  uf: z.string().length(2, "UF inválida").toUpperCase(),
  status: z.enum(["ATIVO", "INATIVO"]),
});

export type ClienteData = z.infer<typeof clienteSchema>;
