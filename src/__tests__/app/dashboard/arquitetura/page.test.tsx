import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import ArquiteturaPage from "@/app/(dashboard)/arquitetura/page";
import '@testing-library/jest-dom';

// Mock do React Flow pois ele tem dependências complexas que não existem por padrão no ambiente JSDOM do Vitest
vi.mock('@xyflow/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@xyflow/react')>();
  return {
    ...actual,
    ReactFlow: ({ children, onNodeClick, nodes }: { children?: React.ReactNode; onNodeClick: (e: unknown, node: unknown) => void; nodes: Array<{ id: string; data: { label: string } }> }) => (
      <div data-testid="react-flow-mock">
        {nodes.map((node) => (
          <button 
            key={node.id} 
            data-testid={`mock-node-${node.id}`} 
            onClick={(e) => onNodeClick(e, node)}
          >
            {node.data.label}
          </button>
        ))}
        {children}
      </div>
    ),
    MiniMap: () => <div data-testid="minimap-mock" />,
    Controls: () => <div data-testid="controls-mock" />,
    Background: () => <div data-testid="background-mock" />,
    useNodesState: (initial: unknown) => [initial, vi.fn(), vi.fn()],
    useEdgesState: (initial: unknown) => [initial, vi.fn(), vi.fn()],
  };
});

// Polyfill necessário para dependências de resize no React18+JSDOM
if (typeof window !== 'undefined' && !window.ResizeObserver) {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

describe("ArquiteturaPage", () => {
  it("deve renderizar o título e os nós iniciais mockados", () => {
    render(<ArquiteturaPage />);
    expect(screen.getByText("Canvas da Arquitetura")).toBeInTheDocument();
    expect(screen.getByTestId("react-flow-mock")).toBeInTheDocument();
    // Verifica se um nó específico foi renderizado
    expect(screen.getByTestId("mock-node-mot")).toBeInTheDocument();
  });

  it("deve abrir o painel lateral com os detalhes quando clica num nó", () => {
    render(<ArquiteturaPage />);
    
    // O painel deve estar vazio ou não visível os dados ricos inicialmente
    const sidePanel = screen.getByTestId("side-panel");
    expect(sidePanel).toHaveClass("translate-x-full");

    // Clica no nó do Supabase
    fireEvent.click(screen.getByTestId("mock-node-db"));

    // O painel deve abrir (classe translate-x-0)
    expect(sidePanel).toHaveClass("translate-x-0");
    
    // As infos ricas do Supabase devem aparecer dentro do painel
    expect(within(sidePanel).getByText("Supabase")).toBeInTheDocument();
    // PostgreSQL e RLS viram badges individuais (array map no React)
    expect(within(sidePanel).getAllByText("PostgreSQL").length).toBeGreaterThan(0);
    expect(within(sidePanel).getByText("RLS")).toBeInTheDocument();
    expect(within(sidePanel).getByText("ATENÇÃO")).toBeInTheDocument();
  });
});
