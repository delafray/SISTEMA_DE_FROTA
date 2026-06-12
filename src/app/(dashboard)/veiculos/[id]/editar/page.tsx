"use client";
import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { IMaskInput } from "react-imask";
import { createClient } from "@/lib/supabase/client";
import { PageHeader, FormSection, FormField, inputStyle, selectStyle, Btn, Alert, DataTable, Th, Td, Tr, Tabs, Badge } from "@/components/ui/ds";
import { MobileCard, MobileList } from "@/components/mobile";
import { EmpresaSelect } from "@/components/ui/EmpresaSelect";
import { TransferenciaEmpresaModal } from "@/components/ui/TransferenciaEmpresaModal";
import PlanoTab from "./_components/PlanoTab";
import ManutencoesTab from "./_components/ManutencoesTab";
import AvariasTab from "./_components/AvariasTab";
import LogsTab from "./_components/LogsTab";
import VinculoResponsavel from "./_components/VinculoResponsavel";

type Abast = { id: string; created_at: string | null; km_no_abast: number | null; litros: number; valor_litro: number | null; valor_total: number; posto: string | null; confirmado: boolean | null };
type PedidoHist = { id: string; status: string; data_inicio_prevista: string | null; km_inicial: number | null; km_final: number | null; valor_pedido: number | null };

const fmtPlaca = (v: string) => v.length >= 4 ? v.slice(0, 3) + "-" + v.slice(3) : v;

type TabId = "dados" | "plano" | "manutencoes" | "avarias" | "logs" | "historico";
type DadosSubTabId = "principal" | "especificacoes" | "documentos";

