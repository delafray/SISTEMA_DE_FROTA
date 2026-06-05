"use client";

/**
 * SIMULAÇÃO — Matriz de Permissões (protótipo visual, dados FICTÍCIOS).
 * Não toca no banco. Rode `npm run dev` e abra http://localhost:3000/simulacao-regras
 */

import { useMemo, useState } from "react";

// ─── Níveis (ciclo da célula) ────────────────────────────────────────
const NIVEIS = ["", "consultar", "modificar", "criar"] as const;
type Nivel = (typeof NIVEIS)[number];

const META: Record<string, { label: string; short: string; bg: string; color: string; border: string }> = {
  "":        { label: "—",         short: "",  bg: "transparent", color: "#cbd5e1", border: "#e2e8f0" },
  consultar: { label: "Consultar", short: "C", bg: "#dbeafe",     color: "#1d4ed8", border: "#93c5fd" },
  modificar: { label: "Modificar", short: "M", bg: "#fef3c7",     color: "#b45309", border: "#fcd34d" },
  criar:     { label: "Criar",     short: "+", bg: "#dcfce7",     color: "#15803d", border: "#86efac" },
};

// ─── Regras fictícias (nome, teto e descrição que aparece no hover) ──
const REGRAS: { nome: string; teto: Nivel; desc: string }[] = [
  { nome: "Consultar KM",            teto: "consultar", desc: "Responde a quilometragem atual de um caminhão. Apenas leitura." },
  { nome: "Consultar Veículos",      teto: "consultar", desc: "Lista placa, apelido, marca e modelo dos veículos da frota." },
  { nome: "Consultar Motoristas",    teto: "consultar", desc: "Lista os motoristas ativos e seus dados básicos." },
  { nome: "Consultar Frete",         teto: "consultar", desc: "Informa status, valor e destino de um frete." },
  { nome: "Consultar Financeiro",    teto: "consultar", desc: "Saldo, contas a pagar/receber. Dado sensível — cuidado." },
  { nome: "Consultar Cliente",       teto: "consultar", desc: "Dados de um cliente (endereço, contato, pendências)." },
  { nome: "Atualizar KM",            teto: "modificar", desc: "C = só vê o KM. M = propõe e atualiza o hodômetro (com confirmação)." },
  { nome: "Aprovar Despesa",         teto: "modificar", desc: "C = vê despesas pendentes. M = aprova/reprova uma despesa." },
  { nome: "Registrar Despesa",       teto: "criar",     desc: "C = consulta. M = edita uma despesa. + = cria uma despesa nova." },
  { nome: "Registrar Abastecimento", teto: "criar",     desc: "C = consulta. M = corrige. + = lança um abastecimento novo." },
  { nome: "Registrar Avaria",        teto: "criar",     desc: "C = consulta. M = atualiza. + = abre uma avaria nova." },
  { nome: "Criar Pedido",            teto: "criar",     desc: "C = consulta pedidos. M = edita. + = cria um pedido/viagem." },
];

// ─── Usuários cadastrados fictícios (alimenta o seletor) ─────────────
type Usuario = { nome: string; papel: string };
const USUARIOS_INIT: Usuario[] = [
  { nome: "RONALDO BORBA",   papel: "Master" },
  { nome: "CARLOS DIRETOR",  papel: "Diretor" },
  { nome: "ANA GERENTE",     papel: "Gerente" },
  { nome: "PAULO ADMIN",     papel: "Admin" },
  { nome: "MARIA FINANC.",   papel: "Financeiro" },
  { nome: "JOÃO MOTORISTA",  papel: "Motorista" },
  { nome: "PEDRO MOTORISTA", papel: "Motorista" },
];

type Linha = {
  id: number;
  telefone: string;
  usuario: string | null;
  papel: string;
  ativo: boolean;
  anotar: boolean;
  perms: Nivel[];
  padrao?: boolean;
};

function nivelInicial(r: number, c: number, teto: Nivel): Nivel {
  const tetoIdx = NIVEIS.indexOf(teto);
  const v = (r * 7 + c * 3) % 5;
  if (v === 0) return "";
  return NIVEIS[Math.min(v, tetoIdx)];
}

