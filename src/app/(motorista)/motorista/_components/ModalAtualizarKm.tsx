"use client";

/**
 * Popup "Atualizar KM" da tela inicial do motorista.
 *
 * Mostra o KM atual do caminhão, campo pra digitar o novo KM e, abaixo, a opção
 * de tirar uma foto do painel — a foto é CLARAMENTE OPCIONAL (decisão do dono:
 * não obrigar, só deixar bem informado que ajuda o gestor a conferir).
 *
 * Envia pra /api/motorista/atualizar-km, que grava em km_logs (o trigger do
 * banco propaga pro veiculos.km_atual e recusa KM menor que o atual).
 */

import { useRef, useState } from "react";
import { cores } from "@/lib/mobile/ui";
import type { VeiculoAtivo } from "@/lib/mobile/veiculoAtivo";

/** Reduz a foto pra no máx. 1280px (JPEG ~0.72) — painel continua legível e o
 *  upload não estoura o limite de body da API com foto de 12MP. */
async function comprimirFoto(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("leitura_falhou"));
    reader.readAsDataURL(file);
  });
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("imagem_invalida"));
      el.src = dataUrl;
    });
    const escala = Math.min(1, 1280 / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * escala);
    canvas.height = Math.round(img.height * escala);
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.72);
  } catch {
    return dataUrl; // compressão é best-effort — manda a original
  }
}

