"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { PageHeader, FormSection, FormField, inputStyle, Btn, Alert } from "@/components/ui/ds";

export default function PerfilPage() {
  const [nome, setNome]           = useState("");
  const [senhaAtual, setSenhaAtual] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [saving, setSaving]       = useState(false);
  const [msg, setMsg]             = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => {
      if (data.user) {
        createClient()
          .from("perfis")
          .select("nome")
          .eq("id", data.user.id)
          .single()
          .then(({ data: p }) => { if (p) setNome(p.nome ?? ""); });
      }
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);

    if (novaSenha && novaSenha.length < 6) {
      setMsg({ tipo: "erro", texto: "A nova senha precisa ter pelo menos 6 caracteres." });
      return;
    }
    if (novaSenha && novaSenha !== confirmar) {
      setMsg({ tipo: "erro", texto: "As senhas não coincidem." });
      return;
    }

    setSaving(true);
    const supabase = createClient();

    if (novaSenha) {
      const { error } = await supabase.auth.updateUser({ password: novaSenha });
      if (error) {
        setSaving(false);
        setMsg({ tipo: "erro", texto: `Erro ao trocar senha: ${error.message}` });
        return;
      }
    }

    setSaving(false);
    setSenhaAtual("");
    setNovaSenha("");
    setConfirmar("");
    setMsg({ tipo: "ok", texto: "Perfil atualizado com sucesso!" });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PageHeader title="Meu Perfil" />

      <div style={{ flex: 1, overflow: "auto", padding: "16px" }}>
        <div style={{ maxWidth: 520 }}>
          {msg && (
            <div style={{ marginBottom: 16 }}>
              <Alert variant={msg.tipo === "ok" ? "success" : "error"}>
                {msg.tipo === "ok" ? "✅" : "⚠"} {msg.texto}
              </Alert>
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <FormSection title="Seus dados">
              <FormField label="Nome">
                <input value={nome} disabled style={{ ...inputStyle, background: "#f8fafc", color: "#64748b" }} />
              </FormField>
            </FormSection>

            <FormSection title="Trocar senha">
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <FormField label="Nova senha">
                  <input
                    type="password"
                    value={novaSenha}
                    onChange={e => setNovaSenha(e.target.value)}
                    style={inputStyle}
                    placeholder="Mínimo 6 caracteres"
                    minLength={6}
                  />
                </FormField>
                <FormField label="Confirmar nova senha">
                  <input
                    type="password"
                    value={confirmar}
                    onChange={e => setConfirmar(e.target.value)}
                    style={inputStyle}
                    placeholder="Repita a nova senha"
                  />
                </FormField>
              </div>
              <div style={{ marginTop: 8, fontSize: 12, color: "#64748b" }}>
                Deixe em branco se não quiser trocar a senha.
              </div>
            </FormSection>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, paddingTop: 16, borderTop: "1px solid #e2e8f0" }}>
              <Btn type="submit" variant="primary" disabled={saving}>
                {saving ? "Salvando..." : "Salvar"}
              </Btn>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
