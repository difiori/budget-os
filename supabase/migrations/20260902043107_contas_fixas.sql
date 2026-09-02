-- Contas fixas.
--
-- A tabela `recorrente` (criada no 0001, nunca usada) passa a ser o CONTRATO
-- de cada conta fixa: aluguel, condomínio, luz, assinatura. As saídas mensais
-- continuam na tabela `saida` (origem 'Recorrente'), agora apontando para o
-- contrato via `recorrente_id`. Uma ocorrência por contrato por mês.
--
-- Geração: `garantir_ocorrencias_contas_fixas(mês)` materializa as ocorrências
-- que faltam SÓ para o mês pedido — chamada quando uma tela abre aquele mês.
-- Idempotente (índice único + on conflict do nothing); nunca gera meses que
-- ninguém abriu, nunca duplica, e respeita a vigência (inicio/fim/ativo).

alter table public.recorrente
  add column if not exists inicio date not null
    default (date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date),
  add column if not exists fim date,
  add column if not exists observacao text,
  add column if not exists editado_por pessoa,
  add column if not exists atualizado_em timestamptz not null default now();

alter table public.recorrente
  add constraint recorrente_inicio_primeiro_dia check (extract(day from inicio) = 1),
  add constraint recorrente_fim_primeiro_dia check (fim is null or extract(day from fim) = 1),
  add constraint recorrente_fim_apos_inicio check (fim is null or fim >= inicio),
  add constraint recorrente_dia_vencimento_valido check (dia_vencimento between 1 and 31);

alter table public.saida
  add column if not exists recorrente_id uuid references public.recorrente (id) on delete set null;

alter table public.saida
  add constraint saida_recorrente_exige_data check (recorrente_id is null or data is not null);

create index if not exists saida_recorrente_id_idx on public.saida (recorrente_id);

-- Uma ocorrência por contrato por mês (mês da data da cobrança).
create unique index if not exists saida_recorrente_mes_uniq
  on public.saida (recorrente_id, (date_trunc('month', data::timestamp)))
  where recorrente_id is not null;

-- Materializa as ocorrências do mês para todo contrato vigente que ainda não
-- tem a sua. Regra 7 de vencimento: débito vence na data; crédito vence dia 10
-- do mês seguinte. Dia da cobrança limitado ao último dia do mês (31 → 30/28).
create or replace function public.garantir_ocorrencias_contas_fixas(p_mes date)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_mes date := date_trunc('month', p_mes)::date;
  v_ultimo_dia integer := extract(day from (v_mes + interval '1 month - 1 day'))::integer;
  v_inseridas integer;
begin
  with candidatas as (
    select
      r.*,
      make_date(
        extract(year from v_mes)::integer,
        extract(month from v_mes)::integer,
        least(r.dia_vencimento::integer, v_ultimo_dia)
      ) as data_ocorrencia
    from public.recorrente r
    where r.ativo
      and r.inicio <= v_mes
      and (r.fim is null or r.fim >= v_mes)
  ),
  inseridas as (
    insert into public.saida
      (nome, total_cents, data, vencimento, pessoa, metodo, status, origem,
       categoria_id, conta_id, cartao_id, recorrente_id, editado_por)
    select
      c.nome,
      c.total_cents,
      c.data_ocorrencia,
      case
        when c.metodo = 'Crédito' then
          make_date(
            extract(year from (c.data_ocorrencia + interval '1 month'))::integer,
            extract(month from (c.data_ocorrencia + interval '1 month'))::integer,
            10
          )
        else c.data_ocorrencia
      end,
      c.pessoa,
      c.metodo,
      'A pagar',
      'Recorrente',
      c.categoria_id,
      c.conta_id,
      c.cartao_id,
      c.id,
      coalesce(c.editado_por, c.pessoa)
    from candidatas c
    on conflict (recorrente_id, (date_trunc('month', data::timestamp)))
      where recorrente_id is not null
      do nothing
    returning id
  )
  select count(*) into v_inseridas from inseridas;
  return v_inseridas;
end;
$$;

revoke execute on function public.garantir_ocorrencias_contas_fixas(date) from public, anon;
grant execute on function public.garantir_ocorrencias_contas_fixas(date) to authenticated, service_role;
