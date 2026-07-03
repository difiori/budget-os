-- Transferência atômica entre contas: débito na origem + crédito no destino
-- numa única função (uma transação só), evitando o risco de tirar de uma conta
-- sem colocar na outra. Substitui o par debitar_conta + creditar_conta que o
-- app usava para transferências.
--
-- Valor negativo é válido e inverte o sentido — usado para ajustar o saldo na
-- edição (delta) e reverter na exclusão.

create or replace function transferir_entre_contas(
  p_de_conta_id uuid,
  p_para_conta_id uuid,
  p_valor_cents integer
)
returns void
language sql
as $$
  update conta set saldo_atual_cents = saldo_atual_cents - p_valor_cents where id = p_de_conta_id;
  update conta set saldo_atual_cents = saldo_atual_cents + p_valor_cents where id = p_para_conta_id;
$$;
