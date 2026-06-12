"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { IMaskInput } from "react-imask";
import { createClient } from "@/lib/supabase/client";
import { PageHeader, FormSection, FormField, inputStyle, selectStyle, Btn, Alert } from "@/components/ui/ds";
import { EmpresaSelect } from "@/components/ui/EmpresaSelect";

export default function NovoVeiculoPage() {
  const router = useRouter();
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [empresaId, setEmpresaId] = useState("");

  const [f, setF] = useState({
    placa: "", marca: "", modelo: "", ano: "", chassi: "", renavam: "",
    combustivel: "diesel", tipo: "caminhao", categoria: "", cor: "", apelido: "",
    km_atual: "", capacidade_carga_kg: "", eixos: "", pbt_kg: "", capacidade_tanque: "",
    ipva_vencimento: "", licenciamento_vencimento: "", seguro_vencimento: "",
    seguradora: "", apolice_numero: "", data_aquisicao: "", valor_aquisicao: "",
  });

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF(p => ({ ...p, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    if (!f.placa || !f.marca || !f.modelo || !f.ano || !f.chassi || !f.renavam) {
      setErr("Preencha todos os campos obrigatórios (*)"); return;
    }
    setSaving(true);
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { setSaving(false); setErr("Não autenticado"); return; }
    if (!empresaId) { setSaving(false); setErr("Selecione a empresa"); return; }

    const { error: dbErr } = await supabase.from("veiculos").insert({
      empresa_id: empresaId,
      placa: f.placa.replace(/[-\s]/g, "").toUpperCase(),
      marca: f.marca.toUpperCase(), modelo: f.modelo.toUpperCase(),
      ano: parseInt(f.ano), chassi: f.chassi.toUpperCase(), renavam: f.renavam,
      combustivel: f.combustivel, tipo: f.tipo,
      cor: f.cor || null, apelido: f.apelido || null,
      categoria: f.categoria || null,
      km_atual: f.km_atual ? parseFloat(f.km_atual) : null,
      capacidade_carga_kg: f.capacidade_carga_kg ? parseFloat(f.capacidade_carga_kg) : null,
      eixos: f.eixos ? parseInt(f.eixos) : null,
      pbt_kg: f.pbt_kg ? parseFloat(f.pbt_kg) : null,
      capacidade_tanque: f.capacidade_tanque ? parseFloat(f.capacidade_tanque) : null,
      ipva_vencimento: f.ipva_vencimento || null,
      licenciamento_vencimento: f.licenciamento_vencimento || null,
      seguro_vencimento: f.seguro_vencimento || null,
      seguradora: f.seguradora || null, apolice_numero: f.apolice_numero || null,
      data_aquisicao: f.data_aquisicao || null,
      valor_aquisicao: f.valor_aquisicao ? parseFloat(f.valor_aquisicao) : null,
      ativo: true,
    });
    setSaving(false);
    if (dbErr) { setErr(dbErr.message); return; }
    router.push("/veiculos"); router.refresh();
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PageHeader 
        title="Cadastrar Veículo" 
        actions={
          <>
            <Btn href="/veiculos" variant="ghost">← Voltar para Lista</Btn>
            <span className="m-hide"><Btn href="/veiculos" variant="outline">Cancelar</Btn></span>
            <Btn type="submit" variant="primary" disabled={saving}>
              {saving ? "Salvando..." : "Salvar"}
            </Btn>
          </>
        }
      />

      <div style={{ flex: 1, overflow: "auto", padding: "16px" }}>
        <div style={{ width: "100%" }}>
          {err && <div style={{ marginBottom: "16px" }}><Alert variant="error">⚠ {err}</Alert></div>}

          <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>

            <FormSection title="Empresa">
              <div style={{ maxWidth: 320 }}>
                <EmpresaSelect value={empresaId} onChange={setEmpresaId} />
              </div>
            </FormSection>

            <FormSection title="Identificação *">
              <div className="m-grid" style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "16px" }}>
                <FormField label="Placa *">
                  <IMaskInput mask={[{ mask: "aaa-0000" }, { mask: "aaa-0a00" }]}
                    definitions={{ a: /[a-zA-Z]/ }} prepare={(s) => s.toUpperCase()}
                    onAccept={(v) => setF(p => ({ ...p, placa: v as string }))}
                    style={{ ...inputStyle, textTransform: "uppercase" }} placeholder="ABC-1234" />
                </FormField>
                <FormField label="Renavam *">
                  <IMaskInput mask="00000000000" onAccept={(v) => setF(p => ({ ...p, renavam: v as string }))} style={inputStyle} />
                </FormField>
                <div style={{ gridColumn: "span 2" }}>
                  <FormField label="Chassi (17 chars) *">
                    <input value={f.chassi} onChange={(e) => setF(p => ({ ...p, chassi: e.target.value.toUpperCase() }))}
                      maxLength={17} style={{ ...inputStyle, textTransform: "uppercase" }} />
                  </FormField>
                </div>
                <FormField label="Apelido">
                  <input value={f.apelido} onChange={set("apelido")} style={inputStyle} placeholder="Volvo Branco" />
                </FormField>
              </div>
            </FormSection>

            <FormSection title="Dados Técnicos">
              <div className="m-grid" style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "16px" }}>
                <div style={{ gridColumn: "span 2" }}>
                  <FormField label="Marca *">
                    <input value={f.marca} onChange={set("marca")} style={{ ...inputStyle, textTransform: "uppercase" }} placeholder="VOLVO" />
                  </FormField>
                </div>
                <div style={{ gridColumn: "span 2" }}>
                  <FormField label="Modelo *">
                    <input value={f.modelo} onChange={set("modelo")} style={{ ...inputStyle, textTransform: "uppercase" }} placeholder="FH 540" />
                  </FormField>
                </div>
                <FormField label="Ano *">
                  <IMaskInput mask="0000" inputMode="numeric" onAccept={(v) => setF(p => ({ ...p, ano: v as string }))} style={inputStyle} placeholder="2022" />
                </FormField>

                <FormField label="Tipo *">
                  <select value={f.tipo} onChange={set("tipo")} style={selectStyle}>
                    <option value="caminhao">Caminhão</option>
                    <option value="van">Van</option>
                    <option value="carro">Carro</option>
                    <option value="utilitario">Utilitário</option>
                  </select>
                </FormField>
                <FormField label="Categoria">
                  <select value={f.categoria} onChange={set("categoria")} style={selectStyle}>
                    <option value="">— Nenhuma —</option>
                    <option value="toco">Toco</option>
                    <option value="truck">Truck</option>
                    <option value="bitruck">Bi-Truck</option>
                    <option value="carreta">Carreta</option>
                    <option value="cavalo">Cavalo Mecânico</option>
                    <option value="3_4">3/4</option>
                  </select>
                </FormField>
                <FormField label="Combustível *">
                  <select value={f.combustivel} onChange={set("combustivel")} style={selectStyle}>
                    <option value="diesel">Diesel</option>
                    <option value="diesel_s10">Diesel S10</option>
                    <option value="gasolina">Gasolina</option>
                    <option value="etanol">Etanol</option>
                    <option value="flex">Flex</option>
                  </select>
                </FormField>
                <FormField label="Cor">
                  <input value={f.cor} onChange={set("cor")} style={{ ...inputStyle, textTransform: "uppercase" }} placeholder="BRANCO" />
                </FormField>
                <FormField label="Eixos">
                  <input value={f.eixos} onChange={set("eixos")} type="number" inputMode="numeric" style={inputStyle} />
                </FormField>

                <FormField label="KM Atual">
                  <input value={f.km_atual} onChange={set("km_atual")} type="number" inputMode="numeric" style={inputStyle} />
                </FormField>
                <FormField label="Cap. Carga (kg)">
                  <input value={f.capacidade_carga_kg} onChange={set("capacidade_carga_kg")} type="number" inputMode="decimal" style={inputStyle} />
                </FormField>
                <FormField label="PBT (kg)">
                  <input value={f.pbt_kg} onChange={set("pbt_kg")} type="number" inputMode="decimal" style={inputStyle} />
                </FormField>
                <FormField label="Tanque (L)">
                  <input value={f.capacidade_tanque} onChange={set("capacidade_tanque")} type="number" inputMode="decimal" style={inputStyle} />
                </FormField>
              </div>
            </FormSection>

            <FormSection title="Documentação e Seguros">
              <div className="m-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px" }}>
                {([["ipva_vencimento","IPVA Venc."],["licenciamento_vencimento","Licenciamento Venc."],["seguro_vencimento","Seguro Venc."],["data_aquisicao","Data Aquisição"]] as const).map(([k, label]) => (
                  <FormField key={k} label={label}>
                    <input value={f[k]} onChange={set(k)} type="date" style={inputStyle} />
                  </FormField>
                ))}
                <FormField label="Seguradora">
                  <input value={f.seguradora} onChange={set("seguradora")} style={inputStyle} />
                </FormField>
                <FormField label="Apólice Nº">
                  <input value={f.apolice_numero} onChange={set("apolice_numero")} style={inputStyle} />
                </FormField>
                <FormField label="Valor Aquisição (R$)">
                  <IMaskInput
                    mask="R$ num"
                    blocks={{ num: { mask: Number, scale: 2, thousandsSeparator: ".", radix: ",", normalizeZeros: true, padFractionalZeros: true } }}
                    inputMode="decimal"
                    onAccept={(_v, maskRef) => {
                      const raw = maskRef.unmaskedValue.replace(",", ".");
                      setF(p => ({ ...p, valor_aquisicao: raw }));
                    }}
                    style={inputStyle}
                    placeholder="R$ 0,00"
                  />
                </FormField>
              </div>
            </FormSection>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "16px", paddingTop: "16px", borderTop: "1px solid #e2e8f0" }}>
              <Btn href="/veiculos" variant="outline">Cancelar</Btn>
              <Btn type="submit" disabled={saving}>
                {saving ? "Salvando..." : "Salvar Veículo"}
              </Btn>
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}
