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

// AÇÕES atômicas que uma regra pode ter. A célula da matriz cicla SÓ por estas.
// consultar = lê · alterar = modifica existente · registrar = cria novo.
export const ACOES = ["consultar", "alterar", "registrar"] as const;
export type Acao = (typeof ACOES)[number];
export const ACAO_LABEL: Record<Acao, string> = { consultar: "Consultar", alterar: "Alterar", registrar: "Registrar" };

// Presets de acesso pro cadastro (o que a regra PODE fazer).
export const PRESETS_ACESSO: { key: string; label: string; acoes: Acao[]; tipo: RegraTipo }[] = [
  { key: "anotar",       label: "Anotar (lembrete)",                acoes: [],                                    tipo: "anotar" },
  { key: "consultar",    label: "Consultar",                        acoes: ["consultar"],                         tipo: "consultar" },
  { key: "alterar",      label: "Alterar",                          acoes: ["alterar"],                           tipo: "registrar" },
  { key: "registrar",    label: "Registrar",                        acoes: ["registrar"],                         tipo: "registrar" },
  { key: "cons_alt",     label: "Consultar + Alterar",              acoes: ["consultar", "alterar"],              tipo: "registrar" },
  { key: "cons_reg",     label: "Consultar + Registrar",            acoes: ["consultar", "registrar"],            tipo: "registrar" },
  { key: "alt_reg",      label: "Alterar + Registrar",              acoes: ["alterar", "registrar"],              tipo: "registrar" },
  { key: "cons_alt_reg", label: "Consultar + Alterar + Registrar",  acoes: ["consultar", "alterar", "registrar"], tipo: "registrar" },
];

// Ordena as ações na sequência canônica (consultar → alterar → registrar).
export function ordenarAcoes(acoes: string[]): Acao[] {
  return ACOES.filter((a) => acoes.includes(a));
}

// Descobre qual preset corresponde a um conjunto de ações (pra preencher o select ao editar).
export function presetDeAcoes(acoes: string[], tipo: string): string {
  if (tipo === "anotar" || acoes.length === 0) return "anotar";
  const set = ordenarAcoes(acoes);
  const p = PRESETS_ACESSO.find((x) => x.acoes.length === set.length && x.acoes.every((a) => set.includes(a)));
  return p?.key ?? "consultar";
}

export const regraSchema = z.object({
  nome: z.string().min(2, "O nome deve ter no mínimo 2 caracteres"),
  tipo: z.enum(REGRA_TIPOS),
  // O que a regra PODE fazer (a célula da matriz cicla só por estas). Vazio = anotar.
  acoes: z.array(z.enum(ACOES)).default([]),
  ativa: z.boolean().default(true),
  fixa: z.boolean().default(false),
  prioridade: z.number().int().default(0),
  // GATILHOS: palavras que disparam a regra (a primeira palavra no contexto).
  // Ex: "anota", "lembrete", "me lembra". Disparo direto/determinístico.
  gatilhos: z.array(z.string().min(1)).default([]),
  // Quando true: a regra SÓ é considerada se a mensagem COMEÇAR com um gatilho.
  // Ex: Lembrete só dispara se a frase começar com "lembrete". Evita "passar por cima".
  gatilho_inicio: z.boolean().default(false),
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
