-- Registro de uso da API da Anthropic (custo visível no app).
create table if not exists public.ia_uso (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  recurso text not null,
  modelo text not null,
  input_tokens integer not null,
  output_tokens integer not null,
  cache_read_tokens integer not null default 0,
  cache_write_tokens integer not null default 0,
  custo_micro_usd bigint not null,
  pessoa pessoa,
  sucesso boolean not null default true,
  detalhe text
);
create index if not exists ia_uso_criado_em_idx on public.ia_uso (criado_em);

alter table public.ia_uso enable row level security;
create policy "budget_users_full_access" on public.ia_uso
  for all to authenticated
  using ((select auth.uid()) in (
    '98d184ef-8ab8-4c1d-9ddf-f842d40bca85'::uuid,
    '318a29e1-a964-481d-961a-a890eb5e571c'::uuid
  ))
  with check ((select auth.uid()) in (
    '98d184ef-8ab8-4c1d-9ddf-f842d40bca85'::uuid,
    '318a29e1-a964-481d-961a-a890eb5e571c'::uuid
  ));

-- Leitura do mês (Resumo Mensal) gerada pela IA, uma por mês e escopo.
create table if not exists public.fechamento_narrativa (
  id uuid primary key default gen_random_uuid(),
  mes date not null,
  escopo text not null,
  hash text not null,
  texto text not null,
  modelo text not null,
  gerado_em timestamptz not null default now(),
  gerado_por pessoa,
  constraint fechamento_narrativa_mes_primeiro_dia check (extract(day from mes) = 1),
  constraint fechamento_narrativa_unica unique (mes, escopo)
);

alter table public.fechamento_narrativa enable row level security;
create policy "budget_users_full_access" on public.fechamento_narrativa
  for all to authenticated
  using ((select auth.uid()) in (
    '98d184ef-8ab8-4c1d-9ddf-f842d40bca85'::uuid,
    '318a29e1-a964-481d-961a-a890eb5e571c'::uuid
  ))
  with check ((select auth.uid()) in (
    '98d184ef-8ab8-4c1d-9ddf-f842d40bca85'::uuid,
    '318a29e1-a964-481d-961a-a890eb5e571c'::uuid
  ));
