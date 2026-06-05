"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PageHeader, FormField, inputStyle, Btn } from "@/components/ui/ds";
import { variacoesTelefone } from "@/lib/utils/telefone";
import { montarContextoIA, type RegraCtx, type TelCtx, type Contexto } from "@/lib/whatsapp/montarContexto";

export default function ContextoPage() {
  const router = useRouter();
  const supabase = createClient();
  const [regras, setRegras] = useState<RegraCtx[]>([]);
  const [telefone, setTelefone] = useState("");
  const [mensagem, setMensagem] = useState("anota aí que o caminhão voltou");
  const [res, setRes] = useState<Contexto | null>(null);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { router.push("/login"); return; }
      const { data } = await supabase.from("regras")
        .select("id,nome,tipo,gatilhos,frases_exemplo,resposta,ativa,fixa")
        .order("fixa", { ascending: false }).order("prioridade", { ascending: false });
      setRegras((data ?? []) as RegraCtx[]);
    };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const montar = async () => {
    setCarregando(true);
    const { data } = await supabase.from("telefones")
      .select("telefone,usuario_nome,ativo,anotar,permissoes")
      .in("telefone", variacoesTelefone(telefone)).limit(1).maybeSingle();
    const tel: TelCtx | null = data
      ? { telefone: data.telefone, usuario_nome: data.usuario_nome, ativo: data.ativo, anotar: data.anotar, permissoes: (data.permissoes as Record<string, string>) ?? {} }
      : null;
    setRes(montarContextoIA({ telefone, tel, regras, mensagem }));
    setCarregando(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PageHeader title="Pré-visualizar contexto da IA" actions={<Btn href="/regras" variant="ghost">← Voltar</Btn>} />

      <div style={{ flex: 1, overflow: "auto", padding: "16px" }}>
        <div style={{ maxWidth: 760, display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ padding: "10px 14px", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, fontSize: 13, color: "#1d4ed8" }}>
            Esse é o contexto montado <b>só com o que você cadastrou</b> (regras + permissões do telefone) — zero código por regra.
            Cadastre/edite em <b>Regras</b> e <b>Autorizações</b>, e veja aqui o que a IA receberia.
          </div>

          <div className="m-grid" style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 16 }}>
            <FormField label="Telefone (digite como quiser)">
              <input value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="31 98979-1317" style={inputStyle} />
            </FormField>
            <FormField label="Mensagem do usuário">
              <input value={mensagem} onChange={(e) => setMensagem(e.target.value)} style={inputStyle} />
            </FormField>
          </div>

          <div>
            <Btn onClick={montar} disabled={carregando || !telefone.trim()}>{carregando ? "Montando..." : "Montar contexto"}</Btn>
            <span style={{ marginLeft: 12, fontSize: 12, color: "#94a3b8" }}>{regras.length} regra(s) cadastrada(s)</span>
          </div>

          {res && (
            res.autorizado ? (
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#16a34a", marginBottom: 6 }}>✅ Autorizado — contexto que a IA receberia:</div>
                <pre style={{ background: "#0f172a", color: "#e2e8f0", padding: 16, borderRadius: 10, fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap", overflow: "auto" }}>{res.texto}</pre>
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 8 }}>
                  {res.regras.length} regra(s) disponível(is) pra esse telefone. Adicione uma regra em <b>/regras</b> e monte de novo — ela aparece aqui automaticamente.
                </div>
              </div>
            ) : (
              <div style={{ padding: "12px 14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, color: "#b91c1c", fontSize: 13 }}>
                🚫 Não autorizado — {res.motivo} <br />
                <span style={{ color: "#7f1d1d", fontSize: 12 }}>(A IA nem seria acionada; o bot responde &quot;não autorizado&quot;.)</span>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
