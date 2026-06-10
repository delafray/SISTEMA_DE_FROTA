"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import JSZip from "jszip";
import { createClient } from "@/lib/supabase/client";
import {
  PageHeader, DataTable, Th, Td, Tr, Badge, Btn, Alert,
  inputStyle, selectStyle, FormField,
} from "@/components/ui/ds";
import {
  parseLoteNFe,
  type RelatorioLote,
} from "@/lib/import/nfeParser";
import {
  lerPlanilha,
  detectarMapeamento,
  montarLinhas,
  type LinhaImportada,
  type MapeamentoColunas,
  type PlanilhaLida,
} from "@/lib/import/planilhaParser";

// ─── tipos internos ───────────────────────────────────────────────────────────

type Modo = "xml" | "planilha";
type Etapa = "upload" | "preview" | "resultado";
type Agrupamento = "unico" | "por_nota";

/** Linha unificada para a tabela de preview */
type LinhaPreview = {
  /** índice original (para manter estado de checkbox) */
  idx: number;
  destinatario: string;
  endereco: string;
  numeroNota: string;
  valorNota: number | null;
  observacoes: string;
  // apenas XML
  nfeChave?: string;
  // estado calculado na etapa preview
  jaImportada: boolean;
};

type LocalCarreg = { id: string; nome: string; endereco: string; principal: boolean };

// ─── helpers ─────────────────────────────────────────────────────────────────

const hoje = () => new Date().toISOString().slice(0, 10);

function fmtValor(v: number | null): string {
  if (v === null) return "—";
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Quebra um array em pedaços de `size` */
function chunks<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size));
  return result;
}

// ─── página ──────────────────────────────────────────────────────────────────

