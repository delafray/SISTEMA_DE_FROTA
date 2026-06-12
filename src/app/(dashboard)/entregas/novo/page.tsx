"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IMaskInput } from "react-imask";
import { createClient } from "@/lib/supabase/client";
import { empresaDoVeiculo, empresaDoMotorista } from "@/lib/utils/empresaDe";
import { PageHeader, FormSection, FormField, inputStyle, selectStyle, Btn, Alert, Tabs } from "@/components/ui/ds";

type Veiculo = { id: string; placa: string; modelo: string; marca: string; km_atual: number | null };
type Motorista = {
  id: string; nome: string;
  salario_fixo: number | null; valor_diaria_por_pedido: number | null;
};

type TabId = "operacional" | "cronograma" | "financeiro";

export default function NovoPedidoPage() {
  const router = useRouter();
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<TabId>("operacional");
  const [camposInvalidos, setCamposInvalidos] = useState<Set<string>>(new Set());

  const [veiculos, setVeiculos] = useState<Veiculo[]>([]);
  const [motoristas, setMotoristas] = useState<Motorista[]>([]);

  const [f, setF] = useState({
    veiculo_id: "", motorista_id: "",
    valor_pedido: "", km_inicial: "",
    data_inicio_prevista: "", data_fim_prevista: "",
    forma_pagamento: "a_vista",
    observacoes: "",
  });

  const [motoristaSel, setMotoristaSel] = useState<Motorista | null>(null);

  const motoristaHint = () => {
    if (!motoristaSel) return null;
    const parts: string[] = [];
    if (motoristaSel.salario_fixo != null) {
      parts.push(`Salário R$ ${motoristaSel.salario_fixo.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`);
    }
    if (motoristaSel.valor_diaria_por_pedido != null) {
      parts.push(`Diária R$ ${motoristaSel.valor_diaria_por_pedido.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`);
    }
    return parts.length > 0 ? parts.join(" · ") : null;
  };

  useEffect(() => {
    const load = async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      // Disponibilidade COMPARTILHADA → todos os veículos/motoristas ativos.
      const [v, m] = await Promise.all([
        supabase.from("veiculos").select("id,placa,modelo,marca,km_atual").eq("ativo", true).order("placa"),
        supabase.from("motoristas").select("id,nome,salario_fixo,valor_diaria_por_pedido").eq("ativo", true).order("nome"),
      ]);
      setVeiculos(v.data ?? []);
      setMotoristas(m.data ?? []);
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- roda só no mount; `supabase` é client estável (createClient)
  }, []);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF(p => ({ ...p, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setCamposInvalidos(new Set());
    if (!f.veiculo_id || !f.motorista_id) {
      setTab("operacional");
      const invalidos = new Set<string>();
      if (!f.veiculo_id) invalidos.add("veiculo_id");
      if (!f.motorista_id) invalidos.add("motorista_id");
      setCamposInvalidos(invalidos);
      setErr("Preencha: Veículo e Motorista"); return;
    }
    if (!f.km_inicial) {
      setTab("cronograma");
      setCamposInvalidos(new Set(["km_inicial"]));
      setErr("Preencha: KM Inicial"); return;
    }
    setSaving(true);
    // Frete HERDA a empresa do CAMINHÃO usado.
    const empresa_id = await empresaDoVeiculo(supabase, f.veiculo_id);
    if (!empresa_id) { setSaving(false); setErr("Caminhão sem empresa definida"); return; }
    const empresa_motorista_id = await empresaDoMotorista(supabase, f.motorista_id); // foto: detecta "emprestado"

    const { error: dbErr } = await supabase.from("pedidos").insert({
      empresa_id,
      empresa_motorista_id,
      veiculo_id: f.veiculo_id,
      motorista_id: f.motorista_id,
      valor_pedido: f.valor_pedido ? parseFloat(f.valor_pedido) : null,
      km_inicial: parseFloat(f.km_inicial),
      data_inicio_prevista: f.data_inicio_prevista || null,
      data_fim_prevista: f.data_fim_prevista || null,
      forma_pagamento: f.forma_pagamento || null,
      observacoes: f.observacoes || null,
      status: "agendada",
    });
    setSaving(false);
    if (dbErr) { setErr(dbErr.message); return; }
    router.push("/entregas"); router.refresh();
  };

  const veiculoSel = veiculos.find(v => v.id === f.veiculo_id);
  const sem_recursos = veiculos.length === 0 || motoristas.length === 0;

  return (
    <form
      onSubmit={handleSubmit}
      // Enter num input não envia o formulário — só o botão de salvar.
      onKeyDown={e => {
        if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") e.preventDefault();
      }}
      style={{ display: "flex", flexDirection: "column", height: "100%" }}
    >
      <PageHeader
        title="Novo Pedido"
        actions={
          <>
            <Btn href="/entregas" variant="ghost">← Voltar</Btn>
            <Btn href="/entregas" variant="outline">Cancelar</Btn>
          </>
        }
      />

      <div style={{ padding: "0 16px", background: "#fff" }}>
        <Tabs
          active={tab}
          onChange={(id) => setTab(id as TabId)}
          tabs={[
            { id: "operacional", label: "Operacional" },
            { id: "cronograma", label: "Cronograma" },
            { id: "financeiro", label: "Financeiro" },
          ]}
        />
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "16px" }}>
        {err && <div style={{ marginBottom: "16px" }}><Alert variant="error">⚠ {err}</Alert></div>}

        {sem_recursos && (
          <div style={{ marginBottom: "16px" }}>
            <Alert variant="warning">
              ⚠ Cadastre pelo menos 1 veículo e 1 motorista antes de criar um pedido.
              {veiculos.length === 0 && <Link href="/veiculos/novo" style={{ textDecoration: "underline", marginLeft: "4px" }}>Cadastrar Veículo</Link>}
              {motoristas.length === 0 && <Link href="/motoristas/novo" style={{ textDecoration: "underline", marginLeft: "4px" }}>Cadastrar Motorista</Link>}
            </Alert>
          </div>
        )}

        {tab === "operacional" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <FormSection title="Veículo e Motorista">
              <div className="m-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "16px" }}>
                <FormField label="Veículo *">
                  <select value={f.veiculo_id} onChange={(e) => {
                    set("veiculo_id")(e);
                    setCamposInvalidos(prev => { const s = new Set(prev); s.delete("veiculo_id"); return s; });
                    const v = veiculos.find(v => v.id === e.target.value);
                    if (v?.km_atual != null)
                      setF(p => ({ ...p, veiculo_id: e.target.value, km_inicial: String(v.km_atual) }));
                  }} style={{ ...selectStyle, ...(camposInvalidos.has("veiculo_id") ? { border: "2px solid #ef4444" } : {}) }}>
                    <option value="">— Selecione —</option>
                    {veiculos.map(v => (
                      <option key={v.id} value={v.id}>{v.placa} — {v.marca} {v.modelo}</option>
                    ))}
                  </select>
                  {veiculoSel && <p style={{ fontSize: "11px", color: "#2563eb", marginTop: "4px" }}>KM atual: {veiculoSel.km_atual?.toLocaleString("pt-BR") ?? "—"}</p>}
                </FormField>

                <FormField label="Motorista *">
                  <select value={f.motorista_id} onChange={(e) => {
                    set("motorista_id")(e);
                    setCamposInvalidos(prev => { const s = new Set(prev); s.delete("motorista_id"); return s; });
                    setMotoristaSel(motoristas.find(m => m.id === e.target.value) ?? null);
                  }} style={{ ...selectStyle, ...(camposInvalidos.has("motorista_id") ? { border: "2px solid #ef4444" } : {}) }}>
                    <option value="">— Selecione —</option>
                    {motoristas.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
                  </select>
                  {motoristaSel && motoristaHint() && (
                    <p style={{ fontSize: "11px", color: "#7c3aed", marginTop: "4px" }}>
                      {motoristaHint()}
                    </p>
                  )}
                </FormField>
              </div>
            </FormSection>

            <FormSection title="Observações">
              <textarea value={f.observacoes} onChange={set("observacoes")} rows={3}
                style={{ ...inputStyle, resize: "vertical", height: "auto" }}
                placeholder="Detalhes do pedido, referências..." />
            </FormSection>
          </div>
        )}

        {tab === "cronograma" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <FormSection title="Quilometragem">
              <div className="m-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "16px" }}>
                <FormField label="KM Inicial *" hint={veiculoSel?.km_atual != null ? `Sugestão: ${veiculoSel.km_atual.toLocaleString("pt-BR")} km (atual do veículo)` : undefined}>
                  <input value={f.km_inicial} onChange={e => { set("km_inicial")(e); setCamposInvalidos(prev => { const s = new Set(prev); s.delete("km_inicial"); return s; }); }} type="number" step="0.1" inputMode="decimal" style={{ ...inputStyle, ...(camposInvalidos.has("km_inicial") ? { border: "2px solid #ef4444" } : {}) }} placeholder={veiculoSel?.km_atual?.toString() ?? "0"} />
                  {veiculoSel?.km_atual && parseFloat(f.km_inicial || "0") < veiculoSel.km_atual && f.km_inicial && (
                    <p style={{ color: "#eab308", fontSize: "10px", marginTop: "4px" }}>⚠ KM menor que o atual do veículo ({veiculoSel.km_atual.toLocaleString("pt-BR")})</p>
                  )}
                </FormField>
              </div>
            </FormSection>

            <FormSection title="Datas previstas">
              <div className="m-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "16px" }}>
                <FormField label="Início Previsto">
                  <input value={f.data_inicio_prevista} onChange={set("data_inicio_prevista")} type="date" style={inputStyle} />
                </FormField>
                <FormField label="Fim Previsto">
                  <input value={f.data_fim_prevista} onChange={set("data_fim_prevista")} type="date" style={inputStyle} />
                </FormField>
              </div>
            </FormSection>
          </div>
        )}

        {tab === "financeiro" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <FormSection title="Valor e Pagamento">
              <div className="m-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "16px" }}>
                <FormField label="Valor do Pedido (R$)">
                  <IMaskInput mask="R$ num" blocks={{ num: { mask: Number, scale: 2, thousandsSeparator: ".", radix: ",", normalizeZeros: true, padFractionalZeros: true } }}
                    onAccept={(_, m) => setF(p => ({ ...p, valor_pedido: String(m.unmaskedValue) }))}
                    style={inputStyle} placeholder="R$ 0,00" />
                </FormField>
                <FormField label="Forma de Pagamento">
                  <select value={f.forma_pagamento} onChange={set("forma_pagamento")} style={selectStyle}>
                    <option value="a_vista">À vista</option>
                    <option value="7d">7 dias</option>
                    <option value="14d">14 dias</option>
                    <option value="21d">21 dias</option>
                    <option value="30d">30 dias</option>
                    <option value="45d">45 dias</option>
                    <option value="60d">60 dias</option>
                    <option value="outros">Outros</option>
                  </select>
                </FormField>
              </div>
            </FormSection>
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "24px", paddingTop: "16px", borderTop: "1px solid #e2e8f0" }}>
          <Btn href="/entregas" variant="outline">Cancelar</Btn>
          <Btn type="submit" disabled={saving || sem_recursos}>
            {saving ? "Salvando..." : "Criar Pedido"}
          </Btn>
        </div>
      </div>
    </form>
  );
}
