"use client";

// ─── Etapa 2: Upload de arquivos (XML ou Planilha) ───────────────────────────

import { useRef, useState } from "react";
import { Alert, Btn, FormField, inputStyle, selectStyle } from "@/components/ui/ds";
import type { RelatorioLote } from "@/lib/import/nfeParser";
import type { MapeamentoColunas, PlanilhaLida } from "@/lib/import/planilhaParser";
import type { LinhaPreview, Modo, PedidoAlvo } from "./tipos";
import { CabecalhoPedido } from "./CabecalhoPedido";

type Props = {
  // pedido
  carregandoPedido: boolean;
  errPedido: string;
  pedidoAlvo: PedidoAlvo | null;
  pedidoFinalizado: boolean;

  // modo
  modo: Modo;
  onMudarModo: (m: Modo) => void;

  // estado do parse
  carregando: boolean;
  errUpload: string;

  // XML
  relatorioLote: RelatorioLote | null;
  onArquivosXml: (files: FileList) => void;

  // planilha
  planilhaLida: PlanilhaLida | null;
  mapColunas: Partial<MapeamentoColunas>;
  onArquivoPlanilha: (file: File) => void;
  onChangeMapColuna: (key: keyof MapeamentoColunas, val: number | undefined) => void;
  onConfirmarMapeamento: () => void;
  falhasPlanilha: { linha: number; motivo: string }[];

  // linhas base (resultado do parse)
  linhasBase: Omit<LinhaPreview, "jaImportada">[];

  // falhas expandíveis
  falhasExpandidas: boolean;
  onToggleFalhas: () => void;

  // avançar
  carregandoDedupe: boolean;
  onAvancarPreview: () => void;
};

export function EtapaUpload({
  carregandoPedido,
  errPedido,
  pedidoAlvo,
  pedidoFinalizado,
  modo,
  onMudarModo,
  carregando,
  errUpload,
  relatorioLote,
  onArquivosXml,
  planilhaLida,
  mapColunas,
  onArquivoPlanilha,
  onChangeMapColuna,
  onConfirmarMapeamento,
  falhasPlanilha,
  linhasBase,
  falhasExpandidas,
  onToggleFalhas,
  carregandoDedupe,
  onAvancarPreview,
}: Props) {
  const inputXmlRef = useRef<HTMLInputElement>(null);
  const inputPlanilhaRef = useRef<HTMLInputElement>(null);
  const [arquivoXmlNome, setArquivoXmlNome] = useState<string | null>(null);
  const [arquivoPlanilhaNome, setArquivoPlanilhaNome] = useState<string | null>(null);

  /** Reseta os inputs de arquivo ao mudar de modo */
  const handleMudarModo = (m: Modo) => {
    if (inputXmlRef.current) inputXmlRef.current.value = "";
    if (inputPlanilhaRef.current) inputPlanilhaRef.current.value = "";
    setArquivoXmlNome(null);
    setArquivoPlanilhaNome(null);
    onMudarModo(m);
  };

  return (
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
      {!pedidoFinalizado && pedidoAlvo && <CabecalhoPedido pedido={pedidoAlvo} />}

      {!pedidoFinalizado && (
        <>
          {/* Seletor de modo: XML ou Planilha */}
          <div style={{ display: "flex", gap: "12px" }}>
            {(["xml", "planilha"] as Modo[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => handleMudarModo(m)}
                style={{
                  flex: 1, padding: "16px 20px", borderRadius: "12px", cursor: "pointer",
                  border: modo === m ? "2px solid #2563eb" : "2px solid #cbd5e1",
                  background: modo === m ? "#eff6ff" : "#f8fafc",
                  boxShadow: modo === m ? "0 2px 8px rgba(37,99,235,0.15)" : "0 1px 3px rgba(0,0,0,0.06)",
                  textAlign: "left",
                  minHeight: "80px",
                  display: "flex", flexDirection: "column", justifyContent: "center",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{
                    width: "14px", height: "14px", borderRadius: "50%",
                    border: `2px solid ${modo === m ? "#2563eb" : "#94a3b8"}`,
                    background: modo === m ? "#2563eb" : "transparent",
                    flexShrink: 0,
                    display: "inline-block",
                  }} />
                  <span style={{ fontSize: "15px", fontWeight: 700, color: modo === m ? "#1d4ed8" : "#1e293b" }}>
                    {m === "xml" ? "XML de NFe" : "Planilha"}
                  </span>
                </div>
                <div style={{ fontSize: "12px", color: "#64748b", marginTop: "6px" }}>
                  {m === "xml"
                    ? "Arquivos .xml individuais ou .zip com vários XMLs"
                    : "Arquivo .xlsx, .xls ou .csv com endereços"}
                </div>
              </button>
            ))}
          </div>

          {/* ── Upload XML ── */}
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
                  const nomes = Array.from(e.target.files).map(f => f.name).join(", ");
                  setArquivoXmlNome(nomes);
                  onArquivosXml(e.target.files);
                }}
              />
              {arquivoXmlNome && !carregando && (
                <p style={{ fontSize: "12px", color: "#059669", marginTop: "6px", fontWeight: 500 }}>
                  Arquivo selecionado: {arquivoXmlNome}
                </p>
              )}
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
                        onClick={onToggleFalhas}
                        style={{ fontSize: "12px", color: "#2563eb", background: "none", border: "none", cursor: "pointer", padding: "10px 8px", minHeight: "44px" }}
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

          {/* ── Upload Planilha ── */}
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
                  setArquivoPlanilhaNome(e.target.files[0].name);
                  onArquivoPlanilha(e.target.files[0]);
                }}
              />
              {arquivoPlanilhaNome && !carregando && (
                <p style={{ fontSize: "12px", color: "#059669", marginTop: "6px", fontWeight: 500 }}>
                  Arquivo selecionado: {arquivoPlanilhaNome}
                </p>
              )}
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
                  <div className="m-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
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
                            onChangeMapColuna(key, val === "" ? undefined : Number(val));
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
                        onClick={onToggleFalhas}
                        style={{ fontSize: "12px", color: "#2563eb", background: "none", border: "none", cursor: "pointer", padding: "10px 8px", minHeight: "44px" }}
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
                      onClick={onConfirmarMapeamento}
                      disabled={mapColunas.endereco === undefined}
                    >
                      Confirmar mapeamento
                    </Btn>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Botão avançar */}
          {linhasBase.length > 0 && (
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <Btn
                type="button"
                variant="primary"
                disabled={carregandoDedupe}
                onClick={onAvancarPreview}
                style={{ minWidth: "180px" }}
              >
                {carregandoDedupe ? "Verificando duplicatas..." : `Avançar (${linhasBase.length} entregas)`}
              </Btn>
            </div>
          )}
        </>
      )}
    </>
  );
}
