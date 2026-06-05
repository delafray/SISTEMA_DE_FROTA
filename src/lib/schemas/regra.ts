import { z } from "zod";

// Tipos de regra (intenção). Ver docs/MOTOR_REGRAS_ARQUITETURA.md.
export const REGRA_TIPOS = ["consultar", "registrar", "anotar"] as const;
export type RegraTipo = (typeof REGRA_TIPOS)[number];

export const REGRA_TIPO_LABEL: Record<RegraTipo, string> = {
  consultar: "Consultar",
  registrar: "Registrar",
  anotar: "Anotar",
};

// Quem pode disparar a regra. "qualquer" = sem trava (qualquer número).
export const REGRA_PUBLICOS = ["qualquer", "motorista", "gestor", "master"] as const;
export type RegraPublico = (typeof REGRA_PUBLICOS)[number];

export const regraSchema = z.object({
  nome: z.string().min(2, "O nome deve ter no mínimo 2 caracteres"),
  tipo: z.enum(REGRA_TIPOS),
  ativa: z.boolean().default(true),
  fixa: z.boolean().default(false),
  prioridade: z.number().int().default(0),
  // GATILHOS: palavras que disparam a regra (a primeira palavra no contexto).
  // Ex: "anota", "lembrete", "me lembra". Disparo direto/determinístico.
  gatilhos: z.array(z.string().min(1)).default([]),
  // Frases-exemplo: exemplos completos pra treino do classificador.
  frases_exemplo: z.array(z.string().min(1)).default([]),
  // Frases que NÃO devem disparar (evita falso-positivo).
  frases_negativas: z.array(z.string().min(1)).default([]),
  // Vazio = todas as empresas (sem trava). Multi-select opcional.
  empresas_alvo: z.array(z.string().uuid()).default([]),
  quem_pode_disparar: z.array(z.enum(REGRA_PUBLICOS)).default(["qualquer"]),
  // Consultar (MVP): resposta estática.
  resposta: z.string().optional().or(z.literal("")),
  exige_confirmacao: z.boolean().default(false),
  observacao: z.string().optional().or(z.literal("")),
});

export type RegraInput = z.infer<typeof regraSchema>;
