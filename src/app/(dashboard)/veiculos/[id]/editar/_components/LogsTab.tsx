"use client";
import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { DataTable, Th, Td, Tr, Badge, EmptyState, Btn, FormField, selectStyle, Alert } from "@/components/ui/ds";
import { MobileCard, MobileList } from "@/components/mobile";

type KmLog = {
  id: string; created_at: string | null; km_lido: number;
  tipo: string; correcao: boolean | null; correcao_motivo: string | null;
  motorista_id: string; veiculo_id: string; foto_urls: string[] | null;
  motoristas: { nome: string } | { nome: string }[] | null;
};

type AuditLog = {
  id: string; created_at: string | null; acao: string; descricao: string | null;
  dados_antes: Record<string, unknown> | null;
  dados_depois: Record<string, unknown> | null;
  usuario_id: string | null;
};

type VeiculoOpcao = { id: string; placa: string; apelido: string | null };

type LinhaUnificada = {
  id: string; created_at: string | null; fonte: "motorista" | "gestor" | "outro";
  km: number | null; quem: string; descricao: string;
  correcao: boolean; reatribuirHandler?: () => void;
};

const fmtDateTime = (s: string | null) => s ? new Date(s).toLocaleString("pt-BR") : "—";

export default function LogsTab({ veiculoId, empresaId }: { veiculoId: string; empresaId: string }) {
  const supabase = createClient();
  const [kmLogs, setKmLogs] = useState<KmLog[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [usuariosNome, setUsuariosNome] = useState<Map<string, string>>(new Map());
  const [veiculosEmpresa, setVeiculosEmpresa] = useState<VeiculoOpcao[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");

  // Reatribuir
  const [reatribuirLog, setReatribuirLog] = useState<KmLog | null>(null);
  const [destinoId, setDestinoId] = useState("");
  const [motivoReatr, setMotivoReatr] = useState("");
  const [salvandoReatr, setSalvandoReatr] = useState(false);

  const carregar = async () => {
    const [km, aud, veic] = await Promise.all([
      supabase.from("km_logs")
        .select("id,created_at,km_lido,tipo,correcao,correcao_motivo,motorista_id,veiculo_id,foto_urls,motoristas(nome)")
        .eq("veiculo_id", veiculoId)
        .order("created_at", { ascending: false }),
      supabase.from("audit_logs")
        .select("id,created_at,acao,descricao,dados_antes,dados_depois,usuario_id")
        .eq("entidade", "veiculos")
        .eq("entidade_id", veiculoId)
        .like("acao", "km%")
        .order("created_at", { ascending: false }),
      supabase.from("veiculos")
        .select("id,placa,apelido")
        .eq("empresa_id", empresaId)
        .eq("ativo", true)
        .neq("id", veiculoId)
        .order("placa"),
    ]);
    setKmLogs((km.data ?? []) as KmLog[]);
    setAuditLogs((aud.data ?? []) as AuditLog[]);
    setVeiculosEmpresa(veic.data ?? []);

    // Buscar nomes dos usuários (gestores) que aparecem em audit_logs
    const userIds = Array.from(new Set((aud.data ?? []).map(a => a.usuario_id).filter((x): x is string => !!x)));
    if (userIds.length > 0) {
      const { data: perfis } = await supabase.from("perfis").select("id,nome").in("id", userIds);
      const m = new Map<string, string>();
      for (const p of perfis ?? []) m.set(p.id, p.nome);
      setUsuariosNome(m);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar().then(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [veiculoId, empresaId]);

  const abrirReatribuir = (log: KmLog) => {
    setReatribuirLog(log);
    setDestinoId("");
    setMotivoReatr("");
    setErro("");
  };

  const confirmarReatribuir = async () => {
    if (!reatribuirLog) return;
    if (!destinoId) { setErro("Selecione o veículo de destino"); return; }
    if (!motivoReatr.trim()) { setErro("Informe o motivo da reatribuição"); return; }
    setSalvandoReatr(true);
    setErro("");

    // Atualiza km_log com novo veículo + flag de correção
    const { error } = await supabase.from("km_logs").update({
      veiculo_id: destinoId,
      correcao: true,
      correcao_motivo: `Reatribuído de outro veículo: ${motivoReatr.trim()}`,
    }).eq("id", reatribuirLog.id);

    if (error) { setSalvandoReatr(false); setErro(error.message); return; }

    // Registra audit_logs nas DUAS pontas (origem e destino)
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from("audit_logs").insert([
        {
          entidade: "veiculos", entidade_id: veiculoId,
          acao: "km_log_reatribuido_saiu",
          descricao: `KM log ${reatribuirLog.km_lido} km reatribuído PARA outro veículo. Motivo: ${motivoReatr.trim()}`,
          dados_antes: { km_lido: reatribuirLog.km_lido, log_id: reatribuirLog.id },
          dados_depois: { veiculo_destino: destinoId },
          usuario_id: user.id, empresa_id: empresaId,
        },
        {
          entidade: "veiculos", entidade_id: destinoId,
          acao: "km_log_reatribuido_entrou",
          descricao: `KM log ${reatribuirLog.km_lido} km recebido de outro veículo. Motivo: ${motivoReatr.trim()}`,
          dados_antes: { veiculo_origem: veiculoId },
          dados_depois: { km_lido: reatribuirLog.km_lido, log_id: reatribuirLog.id },
          usuario_id: user.id, empresa_id: empresaId,
        },
      ]);
    }

    setSalvandoReatr(false);
    setReatribuirLog(null);
    await carregar();
    alert("Log reatribuído. Verifique manualmente o KM atual dos dois veículos — pode precisar atualizar via 'Atualizar KM' se o trigger do banco não tiver recalculado automaticamente.");
  };

  // Linhas unificadas (km_logs + audit_logs) ordenadas por data
  const linhas = useMemo<LinhaUnificada[]>(() => {
    const km: LinhaUnificada[] = kmLogs.map(log => {
      const m = Array.isArray(log.motoristas) ? log.motoristas[0] : log.motoristas;
      return {
        id: `km:${log.id}`,
        created_at: log.created_at,
        fonte: "motorista",
        km: log.km_lido,
        quem: m?.nome ?? "Motorista desconhecido",
        descricao: log.correcao
          ? `Correção: ${log.correcao_motivo ?? ""}`
          : `Registrado via ${log.tipo}`,
        correcao: !!log.correcao,
        reatribuirHandler: () => abrirReatribuir(log),
      };
    });
    const aud: LinhaUnificada[] = auditLogs.map(a => {
      const antes = (a.dados_antes as { km_atual?: number } | null)?.km_atual;
      const depois = (a.dados_depois as { km_atual?: number } | null)?.km_atual;
      return {
        id: `aud:${a.id}`,
        created_at: a.created_at,
        fonte: "gestor",
        km: typeof depois === "number" ? depois : null,
        quem: a.usuario_id ? (usuariosNome.get(a.usuario_id) ?? "Gestor") : "Sistema",
        descricao: `${a.descricao ?? a.acao}${antes != null && depois != null ? ` (${antes.toLocaleString("pt-BR")} → ${depois.toLocaleString("pt-BR")})` : ""}`,
        correcao: false,
      };
    });
    return [...km, ...aud].sort((a, b) => {
      const da = a.created_at ? new Date(a.created_at).getTime() : 0;
      const db = b.created_at ? new Date(b.created_at).getTime() : 0;
      return db - da;
    });
  }, [kmLogs, auditLogs, usuariosNome]);

  if (loading) return <p style={{ color: "#94a3b8", padding: "16px" }}>Carregando logs...</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {erro && <Alert variant="error">⚠ {erro}</Alert>}

      <div style={{ fontSize: "12px", color: "#64748b" }}>
        Total: <strong style={{ color: "#1e293b" }}>{linhas.length}</strong> registro{linhas.length !== 1 ? "s" : ""} ·
        <span style={{ marginLeft: "6px" }}>
          {kmLogs.length} do motorista · {auditLogs.length} do gestor
        </span>
      </div>

      {linhas.length === 0
        ? <EmptyState icon="📜" message="Nenhum log de KM para este veículo ainda." />
        : (
          <>
            {/* Desktop */}
            <div className="m-hide">
              <DataTable count={linhas.length} label="logs">
                <thead>
                  <tr>
                    <Th>Data/Hora</Th>
                    <Th>Fonte</Th>
                    <Th>Quem</Th>
                    <Th style={{ textAlign: "right" }}>KM</Th>
                    <Th>Descrição</Th>
                    <Th style={{ width: "120px" }}>Ação</Th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map(l => (
                    <Tr key={l.id} muted={l.correcao}>
                      <Td style={{ whiteSpace: "nowrap" }}>{fmtDateTime(l.created_at)}</Td>
                      <Td>
                        <Badge variant={l.fonte === "motorista" ? "info" : l.fonte === "gestor" ? "purple" : "default"}>
                          {l.fonte === "motorista" ? "🚛 Motorista" : l.fonte === "gestor" ? "👤 Gestor" : "Sistema"}
                        </Badge>
                      </Td>
                      <Td style={{ fontWeight: 500 }}>{l.quem}</Td>
                      <Td style={{ textAlign: "right", fontWeight: 600 }}>
                        {l.km != null ? `${l.km.toLocaleString("pt-BR")} km` : "—"}
                      </Td>
                      <Td style={{ maxWidth: "320px", fontSize: "11px", color: "#475569" }}>
                        <div style={{ whiteSpace: "normal", lineHeight: 1.4 }}>{l.descricao}</div>
                        {l.correcao && <Badge variant="warning">corrigido</Badge>}
                      </Td>
                      <Td>
                        {l.reatribuirHandler && !l.correcao && (
                          <Btn size="xs" variant="outline" type="button" onClick={l.reatribuirHandler}>
                            Reatribuir
                          </Btn>
                        )}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </DataTable>
            </div>
            {/* Mobile */}
            <MobileList count={linhas.length} label="logs">
              {linhas.map(l => (
                <MobileCard
                  key={l.id}
                  title={l.quem}
                  subtitle={fmtDateTime(l.created_at)}
                  badge={
                    <Badge variant={l.fonte === "motorista" ? "info" : l.fonte === "gestor" ? "purple" : "default"}>
                      {l.fonte === "motorista" ? "Motorista" : l.fonte === "gestor" ? "Gestor" : "Sistema"}
                    </Badge>
                  }
                  highlight={l.correcao ? "#f59e0b" : undefined}
                  details={[
                    { label: "KM", value: l.km != null ? `${l.km.toLocaleString("pt-BR")} km` : "—" },
                    { label: "Descrição", value: l.descricao },
                  ]}
                  actions={l.reatribuirHandler && !l.correcao ? (
                    <Btn size="xs" variant="outline" type="button" onClick={l.reatribuirHandler}>
                      Reatribuir
                    </Btn>
                  ) : undefined}
                />
              ))}
            </MobileList>
          </>
        )}

      {/* Modal Reatribuir */}
      {reatribuirLog && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: "16px",
        }} onClick={() => !salvandoReatr && setReatribuirLog(null)}>
          <div style={{
            background: "#fff", borderRadius: "12px", padding: "20px",
            width: "100%", maxWidth: "520px", boxShadow: "0 10px 40px rgba(0,0,0,0.2)",
          }} onClick={e => e.stopPropagation()}>
            <h2 style={{ fontSize: "16px", fontWeight: 700, color: "#1e293b", margin: 0 }}>
              Reatribuir registro de KM
            </h2>
            <p style={{ fontSize: "12px", color: "#64748b", margin: "4px 0 16px" }}>
              Use quando o motorista logou KM no caminhão errado. O registro será movido para outro veículo.
            </p>

            <div style={{
              background: "#fef9c3", border: "1px solid #fde68a", borderRadius: "8px",
              padding: "10px 12px", marginBottom: "12px", fontSize: "12px", color: "#854d0e",
            }}>
              ⚠ Esta ação altera dados históricos. O KM atual dos dois veículos pode precisar ser recalculado depois.
            </div>

            <div style={{ background: "#f8fafc", borderRadius: "6px", padding: "10px", marginBottom: "12px", fontSize: "12px" }}>
              <div><strong>Data:</strong> {fmtDateTime(reatribuirLog.created_at)}</div>
              <div><strong>KM:</strong> {reatribuirLog.km_lido.toLocaleString("pt-BR")} km</div>
              <div><strong>Motorista:</strong> {(Array.isArray(reatribuirLog.motoristas) ? reatribuirLog.motoristas[0] : reatribuirLog.motoristas)?.nome ?? "—"}</div>
            </div>

            <FormField label="Veículo destino *">
              <select value={destinoId} onChange={e => setDestinoId(e.target.value)} style={selectStyle}>
                <option value="">— Selecione —</option>
                {veiculosEmpresa.map(v => (
                  <option key={v.id} value={v.id}>
                    {v.placa}{v.apelido ? ` (${v.apelido})` : ""}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField label="Motivo *" hint="Será registrado no audit log">
              <textarea value={motivoReatr} onChange={e => setMotivoReatr(e.target.value)} rows={3}
                placeholder="Ex: motorista digitou a placa errada ao iniciar viagem"
                style={{ width: "100%", padding: "8px 12px", fontSize: "14px", border: "1px solid #cbd5e1", borderRadius: "8px", resize: "vertical" }} />
            </FormField>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "16px" }}>
              <Btn type="button" variant="outline" onClick={() => setReatribuirLog(null)} disabled={salvandoReatr}>
                Cancelar
              </Btn>
              <Btn type="button" onClick={confirmarReatribuir} disabled={salvandoReatr}>
                {salvandoReatr ? "Reatribuindo..." : "Confirmar reatribuição"}
              </Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
