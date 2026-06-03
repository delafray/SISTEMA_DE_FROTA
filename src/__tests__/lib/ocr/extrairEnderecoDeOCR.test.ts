/**
 * Testes da extração de endereço do texto bruto de OCR (DANFE/NF). Lógica pura.
 */

import { describe, it, expect } from 'vitest';
import { extrairEnderecoDeOCR } from '@/lib/ocr/extrairEnderecoDeOCR';

// DANFE realista (OCR): emitente com 1 CEP, destinatário com outro CEP + número.
const DANFE = `DANFE  DOCUMENTO AUXILIAR DA NOTA FISCAL ELETRONICA
EMITENTE
TRANSPORTADORA XYZ LTDA
RUA DO COMERCIO, 1000
CEP 04567-000  SAO PAULO  SP
CNPJ 12.345.678/0001-90
DESTINATARIO / REMETENTE
NOME/RAZAO SOCIAL
MERCADO BOM PRECO LTDA
ENDERECO              BAIRRO        CEP
RUA DAS FLORES, 123   CENTRO        01310-100
MUNICIPIO   FONE         UF
SAO PAULO   1133334444   SP`;

describe('extrairEnderecoDeOCR — CEP', () => {
  it('escolhe o CEP do DESTINATÁRIO (o que aparece após a âncora)', () => {
    const r = extrairEnderecoDeOCR(DANFE);
    expect(r.cep).toBe('01310100');
    expect(r.cepsEncontrados).toEqual(['04567000', '01310100']);
  });

  it('CEP único é usado direto', () => {
    const r = extrairEnderecoDeOCR('Entrega em RUA A, 50 - CEP 30140071 Belo Horizonte');
    expect(r.cep).toBe('30140071');
    expect(r.cepsEncontrados).toEqual(['30140071']);
  });

  it('sem âncora DESTINATÁRIO e múltiplos CEPs → usa o ÚLTIMO (fica mais abaixo)', () => {
    const r = extrairEnderecoDeOCR('CEP 04567-000\n... \nRUA X, 9\nCEP 01310-100');
    expect(r.cep).toBe('01310100');
  });

  it('aceita CEP sem hífen e com espaço', () => {
    expect(extrairEnderecoDeOCR('cep 01310100').cep).toBe('01310100');
    expect(extrairEnderecoDeOCR('cep 01310 100').cep).toBe('01310100');
  });

  it('não confunde CNPJ (14 dígitos) nem telefone com CEP', () => {
    const r = extrairEnderecoDeOCR('CNPJ 12345678000190 FONE 1133334444');
    expect(r.cep).toBeNull();
    expect(r.cepsEncontrados).toEqual([]);
  });

  it('texto sem CEP → cep null', () => {
    const r = extrairEnderecoDeOCR('RUA SEM CEP AQUI, 12');
    expect(r.cep).toBeNull();
  });
});

describe('extrairEnderecoDeOCR — número da casa', () => {
  it('pega o número após a vírgula na linha do logradouro do destinatário', () => {
    expect(extrairEnderecoDeOCR(DANFE).numero).toBe('123');
  });

  it('linha do logradouro escolhida é a do destinatário (não a do emitente)', () => {
    const r = extrairEnderecoDeOCR(DANFE);
    // OCR de DANFE junta as colunas (rua/bairro/CEP) numa linha só — guardamos a
    // linha inteira pra revisão; o importante é ser a do destinatário, não a do
    // emitente ("RUA DO COMERCIO").
    expect(r.linhaLogradouro).toContain('RUA DAS FLORES, 123');
    expect(r.linhaLogradouro).not.toContain('COMERCIO');
  });

  it('pega número por rótulo explícito "Nº" quando não há na linha da rua', () => {
    const txt = 'DESTINATARIO\nRUA DAS ACACIAS\nNUMERO 456\nCEP 01310-100';
    const r = extrairEnderecoDeOCR(txt);
    expect(r.numero).toBe('456');
  });

  it('rótulo "Nº 78" também funciona', () => {
    const r = extrairEnderecoDeOCR('DESTINATARIO\nAV BRASIL\nNº 78\nCEP 30140-071');
    expect(r.numero).toBe('78');
  });

  it('número nunca pode ser igual ao CEP (8 dígitos)', () => {
    const r = extrairEnderecoDeOCR('RUA X 01310100\nCEP 01310-100');
    expect(r.numero).not.toBe('01310100');
  });

  it('sem número identificável → null (conservador, motorista digita)', () => {
    const r = extrairEnderecoDeOCR('DESTINATARIO\nRUA DAS PALMEIRAS\nCEP 01310-100');
    expect(r.numero).toBeNull();
  });
});

describe('extrairEnderecoDeOCR — multi-foto (textos somados)', () => {
  it('número da 2ª foto (close-up) é pego ao somar com o texto da 1ª', () => {
    const foto1 = 'DESTINATARIO / REMETENTE\nRUA DAS PALMEIRAS\nCEP 01310-100  SAO PAULO SP';
    const foto2 = 'Nº 742'; // close-up só do número
    const r = extrairEnderecoDeOCR([foto1, foto2].join('\n'));
    expect(r.cep).toBe('01310100');
    expect(r.numero).toBe('742');
  });

  it('1ª foto sem CEP + 2ª foto com CEP → acha o CEP no texto somado', () => {
    const r = extrairEnderecoDeOCR(['RUA SEM CEP AQUI', 'DESTINATARIO CEP 30140-071'].join('\n'));
    expect(r.cep).toBe('30140071');
  });
});

describe('extrairEnderecoDeOCR — número por rótulo CASA', () => {
  it('reconhece "CASA 45" como número', () => {
    const r = extrairEnderecoDeOCR('DESTINATARIO\nRUA A\nCASA 45\nCEP 01310-100');
    expect(r.numero).toBe('45');
  });

  it('abreviação "No 88" também funciona', () => {
    const r = extrairEnderecoDeOCR('DESTINATARIO\nRUA B\nNo 88\nCEP 30140-071');
    expect(r.numero).toBe('88');
  });
});

describe('extrairEnderecoDeOCR — robustez', () => {
  it('string vazia / inválida → tudo null/vazio', () => {
    for (const v of ['', '   ', null as unknown as string, undefined as unknown as string]) {
      const r = extrairEnderecoDeOCR(v);
      expect(r.cep).toBeNull();
      expect(r.numero).toBeNull();
      expect(r.cepsEncontrados).toEqual([]);
      expect(r.linhaLogradouro).toBeNull();
    }
  });

  it('reconhece prefixos AV/AVENIDA/TRAVESSA como logradouro', () => {
    expect(extrairEnderecoDeOCR('AVENIDA PAULISTA, 1500\nCEP 01310-100').linhaLogradouro).toBe('AVENIDA PAULISTA, 1500');
    expect(extrairEnderecoDeOCR('TRAVESSA DOIS, 8\nCEP 01310-100').numero).toBe('8');
  });
});
