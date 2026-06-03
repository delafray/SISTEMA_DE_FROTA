"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { obterSessaoComFallback } from "@/lib/offline/authOffline";
import { limparSessaoLocal } from "@/lib/offline/sessao";
import { listarRotasCacheadas } from "@/lib/offline/rotaCache";
import type { RotaCacheada } from "@/lib/offline/types";
import { cores, statusRota } from "@/lib/mobile/ui";

/** Item da lista de rotas na tela inicial do motorista. */
type RotaItem = {
  id: string;
  data: string | null;
  status: string;
  distancia_total_km: number | null;
  tempo_total_min: number | null;
  qtd_paradas?: number;
};

/** Converte uma rota cacheada (offline) no item de lista da tela. */
function cacheParaItem(c: RotaCacheada): RotaItem {
  return {
    id: c.rota.id,
    data: c.rota.data,
    status: c.rota.status,
    distancia_total_km: c.rota.distancia_total_km,
    tempo_total_min: c.rota.tempo_total_min,
    qtd_paradas: c.paradas.length,
  };
}

const ROTA_LABEL: Record<string, string> = {
  concluida: "Concluída",
  em_andamento: "Em andamento",
  otimizada: "Em aberto",
  rascunho: "Rascunho",
  cancelada: "Cancelada",
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
          setRotas(cache.map(cacheParaItem));
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
          setRotas(cache.map(cacheParaItem));
        }
      }
      setLoading(false);
    };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSignOut = async () => {
    setSigningOut(true);
    // Corta o acesso offline (apaga a sessao local), MAS preserva o cache de rotas:
    // se o motorista tocar "Sair" sem querer, nao perde as rotas ja baixadas — elas
    // voltam a ficar acessiveis offline assim que ele logar de novo (mesmo aparelho).
    await limparSessaoLocal();
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  const semVinculo = !loading && motoristaId === null;

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", color: cores.textoFraco, flexDirection: "column", gap: "12px" }}>
      <div style={{ fontSize: "32px" }}>🚚</div>
      <div style={{ fontSize: "14px" }}>Carregando...</div>
    </div>
  );

  return (
    <div style={{ maxWidth: "480px", margin: "0 auto", padding: "0 0 32px 0", fontFamily: "system-ui, sans-serif" }}>

      {/* Header (menu) */}
      <div style={{ background: cores.headerEscuro, padding: "20px 16px 16px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: "11px", color: "rgba(147,197,253,0.7)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            App Motorista
          </div>
          <h1 style={{ fontSize: "20px", fontWeight: 700, color: cores.branco, margin: "2px 0 0", lineHeight: 1.2 }}>
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
              background: `linear-gradient(135deg, ${cores.verde} 0%, ${cores.verdeEscuro} 100%)`,
              borderRadius: "14px",
              padding: "16px 18px",
              textDecoration: "none",
              boxShadow: "0 4px 14px rgba(22,163,74,0.35)",
            }}
          >
            <div style={{ fontSize: "36px", lineHeight: 1 }}>🚛</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "17px", fontWeight: 800, color: cores.branco, letterSpacing: "-0.3px" }}>
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
              background: cores.divisoria,
              borderRadius: "14px",
              padding: "16px 18px",
              opacity: 0.6,
            }}
          >
            <div style={{ fontSize: "36px", lineHeight: 1 }}>🚛</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "17px", fontWeight: 800, color: cores.textoForte }}>Rota do dia</div>
              <div style={{ fontSize: "12px", color: cores.textoSuave, marginTop: "2px" }}>
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
            background: cores.branco,
            border: `1px solid ${cores.bordaAmbar}`,
            color: cores.textoAmbar,
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
        <div style={{ margin: "16px 12px 0", background: cores.fundoAmbar, border: `1px solid ${cores.bordaAmbar}`, borderRadius: "10px", padding: "16px", color: cores.textoAmbar, fontSize: "13px", lineHeight: 1.6 }}>
          <strong>Conta não vinculada</strong><br />
          Seu usuário ainda não foi associado a um motorista cadastrado no sistema.<br />
          Solicite ao gestor que faça o vínculo.
        </div>
      )}

      {/* ── Lista de rotas (concluidas ou nao) ───────────────────── */}
      <div style={{ padding: "20px 12px 0" }}>
        <div style={{ fontSize: "12px", color: cores.textoSuave, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "10px", paddingLeft: "2px" }}>
          Minhas rotas
        </div>

        {rotas.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 16px", color: cores.textoSuave }}>
            <div style={{ fontSize: "40px", marginBottom: "10px" }}>🗺️</div>
            <div style={{ fontWeight: 600, fontSize: "15px" }}>Nenhuma rota ainda</div>
            <div style={{ fontSize: "13px", marginTop: "4px" }}>Toque em “Rota do dia” pra criar a primeira.</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {rotas.map((r) => {
              const st = statusRota[r.status] ?? statusRota.rascunho;
              const label = ROTA_LABEL[r.status] ?? r.status;
              const distTempo = fmtDistTempo(r.distancia_total_km, r.tempo_total_min);
              const conteudo = (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontSize: "15px", fontWeight: 700, color: cores.texto }}>
                      {fmtDate(r.data)}
                    </div>
                    <span style={{ background: st.bg, color: st.texto, border: `1px solid ${st.borda}`, borderRadius: "6px", padding: "3px 9px", fontSize: "11px", fontWeight: 700 }}>
                      {label}
                    </span>
                  </div>
                  <div style={{ fontSize: "12px", color: cores.textoFraco, marginTop: "5px" }}>
                    {r.qtd_paradas != null ? `${r.qtd_paradas} ${r.qtd_paradas === 1 ? "parada" : "paradas"}` : ""}
                    {r.qtd_paradas != null && distTempo ? " · " : ""}
                    {distTempo}
                  </div>
                </>
              );
              const cardStyle: React.CSSProperties = {
                display: "block",
                background: cores.branco,
                borderRadius: "12px",
                border: `1px solid ${cores.borda}`,
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
