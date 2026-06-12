"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { IMaskInput } from "react-imask";
import { createClient } from "@/lib/supabase/client";
import { buscarCep } from "@/lib/utils/viacep";
import { PageHeader, FormSection, FormField, inputStyle, selectStyle, Btn, Alert, Tabs } from "@/components/ui/ds";
import { EmpresaSelect } from "@/components/ui/EmpresaSelect";
import { TransferenciaEmpresaModal } from "@/components/ui/TransferenciaEmpresaModal";
import { AcertoMensalTab } from "./_components/AcertoMensalTab";

const fmtCpf = (v: string) => v.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
const fmtWpp = (v: string) => v.replace(/^55/, "").replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
const fmtCep = (v: string) => v.replace(/(\d{5})(\d{3})/, "$1-$2");

export default function EditarMotoristaPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<"dados" | "cnh" | "remuneracao" | "endereco" | "veiculo" | "acerto">("dados");
  const [veiculos, setVeiculos]         = useState<{ id: string; placa: string; marca: string; modelo: string }[]>([]);
  const [vinculoVeiculoId, setVinculoVeiculoId] = useState("");   // veículo atual (derivado de alocacoes, read-only)
  const [empresaId, setEmpresaId] = useState("");
  const [empresaOriginal, setEmpresaOriginal] = useState("");
  const [mostrarTransfer, setMostrarTransfer] = useState(false);

  const [f, setF] = useState({
    nome: "", cpf: "", whatsapp: "", rg: "", data_nascimento: "", email: "",
    data_admissao: "", cargo: "",
    cnh_numero: "", cnh_categoria: "E", cnh_validade: "", cnh_primeira_habilitacao: "", cnh_ear: false,
    salario_fixo: "", valor_diaria_por_pedido: "",
    cep: "", logradouro: "", numero: "", complemento: "", bairro: "", cidade: "", uf: "",
    ativo: true, chave_pix: "", tipo_chave_pix: "cpf", usuario_id: "",
  });
  const [usuarios, setUsuarios] = useState<{ id: string; nome: string | null }[]>([]);

  useEffect(() => {
    // Carregar veículos e vínculo atual em paralelo
    const loadVeiculo = async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      // Veículos COMPARTILHADOS → todos os ativos.
      const [veicRes, alocRes] = await Promise.all([
        supabase.from("veiculos").select("id,placa,marca,modelo").eq("ativo", true).order("placa"),
        supabase.from("alocacoes").select("veiculo_id").eq("motorista_id", id).eq("status", "operacional").is("fim", null).maybeSingle(),
      ]);
      setVeiculos(veicRes.data ?? []);
      const { data: pf } = await supabase.from("perfis").select("id,nome").order("nome");
      setUsuarios(pf ?? []);
      setVinculoVeiculoId(alocRes.data?.veiculo_id ?? "");
    };
    loadVeiculo();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    supabase.from("motoristas").select("*").eq("id", id).single().then(({ data }) => {
      if (data) setF({
        nome: data.nome ?? "",
        cpf: fmtCpf(data.cpf ?? ""),
        whatsapp: fmtWpp(data.whatsapp ?? ""),
        rg: data.rg ?? "",
        data_nascimento: data.data_nascimento ?? "",
        email: data.email ?? "",
        data_admissao: data.data_admissao ?? "",
        cargo: data.cargo ?? "",
        cnh_numero: data.cnh_numero ?? "",
        cnh_categoria: data.cnh_categoria ?? "E",
        cnh_validade: data.cnh_validade ?? "",
        cnh_primeira_habilitacao: data.cnh_primeira_habilitacao ?? "",
        cnh_ear: data.cnh_ear ?? false,
        salario_fixo: data.salario_fixo != null ? String(data.salario_fixo) : "",
        valor_diaria_por_pedido: data.valor_diaria_por_pedido != null ? String(data.valor_diaria_por_pedido) : "",
        cep: fmtCep(data.cep ?? ""),
        logradouro: data.logradouro ?? "",
        numero: data.numero ?? "",
        complemento: data.complemento ?? "",
        bairro: data.bairro ?? "",
        cidade: data.cidade ?? "",
        uf: data.uf ?? "",
        ativo: data.ativo ?? true,
        chave_pix: data.chave_pix ?? "",
        tipo_chave_pix: data.tipo_chave_pix ?? "cpf",
        usuario_id: data.usuario_id ?? "",
      });
      if (data) { setEmpresaId(data.empresa_id ?? ""); setEmpresaOriginal(data.empresa_id ?? ""); }
      setLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF(p => ({ ...p, [k]: e.target.value }));

  const handleCepBlur = async () => {
    const digits = f.cep.replace(/\D/g, "");
    if (digits.length !== 8) return;
    const data = await buscarCep(f.cep);
    if (data) setF(p => ({ ...p, logradouro: data.logradouro.toUpperCase(), bairro: data.bairro.toUpperCase(), cidade: data.localidade.toUpperCase(), uf: data.uf.toUpperCase() }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    if (!f.cnh_numero || !f.cnh_validade) {
      setTab("cnh");
      setErr("Preencha os campos obrigatórios na aba CNH: Número CNH e Validade"); return;
    }
    if (!f.nome || !f.cpf || !f.whatsapp) {
      setTab("dados");
      setErr("Preencha os campos obrigatórios na aba Dados Pessoais: Nome, CPF e WhatsApp"); return;
    }
    // valores em R$ aceitam vírgula do leigo e nunca viram NaN no banco
    const normNum = (s: string) => parseFloat(s.replace(",", "."));
    const salarioNum = f.salario_fixo ? normNum(f.salario_fixo) : null;
    const diariaNum  = f.valor_diaria_por_pedido ? normNum(f.valor_diaria_por_pedido) : null;
    if ((salarioNum !== null && isNaN(salarioNum)) || (diariaNum !== null && isNaN(diariaNum))) {
      setTab("remuneracao");
      setErr("Salário/diária inválidos. Use vírgula ou ponto como separador decimal (ex.: 1500,50)."); return;
    }
    setSaving(true);
    const { error: dbErr } = await supabase.from("motoristas").update({
      nome: f.nome.toUpperCase(),
      cpf: f.cpf.replace(/\D/g, ""),
      whatsapp: f.whatsapp.replace(/\D/g, "").replace(/^(55)?/, "55").slice(0, 13),
      rg: f.rg || null,
      data_nascimento: f.data_nascimento || null,
      email: f.email.toLowerCase() || null,
      data_admissao: f.data_admissao || null,
      cargo: f.cargo || null,
      cnh_numero: f.cnh_numero,
      cnh_categoria: f.cnh_categoria,
      cnh_validade: f.cnh_validade,
      cnh_primeira_habilitacao: f.cnh_primeira_habilitacao || null,
      cnh_ear: f.cnh_ear,
      salario_fixo: salarioNum,
      valor_diaria_por_pedido: diariaNum,
      cep: f.cep.replace(/\D/g, "") || null,
      logradouro: f.logradouro || null, numero: f.numero || null,
      complemento: f.complemento || null, bairro: f.bairro || null,
      cidade: f.cidade || null, uf: f.uf || null,
      ativo: f.ativo,
      chave_pix: f.chave_pix || null,
      tipo_chave_pix: f.tipo_chave_pix,
      usuario_id: f.usuario_id || null,
    }).eq("id", id);
    setSaving(false);
    if (dbErr) { setErr(dbErr.message); return; }
    if (empresaId && empresaId !== empresaOriginal) { setMostrarTransfer(true); return; } // empresa mudou → modal
    router.push("/motoristas"); router.refresh();
  };

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#64748b" }}>
      Carregando...
    </div>
  );

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PageHeader
        title={`Editar Motorista — ${f.nome || "..."}`}
        actions={
          <>
            <Btn href="/motoristas" variant="ghost">← Voltar</Btn>
            {tab !== "veiculo" && tab !== "acerto" && (
              <>
                <span className="m-hide"><Btn href="/motoristas" variant="outline">Cancelar</Btn></span>
                <Btn type="submit" variant="primary" loading={saving}>
                  Atualizar
                </Btn>
              </>
            )}
          </>
        }
      />

      <div style={{ padding: "0 16px", background: "#fff" }}>
        <Tabs
          active={tab}
          onChange={(id) => setTab(id as typeof tab)}
          tabs={[
            { id: "dados",       label: "Dados Pessoais" },
            { id: "cnh",         label: "CNH" },
            { id: "remuneracao", label: "Remuneração" },
            { id: "endereco",    label: "Endereço" },
            { id: "veiculo",     label: "Veículo Padrão" },
            { id: "acerto",      label: "Acerto Mensal" },
          ]}
        />
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "16px" }}>
        <div style={{ width: "100%" }}>
          {err && <div style={{ marginBottom: "16px" }}><Alert variant="error">⚠ {err}</Alert></div>}

          <div style={{ display: tab === "dados" ? "block" : "none", maxWidth: 320, marginBottom: 24 }}>
            <EmpresaSelect value={empresaId} onChange={setEmpresaId} />
            {empresaOriginal && empresaId !== empresaOriginal && (
              <p style={{ fontSize: 12, color: "#b45309", marginTop: 6 }}>⚠️ Empresa alterada — ao salvar, vou perguntar o que fazer com o histórico (pagamentos).</p>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>

            <div style={{ display: tab === "dados" ? "block" : "none" }}>
              <FormSection title="Dados Pessoais">
                <div className="m-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px" }}>
                  <div style={{ gridColumn: "span 3" }}>
                    <FormField label="Nome Completo *">
                      <input value={f.nome} onChange={(e) => setF(p => ({ ...p, nome: e.target.value.toUpperCase() }))} style={{ ...inputStyle, textTransform: "uppercase" }} />
                    </FormField>
                  </div>
                  <FormField label="CPF *">
                    <IMaskInput mask="000.000.000-00" value={f.cpf}
                      onAccept={(v) => setF(p => ({ ...p, cpf: v as string }))} style={inputStyle} />
                  </FormField>
                  <FormField label="RG">
                    <input value={f.rg} onChange={set("rg")} style={inputStyle} />
                  </FormField>
                  <FormField label="WhatsApp *">
                    <IMaskInput mask="(00) 00000-0000" value={f.whatsapp}
                      onAccept={(v) => setF(p => ({ ...p, whatsapp: v as string }))} style={inputStyle} />
                  </FormField>
                  <FormField label="Nascimento">
                    <input value={f.data_nascimento} onChange={set("data_nascimento")} type="date" style={inputStyle} />
                  </FormField>
                  <FormField label="Admissão">
                    <input value={f.data_admissao} onChange={set("data_admissao")} type="date" style={inputStyle} />
                  </FormField>
                  <FormField label="Cargo">
                    <input value={f.cargo} onChange={set("cargo")} style={{ ...inputStyle, textTransform: "uppercase" }} />
                  </FormField>
                  <div style={{ gridColumn: "span 2" }}>
                    <FormField label="E-mail">
                      <input value={f.email} onChange={(e) => setF(p => ({ ...p, email: e.target.value }))} type="email" style={inputStyle} />
                    </FormField>
                  </div>
                  <FormField label="Status">
                    <select value={f.ativo ? "true" : "false"}
                      onChange={(e) => setF(p => ({ ...p, ativo: e.target.value === "true" }))}
                      style={selectStyle}>
                      <option value="true">Ativo</option>
                      <option value="false">Inativo</option>
                    </select>
                  </FormField>
                  <div style={{ gridColumn: "span 2" }}>
                    <FormField label="Usuário do sistema (login)" hint="Liga o motorista a um usuário — habilita o bot e fica verde no vínculo do veículo.">
                      <select value={f.usuario_id} onChange={set("usuario_id")} style={selectStyle}>
                        <option value="">— Sem usuário —</option>
                        {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nome ?? "(sem nome)"}</option>)}
                      </select>
                    </FormField>
                  </div>
                  <FormField label="Tipo Chave PIX">
                    <select value={f.tipo_chave_pix} onChange={set("tipo_chave_pix")} style={selectStyle}>
                      <option value="cpf">CPF/CNPJ</option>
                      <option value="telefone">Telefone</option>
                      <option value="email">E-mail</option>
                      <option value="aleatoria">Aleatória</option>
                    </select>
                  </FormField>
                  <div style={{ gridColumn: "span 3" }}>
                    <FormField label="Chave PIX">
                      <input value={f.chave_pix} onChange={set("chave_pix")} style={inputStyle} />
                    </FormField>
                  </div>
                </div>
              </FormSection>
            </div>

            <div style={{ display: tab === "cnh" ? "block" : "none" }}>
              <FormSection title="Habilitação (CNH)">
                <div className="m-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px" }}>
                  <div style={{ gridColumn: "span 2" }}>
                    <FormField label="Número CNH *">
                      <IMaskInput mask="00000000000" value={f.cnh_numero}
                        onAccept={(v) => setF(p => ({ ...p, cnh_numero: v as string }))} style={inputStyle} />
                    </FormField>
                  </div>
                  <FormField label="Categoria *">
                    <select value={f.cnh_categoria} onChange={set("cnh_categoria")} style={selectStyle}>
                      {["A","B","C","D","E","AB","AC","AD","AE"].map(c => <option key={c}>{c}</option>)}
                    </select>
                  </FormField>
                  <FormField label="Validade *">
                    <input value={f.cnh_validade} onChange={set("cnh_validade")} type="date" style={inputStyle} />
                  </FormField>
                  <FormField label="1ª Habilitação">
                    <input value={f.cnh_primeira_habilitacao} onChange={set("cnh_primeira_habilitacao")} type="date" style={inputStyle} />
                  </FormField>
                  <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: "10px" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                      <input type="checkbox" checked={f.cnh_ear} onChange={(e) => setF(p => ({ ...p, cnh_ear: e.target.checked }))} style={{ width: "16px", height: "16px", accentColor: "#2563eb" }} />
                      <span style={{ fontSize: "13px", color: "#334155" }}>EAR (Ativ. Remunerada)</span>
                    </label>
                  </div>
                </div>
              </FormSection>
            </div>

            <div style={{ display: tab === "remuneracao" ? "block" : "none" }}>
              <FormSection title="Remuneração">
                <p style={{ fontSize: "13px", color: "#64748b", marginBottom: "16px" }}>
                  Motorista recebe salário fixo mensal e/ou diária por pedido concluído.
                </p>
                <div className="m-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px" }}>
                  <div style={{ gridColumn: "span 2" }}>
                    <FormField label="Salário Fixo Mensal (R$)">
                      <input value={f.salario_fixo} onChange={set("salario_fixo")} type="number" step="0.01" inputMode="decimal" style={inputStyle} placeholder="0,00" />
                    </FormField>
                  </div>
                  <div style={{ gridColumn: "span 2" }}>
                    <FormField label="Valor da Diária por Pedido (R$)">
                      <input value={f.valor_diaria_por_pedido} onChange={set("valor_diaria_por_pedido")} type="number" step="0.01" inputMode="decimal" style={inputStyle} placeholder="0,00" />
                    </FormField>
                  </div>
                </div>
              </FormSection>
            </div>

            <div style={{ display: tab === "endereco" ? "block" : "none" }}>
              <FormSection title="Endereço">
                <div className="m-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px" }}>
                  <FormField label="CEP">
                    <IMaskInput mask="00000-000" value={f.cep}
                      onAccept={(v) => setF(p => ({ ...p, cep: v as string }))}
                      onBlur={handleCepBlur}
                      style={{ ...inputStyle, background: "#f0f9ff", borderColor: "#bae6fd" }} />
                  </FormField>
                  <div style={{ gridColumn: "span 3" }}>
                    <FormField label="Logradouro">
                      <input value={f.logradouro} onChange={set("logradouro")} style={{ ...inputStyle, textTransform: "uppercase" }} />
                    </FormField>
                  </div>
                  <FormField label="Número">
                    <input value={f.numero} onChange={set("numero")} style={{ ...inputStyle, textTransform: "uppercase" }} />
                  </FormField>
                  <FormField label="Complemento">
                    <input value={f.complemento} onChange={set("complemento")} style={{ ...inputStyle, textTransform: "uppercase" }} />
                  </FormField>
                  <div style={{ gridColumn: "span 2" }}>
                    <FormField label="Bairro">
                      <input value={f.bairro} onChange={set("bairro")} style={{ ...inputStyle, textTransform: "uppercase" }} />
                    </FormField>
                  </div>
                  <div style={{ gridColumn: "span 3" }}>
                    <FormField label="Cidade">
                      <input value={f.cidade} onChange={set("cidade")} style={{ ...inputStyle, textTransform: "uppercase" }} />
                    </FormField>
                  </div>
                  <FormField label="UF">
                    <input value={f.uf} onChange={set("uf")} maxLength={2} style={{ ...inputStyle, textTransform: "uppercase", textAlign: "center" }} />
                  </FormField>
                </div>
              </FormSection>
            </div>

            <div style={{ display: tab === "veiculo" ? "block" : "none" }}>
              <FormSection title="Veículo Atual">
                {(() => {
                  const v = veiculos.find((x) => x.id === vinculoVeiculoId);
                  return (
                    <div>
                      <div style={{ fontSize: "15px", fontWeight: 700, color: v ? "#1e293b" : "#94a3b8" }}>
                        {v ? `${v.placa} — ${v.marca} ${v.modelo}` : "Sem veículo vinculado no momento"}
                      </div>
                      <p style={{ fontSize: "13px", color: "#64748b", marginTop: "8px" }}>
                        O vínculo motorista↔veículo agora é gerenciado (com histórico) na tela do <b>Veículo</b>, no bloco &ldquo;Responsável / Vínculo&rdquo;. Aqui é só leitura.
                      </p>
                      {v && (
                        <div style={{ marginTop: "12px" }}>
                          <Btn href={`/veiculos/${v.id}/editar`} size="md" variant="outline">Abrir veículo →</Btn>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </FormSection>
            </div>

            {tab === "acerto" && (
              <AcertoMensalTab motoristaId={id} />
            )}

            <div style={{ display: tab !== "veiculo" && tab !== "acerto" ? "flex" : "none", justifyContent: "flex-end", gap: "12px", marginTop: "16px", paddingTop: "16px", borderTop: "1px solid #e2e8f0" }}>
              <Btn href="/motoristas" variant="outline">Cancelar</Btn>
              <Btn type="submit" disabled={saving}>
                {saving ? "Salvando..." : "Atualizar Motorista"}
              </Btn>
            </div>
          </div>
        </div>
      </div>

      {mostrarTransfer && (
        <TransferenciaEmpresaModal
          tipo="motorista" alvoId={id} novaEmpresa={empresaId}
          onDone={() => { router.push("/motoristas"); router.refresh(); }}
          onCancel={() => setMostrarTransfer(false)}
        />
      )}
    </form>
  );
}
