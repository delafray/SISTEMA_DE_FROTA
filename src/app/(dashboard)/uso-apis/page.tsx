/**
 * Página /uso-apis — painel do gestor com o uso das APIs/serviços externos.
 *
 * Mostra, por serviço: % de uso (quando medível, maior primeiro), nome oficial,
 * apelido, descrição, e os links de COBRANÇA e USO/console lado a lado.
 * Server component — lê os números ao vivo do banco (service role).
 */

import { redirect } from 'next/navigation';
import { carregarLinhasUso, type StatusUso } from '@/lib/apis/usoApis';
import { createClient } from '@/lib/supabase/server';
import { lerCadastros } from '@/lib/apis/apiCadastros';
import { CadastroApiEditor } from './CadastroApiEditor';

export const dynamic = 'force-dynamic';

/** Só admin/master podem ver esta página (guarda emails de conta + final de cartão). */
const ROLES_PERMITIDOS = ['admin', 'master'];

const COR: Record<StatusUso, { barra: string; texto: string; fundo: string }> = {
  ok:      { barra: '#16a34a', texto: '#166534', fundo: '#f0fdf4' },
  alerta:  { barra: '#f59e0b', texto: '#92400e', fundo: '#fffbeb' },
  critico: { barra: '#dc2626', texto: '#991b1b', fundo: '#fef2f2' },
  neutro:  { barra: '#cbd5e1', texto: '#475569', fundo: '#f8fafc' },
};

export default async function UsoApisPage() {
  // ── Gate de acesso: só admin/master ──────────────────────────────────
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: ue } = await supabase
    .from('usuario_empresas')
    .select('role')
    .eq('usuario_id', user.id)
    .eq('is_padrao', true)
    .single();

  if (!ue || !ROLES_PERMITIDOS.includes(ue.role)) {
    redirect('/'); // sem permissão → volta pro dashboard
  }

  const [linhas, cadastros] = await Promise.all([carregarLinhasUso(), lerCadastros()]);

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
              {/* Coluna do % (ou traço) — sobe para cima do conteúdo em mobile */}
              <div
                className="m-hide"
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
                {/* Barra de progresso compacta — só no mobile, no topo do conteúdo */}
                <div className="m-show-block" style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 800, color: c.texto, minWidth: 36 }}>
                    {api.pct === null ? '—' : `${api.pct}%`}
                  </span>
                  {api.pct !== null && (
                    <div style={{ flex: 1, height: 5, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${api.pct}%`, height: '100%', background: c.barra }} />
                    </div>
                  )}
                </div>
                </div>
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
                <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  {api.urlCobranca && (
                    <a
                      href={api.urlCobranca}
                      target="_blank"
                      rel="noreferrer"
                      style={{ fontSize: 13, fontWeight: 600, color: '#dc2626', textDecoration: 'none', border: '1px solid #fca5a5', borderRadius: 6, padding: '6px 10px', display: 'inline-flex', alignItems: 'center', minHeight: 44 }}
                    >
                      💳 Cobrança ↗
                    </a>
                  )}
                  {api.urlUso && (
                    <a
                      href={api.urlUso}
                      target="_blank"
                      rel="noreferrer"
                      style={{ fontSize: 13, fontWeight: 600, color: '#2563eb', textDecoration: 'none', border: '1px solid #bfdbfe', borderRadius: 6, padding: '6px 10px', display: 'inline-flex', alignItems: 'center', minHeight: 44 }}
                    >
                      📊 Uso / console ↗
                    </a>
                  )}
                </div>

                {/* Cadastro de conta: email + final do cartão (admin only) */}
                <CadastroApiEditor
                  apiId={api.id}
                  semCadastro={api.semCadastro}
                  email={cadastros[api.id]?.email ?? null}
                  cartaoFinal={cadastros[api.id]?.cartaoFinal ?? null}
                  observacao={cadastros[api.id]?.observacao ?? null}
                />
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
