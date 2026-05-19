"use client";
import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { DataTable, Th, Td, Tr, Btn, Badge, EmptyState, inputStyle, SearchInput, Alert } from "@/components/ui/ds";
import { normalizar } from "@/lib/utils/normalizar";

type Tipo = {
  id: string; codigo: string; nome: string; categoria: string; criticidade: string;
  intervalo_km: number | null; intervalo_meses: number | null;
};
type Plano = {
  id: string; tipo_id: string; ativo: boolean | null;
  intervalo_km: number | null; intervalo_meses: number | null; observacoes: string | null;
};

const CRIT_VARIANT: Record<string, "danger" | "warning" | "default"> = {
  alta: "danger", media: "warning", baixa: "default",
};

export default function PlanoTab({ veiculoId, empresaId }: { veiculoId: string; empresaId: string }) {
  const supabase = createClient();
  const [tipos, setTipos] = useState<Tipo[]>([]);
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [cat, setCat] = useState<string>("");

  useEffect(() => {
    Promise.all([
      supabase.from("tipos_manutencao")
        .select("id,codigo,nome,categoria,criticidade,intervalo_km,intervalo_meses")
        .eq("ativo", true)
        .or(`empresa_id.is.null,empresa_id.eq.${empresaId}`)
        .order("categoria").order("nome"),
      supabase.from("plano_manutencao_veiculo")
        .select("id,tipo_id,ativo,intervalo_km,intervalo_meses,observacoes")
        .eq("veiculo_id", veiculoId),
    ]).then(([t, p]) => {
      setTipos(t.data ?? []);
      setPlanos(p.data ?? []);
      setLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [veiculoId, empresaId]);

  const categorias = useMemo(() => Array.from(new Set(tipos.map(t => t.categoria))).sort(), [tipos]);
  const filtrados = useMemo(() => {
    const q = normalizar(busca);
    return tipos.filter(t =>
      (cat === "" || t.categoria === cat) &&
      (q === "" || normalizar(t.nome).includes(q) || normalizar(t.codigo).includes(q))
    );
  }, [tipos, busca, cat]);

  const planoDe = (tipoId: string) => planos.find(p => p.tipo_id === tipoId);

  const toggleAtivo = async (tipo: Tipo, ativar: boolean) => {
    setErro("");
    setSavingId(tipo.id);
    const existente = planoDe(tipo.id);
    if (ativar && !existente) {
      const { data, error } = await supabase.from("plano_manutencao_veiculo").insert({
        veiculo_id: veiculoId, empresa_id: empresaId, tipo_id: tipo.id,
        intervalo_km: tipo.intervalo_km, intervalo_meses: tipo.intervalo_meses, ativo: true,
      }).select().single();
      if (error) setErro(error.message);
      else if (data) setPlanos(p => [...p, data]);
    } else if (existente) {
      const { error } = await supabase.from("plano_manutencao_veiculo")
        .update({ ativo: ativar }).eq("id", existente.id);
      if (error) setErro(error.message);
      else setPlanos(p => p.map(x => x.id === existente.id ? { ...x, ativo: ativar } : x));
    }
    setSavingId(null);
  };

  const atualizarIntervalo = async (plano: Plano, campo: "intervalo_km" | "intervalo_meses", valor: string) => {
    const num = valor === "" ? null : parseInt(valor);
    setPlanos(p => p.map(x => x.id === plano.id ? { ...x, [campo]: num } : x));
    const payload = campo === "intervalo_km"
      ? { intervalo_km: num }
      : { intervalo_meses: num };
    const { error } = await supabase.from("plano_manutencao_veiculo")
      .update(payload).eq("id", plano.id);
    if (error) setErro(error.message);
  };

  if (loading) return <p style={{ color: "#94a3b8", padding: "16px" }}>Carregando catálogo...</p>;

  if (tipos.length === 0) return (
    <EmptyState
      icon="📋"
      message="Nenhum tipo de manutenção cadastrado. Rode o seed em db/seed_tipos_manutencao.sql."
    />
  );

  const ativosCount = planos.filter(p => p.ativo).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {erro && <Alert variant="error">⚠ {erro}</Alert>}

      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
        <SearchInput placeholder="Buscar tipo..." value={busca} onChange={e => setBusca(e.target.value)} />
        <select value={cat} onChange={e => setCat(e.target.value)} style={{ ...inputStyle, width: "auto" }}>
          <option value="">Todas categorias</option>
          {categorias.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <span style={{ marginLeft: "auto", fontSize: "12px", color: "#64748b" }}>
          <strong style={{ color: "#1e293b" }}>{ativosCount}</strong> ativo{ativosCount !== 1 ? "s" : ""} de {tipos.length}
        </span>
      </div>

      <DataTable count={filtrados.length} label="tipos">
        <thead>
          <tr>
            <Th style={{ width: "40px" }}>Ativo</Th>
            <Th>Tipo</Th>
            <Th>Categoria</Th>
            <Th>Criticidade</Th>
            <Th style={{ textAlign: "right" }}>Intervalo KM</Th>
            <Th style={{ textAlign: "right" }}>Intervalo Meses</Th>
          </tr>
        </thead>
        <tbody>
          {filtrados.map(t => {
            const p = planoDe(t.id);
            const ativo = !!p?.ativo;
            return (
              <Tr key={t.id} muted={!ativo}>
                <Td>
                  <input
                    type="checkbox"
                    checked={ativo}
                    disabled={savingId === t.id}
                    onChange={e => toggleAtivo(t, e.target.checked)}
                    style={{ cursor: "pointer" }}
                  />
                </Td>
                <Td>
                  <div style={{ fontWeight: 600, color: "#1e293b" }}>{t.nome}</div>
                  <div style={{ fontSize: "10px", color: "#94a3b8" }}>{t.codigo}</div>
                </Td>
                <Td style={{ textTransform: "capitalize" }}>{t.categoria}</Td>
                <Td><Badge variant={CRIT_VARIANT[t.criticidade] ?? "default"}>{t.criticidade}</Badge></Td>
                <Td style={{ textAlign: "right" }}>
                  {ativo && p
                    ? <input
                        type="number" value={p.intervalo_km ?? ""}
                        onChange={e => atualizarIntervalo(p, "intervalo_km", e.target.value)}
                        placeholder="—"
                        style={{ ...inputStyle, width: "100px", textAlign: "right", padding: "4px 8px", fontSize: "12px" }}
                      />
                    : <span style={{ color: "#94a3b8" }}>{t.intervalo_km?.toLocaleString("pt-BR") ?? "—"}</span>}
                </Td>
                <Td style={{ textAlign: "right" }}>
                  {ativo && p
                    ? <input
                        type="number" value={p.intervalo_meses ?? ""}
                        onChange={e => atualizarIntervalo(p, "intervalo_meses", e.target.value)}
                        placeholder="—"
                        style={{ ...inputStyle, width: "70px", textAlign: "right", padding: "4px 8px", fontSize: "12px" }}
                      />
                    : <span style={{ color: "#94a3b8" }}>{t.intervalo_meses ?? "—"}</span>}
                </Td>
              </Tr>
            );
          })}
        </tbody>
      </DataTable>
    </div>
  );
}
