import { describe, it, expect, vi } from "vitest";
import { loadAll } from "@/lib/utils/loadAll";

describe("loadAll", () => {
  it("retorna array vazio quando builder devolve data null", async () => {
    const builder = vi.fn().mockResolvedValue({ data: null });
    const result = await loadAll(builder);
    expect(result).toEqual([]);
    expect(builder).toHaveBeenCalledTimes(1);
  });

  it("retorna array vazio quando builder devolve data vazia", async () => {
    const builder = vi.fn().mockResolvedValue({ data: [] });
    const result = await loadAll(builder);
    expect(result).toEqual([]);
    expect(builder).toHaveBeenCalledTimes(1);
  });

  it("carrega uma única página quando data tem menos que 1000 registros", async () => {
    const data = Array.from({ length: 500 }, (_, i) => ({ id: i }));
    const builder = vi.fn().mockResolvedValue({ data });
    const result = await loadAll(builder);
    expect(result).toHaveLength(500);
    expect(builder).toHaveBeenCalledTimes(1);
    expect(builder).toHaveBeenCalledWith(0, 999);
  });

  it("carrega múltiplas páginas até esgotar", async () => {
    const pagina1 = Array.from({ length: 1000 }, (_, i) => ({ id: i }));
    const pagina2 = Array.from({ length: 1000 }, (_, i) => ({ id: 1000 + i }));
    const pagina3 = Array.from({ length: 250 }, (_, i) => ({ id: 2000 + i }));

    const builder = vi
      .fn()
      .mockResolvedValueOnce({ data: pagina1 })
      .mockResolvedValueOnce({ data: pagina2 })
      .mockResolvedValueOnce({ data: pagina3 });

    const result = await loadAll(builder);
    expect(result).toHaveLength(2250);
    expect(builder).toHaveBeenCalledTimes(3);
    expect(builder).toHaveBeenNthCalledWith(1, 0, 999);
    expect(builder).toHaveBeenNthCalledWith(2, 1000, 1999);
    expect(builder).toHaveBeenNthCalledWith(3, 2000, 2999);
  });

  it("para no fim quando última página vem incompleta", async () => {
    const pagina1 = Array.from({ length: 1000 }, (_, i) => ({ id: i }));
    const pagina2 = Array.from({ length: 999 }, (_, i) => ({ id: 1000 + i }));

    const builder = vi
      .fn()
      .mockResolvedValueOnce({ data: pagina1 })
      .mockResolvedValueOnce({ data: pagina2 });

    const result = await loadAll(builder);
    expect(result).toHaveLength(1999);
    expect(builder).toHaveBeenCalledTimes(2);
  });

  it("é tipado genericamente (T inferido do builder)", async () => {
    type Veiculo = { id: string; placa: string };
    const data: Veiculo[] = [{ id: "1", placa: "ABC1234" }];
    const builder = vi.fn().mockResolvedValue({ data });
    const result = await loadAll<Veiculo>(builder);
    expect(result[0].placa).toBe("ABC1234");
  });
});
