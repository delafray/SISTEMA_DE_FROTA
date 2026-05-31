/**
 * Testes dos helpers de restricoes VROOM.
 */

import { describe, it, expect } from 'vitest';
import {
  PRIORIDADE,
  indexarJobs,
  notaParaJob,
  montarVeiculo,
  aplicarFixacao,
  aplicarPreferenciaCliente,
  traduzirParadasComMapping,
  montarParadasPersistir,
} from '@/lib/routing/restricoes';
import type { NotaCapturada } from '@/lib/routing/types';

function makeNota(over: Partial<NotaCapturada> = {}): NotaCapturada {
  return {
    id: over.id ?? 'nota-uuid-1',
    motorista_id: 'mot-1',
    empresa_id: 'emp-1',
    cep: '01310100',
    numero: '123',
    endereco: { logradouro: 'Av X', bairro: 'B', cidade: 'SP', uf: 'SP' },
    latitude: -23.5,
    longitude: -46.6,
    observacao: null,
    status: 'geocodificada',
    capturado_em: '2026-05-28T10:00:00Z',
    sincronizado_em: '2026-05-28T10:00:05Z',
    ...over,
  };
}

describe('PRIORIDADE constants', () => {
  it('define NORMAL/ALTA/FIXADA com valores crescentes', () => {
    expect(PRIORIDADE.NORMAL).toBeLessThan(PRIORIDADE.ALTA);
    expect(PRIORIDADE.ALTA).toBeLessThan(PRIORIDADE.FIXADA);
    expect(PRIORIDADE.FIXADA).toBe(100);
  });
});

describe('indexarJobs', () => {
  it('mapeia IDs string -> numericos 1-based + mantem ordem', () => {
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const { mapping, items: out } = indexarJobs(items);

    expect(out).toHaveLength(3);
    expect(out[0]._idVroom).toBe(1);
    expect(out[1]._idVroom).toBe(2);
    expect(out[2]._idVroom).toBe(3);
    expect(mapping.get(1)).toBe('a');
    expect(mapping.get(2)).toBe('b');
    expect(mapping.get(3)).toBe('c');
  });

  it('aceita array vazio', () => {
    const { mapping, items } = indexarJobs([]);
    expect(items).toEqual([]);
    expect(mapping.size).toBe(0);
  });
});

describe('notaParaJob', () => {
  it('converte nota geocodificada em Job com defaults', () => {
    const nota = makeNota({ latitude: -23.5, longitude: -46.6 });
    const job = notaParaJob(nota, 1);

    expect(job.id).toBe(1);
    expect(job.localizacao).toEqual({ lat: -23.5, lng: -46.6 });
    expect(job.tempo_descarga_s).toBe(300); // default 5min
    expect(job.janelas).toBeUndefined();
  });

  it('aplica janelas e prioridade quando passadas', () => {
    const job = notaParaJob(makeNota(), 1, {
      janelas: [['09:00', '12:00']],
      prioridade: 50,
      tempo_descarga_s: 600,
    });

    expect(job.janelas).toEqual([['09:00', '12:00']]);
    expect(job.prioridade).toBe(50);
    expect(job.tempo_descarga_s).toBe(600);
  });

  it('throw quando nota sem latitude/longitude', () => {
    const nota = makeNota({ latitude: null, longitude: null });
    expect(() => notaParaJob(nota, 1)).toThrow(/sem coordenadas/);
  });
});

describe('montarVeiculo', () => {
  it('aceita config minima (inicio so)', () => {
    const v = montarVeiculo({ id: 1, inicio: { lat: 0, lng: 0 } });
    expect(v.id).toBe(1);
    expect(v.fim).toBeUndefined();
    expect(v.capacidade).toBeUndefined();
  });

  it('aceita config completa', () => {
    const v = montarVeiculo({
      id: 1,
      inicio: { lat: 0, lng: 0 },
      fim: { lat: 1, lng: 1 },
      capacidade: [100],
      skills: [1, 2],
    });
    expect(v.fim).toEqual({ lat: 1, lng: 1 });
    expect(v.capacidade).toEqual([100]);
    expect(v.skills).toEqual([1, 2]);
  });
});

describe('aplicarFixacao', () => {
  it('seta prioridade FIXADA (100)', () => {
    const job = notaParaJob(makeNota(), 1);
    const fixado = aplicarFixacao(job, 1);
    expect(fixado.prioridade).toBe(PRIORIDADE.FIXADA);
  });
});

