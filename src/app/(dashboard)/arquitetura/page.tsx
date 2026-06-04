"use client";

import { useCallback, useState } from 'react';
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
  { id: 'mot', type: 'custom', position: { x: 100, y: 50 }, data: { label: 'Motorista', subline: 'WhatsApp / App', icon: '📱', desc: 'Ator principal do sistema de campo. Interage primariamente via WhatsApp para avisos rápidos e secundariamente pelo App PWA para capturar NFs.', status: 'OK' } },
  { id: 'ges', type: 'custom', position: { x: 500, y: 50 }, data: { label: 'Gestor', subline: 'Painel Web', icon: '💻', desc: 'Acessa o Dashboard para acompanhar relatórios, acertos financeiros e manutenções em tempo real.', status: 'OK' } },

  // Frontend
  { id: 'app', type: 'custom', position: { x: 100, y: 200 }, data: { label: 'App Mobile', subline: 'Next.js PWA', icon: '📲', desc: 'Página desenhada para a tela do celular do motorista. Captura de tela, mapa e confirmações.', repo: 'src/app/mobile/rota/page.tsx', tech: 'React, IndexedDB, Dexie, Tailwind', status: 'DÉBITO TÉCNICO', alert: 'A tela de Rota possui componentes monolíticos (>30KB) e acoplamento forte com GPS e Máquina de Estados. Precisa virar Custom Hooks.' } },
  { id: 'dash', type: 'custom', position: { x: 500, y: 200 }, data: { label: 'Dashboard', subline: 'Next.js', icon: '📊', desc: 'Painel de administração da frota. Controla faturamento, motoristas, e acompanha entregas.', repo: 'src/app/(dashboard)/*', tech: 'React, Tailwind, Supabase Client', status: 'DÉBITO TÉCNICO', alert: 'As abas como AcertoMensalTab precisam de refatoração para separar chamadas de banco da renderização puramente visual da tabela.' } },

  // Backend
  { id: 'api', type: 'custom', position: { x: 100, y: 350 }, data: { label: 'API Otimização', subline: 'Node.js', icon: '⚙️', desc: 'Calcula o geocoding dos endereços usando ViaCEP/Nominatim e repassa a matriz de distância para a VM na Oracle calcular a melhor rota.', repo: 'src/app/api/routing/otimizar/route.ts', tech: 'Next.js API Routes, Fetch', status: 'OK' } },
  { id: 'router', type: 'custom', position: { x: 300, y: 350 }, data: { label: 'Message Router', subline: 'Node.js', icon: '🔀', desc: 'Recebe os Webhooks da Evolution API, identifica de quem veio a mensagem, baixa áudios, converte em texto e decide para qual IA enviar.', repo: 'src/lib/whatsapp/messageRouter.ts', tech: 'Node.js, FormData, Webhooks', status: 'DÉBITO TÉCNICO', alert: 'É um "God Object" de 30KB. Todo fluxo do Zap passa aqui. Precisa ser urgentemente desmembrado em sub-roteadores (entregasRouter, despesasRouter).' } },
  { id: 'evo', type: 'custom', position: { x: 500, y: 350 }, data: { label: 'Evolution API', subline: 'WhatsApp', icon: '💬', desc: 'Gateway open-source de conexão com o WhatsApp usando pareamento por QR Code. Envia e recebe mensagens como se fosse o celular do motorista.', tech: 'Docker, Node.js, Baileys', repo: 'Deploy no Railway (App Separado)', status: 'OK' } },

  // DB
  { id: 'osrm', type: 'custom', position: { x: 100, y: 500 }, data: { label: 'OSRM / VROOM', subline: 'Oracle Cloud', icon: '🗺️', desc: 'Motor C++ super rápido de roteirização open-source. Roda isolado em uma VM na nuvem da Oracle para não sobrecarregar e nem custar caro na Vercel.', repo: 'scripts/oracle-vm/', tech: 'Docker Compose, OSRM, VROOM', status: 'OK' } },
  { id: 'db', type: 'custom', position: { x: 300, y: 500 }, data: { label: 'Supabase', subline: 'PostgreSQL', icon: '🗄️', desc: 'Banco de dados transacional em nuvem, cuidando de Autenticação, Row Level Security e Triggers de tempo real.', repo: 'src/lib/supabase/', tech: 'PostgreSQL, RLS', status: 'ATENÇÃO', alert: 'Atenção ao Pós-MVP: Tabelas novas (notas_capturadas e paradas) ainda não estão vinculadas ao cliente_id da tabela antiga. Isso bloqueará relatórios gerenciais complexos se não for migrado.' } },
  { id: 'ai', type: 'custom', position: { x: 500, y: 500 }, data: { label: 'Gemini / Deepgram', subline: 'IA Services', icon: '🤖', desc: 'Serviços cognitivos: O Deepgram (Nova, super rápido) converte o áudio do motorista para texto. O Gemini processa o texto para extrair a intenção e executa o Flow (ex: Flow de Abastecimento).', repo: 'src/lib/ai/services/aiService.ts', tech: 'Google Vertex AI, Deepgram SDK', status: 'DÉBITO TÉCNICO', alert: 'O router chama a IA corretamente, mas os Flows em si (Abastecimento, Despesa, Viagem) não possuem cobertura de testes (0%).' } },
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
  const [selectedNodeData, setSelectedNodeData] = useState<any | null>(null);

  const onConnect = useCallback(
    (params: any) => setEdges((eds) => addEdge(params, eds)),
    [setEdges],
  );

  const onNodeClick = useCallback((event: any, node: any) => {
    setSelectedNodeData(node.data);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNodeData(null);
  }, []);

  return (
    <div className="w-full h-full min-h-[calc(100vh-64px)] p-6 bg-slate-50 flex flex-col overflow-hidden">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Canvas da Arquitetura</h1>
        <p className="text-slate-500">Mapa interativo do ecossistema do Sistema de Frota. Clique nos blocos para ver detalhes e o diagnóstico técnico atual.</p>
      </div>
      
      <div className="w-full flex-1 min-h-[600px] border border-slate-200 rounded-xl bg-white shadow-sm relative overflow-hidden flex">
        <div className="flex-1 h-full relative">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            nodeTypes={nodeTypes}
            fitView
            attributionPosition="bottom-right"
          >
            <Controls />
            <MiniMap zoomable pannable />
            <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
          </ReactFlow>
        </div>

        {/* Side Panel Drawer */}
        <div 
          className={`absolute top-0 right-0 h-full w-80 bg-white border-l border-slate-200 shadow-2xl transform transition-transform duration-300 ease-in-out z-10 ${selectedNodeData ? 'translate-x-0' : 'translate-x-full'}`}
          data-testid="side-panel"
        >
          {selectedNodeData && (
            <div className="flex flex-col h-full">
              <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/50">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{selectedNodeData.icon}</span>
                  <div>
                    <h2 className="font-bold text-slate-800 text-lg leading-tight">{selectedNodeData.label}</h2>
                    <p className="text-xs text-slate-500 font-medium">{selectedNodeData.subline}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedNodeData(null)}
                  className="p-2 -mr-2 hover:bg-slate-200 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
                  aria-label="Fechar painel"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-5 space-y-6">
                {selectedNodeData.status && (
                  <div>
                    <span className={`inline-flex px-2.5 py-1 text-xs font-bold rounded-md uppercase tracking-wide ${
                      selectedNodeData.status === 'OK' ? 'bg-emerald-100 text-emerald-700' :
                      selectedNodeData.status === 'ATENÇÃO' ? 'bg-amber-100 text-amber-700' :
                      'bg-rose-100 text-rose-700'
                    }`}>
                      {selectedNodeData.status}
                    </span>
                  </div>
                )}

                <div>
                  <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">O que faz?</h3>
                  <p className="text-sm text-slate-700 leading-relaxed">{selectedNodeData.desc}</p>
                </div>

                {selectedNodeData.alert && (
                  <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 shadow-sm">
                    <h3 className="text-[11px] font-bold text-rose-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                      <span className="text-sm">⚠️</span> Diagnóstico do Arquiteto
                    </h3>
                    <p className="text-xs text-rose-700 font-medium leading-relaxed">{selectedNodeData.alert}</p>
                  </div>
                )}

                {selectedNodeData.tech && (
                  <div>
                    <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Stack / Tecnologias</h3>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedNodeData.tech.split(',').map((t: string) => (
                        <span key={t} className="px-2 py-1 bg-slate-100 text-slate-600 font-medium text-[11px] rounded border border-slate-200">
                          {t.trim()}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {selectedNodeData.repo && (
                  <div>
                    <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Arquivo ou Repositório Base</h3>
                    <code className="block bg-[#1e293b] text-blue-300 p-2.5 rounded-lg text-xs break-all font-mono border border-slate-700 shadow-inner">
                      {selectedNodeData.repo}
                    </code>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
