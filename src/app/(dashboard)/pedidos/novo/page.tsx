"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  PageHeader, FormField, inputStyle,
  Btn, Alert,
} from "@/components/ui/ds";

type Cliente = { id: string; nome_fantasia: string; apelido: string | null };
type LocalCarreg = { id: string; nome: string; endereco: string; principal: boolean };

/**
 * Item da lista de locais de carregamento DESTE pedido.
 * - localId != null → local CADASTRADO (nome+endereco vêm do cadastro, só leitura).
 * - localId == null → local AVULSO digitado (endereco editável).
 */
type LocalItem = { uid: string; localId: string | null; nome: string; endereco: string };

const hoje = () => new Date().toISOString().slice(0, 10);
const novoUid = () => Math.random().toString(36).slice(2, 9);

export default function NovoPedidoSimplePage() {
  const router = useRouter();
  const supabase = createClient();

  const [empresaId, setEmpresaId] = useState<string | null>(null);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  // Cliente
  const [avulso, setAvulso] = useState(false);
  const [clienteId, setClienteId] = useState("");
  const [nomeAvulso, setNomeAvulso] = useState("");
  const [buscaCliente, setBuscaCliente] = useState("");
  const [mostrarSugestoes, setMostrarSugestoes] = useState(false);
  const buscaRef = useRef<HTMLDivElement>(null);

  // Locais de carregamento
  const [locaisCliente, setLocaisCliente] = useState<LocalCarreg[]>([]); // cadastrados do cliente
  const [locais, setLocais] = useState<LocalItem[]>([]);                  // locais escolhidos p/ ESTE pedido
  // Modal para salvar locais avulsos no cadastro do cliente
  const [modalSalvarLocal, setModalSalvarLocal] = useState(false);
  const [avulsosParaSalvar, setAvulsosParaSalvar] = useState<{ endereco: string; nome: string }[]>([]);
  const [salvandoLocal, setSalvandoLocal] = useState(false);
  const [pedidoCriadoId, setPedidoCriadoId] = useState<string | null>(null);

  // Dados do pedido
  const [valorPedido, setValorPedido] = useState("");
  const [dataPrevista, setDataPrevista] = useState(hoje());
  const [observacoes, setObservacoes] = useState("");

  // Entregas: lista de endereços-texto
  const [enderecos, setEnderecos] = useState<string[]>([""]);

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

      if (ue?.empresa_id) {
        setEmpresaId(ue.empresa_id);
                const { data: cli } = await supabase
          .from("clientes")
          .select("id,nome_fantasia,apelido")
          .eq("empresa_id", ue.empresa_id)
          .eq("ativo", true)
          .order("nome_fantasia");
        setClientes(cli ?? []);
      }
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fecha sugestões ao clicar fora
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (buscaRef.current && !buscaRef.current.contains(e.target as Node)) {
        setMostrarSugestoes(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const clientesFiltrados = buscaCliente.trim()
    ? clientes.filter(c => {
        const q = buscaCliente.toLowerCase();
        return c.nome_fantasia.toLowerCase().includes(q)
          || (c.apelido && c.apelido.toLowerCase().includes(q));
      })
    : clientes.slice(0, 8);

  const clienteSelecionado = clientes.find(c => c.id === clienteId);

  // Carrega locais quando seleciona cliente
  const carregarLocais = async (cId: string) => {
        const { data } = await supabase
      .from("locais_carregamento")
      .select("id,nome,endereco,principal")
      .eq("cliente_id", cId)
      .eq("ativo", true)
      .order("principal", { ascending: false });
    const locs = (data ?? []) as LocalCarreg[];
    setLocaisCliente(locs);
    // Pré-adiciona o local principal (se houver) à lista do pedido
    const princ = locs.find(l => l.principal);
    if (princ) {
      setLocais([{ uid: novoUid(), localId: princ.id, nome: princ.nome, endereco: princ.endereco }]);
    } else {
      setLocais([]);
    }
  };

  const selecionarCliente = (c: Cliente) => {
    setClienteId(c.id);
    setBuscaCliente(c.nome_fantasia);
    setMostrarSugestoes(false);
    carregarLocais(c.id);
  };

  const limparCliente = () => {
    setClienteId("");
    setBuscaCliente("");
    setLocaisCliente([]);
    setLocais([]);
  };

  // ── Gestão dos locais do pedido ──────────────────────────────────────────────
  const localJaAdicionado = (localId: string) => locais.some(l => l.localId === localId);

  const toggleLocalCadastrado = (loc: LocalCarreg) => {
    setLocais(prev =>
      prev.some(l => l.localId === loc.id)
        ? prev.filter(l => l.localId !== loc.id)
        : [...prev, { uid: novoUid(), localId: loc.id, nome: loc.nome, endereco: loc.endereco }]
    );
  };

  const adicionarLocalAvulso = () =>
    setLocais(prev => [...prev, { uid: novoUid(), localId: null, nome: "", endereco: "" }]);

  const setLocalAvulsoTexto = (uid: string, val: string) =>
    setLocais(prev => prev.map(l => (l.uid === uid ? { ...l, endereco: val } : l)));

  const removerLocal = (uid: string) =>
    setLocais(prev => prev.filter(l => l.uid !== uid));

  // Gestão da lista de endereços
  const setEndereco = (idx: number, val: string) => {
    setEnderecos(prev => prev.map((e, i) => (i === idx ? val : e)));
  };

  const adicionarEndereco = () => setEnderecos(prev => [...prev, ""]);

  const removerEndereco = (idx: number) => {
    setEnderecos(prev => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");

    // Validações
    if (!avulso && !clienteId) {
      setErr("Selecione um cliente cadastrado ou marque 'Cliente sem cadastro (avulso)'."); return;
    }
    if (avulso && !nomeAvulso.trim()) {
      setErr("Informe o nome do cliente avulso."); return;
    }
    const enderecosFilled = enderecos.filter(e => e.trim() !== "");
    if (enderecosFilled.length === 0) {
      setErr("Adicione pelo menos 1 endereço de entrega."); return;
    }
    if (valorPedido !== "" && parseFloat(valorPedido) < 0) {
      setErr("Valor do pedido não pode ser negativo."); return;
    }
    if (!empresaId) {
      setErr("Empresa padrão não encontrada. Verifique seu cadastro."); return;
    }

    setSaving(true);

    // ── Determinar local(is) de carregamento ──────────────────────────────────
    // Pode ser MÚLTIPLOS: junta tudo no texto `local_carregamento` (separado por " | ");
    // o id único só é gravado quando há exatamente UM local cadastrado escolhido
    // (preserva o formato de insert que já funcionava).
    const locaisValidos = locais.filter(l => (l.localId && l.endereco) || l.endereco.trim());
    const partesTexto = locaisValidos.map(l =>
      l.localId ? `${l.nome} — ${l.endereco}` : l.endereco.trim()
    );
    const localCarregamento: string | null = partesTexto.length ? partesTexto.join(" | ") : null;
    const localCarregamentoId: string | null =
      locaisValidos.length === 1 && locaisValidos[0].localId ? locaisValidos[0].localId : null;

    // INSERT pedido
        const pedidoPayload: any = {
      empresa_id:             empresaId,
      status:                 "agendada",
      data_inicio_prevista:   dataPrevista || null,
      valor_pedido:           valorPedido ? parseFloat(valorPedido) : null,
      observacoes:            observacoes.trim() || null,
      local_carregamento:     localCarregamento,
      local_carregamento_id:  localCarregamentoId,
    };
    // Vincular cliente_id se for cadastrado
    if (!avulso && clienteId) pedidoPayload.cliente_id = clienteId;

    const { data: pedido, error: errPedido } = await supabase
      .from("pedidos")
      .insert(pedidoPayload)
      .select("id")
      .single();

    if (errPedido || !pedido) {
      setErr(errPedido?.message ?? "Erro ao criar pedido.");
      setSaving(false);
      return;
    }

    // INSERT entregas — uma por endereço preenchido
    // motorista_id/veiculo_id/km_inicial são preenchidos na tela de Despacho;
    // os tipos do banco estão desatualizados (esses campos são nullable na prática).
    const rowsEntregas = enderecosFilled.map(destino => ({
      empresa_id:          empresaId,
      pedido_id:           pedido.id,
      status:              "agendado",
      origem:              localCarregamento || "Depósito",
      destino,
      ...(avulso
        ? { nome_cliente_avulso: nomeAvulso.trim() }
        : { cliente_id: clienteId }),
    }));

    // Usamos "as unknown as" porque os types gerados estão desatualizados:
    // motorista_id/veiculo_id/km_inicial aparecem como NOT NULL nos types mas
    // são opcionais no banco real (preenchidos depois, no Despacho).
    const { error: errEntregas } = await supabase
      .from("entregas")
            .insert(rowsEntregas );

    if (errEntregas) {
      // Pedido foi criado mas entregas falharam — avisa sem bloquear
      setErr(`Pedido criado, mas erro ao inserir entregas: ${errEntregas.message}`);
      setSaving(false);
      router.push(`/pedidos/${pedido.id}`);
      return;
    }

    // Dispara geocoding das entregas em background (fire-and-forget) para que a
    // rota saia instantânea depois — sem await para não atrasar o redirect.
    fetch('/api/routing/geocodar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pedido_id: pedido.id }),
    }).catch(() => {});

    // Se houver locais AVULSOS num cliente CADASTRADO, oferecer salvar no cadastro.
    const avulsosDigitados = locaisValidos
      .filter(l => !l.localId && l.endereco.trim())
      .map(l => ({ endereco: l.endereco.trim(), nome: "" }));

    if (!avulso && clienteId && avulsosDigitados.length > 0) {
      setPedidoCriadoId(pedido.id);
      setAvulsosParaSalvar(avulsosDigitados);
      setModalSalvarLocal(true);
      setSaving(false);
      // O pedido já foi criado; o modal só decide se salva os locais no cadastro.
    } else {
      router.push(`/pedidos/${pedido.id}`);
      router.refresh();
    }
  };

  // Salvar locais avulsos no cadastro do cliente
  const handleSalvarLocaisNoCadastro = async (salvar: boolean) => {
    if (salvar && empresaId && clienteId) {
      const aGravar = avulsosParaSalvar.filter(l => l.nome.trim());
      if (aGravar.length > 0) {
        setSalvandoLocal(true);
                await supabase.from("locais_carregamento").insert(
          aGravar.map((l, i) => ({
            empresa_id: empresaId,
            cliente_id: clienteId,
            nome:       l.nome.trim(),
            endereco:   l.endereco,
            // principal se o cliente ainda não tinha nenhum local cadastrado
            principal:  locaisCliente.length === 0 && i === 0,
          }))
        );
        setSalvandoLocal(false);
      }
    }
    setModalSalvarLocal(false);
    router.push(pedidoCriadoId ? `/pedidos/${pedidoCriadoId}` : "/pedidos");
    router.refresh();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#f1f5f9" }}>
      <PageHeader
        title="Novo Pedido"
        actions={<Btn href="/pedidos" variant="outline">Voltar para Lista</Btn>}
      />

      <div style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
        <form
          onSubmit={handleSubmit}
          style={{ maxWidth: "680px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "24px" }}
        >
          {err && <Alert variant="error">{err}</Alert>}

          {/* ── BLOCO CLIENTE ── */}
          <div style={{ background: "#fff", borderRadius: "12px", padding: "24px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
            <h2 style={{ fontSize: "16px", fontWeight: 700, color: "#1e293b", margin: "0 0 16px 0" }}>
              Cliente
            </h2>

            <label style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px", cursor: "pointer", fontSize: "14px", color: "#475569" }}>
              <input
                type="checkbox"
                checked={avulso}
                onChange={e => {
                  setAvulso(e.target.checked);
                  limparCliente();
                  setNomeAvulso("");
                  // cliente avulso começa com uma linha de local em branco; ao desmarcar, limpa
                  setLocais(e.target.checked ? [{ uid: novoUid(), localId: null, nome: "", endereco: "" }] : []);
                }}
                style={{ width: "16px", height: "16px", accentColor: "#2563eb" }}
              />
              Cliente sem cadastro (avulso) — apenas informar o nome
            </label>

            {avulso ? (
              <FormField label="Nome do cliente avulso">
                <input
                  type="text"
                  value={nomeAvulso}
                  onChange={e => setNomeAvulso(e.target.value)}
                  placeholder="Ex: João da Silva"
                  style={inputStyle}
                  autoFocus
                />
              </FormField>
            ) : (
              <FormField label="Buscar cliente cadastrado">
                <div ref={buscaRef} style={{ position: "relative" }}>
                  <div style={{ position: "relative" }}>
                    <input
                      type="text"
                      value={buscaCliente}
                      onChange={e => {
                        setBuscaCliente(e.target.value);
                        setClienteId("");
                        setMostrarSugestoes(true);
                      }}
                      onFocus={() => setMostrarSugestoes(true)}
                      placeholder="Digite para buscar..."
                      style={{
                        ...inputStyle,
                        paddingRight: clienteSelecionado ? "32px" : inputStyle.paddingRight,
                      }}
                      autoComplete="off"
                    />
                    {clienteSelecionado && (
                      <button
                        type="button"
                        onClick={limparCliente}
                        style={{
                          position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)",
                          background: "none", border: "none", cursor: "pointer",
                          color: "#94a3b8", fontSize: "18px", lineHeight: 1,
                        }}
                        title="Limpar seleção"
                      >
                        ×
                      </button>
                    )}
                  </div>

                  {mostrarSugestoes && clientesFiltrados.length > 0 && !clienteSelecionado && (
                    <div style={{
                      position: "absolute", zIndex: 50, top: "100%", left: 0, right: 0,
                      background: "#fff", border: "1px solid #e2e8f0", borderRadius: "8px",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.12)", maxHeight: "220px", overflowY: "auto",
                      marginTop: "4px",
                    }}>
                      {clientesFiltrados.map(c => (
                        <button
                          key={c.id}
                          type="button"
                          onMouseDown={() => selecionarCliente(c)}
                          style={{
                            display: "block", width: "100%", textAlign: "left",
                            padding: "10px 14px", background: "none", border: "none",
                            cursor: "pointer", fontSize: "14px", color: "#1e293b",
                            borderBottom: "1px solid #f1f5f9",
                          }}
                          onMouseEnter={e => (e.currentTarget.style.background = "#f8fafc")}
                          onMouseLeave={e => (e.currentTarget.style.background = "none")}
                        >
                          {c.nome_fantasia}
                        </button>
                      ))}
                    </div>
                  )}

                  {clienteSelecionado && (
                    <div style={{
                      marginTop: "8px", padding: "8px 12px", background: "#eff6ff",
                      borderRadius: "6px", fontSize: "13px", color: "#1d4ed8", fontWeight: 500,
                    }}>
                      Selecionado: {clienteSelecionado.nome_fantasia}
                    </div>
                  )}
                </div>
              </FormField>
            )}
          </div>

          {/* ── BLOCO LOCAL DE CARREGAMENTO (múltiplos) ── */}
          <div style={{ background: "#fff", borderRadius: "12px", padding: "24px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h2 style={{ fontSize: "16px", fontWeight: 700, color: "#1e293b", margin: 0 }}>
                Locais de Carregamento <span style={{ fontWeight: 400, color: "#94a3b8", fontSize: "13px" }}>(opcional)</span>
              </h2>
              <span style={{ fontSize: "12px", color: "#94a3b8" }}>
                {locais.filter(l => l.localId || l.endereco.trim()).length} local(is)
              </span>
            </div>

            {!avulso && !clienteSelecionado ? (
              <p style={{ color: "#94a3b8", fontSize: "13px", fontStyle: "italic" }}>
                Selecione um cliente para ver os locais de carregamento cadastrados.
              </p>
            ) : (
              <>
                {/* Lista de locais escolhidos para ESTE pedido */}
                {locais.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "14px" }}>
                    {locais.map((l, idx) => (
                      <div key={l.uid} style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                        <div style={{
                          width: "24px", height: "24px", borderRadius: "50%",
                          background: "#059669", color: "#fff",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: "11px", fontWeight: 700, flexShrink: 0,
                        }}>
                          {idx + 1}
                        </div>

                        {l.localId ? (
                          /* Local cadastrado: só leitura */
                          <div style={{
                            flex: 1, padding: "9px 12px", borderRadius: "8px",
                            border: "1px solid #d1fae5", background: "#ecfdf5",
                            display: "flex", flexDirection: "column",
                          }}>
                            <span style={{ fontSize: "13px", fontWeight: 600, color: "#059669" }}>
                              {l.nome}
                              <span style={{ marginLeft: "6px", fontSize: "11px", fontWeight: 500, color: "#10b981" }}>· cadastrado</span>
                            </span>
                            <span style={{ fontSize: "11px", color: "#64748b" }}>{l.endereco}</span>
                          </div>
                        ) : (
                          /* Local avulso: editável */
                          <input
                            type="text"
                            value={l.endereco}
                            onChange={e => setLocalAvulsoTexto(l.uid, e.target.value)}
                            placeholder="Ex: Galpão São Paulo, Rua X, 123"
                            style={{ ...inputStyle, flex: 1 }}
                          />
                        )}

                        <button
                          type="button"
                          onClick={() => removerLocal(l.uid)}
                          style={{
                            width: "32px", height: "32px", borderRadius: "6px",
                            border: "1px solid #e2e8f0", background: "#fff",
                            cursor: "pointer", color: "#ef4444",
                            fontSize: "18px", display: "flex", alignItems: "center", justifyContent: "center",
                            flexShrink: 0,
                          }}
                          title="Remover local"
                        >
                          −
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Chips dos locais cadastrados (cliente cadastrado) */}
                {!avulso && locaisCliente.length > 0 && (
                  <div style={{ marginBottom: "12px" }}>
                    <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "8px" }}>
                      Toque para adicionar um local já cadastrado deste cliente:
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                      {locaisCliente.map(loc => {
                        const usado = localJaAdicionado(loc.id);
                        return (
                          <button
                            key={loc.id}
                            type="button"
                            onClick={() => toggleLocalCadastrado(loc)}
                            style={{
                              padding: "8px 14px",
                              borderRadius: "10px",
                              border: usado ? "2px solid #059669" : "1px solid #e2e8f0",
                              background: usado ? "#ecfdf5" : "#fff",
                              cursor: "pointer",
                              textAlign: "left",
                              transition: "all 150ms",
                              opacity: usado ? 0.85 : 1,
                            }}
                            title={usado ? "Já adicionado — toque para remover" : "Adicionar este local"}
                          >
                            <div style={{ fontSize: "13px", fontWeight: 600, color: usado ? "#059669" : "#1e293b" }}>
                              {usado ? "✓ " : ""}
                              {loc.principal && <span style={{ marginRight: "4px" }}>⭐</span>}
                              {loc.nome}
                            </div>
                            <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>
                              {loc.endereco}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Botão: adicionar local avulso (digitado) */}
                <button
                  type="button"
                  onClick={adicionarLocalAvulso}
                  style={{
                    padding: "8px 16px",
                    background: "#f8fafc", border: "1px dashed #cbd5e1",
                    borderRadius: "8px", cursor: "pointer",
                    fontSize: "13px", color: "#059669", fontWeight: 500,
                    display: "flex", alignItems: "center", gap: "6px",
                    width: "100%", justifyContent: "center",
                  }}
                >
                  + Adicionar outro local {avulso ? "" : "(digitar avulso)"}
                </button>
              </>
            )}
          </div>

          {/* ── BLOCO VALOR E DATA ── */}
          <div style={{ background: "#fff", borderRadius: "12px", padding: "24px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
            <h2 style={{ fontSize: "16px", fontWeight: 700, color: "#1e293b", margin: "0 0 16px 0" }}>
              Detalhes do Pedido
            </h2>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              <FormField label="Valor do pedido (R$)">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={valorPedido}
                  onChange={e => setValorPedido(e.target.value)}
                  placeholder="Ex: 1500.00"
                  style={inputStyle}
                />
              </FormField>

              <FormField label="Data prevista">
                <input
                  type="date"
                  value={dataPrevista}
                  onChange={e => setDataPrevista(e.target.value)}
                  style={inputStyle}
                />
              </FormField>
            </div>
          </div>

          {/* ── BLOCO ENTREGAS ── */}
          <div style={{ background: "#fff", borderRadius: "12px", padding: "24px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h2 style={{ fontSize: "16px", fontWeight: 700, color: "#1e293b", margin: 0 }}>
                Endereços de entrega
              </h2>
              <span style={{ fontSize: "12px", color: "#94a3b8" }}>
                {enderecos.filter(e => e.trim()).length} endereço(s)
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {enderecos.map((end, idx) => (
                <div key={idx} style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <div style={{
                    width: "24px", height: "24px", borderRadius: "50%",
                    background: "#2563eb", color: "#fff",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "11px", fontWeight: 700, flexShrink: 0,
                  }}>
                    {idx + 1}
                  </div>
                  <input
                    type="text"
                    value={end}
                    onChange={e => setEndereco(idx, e.target.value)}
                    placeholder="Rua, número, bairro, cidade"
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  <button
                    type="button"
                    onClick={() => removerEndereco(idx)}
                    disabled={enderecos.length === 1}
                    style={{
                      width: "32px", height: "32px", borderRadius: "6px",
                      border: "1px solid #e2e8f0", background: enderecos.length === 1 ? "#f8fafc" : "#fff",
                      cursor: enderecos.length === 1 ? "not-allowed" : "pointer",
                      color: enderecos.length === 1 ? "#cbd5e1" : "#ef4444",
                      fontSize: "18px", display: "flex", alignItems: "center", justifyContent: "center",
                      flexShrink: 0,
                    }}
                    title="Remover endereço"
                  >
                    −
                  </button>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={adicionarEndereco}
              style={{
                marginTop: "12px", padding: "8px 16px",
                background: "#f8fafc", border: "1px dashed #cbd5e1",
                borderRadius: "8px", cursor: "pointer",
                fontSize: "13px", color: "#2563eb", fontWeight: 500,
                display: "flex", alignItems: "center", gap: "6px",
                width: "100%", justifyContent: "center",
              }}
            >
              + Adicionar endereço
            </button>
          </div>

          {/* ── BLOCO OBSERVAÇÕES ── */}
          <div style={{ background: "#fff", borderRadius: "12px", padding: "24px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
            <h2 style={{ fontSize: "16px", fontWeight: 700, color: "#1e293b", margin: "0 0 16px 0" }}>
              Observações <span style={{ fontWeight: 400, color: "#94a3b8", fontSize: "13px" }}>(opcional)</span>
            </h2>
            <textarea
              value={observacoes}
              onChange={e => setObservacoes(e.target.value)}
              rows={3}
              placeholder="Informações adicionais do pedido..."
              style={{ ...inputStyle, resize: "vertical", width: "100%", boxSizing: "border-box" }}
            />
          </div>

          {/* ── AÇÕES ── */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", paddingBottom: "32px" }}>
            <Btn href="/pedidos" variant="outline">Cancelar</Btn>
            <Btn type="submit" variant="primary" disabled={saving} style={{ minWidth: "160px" }}>
              {saving ? "Criando pedido..." : "Criar Pedido"}
            </Btn>
          </div>

          {/* ── LINK MODO AVANÇADO ── */}
          <p style={{ textAlign: "center", fontSize: "12px", color: "#94a3b8", paddingBottom: "16px" }}>
            Precisa selecionar entregas existentes?{" "}
            <a href="/pedidos/novo-avancado" style={{ color: "#2563eb", textDecoration: "underline" }}>
              Usar modo avançado
            </a>
          </p>
        </form>
      </div>

      {/* ── MODAL: SALVAR LOCAIS AVULSOS NO CADASTRO DO CLIENTE ── */}
      {modalSalvarLocal && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 9999,
            background: "rgba(0,0,0,0.45)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "16px",
          }}
        >
          <div style={{
            background: "#fff", borderRadius: "12px", padding: "28px",
            width: "100%", maxWidth: "460px",
            boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
            maxHeight: "90vh", overflowY: "auto",
          }}>
            <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#1e293b", margin: "0 0 8px" }}>
              Salvar local(is) no cadastro?
            </h3>
            <p style={{ fontSize: "13px", color: "#64748b", margin: "0 0 16px" }}>
              Você digitou {avulsosParaSalvar.length === 1 ? "um local novo" : `${avulsosParaSalvar.length} locais novos`} para{" "}
              <strong>{clienteSelecionado?.nome_fantasia}</strong>. Dê um nome para os que quiser guardar no cadastro (deixe em branco para não salvar).
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "14px", marginBottom: "20px" }}>
              {avulsosParaSalvar.map((l, i) => (
                <div key={i}>
                  <FormField label={`Nome para "${l.endereco}"`}>
                    <input
                      type="text"
                      value={l.nome}
                      onChange={e => setAvulsosParaSalvar(prev => prev.map((x, j) => j === i ? { ...x, nome: e.target.value } : x))}
                      placeholder="Ex: Galpão Central (deixe em branco para ignorar)"
                      style={inputStyle}
                      autoFocus={i === 0}
                    />
                  </FormField>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <Btn
                type="button"
                variant="ghost"
                onClick={() => handleSalvarLocaisNoCadastro(false)}
                disabled={salvandoLocal}
              >
                Não salvar
              </Btn>
              <Btn
                type="button"
                variant="primary"
                onClick={() => handleSalvarLocaisNoCadastro(true)}
                disabled={salvandoLocal || !avulsosParaSalvar.some(l => l.nome.trim())}
                style={{ background: "#059669" }}
              >
                {salvandoLocal ? "Salvando..." : "Salvar no cadastro"}
              </Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
