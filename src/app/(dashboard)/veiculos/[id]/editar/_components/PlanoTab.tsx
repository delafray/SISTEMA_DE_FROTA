"use client";
import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { DataTable, Th, Td, Tr, Badge, EmptyState, inputStyle, selectStyle, SearchInput, Alert, Btn, FormField } from "@/components/ui/ds";
import { MobileCard, MobileList } from "@/components/mobile";
import { normalizar } from "@/lib/utils/normalizar";

type Tipo = {
  id: string; codigo: string; nome: string; categoria: string; criticidade: string;
  intervalo_km: number | null; intervalo_meses: number | null; empresa_id: string | null;
};
type Plano = {
  id: string; tipo_id: string; ativo: boolean | null;
  intervalo_km: number | null; intervalo_meses: number | null; observacoes: string | null;
};
type ProximaInfo = {
  tipo_id: string | null;
  data_ultima: string | null; km_ultima: number | null;
  data_proxima: string | null; km_proxima: number | null;
  km_faltando: number | null; status: string | null;
};

const CRIT_VARIANT: Record<string, "danger" | "warning" | "default"> = {
  alta: "danger", media: "warning", baixa: "default",
};

const CATEGORIAS = ["motor", "filtros", "freios", "suspensao", "transmissao", "arrefecimento", "eletrica", "pneus", "documentacao", "geral"];

const slug = (s: string) => normalizar(s).replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").toUpperCase().slice(0, 30);

const fmtDate = (s: string | null) => s ? new Date(s + "T00:00:00").toLocaleDateString("pt-BR") : null;

