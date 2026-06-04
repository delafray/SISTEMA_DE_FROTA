"use client";

import { useCallback } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  BackgroundVariant
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { CustomNode } from './_components/CustomNode';

const nodeTypes = {
  custom: CustomNode,
};

const initialNodes = [
  // Atores
  { id: 'mot', type: 'custom', position: { x: 100, y: 50 }, data: { label: 'Motorista', subline: 'WhatsApp / App', icon: '📱' } },
  { id: 'ges', type: 'custom', position: { x: 500, y: 50 }, data: { label: 'Gestor', subline: 'Painel Web', icon: '💻' } },

  // Frontend
  { id: 'app', type: 'custom', position: { x: 100, y: 200 }, data: { label: 'App Mobile', subline: 'Next.js PWA', icon: '📲' } },
  { id: 'dash', type: 'custom', position: { x: 500, y: 200 }, data: { label: 'Dashboard', subline: 'Next.js', icon: '📊' } },

  // Backend
  { id: 'api', type: 'custom', position: { x: 100, y: 350 }, data: { label: 'API Otimização', subline: 'Node.js', icon: '⚙️' } },
  { id: 'router', type: 'custom', position: { x: 300, y: 350 }, data: { label: 'Message Router', subline: 'Node.js', icon: '🔀' } },
  { id: 'evo', type: 'custom', position: { x: 500, y: 350 }, data: { label: 'Evolution API', subline: 'WhatsApp', icon: '💬' } },

  // DB
  { id: 'osrm', type: 'custom', position: { x: 100, y: 500 }, data: { label: 'OSRM / VROOM', subline: 'Oracle Cloud', icon: '🗺️' } },
  { id: 'db', type: 'custom', position: { x: 300, y: 500 }, data: { label: 'Supabase', subline: 'PostgreSQL', icon: '🗄️' } },
  { id: 'ai', type: 'custom', position: { x: 500, y: 500 }, data: { label: 'Gemini / Deepgram', subline: 'IA Services', icon: '🤖' } },
];

const initialEdges = [
  { id: 'e-mot-app', source: 'mot', target: 'app', animated: true },
  { id: 'e-ges-dash', source: 'ges', target: 'dash', animated: true },
  
  { id: 'e-app-api', source: 'app', target: 'api', animated: true },
  { id: 'e-mot-evo', source: 'mot', target: 'evo', animated: true },
  
  { id: 'e-api-osrm', source: 'api', target: 'osrm', animated: true },
  { id: 'e-evo-router', source: 'evo', target: 'router', animated: true },
  { id: 'e-router-ai', source: 'router', target: 'ai', animated: true },
  
  { id: 'e-router-db', source: 'router', target: 'db', animated: true },
  { id: 'e-dash-db', source: 'dash', target: 'db', animated: true },
  { id: 'e-api-db', source: 'api', target: 'db', animated: true },
];

export default function ArquiteturaPage() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const onConnect = useCallback(
    (params: any) => setEdges((eds) => addEdge(params, eds)),
    [setEdges],
  );

  return (
    <div className="w-full h-full min-h-[calc(100vh-64px)] p-6 bg-slate-50 flex flex-col">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Canvas da Arquitetura</h1>
        <p className="text-slate-500">Mapa interativo do ecossistema do Sistema de Frota. Use o scroll para zoom e arraste para mover a câmera.</p>
      </div>
      <div className="w-full flex-1 min-h-[600px] border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          fitView
          attributionPosition="bottom-right"
        >
          <Controls />
          <MiniMap zoomable pannable />
          <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
        </ReactFlow>
      </div>
    </div>
  );
}
