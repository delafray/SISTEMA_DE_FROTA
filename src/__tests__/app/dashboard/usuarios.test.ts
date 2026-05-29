import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock das dependências de Supabase
const mockAdminFrom = vi.fn();
const mockAdminAuthUpdateUser = vi.fn().mockResolvedValue({ error: null });
const mockAdminAuth = {
  admin: {
    deleteUser: vi.fn().mockResolvedValue({ error: null }),
    updateUserById: mockAdminAuthUpdateUser,
  },
};
const mockAdminClient = {
  from: mockAdminFrom,
  auth: mockAdminAuth,
};

const mockUserFrom = vi.fn();
const mockUserAuth = {
  getUser: vi.fn(),
};
const mockUserClient = {
  from: mockUserFrom,
  auth: mockUserAuth,
};

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => mockAdminClient,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => Promise.resolve(mockUserClient),
}));

vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`Redirected to ${path}`);
  },
}));

import { editarUsuarioAction } from "@/app/(dashboard)/usuarios/[id]/editar/actions";
import { removerUsuarioAction } from "@/app/(dashboard)/usuarios/novo/actions";

describe("Usuários Server Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("editarUsuarioAction", () => {
    it("retorna erro se não autenticado", async () => {
      mockUserAuth.getUser.mockResolvedValue({ data: { user: null } });
      const formData = new FormData();
      const res = await editarUsuarioAction(undefined, formData);
      expect(res).toEqual({ error: "Não autenticado" });
    });

    it("retorna erro se não for master", async () => {
      mockUserAuth.getUser.mockResolvedValue({ data: { user: { id: "user-id" } } });
      
      const mockSingle = vi.fn().mockResolvedValue({ data: { role: "gestor", empresa_id: "emp-id" } });
      mockUserFrom.mockReturnValue({
        select: () => ({
          eq: () => ({
            eq: () => ({
              single: mockSingle,
            }),
          }),
        }),
      });

      const formData = new FormData();
      const res = await editarUsuarioAction(undefined, formData);
      expect(res).toEqual({ error: "Sem permissão. Apenas masters podem editar usuários." });
    });

    it("salva e edita dados com sucesso usando admin se for master", async () => {
      mockUserAuth.getUser.mockResolvedValue({ data: { user: { id: "master-id" } } });
      
      const mockSingle = vi.fn().mockResolvedValue({ data: { role: "master", empresa_id: "emp-id" } });
      mockUserFrom.mockReturnValue({
        select: () => ({
          eq: () => ({
            eq: () => ({
              single: mockSingle,
            }),
          }),
        }),
      });

      const mockUpdate = vi.fn().mockReturnValue({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) });
      const mockUpdatePerfis = vi.fn().mockReturnValue({ eq: () => Promise.resolve({ error: null }) });
      
      mockAdminFrom.mockImplementation((table: string) => {
        if (table === "perfis") {
          return { update: mockUpdatePerfis };
        }
        return { update: mockUpdate };
      });

      const formData = new FormData();
      formData.append("usuario_id", "target-id");
      formData.append("nome", "Novo Nome");
      formData.append("login", "novo-login");
      formData.append("role", "gestor");

      await expect(editarUsuarioAction(undefined, formData)).rejects.toThrow("Redirected to /usuarios");
      
      expect(mockAdminFrom).toHaveBeenCalledWith("perfis");
      expect(mockAdminFrom).toHaveBeenCalledWith("usuario_empresas");
    });

    it("salva e edita dados com sucesso, atualizando a senha se fornecida", async () => {
      mockUserAuth.getUser.mockResolvedValue({ data: { user: { id: "master-id" } } });
      
      const mockSingle = vi.fn().mockResolvedValue({ data: { role: "master", empresa_id: "emp-id" } });
      mockUserFrom.mockReturnValue({
        select: () => ({
          eq: () => ({
            eq: () => ({
              single: mockSingle,
            }),
          }),
        }),
      });

      const mockUpdate = vi.fn().mockReturnValue({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) });
      const mockUpdatePerfis = vi.fn().mockReturnValue({ eq: () => Promise.resolve({ error: null }) });
      
      mockAdminFrom.mockImplementation((table: string) => {
        if (table === "perfis") {
          return { update: mockUpdatePerfis };
        }
        return { update: mockUpdate };
      });

      const formData = new FormData();
      formData.append("usuario_id", "target-id");
      formData.append("nome", "Novo Nome");
      formData.append("login", "novo-login");
      formData.append("role", "motorista");
      formData.append("senha", "nova-senha-123");
      formData.append("motorista_id", "mot-uuid");

      await expect(editarUsuarioAction(undefined, formData)).rejects.toThrow("Redirected to /usuarios");
      
      expect(mockAdminAuth.admin.updateUserById).toHaveBeenCalledWith("target-id", { password: "nova-senha-123" });
      expect(mockUpdatePerfis).toHaveBeenCalled();
    });
  });

  describe("removerUsuarioAction", () => {
    it("retorna erro se não autenticado", async () => {
      mockUserAuth.getUser.mockResolvedValue({ data: { user: null } });
      const res = await removerUsuarioAction("target-id", "emp-id");
      expect(res).toEqual({ error: "Não autenticado" });
    });

    it("retorna erro se não for master", async () => {
      mockUserAuth.getUser.mockResolvedValue({ data: { user: { id: "user-id" } } });
      
      const mockSingle = vi.fn().mockResolvedValue({ data: { role: "gestor", empresa_id: "emp-id" } });
      mockUserFrom.mockReturnValue({
        select: () => ({
          eq: () => ({
            eq: () => ({
              single: mockSingle,
            }),
          }),
        }),
      });

      const res = await removerUsuarioAction("target-id", "emp-id");
      expect(res).toEqual({ error: "Sem permissão. Apenas masters podem remover usuários." });
    });

    it("remove usuário com sucesso se for master e deleta da auth se sem outras empresas", async () => {
      mockUserAuth.getUser.mockResolvedValue({ data: { user: { id: "master-id" } } });
      
      const mockSingle = vi.fn().mockResolvedValue({ data: { role: "master", empresa_id: "emp-id" } });
      mockUserFrom.mockReturnValue({
        select: () => ({
          eq: () => ({
            eq: () => ({
              single: mockSingle,
            }),
          }),
        }),
      });

      const mockDelete = vi.fn().mockReturnValue({
        eq: () => ({
          eq: () => Promise.resolve({ error: null }),
        }),
      });
      const mockDeletePerfis = vi.fn().mockReturnValue({
        eq: () => Promise.resolve({ error: null }),
      });

      const mockSelectCompanies = vi.fn().mockReturnValue({
        eq: () => Promise.resolve({ data: [] }), // Sem outras empresas
      });

      mockAdminFrom.mockImplementation((table: string) => {
        if (table === "perfis") {
          return { delete: mockDeletePerfis };
        }
        if (table === "usuario_empresas") {
          return {
            delete: mockDelete,
            select: () => ({
              eq: mockSelectCompanies,
            }),
          };
        }
        return {};
      });

      const res = await removerUsuarioAction("target-id", "emp-id");
      expect(res).toEqual({ success: true });
      expect(mockAdminAuth.admin.deleteUser).toHaveBeenCalledWith("target-id");
    });
  });
});
