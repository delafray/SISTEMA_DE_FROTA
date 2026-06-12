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
  const [senha, setSenha]     = useState("");
  const [motoristaId, setMotoristaId] = useState("");
  const [motoristas, setMotoristas] = useState<{ id: string; nome: string }[]>([]);
  const [betaRota, setBetaRota] = useState(false);

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const { data: ue } = await supabase.from("usuario_empresas").select("empresa_id")
        .eq("usuario_id", auth.user.id).eq("is_padrao", true).single();
      if (!ue?.empresa_id) return;

      // Busca a lista de motoristas ativos
      const { data: mots } = await supabase.from("motoristas").select("id, nome").eq("ativo", true).order("nome");
      setMotoristas(mots ?? []);

      const { data } = await supabase
        .from("usuario_empresas")
        .select("role, perfis(nome, motorista_id)")
        .eq("usuario_id", id)
        .eq("empresa_id", ue.empresa_id)
        .single();

      if (data) {
        const perfil = Array.isArray(data.perfis) ? data.perfis[0] : data.perfis;
        const n = perfil?.nome ?? "";
        setNome(n);
        setRole(data.role ?? "master");
        setLogin(n.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, ""));
        setMotoristaId(perfil?.motorista_id ?? "");
      }
      // \ud83e\uddea flag beta (coluna da migration_beta_rota; sem ela fica false)
      const { data: beta } = await supabase
        .from("perfis").select("beta_rota" as never).eq("id", id).maybeSingle();
      setBetaRota(!!(beta as { beta_rota?: boolean } | null)?.beta_rota);
      setLoading(false);
    };
    load();
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
            <Btn href="/usuarios" variant="outline">Cancelar</Btn>
            <Btn type="submit" form="edit-user-form" size="md" disabled={pending}>
              {pending ? "Salvando..." : "Atualizar Usuário"}
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
              <div className="m-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "16px" }}>
                <div style={{ gridColumn: "span 2" }}>
                  <FormField label="Nome Completo">
                    <input
                      name="nome"
                      value={nome}
                      onChange={e => setNome(e.target.value)}
                      style={inputStyle}
                    />
                  </FormField>
                </div>

                <FormField label="Usuário (Login)">
                  <input
                    name="login"
                    value={login}
                    onChange={e => setLogin(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ""))}
                    style={inputStyle}
                    placeholder="Ex: borba"
                    required
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

                <FormField label="Nova Senha (deixe em branco para manter a atual)">
                  <input
                    name="senha"
                    type="password"
                    value={senha}
                    onChange={e => setSenha(e.target.value)}
                    style={inputStyle}
                    placeholder="Mínimo 6 caracteres"
                    minLength={6}
                  />
                </FormField>

                {role === "motorista" && (
                  <FormField label="Vincular ao Motorista">
                    <select
                      name="motorista_id"
                      value={motoristaId}
                      onChange={e => setMotoristaId(e.target.value)}
                      style={selectStyle}
                    >
                      <option value="">— Selecione —</option>
                      {motoristas.map((m) => (
                        <option key={m.id} value={m.id}>{m.nome}</option>
                      ))}
                    </select>
                  </FormField>
                )}

                {role === "motorista" && (
                  <div style={{ gridColumn: "span 2" }}>
                    <label style={{ display: "flex", alignItems: "flex-start", gap: "10px", fontSize: "13px", color: "#92400e", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: "8px", padding: "12px", cursor: "pointer", lineHeight: 1.5 }}>
                      <input
                        type="checkbox"
                        name="beta_rota"
                        checked={betaRota}
                        onChange={e => setBetaRota(e.target.checked)}
                        style={{ marginTop: "2px", width: "15px", height: "15px", accentColor: "#d97706" }}
                      />
                      <span>
                        <strong>🧪 Beta teste rota</strong> — usuário externo só pra validar a roteirização:
                        app de rota standalone (sem caminhão, sem despachos, sem pedidos). Rotas gravadas
                        atreladas ao nome de usuário.
                      </span>
                    </label>
                  </div>
                )}
              </div>
            </FormSection>

            <div style={{
              padding: "16px", background: "#f0fdf4", border: "1px solid #bbf7d0",
              borderRadius: "8px", fontSize: "13px", color: "#166534",
            }}>
              💡 Preencha o campo &quot;Nova Senha&quot; apenas se desejar redefinir a senha do usuário. O login é gerado automaticamente a partir do nome completo.
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
