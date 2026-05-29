'use client';

/**
 * Tela do gestor — Roteirização.
 *
 * - Lista as rotas otimizadas mais recentes da empresa
 * - Formulario "Otimizar nova rota" (escolhe motorista + origem + data,
 *   dispara POST /api/routing/otimizar)
 * - Cada rota tem botoes pra abrir no Ajuste-Rota (mobile) ou ver no Google Maps
 *
 * Referencia: PLANO_ROTEIRIZACAO.md secao 3.11.
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  PageHeader,
  DataTable,
  Th,
  Td,
  Tr,
  Badge,
  Btn,
  EmptyState,
  inputStyle,
  selectStyle,
} from '@/components/ui/ds';
import { googleMapsMultiStop } from '@/lib/routing/deepLinks';

interface Motorista {
  id: string;
  nome: string;
}

interface RotaListItem {
  id: string;
  motorista_id: string;
  empresa_id: string;
  data: string;
  distancia_total_km: number | null;
  tempo_total_min: number | null;
  status: string;
  otimizada_em: string | null;
  criada_em: string;
  qtd_paradas: number;
}

interface OtimizarResponse {
  rota_id: string;
  paradas: Array<{
    nota_id: string;
    ordem: number;
    latitude: number;
    longitude: number;
  }>;
  distancia_total_km: number;
  tempo_total_min: number;
  nao_atendidas: string[];
}

export default function RoteirizacaoPage(): React.ReactElement {
  const router = useRouter();
  const supabase = createClient();

  const [empresaId, setEmpresaId] = useState<string>('');
  const [motoristas, setMotoristas] = useState<Motorista[]>([]);
  const [rotas, setRotas] = useState<RotaListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [otimizando, setOtimizando] = useState(false);

  // Form state
  const [motoristaIdSel, setMotoristaIdSel] = useState<string>('');
  const [origemLat, setOrigemLat] = useState<string>('');
  const [origemLng, setOrigemLng] = useState<string>('');
  const [resultado, setResultado] = useState<OtimizarResponse | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  // Carregar empresa do usuario + motoristas + rotas
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      const { data: ue } = await supabase
        .from('usuario_empresas')
        .select('empresa_id')
        .eq('usuario_id', user.id)
        .single();

      const empId = ue?.empresa_id as string | undefined;
      if (!empId) {
        setErro('Empresa nao encontrada pra este usuario.');
        setLoading(false);
        return;
      }
      setEmpresaId(empId);

      const [motoristasRes, rotasRes] = await Promise.all([
        supabase
          .from('motoristas')
          .select('id, nome')
          .eq('empresa_id', empId)
          .eq('ativo', true)
          .order('nome'),
        fetch(`/api/routing/rotas?empresa_id=${empId}&limite=20`).then((r) => r.json()),
      ]);

      setMotoristas((motoristasRes.data ?? []) as Motorista[]);
      setRotas((rotasRes.rotas ?? []) as RotaListItem[]);
      setLoading(false);
    })();
  }, [router, supabase]);

  const handleUsarMinhaLocalizacao = useCallback(() => {
    if (!navigator.geolocation) {
      setErro('Geolocalizacao nao disponivel neste navegador.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setOrigemLat(pos.coords.latitude.toFixed(6));
        setOrigemLng(pos.coords.longitude.toFixed(6));
        setErro(null);
      },
      (err) => setErro(`Falha ao pegar localizacao: ${err.message}`),
      { enableHighAccuracy: false, timeout: 10000 }
    );
  }, []);

  const handleOtimizar = useCallback(async () => {
    setErro(null);
    setResultado(null);

    const lat = parseFloat(origemLat);
    const lng = parseFloat(origemLng);

    if (!motoristaIdSel) {
      setErro('Selecione um motorista.');
      return;
    }
    if (isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) {
      setErro('Informe origem (lat e lng validos).');
      return;
    }

    setOtimizando(true);
    try {
      const res = await fetch('/api/routing/otimizar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          motorista_id: motoristaIdSel,
          empresa_id: empresaId,
          origem: { lat, lng },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErro(`Erro: ${data.error ?? res.status} ${data.detail ? `(${data.detail})` : ''}`);
      } else {
        setResultado(data as OtimizarResponse);
        // Recarrega lista de rotas
        const rotasRes = await fetch(`/api/routing/rotas?empresa_id=${empresaId}&limite=20`).then((r) => r.json());
        setRotas((rotasRes.rotas ?? []) as RotaListItem[]);
      }
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setOtimizando(false);
    }
  }, [empresaId, motoristaIdSel, origemLat, origemLng]);

  const motoristaNome = useCallback(
    (id: string) => motoristas.find((m) => m.id === id)?.nome ?? id.slice(0, 8),
    [motoristas]
  );

  if (loading) return <div style={{ padding: 20 }}>Carregando...</div>;

  return (
    <div style={{ padding: '20px', maxWidth: 1200, margin: '0 auto' }}>
      <PageHeader title="Roteirização" subtitle="Otimize rotas e veja o histórico." />

      {/* FORM: Otimizar nova rota */}
      <section
        style={{
          marginBottom: 24,
          padding: 16,
          background: '#fff',
          border: '1px solid #e2e8f0',
          borderRadius: 8,
        }}
      >
        <h2 style={{ fontSize: 16, fontWeight: 700, marginTop: 0, marginBottom: 12 }}>
          🚀 Otimizar nova rota
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label style={labelStyle}>Motorista *</label>
            <select
              value={motoristaIdSel}
              onChange={(e) => setMotoristaIdSel(e.target.value)}
              style={selectStyle}
            >
              <option value="">Selecione...</option>
              {motoristas.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Origem — Latitude *</label>
            <input
              type="number"
              step="0.000001"
              value={origemLat}
              onChange={(e) => setOrigemLat(e.target.value)}
              placeholder="-23.5505"
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Origem — Longitude *</label>
            <input
              type="number"
              step="0.000001"
              value={origemLng}
              onChange={(e) => setOrigemLng(e.target.value)}
              placeholder="-46.6333"
              style={inputStyle}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <Btn variant="outline" onClick={handleUsarMinhaLocalizacao}>
            📍 Usar minha localização
          </Btn>
          <Btn variant="primary" onClick={handleOtimizar} disabled={otimizando}>
            {otimizando ? 'Otimizando…' : '🎯 Otimizar agora'}
          </Btn>
        </div>

        {erro && (
          <div role="alert" style={erroStyle}>
            {erro}
          </div>
        )}

        {resultado && (
          <div style={resultadoStyle}>
            ✅ <strong>Rota otimizada!</strong>
            <ul style={{ margin: '8px 0', paddingLeft: 20 }}>
              <li>{resultado.paradas.length} paradas em sequencia</li>
              <li>{resultado.distancia_total_km.toFixed(1)} km totais</li>
              <li>≈ {resultado.tempo_total_min} min de direção</li>
              {resultado.nao_atendidas.length > 0 && (
                <li style={{ color: '#dc2626' }}>
                  ⚠️ {resultado.nao_atendidas.length} parada(s) nao atendida(s) (falha geocoding ou VROOM)
                </li>
              )}
            </ul>
            <div style={{ display: 'flex', gap: 8 }}>
              <a
                href={`/mobile/ajuste-rota?rota_id=${resultado.rota_id}`}
                style={{ ...btnLinkStyle, background: '#2563eb' }}
                target="_blank"
                rel="noreferrer"
              >
                📱 Ajustar paradas
              </a>
              <a
                href={googleMapsMultiStop(
                  resultado.paradas.map((p) => ({ lat: p.latitude, lng: p.longitude }))
                )}
                target="_blank"
                rel="noreferrer"
                style={{ ...btnLinkStyle, background: '#16a34a' }}
              >
                🗺️ Abrir no Google Maps
              </a>
            </div>
          </div>
        )}
      </section>

      {/* Lista de rotas recentes */}
      <section>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>
          Rotas recentes ({rotas.length})
        </h2>

        {rotas.length === 0 ? (
          <EmptyState message="Nenhuma rota ainda. Crie a primeira otimizando uma rota acima." />
        ) : (
          <DataTable>
            <thead>
              <Tr>
                <Th>Data</Th>
                <Th>Motorista</Th>
                <Th>Paradas</Th>
                <Th>Km</Th>
                <Th>Tempo</Th>
                <Th>Status</Th>
                <Th>Ações</Th>
              </Tr>
            </thead>
            <tbody>
              {rotas.map((r) => (
                <Tr key={r.id}>
                  <Td>{r.data}</Td>
                  <Td>{motoristaNome(r.motorista_id)}</Td>
                  <Td>{r.qtd_paradas}</Td>
                  <Td>{r.distancia_total_km?.toFixed(1) ?? '—'} km</Td>
                  <Td>{r.tempo_total_min ?? '—'} min</Td>
                  <Td>
                    <Badge variant={r.status === 'concluida' ? 'success' : r.status === 'em_andamento' ? 'info' : 'default'}>
                      {r.status}
                    </Badge>
                  </Td>
                  <Td>
                    <a
                      href={`/mobile/ajuste-rota?rota_id=${r.id}`}
                      style={{ color: '#2563eb', fontSize: 13 }}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Ajustar →
                    </a>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </section>
    </div>
  );
}

// ─── ESTILOS ────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  color: '#475569',
  marginBottom: 4,
};

const erroStyle: React.CSSProperties = {
  padding: 10,
  background: '#fef2f2',
  color: '#991b1b',
  borderRadius: 6,
  fontSize: 14,
  marginTop: 8,
};

const resultadoStyle: React.CSSProperties = {
  padding: 12,
  background: '#f0fdf4',
  color: '#166534',
  borderRadius: 6,
  fontSize: 14,
  marginTop: 8,
};

const btnLinkStyle: React.CSSProperties = {
  padding: '8px 14px',
  color: '#fff',
  borderRadius: 6,
  textDecoration: 'none',
  fontSize: 13,
  fontWeight: 600,
};