const LINHAS_INIT: Linha[] = [
  { telefone: "(31) 99841-1123", usuario: "RONALDO BORBA",  papel: "Master" },
  { telefone: "(31) 98888-0001", usuario: "RONALDO BORBA",  papel: "Master" },
  { telefone: "(31) 97777-0002", usuario: "RONALDO BORBA",  papel: "Master" },
  { telefone: "(31) 96666-1010", usuario: "CARLOS DIRETOR", papel: "Diretor" },
  { telefone: "(31) 96666-2020", usuario: "CARLOS DIRETOR", papel: "Diretor" },
  { telefone: "(31) 95555-3030", usuario: "ANA GERENTE",    papel: "Gerente" },
  { telefone: "(31) 94444-4040", usuario: "PAULO ADMIN",    papel: "Admin" },
  { telefone: "(31) 93333-5050", usuario: "MARIA FINANC.",  papel: "Financeiro" },
  { telefone: "(31) 92222-6060", usuario: "JOÃO MOTORISTA", papel: "Motorista" },
  { telefone: "(31) 91111-8080", usuario: null,             papel: "—" },
  { telefone: "(11) 98000-1234", usuario: null,             papel: "—" },
  { telefone: "NÃO CADASTRADO",  usuario: null,             papel: "Padrão", padrao: true },
].map((b, r) => ({
  ...b,
  id: r,
  ativo: !b.padrao,
  anotar: true,
  perms: REGRAS.map((rg, c) => (b.padrao ? "" : nivelInicial(r, c, rg.teto))),
}));

// dimensões compactas
const COL_TEL = 132, COL_USR = 138, COL = 30, ROW_H = 26, HEAD_H = 138;
const headBg = "#1e293b";

