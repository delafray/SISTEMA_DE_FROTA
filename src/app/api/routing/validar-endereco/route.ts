/**
 * API Route — POST /api/routing/validar-endereco
 *
 * Valida se o numero informado existe (ou e plausivel) na rua do CEP.
 * Server-side pra nao expor a URL do Overpass self-hosted no client.
 *
 * Body:
 *   {
 *     cep: "30130-010",
 *     numero: "5000",
 *     endereco: { logradouro, bairro, cidade, uf }
 *   }
 *
 * Resposta:
 *   {
 *     status: "confirmado" | "plausivel" | "suspeito" | "sem_dados",
 *     mensagem: "...",
 *     coordenada: { lat, lng } | null,
 *     cacheado: bool
 *   }
 *
 * Estrategia "nunca bloqueia": qualquer erro vira sem_dados (200 OK).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';
import { validarNumero } from '@/lib/routing/overpass/validar';
import { geocodar, formatarEnderecoParaGeocoding } from '@/lib/routing/geocoding';
import { requireSessao } from '@/lib/auth/requireSessao';

const log = createLogger('api_validar_endereco');

interface RequestBody {
  cep: string;
  numero: string;
  endereco: {
    logradouro: string;
    bairro: string;
    cidade: string;
    uf: string;
  };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { erro: erroSessao } = await requireSessao();
  if (erroSessao) return erroSessao;
  let body: Partial<RequestBody>;
  try {
    body = (await request.json()) as Partial<RequestBody>;
  } catch {
    return NextResponse.json({ error: 'json_invalido' }, { status: 400 });
  }

  if (!body.cep || !body.numero || !body.endereco?.logradouro || !body.endereco?.cidade || !body.endereco?.uf) {
    return NextResponse.json(
      {
        error: 'campos_obrigatorios',
        detail: 'cep, numero, endereco.logradouro, endereco.cidade, endereco.uf',
      },
      { status: 400 }
    );
  }

  // Geocodar pra pegar lat/lng (necessario pro bbox do Overpass).
  // Usa CEP + logradouro pra precisao maxima.
  const enderecoBusca = formatarEnderecoParaGeocoding({
    logradouro: body.endereco.logradouro,
    bairro: body.endereco.bairro,
    cidade: body.endereco.cidade,
    uf: body.endereco.uf,
    cep: body.cep,
  });

  const geo = await geocodar(enderecoBusca);
  if (!geo.ok) {
    // Geocoding falhou — devolve sem_dados (nao bloqueia)
    log.warn('geocoding_falhou_validar', { motivo: geo.motivo });
    return NextResponse.json(
      {
        status: 'sem_dados',
        mensagem: 'Nao consegui localizar a rua pra validar — segue com o numero informado.',
        coordenada: null,
        cacheado: false,
      },
      { status: 200 }
    );
  }

  const resultado = await validarNumero({
    numero: body.numero,
    logradouro: body.endereco.logradouro,
    cidade: body.endereco.cidade,
    uf: body.endereco.uf,
    lat: geo.resultado.lat,
    lng: geo.resultado.lng,
  });

  return NextResponse.json(
    {
      status: resultado.status,
      mensagem: resultado.mensagem,
      coordenada: resultado.coordenada,
      cacheado: resultado.cacheado,
      // Dados extras pra debug/UI avancada (opcional)
      dados: {
        quantidade: resultado.dados.quantidade,
        min: resultado.dados.min,
        max: resultado.dados.max,
        confianca: resultado.dados.confianca,
      },
    },
    { status: 200 }
  );
}
