'use client';

/**
 * BadgeValidacao — mostra ao motorista o resultado da validação de número
 * contra o OSM (Overpass). NUNCA bloqueia o fluxo — só informa.
 *
 * 4 status:
 *   🟢 confirmado — número exato achado no mapa
 *   🟡 plausivel  — dentro da faixa conhecida, mas não exato
 *   🟠 suspeito   — fora da faixa (avisar com destaque)
 *   ⚪ sem_dados   — rua sem cobertura — sem opinar
 *   ⏳ carregando  — validando agora
 */

import { cores } from '@/lib/mobile/ui';

export type StatusValidacao =
  | 'confirmado'
  | 'plausivel'
  | 'suspeito'
  | 'sem_dados'
  | 'carregando';

interface BadgeValidacaoProps {
  status: StatusValidacao;
  mensagem?: string;
}

export function BadgeValidacao({ status, mensagem }: BadgeValidacaoProps) {
  if (status === 'sem_dados') return null; // nada pra mostrar

  const config: Record<
    Exclude<StatusValidacao, 'sem_dados'>,
    { icone: string; bg: string; border: string; cor: string; label: string }
  > = {
    confirmado: {
      icone: '🟢',
      bg: '#f0fdf4',
      border: '#86efac',
      cor: '#166534',
      label: 'Endereco confirmado no mapa',
    },
    plausivel: {
      icone: '🟡',
      bg: '#fefce8',
      border: '#fde047',
      cor: '#854d0e',
      label: mensagem ?? 'Numero plausivel (dentro da faixa, mas nao confirmado)',
    },
    suspeito: {
      icone: '🟠',
      bg: '#fff7ed',
      border: '#fdba74',
      cor: '#9a3412',
      label: mensagem ?? 'Numero suspeito — confirma?',
    },
    carregando: {
      icone: '⏳',
      bg: cores.divisoria,
      border: cores.bordaForte,
      cor: '#475569',
      label: 'Validando endereco...',
    },
  };

  const c = config[status as Exclude<StatusValidacao, 'sem_dados'>];

  return (
    <div
      role="status"
      data-testid={`validacao-${status}`}
      style={{
        marginTop: 10,
        padding: '10px 12px',
        background: c.bg,
        border: `1px solid ${c.border}`,
        color: c.cor,
        borderRadius: 6,
        fontSize: 13,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
      }}
    >
      <span style={{ fontSize: 16, flexShrink: 0 }}>{c.icone}</span>
      <span style={{ flex: 1 }}>{c.label}</span>
    </div>
  );
}