export default function ImportarNotasPage() {
  const router = useRouter();
  const supabase = createClient();

  // auth
  const [empresaId, setEmpresaId] = useState<string | null>(null);

  // locais de carregamento
  const [locais, setLocais] = useState<LocalCarreg[]>([]);
  const [localId, setLocalId] = useState<string>("");

  // controle de etapa
  const [etapa, setEtapa] = useState<Etapa>("upload");
  const [modo, setModo] = useState<Modo>("xml");

  // upload / parse
  const [carregando, setCarregando] = useState(false);
  const [errUpload, setErrUpload] = useState("");
  const [relatorioLote, setRelatorioLote] = useState<RelatorioLote | null>(null);
  const [falhasPlanilha, setFalhasPlanilha] = useState<{ linha: number; motivo: string }[]>([]);
  const [falhasExpandidas, setFalhasExpandidas] = useState(false);

  // planilha — mapeamento
  const [planilhaLida, setPlanilhaLida] = useState<PlanilhaLida | null>(null);
  const [mapColunas, setMapColunas] = useState<Partial<MapeamentoColunas>>({});

  // linhas de preview (pré-dedupe)
  const [linhasBase, setLinhasBase] = useState<Omit<LinhaPreview, "jaImportada">[]>([]);

  // preview
  const [linhasPreview, setLinhasPreview] = useState<LinhaPreview[]>([]);
  const [selecionadas, setSelecionadas] = useState<Set<number>>(new Set());
  const [carregandoDedupe, setCarregandoDedupe] = useState(false);

  // opções do pedido
  const [agrupamento, setAgrupamento] = useState<Agrupamento>("unico");
  const [dataPrevista, setDataPrevista] = useState(hoje());
  const [valorPedido, setValorPedido] = useState("");

  // resultado
  const [importando, setImportando] = useState(false);
  const [errImport, setErrImport] = useState("");
  const [resultado, setResultado] = useState<{ pedidos: number; entregas: number } | null>(null);

  // refs para inputs de arquivo
  const inputXmlRef = useRef<HTMLInputElement>(null);
  const inputPlanilhaRef = useRef<HTMLInputElement>(null);

  // ── carrega empresa + locais ────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { router.push("/login"); return; }

      const { data: ue } = await supabase
        .from("usuario_empresas")
        .select("empresa_id")
        .eq("usuario_id", auth.user.id)
        .eq("is_padrao", true)
        .single();

      if (!ue?.empresa_id) return;
      setEmpresaId(ue.empresa_id);

      // locais_carregamento (sem filtro de cliente — lista global da empresa)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: locs } = await (supabase as any)
        .from("locais_carregamento")
        .select("id,nome,endereco,principal")
        .eq("empresa_id", ue.empresa_id)
        .eq("ativo", true)
        .order("principal", { ascending: false });
      const locsArr = (locs ?? []) as LocalCarreg[];
      setLocais(locsArr);
      const princ = locsArr.find((l) => l.principal);
      if (princ) setLocalId(princ.id);
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── processamento XML ───────────────────────────────────────────────────────
  const processarXml = async (files: FileList) => {
    setCarregando(true);
    setErrUpload("");

    const arquivos: { nome: string; conteudo: string }[] = [];

    for (const file of Array.from(files)) {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      if (ext === "zip") {
        // descompactar com jszip
        try {
          const buf = await file.arrayBuffer();
          const zip = await JSZip.loadAsync(buf);
          const entradas: Promise<void>[] = [];
          zip.forEach((relPath, entry) => {
            if (!relPath.toLowerCase().endsWith(".xml")) return;
            entradas.push(
              entry.async("string").then((conteudo) => {
                arquivos.push({ nome: relPath, conteudo });
              })
            );
          });
          await Promise.all(entradas);
        } catch {
          setErrUpload(`Não foi possível descompactar o arquivo "${file.name}".`);
          setCarregando(false);
          return;
        }
      } else {
        // XML direto
        const conteudo = await file.text();
        arquivos.push({ nome: file.name, conteudo });
      }
    }

    if (arquivos.length === 0) {
      setErrUpload("Nenhum arquivo XML encontrado no upload.");
      setCarregando(false);
      return;
    }

    const relatorio = parseLoteNFe(arquivos);
    setRelatorioLote(relatorio);

    const base: Omit<LinhaPreview, "jaImportada">[] = relatorio.notas.map((item, i) => ({
      idx: i,
      destinatario: item.nota.destinatario,
      endereco: item.nota.endereco,
      numeroNota: item.nota.numero,
      valorNota: item.nota.valor,
      observacoes: "",
      nfeChave: item.nota.chave,
    }));
    setLinhasBase(base);
    setCarregando(false);
  };

  // ── processamento planilha ──────────────────────────────────────────────────
  const processarPlanilha = async (file: File) => {
    setCarregando(true);
    setErrUpload("");
    setPlanilhaLida(null);
    setMapColunas({});

    try {
      const buf = await file.arrayBuffer();
      const planilha = lerPlanilha(buf);
      const map = detectarMapeamento(planilha.headers);
      setPlanilhaLida(planilha);
      setMapColunas(map);
    } catch (e: unknown) {
      setErrUpload(e instanceof Error ? e.message : "Erro ao ler a planilha.");
    }
    setCarregando(false);
  };

  const confirmarMapeamento = () => {
    if (!planilhaLida || mapColunas.endereco === undefined) return;
    setErrUpload("");

    const result = montarLinhas(planilhaLida, mapColunas as MapeamentoColunas);
    setFalhasPlanilha(result.falhas);

    const base: Omit<LinhaPreview, "jaImportada">[] = result.linhas.map((l: LinhaImportada, i) => ({
      idx: i,
      destinatario: l.nome,
      endereco: l.endereco,
      numeroNota: l.numeroNota,
      valorNota: l.valor,
      observacoes: l.observacoes,
    }));
    setLinhasBase(base);
  };

  // ── avançar para preview (com dedupe) ──────────────────────────────────────
  const avancarPreview = async () => {
    if (linhasBase.length === 0) {
      setErrUpload("Nenhuma entrega válida para importar.");
      return;
    }
    setCarregandoDedupe(true);

    // dedupe contra banco (só XML tem chave)
    const chaves = linhasBase
      .map((l) => l.nfeChave)
      .filter((c): c is string => !!c);

    const jaExistentes = new Set<string>();

    if (chaves.length > 0 && empresaId) {
      const lotes = chunks(chaves, 200);
      for (const lote of lotes) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data } = await (supabase as any)
          .from("entregas")
          .select("nfe_chave")
          .eq("empresa_id", empresaId)
          .in("nfe_chave", lote);
        if (data) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (data as any[]).forEach((r) => jaExistentes.add(r.nfe_chave));
        }
      }
    }

    const preview: LinhaPreview[] = linhasBase.map((l) => ({
      ...l,
      jaImportada: l.nfeChave ? jaExistentes.has(l.nfeChave) : false,
    }));

    setLinhasPreview(preview);
    // pré-seleciona todas exceto já importadas
    setSelecionadas(
      new Set(preview.filter((l) => !l.jaImportada).map((l) => l.idx))
    );
    setCarregandoDedupe(false);
    setEtapa("preview");
  };

  // ── toggle seleção ──────────────────────────────────────────────────────────
  const toggleLinha = (idx: number) => {
    setSelecionadas((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const toggleTodas = () => {
    const selecionaveisIdx = linhasPreview
      .filter((l) => !l.jaImportada)
      .map((l) => l.idx);
    const todasMarcadas = selecionaveisIdx.every((i) => selecionadas.has(i));
    setSelecionadas((prev) => {
      const next = new Set(prev);
      if (todasMarcadas) selecionaveisIdx.forEach((i) => next.delete(i));
      else selecionaveisIdx.forEach((i) => next.add(i));
      return next;
    });
  };

  // ── importar ───────────────────────────────────────────────────────────────
  const importar = async () => {
    if (!empresaId) return;
    const linhasSelecionadas = linhasPreview.filter((l) => selecionadas.has(l.idx));
    if (linhasSelecionadas.length === 0) {
      setErrImport("Selecione ao menos uma entrega para importar.");
      return;
    }

    setImportando(true);
    setErrImport("");

    // local de carregamento
    const localSel = locais.find((l) => l.id === localId);
    const localCarregamento = localSel ? `${localSel.nome} — ${localSel.endereco}` : null;
    const localCarregamentoId = localSel ? localSel.id : null;
    const origemEntrega = localCarregamento || "Depósito";

    try {
      if (agrupamento === "unico") {
        // ── modo: 1 pedido, N entregas ──────────────────────────────────────
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pedidoPayload: any = {
          empresa_id: empresaId,
          status: "agendada",
          data_inicio_prevista: dataPrevista || null,
          valor_pedido: valorPedido ? parseFloat(valorPedido) : null,
          local_carregamento: localCarregamento,
          local_carregamento_id: localCarregamentoId,
        };

        const { data: pedido, error: errPedido } = await supabase
          .from("pedidos")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .insert(pedidoPayload as any)
          .select("id")
          .single();

        if (errPedido || !pedido) {
          throw new Error(errPedido?.message ?? "Erro ao criar pedido.");
        }

        const rowsEntregas = linhasSelecionadas.map((l) => ({
          empresa_id: empresaId,
          pedido_id: pedido.id,
          status: "agendado",
          origem: origemEntrega,
          destino: l.endereco,
          nome_cliente_avulso: l.destinatario || null,
          observacoes: l.observacoes || null,
          origem_demanda: "importacao_massa",
          // colunas novas da migration_import_notas; regenerar database.types.ts
          nfe_chave: l.nfeChave ?? null,
          nfe_numero: l.numeroNota || null,
          nfe_valor: l.valorNota ?? null,
        }));

        const { error: errEnt } = await supabase
          .from("entregas")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .insert(rowsEntregas as unknown as any[]);

        if (errEnt) throw new Error(errEnt.message);

        // geocoding fire-and-forget
        fetch("/api/routing/geocodar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pedido_id: pedido.id }),
        }).catch(() => {});

        setResultado({ pedidos: 1, entregas: linhasSelecionadas.length });

      } else {
        // ── modo: 1 pedido por nota ─────────────────────────────────────────
        const pedidosPayload = linhasSelecionadas.map(() => ({
          empresa_id: empresaId,
          status: "agendada",
          data_inicio_prevista: dataPrevista || null,
          valor_pedido: null,
          local_carregamento: localCarregamento,
          local_carregamento_id: localCarregamentoId,
        }));

        const { data: pedidosCriados, error: errPeds } = await supabase
          .from("pedidos")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .insert(pedidosPayload as unknown as any[])
          .select("id");

        if (errPeds || !pedidosCriados || pedidosCriados.length === 0) {
          throw new Error(errPeds?.message ?? "Erro ao criar pedidos.");
        }

        const rowsEntregas = linhasSelecionadas.map((l, i) => ({
          empresa_id: empresaId,
          pedido_id: pedidosCriados[i].id,
          status: "agendado",
          origem: origemEntrega,
          destino: l.endereco,
          nome_cliente_avulso: l.destinatario || null,
          observacoes: l.observacoes || null,
          origem_demanda: "importacao_massa",
          // colunas novas da migration_import_notas; regenerar database.types.ts
          nfe_chave: l.nfeChave ?? null,
          nfe_numero: l.numeroNota || null,
          nfe_valor: l.valorNota ?? null,
        }));

        const { error: errEnt } = await supabase
          .from("entregas")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .insert(rowsEntregas as unknown as any[]);

        if (errEnt) throw new Error(errEnt.message);

        // geocoding fire-and-forget por pedido
        pedidosCriados.forEach((p) => {
          fetch("/api/routing/geocodar", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pedido_id: p.id }),
          }).catch(() => {});
        });

        setResultado({ pedidos: pedidosCriados.length, entregas: linhasSelecionadas.length });
      }

      setEtapa("resultado");
    } catch (e: unknown) {
      setErrImport(e instanceof Error ? e.message : "Erro desconhecido na importação.");
    } finally {
      setImportando(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Falhas combinadas: parse XML + planilha
  const todasFalhas = [
    ...(relatorioLote?.falhas ?? []).map((f) => ({ origem: f.arquivo, motivo: f.motivo })),
    ...falhasPlanilha.map((f) => ({ origem: `Linha ${f.linha}`, motivo: f.motivo })),
  ];

  const countSelecionadas = selecionadas.size;

  // ══════════════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════════════

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#f1f5f9" }}>
      <PageHeader
        title="Importar Notas em Massa"
        actions={<Btn href="/pedidos" variant="outline">Voltar para Lista</Btn>}
      />

      <div style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
        <div style={{ maxWidth: "900px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "24px" }}>

          {/* ── ETAPA: UPLOAD ── */}
          {etapa === "upload" && (
            <>
              {/* Seletor de modo */}
              <div style={{ display: "flex", gap: "12px" }}>
                {(["xml", "planilha"] as Modo[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      setModo(m);
                      setErrUpload("");
                      setRelatorioLote(null);
                      setFalhasPlanilha([]);
                      setPlanilhaLida(null);
                      setMapColunas({});
                      setLinhasBase([]);
                      if (inputXmlRef.current) inputXmlRef.current.value = "";
                      if (inputPlanilhaRef.current) inputPlanilhaRef.current.value = "";
                    }}
                    style={{
                      flex: 1, padding: "16px 20px", borderRadius: "12px", cursor: "pointer",
                      border: modo === m ? "2px solid #2563eb" : "1px solid #e2e8f0",
                      background: modo === m ? "#eff6ff" : "#fff",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                      textAlign: "left",
                    }}
                  >
                    <div style={{ fontSize: "15px", fontWeight: 700, color: modo === m ? "#1d4ed8" : "#1e293b" }}>
                      {m === "xml" ? "XML de NFe" : "Planilha"}
                    </div>
                    <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>
                      {m === "xml"
                        ? "Arquivos .xml individuais ou .zip com vários XMLs"
                        : "Arquivo .xlsx, .xls ou .csv com endereços"}
                    </div>
                  </button>
                ))}
              </div>

              {/* Upload XML */}
              {modo === "xml" && (
                <div style={{ background: "#fff", borderRadius: "12px", padding: "24px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
                  <h2 style={{ fontSize: "15px", fontWeight: 700, color: "#1e293b", margin: "0 0 16px" }}>
                    Selecionar arquivos XML
                  </h2>
                  <input
                    ref={inputXmlRef}
                    type="file"
                    multiple
                    accept=".xml,.zip"
                    style={{ ...inputStyle, padding: "6px 12px", cursor: "pointer" }}
                    onChange={async (e) => {
                      if (!e.target.files || e.target.files.length === 0) return;
                      setRelatorioLote(null);
                      setLinhasBase([]);
                      await processarXml(e.target.files);
                    }}
                  />
                  <p style={{ fontSize: "12px", color: "#94a3b8", marginTop: "8px" }}>
                    Selecione um ou mais arquivos .xml ou um .zip contendo os XMLs.
                  </p>

                  {carregando && (
                    <p style={{ fontSize: "13px", color: "#2563eb", marginTop: "12px" }}>Lendo arquivos...</p>
                  )}

                  {errUpload && (
                    <div style={{ marginTop: "12px" }}>
                      <Alert variant="error">{errUpload}</Alert>
                    </div>
                  )}

                  {relatorioLote && (
                    <div style={{ marginTop: "16px" }}>
                      <div style={{
                        padding: "12px 16px", background: "#f0fdf4", borderRadius: "8px",
                        border: "1px solid #bbf7d0", fontSize: "14px", color: "#166534",
                      }}>
                        <strong>{relatorioLote.notas.length}</strong> nota(s) lida(s) com sucesso
                        {relatorioLote.falhas.length > 0 && (
                          <>, <strong style={{ color: "#dc2626" }}>{relatorioLote.falhas.length}</strong> falha(s)</>
                        )}
                      </div>

                      {relatorioLote.falhas.length > 0 && (
                        <div style={{ marginTop: "10px" }}>
                          <button
                            type="button"
                            onClick={() => setFalhasExpandidas(!falhasExpandidas)}
                            style={{ fontSize: "12px", color: "#2563eb", background: "none", border: "none", cursor: "pointer" }}
                          >
                            {falhasExpandidas ? "▲ Ocultar falhas" : "▼ Ver falhas"}
                          </button>
                          {falhasExpandidas && (
                            <div style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "4px" }}>
                              {relatorioLote.falhas.map((f, i) => (
                                <div key={i} style={{
                                  padding: "8px 12px", background: "#fef2f2", borderRadius: "6px",
                                  fontSize: "12px", color: "#991b1b",
                                }}>
                                  <strong>{f.arquivo}</strong>: {f.motivo}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Upload planilha */}
              {modo === "planilha" && (
                <div style={{ background: "#fff", borderRadius: "12px", padding: "24px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
                  <h2 style={{ fontSize: "15px", fontWeight: 700, color: "#1e293b", margin: "0 0 16px" }}>
                    Selecionar planilha
                  </h2>
                  <input
                    ref={inputPlanilhaRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    style={{ ...inputStyle, padding: "6px 12px", cursor: "pointer" }}
                    onChange={async (e) => {
                      if (!e.target.files?.[0]) return;
                      setPlanilhaLida(null);
                      setLinhasBase([]);
                      setFalhasPlanilha([]);
                      await processarPlanilha(e.target.files[0]);
                    }}
                  />
                  <p style={{ fontSize: "12px", color: "#94a3b8", marginTop: "8px" }}>
                    A coluna de <strong>Endereço</strong> é obrigatória. Demais colunas são opcionais.
                  </p>

                  {carregando && (
                    <p style={{ fontSize: "13px", color: "#2563eb", marginTop: "12px" }}>Lendo planilha...</p>
                  )}

                  {errUpload && <Alert variant="error">{errUpload}</Alert>}

                  {/* Mapeamento de colunas */}
                  {planilhaLida && (
                    <div style={{ marginTop: "20px" }}>
                      <h3 style={{ fontSize: "13px", fontWeight: 700, color: "#475569", marginBottom: "12px" }}>
                        Mapeamento de colunas
                      </h3>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                        {(
                          [
                            { key: "endereco", label: "Endereço *", obrigatorio: true },
                            { key: "nome", label: "Cliente / Destinatário", obrigatorio: false },
                            { key: "valor", label: "Valor", obrigatorio: false },
                            { key: "numeroNota", label: "Nº da Nota", obrigatorio: false },
                            { key: "observacoes", label: "Observações", obrigatorio: false },
                          ] as { key: keyof MapeamentoColunas; label: string; obrigatorio: boolean }[]
                        ).map(({ key, label, obrigatorio }) => (
                          <FormField key={key} label={label}>
                            <select
                              value={mapColunas[key] ?? ""}
                              onChange={(e) => {
                                const val = e.target.value;
                                setMapColunas((prev) => ({
                                  ...prev,
                                  [key]: val === "" ? undefined : Number(val),
                                }));
                              }}
                              style={selectStyle}
                            >
                              {!obrigatorio && <option value="">— Não usar —</option>}
                              {obrigatorio && mapColunas[key] === undefined && (
                                <option value="" disabled>Selecione a coluna</option>
                              )}
                              {planilhaLida.headers.map((h, i) => (
                                <option key={i} value={i}>{h || `(Coluna ${i + 1})`}</option>
                              ))}
                            </select>
                          </FormField>
                        ))}
                      </div>

                      {linhasBase.length > 0 && (
                        <div style={{
                          marginTop: "14px", padding: "12px 16px", background: "#f0fdf4",
                          borderRadius: "8px", border: "1px solid #bbf7d0",
                          fontSize: "14px", color: "#166534",
                        }}>
                          <strong>{linhasBase.length}</strong> linha(s) válida(s)
                          {falhasPlanilha.length > 0 && (
                            <>, <strong style={{ color: "#dc2626" }}>{falhasPlanilha.length}</strong> falha(s)</>
                          )}
                        </div>
                      )}

                      {falhasPlanilha.length > 0 && (
                        <div style={{ marginTop: "10px" }}>
                          <button
                            type="button"
                            onClick={() => setFalhasExpandidas(!falhasExpandidas)}
                            style={{ fontSize: "12px", color: "#2563eb", background: "none", border: "none", cursor: "pointer" }}
                          >
                            {falhasExpandidas ? "▲ Ocultar falhas" : "▼ Ver falhas"}
                          </button>
                          {falhasExpandidas && (
                            <div style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "4px" }}>
                              {falhasPlanilha.map((f, i) => (
                                <div key={i} style={{
                                  padding: "8px 12px", background: "#fef2f2", borderRadius: "6px",
                                  fontSize: "12px", color: "#991b1b",
                                }}>
                                  <strong>Linha {f.linha}</strong>: {f.motivo}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      <div style={{ marginTop: "16px" }}>
                        <Btn
                          type="button"
                          variant="outline"
                          onClick={confirmarMapeamento}
                          disabled={mapColunas.endereco === undefined}
                        >
                          Confirmar mapeamento
                        </Btn>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Avançar */}
              {linhasBase.length > 0 && (
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <Btn
                    type="button"
                    variant="primary"
                    disabled={carregandoDedupe}
                    onClick={avancarPreview}
                    style={{ minWidth: "180px" }}
                  >
                    {carregandoDedupe ? "Verificando duplicatas..." : `Avançar (${linhasBase.length} entregas)`}
                  </Btn>
                </div>
              )}
            </>
          )}

          {/* ── ETAPA: PREVIEW ── */}
          {etapa === "preview" && (
            <>
              {errImport && <Alert variant="error">{errImport}</Alert>}

              {/* Falhas do parse (informativo) */}
              {todasFalhas.length > 0 && (
                <Alert variant="warning">
                  {todasFalhas.length} arquivo(s)/linha(s) não puderam ser importados (veja abaixo).
                </Alert>
              )}

              {/* Opções do pedido */}
              <div style={{ background: "#fff", borderRadius: "12px", padding: "24px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
                <h2 style={{ fontSize: "15px", fontWeight: 700, color: "#1e293b", margin: "0 0 16px" }}>
                  Opções do Pedido
                </h2>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                  <div>
                    <label style={{ fontSize: "12px", fontWeight: 600, color: "#475569", display: "block", marginBottom: "8px" }}>
                      Agrupamento
                    </label>
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      {(
                        [
                          { val: "unico", label: "1 pedido com todas as entregas", sublabel: "Recomendado para uma única rota" },
                          { val: "por_nota", label: "1 pedido por nota / linha", sublabel: "Cada nota vira um pedido independente" },
                        ] as { val: Agrupamento; label: string; sublabel: string }[]
                      ).map(({ val, label, sublabel }) => (
                        <label key={val} style={{ display: "flex", gap: "10px", cursor: "pointer", alignItems: "flex-start" }}>
                          <input
                            type="radio"
                            name="agrupamento"
                            value={val}
                            checked={agrupamento === val}
                            onChange={() => setAgrupamento(val)}
                            style={{ marginTop: "3px", accentColor: "#2563eb" }}
                          />
                          <div>
                            <div style={{ fontSize: "13px", fontWeight: 600, color: "#1e293b" }}>{label}</div>
                            <div style={{ fontSize: "11px", color: "#64748b" }}>{sublabel}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    <FormField label="Data prevista">
                      <input
                        type="date"
                        value={dataPrevista}
                        onChange={(e) => setDataPrevista(e.target.value)}
                        style={inputStyle}
                      />
                    </FormField>

                    {locais.length > 0 && (
                      <FormField label="Local de carregamento (opcional)">
                        <select
                          value={localId}
                          onChange={(e) => setLocalId(e.target.value)}
                          style={selectStyle}
                        >
                          <option value="">— Nenhum (usa &quot;Depósito&quot;) —</option>
                          {locais.map((l) => (
                            <option key={l.id} value={l.id}>
                              {l.nome} — {l.endereco}
                            </option>
                          ))}
                        </select>
                      </FormField>
                    )}

                    {agrupamento === "unico" && (
                      <FormField
                        label="Valor do frete (R$)"
                        hint="Valor cobrado do cliente pelo frete — não é a soma das notas"
                      >
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={valorPedido}
                          onChange={(e) => setValorPedido(e.target.value)}
                          placeholder="Ex: 1500.00"
                          style={inputStyle}
                        />
                      </FormField>
                    )}
                  </div>
                </div>
              </div>

              {/* Tabela de preview */}
              <DataTable
                toolbar={
                  <span style={{ fontSize: "13px", color: "#475569" }}>
                    <strong>{countSelecionadas}</strong> de {linhasPreview.length} selecionadas
                  </span>
                }
              >
                <thead>
                  <tr>
                    <Th style={{ width: "40px" }}>
                      <input
                        type="checkbox"
                        checked={
                          linhasPreview.filter((l) => !l.jaImportada).length > 0 &&
                          linhasPreview.filter((l) => !l.jaImportada).every((l) => selecionadas.has(l.idx))
                        }
                        onChange={toggleTodas}
                        style={{ accentColor: "#2563eb" }}
                      />
                    </Th>
                    <Th>Destinatário / Cliente</Th>
                    <Th>Endereço</Th>
                    <Th>Nº Nota</Th>
                    <Th style={{ textAlign: "right" }}>Valor da Nota</Th>
                    <Th>Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {linhasPreview.map((l) => (
                    <Tr key={l.idx} muted={l.jaImportada}>
                      <Td>
                        <input
                          type="checkbox"
                          checked={selecionadas.has(l.idx)}
                          disabled={l.jaImportada}
                          onChange={() => toggleLinha(l.idx)}
                          style={{ accentColor: "#2563eb" }}
                        />
                      </Td>
                      <Td style={{ fontWeight: 500 }}>{l.destinatario || "—"}</Td>
                      <Td style={{ maxWidth: "280px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {l.endereco}
                      </Td>
                      <Td>{l.numeroNota || "—"}</Td>
                      <Td style={{ textAlign: "right" }}>{fmtValor(l.valorNota)}</Td>
                      <Td>
                        {l.jaImportada ? (
                          <Badge variant="warning">Já importada</Badge>
                        ) : (
                          <Badge variant="success">OK</Badge>
                        )}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </DataTable>

              {/* Falhas do parse expandíveis */}
              {todasFalhas.length > 0 && (
                <div>
                  <button
                    type="button"
                    onClick={() => setFalhasExpandidas(!falhasExpandidas)}
                    style={{ fontSize: "12px", color: "#2563eb", background: "none", border: "none", cursor: "pointer" }}
                  >
                    {falhasExpandidas ? "▲ Ocultar falhas do parse" : `▼ Ver ${todasFalhas.length} falha(s) do parse`}
                  </button>
                  {falhasExpandidas && (
                    <div style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "4px" }}>
                      {todasFalhas.map((f, i) => (
                        <div key={i} style={{
                          padding: "8px 12px", background: "#fef2f2", borderRadius: "6px",
                          fontSize: "12px", color: "#991b1b",
                        }}>
                          <strong>{f.origem}</strong>: {f.motivo}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Ações */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: "32px" }}>
                <Btn
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setEtapa("upload");
                    setLinhasPreview([]);
                    setErrImport("");
                  }}
                >
                  Voltar
                </Btn>
                <Btn
                  type="button"
                  variant="primary"
                  disabled={importando || countSelecionadas === 0}
                  onClick={importar}
                  style={{ minWidth: "200px" }}
                >
                  {importando
                    ? "Importando..."
                    : `Importar ${countSelecionadas} entrega${countSelecionadas !== 1 ? "s" : ""}`}
                </Btn>
              </div>
            </>
          )}

          {/* ── ETAPA: RESULTADO ── */}
          {etapa === "resultado" && resultado && (
            <div style={{ background: "#fff", borderRadius: "16px", padding: "40px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)", textAlign: "center" }}>
              <div style={{ fontSize: "48px", marginBottom: "16px" }}>✅</div>
              <h2 style={{ fontSize: "20px", fontWeight: 700, color: "#166534", margin: "0 0 8px" }}>
                Importação concluída!
              </h2>
              <p style={{ fontSize: "15px", color: "#475569", margin: "0 0 24px" }}>
                <strong>{resultado.pedidos}</strong> pedido{resultado.pedidos !== 1 ? "s" : ""} e{" "}
                <strong>{resultado.entregas}</strong> entrega{resultado.entregas !== 1 ? "s" : ""} criados.
              </p>

              {todasFalhas.length > 0 && (
                <div style={{
                  margin: "0 auto 24px", maxWidth: "500px",
                  padding: "12px 16px", background: "#fefce8",
                  border: "1px solid #fde68a", borderRadius: "8px",
                  textAlign: "left", fontSize: "13px", color: "#854d0e",
                }}>
                  <strong>{todasFalhas.length}</strong> nota(s)/linha(s) não foram importadas por falha no parse (ver detalhes acima).
                </div>
              )}

              <p style={{ fontSize: "12px", color: "#94a3b8", marginBottom: "28px" }}>
                O geocoding das entregas está sendo processado em segundo plano.
              </p>

              <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
                <Btn href="/pedidos" variant="outline">Ver Pedidos</Btn>
                <Btn href="/despacho" variant="primary">Ir para o Despacho</Btn>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
