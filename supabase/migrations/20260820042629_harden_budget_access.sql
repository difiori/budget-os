-- Restringe o banco compartilhado aos dois usuários reais do Budget OS e
-- reduz a superfície das RPCs financeiras. Os UUIDs abaixo são os mesmos da
-- allowlist da aplicação em lib/auth/allowed-users.ts.

drop policy if exists "authenticated_full_access" on public.conta;
drop policy if exists "authenticated_full_access" on public.cartao;
drop policy if exists "authenticated_full_access" on public.categoria;
drop policy if exists "authenticated_full_access" on public.saida;
drop policy if exists "authenticated_full_access" on public.entrada;
drop policy if exists "authenticated_full_access" on public.transferencia;
drop policy if exists "authenticated_full_access" on public.recorrente;
drop policy if exists "authenticated_full_access" on public.meta_poupanca;

create policy "budget_users_full_access" on public.conta
  for all to authenticated
  using ((select auth.uid()) in (
    '98d184ef-8ab8-4c1d-9ddf-f842d40bca85'::uuid,
    '318a29e1-a964-481d-961a-a890eb5e571c'::uuid
  ))
  with check ((select auth.uid()) in (
    '98d184ef-8ab8-4c1d-9ddf-f842d40bca85'::uuid,
    '318a29e1-a964-481d-961a-a890eb5e571c'::uuid
  ));

create policy "budget_users_full_access" on public.cartao
  for all to authenticated
  using ((select auth.uid()) in (
    '98d184ef-8ab8-4c1d-9ddf-f842d40bca85'::uuid,
    '318a29e1-a964-481d-961a-a890eb5e571c'::uuid
  ))
  with check ((select auth.uid()) in (
    '98d184ef-8ab8-4c1d-9ddf-f842d40bca85'::uuid,
    '318a29e1-a964-481d-961a-a890eb5e571c'::uuid
  ));

create policy "budget_users_full_access" on public.categoria
  for all to authenticated
  using ((select auth.uid()) in (
    '98d184ef-8ab8-4c1d-9ddf-f842d40bca85'::uuid,
    '318a29e1-a964-481d-961a-a890eb5e571c'::uuid
  ))
  with check ((select auth.uid()) in (
    '98d184ef-8ab8-4c1d-9ddf-f842d40bca85'::uuid,
    '318a29e1-a964-481d-961a-a890eb5e571c'::uuid
  ));

create policy "budget_users_full_access" on public.saida
  for all to authenticated
  using ((select auth.uid()) in (
    '98d184ef-8ab8-4c1d-9ddf-f842d40bca85'::uuid,
    '318a29e1-a964-481d-961a-a890eb5e571c'::uuid
  ))
  with check ((select auth.uid()) in (
    '98d184ef-8ab8-4c1d-9ddf-f842d40bca85'::uuid,
    '318a29e1-a964-481d-961a-a890eb5e571c'::uuid
  ));

create policy "budget_users_full_access" on public.entrada
  for all to authenticated
  using ((select auth.uid()) in (
    '98d184ef-8ab8-4c1d-9ddf-f842d40bca85'::uuid,
    '318a29e1-a964-481d-961a-a890eb5e571c'::uuid
  ))
  with check ((select auth.uid()) in (
    '98d184ef-8ab8-4c1d-9ddf-f842d40bca85'::uuid,
    '318a29e1-a964-481d-961a-a890eb5e571c'::uuid
  ));

create policy "budget_users_full_access" on public.transferencia
  for all to authenticated
  using ((select auth.uid()) in (
    '98d184ef-8ab8-4c1d-9ddf-f842d40bca85'::uuid,
    '318a29e1-a964-481d-961a-a890eb5e571c'::uuid
  ))
  with check ((select auth.uid()) in (
    '98d184ef-8ab8-4c1d-9ddf-f842d40bca85'::uuid,
    '318a29e1-a964-481d-961a-a890eb5e571c'::uuid
  ));

create policy "budget_users_full_access" on public.recorrente
  for all to authenticated
  using ((select auth.uid()) in (
    '98d184ef-8ab8-4c1d-9ddf-f842d40bca85'::uuid,
    '318a29e1-a964-481d-961a-a890eb5e571c'::uuid
  ))
  with check ((select auth.uid()) in (
    '98d184ef-8ab8-4c1d-9ddf-f842d40bca85'::uuid,
    '318a29e1-a964-481d-961a-a890eb5e571c'::uuid
  ));

create policy "budget_users_full_access" on public.meta_poupanca
  for all to authenticated
  using ((select auth.uid()) in (
    '98d184ef-8ab8-4c1d-9ddf-f842d40bca85'::uuid,
    '318a29e1-a964-481d-961a-a890eb5e571c'::uuid
  ))
  with check ((select auth.uid()) in (
    '98d184ef-8ab8-4c1d-9ddf-f842d40bca85'::uuid,
    '318a29e1-a964-481d-961a-a890eb5e571c'::uuid
  ));

create or replace function public.debitar_conta(
  p_conta_id uuid,
  p_valor_cents integer
)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.conta
  set saldo_atual_cents = saldo_atual_cents - p_valor_cents
  where id = p_conta_id;
$$;

create or replace function public.creditar_conta(
  p_conta_id uuid,
  p_valor_cents integer
)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.conta
  set saldo_atual_cents = saldo_atual_cents + p_valor_cents
  where id = p_conta_id;
$$;

create or replace function public.transferir_entre_contas(
  p_de_conta_id uuid,
  p_para_conta_id uuid,
  p_valor_cents integer
)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.conta
  set saldo_atual_cents = saldo_atual_cents - p_valor_cents
  where id = p_de_conta_id;

  update public.conta
  set saldo_atual_cents = saldo_atual_cents + p_valor_cents
  where id = p_para_conta_id;
$$;

revoke execute on function public.debitar_conta(uuid, integer) from public, anon;
revoke execute on function public.creditar_conta(uuid, integer) from public, anon;
revoke execute on function public.transferir_entre_contas(uuid, uuid, integer) from public, anon;

grant execute on function public.debitar_conta(uuid, integer) to authenticated, service_role;
grant execute on function public.creditar_conta(uuid, integer) to authenticated, service_role;
grant execute on function public.transferir_entre_contas(uuid, uuid, integer) to authenticated, service_role;
