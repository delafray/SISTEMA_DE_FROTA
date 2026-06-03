"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { obterSessaoComFallback } from "@/lib/offline/authOffline";
import { limparSessaoLocal } from "@/lib/offline/sessao";
import { limparRotasAtivas, listarRotasCacheadas } from "@/lib/offline/rotaCache";

/** Item da lista de rotas na tela inicial do motorista. */
type RotaItem = {
  id: string;
  data: string | null;
  status: string;
  distancia_total_km: number | null;
  tempo_total_min: number | null;
  qtd_paradas?: number;
};

const ROTA_STATUS: Record<string, { label: string; bg: string; color: string; border: string }> = {
  concluida:    { label: "Concluída",     bg: "#f0fdf4", color: "#166534", border: "#bbf7d0" },
  em_andamento: { label: "Em andamento",  bg: "#eff6ff", color: "#1e40af", border: "#bfdbfe" },
  otimizada:    { label: "Em aberto",     bg: "#fffbeb", color: "#92400e", border: "#fde68a" },
  rascunho:     { label: "Rascunho",      bg: "#f8fafc", color: "#64748b", border: "#e2e8f0" },
  cancelada:    { label: "Cancelada",     bg: "#fef2f2", color: "#991b1b", border: "#fecaca" },
};

const fmtDate = (d: string | null) =>
  d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR") : "—";

function fmtDistTempo(km: number | null, min: number | null): string {
  const partes: string[] = [];
  if (km != null) partes.push(`${km.toFixed(1)} km`);
  if (min != null) partes.push(`≈${Math.round(min)} min`);
  return partes.join(" · ");
}

