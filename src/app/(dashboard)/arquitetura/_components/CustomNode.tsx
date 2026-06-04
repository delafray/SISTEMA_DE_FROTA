import { Handle, Position } from '@xyflow/react';

export function CustomNode({ data }: any) {
  const isDebito = data.status === 'DÉBITO TÉCNICO';
  const isAtencao = data.status === 'ATENÇÃO';

  return (
    <div className={`relative px-4 py-3 shadow-md rounded-lg bg-white border-2 min-w-[170px] transition-all hover:shadow-lg ${
      isDebito ? 'border-rose-400 hover:border-rose-500' : isAtencao ? 'border-amber-400 hover:border-amber-500' : 'border-slate-200 hover:border-slate-300'
    }`}>
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
        <div>
          <div className="font-bold text-sm text-slate-800">{data.label}</div>
          {data.subline && <div className="text-[11px] text-slate-500 font-medium">{data.subline}</div>}
        </div>
      </div>
      <Handle type="target" position={Position.Top} className="w-2 h-2 bg-slate-400" />
      <Handle type="source" position={Position.Bottom} className="w-2 h-2 bg-slate-400" />
    </div>
  );
}
