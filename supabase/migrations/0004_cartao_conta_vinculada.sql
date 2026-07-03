-- Vincula cartão a uma conta bancária (de onde a fatura é paga) e adiciona
-- uma função de decremento atômico de saldo, usada quando um lançamento
-- (débito direto ou compra de crédito) é marcado como "Pago".

alter table cartao add column conta_vinculada_id uuid references conta (id);

create function debitar_conta(p_conta_id uuid, p_valor_cents integer)
returns void
language sql
as $$
  update conta
  set saldo_atual_cents = saldo_atual_cents - p_valor_cents
  where id = p_conta_id;
$$;
