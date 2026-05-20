"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IMaskInput } from "react-imask";
import { createClient } from "@/lib/supabase/client";
import { PageHeader, FormSection, FormField, inputStyle, selectStyle, Btn, Alert, Tabs } from "@/components/ui/ds";

type Veiculo = { id: string; placa: string; modelo: string; marca: string; km_atual: number | null };
type Motorista = {
  id: string; nome: string; tipo_comissao: string;
  percentual_frete: number | null; valor_fixo_por_viagem: number | null;
  valor_por_km: number | null; salario_fixo: number | null;
};
type Cliente = { id: string; nome_fantasia: string; razao_social: string | null };

type TabId = "operacional" | "cronograma" | "financeiro";

export default function NovoFretePage() {
  const router = useRouter();
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<TabId>("operacional");

  const [veiculos, setVeiculos] = useState<Veiculo[]>([]);
  const [motoristas, setMotoristas] = useState<Motorista[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);

  const [f, setF] = useState({
    veiculo_id: "", motorista_id: "", cliente_id: "",
    nome_cliente_avulso: "",
    origem: "", destino: "",
    valor_frete: "", km_inicial: "",
    tipo_carga: "", peso_carga_kg: "",
    data_coleta_prevista: "", data_entrega_prevista: "",
    forma_pagamento: "a_vista",
    observacoes: "", criado_via: "web",
  });

  const [motoristaSel, setMotoristaSel] = useState<Motorista | null>(null);

  const comissaoHint = () => {
    if (!motoristaSel) return null;
    const m = motoristaSel;
    switch (m.tipo_comissao) {
      case "percentual_frete":
      case "salario_mais_percentual":
        if (!f.valor_frete || !m.percentual_frete) return `${m.percentual_frete ?? "?"}% do frete`;
        return `R$ ${((parseFloat(f.valor_frete) * m.percentual_frete) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} (${m.percentual_frete}%)`;
      case "valor_fixo_viagem":
        return m.valor_fixo_por_viagem != null
          ? `R$ ${m.valor_fixo_por_viagem.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} por viagem`
          : "Valor fixo por viagem";
      case "valor_por_km":
      case "salario_mais_km":
        return m.valor_por_km != null ? `R$ ${m.valor_por_km.toFixed(2)}/km` : "Por km rodado";
      case "salario_fixo":
        return m.salario_fixo != null
          ? `Salário fixo: R$ ${m.salario_fixo.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
          : "Salário fixo";
      default: return m.tipo_comissao.replace(/_/g, " ");
    }
  };

  useEffect(() => {
    const load = async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const { data: ue } = await supabase.from("usuario_empresas").select("empresa_id").eq("usuario_id", auth.user.id).eq("is_padrao", true).single();
      if (!ue?.empresa_id) return;
      const [v, m, c] = await Promise.all([
        supabase.from("veiculos").select("id,placa,modelo,marca,km_atual").eq("empresa_id", ue.empresa_id).eq("ativo", true).order("placa"),
        supabase.from("motoristas").select("id,nome,tipo_comissao,percentual_frete,valor_fixo_por_viagem,valor_por_km,salario_fixo").eq("empresa_id", ue.empresa_id).eq("ativo", true).order("nome"),
        supabase.from("clientes").select("id,nome_fantasia,razao_social").eq("empresa_id", ue.empresa_id).eq("ativo", true).order("nome_fantasia"),
      ]);
      setVeiculos(v.data ?? []);
      setMotoristas(m.data ?? []);
      setClientes(c.data ?? []);
    };
    load();
  }, []);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF(p => ({ ...p, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    if (!f.veiculo_id || !f.motorista_id || !f.origem || !f.destino || !f.km_inicial) {
      setErr("Preencha: Veículo, Motorista, Origem, Destino e KM Inicial"); return;
    }
    setSaving(true);
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { setSaving(false); setErr("Não autenticado"); return; }
    const { data: ue } = await supabase.from("usuario_empresas").select("empresa_id").eq("usuario_id", auth.user.id).eq("is_padrao", true).single();
    if (!ue?.empresa_id) { setSaving(false); setErr("Empresa não encontrada"); return; }

    const { error: dbErr } = await supabase.from("fretes").insert({
      empresa_id: ue.empresa_id,
      veiculo_id: f.veiculo_id,
      motorista_id: f.motorista_id,
      cliente_id: f.cliente_id || null,
      nome_cliente_avulso: (!f.cliente_id && f.nome_cliente_avulso) ? f.nome_cliente_avulso : null,
      origem: f.origem.toUpperCase(),
      destino: f.destino.toUpperCase(),
      valor_frete: f.valor_frete ? parseFloat(f.valor_frete) : null,
      km_inicial: parseFloat(f.km_inicial),
      tipo_carga: f.tipo_carga || null,
      peso_carga_kg: f.peso_carga_kg ? parseFloat(f.peso_carga_kg) : null,
      data_coleta_prevista: f.data_coleta_prevista || null,
      data_entrega_prevista: f.data_entrega_prevista || null,
      forma_pagamento: f.forma_pagamento || null,
      observacoes: f.observacoes || null,
      criado_via: "web",
      criado_por_usuario_id: auth.user.id,
      status: "agendado",
    });
    setSaving(false);
    if (dbErr) { setErr(dbErr.message); return; }
    router.push("/fretes"); router.refresh();
  };

  const veiculoSel = veiculos.find(v => v.id === f.veiculo_id);
  const sem_recursos = veiculos.length === 0 || motoristas.length === 0;

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PageHeader
        title="Novo Frete / Viagem"
        actions={
          <>
            <Btn href="/fretes" variant="ghost">← Voltar</Btn>
            <Btn href="/fretes" variant="outline">Cancelar</Btn>
            <Btn type="submit" variant="primary" disabled={saving || sem_recursos}>
              {saving ? "Salvando..." : "Salvar"}
            </Btn>
          </>
        }
      />

      <div style={{ padding: "0 16px", background: "#fff" }}>
        <Tabs
          active={tab}
          onChange={(id) => setTab(id as TabId)}
          tabs={[
            { id: "operacional", label: "Operacional" },
            { id: "cronograma", label: "Cronograma & Carga" },
            { id: "financeiro", label: "Financeiro" },
          ]}
        />
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "16px" }}>
        {err && <div style={{ marginBottom: "16px" }}><Alert variant="error">⚠ {err}</Alert></div>}

        {sem_recursos && (
          <div style={{ marginBottom: "16px" }}>
            <Alert variant="warning">
              ⚠ Cadastre pelo menos 1 veículo e 1 motorista antes de criar um frete.
              {veiculos.length === 0 && <Link href="/veiculos/novo" style={{ textDecoration: "underline", marginLeft: "4px" }}>Cadastrar Veículo</Link>}
              {motoristas.length === 0 && <Link href="/motoristas/novo" style={{ textDecoration: "underline", marginLeft: "4px" }}>Cadastrar Motorista</Link>}
            </Alert>
          </div>
        )}

        {tab === "operacional" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <FormSection title="Veículo, Motorista e Cliente">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px" }}>
                <FormField label="Veículo *">
                  <select value={f.veiculo_id} onChange={(e) => {
                    set("veiculo_id")(e);
                    const v = veiculos.find(v => v.id === e.target.value);
                    if (v?.km_atual != null)
                      setF(p => ({ ...p, veiculo_id: e.target.value, km_inicial: String(v.km_atual) }));
                  }} style={selectStyle}>
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
                    setMotoristaSel(motoristas.find(m => m.id === e.target.value) ?? null);
                  }} style={selectStyle}>
                    <option value="">— Selecione —</option>
                    {motoristas.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
                  </select>
                  {motoristaSel && (
                    <p style={{ fontSize: "11px", color: "#7c3aed", marginTop: "4px" }}>
                      Comissão: {comissaoHint()}
                    </p>
                  )}
                </FormField>

                <FormField label="Cliente (opcional)">
                  <select value={f.cliente_id} onChange={set("cliente_id")} style={selectStyle}>
                    <option value="">— Sem cliente cadastrado —</option>
                    {clientes.map(c => <option key={c.id} value={c.id}>{c.nome_fantasia}</option>)}
                  </select>
                </FormField>

                {!f.cliente_id && (
                  <FormField label="Identificação do Frete Avulso">
                    <input
                      value={f.nome_cliente_avulso}
                      onChange={set("nome_cliente_avulso")}
                      style={inputStyle}
                      placeholder='Ex: "Nego Doido — carga de batata BH→Brasília"'
                      maxLength={200}
                    />
                    <p style={{ fontSize: "11px", color: "#64748b", marginTop: "4px" }}>
                      Opcional. Identifica o contratante sem precisar cadastrá-lo no sistema.
                    </p>
                  </FormField>
                )}
              </div>
            </FormSection>

            <FormSection title="Rota">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <FormField label="Origem *">
                  <input value={f.origem} onChange={(e) => setF(p => ({ ...p, origem: e.target.value.toUpperCase() }))} style={{ ...inputStyle, textTransform: "uppercase" }} placeholder="EX: SÃO PAULO, SP" />
                </FormField>
                <FormField label="Destino *">
                  <input value={f.destino} onChange={(e) => setF(p => ({ ...p, destino: e.target.value.toUpperCase() }))} style={{ ...inputStyle, textTransform: "uppercase" }} placeholder="EX: CAMPINAS, SP" />
                </FormField>
              </div>
            </FormSection>

            <FormSection title="Observações">
              <textarea value={f.observacoes} onChange={set("observacoes")} rows={3}
                style={{ ...inputStyle, resize: "vertical", height: "auto" }}
                placeholder="Instruções de entrega, tipo de embalagem, referências..." />
            </FormSection>
          </div>
        )}

        {tab === "cronograma" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <FormSection title="Quilometragem">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "16px" }}>
                <FormField label="KM Inicial *" hint={veiculoSel?.km_atual != null ? `Sugestão: ${veiculoSel.km_atual.toLocaleString("pt-BR")} km (atual do veículo)` : undefined}>
                  <input value={f.km_inicial} onChange={set("km_inicial")} type="number" step="0.1" style={inputStyle} placeholder={veiculoSel?.km_atual?.toString() ?? "0"} />
                  {veiculoSel?.km_atual && parseFloat(f.km_inicial || "0") < veiculoSel.km_atual && f.km_inicial && (
                    <p style={{ color: "#eab308", fontSize: "10px", marginTop: "4px" }}>⚠ KM menor que o atual do veículo ({veiculoSel.km_atual.toLocaleString("pt-BR")})</p>
                  )}
                </FormField>
              </div>
            </FormSection>

            <FormSection title="Datas previstas">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "16px" }}>
                <FormField label="Data Coleta Prevista">
                  <input value={f.data_coleta_prevista} onChange={set("data_coleta_prevista")} type="date" style={inputStyle} />
                </FormField>
                <FormField label="Data Entrega Prevista">
                  <input value={f.data_entrega_prevista} onChange={set("data_entrega_prevista")} type="date" style={inputStyle} />
                </FormField>
              </div>
            </FormSection>

            <FormSection title="Carga">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "16px" }}>
                <FormField label="Tipo de Carga">
                  <input value={f.tipo_carga} onChange={set("tipo_carga")} style={{ ...inputStyle, textTransform: "uppercase" }} placeholder="EX: SOJA, CIMENTO" />
                </FormField>
                <FormField label="Peso (kg)">
                  <input value={f.peso_carga_kg} onChange={set("peso_carga_kg")} type="number" style={inputStyle} />
                </FormField>
              </div>
            </FormSection>
          </div>
        )}

        {tab === "financeiro" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <FormSection title="Valor e Pagamento">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "16px" }}>
                <FormField label="Valor do Frete (R$)">
                  <IMaskInput mask="R$ num" blocks={{ num: { mask: Number, scale: 2, thousandsSeparator: ".", radix: ",", normalizeZeros: true } }}
                    onAccept={(_, m) => setF(p => ({ ...p, valor_frete: String(m.unmaskedValue) }))}
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

            {motoristaSel && comissaoHint() && (
              <FormSection title="Comissão estimada">
                <div style={{ padding: "12px 16px", background: "#f5f3ff", border: "1px solid #ddd6fe", color: "#5b21b6", fontSize: "14px", fontWeight: 700, borderRadius: "8px" }}>
                  {comissaoHint()}
                </div>
                <p style={{ fontSize: "11px", color: "#94a3b8", marginTop: "6px" }}>
                  O valor final é calculado automaticamente ao concluir o frete.
                </p>
              </FormSection>
            )}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "24px", paddingTop: "16px", borderTop: "1px solid #e2e8f0" }}>
          <Btn href="/fretes" variant="outline">Cancelar</Btn>
          <Btn type="submit" disabled={saving || sem_recursos}>
            {saving ? "Salvando..." : "Criar Frete"}
          </Btn>
        </div>
      </div>
    </form>
  );
}
