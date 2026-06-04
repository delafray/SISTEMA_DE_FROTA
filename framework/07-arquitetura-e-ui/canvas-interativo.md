# Canvas de Arquitetura Interativo (React Flow)

Sempre que o sistema atingir um nível de complexidade alto (várias APIs, microsserviços, ou IAs conectadas), é **obrigatório** ter um mapa visual do sistema embutido no Dashboard de Administração.

Isso previne a "caixa preta" de código e permite que novos desenvolvedores e gestores visualizem as conexões exatas sem precisarem ler o código-fonte.

## Tecnologia Oficial

Neste framework, usamos o **React Flow** (`@xyflow/react`). Ele é o padrão da indústria para construir interfaces baseadas em "Nós e Arestas" (Node-based UIs), estilo Figma, Miro ou construtores de fluxogramas (n8n, Typebot).

### Instalação

```bash
npm install @xyflow/react
```

## Como Implementar (Boilerplate)

Para subir um canvas do zero no Dashboard, você precisará de 2 arquivos:

### 1. O Componente do Bloco (`CustomNode.tsx`)
Este arquivo dita o visual de cada "quadrado" no seu mapa.

```tsx
import { Handle, Position } from '@xyflow/react';

export function CustomNode({ data }: any) {
  return (
    <div className="px-4 py-3 shadow-md rounded-lg bg-white border-2 border-slate-200 min-w-[150px]">
      <div className="flex items-center gap-3">
        {data.icon && <div className="text-2xl">{data.icon}</div>}
        <div>
          <div className="font-bold text-sm text-slate-800">{data.label}</div>
          {data.subline && <div className="text-xs text-slate-500">{data.subline}</div>}
        </div>
      </div>
      {/* As "bolinhas" onde as linhas se conectam */}
      <Handle type="target" position={Position.Top} className="w-2 h-2 bg-slate-400" />
      <Handle type="source" position={Position.Bottom} className="w-2 h-2 bg-slate-400" />
    </div>
  );
}
```

### 2. A Página do Mapa (`page.tsx`)
A página onde o mapa é renderizado em tela cheia com controles de zoom e arrasto.

```tsx
"use client";

import { useCallback } from 'react';
import { ReactFlow, MiniMap, Controls, Background, useNodesState, useEdgesState, addEdge, BackgroundVariant } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { CustomNode } from './_components/CustomNode';

const nodeTypes = { custom: CustomNode };

// Crie os blocos informando a posição X e Y
const initialNodes = [
  { id: 'db', type: 'custom', position: { x: 300, y: 500 }, data: { label: 'Banco de Dados', subline: 'PostgreSQL', icon: '🗄️' } },
  { id: 'api', type: 'custom', position: { x: 100, y: 350 }, data: { label: 'API Externa', subline: 'Node.js', icon: '⚙️' } },
];

// Ligue os blocos pelos IDs
const initialEdges = [
  { id: 'e-api-db', source: 'api', target: 'db', animated: true },
];

export default function ArquiteturaPage() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const onConnect = useCallback((params: any) => setEdges((eds) => addEdge(params, eds)), [setEdges]);

  return (
    <div className="w-full h-full min-h-[calc(100vh-64px)] p-6 bg-slate-50 flex flex-col">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Canvas da Arquitetura</h1>
      </div>
      <div className="w-full flex-1 min-h-[600px] border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden">
        <ReactFlow
          nodes={nodes} edges={edges}
          onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
          nodeTypes={nodeTypes} fitView
        >
          <Controls />
          <MiniMap zoomable pannable />
          <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
        </ReactFlow>
      </div>
    </div>
  );
}
```

## Expansões Futuras

O React Flow suporta interatividade profunda. Em vez de ser apenas um mapa visual estático, você pode adicionar a prop `onNodeClick` ao `<ReactFlow>` para fazer com que:
1. Clicar no Node "Banco de Dados" abra um *Modal* (Slide-over) na lateral exibindo o tamanho do banco em GBs reais extraídos de uma API.
2. Clicar no Node "Evolution API" abra os logs ao vivo de conexão.

Para referências futuras na construção de novos sistemas, basta copiar este Boilerplate para a pasta do seu novo Dashboard e ligar os pontos.
