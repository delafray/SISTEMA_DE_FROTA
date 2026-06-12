"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { temSessao } from "@/lib/auth/temSessao";
import { empresaDoVeiculo } from "@/lib/utils/empresaDe";
import { PageHeader, FormSection, FormField, inputStyle, selectStyle, Btn, Alert } from "@/components/ui/ds";

type Veiculo  = { id: string; placa: string; modelo: string };
type Motorista = { id: string; nome: string };

export default function NovoAbastecimentoPage() {
  const router  = useRouter();
  const supabase = createClient();
  const [saving, setSaving]       = useState(false);
  const [err, setErr]             = useState("");
  const [veiculos, setVeiculos]   = useState<Veiculo[]>([]);
  const [motoristas, setMotoristas] = useState<Motorista[]>([]);

  const [f, setF] = useState({
    veiculo_id: "", motorista_id: "",
    km_no_abast: "", litros: "", valor_litro: "", valor_total: "", posto: "",
  });

  const normNum = (s: string) => parseFloat(s.replace(",", "."));

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const val = e.target.value;
    setF(prev => {
      const next = { ...prev, [k]: val };
      if ((k === "litros" || k === "valor_litro")) {
        const l = normNum(k === "litros" ? val : prev.litros);
        const v = normNum(k === "valor_litro" ? val : prev.valor_litro);
        if (!isNaN(l) && !isNaN(v) && l > 0 && v > 0) {
          next.valor_total = (l * v).toFixed(2);
        }
      }
      return next;
    });
  };

  useEffect(() => {
    const load = async () => {
      if (!(await temSessao())) { router.replace("/login"); return; }
      // Disponibilidade COMPARTILHADA entre os sócios → mostra TODOS os caminhões/motoristas ativos.
      const [{ data: v }, { data: m }] = await Promise.all([
        supabase.from("veiculos").select("id,placa,modelo").eq("ativo", true).order("placa"),
        supabase.from("motoristas").select("id,nome").eq("ativo", true).order("nome"),
      ]);
      setVeiculos(v ?? []);
      setMotoristas(m ?? []);
    };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    if (!f.veiculo_id || !f.motorista_id || !f.litros || !f.valor_total) {
      setErr("Preencha os campos obrigatórios: Veículo, Motorista, Litros e Valor Total"); return;
    }
    setSaving(true);
    // Custo HERDA a empresa do CAMINHÃO (o gasto cai na empresa dona do veículo).
    const empresa_id = await empresaDoVeiculo(supabase, f.veiculo_id);
    if (!empresa_id) { setSaving(false); setErr("Caminhão sem empresa definida"); return; }

    const litrosVal    = normNum(f.litros);
    const valorTotalVal = normNum(f.valor_total);
    if (isNaN(litrosVal) || isNaN(valorTotalVal)) {
      setSaving(false); setErr("Valor inválido. Use ponto ou vírgula como separador decimal."); return;
    }
    const { error: dbErr } = await supabase.from("abastecimentos").insert({
      empresa_id,
      veiculo_id:   f.veiculo_id,
      motorista_id: f.motorista_id,
      km_no_abast:  f.km_no_abast  ? normNum(f.km_no_abast)  : null,
      litros:       litrosVal,
      valor_litro:  f.valor_litro  ? normNum(f.valor_litro)  : null,
      valor_total:  valorTotalVal,
      posto:        f.posto ? f.posto.trim().toUpperCase() : null,
      confirmado:   false,
    });
    setSaving(false);
    if (dbErr) { setErr(dbErr.message); return; }
    router.push("/abastecimentos"); router.refresh();
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PageHeader
        title="Registrar Abastecimento"
        actions={
          <span className="m-hide">
            <Btn href="/abastecimentos" variant="ghost">← Voltar para Lista</Btn>
            <Btn href="/abastecimentos" variant="outline">Cancelar</Btn>
            <Btn type="submit" variant="primary" loading={saving}>
              {saving ? "Salvando..." : "Salvar"}
            </Btn>
          </span>
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
                  <input value={f.litros} onChange={set("litros")} type="text" inputMode="decimal" pattern="[0-9]*[.,]?[0-9]*" style={inputStyle} placeholder="100,00" />
                </FormField>
                <FormField label="Valor por Litro (R$)">
                  <input value={f.valor_litro} onChange={set("valor_litro")} type="text" inputMode="decimal" pattern="[0-9]*[.,]?[0-9]*" style={inputStyle} placeholder="6,490" />
                </FormField>
                <FormField label="Valor Total (R$) *">
                  <input value={f.valor_total} onChange={set("valor_total")} type="text" inputMode="decimal" pattern="[0-9]*[.,]?[0-9]*" style={inputStyle} placeholder="649,00" />
                  {f.litros && f.valor_litro && !isNaN(normNum(f.litros)) && !isNaN(normNum(f.valor_litro)) && (
                    <span style={{ fontSize: "11px", color: "#94a3b8", marginTop: "4px", display: "block" }}>Calculado: litros × valor/litro</span>
                  )}
                </FormField>
                <div style={{ gridColumn: "span 2" }}>
                  <FormField label="Posto">
                    <input value={f.posto} onChange={set("posto")} style={{ ...inputStyle, textTransform: "uppercase" }} placeholder="POSTO IPIRANGA BR-101" />
                  </FormField>
                </div>
              </div>
            </FormSection>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "16px", paddingTop: "16px", borderTop: "1px solid #e2e8f0", position: "sticky", bottom: 0, background: "#fff", zIndex: 10, paddingBottom: "16px" }}>
              <Btn href="/abastecimentos" variant="outline">Cancelar</Btn>
              <Btn type="submit" loading={saving}>
                {saving ? "Salvando..." : "Salvar Abastecimento"}
              </Btn>
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}
