import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ParsedMessage } from "@/lib/whatsapp/messageParser";
import type { Sessao } from "@/lib/whatsapp/sessionManager";

// ─── MOCKS ──────────────────────────────────────────────────────────────

vi.mock("@/lib/whatsapp/messageSender", () => ({
  enviarTexto: vi.fn().mockResolvedValue(true),
  enviarBotoes: vi.fn().mockResolvedValue(true),
  enviarMenuTexto: vi.fn().mockResolvedValue(true),
  formatarMenuTexto: vi.fn(() => ""),
}));

vi.mock("@/lib/whatsapp/menuHelper", () => ({
  enviarMenuBotoes: vi.fn().mockResolvedValue(true),
  enviarMenuLista: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/whatsapp/sessionManager", () => ({
  updateSession: vi.fn().mockResolvedValue(undefined),
  resetToMenu: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/services/aiService", () => ({
  lerOdometro: vi.fn(),
}));

vi.mock("@/lib/whatsapp/messageParser", async () => {
  const actual = await vi.importActual<typeof import("@/lib/whatsapp/messageParser")>(
    "@/lib/whatsapp/messageParser"
  );
  return {
    ...actual,
    getMediaUrl: vi.fn(),
  };
});

const supabaseInsertMock = vi.fn();
const supabaseMaybeSingleMock = vi.fn().mockResolvedValue({ data: null });
const supabaseEqMock = vi.fn(() => ({ eq: supabaseEqMock, maybeSingle: supabaseMaybeSingleMock }));
const supabaseSelectMock = vi.fn(() => ({ eq: supabaseEqMock }));
const supabaseFromMock = vi.fn(() => ({
  select: supabaseSelectMock,
  insert: supabaseInsertMock,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({ from: supabaseFromMock })),
}));

// ─── IMPORTS após mocks ─────────────────────────────────────────────────

import { processarKmFlow } from "@/lib/whatsapp/flows/kmFlow";
import { enviarTexto } from "@/lib/whatsapp/messageSender";
import { enviarMenuBotoes } from "@/lib/whatsapp/menuHelper";
import { updateSession } from "@/lib/whatsapp/sessionManager";
import { lerOdometro } from "@/services/aiService";
import { getMediaUrl } from "@/lib/whatsapp/messageParser";

// ─── HELPERS ────────────────────────────────────────────────────────────

function makeSessao(overrides: Partial<Sessao> = {}): Sessao {
  return {
    id: "sessao-1",
    motorista_id: "motorista-1",
    empresa_id: "empresa-1",
    telefone_whatsapp: "5531999990000",
    estado: "aguardando_foto_km",
    contexto: { veiculo_id: "veiculo-1" },
    fluxo_atual: "km",
    expira_em: new Date(Date.now() + 600_000).toISOString(),
    ...overrides,
  } as Sessao;
}

function makeMsg(overrides: Partial<ParsedMessage> = {}): ParsedMessage {
  return {
    from: "5531999990000",
    tipo: "texto",
    texto: "",
    ...overrides,
  } as ParsedMessage;
}

beforeEach(() => {
  vi.clearAllMocks();
  supabaseInsertMock.mockResolvedValue({ error: null });
  supabaseMaybeSingleMock.mockResolvedValue({ data: null });
});

// ─── TESTES ─────────────────────────────────────────────────────────────

