import { describe, it, expect } from "vitest";
import { calcularStatsRota } from "@/lib/routing/statsRota";
import type { Parada } from "@/lib/routing/types";

// Parada mínima pro cálculo (id/ordem/coords/concluida_em é o que importa).
function parada(ordem: number, lat: number, lng: number, concluida = false): Parada {
  return {
    id: `p${ordem}`, ordem, latitude: lat, longitude: lng,
    concluida_em: concluida ? "2026-06-11T10:00:00Z" : null,
  } as Parada;
}

const POS = { lat: -23.55, lng: -46.63 };

describe("calcularStatsRota", () => {
  it("sem posição ou sem paradas → null", () => {
    expect(calcularStatsRota(null, [parada(1, -23.56, -46.64)])).toBeNull();
    expect(calcularStatsRota(POS, [])).toBeNull();
  });
  it("tudo entregue → null", () => {
    expect(calcularStatsRota(POS, [parada(1, -23.56, -46.64, true)])).toBeNull();
  });
  it("uma pendente → próxima == total e minutos = km*3 arredondado", () => {
    const r = calcularStatsRota(POS, [parada(1, -23.56, -46.64)]);
    expect(r).not.toBeNull();
    expect(r!.proxKm).toBeGreaterThan(0);
    expect(r!.faltamKm).toBeCloseTo(r!.proxKm, 10);
    expect(r!.proxMin).toBe(Math.round(r!.proxKm * 3));
  });
  it("ignora concluídas e ordena pendentes por ordem", () => {
    const r = calcularStatsRota(POS, [
      parada(3, -23.58, -46.66),
      parada(1, -23.50, -46.60, true), // concluída — fora da conta
      parada(2, -23.56, -46.64),
    ]);
    expect(r).not.toBeNull();
    // a próxima é a de ordem 2 (não a concluída nem a 3)
    const direto2 = calcularStatsRota(POS, [parada(2, -23.56, -46.64)]);
    expect(r!.proxKm).toBeCloseTo(direto2!.proxKm, 10);
    // total inclui o trecho 2→3
    expect(r!.faltamKm).toBeGreaterThan(r!.proxKm);
  });
});
