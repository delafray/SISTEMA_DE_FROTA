/** Testes do rótulo do número do pedido (AAAA.SSSS com fallback pro id curto). */

import { describe, it, expect } from "vitest";
import { rotuloPedido } from "@/lib/utils/numeroPedido";

describe("rotuloPedido", () => {
  it("usa o número oficial quando existe", () => {
    expect(rotuloPedido("2026.1003", "a1b2c3d4-0000-0000-0000-000000000000")).toBe("2026.1003");
  });

  it("cai pro id curto quando o número falta (pré-migration/linha antiga)", () => {
    expect(rotuloPedido(null, "a1b2c3d4-0000-0000-0000-000000000000")).toBe("#a1b2c3d4");
    expect(rotuloPedido(undefined, "a1b2c3d4-0000-0000-0000-000000000000")).toBe("#a1b2c3d4");
    expect(rotuloPedido("  ", "a1b2c3d4-0000-0000-0000-000000000000")).toBe("#a1b2c3d4");
  });
});
