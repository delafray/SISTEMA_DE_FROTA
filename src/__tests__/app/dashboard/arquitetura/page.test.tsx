import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import ArquiteturaPage from "@/app/(dashboard)/arquitetura/page";

// Mock do React Flow pois ele tem dependências complexas (ResizeObserver) que não existem por padrão no ambiente JSDOM do Vitest
vi.mock('@xyflow/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@xyflow/react')>();
  return {
    ...actual,
    ReactFlow: ({ children }: any) => <div data-testid="react-flow-mock">{children}</div>,
    MiniMap: () => <div data-testid="minimap-mock" />,
    Controls: () => <div data-testid="controls-mock" />,
    Background: () => <div data-testid="background-mock" />,
    useNodesState: (initial: any) => [initial, vi.fn(), vi.fn()],
    useEdgesState: (initial: any) => [initial, vi.fn(), vi.fn()],
  };
});

// Polyfill necessário para dependências de resize no React18+JSDOM (caso o ReactFlow seja importado profundamente)
if (typeof window !== 'undefined' && !window.ResizeObserver) {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

describe("ArquiteturaPage", () => {
  it("deve renderizar o título e o mock do canvas React Flow", () => {
    render(<ArquiteturaPage />);
    expect(screen.getByText("Canvas da Arquitetura")).toBeDefined();
    expect(screen.getByTestId("react-flow-mock")).toBeDefined();
    expect(screen.getByTestId("minimap-mock")).toBeDefined();
    expect(screen.getByTestId("controls-mock")).toBeDefined();
  });
});
