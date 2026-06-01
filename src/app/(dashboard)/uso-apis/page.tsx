/**
 * Página /uso-apis — painel do gestor com o uso das APIs/serviços externos.
 *
 * Mostra, por serviço: % de uso (quando medível, maior primeiro), nome oficial,
 * apelido, descrição, e os links de COBRANÇA e USO/console lado a lado.
 * Server component — lê os números ao vivo do banco (service role).
 */

import { carregarLinhasUso, type StatusUso } from '@/lib/apis/usoApis';

export const dynamic = 'force-dynamic';

const COR: Record<StatusUso, { barra: string; texto: string; fundo: string }> = {
  ok:      { barra: '#16a34a', texto: '#166534', fundo: '#f0fdf4' },
  alerta:  { barra: '#f59e0b', texto: '#92400e', fundo: '#fffbeb' },
  critico: { barra: '#dc2626', texto: '#991b1b', fundo: '#fef2f2' },
  neutro:  { barra: '#cbd5e1', texto: '#475569', fundo: '#f8fafc' },
};

export default async function UsoApisPage() {
  const linhas = await carregarLinhasUso();

  return (
    <div style={{ padding: 24, maxWidth: 860, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>
        Uso de APIs
      </h1>
      <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>
        Quanto cada serviço pago está consumindo da cota grátis. O % é medido pelo
        próprio sistema (quando dá); para a fatura oficial, use o link de cobrança.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {linhas.map((api) => {
          const c = COR[api.status];
          return (
            <div
              key={api.id}
              style={{
                border: '1px solid #e2e8f0',
                borderRadius: 12,
                padding: 16,
                background: '#fff',
                display: 'flex',
                gap: 16,
                alignItems: 'flex-start',
              }}
            >
              {/* Coluna do % (ou traço) */}
              <div
                style={{
                  flexShrink: 0,
                  width: 72,
                  textAlign: 'center',
                  borderRadius: 10,
                  padding: '10px 6px',
                  background: c.fundo,
                }}
              >
                <div style={{ fontSize: 22, fontWeight: 800, color: c.texto, lineHeight: 1 }}>
                  {api.pct === null ? '—' : `${api.pct}%`}
                </div>
                {api.pct !== null && (
                  <div style={{ marginTop: 8, height: 5, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${api.pct}%`, height: '100%', background: c.barra }} />
                  </div>
                )}
              </div>

              {/* Conteúdo */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>
                  {api.nomeOficial}{' '}
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#2563eb' }}>· {api.apelido}</span>
                </div>
                <div style={{ fontSize: 13, color: '#475569', marginTop: 2 }}>{api.descricao}</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>
                  <strong style={{ color: c.texto }}>{api.usoLabel}</strong>
                  <span style={{ color: '#94a3b8' }}> · {api.cota}</span>
                  {api.reset && <span style={{ color: '#94a3b8' }}> · {api.reset}</span>}
                </div>

                {/* Links: cobrança + uso */}
                <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
                  {api.urlCobranca && (
                    <a
                      href={api.urlCobranca}
                      target="_blank"
                      rel="noreferrer"
                      style={{ fontSize: 13, fontWeight: 600, color: '#dc2626', textDecoration: 'none' }}
                    >
                      💳 Cobrança ↗
                    </a>
                  )}
                  {api.urlUso && (
                    <a
                      href={api.urlUso}
                      target="_blank"
                      rel="noreferrer"
                      style={{ fontSize: 13, fontWeight: 600, color: '#2563eb', textDecoration: 'none' }}
                    >
                      📊 Uso / console ↗
                    </a>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 20, lineHeight: 1.6 }}>
        ⚠️ O % vem dos contadores internos do sistema, não da fatura do provedor.
        Google Geocoding reseta dia 1º; Gemini é por dia; Deepgram é crédito único
        (veja o saldo real no console). Serviços sem % são grátis/self-hosted ou
        não medidos aqui — confira no painel de cada um.
      </p>
    </div>
  );
}
