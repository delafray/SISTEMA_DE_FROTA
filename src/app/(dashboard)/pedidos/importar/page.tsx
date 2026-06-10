"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
type Etapa = "selecionar_pedido" | "upload" | "preview" | "resultado";

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

type PedidoAlvo = {
  id: string;
  status: string;
  data_inicio_prevista: string | null;
  local_carregamento: string | null;
  veiculo_id: string | null;
  motorista_id: string | null;
  motoristas: { nome: string } | null;
  entregas: { id: string }[];
};

type PedidoOpcao = {
  id: string;
  status: string;
  data_inicio_prevista: string | null;
  entregas: { id: string; destino: string | null; nome_cliente_avulso: string | null }[];
};

// ─── helpers ─────────────────────────────────────────────────────────────────

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

/** Retorna os 8 primeiros caracteres do UUID como ID curto */
function idCurto(id: string): string {
  return id.slice(0, 8);
}

/** Determina o destino/cliente principal de um pedido para o rótulo do seletor */
function labelPedido(p: PedidoOpcao): string {
  const nEnt = p.entregas.length;
  const primeiraEnt = p.entregas[0];
  const clienteOuDestino =
    primeiraEnt?.nome_cliente_avulso || primeiraEnt?.destino || "sem entregas";
  return `#${idCurto(p.id)} · ${clienteOuDestino} · ${nEnt} entrega${nEnt !== 1 ? "s" : ""}`;
}

const STATUS_FINALIZADOS = ["concluido", "concluida", "cancelado", "cancelada"];

// ─── Componente interno (usa useSearchParams) ─────────────────────────────────

function ImportarNotasInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pedidoIdUrl = searchParams.get("pedido_id");
  const supabase = createClient();

  // auth
  const [empresaId, setEmpresaId] = useState<string | null>(null);

  // pedido alvo
  const [pedidoAlvo, setPedidoAlvo] = useState<PedidoAlvo | null>(null);
  const [pedidoAlvoId, setPedidoAlvoId] = useState<string>(pedidoIdUrl ?? "");
  const [carregandoPedido, setCarregandoPedido] = useState(false);
  const [errPedido, setErrPedido] = useState("");

  // seletor de pedido (quando sem pedido_id na URL)
  const [opcoesPedido, setOpcoesPedido] = useState<PedidoOpcao[]>([]);
  const [carregandoOpcoes, setCarregandoOpcoes] = useState(false);
  const [pedidoSelecionadoId, setPedidoSelecionadoId] = useState<string>("");

  // controle de etapa
  const [etapa, setEtapa] = useState<Etapa>(pedidoIdUrl ? "upload" : "selecionar_pedido");
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

  // resultado
  const [importando, setImportando] = useState(false);
  const [errImport, setErrImport] = useState("");
  const [resultado, setResultado] = useState<{ entregas: number; pedidoId: string } | null>(null);

  // refs para inputs de arquivo
  const inputXmlRef = useRef<HTMLInputElement>(null);
  const inputPlanilhaRef = useRef<HTMLInputElement>(null);

  // ── carrega empresa ────────────────────────────────────────────────────────
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
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── carrega pedido alvo quando temos empresaId + pedidoAlvoId ──────────────
  useEffect(() => {
    if (!empresaId || !pedidoAlvoId) return;
    const load = async () => {
      setCarregandoPedido(true);
      setErrPedido("");
      const { data, error } = await supabase
        .from("pedidos")
        .select("id,status,data_inicio_prevista,local_carregamento,veiculo_id,motorista_id,motoristas(nome),entregas(id)")
        .eq("id", pedidoAlvoId)
        .eq("empresa_id", empresaId)
        .single();
      setCarregandoPedido(false);
      if (error || !data) {
        setErrPedido("Pedido não encontrado ou sem permissão.");
        return;
      }
      const p = data as unknown as PedidoAlvo;
      if (STATUS_FINALIZADOS.includes(p.status)) {
        setErrPedido(`O pedido #${idCurto(p.id)} está finalizado (${p.status}) e não pode receber novas entregas.`);
        setPedidoAlvo(p);
        return;
      }
      setPedidoAlvo(p);
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId, pedidoAlvoId]);

  // ── carrega opções de pedido (quando sem pedido_id na URL) ─────────────────
  useEffect(() => {
    if (!empresaId || pedidoIdUrl) return;
    const load = async () => {
      setCarregandoOpcoes(true);
      const { data } = await supabase
        .from("pedidos")
        .select("id,status,data_inicio_prevista,entregas(id,destino,nome_cliente_avulso)")
        .eq("empresa_id", empresaId)
        .not("status", "in", `(${STATUS_FINALIZADOS.join(",")})`)
        .order("data_inicio_prevista", { ascending: false })
        .range(0, 99);
      setOpcoesPedido((data ?? []) as unknown as PedidoOpcao[]);
      setCarregandoOpcoes(false);
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId, pedidoIdUrl]);

  // ── confirmar seleção de pedido (etapa selecionar_pedido) ─────────────────
  const confirmarSelecaoPedido = () => {
    if (!pedidoSelecionadoId) return;
    setPedidoAlvoId(pedidoSelecionadoId);
    setEtapa("upload");
  };

  // ── processamento XML ───────────────────────────────────────────────────────
  const processarXml = async (files: FileList) => {
    setCarregando(true);
    setErrUpload("");

    const arquivos: { nome: string; conteudo: string }[] = [];

    for (const file of Array.from(files)) {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      if (ext === "zip") {
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

    const chaves = linhasBase
      .map((l) => l.nfeChave)
      .filter((c): c is string => !!c);

    const jaExistentes = new Set<string>();

    if (chaves.length > 0 && empresaId) {
      const lotes = chunks(chaves, 200);
      for (const lote of lotes) {
        const { data } = await supabase
          .from("entregas")
          .select("nfe_chave")
          .eq("empresa_id", empresaId)
          .in("nfe_chave", lote);
        if (data) {
          data.forEach((r) => {
            if (r.nfe_chave) jaExistentes.add(r.nfe_chave);
          });
        }
      }
    }

    const preview: LinhaPreview[] = linhasBase.map((l) => ({
      ...l,
      jaImportada: l.nfeChave ? jaExistentes.has(l.nfeChave) : false,
    }));

    setLinhasPreview(preview);
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
    if (!empresaId || !pedidoAlvo) return;
    const linhasSelecionadas = linhasPreview.filter((l) => selecionadas.has(l.idx));
    if (linhasSelecionadas.length === 0) {
      setErrImport("Selecione ao menos uma entrega para importar.");
      return;
    }

    setImportando(true);
    setErrImport("");

    const origemEntrega = pedidoAlvo.local_carregamento ?? "Depósito";

    try {
      const rowsEntregas = linhasSelecionadas.map((l) => ({
        empresa_id: empresaId,
        pedido_id: pedidoAlvo.id,
        status: "agendado",
        // pedido já despachado → entregas novas herdam caminhão/motorista
        veiculo_id: pedidoAlvo.veiculo_id ?? null,
        motorista_id: pedidoAlvo.motorista_id ?? null,
        origem: origemEntrega,
        destino: l.endereco,
        nome_cliente_avulso: l.destinatario || null,
        observacoes: l.observacoes || null,
        origem_demanda: "importacao_massa",
        nfe_chave: l.nfeChave ?? null,
        nfe_numero: l.numeroNota || null,
        nfe_valor: l.valorNota ?? null,
      }));

      const { error: errEnt } = await supabase
        .from("entregas")
        .insert(rowsEntregas);

      if (errEnt) throw new Error(errEnt.message);

      // geocoding fire-and-forget
      fetch("/api/routing/geocodar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pedido_id: pedidoAlvo.id }),
      }).catch(() => {});

      setResultado({ entregas: linhasSelecionadas.length, pedidoId: pedidoAlvo.id });
      setEtapa("resultado");
    } catch (e: unknown) {
      setErrImport(e instanceof Error ? e.message : "Erro desconhecido na importação.");
    } finally {
      setImportando(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  const todasFalhas = [
    ...(relatorioLote?.falhas ?? []).map((f) => ({ origem: f.arquivo, motivo: f.motivo })),
    ...falhasPlanilha.map((f) => ({ origem: `Linha ${f.linha}`, motivo: f.motivo })),
  ];

  const countSelecionadas = selecionadas.size;

  const pedidoFinalizado = pedidoAlvo ? STATUS_FINALIZADOS.includes(pedidoAlvo.status) : false;

  // ── cabeçalho-resumo do pedido alvo (JSX em variável: componente criado no
  //    render remontaria a cada digitação — regra react-hooks) ───────────────
  const cabecalhoPedido = (() => {
    if (!pedidoAlvo) return null;
    const nEnt = Array.isArray(pedidoAlvo.entregas) ? pedidoAlvo.entregas.length : 0;
    return (
      <div style={{
        background: "#eff6ff", borderRadius: "12px", padding: "16px 20px",
        border: "1px solid #bfdbfe", display: "flex", alignItems: "center",
        justifyContent: "space-between", flexWrap: "wrap", gap: "8px",
      }}>
        <div>
          <span style={{ fontSize: "13px", fontWeight: 700, color: "#1d4ed8" }}>
            Importando para o pedido #{idCurto(pedidoAlvo.id)}
          </span>
          {pedidoAlvo.data_inicio_prevista && (
            <span style={{ fontSize: "12px", color: "#3b82f6", marginLeft: "12px" }}>
              {new Date(pedidoAlvo.data_inicio_prevista + "T00:00:00").toLocaleDateString("pt-BR")}
            </span>
          )}
          {pedidoAlvo.motoristas?.nome && (
            <span style={{ fontSize: "12px", color: "#475569", marginLeft: "12px" }}>
              Motorista: {pedidoAlvo.motoristas.nome}
            </span>
          )}
        </div>
        <Badge variant="info">{nEnt} entrega{nEnt !== 1 ? "s" : ""} atual{nEnt !== 1 ? "is" : ""}</Badge>
      </div>
    );
  })();

  // ══════════════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════════════

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#f1f5f9" }}>
      <PageHeader
        title="Importar Notas para Pedido"
        actions={<Btn href="/despacho" variant="outline">Voltar</Btn>}
      />

      <div style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
        <div style={{ maxWidth: "900px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "24px" }}>

          {/* ── ETAPA: SELECIONAR PEDIDO ── */}
          {etapa === "selecionar_pedido" && (
            <div style={{ background: "#fff", borderRadius: "12px", padding: "28px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
              <h2 style={{ fontSize: "15px", fontWeight: 700, color: "#1e293b", margin: "0 0 8px" }}>
                Selecionar pedido de destino
              </h2>
              <p style={{ fontSize: "13px", color: "#64748b", margin: "0 0 20px" }}>
                Escolha o pedido ao qual as notas serão anexadas como entregas.
              </p>

              {carregandoOpcoes && (
                <p style={{ fontSize: "13px", color: "#2563eb" }}>Carregando pedidos...</p>
              )}

              {!carregandoOpcoes && opcoesPedido.length === 0 && (
                <Alert variant="warning">
                  Nenhum pedido ativo encontrado. Crie um pedido antes de importar notas.
                </Alert>
              )}

              {!carregandoOpcoes && opcoesPedido.length > 0 && (
                <>
                  <FormField label="Pedido">
                    <select
                      value={pedidoSelecionadoId}
                      onChange={(e) => setPedidoSelecionadoId(e.target.value)}
                      style={selectStyle}
                    >
                      <option value="">— Selecione um pedido —</option>
                      {opcoesPedido.map((p) => (
                        <option key={p.id} value={p.id}>
                          {labelPedido(p)}
                        </option>
                      ))}
                    </select>
                  </FormField>

                  <div style={{ marginTop: "20px", display: "flex", justifyContent: "flex-end" }}>
                    <Btn
                      type="button"
                      variant="primary"
                      disabled={!pedidoSelecionadoId}
                      onClick={confirmarSelecaoPedido}
                    >
                      Continuar com este pedido
                    </Btn>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── ETAPA: UPLOAD ── */}
          {etapa === "upload" && (
            <>
              {/* Cabeçalho do pedido alvo */}
              {carregandoPedido && (
                <p style={{ fontSize: "13px", color: "#2563eb" }}>Carregando pedido...</p>
              )}
              {errPedido && <Alert variant="error">{errPedido}</Alert>}
              {pedidoFinalizado && (
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <Btn href="/despacho" variant="outline">Voltar ao Despacho</Btn>
                </div>
              )}
              {!pedidoFinalizado && cabecalhoPedido}

              {/* Seletor de modo */}
              {!pedidoFinalizado && (
                <>
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
            </>
          )}

          {/* ── ETAPA: PREVIEW ── */}
          {etapa === "preview" && (
            <>
              {errImport && <Alert variant="error">{errImport}</Alert>}

              {todasFalhas.length > 0 && (
                <Alert variant="warning">
                  {todasFalhas.length} arquivo(s)/linha(s) não puderam ser importados (veja abaixo).
                </Alert>
              )}

              {/* Cabeçalho do pedido alvo */}
              {cabecalhoPedido}

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
                    : `Anexar ${countSelecionadas} entrega${countSelecionadas !== 1 ? "s" : ""} ao pedido`}
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
                <strong>{resultado.entregas}</strong> entrega{resultado.entregas !== 1 ? "s" : ""} anexada{resultado.entregas !== 1 ? "s" : ""} ao pedido{" "}
                <strong>#{idCurto(resultado.pedidoId)}</strong>.
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
                <Btn href={`/pedidos/${resultado.pedidoId}`} variant="outline">Ver pedido</Btn>
                <Btn href="/despacho" variant="primary">Voltar ao Despacho</Btn>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

// ─── Wrapper com Suspense (exigido pelo App Router para useSearchParams) ────────

export default function ImportarNotasPage() {
  return (
    <Suspense fallback={
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#64748b" }}>
        Carregando...
      </div>
    }>
      <ImportarNotasInner />
    </Suspense>
  );
}
