"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { PageHeader, Btn } from "@/components/ui/ds";
import { useImportacao } from "./_components/useImportacao";
import { EtapaSelecionarPedido } from "./_components/EtapaSelecionarPedido";
import { EtapaUpload } from "./_components/EtapaUpload";
import { EtapaPreview } from "./_components/EtapaPreview";
import { EtapaResultado } from "./_components/EtapaResultado";

// ─── Componente interno (usa useSearchParams) ─────────────────────────────────

function ImportarNotasInner() {
  const searchParams = useSearchParams();
  const pedidoIdUrl = searchParams.get("pedido_id");

  const imp = useImportacao(pedidoIdUrl);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#f1f5f9" }}>
      <PageHeader
        title="Importar Notas para Pedido"
        actions={<Btn href="/despacho" variant="outline">Voltar</Btn>}
      />

      <div style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
        <div style={{ maxWidth: "900px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "24px" }}>

          {/* ── ETAPA: SELECIONAR PEDIDO ── */}
          {imp.etapa === "selecionar_pedido" && (
            <EtapaSelecionarPedido
              carregandoOpcoes={imp.carregandoOpcoes}
              opcoesPedido={imp.opcoesPedido}
              pedidoSelecionadoId={imp.pedidoSelecionadoId}
              onChangePedido={imp.setPedidoSelecionadoId}
              onConfirmar={imp.confirmarSelecaoPedido}
            />
          )}

          {/* ── ETAPA: UPLOAD ── */}
          {imp.etapa === "upload" && (
            <EtapaUpload
              carregandoPedido={imp.carregandoPedido}
              errPedido={imp.errPedido}
              pedidoAlvo={imp.pedidoAlvo}
              pedidoFinalizado={imp.pedidoFinalizado}
              modo={imp.modo}
              onMudarModo={imp.mudarModo}
              carregando={imp.carregando}
              errUpload={imp.errUpload}
              relatorioLote={imp.relatorioLote}
              onArquivosXml={imp.processarXml}
              planilhaLida={imp.planilhaLida}
              mapColunas={imp.mapColunas}
              onArquivoPlanilha={imp.processarPlanilha}
              onChangeMapColuna={imp.atualizarMapColuna}
              onConfirmarMapeamento={imp.confirmarMapeamento}
              falhasPlanilha={imp.falhasPlanilha}
              linhasBase={imp.linhasBase}
              falhasExpandidas={imp.falhasExpandidas}
              onToggleFalhas={imp.toggleFalhas}
              carregandoDedupe={imp.carregandoDedupe}
              onAvancarPreview={imp.avancarPreview}
            />
          )}

          {/* ── ETAPA: PREVIEW ── */}
          {imp.etapa === "preview" && imp.pedidoAlvo && (
            <EtapaPreview
              pedidoAlvo={imp.pedidoAlvo}
              linhasPreview={imp.linhasPreview}
              selecionadas={imp.selecionadas}
              onToggleLinha={imp.toggleLinha}
              onToggleTodas={imp.toggleTodas}
              todasFalhas={imp.todasFalhas}
              falhasExpandidas={imp.falhasExpandidas}
              onToggleFalhas={imp.toggleFalhas}
              errImport={imp.errImport}
              importando={imp.importando}
              onImportar={imp.importar}
              onVoltar={imp.voltarParaUpload}
            />
          )}

          {/* ── ETAPA: RESULTADO ── */}
          {imp.etapa === "resultado" && imp.resultado && (
            <EtapaResultado
              resultado={imp.resultado}
              todasFalhas={imp.todasFalhas}
            />
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
