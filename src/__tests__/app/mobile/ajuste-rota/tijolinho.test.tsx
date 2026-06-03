/**
 * Testes do Tijolinho — modos 'ordenar' e 'detalhes'.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tijolinho } from '@/app/mobile/ajuste-rota/components/Tijolinho';

const PARADA_BASE = {
  id: 'p1',
  ordem: 1,
  endereco: { logradouro: 'Av X', bairro: 'B', cidade: 'SP', uf: 'SP' },
  fixada: false,
  janela_horario: null,
  observacao: null,
  concluida_em: null,
};

describe('Tijolinho — modo ordenar', () => {
  it('renderiza numero grande + nome curto', () => {
    render(<Tijolinho parada={PARADA_BASE} modo="ordenar" />);
    expect(screen.getByTestId('numero-parada-1').textContent).toBe('1');
    expect(screen.getByText(/Av X/)).toBeDefined();
  });

  it('mostra icone fixada quando parada.fixada=true', () => {
    render(<Tijolinho parada={{ ...PARADA_BASE, fixada: true }} modo="ordenar" />);
    expect(screen.getByText(/🔒 Fixada/)).toBeDefined();
  });

  it('renderiza draggableHandle quando passado e nao fixada', () => {
    render(
      <Tijolinho
        parada={PARADA_BASE}
        modo="ordenar"
        draggableHandle={<span>HANDLE</span>}
      />
    );
    expect(screen.getByText('HANDLE')).toBeDefined();
  });

  it('NAO renderiza draggableHandle quando fixada', () => {
    render(
      <Tijolinho
        parada={{ ...PARADA_BASE, fixada: true }}
        modo="ordenar"
        draggableHandle={<span>HANDLE</span>}
      />
    );
    expect(screen.queryByText('HANDLE')).toBeNull();
  });
});

describe('Tijolinho — modo detalhes', () => {
  it('renderiza endereco completo + cidade/UF', () => {
    render(<Tijolinho parada={PARADA_BASE} modo="detalhes" />);
    expect(screen.getByText(/Av X/)).toBeDefined();
    expect(screen.getByText(/SP\/SP/)).toBeDefined();
  });

  it('mostra janela_horario quando presente', () => {
    render(
      <Tijolinho
        parada={{ ...PARADA_BASE, janela_horario: [['09:00', '12:00']] }}
        modo="detalhes"
      />
    );
    expect(screen.getByText(/09:00–12:00/)).toBeDefined();
  });

  it('mostra observacao quando presente', () => {
    render(
      <Tijolinho parada={{ ...PARADA_BASE, observacao: 'porta lateral' }} modo="detalhes" />
    );
    expect(screen.getByText(/porta lateral/)).toBeDefined();
  });

  it('clica → chama onClickDetalhes', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<Tijolinho parada={PARADA_BASE} modo="detalhes" onClickDetalhes={onClick} />);

    await user.click(screen.getByTestId('tijolinho-detalhes-1'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('mostra aviso de fixada com texto explicativo', () => {
    render(<Tijolinho parada={{ ...PARADA_BASE, fixada: true }} modo="detalhes" />);
    expect(screen.getByText(/Fixada nesta posicao/)).toBeDefined();
  });
});
