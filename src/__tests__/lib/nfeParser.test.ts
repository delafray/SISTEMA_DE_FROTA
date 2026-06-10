import { describe, it, expect } from "vitest";
import { parseNFe, parseLoteNFe, formatarEnderecoNFe } from "@/lib/import/nfeParser";

const CHAVE = "35260601234567000189550010000123451000123456";

const xmlNFe = (overrides?: { chave?: string; semEndereco?: boolean; vNF?: string }) => `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe>
    <infNFe Id="NFe${overrides?.chave ?? CHAVE}" versao="4.00">
      <ide>
        <nNF>12345</nNF>
        <serie>1</serie>
        <dhEmi>2026-06-09T10:30:00-03:00</dhEmi>
      </ide>
      <dest>
        <xNome>Mercado São José Ltda</xNome>
        ${overrides?.semEndereco ? "" : `<enderDest>
          <xLgr>Rua das Flores</xLgr>
          <nro>123</nro>
          <xBairro>Centro</xBairro>
          <xMun>Campinas</xMun>
          <UF>SP</UF>
          <CEP>13010000</CEP>
        </enderDest>`}
      </dest>
      <total><ICMSTot><vNF>${overrides?.vNF ?? "4500.50"}</vNF></ICMSTot></total>
    </infNFe>
  </NFe>
</nfeProc>`;

describe("parseNFe", () => {
  it("extrai os campos de uma NFe válida (nfeProc)", () => {
    const r = parseNFe(xmlNFe());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.nota.chave).toBe(CHAVE);
    expect(r.nota.numero).toBe("12345");
    expect(r.nota.serie).toBe("1");
    expect(r.nota.destinatario).toBe("Mercado São José Ltda");
    expect(r.nota.endereco).toBe("Rua das Flores, 123, Centro, Campinas - SP, CEP 13010-000");
    expect(r.nota.cidade).toBe("Campinas");
    expect(r.nota.uf).toBe("SP");
    expect(r.nota.cep).toBe("13010000");
    expect(r.nota.valor).toBe(4500.5);
  });

  it("aceita XML 'puro' sem o envelope nfeProc", () => {
    const xml = xmlNFe().replace(/<\/?nfeProc[^>]*>/g, "");
    const r = parseNFe(xml);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.nota.chave).toBe(CHAVE);
  });

  it("falha em XML que não é NFe", () => {
    const r = parseNFe("<root><foo>bar</foo></root>");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain("infNFe");
  });

  it("falha em arquivo vazio e em XML quebrado", () => {
    expect(parseNFe("").ok).toBe(false);
    expect(parseNFe("isso não é xml <<<").ok).toBe(false);
  });

  it("falha quando a chave de acesso é inválida", () => {
    const r = parseNFe(xmlNFe({ chave: "123" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain("Chave");
  });

  it("falha quando a NFe não tem endereço de destinatário", () => {
    const r = parseNFe(xmlNFe({ semEndereco: true }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain("endereço");
  });

  it("valor ausente/ilegível vira null sem derrubar o parse", () => {
    const r = parseNFe(xmlNFe({ vNF: "abc" }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.nota.valor).toBeNull();
  });

  it("identifica CT-e e orienta que não é suportado", () => {
    const r = parseNFe(`<cteProc><CTe><infCte Id="CTe123"></infCte></CTe></cteProc>`);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain("CT-e");
  });
});

describe("parseLoteNFe", () => {
  it("falha em 1 arquivo não aborta o lote e duplicata no lote é reportada", () => {
    const lote = parseLoteNFe([
      { nome: "a.xml", conteudo: xmlNFe() },
      { nome: "b.xml", conteudo: "não é xml" },
      { nome: "c.xml", conteudo: xmlNFe() }, // mesma chave de a.xml
    ]);
    expect(lote.notas).toHaveLength(1);
    expect(lote.falhas).toHaveLength(2);
    expect(lote.falhas[0].arquivo).toBe("b.xml");
    expect(lote.falhas[1].motivo).toContain("duplicada");
  });
});

describe("formatarEnderecoNFe", () => {
  it("omite número 'SN' e partes vazias", () => {
    expect(formatarEnderecoNFe({ xLgr: "Estrada Velha", nro: "SN", xMun: "Itu", UF: "SP" }))
      .toBe("Estrada Velha, Itu - SP");
  });
  it("formata CEP com hífen", () => {
    expect(formatarEnderecoNFe({ xLgr: "Av. Brasil", nro: "1000", xMun: "Rio de Janeiro", UF: "RJ", CEP: "20040002" }))
      .toBe("Av. Brasil, 1000, Rio de Janeiro - RJ, CEP 20040-002");
  });
});
