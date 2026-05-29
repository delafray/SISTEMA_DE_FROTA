import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock das dependências de Supabase
const mockSignIn = vi.fn();
const mockUserClient = {
  auth: {
    signInWithPassword: mockSignIn,
  },
};

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => Promise.resolve(mockUserClient),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`Redirected to ${path}`);
  },
}));

import { login } from "@/app/login/actions";

describe("Login Server Action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("tenta login com @frota.sys primeiro e autentica com sucesso", async () => {
    mockSignIn.mockResolvedValueOnce({ error: null }); // Sucesso no primeiro domínio

    const formData = new FormData();
    formData.append("username", "borba");
    formData.append("password", "senha-123");

    await expect(login(formData)).rejects.toThrow("Redirected to /");
    
    expect(mockSignIn).toHaveBeenCalledWith({
      email: "borba@frota.sys",
      password: "senha-123",
    });
  });

  it("tenta login com @frota.sys, falha, e autentica com sucesso no legado @ronaldoborba.com.br", async () => {
    mockSignIn
      .mockResolvedValueOnce({ error: new Error("User not found") }) // Falha no novo
      .mockResolvedValueOnce({ error: null }); // Sucesso no legado

    const formData = new FormData();
    formData.append("username", "ronaldo");
    formData.append("password", "senha-123");

    await expect(login(formData)).rejects.toThrow("Redirected to /");
    
    expect(mockSignIn).toHaveBeenCalledWith({
      email: "ronaldo@frota.sys",
      password: "senha-123",
    });
    
    expect(mockSignIn).toHaveBeenLastCalledWith({
      email: "ronaldo@ronaldoborba.com.br",
      password: "senha-123",
    });
  });

  it("redireciona para /login?error=true se ambos os domínios falharem", async () => {
    mockSignIn
      .mockResolvedValueOnce({ error: new Error("User not found") })
      .mockResolvedValueOnce({ error: new Error("User not found") });

    const formData = new FormData();
    formData.append("username", "invalido");
    formData.append("password", "senha-errada");

    await expect(login(formData)).rejects.toThrow("Redirected to /login?error=true");
  });

  it("tenta login com e-mail completo sem alterar o domínio", async () => {
    mockSignIn.mockResolvedValueOnce({ error: null });

    const formData = new FormData();
    formData.append("username", "outro@qualquer.com");
    formData.append("password", "senha-123");

    await expect(login(formData)).rejects.toThrow("Redirected to /");
    
    expect(mockSignIn).toHaveBeenCalledWith({
      email: "outro@qualquer.com",
      password: "senha-123",
    });
  });
});