export default function PlanoTab({ veiculoId, empresaId }: { veiculoId: string; empresaId: string }) {
  const supabase = createClient();
  const [tipos, setTipos] = useState<Tipo[]>([]);
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [proximas, setProximas] = useState<Map<string, ProximaInfo>>(new Map());
  const [manutCount, setManutCount] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [cat, setCat] = useState<string>("");

  // Novo tipo
  const [showNovo, setShowNovo] = useState(false);
  const [salvandoNovo, setSalvandoNovo] = useState(false);
  const [nf, setNf] = useState({
    nome: "", categoria: "geral", criticidade: "media",
    intervalo_km: "", intervalo_meses: "",
  });

  const carregar = async () => {
    const [t, p, m, pm] = await Promise.all([
      supabase.from("tipos_manutencao")
        .select("id,codigo,nome,categoria,criticidade,intervalo_km,intervalo_meses,empresa_id")
        .eq("ativo", true)
        .or(`empresa_id.is.null,empresa_id.eq.${empresaId}`)
        .order("categoria").order("nome"),
      supabase.from("plano_manutencao_veiculo")
        .select("id,tipo_id,ativo,intervalo_km,intervalo_meses,observacoes")
        .eq("veiculo_id", veiculoId),
      supabase.from("manutencoes")
        .select("tipo_id")
        .eq("veiculo_id", veiculoId),
      supabase.from("proxima_manutencao_veiculo")
        .select("tipo_id,data_ultima,km_ultima,data_proxima,km_proxima,km_faltando,status")
        .eq("veiculo_id", veiculoId),
    ]);
    setTipos((t.data ?? []) as Tipo[]);
    setPlanos(p.data ?? []);
    const cMap = new Map<string, number>();
    for (const row of m.data ?? []) cMap.set(row.tipo_id, (cMap.get(row.tipo_id) ?? 0) + 1);
    setManutCount(cMap);
    const pMap = new Map<string, ProximaInfo>();
    for (const row of (pm.data ?? []) as ProximaInfo[]) if (row.tipo_id) pMap.set(row.tipo_id, row);
    setProximas(pMap);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar().then(() => setLoading(false));
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
    const count = manutCount.get(tipo.id) ?? 0;
    if (!ativar && count > 0) {
      alert(`Não é possível desativar: existem ${count} manutenç${count !== 1 ? "ões" : "ão"} lançada${count !== 1 ? "s" : ""} para este tipo. Exclua os registros na aba "Manutenções" primeiro.`);
      return;
    }
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

  const setNF = (k: keyof typeof nf) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setNf(p => ({ ...p, [k]: e.target.value }));

  const salvarNovoTipo = async () => {
    setErro("");
    if (!nf.nome.trim()) { setErro("Informe o nome do tipo"); return; }
    if (!nf.intervalo_km && !nf.intervalo_meses) {
      setErro("Informe ao menos um intervalo (km ou meses)"); return;
    }
    setSalvandoNovo(true);
    const codigo = `CUSTOM_${slug(nf.nome)}_${Date.now().toString(36).slice(-4).toUpperCase()}`;
    const { error } = await supabase.from("tipos_manutencao").insert({
      codigo, nome: nf.nome.trim(),
      categoria: nf.categoria, criticidade: nf.criticidade,
      intervalo_km: nf.intervalo_km ? parseInt(nf.intervalo_km) : null,
      intervalo_meses: nf.intervalo_meses ? parseInt(nf.intervalo_meses) : null,
      empresa_id: empresaId, ativo: true,
    });
    setSalvandoNovo(false);
    if (error) { setErro(error.message); return; }
    setShowNovo(false);
    setNf({ nome: "", categoria: "geral", criticidade: "media", intervalo_km: "", intervalo_meses: "" });
    await carregar();
  };

  if (loading) return <p style={{ color: "#94a3b8", padding: "16px" }}>Carregando catálogo...</p>;

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
        <Btn type="button" onClick={() => setShowNovo(s => !s)} variant={showNovo ? "outline" : "primary"}>
          {showNovo ? "Cancelar" : "+ Novo tipo"}
        </Btn>
        <span style={{ marginLeft: "auto", fontSize: "12px", color: "#64748b" }}>
          <strong style={{ color: "#1e293b" }}>{ativosCount}</strong> ativo{ativosCount !== 1 ? "s" : ""} de {tipos.length}
        </span>
      </div>

      {showNovo && (
        <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "16px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px" }}>
            <div style={{ gridColumn: "span 2" }}>
              <FormField label="Nome do tipo *" hint="Ex: Troca do filtro do separador">
                <input value={nf.nome} onChange={setNF("nome")} style={inputStyle} />
              </FormField>
            </div>
            <FormField label="Categoria">
              <select value={nf.categoria} onChange={setNF("categoria")} style={selectStyle}>
                {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </FormField>
            <FormField label="Criticidade">
              <select value={nf.criticidade} onChange={setNF("criticidade")} style={selectStyle}>
                <option value="alta">Alta</option>
                <option value="media">Média</option>
                <option value="baixa">Baixa</option>
              </select>
            </FormField>
            <FormField label="Intervalo KM" hint="Deixe em branco se for só por tempo">
              <input type="number" value={nf.intervalo_km} onChange={setNF("intervalo_km")} style={inputStyle} />
            </FormField>
            <FormField label="Intervalo Meses" hint="Deixe em branco se for só por km">
              <input type="number" value={nf.intervalo_meses} onChange={setNF("intervalo_meses")} style={inputStyle} />
            </FormField>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "12px" }}>
            <Btn type="button" variant="outline" onClick={() => setShowNovo(false)}>Cancelar</Btn>
            <Btn type="button" onClick={salvarNovoTipo} disabled={salvandoNovo}>
              {salvandoNovo ? "Salvando..." : "Cadastrar tipo"}
            </Btn>
          </div>
        </div>
      )}

      {tipos.length === 0
        ? <EmptyState icon="📋" message="Nenhum tipo cadastrado. Rode db/seed_tipos_manutencao.sql ou clique em '+ Novo tipo'." />
        : (
          <>
          {/* Mobile */}
          <MobileList count={filtrados.length} label="tipos de manutenção">
            {filtrados.map(t => {
              const p = planoDe(t.id);
              const ativo = !!p?.ativo;
              const count = manutCount.get(t.id) ?? 0;
              const locked = ativo && count > 0;
              const prox = proximas.get(t.id);
              return (
                <MobileCard
                  key={t.id}
                  title={t.nome}
                  subtitle={t.categoria}
                  badge={<Badge variant={CRIT_VARIANT[t.criticidade] ?? "default"}>{t.criticidade}</Badge>}
                  highlight={!ativo ? "#cbd5e1" : undefined}
                  details={[
                    {
                      label: "Ativo",
                      value: (
                        <input
                          type="checkbox"
                          checked={ativo}
                          disabled={savingId === t.id || locked}
                          onChange={e => toggleAtivo(t, e.target.checked)}
                          style={{ cursor: locked ? "not-allowed" : "pointer", width: "18px", height: "18px", accentColor: "#2563eb" }}
                          title={locked ? `Bloqueado: ${count} manutenção(ões) registrada(s)` : ""}
                        />
                      ),
                    },
                    {
                      label: "Int. KM",
                      value: ativo && p
                        ? <input type="number" value={p.intervalo_km ?? ""} onChange={e => atualizarIntervalo(p, "intervalo_km", e.target.value)} placeholder="—" inputMode="numeric" style={{ ...inputStyle, width: "90px", padding: "4px 8px", fontSize: "12px" }} />
                        : (t.intervalo_km?.toLocaleString("pt-BR") ?? "—"),
                    },
                    {
                      label: "Int. Meses",
                      value: ativo && p
                        ? <input type="number" value={p.intervalo_meses ?? ""} onChange={e => atualizarIntervalo(p, "intervalo_meses", e.target.value)} placeholder="—" inputMode="numeric" style={{ ...inputStyle, width: "70px", padding: "4px 8px", fontSize: "12px" }} />
                        : (t.intervalo_meses ?? "—"),
                    },
                    {
                      label: "Próxima",
                      value: !ativo ? "—" : prox?.km_proxima != null || prox?.data_proxima
                        ? `${prox?.km_proxima != null ? `${prox.km_proxima.toLocaleString("pt-BR")} km` : ""}${prox?.data_proxima ? ` / ${prox.data_proxima}` : ""}`
                        : "—",
                    },
                  ]}
                />
              );
            })}
          </MobileList>
          {/* Desktop */}
          <div className="m-hide">
          <DataTable count={filtrados.length} label="tipos">
            <thead>
              <tr>
                <Th style={{ width: "40px" }}>Ativo</Th>
                <Th>Tipo</Th>
                <Th>Categoria</Th>
                <Th>Criticidade</Th>
                <Th style={{ textAlign: "right" }}>Intervalo KM</Th>
                <Th style={{ textAlign: "right" }}>Intervalo Meses</Th>
                <Th>Última</Th>
                <Th>Próxima</Th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map(t => {
                const p = planoDe(t.id);
                const ativo = !!p?.ativo;
                const count = manutCount.get(t.id) ?? 0;
                const prox = proximas.get(t.id);
                const locked = ativo && count > 0;
                return (
                  <Tr key={t.id} muted={!ativo}>
                    <Td>
                      <input
                        type="checkbox"
                        checked={ativo}
                        disabled={savingId === t.id || locked}
                        onChange={e => toggleAtivo(t, e.target.checked)}
                        style={{ cursor: locked ? "not-allowed" : "pointer" }}
                        title={locked ? `Bloqueado: ${count} manutenç${count !== 1 ? "ão(ões)" : "ão"} registrada${count !== 1 ? "s" : ""}` : ""}
                      />
                    </Td>
                    <Td>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <div>
                          <div style={{ fontWeight: 600, color: "#1e293b" }}>{t.nome}</div>
                          <div style={{ fontSize: "10px", color: "#94a3b8" }}>
                            {t.codigo}
                            {t.empresa_id && <span style={{ marginLeft: "4px", color: "#9333ea" }}>• personalizado</span>}
                          </div>
                        </div>
                        {locked && <span title={`${count} manutenção(ões) registrada(s)`} style={{ fontSize: "11px" }}>🔒</span>}
                      </div>
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
                    <Td style={{ fontSize: "11px", color: "#64748b" }}>
                      {!ativo
                        ? "—"
                        : prox?.data_ultima || prox?.km_ultima
                          ? <div>
                              {prox?.km_ultima != null && <div>{prox.km_ultima.toLocaleString("pt-BR")} km</div>}
                              {prox?.data_ultima && <div style={{ fontSize: "10px", color: "#94a3b8" }}>{fmtDate(prox.data_ultima)}</div>}
                            </div>
                          : <span style={{ color: "#94a3b8" }}>sem histórico</span>}
                    </Td>
                    <Td style={{ fontSize: "11px" }}>
                      {!ativo
                        ? "—"
                        : prox?.data_proxima || prox?.km_proxima != null
                          ? <div>
                              {prox?.km_proxima != null && (
                                <div style={{ color: "#1e293b", fontWeight: 500 }}>
                                  {prox.km_proxima.toLocaleString("pt-BR")} km
                                  {prox.km_faltando != null && (
                                    <span style={{
                                      marginLeft: "4px", fontSize: "10px",
                                      color: prox.km_faltando < 0 ? "#dc2626" : prox.km_faltando < 2000 ? "#ca8a04" : "#64748b",
                                    }}>
                                      ({prox.km_faltando < 0 ? `-${Math.abs(prox.km_faltando).toLocaleString("pt-BR")}` : `faltam ${prox.km_faltando.toLocaleString("pt-BR")}`})
                                    </span>
                                  )}
                                </div>
                              )}
                              {prox?.data_proxima && <div style={{ fontSize: "10px", color: "#94a3b8" }}>{fmtDate(prox.data_proxima)}</div>}
                              {prox?.status && prox.status !== "ok" && (
                                <Badge variant={prox.status === "vencido" ? "danger" : "warning"}>{prox.status}</Badge>
                              )}
                            </div>
                          : <span style={{ color: "#94a3b8" }}>—</span>}
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </DataTable>
          </div>
          </>
        )}
    </div>
  );
}