export default function EditarVeiculoPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [abastecimentos, setAbastecimentos] = useState<Abast[]>([]);
  const [pedidoHist, setPedidoHist] = useState<PedidoHist[]>([]);
  const [histTab, setHistTab] = useState<"abast" | "pedidos">("abast");
  const [tab, setTab] = useState<TabId>("dados");
  const [dadosSubTab, setDadosSubTab] = useState<DadosSubTabId>("principal");
  const [empresaId, setEmpresaId] = useState<string>("");
  const [empresaOriginal, setEmpresaOriginal] = useState<string>("");
  const [mostrarTransfer, setMostrarTransfer] = useState(false);

  const [f, setF] = useState({
    placa: "", marca: "", modelo: "", ano: "", chassi: "", renavam: "",
    combustivel: "diesel", tipo: "caminhao", categoria: "", cor: "", apelido: "",
    km_atual: "", capacidade_carga_kg: "", eixos: "", pbt_kg: "", capacidade_tanque: "",
    ipva_vencimento: "", licenciamento_vencimento: "", seguro_vencimento: "",
    seguradora: "", apolice_numero: "", data_aquisicao: "", valor_aquisicao: "",
    ativo: true,
  });

  useEffect(() => {
    Promise.all([
      supabase.from("abastecimentos")
        .select("id,created_at,km_no_abast,litros,valor_litro,valor_total,posto,confirmado")
        .eq("veiculo_id", id).order("created_at", { ascending: false }).limit(20),
      supabase.from("pedidos")
        .select("id,status,data_inicio_prevista,km_inicial,km_final,valor_pedido")
        .eq("veiculo_id", id).order("created_at", { ascending: false }).limit(20),
    ]).then(([a, f]) => {
      setAbastecimentos(a.data ?? []);
      setPedidoHist(f.data ?? []);
    });

    supabase.from("veiculos").select("*").eq("id", id).single().then(({ data }) => {
      if (data) {
        setEmpresaId(data.empresa_id ?? "");
        setEmpresaOriginal(data.empresa_id ?? "");
        setF({
          placa: fmtPlaca(data.placa ?? ""),
          marca: data.marca ?? "",
          modelo: data.modelo ?? "",
          ano: String(data.ano ?? ""),
          chassi: data.chassi ?? "",
          renavam: data.renavam ?? "",
          combustivel: data.combustivel ?? "diesel",
          tipo: data.tipo ?? "caminhao",
          categoria: data.categoria ?? "",
          cor: data.cor ?? "",
          apelido: data.apelido ?? "",
          km_atual: data.km_atual != null ? String(data.km_atual) : "",
          capacidade_carga_kg: data.capacidade_carga_kg != null ? String(data.capacidade_carga_kg) : "",
          eixos: data.eixos != null ? String(data.eixos) : "",
          pbt_kg: data.pbt_kg != null ? String(data.pbt_kg) : "",
          capacidade_tanque: data.capacidade_tanque != null ? String(data.capacidade_tanque) : "",
          ipva_vencimento: data.ipva_vencimento ?? "",
          licenciamento_vencimento: data.licenciamento_vencimento ?? "",
          seguro_vencimento: data.seguro_vencimento ?? "",
          seguradora: data.seguradora ?? "",
          apolice_numero: data.apolice_numero ?? "",
          data_aquisicao: data.data_aquisicao ?? "",
          valor_aquisicao: data.valor_aquisicao != null ? String(data.valor_aquisicao) : "",
          ativo: data.ativo ?? true,
        });
      }
      setLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF(p => ({ ...p, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setErr("");
    if (!f.placa || !f.marca || !f.modelo || !f.ano || !f.chassi || !f.renavam) {
      setErr("Preencha todos os campos obrigatórios (*)"); return;
    }
    setSaving(true);
    const { error: dbErr } = await supabase.from("veiculos").update({
      placa: f.placa.replace(/[-\s]/g, "").toUpperCase(),
      marca: f.marca.toUpperCase(), modelo: f.modelo.toUpperCase(),
      ano: parseInt(f.ano), chassi: f.chassi.toUpperCase(), renavam: f.renavam,
      combustivel: f.combustivel, tipo: f.tipo,
      cor: f.cor || null, apelido: f.apelido || null,
      categoria: f.categoria || null,
      // km_atual NUNCA é atualizado pela aba Dados (campo protegido — aba Manutenções)
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
      ativo: f.ativo,
    }).eq("id", id);
    setSaving(false);
    if (dbErr) { setErr(dbErr.message); return; }
    // Empresa mudou → pergunta o que fazer com o histórico (modal) antes de sair.
    if (empresaId && empresaId !== empresaOriginal) { setMostrarTransfer(true); return; }
    router.push("/veiculos"); router.refresh();
  };

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#64748b" }}>
      Carregando...
    </div>
  );

  const kmAtualNum = f.km_atual ? parseFloat(f.km_atual) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PageHeader
        title={`Editar Veículo — ${f.placa}`}
        actions={
          <>
            <Btn href="/veiculos" variant="ghost">← Voltar</Btn>
            {tab === "dados" && (
              <>
                <span className="m-hide"><Btn href="/veiculos" variant="outline">Cancelar</Btn></span>
                <Btn type="button" onClick={handleSubmit} variant="primary" loading={saving}>
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
          onChange={(id) => setTab(id as TabId)}
          tabs={[
            { id: "dados", label: "Dados" },
            { id: "plano", label: "Plano de Manutenção" },
            { id: "manutencoes", label: "Manutenções" },
            { id: "avarias", label: "Avarias" },
            { id: "logs", label: "Logs de KM" },
            { id: "historico", label: "Histórico", badge: abastecimentos.length + pedidoHist.length },
          ]}
        />
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "16px" }}>
        {err && <div style={{ marginBottom: "16px" }}><Alert variant="error">⚠ {err}</Alert></div>}

        {tab === "dados" && (() => {
          const subTabStyle = (active: boolean): React.CSSProperties => ({
            padding: "8px 16px",
            border: "none",
            background: active ? "#1e40af" : "#f1f5f9",
            color: active ? "#fff" : "#475569",
            fontSize: "13px",
            fontWeight: active ? 600 : 500,
            borderRadius: "6px",
            cursor: "pointer",
            transition: "all 120ms",
          });

          return (
            <form onSubmit={handleSubmit}>
              <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>

                {/* SUB-TABS */}
                <div className="m-tabs-scroll" style={{
                  display: "flex",
                  gap: "6px",
                  background: "#f8fafc",
                  padding: "8px",
                  borderRadius: "8px",
                  border: "1px solid #e2e8f0",
                  overflowX: "auto",
                  WebkitOverflowScrolling: "touch",
                }}>
                  {([
                    { id: "principal", label: "🚛 Principal" },
                    { id: "especificacoes", label: "📐 Especificações" },
                    { id: "documentos", label: "📄 Documentos e Seguros" },
                  ] as const).map(s => (
                    <button
                      key={s.id}
                      type="button"
                      style={subTabStyle(dadosSubTab === s.id)}
                      onClick={() => setDadosSubTab(s.id)}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>

                {/* SUB-TAB: PRINCIPAL */}
                {dadosSubTab === "principal" && (
                  <>
                    <FormSection title="Identificação *">
                      <div className="m-grid" style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "10px" }}>
                        <FormField label="Placa *">
                          <IMaskInput mask={[{ mask: "aaa-0000" }, { mask: "aaa-0a00" }]}
                            definitions={{ a: /[a-zA-Z]/ }} prepare={(s) => s.toUpperCase()}
                            value={f.placa}
                            onAccept={(v) => setF(p => ({ ...p, placa: v as string }))}
                            style={{ ...inputStyle, textTransform: "uppercase" }} />
                        </FormField>
                        <FormField label="Renavam *">
                          <IMaskInput mask="00000000000" value={f.renavam}
                            onAccept={(v) => setF(p => ({ ...p, renavam: v as string }))} style={inputStyle} />
                        </FormField>
                        <div style={{ gridColumn: "span 2" }}>
                          <FormField label="Chassi (17 chars) *">
                            <input value={f.chassi} onChange={(e) => setF(p => ({ ...p, chassi: e.target.value.toUpperCase() }))}
                              maxLength={17} style={{ ...inputStyle, textTransform: "uppercase" }} />
                          </FormField>
                        </div>
                        <FormField label="Apelido">
                          <input value={f.apelido} onChange={set("apelido")} style={inputStyle} />
                        </FormField>
                      </div>
                    </FormSection>

                    <FormSection title="Dados do Veículo">
                      <div className="m-grid" style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "10px" }}>
                        <div style={{ gridColumn: "span 2" }}>
                          <FormField label="Marca *">
                            <input value={f.marca} onChange={set("marca")} style={{ ...inputStyle, textTransform: "uppercase" }} />
                          </FormField>
                        </div>
                        <div style={{ gridColumn: "span 2" }}>
                          <FormField label="Modelo *">
                            <input value={f.modelo} onChange={set("modelo")} style={{ ...inputStyle, textTransform: "uppercase" }} />
                          </FormField>
                        </div>
                        <FormField label="Ano *">
                          <IMaskInput mask="0000" inputMode="numeric" value={f.ano}
                            onAccept={(v) => setF(p => ({ ...p, ano: v as string }))} style={inputStyle} />
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
                        <FormField label="KM Atual 🔒" hint="Campo protegido — altere pela aba 'Manutenções'">
                          <input value={f.km_atual} readOnly disabled type="number"
                            style={{ ...inputStyle, background: "#f1f5f9", color: "#64748b", cursor: "not-allowed" }} />
                        </FormField>
                        <FormField label="Status">
                          <select value={f.ativo ? "true" : "false"}
                            onChange={(e) => setF(p => ({ ...p, ativo: e.target.value === "true" }))}
                            style={selectStyle}>
                            <option value="true">Ativo</option>
                            <option value="false">Inativo</option>
                          </select>
                        </FormField>
                      </div>
                    </FormSection>

                    <FormSection title="Empresa">
                      <div style={{ maxWidth: 320 }}>
                        <EmpresaSelect value={empresaId} onChange={setEmpresaId} />
                      </div>
                      {empresaOriginal && empresaId !== empresaOriginal && (
                        <p style={{ fontSize: 12, color: "#b45309", marginTop: 6 }}>⚠️ Empresa alterada — ao salvar, vou perguntar o que fazer com o histórico.</p>
                      )}
                    </FormSection>

                    {empresaId && (
                      <FormSection title="Responsável / Vínculo">
                        <VinculoResponsavel veiculoId={id} empresaId={empresaId} kmAtual={kmAtualNum} onKm={(km) => setF((p) => ({ ...p, km_atual: String(km) }))} />
                      </FormSection>
                    )}
                  </>
                )}

                {/* SUB-TAB: ESPECIFICAÇÕES */}
                {dadosSubTab === "especificacoes" && (
                  <FormSection title="Especificações Técnicas">
                    <div className="m-grid" style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "16px" }}>
                      <FormField label="Cor">
                        <input value={f.cor} onChange={set("cor")} style={{ ...inputStyle, textTransform: "uppercase" }} />
                      </FormField>
                      <FormField label="Eixos">
                        <input value={f.eixos} onChange={set("eixos")} type="number" style={inputStyle} />
                      </FormField>
                      <FormField label="Cap. Carga (kg)">
                        <input value={f.capacidade_carga_kg} onChange={set("capacidade_carga_kg")} type="number" style={inputStyle} />
                      </FormField>
                      <FormField label="PBT (kg)">
                        <input value={f.pbt_kg} onChange={set("pbt_kg")} type="number" style={inputStyle} />
                      </FormField>
                      <FormField label="Tanque (L)">
                        <input value={f.capacidade_tanque} onChange={set("capacidade_tanque")} type="number" style={inputStyle} />
                      </FormField>
                    </div>
                  </FormSection>
                )}

                {/* SUB-TAB: DOCUMENTOS */}
                {dadosSubTab === "documentos" && (
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
                        <input value={f.valor_aquisicao} onChange={set("valor_aquisicao")} type="number" style={inputStyle} />
                      </FormField>
                    </div>
                  </FormSection>
                )}

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "16px", paddingTop: "16px", borderTop: "1px solid #e2e8f0" }}>
                  <Btn href="/veiculos" variant="outline">Cancelar</Btn>
                  <Btn type="submit" disabled={saving}>
                    {saving ? "Salvando..." : "Atualizar Veículo"}
                  </Btn>
                </div>
              </div>
            </form>
          );
        })()}

        {tab === "plano" && empresaId && <PlanoTab veiculoId={id} empresaId={empresaId} />}
        {tab === "manutencoes" && empresaId && <ManutencoesTab veiculoId={id} empresaId={empresaId} kmAtualVeiculo={kmAtualNum} />}
        {tab === "avarias" && empresaId && <AvariasTab veiculoId={id} empresaId={empresaId} />}
        {tab === "logs" && empresaId && <LogsTab veiculoId={id} empresaId={empresaId} />}

        {tab === "historico" && (
          <FormSection title="Histórico">
            <div style={{ display: "flex", borderBottom: "1px solid #e2e8f0", marginBottom: "12px" }}>
              {([["abast","Abastecimentos"],["pedidos","Pedidos"]] as const).map(([key, label]) => (
                <button key={key} type="button" onClick={() => setHistTab(key)} style={{
                  padding: "6px 16px", border: "none", background: "none", cursor: "pointer",
                  fontSize: "12px", fontWeight: histTab === key ? 700 : 500,
                  color: histTab === key ? "#2563eb" : "#64748b",
                  borderBottom: histTab === key ? "2px solid #2563eb" : "2px solid transparent",
                }}>{label} ({key === "abast" ? abastecimentos.length : pedidoHist.length})</button>
              ))}
            </div>

            {histTab === "abast" && (
              abastecimentos.length === 0
                ? <p style={{ fontSize: "12px", color: "#94a3b8" }}>Nenhum abastecimento registrado.</p>
                : <>
                    <div className="m-hide">
                      <DataTable count={abastecimentos.length} label="abastecimentos">
                        <thead><tr>
                          <Th>Data</Th><Th style={{ textAlign: "right" }}>KM</Th>
                          <Th style={{ textAlign: "right" }}>Litros</Th><Th style={{ textAlign: "right" }}>R$/L</Th>
                          <Th style={{ textAlign: "right" }}>Total</Th><Th>Posto</Th>
                        </tr></thead>
                        <tbody>
                          {abastecimentos.map(a => (
                            <Tr key={a.id}>
                              <Td>{a.created_at ? new Date(a.created_at).toLocaleDateString("pt-BR") : "—"}</Td>
                              <Td style={{ textAlign: "right" }}>{a.km_no_abast?.toLocaleString("pt-BR") ?? "—"}</Td>
                              <Td style={{ textAlign: "right" }}>{a.litros.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}</Td>
                              <Td style={{ textAlign: "right" }}>{a.valor_litro != null ? `R$ ${a.valor_litro.toFixed(3)}` : "—"}</Td>
                              <Td style={{ textAlign: "right", fontWeight: 600 }}>{a.valor_total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</Td>
                              <Td style={{ color: "#64748b" }}>{a.posto ?? "—"}</Td>
                            </Tr>
                          ))}
                        </tbody>
                      </DataTable>
                    </div>
                    <MobileList count={abastecimentos.length} label="abastecimentos">
                      {abastecimentos.map(a => (
                        <MobileCard
                          key={a.id}
                          title={a.posto ?? "Abastecimento"}
                          subtitle={a.created_at ? new Date(a.created_at).toLocaleDateString("pt-BR") : "—"}
                          details={[
                            { label: "KM", value: a.km_no_abast?.toLocaleString("pt-BR") ?? "—" },
                            { label: "Litros", value: a.litros.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) },
                            { label: "R$/L", value: a.valor_litro != null ? `R$ ${a.valor_litro.toFixed(3)}` : "—" },
                            { label: "Total", value: a.valor_total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) },
                          ]}
                        />
                      ))}
                    </MobileList>
                  </>
            )}

            {histTab === "pedidos" && (
              pedidoHist.length === 0
                ? <p style={{ fontSize: "12px", color: "#94a3b8" }}>Nenhum pedido registrado.</p>
                : <>
                    <div className="m-hide">
                      <DataTable count={pedidoHist.length} label="pedidos">
                        <thead><tr>
                          <Th>ID</Th><Th>Status</Th><Th>Data</Th>
                          <Th style={{ textAlign: "right" }}>KM Ini.</Th><Th style={{ textAlign: "right" }}>KM Fin.</Th>
                          <Th style={{ textAlign: "right" }}>Valor</Th>
                        </tr></thead>
                        <tbody>
                          {pedidoHist.map(ph => (
                            <Tr key={ph.id}>
                              <Td style={{ fontWeight: 500 }}>#{ph.id.slice(0, 8)}</Td>
                              <Td><span style={{ fontSize: "11px", fontWeight: 600 }}>{ph.status}</span></Td>
                              <Td>{ph.data_inicio_prevista ? new Date(ph.data_inicio_prevista + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</Td>
                              <Td style={{ textAlign: "right" }}>{ph.km_inicial?.toLocaleString("pt-BR") ?? "—"}</Td>
                              <Td style={{ textAlign: "right" }}>{ph.km_final?.toLocaleString("pt-BR") ?? "—"}</Td>
                              <Td style={{ textAlign: "right" }}>{ph.valor_pedido != null ? `R$ ${ph.valor_pedido.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—"}</Td>
                            </Tr>
                          ))}
                        </tbody>
                      </DataTable>
                    </div>
                    <MobileList count={pedidoHist.length} label="pedidos">
                      {pedidoHist.map(ph => (
                        <MobileCard
                          key={ph.id}
                          title={`#${ph.id.slice(0, 8)}`}
                          subtitle={ph.data_inicio_prevista ? new Date(ph.data_inicio_prevista + "T00:00:00").toLocaleDateString("pt-BR") : "—"}
                          badge={<Badge variant="default">{ph.status}</Badge>}
                          details={[
                            { label: "KM Ini.", value: ph.km_inicial?.toLocaleString("pt-BR") ?? "—" },
                            { label: "KM Fin.", value: ph.km_final?.toLocaleString("pt-BR") ?? "—" },
                            { label: "Valor", value: ph.valor_pedido != null ? `R$ ${ph.valor_pedido.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—" },
                          ]}
                        />
                      ))}
                    </MobileList>
                  </>
            )}
          </FormSection>
        )}
      </div>

      {mostrarTransfer && (
        <TransferenciaEmpresaModal
          tipo="veiculo" alvoId={id} novaEmpresa={empresaId}
          onDone={() => { router.push("/veiculos"); router.refresh(); }}
          onCancel={() => setMostrarTransfer(false)}
        />
      )}
    </div>
  );
}
