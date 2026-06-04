-- Migration: cadastros de conta por API (página /uso-apis)
-- Guarda, por serviço externo, o email da conta e o final do cartão usado.
-- email e cartão ficam CIFRADOS em repouso (AES-256-GCM, ver src/lib/apis/cripto.ts);
-- a coluna `observacao` é texto livre não sensível.
--
-- Acesso: RLS LIGADA e SEM policy → nenhum cliente anon/authenticated lê ou escreve.
-- Só a service role (server actions / leitura server-side) acessa, e o gate de
-- quem pode ver/editar (role admin/master) é feito na aplicação.
--
-- Rode no SQL Editor do Supabase. Idempotente.

create table if not exists public.api_cadastros (
  api_id        text primary key,          -- bate com CATALOGO_APIS[].id
  email_cifrado text,                       -- AES-GCM base64 (ou null)
  cartao_cifrado text,                      -- AES-GCM base64 dos 4 dígitos (ou null)
  observacao    text,                       -- nota livre (não cifrada)
  updated_at    timestamptz not null default now()
);

alter table public.api_cadastros enable row level security;

-- Sem policy de SELECT/INSERT/UPDATE pra anon/authenticated: tudo passa pela
-- service role (que ignora RLS). Garante que a tabela não vaze pelo client.
grant select, insert, update, delete on public.api_cadastros to service_role;

comment on table public.api_cadastros is
  'Email + final do cartão por serviço externo (cifrados). Acesso só via service role + gate admin/master na app.';