describe('aplicarPreferenciaCliente', () => {
  it('aplica janela_horario quando job nao tinha', () => {
    const job = notaParaJob(makeNota(), 1);
    const out = aplicarPreferenciaCliente(job, {
      janela_horario: [['09:00', '12:00']],
    });
    expect(out.janelas).toEqual([['09:00', '12:00']]);
  });

  it('NAO sobrescreve janela quando job ja tinha', () => {
    const job = notaParaJob(makeNota(), 1, { janelas: [['14:00', '18:00']] });
    const out = aplicarPreferenciaCliente(job, {
      janela_horario: [['09:00', '12:00']],
    });
    expect(out.janelas).toEqual([['14:00', '18:00']]);
  });

  it('converte tempo_descarga_min -> segundos', () => {
    const job = notaParaJob(makeNota(), 1);
    const out = aplicarPreferenciaCliente(job, { tempo_descarga_min: 10 });
    expect(out.tempo_descarga_s).toBe(600);
  });

  it('posicao_preferida=primeira eleva prioridade pra ALTA', () => {
    const job = notaParaJob(makeNota(), 1);
    const out = aplicarPreferenciaCliente(job, { posicao_preferida: 'primeira' });
    expect(out.prioridade).toBe(PRIORIDADE.ALTA);
  });

  it('posicao_preferida=ultima/qualquer NAO mexe na prioridade', () => {
    const job = notaParaJob(makeNota(), 1);
    const u = aplicarPreferenciaCliente(job, { posicao_preferida: 'ultima' });
    const q = aplicarPreferenciaCliente(job, { posicao_preferida: 'qualquer' });
    expect(u.prioridade).toBeUndefined();
    expect(q.prioridade).toBeUndefined();
  });

  it('ignora tempo_descarga_min <= 0', () => {
    const job = notaParaJob(makeNota(), 1);
    const out = aplicarPreferenciaCliente(job, { tempo_descarga_min: 0 });
    expect(out.tempo_descarga_s).toBe(300); // default mantido
  });
});

describe('traduzirParadasComMapping', () => {
  it('traduz IDs numericos de volta pra ids string', () => {
    const mapping = new Map([[1, 'nota-a'], [2, 'nota-b']]);
    const paradasVroom = [
      { nota_id: '1', ordem: 1, chegada_estimada: '2026-05-28T10:00:00Z' },
      { nota_id: '2', ordem: 2, chegada_estimada: '2026-05-28T10:30:00Z' },
    ];

    const out = traduzirParadasComMapping(paradasVroom, mapping);

    expect(out).toEqual([
      { nota_id_local: 'nota-a', ordem: 1, chegada_estimada: '2026-05-28T10:00:00Z' },
      { nota_id_local: 'nota-b', ordem: 2, chegada_estimada: '2026-05-28T10:30:00Z' },
    ]);
  });

  it('throw quando mapping nao tem o ID', () => {
    const mapping = new Map([[1, 'a']]);
    expect(() =>
      traduzirParadasComMapping(
        [{ nota_id: '99', ordem: 1, chegada_estimada: 'x' }],
        mapping
      )
    ).toThrow(/mapping nao tem id/);
  });
});

describe('montarParadasPersistir', () => {
  it('monta paradas com snapshot do endereco da nota + numero da casa', () => {
    const nota = makeNota({ id: 'nota-1', numero: '104' });
    const notas = new Map([['nota-1', nota]]);
    const paradas = [
      { nota_id_local: 'nota-1', ordem: 1, chegada_estimada: 'x' },
    ];

    const out = montarParadasPersistir(paradas, notas, 'rota-uuid');

    expect(out).toHaveLength(1);
    expect(out[0].rota_id).toBe('rota-uuid');
    expect(out[0].nota_id).toBe('nota-1');
    expect(out[0].ordem).toBe(1);
    // endereco do snapshot deve incluir o numero da casa (do campo nota.numero)
    // + a confianca da coord (default 'baixa' quando a nota nao passou pelo resolver)
    expect(out[0].endereco).toEqual({ ...nota.endereco, numero: '104', coord_confianca: 'baixa' });
    expect(out[0].latitude).toBe(-23.5);
    expect(out[0].fixada).toBe(false);
  });

  it('propaga coord_confianca da nota pro snapshot da parada', () => {
    const nota = makeNota({ id: 'nota-2', numero: '104', coord_confianca: 'alta' });
    const notas = new Map([['nota-2', nota]]);
    const out = montarParadasPersistir(
      [{ nota_id_local: 'nota-2', ordem: 1, chegada_estimada: 'x' }],
      notas,
      'rota-uuid'
    );
    expect(out[0].endereco.coord_confianca).toBe('alta');
  });

  it('throw quando nota nao esta no mapping ou sem coords', () => {
    const notas = new Map<string, NotaCapturada>();
    expect(() =>
      montarParadasPersistir(
        [{ nota_id_local: 'nope', ordem: 1, chegada_estimada: 'x' }],
        notas,
        'rota'
      )
    ).toThrow();
  });
});