describe("kmFlow — aguardando_foto_km", () => {
  it("aceita digitação direta de número quando usuário manda texto numérico", async () => {
    const msg = makeMsg({ tipo: "texto", texto: "125430" });
    const sessao = makeSessao({ estado: "aguardando_foto_km" });

    await processarKmFlow(msg, sessao);

    expect(supabaseInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ km_lido: 125430 })
    );
  });

  it("pede foto ou digitação quando recebe texto não-numérico", async () => {
    const msg = makeMsg({ tipo: "texto", texto: "bom dia" });
    const sessao = makeSessao({ estado: "aguardando_foto_km" });

    await processarKmFlow(msg, sessao);

    expect(enviarTexto).toHaveBeenCalledWith(
      msg.from,
      expect.stringContaining("foto do painel")
    );
    expect(supabaseInsertMock).not.toHaveBeenCalled();
  });

  it("pede foto quando recebe mídia que não é foto", async () => {
    const msg = makeMsg({ tipo: "audio" });
    const sessao = makeSessao({ estado: "aguardando_foto_km" });

    await processarKmFlow(msg, sessao);

    expect(enviarTexto).toHaveBeenCalledWith(
      msg.from,
      expect.stringContaining("foto clara")
    );
  });

  it("chama IA quando recebe foto e mostra botões se confiança alta", async () => {
    vi.mocked(getMediaUrl).mockResolvedValue("https://meta.media/painel.jpg");
    vi.mocked(lerOdometro).mockResolvedValue({
      ok: true,
      data: { km: 125430, confianca: 95, observacao: "" },
    });

    const msg = makeMsg({ tipo: "foto", mediaId: "media-1" });
    const sessao = makeSessao({ estado: "aguardando_foto_km" });

    await processarKmFlow(msg, sessao);

    expect(enviarMenuBotoes).toHaveBeenCalledWith(
      sessao.id,
      msg.from,
      expect.stringContaining("125.430"),
      expect.arrayContaining([
        expect.objectContaining({ id: "km_confirmar" }),
        expect.objectContaining({ id: "km_digitar" }),
      ])
    );
    expect(updateSession).toHaveBeenCalledWith(
      sessao.id,
      expect.objectContaining({ estado: "aguardando_confirmacao_km" })
    );
  });

  it("pede digitação manual quando IA tem confiança baixa", async () => {
    vi.mocked(getMediaUrl).mockResolvedValue("https://meta.media/painel.jpg");
    vi.mocked(lerOdometro).mockResolvedValue({
      ok: true,
      data: { km: 125430, confianca: 60, observacao: "" },
    });

    const msg = makeMsg({ tipo: "foto", mediaId: "media-1" });
    const sessao = makeSessao({ estado: "aguardando_foto_km" });

    await processarKmFlow(msg, sessao);

    expect(enviarTexto).toHaveBeenCalledWith(
      msg.from,
      expect.stringContaining("60%")
    );
    expect(updateSession).toHaveBeenCalledWith(
      sessao.id,
      expect.objectContaining({ estado: "aguardando_km_manual" })
    );
  });

  it("cai em fallback manual quando IA falha", async () => {
    vi.mocked(getMediaUrl).mockResolvedValue("https://meta.media/painel.jpg");
    vi.mocked(lerOdometro).mockResolvedValue({
      ok: false,
      fallbackManual: true,
      motivo: "api_error",
    });

    const msg = makeMsg({ tipo: "foto", mediaId: "media-1" });
    const sessao = makeSessao({ estado: "aguardando_foto_km" });

    await processarKmFlow(msg, sessao);

    expect(updateSession).toHaveBeenCalledWith(
      sessao.id,
      expect.objectContaining({ estado: "aguardando_km_manual" })
    );
  });

  it("cai em fallback quando download da mídia falha", async () => {
    vi.mocked(getMediaUrl).mockResolvedValue(null);

    const msg = makeMsg({ tipo: "foto", mediaId: "media-1" });
    const sessao = makeSessao({ estado: "aguardando_foto_km" });

    await processarKmFlow(msg, sessao);

    expect(enviarTexto).toHaveBeenCalledWith(
      msg.from,
      expect.stringContaining("Não consegui baixar")
    );
    expect(updateSession).toHaveBeenCalledWith(
      sessao.id,
      expect.objectContaining({ estado: "aguardando_km_manual" })
    );
  });
});

