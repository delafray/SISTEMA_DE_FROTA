/**
 * Classificador de intenção — MODO SEGURO.
 * Recebe a mensagem + as regras que aquele telefone PODE usar (do contexto) e
 * decide quais regras a mensagem dispara. NÃO executa nada — só classifica.
 * Usa Gemini Flash com structured output (JSON garantido por schema).
 */

import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { createLogger } from "@/lib/logger";

const log = createLogger("classificador");
const MODELO = "gemini-2.5-flash";

export type RegraClassif = { id: string; nome: string; tipo: string; gatilhos: string[]; frases_exemplo: string[] };
// alvo = veículo citado (apelido/placa); valor = número citado (ex: km novo). Ambos opcionais.
export type Decisao = { regras: string[]; raciocinio: string; alvo?: string | null; valor?: number | null };

export async function classificar(mensagem: string, regras: RegraClassif[], contextoGlobal = ""): Promise<Decisao> {
  if (regras.length === 0) return { regras: [], raciocinio: "Nenhuma regra disponível para este telefone." };

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY não configurada");
  const client = new GoogleGenerativeAI(apiKey);

  const lista = regras
    .map((r) => `- "${r.nome}" (${r.tipo}) · gatilhos: ${r.gatilhos.join(", ") || "—"} · exemplos: ${r.frases_exemplo.slice(0, 3).join(" / ") || "—"}`)
    .join("\n");

  const prompt =
`Você classifica a mensagem de um usuário do WhatsApp contra uma lista de regras.
${contextoGlobal ? `\nCONTEXTO DO SISTEMA (ajuda a entender a mensagem):\n${contextoGlobal}\n` : ""}
MENSAGEM:
"${mensagem}"

REGRAS DISPONÍVEIS (só estas — o usuário só pode usar estas):
${lista}

Decida QUAIS regras a mensagem dispara, pelos gatilhos E pelo sentido. Pode ser:
- nenhuma (lista vazia),
- uma (a mais adequada),
- VÁRIAS, quando a mensagem é genuinamente ambígua e casa com mais de uma.
Responda os NOMES EXATOS das regras (como estão entre aspas acima).

Extraia também (se houver na mensagem):
- "alvo": o veículo citado pelo APELIDO ou PLACA (ex: "leão", "ABC1D23"). Vazio se não citar.
- "valor": um número relevante citado, como uma quilometragem nova (ex: 160000). Vazio se não houver.`;

  const model = client.getGenerativeModel({
    model: MODELO,
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: SchemaType.OBJECT,
        properties: {
          regras: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING }, description: "nomes exatos das regras que a mensagem dispara" },
          raciocinio: { type: SchemaType.STRING, description: "1 frase explicando a decisão" },
          alvo: { type: SchemaType.STRING, nullable: true, description: "veículo citado (apelido ou placa), ou vazio" },
          valor: { type: SchemaType.NUMBER, nullable: true, description: "número relevante citado (ex: km novo), ou vazio" },
        },
        required: ["regras", "raciocinio"],
      },
      temperature: 0,
      // @ts-expect-error thinkingConfig é repassado direto ao REST pelo SDK legado
      thinkingConfig: { thinkingBudget: 0 },
    },
  });

  try {
    const res = await model.generateContent(prompt);
    const txt = res.response.text();
    const parsed = JSON.parse(txt) as Decisao;
    // normaliza: só mantém regras que existem na lista (casa por nome, case-insensitive)
    const validos = new Map(regras.map((r) => [r.nome.toLowerCase(), r.nome]));
    const regrasOk = (parsed.regras ?? []).map((n) => validos.get(String(n).toLowerCase())).filter((x): x is string => !!x);
    const alvo = parsed.alvo && String(parsed.alvo).trim() ? String(parsed.alvo).trim() : null;
    const valor = typeof parsed.valor === "number" && Number.isFinite(parsed.valor) ? parsed.valor : null;
    return { regras: regrasOk, raciocinio: parsed.raciocinio ?? "", alvo, valor };
  } catch (e) {
    log.error("classificar_erro", { message: e instanceof Error ? e.message : String(e) });
    return { regras: [], raciocinio: "Erro ao classificar." };
  }
}
