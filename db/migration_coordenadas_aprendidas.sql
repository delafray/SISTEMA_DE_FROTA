-- Migration: coordenadas_aprendidas
--
-- Coordenada real (GPS) capturada pela frota no momento da entrega, por
-- endereco. Resolve o gargalo das ruas pequenas sem numero mapeado no OSM:
-- depois da 1a visita, todo geocoding daquele endereco usa a coordenada
-- aprendida (precisa, confianca 'alta') em vez do centro da rua do Nominatim.
--
-- Chave: (empresa_id, chave) onde chave = "ruaNorm|numero|cidade|uf"
-- (montada em src/lib/routing/coordsAprendidas.ts::chaveEndereco).
--
-- Rodar no Supabase de producao (SQL editor).

create table if not exists public.coordenadas_aprendidas (
  empresa_id    uuid        not null,
  chave         text        not null,
  lat           numeric     not null,
  lng           numeric     not null,
  amostras      integer     not null default 1,
  atualizado_em timestamptz not null default now(),
  criado_em     timestamptz not null default now(),
  primary key (empresa_id, chave)
);

comment on table public.coordenadas_aprendidas is
  'Coordenada GPS aprendida pela frota por endereco (empresa_id, chave). Media ponderada por amostras.';

-- Indice pra leitura por empresa (consultas do resolver filtram por empresa_id).
create index if not exists idx_coordenadas_aprendidas_empresa
  on public.coordenadas_aprendidas (empresa_id);

-- RLS: acesso so via service_role (server actions / API routes). Sem policies
-- pra anon/authenticated — o app acessa pela service role key no backend.
alter table public.coordenadas_aprendidas enable row level security;
