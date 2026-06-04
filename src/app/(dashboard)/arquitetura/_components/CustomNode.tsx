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
      <Handle type="target" position={Position.Top} className="w-2 h-2 bg-slate-400" />
      <Handle type="source" position={Position.Bottom} className="w-2 h-2 bg-slate-400" />
    </div>
  );
}
