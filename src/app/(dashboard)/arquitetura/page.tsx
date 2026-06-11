"use client";

import { useCallback, useEffect, useState } from 'react';
import {
  ReactFlow, MiniMap, Controls, Background,
  useNodesState, useEdgesState, addEdge, BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { CustomNode } from './_components/CustomNode';

// ─── Types ────────────────────────────────────────────────────────────────────

type Role   = 'motorista' | 'gestor' | 'admin' | 'sistema';
type Status = 'OK' | 'ATENÇÃO' | 'DÉBITO TÉCNICO';

interface Feature {
  id: string;
  icon: string;
  label: string;
  desc: string;
  repo?: string;
  permissions: {
    leitura: string[];
    escrita: string[];
    roles: Role[];
  };
}

interface ServiceData {
  id: string;
  label: string;
  subline: string;
  icon: string;
  desc: string;
  status: Status;
  alert?: string;
  tech?: string;
  repo?: string;
  features: Feature[];
}

// ─── Dados do sistema (fonte da verdade) ──────────────────────────────────────

const SYSTEM: Record<string, ServiceData> = {
  mot: {
    id: 'mot', label: 'Motorista', subline: 'WhatsApp / App', icon: '📱',
    desc: 'Ator principal do sistema de campo. Interage via WhatsApp para avisos rápidos e pelo App PWA para capturar NFs e confirmar rotas.',
    status: 'OK', tech: 'WhatsApp, PWA', features: [],
  },
  ges: {
    id: 'ges', label: 'Gestor', subline: 'Painel Web', icon: '💻',
    desc: 'Acessa o Dashboard para acompanhar relatórios, acertos financeiros e manutenções em tempo real.',
    status: 'OK', tech: 'Browser', features: [],
  },
  app: {
    id: 'app', label: 'App Mobile', subline: 'Next.js PWA', icon: '📲',
    desc: 'Tela mobile do motorista. Captura NFs, confirma rotas e registra ocorrências no campo.',
    status: 'OK',
    alert: undefined, // débito resolvido 11/06/2026: tela de Rota refatorada (6 custom hooks extraídos: âncora, despachos, carregamento inicial, sync em rota, workers de captura, voltar hardware)
    tech: 'React, IndexedDB, Dexie', repo: 'src/app/mobile/',
    features: [
      {
        id: 'rota', icon: '📍', label: 'Tela de Rota',
        desc: 'Mapa interativo com paradas do pedido do dia. Motorista confirma entregas, registra eventos e atualiza o KM.',
        repo: 'src/app/mobile/rota/page.tsx',
        permissions: {
          leitura: ['pedidos', 'paradas', 'rotas_otimizadas', 'veiculos', 'motoristas'],
          escrita: ['notas_capturadas', 'km_logs'],
          roles: ['motorista'],
        },
      },
      {
        id: 'captura-notas', icon: '📄', label: 'Captura de Notas Fiscais',
        desc: 'Captura NFs por câmera ou digitação manual. Vincula à rota/pedido do dia.',
        repo: 'src/app/mobile/captura-notas/page.tsx',
        permissions: {
          leitura: ['pedidos'],
          escrita: ['notas_capturadas'],
          roles: ['motorista'],
        },
      },
      {
        id: 'ajuste-rota', icon: '🔄', label: 'Ajuste de Rota',
        desc: 'Permite ao motorista reordenar paradas no campo quando necessário.',
        repo: 'src/app/mobile/ajuste-rota/page.tsx',
        permissions: {
          leitura: ['paradas', 'rotas_otimizadas'],
          escrita: ['paradas'],
          roles: ['motorista'],
        },
      },
      {
        id: 'checklist', icon: '✅', label: 'Checklist Diário',
        desc: 'Inspeção diária do veículo antes de sair. Registra condições e avarias visíveis.',
        repo: 'src/app/mobile/checklist/',
        permissions: {
          leitura: ['veiculos'],
          escrita: ['checklists_diarios'],
          roles: ['motorista'],
        },
      },
    ],
  },
  dash: {
    id: 'dash', label: 'Dashboard', subline: 'Next.js', icon: '📊',
    desc: 'Painel de administração da frota para gestores e admins.',
    status: 'DÉBITO TÉCNICO',
    alert: 'AcertoMensalTab e outras abas misturam lógica de banco com renderização visual. Precisa separar em hooks dedicados.',
    tech: 'React, Tailwind, Supabase Client', repo: 'src/app/(dashboard)/',
    features: [
      {
        id: 'fluxo-caixa', icon: '💰', label: 'Fluxo de Caixa',
        desc: 'Visão financeira: adiantamentos, despesas e acertos mensais dos motoristas.',
        repo: 'src/app/(dashboard)/fluxo-caixa/',
        permissions: {
          leitura: ['adiantamentos', 'despesas_veiculo', 'acertos_motorista', 'acerto_ajustes', 'recorrencias_financeiras', 'motoristas'],
          escrita: ['adiantamentos', 'acertos_motorista', 'acerto_ajustes', 'recorrencias_financeiras'],
          roles: ['gestor', 'admin'],
        },
      },
      {
        id: 'motoristas-dash', icon: '👤', label: 'Motoristas',
        desc: 'CRUD de motoristas. Vincula motorista ao usuário Supabase Auth e à empresa.',
        repo: 'src/app/(dashboard)/motoristas/',
        permissions: {
          leitura: ['motoristas', 'perfis', 'usuario_empresas'],
          escrita: ['motoristas', 'perfis'],
          roles: ['admin'],
        },
      },
      {
        id: 'veiculos-dash', icon: '🚛', label: 'Veículos',
        desc: 'CRUD de veículos. Placa, apelido, KM atual e vínculo com motorista.',
        repo: 'src/app/(dashboard)/veiculos/',
        permissions: {
          leitura: ['veiculos', 'motorista_veiculo', 'km_logs'],
          escrita: ['veiculos', 'motorista_veiculo'],
          roles: ['admin'],
        },
      },
      {
        id: 'clientes-dash', icon: '🏪', label: 'Clientes',
        desc: 'Cadastro de clientes e contatos. Base para pedidos e entregas.',
        repo: 'src/app/(dashboard)/clientes/',
        permissions: {
          leitura: ['clientes', 'cliente_contatos', 'cliente_preferencias'],
          escrita: ['clientes', 'cliente_contatos'],
          roles: ['gestor', 'admin'],
        },
      },
      {
        id: 'manutencoes-dash', icon: '🔧', label: 'Manutenções',
        desc: 'Agenda e histórico de manutenções. Controla próximas revisões por KM ou data.',
        repo: 'src/app/(dashboard)/manutencoes/',
        permissions: {
          leitura: ['manutencoes', 'avarias', 'alertas', 'tipos_manutencao', 'plano_manutencao_veiculo', 'proxima_manutencao_veiculo', 'veiculos'],
          escrita: ['manutencoes', 'avarias', 'tipos_manutencao', 'plano_manutencao_veiculo'],
          roles: ['gestor', 'admin'],
        },
      },
      {
        id: 'relatorios-dash', icon: '📈', label: 'Relatórios / KPIs',
        desc: 'Relatórios mensais por empresa, motorista e veículo. Lê views materializadas.',
        repo: 'src/app/(dashboard)/relatorios/',
        permissions: {
          leitura: ['kpi_mensal_empresa', 'kpi_mensal_motorista', 'kpi_mensal_veiculo', 'veiculos_resultado_periodo', 'pedidos_com_resultado', 'status_operacional_veiculos'],
          escrita: [],
          roles: ['gestor', 'admin'],
        },
      },
      {
        id: 'empresas-dash', icon: '🏢', label: 'Empresas / Usuários',
        desc: 'Multi-tenant: cadastro de empresas e vínculo de usuários a empresas.',
        repo: 'src/app/(dashboard)/empresas/',
        permissions: {
          leitura: ['empresas', 'usuario_empresas', 'perfis'],
          escrita: ['empresas', 'usuario_empresas'],
          roles: ['admin'],
        },
      },
      {
        id: 'pedidos-dash', icon: '📦', label: 'Pedidos / Entregas',
        desc: 'Criação e acompanhamento de pedidos. Vincula pedido → motorista → veículo → paradas.',
        repo: 'src/app/(dashboard)/pedidos/',
        permissions: {
          leitura: ['pedidos', 'entregas', 'paradas', 'motoristas', 'veiculos', 'clientes'],
          escrita: ['pedidos', 'entregas'],
          roles: ['gestor', 'admin'],
        },
      },
    ],
  },
  router: {
    id: 'router', label: 'Bot WhatsApp', subline: 'Message Router', icon: '🔀',
    desc: 'Recebe webhooks da Evolution, identifica o motorista, transcreve áudio e chama Gemini com as tools disponíveis.',
    status: 'DÉBITO TÉCNICO',
    alert: '"God Object" de 30KB. Todo fluxo do Zap passa por aqui. Precisa ser desmembrado em sub-roteadores por domínio.',
    tech: 'Node.js, Webhooks, Gemini, Deepgram', repo: 'src/lib/whatsapp/messageRouter.ts',
    features: [
      {
        id: 'identificar-motorista', icon: '🔐', label: 'Identificar Motorista',
        desc: 'Recebe telefone do WhatsApp, busca sessão ativa e vincula ao motorista + empresa. Cria sessão se não existir.',
        repo: 'src/lib/whatsapp/messageRouter.ts',
        permissions: {
          leitura: ['sessoes_whatsapp', 'motoristas', 'empresas'],
          escrita: ['sessoes_whatsapp', 'whatsapp_historico'],
          roles: ['sistema'],
        },
      },
      {
        id: 'tool-criar-lembrete', icon: '📌', label: 'Tool: criar_lembrete',
        desc: 'ÚNICA tool da IA (virgem). Toda mensagem vira uma anotação no painel (tabela lembretes), sem regra.',
        repo: 'src/lib/ai/tools/frotaTools.ts',
        permissions: {
          leitura: [],
          escrita: ['lembretes'],
          roles: ['sistema'],
        },
      },
      {
        id: 'historico-chat', icon: '💬', label: 'Histórico de Chat',
        desc: 'Persiste cada mensagem (role: user e model) para manter contexto da conversa entre sessões.',
        repo: 'src/lib/whatsapp/messageRouter.ts',
        permissions: {
          leitura: ['whatsapp_historico'],
          escrita: ['whatsapp_historico'],
          roles: ['sistema'],
        },
      },
    ],
  },
  api: {
    id: 'api', label: 'API Otimização', subline: 'Node.js', icon: '⚙️',
    desc: 'Geocoda endereços e otimiza rotas chamando OSRM + VROOM na Oracle VM.',
    status: 'OK', tech: 'Next.js API Routes, Fetch', repo: 'src/app/api/routing/',
    features: [
      {
        id: 'geocodar', icon: '📍', label: 'Geocoding',
        desc: 'Converte endereço em coordenadas lat/lng. Usa cache em banco para economizar quota da API externa.',
        repo: 'src/app/api/routing/geocodar/route.ts',
        permissions: {
          leitura: ['geocode_cache', 'cep_cache', 'coordenadas_aprendidas'],
          escrita: ['geocode_cache', 'geocode_uso'],
          roles: ['sistema'],
        },
      },
      {
        id: 'otimizar', icon: '🛣️', label: 'Otimizar Rota',
        desc: 'Envia matriz de distâncias ao VROOM na Oracle VM. Salva rota otimizada e as paradas no banco.',
        repo: 'src/app/api/routing/otimizar/route.ts',
        permissions: {
          leitura: ['geocode_cache', 'pedidos'],
          escrita: ['rotas_otimizadas', 'paradas'],
          roles: ['sistema'],
        },
      },
      {
        id: 'validar-endereco', icon: '✅', label: 'Validar Endereço',
        desc: 'Normaliza endereços e aprende coordenadas para reutilizar em rotas futuras.',
        repo: 'src/app/api/routing/validar-endereco/route.ts',
        permissions: {
          leitura: ['geocode_cache', 'cep_cache'],
          escrita: ['coordenadas_aprendidas', 'endereco_validacao_cache'],
          roles: ['sistema'],
        },
      },
    ],
  },
  evo: {
    id: 'evo', label: 'Evolution API', subline: 'WhatsApp v2.3.7', icon: '💬',
    desc: 'Gateway open-source de conexão com WhatsApp via QR Code. Roda na Oracle Cloud VM. Não acessa o banco diretamente.',
    status: 'OK', tech: 'Docker, Node.js, Baileys', repo: '/home/ubuntu/evolution/ (Oracle VM)',
    features: [
      {
        id: 'evo-receive', icon: '📥', label: 'Receber Mensagens',
        desc: 'Dispara webhook MESSAGES_UPSERT para /api/whatsapp/webhook na Vercel. Todas as mensagens (texto e áudio) passam aqui.',
        permissions: { leitura: [], escrita: [], roles: ['sistema'] },
      },
      {
        id: 'evo-send', icon: '📤', label: 'Enviar Mensagens',
        desc: 'Recebe chamada da Vercel (POST /message/sendText) e entrega ao WhatsApp do motorista.',
        permissions: { leitura: [], escrita: [], roles: ['sistema'] },
      },
      {
        id: 'evo-audio', icon: '🎤', label: 'Download de Áudio',
        desc: 'Fornece URL temporária para baixar áudios encriptados. Message Router faz o download e repassa ao Deepgram.',
        permissions: { leitura: [], escrita: [], roles: ['sistema'] },
      },
    ],
  },
  osrm: {
    id: 'osrm', label: 'OSRM / VROOM', subline: 'Oracle Cloud VM', icon: '🗺️',
    desc: 'Motor C++ de roteirização open-source. Mesma VM da Evolution API. Não acessa o banco — só recebe e devolve matrizes de coordenadas.',
    status: 'OK', tech: 'Docker Compose, OSRM, VROOM', repo: '/home/ubuntu/ (Oracle VM)',
    features: [
      {
        id: 'osrm-matrix', icon: '📐', label: 'OSRM: Matriz de Distâncias',
        desc: 'Recebe lista de coordenadas, calcula tempos e distâncias entre todos os pares. Porta 5000.',
        permissions: { leitura: [], escrita: [], roles: ['sistema'] },
      },
      {
        id: 'vroom-optimize', icon: '🔢', label: 'VROOM: Otimização',
        desc: 'Resolve o problema do caixeiro-viajante. Retorna a sequência ótima de paradas. Porta 3000.',
        permissions: { leitura: [], escrita: [], roles: ['sistema'] },
      },
    ],
  },
  db: {
    id: 'db', label: 'Supabase', subline: 'PostgreSQL', icon: '🗄️',
    desc: 'Banco relacional em nuvem com Auth, Row Level Security e Triggers. 47 tabelas.',
    status: 'ATENÇÃO',
    alert: 'notas_capturadas e paradas ainda não vinculadas ao cliente_id. Bloqueará relatórios gerenciais complexos no pós-MVP.',
    tech: 'PostgreSQL 17, RLS, Triggers, Views', repo: 'src/lib/supabase/',
    features: [
      {
        id: 'db-auth', icon: '🔐', label: 'Autenticação (Auth)',
        desc: 'Supabase Auth gerencia login/logout. Vínculo: auth.users → perfis → usuario_empresas → empresa.',
        permissions: {
          leitura: ['perfis', 'usuario_empresas'],
          escrita: ['perfis'],
          roles: ['sistema'],
        },
      },
      {
        id: 'db-rls', icon: '🛡️', label: 'Row Level Security',
        desc: 'Toda tabela tem policy de isolamento por empresa_id. Motorista A nunca vê dados da empresa B.',
        permissions: { leitura: [], escrita: [], roles: ['sistema'] },
      },
      {
        id: 'db-triggers', icon: '⚡', label: 'Trigger: propagar_km_para_veiculo',
        desc: 'Quando km_logs recebe INSERT com confirmado=true e correcao=false, atualiza veiculos.km_atual automaticamente.',
        permissions: {
          leitura: ['km_logs'],
          escrita: ['veiculos'],
          roles: ['sistema'],
        },
      },
      {
        id: 'db-motoristas', icon: '👤', label: 'motoristas',
        desc: 'Tabela central dos motoristas. Ligada a: veiculos (N:N via motorista_veiculo), pedidos, km_logs, adiantamentos, acertos e muito mais.',
        permissions: {
          leitura: ['motorista_veiculo', 'pedidos', 'km_logs', 'adiantamentos'],
          escrita: [],
          roles: ['sistema'],
        },
      },
      {
        id: 'db-veiculos', icon: '🚛', label: 'veiculos + km_logs',
        desc: 'Tabela veiculos tem km_atual atualizado por trigger via km_logs. Relacionamentos: motorista_veiculo, pedidos, manutencoes, abastecimentos.',
        permissions: {
          leitura: ['motorista_veiculo', 'pedidos', 'manutencoes', 'abastecimentos'],
          escrita: [],
          roles: ['sistema'],
        },
      },
    ],
  },
  ai: {
    id: 'ai', label: 'Gemini / Deepgram', subline: 'IA Services', icon: '🤖',
    desc: 'Deepgram transcreve áudio em texto. Gemini processa intenção e executa function calling (tools).',
    status: 'DÉBITO TÉCNICO',
    alert: 'Flows de Abastecimento, Despesa e Viagem sem cobertura de testes (0%). Risco de regressão.',
    tech: 'Google Vertex AI, Deepgram SDK', repo: 'src/lib/ai/',
    features: [
      {
        id: 'deepgram', icon: '🎤', label: 'Deepgram (Transcrição)',
        desc: 'Modelo Nova. Converte áudio do motorista em texto em ~1-2s. Resultado vai para o Gemini como mensagem de texto.',
        repo: 'src/lib/ai/deepgramClient.ts',
        permissions: { leitura: [], escrita: [], roles: ['sistema'] },
      },
      {
        id: 'gemini-client', icon: '🧠', label: 'Gemini (Intenção + Tools)',
        desc: 'Recebe texto + histórico do chat. Decide qual tool chamar. Chama. Formata resposta em linguagem natural.',
        repo: 'src/lib/ai/geminiClient.ts',
        permissions: {
          leitura: ['whatsapp_historico'],
          escrita: ['bot_metricas'],
          roles: ['sistema'],
        },
      },
    ],
  },
};

// ─── React Flow setup ─────────────────────────────────────────────────────────

const nodeTypes = { custom: CustomNode };

const INITIAL_NODES = [
  { id: 'mot',    type: 'custom', position: { x: 100, y: 50  }, data: { ...SYSTEM.mot,    hasFeatures: false } },
  { id: 'ges',    type: 'custom', position: { x: 560, y: 50  }, data: { ...SYSTEM.ges,    hasFeatures: false } },
  { id: 'app',    type: 'custom', position: { x: 100, y: 210 }, data: { ...SYSTEM.app,    hasFeatures: true  } },
  { id: 'dash',   type: 'custom', position: { x: 560, y: 210 }, data: { ...SYSTEM.dash,   hasFeatures: true  } },
  { id: 'api',    type: 'custom', position: { x: 100, y: 390 }, data: { ...SYSTEM.api,    hasFeatures: true  } },
  { id: 'router', type: 'custom', position: { x: 330, y: 390 }, data: { ...SYSTEM.router, hasFeatures: true  } },
  { id: 'evo',    type: 'custom', position: { x: 560, y: 390 }, data: { ...SYSTEM.evo,    hasFeatures: true  } },
  { id: 'osrm',   type: 'custom', position: { x: 100, y: 560 }, data: { ...SYSTEM.osrm,   hasFeatures: true  } },
  { id: 'db',     type: 'custom', position: { x: 330, y: 560 }, data: { ...SYSTEM.db,     hasFeatures: true  } },
  { id: 'ai',     type: 'custom', position: { x: 560, y: 560 }, data: { ...SYSTEM.ai,     hasFeatures: true  } },
];

const INITIAL_EDGES = [
  { id: 'e-mot-app',    source: 'mot',    target: 'app',    animated: true },
  { id: 'e-ges-dash',   source: 'ges',    target: 'dash',   animated: true },
  { id: 'e-app-api',    source: 'app',    target: 'api',    animated: true },
  { id: 'e-mot-evo',    source: 'mot',    target: 'evo',    animated: true },
  { id: 'e-api-osrm',   source: 'api',    target: 'osrm',   animated: true },
  { id: 'e-evo-router', source: 'evo',    target: 'router', animated: true },
  { id: 'e-router-ai',  source: 'router', target: 'ai',     animated: true },
  { id: 'e-router-db',  source: 'router', target: 'db',     animated: true },
  { id: 'e-dash-db',    source: 'dash',   target: 'db',     animated: true },
  { id: 'e-api-db',     source: 'api',    target: 'db',     animated: true },
];

// ─── Role badge ───────────────────────────────────────────────────────────────

const ROLE_STYLES: Record<Role, string> = {
  motorista: 'bg-green-100  text-green-700  border-green-200',
  gestor:    'bg-blue-100   text-blue-700   border-blue-200',
  admin:     'bg-purple-100 text-purple-700 border-purple-200',
  sistema:   'bg-slate-100  text-slate-600  border-slate-200',
};

const ROLE_EMOJI: Record<Role, string> = {
  motorista: '🚛',
  gestor:    '💼',
  admin:     '👑',
  sistema:   '⚙️',
};

// ─── Painel de detalhe da feature ────────────────────────────────────────────

function FeaturePanel({ feature, onClose }: { feature: Feature; onClose: () => void }) {
  const hasRead  = feature.permissions.leitura.length > 0;
  const hasWrite = feature.permissions.escrita.length > 0;
  const isExternal = !hasRead && !hasWrite;

  return (
    <div className="absolute top-0 right-0 h-full w-80 bg-white border-l border-slate-200 shadow-2xl z-20 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/50">
        <div className="flex items-center gap-3">
          <span className="text-3xl">{feature.icon}</span>
          <div>
            <h2 className="font-bold text-slate-800 text-base leading-tight">{feature.label}</h2>
            {feature.repo && <p className="text-[10px] text-slate-400 font-mono mt-0.5 truncate max-w-[180px]">{feature.repo}</p>}
          </div>
        </div>
        <button onClick={onClose} className="p-2 -mr-2 hover:bg-slate-200 rounded-full text-slate-400 hover:text-slate-600 transition-colors" aria-label="Fechar">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* Descrição */}
        <div>
          <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">O que faz?</h3>
          <p className="text-sm text-slate-700 leading-relaxed">{feature.desc}</p>
        </div>

        {/* Roles */}
        {feature.permissions.roles.length > 0 && (
          <div>
            <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">🔐 Quem acessa</h3>
            <div className="flex flex-wrap gap-1.5">
              {feature.permissions.roles.map(r => (
                <span key={r} className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold border ${ROLE_STYLES[r]}`}>
                  {ROLE_EMOJI[r]} {r}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Leitura */}
        {hasRead && (
          <div>
            <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">📖 Lê do banco</h3>
            <div className="flex flex-wrap gap-1.5">
              {feature.permissions.leitura.map(t => (
                <span key={t} className="px-2 py-1 bg-blue-50 text-blue-700 font-mono text-[11px] rounded border border-blue-200 font-medium">
                  {t}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Escrita */}
        {hasWrite && (
          <div>
            <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">✏️ Escreve no banco</h3>
            <div className="flex flex-wrap gap-1.5">
              {feature.permissions.escrita.map(t => (
                <span key={t} className="px-2 py-1 bg-orange-50 text-orange-700 font-mono text-[11px] rounded border border-orange-200 font-medium">
                  {t}
                </span>
              ))}
            </div>
          </div>
        )}

        {isExternal && (
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
            <p className="text-xs text-slate-500">Serviço externo — não acessa o banco diretamente. Comunicação via HTTP/API.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Nível 2: Vista interna de um serviço ────────────────────────────────────

function ServiceDetailView({ service, onBack }: { service: ServiceData; onBack: () => void }) {
  const [selectedFeature, setSelectedFeature] = useState<Feature | null>(null);

  const statusColor =
    service.status === 'OK'              ? 'bg-emerald-100 text-emerald-700' :
    service.status === 'ATENÇÃO'         ? 'bg-amber-100   text-amber-700'   :
                                           'bg-rose-100    text-rose-700';

  return (
    <div className="flex flex-col h-full relative">
      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-4 border-b border-slate-200 bg-white shrink-0">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 font-medium transition-colors group"
        >
          <svg className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Visão geral
        </button>
        <div className="w-px h-5 bg-slate-200" />
        <span className="text-xl">{service.icon}</span>
        <div>
          <h2 className="font-bold text-slate-800 text-base leading-tight">{service.label}</h2>
          <p className="text-[11px] text-slate-500">{service.subline}</p>
        </div>
        <span className={`ml-auto px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wide ${statusColor}`}>
          {service.status}
        </span>
      </div>

      {/* Conteúdo */}
      <div className="flex-1 overflow-y-auto p-6 relative">
        {/* Descrição + alerta do serviço */}
        <p className="text-sm text-slate-600 mb-4 leading-relaxed">{service.desc}</p>
        {service.alert && (
          <div className="mb-6 bg-rose-50 border border-rose-200 rounded-lg p-3">
            <p className="text-xs font-semibold text-rose-700">⚠️ {service.alert}</p>
          </div>
        )}

        {/* Sub-componentes */}
        {service.features.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <div className="text-4xl mb-3">👤</div>
            <p className="text-sm font-medium">Ator humano — não tem sub-componentes técnicos.</p>
          </div>
        ) : (
          <>
            <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-3">
              Componentes internos — clique para ver permissões
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {service.features.map(f => {
                const hasWrite = f.permissions.escrita.length > 0;
                const hasRead  = f.permissions.leitura.length > 0;
                const isSelected = selectedFeature?.id === f.id;

                return (
                  <button
                    key={f.id}
                    onClick={() => setSelectedFeature(isSelected ? null : f)}
                    className={`text-left p-4 rounded-xl border-2 transition-all hover:shadow-md ${
                      isSelected
                        ? 'border-indigo-400 bg-indigo-50 shadow-md'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-xl shrink-0 mt-0.5">{f.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm text-slate-800 leading-tight">{f.label}</div>
                        <div className="text-[11px] text-slate-500 mt-1 line-clamp-2">{f.desc}</div>
                        {/* Mini badges de tabelas */}
                        <div className="flex flex-wrap gap-1 mt-2">
                          {hasRead && f.permissions.leitura.slice(0, 3).map(t => (
                            <span key={t} className="px-1.5 py-0.5 bg-blue-50 text-blue-600 text-[9px] font-mono rounded border border-blue-100">{t}</span>
                          ))}
                          {f.permissions.leitura.length > 3 && (
                            <span className="px-1.5 py-0.5 bg-blue-50 text-blue-500 text-[9px] rounded border border-blue-100">+{f.permissions.leitura.length - 3}</span>
                          )}
                          {hasWrite && f.permissions.escrita.slice(0, 2).map(t => (
                            <span key={t} className="px-1.5 py-0.5 bg-orange-50 text-orange-600 text-[9px] font-mono rounded border border-orange-100">{t}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Painel de detalhe da feature */}
      <div className={`absolute top-0 right-0 h-full w-80 transform transition-transform duration-300 ease-in-out ${selectedFeature ? 'translate-x-0' : 'translate-x-full'}`}>
        {selectedFeature && (
          <FeaturePanel feature={selectedFeature} onClose={() => setSelectedFeature(null)} />
        )}
      </div>
    </div>
  );
}

// ─── Painel de info do serviço (nível 1) ─────────────────────────────────────

function ServiceInfoPanel({ data, onDrillDown, onClose }: { data: ServiceData; onDrillDown: () => void; onClose: () => void }) {
  const statusColor =
    data.status === 'OK'      ? 'bg-emerald-100 text-emerald-700' :
    data.status === 'ATENÇÃO' ? 'bg-amber-100   text-amber-700'   :
                                 'bg-rose-100    text-rose-700';

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50/50">
        <div className="flex items-center gap-3">
          <span className="text-3xl">{data.icon}</span>
          <div>
            <h2 className="font-bold text-slate-800 text-lg leading-tight">{data.label}</h2>
            <p className="text-xs text-slate-500 font-medium">{data.subline}</p>
          </div>
        </div>
        <button onClick={onClose} className="p-2 -mr-2 hover:bg-slate-200 rounded-full text-slate-400 hover:text-slate-600 transition-colors" aria-label="Fechar painel">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        <span className={`inline-flex px-2.5 py-1 text-xs font-bold rounded-md uppercase tracking-wide ${statusColor}`}>{data.status}</span>

        <div>
          <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">O que faz?</h3>
          <p className="text-sm text-slate-700 leading-relaxed">{data.desc}</p>
        </div>

        {data.alert && (
          <div className="bg-rose-50 border border-rose-200 rounded-lg p-3">
            <h3 className="text-[11px] font-bold text-rose-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <span>⚠️</span> Diagnóstico do Arquiteto
            </h3>
            <p className="text-xs text-rose-700 font-medium leading-relaxed">{data.alert}</p>
          </div>
        )}

        {data.tech && (
          <div>
            <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Stack / Tecnologias</h3>
            <div className="flex flex-wrap gap-1.5">
              {data.tech.split(',').map(t => (
                <span key={t} className="px-2 py-1 bg-slate-100 text-slate-600 font-medium text-[11px] rounded border border-slate-200">{t.trim()}</span>
              ))}
            </div>
          </div>
        )}

        {data.repo && (
          <div>
            <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Arquivo / Repositório</h3>
            <code className="block bg-[#1e293b] text-blue-300 p-2.5 rounded-lg text-xs break-all font-mono border border-slate-700">{data.repo}</code>
          </div>
        )}

        {data.features.length > 0 && (
          <button
            onClick={onDrillDown}
            className="w-full flex items-center justify-between px-4 py-3 bg-indigo-50 border border-indigo-200 rounded-xl text-indigo-700 font-semibold text-sm hover:bg-indigo-100 transition-colors group"
          >
            <span>🔍 Ver {data.features.length} componentes internos</span>
            <svg className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

// ─── Status VIVO: payload do /api/arquitetura/status ──────────────────────────

type PingInfo = { ok: boolean; ms: number | null } | null;
type StatusVivo = {
  verificado_em: string;
  servicos: { evo: PingInfo; osrm: PingInfo; vroom: PingInfo; db: PingInfo; gemini: PingInfo; deepgram: PingInfo };
  hoje: { msgs_bot: number; pedidos: number; entregas_concluidas: number; rotas: number; notas_capturadas: number; lembretes: number };
};

/** Combina 2 pings num dot só (ok/parcial/falha). null (sem chave) não derruba. */
function dotDuplo(a: PingInfo, b: PingInfo): 'ok' | 'falha' | 'parcial' {
  const oks = [a, b].filter((p) => p !== null).map((p) => p!.ok);
  if (oks.length === 0) return 'parcial';
  if (oks.every(Boolean)) return 'ok';
  if (oks.every((o) => !o)) return 'falha';
  return 'parcial';
}
const tick = (p: PingInfo, nome: string) => `${nome} ${p === null ? '—' : p.ok ? '✓' : '✗'}`;

/** Mapeia o payload pro `vivo` de cada nó do canvas. */
function vivoPorNo(s: StatusVivo): Record<string, { dot?: 'ok' | 'falha' | 'parcial'; texto?: string }> {
  const { servicos: sv, hoje } = s;
  return {
    // Vercel respondeu o fetch → App/Dashboard/API/Bot estão de pé por definição.
    app:    { dot: 'ok', texto: `${hoje.notas_capturadas} notas · ${hoje.rotas} rotas hoje` },
    dash:   { dot: 'ok', texto: `${hoje.pedidos} pedidos · ${hoje.lembretes} lembretes hoje` },
    api:    { dot: 'ok', texto: `${hoje.rotas} rotas otimizadas hoje` },
    router: { dot: 'ok', texto: `${hoje.msgs_bot} mensagens hoje` },
    evo:    { dot: sv.evo?.ok ? 'ok' : 'falha', texto: sv.evo?.ok ? `Conectado (${sv.evo.ms}ms)` : 'FORA DO AR — bot mudo!' },
    osrm:   { dot: dotDuplo(sv.osrm, sv.vroom), texto: `${tick(sv.osrm, 'OSRM')} · ${tick(sv.vroom, 'VROOM')}` },
    db:     { dot: sv.db?.ok ? 'ok' : 'falha', texto: sv.db?.ok ? `${hoje.pedidos} pedidos · ${hoje.entregas_concluidas} entregas hoje` : 'SEM RESPOSTA' },
    ai:     { dot: dotDuplo(sv.gemini, sv.deepgram), texto: `${tick(sv.gemini, 'Gemini')} · ${tick(sv.deepgram, 'Deepgram')}` },
  };
}

export default function ArquiteturaPage() {
  const [nodes, setNodes, onNodesChange] = useNodesState(INITIAL_NODES);
  const [edges, setEdges, onEdgesChange] = useEdgesState(INITIAL_EDGES);
  const [selectedService, setSelectedService] = useState<ServiceData | null>(null);
  const [drillDown, setDrillDown] = useState<ServiceData | null>(null);
  const [statusVivo, setStatusVivo] = useState<StatusVivo | null>(null);
  const [semConexao, setSemConexao] = useState(false);

  // Poll do status vivo (30s): pinta a luz 🟢/🔴 e a atividade do dia em cada nó.
  useEffect(() => {
    let cancelado = false;
    const checar = async () => {
      try {
        const res = await fetch('/api/arquitetura/status', { cache: 'no-store' });
        if (!res.ok) throw new Error(String(res.status));
        const data: StatusVivo = await res.json();
        if (cancelado) return;
        setStatusVivo(data);
        setSemConexao(false);
        const mapa = vivoPorNo(data);
        setNodes((nds) => nds.map((n) => (mapa[n.id] ? { ...n, data: { ...n.data, vivo: mapa[n.id] } } : n)));
      } catch {
        if (!cancelado) setSemConexao(true);
      }
    };
    checar();
    const intervalo = setInterval(checar, 30_000);
    return () => { cancelado = true; clearInterval(intervalo); };
  }, [setNodes]);

  const onConnect = useCallback(
    (params: any) => setEdges(eds => addEdge(params, eds)),
    [setEdges],
  );

  const onNodeClick = useCallback((_: any, node: any) => {
    const service = SYSTEM[node.id];
    if (service) {
      setSelectedService(service);
      setDrillDown(null);
    }
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedService(null);
    setDrillDown(null);
  }, []);

  return (
    <div className="w-full h-full min-h-[calc(100vh-64px)] p-6 bg-slate-50 flex flex-col overflow-hidden">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Canvas da Arquitetura</h1>
        <p className="text-slate-500 text-sm mt-1">
          Clique num bloco para ver detalhes. Clique em <strong>"Ver componentes internos"</strong> para ver quais tabelas cada parte do sistema acessa.
        </p>

        {/* ── Faixa de status vivo: o "bater o olho" ───────────────────────── */}
        {semConexao && (
          <div className="mt-3 px-4 py-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm font-semibold">
            📴 Sem conexão com o servidor — status ao vivo indisponível.
          </div>
        )}
        {statusVivo && (() => {
          const sv = statusVivo.servicos;
          const fora: string[] = [];
          if (sv.evo && !sv.evo.ok) fora.push('WhatsApp (Evolution)');
          if (sv.osrm && !sv.osrm.ok) fora.push('OSRM');
          if (sv.vroom && !sv.vroom.ok) fora.push('VROOM');
          if (sv.db && !sv.db.ok) fora.push('Banco (Supabase)');
          if (sv.gemini && !sv.gemini.ok) fora.push('Gemini');
          if (sv.deepgram && !sv.deepgram.ok) fora.push('Deepgram');
          const hora = new Date(statusVivo.verificado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
          return (
            <div className={`mt-3 px-4 py-2.5 rounded-lg border text-sm font-semibold flex flex-wrap items-center gap-x-4 gap-y-1 ${
              fora.length ? 'bg-rose-50 border-rose-200 text-rose-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'
            }`}>
              <span>{fora.length ? `🔴 FORA DO AR: ${fora.join(', ')}` : '🟢 Tudo no ar'}</span>
              <span className="text-slate-500 font-medium">
                Hoje: 💬 {statusVivo.hoje.msgs_bot} msgs · 📋 {statusVivo.hoje.pedidos} pedidos · 📦 {statusVivo.hoje.entregas_concluidas} entregas · 🛣️ {statusVivo.hoje.rotas} rotas
              </span>
              <span className="text-slate-400 font-normal text-xs">verificado {hora} · atualiza a cada 30s</span>
            </div>
          );
        })()}
      </div>

      <div className="w-full flex-1 min-h-[600px] border border-slate-200 rounded-xl bg-white shadow-sm relative overflow-hidden flex">

        {/* Nível 2: vista interna de um serviço (cobre o canvas inteiro) */}
        {drillDown && (
          <div className="absolute inset-0 z-30 bg-white">
            <ServiceDetailView service={drillDown} onBack={() => { setDrillDown(null); }} />
          </div>
        )}

        {/* Nível 1: React Flow canvas */}
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

        {/* Painel lateral de info do serviço (nível 1) */}
        <div
          className={`absolute top-0 right-0 h-full w-80 bg-white border-l border-slate-200 shadow-2xl transform transition-transform duration-300 ease-in-out z-10 ${selectedService && !drillDown ? 'translate-x-0' : 'translate-x-full'}`}
          data-testid="side-panel"
        >
          {selectedService && !drillDown && (
            <ServiceInfoPanel
              data={selectedService}
              onDrillDown={() => setDrillDown(selectedService)}
              onClose={() => setSelectedService(null)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
