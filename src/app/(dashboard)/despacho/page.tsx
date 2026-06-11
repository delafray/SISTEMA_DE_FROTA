"use client";

/**
 * Tela de Despacho — lista/fila principal da operação.
 *
 * A lógica de dados e o estado ficam em _components/useDespacho.ts.
 * Os blocos de UI foram extraídos para:
 *   - KpisDespacho       → bloco de 4 KPIs informativos
 *   - LinhaDespacho      → linha da tabela desktop
 *   - CardDespachoMobile → card da lista mobile
 *   - ModalDespacho      → modal de despacho/troca (já existia)
 *   - ModalRota          → modal de mapa da rota (já existia)
 */

import { DataTable, Th, Td, Btn, Alert, SearchInput, EmptyState, PageHeader } from "@/components/ui/ds";
import { MobileList } from "@/components/mobile";
import { ModalDespacho } from "./_components/ModalDespacho";
import { ModalRota }     from "./_components/ModalRota";
import { KpisDespacho }  from "./_components/KpisDespacho";
import { LinhaDespacho } from "./_components/LinhaDespacho";
import { CardDespachoMobile } from "./_components/CardDespachoMobile";
import { useDespacho }   from "./_components/useDespacho";

export default function DespachoPage() {
  const {
    filtrados,
    veiculos,
    motoristas,
    total,
    loading,
    contFila,
    contDespachados,
    contEmRota,
    busca,
    setBusca,
    pagina,
    setPagina,
    totalPaginas,
    selecionados,
    toggleSelecionado,
    todosSelecionados,
    toggleTodos,
    modalAberto,
    modalPedidosIds,
    modalModoTroca,
    saving,
    modalErr,
    abrirModal,
    fecharModal,
    confirmarDespacho,
    modalRota,
    setModalRota,
    sucesso,
  } = useDespacho();

  const algumselecionado = selecionados.size > 0;

  // ── Controles de paginação (reutilizáveis desktop/mobile) ───────────────────

  const Paginacao = ({ mobile = false }: { mobile?: boolean }) =>
    totalPaginas > 1 ? (
      <div style={{
        display: "flex", alignItems: "center", gap: "10px",
        justifyContent: mobile ? "center" : "flex-end",
        padding: "8px 0",
      }}>
        {!mobile && (
          <span style={{ fontSize: "13px", color: "#64748b" }}>
            Página {pagina + 1} de {totalPaginas} · {total} pedidos
          </span>
        )}
        <Btn
          variant="outline" size={mobile ? "sm" : "xs"}
          disabled={pagina === 0 || loading}
          onClick={() => setPagina(p => Math.max(0, p - 1))}
        >
          ← Anterior
        </Btn>
        {mobile && (
          <span style={{ fontSize: "13px", color: "#64748b" }}>{pagina + 1}/{totalPaginas}</span>
        )}
        <Btn
          variant="outline" size={mobile ? "sm" : "xs"}
          disabled={pagina >= totalPaginas - 1 || loading}
          onClick={() => setPagina(p => p + 1)}
        >
          Próxima →
        </Btn>
      </div>
    ) : null;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PageHeader
        title="Despacho"
        subtitle="Todos os pedidos — despache, troque e acompanhe a rota"
        count={total}
        actions={
          algumselecionado ? (
            <Btn
              variant="primary"
              onClick={() => abrirModal(Array.from(selecionados))}
            >
              Despachar {selecionados.size} selecionado{selecionados.size > 1 ? "s" : ""}
            </Btn>
          ) : undefined
        }
      />

      <div style={{ flex: 1, overflow: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>

        {/* KPIs informativos */}
        <KpisDespacho
          loading={loading}
          totalNaLista={total}
          contFila={contFila}
          contDespachados={contDespachados}
          contEmRota={contEmRota}
        />

        {/* Alerta de sucesso */}
        {sucesso && <Alert variant="success">{sucesso}</Alert>}

        {/* Busca no mobile */}
        <div className="mobile-only" style={{ marginBottom: "4px" }}>
          <SearchInput
            placeholder="Buscar nº do pedido, cliente ou destino..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
          />
        </div>

        {/* Tabela Desktop */}
        <div className="m-hide">
          <DataTable
            count={filtrados.length}
            label="pedidos"
            toolbar={
              <>
                <SearchInput
                  placeholder="Buscar nº do pedido, cliente ou destino..."
                  value={busca}
                  onChange={e => setBusca(e.target.value)}
                />
                {algumselecionado && (
                  <Btn
                    variant="primary"
                    size="sm"
                    onClick={() => abrirModal(Array.from(selecionados))}
                  >
                    Despachar {selecionados.size} selecionado{selecionados.size > 1 ? "s" : ""}
                  </Btn>
                )}
              </>
            }
          >
            <thead>
              <tr>
                <Th style={{ width: "36px", textAlign: "center" }}>
                  <input
                    type="checkbox"
                    checked={todosSelecionados}
                    onChange={toggleTodos}
                    style={{ width: "15px", height: "15px", cursor: "pointer", accentColor: "#2563eb" }}
                    title="Selecionar todos"
                  />
                </Th>
                <Th>Nº</Th>
                <Th>Cliente</Th>
                <Th>Previsto</Th>
                <Th>Destinos</Th>
                <Th>Caminhão / Motorista</Th>
                <Th>Status</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <Td colSpan={8} style={{ textAlign: "center", padding: "40px", color: "#94a3b8" }}>
                    Carregando...
                  </Td>
                </tr>
              ) : filtrados.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <EmptyState
                      icon="🚚"
                      message={
                        busca
                          ? "Nenhum pedido encontrado para essa busca."
                          : "Nenhum pedido lançado ainda."
                      }
                      action={busca ? undefined : <Btn href="/pedidos/novo">Criar Novo Pedido</Btn>}
                    />
                  </td>
                </tr>
              ) : filtrados.map(({ p, entregas, cliente }) => (
                <LinhaDespacho
                  key={p.id}
                  p={p}
                  entregas={entregas}
                  cliente={cliente}
                  selecionado={selecionados.has(p.id)}
                  onToggle={() => toggleSelecionado(p.id)}
                  onDespachar={() => abrirModal([p.id])}
                  onTrocar={() => abrirModal([p.id], true)}
                  onVerRota={() => setModalRota(p.id)}
                />
              ))}
            </tbody>
          </DataTable>
          <Paginacao />
        </div>

        {/* Lista Mobile */}
        <MobileList
          count={filtrados.length}
          label="pedidos"
          emptyMessage="Nenhum pedido lançado ainda."
          emptyIcon="🚚"
        >
          {loading ? null : filtrados.map(({ p, entregas, cliente }) => (
            <CardDespachoMobile
              key={p.id}
              p={p}
              entregas={entregas}
              cliente={cliente}
              selecionado={selecionados.has(p.id)}
              onToggle={() => toggleSelecionado(p.id)}
              onDespachar={() => abrirModal([p.id])}
              onTrocar={() => abrirModal([p.id], true)}
              onVerRota={() => setModalRota(p.id)}
            />
          ))}
        </MobileList>
        <div className="mobile-only"><Paginacao mobile /></div>

        {/* FAB Mobile para despachar selecionados */}
        {algumselecionado && (
          <button
            type="button"
            onClick={() => abrirModal(Array.from(selecionados))}
            className="m-fab mobile-only"
            title={`Despachar ${selecionados.size} selecionado(s)`}
            aria-label={`Despachar ${selecionados.size} selecionado(s)`}
            style={{ fontSize: "12px", width: "auto", padding: "0 16px", borderRadius: "24px" }}
          >
            Despachar {selecionados.size}
          </button>
        )}
      </div>

      {/* Modal de despacho / troca */}
      {modalAberto && (
        <ModalDespacho
          pedidosIds={modalPedidosIds}
          veiculos={veiculos}
          motoristas={motoristas}
          onConfirm={confirmarDespacho}
          onClose={fecharModal}
          saving={saving}
          err={modalErr}
          modoTroca={modalModoTroca}
        />
      )}

      {/* Mapa da rota do pedido (montada pelo motorista) */}
      {modalRota && (
        <ModalRota
          pedidoId={modalRota}
          onClose={() => setModalRota(null)}
        />
      )}
    </div>
  );
}
