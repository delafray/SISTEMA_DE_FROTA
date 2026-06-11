import { Handle, Position } from '@xyflow/react';

// Status VIVO do bloco (vem do poll de /api/arquitetura/status na page):
// dot 'ok' (🟢 pulsando) | 'falha' (🔴) | 'parcial' (🟡) | undefined (sem check, ex: personas).
// texto = atividade de hoje ("32 msgs hoje") ou detalhe ("OSRM ✓ · VROOM ✗").
export type Vivo = { dot?: 'ok' | 'falha' | 'parcial'; texto?: string };

type DadosNo = {
  label: string;
  subline?: string;
  icon?: string;
  status?: string;
  hasFeatures?: boolean;
  vivo?: Vivo;
};

export function CustomNode({ data }: { data: DadosNo }) {
  const isDebito  = data.status === 'DÉBITO TÉCNICO';
  const isAtencao = data.status === 'ATENÇÃO';
  const hasFeatures = data.hasFeatures;
  const vivo: Vivo | undefined = data.vivo;
  const caiu = vivo?.dot === 'falha';

  return (
    <div className={`relative px-4 py-3 shadow-md rounded-lg bg-white border-2 min-w-[170px] transition-all hover:shadow-lg cursor-pointer ${
      caiu      ? 'border-rose-500  hover:border-rose-600 ring-2 ring-rose-200' :
      isDebito  ? 'border-rose-400  hover:border-rose-500'  :
      isAtencao ? 'border-amber-400 hover:border-amber-500' :
                  'border-slate-200 hover:border-slate-300'
    }`}>
      {/* luz de status VIVO (online/offline) */}
      {vivo?.dot && (
        <div
          className="absolute -top-2 -left-2 w-4 h-4 rounded-full border-2 border-white shadow-sm"
          title={vivo.dot === 'ok' ? 'Online' : vivo.dot === 'parcial' ? 'Parcial' : 'FORA DO AR'}
          style={{
            background: vivo.dot === 'ok' ? '#22c55e' : vivo.dot === 'parcial' ? '#f59e0b' : '#ef4444',
            animation: vivo.dot === 'falha' ? 'pulse 1s infinite' : undefined,
          }}
        />
      )}

      {/* badge de status do CÓDIGO (débito técnico/atenção) */}
      {isDebito && (
        <div className="absolute -top-2 -right-2 w-5 h-5 bg-rose-500 rounded-full border-2 border-white flex items-center justify-center shadow-sm" title="Débito Técnico">
          <span className="text-white text-[10px] font-bold">!</span>
        </div>
      )}
      {isAtencao && (
        <div className="absolute -top-2 -right-2 w-5 h-5 bg-amber-500 rounded-full border-2 border-white flex items-center justify-center shadow-sm" title="Atenção">
          <span className="text-white text-[10px] font-bold">?</span>
        </div>
      )}

      <div className="flex items-center gap-3">
        {data.icon && <div className="text-2xl">{data.icon}</div>}
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm text-slate-800">{data.label}</div>
          {data.subline && <div className="text-[11px] text-slate-500 font-medium">{data.subline}</div>}
        </div>
      </div>

      {/* atividade de hoje / detalhe do status vivo */}
      {vivo?.texto && (
        <div className={`mt-1.5 text-[11px] font-semibold ${caiu ? 'text-rose-600' : 'text-emerald-700'}`}>
          {vivo.texto}
        </div>
      )}

      {/* indicador "tem sub-componentes" */}
      {hasFeatures && (
        <div className="mt-2 pt-2 border-t border-slate-100 flex items-center gap-1 text-[10px] text-slate-400 font-medium">
          <span>🔍</span>
          <span>Clique para ver internos</span>
        </div>
      )}

      <Handle type="target" position={Position.Top}    className="w-2 h-2 bg-slate-400" />
      <Handle type="source" position={Position.Bottom} className="w-2 h-2 bg-slate-400" />
    </div>
  );
}
