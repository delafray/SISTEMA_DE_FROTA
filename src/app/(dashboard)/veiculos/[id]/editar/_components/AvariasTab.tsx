"use client";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { DataTable, Th, Td, Tr, Btn, Badge, EmptyState, FormField, inputStyle, selectStyle, Alert } from "@/components/ui/ds";

type Avaria = {
  id: string; created_at: string | null; descricao_motorista: string | null;
  descricao_ia: string | null; urgencia: string; status: string;
  resolvido_em: string | null; foto_urls: string[] | null;
  motoristas: { nome: string } | { nome: string }[] | null;
};

const URG_VARIANT: Record<string, "danger" | "warning" | "default"> = {
  alta: "danger", media: "warning", baixa: "default",
};

const fmtDateTime = (s: string | null) => s ? new Date(s).toLocaleString("pt-BR") : "—";

export default function AvariasTab({ veiculoId, empresaId }: { veiculoId: string; empresaId: string }) {
  const supabase = createClient();
  const [avarias, setAvarias] = useState<Avaria[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [f, setF] = useState({
    descricao: "", urgencia: "media", status: "aberta",
  });

  const carregar = () => {
    return supabase.from("avarias")
      .select("id,created_at,descricao_motorista,descricao_ia,urgencia,status,resolvido_em,foto_urls,motoristas(nome)")
      .eq("veiculo_id", veiculoId).order("created_at", { ascending: false })
      .then(({ data }) => setAvarias((data ?? []) as Avaria[]));
  };

  useEffect(() => {
    carregar().then(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [veiculoId]);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF(p => ({ ...p, [k]: e.target.value }));

  const lancar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro("");
    if (!f.descricao.trim()) { setErro("Descreva a avaria"); return; }
    setSalvando(true);
    const { error } = await supabase.from("avarias").insert({
      veiculo_id: veiculoId, empresa_id: empresaId,
      descricao_motorista: f.descricao, urgencia: f.urgencia, status: f.status,
    });
    setSalvando(false);
    if (error) { setErro(error.message); return; }
    setShowForm(false);
    setF({ descricao: "", urgencia: "media", status: "aberta" });
    await carregar();
  };

  const mudarStatus = async (av: Avaria, novo: string) => {
    const update: { status: string; resolvido_em?: string | null } = { status: novo };
    if (novo === "resolvida") update.resolvido_em = new Date().toISOString();
    if (av.status === "resolvida" && novo !== "resolvida") update.resolvido_em = null;
    const { error } = await supabase.from("avarias").update(update).eq("id", av.id);
    if (error) { setErro(error.message); return; }
    setAvarias(a => a.map(x => x.id === av.id ? { ...x, ...update } : x));
  };

  const excluir = async (id: string) => {
    if (!confirm("Excluir esta avaria?")) return;
    const { error } = await supabase.from("avarias").delete().eq("id", id);
    if (error) { setErro(error.message); return; }
    setAvarias(a => a.filter(x => x.id !== id));
  };

  if (loading) return <p style={{ color: "#94a3b8", padding: "16px" }}>Carregando...</p>;

  const abertas = avarias.filter(a => a.status === "aberta" || a.status === "em_reparo").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {erro && <Alert variant="error">⚠ {erro}</Alert>}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: "12px", color: "#64748b" }}>
          Total: <strong style={{ color: "#1e293b" }}>{avarias.length}</strong>
          {abertas > 0 && <span style={{ marginLeft: "12px", color: "#dc2626" }}>{abertas} em aberto</span>}
        </span>
        <Btn type="button" onClick={() => setShowForm(s => !s)} variant={showForm ? "outline" : "primary"}>
          {showForm ? "Cancelar" : "+ Registrar avaria"}
        </Btn>
      </div>

      {showForm && (
        <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "16px" }}>
          <div className="m-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px" }}>
            <div style={{ gridColumn: "span 3" }}>
              <FormField label="Descrição da avaria *" hint="Ex: pneu traseiro esquerdo estourou na BR-101 km 245">
                <textarea value={f.descricao} onChange={set("descricao")} rows={3}
                  style={{ ...inputStyle, resize: "vertical" }} />
              </FormField>
            </div>
            <FormField label="Urgência">
              <select value={f.urgencia} onChange={set("urgencia")} style={selectStyle}>
                <option value="baixa">Baixa</option>
                <option value="media">Média</option>
                <option value="alta">Alta</option>
              </select>
            </FormField>
            <FormField label="Status">
              <select value={f.status} onChange={set("status")} style={selectStyle}>
                <option value="aberta">Aberta</option>
                <option value="em_reparo">Em reparo</option>
                <option value="resolvida">Resolvida</option>
              </select>
            </FormField>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "12px" }}>
            <Btn type="button" variant="outline" onClick={() => setShowForm(false)}>Cancelar</Btn>
            <Btn type="button" onClick={lancar} disabled={salvando}>
              {salvando ? "Salvando..." : "Salvar avaria"}
            </Btn>
          </div>
        </div>
      )}

      {avarias.length === 0
        ? <EmptyState icon="🛠" message="Nenhuma avaria registrada para este veículo." />
        : (
          <DataTable count={avarias.length} label="avarias">
            <thead>
              <tr>
                <Th>Data</Th>
                <Th>Descrição</Th>
                <Th>Motorista</Th>
                <Th>Urgência</Th>
                <Th>Status</Th>
                <Th>Resolvida em</Th>
                <Th style={{ width: "40px" }} />
              </tr>
            </thead>
            <tbody>
              {avarias.map(av => {
                const m = Array.isArray(av.motoristas) ? av.motoristas[0] : av.motoristas;
                const desc = av.descricao_motorista || av.descricao_ia || "—";
                return (
                  <Tr key={av.id}>
                    <Td>{fmtDateTime(av.created_at)}</Td>
                    <Td style={{ maxWidth: "320px" }}>
                      <div style={{ whiteSpace: "normal", lineHeight: 1.4 }}>{desc}</div>
                      {av.foto_urls && av.foto_urls.length > 0 && (
                        <div style={{ fontSize: "10px", color: "#94a3b8", marginTop: "2px" }}>
                          📷 {av.foto_urls.length} foto{av.foto_urls.length !== 1 ? "s" : ""}
                        </div>
                      )}
                    </Td>
                    <Td style={{ color: "#64748b" }}>{m?.nome ?? "—"}</Td>
                    <Td><Badge variant={URG_VARIANT[av.urgencia] ?? "default"}>{av.urgencia}</Badge></Td>
                    <Td>
                      <select value={av.status} onChange={e => mudarStatus(av, e.target.value)}
                        style={{ ...selectStyle, padding: "8px 6px", fontSize: "11px", width: "auto", minHeight: "44px" }}>
                        <option value="aberta">Aberta</option>
                        <option value="em_reparo">Em reparo</option>
                        <option value="resolvida">Resolvida</option>
                        <option value="cancelada">Cancelada</option>
                      </select>
                    </Td>
                    <Td style={{ color: "#64748b", fontSize: "11px" }}>{fmtDateTime(av.resolvido_em)}</Td>
                    <Td>
                      <button type="button" onClick={() => excluir(av.id)}
                        style={{ background: "transparent", border: "none", cursor: "pointer", color: "#ef4444", fontSize: "13px" }}
                        title="Excluir">🗑</button>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </DataTable>
        )}
    </div>
  );
}