export default function SimulacaoRegrasPage() {
  const [linhas, setLinhas]   = useState<Linha[]>(LINHAS_INIT);
  const [usuarios, setUsuarios] = useState<Usuario[]>(USUARIOS_INIT);
  const [nextId, setNextId]   = useState(LINHAS_INIT.length);
  const [tip, setTip] = useState<{ x: number; y: number; i: number } | null>(null);
  const [telModal, setTelModal] = useState<{ mode: "edit" | "novo"; id?: number; valor: string } | null>(null);
  const [usrModal, setUsrModal] = useState<{ id: number } | null>(null);
  const [novoUsr, setNovoUsr] = useState({ nome: "", papel: "Gerente" });

  const ciclar = (id: number, c: number) =>
    setLinhas((p) => p.map((l) => {
      if (l.id !== id || !l.ativo) return l;
      const teto = NIVEIS.indexOf(REGRAS[c].teto);
      const prox = NIVEIS.indexOf(l.perms[c]) + 1 > teto ? 0 : NIVEIS.indexOf(l.perms[c]) + 1;
      const perms = l.perms.slice(); perms[c] = NIVEIS[prox];
      return { ...l, perms };
    }));

  const toggle = (id: number, campo: "ativo" | "anotar") =>
    setLinhas((p) => p.map((l) => (l.id === id ? { ...l, [campo]: !l[campo] } : l)));

  const salvarTel = () => {
    if (!telModal) return;
    const valor = telModal.valor.trim();
    if (!valor) return;
    if (telModal.mode === "novo") {
      setLinhas((p) => [...p, { id: nextId, telefone: valor, usuario: null, papel: "—", ativo: true, anotar: true, perms: REGRAS.map(() => "") }]);
      setNextId((n) => n + 1);
    } else {
      setLinhas((p) => p.map((l) => (l.id === telModal.id ? { ...l, telefone: valor } : l)));
    }
    setTelModal(null);
  };

  const escolherUsr = (u: Usuario | null) => {
    if (!usrModal) return;
    setLinhas((p) => p.map((l) => (l.id === usrModal.id ? { ...l, usuario: u?.nome ?? null, papel: u?.papel ?? "—" } : l)));
    setUsrModal(null);
  };

  const criarUsr = () => {
    const nome = novoUsr.nome.trim().toUpperCase();
    if (!nome) return;
    const u = { nome, papel: novoUsr.papel };
    setUsuarios((p) => [...p, u]);
    escolherUsr(u);
    setNovoUsr({ nome: "", papel: "Gerente" });
  };

  const contagem = useMemo(() => {
    const ativos = linhas.filter((l) => l.ativo);
    return {
      ativo: ativos.length,
      anotar: ativos.filter((l) => l.anotar).length,
      regras: REGRAS.map((_, c) => ativos.filter((l) => l.perms[c] !== "").length),
    };
  }, [linhas]);

  const cell: React.CSSProperties = { borderBottom: "1px solid #eef2f7", borderRight: "1px solid #f1f5f9", padding: 0, textAlign: "center", height: ROW_H };

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "#f8fafc", fontFamily: "system-ui, sans-serif", color: "#1e293b", fontSize: 11 }}>
      {/* Topo */}
      <div style={{ padding: "8px 14px", borderBottom: "1px solid #e2e8f0", background: "#fff" }}>
        <div style={{ fontSize: 15, fontWeight: 800 }}>🧪 SIMULAÇÃO · Matriz de Permissões <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 500 }}>(fictício — nada é salvo)</span></div>
        <div style={{ display: "flex", gap: 12, marginTop: 6, flexWrap: "wrap", alignItems: "center" }}>
          {(["consultar", "modificar", "criar"] as Nivel[]).map((n) => (
            <span key={n} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 16, height: 16, borderRadius: 4, background: META[n].bg, border: `1px solid ${META[n].border}`, color: META[n].color, fontWeight: 800, fontSize: 10, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{META[n].short}</span>
              {META[n].label}
            </span>
          ))}
          <span style={{ color: "#94a3b8" }}>• clique na célula p/ ciclar • clique no <b>telefone</b> p/ editar • clique no <b>usuário</b> p/ trocar • passe o mouse na regra p/ detalhe</span>
        </div>
      </div>

      {/* Matriz */}
      <div style={{ flex: 1, overflow: "auto" }}>
        <table style={{ borderCollapse: "separate", borderSpacing: 0, width: "max-content" }}>
          <thead>
            <tr>
              <th style={{ position: "sticky", left: 0, top: 0, zIndex: 6, width: COL_TEL, minWidth: COL_TEL, background: headBg, color: "#fff", textAlign: "left", padding: "6px 8px", borderRight: "1px solid #334155" }}>Telefone</th>
              <th style={{ position: "sticky", left: COL_TEL, top: 0, zIndex: 6, width: COL_USR, minWidth: COL_USR, background: headBg, color: "#fff", textAlign: "left", padding: "6px 8px", borderRight: "2px solid #475569" }}>Usuário</th>
              {[{ n: "Ativo", bg: headBg }, { n: "Anotar", bg: "#0f766e" }].map((h, i) => (
                <th key={i} style={{ position: "sticky", top: 0, zIndex: 4, background: h.bg, color: "#fff", width: COL, minWidth: COL, height: HEAD_H, padding: 0, borderRight: i === 1 ? "2px solid #475569" : "1px solid #334155" }}>
                  <div style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", whiteSpace: "nowrap", margin: "0 auto", fontSize: 11, fontWeight: 700, padding: "6px 0" }}>{h.n}</div>
                </th>
              ))}
              {REGRAS.map((rg, c) => (
                <th
                  key={c}
                  onMouseEnter={(e) => setTip({ x: e.clientX, y: e.clientY, i: c })}
                  onMouseMove={(e) => setTip({ x: e.clientX, y: e.clientY, i: c })}
                  onMouseLeave={() => setTip(null)}
                  style={{ position: "sticky", top: 0, zIndex: 4, background: headBg, color: "#e2e8f0", width: COL, minWidth: COL, height: HEAD_H, padding: 0, borderRight: "1px solid #334155", cursor: "help" }}
                >
                  <div style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", whiteSpace: "nowrap", margin: "0 auto", fontSize: 11, fontWeight: 600, padding: "6px 0" }}>{rg.nome}</div>
                </th>
              ))}
            </tr>
            {/* RESUMO */}
            <tr>
              <th style={{ position: "sticky", left: 0, top: HEAD_H, zIndex: 6, background: "#334155", color: "#cbd5e1", textAlign: "right", padding: "2px 8px", fontSize: 10, borderRight: "1px solid #475569" }}>RESUMO →</th>
              <th style={{ position: "sticky", left: COL_TEL, top: HEAD_H, zIndex: 6, background: "#334155", color: "#cbd5e1", padding: "2px 8px", fontSize: 10, borderRight: "2px solid #475569", textAlign: "left" }}>{linhas.length} tel.</th>
              <th style={{ position: "sticky", top: HEAD_H, zIndex: 4, background: "#334155", color: "#7dd3fc", fontSize: 11, fontWeight: 800 }}>{contagem.ativo}</th>
              <th style={{ position: "sticky", top: HEAD_H, zIndex: 4, background: "#334155", color: "#5eead4", fontSize: 11, fontWeight: 800, borderRight: "2px solid #475569" }}>{contagem.anotar}</th>
              {contagem.regras.map((n, c) => (
                <th key={c} style={{ position: "sticky", top: HEAD_H, zIndex: 4, background: "#334155", color: "#cbd5e1", fontSize: 10, fontWeight: 700, borderRight: "1px solid #475569" }}>{n}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map((l, i) => {
              const off = !l.ativo;
              const rowBg = l.padrao ? "#fff7ed" : off ? "#eef1f5" : (i % 2 === 1 ? "#eef3f9" : "#ffffff");
              const sticky: React.CSSProperties = { position: "sticky", zIndex: 3, background: rowBg };
              return (
                <tr key={l.id}>
                  <td
                    onClick={() => !l.padrao && setTelModal({ mode: "edit", id: l.id, valor: l.telefone })}
                    style={{ ...cell, ...sticky, left: 0, textAlign: "left", padding: "2px 8px", fontWeight: 600, borderRight: "1px solid #e2e8f0", cursor: l.padrao ? "default" : "pointer", opacity: off ? 0.6 : 1 }}
                    title={l.padrao ? "" : "Clique para editar o telefone"}
                  >
                    {l.telefone}
                  </td>
                  <td
                    onClick={() => !l.padrao && setUsrModal({ id: l.id })}
                    style={{ ...cell, ...sticky, left: COL_TEL, textAlign: "left", padding: "2px 8px", borderRight: "2px solid #cbd5e1", cursor: l.padrao ? "default" : "pointer", opacity: off ? 0.6 : 1 }}
                    title={l.padrao ? "" : "Clique para selecionar/trocar o usuário"}
                  >
                    <div style={{ color: l.usuario ? "#1e293b" : "#cbd5e1" }}>{l.usuario ?? "— vincular —"}</div>
                    <div style={{ fontSize: 9, color: "#94a3b8" }}>{l.papel}</div>
                  </td>
                  <td style={{ ...cell, background: rowBg }}>
                    <button onClick={() => toggle(l.id, "ativo")} title="Pode usar o sistema?" style={flag(l.ativo, "#16a34a")}>{l.ativo ? "✓" : ""}</button>
                  </td>
                  <td style={{ ...cell, background: rowBg, borderRight: "2px solid #cbd5e1" }}>
                    <button onClick={() => !off && toggle(l.id, "anotar")} disabled={off} title="Pode anotar?" style={flag(l.anotar && !off, "#0d9488", off)}>{l.anotar && !off ? "✓" : ""}</button>
                  </td>
                  {l.perms.map((nv, c) => {
                    const m = META[nv];
                    return (
                      <td key={c} style={{ ...cell, background: rowBg }}>
                        <button onClick={() => ciclar(l.id, c)} disabled={off} title={off ? "Telefone inativo" : `${REGRAS[c].nome}: ${m.label}`}
                          style={{ width: "100%", height: ROW_H, border: "none", cursor: off ? "not-allowed" : "pointer", background: off ? "transparent" : m.bg, color: m.color, fontWeight: 800, fontSize: 12 }}>
                          {off ? "" : m.short}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {/* Linha de INSERT (última, vazia) */}
            <tr>
              <td
                onClick={() => setTelModal({ mode: "novo", valor: "" })}
                style={{ ...cell, position: "sticky", left: 0, zIndex: 3, background: "#f0fdf4", textAlign: "left", padding: "2px 8px", color: "#16a34a", fontWeight: 700, cursor: "pointer", borderRight: "1px solid #e2e8f0" }}
                title="Clique para inserir um novo telefone"
              >
                + telefone
              </td>
              <td style={{ ...cell, position: "sticky", left: COL_TEL, zIndex: 3, background: "#f0fdf4", color: "#94a3b8", padding: "2px 8px", borderRight: "2px solid #cbd5e1" }}>—</td>
              <td style={{ ...cell, background: "#f0fdf4" }} />
              <td style={{ ...cell, background: "#f0fdf4", borderRight: "2px solid #cbd5e1" }} />
              {REGRAS.map((_, c) => <td key={c} style={{ ...cell, background: "#f0fdf4" }} />)}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Tooltip detalhado da regra */}
      {tip && (
        <div style={{ position: "fixed", left: Math.min(tip.x + 14, (typeof window !== "undefined" ? window.innerWidth : 1200) - 280), top: tip.y + 14, width: 260, background: "#0f172a", color: "#e2e8f0", borderRadius: 8, padding: "10px 12px", zIndex: 50, boxShadow: "0 10px 30px rgba(0,0,0,0.35)", pointerEvents: "none" }}>
          <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 4 }}>{REGRAS[tip.i].nome}</div>
          <div style={{ fontSize: 12, lineHeight: 1.5, color: "#cbd5e1" }}>{REGRAS[tip.i].desc}</div>
          <div style={{ marginTop: 6, fontSize: 11, color: "#7dd3fc" }}>Teto: <b>{META[REGRAS[tip.i].teto].label}</b> (a célula não passa disso)</div>
        </div>
      )}

      {/* Modal: editar/inserir telefone */}
      {telModal && (
        <Modal onClose={() => setTelModal(null)} title={telModal.mode === "novo" ? "Novo telefone" : "Editar telefone"}>
          <label style={lbl}>Número</label>
          <input autoFocus value={telModal.valor} onChange={(e) => setTelModal({ ...telModal, valor: e.target.value })} placeholder="(31) 90000-0000" style={inp} onKeyDown={(e) => e.key === "Enter" && salvarTel()} />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
            <button style={btnGhost} onClick={() => setTelModal(null)}>Cancelar</button>
            <button style={btnPri} onClick={salvarTel}>{telModal.mode === "novo" ? "Inserir" : "Salvar"}</button>
          </div>
        </Modal>
      )}

      {/* Modal: selecionar usuário */}
      {usrModal && (
        <Modal onClose={() => setUsrModal(null)} title="Selecionar usuário">
          <div style={{ maxHeight: 240, overflow: "auto", border: "1px solid #e2e8f0", borderRadius: 8 }}>
            <button style={{ ...usrItem, color: "#64748b" }} onClick={() => escolherUsr(null)}>— sem usuário (número solto) —</button>
            {usuarios.map((u, i) => (
              <button key={i} style={usrItem} onClick={() => escolherUsr(u)}>
                <span style={{ fontWeight: 600 }}>{u.nome}</span>
                <span style={{ fontSize: 11, color: "#94a3b8" }}>{u.papel}</span>
              </button>
            ))}
          </div>
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #e2e8f0" }}>
            <label style={lbl}>Criar novo usuário</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={novoUsr.nome} onChange={(e) => setNovoUsr({ ...novoUsr, nome: e.target.value })} placeholder="Nome" style={{ ...inp, flex: 1 }} />
              <select value={novoUsr.papel} onChange={(e) => setNovoUsr({ ...novoUsr, papel: e.target.value })} style={{ ...inp, width: 130 }}>
                {["Master", "Diretor", "Gerente", "Admin", "Financeiro", "Motorista"].map((p) => <option key={p}>{p}</option>)}
              </select>
              <button style={btnPri} onClick={criarUsr}>+ Criar</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── helpers visuais ─────────────────────────────────────────────────
function flag(on: boolean, cor: string, off = false): React.CSSProperties {
  return { width: 22, height: 22, borderRadius: 5, border: `2px solid ${on ? cor : "#cbd5e1"}`, background: on ? cor : "#fff", color: "#fff", fontWeight: 900, fontSize: 12, cursor: off ? "not-allowed" : "pointer", opacity: off ? 0.4 : 1 };
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 420, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontWeight: 700, fontSize: 14 }}>{title}</span>
          <button onClick={onClose} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 18, color: "#94a3b8" }}>✕</button>
        </div>
        <div style={{ padding: 16 }}>{children}</div>
      </div>
    </div>
  );
}

const lbl: React.CSSProperties = { display: "block", fontSize: 11, fontWeight: 600, color: "#475569", marginBottom: 4 };
const inp: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "1px solid #cbd5e1", borderRadius: 8, fontSize: 13, boxSizing: "border-box" };
const btnPri: React.CSSProperties = { padding: "8px 14px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 };
const btnGhost: React.CSSProperties = { padding: "8px 14px", background: "#fff", color: "#475569", border: "1px solid #cbd5e1", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 13 };
const usrItem: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", padding: "9px 12px", border: "none", borderBottom: "1px solid #f1f5f9", background: "#fff", cursor: "pointer", textAlign: "left", fontSize: 13 };
