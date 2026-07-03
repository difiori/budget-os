-- Controle de Orçamento — schema inicial (F1)
-- Valores monetários sempre em centavos (integer), nunca float.
-- Ciclo de fatura, vencimento etc. são calculados em app/lib/domain, não aqui.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type pessoa as enum ('Diego', 'Vitor');
create type categoria_dono as enum ('Diego', 'Vitor', 'Ambos');
create type cartao_tipo as enum ('Crédito', 'Benefício');
create type metodo_pagamento as enum ('Pix', 'Débito', 'Crédito', 'Apple Pay', 'Pluxee', 'Boleto');
create type saida_status as enum ('A pagar', 'Pago', 'Faturado', 'Fixo', 'Em processamento', 'A classificar');
create type saida_origem as enum ('Manual', 'Apple Pay', 'Parcelamento', 'Recorrente');
create type entrada_status as enum ('Não recebido', 'Recebido', 'Em conta');

-- ---------------------------------------------------------------------------
-- conta
-- ---------------------------------------------------------------------------

create table conta (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  dono pessoa not null,
  saldo_atual_cents integer not null default 0,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- cartao
-- ---------------------------------------------------------------------------

create table cartao (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  dono pessoa not null,
  tipo cartao_tipo not null,
  limite_cents integer,
  -- convenção: 31 significa "último dia do mês", tratado em lib/domain/fatura.ts
  dia_fechamento smallint not null default 31,
  dia_vencimento smallint not null default 10,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- categoria
-- ---------------------------------------------------------------------------

create table categoria (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  dono categoria_dono not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- saida (tabela central)
-- ---------------------------------------------------------------------------

create table saida (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  total_cents integer not null,
  data date default (now() at time zone 'America/Sao_Paulo')::date,
  vencimento date,
  pessoa pessoa not null,
  metodo metodo_pagamento not null,
  status saida_status not null,
  origem saida_origem not null default 'Manual',
  categoria_id uuid references categoria (id),
  conta_id uuid references conta (id),
  cartao_id uuid references cartao (id),
  parcela text,
  valor_pago_cents integer,
  comprovante text,
  notion_page_id text,
  created_at timestamptz not null default now(),
  constraint saida_conta_xor_cartao check (
    (conta_id is not null and cartao_id is null)
    or (conta_id is null and cartao_id is not null)
  )
);

create index saida_data_idx on saida (data);
create index saida_vencimento_idx on saida (vencimento);
create index saida_cartao_id_idx on saida (cartao_id);
create index saida_conta_id_idx on saida (conta_id);
create index saida_status_idx on saida (status);
create index saida_pessoa_idx on saida (pessoa);

-- ---------------------------------------------------------------------------
-- entrada
-- ---------------------------------------------------------------------------

create table entrada (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  quantia_cents integer not null,
  valor_recebido_cents integer,
  data date default (now() at time zone 'America/Sao_Paulo')::date,
  pessoa pessoa not null,
  status entrada_status not null default 'Não recebido',
  conta_destino_id uuid not null references conta (id),
  notas text,
  notion_page_id text,
  created_at timestamptz not null default now()
);

create index entrada_data_idx on entrada (data);
create index entrada_pessoa_idx on entrada (pessoa);

-- ---------------------------------------------------------------------------
-- transferencia
-- ---------------------------------------------------------------------------

create table transferencia (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  valor_cents integer not null,
  data date default (now() at time zone 'America/Sao_Paulo')::date,
  pessoa pessoa not null,
  de_conta_id uuid not null references conta (id),
  para_conta_id uuid not null references conta (id),
  notion_page_id text,
  created_at timestamptz not null default now(),
  constraint transferencia_contas_distintas check (de_conta_id <> para_conta_id)
);

create index transferencia_data_idx on transferencia (data);

-- ---------------------------------------------------------------------------
-- recorrente (mesmos campos de saida, sem data/status, + dia_vencimento + ativo)
-- ---------------------------------------------------------------------------

create table recorrente (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  total_cents integer not null,
  pessoa pessoa not null,
  metodo metodo_pagamento not null,
  origem saida_origem not null default 'Recorrente',
  categoria_id uuid references categoria (id),
  conta_id uuid references conta (id),
  cartao_id uuid references cartao (id),
  parcela text,
  valor_pago_cents integer,
  comprovante text,
  notion_page_id text,
  dia_vencimento smallint not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  constraint recorrente_conta_xor_cartao check (
    (conta_id is not null and cartao_id is null)
    or (conta_id is null and cartao_id is not null)
  )
);

-- ---------------------------------------------------------------------------
-- RLS — só os 2 usuários autenticados (magic link) têm acesso; casal vê e
-- edita tudo, sem distinção por dono.
-- ---------------------------------------------------------------------------

alter table conta enable row level security;
alter table cartao enable row level security;
alter table categoria enable row level security;
alter table saida enable row level security;
alter table entrada enable row level security;
alter table transferencia enable row level security;
alter table recorrente enable row level security;

create policy "authenticated_full_access" on conta for all to authenticated using (true) with check (true);
create policy "authenticated_full_access" on cartao for all to authenticated using (true) with check (true);
create policy "authenticated_full_access" on categoria for all to authenticated using (true) with check (true);
create policy "authenticated_full_access" on saida for all to authenticated using (true) with check (true);
create policy "authenticated_full_access" on entrada for all to authenticated using (true) with check (true);
create policy "authenticated_full_access" on transferencia for all to authenticated using (true) with check (true);
create policy "authenticated_full_access" on recorrente for all to authenticated using (true) with check (true);
