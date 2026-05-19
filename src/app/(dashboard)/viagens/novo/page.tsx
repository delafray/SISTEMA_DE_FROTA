"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  PageHeader, FormSection, FormField, inputStyle, selectStyle,
  Btn, Alert, DataTable, Th, Td, Tr,
} from "@/components/ui/ds";

type Motorista = { id: string; nome: string };
type Veiculo   = { id: string; placa: string; marca: string; modelo: string; km_atual: number | null };
type FreteDisp = {
  id: string;
  origem: string | null;
  destino: string | null;
  data_coleta_prevista: string | null;
  valor_frete: number | null;
  status: string;
  clientes: { nome_fantasia: string } | null;
};

const fmtBRL  = (v: number | null) => v != null ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
const fmtDate = (d: string | null) => d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR") : "—";

export default function NovaViagemPage() {
  const router = useRouter();
  const [empresaId, setEmpresaId]         = useState("");
  const [motoristas, setMotoristas]       = useState<Motorista[]>([]);
  const [veiculos, setVeiculos]           = useState<Veiculo[]>([]);
  const [fretesDisp, setFretesDisp]       = useState<FreteDisp[]>([]);
  const [selectedFretes, setSelectedFretes] = useState<Set<string>>(new Set());
  const [saving, setSaving]               = useState(false);
  const [err, setErr]                     = useState("");
  const [vinculoVeiculoId, setVinculoVeiculoId] = useState<string | null>(null);

  const [f, setF] = useState({
    motorista_id: "",
    veiculo_id:   "",
    status:       "agendada",
    data_saida_prevista:   "",
    data_chegada_prevista: "",
    km_inicial: "",
    observacoes: "",
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

      const [motRes, veicRes, fretRes] = await Promise.all([
        supabase.from("motoristas").select("id,nome").eq("empresa_id", ue.empresa_id).eq("ativo", true).order("nome"),
        supabase.from("veiculos").select("id,placa,marca,modelo,km_atual").eq("empresa_id", ue.empresa_id).eq("ativo", true).order("placa"),
        (supabase as any).from("fretes")
          .select("id,origem,destino,data_coleta_prevista,valor_frete,status,clientes(nome_fantasia)")
          .eq("empresa_id", ue.empresa_id)
          .is("viagem_id", null)
          .in("status", ["agendado"])
          .order("data_coleta_prevista", { ascending: true }),
      ]);

      setMotoristas(motRes.data ?? []);
      setVeiculos(veicRes.data ?? []);
      setFretesDisp(fretRes.data ?? []);
    };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-preencher veículo ao selecionar motorista
  useEffect(() => {
    if (!f.motorista_id || !empresaId) return;
    const supabase = createClient();
    (supabase as any).from("motorista_veiculo")
      .select("veiculo_id")
      .eq("empresa_id", empresaId)
      .eq("motorista_id", f.motorista_id)
      .eq("ativo", true)
      .single()
      .then(({ data }: { data: { veiculo_id: string } | null }) => {
        if (data?.veiculo_id) {
          setF(p => ({ ...p, veiculo_id: data.veiculo_id }));
          setVinculoVeiculoId(data.veiculo_id);
        } else {
          setVinculoVeiculoId(null);
        }
      });
  }, [f.motorista_id, empresaId]);

  const toggleFrete = (id: string) => {
    setSelectedFretes(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    if (!f.motorista_id) { setErr("Selecione um motorista"); return; }
    if (!f.veiculo_id)   { setErr("Selecione um veículo");   return; }
    setSaving(true);

    const supabase = createClient();
    const { data: viagem, error } = await (supabase as any).from("viagens").insert({
      empresa_id:            empresaId,
      motorista_id:          f.motorista_id,
      veiculo_id:            f.veiculo_id,
      status:                f.status,
      data_saida_prevista:   f.data_saida_prevista   || null,
      data_chegada_prevista: f.data_chegada_prevista || null,
      km_inicial:            f.km_inicial ? parseFloat(f.km_inicial) : null,
      observacoes:           f.observacoes || null,
    }).select("id").single();

    if (error || !viagem) { setErr(error?.message ?? "Erro ao criar viagem"); setSaving(false); return; }

    // Vincular fretes selecionados
    if (selectedFretes.size > 0) {
      await (supabase as any).from("fretes")
        .update({
          viagem_id:    viagem.id,
          motorista_id: f.motorista_id,
          veiculo_id:   f.veiculo_id,
        })
        .in("id", Array.from(selectedFretes));
    }

    router.push(`/viagens/${viagem.id}`);
    router.refresh();
  };

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF(p => ({ ...p, [k]: e.target.value }));

  const kmVeiculo = veiculos.find(v => v.id === f.veiculo_id)?.km_atual;

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PageHeader
        title="Nova Viagem"
        actions={
          <>
            <Btn href="/viagens" variant="ghost">← Voltar</Btn>
            <Btn type="submit" variant="primary" disabled={saving}>
              {saving ? "Salvando..." : "Criar Viagem"}
            </Btn>
          </>
        }
      />

      <div style={{ flex: 1, overflow: "auto", padding: "16px" }}>
        <div style={{ maxWidth: "900px", display: "flex", flexDirection: "column", gap: "16px" }}>

          {err && <Alert variant="error">⚠ {err}</Alert>}

          {/* Motorista e Veículo */}
          <FormSection title="Motorista e Veículo">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              <FormField label="Motorista *">
                <select value={f.motorista_id} onChange={set("motorista_id")} style={selectStyle} required>
                  <option value="">Selecione o motorista...</option>
                  {motoristas.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
                </select>
              </FormField>
              <FormField
                label="Veículo *"
                hint={vinculoVeiculoId === f.veiculo_id && f.veiculo_id ? "✓ Veículo padrão deste motorista" : undefined}
              >
                <select value={f.veiculo_id} onChange={set("veiculo_id")} style={selectStyle} required>
                  <option value="">Selecione o veículo...</option>
                  {veiculos.map(v => (
                    <option key={v.id} value={v.id}>
                      {v.placa} — {v.marca} {v.modelo}
                    </option>
                  ))}
                </select>
              </FormField>
            </div>
          </FormSection>

          {/* Datas e KM */}
          <FormSection title="Datas e Quilometragem">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px" }}>
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
              <FormField
                label="KM Inicial"
                hint={kmVeiculo != null ? `Odômetro atual: ${kmVeiculo.toLocaleString("pt-BR")} km` : undefined}
              >
                <input
                  type="number"
                  value={f.km_inicial}
                  onChange={set("km_inicial")}
                  placeholder={kmVeiculo != null ? String(kmVeiculo) : ""}
                  style={inputStyle}
                />
              </FormField>
            </div>
          </FormSection>

          {/* Observações */}
          <FormSection title="Observações">
            <textarea
              value={f.observacoes}
              onChange={set("observacoes")}
              rows={3}
              style={{ ...inputStyle, resize: "vertical" }}
              placeholder="Informações gerais da viagem..."
            />
          </FormSection>

          {/* Fretes disponíveis */}
          <FormSection title={`Fretes a Incluir (${selectedFretes.size} selecionados)`}>
            {fretesDisp.length === 0 ? (
              <p style={{ fontSize: "13px", color: "#94a3b8", margin: 0 }}>
                Nenhum frete agendado disponível. Os fretes aparecem aqui quando têm status "Agendado" e ainda não estão em outra viagem.
              </p>
            ) : (
              <>
                <p style={{ fontSize: "12px", color: "#64748b", marginBottom: "8px" }}>
                  Selecione os fretes que fazem parte desta viagem:
                </p>
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
                          <Td style={{ fontWeight: 600 }}>
                            {fr.origem ?? "—"} → {fr.destino ?? "—"}
                          </Td>
                          <Td>{cliente?.nome_fantasia ?? "—"}</Td>
                          <Td>{fmtDate(fr.data_coleta_prevista)}</Td>
                          <Td style={{ color: "#16a34a", fontWeight: 600 }}>{fmtBRL(fr.valor_frete)}</Td>
                        </Tr>
                      );
                    })}
                  </tbody>
                </DataTable>
              </>
            )}
          </FormSection>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", paddingTop: "16px", borderTop: "1px solid #e2e8f0" }}>
            <Btn href="/viagens" variant="outline">Cancelar</Btn>
            <Btn type="submit" disabled={saving}>
              {saving ? "Criando..." : "Criar Viagem"}
            </Btn>
          </div>
        </div>
      </div>
    </form>
  );
}
