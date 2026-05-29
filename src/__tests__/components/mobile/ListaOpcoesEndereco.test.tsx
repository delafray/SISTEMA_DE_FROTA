/**
 * Testes para o componente ListaOpcoesEndereco.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ListaOpcoesEndereco } from '@/components/mobile/ListaOpcoesEndereco';
import type { ResultadoGeocoding } from '@/lib/routing/types';

function opcao(endereco: string, lat = -23.55, lng = -46.63): ResultadoGeocoding & { distanciaKm?: number } {
  return { lat, lng, endereco_normalizado: endereco };
}

describe('ListaOpcoesEndereco', () => {
  it('renderiza todas as opções', () => {
    render(
      <ListaOpcoesEndereco
        opcoes={[
          opcao('Rua Augusta, 1500, São Paulo, SP, Brasil'),
          opcao('Rua Augusta, 200, Campinas, SP, Brasil', -22.9, -47.06),
        ]}
        onSelecionar={vi.fn()}
        onNenhumDesses={vi.fn()}
      />
    );
    expect(screen.getByTestId('opcao-endereco-0')).toBeDefined();
    expect(screen.getByTestId('opcao-endereco-1')).toBeDefined();
  });

  it('exibe texto "Qual endereço é o certo?"', () => {
    render(
      <ListaOpcoesEndereco
        opcoes={[opcao('Rua A, SP')]}
        onSelecionar={vi.fn()}
        onNenhumDesses={vi.fn()}
      />
    );
    expect(screen.getByText(/Qual endereço é o certo/i)).toBeDefined();
  });

  it('exibe distancia quando fornecida', () => {
    const user = userEvent.setup();
    render(
      <ListaOpcoesEndereco
        opcoes={[{ ...opcao('Rua A, SP'), distanciaKm: 2.3 }]}
        onSelecionar={vi.fn()}
        onNenhumDesses={vi.fn()}
      />
    );
    expect(screen.getByText(/2,3 km/)).toBeDefined();
  });

  it('chama onSelecionar com o endereço correto ao clicar', async () => {
    const onSelecionar = vi.fn();
    const user = userEvent.setup();
    const op1 = opcao('Rua A, São Paulo, SP, Brasil');
    const op2 = opcao('Rua A, Campinas, SP, Brasil', -22.9, -47.06);

    render(
      <ListaOpcoesEndereco
        opcoes={[op1, op2]}
        onSelecionar={onSelecionar}
        onNenhumDesses={vi.fn()}
      />
    );

    await user.click(screen.getByTestId('opcao-endereco-1'));
    expect(onSelecionar).toHaveBeenCalledWith(op2);
  });

  it('exibe botão "Nenhum desses" e chama onNenhumDesses ao clicar', async () => {
    const onNenhumDesses = vi.fn();
    const user = userEvent.setup();

    render(
      <ListaOpcoesEndereco
        opcoes={[opcao('Rua A, SP')]}
        onSelecionar={vi.fn()}
        onNenhumDesses={onNenhumDesses}
      />
    );

    const btn = screen.getByTestId('btn-nenhum-desses');
    expect(btn).toBeDefined();
    await user.click(btn);
    expect(onNenhumDesses).toHaveBeenCalledOnce();
  });

  it('lista tem aria-label "Opções de endereço"', () => {
    render(
      <ListaOpcoesEndereco
        opcoes={[opcao('Rua A, SP')]}
        onSelecionar={vi.fn()}
        onNenhumDesses={vi.fn()}
      />
    );
    expect(screen.getByRole('list', { name: /Opções de endereço/i })).toBeDefined();
  });

  it('formata distâncias abaixo de 1 km em metros', () => {
    render(
      <ListaOpcoesEndereco
        opcoes={[{ ...opcao('Rua A, SP'), distanciaKm: 0.35 }]}
        onSelecionar={vi.fn()}
        onNenhumDesses={vi.fn()}
      />
    );
    expect(screen.getByText(/350 m/)).toBeDefined();
  });
});
