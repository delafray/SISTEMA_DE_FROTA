/**
 * Testes do ModalHorario.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ModalHorario } from '@/app/mobile/ajuste-rota/components/ModalHorario';

const PARADA_BASE = {
  id: 'p1',
  ordem: 3,
  endereco: { logradouro: 'Av Y', bairro: 'B', cidade: 'BH', uf: 'MG' },
  fixada: false,
  janela_horario: null,
  observacao: null,
};

describe('ModalHorario', () => {
  it('renderiza dialog com numero e endereco da parada', () => {
    render(<ModalHorario parada={PARADA_BASE} onSalvar={vi.fn()} onFechar={vi.fn()} />);
    expect(screen.getByRole('dialog')).toBeDefined();
    expect(screen.getByText(/Parada 3/)).toBeDefined();
    expect(screen.getByText(/Av Y/)).toBeDefined();
  });

  it('checkbox "tem janela" desabilitado por padrao quando parada sem janela', () => {
    render(<ModalHorario parada={PARADA_BASE} onSalvar={vi.fn()} onFechar={vi.fn()} />);
    const cb = screen.getByLabelText(/tem janela/i) as HTMLInputElement;
    expect(cb.checked).toBe(false);
    // inputs de horario nao visiveis
    expect(screen.queryByLabelText(/horario inicio/i)).toBeNull();
  });

  it('marcando checkbox de janela mostra inputs de tempo', async () => {
    const user = userEvent.setup();
    render(<ModalHorario parada={PARADA_BASE} onSalvar={vi.fn()} onFechar={vi.fn()} />);

    await user.click(screen.getByLabelText(/tem janela/i));

    expect(screen.getByLabelText(/horario inicio/i)).toBeDefined();
    expect(screen.getByLabelText(/horario fim/i)).toBeDefined();
  });

  it('inicializa com janela existente da parada', () => {
    render(
      <ModalHorario
        parada={{ ...PARADA_BASE, janela_horario: [['08:00', '14:00']] }}
        onSalvar={vi.fn()}
        onFechar={vi.fn()}
      />
    );
    expect((screen.getByLabelText(/horario inicio/i) as HTMLInputElement).value).toBe('08:00');
    expect((screen.getByLabelText(/horario fim/i) as HTMLInputElement).value).toBe('14:00');
  });

  it('botao Salvar chama onSalvar com mudancas', async () => {
    const onSalvar = vi.fn();
    const user = userEvent.setup();
    render(<ModalHorario parada={PARADA_BASE} onSalvar={onSalvar} onFechar={vi.fn()} />);

    await user.click(screen.getByLabelText(/fixar nesta posicao/i));
    await user.type(screen.getByLabelText(/observacao/i), 'porta lateral');
    await user.click(screen.getByRole('button', { name: /Salvar/ }));

    expect(onSalvar).toHaveBeenCalledOnce();
    const arg = onSalvar.mock.calls[0][0];
    expect(arg.fixada).toBe(true);
    expect(arg.observacao).toBe('porta lateral');
    expect(arg.janela_horario).toBeNull();
  });

  it('Salvar com janela ativada passa janela_horario', async () => {
    const onSalvar = vi.fn();
    const user = userEvent.setup();
    render(<ModalHorario parada={PARADA_BASE} onSalvar={onSalvar} onFechar={vi.fn()} />);

    await user.click(screen.getByLabelText(/tem janela/i));
    await user.click(screen.getByRole('button', { name: /Salvar/ }));

    const arg = onSalvar.mock.calls[0][0];
    expect(arg.janela_horario).toEqual([['09:00', '18:00']]);
  });

  it('botao Cancelar chama onFechar sem chamar onSalvar', async () => {
    const onSalvar = vi.fn();
    const onFechar = vi.fn();
    const user = userEvent.setup();
    render(<ModalHorario parada={PARADA_BASE} onSalvar={onSalvar} onFechar={onFechar} />);

    await user.click(screen.getByRole('button', { name: /Cancelar/ }));

    expect(onFechar).toHaveBeenCalledOnce();
    expect(onSalvar).not.toHaveBeenCalled();
  });

  it('mostra alerta quando horario fim <= inicio', async () => {
    const user = userEvent.setup();
    render(<ModalHorario parada={PARADA_BASE} onSalvar={vi.fn()} onFechar={vi.fn()} />);

    await user.click(screen.getByLabelText(/tem janela/i));
    const inicioInput = screen.getByLabelText(/horario inicio/i);
    await user.clear(inicioInput);
    await user.type(inicioInput, '18:00');
    const fimInput = screen.getByLabelText(/horario fim/i);
    await user.clear(fimInput);
    await user.type(fimInput, '09:00');

    expect(screen.getByRole('alert').textContent).toMatch(/maior que inicio/);
  });
});
