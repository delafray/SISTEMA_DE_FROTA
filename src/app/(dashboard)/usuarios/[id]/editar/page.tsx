"use client";

import { useActionState, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { editarUsuarioAction } from "./actions";
import { PageHeader, FormSection, FormField, inputStyle, selectStyle, Btn, Alert } from "@/components/ui/ds";

export default function EditarUsuarioPage() {
  const { id } = useParams<{ id: string }>();
  const [state, formAction, pending] = useActionState(editarUsuarioAction, undefined);
  const [loading, setLoading] = useState(true);
  const [nome, setNome]       = useState("");
  const [role, setRole]       = useState("master");
  const [login, setLogin]     = useState("");

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const { data: ue } = await supabase.from("usuario_empresas").select("empresa_id")
        .eq("usuario_id", auth.user.id).eq("is_padrao", true).single();
      if (!ue?.empresa_id) return;

      const { data } = await supabase
        .from("usuario_empresas")
        .select("role, perfis(nome)")
        .eq("usuario_id", id)
        .eq("empresa_id", ue.empresa_id)
        .single();

      if (data) {
        const perfil = Array.isArray(data.perfis) ? data.perfis[0] : data.perfis;
        const n = perfil?.nome ?? "";
        setNome(n);
        setRole(data.role ?? "master");
        setLogin(n.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, ""));
      }
      setLoading(false);
    };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#64748b" }}>
      Carregando...
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PageHeader
        title={`Editar Usuário — ${nome || "..."}`}
        actions={
          <>
            <Btn href="/usuarios" variant="ghost">← Voltar para Lista</Btn>
            <Btn href="/usuarios" variant="outline">Cancelar</Btn>
            <Btn type="submit" form="edit-user-form" variant="primary" disabled={pending}>
              {pending ? "Salvando..." : "Atualizar"}
            </Btn>
          </>
        }
      />

      <div style={{ flex: 1, overflow: "auto", padding: "16px" }}>
        <div style={{ width: "100%" }}>
          {state?.error && (
            <div style={{ marginBottom: "16px" }}>
              <Alert variant="error">⚠ {state.error}</Alert>
            </div>
          )}

          <form id="edit-user-form" action={formAction} style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            <input type="hidden" name="usuario_id" value={id} />

            <FormSection title="Dados do Usuário">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "16px" }}>
                <div style={{ gridColumn: "span 2" }}>
                  <FormField label="Nome Completo">
                    <input
                      name="nome"
                      value={nome}
                      onChange={e => {
                        setNome(e.target.value);
                        setLogin(e.target.value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, ""));
                      }}
                      style={inputStyle}
                    />
                  </FormField>
                </div>

                <FormField label="Usuário (Login) — gerado automaticamente">
                  <input
                    value={login}
                    disabled
                    style={{ ...inputStyle, background: "#f8fafc", color: "#94a3b8", cursor: "not-allowed" }}
                  />
                </FormField>

                <FormField label="Perfil / Role">
                  <select
                    name="role"
                    value={role}
                    onChange={e => setRole(e.target.value)}
                    style={selectStyle}
                  >
                    <option value="master">Master (Administrador)</option>
                    <option value="gestor">Gestor</option>
                    <option value="motorista">Motorista</option>
                  </select>
                </FormField>
              </div>
            </FormSection>

            <div style={{
              padding: "16px", background: "#fefce8", border: "1px solid #fde68a",
              borderRadius: "8px", fontSize: "13px", color: "#854d0e",
            }}>
              ⚠ Para redefinir a senha do usuário, use o painel do Supabase ou implemente um fluxo de reset por e-mail.
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "16px", paddingTop: "16px", borderTop: "1px solid #e2e8f0" }}>
              <Btn href="/usuarios" variant="outline">Cancelar</Btn>
              <Btn type="submit" form="edit-user-form" disabled={pending}>
                {pending ? "Salvando..." : "Atualizar Usuário"}
              </Btn>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