export function ModalAtualizarKm({
  veiculo,
  motoristaId,
  empresaId,
  onFechar,
  onSucesso,
}: {
  veiculo: VeiculoAtivo;
  motoristaId: string;
  empresaId: string;
  onFechar: () => void;
  onSucesso: (kmNovo: number) => void;
}) {
  const [km, setKm] = useState("");
  const [foto, setFoto] = useState<string | null>(null);
  const [comprimindo, setComprimindo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const inputFotoRef = useRef<HTMLInputElement>(null);

  const kmAtualFmt =
    veiculo.km_atual != null ? `${veiculo.km_atual.toLocaleString("pt-BR")} km` : "não informado";

  const handleFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite tirar outra foto se cancelar/refazer
    if (!file) return;
    setComprimindo(true);
    try {
      setFoto(await comprimirFoto(file));
    } catch {
      setErro("Não consegui ler a foto. Pode tentar de novo ou salvar sem foto.");
    } finally {
      setComprimindo(false);
    }
  };

  const handleSalvar = async () => {
    setErro(null);
    const kmNovo = parseInt(km.replace(/\D/g, ""), 10);
    if (!km.trim() || isNaN(kmNovo) || kmNovo <= 0) {
      setErro("Digite a quilometragem do painel.");
      return;
    }
    if (veiculo.km_atual != null && kmNovo < veiculo.km_atual) {
      setErro(`O KM digitado é menor que o atual (${kmAtualFmt}). Confira o painel.`);
      return;
    }
    setSalvando(true);
    try {
      const res = await fetch("/api/motorista/atualizar-km", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          veiculo_id: veiculo.id,
          motorista_id: motoristaId,
          empresa_id: empresaId,
          km: kmNovo,
          foto_data_url: foto,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro(
          data.erro === "km_retroativo"
            ? "O KM informado é menor que o atual do caminhão. Confira o painel ou fale com o gestor."
            : `Não consegui salvar (${data.detalhe ?? res.status}). Tente de novo.`
        );
        return;
      }
      onSucesso(kmNovo);
    } catch {
      setErro("Sem internet — tente de novo quando a conexão voltar.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div
      data-testid="modal-atualizar-km"
      style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", zIndex: 60, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
      onClick={onFechar}
    >
      <div
        style={{ background: cores.branco, borderRadius: "16px 16px 0 0", padding: "20px 16px 24px", width: "100%", maxWidth: "480px", boxSizing: "border-box" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: "17px", fontWeight: 800, color: cores.texto, marginBottom: "4px" }}>
          🛣️ Atualizar quilometragem
        </div>
        <div style={{ fontSize: "13px", color: cores.textoFraco, marginBottom: "14px" }}>
          {veiculo.apelido ?? veiculo.modelo} · {veiculo.placa}
        </div>

        {/* KM atual */}
        <div style={{ background: cores.fundoApp, border: `1px solid ${cores.borda}`, borderRadius: "10px", padding: "10px 14px", marginBottom: "12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: "13px", color: cores.textoFraco }}>KM atual</span>
          <strong data-testid="km-atual" style={{ fontSize: "15px", color: cores.texto }}>{kmAtualFmt}</strong>
        </div>

        {/* novo KM */}
        <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: cores.textoForte, marginBottom: "6px" }}>
          Nova quilometragem (do painel)
        </label>
        <input
          data-testid="input-km"
          type="text"
          inputMode="numeric"
          placeholder={veiculo.km_atual != null ? `Maior ou igual a ${veiculo.km_atual.toLocaleString("pt-BR")}` : "Ex.: 152340"}
          value={km}
          onChange={(e) => setKm(e.target.value)}
          style={{ width: "100%", padding: "12px 14px", fontSize: "18px", fontWeight: 700, color: cores.texto, background: cores.fundoApp, border: `1px solid ${cores.bordaForte}`, borderRadius: "10px", outline: "none", boxSizing: "border-box" }}
        />

        {/* foto do painel — OPCIONAL */}
        <div style={{ marginTop: "14px", background: cores.fundoAzul, border: `1px solid ${cores.bordaAzul}`, borderRadius: "10px", padding: "12px" }}>
          <div style={{ fontSize: "13px", fontWeight: 700, color: cores.azulTexto }}>
            📷 Foto do painel — <span style={{ fontWeight: 800 }}>opcional</span>
          </div>
          <div style={{ fontSize: "12px", color: cores.textoMedio, margin: "4px 0 10px", lineHeight: 1.5 }}>
            Não é obrigatória. Se puder, tire uma foto do odômetro — ajuda o gestor a conferir a leitura.
          </div>
          <input
            ref={inputFotoRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFoto}
            style={{ display: "none" }}
            data-testid="input-foto"
          />
          {foto ? (
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={foto} alt="Foto do painel" style={{ width: "64px", height: "64px", objectFit: "cover", borderRadius: "8px", border: `1px solid ${cores.bordaAzul}` }} />
              <div style={{ flex: 1, fontSize: "12px", color: cores.textoVerde, fontWeight: 600 }}>✓ Foto anexada</div>
              <button type="button" onClick={() => setFoto(null)} style={{ background: "none", border: "none", color: cores.vermelho, fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>
                Remover
              </button>
            </div>
          ) : (
            <button
              type="button"
              data-testid="btn-tirar-foto"
              onClick={() => inputFotoRef.current?.click()}
              disabled={comprimindo}
              style={{ width: "100%", padding: "10px", background: cores.branco, border: `1px solid ${cores.bordaAzul}`, borderRadius: "8px", fontSize: "14px", fontWeight: 600, color: cores.azulTexto, cursor: "pointer" }}
            >
              {comprimindo ? "Carregando foto…" : "📷 Tirar foto do painel"}
            </button>
          )}
        </div>

        {erro && (
          <div role="alert" style={{ marginTop: "12px", background: cores.fundoVermelho, border: `1px solid ${cores.bordaVermelha}`, borderRadius: "8px", padding: "10px 12px", fontSize: "13px", color: cores.vermelhoTexto, fontWeight: 600 }}>
            {erro}
          </div>
        )}

        <div style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
          <button type="button" onClick={onFechar} disabled={salvando} style={{ flex: 1, padding: "13px", background: cores.divisoria, border: "none", borderRadius: "10px", fontSize: "15px", fontWeight: 700, color: cores.textoForte, cursor: "pointer" }}>
            Cancelar
          </button>
          <button
            type="button"
            data-testid="btn-salvar-km"
            onClick={handleSalvar}
            disabled={salvando || comprimindo}
            style={{ flex: 2, padding: "13px", background: salvando ? cores.textoSuave : cores.verde, border: "none", borderRadius: "10px", fontSize: "15px", fontWeight: 800, color: cores.branco, cursor: salvando ? "default" : "pointer" }}
          >
            {salvando ? "Salvando…" : "Salvar KM"}
          </button>
        </div>
      </div>
    </div>
  );
}