describe("kmFlow — aguardando_confirmacao_km", () => {
  it("salva KM quando usuário clica em confirmar", async () => {
    const sessao = makeSessao({
      estado: "aguardando_confirmacao_km",
      contexto: { veiculo_id: "veiculo-1", km_lido: 125430, km_confianca: 95 },
    });
    const msg = makeMsg({ tipo: "botao", botaoId: "km_confirmar" });

    await processarKmFlow(msg, sessao);

    expect(supabaseInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ km_lido: 125430 })
    );
  });

  it("ao confirmar leitura da IA, persiste ia_confianca e ia_raw_response (origem ia_confirmado)", async () => {
    const sessao = makeSessao({
      estado: "aguardando_confirmacao_km",
      contexto: {
        veiculo_id: "veiculo-1",
        km_lido: 125430,
        km_confianca: 95,
        foto_url: "https://meta.media/painel.jpg",
      },
    });
    const msg = makeMsg({ tipo: "botao", botaoId: "km_confirmar" });

    await processarKmFlow(msg, sessao);

    expect(supabaseInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        km_lido: 125430,
        ia_confianca: 95,
        ia_raw_response: JSON.stringify({ km_lido: 125430, confianca: 95 }),
        foto_urls: ["https://meta.media/painel.jpg"],
      })
    );
  });

  it("correção numérica via texto NÃO herda metadados da IA do contexto (origem manual)", async () => {
    // O motorista rejeitou a leitura da IA (125430/95% ainda no contexto) e digitou
    // outro valor — o registro manual não pode carregar a confiança/raw descartados.
    const sessao = makeSessao({
      estado: "aguardando_confirmacao_km",
      contexto: { veiculo_id: "veiculo-1", km_lido: 125430, km_confianca: 95 },
    });
    const msg = makeMsg({ tipo: "texto", texto: "125500" });

    await processarKmFlow(msg, sessao);

    expect(supabaseInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        km_lido: 125500,
        ia_confianca: null,
        ia_raw_response: null,
      })
    );
  });

  it("muda estado para manual quando usuário clica em corrigir", async () => {
    const sessao = makeSessao({
      estado: "aguardando_confirmacao_km",
      contexto: { veiculo_id: "veiculo-1", km_lido: 125430, km_confianca: 95 },
    });
    const msg = makeMsg({ tipo: "botao", botaoId: "km_digitar" });

    await processarKmFlow(msg, sessao);

    expect(updateSession).toHaveBeenCalledWith(
      sessao.id,
      expect.objectContaining({ estado: "aguardando_km_manual" })
    );
    expect(supabaseInsertMock).not.toHaveBeenCalled();
  });

  it("aceita correção numérica via texto livre", async () => {
    const sessao = makeSessao({
      estado: "aguardando_confirmacao_km",
      contexto: { veiculo_id: "veiculo-1", km_lido: 125430 },
    });
    const msg = makeMsg({ tipo: "texto", texto: "125500" });

    await processarKmFlow(msg, sessao);

    expect(supabaseInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ km_lido: 125500 })
    );
  });
});

describe("kmFlow — aguardando_km_manual", () => {
  it("rejeita texto que não é número", async () => {
    const sessao = makeSessao({ estado: "aguardando_km_manual" });
    const msg = makeMsg({ tipo: "texto", texto: "abc" });

    await processarKmFlow(msg, sessao);

    expect(enviarTexto).toHaveBeenCalledWith(
      msg.from,
      expect.stringContaining("apenas o")
    );
    expect(supabaseInsertMock).not.toHaveBeenCalled();
  });

  it("aceita número como KM e persiste", async () => {
    const sessao = makeSessao({ estado: "aguardando_km_manual" });
    const msg = makeMsg({ tipo: "texto", texto: "125430" });

    await processarKmFlow(msg, sessao);

    expect(supabaseInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ km_lido: 125430 })
    );
  });

  it("digitação manual NÃO grava metadados de IA mesmo com leitura rejeitada no contexto", async () => {
    // Cenário do bug: IA leu 999999 (40%), motorista descartou e digitou 125430.
    // O km_log manual deve sair com ia_confianca/ia_raw_response nulos.
    const sessao = makeSessao({
      estado: "aguardando_km_manual",
      contexto: {
        veiculo_id: "veiculo-1",
        km_lido: 999999,
        km_confianca: 40,
        foto_url: "https://meta.media/painel.jpg",
      },
    });
    const msg = makeMsg({ tipo: "texto", texto: "125430" });

    await processarKmFlow(msg, sessao);

    expect(supabaseInsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        km_lido: 125430,
        ia_confianca: null,
        ia_raw_response: null,
      })
    );
  });

  it("trata erro de KM retroativo do trigger do banco", async () => {
    supabaseInsertMock.mockResolvedValueOnce({
      error: { message: "km_atual maior que o novo valor" },
    });

    const sessao = makeSessao({ estado: "aguardando_km_manual" });
    const msg = makeMsg({ tipo: "texto", texto: "100" });

    await processarKmFlow(msg, sessao);

    expect(enviarTexto).toHaveBeenCalledWith(
      msg.from,
      expect.stringContaining("menor")
    );
  });
});
