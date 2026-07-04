-- Metas de poupança: objetivo com valor-alvo, opcionalmente vinculado a uma
-- conta (o progresso então segue o saldo real da conta ao vivo). Sem conta
-- vinculada, o progresso é o campo valor_atual_cents, atualizado manualmente
-- pela pessoa ao editar a meta.

create table meta_poupanca (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  valor_alvo_cents integer not null check (valor_alvo_cents > 0),
  valor_atual_cents integer not null default 0 check (valor_atual_cents >= 0),
  conta_id uuid null references conta(id) on delete set null,
  dono text not null check (dono in ('Diego', 'Vitor', 'Ambos')),
  data_alvo date null,
  created_at timestamptz not null default now()
);

alter table meta_poupanca enable row level security;

create policy "authenticated_full_access" on meta_poupanca for all to authenticated using (true) with check (true);
