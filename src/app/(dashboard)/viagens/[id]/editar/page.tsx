"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  PageHeader, FormSection, FormField, inputStyle, selectStyle,
  Btn, Alert, DataTable, Th, Td, Tr, Badge,
} from "@/components/ui/ds";

type Motorista = { id: string; nome: string };
type Veiculo   = { id: string; placa: string; marca: string; modelo: string };
type FreteAtual = {
  id: string;
  origem: string | null;
  destino: string | null;
  data_coleta_prevista: string | null;
  valor_frete: number | null;
  status: string;
  clientes: { nome_fantasia: string } | null;
};
type FreteDisp = FreteAtual;

const FRETE_STATUS_VAR: Record<string, "warning" | "info" | "success" | "danger"> = {
  agendado: "warning", em_andamento: "info", concluido: "success", cancelado: "danger",
};
const FRETE_STATUS_LABEL: Record<string, string> = {
  agendado: "Agendado", em_andamento: "Em Andamento", concluido: "Concluído", cancelado: "Cancelado",
};

const fmtBRL  = (v: number | null) => v != null ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
const fmtDate = (d: string | null) => d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR") : "—";

export default function EditarViagemPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [empresaId, setEmpresaId]       = useState("");
  const [motoristas, setMotoristas]     = useState<Motorista[]>([]);
  const [veiculos, setVeiculos]         = useState<Veiculo[]>([]);
  const [fretesAtuais, setFretesAtuais] = useState<FreteAtual[]>([]);
  const [fretesDisp, setFretesDisp]     = useState<FreteDisp[]>([]);
  const [selectedFretes, setSelectedFretes] = useState<Set<string>>(new Set());
  const [vinculoVeiculoId, setVinculoVeiculoId] = useState<string | null>(null);
  const [saving, setSaving]             = useState(false);
  const [loading, setLoading]           = useState(true);
  const [err, setErr]                   = useState("");

  const [f, setF] = useState({
    motorista_id: "", veiculo_id: "", status: "agendada",
    data_saida_prevista: "", data_chegada_prevista: "",
    data_saida_real: "", data_chegada_real: "",
    km_inicial: "", km_final: "", observacoes: "",
  });

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { router.push("/login"); return; }
      const { data: ue } = await supabase.from("usuario_empresas").select("empresa_id")
        .eq("usuario_id", auth.user.id).eq("is_padrao", true).single();
      if (!ue?.empresa_id) return;
      setEmpresaId(ue.empresa_id);

      const [viagemRes, motRes, veicRes, fretesAtRes, fretesDispRes] = await Promise.all([
        supabase.from("viagens").select("*").eq("id", id).single(),
        supabase.from("motoristas").select("id,nome").eq("empresa_id", ue.empresa_id).eq("ativo", true).order("nome"),
        supabase.from("veiculos").select("id,placa,marca,modelo").eq("empresa_id", ue.empresa_id).eq("ativo", true).order("placa"),
        supabase.from("fretes")
          .select("id,origem,destino,data_coleta_prevista,valor_frete,status,clientes(nome_fantasia)")
          .eq("viagem_id", id)
          .order("data_coleta_prevista", { ascending: true }),
        supabase.from("fretes")
          .select("id,origem,destino,data_coleta_prevista,valor_frete,status,clientes(nome_fantasia)")
          .eq("empresa_id", ue.empresa_id)
          .is("viagem_id", null)
          .in("status", ["agendado"])
          .order("data_coleta_prevista", { ascending: true }),
      ]);

      const v = viagemRes.data;
      if (v) {
        setF({
          motorista_id: v.motorista_id ?? "",
          veiculo_id:   v.veiculo_id   ?? "",
          status:       v.status       ?? "agendada",
          data_saida_prevista:   v.data_saida_prevista   ?? "",
          data_chegada_prevista: v.data_chegada_prevista ?? "",
          data_saida_real:   v.data_saida_real   ? v.data_saida_real.slice(0, 16)   : "",
          data_chegada_real: v.data_chegada_real ? v.data_chegada_real.slice(0, 16) : "",
          km_inicial: v.km_inicial != null ? String(v.km_inicial) : "",
          km_final:   v.km_final   != null ? String(v.km_final)   : "",
          observacoes: v.observacoes ?? "",
        });
      }

      setMotoristas(motRes.data ?? []);
      setVeiculos(veicRes.data ?? []);
      setFretesAtuais(fretesAtRes.data ?? []);
      setFretesDisp(fretesDispRes.data ?? []);
      setLoading(false);
    };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Auto-preencher veículo ao trocar motorista
  useEffect(() => {
    if (!f.motorista_id || !empresaId) return;
    const supabase = createClient();
    supabase.from("motorista_veiculo")
      .select("veiculo_id")
      .eq("empresa_id", empresaId)
      .eq("motorista_id", f.motorista_id)
      .eq("ativo", true)
      .single()
      .then(({ data }) => {
        if (data?.veiculo_id) setVinculoVeiculoId(data.veiculo_id);
        else setVinculoVeiculoId(null);
      });
  }, [f.motorista_id, empresaId]);

  const toggleFrete = (freteId: string) => {
    setSelectedFretes(prev => {
      const next = new Set(prev);
      next.has(freteId) ? next.delete(freteId) : next.add(freteId);
      return next;
    });
  };

  const desvincularFrete = async (freteId: string) => {
    const supabase = createClient();
    await supabase.from("fretes").update({ viagem_id: null }).eq("id", freteId);
    const frete = fretesAtuais.find(fr => fr.id === freteId);
    setFretesAtuais(p => p.filter(fr => fr.id !== freteId));
    if (frete) setFretesDisp(p => [...p, frete]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    if (!f.motorista_id) { setErr("Selecione um motorista"); return; }
    if (!f.veiculo_id)   { setErr("Selecione um veículo");   return; }
    setSaving(true);

    const supabase = createClient();
    const { error } = await supabase.from("viagens").update({
      motorista_id:          f.motorista_id,
      veiculo_id:            f.veiculo_id,
      status:                f.status,
      data_saida_prevista:   f.data_saida_prevista   || null,
      data_chegada_prevista: f.data_chegada_prevista || null,
      data_saida_real:       f.data_saida_real   ? new Date(f.data_saida_real).toISOString()   : null,
      data_chegada_real:     f.data_chegada_real ? new Date(f.data_chegada_real).toISOString() : null,
      km_inicial:  f.km_inicial  ? parseFloat(f.km_inicial)  : null,
      km_final:    f.km_final    ? parseFloat(f.km_final)    : null,
      observacoes: f.observacoes || null,
      updated_at:  new Date().toISOString(),
    }).eq("id", id);

    if (error) { setErr(error.message); setSaving(false); return; }

    // Vincular novos fretes selecionados
    if (selectedFretes.size > 0) {
      await supabase.from("fretes")
        .update({ viagem_id: id, motorista_id: f.motorista_id, veiculo_id: f.veiculo_id })
        .in("id", Array.from(selectedFretes));
    }

    router.push(`/viagens/${id}`);
    router.refresh();
  };

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF(p => ({ ...p, [k]: e.target.value }));

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#64748b" }}>
      Carregando...
    </div>
  );

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PageHeader
        title="Editar Viagem"
        actions={
          <>
            <Btn href={`/viagens/${id}`} variant="ghost">← Voltar</Btn>
            <Btn type="submit" variant="primary" disabled={saving}>
              {saving ? "Salvando..." : "Atualizar"}
            </Btn>
          </>
        }
      />

      <div style={{ flex: 1, overflow: "auto", padding: "16px" }}>
        <div style={{ maxWidth: "900px", display: "flex", flexDirection: "column", gap: "16px" }}>

          {err && <Alert variant="error">⚠ {err}</Alert>}

          <FormSection title="Motorista e Veículo">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              <FormField label="Motorista *">
                <select value={f.motorista_id} onChange={set("motorista_id")} style={selectStyle} required>
                  <option value="">Selecione...</option>
                  {motoristas.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
                </select>
              </FormField>
              <FormField
                label="Veículo *"
                hint={vinculoVeiculoId === f.veiculo_id && f.veiculo_id ? "✓ Veículo padrão deste motorista" : undefined}
              >
                <select value={f.veiculo_id} onChange={set("veiculo_id")} style={selectStyle} required>
                  <option value="">Selecione...</option>
                  {veiculos.map(v => <option key={v.id} value={v.id}>{v.placa} — {v.marca} {v.modelo}</option>)}
                </select>
              </FormField>
            </div>
          </FormSection>

          <FormSection title="Status e Datas">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px" }}>
              <FormField label="Status">
                <select value={f.status} onChange={set("status")} style={selectStyle}>
                  <option value="agendada">Agendada</option>
                  <option value="em_andamento">Em Andamento</option>
                  <option value="concluida">Concluída</option>
                  <option value="cancelada">Cancelada</option>
                </select>
              </FormField>
              <FormField label="Saída Prevista">
                <input type="date" value={f.data_saida_prevista} onChange={set("data_saida_prevista")} style={inputStyle} />
              </FormField>
              <FormField label="Chegada Prevista">
                <input type="date" value={f.data_chegada_prevista} onChange={set("data_chegada_prevista")} style={inputStyle} />
              </FormField>
              <FormField label="Saída Real">
                <input type="datetime-local" value={f.data_saida_real} onChange={set("data_saida_real")} style={inputStyle} />
              </FormField>
              <FormField label="Chegada Real">
                <input type="datetime-local" value={f.data_chegada_real} onChange={set("data_chegada_real")} style={inputStyle} />
              </FormField>
            </div>
          </FormSection>

          <FormSection title="Quilometragem">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              <FormField label="KM Inicial">
                <input type="number" value={f.km_inicial} onChange={set("km_inicial")} style={inputStyle} />
              </FormField>
              <FormField label="KM Final">
                <input type="number" value={f.km_final} onChange={set("km_final")} style={inputStyle} />
              </FormField>
            </div>
          </FormSection>

          <FormSection title="Observações">
            <textarea value={f.observacoes} onChange={set("observacoes")} rows={3}
              style={{ ...inputStyle, resize: "vertical" }} />
          </FormSection>

          {/* Fretes já na viagem */}
          <FormSection title={`Fretes nesta Viagem (${fretesAtuais.length})`}>
            {fretesAtuais.length === 0 ? (
              <p style={{ fontSize: "13px", color: "#94a3b8", margin: 0 }}>Nenhum frete vinculado.</p>
            ) : (
              <DataTable>
                <thead>
                  <tr>
                    <Th>Rota</Th>
                    <Th>Cliente</Th>
                    <Th>Coleta</Th>
                    <Th>Status</Th>
                    <Th>Valor</Th>
                    <Th></Th>
                  </tr>
                </thead>
                <tbody>
                  {fretesAtuais.map(fr => {
                    const cliente = Array.isArray(fr.clientes) ? fr.clientes[0] : fr.clientes;
                    return (
                      <Tr key={fr.id}>
                        <Td style={{ fontWeight: 600 }}>{fr.origem ?? "—"} → {fr.destino ?? "—"}</Td>
                        <Td>{cliente?.nome_fantasia ?? "—"}</Td>
                        <Td>{fmtDate(fr.data_coleta_prevista)}</Td>
                        <Td><Badge variant={FRETE_STATUS_VAR[fr.status] ?? "default"}>{FRETE_STATUS_LABEL[fr.status] ?? fr.status}</Badge></Td>
                        <Td style={{ color: "#16a34a", fontWeight: 600 }}>{fmtBRL(fr.valor_frete)}</Td>
                        <Td>
                          <button
                            type="button"
                            onClick={() => desvincularFrete(fr.id)}
                            style={{ fontSize: "11px", color: "#ef4444", background: "none", border: "none", cursor: "pointer", padding: "2px 6px" }}
                          >
                            Desvincular
                          </button>
                        </Td>
                      </Tr>
                    );
                  })}
                </tbody>
              </DataTable>
            )}
          </FormSection>

          {/* Fretes disponíveis para adicionar */}
          <FormSection title={`Adicionar Fretes (${selectedFretes.size} selecionados)`}>
            {fretesDisp.length === 0 ? (
              <p style={{ fontSize: "13px", color: "#94a3b8", margin: 0 }}>
                Nenhum frete agendado disponível para vincular.
              </p>
            ) : (
              <DataTable>
                <thead>
                  <tr>
                    <Th style={{ width: "32px" }}></Th>
                    <Th>Rota</Th>
                    <Th>Cliente</Th>
                    <Th>Coleta Prevista</Th>
                    <Th>Valor</Th>
                  </tr>
                </thead>
                <tbody>
                  {fretesDisp.map(fr => {
                    const cliente = Array.isArray(fr.clientes) ? fr.clientes[0] : fr.clientes;
                    const checked = selectedFretes.has(fr.id);
                    return (
                      <Tr key={fr.id}
                        style={{ cursor: "pointer", background: checked ? "rgba(219,234,254,0.4)" : undefined }}
                        onClick={() => toggleFrete(fr.id)}
                      >
                        <Td>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleFrete(fr.id)}
                            onClick={e => e.stopPropagation()}
                            style={{ width: "16px", height: "16px", accentColor: "#2563eb", cursor: "pointer" }}
                          />
                        </Td>
                        <Td style={{ fontWeight: 600 }}>{fr.origem ?? "—"} → {fr.destino ?? "—"}</Td>
                        <Td>{cliente?.nome_fantasia ?? "—"}</Td>
                        <Td>{fmtDate(fr.data_coleta_prevista)}</Td>
                        <Td style={{ color: "#16a34a", fontWeight: 600 }}>{fmtBRL(fr.valor_frete)}</Td>
                      </Tr>
                    );
                  })}
                </tbody>
              </DataTable>
            )}
          </FormSection>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", paddingTop: "16px", borderTop: "1px solid #e2e8f0" }}>
            <Btn href={`/viagens/${id}`} variant="outline">Cancelar</Btn>
            <Btn type="submit" disabled={saving}>{saving ? "Salvando..." : "Atualizar Viagem"}</Btn>
          </div>

        </div>
      </div>
    </form>
  );
}