export default function MotoristaPage() {
  const router = useRouter();
  const [nome, setNome] = useState("");
  const [rotas, setRotas] = useState<RotaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const [motoristaId, setMotoristaId] = useState<string | null>(null);
  const [empresaId, setEmpresaIdState] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const load = async () => {
      const supabase = createClient();
      // Auth com fallback offline: online valida no Supabase e salva o perfil
      // local; offline (sem rede) usa o perfil salvo (valido por 7 dias).
      const auth = await obterSessaoComFallback(supabase);
      if (!auth.ok || !auth.sessao) {
        if (auth.motivo === "role_negado") { router.push("/"); return; }
        router.push("/login");
        return;
      }

      const { motorista_id: mId, empresa_id: eId, nome: nomeUsr } = auth.sessao;
      if (nomeUsr) setNome(nomeUsr);
      setMotoristaId(mId);
      setEmpresaIdState(eId);

      // Offline: monta a lista a partir das rotas guardadas no aparelho.
      if (auth.origem === "offline_cache") {
        setOffline(true);
        if (mId) {
          const cache = await listarRotasCacheadas(mId);
          setRotas(
            cache.map((c) => ({
              id: c.rota.id,
              data: c.rota.data,
              status: c.rota.status,
              distancia_total_km: c.rota.distancia_total_km,
              tempo_total_min: c.rota.tempo_total_min,
              qtd_paradas: c.paradas.length,
            }))
          );
        }
        setLoading(false);
        return;
      }

      if (!mId) { setLoading(false); return; }

      // Online: lista as rotas do motorista (concluidas ou nao).
      try {
        const res = await fetch(`/api/routing/rotas?empresa_id=${eId}&motorista_id=${mId}&limite=30`);
        if (res.ok) {
          const data = await res.json();
          setRotas((data.rotas ?? []) as RotaItem[]);
        }
      } catch {
        // Sem rede no meio do caminho: cai pras rotas cacheadas localmente.
        const cache = await listarRotasCacheadas(mId);
        if (cache.length > 0) {
          setOffline(true);
          setRotas(
            cache.map((c) => ({
              id: c.rota.id,
              data: c.rota.data,
              status: c.rota.status,
              distancia_total_km: c.rota.distancia_total_km,
              tempo_total_min: c.rota.tempo_total_min,
              qtd_paradas: c.paradas.length,
            }))
          );
        }
      }
      setLoading(false);
    };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSignOut = async () => {
    setSigningOut(true);
    // Corta o acesso offline: apaga a sessao local e o cache de rota antes de sair.
    await limparSessaoLocal();
    await limparRotasAtivas();
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  const semVinculo = !loading && motoristaId === null;

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", color: "#64748b", flexDirection: "column", gap: "12px" }}>
      <div style={{ fontSize: "32px" }}>🚚</div>
      <div style={{ fontSize: "14px" }}>Carregando...</div>
    </div>
  );

  return (
    <div style={{ maxWidth: "480px", margin: "0 auto", padding: "0 0 32px 0", fontFamily: "system-ui, sans-serif" }}>

      {/* Header (menu) */}
      <div style={{ background: "#313f50", padding: "20px 16px 16px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: "11px", color: "rgba(147,197,253,0.7)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            App Motorista
          </div>
          <h1 style={{ fontSize: "20px", fontWeight: 700, color: "#fff", margin: "2px 0 0", lineHeight: 1.2 }}>
            Olá, {nome.split(" ")[0] || "Motorista"}
          </h1>
        </div>
        <button
          onClick={handleSignOut}
          disabled={signingOut}
          style={{ background: "rgba(239,68,68,0.15)", border: "none", color: "rgba(252,165,165,0.9)", borderRadius: "8px", padding: "8px 12px", fontSize: "13px", fontWeight: 600, cursor: signingOut ? "default" : "pointer" }}
        >
          {signingOut ? "..." : "Sair"}
        </button>
      </div>

      {offline && (
        <div
          data-testid="banner-offline"
          style={{ background: "#78350f", color: "#fde68a", padding: "10px 16px", fontSize: "13px", fontWeight: 600, textAlign: "center" }}
        >
          📴 Modo offline — sem internet. A lista pode estar desatualizada, mas a Rota do dia funciona normalmente.
        </div>
      )}

      {/* ── Rota do dia ─────────────────────────────────────────── */}
      <div style={{ padding: "16px 12px 0" }}>
        {motoristaId && empresaId ? (
          <a
            href={`/mobile/rota?motorista_id=${motoristaId}&empresa_id=${empresaId}`}
            data-testid="btn-rota-do-dia"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "14px",
              background: "linear-gradient(135deg, #16a34a 0%, #15803d 100%)",
              borderRadius: "14px",
              padding: "16px 18px",
              textDecoration: "none",
              boxShadow: "0 4px 14px rgba(22,163,74,0.35)",
            }}
          >
            <div style={{ fontSize: "36px", lineHeight: 1 }}>🚛</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "17px", fontWeight: 800, color: "#fff", letterSpacing: "-0.3px" }}>
                Rota do dia
              </div>
              <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.75)", marginTop: "2px" }}>
                Ver rota ativa ou criar nova
              </div>
            </div>
            <div style={{ fontSize: "22px", color: "rgba(255,255,255,0.7)" }}>›</div>
          </a>
        ) : (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "14px",
              background: "#f1f5f9",
              borderRadius: "14px",
              padding: "16px 18px",
              opacity: 0.6,
            }}
          >
            <div style={{ fontSize: "36px", lineHeight: 1 }}>🚛</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "17px", fontWeight: 800, color: "#334155" }}>Rota do dia</div>
              <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "2px" }}>
                Conta sem vínculo de motorista — solicite ao gestor
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Botao discreto: registrar abastecimento (acao do motorista) */}
      <div style={{ padding: "10px 12px 0" }}>
        <Link
          href="/motorista/abastecimentos/novo"
          data-testid="btn-abastecimento"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            background: "#fff",
            border: "1px solid #fde68a",
            color: "#92400e",
            borderRadius: "10px",
            padding: "11px",
            fontSize: "14px",
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          ⛽ Registrar abastecimento
        </Link>
      </div>

      {semVinculo && (
        <div style={{ margin: "16px 12px 0", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: "10px", padding: "16px", color: "#92400e", fontSize: "13px", lineHeight: 1.6 }}>
          <strong>Conta não vinculada</strong><br />
          Seu usuário ainda não foi associado a um motorista cadastrado no sistema.<br />
          Solicite ao gestor que faça o vínculo.
        </div>
      )}

      {/* ── Lista de rotas (concluidas ou nao) ───────────────────── */}
      <div style={{ padding: "20px 12px 0" }}>
        <div style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "10px", paddingLeft: "2px" }}>
          Minhas rotas
        </div>

        {rotas.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 16px", color: "#94a3b8" }}>
            <div style={{ fontSize: "40px", marginBottom: "10px" }}>🗺️</div>
            <div style={{ fontWeight: 600, fontSize: "15px" }}>Nenhuma rota ainda</div>
            <div style={{ fontSize: "13px", marginTop: "4px" }}>Toque em “Rota do dia” pra criar a primeira.</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {rotas.map((r) => {
              const st = ROTA_STATUS[r.status] ?? ROTA_STATUS.rascunho;
              const distTempo = fmtDistTempo(r.distancia_total_km, r.tempo_total_min);
              const conteudo = (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontSize: "15px", fontWeight: 700, color: "#0f172a" }}>
                      {fmtDate(r.data)}
                    </div>
                    <span style={{ background: st.bg, color: st.color, border: `1px solid ${st.border}`, borderRadius: "6px", padding: "3px 9px", fontSize: "11px", fontWeight: 700 }}>
                      {st.label}
                    </span>
                  </div>
                  <div style={{ fontSize: "12px", color: "#64748b", marginTop: "5px" }}>
                    {r.qtd_paradas != null ? `${r.qtd_paradas} ${r.qtd_paradas === 1 ? "parada" : "paradas"}` : ""}
                    {r.qtd_paradas != null && distTempo ? " · " : ""}
                    {distTempo}
                  </div>
                </>
              );
              const cardStyle: React.CSSProperties = {
                display: "block",
                background: "#fff",
                borderRadius: "12px",
                border: "1px solid #e2e8f0",
                padding: "13px 14px",
                textDecoration: "none",
                boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
              };
              return motoristaId && empresaId ? (
                <a
                  key={r.id}
                  data-testid={`rota-item-${r.id}`}
                  href={`/mobile/rota?motorista_id=${motoristaId}&empresa_id=${empresaId}&abrir=${r.id}`}
                  style={cardStyle}
                >
                  {conteudo}
                </a>
              ) : (
                <div key={r.id} data-testid={`rota-item-${r.id}`} style={cardStyle}>
                  {conteudo}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
