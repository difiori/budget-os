-- Vencimento pelo ciclo real do cartão.
--
-- `vencimento_fatura(data, dia_fechamento, dia_vencimento)`: a compra cai na
-- fatura do próprio mês se for até o fechamento (limitado ao último dia do
-- mês), senão na do mês seguinte; a fatura vence no dia de vencimento do
-- próprio mês se ele cai depois do fechamento, senão no mês seguinte.
-- Com (31, 10) reproduz a regra histórica: dia 10 do mês seguinte.
--
-- `garantir_ocorrencias_contas_fixas` passa a usar o ciclo do cartão da conta
-- fixa em vez do dia 10 fixo.

create or replace function public.vencimento_fatura(
  p_data date,
  p_dia_fechamento integer,
  p_dia_vencimento integer
)
returns date
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_fecha integer := coalesce(p_dia_fechamento, 31);
  v_venc integer := coalesce(p_dia_vencimento, 10);
  v_mes date := date_trunc('month', p_data)::date;
  v_dias_mes integer := extract(day from (v_mes + interval '1 month - 1 day'))::integer;
  v_mes_fatura date;
  v_dias_fatura integer;
  v_mes_venc date;
  v_dias_venc integer;
begin
  v_mes_fatura := case
    when extract(day from p_data)::integer <= least(v_fecha, v_dias_mes) then v_mes
    else (v_mes + interval '1 month')::date
  end;
  v_dias_fatura := extract(day from (v_mes_fatura + interval '1 month - 1 day'))::integer;
  v_mes_venc := case
    when v_venc > least(v_fecha, v_dias_fatura) then v_mes_fatura
    else (v_mes_fatura + interval '1 month')::date
  end;
  v_dias_venc := extract(day from (v_mes_venc + interval '1 month - 1 day'))::integer;
  return make_date(
    extract(year from v_mes_venc)::integer,
    extract(month from v_mes_venc)::integer,
    least(v_venc, v_dias_venc)
  );
end;
$$;

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
      k.dia_fechamento as k_fechamento,
      k.dia_vencimento as k_vencimento,
      make_date(
        extract(year from v_mes)::integer,
        extract(month from v_mes)::integer,
        least(r.dia_vencimento::integer, v_ultimo_dia)
      ) as data_ocorrencia
    from public.recorrente r
    left join public.cartao k on k.id = r.cartao_id
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
        when c.metodo = 'Crédito' then public.vencimento_fatura(c.data_ocorrencia, c.k_fechamento, c.k_vencimento)
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

revoke execute on function public.vencimento_fatura(date, integer, integer) from public, anon;
grant execute on function public.vencimento_fatura(date, integer, integer) to authenticated, service_role;
