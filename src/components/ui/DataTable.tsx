import React from "react";
import { Search } from "lucide-react";

interface Column<T> {
  key: string;
  label: string;
  render?: (row: T) => React.ReactNode;
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  onRowClick?: (row: T) => void;
  searchPlaceholder?: string;
  searchTerm?: string;
  onSearchChange?: (val: string) => void;
  primaryAction?: React.ReactNode;
}

export function DataTable<T extends Record<string, unknown>>({
  data,
  columns,
  onRowClick,
  searchPlaceholder = "Buscar...",
  searchTerm,
  onSearchChange,
  primaryAction,
}: DataTableProps<T>) {
  return (
    <div className="flex flex-col gap-3 w-full">
      {/* Barra de Ferramentas (Toolbar) */}
      <div className="flex flex-col sm:flex-row gap-3 items-end sm:items-center justify-between">
        {onSearchChange && (
          <div className="w-full sm:w-[270px] shrink-0 relative">
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
              Buscar
            </label>
            <div className="relative">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full pl-8 pr-2.5 py-1.5 bg-[#0f172a] border border-slate-700 rounded-none text-[12px] text-white focus:outline-none focus:border-blue-500 transition-colors"
              />
              <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-slate-500" />
            </div>
          </div>
        )}
        {primaryAction && <div className="self-end ml-auto">{primaryAction}</div>}
      </div>

      {/* Tabela Densa */}
      <div className="w-full bg-[#0f172a] border border-slate-700 overflow-x-auto rounded-none">
        <table className="w-full text-[13px] text-left border-collapse whitespace-nowrap">
          <thead>
            <tr className="bg-slate-800 border-b border-slate-700">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="px-3 py-2 font-bold text-slate-300 uppercase tracking-wider text-[11px]"
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-3 py-12 text-center text-slate-500"
                >
                  Nenhum registro encontrado.
                </td>
              </tr>
            ) : (
              data.map((row, idx) => (
                <tr
                  key={idx}
                  onClick={() => onRowClick?.(row)}
                  className={`border-b border-slate-800 transition-colors 
                    ${idx % 2 === 1 ? "bg-slate-800/20" : ""} 
                    ${onRowClick ? "hover:bg-slate-800/60 cursor-pointer" : ""}
                  `}
                >
                  {columns.map((col) => (
                    <td key={col.key} className="px-3 py-1.5 text-slate-300">
                      {col.render ? col.render(row) : (row[col.key] as React.ReactNode) || "-"}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
        <div className="px-3 py-2 bg-slate-800/30 border-t border-slate-700 text-xs text-slate-500">
          {data.length} registro{data.length !== 1 ? "s" : ""}
        </div>
      </div>
    </div>
  );
}
