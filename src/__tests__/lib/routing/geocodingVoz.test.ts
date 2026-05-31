/**
 * Testes da busca de endereco por VOZ: prepararQueriesVoz (puro) e
 * geocodarVozComVariantes (cascata sobre o Nominatim).
 *
 * Caso de prod que motivou: motorista fala "Rua Buzios bairro Estrela Dalva",
 * mas o OSM tem o bairro como "Estrela d'Alva" — o token unico "dalva" nao casa
 * com "d"+"alva". A cascata limpa "bairro", gera a variante de apostrofo e por
 * fim cai pra so o logradouro (vies de GPS).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  prepararQueriesVoz,
  geocodarVozComVariantes,
  _resetRateLimit,
} from '@/lib/routing/geocoding';

// ─── prepararQueriesVoz (puro) ──────────────────────────────────────

describe('prepararQueriesVoz', () => {
  it('caso real: limpa "bairro", gera variante de apostrofo e so-logradouro', () => {
    const qs = prepararQueriesVoz('Rua Buzios bairro Estrela Dalva');
    expect(qs).toEqual([
      'Rua Buzios, Estrela Dalva',    // 1: "bairro" -> virgula
      'Rua Buzios, Estrela D alva',   // 2: apostrofo "dalva" -> "d alva"
      'Rua Buzios',                   // 3: so logradouro
    ]);
  });

  it('separa contracao "d\'" colada na fala (dalva -> d alva)', () => {
    const qs = prepararQueriesVoz('Estrela Dalva');
    expect(qs).toContain('Estrela D alva');
  });

  it('separa contracao "sant\'" (santana -> sant ana)', () => {
    const qs = prepararQueriesVoz('Praca Santana');
    expect(qs).toContain('Praca Sant ana');
  });

  it('preserva "santa"/"santo" inteiros (nao sao contracao)', () => {
    expect(prepararQueriesVoz('Rua Santa Rita')).not.toContain('Rua Sant a Rita');
    expect(prepararQueriesVoz('Rua Santo Antonio')).not.toContain('Rua Sant o Antonio');
  });

  it('endereco normal sem conectivo gera UMA query so', () => {
    expect(prepararQueriesVoz('Rua Augusta 1500 Sao Paulo')).toEqual([
      'Rua Augusta 1500 Sao Paulo',
    ]);
  });

  it('limpa "numero"/"número" virando separador', () => {
    expect(prepararQueriesVoz('Rua X numero 100')).toEqual(['Rua X, 100', 'Rua X']);
    expect(prepararQueriesVoz('Rua X número 100')).toEqual(['Rua X, 100', 'Rua X']);
  });

  it('"no bairro"/"do bairro" tambem sao limpos', () => {
    expect(prepararQueriesVoz('Rua A no bairro Centro')[0]).toBe('Rua A, Centro');
    expect(prepararQueriesVoz('Rua A do bairro Centro')[0]).toBe('Rua A, Centro');
  });

  it('deduplica e descarta texto vazio/curto', () => {
    expect(prepararQueriesVoz('')).toEqual([]);
    expect(prepararQueriesVoz('   ')).toEqual([]);
    expect(prepararQueriesVoz('ab')).toEqual([]);
  });

  it('nao quebra "no/da/do" comuns como se fossem "numero"', () => {
    // "no" nao deve virar separador (regex de numero exige n[º°] ou numero/nro)
    expect(prepararQueriesVoz('Rua do Sol Centro')[0]).toBe('Rua do Sol Centro');
  });
});

// ─── geocodarVozComVariantes (cascata) ──────────────────────────────

function nominatimItem(lat: string, lon: string, display: string) {
  return { lat, lon, display_name: display };
}

/** Mock de fetch que devolve itens conforme o `q` na URL. */
function mockFetchByQuery(map: Record<string, ReturnType<typeof nominatimItem>[]>) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((url: string) => {
      const q = new URL(url).searchParams.get('q') ?? '';
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => map[q] ?? [],
      });
    })
  );
}

beforeEach(() => {
  _resetRateLimit();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('geocodarVozComVariantes', () => {
  it('acha na variante 1 (texto limpo) sem precisar variar', async () => {
    mockFetchByQuery({
      'Rua Buzios, Estrela Dalva': [nominatimItem('-19.9', '-44.0', 'Rua Buzios, Contagem')],
    });
    const r = await geocodarVozComVariantes('Rua Buzios bairro Estrela Dalva');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.variante).toBe(1);
      expect(r.resultados).toHaveLength(1);
    }
  });

  it('cai pra variante 2 (apostrofo) quando a 1 nao acha — caso d\'Alva', async () => {
    mockFetchByQuery({
      // variante 1 vazia, variante 2 (apostrofo) acha
      'Rua Buzios, Estrela D alva': [
        nominatimItem('-19.91', '-44.05', "Rua Buzios, Estrela d'Alva, Contagem - MG"),
      ],
    });
    const r = await geocodarVozComVariantes('Rua Buzios bairro Estrela Dalva');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.variante).toBe(2);
      expect(r.resultados[0].endereco_normalizado).toContain("d'Alva");
    }
  });

  it('cai pra variante 3 (so logradouro) quando bairro atrapalha', async () => {
    mockFetchByQuery({
      'Rua Buzios': [nominatimItem('-19.9', '-44.0', 'Rua Buzios, Contagem - MG')],
    });
    const r = await geocodarVozComVariantes('Rua Buzios bairro Estrela Dalva');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.variante).toBe(3);
  });

  it('retorna nao_encontrado quando nenhuma variante acha', async () => {
    mockFetchByQuery({}); // tudo vazio
    const r = await geocodarVozComVariantes('Rua Buzios bairro Estrela Dalva');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe('nao_encontrado');
  });

  it('texto vazio -> endereco_invalido (sem chamar fetch)', async () => {
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);
    const r = await geocodarVozComVariantes('');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe('endereco_invalido');
    expect(spy).not.toHaveBeenCalled();
  });

  it('aborta na 1a variante em erro de rede (nao varre as demais)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 503, json: async () => [] });
    vi.stubGlobal('fetch', fetchMock);
    const r = await geocodarVozComVariantes('Rua Buzios bairro Estrela Dalva');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toBe('erro_rede');
    // so 1 tentativa — erro de rede nao melhora variando a query
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('propaga lat/lng pro Nominatim (ordenacao por proximidade)', async () => {
    mockFetchByQuery({
      'Rua Buzios, Estrela Dalva': [nominatimItem('-19.9', '-44.0', 'Rua Buzios')],
    });
    await geocodarVozComVariantes('Rua Buzios bairro Estrela Dalva', 5, -19.9, -44.0);
    const url = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain('viewbox');
  });
});
