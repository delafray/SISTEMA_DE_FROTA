"use client";

import { useActionState, useState, useEffect } from "react";
import { criarUsuarioAction } from "./actions";
import { createClient } from "@/lib/supabase/client";
import { PageHeader, FormSection, FormField, inputStyle, selectStyle, Btn, Alert } from "@/components/ui/ds";

const initialState = { error: undefined, success: false };

export default function NovoUsuarioPage() {
  const [state, formAction, pending] = useActionState(criarUsuarioAction, initialState);
  const [role, setRole] = useState<"master" | "gestor" | "motorista">("master");
  const [motoristas, setMotoristas] = useState<{ id: string; nome: string }[]>([]);
  const [loginAviso, setLoginAviso] = useState<string | null>(null);

  const checarLogin = async (val: string) => {
    const n = val.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
    if (n.length < 3) { setLoginAviso(null); return; }
    const supabase = createClient();
    const { data } = await supabase.from("perfis").select("nome").eq("login", n).maybeSingle();
    setLoginAviso(data ? `Já existe um usuário com o login "${n}"${data.nome ? ` (${data.nome})` : ""}. Escolha outro.` : null);
  };

  useEffect(() => {
    if (role === "motorista") {
      const supabase = createClient();
      supabase.from("motoristas").select("id, nome").eq("ativo", true).order("nome").then(({ data }) => {
        setMotoristas(data ?? []);
      });
    }
  }, [role]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PageHeader 
        title="Novo Usuário" 
        actions={
          <>
            <Btn href="/usuarios" variant="ghost">← Voltar para Lista</Btn>
            <Btn href="/usuarios" variant="outline">Cancelar</Btn>
            <Btn type="submit" form="user-form" variant="primary" disabled={pending}>
              {pending ? "Criando..." : "Salvar"}
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

          <form id="user-form" action={formAction} style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            <FormSection title="Dados de Acesso">
              <div className="m-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "16px" }}>
                <div style={{ gridColumn: "span 2" }}>
                  <FormField label="Nome Completo">
                    <input
                      name="nome"
                      type="text"
                      required
                      style={inputStyle}
                      placeholder="Ex: João Silva"
                    />
                  </FormField>
                </div>

                <FormField label="Nome de Usuário (Login)">
                  <input
                    name="username"
                    type="text"
                    required
                    style={inputStyle}
                    placeholder="Ex: joaosilva"
                    onBlur={(e) => checarLogin(e.target.value)}
                  />
                  <p style={{ fontSize: "11px", color: "#64748b", marginTop: "4px" }}>Sem espaços, acentos ou maiúsculas.</p>
                  {loginAviso && <p style={{ fontSize: "12px", color: "#b45309", fontWeight: 600, marginTop: "4px" }}>⚠ {loginAviso}</p>}
                </FormField>

                <FormField label="Senha Provisória">
                  <input
                    name="senha"
                    type="password"
                    required
                    minLength={6}
                    style={inputStyle}
                    placeholder="Mínimo 6 caracteres"
                  />
                </FormField>

                <FormField label="Perfil / Role">
                  <select
                    name="role"
                    value={role}
                    onChange={(e) => setRole(e.target.value as "master" | "gestor" | "motorista")}
                    style={selectStyle}
                  >
                    <option value="master">Admin (acesso total)</option>
                    <option value="gestor">Gestor (sem configs do sistema)</option>
                    <option value="motorista">Motorista (apenas app mobile)</option>
                  </select>
                </FormField>

                {role === "motorista" && (
                  <FormField label="Vincular ao Motorista">
                    <select name="motorista_id" style={selectStyle}>
                      <option value="">— Selecione —</option>
                      {motoristas.map((m) => (
                        <option key={m.id} value={m.id}>{m.nome}</option>
                      ))}
                    </select>
                    <p style={{ fontSize: "11px", color: "#64748b", marginTop: "4px" }}>O motorista precisa estar cadastrado primeiro.</p>
                  </FormField>
                )}
              </div>
            </FormSection>

            {/* Info */}
            <div style={{ padding: "16px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "13px", color: "#475569" }}>
              <p style={{ marginBottom: "8px" }}>📋 <strong>Como funciona o login:</strong> o usuário entra com o nome de usuário. O sistema monta o e-mail internamente.</p>
              <p style={{ marginBottom: "8px" }}>🔑 Perfil <strong>Admin:</strong> acesso total — usuários, empresas, relatórios, configurações.</p>
              <p style={{ marginBottom: "8px" }}>📊 Perfil <strong>Gestor:</strong> acesso operacional — pedidos, motoristas, frotas. Sem configurações do sistema.</p>
              <p>🚛 Perfil <strong>Motorista:</strong> acesso apenas ao app mobile. Vincule ao cadastro de motorista.</p>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "16px", paddingTop: "16px", borderTop: "1px solid #e2e8f0" }}>
              <Btn href="/usuarios" variant="outline">Cancelar</Btn>
              <Btn type="submit" disabled={pending} form="user-form">
                {pending ? "Criando usuário..." : "Salvar Usuário"}
              </Btn>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
