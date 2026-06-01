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

  // ─── Fusao escolha+numero: card ja mostra numero + CEP ──────────────

  it('mostra o numero FALADO no card quando a opcao nao traz house_number', () => {
    render(
      <ListaOpcoesEndereco
        opcoes={[{ ...opcao('Av. Afonso Pena, BH'), logradouro: 'Avenida Afonso Pena' }]}
        onSelecionar={vi.fn()}
        onNenhumDesses={vi.fn()}
        numeroFala="341"
      />
    );
    expect(screen.getByText('Avenida Afonso Pena, 341')).toBeDefined();
  });

  it('prefere o numero do Nominatim sobre o falado', () => {
    render(
      <ListaOpcoesEndereco
        opcoes={[{ ...opcao('Rua X'), logradouro: 'Rua X', numero: '1500' }]}
        onSelecionar={vi.fn()}
        onNenhumDesses={vi.fn()}
        numeroFala="341"
      />
    );
    expect(screen.getByText('Rua X, 1500')).toBeDefined();
  });

  it('exibe o CEP formatado no card quando disponivel', () => {
    render(
      <ListaOpcoesEndereco
        opcoes={[{ ...opcao('Av. Afonso Pena, BH'), logradouro: 'Avenida Afonso Pena', cidade: 'Belo Horizonte', uf: 'MG', cep: '30130110' }]}
        onSelecionar={vi.fn()}
        onNenhumDesses={vi.fn()}
        numeroFala="341"
      />
    );
    expect(screen.getByText(/CEP 30130-110/)).toBeDefined();
  });

  it('nao mostra "CEP" quando a opcao nao tem CEP', () => {
    render(
      <ListaOpcoesEndereco
        opcoes={[{ ...opcao('Rua Y'), logradouro: 'Rua Y', cidade: 'Contagem', uf: 'MG' }]}
        onSelecionar={vi.fn()}
        onNenhumDesses={vi.fn()}
      />
    );
    // O botao "Nenhum desses — digitar o CEP" contem "CEP"; aqui checamos que
    // NAO ha a linha de CEP do card (CEP seguido de digitos).
    expect(screen.queryByText(/CEP \d{5}-\d{3}/)).toBeNull();
  });

  it('nao adiciona ", numero" quando nao ha numero nem fala', () => {
    render(
      <ListaOpcoesEndereco
        opcoes={[{ ...opcao('Rua Z'), logradouro: 'Rua Z' }]}
        onSelecionar={vi.fn()}
        onNenhumDesses={vi.fn()}
      />
    );
    expect(screen.getByText('Rua Z')).toBeDefined();
  });
});
