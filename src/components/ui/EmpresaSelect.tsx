"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { FormField, selectStyle } from "@/components/ui/ds";

type Empresa = { id: string; nome: string };

/**
 * Seletor de EMPRESA pros cadastros operacionais (veículo, motorista, frete…).
 * Carrega as empresas cadastradas e deixa escolher a qual o registro pertence.
 * Default = a primeira (quando há só uma, fica transparente). Substitui o antigo
 * auto-atribuir por usuario_empresas (que está vazio e quebrava o cadastro).
 */
export function EmpresaSelect({
  value, onChange, label = "Empresa *",
}: { value: string; onChange: (id: string) => void; label?: string }) {
  const [empresas, setEmpresas] = useState<Empresa[]>([]);

  useEffect(() => {
    const load = async () => {
      const sb = createClient();
      const { data } = await sb.from("empresas").select("id,nome_fantasia,razao_social").order("nome_fantasia");
      const lista: Empresa[] = (data ?? []).map((e) => ({ id: e.id, nome: e.nome_fantasia || e.razao_social || "(sem nome)" }));
      setEmpresas(lista);
      if (!value && lista.length) onChange(lista[0].id); // default = primeira empresa
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <FormField label={label}>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={selectStyle} required>
        {empresas.length === 0 && <option value="">(carregando…)</option>}
        {empresas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
      </select>
    </FormField>
  );
}
