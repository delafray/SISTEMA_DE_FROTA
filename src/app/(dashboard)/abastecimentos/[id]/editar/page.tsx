"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { usuarioSessao } from "@/lib/auth/temSessao";
import { PageHeader, FormSection, FormField, inputStyle, selectStyle, Btn, Alert } from "@/components/ui/ds";

type Veiculo   = { id: string; placa: string; modelo: string };
type Motorista = { id: string; nome: string };

export default function EditarAbastecimentoPage() {
  const { id }  = useParams<{ id: string }>();
  const router  = useRouter();
  const supabase = createClient();
  const [saving, setSaving]         = useState(false);
  const [loading, setLoading]       = useState(true);
  const [err, setErr]               = useState("");
  const [veiculos, setVeiculos]     = useState<Veiculo[]>([]);
  const [motoristas, setMotoristas] = useState<Motorista[]>([]);

  const [f, setF] = useState({
    veiculo_id: "", motorista_id: "",
    km_no_abast: "", litros: "", valor_litro: "", valor_total: "", posto: "",
    confirmado: false,
  });

  const set = (k: keyof Omit<typeof f, "confirmado">) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const val = e.target.value;
    setF(prev => {
      const next = { ...prev, [k]: val };
      if (k === "litros" || k === "valor_litro") {
        const l = parseFloat(k === "litros" ? val : prev.litros);
        const v = parseFloat(k === "valor_litro" ? val : prev.valor_litro);
        if (!isNaN(l) && !isNaN(v) && l > 0 && v > 0) {
          next.valor_total = (l * v).toFixed(2);
        }
      }
      return next;
    });
  };

  useEffect(() => {
    const load = async () => {
      const user = await usuarioSessao();
      if (!user) { router.replace("/login"); return; }
      const { data: ue } = await supabase.from("usuario_empresas").select("empresa_id")
        .eq("usuario_id", user.id).eq("is_padrao", true).single();
      if (!ue?.empresa_id) return;

      const [{ data: abast }, { data: v }, { data: m }] = await Promise.all([
        supabase.from("abastecimentos").select("*").eq("id", id).single(),
        supabase.from("veiculos").select("id,placa,modelo").eq("empresa_id", ue.empresa_id).eq("ativo", true).order("placa"),
        supabase.from("motoristas").select("id,nome").eq("empresa_id", ue.empresa_id).eq("ativo", true).order("nome"),
      ]);

      setVeiculos(v ?? []);
      setMotoristas(m ?? []);

      if (abast) {
        setF({
          veiculo_id:   abast.veiculo_id   ?? "",
          motorista_id: abast.motorista_id ?? "",
          km_no_abast:  abast.km_no_abast  != null ? String(abast.km_no_abast) : "",
          litros:       abast.litros       != null ? String(abast.litros)      : "",
          valor_litro:  abast.valor_litro  != null ? String(abast.valor_litro) : "",
          valor_total:  abast.valor_total  != null ? String(abast.valor_total) : "",
          posto:        abast.posto        ?? "",
          confirmado:   abast.confirmado   ?? false,
        });
      }
      setLoading(false);
    };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    if (!f.veiculo_id || !f.motorista_id || !f.litros || !f.valor_total) {
      setErr("Preencha os campos obrigatórios: Veículo, Motorista, Litros e Valor Total"); return;
    }
    setSaving(true);

    const { error: dbErr } = await supabase.from("abastecimentos").update({
      veiculo_id:   f.veiculo_id,
      motorista_id: f.motorista_id,
      km_no_abast:  f.km_no_abast  ? parseFloat(f.km_no_abast)  : null,
      litros:       parseFloat(f.litros),
      valor_litro:  f.valor_litro  ? parseFloat(f.valor_litro)  : null,
      valor_total:  parseFloat(f.valor_total),
      posto:        f.posto || null,
      confirmado:   f.confirmado,
    }).eq("id", id);

    setSaving(false);
    if (dbErr) { setErr(dbErr.message); return; }
    router.push("/abastecimentos"); router.refresh();
  };

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#64748b" }}>
      Carregando...
    </div>
  );

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PageHeader
        title="Editar Abastecimento"
        actions={
          <>
            <Btn href="/abastecimentos" variant="ghost">← Voltar para Lista</Btn>
            <Btn href="/abastecimentos" variant="outline">Cancelar</Btn>
            <Btn type="submit" variant="primary" disabled={saving}>
              {saving ? "Salvando..." : "Atualizar"}
            </Btn>
          </>
        }
      />

      <div style={{ flex: 1, overflow: "auto", padding: "16px" }}>
        <div style={{ width: "100%" }}>
          {err && <div style={{ marginBottom: "16px" }}><Alert variant="error">⚠ {err}</Alert></div>}

          <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>

            <FormSection title="Vínculos *">
              <div className="m-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "16px" }}>
                <FormField label="Veículo *">
                  <select value={f.veiculo_id} onChange={set("veiculo_id")} style={selectStyle}>
                    <option value="">— Selecione —</option>
                    {veiculos.map(v => (
                      <option key={v.id} value={v.id}>{v.placa} — {v.modelo}</option>
                    ))}
                  </select>
                </FormField>
                <FormField label="Motorista *">
                  <select value={f.motorista_id} onChange={set("motorista_id")} style={selectStyle}>
                    <option value="">— Selecione —</option>
                    {motoristas.map(m => (
                      <option key={m.id} value={m.id}>{m.nome}</option>
                    ))}
                  </select>
                </FormField>
              </div>
            </FormSection>

            <FormSection title="Dados do Abastecimento">
              <div className="m-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px" }}>
                <FormField label="KM no Abastecimento">
                  <input value={f.km_no_abast} onChange={set("km_no_abast")} type="number" inputMode="numeric" min="0" style={inputStyle} placeholder="150000" />
                </FormField>
                <FormField label="Litros *">
                  <input value={f.litros} onChange={set("litros")} type="number" inputMode="decimal" step="0.01" min="0" style={inputStyle} placeholder="100.00" />
                </FormField>
                <FormField label="Valor por Litro (R$)">
                  <input value={f.valor_litro} onChange={set("valor_litro")} type="number" inputMode="decimal" step="0.001" min="0" style={inputStyle} placeholder="6.490" />
                </FormField>
                <FormField label="Valor Total (R$) *">
                  <input value={f.valor_total} onChange={set("valor_total")} type="number" inputMode="decimal" step="0.01" min="0" style={inputStyle} placeholder="649.00" />
                </FormField>
                <div style={{ gridColumn: "span 2" }}>
                  <FormField label="Posto">
                    <input value={f.posto} onChange={set("posto")} style={{ ...inputStyle, textTransform: "uppercase" }} placeholder="POSTO IPIRANGA BR-101" />
                  </FormField>
                </div>
                <div style={{ display: "flex", alignItems: "flex-end" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", minHeight: "44px", padding: "12px 0" }}>
                    <input
                      type="checkbox"
                      checked={f.confirmado}
                      onChange={e => setF(p => ({ ...p, confirmado: e.target.checked }))}
                      style={{ width: "16px", height: "16px", accentColor: "#2563eb" }}
                    />
                    <span style={{ fontSize: "13px", color: "#334155" }}>Confirmado</span>
                  </label>
                </div>
              </div>
            </FormSection>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "16px", paddingTop: "16px", borderTop: "1px solid #e2e8f0" }}>
              <Btn href="/abastecimentos" variant="outline">Cancelar</Btn>
              <Btn type="submit" disabled={saving}>
                {saving ? "Salvando..." : "Atualizar Abastecimento"}
              </Btn>
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}
