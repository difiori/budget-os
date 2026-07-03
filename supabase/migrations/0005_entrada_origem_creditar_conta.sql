-- Espelha o suporte a "origem" que saida já tem (recorrência) e adiciona a
-- contraparte de debitar_conta para quando uma entrada é marcada "Recebido".

create type entrada_origem as enum ('Manual', 'Recorrente');
alter table entrada add column origem entrada_origem not null default 'Manual';

create function creditar_conta(p_conta_id uuid, p_valor_cents integer)
returns void
language sql
as $$
  update conta
  set saldo_atual_cents = saldo_atual_cents + p_valor_cents
  where id = p_conta_id;
$$;
