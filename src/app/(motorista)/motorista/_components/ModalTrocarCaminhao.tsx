"use client";

/**
 * Popup "Trocar de caminhão" da tela inicial do motorista.
 *
 * Lista os caminhões ativos cadastrados, mostrando com quem cada um está
 * (alocação operacional aberta). O motorista PODE escolher um caminhão que está
 * com outro colega — decisão do dono: não travar a operação aqui; o sistema tem
 * que refletir a realidade (ele já saiu da garagem com o caminhão). Em vez de
 * travar, o gestor recebe um AVISO na tela principal do painel.
 *
 * A troca em si roda em /api/motorista/trocar-caminhao (encerra alocações
 * abertas, cria a nova e grava o lembrete pro gestor).
 */

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { cores } from "@/lib/mobile/ui";
import type { VeiculoAtivo } from "@/lib/mobile/veiculoAtivo";

type VeiculoOpcao = {
  id: string;
  apelido: string | null;
  modelo: string;
  placa: string;
  km_atual: number | null;
  comQuem: string | null; // nome do motorista que está com ele (alocação aberta)
};

export function ModalTrocarCaminhao({
  veiculoAtual,
  motoristaId,
  empresaId,
  onFechar,
  onSucesso,
}: {
  veiculoAtual: VeiculoAtivo | null;
  motoristaId: string;
  empresaId: string;
  onFechar: () => void;
  onSucesso: (novo: VeiculoAtivo) => void;
}) {
  const [opcoes, setOpcoes] = useState<VeiculoOpcao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const supabase = createClient();
        // Cadastro pequeno (frota própria) — lista inteira, sem paginação.
        // Sem filtro de empresa_id: os CNPJs são da mesma empresa real.
        const { data: veiculos, error: errV } = await supabase
          .from("veiculos")
          .select("id, apelido, modelo, placa, km_atual")
          .eq("ativo", true)
          .order("apelido");
        if (errV) throw errV;

        // alocacoes nao tem FK declarada no banco (sem join embutido) —
        // busca as alocacoes abertas e os nomes dos motoristas em 2 queries.
        const { data: alocs } = await supabase
          .from("alocacoes")
          .select("veiculo_id, motorista_id")
          .eq("status", "operacional")
          .is("fim", null);
        const abertas = ((alocs ?? []) as Array<{ veiculo_id: string; motorista_id: string | null }>)
          .filter((a) => a.veiculo_id && a.motorista_id && a.motorista_id !== motoristaId);

        const nomePorMotorista = new Map<string, string>();
        const idsMotoristas = [...new Set(abertas.map((a) => a.motorista_id as string))];
        if (idsMotoristas.length > 0) {
          const { data: mots } = await supabase.from("motoristas").select("id, nome").in("id", idsMotoristas);
          for (const m of (mots ?? []) as Array<{ id: string; nome: string }>) nomePorMotorista.set(m.id, m.nome);
        }

        const comQuemPorVeiculo = new Map<string, string>();
        for (const a of abertas) {
          const nome = nomePorMotorista.get(a.motorista_id as string);
          if (nome) comQuemPorVeiculo.set(a.veiculo_id, nome);
        }

        setOpcoes(
          ((veiculos ?? []) as Array<Omit<VeiculoOpcao, "comQuem">>).map((v) => ({
            ...v,
            comQuem: comQuemPorVeiculo.get(v.id) ?? null,
          }))
        );
      } catch {
        setErro("Não consegui carregar os caminhões. Precisa de internet pra trocar.");
      } finally {
        setCarregando(false);
      }
    };
    void load();
  }, [motoristaId]);

  const handleConfirmar = async () => {
    if (!selecionado) return;
    setErro(null);
    setSalvando(true);
    try {
      const res = await fetch("/api/motorista/trocar-caminhao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motorista_id: motoristaId, empresa_id: empresaId, veiculo_id_novo: selecionado }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro(
          data.erro === "mesmo_veiculo"
            ? "Você já está com esse caminhão."
            : `Não consegui trocar (${data.detalhe ?? res.status}). Tente de novo.`
        );
        return;
      }
      onSucesso(data.veiculo as VeiculoAtivo);
    } catch {
      setErro("Sem internet — a troca precisa de conexão. Tente de novo mais tarde.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div
      data-testid="modal-trocar-caminhao"
      style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", zIndex: 60, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
      onClick={onFechar}
    >
      <div
        style={{ background: cores.branco, borderRadius: "16px 16px 0 0", padding: "20px 16px 24px", width: "100%", maxWidth: "480px", maxHeight: "85vh", overflowY: "auto", boxSizing: "border-box" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: "17px", fontWeight: 800, color: cores.texto, marginBottom: "4px" }}>
          🔁 Trocar de caminhão
        </div>
        <div style={{ fontSize: "13px", color: cores.textoFraco, marginBottom: "12px" }}>
          Saiu com outro caminhão? Escolha abaixo qual está com você agora.
        </div>

        <div style={{ background: cores.fundoAmbar, border: `1px solid ${cores.bordaAmbar}`, borderRadius: "8px", padding: "10px 12px", fontSize: "12px", color: cores.textoAmbar, fontWeight: 600, lineHeight: 1.5, marginBottom: "14px" }}>
          ⚠️ O gestor será avisado da troca no painel.
        </div>

        {carregando && (
          <div style={{ textAlign: "center", padding: "24px", color: cores.textoFraco, fontSize: "14px" }}>Carregando caminhões…</div>
        )}

        {!carregando && (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {opcoes.map((v) => {
              const ehAtual = veiculoAtual?.id === v.id;
              const sel = selecionado === v.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  data-testid={`opcao-veiculo-${v.id}`}
                  disabled={ehAtual}
                  onClick={() => setSelecionado(v.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    textAlign: "left",
                    background: sel ? cores.fundoVerde : cores.branco,
                    border: `2px solid ${sel ? cores.verde : cores.borda}`,
                    borderRadius: "12px",
                    padding: "12px 14px",
                    opacity: ehAtual ? 0.55 : 1,
                    cursor: ehAtual ? "default" : "pointer",
                  }}
                >
                  <div style={{ fontSize: "24px" }}>🚛</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "15px", fontWeight: 700, color: cores.texto }}>
                      {v.apelido ?? v.modelo}
                      <span style={{ fontWeight: 500, color: cores.textoFraco }}> · {v.placa}</span>
                    </div>
                    <div style={{ fontSize: "12px", color: cores.textoFraco, marginTop: "2px" }}>
                      {v.modelo}
                      {v.km_atual != null ? ` · ${v.km_atual.toLocaleString("pt-BR")} km` : ""}
                    </div>
                  </div>
                  {ehAtual ? (
                    <span style={{ fontSize: "11px", fontWeight: 700, color: cores.azulTexto, background: cores.fundoAzul, border: `1px solid ${cores.bordaAzul}`, borderRadius: "6px", padding: "3px 8px", whiteSpace: "nowrap" }}>
                      Atual
                    </span>
                  ) : v.comQuem ? (
                    <span style={{ fontSize: "11px", fontWeight: 700, color: cores.textoAmbar, background: cores.fundoAmbarClaro, border: `1px solid ${cores.bordaAmbar}`, borderRadius: "6px", padding: "3px 8px", whiteSpace: "nowrap" }}>
                      com {v.comQuem.split(" ")[0]}
                    </span>
                  ) : (
                    <span style={{ fontSize: "11px", fontWeight: 700, color: cores.textoVerde, background: cores.fundoVerde, border: `1px solid ${cores.bordaVerde}`, borderRadius: "6px", padding: "3px 8px", whiteSpace: "nowrap" }}>
                      livre
                    </span>
                  )}
                </button>
              );
            })}
            {opcoes.length === 0 && !erro && (
              <div style={{ textAlign: "center", padding: "16px", color: cores.textoFraco, fontSize: "13px" }}>Nenhum caminhão cadastrado.</div>
            )}
          </div>
        )}

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
            data-testid="btn-confirmar-troca"
            onClick={handleConfirmar}
            disabled={!selecionado || salvando}
            style={{ flex: 2, padding: "13px", background: !selecionado || salvando ? cores.textoSuave : cores.verde, border: "none", borderRadius: "10px", fontSize: "15px", fontWeight: 800, color: cores.branco, cursor: !selecionado || salvando ? "default" : "pointer" }}
          >
            {salvando ? "Trocando…" : "Confirmar troca"}
          </button>
        </div>
      </div>
    </div>
  );
}
