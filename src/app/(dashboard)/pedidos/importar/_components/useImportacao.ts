"use client";

// ─── Hook: gerencia todo o estado e a lógica de negócio da importação ─────────
// A page só renderiza — sem nenhuma lógica inline.

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import JSZip from "jszip";
import { createClient } from "@/lib/supabase/client";
import { rotuloPedido } from "@/lib/utils/numeroPedido";
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
import {
  STATUS_FINALIZADOS,
  chunks,
  type Etapa,
  type LinhaPreview,
  type Modo,
  type PedidoAlvo,
  type PedidoOpcao,
} from "./tipos";

export type UseImportacaoReturn = ReturnType<typeof useImportacao>;

export function useImportacao(pedidoIdUrl: string | null) {
  const router = useRouter();
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
        .select("id,numero,status,data_inicio_prevista,local_carregamento,veiculo_id,motorista_id,motoristas(nome),entregas(id)")
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
        setErrPedido(`O pedido ${rotuloPedido(p.numero, p.id)} está finalizado (${p.status}) e não pode receber novas entregas.`);
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
        .select("id,numero,status,data_inicio_prevista,entregas(id,destino,nome_cliente_avulso)")
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

  // ── confirmar seleção de pedido ────────────────────────────────────────────
  const confirmarSelecaoPedido = () => {
    if (!pedidoSelecionadoId) return;
    setPedidoAlvoId(pedidoSelecionadoId);
    setEtapa("upload");
  };

  // ── processamento XML ───────────────────────────────────────────────────────
  const processarXml = async (files: FileList) => {
    setCarregando(true);
    setErrUpload("");
    setRelatorioLote(null);
    setLinhasBase([]);

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
    setLinhasBase([]);
    setFalhasPlanilha([]);

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

  // ─── falhas unificadas (XML + planilha) ────────────────────────────────────
  const todasFalhas = [
    ...(relatorioLote?.falhas ?? []).map((f) => ({ origem: f.arquivo, motivo: f.motivo })),
    ...falhasPlanilha.map((f) => ({ origem: `Linha ${f.linha}`, motivo: f.motivo })),
  ];

  const pedidoFinalizado = pedidoAlvo ? STATUS_FINALIZADOS.includes(pedidoAlvo.status) : false;

  return {
    // estado
    etapa,
    modo,
    empresaId,
    pedidoAlvo,
    pedidoFinalizado,
    carregandoPedido,
    errPedido,
    opcoesPedido,
    carregandoOpcoes,
    pedidoSelecionadoId,
    setPedidoSelecionadoId,
    carregando,
    errUpload,
    relatorioLote,
    falhasPlanilha,
    falhasExpandidas,
    planilhaLida,
    mapColunas,
    linhasBase,
    linhasPreview,
    selecionadas,
    carregandoDedupe,
    importando,
    errImport,
    resultado,
    todasFalhas,
    // ações
    confirmarSelecaoPedido,
    mudarModo: (m: Modo) => {
      setModo(m);
      setErrUpload("");
      setRelatorioLote(null);
      setFalhasPlanilha([]);
      setPlanilhaLida(null);
      setMapColunas({});
      setLinhasBase([]);
    },
    processarXml,
    processarPlanilha,
    confirmarMapeamento,
    atualizarMapColuna: (key: keyof MapeamentoColunas, val: number | undefined) =>
      setMapColunas((prev) => ({ ...prev, [key]: val })),
    avancarPreview,
    toggleLinha,
    toggleTodas,
    importar,
    toggleFalhas: () => setFalhasExpandidas((v) => !v),
    voltarParaUpload: () => {
      setEtapa("upload");
      setLinhasPreview([]);
      setErrImport("");
    },
  };
}
