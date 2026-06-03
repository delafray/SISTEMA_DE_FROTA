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

const defaultProps = {
  onSelecionar: vi.fn(),
  onSalvar: vi.fn(),
  onNenhumDesses: vi.fn(),
};

describe('ListaOpcoesEndereco', () => {
  it('renderiza todas as opções', () => {
    render(
      <ListaOpcoesEndereco
        opcoes={[
          opcao('Rua Augusta, 1500, São Paulo, SP, Brasil'),
          opcao('Rua Augusta, 200, Campinas, SP, Brasil', -22.9, -47.06),
        ]}
        {...defaultProps}
      />
    );
    expect(screen.getByTestId('opcao-endereco-0')).toBeDefined();
    expect(screen.getByTestId('opcao-endereco-1')).toBeDefined();
  });

  it('exibe texto "Qual endereço é o certo?"', () => {
    render(
      <ListaOpcoesEndereco
        opcoes={[opcao('Rua A, SP')]}
        {...defaultProps}
      />
    );
    expect(screen.getByText(/Qual endereço é o certo/i)).toBeDefined();
  });

  it('exibe distancia quando fornecida', () => {
    render(
      <ListaOpcoesEndereco
        opcoes={[{ ...opcao('Rua A, SP'), distanciaKm: 2.3 }]}
        {...defaultProps}
      />
    );
    expect(screen.getByText(/2,3 km/)).toBeDefined();
  });

  it('primeiro clique seleciona card e mostra botoes Salvar/Editar', async () => {
    const user = userEvent.setup();
    const onSelecionar = vi.fn();
    const onSalvar = vi.fn();
    const op1 = opcao('Rua A, São Paulo, SP, Brasil');
    const op2 = opcao('Rua A, Campinas, SP, Brasil', -22.9, -47.06);

    render(
      <ListaOpcoesEndereco
        opcoes={[op1, op2]}
        onSelecionar={onSelecionar}
        onSalvar={onSalvar}
        onNenhumDesses={vi.fn()}
      />
    );

    // Primeiro clique: seleciona — NÃO chama onSelecionar ainda
    await user.click(screen.getByTestId('opcao-endereco-1'));
    expect(onSelecionar).not.toHaveBeenCalled();

    // Botões Salvar e Editar aparecem
    expect(screen.getByTestId('btn-salvar-1')).toBeDefined();
    expect(screen.getByTestId('btn-editar-1')).toBeDefined();
  });

  it('botao Editar chama onSelecionar com o endereço correto', async () => {
    const onSelecionar = vi.fn();
    const user = userEvent.setup();
    const op1 = opcao('Rua A, São Paulo, SP, Brasil');
    const op2 = opcao('Rua A, Campinas, SP, Brasil', -22.9, -47.06);

    render(
      <ListaOpcoesEndereco
        opcoes={[op1, op2]}
        onSelecionar={onSelecionar}
        onSalvar={vi.fn()}
        onNenhumDesses={vi.fn()}
      />
    );

    await user.click(screen.getByTestId('opcao-endereco-1'));
    await user.click(screen.getByTestId('btn-editar-1'));
    expect(onSelecionar).toHaveBeenCalledWith(op2);
  });

  it('botao Salvar chama onSalvar com o endereço correto', async () => {
    const onSalvar = vi.fn();
    const user = userEvent.setup();
    const op1 = opcao('Rua A, São Paulo, SP, Brasil');
    const op2 = opcao('Rua A, Campinas, SP, Brasil', -22.9, -47.06);

    render(
      <ListaOpcoesEndereco
        opcoes={[op1, op2]}
        onSelecionar={vi.fn()}
        onSalvar={onSalvar}
        onNenhumDesses={vi.fn()}
      />
    );

    await user.click(screen.getByTestId('opcao-endereco-0'));
    await user.click(screen.getByTestId('btn-salvar-0'));
    expect(onSalvar).toHaveBeenCalledWith(op1);
  });

  it('exibe botão "Nenhum desses" e chama onNenhumDesses ao clicar', async () => {
    const onNenhumDesses = vi.fn();
    const user = userEvent.setup();

    render(
      <ListaOpcoesEndereco
        opcoes={[opcao('Rua A, SP')]}
        {...defaultProps}
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
        {...defaultProps}
      />
    );
    expect(screen.getByRole('list', { name: /Opções de endereço/i })).toBeDefined();
  });

  it('formata distâncias abaixo de 1 km em metros', () => {
    render(
      <ListaOpcoesEndereco
        opcoes={[{ ...opcao('Rua A, SP'), distanciaKm: 0.35 }]}
        {...defaultProps}
      />
    );
    expect(screen.getByText(/350 m/)).toBeDefined();
  });

  // ─── Fusao escolha+numero: card ja mostra numero + CEP ──────────────

  it('mostra o numero FALADO no card quando a opcao nao traz house_number', () => {
    render(
      <ListaOpcoesEndereco
        opcoes={[{ ...opcao('Av. Afonso Pena, BH'), logradouro: 'Avenida Afonso Pena' }]}
        {...defaultProps}
        numeroFala="341"
      />
    );
    expect(screen.getByText('Avenida Afonso Pena, 341')).toBeDefined();
  });

  it('prefere o numero do Nominatim sobre o falado', () => {
    render(
      <ListaOpcoesEndereco
        opcoes={[{ ...opcao('Rua X'), logradouro: 'Rua X', numero: '1500' }]}
        {...defaultProps}
        numeroFala="341"
      />
    );
    expect(screen.getByText('Rua X, 1500')).toBeDefined();
  });

  it('exibe o CEP formatado no card quando disponivel', () => {
    render(
      <ListaOpcoesEndereco
        opcoes={[{ ...opcao('Av. Afonso Pena, BH'), logradouro: 'Avenida Afonso Pena', cidade: 'Belo Horizonte', uf: 'MG', cep: '30130110' }]}
        {...defaultProps}
        numeroFala="341"
      />
    );
    expect(screen.getByText(/CEP 30130-110/)).toBeDefined();
  });

  it('mostra aviso "vários CEPs nesta rua" quando cepMultiplos (sem chutar CEP)', () => {
    render(
      <ListaOpcoesEndereco
        opcoes={[{ ...opcao('Av. Afonso Pena, BH'), logradouro: 'Avenida Afonso Pena', cidade: 'Belo Horizonte', uf: 'MG', cepMultiplos: true }]}
        {...defaultProps}
        numeroFala="342"
      />
    );
    expect(screen.getByText(/vários CEPs nesta rua/i)).toBeDefined();
    // E nao mostra nenhum "CEP <digitos>" (nada de CEP chutado)
    expect(screen.queryByText(/CEP \d{5}-\d{3}/)).toBeNull();
  });

  it('nao mostra "CEP" quando a opcao nao tem CEP', () => {
    render(
      <ListaOpcoesEndereco
        opcoes={[{ ...opcao('Rua Y'), logradouro: 'Rua Y', cidade: 'Contagem', uf: 'MG' }]}
        {...defaultProps}
      />
    );
    expect(screen.queryByText(/CEP \d{5}-\d{3}/)).toBeNull();
  });

  it('nao adiciona ", numero" quando nao ha numero nem fala', () => {
    render(
      <ListaOpcoesEndereco
        opcoes={[{ ...opcao('Rua Z'), logradouro: 'Rua Z' }]}
        {...defaultProps}
      />
    );
    expect(screen.getByText('Rua Z')).toBeDefined();
  });
});
